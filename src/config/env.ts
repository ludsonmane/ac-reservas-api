// api/src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // ─── Banco de dados ───────────────────────────────────────────────────────
  DATABASE_URL:        z.string().url(),
  DIRECT_URL:          z.string().url().optional(),
  SHADOW_DATABASE_URL: z.string().url().optional(),

  // ─── Auth (JWT) ───────────────────────────────────────────────────────────
  JWT_SECRET:              z.string().min(16, 'JWT_SECRET muito curto — use 16+ caracteres'),
  JWT_EXPIRES_IN:          z.string().default('24h'),
  JWT_REFRESH_SECRET:      z.string().min(16),
  JWT_REFRESH_EXPIRES_IN:  z.string().default('7d'),

  // ─── Servidor ─────────────────────────────────────────────────────────────
  PORT:     z.coerce.number().default(3000),
  HOST:     z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ─── URLs públicas ────────────────────────────────────────────────────────
  ADMIN_APP_BASE_URL:   z.string().url().optional(),   // https://admin.mane.com.vc
  PUBLIC_APP_BASE_URL:  z.string().url().optional(),   // https://reservas.mane.com.vc
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // ─── CORS ─────────────────────────────────────────────────────────────────
  CORS_ORIGIN:      z.string().optional(),   // usado no server.ts
  CORS_ORIGINS:     z.string().optional(),   // alias aceito
  CORS_CREDENTIALS: z.string().optional(),

  // ─── API Key externa (integrações) ────────────────────────────────────────
  EXTERNAL_API_KEY: z.string().optional(),

  // ─── E-mail (SendGrid) ────────────────────────────────────────────────────
  SENDGRID_API_KEY: z.string().optional(),
  MAIL_FROM:        z.string().optional(),
  MAIL_FROM_NAME:   z.string().optional(),

  // ─── AWS S3 (upload de fotos de área) ────────────────────────────────────
  AWS_ACCESS_KEY_ID:     z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION:            z.string().optional(),
  S3_BUCKET:             z.string().optional(),
  S3_PUBLIC_URL_BASE:    z.string().url().optional(),

  // ─── Uploads locais (fallback S3) ─────────────────────────────────────────
  UPLOADS_DIR: z.string().optional(),   // ex.: /app/data/uploads

  // ─── N8N Webhooks ─────────────────────────────────────────────────────────
  N8N_NEW_CONTACT_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_API_KEY:         z.string().optional(),

  // ─── Botmaker ─────────────────────────────────────────────────────────────
  BOTMAKER_WEBHOOK_SECRET: z.string().optional(),

  // ─── Next.js / Vite (ignoradas em runtime mas presentes no Railway) ───────
  NEXT_PUBLIC_API_BASE:       z.string().optional(),
  NEXT_DISABLE_SOURCEMAPS:    z.string().optional(),
  NEXT_TELEMETRY_DISABLED:    z.string().optional(),
  VITE_API_PREFIX:            z.string().optional(),
  NPM_CONFIG_CACHE:           z.string().optional(),

  // ─── Faturamento por mesa — fonte canônica: API Manezin ─────────────────
  // Substitui o MySQL "Zig Mané DB FULL" (cron de backfill quebrado em 2026-05).
  MANEZIN_BASE_URL:   z.string().url().optional().default('https://manezin.com.br/api/externo'),
  MANEZIN_TOKEN:      z.string().optional(),
  BILLING_GAP_MIN:    z.coerce.number().optional().default(60),   // minutos: gap max p/ continuar sessão
  BILLING_MAX_LATE_H: z.coerce.number().optional().default(8),    // horas: pivot pode atrasar até X após reserva

  // Legado MySQL ZIG Full (mantido por compat — não usado pelo novo manezin.service.ts)
  ZIG_MYSQL_URL: z.string().optional(),
  ZIG_LOJA_MAP:  z.string().optional(),
  ZIG_TOKEN:     z.string().optional(),
  ZIG_BASE_URL:  z.string().url().optional().default('https://api.zigcore.com.br/integration'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables', parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;

/**
 * Retorna as origens permitidas para CORS em array, a partir de CORS_ORIGIN.
 * Ex.: "http://localhost:5173,http://localhost:3000" -> ["http://localhost:5173","http://localhost:3000"]
 */
export function getCorsOrigins(): string[] | undefined {
  if (!env.CORS_ORIGIN) return undefined;
  return env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
}

// Aviso útil em dev: recomende o uso de SHADOW_DATABASE_URL para evitar P1017 em proxies.
if (env.NODE_ENV === 'development' && !env.SHADOW_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  SHADOW_DATABASE_URL ausente. Em ambientes via proxy (ex.: Railway), ' +
    'recomenda-se configurar um banco shadow separado para `prisma migrate dev`.'
  );
}
