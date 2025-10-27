// src/infrastructure/http/routes/reservations.public.routes.ts
import { Router } from 'express';
import dayjs from 'dayjs';
import { prisma } from '../../db/client';
import { areasService } from '../../../modules/areas/areas.service';

const router = Router();

/* =============================================================================
   Helpers
============================================================================= */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function at(d: Date, hh: number, mm: number, ss = 0, ms = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, ms);
}
const EVENING_CUTOFF_MIN = 17 * 60 + 30; // 17:30

// Retorna 'AFTERNOON' ou 'NIGHT'
function getPeriodFromDate(dt: Date): 'AFTERNOON' | 'NIGHT' {
  const mins = dt.getHours() * 60 + dt.getMinutes();
  if (mins < 12 * 60) return 'AFTERNOON';
  return mins >= EVENING_CUTOFF_MIN ? 'NIGHT' : 'AFTERNOON';
}
function periodWindow(dt: Date) {
  if (getPeriodFromDate(dt) === 'NIGHT') {
    // noite: 17:30 → 23:59:59.999
    return { from: at(dt, 17, 30), to: endOfDay(dt) };
  }
  // tarde: 12:00 → 17:29:59.999
  return { from: at(dt, 12, 0), to: at(dt, 17, 29, 59, 999) };
}

function genCode6() {
  const base = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
  let out = '';
  for (let i = 0; i < 6; i++) out += base[Math.floor(Math.random() * base.length)];
  return out;
}
async function generateUniqueReservationCode() {
  for (let i = 0; i < 8; i++) {
    const code = genCode6();
    const exists = await prisma.reservation.findUnique({
      where: { reservationCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return genCode6();
}
function cryptoRandom() {
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) {
    const buf = new Uint8Array(16);
    g.crypto.getRandomValues(buf);
    return Buffer.from(buf).toString('hex');
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

/* =============================================================================
   GET /v1/reservations/public/availability
   -> Áreas com disponibilidade por unidade/data (e opcionalmente horário)
   Query:
   - unitId: string (obrigatório)
   - date:   YYYY-MM-DD (opcional)
   - time:   HH:mm      (opcional — se vier, calcula por período)
============================================================================= */
router.get('/availability', async (req, res, next) => {
  try {
    const unitId = String(req.query.unitId || '').trim();
    const date = String(req.query.date || '').trim();
    const time = String(req.query.time || '').trim();

    if (!unitId) {
      return res.status(400).json({ error: { message: 'unitId é obrigatório' } });
    }

    const items = await areasService.listByUnitPublic(unitId, date || undefined, time || undefined);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/* =============================================================================
   POST /v1/reservations/public
   Criação pública de reserva com validação de capacidade por PERÍODO
============================================================================= */
/**
 * Body:
 * {
 *   fullName, cpf?, people, kids?, reservationDate (ISO), birthdayDate?,
 *   email?, phone?, notes?,
 *   unitId, areaId,
 *   utm_*..., url?, ref?, source?
 * }
 */
router.post('/', async (req, res) => {
  try {
    const {
      fullName,
      cpf,
      people,
      kids = 0,
      reservationDate,
      birthdayDate,
      email,
      phone,
      notes,
      unitId,
      areaId,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      url,
      ref,
      source,
    } = req.body || {};

    // validações
    if (!fullName || String(fullName).trim().length < 3) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Informe o nome completo.' } });
    }
    const peopleNum = Number(people ?? 0);
    const kidsNum = Number(kids ?? 0);
    if (!peopleNum || peopleNum < 1) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Quantidade de pessoas inválida.' } });
    }
    if (!unitId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'unitId é obrigatório.' } });
    }
    if (!areaId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'areaId é obrigatório.' } });
    }
    if (!reservationDate || !dayjs(reservationDate).isValid()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'reservationDate inválido.' } });
    }

    // checa unidade/área
    const [unit, area] = await Promise.all([
      prisma.unit.findUnique({
        where: { id: String(unitId) },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.area.findUnique({
        where: { id: String(areaId) },
        select: {
          id: true,
          name: true,
          // capacity removido do schema — não selecionar!
          capacityAfternoon: true,
          capacityNight: true,
          isActive: true,
          unitId: true,
        },
      }),
    ]);

    if (!unit || !unit.isActive) {
      return res.status(404).json({ error: { code: 'UNIT_NOT_FOUND', message: 'Unidade inexistente ou inativa.' } });
    }
    if (!area || !area.isActive || area.unitId !== unit.id) {
      return res.status(404).json({
        error: { code: 'AREA_NOT_FOUND', message: 'Área inexistente/inativa ou não pertence à unidade.' },
      });
    }

    // capacidade por período
    const dt = new Date(reservationDate);
    const { from, to } = periodWindow(dt);
    const period = getPeriodFromDate(dt); // 'AFTERNOON' | 'NIGHT'

    // capacidade do período (sem fallback para diário, já removido)
    const maxPeriod =
      period === 'AFTERNOON'
        ? (area.capacityAfternoon ?? 0)
        : (area.capacityNight ?? 0);

    // soma só reservas que consomem capacidade
    const grouped = await prisma.reservation.groupBy({
      by: ['areaId'],
      where: {
        areaId: area.id,
        reservationDate: { gte: from, lte: to },
        status: { in: ['AWAITING_CHECKIN', 'CHECKED_IN'] },
      },
      _sum: { people: true, kids: true },
    });

    const alreadyUsed = (grouped[0]?._sum.people ?? 0) + (grouped[0]?._sum.kids ?? 0);

    // requisitado (conta UMA vez só)
    const willUse = Math.max(0, Math.floor(peopleNum)) + Math.max(0, Math.floor(kidsNum));
    const remaining = Math.max(0, maxPeriod - alreadyUsed);

    if (willUse > remaining) {
      return res.status(409).json({
        error: {
          code: 'NO_CAPACITY',
          message:
            period === 'AFTERNOON'
              ? 'Capacidade da tarde esgotada para esta área no horário selecionado.'
              : 'Capacidade da noite esgotada para esta área no horário selecionado.',
          remaining,
          period,
        },
      });
    }

    // criar reserva
    const reservationCode = await generateUniqueReservationCode();
    const qrToken = cryptoRandom();
    const qrExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

    const created = await prisma.reservation.create({
      data: {
        fullName: String(fullName),
        cpf: cpf ? String(cpf) : null,

        people: Math.max(0, Math.floor(peopleNum)),
        kids: Math.max(0, Math.floor(kidsNum)),

        reservationDate: dt,
        birthdayDate: birthdayDate ? new Date(birthdayDate) : null,

        phone: phone ? String(phone) : null,
        email: email ? String(email) : null,
        notes: notes ? String(notes) : null,

        unitId: unit.id,
        unit: unit.name,       // denormalização para compat
        areaId: area.id,
        areaName: area.name,   // denormalização para compat

        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        utm_content: utm_content ?? null,
        utm_term: utm_term ?? null,
        url: url ?? null,
        ref: ref ?? null,

        source: source ?? 'site',

        reservationCode,
        qrToken,
        qrExpiresAt,
        status: 'AWAITING_CHECKIN',
      },
      select: { id: true, reservationCode: true },
    });

    return res.status(201).json(created);
  } catch (e: any) {
    console.error('[reservations.public] error:', e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Falha ao criar reserva.' } });
  }
});

/* =============================================================================
   Exports
============================================================================= */
export { router as reservationsPublicRouter };
export default router;
