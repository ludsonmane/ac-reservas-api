"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reservationsRouter = void 0;
// api/src/infrastructure/http/routes/reservations.routes.ts
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const dayjs_1 = __importDefault(require("dayjs"));
const PrismaReservationRepository_1 = require("../../db/PrismaReservationRepository");
const CreateReservation_1 = require("../../../application/use-cases/CreateReservation");
const ListReservations_1 = require("../../../application/use-cases/ListReservations");
const GetReservationById_1 = require("../../../application/use-cases/GetReservationById");
const UpdateReservation_1 = require("../../../application/use-cases/UpdateReservation");
const DeleteReservation_1 = require("../../../application/use-cases/DeleteReservation");
const ReservationController_1 = require("../../../interfaces/http/controllers/ReservationController");
const prisma_1 = require("../../db/prisma");
// ⬇️ auth/role guards
const requireAuth_1 = require("../middlewares/requireAuth");
// ⬇️ disponibilidade de áreas
const areas_service_1 = require("../../../modules/areas/areas.service");
exports.reservationsRouter = (0, express_1.Router)();
/* =========================================================================
   Repo/Controller
   ========================================================================= */
const repo = new PrismaReservationRepository_1.PrismaReservationRepository();
const controller = new ReservationController_1.ReservationController(new CreateReservation_1.CreateReservation(repo), new ListReservations_1.ListReservations(repo), new GetReservationById_1.GetReservationById(repo), new UpdateReservation_1.UpdateReservation(repo), new DeleteReservation_1.DeleteReservation(repo));
function toYMD(dateISO) {
    const d = typeof dateISO === 'string' ? new Date(dateISO) : dateISO;
    return (0, dayjs_1.default)(d).format('YYYY-MM-DD');
}
function toHHmm(dateISO) {
    const d = typeof dateISO === 'string' ? new Date(dateISO) : dateISO;
    return (0, dayjs_1.default)(d).format('HH:mm');
}
/** Gera um novo token de QR (hex 32 chars) */
function newQrToken() {
    return crypto_1.default.randomBytes(16).toString('hex');
}
function computeQrExpiry() {
    const ttlHours = Number(process.env.QR_TTL_HOURS || 24);
    return (0, dayjs_1.default)().add(ttlHours, 'hour').toDate();
}
// 🔧 resolve de unidade sem usar `mode`, com SELECT padronizado e fallbacks JS
async function resolveUnit(input) {
    // 1) Preferir unitId se vier
    if (input.unitId) {
        const u = await prisma_1.prisma.unit.findUnique({
            where: { id: String(input.unitId) },
            select: { id: true, name: true, slug: true },
        });
        if (u)
            return { unitId: u.id, unitName: u.name };
    }
    const raw = (input.unit || '').trim();
    if (raw) {
        // 2) tentar slug exato (slug é minúsculo geralmente)
        const guessSlug = raw.toLowerCase();
        let u = (await prisma_1.prisma.unit.findUnique({
            where: { slug: guessSlug },
            select: { id: true, name: true, slug: true },
        })) ||
            // 3) tentar contains em name (sensível ao caso do DB)
            (await prisma_1.prisma.unit.findFirst({
                where: { name: { contains: raw } },
                select: { id: true, name: true, slug: true },
            })) ||
            null;
        // 4) fallback: carrega todas e compara case-insensitive em JS
        if (!u) {
            const all = await prisma_1.prisma.unit.findMany({ select: { id: true, name: true, slug: true } });
            const lowered = raw.toLowerCase();
            u =
                all.find((x) => x.slug?.toLowerCase() === lowered) ||
                    all.find((x) => x.name.toLowerCase() === lowered) ||
                    all.find((x) => x.name.toLowerCase().includes(lowered)) ||
                    null;
        }
        if (u)
            return { unitId: u.id, unitName: u.name };
    }
    return { unitId: null, unitName: null };
}
// 🔧 resolve de área sem `mode`, com SELECT padronizado e atrelada à unit
async function resolveArea(input) {
    if (input.areaId) {
        const a = await prisma_1.prisma.area.findUnique({
            where: { id: String(input.areaId) },
            select: { id: true, name: true },
        });
        if (a)
            return { areaId: a.id, areaName: a.name };
    }
    const raw = (input.area || '').trim();
    if (raw && input.unitId) {
        // 1) exato em name + unitId
        let a = (await prisma_1.prisma.area.findFirst({
            where: { unitId: String(input.unitId), name: raw },
            select: { id: true, name: true },
        })) ||
            // 2) contains (sensível ao caso do DB)
            (await prisma_1.prisma.area.findFirst({
                where: { unitId: String(input.unitId), name: { contains: raw } },
                select: { id: true, name: true },
            })) ||
            null;
        // 3) fallback: carregar áreas da unidade e comparar case-insensitive em JS
        if (!a) {
            const all = await prisma_1.prisma.area.findMany({
                where: { unitId: String(input.unitId) },
                select: { id: true, name: true },
            });
            const lowered = raw.toLowerCase();
            a =
                all.find((x) => x.name.toLowerCase() === lowered) ||
                    all.find((x) => x.name.toLowerCase().includes(lowered)) ||
                    null;
            if (a)
                return { areaId: a.id, areaName: a.name };
        }
        if (a)
            return { areaId: a.id, areaName: a.name };
    }
    return { areaId: null, areaName: null };
}
/**
 * Middleware que:
 * - Resolve unitId/areaId (e unit/areaName legados)
 * - Valida capacidade do PERÍODO (tarde/noite) da área escolhida
 * - Normaliza tipos numéricos
 */
