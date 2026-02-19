// src/services/email/sendReservationTicket.ts
import sgMail from '@sendgrid/mail';
import { z } from 'zod';
import QRCode from 'qrcode';

const envSchema = z.object({
  SENDGRID_API_KEY: z.string().min(10),
  MAIL_FROM: z.string().email(),
  MAIL_FROM_NAME: z.string().optional().default('Mané Mercado'),
  MAIL_REPLY_TO: z.string().email().optional(),
  MAIL_BCC: z.string().email().optional(),
  MAIL_PRIMARY_COLOR: z.string().optional().default('#0f172a'),
  MAIL_ACCENT_COLOR: z.string().optional().default('#0ea5e9'),
  MAIL_LOGO_BASE64: z.string().optional(),     // data:image/png;base64,....
  MAIL_LOGO_URL: z.string().url().optional(),  // URL pública da logo
  MAIL_CONSULT_BASE: z
    .string()
    .url()
    .optional()
    .default('https://reservas.mane.com.vc'),
});

const reservationSchema = z.object({
  id: z.string(),
  reservationCode: z.string().optional(),
  code: z.string().optional(),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  people: z.number().int().positive(),
  kids: z.number().int().nonnegative().optional(),
  unit: z.string(),
  table: z.string().optional(),
  tables: z.string().optional(),
  reservationDate: z.string(), // ISO
  notes: z.string().optional(),
  checkinUrl: z.string().url(),
});

export type ReservationTicket = z.infer<typeof reservationSchema>;

