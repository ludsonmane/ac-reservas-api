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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const logger_1 = require("../../config/logger");
const notFound_1 = require("./middlewares/notFound");
const errorHandler_1 = require("./middlewares/errorHandler");
// Rotas
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const reservations_routes_1 = require("./routes/reservations.routes");
const reservations_public_routes_1 = require("./routes/reservations.public.routes");
const units_routes_1 = require("./routes/units.routes");
const areas_routes_1 = require("./routes/areas.routes");
const areas_public_routes_1 = require("./routes/areas.public.routes");
const units_public_routes_1 = require("./routes/units.public.routes");
const areas_upload_routes_1 = __importDefault(require("./routes/areas.upload.routes"));
const users_routes_1 = require("./routes/users.routes");
function parseOrigins(value) {
    if (!value)
        return [];
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((v) => {
        if (v.startsWith('/') && v.endsWith('/')) {
            try {
                return new RegExp(v.slice(1, -1));
            }
            catch {
                /* regex inválida -> ignora */
            }
        }
        return v;
    });
}
function buildServer() {
    const app = (0, express_1.default)();
    // Atrás de proxy (Railway / Nginx)
    app.set('trust proxy', 1);
    // Parsers
    app.use(express_1.default.json({ limit: '2mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Compressão
    app.use((0, compression_1.default)());
    // Helmet
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false, // libera /uploads e /qrcode p/ cross-origin
        crossOriginEmbedderPolicy: false,
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'no-referrer' },
        hsts: process.env.NODE_ENV === 'production'
            ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: true }
            : false,
    }));
    // CORS
    const origins = parseOrigins(process.env.CORS_ORIGIN);
    if (origins.length === 0) {
        // defaults de dev
        origins.push('http://localhost:3000', 'http://localhost:5173');
    }
    const corsOptions = {
        origin(origin, cb) {
            if (!origin)
                return cb(null, true); // curl/postman
            const ok = origins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
            return ok ? cb(null, true) : cb(new Error('CORS: Origin not allowed'));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
        optionsSuccessStatus: 204,
    };
    app.use((0, cors_1.default)(corsOptions));
    // ✅ alternativa opcional, compatível:
    app.options(/.*/, (0, cors_1.default)(corsOptions));
    // Static: /uploads (fotos de áreas)
    const uploadsDir = path_1.default.resolve(process.cwd(), 'uploads');
    if (!fs_1.default.existsSync(uploadsDir))
        fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    }, express_1.default.static(uploadsDir, {
        index: false,
        maxAge: '7d',
    }));
    // Logs HTTP
    app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
    // Limiter (v7 usa `limit`)
    app.use((0, express_rate_limit_1.default)({ windowMs: 60_000, limit: 120 }));
    // Healthcheck + raiz
    app.get('/', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }));
    app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
    // Header para o endpoint de QR (libera embed cross-origin)
    app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    // Rotas públicas específicas (antes das privadas p/ não conflitar)
    app.use('/v1/reservations/public', reservations_public_routes_1.reservationsPublicRouter);
    app.use('/v1/areas/public', areas_public_routes_1.areasPublicRouter);
    app.use('/v1/units/public', units_public_routes_1.unitsPublicRouter);
    // Auth
    app.use('/auth', auth_routes_1.default);
    // Rotas privadas/admin
    app.use('/v1/reservations', reservations_routes_1.reservationsRouter);
    app.use('/v1/areas', areas_routes_1.areasRouter);
    app.use('/v1/areas', areas_upload_routes_1.default); // upload de foto de área
    app.use('/v1/units', units_routes_1.unitsRouter);
    app.use('/v1/users', users_routes_1.usersRouter);
    // Swagger
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
    // 404 + erros
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    return app;
}
