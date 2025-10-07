"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
// api/src/infrastructure/http/server.ts
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const pino_http_1 = __importDefault(require("pino-http"));
const compression_1 = __importDefault(require("compression"));
const logger_1 = require("../../config/logger");
const notFound_1 = require("./middlewares/notFound");
const errorHandler_1 = require("./middlewares/errorHandler");
const reservations_routes_1 = require("./routes/reservations.routes");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function parseOrigins(value) {
    if (!value)
        return [];
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(v => {
        // suporta regex simples se vier entre /.../
        if (v.startsWith('/') && v.endsWith('/')) {
            try {
                return new RegExp(v.slice(1, -1));
            }
            catch { /* ignore */ }
        }
        return v;
    });
}
function buildServer() {
    const app = (0, express_1.default)();
    // Em deploy atrás de proxy (Railway), mantemos IP/HTTPS corretos:
    app.set('trust proxy', 1);
    // Parsers
    app.use(express_1.default.json({ limit: '1mb' }));
    // Compressão (gzip/br) para respostas mais leves
    app.use((0, compression_1.default)());
    // -------------------------------
    // Helmet (security headers)
    // -------------------------------
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false, // para ajustar manualmente no QR
        crossOriginEmbedderPolicy: false,
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'no-referrer' },
        hsts: process.env.NODE_ENV === 'production'
            ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: true }
            : false,
    }));
    // -------------------------------
    // CORS
    // -------------------------------
    const origins = parseOrigins(process.env.CORS_ORIGIN);
    // padrão dev se não informado
    if (origins.length === 0)
        origins.push('http://localhost:3000');
    app.use((0, cors_1.default)({
        origin: origins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: false,
    }));
    // Preflight explícito (opcional)
    app.options('*', (0, cors_1.default)());
    // Rate limit (v7 usa "limit")
    app.use((0, express_rate_limit_1.default)({ windowMs: 60000, limit: 120 }));
    // Logs HTTP
    app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
    // Healthcheck + raiz
    app.get('/', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }));
    app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
    // Header especial para permitir o QR ser consumido cross-origin pelo front
    app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    // Rotas
    app.use('/v1/reservations', reservations_routes_1.reservationsRouter);
    // Swagger / OpenAPI
    const openapiPath = path_1.default.resolve(__dirname, '..', '..', '..', 'openapi.json');
    let openapiDoc = { openapi: '3.0.3', info: { title: 'Mané API', version: '1.0.0' } };
    try {
        const raw = fs_1.default.readFileSync(openapiPath, 'utf-8');
        openapiDoc = JSON.parse(raw);
    }
    catch (e) {
        logger_1.logger.warn({ e }, 'openapi.json not found, serving minimal doc');
    }
    app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapiDoc));
    // 404 / erros
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    return app;
}
