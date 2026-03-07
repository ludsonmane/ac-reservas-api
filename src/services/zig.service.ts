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
  date:    string;
  lojaId:  string;
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

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Retorna o faturamento ZIG para as mesas de uma reserva.
 *
 * @param tablesCsv  CSV de mesas (ex.: "321,322,323")
 * @param date       Data da reserva
 * @param unitSlug   Slug da unidade — usado para resolver o lojaId correto no ZIG_LOJA_MAP
 * @param lojaIdOverride  Passa direto um lojaId (ignora mapa)
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

  const d   = typeof date === 'string' ? new Date(date) : date;
  const ymd = d.toISOString().slice(0, 10);

  const allTx = await fetchSaidaProdutos(ymd, ymd, lojaId);

  const byTableMap = new Map<string, ZigSaidaProduto[]>();
  for (const mesa of tables) byTableMap.set(mesa, []);

  let totalValueCents = 0;

  for (const tx of allTx) {
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
    date: ymd,
    lojaId,
    unitSlug: unitSlug ?? undefined,
  };
}
