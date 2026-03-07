/**
 * src/services/zig.service.ts
 *
 * Integração com a API ZIG (zigcore.com.br).
 *
 * Responsabilidades:
 *  - Encapsular as chamadas HTTP à ZIG
 *  - Resolver o lojaId correto por unidade (multi-loja)
 *  - Filtrar vendas pelo número de mesa (campo `obs` ou `barName`)
 */

import https from 'https';
import http from 'http';

// ─── Configuração ────────────────────────────────────────────────────────────

const ZIG_BASE =
  (process.env.ZIG_BASE_URL || 'https://api.zigcore.com.br/integration').replace(/\/+$/, '');

const ZIG_TOKEN = process.env.ZIG_TOKEN || '';

/**
 * Mapa slug-da-unidade → lojaId ZIG.
 *
 * Configure no Railway como JSON na variável ZIG_LOJA_MAP:
 *   ZIG_LOJA_MAP={"bsb":"111","aguas-claras":"222"}
 *
 * Os slugs devem bater com os slugs cadastrados na tabela Unit do banco.
 * Consulte os lojaIds via:
 *   GET https://api.zigcore.com.br/integration/erp/lojas?rede={sua-rede}
 */
function parseLojaMap(): Record<string, string> {
  const raw = process.env.ZIG_LOJA_MAP || '{}';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, string>;
    console.warn('[ZIG] ZIG_LOJA_MAP inválido — usando objeto vazio');
    return {};
  } catch {
    console.warn('[ZIG] ZIG_LOJA_MAP não é JSON válido:', raw);
    return {};
  }
}

/**
 * Resolve o lojaId ZIG para um slug de unidade.
 * Normaliza o slug para lowercase sem acentos antes de buscar no mapa.
 *
 * Ex.: slug "aguas-claras" → "222"
 *      slug "bsb"          → "111"
 */
export function resolveLojaId(unitSlug: string | null | undefined): string {
  const map = parseLojaMap();

  if (unitSlug) {
    // tentativa 1: normalizado (lowercase, sem acento, espaços → hífen)
    const normalized = unitSlug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    if (map[normalized])  return map[normalized];
    if (map[unitSlug])    return map[unitSlug]; // tentativa 2: slug original
  }

  // fallback: se só há uma loja configurada, usa ela independente da unidade
  const values = Object.values(map);
  if (values.length === 1) return values[0];

  throw new Error(
    `[ZIG] Nenhum lojaId encontrado para a unidade "${unitSlug}". ` +
    `Configure ZIG_LOJA_MAP. Mapa atual: ${JSON.stringify(map)}`,
  );
}

function assertToken() {
  if (!ZIG_TOKEN) throw new Error('[ZIG] Variável ZIG_TOKEN não configurada');
}

// ─── Tipos da API ZIG ────────────────────────────────────────────────────────

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
  eventDate?:        string;
  invoiceId?:        string | null;
  employeeName?:     string;
  type?:             string;
  obs?:              string | null;   // ← observação da venda (pode conter número da mesa)
  barId?:            string | null;   // ← UUID do bar/tab
  barName?:          string | null;   // ← nome do bar/tab (também pode ter a mesa)
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
  date:     string;
  period:   ReservationPeriod;  // AFTERNOON (almoço) ou NIGHT (jantar)
  lojaId:   string;
  unitSlug?: string;
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function zigGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const fullUrl = `${ZIG_BASE}${path}`;
    const url     = new URL(fullUrl);
    const lib     = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        Authorization: ZIG_TOKEN,
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
            reject(new Error(`[ZIG] HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          } else {
            resolve(parsed as T);
          }
        } catch {
          reject(new Error(`[ZIG] JSON parse error: ${raw.slice(0, 300)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`[ZIG] Request error: ${e.message}`)));
    req.setTimeout(15_000, () => {
      req.destroy();
      reject(new Error('[ZIG] Request timeout'));
    });
    req.end();
  });
}

// ─── Chamadas à ZIG ──────────────────────────────────────────────────────────

export async function fetchSaidaProdutos(
  dtinicio: string,
  dtfim:    string,
  lojaId:   string,
): Promise<ZigSaidaProduto[]> {
  assertToken();
  const path = `/erp/saida-produtos?dtinicio=${dtinicio}&dtfim=${dtfim}&loja=${lojaId}`;
  return zigGet<ZigSaidaProduto[]>(path);
}

// ─── Lógica de match por mesa ─────────────────────────────────────────────────

function normalizeMesa(raw: string): string {
  return raw.replace(/[^0-9]/g, '').replace(/^0+/, '') || raw.trim();
}

