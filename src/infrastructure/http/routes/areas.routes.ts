// api/src/infrastructure/http/routes/areas.routes.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

export const areasRouter = Router();

/* ---------- URL helper p/ imagem absoluta (S3/CDN) ---------- */
function toAbsoluteMedia(pathOrNull?: string | null): string | null {
  if (!pathOrNull) return null;
  if (/^https?:\/\//i.test(pathOrNull)) return pathOrNull; // já é absoluto
  const base = (process.env.S3_PUBLIC_URL_BASE || '').replace(/\/+$/, '');
  if (!base) return pathOrNull; // fallback: mantém relativo
  return pathOrNull.startsWith('/') ? `${base}${pathOrNull}` : `${base}/${pathOrNull}`;
}

/* ---------- Utils ---------- */
function toIntOrNull(v: unknown): number | null {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function strOrNull(v: unknown, max?: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return typeof max === 'number' ? s.slice(0, max) : s;
}

function boolOrUndefined(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
}

/* ============================================================
 * GET /v1/areas (ADMIN) — lista paginada com filtros
 * Filtros: page, pageSize, unitId, search, active
 * ============================================================ */
areasRouter.get('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { page = '1', pageSize = '20', unitId, search, active } = req.query as Record<string, string>;
  const take = Math.max(1, Math.min(200, Number(pageSize)));
  const skip = (Math.max(1, Number(page)) - 1) * take;

  const where: any = {};
  if (unitId) where.unitId = String(unitId);
  if (typeof active !== 'undefined' && active !== '') {
    const parsed = boolOrUndefined(active);
    if (typeof parsed === 'boolean') where.isActive = parsed;
  }
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

  const payload = items.map((a) => ({
    ...a,
    photoUrlAbsolute: toAbsoluteMedia(a.photoUrl),
  }));

  res.json({
    items: payload,
    total,
    page: Math.max(1, Number(page)),
    pageSize: take,
    totalPages: Math.ceil(total / take),
  });
});

/* ============================================================
 * POST /v1/areas (ADMIN) — cria área
 * body: { unitId, name, capacityAfternoon?, capacityNight?, isActive?, photoUrl?, iconEmoji?, description? }
 * ============================================================ */
areasRouter.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { unitId, name } = req.body || {};

  // capacidades (aceita camelCase e snake_case)
  const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
  const capNightRaw     = req.body?.capacityNight     ?? req.body?.capacity_night;

  // novos campos (camel/snake)
  const iconEmojiRaw    = req.body?.iconEmoji ?? req.body?.icon_emoji;
  const descriptionRaw  = req.body?.description;

  // outros
  const isActiveRaw     = req.body?.isActive;
  const photoUrlRaw     = req.body?.photoUrl;

  if (!unitId) return res.status(400).json({ error: 'unitId é obrigatório' });
  if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });

  const unit = await prisma.unit.findUnique({ where: { id: String(unitId) } });
  if (!unit) return res.status(400).json({ error: 'Unidade inexistente' });

  const data: any = {
    unitId: String(unitId),
    name: String(name).trim(),
  };

  const isActive = boolOrUndefined(isActiveRaw);
  data.isActive = typeof isActive === 'boolean' ? isActive : true;

  const photoUrl = strOrNull(typeof photoUrlRaw === 'string' ? photoUrlRaw : undefined);
  if (photoUrl !== null && typeof photoUrl !== 'undefined') data.photoUrl = photoUrl;

  if (capAfternoonRaw !== undefined) data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
  if (capNightRaw !== undefined)     data.capacityNight     = toIntOrNull(capNightRaw);

  const iconEmoji = strOrNull(iconEmojiRaw, 16); // mantém curto por segurança
  const description = strOrNull(descriptionRaw);
  if (typeof iconEmojiRaw !== 'undefined') data.iconEmoji = iconEmoji;       // aceita null para limpar
  if (typeof descriptionRaw !== 'undefined') data.description = description; // idem

  try {
    const created = await prisma.area.create({
      data,
      include: { unit: { select: { id: true, name: true, slug: true } } },
    });

    res.status(201).json({
      ...created,
      photoUrlAbsolute: toAbsoluteMedia(created.photoUrl),
    });
  } catch (e: any) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ error: 'Já existe uma área com esse nome nesta unidade' });
    }
    res.status(400).json({ error: 'Erro ao criar área', details: e?.message });
  }
});

