"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reservationsPublicRouter = void 0;
// src/infrastructure/http/routes/reservations.public.routes.ts
const express_1 = require("express");
const dayjs_1 = __importDefault(require("dayjs"));
const zod_1 = require("zod");
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const client_1 = require("../../db/client");
const areas_service_1 = require("../../../modules/areas/areas.service");
const router = (0, express_1.Router)();
exports.reservationsPublicRouter = router;
dayjs_1.default.extend(utc_1.default);
/* =============================================================================
   Helpers
============================================================================= */
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function at(d, hh, mm, ss = 0, ms = 0) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, ms);
}
const EVENING_CUTOFF_MIN = 17 * 60 + 30; // 17:30
function getPeriodFromDate(dt) {
    const mins = dt.getHours() * 60 + dt.getMinutes();
    if (mins < 12 * 60)
        return 'AFTERNOON';
    return mins >= EVENING_CUTOFF_MIN ? 'NIGHT' : 'AFTERNOON';
}
function periodWindow(dt) {
    if (getPeriodFromDate(dt) === 'NIGHT') {
        return { from: at(dt, 17, 30), to: endOfDay(dt) };
    }
    return { from: at(dt, 12, 0), to: at(dt, 17, 29, 59, 999) };
}
function genCode6() {
    const base = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
    let out = '';
    for (let i = 0; i < 6; i++)
        out += base[Math.floor(Math.random() * base.length)];
    return out;
}
async function generateUniqueReservationCode() {
    for (let i = 0; i < 8; i++) {
        const code = genCode6();
        const exists = await client_1.prisma.reservation.findUnique({
            where: { reservationCode: code },
            select: { id: true },
        });
        if (!exists)
            return code;
    }
    return genCode6();
}
function cryptoRandom() {
    const g = globalThis;
    if (g.crypto?.getRandomValues) {
        const buf = new Uint8Array(16);
        g.crypto.getRandomValues(buf);
        return Buffer.from(buf).toString('hex');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
}
const toLowerEmail = (v) => (v ?? '').trim().toLowerCase() || null;
/** Normaliza o reservationType vindo do front (string livre) p/ enum do Prisma */
function parseReservationType(raw) {
    const v = String(raw ?? '').trim().toUpperCase();
    const allowed = new Set([
        'PARTICULAR',
        'CONFRATERNIZACAO',
        'EMPRESA',
    ]);
    return allowed.has(v) ? v : 'PARTICULAR';
}
/* =============================================================================
   GET /v1/reservations/public/availability
============================================================================= */
router.get('/availability', async (req, res, next) => {
    try {
        const unitId = String(req.query.unitId || '').trim();
        const date = String(req.query.date || '').trim();
        const time = String(req.query.time || '').trim();
        if (!unitId) {
            return res.status(400).json({ error: { message: 'unitId é obrigatório' } });
        }
        const items = await areas_service_1.areasService.listByUnitPublic(unitId, date || undefined, time || undefined);
        res.json(items);
    }
    catch (err) {
        next(err);
    }
});
/* =============================================================================
   GET /v1/reservations/public/by-id/:id
============================================================================= */
router.get('/by-id/:id', async (req, res) => {
    const { id } = req.params;
    const r = await client_1.prisma.reservation.findUnique({
        where: { id },
    });
    if (!r)
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    return res.json(r);
});
/* =============================================================================
   GET /v1/reservations/public/active
============================================================================= */
router.get('/active', async (req, res) => {
    const id = req.query.id?.trim();
    const email = toLowerEmail(req.query.email);
    const phone = req.query.phone?.replace(/\D+/g, '');
    if (id) {
        const r = await client_1.prisma.reservation.findUnique({ where: { id } });
        if (!r || r.status !== 'AWAITING_CHECKIN') {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Nenhuma reserva ativa.' } });
        }
        return res.json(r);
    }
    if (!email && !phone) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Informe id ou email/phone.' } });
    }
    const where = { status: 'AWAITING_CHECKIN' };
    if (email)
        where.email = email;
    if (phone)
        where.phone = phone;
    const r = await client_1.prisma.reservation.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
    });
    if (!r) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Nenhuma reserva ativa.' } });
    }
    return res.json(r);
});
/* =============================================================================
   POST /v1/reservations/public
   - Cria reserva pública (mantendo UTM via body ou querystring)
============================================================================= */
router.post('/', async (req, res) => {
    try {
        const { fullName, cpf, people, kids = 0, reservationDate, birthdayDate, email, phone, notes, unitId, areaId, utm_source, utm_medium, utm_campaign, utm_content, utm_term, url, ref, source, 
        // aliases aceitos
        reservationType, reservation_type, } = req.body || {};
        // ------- Fallback UTM via query (?utm_*) --------
        const q = req.query;
        const pickUtm = (bodyVal, key) => {
            const b = typeof bodyVal === 'string' ? bodyVal.trim() : '';
            if (b)
                return b;
            const vq = q?.[key];
            const s = typeof vq === 'string' ? vq.trim() : '';
            return s || null;
        };
        const utm_source_f = pickUtm(utm_source, 'utm_source');
        const utm_medium_f = pickUtm(utm_medium, 'utm_medium');
        const utm_campaign_f = pickUtm(utm_campaign, 'utm_campaign');
        const utm_content_f = pickUtm(utm_content, 'utm_content');
        const utm_term_f = pickUtm(utm_term, 'utm_term');
        // -----------------------------------------------
        // validações básicas
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
        if (!reservationDate || !(0, dayjs_1.default)(reservationDate).isValid()) {
            return res.status(400).json({ error: { code: 'VALIDATION', message: 'reservationDate inválido.' } });
        }
        // normalizações
        const emailNorm = toLowerEmail(email);
        const phoneNorm = phone ? String(phone).replace(/\D+/g, '') : null;
        const rType = parseReservationType(reservationType ?? reservation_type);
        // anti-duplicidade por contato
        if (emailNorm || phoneNorm) {
            const existing = await client_1.prisma.reservation.findFirst({
                where: {
                    status: 'AWAITING_CHECKIN',
                    OR: [
                        emailNorm ? { email: emailNorm } : undefined,
                        phoneNorm ? { phone: phoneNorm } : undefined,
                    ].filter(Boolean),
                },
                orderBy: { createdAt: 'desc' },
            });
            if (existing) {
                return res.status(409).json({
                    error: {
                        code: 'ALREADY_HAS_ACTIVE_RESERVATION',
                        message: 'Você já tem uma reserva ativa. Faça o check-in para poder reservar de novo.',
                        reservationId: existing.id,
                        reservationCode: existing.reservationCode,
                        reservationDate: existing.reservationDate,
                        unitId: existing.unitId,
                        areaId: existing.areaId,
                    },
                });
            }
        }
        // checa unidade/área
        const [unit, area] = await Promise.all([
            client_1.prisma.unit.findUnique({
                where: { id: String(unitId) },
                select: { id: true, name: true, isActive: true },
            }),
            client_1.prisma.area.findUnique({
                where: { id: String(areaId) },
                select: {
                    id: true,
                    name: true,
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
        const maxPeriod = getPeriodFromDate(dt) === 'AFTERNOON'
            ? (area.capacityAfternoon ?? 0)
            : (area.capacityNight ?? 0);
        const grouped = await client_1.prisma.reservation.groupBy({
            by: ['areaId'],
            where: {
                areaId: area.id,
                reservationDate: { gte: from, lte: to },
                status: { in: ['AWAITING_CHECKIN', 'CHECKED_IN'] },
            },
            _sum: { people: true, kids: true },
        });
        const alreadyUsed = (grouped[0]?._sum.people ?? 0) + (grouped[0]?._sum.kids ?? 0);
        const willUse = Math.max(0, Math.floor(peopleNum)) + Math.max(0, Math.floor(kidsNum));
        const remaining = Math.max(0, maxPeriod - alreadyUsed);
        if (willUse > remaining) {
            return res.status(409).json({
                error: {
                    code: 'NO_CAPACITY',
                    message: getPeriodFromDate(dt) === 'AFTERNOON'
                        ? 'Capacidade da tarde esgotada para esta área no horário selecionado.'
                        : 'Capacidade da noite esgotada para esta área no horário selecionado.',
                    remaining,
                    period: getPeriodFromDate(dt),
                },
            });
        }
        // criar reserva
        const reservationCode = await generateUniqueReservationCode();
        const qrToken = cryptoRandom();
        const qrExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h
        const created = await client_1.prisma.reservation.create({
            data: {
                fullName: String(fullName),
                cpf: cpf ? String(cpf) : null,
                people: Math.max(0, Math.floor(peopleNum)),
                kids: Math.max(0, Math.floor(kidsNum)),
                reservationDate: dt,
                birthdayDate: birthdayDate ? new Date(birthdayDate) : null,
                phone: phoneNorm,
                email: emailNorm,
                notes: notes ? String(notes) : null,
                unitId: unit.id,
                unit: unit.name,
                areaId: area.id,
                areaName: area.name,
                // UTMs: body -> query (?utm_*)
                utm_source: utm_source_f,
                utm_medium: utm_medium_f,
                utm_campaign: utm_campaign_f,
                utm_content: utm_content_f,
                utm_term: utm_term_f,
                url: url ?? null,
                ref: ref ?? null,
                source: source ?? 'site',
                reservationCode,
                qrToken,
                qrExpiresAt,
                status: 'AWAITING_CHECKIN',
                reservationType: rType,
            },
            select: { id: true, reservationCode: true, status: true, reservationType: true },
        });
        return res.status(201).json(created);
    }
    catch (e) {
        console.error('[reservations.public] error:', e);
        return res.status(500).json({ error: { code: 'INTERNAL', message: 'Falha ao criar reserva.' } });
    }
});
/* =============================================================================
   POST /v1/reservations/public/:id/guests/bulk
============================================================================= */
router.post('/:id/guests/bulk', async (req, res) => {
    const reservationId = String(req.params.id || '').trim();
    if (!reservationId)
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Missing reservation id' } });
    const Email = zod_1.z.string().trim().toLowerCase().email();
    const GuestSchema = zod_1.z.object({
        name: zod_1.z.string().trim().min(2, 'name too short').max(200),
        email: Email,
        role: zod_1.z.enum(['GUEST', 'HOST']).optional().default('GUEST'),
    });
    const BodySchema = zod_1.z.object({
        guests: zod_1.z.array(GuestSchema).min(1).max(1000),
    });
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const exists = await client_1.prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { id: true },
    });
    if (!exists)
        return res.status(404).json({ error: { code: 'RESERVATION_NOT_FOUND' } });
    const data = parsed.data.guests.map((g) => ({
        reservationId,
        name: g.name.trim(),
        email: g.email.trim().toLowerCase(),
        role: g.role,
    }));
    try {
        const result = await client_1.prisma.guest.createMany({
            data,
            skipDuplicates: true,
        });
        const created = result.count;
        const skipped = data.length - created;
        return res.status(200).json({ created, skipped });
    }
    catch (err) {
        if (err?.code === 'P2003') {
            return res.status(400).json({ error: { code: 'FOREIGN_KEY_CONSTRAINT' } });
        }
        console.error('[reservations.public.guests.bulk] error:', err);
        return res.status(500).json({ error: { code: 'INTERNAL' } });
    }
});
/* =============================================================================
   GET /v1/reservations/public/:id/meet-link
============================================================================= */
router.get('/:id/meet-link', async (req, res) => {
    const reservationId = String(req.params.id || '').trim();
    if (!reservationId)
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Missing reservation id' } });
    const r = await client_1.prisma.reservation.findUnique({
        where: { id: reservationId },
        select: {
            id: true,
            fullName: true,
            email: true,
            reservationDate: true,
            unit: true,
            unitId: true,
            areaName: true,
        },
    });
    if (!r)
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    const guests = await client_1.prisma.guest.findMany({
        where: { reservationId },
        select: { email: true },
    });
    const emails = [
        toLowerEmail(r.email),
        ...guests.map((g) => toLowerEmail(g.email)).filter(Boolean),
    ].filter(Boolean);
    const start = (0, dayjs_1.default)(r.reservationDate);
    const end = start.add(2, 'hour');
    const fmt = (d) => d.utc().format('YYYYMMDD[T]HHmmss[Z]');
    const text = `RESERVA DO ${r.fullName?.toUpperCase?.() || 'CLIENTE'} NO MANÉ MERCADO`;
    const details = [
        r.unit ? `Unidade: ${r.unit}` : null,
        r.areaName ? `Área: ${r.areaName}` : null,
        `Gerado automaticamente pelo site.`,
    ]
        .filter(Boolean)
        .join('\n');
    const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    const params = new URLSearchParams();
    params.set('text', text);
    params.set('dates', `${fmt(start)}/${fmt(end)}`);
    if (emails.length)
        params.set('add', emails.join(','));
    params.set('details', details);
    params.set('location', 'Google Meet (gerado ao salvar)');
    const url = `${base}&${params.toString()}`;
    return res.json({ url });
});
exports.default = router;
