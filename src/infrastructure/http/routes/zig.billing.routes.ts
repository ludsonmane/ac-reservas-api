/**
 * src/infrastructure/http/routes/zig.billing.routes.ts
 *
 * GET /v1/zig/billing/:reservationId
 * Busca faturamento ZIG pelas mesas da reserva e salva no banco.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { prisma } from '../../db/prisma';
import { getZigBillingForReservation } from '../../../services/zig.service';

export const zigBillingRouter = Router();

zigBillingRouter.get(
  '/billing/:reservationId',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  async (req, res, next) => {
    try {
      const { reservationId } = req.params;
      const lojaOverride      = req.query.lojaId ? String(req.query.lojaId) : undefined;

      // 1. Busca reserva
      const reservation = await prisma.reservation.findUnique({
        where:  { id: reservationId },
        select: {
          id:              true,
          fullName:        true,
          tables:          true,
          status:          true,
          reservationDate: true,
          unitId:          true,
          unitRef: { select: { slug: true, name: true } },
        },
      });

      if (!reservation) {
        return res.status(404).json({
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Reserva não encontrada.' },
        });
      }

      if (reservation.status !== 'CHECKED_IN') {
        return res.status(422).json({
          error: {
            code:    'NOT_CHECKED_IN',
            message: `Faturamento ZIG só pode ser consultado para reservas com check-in feito. Status atual: ${reservation.status}`,
          },
        });
      }

      if (!reservation.tables?.trim()) {
        return res.status(422).json({
          error: {
            code:    'NO_TABLES',
            message: 'Esta reserva não possui mesas vinculadas.',
          },
        });
      }

      if (!process.env.ZIG_TOKEN) {
        return res.status(503).json({
          error: {
            code:    'ZIG_NOT_CONFIGURED',
            message: 'Integração ZIG não configurada. Defina ZIG_TOKEN e ZIG_LOJA_MAP no Railway.',
          },
        });
      }

      const unitSlug = reservation.unitRef?.slug ?? null;

      // 2. Busca faturamento na ZIG
      const billing = await getZigBillingForReservation(
        reservation.tables,
        reservation.reservationDate,
        unitSlug,
        lojaOverride,
      );

      // 3. Salva no banco (mesmo que seja R$ 0,00 — registra que foi consultado)
      await prisma.reservation.update({
        where: { id: reservationId },
        data: {
          zigBillingCents: billing.totalValueCents,
          zigBilledAt:     new Date(),
        },
      });

      return res.json({
        reservationId:   reservation.id,
        reservationName: reservation.fullName,
        unitName:        reservation.unitRef?.name ?? null,
        unitSlug,
        ...billing,
      });

    } catch (err: any) {
      if (err?.message?.startsWith('[ZIG]')) {
        return res.status(502).json({
          error: { code: 'ZIG_ERROR', message: err.message },
        });
      }
      next(err);
    }
  },
);
