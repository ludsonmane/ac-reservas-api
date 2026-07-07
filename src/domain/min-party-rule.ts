/**
 * Mínimo de pessoas por horário — regra da unidade Águas Claras.
 *
 * Janelas (wall-clock BRT, UTC-3):
 *   Sexta  ≥ 18:00            → mínimo 8 pessoas
 *   Sábado < 18:00            → mínimo 8 pessoas
 *   Domingo 11:00–16:00       → mínimo 8 pessoas
 *
 * Fora dessas janelas (ou em outras unidades) não há mínimo especial.
 */

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3, sem DST

export const LARGE_GROUP_MIN = 8;

export const LARGE_GROUP_MESSAGE =
  'Neste horário (sexta à noite, sábado durante o dia e domingo no almoço), ' +
  `a unidade Águas Claras só aceita reservas a partir de ${LARGE_GROUP_MIN} pessoas.`;

function isAguasClaras(unitName?: string | null): boolean {
  return String(unitName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('aguas claras');
}

/** Mínimo de pessoas (adultos + crianças) exigido para o horário/unidade. */
export function getMinPeople(reservationDate: Date, unitName?: string | null): number {
  if (!isAguasClaras(unitName)) return 1;

  const brt  = new Date(reservationDate.getTime() + BRT_OFFSET_MS);
  const dow  = brt.getUTCDay(); // 0=dom ... 5=sex, 6=sáb
  const mins = brt.getUTCHours() * 60 + brt.getUTCMinutes();

  if (dow === 5 && mins >= 18 * 60) return LARGE_GROUP_MIN;                    // sexta à noite
  if (dow === 6 && mins < 18 * 60) return LARGE_GROUP_MIN;                     // sábado de dia
  if (dow === 0 && mins >= 11 * 60 && mins < 16 * 60) return LARGE_GROUP_MIN;  // domingo almoço

  return 1;
}