/* helpers */
function toTitle(s?: string | null) {
  if (!s) return '';
  return s
    .toLowerCase()
    .split(/[\s\-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
function formatPhoneBR(p?: string) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function buildHtml(
  ticket: ReservationTicket,
  qrCid: string,
  logo: { cid?: string; url?: string } | null,
  colors: { primary: string; accent: string },
  consultUrl: string,
  codeTxt: string
) {
  const date = new Date(ticket.reservationDate);
  const dateFmt = date.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
  const unitFmt = toTitle(ticket.unit);
  const phoneFmt = formatPhoneBR(ticket.phone);

  const logoHtml = logo?.cid
    ? `<img src="cid:${logo.cid}" alt="Mané Mercado" style="height:28px;display:inline-block;"/>`
    : logo?.url
    ? `<img src="${logo.url}" alt="Mané Mercado" style="height:28px;display:inline-block;"/>`
    : `<div style="font-weight:700;font-size:18px;color:#0f172a;">Mané Mercado</div>`;

  return `
  <div style="background:#f6f7f9;padding:24px 12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 22px rgba(2,6,23,.06);overflow:hidden;">
      <div style="padding:16px 0;text-align:center;">
        ${logoHtml}
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
          ${ticket.kids && ticket.kids > 0 ? `<tr><td style="padding:8px 0;color:#334155;"><strong>Crianças:</strong></td><td style="padding:8px 0;">${ticket.kids}</td></tr>` : ``}
          ${(() => { const t = (ticket as any).tables ?? (ticket as any).table; return t ? `<tr><td style="padding:8px 0;color:#334155;"><strong>Mesa(s):</strong></td><td style="padding:8px 0;">${t}</td></tr>` : ``; })()}
          ${ticket.phone ? `<tr><td style="padding:8px 0;color:#334155;"><strong>Telefone:</strong></td><td style="padding:8px 0;">${phoneFmt}</td></tr>` : ``}
          ${ticket.notes ? `<tr><td style="padding:8px 0;vertical-align:top;color:#334155;"><strong>Observações:</strong></td><td style="padding:8px 0;">${ticket.notes}</td></tr>` : ``}
        </table>

        <div style="margin:16px 0 6px;text-align:center;">
          <img src="cid:${qrCid}" alt="QR Code da reserva" style="width:220px;height:220px;display:inline-block;" />
          <div style="font-size:12px;color:#64748b;margin-top:8px;">Apresente este QR Code na chegada para check-in.</div>
        </div>

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
    MAIL_CONSULT_BASE: process.env.MAIL_CONSULT_BASE,
  });

  const ticket = reservationSchema.parse(ticketInput);
  sgMail.setApiKey(env.SENDGRID_API_KEY);

  // Código preferido = reservationCode; fallback = code; por fim, id
  const codeTxt = ticket.reservationCode || ticket.code || ticket.id;

  // URL pública para consulta
  const baseConsult = env.MAIL_CONSULT_BASE.replace(/\/$/, '');
  const consultUrl = `${baseConsult}/consultar?codigo=${encodeURIComponent(codeTxt)}`;

  // QR inline
  const qrPng = await QRCode.toBuffer(ticket.checkinUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 600,
  });
  const qrCid = 'qrTicket';

  // Logo: se base64 -> inline (cid). Se URL -> usa URL (sem anexar).
  const logo: { cid?: string; url?: string } | null =
    env.MAIL_LOGO_BASE64
      ? { cid: 'logoCid' }
      : env.MAIL_LOGO_URL
      ? { url: env.MAIL_LOGO_URL }
      : null;

  const html = buildHtml(
    ticket,
    qrCid,
    logo,
    { primary: env.MAIL_PRIMARY_COLOR, accent: env.MAIL_ACCENT_COLOR },
    consultUrl,
    codeTxt
  );

  const tablesRaw = (ticket as any).tables ?? (ticket as any).table ?? '';
  const tablesLabel = String(tablesRaw || '').trim()
    ? String(tablesRaw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.length === 1 || s.length === 2 || s.length === 3) ? s.padStart(3, '0') : s)
        .join(', ')
    : '';

  const text = [
    `Sua reserva foi confirmada — ${toTitle(ticket.unit)}`,
    `Código: ${codeTxt}`,
    `Data/hora: ${new Date(ticket.reservationDate).toLocaleString('pt-BR')}`,
    `Pessoas: ${ticket.people}`,
    ticket.kids && ticket.kids > 0 ? `Crianças: ${ticket.kids}` : '',
    tablesLabel ? `Mesa(s): ${tablesLabel}` : '',
    ticket.phone ? `Telefone: ${formatPhoneBR(ticket.phone)}` : '',
    ticket.notes ? `Obs: ${ticket.notes}` : '',
    `Consultar: ${consultUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const attachments: Array<any> = [
    {
      content: qrPng.toString('base64'),
      filename: 'qr-reserva.png',
      type: 'image/png',
      disposition: 'inline',
      content_id: qrCid,
    },
  ];
  if (logo?.cid && env.MAIL_LOGO_BASE64) {
    // MAIL_LOGO_BASE64 deve vir "data:image/png;base64,AAAA..." ou só base64
    const base64 = env.MAIL_LOGO_BASE64.includes('base64,')
      ? env.MAIL_LOGO_BASE64.split('base64,').pop()!
      : env.MAIL_LOGO_BASE64;
    attachments.push({
      content: base64,
      filename: 'logo.png',
      type: 'image/png',
      disposition: 'inline',
      content_id: logo.cid,
    });
  }

  const msg: sgMail.MailDataRequired = {
    to: ticket.email,
    from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
    ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
    ...(env.MAIL_BCC ? { bcc: env.MAIL_BCC } : {}),
    subject: `Sua reserva confirmada • ${toTitle(ticket.unit)} • #${codeTxt}`,
    text,
    html,
    attachments,
    categories: ['reservas', 'ticket'],
    headers: { 'X-Reservation-Id': ticket.id },
    mailSettings: { sandboxMode: { enable: false } },
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
    },
  };

  try {
    const [resp] = await sgMail.send(msg);
    return { status: resp?.statusCode ?? 0 };
  } catch (e: any) {
    const sg = e?.response?.body;
    const errMsg = sg?.errors?.length ? JSON.stringify(sg.errors) : String(e?.message || e);
    throw new Error(`SENDGRID_ERROR ${errMsg}`);
  }
}
