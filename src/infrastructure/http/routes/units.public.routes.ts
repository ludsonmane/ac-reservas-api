// src/infrastructure/http/routes/units.public.routes.ts
import { Router } from 'express';
import { unitsService } from '../../../modules/units/units.service';

const router = Router();

// GET /v1/units/public/options/list

router.get('/options/list', async (_req, res, next) => {
  try {
    const items = await unitsService.listPublicOptions();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

export { router as unitsPublicRouter };
export default router;
