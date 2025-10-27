"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/areas/areas.public.routes.ts
const express_1 = require("express");
const areas_service_1 = require("./areas.service");
const router = (0, express_1.Router)();
// Outras rotas públicas de áreas (se houver) podem ficar aqui.
// Rota estática: lista áreas por unidade (sem disponibilidade)
router.get('/by-unit/:unitId', async (req, res, next) => {
    try {
        const { unitId } = req.params;
        const date = typeof req.query.date === 'string' ? req.query.date : undefined;
        const time = typeof req.query.time === 'string' ? req.query.time : undefined;
        const list = await areas_service_1.areasService.listByUnitPublic(String(unitId), date, time);
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
