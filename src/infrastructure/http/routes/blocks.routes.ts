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

export { router as blocksRouter };
export default router;
