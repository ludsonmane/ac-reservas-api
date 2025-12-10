import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { signAccessToken } from '../../../config/jwt';
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
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    return res.status(200).json({
      token,
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
}
