"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const client_1 = require("@prisma/client");
const argon2_1 = __importDefault(require("argon2"));
const jwt_1 = require("../../../config/jwt");
const auth_dto_1 = require("../dtos/auth.dto");
const prisma = new client_1.PrismaClient();
class AuthController {
    static async login(req, res) {
        const parsed = auth_dto_1.LoginDTO.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
        }
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive)
            return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await argon2_1.default.verify(user.passwordHash, password);
        if (!ok)
            return res.status(401).json({ error: 'Invalid credentials' });
        const accessToken = (0, jwt_1.signAccessToken)({ sub: user.id, role: user.role, email: user.email });
        const refreshToken = (0, jwt_1.signRefreshToken)({ sub: user.id, email: user.email });
        return res.status(200).json({
            accessToken,
            refreshToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    }
    static async me(req, res) {
        if (!req.user)
            return res.status(401).json({ error: 'Unauthenticated' });
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        return res.json({ user });
    }
    // ===== NEW =====
    static async refresh(req, res) {
        const token = (req.body?.refreshToken || '').toString();
        if (!token)
            return res.status(400).json({ error: 'refreshToken is required' });
        try {
            const payload = (0, jwt_1.verifyRefreshToken)(token);
            // (opcional) poderia revalidar usuário no banco
            const user = await prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user || !user.isActive)
                return res.status(401).json({ error: 'Invalid user' });
            const accessToken = (0, jwt_1.signAccessToken)({ sub: user.id, role: user.role, email: user.email });
            return res.json({ accessToken });
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }
    }
    static async logout(_req, res) {
        // stateless: nada para invalidar no servidor
        return res.status(200).json({ ok: true });
    }
}
exports.AuthController = AuthController;
