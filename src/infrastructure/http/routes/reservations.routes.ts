// api/src/infrastructure/http/routes/reservations.routes.ts
import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';

import { PrismaReservationRepository } from '../../db/PrismaReservationRepository';
import { CreateReservation } from '../../../application/use-cases/CreateReservation';
import { ListReservations } from '../../../application/use-cases/ListReservations';
import { GetReservationById } from '../../../application/use-cases/GetReservationById';
import { UpdateReservation } from '../../../application/use-cases/UpdateReservation';
import { DeleteReservation } from '../../../application/use-cases/DeleteReservation';
import { ReservationController } from '../../../interfaces/http/controllers/ReservationController';
import { prisma } from '../../db/prisma';

const repo = new PrismaReservationRepository();
const controller = new ReservationController(
  new CreateReservation(repo),
  new ListReservations(repo),
  new GetReservationById(repo),
  new UpdateReservation(repo),
  new DeleteReservation(repo)
);

export const reservationsRouter = Router();

/**
 * Rotas ESPECÍFICAS/ESTÁTICAS devem vir ANTES das paramétricas (/:id)
 */

/**
 * Buscar por código curto via query string
 * GET /v1/reservations/lookup?code=JT5WK6
 */
reservationsRouter.get('/lookup', async (req, res) => {
  const raw = String(req.query.code || '').trim().toUpperCase();
  if (!raw) {
    return res.status(400).json({ error: { message: 'Parâmetro "code" é obrigatório.' } });
  }
  if (!/^[A-Z0-9]{6}$/.test(raw)) {
    return res.status(400).json({ error: { message: 'Código inválido (use 6 caracteres A-Z/0-9).' } });
  }

  const r = await prisma.reservation.findUnique({ where: { reservationCode: raw } });
  if (!r) return res.sendStatus(404);
  res.json(r);
});

/**
 * Buscar por código curto (localizador de 6 chars) via path
 * GET /v1/reservations/code/:code
 */
reservationsRouter.get('/code/:code', async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: { message: 'Código inválido (use 6 caracteres A-Z/0-9).' } });
  }
  const r = await prisma.reservation.findUnique({ where: { reservationCode: code } });
  if (!r) return res.sendStatus(404);
  res.json(r);
});

/**
 * Check-in por token (idempotente)
 * GET /v1/reservations/checkin/:token
 */
reservationsRouter.get('/checkin/:token', async (req, res) => {
  const token = req.params.token;
  const now = new Date();

  const r = await prisma.reservation.findFirst({ where: { qrToken: token } });
  if (!r) return res.status(404).send('<h2>QR inválido</h2>');
  if (r.qrExpiresAt && r.qrExpiresAt < now) return res.status(410).send('<h2>QR expirado</h2>');
  if (r.checkedInAt) return res.status(200).send('<h2>Reserva já validada ✔️</h2>');

  await prisma.reservation.update({
    where: { id: r.id },
    data: { status: 'CHECKED_IN', checkedInAt: now },
  });

  res.status(200).send('<h2>Check-in confirmado! ✔️</h2>');
});

/**
 * Status da reserva (para polling do front)
 * GET /v1/reservations/:id/status
 */
reservationsRouter.get('/:id/status', async (req, res) => {
  const id = req.params.id;
  const r = await prisma.reservation.findUnique({
    where: { id },
    select: { status: true, checkedInAt: true, reservationCode: true },
  });
  if (!r) return res.sendStatus(404);
  res.json(r);
});

/**
 * QR code PNG do check-in (imagem)
 * GET /v1/reservations/:id/qrcode
 */
reservationsRouter.get('/:id/qrcode', async (req, res) => {
  const id = req.params.id;
  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) return res.sendStatus(404);

  const base = `${req.protocol}://${req.get('host')}`;
  const checkinUrl = `${base}/v1/reservations/checkin/${encodeURIComponent(r.qrToken)}`;

  try {
    const png = await QRCode.toBuffer(checkinUrl, { width: 384, margin: 2 });

    // Permitir embed cross-origin da imagem (evita CORP em localhost:3000)
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.send(png);
  } catch {
    res.status(500).json({ error: { code: 'QR_ERROR', message: 'Failed to generate QR' } });
  }
});

/**
 * Renovar QR (gera novo token, renova expiração e volta para AWAITING_CHECKIN)
 * POST /v1/reservations/:id/qr/renew
 */
reservationsRouter.post('/:id/qr/renew', async (req, res) => {
  const { id } = req.params;
  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) return res.sendStatus(404);

  const now = new Date();
  const newToken = crypto.randomBytes(16).toString('hex');

  const updated = await prisma.reservation.update({
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
reservationsRouter.post('/', controller.create);
reservationsRouter.get('/', controller.list);
reservationsRouter.get('/:id', controller.getById);
reservationsRouter.put('/:id', controller.update);
reservationsRouter.delete('/:id', controller.delete);
