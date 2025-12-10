import { Router } from 'express';
import { prisma } from '../../db/client';

const router = Router();

/** Helpers */
function normEmail(v?: string | null) {
  return (v ?? '').trim().toLowerCase() || null;
}
function normName(v?: string | null) {
  return (v ?? '').trim();
}

type GuestRole = 'GUEST' | 'HOST';
type GuestInput = { name: string; email: string; role?: GuestRole };

/* ============================================================================
   GET /v1/reservations/:id/guests  (listar)
============================================================================ */
router.get('/:id/guests', async (req, res, next) => {
  try {
    const { id } = req.params;

    const r = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!r) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    }

    const list = await prisma.guest.findMany({
      where: { reservationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return res.json({ items: list });
  } catch (err) {
    next(err);
  }
});

/* ============================================================================
   POST /v1/reservations/:id/guests  (criar 1 convidado)
   body: { name, email, role? }
============================================================================ */
router.post('/:id/guests', async (req, res, next) => {
  try {
    const { id } = req.params;

    const r = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!r) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    }

    const body = req.body as GuestInput;
    const name = normName(body?.name);
    const email = normEmail(body?.email);
    const role: GuestRole = body?.role === 'HOST' ? 'HOST' : 'GUEST';

    if (!name || name.length < 2) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Nome inválido.' } });
    }
    if (!email) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'E-mail é obrigatório.' } });
    }

    try {
      const created = await prisma.guest.create({
        data: {
          reservationId: id,
          name,
          email,
          role,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE',
            message: 'Este e-mail já está na lista de convidados desta reserva.',
          },
        });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

/* ============================================================================
   POST /v1/reservations/:id/guests/bulk  (criar em lote - até 100)
   body: { guests: GuestInput[] }
============================================================================ */
router.post('/:id/guests/bulk', async (req, res, next) => {
  try {
    const { id } = req.params;

    const r = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!r) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    }

    const input = (req.body?.guests ?? []) as GuestInput[];
    if (!Array.isArray(input) || input.length === 0) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Envie ao menos 1 convidado.' } });
    }
    if (input.length > 100) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Máximo de 100 convidados por requisição.' },
      });
    }

    // Normaliza, filtra inválidos e deduplica por email dentro do payload
    const normalized: GuestInput[] = [];
    const seen = new Set<string>();
    for (const g of input as GuestInput[]) {
      const name = normName(g?.name);
      const email = normEmail(g?.email);
      const role: GuestRole = g?.role === 'HOST' ? 'HOST' : 'GUEST';

      if (!name || name.length < 2) continue;
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.add(email);

      normalized.push({ name, email, role });
    }

    if (normalized.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Nenhum convidado válido após normalização.' },
      });
    }

    const { count } = await prisma.guest.createMany({
      data: normalized.map((g: GuestInput) => ({
        reservationId: id,
        name: g.name,
        email: g.email,
        role: g.role ?? 'GUEST',
      })),
      skipDuplicates: true, // exige UNIQUE(reservationId,email)
    });

    const list = await prisma.guest.findMany({
      where: { reservationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return res.status(201).json({ inserted: count, items: list });
  } catch (err) {
    next(err);
  }
});

/* ============================================================================
   DELETE /v1/reservations/:id/guests  (remove todos os convidados da reserva)
============================================================================ */
router.delete('/:id/guests', async (req, res, next) => {
  try {
    const { id } = req.params;

    const r = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!r) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });
    }

    const result = await prisma.guest.deleteMany({
      where: { reservationId: id },
    });

    return res.json({ deleted: result.count });
  } catch (err) {
    next(err);
  }
});

export default router;