async function enrichAndValidate(req, res, next) {
    try {
        const body = req.body || {};
        // normaliza números
        const people = Number(body.people ?? 0);
        const kids = Number(body.kids ?? 0);
        body.people = Number.isFinite(people) ? people : 0;
        body.kids = Number.isFinite(kids) ? kids : 0;
        // data obrigatória para validação de capacidade quando houver área
        const reservationDate = body.reservationDate ? new Date(body.reservationDate) : null;
        // resolve unidade
        const { unitId, unitName } = await resolveUnit({ unitId: body.unitId, unit: body.unit });
        body.unitId = unitId;
        // legado:
        if (!body.unit && unitName)
            body.unit = unitName;
        // resolve área (depende de unitId)
        const { areaId, areaName } = await resolveArea({ areaId: body.areaId, area: body.area, unitId });
        body.areaId = areaId;
        // legado:
        if (!body.areaName && areaName)
            body.areaName = areaName;
        if (!body.area && areaName)
            body.area = areaName;
        // valida capacidade se tivermos área + data
        if (areaId && reservationDate) {
            const ymd = toYMD(reservationDate);
            const hhmm = toHHmm(reservationDate); // valida por período
            // Busca disponibilidade da unidade no dia/horário (período)
            const list = await areas_service_1.areasService.listByUnitPublic(String(unitId), ymd, hhmm);
            const found = list.find((a) => a.id === areaId);
            if (!found) {
                return res.status(400).json({
                    error: { code: 'AREA_NOT_FOUND', message: 'Área não encontrada/ativa para a unidade selecionada.' },
                });
            }
            const totalNovo = Number(body.people) + Number(body.kids || 0);
            const available = Number(found.available ?? found.remaining ?? 0);
            // 🔁 Se for UPDATE, considerar o que já estava reservado antes
            let creditoAtual = 0;
            try {
                const isUpdate = req.method === 'PUT' && req.params?.id;
                if (isUpdate) {
                    const prev = await prisma_1.prisma.reservation.findUnique({ where: { id: String(req.params.id) } });
                    if (prev) {
                        const sameArea = String(prev.areaId || '') === String(areaId || '');
                        const sameUnit = String(prev.unitId || '') === String(unitId || '');
                        const sameDay = toYMD(prev.reservationDate) === ymd;
                        const samePeriod = toHHmm(prev.reservationDate) === hhmm;
                        if (sameUnit && sameArea && sameDay && samePeriod) {
                            const prevTotal = Number(prev.people || 0) + Number(prev.kids || 0);
                            creditoAtual = prevTotal;
                        }
                    }
                }
            }
            catch {
                /* ok */
            }
            // Agora a régua é: totalNovo <= available + creditoAtual
            if (totalNovo > available + creditoAtual) {
                const faltantes = totalNovo - (available + creditoAtual);
                return res.status(409).json({
                    error: {
                        code: 'AREA_NO_CAPACITY',
                        message: `Esta área não possui vagas suficientes para ${totalNovo} pessoa(s) nesta data/período. Faltam ${faltantes}.`,
                        available,
                        credit: creditoAtual,
                    },
                });
            }
        }
        req.body = body;
        next();
    }
    catch (e) {
        next(e);
    }
}
/**
 * Middleware que impede STAFF (concierge) de editar campos UTM/Source.
 * ADMIN pode tudo.
 */
function sanitizeStaffBody(req, _res, next) {
    const role = req.user?.role;
    if (role && role !== 'ADMIN') {
        if (req.body) {
            delete req.body.utm_source;
            delete req.body.utm_campaign;
            delete req.body.source;
            delete req.body.utmSource;
            delete req.body.utmCampaign;
        }
    }
    next();
}
/* =========================================================================
   Rotas estáticas / específicas (ANTES das paramétricas)
   ========================================================================= */
