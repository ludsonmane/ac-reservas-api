// api/src/interfaces/http/controllers/AuthController.ts
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { signAccessToken } from '../../../config/jwt';
import type { AuthResponseDto } from '../dtos/auth.dto';
import { LoginSchema } from '../dtos/auth.dto';

import { prisma } from '../../../infrastructure/db/prisma'; // usa a instância compartilhada

export class AuthController {
  /**
   * POST /auth/login
   * Body: { email, password }
   */
  static async login(req: Request, res: Response) {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const ok = await argon2.verify(user.passwordHash, password);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const jwt = signAccessToken({
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('AuthController.login error', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  /**
   * GET /auth/me
   * Header: Authorization: Bearer <token>
   */
  static async me(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }

      const user = await prisma.user.findUnique({
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

      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ user });
    } catch (e) {
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
  static async logout(_req: Request, res: Response) {
    return res.status(204).send();
  }
}
