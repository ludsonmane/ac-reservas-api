import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/db/prisma';

const BodySchema = z.object({
  unitId: z.string().trim().min(1),
  areaId: z.string().trim().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  mode: z.enum(['PERIOD', 'SLOTS']),
  period: z.enum(['AFTERNOON', 'NIGHT', 'ALL_DAY']).optional(), // quando PERIOD
  slots: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(), // quando SLOTS
  reason: z.string().trim().max(255).optional(),
});

function brDate(ymd: string) {
  return new Date(`${ymd}T00:00:00.000-03:00`);
}

export class AdminBlocksController {
  static mount(app: Router) {
    // LIST
    app.get('/v1/admin/blocks', async (req: Request, res: Response) => {
      const unitId = String(req.query.unitId || '').trim();
      const date = String(req.query.date || '').trim();
      const areaIdRaw = String(req.query.areaId ?? '').trim();
      const areaId = areaIdRaw ? areaIdRaw : undefined;

      if (!unitId) return res.status(400).json({ error: 'Missing unitId' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Missing/invalid date' });

      const items = await prisma.reservationBlock.findMany({
        where: {
          unitId,
          date: brDate(date),
          ...(areaId ? { OR: [{ areaId: null }, { areaId }] } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(items);
    });

    // CREATE
    app.post('/v1/admin/blocks', async (req: Request, res: Response) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const b = parsed.data;

      if (b.mode === 'PERIOD' && !b.period) {
        return res.status(400).json({ error: 'period required for PERIOD mode' });
      }
      if (b.mode === 'SLOTS' && (!b.slots || b.slots.length === 0)) {
        return res.status(400).json({ error: 'slots required for SLOTS mode' });
      }

      const created = await prisma.reservationBlock.create({
        data: {
          unitId: b.unitId,
          areaId: b.areaId ?? null,
          date: brDate(b.date),
          mode: b.mode as any,
          period: (b.period ?? null) as any,
          slots: b.mode === 'SLOTS' ? (b.slots as any) : undefined,
          reason: b.reason ?? null,
          createdBy: (req as any)?.user?.id ?? null, // se tiver auth
        },
      });

      return res.status(201).json(created);
    });

    // DELETE
    app.delete('/v1/admin/blocks/:id', async (req: Request, res: Response) => {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Missing id' });
      await prisma.reservationBlock.delete({ where: { id } });
      return res.sendStatus(204);
    });
  }
}
