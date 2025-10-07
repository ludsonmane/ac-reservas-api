"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const logger_1 = require("../../../config/logger");
function fromZod(err) {
    return {
        message: 'Validation error',
        issues: err.issues.map(i => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code
        }))
    };
}
function errorHandler(err, _req, res, _next) {
    // Zod
    if (err instanceof zod_1.ZodError) {
        logger_1.logger.warn({ err }, 'zod validation error');
        return res.status(400).json(fromZod(err));
    }
    const status = typeof err.status === 'number' ? err.status : 500;
    const payload = {
        message: err.message || 'Internal Server Error',
        code: err.code,
        details: err.details && process.env.NODE_ENV !== 'production' ? err.details : undefined
    };
    if (status >= 500) {
        logger_1.logger.error({ err }, 'unhandled error');
    }
    else {
        logger_1.logger.warn({ err }, 'handled error');
    }
    return res.status(status).json(payload);
}
