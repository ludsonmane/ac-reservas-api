// api/src/infrastructure/db/PrismaReservationRepository.ts
import { prisma } from './prisma';
import { Prisma, GuestRole } from '@prisma/client';
import crypto from 'crypto';
import { ReservationRepository, FindManyParams } from '../../application/ports/ReservationRepository';
import type { GuestInput } from '../../application/ports/ReservationRepository';

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
  return !!d && Number.isFinite(+d!);
}

export class PrismaReservationRepository implements ReservationRepository {
  async create(data: any) {
    const now = new Date();
    const token =
      (global as any).crypto?.randomUUID?.() ??
      crypto.randomBytes(16).toString('hex');

    let reservationCode = await uniqueReservationCode();

    /* 🔒 Consistência: unitId / areaId (opcionais) */
    let resolvedUnitId: string | null = data?.unitId ?? null;
    let resolvedAreaId: string | null = data?.areaId ?? null;
    let resolvedAreaName: string | null = null;

    if (resolvedUnitId) {
      const unit = await prisma.unit.findUnique({ where: { id: String(resolvedUnitId) } });
      if (!unit) {
        const e = new Error('Unidade não encontrada (unitId inválido)');
        (e as any).status = 400;
        throw e;
      }
    }

    if (resolvedAreaId) {
      const area = await prisma.area.findUnique({
        where: { id: String(resolvedAreaId) },
        select: { id: true, name: true, unitId: true },
      });
      if (!area) {
        const e = new Error('Área não encontrada (areaId inválido)');
        (e as any).status = 400;
        throw e;
      }
      if (resolvedUnitId && area.unitId !== resolvedUnitId) {
        const e = new Error('A área informada não pertence à unidade (AREA_UNIT_MISMATCH)');
        (e as any).status = 400;
        throw e;
      }
      if (!resolvedUnitId) resolvedUnitId = area.unitId; // herda da área
      resolvedAreaName = area.name;
    }

    // 🔧 Normaliza payload e garante defaults
    const payload = {
      ...data,

      kids:
        typeof data?.kids === 'number'
          ? data.kids
          : Number.isFinite(Number(data?.kids))
            ? Number(data.kids)
            : 0,

      people:
        typeof data?.people === 'number'
          ? Math.max(1, Math.trunc(data.people))
          : Math.max(1, Number.isFinite(Number(data?.people)) ? Math.trunc(Number(data?.people)) : 1),

      reservationDate:
        data?.reservationDate instanceof Date
          ? data.reservationDate
          : new Date(data?.reservationDate),

      birthdayDate:
        data?.birthdayDate ? new Date(data.birthdayDate) : null,

      // opcionais → null
      unit: data?.unit ?? null,    // legado (nome/slug)
      area: data?.area ?? null,    // legado (string livre)
      notes: data?.notes ?? null,
      email: data?.email ?? null,
      phone: data?.phone ?? null,
      tables: (data as any)?.tables ?? null,
      source: data?.source ?? 'site',

      // UTM
      utm_source: data?.utm_source ?? null,
      utm_medium: data?.utm_medium ?? null,
      utm_campaign: data?.utm_campaign ?? null,
      utm_content: data?.utm_content ?? null,
      utm_term: data?.utm_term ?? null,

      url: data?.url ?? null,
      ref: data?.ref ?? null,

      // Preferenciais (IDs) + denormalização
      unitId: resolvedUnitId ?? null,
      areaId: resolvedAreaId ?? null,
      areaName: resolvedAreaName ?? (data?.area ?? null),
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

  // ✅ unitId ESTRITO (sem legado quando informado) + to inclusivo + AND global
  async findMany({ search, unit, unitId, areaId, from, to, skip, take }: FindManyParams) {
    const safeSkip = Math.max(0, Number(skip) || 0);
    const safeTake = Math.min(100, Math.max(1, Number(take) || 20));
    const q = (search ?? '').toString().trim();

    // Fast-path: busca direta por localizador (6 chars)
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
        tables: true,
          unit: true,       // legado (slug/nome)
          unitId: true,     // novo (ID)
          area: true,       // legado
          areaId: true,     // novo
          areaName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          utm_source: true,
          utm_campaign: true,
        },
      });

