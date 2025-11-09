// src/infrastructure/http/controllers/AuthController.ts
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { signAccessToken } from '../../../config/jwt';
import type { AuthResponseDto } from '../dtos/auth.dto';
import { LoginSchema } from '../dtos/auth.dto';
import { prisma } from '../../../infrastructure/db/prisma';

export class AuthController {
  /**
   * POST /auth/login
   * Body: { email, password }
   */
  static async login(req: Request, res: Response) {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      }

      const email = parsed.data.email.trim().toLowerCase();
      const password = parsed.data.password;

      // Busca usuário ativo
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true, isActive: true, passwordHash: true },
      });

      // Se não existir ou inativo → 401
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Confere hash (argon2)
      const ok = await argon2.verify(user.passwordHash, password);
      if (!ok) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Emite JWT
      const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: (user.role as 'ADMIN' | 'STAFF'),
      });

      const payload: AuthResponseDto = {
        accessToken: token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };

      return res.status(200).json(payload);
    } catch (e) {
      console.error('AuthController.login error', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  /** GET /auth/me (protegidA por requireAuth) */
  static async me(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });

      if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthenticated' });
      return res.json({ user });
    } catch (e) {
      console.error('AuthController.me error', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  /** POST /auth/logout (JWT é stateless) */
  static async logout(_req: Request, res: Response) {
    return res.status(204).send();
  }
}
