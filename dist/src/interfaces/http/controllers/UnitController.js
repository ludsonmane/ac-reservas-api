"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnitController = void 0;
const prisma_1 = require("../../../infrastructure/db/prisma");
const unit_dto_1 = require("../dtos/unit.dto");
function slugify(s) {
    return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}
class UnitController {
    static async list(req, res) {
        const page = Math.max(1, parseInt(String(req.query.page || '1')));
        const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '10'))));
        const search = String(req.query.search || '').trim();
        const where = search
            ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
            : {};
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
    static async getById(req, res) {
        const id = req.params.id;
        const unit = await prisma_1.prisma.unit.findUnique({ where: { id } });
        if (!unit)
            return res.sendStatus(404);
        res.json(unit);
    }
    static async create(req, res) {
        const parsed = unit_dto_1.UnitCreateDTO.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
        }
        const { name, slug: incoming, isActive } = parsed.data;
        const slug = (incoming && incoming.trim()) || slugify(name);
        const exists = await prisma_1.prisma.unit.findUnique({ where: { slug } });
        if (exists)
            return res.status(409).json({ error: 'Slug already in use' });
        const created = await prisma_1.prisma.unit.create({
            data: { name, slug, isActive: isActive ?? true },
        });
        res.status(201).json(created);
    }
    static async update(req, res) {
        const id = req.params.id;
        const parsed = unit_dto_1.UnitUpdateDTO.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
        }
        const data = { ...parsed.data };
        if (data.name && !data.slug)
            data.slug = slugify(data.name);
        // Se veio slug, garantir unicidade
        if (data.slug) {
            const dupe = await prisma_1.prisma.unit.findUnique({ where: { slug: data.slug } });
            if (dupe && dupe.id !== id) {
                return res.status(409).json({ error: 'Slug already in use' });
            }
        }
        try {
            const updated = await prisma_1.prisma.unit.update({
                where: { id },
                data,
            });
            res.json(updated);
        }
        catch {
            res.sendStatus(404);
        }
    }
    static async delete(req, res) {
        const id = req.params.id;
        // Regra: impedir delete se houver reservas associadas
        const count = await prisma_1.prisma.reservation.count({ where: { unitId: id } });
        if (count > 0) {
            return res.status(409).json({ error: 'Unit has linked reservations' });
        }
        try {
            await prisma_1.prisma.unit.delete({ where: { id } });
            res.sendStatus(204);
        }
        catch {
            res.sendStatus(404);
        }
    }
}
exports.UnitController = UnitController;
