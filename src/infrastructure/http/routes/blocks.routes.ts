// src/infrastructure/http/routes/blocks.routes.ts
import { Router } from 'express';
import dayjs from 'dayjs';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { ReservationBlockMode, ReservationBlockPeriod } from '@prisma/client';

const router = Router();

const bodySchema = z.object({
  unitId: z.string().min(1),
  areaId: z.string().min(1).nullable().optional(), // null = todas as áreas
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),    // YYYY-MM-DD
  period: z.enum(['AFTERNOON', 'NIGHT', 'ALL_DAY']),
  reason: z.string().max(255).optional(),
});

router.post('/period', requireAuth, requireRole(['ADMIN', 'STAFF']), async (req, res, next) => {
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
});

const listQuerySchema = z.object({
  unitId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /v1/blocks/period
 * Lista bloqueios de período (mode = PERIOD).
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
        date: b.date.toISOString(),
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

export { router as blocksRouter };
export default router;
