/**
 * src/services/zig.service.ts
 *
 * Integração com a API Manezin (manezin.com.br/api/externo).
 * Busca transações de consumo por mesa e período.
 *
 * Responsabilidades:
 *  - Encapsular as chamadas HTTP ao Manezin
 *  - Resolver o complexo correto por slug da unidade
 *  - Filtrar vendas pelo número de mesa (campo `obs`: "Mesa: XXX")
 *  - Janela de consumo: horário da reserva → +3 horas
 */

import https from 'https';
import http from 'http';

// ─── Configuração ────────────────────────────────────────────────────────────

const MANEZIN_BASE = 'https://manezin.com.br/api/externo';
const MANEZIN_TOKEN = process.env.MANEZIN_TOKEN || process.env.ZIG_TOKEN || '';

/**
 * Mapa slug-da-unidade → complexo Manezin.
 * Complexos disponíveis: BSB, AC, SP
 */
const UNIT_TO_COMPLEXO: Record<string, string> = {
  'mane-bsb': 'BSB',
  'bsb': 'BSB',
  'mane-aguas-claras': 'AC',
  'aguas-claras': 'AC',
  'ac': 'AC',
  'mane-west-plaza-sp': 'SP',
  'sp': 'SP',
};

/**
 * Resolve o complexo Manezin para um slug de unidade.
 */
export function resolveComplexo(unitSlug: string | null | undefined): string {
  if (unitSlug) {
    const normalized = unitSlug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    if (UNIT_TO_COMPLEXO[normalized]) return UNIT_TO_COMPLEXO[normalized];
    if (UNIT_TO_COMPLEXO[unitSlug]) return UNIT_TO_COMPLEXO[unitSlug];

    // Tenta match parcial
    for (const [key, val] of Object.entries(UNIT_TO_COMPLEXO)) {
      if (normalized.includes(key) || key.includes(normalized)) return val;
    }
  }

  throw new Error(
    `[MANEZIN] Nenhum complexo encontrado para a unidade "${unitSlug}". ` +
    `Complexos disponíveis: BSB, AC, SP`,
  );
}

// Mantém compat com imports existentes
export function resolveLojaId(unitSlug: string | null | undefined): string {
  return resolveComplexo(unitSlug);
}

function assertToken() {
  if (!MANEZIN_TOKEN) throw new Error('[MANEZIN] Variável MANEZIN_TOKEN (ou ZIG_TOKEN) não configurada');
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

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
  obs?:              string | null;   // ← "Mesa: XXX"
  barId?:            string | null;
  barName?:          string | null;
  isRefunded?:       boolean;
  additions:         ZigAddition[];
};

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
  lojaId:    string;        // complexo (BSB/AC/SP)
  unitSlug?: string;
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function manezinGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const fullUrl = `${MANEZIN_BASE}${path}`;
    const url     = new URL(fullUrl);
    const lib     = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        Authorization: `Bearer ${MANEZIN_TOKEN}`,
        Accept:        'application/json',
      },
    };

    const req = lib.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`[MANEZIN] HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          } else {
            resolve(parsed as T);
          }
        } catch {
          reject(new Error(`[MANEZIN] JSON parse error: ${raw.slice(0, 300)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`[MANEZIN] Request error: ${e.message}`)));
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error('[MANEZIN] Request timeout'));
    });
    req.end();
  });
}

// ─── Chamadas ao Manezin ────────────────────────────────────────────────────

export async function fetchSaidaProdutos(
  dtinicio: string,
  dtfim:    string,
  complexo: string,
): Promise<ZigSaidaProduto[]> {
  assertToken();

  const all: ZigSaidaProduto[] = [];
  let offset = 0;
  const limit = 10000;

  // Pagina até trazer tudo
  while (true) {
    const path = `/transacoes?data_inicio=${dtinicio}&data_fim=${dtfim}&complexo=${complexo}&limit=${limit}&offset=${offset}`;
    const res = await manezinGet<{ data: any[]; total: number }>(path);
    const items = res?.data ?? [];

    for (const item of items) {
      all.push({
        transactionId:   item.transactionId || item.transaction_id || '',
        transactionDate: item.transactionDate || item.transaction_date || '',
        productId:       item.productId || item.product_id || '',
        productSku:      item.productSku || item.product_sku || '',
        unitValue:       Number(item.unitValue ?? item.unit_value ?? 0),
        count:           Number(item.count ?? item.quantidade ?? 1),
        fractionalAmount: item.fractionalAmount ?? item.fractional_amount ?? null,
        fractionUnit:    item.fractionUnit ?? item.fraction_unit ?? null,
        discountValue:   Number(item.discountValue ?? item.discount_value ?? 0),
        productName:     item.productName || item.product_name || '',
        productCategory: item.productCategory || item.product_category || '',
        redeId:          item.redeId || item.rede_id || '',
        lojaId:          item.lojaId || item.loja_id || '',
        eventId:         item.eventId || item.event_id || '',
        eventName:       item.eventName || item.event_name || '',
        eventDate:       item.eventDate || item.event_date || '',
        invoiceId:       item.invoiceId || item.invoice_id || null,
        employeeName:    item.employeeName || item.employee_name || '',
        type:            item.type || '',
        obs:             item.obs || null,
        barId:           item.barId || item.bar_id || null,
        barName:         item.barName || item.bar_name || null,
        isRefunded:      item.isRefunded ?? item.is_refunded ?? false,
        additions:       item.additions || [],
      });
    }

    if (items.length < limit) break; // Última página
    offset += limit;
  }

  // Filtra estornos
  return all.filter(tx => !tx.isRefunded);
}

