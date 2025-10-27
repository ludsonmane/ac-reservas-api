"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unitsPublicRouter = void 0;
// src/infrastructure/http/routes/units.public.routes.ts
const express_1 = require("express");
const units_service_1 = require("../../../modules/units/units.service");
const router = (0, express_1.Router)();
exports.unitsPublicRouter = router;
// GET /v1/units/public/options/list
router.get('/options/list', async (_req, res, next) => {
    try {
        const items = await units_service_1.unitsService.listPublicOptions();
        res.json(items);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