/* ============================================================
 * GET /v1/areas/:id (ADMIN)
 * ============================================================ */
areasRouter.get('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const a = await prisma.area.findUnique({
    where: { id: String(req.params.id) },
    include: { unit: { select: { id: true, name: true, slug: true } } },
  });
  if (!a) return res.status(404).json({ error: 'Área não encontrada' });
  res.json({
    ...a,
    photoUrlAbsolute: toAbsoluteMedia(a.photoUrl),
  });
});

/* ============================================================
 * PUT /v1/areas/:id (ADMIN) — atualiza (total/parcial)
 * body: { unitId?, name?, capacityAfternoon?, capacityNight?, isActive?, photoUrl?, iconEmoji?, description? }
 * ============================================================ */
async function updateArea(req: any, res: any) {
  const { unitId, name } = req.body || {};

  // capacidades (camel/snake)
  const capAfternoonRaw = req.body?.capacityAfternoon ?? req.body?.capacity_afternoon;
  const capNightRaw     = req.body?.capacityNight     ?? req.body?.capacity_night;

  // novos (camel/snake)
  const iconEmojiRaw    = req.body?.iconEmoji ?? req.body?.icon_emoji;
  const descriptionRaw  = req.body?.description;

  // outros
  const isActiveRaw     = req.body?.isActive;
  const photoUrlRaw     = req.body?.photoUrl;

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

  const isActive = boolOrUndefined(isActiveRaw);
  if (typeof isActive === 'boolean') {
    data.isActive = isActive;
  }

  if (typeof photoUrlRaw !== 'undefined') {
    const v = strOrNull(photoUrlRaw);
    data.photoUrl = v;
  }

  if (capAfternoonRaw !== undefined) data.capacityAfternoon = toIntOrNull(capAfternoonRaw);
  if (capNightRaw !== undefined)     data.capacityNight     = toIntOrNull(capNightRaw);

  if (typeof iconEmojiRaw !== 'undefined') {
    const v = strOrNull(iconEmojiRaw, 16);
    data.iconEmoji = v; // null se vazio
  }
  if (typeof descriptionRaw !== 'undefined') {
    const v = strOrNull(descriptionRaw);
    data.description = v; // null se vazio
  }

  try {
    const updated = await prisma.area.update({
      where: { id: String(req.params.id) },
      data,
      include: { unit: { select: { id: true, name: true, slug: true } } },
    });
    res.json({
      ...updated,
      photoUrlAbsolute: toAbsoluteMedia(updated.photoUrl),
    });
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Área não encontrada' });
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'Já existe uma área com esse nome nesta unidade' });
    res.status(400).json({ error: 'Erro ao atualizar área', details: e?.message });
  }
}

areasRouter.put('/:id', requireAuth, requireRole(['ADMIN']), updateArea);
// opcional: aceitar PATCH também
areasRouter.patch('/:id', requireAuth, requireRole(['ADMIN']), updateArea);

/* ============================================================
 * DELETE /v1/areas/:id (ADMIN)
 * Regra: 409 se existir reserva vinculada
 * ============================================================ */
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

/* ============================================================
 * Público — áreas ativas por unidade
 * GET /v1/areas/public/by-unit/:unitId
 * ============================================================ */
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
      iconEmoji: true,     // ✅ novos campos
      description: true,   // ✅
    },
    orderBy: { name: 'asc' },
  });

  const payload = items.map((a) => ({
    ...a,
    photoUrlAbsolute: toAbsoluteMedia(a.photoUrl),
  }));

  res.json(payload);
});