// ─── Lógica de match por mesa ─────────────────────────────────────────────────

function normalizeMesa(raw: string): string {
  return raw.replace(/[^0-9]/g, '').replace(/^0+/, '') || raw.trim();
}

function fieldMatchesMesa(field: string | null | undefined, mesaNum: string): boolean {
  if (!field) return false;
  const normalized = normalizeMesa(field);
  if (normalized === mesaNum) return true;
  // "Mesa: 321", "Mesa:321", "mesa 321", "tab-321", "bar_321"
  const regex = new RegExp(`(?:mesa|tab|bar)[:\\s\\-_]*0*${mesaNum}\\b`, 'i');
  if (regex.test(field)) return true;
  // Fallback: número isolado
  const numRegex = new RegExp(`(?<![0-9])0*${mesaNum}(?![0-9])`);
  return numRegex.test(field);
}

function matchTransactionToTable(tx: ZigSaidaProduto, tables: string[]): string | null {
  for (const mesa of tables) {
    const mesaNum = normalizeMesa(mesa);
    if (fieldMatchesMesa(tx.obs, mesaNum))     return mesa;
    if (fieldMatchesMesa(tx.barName, mesaNum)) return mesa;
  }
  return null;
}

// ─── Janela de coleta de consumo ─────────────────────────────────────────────

/**
 * Janela: horário da reserva → horário da reserva + WINDOW_HOURS.
 *
 * Exemplos:
 *   Reserva 12:00 → coleta 12:00–15:00
 *   Reserva 19:00 → coleta 19:00–22:00
 *   Reserva 13:30 → coleta 13:30–16:30
 */
const WINDOW_HOURS = 3;

export type ReservationPeriod = 'AFTERNOON' | 'NIGHT';

const EVENING_CUTOFF_HOUR   = 17;
const EVENING_CUTOFF_MINUTE = 30;

export function getPeriod(date: Date): ReservationPeriod {
  const h = date.getHours();
  const m = date.getMinutes();
  const totalMin = h * 60 + m;
  return totalMin >= EVENING_CUTOFF_HOUR * 60 + EVENING_CUTOFF_MINUTE ? 'NIGHT' : 'AFTERNOON';
}

/**
 * Filtra uma transação pela janela da reserva:
 * desde o horário da reserva até +WINDOW_HOURS horas depois.
 */
function txInWindow(transactionDate: string, reservationDate: Date): boolean {
  try {
    const tx = new Date(transactionDate);
    const windowStart = reservationDate.getTime();
    const windowEnd   = windowStart + WINDOW_HOURS * 60 * 60 * 1000;
    const txTime      = tx.getTime();
    return txTime >= windowStart && txTime <= windowEnd;
  } catch {
    return false;
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Retorna o faturamento para as mesas de uma reserva via API Manezin,
 * filtrado pela janela de consumo: horário da reserva → +3 horas.
 *
 * @param tablesCsv       CSV de mesas (ex.: "321,322,323")
 * @param date            Data/hora da reserva
 * @param unitSlug        Slug da unidade — usado para resolver o complexo
 * @param lojaIdOverride  Override manual do complexo (ignora mapa)
 */
export async function getZigBillingForReservation(
  tablesCsv:       string,
  date:            Date | string,
  unitSlug?:       string | null,
  lojaIdOverride?: string,
): Promise<ZigBillingResult> {
  assertToken();

  const complexo = lojaIdOverride || resolveComplexo(unitSlug);

  const tables = tablesCsv.split(',').map((t) => t.trim()).filter(Boolean);
  if (tables.length === 0) throw new Error('A reserva não possui mesas vinculadas.');

  const d      = typeof date === 'string' ? new Date(date) : date;
  const ymd    = d.toISOString().slice(0, 10);
  const period = getPeriod(d);

  // Calcula o fim da janela (+3h) — se cruzar a meia-noite, busca também o dia seguinte
  const windowEnd = new Date(d.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const windowEndYmd = windowEnd.toISOString().slice(0, 10);
  const dtfim = windowEndYmd > ymd ? windowEndYmd : ymd;

  const allTx = await fetchSaidaProdutos(ymd, dtfim, complexo);

  // Filtra pela janela: horário da reserva → +3h
  const periodTx = allTx.filter((tx) => txInWindow(tx.transactionDate, d));

  // Agrupa por mesa
  const byTableMap = new Map<string, ZigSaidaProduto[]>();
  for (const mesa of tables) byTableMap.set(mesa, []);

  let totalValueCents = 0;

  for (const tx of periodTx) {
    const mesa = matchTransactionToTable(tx, tables);
    if (!mesa) continue;
    byTableMap.get(mesa)!.push(tx);
    totalValueCents += tx.unitValue * tx.count - (tx.discountValue ?? 0);
  }

  const byTable = tables.map((mesa) => {
    const txList     = byTableMap.get(mesa) ?? [];
    const totalCents = txList.reduce(
      (acc, tx) => acc + tx.unitValue * tx.count - (tx.discountValue ?? 0),
      0,
    );
    return { table: mesa, totalCents, transactions: txList };
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
    lojaId:  complexo,
    unitSlug: unitSlug ?? undefined,
  };
}
