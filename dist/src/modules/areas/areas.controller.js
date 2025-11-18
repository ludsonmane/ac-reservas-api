"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArea = createArea;
exports.updateArea = updateArea;
// src/api/controllers/AreaController.ts
const client_1 = require("../../infrastructure/db/client");
function toIntOrNull(v) {
    if (v === '' || v === null || typeof v === 'undefined')
        return null;
    const n = Number(v);
    if (!Number.isFinite(n))
        return null;
    return Math.max(0, Math.floor(n));
}
function strOrNull(v) {
    if (v === null || typeof v === 'undefined')
        return null;
    const s = String(v).trim();
    return s.length ? s : null;
}
function sanitizeEmoji(v) {
    const s = strOrNull(v);
    if (!s)
        return null;
    // evita textos gigantes/HTML; emoji costuma ter 1–3 code points
    return s.slice(0, 8);
}
/** POST /v1/areas */
async function createArea(req, res) {
    try {
        const { unitId, name, isActive } = req.body ?? {};
        // aceita camelCase ou snake_case
        const capacityAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
        const capacityNightRaw = req.body?.capacityNight ?? req.body?.capacity_night;
        const descriptionRaw = req.body?.description ?? req.body?.desc ?? req.body?.area_description;
        const iconEmojiRaw = req.body?.iconEmoji ?? req.body?.icon_emoji;
        const photoUrlRaw = req.body?.photoUrl ?? req.body?.photo_url ?? req.body?.photo;
        const capacityAfternoon = toIntOrNull(capacityAfternoonRaw);
        const capacityNight = toIntOrNull(capacityNightRaw);
        const description = strOrNull(descriptionRaw);
        const iconEmoji = sanitizeEmoji(iconEmojiRaw);
        const photoUrl = strOrNull(photoUrlRaw);
        if (!unitId)
            return res.status(400).json({ message: 'unitId é obrigatório.' });
        if (!name || !String(name).trim())
            return res.status(400).json({ message: 'name é obrigatório.' });
        // DEBUG curto:
        console.debug('[areas.create] body:', {
            unitId, name, isActive, capacityAfternoon, capacityNight, description, iconEmoji, photoUrl
        });
        const created = await client_1.prisma.area.create({
            data: {
                unitId: String(unitId),
                name: String(name).trim(),
                capacityAfternoon,
                capacityNight,
                isActive: typeof isActive === 'boolean' ? isActive : true,
                description, // 👈 novo
                iconEmoji, // 👈 novo
                photoUrl, // 👈 novo
            },
            select: {
                id: true, unitId: true, name: true, isActive: true,
                capacityAfternoon: true, capacityNight: true,
                description: true, iconEmoji: true, photoUrl: true, // 👈 retornar no payload
                createdAt: true, updatedAt: true,
            },
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
        const descriptionRaw = req.body?.description ?? req.body?.desc ?? req.body?.area_description;
        const iconEmojiRaw = req.body?.iconEmoji ?? req.body?.icon_emoji;
        const photoUrlRaw = req.body?.photoUrl ?? req.body?.photo_url ?? req.body?.photo;
        // 1) lê o registro atual para defaults reais
        const current = await client_1.prisma.area.findUnique({
            where: { id: String(id) },
            select: {
                unitId: true,
                name: true,
                isActive: true,
                capacityAfternoon: true,
                capacityNight: true,
                description: true,
                iconEmoji: true,
                photoUrl: true,
            },
        });
        if (!current)
            return res.status(404).json({ message: 'Área não encontrada.' });
        // 2) monta os próximos valores
        const data = {};
        if ('unitId' in (req.body ?? {}))
            data.unitId = strOrNull(req.body.unitId);
        if ('name' in (req.body ?? {}))
            data.name = strOrNull(req.body.name);
        if (typeof req.body?.isActive === 'boolean')
            data.isActive = req.body.isActive;
        // capacity: se veio no body (qualquer casing), usa; senão mantém atual
        const hasCapAfternoon = ('capacityAfternoon' in (req.body ?? {})) || ('capacity_afternoon' in (req.body ?? {}));
        const hasCapNight = ('capacityNight' in (req.body ?? {})) || ('capacity_night' in (req.body ?? {}));
        data.capacityAfternoon = hasCapAfternoon ? toIntOrNull(capacityAfternoonRaw) : (current.capacityAfternoon ?? null);
        data.capacityNight = hasCapNight ? toIntOrNull(capacityNightRaw) : (current.capacityNight ?? null);
        // campos novos: se vieram, aplica; se não vieram, mantém atual
        const hasDescription = ('description' in (req.body ?? {})) || ('desc' in (req.body ?? {})) || ('area_description' in (req.body ?? {}));
        const hasIconEmoji = ('iconEmoji' in (req.body ?? {})) || ('icon_emoji' in (req.body ?? {}));
        const hasPhotoUrl = ('photoUrl' in (req.body ?? {})) || ('photo_url' in (req.body ?? {})) || ('photo' in (req.body ?? {}));
        if (hasDescription)
            data.description = strOrNull(descriptionRaw);
        if (hasIconEmoji)
            data.iconEmoji = sanitizeEmoji(iconEmojiRaw);
        if (hasPhotoUrl)
            data.photoUrl = strOrNull(photoUrlRaw);
        // capacity diário descontinuado — se vier por engano, zera
        if ('capacity' in (req.body ?? {})) {
            data.capacity = null;
        }
        // remove chaves indefinidas (evita set undefined no prisma)
        Object.keys(data).forEach((k) => {
            if (typeof data[k] === 'undefined')
                delete data[k];
        });
        // DEBUG curto:
        console.debug('[areas.update] apply:', data);
        const updated = await client_1.prisma.area.update({
            where: { id: String(id) },
            data,
            select: {
                id: true, unitId: true, name: true, isActive: true,
                capacityAfternoon: true, capacityNight: true,
                description: true, iconEmoji: true, photoUrl: true, // 👈 retornar no payload
                createdAt: true, updatedAt: true,
            },
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
