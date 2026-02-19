// api/src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Banco de dados (principal)
  DATABASE_URL: z.string().url(),

  // URL direta opcional do Prisma (útil em algumas operações)
  DIRECT_URL: z.string().url().optional(),

  // Shadow DB para prisma migrate dev (recomendado em proxies tipo Railway/PlanetScale)
  SHADOW_DATABASE_URL: z.string().url().optional(),

  // Auth (JWT)
  JWT_SECRET: z.string().min(16, 'JWT_SECRET muito curto — use 16+ caracteres'),
  // Mantém login por 24h (pode sobrescrever via env JWT_EXPIRES_IN)
  JWT_EXPIRES_IN: z.string().default('24h'),

  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Porta como número (aceita string no .env e converte)
  PORT: z.coerce.number().default(4000),

  // Host para bind no Railway / Docker / etc
  HOST: z.string().default('0.0.0.0'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Permitir configurar CORS via env (opcional, ex.: "http://localhost:5173,http://localhost:3000")
  CORS_ORIGIN: z.string().optional(),
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
