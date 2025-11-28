import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

/* ---------- CORS via ENV ---------- */
function normalizeOrigin(origin?: string | null) {
  if (!origin) return '';
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return String(origin).trim().replace(/\/+$/, '');
  }
}

// Lê do env (CSV). Se faltar, usa alguns padrões de dev.
const CSV = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:4000',
];
const ALLOWED = new Set(CSV.map(normalizeOrigin));

// credenciais opcionais via env (default true)
const CREDENTIALS = String(process.env.CORS_CREDENTIALS ?? 'true').toLowerCase() === 'true';

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/healthcheck
    const ok = ALLOWED.has(normalizeOrigin(origin));
    return ok ? cb(null, true) : cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: undefined,        // reflete o Access-Control-Request-Headers
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: CREDENTIALS,
  maxAge: 600,
  optionsSuccessStatus: 204,
};

/* ---------- ORDEM IMPORTA ---------- */
app.use(cors(corsOptions));
app.options('/(.*)', cors(corsOptions));         // Express 5

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());

/* Rotas */
// app.use('/v1', routes);

/* Erro de CORS (log amigável) */
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && String(err.message || '').includes('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS_FORBIDDEN', message: err.message });
  }
  return next(err);
});

export default app;
