"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.getCorsOrigins = getCorsOrigins;
// api/src/config/env.ts
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    // Banco de dados (principal)
    DATABASE_URL: zod_1.z.string().url(),
    // URL direta opcional do Prisma (útil em algumas operações)
    DIRECT_URL: zod_1.z.string().url().optional(),
    // Shadow DB para prisma migrate dev (recomendado em proxies tipo Railway/PlanetScale)
    SHADOW_DATABASE_URL: zod_1.z.string().url().optional(),
    // Auth (JWT)
    JWT_SECRET: zod_1.z.string().min(16, 'JWT_SECRET muito curto — use 16+ caracteres'),
    JWT_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(16),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('7d'),
    // Porta como número (aceita string no .env e converte)
    PORT: zod_1.z.coerce.number().default(4000),
    // Host para bind no Railway / Docker / etc
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    // Permitir configurar CORS via env (opcional, ex.: "http://localhost:5173,http://localhost:3000")
    CORS_ORIGIN: zod_1.z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment variables', parsed.error.flatten());
    process.exit(1);
}
exports.env = parsed.data;
/**
 * Retorna as origens permitidas para CORS em array, a partir de CORS_ORIGIN.
 * Ex.: "http://localhost:5173,http://localhost:3000" -> ["http://localhost:5173","http://localhost:3000"]
 */
function getCorsOrigins() {
    if (!exports.env.CORS_ORIGIN)
        return undefined;
    return exports.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
}
// Aviso útil em dev: recomende o uso de SHADOW_DATABASE_URL para evitar P1017 em proxies.
if (exports.env.NODE_ENV === 'development' && !exports.env.SHADOW_DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.warn('⚠️  SHADOW_DATABASE_URL ausente. Em ambientes via proxy (ex.: Railway), ' +
        'recomenda-se configurar um banco shadow separado para `prisma migrate dev`.');
}
