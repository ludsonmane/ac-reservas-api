// api/src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // Porta como número (aceita string no .env e converte)
  PORT: z.coerce.number().default(4000),

  // Host para bind no Railway / Docker / etc
  HOST: z.string().default('0.0.0.0'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Novo: permitir configurar CORS via env (opcional)
  CORS_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables', parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;
