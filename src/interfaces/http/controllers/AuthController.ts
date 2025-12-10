import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../config/jwt';
import { LoginDTO } from '../dtos/auth.dto';

const prisma = new PrismaClient();

export class AuthController {
  static async login(req: Request, res: Response) {
    const parsed = LoginDTO.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id, email: user.email });

    return res.status(200).json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }

  static async me(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  }

  // ===== NEW =====
  static async refresh(req: Request, res: Response) {
    const token = (req.body?.refreshToken || '').toString();
    if (!token) return res.status(400).json({ error: 'refreshToken is required' });

    try {
      const payload = verifyRefreshToken(token);
      // (opcional) poderia revalidar usuário no banco
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid user' });

      const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
      return res.json({ accessToken });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  static async logout(_req: Request, res: Response) {
    // stateless: nada para invalidar no servidor
    return res.status(200).json({ ok: true });
  }
}
