// src/modules/areas/areas.public.routes.ts
import { Router } from 'express';
import { getAreasByUnitPublic } from './areas.controller';

const router = Router();

// Outras rotas públicas de áreas (se houver) podem ficar aqui.
// Rota estática: lista áreas por unidade (sem disponibilidade)
router.get('/by-unit/:unitId', getAreasByUnitPublic);

export default router;
