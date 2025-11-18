"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/areas/areas.public.routes.ts
const express_1 = require("express");
const areas_service_1 = require("./areas.service");
const router = (0, express_1.Router)();
/**
 * GET /v1/areas/public/by-unit/:unitId
 * Lista estática de áreas por unidade (SEM cálculo de disponibilidade).
 * Deve incluir: id, name, photoUrl, capacityAfternoon, capacityNight, isActive,
 * e também description e iconEmoji (desde que o service selecione esses campos).
 */
router.get('/by-unit/:unitId', async (req, res, next) => {
    try {
        const { unitId } = req.params;
        const date = typeof req.query.date === 'string' ? req.query.date : undefined;
        const time = typeof req.query.time === 'string' ? req.query.time : undefined;
        if (!unitId) {
            return res.status(400).json({ message: 'unitId é obrigatório.' });
        }
        const list = await areas_service_1.areasService.listByUnitPublic(String(unitId), date, time);
        // cache curtinho, opcional
        res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
        return res.json(list);
    }
    catch (e) {
        return next(e);
    }
});
exports.default = router;
