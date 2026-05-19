/**
 * src/services/zig.service.ts
 *
 * Faturamento ZIG por mesa da reserva — fonte: MySQL "Zig Mané DB FULL" (Railway).
 *
 * Substitui a integração antiga via API Manezin externa:
 *   - Fonte de dados estruturada (sem rate-limit, sem dependência de uptime externo)
 *   - Janela: reservationStart → 06:00 do dia seguinte (cobre jantares longos)
 *   - Match estrito por obs="Mesa: N" e variantes (ex.: "Mesa: 321 - Aniversário")
 *
 * Limitação atual: o cron zig-backfill roda 1×/dia (~04h). Faturamento do MESMO
 * dia só aparece após o sync da madrugada.
 */

import { getZigMysqlPool } from '../infrastructure/db/zig-mysql';
import type { RowDataPacket } from 'mysql2/promise';

// ─── Mapeamento unitSlug → loja_id (UUID Zig) ─────────────────────────────────

const DEFAULT_LOJA_MAP: Record<string, string> = {
  'bsb':                '1d02dc84-e124-42e2-81f2-ba83233080a2',
  'mane-bsb':           '1d02dc84-e124-42e2-81f2-ba83233080a2',
  'ac':                 '5e63ab17-f911-44b5-aa8d-0d58eb9a2a4a',
  'aguas-claras':       '5e63ab17-f911-44b5-aa8d-0d58eb9a2a4a',
  'mane-aguas-claras':  '5e63ab17-f911-44b5-aa8d-0d58eb9a2a4a',
  'sp':                 'b0dbc86c-7e27-4a84-b934-1bf5ad52711a',
  'mane-west-plaza-sp': 'b0dbc86c-7e27-4a84-b934-1bf5ad52711a',
};

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

function getLojaMap(): Record<string, string> {
  const raw = process.env.ZIG_LOJA_MAP;
  if (!raw) return DEFAULT_LOJA_MAP;
  try {
    const parsed = JSON.parse(raw);
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) normalized[normalizeSlug(k)] = String(v);
    return { ...DEFAULT_LOJA_MAP, ...normalized };
  } catch {
    console.warn('[zig] ZIG_LOJA_MAP inválido — usando default');
    return DEFAULT_LOJA_MAP;
  }
}

export function resolveLojaId(unitSlug: string | null | undefined): string {
  if (!unitSlug) throw new Error('[ZIG] unitSlug ausente — não é possível resolver loja_id');
  const map = getLojaMap();
  const normalized = normalizeSlug(unitSlug);
  if (map[normalized]) return map[normalized];
  if (map[unitSlug]) return map[unitSlug];
  for (const [k, v] of Object.entries(map)) {
    if (normalized.includes(k) || k.includes(normalized)) return v;
  }
  throw new Error(
    `[ZIG] Nenhum loja_id encontrado para unitSlug "${unitSlug}". ` +
    `Defina ZIG_LOJA_MAP ou ajuste DEFAULT_LOJA_MAP.`,
  );
}

// Compat com chamadores antigos (esperam string label tipo "BSB")
export function resolveComplexo(unitSlug: string | null | undefined): string {
  return resolveLojaId(unitSlug);
}

// ─── Tipos públicos (preservam o contrato anterior) ─────────────────────────

export type ZigAddition = {
  productId:  string;
  productSku: string;
  count:      number;
};

export type ZigSaidaProduto = {
  transactionId:     string;
  transactionDate:   string;
  productId:         string;
  productSku:        string;
  unitValue:         number;   // centavos
  count:             number;
  fractionalAmount?: number | null;
  fractionUnit?:     string | null;
  discountValue:     number;   // centavos
  productName:       string;
  productCategory?:  string;
  redeId?:           string;
  lojaId?:           string;
  eventId?:          string;
  eventName?:        string;
  eventDate?:        string;
  invoiceId?:        string | null;
  employeeName?:     string;
  type?:             string;
  obs?:              string | null;
  barId?:            string | null;
  barName?:          string | null;
  isRefunded?:       boolean;
  additions:         ZigAddition[];
};

export type ReservationPeriod = 'AFTERNOON' | 'NIGHT';

