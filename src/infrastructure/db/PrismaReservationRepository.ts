// api/src/infrastructure/db/PrismaReservationRepository.ts
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { ReservationRepository, FindManyParams } from '../../application/ports/ReservationRepository';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 p/ evitar confusão
function genCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

async function uniqueReservationCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = genCode(6);
    const hit = await prisma.reservation.findUnique({
      where: { reservationCode: code },
      select: { id: true },
    });
    if (!hit) return code;
  }
  throw new Error('Falha ao gerar reservationCode único após várias tentativas');
}

function isValidDate(d?: Date) {
  return !!d && Number.isFinite(+d);
}

export class PrismaReservationRepository implements ReservationRepository {
  async create(data: any) {
    const now = new Date();
    const token =
      (global as any).crypto?.randomUUID?.() ??
      crypto.randomBytes(16).toString('hex');

    let reservationCode = await uniqueReservationCode();

    // 🔧 Normaliza payload e garante defaults
    const payload = {
      ...data,
      kids:
        typeof data?.kids === 'number'
          ? data.kids
          : Number.isFinite(Number(data?.kids))
            ? Number(data.kids)
            : 0,

      // normaliza opcionais para null (conforme schema)
      unit: data?.unit ?? null,
      area: data?.area ?? null,
      notes: data?.notes ?? null,
      email: data?.email ?? null,
      phone: data?.phone ?? null,
      source: data?.source ?? 'site',

      // somente utm_* (se não vierem, ficam null)
      utm_source: data?.utm_source ?? null,
      utm_medium: data?.utm_medium ?? null,
      utm_campaign: data?.utm_campaign ?? null,
      utm_content: data?.utm_content ?? null,
      utm_term: data?.utm_term ?? null,

      url: data?.url ?? null,
      ref: data?.ref ?? null,
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return (await prisma.reservation.create({
          data: {
            status: 'AWAITING_CHECKIN',
            qrToken: token,
            qrExpiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 48), // 48h
            reservationCode,
            ...payload,
          },
        })) as any;
      } catch (e: any) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          String(e.meta?.target || '').includes('reservationCode')
        ) {
          reservationCode = await uniqueReservationCode();
          continue;
        }
        throw e;
      }
    }

    throw new Error('Não foi possível criar a reserva com um reservationCode único');
  }

  async findMany({ search, unit, from, to, skip, take }: FindManyParams) {
    const safeSkip = Math.max(0, Number(skip) || 0);
    const safeTake = Math.min(100, Math.max(1, Number(take) || 20));
    const q = (search ?? '').toString().trim();

    // Busca direta por localizador (6 chars)
    if (q && /^[A-Z0-9]{6}$/i.test(q)) {
      const code = q.toUpperCase();
      const hit = await prisma.reservation.findUnique({
        where: { reservationCode: code },
        select: {
          id: true,
          reservationCode: true,
          fullName: true,
          cpf: true,
          people: true,
          kids: true,
          reservationDate: true,
          birthdayDate: true,
          phone: true,
          email: true,
          unit: true,
          area: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          utm_source: true,
          utm_campaign: true,
        },
      });
      if (!hit) return { items: [], total: 0 };
      if (unit && hit.unit && unit !== hit.unit) return { items: [], total: 0 };
      return { items: [hit as any], total: 1 };
    }

    const where: Prisma.ReservationWhereInput = {};

    if (q) {
      where.OR = [
        { fullName: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { cpf: { contains: q } },
        { utm_campaign: { contains: q } },
        { reservationCode: { contains: q.toUpperCase?.() || q } },
      ];
    }

    if (unit) where.unit = unit;

    if (isValidDate(from) || isValidDate(to)) {
      where.reservationDate = {};
      if (isValidDate(from)) where.reservationDate.gte = from!;
      if (isValidDate(to)) where.reservationDate.lte = to!;
    }

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: safeSkip,
        take: safeTake,
        select: {
          id: true,
          reservationCode: true,
          fullName: true,
          cpf: true,
          people: true,
          kids: true,
          reservationDate: true,
          birthdayDate: true,
          phone: true,
          email: true,
          unit: true,
          area: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          utm_source: true,
          utm_campaign: true,
        },
      }),
      prisma.reservation.count({ where }),
    ]);

    return { items: items as any, total };
  }

  async findById(id: string) {
    return (await prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        reservationCode: true,
        fullName: true,
        cpf: true,
        people: true,
        kids: true,
        area: true,
        reservationDate: true,
        birthdayDate: true,
        phone: true,
        email: true,
        notes: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        utm_content: true,
        utm_term: true,
        url: true,
        ref: true,
        unit: true,
        source: true,
        status: true,
        qrToken: true,
        qrExpiresAt: true,
        checkedInAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })) as any;
  }

  async update(id: string, data: any) {
    return (await prisma.reservation.update({
      where: { id },
      data,
      select: {
        id: true,
        reservationCode: true,
        fullName: true,
        cpf: true,
        people: true,
        kids: true,
        area: true,
        reservationDate: true,
        birthdayDate: true,
        phone: true,
        email: true,
        notes: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        utm_content: true,
        utm_term: true,
        url: true,
        ref: true,
        unit: true,
        source: true,
        status: true,
        qrToken: true,
        qrExpiresAt: true,
        checkedInAt: true,
        createdAt: true,
        updatedAt: true
      },
    })) as any;
  }

  async delete(id: string) {
    await prisma.reservation.delete({ where: { id } });
  }
}
