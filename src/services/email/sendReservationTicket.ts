import sgMail from "@sendgrid/mail";
import { z } from "zod";
import QRCode from "qrcode";

const envSchema = z.object({
  SENDGRID_API_KEY: z.string().min(10),
  MAIL_FROM: z.string().email(),
  MAIL_FROM_NAME: z.string().optional().default("Mané Mercado"),
});

const reservationSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  people: z.number().int().positive(),
  unit: z.string(), // "Águas Claras", "Brasília", etc.
  table: z.string().optional(),
  reservationDate: z.string(), // ISO "2025-10-07T20:00:00-03:00"
  notes: z.string().optional(),
  // link que será codificado no QR (ex: página de confirmação/check-in)
  checkinUrl: z.string().url(),
});

export type ReservationTicket = z.infer<typeof reservationSchema>;

function buildHtml(ticket: ReservationTicket, qrCid: string) {
  const date = new Date(ticket.reservationDate);
  const dateFmt = date.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });

  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; max-width:600px; margin:0 auto;">
    <div style="padding:16px 0; text-align:center;">
      <img src="https://mane.com.vc/logo.png" alt="Mané Mercado" style="height:36px;"/>
    </div>
    <div style="background:#0f172a; color:#fff; padding:20px; border-radius:12px;">
      <h2 style="margin:0 0 6px; font-size:22px;">Seu ticket de reserva</h2>
      <p style="margin:0; opacity:.9;">Código: <strong>${ticket.id}</strong></p>
    </div>

    <div style="padding:16px;">
      <p>Olá, <strong>${ticket.fullName}</strong>! Sua reserva foi confirmada.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;"><strong>Unidade:</strong></td>
          <td style="padding:8px 0;">${ticket.unit}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;"><strong>Data e hora:</strong></td>
          <td style="padding:8px 0;">${dateFmt}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;"><strong>Pessoas:</strong></td>
          <td style="padding:8px 0;">${ticket.people}</td>
        </tr>
        ${ticket.table ? `
        <tr>
          <td style="padding:8px 0;"><strong>Mesa:</strong></td>
          <td style="padding:8px 0;">${ticket.table}</td>
        </tr>` : ``}
        ${ticket.phone ? `
        <tr>
          <td style="padding:8px 0;"><strong>Telefone:</strong></td>
          <td style="padding:8px 0;">${ticket.phone}</td>
        </tr>` : ``}
        ${ticket.notes ? `
        <tr>
          <td style="padding:8px 0; vertical-align:top;"><strong>Observações:</strong></td>
          <td style="padding:8px 0;">${ticket.notes}</td>
        </tr>` : ``}
      </table>

      <div style="margin:18px 0; text-align:center;">
        <img src="cid:${qrCid}" alt="QR Code da reserva" style="width:200px; height:200px;" />
        <div style="font-size:12px; color:#64748b; margin-top:6px;">
          Apresente este QR Code na chegada para check-in.
        </div>
      </div>

      <a href="${ticket.checkinUrl}" style="display:inline-block; background:#0ea5e9; color:#fff; text-decoration:none; padding:10px 16px; border-radius:8px;">
        Ver confirmação / Check-in
      </a>

      <p style="color:#64748b; font-size:12px; margin-top:16px;">
        Se você não fez esta reserva, ignore este e-mail.
      </p>
    </div>

    <div style="color:#94a3b8; font-size:12px; text-align:center; padding:12px;">
      © ${new Date().getFullYear()} Mané Mercado — notifications.mane.com.vc
    </div>
  </div>`;
}

export async function sendReservationTicket(ticketInput: ReservationTicket) {
  const env = envSchema.parse({
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
  });

  const ticket = reservationSchema.parse(ticketInput);

  sgMail.setApiKey(env.SENDGRID_API_KEY);

  // Gera QR como PNG (Buffer) para anexar inline via CID
  const qrPng = await QRCode.toBuffer(ticket.checkinUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 600,
  });
  const qrCid = "qrTicket";

  const msg = {
    to: ticket.email,
    from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
    subject: `Sua reserva • ${ticket.unit} • #${ticket.id}`,
    html: buildHtml(ticket, qrCid),
    text: [
      `Reserva confirmada — ${ticket.unit}`,
      `Código: ${ticket.id}`,
      `Data/hora: ${new Date(ticket.reservationDate).toLocaleString("pt-BR")}`,
      `Pessoas: ${ticket.people}`,
      ticket.table ? `Mesa: ${ticket.table}` : "",
      ticket.notes ? `Obs: ${ticket.notes}` : "",
      `Check-in/Confirmação: ${ticket.checkinUrl}`,
      ``,
      `Apresente o QR Code do anexo na chegada.`,
    ].filter(Boolean).join("\n"),
    attachments: [
      {
        content: qrPng.toString("base64"),
        filename: "qr-reserva.png",
        type: "image/png",
        disposition: "inline",
        content_id: qrCid,
      },
    ],
    categories: ["reservas", "ticket"],
    headers: {
      // ajuda em tracing/idempotência se você reenviar
      "X-Reservation-Id": ticket.id,
    },
  } as sgMail.MailDataRequired;

  const [resp] = await sgMail.send(msg, /* isMultiple */ false);
  return { status: resp.statusCode };
}
