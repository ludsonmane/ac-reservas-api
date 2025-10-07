"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
// api/src/config/env.ts
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().url(),
    DIRECT_URL: zod_1.z.string().url().optional(),
    // Porta como número (aceita string no .env e converte)
    PORT: zod_1.z.coerce.number().default(4000),
    // Host para bind no Railway / Docker / etc
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    // Novo: permitir configurar CORS via env (opcional)
    CORS_ORIGIN: zod_1.z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment variables', parsed.error.flatten());
    process.exit(1);
}
exports.env = parsed.data;
