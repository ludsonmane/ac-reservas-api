/**
 * src/ui/ZigBillingPanel.tsx
 *
 * Painel de faturamento ZIG vinculado a uma reserva.
 * Busca automaticamente ao montar (se a reserva tiver mesas vinculadas).
 *
 * Uso:
 *   <ZigBillingPanel reservationId={reservation.id} tables={reservation.tables} />
 */

import React from 'react';
import { api } from '../lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ZigTransaction = {
  transactionId:  string;
  transactionDate: string;
  productName:    string;
  unitValue:      number;   // centavos
  count:          number;
  discountValue:  number;   // centavos
  obs?:           string | null;
  barName?:       string | null;
  employeeName?:  string;
  type?:          string;
};

type ByTableRow = {
  table:       string;
  totalCents:  number;
  transactions: ZigTransaction[];
};

type ZigBillingData = {
  reservationId:   string;
  reservationName: string;
  tables:          string[];
  totalValueCents: number;
  totalValueBRL:   string;
  byTable:         ByTableRow[];
  date:            string;
  period:          'AFTERNOON' | 'NIGHT';
  lojaId:          string;
};

const PERIOD_LABEL: Record<string, string> = {
  AFTERNOON: '☀️ Almoço (12:00–15:00)',
  NIGHT:     '🌙 Jantar (17:30–01:00)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMesaLabel(table: string) {
  const n = parseInt(table, 10);
  if (isNaN(n)) return `Mesa ${table}`;
  return `Mesa ${String(n).padStart(3, '0')}`;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// ─── Sub-componente: linha de transação ──────────────────────────────────────

function TxRow({ tx }: { tx: ZigTransaction }) {
  const net = tx.unitValue * tx.count - (tx.discountValue ?? 0);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 py-1.5 border-b border-border last:border-0 text-sm">
      <div>
        <span className="font-medium text-foreground">{tx.productName}</span>
        {tx.count > 1 && (
          <span className="ml-1 text-muted text-xs">×{tx.count}</span>
        )}
        {tx.obs && (
          <span className="ml-2 text-xs text-muted italic">obs: {tx.obs}</span>
        )}
        {tx.barName && !tx.obs && (
          <span className="ml-2 text-xs text-muted">{tx.barName}</span>
        )}
      </div>
      <div className="text-right tabular-nums">
        <span className={net < 0 ? 'text-red-500' : 'text-foreground'}>
          {centsToBRL(net)}
        </span>
        {tx.discountValue > 0 && (
          <div className="text-xs text-muted line-through">
            {centsToBRL(tx.unitValue * tx.count)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente: seção de uma mesa ───────────────────────────────────────

function TableSection({ row, defaultOpen }: { row: ByTableRow; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasItems = row.transactions.length > 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header da mesa */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-panel hover:bg-panel/80 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🪑</span>
          <span className="font-semibold">{formatMesaLabel(row.table)}</span>
          {hasItems ? (
            <span className="text-xs text-muted bg-card border border-border rounded-full px-2 py-0.5">
              {row.transactions.length} {row.transactions.length === 1 ? 'item' : 'itens'}
            </span>
          ) : (
            <span className="text-xs text-muted italic">sem vendas encontradas</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-foreground tabular-nums">
            {centsToBRL(row.totalCents)}
          </span>
          <span className="text-muted text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Transações */}
      {open && hasItems && (
        <div className="px-4 py-2 bg-card">
          {row.transactions.map((tx) => (
            <TxRow key={tx.transactionId} tx={tx} />
          ))}
        </div>
      )}

      {open && !hasItems && (
        <div className="px-4 py-3 bg-card text-sm text-muted italic">
          Nenhuma venda encontrada para esta mesa no dia da reserva.
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Props = {
  reservationId: string;
  tables?:       string | null;  // CSV de mesas: "321,322,323"
};

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok';    data: ZigBillingData }
  | { status: 'error'; code: string; message: string };

export function ZigBillingPanel({ reservationId, tables }: Props) {
  const [state, setState] = React.useState<State>({ status: 'idle' });

  const hasTables = !!tables && tables.trim() !== '';

  async function load() {
    setState({ status: 'loading' });
    try {
      const data = await api(`/v1/zig/billing/${encodeURIComponent(reservationId)}`, {
        auth: true,
      });
      setState({ status: 'ok', data });
    } catch (err: any) {
      const status  = err?.status || 0;
      const code    = status === 404
        ? 'ROUTE_NOT_FOUND'
        : (err?.error?.code || err?.code || 'UNKNOWN');
      const message = status === 404
        ? 'Endpoint ZIG não encontrado (404). Verifique se o server.ts foi atualizado com a rota /v1/zig e reinicie a API.'
        : (err?.error?.message || err?.message || 'Erro ao consultar ZIG.');
      setState({ status: 'error', code, message });
    }
  }

  // Carrega quando o painel aparece OU quando tables é preenchido.
  // tables pode chegar null no 1º render enquanto o form inicializa,
  // por isso observamos também a prop tables — não só o reservationId.
  React.useEffect(() => {
    if (hasTables && state.status === 'idle') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, tables]);

  // ── Estado: sem mesas vinculadas ───────────────────────────────────────────
  if (!hasTables) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted text-center">
        <span className="text-xl block mb-1">🪑</span>
        Vincule mesas a esta reserva para consultar o faturamento ZIG.
      </div>
    );
  }

  // ── Estado: idle (não deveria acontecer pois auto-carrega) ─────────────────
  if (state.status === 'idle') return null;

  // ── Estado: carregando ─────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <div className="rounded-xl border border-border p-4 text-sm text-muted flex items-center gap-2">
        <svg className="animate-spin h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Consultando ZIG...
      </div>
    );
  }

  // ── Estado: erro ───────────────────────────────────────────────────────────
  if (state.status === 'error') {
    const isConfig   = state.code === 'ZIG_NOT_CONFIGURED';
    const isNoTables = state.code === 'NO_TABLES';

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {isConfig
                ? 'Integração ZIG não configurada'
                : isNoTables
                ? 'Reserva sem mesas vinculadas'
                : 'Erro ao consultar ZIG'}
            </p>
            <p className="text-muted mt-0.5">{state.message}</p>
          </div>
        </div>
        {!isConfig && !isNoTables && (
          <button
            type="button"
            className="mt-3 btn btn-ghost btn-sm text-xs"
            onClick={load}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  // ── Estado: sucesso ────────────────────────────────────────────────────────
  const { data } = state;
  const totalIsZero = data.totalValueCents === 0;
  const totalTxCount = data.byTable.reduce((s, r) => s + r.transactions.length, 0);

  return (
    <div className="space-y-3">

      {/* Card de total */}
      <div className="rounded-xl border border-border bg-panel px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted uppercase tracking-wide font-semibold mb-0.5">
            Faturamento ZIG · {data.date}
          </p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {totalIsZero ? (
              <span className="text-muted text-lg">R$ 0,00</span>
            ) : (
              data.totalValueBRL
            )}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {PERIOD_LABEL[data.period] ?? data.period} ·{' '}
            {data.tables.length} {data.tables.length === 1 ? 'mesa' : 'mesas'} ·{' '}
            {totalTxCount} {totalTxCount === 1 ? 'transação' : 'transações'}
          </p>
        </div>
        <button
          type="button"
          title="Atualizar"
          className="btn btn-ghost btn-sm text-muted"
          onClick={load}
        >
          ↺
        </button>
      </div>

      {/* Detalhe por mesa */}
      <div className="space-y-2">
        {data.byTable.map((row, i) => (
          <TableSection
            key={row.table}
            row={row}
            defaultOpen={data.byTable.length === 1 || i === 0}
          />
        ))}
      </div>

      {totalIsZero && (
        <p className="text-xs text-muted text-center py-1">
          Nenhuma venda encontrada nas mesas desta reserva para o dia {data.date}.
          Verifique se o campo <em>obs</em> ou <em>barName</em> no ZIG contém o número da mesa.
        </p>
      )}
    </div>
  );
}

export default ZigBillingPanel;
