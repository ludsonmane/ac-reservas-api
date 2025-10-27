"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
// api/src/config/logger.ts
const pino_1 = __importDefault(require("pino"));
const isProd = process.env.NODE_ENV === 'production';
exports.logger = (0, pino_1.default)({
    level: isProd ? 'info' : 'debug',
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    // Evita vazar credenciais em logs
    redact: {
        paths: [
            'req.headers.authorization',
            'headers.authorization',
            'config.database.password',
            'DATABASE_URL',
            'env.DATABASE_URL'
        ],
        censor: '***'
    },
    transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' }
        }
});
