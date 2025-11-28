import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());

/** Whitelist de origens permitidas */
const RAW_ORIGINS = [
  'https://reservas.mane.com.vc',
  'https://mane.com.vc',
  'https://admin.mane.com.vc',
  'http://localhost:3000',
  'http://localhost:5173',   // sem "/" no final
  'http://127.0.0.1:4000',   // com esquema http://
] as const;

/** Normaliza para comparação (remove barra final, preserva porta) */
function normalizeOrigin(origin?: string | null) {
  if (!origin) return '';
  try {
    const u = new URL(origin);
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${u.hostname}${port}`;
  } catch {
    return origin.trim().replace(/\/+$/, '');
  }
}

const ALLOWED_ORIGINS = new Set(RAW_ORIGINS.map(normalizeOrigin));

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // Requests sem Origin (curl/healthcheck) -> libera
    if (!origin) return cb(null, true);
    const norm = normalizeOrigin(origin);
    if (ALLOWED_ORIGINS.has(norm)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Client-Version',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: true,   // true se usar cookies/sessão cross-site
  maxAge: 600,         // cache do preflight (10 min)
};

app.use(cors(corsOptions));
// Express 5: use /(.*) no lugar de '*'
app.options('/(.*)', cors(corsOptions));

app.use(express.json());

// ... suas rotas
// app.use('/v1', routes);

export default app;