/**
 * Buscar por código curto via query string
 * GET /v1/reservations/lookup?code=JT5WK6
 */
exports.reservationsRouter.get('/lookup', async (req, res) => {
    const raw = String(req.query.code || '').trim().toUpperCase();
    if (!raw) {
        return res.status(400).json({ error: { message: 'Parâmetro "code" é obrigatório.' } });
    }
    if (!/^[A-Z0-9]{6}$/.test(raw)) {
        return res.status(400).json({ error: { message: 'Código inválido (use 6 caracteres A-Z/0-9).' } });
    }
    const r = await prisma_1.prisma.reservation.findUnique({ where: { reservationCode: raw } });
    if (!r)
        return res.sendStatus(404);
    res.json(r);
});
/**
 * Buscar por código curto via path
 * GET /v1/reservations/code/:code
 */
exports.reservationsRouter.get('/code/:code', async (req, res) => {
    const code = (req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: { message: 'Código inválido (use 6 caracteres A-Z/0-9).' } });
    }
    const r = await prisma_1.prisma.reservation.findUnique({ where: { reservationCode: code } });
    if (!r)
        return res.sendStatus(404);
    res.json(r);
});
/**
 * Disponibilidade pública por unidade e data/período
 * GET /v1/reservations/availability?unitId=...&date=YYYY-MM-DD[&time=HH:mm]
 */
exports.reservationsRouter.get('/availability', async (req, res) => {
    const unitId = String(req.query.unitId || '');
    const date = String(req.query.date || '');
    const time = req.query.time ? String(req.query.time) : undefined;
    if (!unitId)
        return res.status(400).json({ error: { message: 'unitId é obrigatório' } });
    const list = await areas_service_1.areasService.listByUnitPublic(unitId, date || undefined, time);
    res.json(list);
});
/**
 * Listar UNIDADES para a UI (compat: apenas nomes)
 * GET /v1/reservations/units
 */
exports.reservationsRouter.get('/units', async (_req, res) => {
    const units = await prisma_1.prisma.unit.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { name: true },
    });
    res.json(units.map((u) => u.name));
});
/**
 * Listar ÁREAS (legado, derivadas das reservas existentes)
 * GET /v1/reservations/areas
 */
exports.reservationsRouter.get('/areas', async (_req, res) => {
    const groups = await prisma_1.prisma.reservation.groupBy({
        by: ['area'],
        where: { area: { not: null } },
    });
    const list = groups
        .map((g) => g.area)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json(list);
});
/**
 * ⚠️ Check-in via GET por token (NÃO altera estado).
 * GET /v1/reservations/checkin/:token
 */
exports.reservationsRouter.get('/checkin/:token', async (req, res) => {
    const token = req.params.token;
    const r = await prisma_1.prisma.reservation.findFirst({ where: { qrToken: token } });
    if (!r)
        return res.status(404).send('<h2>QR inválido</h2>');
    if (r.qrExpiresAt && r.qrExpiresAt < new Date()) {
        return res.status(410).send('<h2>QR expirado</h2>');
    }
    res
        .status(200)
        .send('<h2>Abra o painel do Admin, faça login e confirme o check-in desta reserva.</h2>');
});
/**
 * Status da reserva (para polling do front)
 * GET /v1/reservations/:id/status
 */
exports.reservationsRouter.get('/:id/status', async (req, res) => {
    const id = req.params.id;
    const r = await prisma_1.prisma.reservation.findUnique({
        where: { id },
        select: { status: true, checkedInAt: true, reservationCode: true },
    });
    if (!r)
        return res.sendStatus(404);
    res.json(r);
});
/**
 * QR code PNG do check-in (imagem)
 * GET /v1/reservations/:id/qrcode
 */
exports.reservationsRouter.get('/:id/qrcode', async (req, res) => {
    const id = req.params.id;
    const r = await prisma_1.prisma.reservation.findUnique({ where: { id } });
    if (!r)
        return res.sendStatus(404);
    const adminBase = (process.env.ADMIN_APP_BASE_URL || '').trim().replace(/\/+$/, '');
    const apiBase = `${req.protocol}://${req.get('host')}`;
    const checkinUiUrl = adminBase
        ? `${adminBase}/checkin?id=${encodeURIComponent(r.id)}`
        : `${apiBase}/v1/reservations/checkin/${encodeURIComponent(r.qrToken)}`;
    try {
        const png = await qrcode_1.default.toBuffer(checkinUiUrl, { width: 384, margin: 2 });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(png);
    }
    catch {
        res.status(500).json({ error: { code: 'QR_ERROR', message: 'Failed to generate QR' } });
    }
});
/* =========================================================================
   ✅ Renovação de QR + mudança de status
   ========================================================================= */
