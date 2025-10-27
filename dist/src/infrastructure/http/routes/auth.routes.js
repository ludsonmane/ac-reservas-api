"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// api/src/infrastructure/http/routes/auth.routes.ts
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const AuthController_1 = require("../../../interfaces/http/controllers/AuthController");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Limite para evitar brute force no login
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 min
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});
// Auth
router.post('/login', loginLimiter, AuthController_1.AuthController.login);
router.get('/me', requireAuth_1.requireAuth, AuthController_1.AuthController.me);
// Logout (stateless JWT: cliente descarta o token)
router.post('/logout', requireAuth_1.requireAuth, AuthController_1.AuthController.logout);
exports.default = router;
