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
import { unitsPublicRouter } from './routes/units.public.routes';
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
// ✅ convidados
import reservationsGuestsRouter from './routes/reservations.guests.routes';

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

function parseOrigins(value?: string): (string | RegExp)[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => {
      if (v.startsWith('/') && v.endsWith('/')) {
        try { return new RegExp(v.slice(1, -1)); } catch { /* ignora regex inválida */ }
      }
      return normalizeOrigin(v);
    });
}

export function buildServer() {
  const app = express();

  // Proxy (Railway / Nginx)
  app.set('trust proxy', 1);

  /* ========= CORS (vem ANTES do helmet/rotas) ========= */
  // Aceita CORS_ORIGIN ou CORS_ORIGINS (CSV)
  const rawCors = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '').trim();
  const origins = parseOrigins(rawCors);
  if (origins.length === 0) {
    // fallback dev
    origins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:4000'
    );
  }

  const corsOptions: CorsOptions = {
    origin(origin, cb) {
      // requests sem Origin (curl/healthcheck) -> libera
      if (!origin) return cb(null, true);
      const norm = normalizeOrigin(origin);
      const ok = origins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === norm
      );
      return ok ? cb(null, true) : cb(new Error('CORS: Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,           // necessário se usar cookies/sessão cross-site
    optionsSuccessStatus: 204,   // 204 no preflight
    // allowedHeaders indefinido -> o pacote reflete o Access-Control-Request-Headers
  };

  app.use(cors(corsOptions));
  // Express 5: use string pattern /(.*) (não use '*')
  app.options('/(.*)', cors(corsOptions));

  // Parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Compressão
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

  // 🔎 LOGA ONDE ESTÁ SALVANDO (confira nos logs que é /data/uploads)
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

  // garante pastas
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

  // --- DEBUG STORAGE (temporário) ---
  app.get('/__storage', async (_req, res) => {
    try {
      const raw = process.env.UPLOADS_DIR || '';
      const resolved = require('path').resolve(raw || process.cwd(), 'uploads');
      const fs = require('fs');
      const areas = require('path').join(resolved, 'areas');

      const exists = fs.existsSync(resolved);
      const areasExists = fs.existsSync(areas);
      let areasFiles: string[] = [];
      try { areasFiles = areasExists ? fs.readdirSync(areas) : []; } catch { }

      // teste de escrita
      let writeOk = false;
      try {
        fs.writeFileSync(require('path').join(resolved, 'temp', '.probe'), String(Date.now()), { flag: 'w' });
        writeOk = true;
      } catch { }

      res.json({
        UPLOADS_DIR_env: raw || '(vazio)',
        resolvedPath: resolved,
        exists,
        areasExists,
        writeOk,
        areasCount: areasFiles.length,
        sample: areasFiles.slice(0, 10),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
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
  app.use('/v1/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  // 404 + erros
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