exports.reservationsRouter.post('/:id/qr/renew', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res, next) => {
    try {
        const { id } = req.params;
        const r = await prisma_1.prisma.reservation.findUnique({ where: { id } });
        if (!r)
            return res.status(404).json({ message: 'Reservation not found' });
        const updated = await prisma_1.prisma.reservation.update({
            where: { id },
            data: {
                qrToken: newQrToken(),
                qrExpiresAt: computeQrExpiry(),
                status: 'AWAITING_CHECKIN',
                checkedInAt: null,
            },
            select: {
                id: true,
                reservationCode: true,
                status: true,
                checkedInAt: true,
                fullName: true,
                phone: true,
                people: true,
                kids: true,
                unitId: true,
                areaId: true,
                reservationDate: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.reservationsRouter.post('/code/:code/qr/renew', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res, next) => {
    try {
        const code = (req.params.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            return res.status(400).json({ message: 'Invalid reservation code' });
        }
        const r = await prisma_1.prisma.reservation.findUnique({ where: { reservationCode: code } });
        if (!r)
            return res.status(404).json({ message: 'Reservation not found' });
        const updated = await prisma_1.prisma.reservation.update({
            where: { id: r.id },
            data: {
                qrToken: newQrToken(),
                qrExpiresAt: computeQrExpiry(),
                status: 'AWAITING_CHECKIN',
                checkedInAt: null,
            },
            select: {
                id: true,
                reservationCode: true,
                status: true,
                checkedInAt: true,
                fullName: true,
                phone: true,
                people: true,
                kids: true,
                unitId: true,
                areaId: true,
                reservationDate: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.reservationsRouter.put('/:id/status', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, renewQr } = req.body || {};
        const r = await prisma_1.prisma.reservation.findUnique({ where: { id } });
        if (!r)
            return res.status(404).json({ message: 'Reservation not found' });
        const data = { status: String(status || '').trim() };
        if (renewQr) {
            data.qrToken = newQrToken();
            data.qrExpiresAt = computeQrExpiry();
            data.checkedInAt = null;
        }
        const updated = await prisma_1.prisma.reservation.update({
            where: { id },
            data,
            select: {
                id: true,
                reservationCode: true,
                status: true,
                checkedInAt: true,
                fullName: true,
                phone: true,
                people: true,
                kids: true,
                unitId: true,
                areaId: true,
                reservationDate: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/* =========================================================================
   ✅ Check-in autenticado (por ID e por token)
   ========================================================================= */
exports.reservationsRouter.post('/:id/checkin', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res, next) => {
    try {
        const { id } = req.params;
        const r = await prisma_1.prisma.reservation.findUnique({ where: { id } });
        if (!r)
            return res.status(404).json({ error: 'Reserva não encontrada.' });
        if (r.checkedInAt) {
            return res.status(409).json({ error: 'Reserva já validada.' });
        }
        const updated = await prisma_1.prisma.reservation.update({
            where: { id },
            data: {
                status: 'CHECKED_IN',
                checkedInAt: new Date(),
            },
            select: {
                id: true,
                reservationCode: true,
                status: true,
                checkedInAt: true,
                fullName: true,
                phone: true,
                people: true,
                unitId: true,
                areaId: true,
                reservationDate: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.reservationsRouter.post('/checkin/by-token', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res, next) => {
    try {
        const token = String(req.body?.token || '').trim();
        if (!token)
            return res.status(400).json({ error: 'token é obrigatório.' });
        const r = await prisma_1.prisma.reservation.findFirst({ where: { qrToken: token } });
        if (!r)
            return res.status(404).json({ error: 'Reserva não encontrada para este token.' });
        if (r.qrExpiresAt && r.qrExpiresAt < new Date()) {
            return res.status(410).json({ error: 'QR expirado.' });
        }
        if (r.checkedInAt) {
            return res.status(409).json({ error: 'Reserva já validada.' });
        }
        const updated = await prisma_1.prisma.reservation.update({
            where: { id: r.id },
            data: {
                status: 'CHECKED_IN',
                checkedInAt: new Date(),
            },
            select: {
                id: true,
                reservationCode: true,
                status: true,
                checkedInAt: true,
                fullName: true,
                phone: true,
                people: true,
                unitId: true,
                areaId: true,
                reservationDate: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/* =========================================================================
   CRUD (Controller) — com enrich/validate no CREATE/UPDATE
   ========================================================================= */
exports.reservationsRouter.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), sanitizeStaffBody, enrichAndValidate, controller.create);
exports.reservationsRouter.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), controller.list);
exports.reservationsRouter.get('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), controller.getById);
exports.reservationsRouter.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), sanitizeStaffBody, enrichAndValidate, controller.update);
exports.reservationsRouter.delete('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), controller.delete);