function fieldMatchesMesa(field: string | null | undefined, mesaNum: string): boolean {
  if (!field) return false;
  const normalized = normalizeMesa(field);
  if (normalized === mesaNum) return true;
  const regex    = new RegExp(`(?:mesa|tab|bar)[\\s\\-_]*0*${mesaNum}\\b`, 'i');
  if (regex.test(field)) return true;
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

// ─── Período da reserva ──────────────────────────────────────────────────────

/**
 * Cortes de período:
 *   AFTERNOON (almoço) → reserva antes das 17:30 → transações ZIG entre 12:00 e 15:00
 *   NIGHT     (jantar) → reserva 17:30 em diante  → transações ZIG entre 17:30 e 01:00 (dia seguinte)
 */
const EVENING_CUTOFF_HOUR   = 17;
const EVENING_CUTOFF_MINUTE = 30;

export type ReservationPeriod = 'AFTERNOON' | 'NIGHT';

export function getPeriod(date: Date): ReservationPeriod {
  const h = date.getHours();
  const m = date.getMinutes();
  const totalMin = h * 60 + m;
  return totalMin >= EVENING_CUTOFF_HOUR * 60 + EVENING_CUTOFF_MINUTE ? 'NIGHT' : 'AFTERNOON';
}

/**
 * Filtra uma transação ZIG pelo período da reserva.
 *
 * AFTERNOON: 12:00–15:00 (mesmo dia)
 * NIGHT:     17:30–23:59 (mesmo dia) + 00:00–01:00 (dia seguinte)
 *
 * Para o jantar que vai até 01:00, buscamos saída-produtos em dois dias
 * (dia da reserva + dia seguinte) e filtramos pelo horário.
 */
function txInPeriod(transactionDate: string, reservationYmd: string, period: ReservationPeriod): boolean {
  try {
    const tx = new Date(transactionDate);
    const txYmd = tx.toISOString().slice(0, 10);
    const txMin = tx.getHours() * 60 + tx.getMinutes();

    if (period === 'AFTERNOON') {
      // só mesmo dia, entre 12:00 e 15:00
      return txYmd === reservationYmd && txMin >= 12 * 60 && txMin <= 15 * 60;
    }

    // NIGHT: mesmo dia 17:30–23:59 OU dia seguinte 00:00–01:00
    const nextDay = new Date(reservationYmd + 'T00:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const nextYmd = nextDay.toISOString().slice(0, 10);

    if (txYmd === reservationYmd) {
      return txMin >= 17 * 60 + 30; // 17:30 em diante
    }
    if (txYmd === nextYmd) {
      return txMin <= 1 * 60; // até 01:00 do dia seguinte
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Retorna o faturamento ZIG para as mesas de uma reserva,
 * filtrado pelo PERÍODO da reserva (almoço ou jantar).
 *
 * Corte de período (mesmo que areas.service.ts):
 *   AFTERNOON → reserva antes das 17:30 → filtra transações ZIG entre 12:00 e 17:29
 *   NIGHT     → reserva a partir das 17:30 → filtra transações ZIG entre 17:30 e 23:59
 *
 * @param tablesCsv       CSV de mesas (ex.: "321,322,323")
 * @param date            Data/hora da reserva
 * @param unitSlug        Slug da unidade — usado para resolver o lojaId no ZIG_LOJA_MAP
 * @param lojaIdOverride  Override manual do lojaId (ignora mapa)
 */
export async function getZigBillingForReservation(
  tablesCsv:       string,
  date:            Date | string,
  unitSlug?:       string | null,
  lojaIdOverride?: string,
): Promise<ZigBillingResult> {
  assertToken();

  const lojaId = lojaIdOverride || resolveLojaId(unitSlug);

  const tables = tablesCsv.split(',').map((t) => t.trim()).filter(Boolean);
  if (tables.length === 0) throw new Error('A reserva não possui mesas vinculadas.');

  const d      = typeof date === 'string' ? new Date(date) : date;
  const ymd    = d.toISOString().slice(0, 10);
  const period = getPeriod(d);
  const bounds = periodBounds(period);

  // Para jantar, busca também o dia seguinte (transações até 01:00)
  const dtfim = period === 'NIGHT'
    ? (() => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd.toISOString().slice(0, 10); })()
    : ymd;

  const allTx = await fetchSaidaProdutos(ymd, dtfim, lojaId);

  // Filtra por período (almoço: 12:00–15:00 / jantar: 17:30–01:00 dia seguinte)
  const periodTx = allTx.filter((tx) => txInPeriod(tx.transactionDate, ymd, period));

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
    lojaId,
    unitSlug: unitSlug ?? undefined,
  };
}
