// api/src/infrastructure/http/server.ts
import express from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import compression from 'compression';
import path from 'path';
import fs from 'fs';

import swaggerUi from 'swagger-ui-express';
import { logger } from '../../config/logger';
import { notFound } from './middlewares/notFound';
import { errorHandler } from './middlewares/errorHandler';

// Rotas
import authRoutes from './routes/auth.routes';
import { reservationsRouter } from './routes/reservations.routes';
import { reservationsPublicRouter } from './routes/reservations.public.routes';
import { unitsRouter } from './routes/units.routes';
import { areasRouter } from './routes/areas.routes';
import { areasPublicRouter } from './routes/areas.public.routes';
import areasUploadRouter from './routes/areas.upload.routes';
import { usersRouter } from './routes/users.routes';
import { unitsPublicRouter } from './routes/units.public.routes';
import reservationsGuestsRouter from './routes/reservations.guests.routes';
import { blocksRouter } from './routes/blocks.routes'; // <--- NOVO
/* ========= Helpers de CORS ========= */
function normalizeOrigin(origin?: string | null) {
  if (!origin) return '';
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return String(origin).trim().replace(/\/+$/, '');
  }
}

function parseOriginsCSV(value?: string): (string | RegExp)[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => {
      if (v.startsWith('/') && v.endsWith('/')) {
        try { return new RegExp(v.slice(1, -1)); } catch { /* ignore */ }
      }
      return normalizeOrigin(v);
    });
}

export function buildServer() {
  const app = express();

  // Proxy (Railway / Nginx)
  app.set('trust proxy', 1);

  /* ========= CORS (vem ANTES de tudo) ========= */
  const rawCors = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '').trim();
  const origins = parseOriginsCSV(rawCors);
  if (origins.length === 0) {
    // fallback dev
    origins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:4000'
    );
  }

  const isAllowed = (origin?: string) => {
    if (!origin) return false;
    const norm = normalizeOrigin(origin);
    return origins.some((o) => (o instanceof RegExp ? o.test(origin) : o === norm));
  };

  // 👉 UNIVERSAL: aplica headers CORS em TODAS as respostas (e resolve preflight)
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      const reqHeaders =
        (req.headers['access-control-request-headers'] as string | undefined) ||
        'Content-Type, Authorization, X-Requested-With, X-Client-Version, X-CSRF-Token';
      res.setHeader('Access-Control-Allow-Headers', reqHeaders);
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      return isAllowed(origin) ? res.sendStatus(204) : res.sendStatus(403);
    }
    next();
  });

  // (mantém cors() por compat — não atrapalha)
  const corsOptions: CorsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/health
      return isAllowed(origin) ? cb(null, true) : cb(new Error('CORS: Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  // ❌ REMOVIDO: app.options('/(.*)', ...) que quebrava no Express 5

  /* ========= Parsers / infra ========= */
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(compression());

  // Helmet (depois do CORS para não conflitar)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false, // libera /uploads e /qrcode p/ cross-origin
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: true }
          : false,
    })
  );

  // Use env UPLOADS_DIR para casar com Multer/NGINX. Fallback: ./uploads
  const UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), 'uploads');

  console.log('[uploads] UPLOADS_DIR =', UPLOADS_DIR);

  // garante estrutura de diretórios para uploads
  const AREAS_DIR = path.join(UPLOADS_DIR, 'areas');
  const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.mkdirSync(AREAS_DIR, { recursive: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log('[uploads] ensured dirs:', { UPLOADS_DIR, AREAS_DIR, TEMP_DIR });
  } catch (e) {
    console.error('[uploads] failed to ensure dirs', e);
  }

  for (const sub of ['areas', 'units', 'temp']) {
    const dir = path.join(UPLOADS_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // cabeçalhos de mídia antes do static
  app.use('/uploads', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      fallthrough: false,
      index: false,
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      },
    })
  );

  // Logs HTTP
  app.use(pinoHttp({ logger }));

  // Limiter
  app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

  // Health
  app.get('/', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }));
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Header p/ QR (embed cross-origin)
  app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  /* ========= Rotas ========= */
  // públicas
  app.use('/v1/reservations/public', reservationsPublicRouter);
  app.use('/v1/areas/public', areasPublicRouter);
  app.use('/v1/units/public', unitsPublicRouter);
  app.use('/v1/blocks', blocksRouter); // <--- NOVO
  // auth
  app.use('/v1/auth', authRoutes);

  // privadas/admin
  app.use('/v1/reservations', reservationsRouter);
  app.use('/v1/reservations', reservationsGuestsRouter); // convidados
  app.use('/v1/areas', areasRouter);
  app.use('/v1/areas', areasUploadRouter); // upload de foto de área
  app.use('/v1/units', unitsRouter);
  app.use('/v1/users', usersRouter);

  // Swagger
  const openapiPath = path.resolve(__dirname, '..', '..', '..', 'openapi.json');
  let openapiDoc: any = { openapi: '3.0.3', info: { title: 'Mané API', version: '1.0.0' } };
  try {
    openapiDoc = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));
  } catch (e) {
    logger.warn({ e }, 'openapi.json not found, serving minimal doc');
  }
  app.use('/v1/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  // 404 + erros
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
