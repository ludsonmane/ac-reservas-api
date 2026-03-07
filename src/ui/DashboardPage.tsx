// src/ui/DashboardPage.tsx
import React from 'react';
import { api } from '../lib/api';
import type { Reservation } from '../types';
import { useUnits } from './hooks/useUnits';
import { useAreasByUnit } from './hooks/useAreasByUnit';
import { toast } from './toast';

type GroupRow = {
  key: string;
  label: string;
  reservas: number;
  checkins: number;
  awaiting: number;
  people: number;
  kids: number;
};

// Reservas com check-in feito mas sem faturamento ZIG registrado
type SemFaturamentoRow = {
  id:              string;
  reservationCode: string;
  fullName:        string;
  tables:          string | null;
  reservationDate: string;
  areaName?:       string | null;
  unitName?:       string | null;
};

type DashboardData = {
  items: Reservation[];
  fetchedAt: string;
};

/* ---------- helpers ---------- */
function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInput(d: Date) {
  // yyyy-mm-ddThh:mm
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localToISOStart(v?: string) {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setSeconds(0, 0);
  return d.toISOString();
}

function localToISOEnd(v?: string) {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setSeconds(59, 999);
  return d.toISOString();
}

function safeStr(v: any) {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
}

function normalizeOriginForDashboard(r: Reservation) {
  return safeStr(r.utm_source) || '(sem origem)';
}

function mergeBotmakerDisparoOnly(origin: string) {
  const v = safeStr(origin).toLowerCase();
  if (!v || v === '(sem origem)') return 'SEM_ORIGEM';
  if (v.includes('botmaker') || v.includes('disparo')) return 'BOTMAKER_DISPARO';
  return origin;
}


function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10; // 1 decimal
}

function normalizePage(res: any, fallbackSize: number) {
  return {
    items: (res?.items ?? res?.data ?? []) as Reservation[],
    page: Number(res?.page ?? res?.currentPage ?? 1),
    pageSize: Number(res?.pageSize ?? res?.perPage ?? fallbackSize ?? 10),
    total: Number(res?.total ?? res?.totalItems ?? res?.count ?? 0),
    totalPages: Number(res?.totalPages ?? res?.pages ?? res?.lastPage ?? 1),
  };
}

function groupBy(items: Reservation[], getKey: (r: Reservation) => string, labelOf?: (key: string) => string) {
  const map = new Map<string, GroupRow>();
  for (const r of items) {
    const k = safeStr(getKey(r)) || '(vazio)';
    const row = map.get(k) ?? {
      key: k,
      label: labelOf ? labelOf(k) : k,
      reservas: 0,
      checkins: 0,
      awaiting: 0,
      people: 0,
      kids: 0,
    };
    row.reservas += 1;
    const isCheckin = r.status === 'CHECKED_IN' || !!r.checkedInAt;
    if (isCheckin) row.checkins += 1;
    if (r.status === 'AWAITING_CHECKIN') row.awaiting += 1;
    row.people += Number(r.people ?? 0);
    row.kids += Number(r.kids ?? 0);
    map.set(k, row);
  }

  const out = Array.from(map.values());
  out.sort((a, b) => b.reservas - a.reservas);
  return out;
}

function topN<T>(arr: T[], n: number) {
  return arr.slice(0, Math.max(0, n));
}

