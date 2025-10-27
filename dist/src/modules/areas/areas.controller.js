"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArea = createArea;
exports.updateArea = updateArea;
const client_1 = require("../../infrastructure/db/client");
function toIntOrNull(v) {
    if (v === '' || v === null || typeof v === 'undefined')
        return null;
    const n = Number(v);
    if (!Number.isFinite(n))
        return null;
    return Math.max(0, Math.floor(n));
}
/** POST /v1/areas */
async function createArea(req, res) {
    try {
        const { unitId, name, isActive } = req.body ?? {};
        // aceita camelCase ou snake_case
        const capacityAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
        const capacityNightRaw = req.body?.capacityNight ?? req.body?.capacity_night;
        const capacityAfternoon = toIntOrNull(capacityAfternoonRaw);
        const capacityNight = toIntOrNull(capacityNightRaw);
        if (!unitId)
            return res.status(400).json({ message: 'unitId é obrigatório.' });
        if (!name || !String(name).trim())
            return res.status(400).json({ message: 'name é obrigatório.' });
        // DEBUG curto:
        console.debug('[areas.create] body:', {
            unitId, name, isActive, capacityAfternoonRaw, capacityNightRaw, capacityAfternoon, capacityNight
        });
        const created = await client_1.prisma.area.create({
            data: {
                unitId: String(unitId),
                name: String(name).trim(),
                capacityAfternoon,
                capacityNight,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            },
        });
        console.debug('[areas.create] saved:', {
            id: created.id, capacityAfternoon: created.capacityAfternoon, capacityNight: created.capacityNight
        });
        return res.status(201).json(created);
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro ao criar área.' });
    }
}
/** PUT /v1/areas/:id (aceita subset de campos) */
async function updateArea(req, res) {
    try {
        const { id } = req.params;
        if (!id)
            return res.status(400).json({ message: 'id é obrigatório.' });
        // aceita camelCase ou snake_case
        const capacityAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
        const capacityNightRaw = req.body?.capacityNight ?? req.body?.capacity_night;
        // 1) lê o registro atual para defaults reais
        const current = await client_1.prisma.area.findUnique({
            where: { id: String(id) },
            select: {
                unitId: true,
                name: true,
                isActive: true,
                capacityAfternoon: true,
                capacityNight: true,
            },
        });
        if (!current)
            return res.status(404).json({ message: 'Área não encontrada.' });
        // 2) monta os próximos valores
        const data = {};
        if (req.body?.unitId)
            data.unitId = String(req.body.unitId);
        if (typeof req.body?.name === 'string')
            data.name = String(req.body.name).trim();
        if (typeof req.body?.isActive === 'boolean')
            data.isActive = req.body.isActive;
        // Se veio no body (em qualquer casing), usa; senão mantém o valor atual
        const nextCapacityAfternoon = (('capacityAfternoon' in (req.body ?? {})) || ('capacity_afternoon' in (req.body ?? {})))
            ? toIntOrNull(capacityAfternoonRaw)
            : (current.capacityAfternoon ?? null);
        const nextCapacityNight = (('capacityNight' in (req.body ?? {})) || ('capacity_night' in (req.body ?? {})))
            ? toIntOrNull(capacityNightRaw)
            : (current.capacityNight ?? null);
        // escreve SEMPRE os dois campos, pra evitar “ficar 0”
        data.capacityAfternoon = nextCapacityAfternoon;
        data.capacityNight = nextCapacityNight;
        // capacity diário descontinuado — se vier por engano, zera
        if ('capacity' in (req.body ?? {})) {
            data.capacity = null;
        }
        // DEBUG curto:
        console.debug('[areas.update] body:', {
            id,
            incoming: req.body,
            parsed: { capacityAfternoonRaw, capacityNightRaw },
        });
        console.debug('[areas.update] apply:', {
            nextCapacityAfternoon,
            nextCapacityNight,
            other: { unitId: data.unitId, name: data.name, isActive: data.isActive },
        });
        const updated = await client_1.prisma.area.update({
            where: { id: String(id) },
            data,
        });
        console.debug('[areas.update] saved:', {
            id: updated.id, capacityAfternoon: updated.capacityAfternoon, capacityNight: updated.capacityNight
        });
        return res.json(updated);
    }
    catch (e) {
        console.error(e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ message: 'Área não encontrada.' });
        }
        return res.status(500).json({ message: 'Erro ao atualizar área.' });
    }
}
