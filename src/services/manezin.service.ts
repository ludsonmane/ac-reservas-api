/**
 * src/services/manezin.service.ts
 *
 * Faturamento por mesa da reserva — fonte: API Manezin (Rocha Solution).
 *
 * Substitui a leitura via MySQL "Zig Mané DB FULL" — esse banco depende de um cron
 * externo (zig-backfill) que está com dados parciais/duplicados. A API Manezin é
 * a fonte canônica original (mesma origem do MySQL, sem o pipeline de sincronização
 * intermediário) e tem identidade do cliente (CPF + chipNfc) por venda.
 *
 * Regra de faturamento (session detection):
 *   Pivot     = 1ª venda na mesa após reservationDate (max MAX_LATE_HOURS atraso)
 *   Sessão    = vendas consecutivas enquanto:
 *                 (a) gap p/ próxima venda ≤ BILLING_GAP_MIN, OU
 *                 (b) chip da próxima venda já bipou na sessão
 *   Termina   = primeiro gap > BILLING_GAP_MIN com chip NOVO
 *   Cap       = sessão dura no máx MAX_SESSION_HOURS desde o pivot (safety net)
 *   Excluído  = transações com isRefunded=true
 *
 * Configurável via env:
 *   MANEZIN_BASE_URL    (default https://manezin.com.br/api/externo)
 *   MANEZIN_TOKEN       (obrigatório)
 *   BILLING_GAP_MIN     (default 60 — minutos máximos sem venda antes de fechar sessão)
 *   BILLING_MAX_LATE_H  (default 8 — quantas horas o pivot pode ser depois da reserva)
 */

import type { ZigBillingResult, ZigSaidaProduto, ReservationPeriod } from './zig.service';
import { getPeriod, resolveLojaId } from './zig.service';

const MANEZIN_BASE_URL_DEFAULT = 'https://manezin.com.br/api/externo';
const GAP_MIN_DEFAULT          = 60;
const MAX_LATE_HOURS_DEFAULT   = 8;
const MAX_SESSION_HOURS        = 8;

function getGapMin():        number { return parseInt(process.env.BILLING_GAP_MIN    || '', 10) || GAP_MIN_DEFAULT; }
function getMaxLateHours():  number { return parseInt(process.env.BILLING_MAX_LATE_H || '', 10) || MAX_LATE_HOURS_DEFAULT; }

// ─── unitSlug → eventName Manezin ────────────────────────────────────────────

const EVENT_NAME_MAP: Record<string, string> = {
  'bsb':                'MANÉ MERCADO - BSB',
  'mane-bsb':           'MANÉ MERCADO - BSB',
  'ac':                 'MANÉ MERCADO - ÁGUAS CLARAS',
  'aguas-claras':       'MANÉ MERCADO - ÁGUAS CLARAS',
  'mane-aguas-claras':  'MANÉ MERCADO - ÁGUAS CLARAS',
  'sp':                 'MANÉ MERCADO - SÃO PAULO',
  'mane-west-plaza-sp': 'MANÉ MERCADO - SÃO PAULO',
};

function resolveEventName(unitSlug: string | null | undefined): string {
  if (!unitSlug) throw new Error('[manezin] unitSlug ausente — não dá pra resolver eventName');
  const slug = unitSlug.toLowerCase().trim();
  const direct = EVENT_NAME_MAP[slug];
  if (direct) return direct;
  for (const [k, v] of Object.entries(EVENT_NAME_MAP)) if (slug.includes(k)) return v;
  throw new Error(`[manezin] Sem mapeamento de eventName para unitSlug "${unitSlug}"`);
}

// ─── Manezin DTO (shape da API; campos extras vs. ZigSaidaProduto) ────────────

