// api/src/infrastructure/http/routes/auth.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../../../interfaces/http/controllers/AuthController';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Limite para evitar brute force no login
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth
router.post('/login', loginLimiter, AuthController.login);
router.get('/me', requireAuth, AuthController.me);

// Logout (stateless JWT: cliente descarta o token)
router.post('/logout', requireAuth, AuthController.logout);

export default router;
