"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.softAuth = exports.requireAuth = void 0;
exports.makeRequireAuth = makeRequireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getBearerToken(req) {
    const h = (req.headers.authorization || req.headers.Authorization);
    if (!h || typeof h !== 'string')
        return undefined;
    const [type, token] = h.split(' ');
    if (!type || type.toLowerCase() !== 'bearer')
        return undefined;
    return token?.trim() || undefined;
}
function getCookieToken(req) {
    const cookie = req.headers.cookie;
    if (!cookie)
        return undefined;
    const map = Object.fromEntries(cookie.split(';').map((p) => {
        const [k, ...r] = p.trim().split('=');
        return [k, decodeURIComponent((r.join('=') || '').trim())];
    }));
    return map['access_token'] || map['token'] || undefined;
}
function verifyToken(token) {
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '';
    if (!secret)
        return null;
    try {
        return jsonwebtoken_1.default.verify(token, secret);
    }
    catch {
        return null;
    }
}
/** Factory que exige auth e, opcionalmente, restringe por roles. */
function makeRequireAuth(roles) {
    const allowed = roles && new Set(roles);
    return (req, res, next) => {
        const token = getBearerToken(req) || getCookieToken(req);
        if (!token)
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing token' });
        const payload = verifyToken(token);
        if (!payload)
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
        // Preenche req.user (tipado via augmentation)
        req.user = {
            id: (payload.sub || payload.id || ''),
            role: (payload.role || 'USER'),
            email: payload.email,
            ...payload,
        };
        // Usa variável local tipada para evitar Role | undefined
        const role = (req.user?.role ?? 'USER');
        if (allowed && !allowed.has(role)) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
        }
        next();
    };
}
/** Igual ao requireAuth atual das rotas. */
exports.requireAuth = makeRequireAuth();
/** Ex.: `requireRole(['ADMIN'])` */
function requireRole(roles) {
    return makeRequireAuth(roles);
}
/** Se houver token válido, preenche req.user; senão segue anônimo. */
const softAuth = (req, _res, next) => {
    const token = getBearerToken(req) || getCookieToken(req);
    const payload = token ? verifyToken(token) : null;
    if (payload) {
        req.user = {
            id: (payload.sub || payload.id || ''),
            role: (payload.role || 'USER'),
            email: payload.email,
            ...payload,
        };
    }
    next();
};
exports.softAuth = softAuth;
