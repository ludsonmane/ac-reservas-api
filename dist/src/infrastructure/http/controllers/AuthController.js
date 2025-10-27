"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const argon2_1 = __importDefault(require("argon2"));
const jwt_1 = require("../../../config/jwt");
const auth_dto_1 = require("../dtos/auth.dto");
const prisma_1 = require("../../../infrastructure/db/prisma"); // usa a instância compartilhada
class AuthController {
    /**
     * POST /auth/login
     * Body: { email, password }
     */
    static async login(req, res) {
        try {
            const parsed = auth_dto_1.LoginSchema.safeParse(req.body);
            if (!parsed.success) {
                return res
                    .status(400)
                    .json({ error: 'Invalid payload', issues: parsed.error.flatten() });
            }
            const { email, password } = parsed.data;
            const user = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (!user || !user.isActive) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const ok = await argon2_1.default.verify(user.passwordHash, password);
            if (!ok) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const jwt = (0, jwt_1.signAccessToken)({
                sub: user.id,
                role: user.role,
                email: user.email,
            });
            // Compat: devolvemos token e accessToken
            return res.status(200).json({
                token: jwt,
                accessToken: jwt,
                tokenType: 'Bearer',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error('AuthController.login error', e);
            return res.status(500).json({ error: 'Internal error' });
        }
    }
    /**
     * GET /auth/me
     * Header: Authorization: Bearer <token>
     */
    static async me(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthenticated' });
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
            });
            if (!user)
                return res.status(404).json({ error: 'User not found' });
            return res.json({ user });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error('AuthController.me error', e);
            return res.status(500).json({ error: 'Internal error' });
        }
    }
    /**
     * POST /auth/logout
     * Header: Authorization: Bearer <token>
     * (JWT é stateless — apenas responde 204 e o cliente descarta o token)
     */
    static async logout(_req, res) {
        return res.status(204).send();
    }
}
exports.AuthController = AuthController;
