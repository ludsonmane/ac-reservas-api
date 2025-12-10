// api/src/interfaces/http/controllers/UnitController.ts
import { Request, Response } from 'express';
import { prisma } from '../../../infrastructure/db/prisma';
import { UnitCreateDTO, UnitUpdateDTO } from '../dtos/unit.dto';

function slugify(s: string) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export class UnitController {
  static async list(req: Request, res: Response) {
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '10'))));
    const search = String(req.query.search || '').trim();

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
      : {};

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
  }

  static async getById(req: Request, res: Response) {
    const id = req.params.id;
    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) return res.sendStatus(404);
    res.json(unit);
  }

  static async create(req: Request, res: Response) {
    const parsed = UnitCreateDTO.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    }
    const { name, slug: incoming, isActive } = parsed.data;
    const slug = (incoming && incoming.trim()) || slugify(name);

    const exists = await prisma.unit.findUnique({ where: { slug } });
    if (exists) return res.status(409).json({ error: 'Slug already in use' });

    const created = await prisma.unit.create({
      data: { name, slug, isActive: isActive ?? true },
    });

    res.status(201).json(created);
  }

  static async update(req: Request, res: Response) {
    const id = req.params.id;
    const parsed = UnitUpdateDTO.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    }

    const data: any = { ...parsed.data };
    if (data.name && !data.slug) data.slug = slugify(data.name);

    // Se veio slug, garantir unicidade
    if (data.slug) {
      const dupe = await prisma.unit.findUnique({ where: { slug: data.slug } });
      if (dupe && dupe.id !== id) {
        return res.status(409).json({ error: 'Slug already in use' });
      }
    }

    try {
      const updated = await prisma.unit.update({
        where: { id },
        data,
      });
      res.json(updated);
    } catch {
      res.sendStatus(404);
    }
  }

  static async delete(req: Request, res: Response) {
    const id = req.params.id;

    // Regra: impedir delete se houver reservas associadas
    const count = await prisma.reservation.count({ where: { unitId: id } });
    if (count > 0) {
      return res.status(409).json({ error: 'Unit has linked reservations' });
    }

    try {
      await prisma.unit.delete({ where: { id } });
      res.sendStatus(204);
    } catch {
      res.sendStatus(404);
    }
  }
}
