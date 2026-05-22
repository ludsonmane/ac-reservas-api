// src/infrastructure/http/routes/blocks.recurring.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

const router = Router();

const TIME_RE = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

const createSchema = z.object({
  unitId: z.string().min(1),
  areaId: z.string().min(1).nullable().optional(),
  dow: z.number().int().min(0).max(6),
  fromTime: z.string().regex(TIME_RE, 'fromTime deve estar no formato HH:mm'),
  toTime: z.string().regex(TIME_RE, 'toTime deve estar no formato HH:mm'),
  reason: z.string().max(255).optional().nullable(),
}).refine((d) => d.fromTime < d.toTime, {
  message: 'fromTime deve ser menor que toTime',
  path: ['fromTime'],
});

const updateSchema = z.object({
  unitId: z.string().min(1).optional(),
  areaId: z.string().min(1).nullable().optional(),
  dow: z.number().int().min(0).max(6).optional(),
  fromTime: z.string().regex(TIME_RE).optional(),
  toTime: z.string().regex(TIME_RE).optional(),
  reason: z.string().max(255).nullable().optional(),
});

const listQuerySchema = z.object({
  unitId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
});

function serialize(b: any) {
  return {
    id: b.id,
    unitId: b.unitId,
    unitName: b.unit?.name ?? null,
    areaId: b.areaId,
    areaName: b.area?.name ?? null,
    dow: b.dow,
    fromTime: b.fromTime,
    toTime: b.toTime,
    reason: b.reason,
    createdBy: b.createdBy,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
  };
}

/* ========================
 * ADMIN
 * ======================== */

router.get(
  '/',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_QUERY', details: parsed.error.flatten() },
        });
      }
      const { unitId, areaId } = parsed.data;
      const where: any = {};
      if (unitId) where.unitId = unitId;
      if (areaId) where.areaId = areaId;

      const items = await prisma.reservationRecurringBlock.findMany({
        where,
        orderBy: [{ unitId: 'asc' }, { dow: 'asc' }, { fromTime: 'asc' }],
        include: {
          unit: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      });
      return res.json(items.map(serialize));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req: any, res, next) => {
    try {
      const data = createSchema.parse(req.body);
      const created = await prisma.reservationRecurringBlock.create({
        data: {
          unitId: data.unitId,
          areaId: data.areaId ?? null,
          dow: data.dow,
          fromTime: data.fromTime,
          toTime: data.toTime,
          reason: data.reason ?? null,
          createdBy: req.user?.id ?? null,
        },
        include: {
          unit: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      });
      return res.status(201).json(serialize(created));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = updateSchema.parse(req.body);

      const existing = await prisma.reservationRecurringBlock.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      const next = { ...existing, ...data };
      if (next.fromTime >= next.toTime) {
        return res.status(400).json({
          error: { message: 'fromTime deve ser menor que toTime' },
        });
      }

      const updateData: any = {};
      if (data.unitId) updateData.unitId = data.unitId;
      if ('areaId' in data) updateData.areaId = data.areaId ?? null;
      if (typeof data.dow === 'number') updateData.dow = data.dow;
      if (data.fromTime) updateData.fromTime = data.fromTime;
      if (data.toTime) updateData.toTime = data.toTime;
      if ('reason' in data) updateData.reason = data.reason ?? null;

      const updated = await prisma.reservationRecurringBlock.update({
        where: { id },
        data: updateData,
        include: {
          unit: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      });
      return res.json(serialize(updated));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'STAFF']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const existing = await prisma.reservationRecurringBlock.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      await prisma.reservationRecurringBlock.delete({ where: { id } });
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export { router as blocksRecurringRouter };
export default router;
