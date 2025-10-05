// api/src/infrastructure/http/server.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import compression from 'compression';
import { logger } from '../../config/logger';
import { notFound } from './middlewares/notFound';
import { errorHandler } from './middlewares/errorHandler';
import { reservationsRouter } from './routes/reservations.routes';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

function parseOrigins(value?: string): (string | RegExp)[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(v => {
      // suporta regex simples se vier entre /.../
      if (v.startsWith('/') && v.endsWith('/')) {
        try { return new RegExp(v.slice(1, -1)); } catch { /* ignore */ }
      }
      return v;
    });
}

export function buildServer() {
  const app = express();

  // Em deploy atrás de proxy (Railway), mantemos IP/HTTPS corretos:
  app.set('trust proxy', 1);

  // Parsers
  app.use(express.json({ limit: '1mb' }));

  // Compressão (gzip/br) para respostas mais leves
  app.use(compression());

  // -------------------------------
  // Helmet (security headers)
  // -------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,     // para ajustar manualmente no QR
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
  // CORS
  // -------------------------------
  const origins = parseOrigins(process.env.CORS_ORIGIN) ;
  // padrão dev se não informado
  if (origins.length === 0) origins.push('http://localhost:3000');

  app.use(
    cors({
      origin: origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    })
  );

  // Preflight explícito (opcional)
  app.options('*', cors());

  // Rate limit (v7 usa "limit")
  app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

  // Logs HTTP
  app.use(pinoHttp({ logger }));

  // Healthcheck + raiz
  app.get('/', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }));
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Header especial para permitir o QR ser consumido cross-origin pelo front
  app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  // Rotas
  app.use('/v1/reservations', reservationsRouter);

  // Swagger / OpenAPI
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
