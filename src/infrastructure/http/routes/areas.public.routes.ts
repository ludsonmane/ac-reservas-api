// src/infrastructure/http/routes/areas.public.routes.ts
import { Router } from 'express';
import { areasService } from '../../../modules/areas/areas.service';

const router = Router();

/**
 * GET /v1/areas/public/by-unit/:unitId
 * Query: ?date=YYYY-MM-DD (opcional; default = hoje)
 * Retorna: [{ id, name, capacity, available, isAvailable }]
 */
router.get('/by-unit/:unitId', async (req, res, next) => {
  try {
    const unitId = String(req.params.unitId || '');
    const date = String(req.query.date || '');
    const items = await areasService.listByUnitPublic(unitId, date || undefined);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

export { router as areasPublicRouter };
export default router;
