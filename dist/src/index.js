"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// api/src/index.ts
require("dotenv/config"); // garante variáveis carregadas cedo
const server_1 = require("./infrastructure/http/server");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const app = (0, server_1.buildServer)();
const PORT = Number(process.env.PORT ?? env_1.env.PORT ?? 4000);
const HOST = String(process.env.HOST ?? env_1.env.HOST ?? '0.0.0.0');
const server = app.listen(PORT, HOST, () => {
    logger_1.logger.info({ PORT, HOST, mode: process.env.NODE_ENV }, `[api] listening on http://${HOST}:${PORT}`);
});
// ----- graceful shutdown -----
function shutdown(signal) {
    logger_1.logger.warn({ signal }, 'received signal, closing server...');
    server.close(err => {
        if (err) {
            logger_1.logger.error({ err }, 'error on server close');
            process.exit(1);
        }
        logger_1.logger.info('server closed. bye 👋');
        process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// ----- global error handlers -----
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
    logger_1.logger.fatal({ err }, 'uncaughtException');
    // opcional: encerrar para reinício limpo em prod
    process.exit(1);
});
