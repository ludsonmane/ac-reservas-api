import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

/* ---------- Whitelist ---------- */
const RAW_ORIGINS = [
  'https://reservas.mane.com.vc',
  'https://mane.com.vc',
  'https://admin.mane.com.vc',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:4000',
] as const;

function normalizeOrigin(origin?: string | null) {
  if (!origin) return '';
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return String(origin).trim().replace(/\/+$/, '');
  }
}
const ALLOWED = new Set(RAW_ORIGINS.map(normalizeOrigin));

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/healthcheck
    const ok = ALLOWED.has(normalizeOrigin(origin));
    return ok ? cb(null, true) : cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: undefined,
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: true,
  maxAge: 600,
  optionsSuccessStatus: 204,
};

/* ---------- ORDEM IMPORTANTE ---------- */
app.use(cors(corsOptions));
app.options('/(.*)', cors(corsOptions));

app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(express.json());

/* Rotas */
// app.use('/v1', routes);

/* ---------- Handler p/ erros de CORS ---------- */
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && String(err.message || '').includes('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS_FORBIDDEN', message: err.message });
  }
  return next(err);
});

export default app;
