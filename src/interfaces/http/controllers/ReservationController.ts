// src/interfaces/http/controllers/ReservationController.ts
import type { Request, Response } from 'express';
import { CreateReservation } from '../../../application/use-cases/CreateReservation';
import { ListReservations } from '../../../application/use-cases/ListReservations';
import { GetReservationById } from '../../../application/use-cases/GetReservationById';
import { UpdateReservation } from '../../../application/use-cases/UpdateReservation';
import { DeleteReservation } from '../../../application/use-cases/DeleteReservation';
import { CreateReservationDTO, UpdateReservationDTO } from '../dtos/reservation.dto';
import { logger } from '../../../config/logger';
import { sendReservationTicket } from '../../../services/email/sendReservationTicket';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/db/prisma';

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
/** Normaliza ID vindo na query: '', 'undefined', 'null' -> undefined */
const asId = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : undefined;
};
/** Normaliza string opcional */
const asStr = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s ? s : undefined;
};

/* ===== UTM helpers (sem nada de blocks) ===== */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'] as const;
type UtmKey = typeof UTM_KEYS[number];

function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) {
      const k = decodeURIComponent(p.slice(0, i).trim());
      const v = decodeURIComponent(p.slice(i + 1).trim());
      out[k] = v;
    }
  });
  return out;
}
function pickUtm(obj: any): Partial<Record<UtmKey, string>> {
  const bag: Partial<Record<UtmKey, string>> = {};
  UTM_KEYS.forEach((k) => {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) bag[k] = v.trim();
  });
  return bag;
}
function extractUtmFromRequest(req: Request) {
  const fromBody = pickUtm((req as any).body);
  const fromQuery = pickUtm((req as any).query);
  const cookiesObj =
    (req as any).cookies && typeof (req as any).cookies === 'object'
      ? (req as any).cookies
      : parseCookieHeader(req.headers?.cookie);
  const fromCookies = pickUtm(cookiesObj);
  // prioridade: body > query > cookies
  const utm: Partial<Record<UtmKey, string>> = { ...fromCookies, ...fromQuery, ...fromBody };

  const absoluteUrl = `${(req as any).protocol || 'http'}://${(req as any).get?.('host') || req.headers.host}${(req as any).originalUrl || (req as any).url || ''}`;
  const referrer = (req as any).get?.('referer') || req.headers['referer'] || undefined;

  return { utm, absoluteUrl, referrer };
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
    // Coleta UTM (sem blocks)
    const { utm, absoluteUrl, referrer } = extractUtmFromRequest(req);

    const parsed = CreateReservationDTO.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const b = parsed.data as any;
    const payload = {
      fullName: String(b.fullName || '').trim(),
      cpf: nonEmptyOrNull(b.cpf),
      people: toInt(b.people, 1),
      kids: Math.max(0, toInt(b.kids, 0)),

      // LEGADO (string livre) — ainda aceito
      area: nonEmptyOrNull(b.area),

      // NOVOS (preferenciais): IDs relacionais
      unitId: nonEmptyOrNull(b.unitId),
      areaId: nonEmptyOrNull(b.areaId),

      reservationDate: new Date(b.reservationDate),
      birthdayDate: b.birthdayDate ? dateOrNull(b.birthdayDate) : null,

      email: nonEmptyOrNull(b.email ?? b.contactEmail),
      phone: nonEmptyOrNull(b.phone ?? b.contactPhone),
      notes: nonEmptyOrNull(b.notes),

      // UTMs: body tem prioridade; fallback para query/cookies
      utm_source: nonEmptyOrNull(b.utm_source) ?? nonEmptyOrNull(utm.utm_source),
      utm_medium: nonEmptyOrNull(b.utm_medium) ?? nonEmptyOrNull(utm.utm_medium),
      utm_campaign: nonEmptyOrNull(b.utm_campaign) ?? nonEmptyOrNull(utm.utm_campaign),
      utm_content: nonEmptyOrNull(b.utm_content) ?? nonEmptyOrNull(utm.utm_content),
      utm_term: nonEmptyOrNull(b.utm_term) ?? nonEmptyOrNull(utm.utm_term),

      // contexto (auditoria)
      url: nonEmptyOrNull(b.url) ?? nonEmptyOrNull(absoluteUrl),
      ref: nonEmptyOrNull(b.ref) ?? nonEmptyOrNull(String(referrer || '')),

      // LEGADO (nome/slug da unidade) — ainda aceito
      unit: nonEmptyOrNull(b.unit),

      source: nonEmptyOrNull(b.source) ?? 'site',
    };

    const created = await this.createUC.execute(payload as any);
    const c = created as any; // prisma model

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

    const search =
      asStr(req.query.search) ??
      asStr(req.query.q) ??
      asStr(req.query.query) ??
      '';

    const unit   = asStr(req.query.unit) ?? asStr(req.query.unitSlug) ?? asStr(req.query.unit_slug);
    const unitId = asId(req.query.unitId) ?? asId(req.query.unit_id);
    const areaId = asId(req.query.areaId) ?? asId(req.query.area_id);

    const from = parseDateMaybe(req.query.from);
    const to   = parseDateMaybe(req.query.to); // repositório trata "to" como inclusivo

    const { items, total } = await this.listUC.execute({
      search,
      unit,
      unitId,
      areaId,
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

    if (b.unit !== undefined) payload.unit = nonEmptyOrNull(b.unit);
    if (b.area !== undefined) payload.area = nonEmptyOrNull(b.area);

    if (b.unitId !== undefined) payload.unitId = nonEmptyOrNull(b.unitId);
    if (b.areaId !== undefined) payload.areaId = nonEmptyOrNull(b.areaId);

    const updated = await this.updateUC.execute(req.params.id, payload as any);
    return res.json(updated);
  };

  /* ================== DELETE /v1/reservations/:id ================== */
  delete = async (req: Request, res: Response) => {
    await this.deleteUC.execute(req.params.id);
    return res.sendStatus(204);
  };

  /* ========== POST /v1/reservations/:id/guests/bulk ========== */
  addGuestsBulk = async (req: Request, res: Response) => {
    const reservationId = String(req.params.id || '').trim();
    if (!reservationId) return res.status(400).json({ error: 'Missing reservation id' });

    const Email = z.string().trim().toLowerCase().email();
    const GuestSchema = z.object({
      name: z.string().trim().min(2, 'name too short').max(200),
      email: Email,
      role: z.enum(['GUEST', 'HOST']).optional().default('GUEST'),
    });
    const BodySchema = z.object({
      guests: z.array(GuestSchema).min(1).max(1000),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const exists = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { id: true },
      });
      if (!exists) return res.status(404).json({ error: 'RESERVATION_NOT_FOUND' });

      const data = parsed.data.guests.map((g) => ({
        reservationId,
        name: g.name.trim(),
        email: g.email.trim().toLowerCase(),
        role: g.role,
      }));

      const result = await prisma.guest.createMany({
        data,
        skipDuplicates: true,
      });

      const created = result.count;
      const skipped = data.length - created;

      return res.status(200).json({ created, skipped });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        return res.status(400).json({ error: 'FOREIGN_KEY_CONSTRAINT' });
      }
      logger.error({ err }, '[reservations.guests.bulk] unhandled error');
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  };
}
