import dayjs from 'dayjs';
import { prisma } from '../../infrastructure/db/client';
import { ReservationStatus } from '@prisma/client';

export type AreaPublicDTO = {
  id: string;
  name: string;
  capacityAfternoon?: number | null;
  capacityNight?: number | null;
  photoUrl?: string | null;
  isActive: boolean;
  /** capacidade restante (diária ou do período, dependendo se veio `timeHHmm`) */
  remaining?: number;
  available?: number;     // alias de remaining
  isAvailable?: boolean;  // > 0
};

/* ---------------- Helpers de data/tempo ---------------- */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function at(d: Date, hh: number, mm: number, ss = 0, ms = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, ms);
}

/** 17:30 → corte do período da NOITE */
const EVENING_CUTOFF_MIN = 17 * 60 + 30; // 17:30

/** HH:mm válido (ex.: 09:05, 17:30) */
function isValidHHmm(input?: string) {
  if (!input) return false;
  return /^\d{2}:\d{2}$/.test(input);
}

/** Força janelas do negócio (tarde/noite). < 12:00 cai em AFTERNOON. */
function clampToBusinessWindow(hhmm: string): 'AFTERNOON' | 'NIGHT' {
  const [hh, mm] = hhmm.split(':').map(Number);
  const mins = (hh || 0) * 60 + (mm || 0);
  if (mins < 12 * 60) return 'AFTERNOON';
  return mins >= EVENING_CUTOFF_MIN ? 'NIGHT' : 'AFTERNOON';
}

/** Determina período a partir de HH:mm (com clamp para janela de negócio) */
function getPeriodFromHM(hhmm: string) {
  return clampToBusinessWindow(hhmm);
}

/** Janela [from,to] do período na data base */
function periodWindow(dt: Date, hhmm: string) {
  const period = getPeriodFromHM(hhmm);
  if (period === 'NIGHT') {
    return { from: at(dt, 17, 30), to: endOfDay(dt), period };
  }
  return { from: at(dt, 12, 0), to: at(dt, 17, 29, 59, 999), period };
}

export const areasService = {
  /**
   * Lista áreas ativas de uma unidade.
   * - Se `dateISO` vier, soma (people + kids).
   * - Se TAMBÉM vier `timeHHmm`, usa janela do PERÍODO (tarde/noite) e
   *   aplica a capacidade específica do período (capacityAfternoon / capacityNight).
   * - Sem `timeHHmm` → capacidade DIÁRIA = (capacityAfternoon ?? 0) + (capacityNight ?? 0).
   */
  async listByUnitPublic(
    unitId: string,
    dateISO?: string,
    timeHHmm?: string
  ): Promise<AreaPublicDTO[]> {
    if (!unitId) return [];

    // carrega áreas ativas com os campos necessários (sem 'capacity')
    const areas = await prisma.area.findMany({
      where: { unitId, isActive: true },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        capacityAfternoon: true,
        capacityNight: true, // nome correto
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // Sem data → devolve apenas dados “estáticos”
    if (!dateISO) {
      return areas;
    }

    const parsed = dayjs(dateISO, 'YYYY-MM-DD', true);
    const base = parsed.isValid() ? parsed.toDate() : new Date();

    // Se veio horário, calculamos por PERÍODO; caso contrário, por DIA inteiro
    if (timeHHmm) {
      // Blindagem: se HH:mm inválido, normaliza para 12:00 (início da tarde)
      const safeTime = isValidHHmm(timeHHmm) ? timeHHmm : '12:00';

      const { from, to, period } = periodWindow(base, safeTime);

      // soma (people+kids) por área no período
      const grouped = await prisma.reservation.groupBy({
        by: ['areaId'],
        where: {
          areaId: { not: null },
          reservationDate: { gte: from, lte: to },
          status: { in: [ReservationStatus.AWAITING_CHECKIN, ReservationStatus.CHECKED_IN] },
        },
        _sum: { people: true, kids: true },
      });

      const usedMap = new Map<string, number>();
      for (const g of grouped) {
        const used = (g._sum.people ?? 0) + (g._sum.kids ?? 0);
        if (g.areaId) usedMap.set(g.areaId, used);
      }

      return areas.map((a) => {
        const periodCap =
          period === 'AFTERNOON'
            ? (a.capacityAfternoon ?? 0)
            : (a.capacityNight ?? 0);
        const used = usedMap.get(a.id) ?? 0;
        const available = Math.max(0, periodCap - used);
        return {
          ...a,
          remaining: available,
          available,
          isAvailable: available > 0,
        };
      });
    }

    // Sem timeHHmm → considerar o DIA inteiro
    const from = startOfDay(base);
    const to = endOfDay(base);

    const grouped = await prisma.reservation.groupBy({
      by: ['areaId'],
      where: {
        areaId: { not: null },
        reservationDate: { gte: from, lte: to },
        status: { in: [ReservationStatus.AWAITING_CHECKIN, ReservationStatus.CHECKED_IN] },
      },
      _sum: { people: true, kids: true },
    });

    const usedMap = new Map<string, number>();
    for (const g of grouped) {
      const used = (g._sum.people ?? 0) + (g._sum.kids ?? 0);
      if (g.areaId) usedMap.set(g.areaId, used);
    }

    return areas.map((a) => {
      // capacidade "diária" = soma das capacidades dos dois períodos
      const dayCap = (a.capacityAfternoon ?? 0) + (a.capacityNight ?? 0);
      const used = usedMap.get(a.id) ?? 0;
      const available = Math.max(0, dayCap - used);
      return {
        ...a,
        remaining: available,
        available,
        isAvailable: available > 0,
      };
    });
  },
};
