// src/infrastructure/http/routes/blocks.routes.ts
import { Router } from 'express';
import dayjs from 'dayjs';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { ReservationBlockMode, ReservationBlockPeriod } from '@prisma/client';

const router = Router();

/**
 * Schema para criar bloqueio (mode = PERIOD)
 */
const bodySchema = z.object({
  unitId: z.string().min(1),
  areaId: z.string().min(1).nullable().optional(), // null = todas as áreas
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),    // YYYY-MM-DD
  period: z.enum(['AFTERNOON', 'NIGHT', 'ALL_DAY']),
  reason: z.string().max(255).optional(),
});

/**
 * Schema para listagem (GET /period)
 */
const listQuerySchema = z.object({
  unitId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Schema para update (PATCH /:id) – todos os campos opcionais
 */
const updateSchema = z.object({
  unitId: z.string().min(1).optional(),
  areaId: z.string().min(1).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  period: z.enum(['AFTERNOON', 'NIGHT', 'ALL_DAY']).optional(),
  reason: z.string().max(255).nullable().optional(),
});

/**
 * POST /v1/blocks/period
 * Cria (ou atualiza motivo) de um bloqueio de período
 */
router.post(
  '/period',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  // req tipado como any pra aceitar req.user
  async (req: any, res, next) => {
    try {
      const { unitId, areaId, date, period, reason } = bodySchema.parse(req.body);

      const base = dayjs(date, 'YYYY-MM-DD', true);
      if (!base.isValid()) {
        return res.status(400).json({ error: { message: 'Data inválida.' } });
      }

      const dayStart = base.startOf('day').toDate();

      // Como não temos @@unique, fazemos "findFirst -> update ou create"
      const existing = await prisma.reservationBlock.findFirst({
        where: {
          unitId,
          areaId: areaId ?? null,
          date: dayStart,
          mode: ReservationBlockMode.PERIOD,
          period: period as ReservationBlockPeriod,
        },
      });

      const block = existing
        ? await prisma.reservationBlock.update({
            where: { id: existing.id },
            data: {
              reason: reason ?? existing.reason,
            },
          })
        : await prisma.reservationBlock.create({
            data: {
              unitId,
              areaId: areaId ?? null,
              date: dayStart,
              mode: ReservationBlockMode.PERIOD,
              period: period as ReservationBlockPeriod,
              reason: reason ?? null,
              createdBy: req.user?.id ?? null,
            },
          });

      return res.json(block);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/blocks/period
 * Lista bloqueios de período
 */
router.get(
  '/period',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'INVALID_QUERY',
            message: 'Parâmetros de consulta inválidos.',
            details: parsed.error.flatten(),
          },
        });
      }

      const { unitId, areaId, from, to } = parsed.data;

      const where: any = {
        mode: ReservationBlockMode.PERIOD,
      };

      if (unitId) where.unitId = unitId;
      if (areaId) where.areaId = areaId;

      if (from || to) {
        const fromDay = from ? dayjs(from, 'YYYY-MM-DD', true) : null;
        const toDay = to ? dayjs(to, 'YYYY-MM-DD', true) : null;

        if (from && !fromDay?.isValid()) {
          return res.status(400).json({
            error: { code: 'INVALID_FROM', message: 'Parâmetro "from" inválido.' },
          });
        }
        if (to && !toDay?.isValid()) {
          return res.status(400).json({
            error: { code: 'INVALID_TO', message: 'Parâmetro "to" inválido.' },
          });
        }

        where.date = {};
        if (fromDay) where.date.gte = fromDay.startOf('day').toDate();
        if (toDay) where.date.lte = toDay.endOf('day').toDate();
      }

      const blocks = await prisma.reservationBlock.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
          unit: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      });

      const payload = blocks.map((b) => ({
        id: b.id,
        unitId: b.unitId,
        unitName: b.unit?.name ?? null,
        areaId: b.areaId,
        areaName: b.area?.name ?? null,
        date: dayjs(b.date).format('YYYY-MM-DD'),
        mode: b.mode,
        period: b.period,
        reason: b.reason,
        createdBy: b.createdBy,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }));

      return res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /v1/blocks/:id
 * Atualiza um bloqueio existente
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = updateSchema.parse(req.body);

      const existing = await prisma.reservationBlock.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Bloqueio não encontrado.',
        });
      }

      const updateData: any = {};

      if (data.unitId) updateData.unitId = data.unitId;
      if ('areaId' in data) updateData.areaId = data.areaId ?? null;

      if (data.date) {
        const base = dayjs(data.date, 'YYYY-MM-DD', true);
        if (!base.isValid()) {
          return res.status(400).json({ error: { message: 'Data inválida.' } });
        }
        updateData.date = base.startOf('day').toDate();
      }

      if (data.period) {
        updateData.period = data.period as ReservationBlockPeriod;
        updateData.mode = ReservationBlockMode.PERIOD;
      }

      if ('reason' in data) {
        updateData.reason = data.reason ?? null;
      }

      const block = await prisma.reservationBlock.update({
        where: { id },
        data: updateData,
      });

      return res.json(block);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/blocks/:id
 * Remove um bloqueio
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const existing = await prisma.reservationBlock.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Bloqueio não encontrado.',
        });
      }

      await prisma.reservationBlock.delete({ where: { id } });

      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export { router as blocksRouter };
export default router;
