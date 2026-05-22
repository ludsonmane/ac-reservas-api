// src/infrastructure/http/routes/blocks.public.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client';

const router = Router();

const querySchema = z.object({
  unitId: z.string().min(1),
});

router.get('/recurring', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'INVALID_QUERY', message: 'unitId é obrigatório.' },
      });
    }

    const { unitId } = parsed.data;
    const items = await prisma.reservationRecurringBlock.findMany({
      where: { unitId },
      select: {
        id: true,
        unitId: true,
        areaId: true,
        dow: true,
        fromTime: true,
        toTime: true,
        reason: true,
      },
      orderBy: [{ dow: 'asc' }, { fromTime: 'asc' }],
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(items);
  } catch (err) {
    next(err);
  }
});

export { router as blocksPublicRouter };
export default router;
