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
const areas_upload_routes_1 = __importDefault(require("./routes/areas.upload.routes"));
const users_routes_1 = require("./routes/users.routes");
const units_public_routes_1 = require("./routes/units.public.routes");
const reservations_guests_routes_1 = __importDefault(require("./routes/reservations.guests.routes"));
/* ========= Helpers de CORS ========= */
function normalizeOrigin(origin) {
    if (!origin)
        return '';
    try {
        const u = new URL(origin);
        return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
    }
    catch {
        return String(origin).trim().replace(/\/+$/, '');
    }
}
function parseOriginsCSV(value) {
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
            catch { /* ignore */ }
        }
        return normalizeOrigin(v);
    });
}
function buildServer() {
    const app = (0, express_1.default)();
    // Proxy (Railway / Nginx)
    app.set('trust proxy', 1);
    /* ========= CORS (vem ANTES de tudo) ========= */
    const rawCors = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '').trim();
    const origins = parseOriginsCSV(rawCors);
    if (origins.length === 0) {
        // fallback dev
        origins.push('http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:4000');
    }
    const isAllowed = (origin) => {
        if (!origin)
            return false;
        const norm = normalizeOrigin(origin);
        return origins.some((o) => (o instanceof RegExp ? o.test(origin) : o === norm));
    };
    // 👉 UNIVERSAL: aplica headers CORS em TODAS as respostas (e resolve preflight)
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && isAllowed(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            const reqHeaders = req.headers['access-control-request-headers'] ||
                'Content-Type, Authorization, X-Requested-With, X-Client-Version, X-CSRF-Token';
            res.setHeader('Access-Control-Allow-Headers', reqHeaders);
            res.setHeader('Access-Control-Max-Age', '600');
        }
        if (req.method === 'OPTIONS') {
            return isAllowed(origin) ? res.sendStatus(204) : res.sendStatus(403);
        }
        next();
    });
    // (mantém cors() por compat — não atrapalha)
    const corsOptions = {
        origin(origin, cb) {
            if (!origin)
                return cb(null, true); // curl/health
            return isAllowed(origin) ? cb(null, true) : cb(new Error('CORS: Origin not allowed'));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
        optionsSuccessStatus: 204,
    };
    app.use((0, cors_1.default)(corsOptions));
    // ❌ REMOVIDO: app.options('/(.*)', ...) que quebrava no Express 5
    /* ========= Parsers / infra ========= */
    app.use(express_1.default.json({ limit: '2mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, compression_1.default)());
    // Helmet (depois do CORS para não conflitar)
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
    // Use env UPLOADS_DIR para casar com Multer/NGINX. Fallback: ./uploads
    const UPLOADS_DIR = process.env.UPLOADS_DIR
        ? path_1.default.resolve(process.env.UPLOADS_DIR)
        : path_1.default.resolve(process.cwd(), 'uploads');
    console.log('[uploads] UPLOADS_DIR =', UPLOADS_DIR);
    // garante estrutura de diretórios para uploads
    const AREAS_DIR = path_1.default.join(UPLOADS_DIR, 'areas');
    const TEMP_DIR = path_1.default.join(UPLOADS_DIR, 'temp');
    try {
        fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs_1.default.mkdirSync(AREAS_DIR, { recursive: true });
        fs_1.default.mkdirSync(TEMP_DIR, { recursive: true });
        console.log('[uploads] ensured dirs:', { UPLOADS_DIR, AREAS_DIR, TEMP_DIR });
    }
    catch (e) {
        console.error('[uploads] failed to ensure dirs', e);
    }
    for (const sub of ['areas', 'units', 'temp']) {
        const dir = path_1.default.join(UPLOADS_DIR, sub);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
    }
    // cabeçalhos de mídia antes do static
    app.use('/uploads', (_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    app.use('/uploads', express_1.default.static(UPLOADS_DIR, {
        fallthrough: false,
        index: false,
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        setHeaders(res) {
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        },
    }));
    // Logs HTTP
    app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
    // Limiter
    app.use((0, express_rate_limit_1.default)({ windowMs: 60_000, limit: 120 }));
    // Health
    app.get('/', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }));
    app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
    // Header p/ QR (embed cross-origin)
    app.use('/v1/reservations/:id/qrcode', (_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    /* ========= Rotas ========= */
    // públicas
    app.use('/v1/reservations/public', reservations_public_routes_1.reservationsPublicRouter);
    app.use('/v1/areas/public', areas_public_routes_1.areasPublicRouter);
    app.use('/v1/units/public', units_public_routes_1.unitsPublicRouter);
    // auth
    app.use('/v1/auth', auth_routes_1.default);
    // privadas/admin
    app.use('/v1/reservations', reservations_routes_1.reservationsRouter);
    app.use('/v1/reservations', reservations_guests_routes_1.default); // convidados
    app.use('/v1/areas', areas_routes_1.areasRouter);
    app.use('/v1/areas', areas_upload_routes_1.default); // upload de foto de área
    app.use('/v1/units', units_routes_1.unitsRouter);
    app.use('/v1/users', users_routes_1.usersRouter);
    // Swagger
    const openapiPath = path_1.default.resolve(__dirname, '..', '..', '..', 'openapi.json');
    let openapiDoc = { openapi: '3.0.3', info: { title: 'Mané API', version: '1.0.0' } };
    try {
        openapiDoc = JSON.parse(fs_1.default.readFileSync(openapiPath, 'utf-8'));
    }
    catch (e) {
        logger_1.logger.warn({ e }, 'openapi.json not found, serving minimal doc');
    }
    app.use('/v1/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapiDoc));
    // 404 + erros
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    return app;
}
