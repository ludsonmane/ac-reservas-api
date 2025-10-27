// src/modules/areas/areas.public.routes.ts
import { Router } from 'express';
import { areasService } from './areas.service';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// Outras rotas públicas de áreas (se houver) podem ficar aqui.
// Rota estática: lista áreas por unidade (sem disponibilidade)
router.get('/by-unit/:unitId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { unitId } = req.params;
        const date = typeof req.query.date === 'string' ? req.query.date : undefined;
        const time = typeof req.query.time === 'string' ? req.query.time : undefined;
        const list = await areasService.listByUnitPublic(String(unitId), date, time);
        res.json(list);
    } catch (e) {
        next(e);
    }
});

export default router;
