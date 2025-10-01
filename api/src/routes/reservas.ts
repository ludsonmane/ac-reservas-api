import { Router } from "express";
import type { Request, Response } from "express";
import { connectMongo } from "../mongodb.js";
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";

const router = Router();

// GET /reservas
router.get("/", async (req: Request, res: Response) => {
  try {
    await connectMongo();

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20), 100);
    const skip = (page - 1) * limit;
    const q = String(req.query.q ?? "").trim();

    const col = mongoose.connection.db.collection("reservations");
    const filter: any = {};
    if (q) {
      filter.$or = [
        { fullName: { $regex: q, $options: "i" } },
        { cpf: { $regex: q, $options: "i" } },
        { "utms.s_utm_campaign": { $regex: q, $options: "i" } },
        { "utms.s_utm_source": { $regex: q, $options: "i" } },
        { "utms.s_utm_medium": { $regex: q, $options: "i" } },
        { "utms.s_utm_content": { $regex: q, $options: "i" } }
      ];
    }

    const total = await col.countDocuments(filter);
    const items = await col.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();

    const pages = Math.max(1, Math.ceil(total / limit));
    const meta = { total, page, limit, pages, hasPrev: page > 1, hasNext: page < pages };

    res.json({ items, meta });
  } catch (e) {
    console.error("[GET /reservas] ERROR:", e);
    res.status(500).json({ ok: false, code: "GET_FAILED" });
  }
});

// POST /reservas
router.post("/", async (req: Request, res: Response) => {
  try {
    await connectMongo();
    const body = req.body || {};
    const fullName = String(body.fullName ?? body.full_name ?? "").trim();
    const cpf = String(body.cpf ?? body.document ?? "").trim();
    const people = Number(body.people ?? body.persons ?? 1);
    const reservationDate = new Date(body.reservationDate ?? body.reservation_date);
    const birthdayDate = body.birthdayDate || body.birthday_date ? new Date(body.birthdayDate ?? body.birthday_date) : undefined;

    if (!fullName || !cpf || !people || isNaN(reservationDate.getTime())) {
      return res.status(400).json({ ok: false, code: "INVALID_PAYLOAD" });
    }

    const utms: Record<string,string> = {};
    Object.entries(body).forEach(([k,v]) => { if (k.startsWith("s_utm")) utms[k] = String(v ?? ""); });

    const doc = await (Reservation as any).create({
      fullName, cpf, people, reservationDate, birthdayDate, utms,
      source: body.source ?? "api",
      raw: body
    });

    res.status(201).json({ ok: true, id: String(doc._id) });
  } catch (e) {
    console.error("[POST /reservas] ERROR:", e);
    res.status(500).json({ ok: false, code: "POST_FAILED" });
  }
});

export default router;
