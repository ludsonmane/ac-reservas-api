// src/services/email/sendReservationTicket.ts
import sgMail from "@sendgrid/mail";
import { z } from "zod";
import QRCode from "qrcode";

const envSchema = z.object({
  SENDGRID_API_KEY: z.string().min(10),
  MAIL_FROM: z.string().email(),
  MAIL_FROM_NAME: z.string().optional().default("Mané Mercado"),
  MAIL_REPLY_TO: z.string().email().optional(),
  MAIL_BCC: z.string().email().optional(),
  MAIL_PRIMARY_COLOR: z.string().optional().default("#0f172a"),
  MAIL_ACCENT_COLOR: z.string().optional().default("#0ea5e9"),
  MAIL_LOGO_BASE64: z.string().optional(),
  MAIL_LOGO_URL: z.string().url().optional(),
});

const reservationSchema = z.object({
  id: z.string(),                // id interno (fallback)
  code: z.string().optional(),   // código de rastreio (preferido)
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  people: z.number().int().positive(),
  unit: z.string(),
  table: z.string().optional(),
  reservationDate: z.string(),   // ISO
  notes: z.string().optional(),
  checkinUrl: z.string().url(),  // usamos só a origin para montar /consultar
});

export type ReservationTicket = z.infer<typeof reservationSchema>;

