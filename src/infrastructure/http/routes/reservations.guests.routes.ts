import { Router } from 'express';
import { prisma } from '../../db/client';

const router = Router();

/** normalizadores simples */
const normStr = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};

const toGuestInput = (g: any) => ({
  name: String(g?.name ?? '').trim(),
  email: String(g?.email ?? '').trim().toLowerCase(),
  role: (String(g?.role ?? 'GUEST').toUpperCase() === 'HOST') ? 'HOST' : 'GUEST',
});

/**
 * POST /v1/reservations/:id/guests
 * body: { name, email, role? }
 */
router.post('/:id/guests', async (req, res) => {
  try {
    const reservationId = String(req.params.id || '').trim();
    if (!reservationId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'reservationId é obrigatório.' } });

    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { id: true } });
    if (!r) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });

    const { name, email, role } = toGuestInput(req.body);
    if (!name || !email) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Informe nome e e-mail.' } });

    const created = await prisma.reservationGuest.upsert({
      where: { reservationId_email: { reservationId, email } }, // usa @@unique(reservationId,email)
      create: { reservationId, name, email, role: role as any },
      update: { name, role: role as any },
      select: { id: true, name: true, email: true, role: true, reservationId: true, createdAt: true, updatedAt: true },
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error('[guests:create] error', e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Falha ao adicionar convidado.' } });
  }
});

/**
 * POST /v1/reservations/:id/guests/bulk
 * body: { guests: [{name,email,role?}, ...] }
 */
router.post('/:id/guests/bulk', async (req, res) => {
  try {
    const reservationId = String(req.params.id || '').trim();
    if (!reservationId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'reservationId é obrigatório.' } });

    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { id: true } });
    if (!r) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reserva não encontrada.' } });

    const arr = Array.isArray(req.body?.guests) ? req.body.guests : [];
    if (arr.length === 0) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Lista de convidados vazia.' } });

    // normaliza e filtra inválidos
    const inputs = arr.map(toGuestInput).filter(g => g.name && g.email);

    // upsert em série (tamanho pequeno/mediano). Se quiser otimizar, use transaction + map.
    const results = [];
    for (const g of inputs) {
      const row = await prisma.reservationGuest.upsert({
        where: { reservationId_email: { reservationId, email: g.email } },
        create: { reservationId, name: g.name, email: g.email, role: g.role as any },
        update: { name: g.name, role: g.role as any },
        select: { id: true, name: true, email: true, role: true, reservationId: true, createdAt: true, updatedAt: true },
      });
      results.push(row);
    }

    return res.status(201).json({ count: results.length, items: results });
  } catch (e) {
    console.error('[guests:bulk] error', e);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Falha ao inserir convidados.' } });
  }
});

export { router as reservationsGuestsRouter };
export default router;
