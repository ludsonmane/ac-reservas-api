// api/src/interfaces/http/controllers/ReservationController.ts
import type { Request, Response } from 'express';
import { CreateReservation } from '../../../application/use-cases/CreateReservation';
import { ListReservations } from '../../../application/use-cases/ListReservations';
import { GetReservationById } from '../../../application/use-cases/GetReservationById';
import { UpdateReservation } from '../../../application/use-cases/UpdateReservation';
import { DeleteReservation } from '../../../application/use-cases/DeleteReservation';
import { CreateReservationDTO, UpdateReservationDTO } from '../dtos/reservation.dto';
import { logger } from '../../../config/logger';
import { sendReservationTicket } from '../../../services/email/sendReservationTicket';

/* ===== Helpers ===== */
function toInt(v: unknown, fb: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function nonEmptyOrNull(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
}
function dateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as any);
  return Number.isNaN(+d) ? null : d;
}
function parseDateMaybe(v: unknown): Date | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(+d) ? undefined : d;
}

export class ReservationController {
  constructor(
    private createUC: CreateReservation,
    private listUC: ListReservations,
    private getByIdUC: GetReservationById,
    private updateUC: UpdateReservation,
    private deleteUC: DeleteReservation
  ) {}

  /* ================== POST /v1/reservations ================== */
  create = async (req: Request, res: Response) => {
    const parsed = CreateReservationDTO.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const b = parsed.data as any;
    const payload = {
      fullName: String(b.fullName || '').trim(),
      cpf: nonEmptyOrNull(b.cpf),
      people: toInt(b.people, 1),
      kids: Math.max(0, toInt(b.kids, 0)),
      area: nonEmptyOrNull(b.area),

      reservationDate: new Date(b.reservationDate),
      birthdayDate: b.birthdayDate ? dateOrNull(b.birthdayDate) : null,

      email: nonEmptyOrNull(b.email ?? b.contactEmail),
      phone: nonEmptyOrNull(b.phone ?? b.contactPhone),
      notes: nonEmptyOrNull(b.notes),

      utm_source: nonEmptyOrNull(b.utm_source),
      utm_medium: nonEmptyOrNull(b.utm_medium),
      utm_campaign: nonEmptyOrNull(b.utm_campaign),
      utm_content: nonEmptyOrNull(b.utm_content),
      utm_term: nonEmptyOrNull(b.utm_term),

      url: nonEmptyOrNull(b.url),
      ref: nonEmptyOrNull(b.ref),
      unit: nonEmptyOrNull(b.unit),
      source: nonEmptyOrNull(b.source) ?? 'site',
    };

    const created = await this.createUC.execute(payload as any);
    const c = created as any; // <- prisma model com email, qrToken, reservationDate, etc.

    // Envia ticket por e-mail sem bloquear a resposta
    try {
      if (c.email) {
        const base = `${req.protocol}://${req.get('host')}`;
        const checkinUrl = `${base}/v1/reservations/checkin/${encodeURIComponent(c.qrToken)}`;

        const reservationDateIso =
          c.reservationDate instanceof Date
            ? c.reservationDate.toISOString()
            : new Date(c.reservationDate as any).toISOString();

        await sendReservationTicket({
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          phone: c.phone ?? undefined,
          people: c.people,
          unit: c.unit ?? 'Mané Mercado',
          table: c.table ?? undefined,
          reservationDate: reservationDateIso,
          notes: c.notes ?? undefined,
          checkinUrl,
        });
      } else {
        logger.info({ id: c.id }, '[email] reserva sem e-mail — ticket não enviado');
      }
    } catch (err) {
      logger.warn({ err, id: c.id }, '[email] falha ao enviar ticket (segue 201)');
    }

    return res.status(201).json(created);
  };

  /* ================== GET /v1/reservations ================== */
  list = async (req: Request, res: Response) => {
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10), 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? '20'), 10), 1), 100);
    const search = String(req.query.search ?? '').trim();
    const unit = String(req.query.unit ?? '').trim();
    const from = parseDateMaybe(req.query.from);
    const to = parseDateMaybe(req.query.to);

    const { items, total } = await this.listUC.execute({
      search,
      unit,
      from,
      to,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  };

  /* ================== GET /v1/reservations/:id ================== */
  getById = async (req: Request, res: Response) => {
    const item = await this.getByIdUC.execute(req.params.id);
    if (!item) return res.sendStatus(404);
    return res.json(item);
  };

  /* ================== PUT /v1/reservations/:id ================== */
  update = async (req: Request, res: Response) => {
    const parsed = UpdateReservationDTO.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const b = parsed.data as Record<string, any>;
    const payload: Record<string, any> = { ...b };

    if (b.kids !== undefined) payload.kids = Math.max(0, toInt(b.kids, 0));
    if (b.people !== undefined) payload.people = Math.max(1, toInt(b.people, 1));
    if (b.email !== undefined) payload.email = nonEmptyOrNull(b.email);
    if (b.phone !== undefined) payload.phone = nonEmptyOrNull(b.phone);
    if (b.notes !== undefined) payload.notes = nonEmptyOrNull(b.notes);

    if (b.reservationDate !== undefined) payload.reservationDate = dateOrNull(b.reservationDate);
    if (b.birthdayDate !== undefined) payload.birthdayDate = dateOrNull(b.birthdayDate);

    if (b.utm_source !== undefined) payload.utm_source = nonEmptyOrNull(b.utm_source);
    if (b.utm_medium !== undefined) payload.utm_medium = nonEmptyOrNull(b.utm_medium);
    if (b.utm_campaign !== undefined) payload.utm_campaign = nonEmptyOrNull(b.utm_campaign);
    if (b.utm_content !== undefined) payload.utm_content = nonEmptyOrNull(b.utm_content);
    if (b.utm_term !== undefined) payload.utm_term = nonEmptyOrNull(b.utm_term);

    const updated = await this.updateUC.execute(req.params.id, payload as any);
    return res.json(updated);
  };

  /* ================== DELETE /v1/reservations/:id ================== */
  delete = async (req: Request, res: Response) => {
    await this.deleteUC.execute(req.params.id);
    return res.sendStatus(204);
  };
}
