import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../../../interfaces/http/controllers/AuthController';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, AuthController.login);
router.get('/me', requireAuth, AuthController.me);

export default router;
