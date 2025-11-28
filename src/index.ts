// api/src/index.ts
import 'dotenv/config'; // garante variáveis carregadas cedo
import { env } from './config/env';
import { logger } from './config/logger';
import express from 'express';
const app = express();

// middlewares básicos (caso já tenha em outro lugar, pode remover estes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== monte aqui as rotas existentes do seu projeto =====
// exemplo (se você tiver um registrador central):
// import { mountAllRoutes } from './infrastructure/http/mountAllRoutes';
// mountAllRoutes(app);

// ------- healthcheck (opcional) -------
app.get('/health', (_req, res) => res.json({ ok: true }));

// ------- start -------
const PORT = Number(process.env.PORT ?? env.PORT ?? 4000);
const HOST = String(process.env.HOST ?? env.HOST ?? '0.0.0.0');

const server = app.listen(PORT, HOST, () => {
  logger.info({ PORT, HOST, mode: process.env.NODE_ENV }, `[api] listening on http://${HOST}:${PORT}`);
});

// ----- graceful shutdown -----
function shutdown(signal: NodeJS.Signals) {
  logger.warn({ signal }, 'received signal, closing server...');
  server.close(err => {
    if (err) {
      logger.error({ err }, 'error on server close');
      process.exit(1);
    }
    logger.info('server closed. bye 👋');
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ----- global error handlers -----
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  // opcional: encerrar para reinício limpo em prod
  process.exit(1);
});
