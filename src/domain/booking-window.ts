/**
 * Regra de janela de reservas (pública) — calculada em BRT (UTC-3, sem DST).
 *
 *   Agora (BRT) ∈ [00:00, 15:00] → só pode reservar ≥ jantar do MESMO dia (17:30+)
 *   Agora (BRT) ∈ [15:01, 23:59] → só pode reservar ≥ almoço do DIA SEGUINTE (12:00+)
 *
 * Efeitos:
 *   - Almoço do próprio dia nunca é reservável.
 *   - Jantar do próprio dia fecha às 15:00.
 *
 * O servidor roda em UTC; por isso fazemos shift explícito pra calcular
 * o wall-clock brasileiro antes de aplicar a regra.
 */

export type BookingPeriod = 'AFTERNOON' | 'NIGHT';

const BRT_OFFSET_MS      = -3 * 60 * 60 * 1000;  // UTC-3
const LUNCH_CLOSE_MINUTE = 15 * 60;              // 15:00 BRT — fim da janela diurna
const EVENING_START_HH   = 17;
const EVENING_START_MM   = 30;
const LUNCH_START_HH     = 12;
const LUNCH_START_MM     = 0;

export interface EarliestBookable {
  date:   Date;
  period: BookingPeriod;
  /** Mensagem humana — útil pra retornar ao cliente */
  reason: string;
}

/** Monta um Date absoluto a partir de wall clock BRT (BRT + 3h = UTC). */
function brtAt(year: number, month: number, day: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(year, month, day, hh + 3, mm, 0, 0));
}

export function getEarliestBookable(now: Date = new Date()): EarliestBookable {
  const brt  = new Date(now.getTime() + BRT_OFFSET_MS);
  const y    = brt.getUTCFullYear();
  const m    = brt.getUTCMonth();
  const d    = brt.getUTCDate();
  const mins = brt.getUTCHours() * 60 + brt.getUTCMinutes();

  if (mins <= LUNCH_CLOSE_MINUTE) {
    return {
      date:   brtAt(y, m, d, EVENING_START_HH, EVENING_START_MM),
      period: 'NIGHT',
      reason: 'Reservas para o almoço do mesmo dia estão encerradas. Reserve para o jantar ou próximos dias.',
    };
  }

  return {
    date:   brtAt(y, m, d + 1, LUNCH_START_HH, LUNCH_START_MM),
    period: 'AFTERNOON',
    reason: 'Reservas para o jantar de hoje estão encerradas. Reserve para o almoço de amanhã ou próximos dias.',
  };
}

/** True se a reserva solicitada cai dentro da janela permitida. */
export function isBookableNow(reservationDate: Date, now: Date = new Date()): boolean {
  return reservationDate.getTime() >= getEarliestBookable(now).date.getTime();
}

/**
 * Retrocompat: mantém a assinatura da função antiga usada em outros trechos.
 * @deprecated prefira getEarliestBookable().date
 */
export function getMinReservationDate(now: Date = new Date()): Date {
  return getEarliestBookable(now).date;
}