interface ManezinTx {
  transactionId:      string;
  transactionDate:    string;   // UTC ISO sem 'Z' — interpretar como UTC mesmo assim
  productId:          string;
  productSku:         string | null;
  unitValue:          number;   // centavos
  count:              number;
  discountValue:      number | null;
  productName:        string;
  productCategory:    string | null;
  obs:                string | null;
  barId:              string | null;
  barName:            string | null;
  eventName:          string;
  eventId:            string | null;
  eventDate:          string | null;
  isRefunded:         boolean;
  type:               string | null;
  employeeName:       string | null;
  redeId:             string | null;
  lojaId:             string;
  invoiceId:          string | null;
  compr_userDocument: string | null;
  compr_userName:     string | null;
  compr_chipNfc:      string | null;
}

// ─── Match obs → mesa (idêntico ao zig.service.ts) ────────────────────────────

function normalizeMesaNum(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.replace(/^0+/, '') || digits || raw.trim();
}

function buildMesaMatcher(tables: string[]): (obs: string | null) => string | null {
  const byNum = new Map<string, string>();
  for (const m of tables) byNum.set(normalizeMesaNum(m), m);
  const exactRe  = /^Mesa:\s*(\d+)$/;
  const prefixRe = /^Mesa:\s*(\d+)(?:\s|$|-)/;
  return (obs) => {
    if (!obs) return null;
    const t = obs.trim();
    const match = exactRe.exec(t) || prefixRe.exec(t);
    if (!match) return null;
    return byNum.get(normalizeMesaNum(match[1])) ?? null;
  };
}

// ─── Manezin → ZigSaidaProduto ────────────────────────────────────────────────

function toDto(t: ManezinTx): ZigSaidaProduto {
  return {
    transactionId:    t.transactionId,
    transactionDate:  t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z',
    productId:        t.productId,
    productSku:       t.productSku ?? '',
    unitValue:        Number(t.unitValue ?? 0),
    count:            Number(t.count ?? 1),
    discountValue:    Number(t.discountValue ?? 0),
    productName:      t.productName,
    productCategory:  t.productCategory ?? '',
    redeId:           t.redeId ?? '',
    lojaId:           t.lojaId,
    eventId:          t.eventId ?? '',
    eventName:        t.eventName,
    eventDate:        t.eventDate ?? '',
    invoiceId:        t.invoiceId,
    employeeName:     t.employeeName ?? '',
    type:             t.type ?? '',
    obs:              t.obs,
    barId:            t.barId,
    barName:          t.barName,
    isRefunded:       Boolean(t.isRefunded),
    additions:        [],
  };
}

// ─── Fetch (cache opcional pro batch processar 1 dia uma só vez) ─────────────

export type ManezinDayCache = Map<string, ManezinTx[]>;   // key 'YYYY-MM-DD'

export async function fetchManezinForDay(
  date: string,
  cache?: ManezinDayCache,
): Promise<ManezinTx[]> {
  if (cache?.has(date)) return cache.get(date)!;
  const token = process.env.MANEZIN_TOKEN;
  if (!token) throw new Error('[manezin] MANEZIN_TOKEN não configurado');
  const base  = process.env.MANEZIN_BASE_URL || MANEZIN_BASE_URL_DEFAULT;
  const next  = new Date(date + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
  const url   = `${base}/transacoes?data_inicio=${date}&data_fim=${next.toISOString().slice(0, 10)}&limit=50000`;
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`[manezin] HTTP ${res.status} ${res.statusText}`);
  const body  = await res.json() as { data: ManezinTx[]; total: number };
  if (cache) cache.set(date, body.data);
  return body.data;
}

// ─── Session detection (regra de faturamento) ────────────────────────────────

