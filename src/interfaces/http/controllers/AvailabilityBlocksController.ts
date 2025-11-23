import type { Request, Response } from 'express';
import { prisma } from '../../../infrastructure/db/prisma';
import dayjs from 'dayjs';
import { z } from 'zod';

const CreateSchema = z.object({
  unitId: z.string().min(1),
  areaId: z.string().min(1).optional().nullable(),
  date: z.string().min(8), // YYYY-MM-DD
  mode: z.enum(['PERIOD', 'SLOTS']),
  period: z.enum(['AFTERNOON', 'NIGHT', 'ALL_DAY']).optional(),
  slots: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  reason: z.string().optional(),
  createdBy: z.string().optional(),
});

export class AvailabilityBlocksController {
  // POST /v1/admin/availability/blocks
  create = async (req: Request, res: Response) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const b = parsed.data;
    const date = dayjs(b.date).startOf('day').toDate();

    if (b.mode === 'PERIOD' && !b.period) {
      return res.status(400).json({ error: 'PERIOD_REQUIRED' });
    }
    if (b.mode === 'SLOTS' && (!b.slots || b.slots.length === 0)) {
      return res.status(400).json({ error: 'SLOTS_REQUIRED' });
    }

    const created = await prisma.reservationBlock.create({
      data: {
        unitId: b.unitId,
        areaId: b.areaId ?? null,
        date,
        mode: b.mode as any,
        period: (b.mode === 'PERIOD' ? b.period! : null) as any,
        slots: (b.mode === 'SLOTS' ? b.slots! : null),
        reason: b.reason ?? null,
        createdBy: b.createdBy ?? null,
      },
    });

    return res.status(201).json(created);
  };

  // GET /v1/admin/availability/blocks?unitId&from&to&areaId
  list = async (req: Request, res: Response) => {
    const unitId = String(req.query.unitId ?? '').trim();
    const areaId = String(req.query.areaId ?? '').trim() || undefined;
    const from = req.query.from ? dayjs(String(req.query.from)).startOf('day').toDate() : undefined;
    const to   = req.query.to   ? dayjs(String(req.query.to)).startOf('day').toDate()   : undefined;

    const where: any = {};
    if (unitId) where.unitId = unitId;
    if (areaId) where.areaId = areaId;
    if (from || to) where.date = {};
    if (from) (where.date as any).gte = from;
    if (to)   (where.date as any).lte = to;

    const items = await prisma.reservationBlock.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json(items);
  };

  // DELETE /v1/admin/availability/blocks/:id
  delete = async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'MISSING_ID' });

    await prisma.reservationBlock.delete({ where: { id } });
    return res.sendStatus(204);
  };
}
