"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unitsRouter = void 0;
// api/src/infrastructure/http/routes/units.routes.ts
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const zod_1 = require("zod");
const requireAuth_1 = require("../middlewares/requireAuth");
exports.unitsRouter = (0, express_1.Router)();
function slugify(s) {
    return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/* -------------------------------------------------
 * LEITURA PÚBLICA
 * ------------------------------------------------- */
// Lista paginada (pública)
// GET /v1/units?search=&page=&pageSize=&active=
exports.unitsRouter.get('/', async (req, res) => {
    try {
        const schema = zod_1.z.object({
            page: zod_1.z.coerce.number().min(1).default(1),
            pageSize: zod_1.z.coerce.number().min(1).max(100).default(20),
            search: zod_1.z.string().optional(),
            active: zod_1.z
                .union([zod_1.z.literal('true'), zod_1.z.literal('false')])
                .optional()
                .transform(v => (v === undefined ? undefined : v === 'true')),
        });
        const { page, pageSize, search, active } = schema.parse(req.query);
        const where = {};
        if (typeof active === 'boolean')
            where.isActive = active;
        if (search)
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        const [total, items] = await Promise.all([
            prisma_1.prisma.unit.count({ where }),
            prisma_1.prisma.unit.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        res.json({
            items,
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        });
    }
    catch (e) {
        res.status(400).json({ error: 'Invalid query params', details: e?.message });
    }
});
// Opções leves (público) para dropdowns
// GET /v1/units/public/options/list  ->  [{id,name,slug}]
exports.unitsRouter.get('/public/options/list', async (_req, res) => {
    const items = await prisma_1.prisma.unit.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
    });
    res.json(items);
});
// Detalhe (público)
// GET /v1/units/:id
exports.unitsRouter.get('/:id', async (req, res) => {
    try {
        const u = await prisma_1.prisma.unit.findUnique({ where: { id: req.params.id } });
        if (!u)
            return res.sendStatus(404);
        res.json(u);
    }
    catch {
        res.sendStatus(404);
    }
});
/* -------------------------------------------------
 * ESCRITA PROTEGIDA (STAFF/ADMIN para criar/editar,
 *                    ADMIN para deletar)
 * ------------------------------------------------- */
// Criar
// POST /v1/units
exports.unitsRouter.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2, 'Nome muito curto').transform(s => s.trim()),
            slug: zod_1.z.string().min(2).regex(slugRegex, 'Slug inválido').optional(),
            isActive: zod_1.z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const slug = data.slug ? data.slug : slugify(data.name);
        const exists = await prisma_1.prisma.unit.findUnique({ where: { slug } });
        if (exists) {
            return res.status(409).json({ error: 'Slug already in use' });
        }
        const created = await prisma_1.prisma.unit.create({
            data: { name: data.name, slug, isActive: data.isActive ?? true },
        });
        res.status(201).json(created);
    }
    catch (e) {
        res.status(400).json({ error: 'Invalid payload', details: e?.message });
    }
});
// Atualizar
// PUT /v1/units/:id
exports.unitsRouter.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), async (req, res) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2).optional(),
            slug: zod_1.z.string().min(2).regex(slugRegex, 'Slug inválido').optional(),
            isActive: zod_1.z.boolean().optional(),
        });
        const data = schema.parse(req.body);
        const patch = {};
        if (data.name !== undefined)
            patch.name = data.name.trim();
        if (data.slug !== undefined)
            patch.slug = data.slug;
        if (data.isActive !== undefined)
            patch.isActive = data.isActive;
        // Se atualizou nome e não passou slug, regera slug
        if (patch.name && data.slug === undefined) {
            patch.slug = slugify(patch.name);
        }
        // Garantir unicidade do slug (se vier explícito ou derivado)
        if (patch.slug) {
            const dupe = await prisma_1.prisma.unit.findUnique({ where: { slug: patch.slug } });
            if (dupe && dupe.id !== req.params.id) {
                return res.status(409).json({ error: 'Slug already in use' });
            }
        }
        const updated = await prisma_1.prisma.unit.update({
            where: { id: req.params.id },
            data: patch,
        });
        res.json(updated);
    }
    catch (e) {
        if (String(e?.code) === 'P2025')
            return res.sendStatus(404);
        res.status(400).json({ error: 'Invalid payload', details: e?.message });
    }
});
// Remover (bloqueia se houver reservas associadas)
// DELETE /v1/units/:id
exports.unitsRouter.delete('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        const count = await prisma_1.prisma.reservation.count({ where: { unitId: id } });
        if (count > 0) {
            return res.status(409).json({ error: 'Unit has linked reservations' });
        }
        await prisma_1.prisma.unit.delete({ where: { id } });
        res.sendStatus(204);
    }
    catch (e) {
        if (String(e?.code) === 'P2025')
            return res.sendStatus(404);
        res.status(400).json({ error: 'Delete failed', details: e?.message });
    }
});