      if (!hit) return { items: [], total: 0 };

      // Se veio unitId na query, o hit PRECISA ter o mesmo unitId (sem legado)
      if (unitId && hit.unitId !== unitId) return { items: [], total: 0 };

      // Se veio areaId, precisa bater estritamente
      if (areaId && hit.areaId !== areaId) return { items: [], total: 0 };

      // (Opcional) Se veio 'unit' legado na query, respeita
      if (unit && hit.unit && unit !== hit.unit) return { items: [], total: 0 };

      return { items: [hit as any], total: 1 };
    }

    // Caminho normal: AND global
    const AND: Prisma.ReservationWhereInput[] = [];

    // (1) Search como OR interno
    if (q) {
      AND.push({
        OR: [
          { fullName: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { cpf: { contains: q } },
          { utm_campaign: { contains: q } },
          { reservationCode: { contains: (q as any).toUpperCase?.() || q } },
        ],
      });
    }

    // (2) Filtro por unidade
    if (unitId) {
      // ✅ estrito por unitId quando informado
      AND.push({ unitId });
    } else if (unit) {
      // ✅ legado (apenas se unitId NÃO veio)
      AND.push({ unit });
    }

    // (3) Filtro por área
    if (areaId) AND.push({ areaId });

    // (4) Intervalo de datas (to inclusivo)
    if (isValidDate(from) || isValidDate(to)) {
      const range: Prisma.DateTimeFilter = {};
      if (isValidDate(from)) range.gte = from!;
      if (isValidDate(to)) {
        const end = new Date(to!);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      AND.push({ reservationDate: range });
    }

    const where: Prisma.ReservationWhereInput = AND.length ? { AND } : {};

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
        tables: true,
          reservationType: true,
          unit: true,       // legado
          unitId: true,     // novo
          area: true,       // legado
          areaId: true,     // novo
          areaName: true,   // denormalizado
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
        area: true,        // legado
        areaId: true,      // novo
        areaName: true,    // denormalizado
        reservationDate: true,
        birthdayDate: true,
        phone: true,
        email: true,
        tables: true,
        notes: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        utm_content: true,
        utm_term: true,
        url: true,
        ref: true,
        unit: true,        // legado
        unitId: true,      // novo
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
        area: true,        // legado
        areaId: true,      // novo
        areaName: true,    // denormalizado
        reservationDate: true,
        birthdayDate: true,
        phone: true,
        email: true,
        tables: true,
        notes: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        utm_content: true,
        utm_term: true,
        url: true,
        ref: true,
        unit: true,        // legado
        unitId: true,      // novo
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

  // ✅ Inserir convidados em massa (usa prisma.guest)
  async addGuestsBulk(reservationId: string, guests: GuestInput[]) {
    const exists = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true }
    });
    if (!exists) {
      throw new Error('RESERVATION_NOT_FOUND');
    }

    const seen = new Set<string>();
    const normalized = guests
      .map((g) => {
        const name = (g.name ?? '').trim();
        const email = (g.email ?? '').trim().toLowerCase();
        const role: GuestRole = (g.role ?? 'GUEST') as GuestRole;
        return { reservationId, name, email, role };
      })
      .filter((g) => g.name.length >= 2 && g.email.length >= 5)
      .filter((g) => {
        if (seen.has(g.email)) return false;
        seen.add(g.email);
        return true;
      });

    if (normalized.length === 0) {
      return { created: 0, skipped: guests.length };
    }

    const result = await prisma.guest.createMany({
      data: normalized,
      skipDuplicates: true, // exige UNIQUE(reservationId, email)
    });

    const created = result.count;
    const skipped = guests.length - created;
    return { created, skipped };
  }
}
