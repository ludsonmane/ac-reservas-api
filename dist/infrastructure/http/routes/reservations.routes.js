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
const PrismaReservationRepository_1 = require("../../db/PrismaReservationRepository");
const CreateReservation_1 = require("../../../application/use-cases/CreateReservation");
const ListReservations_1 = require("../../../application/use-cases/ListReservations");
const GetReservationById_1 = require("../../../application/use-cases/GetReservationById");
const UpdateReservation_1 = require("../../../application/use-cases/UpdateReservation");
const DeleteReservation_1 = require("../../../application/use-cases/DeleteReservation");
const ReservationController_1 = require("../../../interfaces/http/controllers/ReservationController");
const prisma_1 = require("../../db/prisma");
const repo = new PrismaReservationRepository_1.PrismaReservationRepository();
const controller = new ReservationController_1.ReservationController(new CreateReservation_1.CreateReservation(repo), new ListReservations_1.ListReservations(repo), new GetReservationById_1.GetReservationById(repo), new UpdateReservation_1.UpdateReservation(repo), new DeleteReservation_1.DeleteReservation(repo));
exports.reservationsRouter = (0, express_1.Router)();
/**
 * Rotas ESPECÍFICAS/ESTÁTICAS devem vir ANTES das paramétricas (/:id)
 */
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
 * Buscar por código curto (localizador de 6 chars) via path
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
 * Check-in por token (idempotente)
 * GET /v1/reservations/checkin/:token
 */
exports.reservationsRouter.get('/checkin/:token', async (req, res) => {
    const token = req.params.token;
    const now = new Date();
    const r = await prisma_1.prisma.reservation.findFirst({ where: { qrToken: token } });
    if (!r)
        return res.status(404).send('<h2>QR inválido</h2>');
    if (r.qrExpiresAt && r.qrExpiresAt < now)
        return res.status(410).send('<h2>QR expirado</h2>');
    if (r.checkedInAt)
        return res.status(200).send('<h2>Reserva já validada ✔️</h2>');
    await prisma_1.prisma.reservation.update({
        where: { id: r.id },
        data: { status: 'CHECKED_IN', checkedInAt: now },
    });
    res.status(200).send('<h2>Check-in confirmado! ✔️</h2>');
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
    const base = `${req.protocol}://${req.get('host')}`;
    const checkinUrl = `${base}/v1/reservations/checkin/${encodeURIComponent(r.qrToken)}`;
    try {
        const png = await qrcode_1.default.toBuffer(checkinUrl, { width: 384, margin: 2 });
        // Permitir embed cross-origin da imagem (evita CORP em localhost:3000)
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
/**
 * Renovar QR (gera novo token, renova expiração e volta para AWAITING_CHECKIN)
 * POST /v1/reservations/:id/qr/renew
 */
exports.reservationsRouter.post('/:id/qr/renew', async (req, res) => {
    const { id } = req.params;
    const r = await prisma_1.prisma.reservation.findUnique({ where: { id } });
    if (!r)
        return res.sendStatus(404);
    const now = new Date();
    const newToken = crypto_1.default.randomBytes(16).toString('hex');
    const updated = await prisma_1.prisma.reservation.update({
        where: { id },
        data: {
            qrToken: newToken,
            qrExpiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 48), // 48h
            checkedInAt: null,
            status: 'AWAITING_CHECKIN',
        },
        select: { id: true, qrToken: true, qrExpiresAt: true, status: true },
    });
    res.json({ ok: true, ...updated });
});
/**
 * CRUD padrão (Controller) — GENÉRICO DEVE VIR POR ÚLTIMO
 */
exports.reservationsRouter.post('/', controller.create);
exports.reservationsRouter.get('/', controller.list);
exports.reservationsRouter.get('/:id', controller.getById);
exports.reservationsRouter.put('/:id', controller.update);
exports.reservationsRouter.delete('/:id', controller.delete);
