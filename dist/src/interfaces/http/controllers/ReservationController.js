"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationController = void 0;
const reservation_dto_1 = require("../dtos/reservation.dto");
const logger_1 = require("../../../config/logger");
const sendReservationTicket_1 = require("../../../services/email/sendReservationTicket");
/* ===== Helpers ===== */
function toInt(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function nonEmptyOrNull(v) {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length ? s : null;
}
function dateOrNull(v) {
    if (!v)
        return null;
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
}
function parseDateMaybe(v) {
    if (!v)
        return undefined;
    const d = new Date(String(v));
    return Number.isNaN(+d) ? undefined : d;
}
class ReservationController {
    createUC;
    listUC;
    getByIdUC;
    updateUC;
    deleteUC;
    constructor(createUC, listUC, getByIdUC, updateUC, deleteUC) {
        this.createUC = createUC;
        this.listUC = listUC;
        this.getByIdUC = getByIdUC;
        this.updateUC = updateUC;
        this.deleteUC = deleteUC;
    }
    /* ================== POST /v1/reservations ================== */
    create = async (req, res) => {
        const parsed = reservation_dto_1.CreateReservationDTO.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
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
            utm_source: nonEmptyOrNull(b.utm_source),
            utm_medium: nonEmptyOrNull(b.utm_medium),
            utm_campaign: nonEmptyOrNull(b.utm_campaign),
            utm_content: nonEmptyOrNull(b.utm_content),
            utm_term: nonEmptyOrNull(b.utm_term),
            url: nonEmptyOrNull(b.url),
            ref: nonEmptyOrNull(b.ref),
            // LEGADO (nome/slug da unidade) — ainda aceito
            unit: nonEmptyOrNull(b.unit),
            source: nonEmptyOrNull(b.source) ?? 'site',
        };
        const created = await this.createUC.execute(payload);
        const c = created; // prisma model
        // Envia ticket por e-mail sem bloquear a resposta
        try {
            if (c.email) {
                const base = `${req.protocol}://${req.get('host')}`;
                const checkinUrl = `${base}/v1/reservations/checkin/${encodeURIComponent(c.qrToken)}`;
                const reservationDateIso = c.reservationDate instanceof Date
                    ? c.reservationDate.toISOString()
                    : new Date(c.reservationDate).toISOString();
                await (0, sendReservationTicket_1.sendReservationTicket)({
                    id: c.id,
                    fullName: c.fullName,
                    email: c.email,
                    phone: c.phone ?? undefined,
                    people: c.people,
                    // mantém compat: se você denormalizar "unitName" depois, pode trocar aqui
                    unit: c.unit ?? 'Mané Mercado',
                    table: c.table ?? undefined,
                    reservationDate: reservationDateIso,
                    notes: c.notes ?? undefined,
                    checkinUrl,
                });
            }
            else {
                logger_1.logger.info({ id: c.id }, '[email] reserva sem e-mail — ticket não enviado');
            }
        }
        catch (err) {
            logger_1.logger.warn({ err, id: c.id }, '[email] falha ao enviar ticket (segue 201)');
        }
        return res.status(201).json(created);
    };
    /* ================== GET /v1/reservations ================== */
    list = async (req, res) => {
        const page = Math.max(parseInt(String(req.query.page ?? '1'), 10), 1);
        const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? '20'), 10), 1), 100);
        const search = String(req.query.search ?? '').trim();
        const unit = String(req.query.unit ?? '').trim(); // LEGADO (nome/slug)
        const areaId = String(req.query.areaId ?? '').trim(); // ✅ NOVO
        const from = parseDateMaybe(req.query.from);
        const to = parseDateMaybe(req.query.to);
        const { items, total } = await this.listUC.execute({
            search,
            unit, // legado
            areaId: areaId || undefined, // ✅ passa se vier
            from,
            to,
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    };
    /* ================== GET /v1/reservations/:id ================== */
    getById = async (req, res) => {
        const item = await this.getByIdUC.execute(req.params.id);
        if (!item)
            return res.sendStatus(404);
        return res.json(item);
    };
    /* ================== PUT /v1/reservations/:id ================== */
    update = async (req, res) => {
        const parsed = reservation_dto_1.UpdateReservationDTO.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const payload = { ...b };
        // normalizações iguais às do create, quando o campo vier no body
        if (b.kids !== undefined)
            payload.kids = Math.max(0, toInt(b.kids, 0));
        if (b.people !== undefined)
            payload.people = Math.max(1, toInt(b.people, 1));
        if (b.email !== undefined)
            payload.email = nonEmptyOrNull(b.email);
        if (b.phone !== undefined)
            payload.phone = nonEmptyOrNull(b.phone);
        if (b.notes !== undefined)
            payload.notes = nonEmptyOrNull(b.notes);
        if (b.reservationDate !== undefined)
            payload.reservationDate = dateOrNull(b.reservationDate);
        if (b.birthdayDate !== undefined)
            payload.birthdayDate = dateOrNull(b.birthdayDate);
        if (b.utm_source !== undefined)
            payload.utm_source = nonEmptyOrNull(b.utm_source);
        if (b.utm_medium !== undefined)
            payload.utm_medium = nonEmptyOrNull(b.utm_medium);
        if (b.utm_campaign !== undefined)
            payload.utm_campaign = nonEmptyOrNull(b.utm_campaign);
        if (b.utm_content !== undefined)
            payload.utm_content = nonEmptyOrNull(b.utm_content);
        if (b.utm_term !== undefined)
            payload.utm_term = nonEmptyOrNull(b.utm_term);
        // LEGADO (strings livres)
        if (b.unit !== undefined)
            payload.unit = nonEmptyOrNull(b.unit);
        if (b.area !== undefined)
            payload.area = nonEmptyOrNull(b.area);
        // NOVOS (IDs relacionais)
        if (b.unitId !== undefined)
            payload.unitId = nonEmptyOrNull(b.unitId);
        if (b.areaId !== undefined)
            payload.areaId = nonEmptyOrNull(b.areaId);
        const updated = await this.updateUC.execute(req.params.id, payload);
        return res.json(updated);
    };
    /* ================== DELETE /v1/reservations/:id ================== */
    delete = async (req, res) => {
        await this.deleteUC.execute(req.params.id);
        return res.sendStatus(204);
    };
}
exports.ReservationController = ReservationController;
