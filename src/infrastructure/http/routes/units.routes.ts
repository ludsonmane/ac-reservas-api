// api/src/infrastructure/http/routes/units.routes.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

export const unitsRouter = Router();

function slugify(s: string) {
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
unitsRouter.get('/', async (req, res) => {
  try {
    const schema = z.object({
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).max(100).default(20),
      search: z.string().optional(),
      active: z
        .union([z.literal('true'), z.literal('false')])
        .optional()
        .transform(v => (v === undefined ? undefined : v === 'true')),
    });

    const { page, pageSize, search, active } = schema.parse(req.query);

    const where: any = {};
    if (typeof active === 'boolean') where.isActive = active;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];

    const [total, items] = await Promise.all([
      prisma.unit.count({ where }),
      prisma.unit.findMany({
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
  } catch (e: any) {
    res.status(400).json({ error: 'Invalid query params', details: e?.message });
  }
});

// Opções leves (público) para dropdowns
// GET /v1/units/public/options/list  ->  [{id,name,slug}]
unitsRouter.get('/public/options/list', async (_req, res) => {
  const items = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });
  res.json(items);
});

// Detalhe (público)
// GET /v1/units/:id
unitsRouter.get('/:id', async (req, res) => {
  try {
    const u = await prisma.unit.findUnique({ where: { id: req.params.id } });
    if (!u) return res.sendStatus(404);
    res.json(u);
  } catch {
    res.sendStatus(404);
  }
});

/* -------------------------------------------------
 * ESCRITA PROTEGIDA (STAFF/ADMIN para criar/editar,
 *                    ADMIN para deletar)
 * ------------------------------------------------- */

// Criar
// POST /v1/units
unitsRouter.post(
  '/',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(2, 'Nome muito curto').transform(s => s.trim()),
        slug: z.string().min(2).regex(slugRegex, 'Slug inválido').optional(),
        isActive: z.boolean().optional(),
      });

      const data = schema.parse(req.body);
      const slug = data.slug ? data.slug : slugify(data.name);

      const exists = await prisma.unit.findUnique({ where: { slug } });
      if (exists) {
        return res.status(409).json({ error: 'Slug already in use' });
      }

      const created = await prisma.unit.create({
        data: { name: data.name, slug, isActive: data.isActive ?? true },
      });

      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: 'Invalid payload', details: e?.message });
    }
  }
);

// Atualizar
// PUT /v1/units/:id
unitsRouter.put(
  '/:id',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(2).optional(),
        slug: z.string().min(2).regex(slugRegex, 'Slug inválido').optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      const patch: any = {};
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.slug !== undefined) patch.slug = data.slug;
      if (data.isActive !== undefined) patch.isActive = data.isActive;

      // Se atualizou nome e não passou slug, regera slug
      if (patch.name && data.slug === undefined) {
        patch.slug = slugify(patch.name);
      }

      // Garantir unicidade do slug (se vier explícito ou derivado)
      if (patch.slug) {
        const dupe = await prisma.unit.findUnique({ where: { slug: patch.slug } });
        if (dupe && dupe.id !== req.params.id) {
          return res.status(409).json({ error: 'Slug already in use' });
        }
      }

      const updated = await prisma.unit.update({
        where: { id: req.params.id },
        data: patch,
      });

      res.json(updated);
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.sendStatus(404);
      res.status(400).json({ error: 'Invalid payload', details: e?.message });
    }
  }
);

// Remover (bloqueia se houver reservas associadas)
// DELETE /v1/units/:id
unitsRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const id = req.params.id;

      const count = await prisma.reservation.count({ where: { unitId: id } });
      if (count > 0) {
        return res.status(409).json({ error: 'Unit has linked reservations' });
      }

      await prisma.unit.delete({ where: { id } });
      res.sendStatus(204);
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.sendStatus(404);
      res.status(400).json({ error: 'Delete failed', details: e?.message });
    }
  }
);