function toTitle(s?: string | null) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/[\s\-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function formatPhoneBR(p?: string) {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return p;
}

function buildHtml(
  ticket: ReservationTicket,
  qrCid: string,
  logoCid: string | null,
  colors: { primary: string; accent: string },
  consultUrl: string
) {
  const date = new Date(ticket.reservationDate);
  const dateFmt = date.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
  const unitFmt = toTitle(ticket.unit);
  const phoneFmt = formatPhoneBR(ticket.phone);
  const codeTxt = ticket.code || ticket.id;

  return `
  <div style="background:#f6f7f9;padding:24px 12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 22px rgba(2,6,23,.06);overflow:hidden;">
      <div style="padding:16px 0;text-align:center;">
        ${logoCid
          ? `<img src="cid:${logoCid}" alt="Mané Mercado" style="height:28px;display:inline-block;"/>`
          : `<div style="font-weight:700;font-size:18px;color:#0f172a;">Mané Mercado</div>`
        }
      </div>

      <div style="background:${colors.primary};color:#fff;padding:22px;border-radius:14px;margin:0 20px;">
        <h2 style="margin:0 0 4px;font-size:22px;line-height:1.2;">Seu ticket de reserva</h2>
        <p style="margin:0;opacity:.9;">Código: <strong>${codeTxt}</strong></p>
      </div>

      <div style="padding:18px 22px 8px 22px;color:#0f172a;">
        <p style="margin:6px 0 16px;">Olá, <strong>${ticket.fullName}</strong>! Sua reserva foi confirmada.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;width:140px;color:#334155;"><strong>Unidade:</strong></td><td style="padding:8px 0;">${unitFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#334155;"><strong>Data e hora:</strong></td><td style="padding:8px 0;">${dateFmt}</td></tr>
          <tr><td style="padding:8px 0;color:#334155;"><strong>Pessoas:</strong></td><td style="padding:8px 0;">${ticket.people}</td></tr>
          ${ticket.table ? `<tr><td style="padding:8px 0;color:#334155;"><strong>Mesa:</strong></td><td style="padding:8px 0;">${ticket.table}</td></tr>` : ``}
          ${ticket.phone ? `<tr><td style="padding:8px 0;color:#334155;"><strong>Telefone:</strong></td><td style="padding:8px 0;">${phoneFmt}</td></tr>` : ``}
          ${ticket.notes ? `<tr><td style="padding:8px 0;vertical-align:top;color:#334155;"><strong>Observações:</strong></td><td style="padding:8px 0;">${ticket.notes}</td></tr>` : ``}
        </table>

        <div style="margin:16px 0 6px;text-align:center;">
          <img src="cid:${qrCid}" alt="QR Code da reserva" style="width:220px;height:220px;display:inline-block;" />
          <div style="font-size:12px;color:#64748b;margin-top:8px;">Apresente este QR Code na chegada para check-in.</div>
        </div>

        <!-- Botão apenas para CONSULTAR, sem fazer check-in -->
        <div style="text-align:center;margin:18px 0 8px;">
          <a href="${consultUrl}" style="display:inline-block;background:${colors.accent};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
            Consultar reserva
          </a>
        </div>

        <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">Se você não fez esta reserva, ignore este e-mail.</p>
      </div>

      <div style="color:#94a3b8;font-size:12px;text-align:center;padding:14px;">
        © ${new Date().getFullYear()} Mané Mercado — notifications.mane.com.vc
      </div>
    </div>
  </div>`;
}

export async function sendReservationTicket(ticketInput: ReservationTicket) {
  const env = envSchema.parse({
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
    MAIL_REPLY_TO: process.env.MAIL_REPLY_TO,
    MAIL_BCC: process.env.MAIL_BCC,
    MAIL_PRIMARY_COLOR: process.env.MAIL_PRIMARY_COLOR,
    MAIL_ACCENT_COLOR: process.env.MAIL_ACCENT_COLOR,
    MAIL_LOGO_BASE64: process.env.MAIL_LOGO_BASE64,
    MAIL_LOGO_URL: process.env.MAIL_LOGO_URL,
  });

  const ticket = reservationSchema.parse(ticketInput);
  sgMail.setApiKey(env.SENDGRID_API_KEY);

  // QR inline
  const qrPng = await QRCode.toBuffer(ticket.checkinUrl, { errorCorrectionLevel: "M", margin: 1, width: 600 });
  const qrCid = "qrTicket";
  const logoCid = env.MAIL_LOGO_BASE64 || env.MAIL_LOGO_URL ? "logoCid" : null;

  // Deriva a origem a partir do checkinUrl e monta /consultar?codigo=...
  const origin = new URL(ticket.checkinUrl).origin;
  const codeTxt = ticket.code || ticket.id;
  const consultUrl = `${origin}/consultar?codigo=${encodeURIComponent(codeTxt)}`;

  // HTML + texto
  const html = buildHtml(ticket, qrCid, logoCid, { primary: env.MAIL_PRIMARY_COLOR, accent: env.MAIL_ACCENT_COLOR }, consultUrl);
  const text = [
    `Sua reserva foi confirmada — ${toTitle(ticket.unit)}`,
    `Código: ${codeTxt}`,
    `Data/hora: ${new Date(ticket.reservationDate).toLocaleString("pt-BR")}`,
    `Pessoas: ${ticket.people}`,
    ticket.table ? `Mesa: ${ticket.table}` : "",
    ticket.phone ? `Telefone: ${formatPhoneBR(ticket.phone)}` : "",
    ticket.notes ? `Obs: ${ticket.notes}` : "",
    `Consultar: ${consultUrl}`,
  ].filter(Boolean).join("\n");

  const attachments: Array<any> = [
    {
      content: qrPng.toString("base64"),
      filename: "qr-reserva.png",
      type: "image/png",
      disposition: "inline",
      content_id: qrCid,
    },
  ];
  if (logoCid && env.MAIL_LOGO_BASE64) {
    attachments.push({
      content: env.MAIL_LOGO_BASE64,
      filename: "logo.png",
      type: "image/png",
      disposition: "inline",
      content_id: logoCid,
    });
  }

  const msg = {
    to: ticket.email,
    from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
    ...(env.MAIL_REPLY_TO ? { reply_to: { email: env.MAIL_REPLY_TO } } : {}),
    ...(env.MAIL_BCC ? { bcc: env.MAIL_BCC } : {}),
    subject: `Sua reserva confirmada • ${toTitle(ticket.unit)} • #${codeTxt}`, // <- usa o código de rastreio
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
    attachments,
    categories: ["reservas", "ticket"],
    headers: { "X-Reservation-Id": ticket.id },
    mailSettings: { sandboxMode: { enable: false } },
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
    },
  } as const;

  try {
    const [resp] = await sgMail.send(msg as unknown as sgMail.MailDataRequired, false);
    return { status: resp?.statusCode ?? 0 };
  } catch (e: any) {
    const sg = e?.response?.body;
    const errMsg = sg?.errors?.length ? JSON.stringify(sg.errors) : String(e?.message || e);
    throw new Error(`SENDGRID_ERROR ${errMsg}`);
  }
}
