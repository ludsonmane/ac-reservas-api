// api/src/infrastructure/http/routes/areas.routes.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

export const areasRouter = Router();

/* Utils */
function toIntOrNull(v: unknown): number | null {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * GET /v1/areas
 * Filtros: page, pageSize, unitId, search, active
 * 🔒 Auth: ADMIN
 */
areasRouter.get('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { page = '1', pageSize = '20', unitId, search, active } = req.query as Record<string, string>;
  const take = Math.max(1, Math.min(200, Number(pageSize)));
  const skip = (Math.max(1, Number(page)) - 1) * take;

  const where: any = {};
  if (unitId) where.unitId = String(unitId);
  if (typeof active !== 'undefined' && active !== '') where.isActive = String(active) === 'true';
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { unit: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.area.findMany({
      where,
      skip,
      take,
      orderBy: [{ unit: { name: 'asc' } }, { name: 'asc' }],
      include: {
        unit: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.area.count({ where }),
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
areasRouter.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { unitId, name, isActive = true, photoUrl } = req.body || {};

  // aceita camelCase e snake_case
  const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
  const capNightRaw     = req.body?.capacityNight     ?? req.body?.capacity_night;

  if (!unitId) return res.status(400).json({ error: 'unitId é obrigatório' });
  if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });

  const unit = await prisma.unit.findUnique({ where: { id: String(unitId) } });
  if (!unit) return res.status(400).json({ error: 'Unidade inexistente' });

  const data: any = {
    unitId: String(unitId),
    name: String(name).trim(),
    isActive: Boolean(isActive),
  };

  if (typeof photoUrl === 'string') data.photoUrl = photoUrl.trim();
  if (capAfternoonRaw !== undefined) data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
  if (capNightRaw !== undefined)     data.capacityNight     = toIntOrNull(capNightRaw);

  try {
    const created = await prisma.area.create({ data });
    res.status(201).json(created);
  } catch (e: any) {
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
areasRouter.get('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const a = await prisma.area.findUnique({
    where: { id: String(req.params.id) },
    include: { unit: { select: { id: true, name: true, slug: true } } },
  });
  if (!a) return res.status(404).json({ error: 'Área não encontrada' });
  res.json(a);
});

/**
 * PUT /v1/areas/:id
 * body: { unitId?, name?, capacityAfternoon?, capacityNight?, isActive?, photoUrl? }
 * 🔒 Auth: ADMIN
 */
areasRouter.put('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { unitId, name, isActive, photoUrl } = req.body || {};

  // aceita camelCase e snake_case para capacidades
  const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
  const capNightRaw     = req.body?.capacityNight     ?? req.body?.capacity_night;

  const data: any = {};

  if (typeof unitId !== 'undefined' && unitId !== null && unitId !== '') {
    const unit = await prisma.unit.findUnique({ where: { id: String(unitId) } });
    if (!unit) return res.status(400).json({ error: 'Unidade inexistente' });
    data.unitId = String(unitId);
  }

  if (typeof name !== 'undefined') {
    if (!String(name).trim()) return res.status(400).json({ error: 'name é obrigatório' });
    data.name = String(name).trim();
  }

  if (typeof isActive === 'boolean') {
    data.isActive = isActive;
  }

  if (typeof photoUrl === 'string') {
    data.photoUrl = photoUrl.trim();
  }

  if (capAfternoonRaw !== undefined) data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
  if (capNightRaw !== undefined)     data.capacityNight     = toIntOrNull(capNightRaw);

  try {
    const updated = await prisma.area.update({
      where: { id: String(req.params.id) },
      data,
    });
    res.json(updated);
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Área não encontrada' });
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'Já existe uma área com esse nome nesta unidade' });
    res.status(400).json({ error: 'Erro ao atualizar área', details: e?.message });
  }
});

/**
 * DELETE /v1/areas/:id
 * Regra: 409 se existir reserva vinculada
 * 🔒 Auth: ADMIN
 */
areasRouter.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const id = String(req.params.id);

  const rCount = await prisma.reservation.count({ where: { areaId: id } });
  if (rCount > 0) {
    return res.status(409).json({ error: 'Não é possível excluir: existem reservas nesta área' });
  }

  try {
    await prisma.area.delete({ where: { id } });
    res.sendStatus(204);
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Área não encontrada' });
    res.status(400).json({ error: 'Erro ao excluir área', details: e?.message });
  }
});

/**
 * Público — áreas ativas por unidade (para selects do front)
 * GET /v1/areas/public/by-unit/:unitId
 */
areasRouter.get('/public/by-unit/:unitId', async (req, res) => {
  const items = await prisma.area.findMany({
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
