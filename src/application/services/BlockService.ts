import { prisma } from '../../infrastructure/db/prisma';

export type Period = 'AFTERNOON' | 'NIGHT' | 'ALL_DAY';

const ALLOWED_SLOTS = ['12:00', '12:30', '13:00', '18:00', '18:30', '19:00'];

/** YYYY-MM-DD considerando fuso BR (-03) de forma simples */
function toLocalYmd(d: Date, tzOffsetMin = -180) {
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const br = new Date(utc + tzOffsetMin * 60000);
  const y = br.getFullYear();
  const m = String(br.getMonth() + 1).padStart(2, '0');
  const day = String(br.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function hhmm(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function timeToPeriod(h: number): Period | 'NONE' {
  if (h >= 12 && h <= 17) return 'AFTERNOON';
  if (h >= 18 && h <= 23) return 'NIGHT';
  return 'NONE';
}

export class BlockService {
  static async listByUnitDate(unitId: string, dateYmd: string, areaId?: string | null) {
    return prisma.reservationBlock.findMany({
      where: {
        unitId,
        date: new Date(`${dateYmd}T00:00:00.000-03:00`),
        OR: [{ areaId: null }, { areaId: areaId ?? undefined }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** true => bloqueado para o instante informado */
  static async isBlocked(args: { unitId: string; areaId?: string | null; when: Date }): Promise<boolean> {
    const { unitId, areaId, when } = args;
    const ymd = toLocalYmd(when);
    const time = hhmm(when);
    const hour = when.getHours();
    const periodNow = timeToPeriod(hour);

    const blocks = await prisma.reservationBlock.findMany({
      where: {
        unitId,
        date: new Date(`${ymd}T00:00:00.000-03:00`),
        OR: [{ areaId: null }, { areaId: areaId ?? undefined }],
      },
    });

    for (const b of blocks) {
      if (b.mode === 'PERIOD') {
        if (b.period === 'ALL_DAY') return true;
        if (b.period === 'AFTERNOON' && periodNow === 'AFTERNOON') return true;
        if (b.period === 'NIGHT' && periodNow === 'NIGHT') return true;
      } else if (b.mode === 'SLOTS') {
        const slots: string[] = Array.isArray((b as any).slots) ? (b as any).slots : [];
        const normalized = slots.filter((s) => ALLOWED_SLOTS.includes(s));
        if (normalized.includes(time)) return true;
      }
    }
    return false;
  }
}
