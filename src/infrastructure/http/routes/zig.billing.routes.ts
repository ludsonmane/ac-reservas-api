/**
 * src/infrastructure/http/routes/zig.billing.routes.ts
 *
 * GET /v1/zig/billing/:reservationId
 *
 * Resolve automaticamente o lojaId ZIG correto a partir da unidade da reserva,
 * usando o mapa configurado em ZIG_LOJA_MAP no Railway.
 *
 * Railway env:
 *   ZIG_TOKEN=<token>
 *   ZIG_LOJA_MAP={"bsb":"111","aguas-claras":"222"}
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { prisma } from '../../db/prisma';
import { getZigBillingForReservation } from '../../../services/zig.service';

export const zigBillingRouter = Router();

/**
 * GET /v1/zig/billing/:reservationId
 *
 * Query params opcionais:
 *   lojaId  — override manual do lojaId ZIG (ignora ZIG_LOJA_MAP)
 *
 * Resposta:
 * {
 *   reservationId, reservationName, unitSlug,
 *   tables, totalValueCents, totalValueBRL,
 *   byTable: [{ table, totalCents, transactions }],
 *   date, lojaId
 * }
 */
zigBillingRouter.get(
  '/billing/:reservationId',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  async (req, res, next) => {
    try {
      const { reservationId } = req.params;
      const lojaOverride      = req.query.lojaId ? String(req.query.lojaId) : undefined;

      // 1. Busca reserva + slug da unidade
      const reservation = await prisma.reservation.findUnique({
        where:  { id: reservationId },
        select: {
          id:              true,
          fullName:        true,
          tables:          true,
          reservationDate: true,
          unitId:          true,
          unitRef: {
            select: { slug: true, name: true },
          },
        },
      });

      if (!reservation) {
        return res.status(404).json({
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Reserva não encontrada.' },
        });
      }

      // 2. Valida mesas
      if (!reservation.tables?.trim()) {
        return res.status(422).json({
          error: {
            code:    'NO_TABLES',
            message: 'Esta reserva não possui mesas vinculadas. Vincule as mesas antes de consultar o faturamento ZIG.',
          },
        });
      }

      // 3. Valida configuração mínima
      if (!process.env.ZIG_TOKEN) {
        return res.status(503).json({
          error: {
            code:    'ZIG_NOT_CONFIGURED',
            message: 'Integração ZIG não configurada. Defina ZIG_TOKEN e ZIG_LOJA_MAP no Railway.',
          },
        });
      }

      // 4. Slug da unidade para resolver lojaId no mapa
      const unitSlug = reservation.unitRef?.slug ?? null;

      // 5. Busca faturamento
      const billing = await getZigBillingForReservation(
        reservation.tables,
        reservation.reservationDate,
        unitSlug,
        lojaOverride,
      );

      // 6. Responde
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
