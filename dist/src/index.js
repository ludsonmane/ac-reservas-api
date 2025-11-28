"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
// --- Whitelist ---
const RAW_ORIGINS = [
    'https://reservas.mane.com.vc',
    'https://mane.com.vc',
    'https://admin.mane.com.vc',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://api.mane.com.vc',
];
function normalize(origin) {
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
const ALLOWED = new Set((process.env.CORS_ORIGINS || 'https://admin.mane.com.vc,https://reservas.mane.com.vc,https://mane.com.vc,http://localhost:3000,http://localhost:5173,http://127.0.0.1:4000')
    .split(',').map(s => normalize(s.trim())).filter(Boolean));
const CREDENTIALS = String(process.env.CORS_CREDENTIALS ?? 'true').toLowerCase() === 'true';
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const norm = normalize(origin);
    const allowed = !origin || ALLOWED.has(norm);
    if (allowed) {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        } // curl/healthcheck
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        const reqHeaders = req.headers['access-control-request-headers'];
        res.setHeader('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, Authorization, X-Requested-With, X-Client-Version, X-CSRF-Token');
        if (CREDENTIALS && origin)
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS')
        return allowed ? res.sendStatus(204) : res.sendStatus(403);
    next();
});
// depois disso:
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use(express_1.default.json());
// suas rotas…
// app.use('/v1', routes);
exports.default = app;
