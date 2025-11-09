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

  // extras pro front
  description?: string | null;
  iconEmoji?: string | null;

  remaining?: number;
  available?: number;
  isAvailable?: boolean;
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
const EVENING_CUTOFF_MIN = 17 * 60 + 30;

/** HH:mm válido (ex.: 09:05, 17:30) */
function isValidHHmm(input?: string) {
  if (!input) return false;
  return /^\d{2}:\d{2}$/.test(input);
}

/** Janela de negócio */
function clampToBusinessWindow(hhmm: string): 'AFTERNOON' | 'NIGHT' {
  const [hh, mm] = hhmm.split(':').map(Number);
  const mins = (hh || 0) * 60 + (mm || 0);
  if (mins < 12 * 60) return 'AFTERNOON';
  return mins >= EVENING_CUTOFF_MIN ? 'NIGHT' : 'AFTERNOON';
}
function getPeriodFromHM(hhmm: string) {
  return clampToBusinessWindow(hhmm);
}
function periodWindow(dt: Date, hhmm: string) {
  const period = getPeriodFromHM(hhmm);
  if (period === 'NIGHT') {
    return { from: at(dt, 17, 30), to: endOfDay(dt), period };
  }
  return { from: at(dt, 12, 0), to: at(dt, 17, 29, 59, 999), period };
}

/* ---------------- Foto: normalização ---------------- */
function normalizePhotoUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  // absoluta (http/https) ou data URI
  if (/^(https?:)?\/\//i.test(v) || v.startsWith('data:')) return v;

  // prefixo configurável (API)
  const base =
    process.env.PUBLIC_IMAGES_BASE ||
    process.env.CDN_BASE_URL ||
    '';

  if (!base) {
    // devolve relativo mesmo
    return v.startsWith('/') ? v : `/${v}`;
  }

  const b = base.replace(/\/+$/, '');
  const p = v.replace(/^\/+/, '');
  return `${b}/${p}`;
}

export const areasService = {
  /**
   * Lista áreas ativas de uma unidade.
   * - Se `dateISO` vier, soma (people + kids).
   * - Se vier também `timeHHmm`, usa janela do PERÍODO (tarde/noite) e
   *   aplica a capacidade específica (capacityAfternoon / capacityNight).
   * - Sem `timeHHmm` → capacidade diária = (capacityAfternoon ?? 0) + (capacityNight ?? 0).
   */
  async listByUnitPublic(
    unitId: string,
    dateISO?: string,
    timeHHmm?: string
  ): Promise<AreaPublicDTO[]> {
    if (!unitId) return [];

    // ⚠️ somente campos existentes no modelo
    const areas = await prisma.area.findMany({
      where: { unitId, isActive: true },
      select: {
        id: true,
        name: true,
        photoUrl: true,              // existe
        capacityAfternoon: true,
        capacityNight: true,
        isActive: true,
        description: true,           // existe
        iconEmoji: true,             // existe
      },
      orderBy: { name: 'asc' },
    });

    // normaliza a foto
    const withResolvedPhoto: AreaPublicDTO[] = areas.map((a) => ({
      ...a,
      photoUrl: normalizePhotoUrl(a.photoUrl),
    }));

    // Sem data → “estático”
    if (!dateISO) {
      return withResolvedPhoto;
    }

    const parsed = dayjs(dateISO, 'YYYY-MM-DD', true);
    const base = parsed.isValid() ? parsed.toDate() : new Date();

    // Período (timeHHmm)
    if (timeHHmm) {
      const safeTime = isValidHHmm(timeHHmm) ? timeHHmm : '12:00';
      const { from, to, period } = periodWindow(base, safeTime);

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

      return withResolvedPhoto.map((a) => {
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

    // Dia inteiro
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

    return withResolvedPhoto.map((a) => {
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
