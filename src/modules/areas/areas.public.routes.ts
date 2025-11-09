// src/modules/areas/areas.public.routes.ts
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { areasService } from './areas.service';

const router = Router();

/**
 * GET /v1/areas/public/by-unit/:unitId
 * Lista estática de áreas por unidade (SEM cálculo de disponibilidade).
 * Deve incluir: id, name, photoUrl, capacityAfternoon, capacityNight, isActive,
 * e também description e iconEmoji (desde que o service selecione esses campos).
 */
router.get(
  '/by-unit/:unitId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { unitId } = req.params;
      const date =
        typeof req.query.date === 'string' ? (req.query.date as string) : undefined;
      const time =
        typeof req.query.time === 'string' ? (req.query.time as string) : undefined;

      if (!unitId) {
        return res.status(400).json({ message: 'unitId é obrigatório.' });
      }

      const list = await areasService.listByUnitPublic(String(unitId), date, time);
      // cache curtinho, opcional
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
      return res.json(list);
    } catch (e) {
      return next(e);
    }
  }
);

export default router;
