"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.areasRouter = void 0;
// api/src/infrastructure/http/routes/areas.routes.ts
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const requireAuth_1 = require("../middlewares/requireAuth");
exports.areasRouter = (0, express_1.Router)();
/* Utils */
function toIntOrNull(v) {
    if (v === '' || v === null || typeof v === 'undefined')
        return null;
    const n = Number(v);
    if (!Number.isFinite(n))
        return null;
    return Math.max(0, Math.floor(n));
}
/**
 * GET /v1/areas
 * Filtros: page, pageSize, unitId, search, active
 * 🔒 Auth: ADMIN
 */
exports.areasRouter.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const { page = '1', pageSize = '20', unitId, search, active } = req.query;
    const take = Math.max(1, Math.min(200, Number(pageSize)));
    const skip = (Math.max(1, Number(page)) - 1) * take;
    const where = {};
    if (unitId)
        where.unitId = String(unitId);
    if (typeof active !== 'undefined' && active !== '')
        where.isActive = String(active) === 'true';
    if (search?.trim()) {
        const q = search.trim();
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { unit: { name: { contains: q, mode: 'insensitive' } } },
        ];
    }
    const [items, total] = await Promise.all([
        prisma_1.prisma.area.findMany({
            where,
            skip,
            take,
            orderBy: [{ unit: { name: 'asc' } }, { name: 'asc' }],
            include: {
                unit: { select: { id: true, name: true, slug: true } },
            },
        }),
        prisma_1.prisma.area.count({ where }),
    ]);
    res.json({
        items,
        total,
        page: Math.max(1, Number(page)),
        pageSize: take,
        totalPages: Math.ceil(total / take),
    });
});
/**
 * POST /v1/areas
 * body: { unitId: string, name: string, capacityAfternoon?: number|null, capacityNight?: number|null, isActive?: boolean, photoUrl?: string|null }
 * 🔒 Auth: ADMIN
 */
exports.areasRouter.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const { unitId, name, isActive = true, photoUrl } = req.body || {};
    // aceita camelCase e snake_case
    const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
    const capNightRaw = req.body?.capacityNight ?? req.body?.capacity_night;
    if (!unitId)
        return res.status(400).json({ error: 'unitId é obrigatório' });
    if (!name?.trim())
        return res.status(400).json({ error: 'name é obrigatório' });
    const unit = await prisma_1.prisma.unit.findUnique({ where: { id: String(unitId) } });
    if (!unit)
        return res.status(400).json({ error: 'Unidade inexistente' });
    const data = {
        unitId: String(unitId),
        name: String(name).trim(),
        isActive: Boolean(isActive),
    };
    if (typeof photoUrl === 'string')
        data.photoUrl = photoUrl.trim();
    if (capAfternoonRaw !== undefined)
        data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
    if (capNightRaw !== undefined)
        data.capacityNight = toIntOrNull(capNightRaw);
    try {
        const created = await prisma_1.prisma.area.create({ data });
        res.status(201).json(created);
    }
    catch (e) {
        if (String(e?.code) === 'P2002') {
            return res.status(409).json({ error: 'Já existe uma área com esse nome nesta unidade' });
        }
        res.status(400).json({ error: 'Erro ao criar área', details: e?.message });
    }
});
/**
 * GET /v1/areas/:id
 * 🔒 Auth: ADMIN
 */
exports.areasRouter.get('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const a = await prisma_1.prisma.area.findUnique({
        where: { id: String(req.params.id) },
        include: { unit: { select: { id: true, name: true, slug: true } } },
    });
    if (!a)
        return res.status(404).json({ error: 'Área não encontrada' });
    res.json(a);
});
/**
 * PUT /v1/areas/:id
 * body: { unitId?, name?, capacityAfternoon?, capacityNight?, isActive?, photoUrl? }
 * 🔒 Auth: ADMIN
 */
exports.areasRouter.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const { unitId, name, isActive, photoUrl } = req.body || {};
    // aceita camelCase e snake_case para capacidades
    const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
    const capNightRaw = req.body?.capacityNight ?? req.body?.capacity_night;
    const data = {};
    if (typeof unitId !== 'undefined' && unitId !== null && unitId !== '') {
        const unit = await prisma_1.prisma.unit.findUnique({ where: { id: String(unitId) } });
        if (!unit)
            return res.status(400).json({ error: 'Unidade inexistente' });
        data.unitId = String(unitId);
    }
    if (typeof name !== 'undefined') {
        if (!String(name).trim())
            return res.status(400).json({ error: 'name é obrigatório' });
        data.name = String(name).trim();
    }
    if (typeof isActive === 'boolean') {
        data.isActive = isActive;
    }
    if (typeof photoUrl === 'string') {
        data.photoUrl = photoUrl.trim();
    }
    if (capAfternoonRaw !== undefined)
        data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
    if (capNightRaw !== undefined)
        data.capacityNight = toIntOrNull(capNightRaw);
    try {
        const updated = await prisma_1.prisma.area.update({
            where: { id: String(req.params.id) },
            data,
        });
        res.json(updated);
    }
    catch (e) {
        if (String(e?.code) === 'P2025')
            return res.status(404).json({ error: 'Área não encontrada' });
        if (String(e?.code) === 'P2002')
            return res.status(409).json({ error: 'Já existe uma área com esse nome nesta unidade' });
        res.status(400).json({ error: 'Erro ao atualizar área', details: e?.message });
    }
});
/**
 * DELETE /v1/areas/:id
 * Regra: 409 se existir reserva vinculada
 * 🔒 Auth: ADMIN
 */
exports.areasRouter.delete('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const id = String(req.params.id);
    const rCount = await prisma_1.prisma.reservation.count({ where: { areaId: id } });
    if (rCount > 0) {
        return res.status(409).json({ error: 'Não é possível excluir: existem reservas nesta área' });
    }
    try {
        await prisma_1.prisma.area.delete({ where: { id } });
        res.sendStatus(204);
    }
    catch (e) {
        if (String(e?.code) === 'P2025')
            return res.status(404).json({ error: 'Área não encontrada' });
        res.status(400).json({ error: 'Erro ao excluir área', details: e?.message });
    }
});
/**
 * Público — áreas ativas por unidade (para selects do front)
 * GET /v1/areas/public/by-unit/:unitId
 */
exports.areasRouter.get('/public/by-unit/:unitId', async (req, res) => {
    const items = await prisma_1.prisma.area.findMany({
        where: { unitId: String(req.params.unitId), isActive: true },
        select: {
            id: true,
            name: true,
            photoUrl: true,
            capacityAfternoon: true,
            capacityNight: true,
            isActive: true,
        },
        orderBy: { name: 'asc' },
    });
    res.json(items);
});
