// api/src/index.ts
import 'dotenv/config'; // garante variáveis carregadas cedo
import { buildServer } from './infrastructure/http/server';
import { env } from './config/env';
import { logger } from './config/logger';

const app = buildServer();

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
