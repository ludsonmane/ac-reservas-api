"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
/**
 * Middleware global de erro.
 * - Loga stack em NODE_ENV !== 'production'
 * - Retorna JSON consistente
 */
function errorHandler(err, _req, res, _next) {
    const status = (typeof err?.status === 'number' && err.status) ||
        (typeof err?.statusCode === 'number' && err.statusCode) ||
        500;
    const isProd = process.env.NODE_ENV === 'production';
    // Mensagem segura em produção
    const message = (typeof err?.message === 'string' && err.message) ||
        (status === 404 ? 'Recurso não encontrado.' : 'Erro interno do servidor.');
    if (!isProd) {
        // Log mais verboso em dev
        // eslint-disable-next-line no-console
        console.error('[errorHandler]', err);
    }
    res.status(status).json({
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message,
        ...(isProd ? {} : { stack: err?.stack, details: err }), // inclui detalhes só em dev
    });
}
exports.default = errorHandler;
