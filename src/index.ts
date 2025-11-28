import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());

// --- Whitelist ---
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
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${u.hostname}${port}`;
  } catch {
    return origin.trim().replace(/\/+$/, '');
  }
}
const ALLOWED = new Set(RAW_ORIGINS.map(normalizeOrigin));

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/healthchecks
    const norm = normalizeOrigin(origin);
    if (ALLOWED.has(norm)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // Deixe undefined para refletir automaticamente o Access-Control-Request-Headers
  allowedHeaders: undefined,
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: true,         // true se usa cookies/sessão cross-site
  maxAge: 600,               // cache do preflight
  optionsSuccessStatus: 204, // status do preflight
};

// 1) Aplica CORS global
app.use(cors(corsOptions));

// 2) Intercepta QUALQUER OPTIONS (Express 5: sem '*')
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors(corsOptions)(req, res, () => res.sendStatus(204));
  }
  next();
});

// body parser depois do CORS
app.use(express.json());

// suas rotas…
// app.use('/v1', routes);

export default app;
