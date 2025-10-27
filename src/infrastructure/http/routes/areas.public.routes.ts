// src/infrastructure/http/routes/areas.public.routes.ts
import { Router } from 'express';
import { areasService } from '../../../modules/areas/areas.service';

const router = Router();

/**
 * GET /v1/areas/public/by-unit/:unitId
 * Query:
 *   - date=YYYY-MM-DD (opcional; se vazio, service decide o default)
 *   - time=HH:mm      (opcional; usado para calcular o período e disponibilidade)
 *
 * Retorna: [{ id, name, capacity, available, isAvailable, ... }]
 */
router.get('/by-unit/:unitId', async (req, res, next) => {
  try {
    const unitId = String(req.params.unitId || '').trim();
    const date = (req.query.date ? String(req.query.date) : '').trim();
    const time = (req.query.time ? String(req.query.time) : '').trim() || undefined;

    if (!unitId) {
      return res.status(400).json({ error: { message: 'unitId é obrigatório' } });
    }

    const items = await areasService.listByUnitPublic(unitId, date || undefined, time);
    return res.json(items);
  } catch (err) {
    next(err);
  }
});

export { router as areasPublicRouter };
export default router;