export function applySessionRule(
  txsOnMesa: ManezinTx[],
  reservationStartMs: number,
  opts: { gapMin?: number; maxLateHours?: number } = {},
): ManezinTx[] {
  const gapMin       = opts.gapMin       ?? getGapMin();
  const maxLateHours = opts.maxLateHours ?? getMaxLateHours();

  const upperMs = reservationStartMs + (maxLateHours + MAX_SESSION_HOURS) * 3600_000;
  const all = txsOnMesa
    .filter(t => !t.isRefunded)
    .filter(t => {
      const ms = new Date(toIsoUtc(t.transactionDate)).getTime();
      return ms >= reservationStartMs && ms <= upperMs;
    })
    .sort((a, b) => new Date(toIsoUtc(a.transactionDate)).getTime() - new Date(toIsoUtc(b.transactionDate)).getTime());

  if (all.length === 0) return [];

  const pivotMs    = new Date(toIsoUtc(all[0].transactionDate)).getTime();
  const sessionCap = pivotMs + MAX_SESSION_HOURS * 3600_000;
  const chips      = new Set<string>();
  const accepted: ManezinTx[] = [all[0]];
  if (all[0].compr_chipNfc) chips.add(all[0].compr_chipNfc);
  let prevMs = pivotMs;

  for (let i = 1; i < all.length; i++) {
    const t  = all[i];
    const ms = new Date(toIsoUtc(t.transactionDate)).getTime();
    if (ms > sessionCap) break;

    const gapMinutes  = (ms - prevMs) / 60_000;
    const chip        = t.compr_chipNfc;
    const chipInSession = chip && chips.has(chip);

    if (gapMinutes <= gapMin || chipInSession) {
      accepted.push(t);
      if (chip) chips.add(chip);
      prevMs = ms;
    } else {
      // gap > gapMin AND chip novo → fim da sessão
      break;
    }
  }

  return accepted;
}

function toIsoUtc(s: string): string {
  return s.endsWith('Z') ? s : s + 'Z';
}

// ─── Função pública (mesma assinatura/DTO do zig.service.ts) ─────────────────

export async function getManezinBillingForReservation(
  tablesCsv:    string,
  date:         Date | string,
  unitSlug?:    string | null,
  lojaOverride?: string,
  _checkInTime?: Date | string | null,    // ignorado (anchor é reservationDate)
  cache?:        ManezinDayCache,
): Promise<ZigBillingResult> {
  const tables = tablesCsv.split(',').map(t => t.trim()).filter(Boolean);
  if (tables.length === 0) throw new Error('[manezin] A reserva não possui mesas vinculadas.');

  const reservationDate = typeof date === 'string' ? new Date(date) : date;
  const reservationMs   = reservationDate.getTime();
  const eventName       = resolveEventName(unitSlug);
  const lojaId          = lojaOverride || (unitSlug ? resolveLojaId(unitSlug) : '');
  const period          = getPeriod(reservationDate);

  // Pode envolver até 2 dias UTC (jantar cruza meia-noite)
  const day1 = reservationDate.toISOString().slice(0, 10);
  const day2 = new Date(reservationMs + 24 * 3600_000).toISOString().slice(0, 10);
  const days = day1 === day2 ? [day1] : [day1, day2];

  const allDayTxs: ManezinTx[] = [];
  for (const d of days) {
    const txs = await fetchManezinForDay(d, cache);
    allDayTxs.push(...txs);
  }

  const matcher = buildMesaMatcher(tables);
  const byTable = new Map<string, ManezinTx[]>();
  for (const t of tables) byTable.set(t, []);
  for (const tx of allDayTxs) {
    if (tx.eventName !== eventName) continue;
    const mesa = matcher(tx.obs);
    if (!mesa) continue;
    byTable.get(mesa)!.push(tx);
  }

  let totalValueCents = 0;
  const byTableOut = tables.map(table => {
    const all      = byTable.get(table) ?? [];
    const accepted = applySessionRule(all, reservationMs);
    const totalCents = accepted.reduce(
      (acc, t) => acc + Number(t.unitValue) * Number(t.count) - Number(t.discountValue ?? 0),
      0,
    );
    totalValueCents += totalCents;
    return { table, totalCents, transactions: accepted.map(toDto) };
  });

  const totalValueBRL = (totalValueCents / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });

  return {
    tables,
    transactions:    byTableOut.flatMap(b => b.transactions),
    totalValueCents,
    totalValueBRL,
    byTable:         byTableOut,
    date:            day1,
    period,
    lojaId,
    unitSlug:        unitSlug ?? undefined,
  };
}
