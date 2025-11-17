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
import { unitsPublicRouter } from './routes/units.public.routes';
import areasUploadRouter from './routes/areas.upload.routes';
import { usersRouter } from './routes/users.routes';
// ✅ convidados
import reservationsGuestsRouter from './routes/reservations.guests.routes';

function parseOrigins(value?: string): (string | RegExp)[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => {
      if (v.startsWith('/') && v.endsWith('/')) {
        try { return new RegExp(v.slice(1, -1)); } catch {}
      }
      return v;
    });
}

export function buildServer() {
  const app = express();

  // Proxy (Railway / Nginx)
  app.set('trust proxy', 1);

  // Parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Compressão
  app.use(compression());

  // Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false, // libera /uploads e /qrcode p/ cross-origin
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: true }
        : false,
    })
  );

  // CORS
  const origins = parseOrigins(process.env.CORS_ORIGIN);
  if (origins.length === 0) {
    origins.push('http://localhost:3000', 'http://localhost:5173');
  }
  const corsOptions: CorsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = origins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
      return ok ? cb(null, true) : cb(new Error('CORS: Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions) as any);

  // === Static: /uploads (fotos etc.) ===
  // Use env UPLOADS_DIR para casar com Multer/NGINX. Fallback: ./uploads
  const UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), 'uploads');

  // garante pastas
  for (const sub of ['areas', 'units', 'temp']) {
    const dir = path.join(UPLOADS_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // cabeçalhos de mídia antes do static
  app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      fallthrough: false, // se não achar arquivo, retorna 404 aqui (não cai nas rotas)
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

  // Rotas públicas
  app.use('/v1/reservations/public', reservationsPublicRouter);
  app.use('/v1/areas/public', areasPublicRouter);
  app.use('/v1/units/public', unitsPublicRouter);

  // Auth
  app.use('/v1/auth', authRoutes);

  // Rotas privadas/admin
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
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  // 404 + erros
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
