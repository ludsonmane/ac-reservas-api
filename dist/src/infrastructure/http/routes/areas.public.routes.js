"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.areasPublicRouter = void 0;
// src/infrastructure/http/routes/areas.public.routes.ts
const express_1 = require("express");
const areas_service_1 = require("../../../modules/areas/areas.service");
const router = (0, express_1.Router)();
exports.areasPublicRouter = router;
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
        const items = await areas_service_1.areasService.listByUnitPublic(unitId, date || undefined, time);
        return res.json(items);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
