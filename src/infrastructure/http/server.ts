// api/src/infrastructure/http/server.ts
import express from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import compression from 'compression';
import { logger } from '../../config/logger';
import { notFound } from './middlewares/notFound';
import { errorHandler } from './middlewares/errorHandler';
import { reservationsRouter } from './routes/reservations.routes';
import { unitsRouter } from './routes/units.routes';
import { areasRouter } from './routes/areas.routes';
import { areasPublicRouter } from './routes/areas.public.routes';
import { unitsPublicRouter } from './routes/units.public.routes';
import { reservationsPublicRouter } from './routes/reservations.public.routes';
import { areasUploadRouter } from './routes/areas.upload.routes';
import swaggerUi from 'swagger-ui-express';
import { usersRouter } from './routes/users.routes';
import path from 'path';
import fs from 'fs';

// ✅ rotas de autenticação
import authRoutes from './routes/auth.routes';

function parseOrigins(value?: string): (string | RegExp)[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => {
      if (v.startsWith('/') && v.endsWith('/')) {
        try {
          return new RegExp(v.slice(1, -1));
        } catch {
          /* ignore regex inválida */
        }
      }
      return v;
    });
}

export function buildServer() {
  const app = express();

  // Em deploy atrás de proxy (ex.: Railway / Nginx)
  app.set('trust proxy', 1);

  // Parsers
  app.use(express.json({ limit: '1mb' }));

  // Compressão (gzip/br)
  app.use(compression());

  // -------------------------------
  // Helmet (security headers)
  // -------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false, // QR / uploads cross-origin
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: true }
          : false,
    })
  );

  // -------------------------------
  // CORS (com credenciais)
  // -------------------------------
  const origins = parseOrigins(process.env.CORS_ORIGIN);
  if (origins.length === 0) {
    // padrão dev
    origins.push('http://localhost:5173', 'http://localhost:3000');
  }

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true); // permite curl/postman
      const ok = origins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin
      );
      return ok ? callback(null, true) : callback(new Error('CORS: Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions)); // preflight

  // -------------------------------
  // Static: /uploads (p/ fotos de áreas, etc.)
  // -------------------------------
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  app.use(
    '/uploads',
    (req, res, next) => {
      // permitir embed de imagens pelo front (Next)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(uploadsDir, {
      maxAge: '7d',
      index: false,
    })
  );

  // Rate limit (v7 usa "limit")
  app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

  // Logs HTTP
  app.use(pinoHttp({ logger }));

  // Rotas públicas específicas
  app.use('/v1/reservations/public', reservationsPublicRouter);

  // Healthcheck + raiz
  app.get('/', (_req, res) =>
    res.json({ ok: true, service: 'api', ts: new Date().toISOString() })
  );
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Cabeçalho para permitir o QR ser consumido cross-origin pelo front
  app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  // -------------------------------
  // Rotas
  // -------------------------------
  app.use('/auth', authRoutes);               // /auth/login, /auth/me, /auth/refresh, /auth/logout
  app.use('/v1/reservations', reservationsRouter);
  app.use('/v1/units', unitsRouter);
  app.use('/v1/areas', areasRouter);
  app.use('/v1/areas', areasUploadRouter);    // ⬅️ upload de foto da Área
  

  // Rotas públicas (sem duplicar prefixo)
  app.use('/v1/areas/public', areasPublicRouter);
  app.use('/v1/units/public', unitsPublicRouter);
  app.use('/v1/users', usersRouter);

  // -------------------------------
  // Swagger / OpenAPI
  // -------------------------------
  const openapiPath = path.resolve(__dirname, '..', '..', '..', 'openapi.json');
  let openapiDoc: any = { openapi: '3.0.3', info: { title: 'Mané API', version: '1.0.0' } };
  try {
    const raw = fs.readFileSync(openapiPath, 'utf-8');
    openapiDoc = JSON.parse(raw);
  } catch (e) {
    logger.warn({ e }, 'openapi.json not found, serving minimal doc');
  }
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

  // 404 / erros
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