export type ZigBillingResult = {
  tables:           string[];
  transactions:     ZigSaidaProduto[];
  totalValueCents:  number;
  totalValueBRL:    string;
  byTable: {
    table:        string;
    totalCents:   number;
    transactions: ZigSaidaProduto[];
  }[];
  date:      string;
  period:    ReservationPeriod;
  lojaId:    string;
  unitSlug?: string;
};

// ─── Período (preservado pra zig.billing.job.ts) ────────────────────────────

const EVENING_CUTOFF_HOUR   = 17;
const EVENING_CUTOFF_MINUTE = 30;

export function getPeriod(date: Date): ReservationPeriod {
  const totalMin = date.getHours() * 60 + date.getMinutes();
  return totalMin >= EVENING_CUTOFF_HOUR * 60 + EVENING_CUTOFF_MINUTE ? 'NIGHT' : 'AFTERNOON';
}

// ─── Janela de coleta ──────────────────────────────────────────────────────

/**
 * Janela = 3h a partir do horário da reserva.
 * Regra de negócio: depois de 3h, considera-se que a mesa "virou" (mesmas pessoas
 * ou não — a reserva acabou). Quem chegou na mesa depois desse ponto não conta
 * pra essa reserva.
 */
const WINDOW_HOURS = 3;

function windowEndFor(reservationStart: Date): Date {
  return new Date(reservationStart.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * Formata um Date como string "YYYY-MM-DD HH:mm:ss" no fuso America/Sao_Paulo
 * pra mandar pro MySQL Zig Full (cujos transaction_date são em SP local sem fuso).
 *
 * mysql2 com `timezone:'Z'` enviaria UTC, o que causaria offset de 3h no filtro.
 */
function toSpLocalString(d: Date): string {
  // 'sv-SE' formata como "YYYY-MM-DD HH:mm:ss" naturalmente
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

// ─── Match obs → mesa ──────────────────────────────────────────────────────

function normalizeMesaNum(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.replace(/^0+/, '') || digits || raw.trim();
}

/**
 * Indexa um conjunto de mesas pra lookup O(1) durante a varredura.
 * Aceita exatamente "Mesa: N" e variantes "Mesa: N - <sufixo>" ou "Mesa: N <sufixo>".
 */
function buildMesaMatcher(tables: string[]): (obs: string | null) => string | null {
  const byNum = new Map<string, string>();  // "321" → mesa original (ex.: "321")
  for (const m of tables) byNum.set(normalizeMesaNum(m), m);

  const exactRe   = /^Mesa:\s*(\d+)$/;
  const prefixRe  = /^Mesa:\s*(\d+)(?:\s|$|-)/;

  return (obs) => {
    if (!obs) return null;
    let match = exactRe.exec(obs);
    if (!match) match = prefixRe.exec(obs);
    if (!match) return null;
    const num = normalizeMesaNum(match[1]);
    return byNum.get(num) ?? null;
  };
}

// ─── Query principal ──────────────────────────────────────────────────────

type ZigProdutoRow = RowDataPacket & {
  transaction_id:    string;
  transaction_date:  Date;
  product_id:        string;
  product_sku:       string | null;
  product_name:      string;
  product_category:  string | null;
  unit_value:        number;
  count:             number;
  fractional_amount: number | null;
  fraction_unit:     string | null;
  discount_value:    number;
  type:              string | null;
  employee_name:     string | null;
  bar_id:            string | null;
  bar_name:          string | null;
  obs:               string | null;
  rede_id:           string | null;
  loja_id:           string;
  event_id:          string | null;
  event_date:        Date | null;
  invoice_id:        string | null;
};

function rowToDto(row: ZigProdutoRow): ZigSaidaProduto {
  return {
    transactionId:    row.transaction_id,
    transactionDate:  row.transaction_date instanceof Date
      ? row.transaction_date.toISOString()
      : String(row.transaction_date),
    productId:        row.product_id,
    productSku:       row.product_sku ?? '',
    unitValue:        Number(row.unit_value ?? 0),
    count:            Number(row.count ?? 1),
    fractionalAmount: row.fractional_amount,
    fractionUnit:     row.fraction_unit,
    discountValue:    Number(row.discount_value ?? 0),
    productName:      row.product_name,
    productCategory:  row.product_category ?? '',
    redeId:           row.rede_id ?? '',
    lojaId:           row.loja_id,
    eventId:          row.event_id ?? '',
    eventName:        '',
    eventDate:        row.event_date ? row.event_date.toISOString().slice(0, 10) : '',
    invoiceId:        row.invoice_id,
    employeeName:     row.employee_name ?? '',
    type:             row.type ?? '',
    obs:              row.obs,
    barId:            row.bar_id,
    barName:          row.bar_name,
    isRefunded:       false,
    additions:        [],
  };
}

/**
 * Retorna o faturamento das mesas de uma reserva.
 *
 * @param tablesCsv     CSV de mesas, ex.: "321,322,323"
 * @param date          Data/hora da reserva (fallback de pivot da janela)
 * @param unitSlug      Slug da unidade — resolve loja_id (UUID Zig)
 * @param lojaIdOverride UUID literal (override)
 * @param checkInTime   Se a reserva tem check-in marcado, usa este horário como
 *                      início da janela 3h (mais preciso que o horário marcado).
 *                      Resolve casos onde o cliente chega atrasado pro jantar.
 */
export async function getZigBillingForReservation(
  tablesCsv:       string,
  date:            Date | string,
  unitSlug?:       string | null,
  lojaIdOverride?: string,
  checkInTime?:    Date | string | null,
): Promise<ZigBillingResult> {
  const lojaId = lojaIdOverride || resolveLojaId(unitSlug);

  const tables = tablesCsv.split(',').map((t) => t.trim()).filter(Boolean);
  if (tables.length === 0) throw new Error('[ZIG] A reserva não possui mesas vinculadas.');

  const reservationDate = typeof date === 'string' ? new Date(date) : date;
  const period          = getPeriod(reservationDate);

  // Pivot: hora do check-in se houver, senão hora da reserva.
  // Cliente atrasado é a regra (jantar BR), não exceção.
  const checkIn = checkInTime
    ? (typeof checkInTime === 'string' ? new Date(checkInTime) : checkInTime)
    : null;
  const windowStart = checkIn ?? reservationDate;
  const winEnd      = windowEndFor(windowStart);

  // Filtros em SP local (matching o fuso do MySQL Zig Full).
  const startSp = toSpLocalString(windowStart);
  const endSp   = toSpLocalString(winEnd);
  // ymd da reserva (não do check-in) pra exibição consistente com o painel
  const ymd = toSpLocalString(reservationDate).slice(0, 10);

  const pool = getZigMysqlPool();
  const [rows] = await pool.query<ZigProdutoRow[]>(
    `
    SELECT
      transaction_id, transaction_date, product_id, product_sku,
      product_name, product_category, unit_value, \`count\`,
      fractional_amount, fraction_unit, discount_value, type,
      employee_name, bar_id, bar_name, obs, rede_id, loja_id,
      event_id, event_date, invoice_id
    FROM zig_produtos
    WHERE loja_id = ?
      AND transaction_date >= ?
      AND transaction_date <  ?
      AND obs LIKE 'Mesa:%'
    ORDER BY transaction_date ASC
    `,
    [lojaId, startSp, endSp],
  );

  const matcher = buildMesaMatcher(tables);

  const byTableMap = new Map<string, ZigSaidaProduto[]>();
  for (const t of tables) byTableMap.set(t, []);

  let totalValueCents = 0;

  for (const row of rows) {
    const mesa = matcher(row.obs);
    if (!mesa) continue;
    const tx = rowToDto(row);
    byTableMap.get(mesa)!.push(tx);
    totalValueCents += tx.unitValue * tx.count - (tx.discountValue ?? 0);
  }

  const byTable = tables.map((table) => {
    const txs        = byTableMap.get(table) ?? [];
    const totalCents = txs.reduce(
      (acc, tx) => acc + tx.unitValue * tx.count - (tx.discountValue ?? 0),
      0,
    );
    return { table, totalCents, transactions: txs };
  });

  const totalValueBRL = (totalValueCents / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });

  return {
    tables,
    transactions: byTable.flatMap((b) => b.transactions),
    totalValueCents,
    totalValueBRL,
    byTable,
    date:    ymd,
    period,
    lojaId,
    unitSlug: unitSlug ?? undefined,
  };
}