function StatCard({ title, value, hint }: { title: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

function BarList({ title, rows, help, limit = 10 }: { title: string; rows: GroupRow[]; help?: string; limit?: number }) {
  const [showAll, setShowAll] = React.useState(false);
  const total = rows.reduce((s, r) => s + r.reservas, 0);
  const view = showAll ? rows : topN(rows, limit);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="title text-lg">{title}</div>
          {help ? <div className="text-xs text-muted mt-0.5">{help}</div> : null}
        </div>
        {rows.length > limit ? (
          <button className="btn btn-sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Mostrar menos' : 'Ver tudo'}
          </button>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto scroll-area">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th>Valor</th>
              <th className="w-[160px]">Participação</th>
              <th>Reservas</th>
              <th>Check-ins</th>
              <th>Taxa</th>
              <th>Pessoas</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const share = pct(r.reservas, total);
              const rate = pct(r.checkins, r.reservas);
              return (
                <tr key={r.key}>
                  <td className="font-medium">{r.label}</td>
                  <td>
                    <div className="progress" title={`${share}%`}>
                      <span style={{ width: `${Math.min(100, share)}%` }} />
                    </div>
                  </td>
                  <td>{r.reservas}</td>
                  <td>{r.checkins}</td>
                  <td>{rate}%</td>
                  <td>{r.people + r.kids}</td>
                </tr>
              );
            })}
            {!view.length ? (
              <tr>
                <td colSpan={6} className="text-muted">Sem dados no período.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { units } = useUnits(true);

  const [unitId, setUnitId] = React.useState<string>('');
  const { data: areasData } = useAreasByUnit(unitId || undefined, true);
  const areas = areasData ?? [];
  const [areaId, setAreaId] = React.useState<string>('');

  const [fromLocal, setFromLocal] = React.useState<string>('');
  const [toLocal, setToLocal] = React.useState<string>('');

  const [billingFilter, setBillingFilter] = React.useState<'all' | 'sem_faturamento'>('all');
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState<{ fetched: number; total?: number }>({ fetched: 0, total: undefined });
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DashboardData | null>(null);

  // defaults: últimos 7 dias (00:00 -> 23:59)
  React.useEffect(() => {
    if (fromLocal || toLocal) return;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 0, 0);
    setFromLocal(toLocalInput(start));
    setToLocal(toLocalInput(end));
  }, [fromLocal, toLocal]);

  // se trocar unit, limpa area selecionada se não existir
  React.useEffect(() => {
    if (!areaId) return;
    if (!areas.find(a => String(a.id) === String(areaId))) setAreaId('');
  }, [unitId, areas, areaId]);

  async function load() {
    setLoading(true);
    setError(null);
    setProgress({ fetched: 0, total: undefined });

    const from = localToISOStart(fromLocal);
    const to = localToISOEnd(toLocal);

    try {
      const pageSize = 500;
      let page = 1;
      let totalPages = 1;
      let total = 0;
      const all: Reservation[] = [];

      // loop paginado (client-side aggregation)
      while (page <= totalPages) {
        const params: Record<string, any> = { page, pageSize };
        if (unitId) params.unitId = unitId;
        if (areaId) params.areaId = areaId;
        if (from) params.from = from;
        if (to) params.to = to;

        const qs = new URLSearchParams(params as any).toString();
        const res = await api(`/v1/reservations?${qs}`, { auth: true });
        const normalized = normalizePage(res, pageSize);
        totalPages = normalized.totalPages || 1;
        total = normalized.total || total;
        all.push(...(normalized.items || []));
        setProgress({ fetched: all.length, total });

        if (!normalized.items?.length) break;
        if (page >= totalPages) break;
        page += 1;
      }

      setData({ items: all, fetchedAt: new Date().toISOString() });
      toast.success('Dashboard atualizado.');
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar dashboard.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const items = data?.items ?? [];
  const totalRes = items.length;
  const totalPeople = items.reduce((s, r) => s + Number(r.people ?? 0), 0);
  const totalKids = items.reduce((s, r) => s + Number(r.kids ?? 0), 0);
  const totalPax = totalPeople + totalKids;
  const checkins = items.filter(r => r.status === 'CHECKED_IN' || !!r.checkedInAt).length;
  const awaiting = items.filter(r => r.status === 'AWAITING_CHECKIN').length;
  const avgAdults = totalRes ? Math.round((totalPeople / totalRes) * 10) / 10 : 0;
  const avgPax = totalRes ? Math.round((totalPax / totalRes) * 10) / 10 : 0;
  const checkinRate = pct(checkins, totalRes);

  // Checkins sem faturamento ZIG: status CHECKED_IN + tem mesas + sem zigBillingCents
  const checkinsSemFaturamento: SemFaturamentoRow[] = React.useMemo(
    () => items.filter(r =>
      (r.status === 'CHECKED_IN' || !!r.checkedInAt) &&
      r.tables?.trim() &&
      (r as any).zigBillingCents == null
    ).map(r => ({
      id:              r.id,
      reservationCode: r.reservationCode || '',
      fullName:        r.fullName,
      tables:          r.tables ?? null,
      reservationDate: r.reservationDate,
      areaName:        r.areaName ?? r.area ?? null,
      unitName:        (r as any).unitName ?? null,
    })),
    [items]
  );

  // Faturamento total ZIG já registrado no período
  const zigTotalCents = React.useMemo(
    () => items
      .filter(r => r.status === 'CHECKED_IN')
      .reduce((s, r) => s + ((r as any).zigBillingCents ?? 0), 0),
    [items]
  );
  const zigTotalBRL = (zigTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Faturamento médio por mesa: soma de (zigBillingCents / nº de mesas) por reserva
  const zigAvgPerTableCents = React.useMemo(() => {
    const billed = items.filter(r =>
      r.status === 'CHECKED_IN' &&
      (r as any).zigBillingCents != null &&
      (r as any).zigBillingCents > 0 &&
      r.tables?.trim()
    );
    if (!billed.length) return 0;
    const totalMesas = billed.reduce((s, r) => {
      const n = r.tables!.split(',').filter(Boolean).length;
      return s + (n || 1);
    }, 0);
    return Math.round(zigTotalCents / totalMesas);
  }, [items, zigTotalCents]);

  const zigAvgPerTableBRL = zigAvgPerTableCents > 0
    ? (zigAvgPerTableCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

  // Nº total de mesas faturadas no período
  const zigTotalMesas = React.useMemo(() => items.filter(r =>
    r.status === 'CHECKED_IN' &&
    (r as any).zigBillingCents != null &&
    r.tables?.trim()
  ).reduce((s, r) => s + r.tables!.split(',').filter(Boolean).length, 0), [items]);

  // Aplica filtro de billing
  const filteredItems = React.useMemo(() => {
    if (billingFilter === 'sem_faturamento') {
      return items.filter(r =>
        (r.status === 'CHECKED_IN' || !!r.checkedInAt) &&
        r.tables?.trim() &&
        (r as any).zigBillingCents == null
      );
    }
    return items;
  }, [items, billingFilter]);

  const byOrigin = React.useMemo(
    () => groupBy(filteredItems, r => mergeBotmakerDisparoOnly(normalizeOriginForDashboard(r))),
    [items]
  );
  const byCampaign = React.useMemo(() => groupBy(filteredItems, r => r.utm_campaign || ''), [items]);
  const byMedium = React.useMemo(() => groupBy(filteredItems, r => r.utm_medium || ''), [items]);
  const byArea = React.useMemo(
    () => groupBy(filteredItems, r => (r.areaName || r.area || '').trim() || '(sem área)'),
    [items]
  );
  const byType = React.useMemo(() => groupBy(filteredItems, r => r.reservationType || ''), [items]);

  const botmakerDisparoRow = byOrigin.find(r => r.key === 'BOTMAKER_DISPARO');
  const semOrigemRow = byOrigin.find(r => r.key === 'SEM_ORIGEM');

  // distribuição de people (adultos) por reserva
  const peopleDist = React.useMemo(() => {
    const m = new Map<string, GroupRow>();
    for (const r of items) {
      const k = String(Math.max(0, Number(r.people ?? 0)));
      const row = m.get(k) ?? { key: k, label: `${k} pessoa(s)`, reservas: 0, checkins: 0, awaiting: 0, people: 0, kids: 0 };
      row.reservas += 1;
      if (r.status === 'CHECKED_IN' || !!r.checkedInAt) row.checkins += 1;
      if (r.status === 'AWAITING_CHECKIN') row.awaiting += 1;
      row.people += Number(r.people ?? 0);
      row.kids += Number(r.kids ?? 0);
      m.set(k, row);
    }
    const out = Array.from(m.values());
    out.sort((a, b) => Number(a.key) - Number(b.key));
    return out;
  }, [items]);

  const lastUpdated = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString('pt-BR') : '—';

  return (
    <div className="container mt-4 space-y-4">
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="title text-2xl">Dashboard</div>
            <div className="text-sm text-muted">Visão estratégica de Reservas, Check-in e Origem (UTM_SOURCE). Atualizado: {lastUpdated}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? 'Carregando…' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <label>
            <span>Unidade</span>
            <select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Todas</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Área</span>
            <select className="select" value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!unitId}>
              <option value="">Todas</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {!unitId ? <div className="mt-1 text-[11px] text-muted">Selecione uma unidade para filtrar áreas.</div> : null}
          </label>

          <label>
            <span>De</span>
            <input className="input" type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
          </label>

          <label>
            <span>Até</span>
            <input className="input" type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
          </label>

          <label>
            <span>Faturamento ZIG</span>
            <select className="select" value={billingFilter} onChange={(e) => setBillingFilter(e.target.value as any)}>
              <option value="all">Todas</option>
              <option value="sem_faturamento">Checkins sem faturamento</option>
            </select>
          </label>

          <div className="flex items-end">
            <div className="w-full rounded-xl border border-border bg-panel/60 px-3 py-2.5">
              <div className="text-xs text-muted">Coleta</div>
              <div className="text-sm font-medium">{progress.fetched}{typeof progress.total === 'number' ? ` / ${progress.total}` : ''}</div>
              <div className="text-[11px] text-muted">Reservas carregadas</div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard title="Reservas" value={totalRes} hint={<span>Período selecionado</span>} />
        <StatCard title="Check-ins" value={checkins} hint={<span>Taxa: {checkinRate}%</span>} />
        <StatCard title="Pessoas" value={totalPax} hint={<span>Adultos {totalPeople} • Kids {totalKids}</span>} />
        <StatCard title="Média por reserva" value={`${avgPax}`} hint={<span>Adultos: {avgAdults}</span>} />
        <StatCard
          title="Botmaker + Disparo"
          value={botmakerDisparoRow?.reservas ?? 0}
          hint={<span>{pct(botmakerDisparoRow?.reservas ?? 0, totalRes)}% das reservas</span>}
        />
        <StatCard
          title="Sem origem"
          value={semOrigemRow?.reservas ?? 0}
          hint={<span>{pct(semOrigemRow?.reservas ?? 0, totalRes)}% (tracking)</span>}
        />
        <StatCard title="Aguardando" value={awaiting} hint={<span>Fila de execução</span>} />
        <StatCard title="Saúde do funil" value={checkinRate >= 70 ? '🟢' : checkinRate >= 45 ? '🟡' : '🔴'} hint={<span>Baseado na taxa de check-in</span>} />
        <StatCard
          title="Faturamento ZIG"
          value={zigTotalCents > 0 ? zigTotalBRL : '—'}
          hint={<span>Total registrado no período</span>}
        />
        <StatCard
          title="Média por mesa"
          value={zigAvgPerTableBRL}
          hint={<span>{zigTotalMesas} {zigTotalMesas === 1 ? 'mesa' : 'mesas'} faturadas</span>}
        />
        <StatCard
          title="Checkins sem faturamento"
          value={checkinsSemFaturamento.length}
          hint={<span className={checkinsSemFaturamento.length > 0 ? 'text-amber-500 font-semibold' : ''}>{checkinsSemFaturamento.length > 0 ? '⚠️ Consultar ZIG' : '✅ Todos faturados'}</span>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BarList title="Origem (UTM Source)" rows={byOrigin} help="Usa UTM_SOURCE. Soma apenas botmaker + disparo em um único canal." />
        <BarList title="Tipo de reserva" rows={byType} help="Mix: Particular / Empresa / Aniversário / Confraternização." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BarList title="UTM Campaign" rows={byCampaign} help="Campanhas que estão trazendo reservas (com taxa de check-in)." />
        <BarList title="UTM Medium" rows={byMedium} help="Mídias: cpc, social, influencer, etc." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card">
          <div className="title text-lg">Leitura executiva de origem</div>
          <div className="text-xs text-muted mt-0.5">Todas as origens do período. Só botmaker + disparo são consolidados.</div>
          <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {byOrigin.map((r) => (
              <div key={r.key} className="flex items-center justify-between rounded-lg border border-border bg-panel/40 px-3 py-2">
                <div className="min-w-0 pr-3">
                  <div className="truncate text-sm font-medium">{r.label}</div>
                  <div className="text-[11px] text-muted">{pct(r.reservas, totalRes)}% do total</div>
                </div>
                <div className="text-sm font-semibold">{r.reservas}</div>
              </div>
            ))}
            {!byOrigin.length ? <div className="text-sm text-muted">Sem dados no período.</div> : null}
          </div>
        </div>
        <BarList title="Áreas" rows={byArea} help="Distribuição das reservas por área (ajuda a olhar capacidade e operação)." />
      </div>

      <div className="card">
        <div className="title text-lg">Pessoas por reserva (adultos)</div>
        <div className="text-xs text-muted mt-0.5">Distribuição do tamanho dos grupos. Útil pra prever ocupação e ritmo de atendimento.</div>

        <div className="mt-4 overflow-x-auto scroll-area">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="w-[180px]">Participação</th>
                <th>Reservas</th>
                <th>Check-ins</th>
                <th>Taxa</th>
                <th>PAX (inclui kids)</th>
              </tr>
            </thead>
            <tbody>
              {peopleDist.map((r) => {
                const share = pct(r.reservas, totalRes);
                const rate = pct(r.checkins, r.reservas);
                return (
                  <tr key={r.key}>
                    <td className="font-medium">{r.label}</td>
                    <td>
                      <div className="progress" title={`${share}%`}>
                        <span style={{ width: `${Math.min(100, share)}%` }} />
                      </div>
                    </td>
                    <td>{r.reservas}</td>
                    <td>{r.checkins}</td>
                    <td>{rate}%</td>
                    <td>{r.people + r.kids}</td>
                  </tr>
                );
              })}
              {!peopleDist.length ? (
                <tr>
                  <td colSpan={6} className="text-muted">Sem dados no período.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {checkinsSemFaturamento.length > 0 && (
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="title text-lg flex items-center gap-2">
                <span>⚠️ Checkins sem faturamento ZIG</span>
                <span className="text-sm font-normal text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                  {checkinsSemFaturamento.length}
                </span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                Reservas com check-in feito, mesas vinculadas, mas sem faturamento ZIG registrado. Abra cada uma e clique em ↺ para buscar.
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto scroll-area">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Mesas</th>
                  <th>Data</th>
                  <th>Área</th>
                </tr>
              </thead>
              <tbody>
                {checkinsSemFaturamento.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.reservationCode || '—'}</td>
                    <td className="font-medium">{r.fullName}</td>
                    <td>{r.tables || '—'}</td>
                    <td>{new Date(r.reservationDate).toLocaleDateString('pt-BR')}</td>
                    <td>{r.areaName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div className="title text-lg">Insights rápidos</div>
            <div className="text-xs text-muted mt-0.5">Pra você bater o olho e decidir o próximo disparo / ajuste de campanha.</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-panel/50 p-4">
            <div className="text-sm font-semibold">Top campanhas (volume)</div>
            <ol className="mt-2 space-y-1 text-sm">
              {topN(byCampaign, 5).map(r => (
                <li key={r.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="text-muted">{r.reservas}</span>
                </li>
              ))}
              {!byCampaign.length ? <li className="text-muted">—</li> : null}
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-panel/50 p-4">
            <div className="text-sm font-semibold">Top campanhas (taxa check-in)</div>
            <div className="text-[11px] text-muted">(mín. 5 reservas)</div>
            <ol className="mt-2 space-y-1 text-sm">
              {topN(
                byCampaign
                  .filter(r => r.reservas >= 5)
                  .slice()
                  .sort((a, b) => (b.checkins / b.reservas) - (a.checkins / a.reservas)),
                5
              ).map(r => (
                <li key={r.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="text-muted">{pct(r.checkins, r.reservas)}%</span>
                </li>
              ))}
              {!byCampaign.filter(r => r.reservas >= 5).length ? <li className="text-muted">—</li> : null}
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-panel/50 p-4">
            <div className="text-sm font-semibold">Oportunidades</div>
            <div className="text-[11px] text-muted">Campanhas com volume, mas baixa execução (taxa &lt; 40%).</div>
            <ol className="mt-2 space-y-1 text-sm">
              {topN(
                byCampaign
                  .filter(r => r.reservas >= 8 && pct(r.checkins, r.reservas) < 40)
                  .slice()
                  .sort((a, b) => b.reservas - a.reservas),
                5
              ).map(r => (
                <li key={r.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="text-muted">{pct(r.checkins, r.reservas)}%</span>
                </li>
              ))}
              {!byCampaign.filter(r => r.reservas >= 8 && pct(r.checkins, r.reservas) < 40).length ? <li className="text-muted">—</li> : null}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
