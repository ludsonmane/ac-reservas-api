/**
 * src/services/engineBilling.service.ts
 *
 * Consome a API do Notifications Engine (engine.mane.com.vc) para obter, por WABA,
 * o GASTO (custo Meta via pricing_analytics) e o VOLUME de mensagens enviadas num
 * período. Cada WABA representa uma unidade do Mané (slug bsb / ac / sp).
 *
 * Endpoint: GET /api/billing/usage?start=<unix>&end=<unix>  (auth Bearer admin)
 *
 * Env:
 *   ENGINE_BASE_URL    (default https://engine.mane.com.vc)
 *   ENGINE_API_TOKEN   (obrigatório — Bearer token admin do engine)
 */

const ENGINE_BASE_URL_DEFAULT = 'https://engine.mane.com.vc';
const REQUEST_TIMEOUT_MS = 12_000;

export interface EngineDailyUsage {
  date: string;       // 'YYYY-MM-DD'
  cost_usd: number;   // custo USD do dia
  volume: number;     // mensagens do dia
}

export interface EngineWabaUsage {
  waba_id: string;
  slug: string;          // 'bsb' | 'ac' | 'sp'
  phone_id?: string;
  name?: string;
  total_cost: number;    // em USD (Meta)
  total_messages: number;
  currency?: string;
  breakdown?: Record<string, { cost: number; volume: number }>;
  daily?: EngineDailyUsage[]; // custo USD por dia (p/ conversão histórica USD→BRL)
}

export interface EngineUsage {
  period: { start: number; end: number; start_iso?: string; end_iso?: string };
  grand_total_cost: number;
  grand_total_messages: number;
  currency: string;       // normalmente "USD"
  fx?: { rate_usd_brl: number; source?: string; fetched_at?: string };
  wabas: EngineWabaUsage[];
}

function getBaseUrl(): string {
  return (process.env.ENGINE_BASE_URL || ENGINE_BASE_URL_DEFAULT).replace(/\/+$/, '');
}

/**
 * Busca o uso/custo por WABA no engine para o intervalo informado.
 * @param startSec Unix timestamp (segundos) — início do período
 * @param endSec   Unix timestamp (segundos) — fim do período
 */
export async function fetchEngineUsage(startSec: number, endSec: number): Promise<EngineUsage> {
  const token = process.env.ENGINE_API_TOKEN;
  if (!token) {
    throw new Error('[engineBilling] ENGINE_API_TOKEN ausente — configure no .env');
  }

  const url = `${getBaseUrl()}/api/billing/usage?start=${startSec}&end=${endSec}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[engineBilling] HTTP ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as EngineUsage;
    if (!data || !Array.isArray(data.wabas)) {
      throw new Error('[engineBilling] resposta inesperada do engine (sem wabas[])');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normaliza um slug/nome de unidade do Mané para o slug usado pelo engine
 * (bsb | ac | sp). Robusto a variações (mane-bsb, aguas-claras, west-plaza, etc).
 */
export function toEngineSlug(unitSlug?: string | null, unitName?: string | null): string {
  const hay = `${unitSlug || ''} ${unitName || ''}`.toLowerCase();
  if (/bsb|bras[ií]lia/.test(hay)) return 'bsb';
  if (/[áa]guas|claras|\bac\b/.test(hay)) return 'ac';
  if (/\bsp\b|paulo|west[\s-]?plaza/.test(hay)) return 'sp';
  return (unitSlug || '').toLowerCase().trim();
}

// ─── Câmbio USD→BRL histórico (cotação do dia do disparo) ────────────────────

const AWESOME_DAILY_URL = 'https://economia.awesomeapi.com.br/json/daily/USD-BRL';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Cache em memória por intervalo (a cotação de dias passados não muda intraday).
// Importante: a AwesomeAPI grátis tem quota agressiva (429 QuotaExceeded), então
// evitamos re-bater a cada carregamento da tela.
const _dailyFxCache = new Map<string, { at: number; map: Map<string, number> }>();
const DAILY_FX_TTL = 6 * 60 * 60 * 1000; // 6h

/**
 * Busca a cotação USD→BRL (fechamento, bid) por dia no intervalo, via AwesomeAPI.
 * Retorna um Map<'YYYY-MM-DD', rate>. Dias sem pregão (fim de semana/feriado) não
 * aparecem — usar `rateForDay` para fazer carry-back ao último dia útil.
 */
export async function fetchUsdBrlDaily(fromSec: number, endSec: number): Promise<Map<string, number>> {
  const sd = ymd(new Date(fromSec * 1000)).replace(/-/g, '');
  const ed = ymd(new Date(endSec * 1000)).replace(/-/g, '');
  const cacheKey = `${sd}_${ed}`;
  const cached = _dailyFxCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DAILY_FX_TTL) return cached.map;

  const map = new Map<string, number>();
  const days = Math.min(360, Math.max(1, Math.ceil((endSec - fromSec) / 86400) + 3));
  const url = `${AWESOME_DAILY_URL}/${days}?start_date=${sd}&end_date=${ed}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()) as Array<{ timestamp?: string; bid?: string }>;
    for (const it of Array.isArray(arr) ? arr : []) {
      const ts = parseInt(String(it.timestamp), 10);
      const bid = parseFloat(String(it.bid));
      if (!ts || !(bid > 0)) continue;
      const day = ymd(new Date(ts * 1000));
      if (!map.has(day)) map.set(day, bid); // 1ª ocorrência (mais recente) por dia
    }
  } catch {
    /* sem histórico — quem chama faz fallback */
  } finally {
    clearTimeout(timer);
  }

  // Só cacheia resultados não-vazios (não queremos fixar um 429 por 6h).
  if (map.size > 0) _dailyFxCache.set(cacheKey, { at: Date.now(), map });
  return map;
}

/**
 * Cotação do dia `dayISO`. Se não houver pregão nesse dia, faz carry-back para o
 * dia útil anterior mais próximo; se não houver anterior, usa o próximo; por fim,
 * cai no `fallback`.
 */
export function rateForDay(
  dailyMap: Map<string, number>,
  dayISO: string,
  fallback: number
): number {
  const direct = dailyMap.get(dayISO);
  if (direct) return direct;
  const days = [...dailyMap.keys()].sort();
  let prev: string | null = null;
  for (const d of days) {
    if (d <= dayISO) prev = d;
    else break;
  }
  if (prev) return dailyMap.get(prev)!;
  if (days.length) return dailyMap.get(days[0])!;
  return fallback;
}

/**
 * Converte a série diária de USD de uma WABA para BRL em CENTAVOS, aplicando a
 * cotação de cada dia (carry-back para dias sem pregão). Se a WABA não tiver série
 * diária, retorna null (o chamador faz fallback pela cotação única).
 */
export function dailyUsdToBrlCents(
  daily: EngineDailyUsage[] | undefined,
  dailyMap: Map<string, number>,
  fallbackRate: number
): number | null {
  if (!daily || daily.length === 0) return null;
  let brl = 0;
  for (const d of daily) {
    const rate = rateForDay(dailyMap, d.date, fallbackRate);
    brl += (Number(d.cost_usd) || 0) * rate;
  }
  return Math.round(brl * 100);
}
