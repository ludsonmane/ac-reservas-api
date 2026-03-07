// src/ui/CheckinPage.tsx

import * as React from 'react';
import { api } from '../lib/api';
import { toast } from './toast';
import Skeleton from './Skeleton';
import { useUnits } from './hooks/useUnits';
import { useAreasByUnit } from './hooks/useAreasByUnit';
import {
  ensureAnalyticsReady,
  setActiveUnitPixelFromUnit,
  trackReservationCheckin,
} from '../lib/analytics';

type ReservationPreview = {
  id: string;
  reservationCode: string;
  status: 'AWAITING_CHECKIN' | 'CHECKED_IN' | string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  people?: number | null;
  kids?: number | null;
  unit?: string | null;       // fallback legado
  unitName?: string | null;   // fallback legado
  unitId?: string | null;
  area?: string | null;       // fallback legado
  areaName?: string | null;   // fallback legado
  areaId?: string | null;
  reservationDate?: string | null;
  checkedInAt?: string | null;
};

export default function CheckinPage() {
  const [loading, setLoading] = React.useState(true);
  const [confirming, setConfirming] = React.useState(false);
  const [resv, setResv] = React.useState<ReservationPreview | null>(null);

  // Bootstrap GA4/Pixel no mount (não conflita se já estiver carregado)
  React.useEffect(() => {
    ensureAnalyticsReady();
  }, []);

  const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const id = qs.get('id');

  // 🔎 carregar reserva
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!id) {
          toast.error('Link inválido: parâmetro "id" é obrigatório.');
          return;
        }
        setLoading(true);
        const data = await api(`/v1/reservations/${encodeURIComponent(id)}`, {
          method: 'GET',
          auth: true,
        });
        if (!alive) return;

        setResv(data);

        // Ativa o pixel da unidade assim que a reserva é carregada
        try {
          const unitHint = data?.unitName || data?.unit || data?.unitId || '';
          if (unitHint) setActiveUnitPixelFromUnit({ id: data.unitId || undefined, name: unitHint });
        } catch {}
      } catch (e: any) {
        const msg = e?.error?.message || e?.error || e?.message || 'Falha ao carregar reserva.';
        toast.error(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // 📚 catálogos (públicos) para resolver nomes (apenas para exibir/fornecer labels)
  const { units } = useUnits(true);
  const areasByUnit = useAreasByUnit(resv?.unitId || undefined, !!resv?.unitId);

  // helpers de label (apenas para UI / melhoria de payload)
  const unitLabel =
    resv?.unitName ||
    resv?.unit ||
    (resv?.unitId ? units.find(u => (u as any).id === resv.unitId)?.name : undefined) ||
    '—';

  const areaLabel =
    resv?.areaName ||
    resv?.area ||
    (resv?.areaId
      ? (areasByUnit.data || []).find(a => a.id === resv.areaId)?.name
      : undefined) ||
    '—';

  // Atalhos: Enter confirma, Esc volta
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && resv && resv.status === 'AWAITING_CHECKIN' && !confirming) {
        e.preventDefault();
        handleConfirm();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        window.history.back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resv, confirming]);

  // 🔔 Disparo automático de evento caso a página abra com a reserva já CHECKED_IN
  const firedOnceRef = React.useRef(false);
  React.useEffect(() => {
    if (!resv) return;
    if (resv.status !== 'CHECKED_IN') return;
    if (firedOnceRef.current) return;

    firedOnceRef.current = true;
    // Ativa pixel da unidade (id/nome/slug — qualquer pista)
    try {
      const hint = resv.unitName || resv.unit || resv.unitId || '';
      if (hint) setActiveUnitPixelFromUnit({ id: resv.unitId || undefined, name: hint });
    } catch {}

    // Dispara o evento (mesmo sem labels “perfeitos”, pois são opcionais)
    trackReservationCheckin({
      reservationCode: resv.reservationCode,
      fullName: resv.fullName || undefined,
      email: resv.email || undefined,
      phone: resv.phone || undefined,
      unit: unitLabel !== '—' ? unitLabel : (resv.unitName || resv.unit || undefined),
      area: areaLabel !== '—' ? areaLabel : (resv.areaName || resv.area || undefined),
      status: resv.status || 'CHECKED_IN',
      source: 'admin', // check-in feito no painel
    }).catch(() => {});
  }, [resv, unitLabel, areaLabel]);

  async function handleConfirm() {
    if (!resv?.id || confirming) return;
    try {
      setConfirming(true);
      const updated = await api(`/v1/reservations/${encodeURIComponent(resv.id)}/checkin`, {
        method: 'POST',
        auth: true,
      });
      setResv(updated);
      toast.success('Check-in confirmado!');
      try { navigator.vibrate?.(80); } catch {}

      // Ativa o pixel da unidade imediatamente após confirmar
      try {
        const hint = updated?.unitName || updated?.unit || updated?.unitId || '';
        if (hint) setActiveUnitPixelFromUnit({ id: updated.unitId || undefined, name: hint });
      } catch {}

      // Dispara o evento (proteção contra múltiplos disparos)
      if (!firedOnceRef.current) {
        firedOnceRef.current = true;
        trackReservationCheckin({
          reservationCode: updated.reservationCode,
          fullName: updated.fullName || undefined,
          email: updated.email || undefined,
          phone: updated.phone || undefined,
          unit: unitLabel !== '—' ? unitLabel : (updated.unitName || updated.unit || undefined),
          area: areaLabel !== '—' ? areaLabel : (updated.areaName || updated.area || undefined),
          status: updated.status || 'CHECKED_IN',
          source: 'admin', // check-in feito no painel
        }).catch(() => {});
      }
    } catch (e: any) {
      const msg = e?.error?.message || e?.error || e?.message || 'Não foi possível confirmar.';
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  }

  const isChecked = !!resv && resv.status === 'CHECKED_IN';

  return (
    <section className="container max-w-2xl mt-6">
      {/* 🔙 Top strip: voltar ao painel */}
      <div className="mb-3">
        <button className="btn btn-ghost btn-sm" onClick={() => (window.location.href = '/')}>
          ← Voltar ao painel
        </button>
      </div>

      <div className="card">
        <header className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-normal">Confirmação de Check-in</h2>
        </header>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : !resv ? (
          <div className="text-sm text-muted">Reserva não encontrada.</div>
        ) : isChecked ? (
          <SuccessPanel
            resv={resv}
            unitLabel={unitLabel}
            areaLabel={areaLabel}
          />
        ) : (
          <div className="space-y-5">
            <Summary
              resv={resv}
              unitLabel={unitLabel}
              areaLabel={areaLabel}
              loadingAreas={areasByUnit.loading}
            />

            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
              <div className="font-medium">Revise antes de confirmar</div>
              <div className="text-sm opacity-90">
                Verifique nome, quantidade de pessoas, unidade, área e data/horário. Pressione <b>Enter</b> para confirmar
                ou clique no botão abaixo.
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => window.history.back()} disabled={confirming}>
                Cancelar (Esc)
              </button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={confirming}>
                {confirming ? 'Confirmando…' : 'Confirmar Check-in (Enter)'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ====== Subcomponentes ====== */

function Summary({
  resv,
  unitLabel,
  areaLabel,
  loadingAreas,
}: {
  resv: ReservationPreview;
  unitLabel: string;
  areaLabel: string;
  loadingAreas: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Info label="Código" value={<code className="font-normal">{resv.reservationCode}</code>} />
      <Info
        label="Status"
        value={
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span className="badge badge-wait">AWAITING_CHECKIN</span>
          </span>
        }
      />
      <Info label="Nome" value={resv.fullName || '—'} />
      <Info label="Telefone" value={resv.phone || '—'} />
      <Info label="Pessoas (Adultos + Crianças)" value={`${resv.people ?? 0} + ${resv.kids ?? 0}`} />
      <Info label="Unidade" value={unitLabel} />
      <Info
        label="Área"
        value={
          loadingAreas && !resv.area && !resv.areaName
            ? <span className="text-muted">Carregando…</span>
            : areaLabel
        }
      />
      <Info
        label="Data/Hora"
        value={resv.reservationDate ? new Date(resv.reservationDate).toLocaleString() : '—'}
      />
    </div>
  );
}

function SuccessPanel({
  resv,
  unitLabel,
  areaLabel,
}: {
  resv: ReservationPreview;
  unitLabel: string;
  areaLabel: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-green-300 bg-green-50 p-5"
      role="status"
      aria-live="polite"
    >
      {/* Animação de brilho sutil */}
      <div className="pointer-events-none absolute -inset-1 opacity-40 [background:radial-gradient(1200px_200px_at_50%_-60px,rgba(34,197,94,0.25),transparent)]" />

      <div className="flex items-start gap-4">
        <div className="relative">
          <div className="h-14 w-14 rounded-full bg-green-600 text-white flex items-center justify-center">
            <CheckIcon />
          </div>
          <span className="absolute -inset-1 animate-ping rounded-full bg-green-400 opacity-30" />
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-normal text-green-800">Check-in confirmado</h3>
          <p className="text-green-900/80 text-sm">
            {resv.checkedInAt
              ? `Validação em ${new Date(resv.checkedInAt).toLocaleString()}`
              : 'Validação concluída.'}
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Info label="Código" value={<code className="font-semibold">{resv.reservationCode}</code>} />
            <Info
              label="Status"
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
                  <span className="badge badge-ok">CHECKED_IN</span>
                </span>
              }
            />
            <Info label="Nome" value={resv.fullName || '—'} />
            <Info label="Pessoas (Adultos + Crianças)" value={`${resv.people ?? 0} + ${resv.kids ?? 0}`} />
            <Info label="Unidade" value={unitLabel} />
            <Info label="Área" value={areaLabel} />
            <Info
              label="Data/Hora"
              value={resv.reservationDate ? new Date(resv.reservationDate).toLocaleString() : '—'}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
