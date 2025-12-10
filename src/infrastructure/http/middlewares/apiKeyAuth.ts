// api/src/infrastructure/http/middlewares/apiKeyAuth.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

function getApiKeyHeader(req: Request): string | undefined {
  const raw =
    (req.headers['x-api-key'] as string | string[] | undefined) ??
    ((req.headers as any)['X-API-KEY'] as string | string[] | undefined);

  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw.trim();
  return undefined;
}

/**
 * Middleware de API Key.
 *
 * - Valida x-api-key contra EXTERNAL_API_KEY
 * - Se bater, GERA um JWT interno e coloca em Authorization: Bearer ...
 * - A partir daí, qualquer requireAuth/requireRole funciona normal como se fosse login.
 */
export const apiKeyAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = getApiKeyHeader(req);
  const expected = process.env.EXTERNAL_API_KEY;

  if (!expected) {
    console.error('[apiKeyAuth] EXTERNAL_API_KEY not configured');
    return res
      .status(500)
      .json({ error: 'SERVER_ERROR', message: 'EXTERNAL_API_KEY not configured' });
  }

  if (!apiKey || apiKey !== expected) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
  }

  const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('[apiKeyAuth] JWT secret not configured');
    return res
      .status(500)
      .json({ error: 'SERVER_ERROR', message: 'JWT secret not configured' });
  }

  // Gera um token "fake" de usuário de sistema ADMIN
  const token = jwt.sign(
    {
      sub: 'system-api',
      id: 'system-api',
      role: 'ADMIN',
      email: undefined,
      apiKeyAuth: true,
    },
    jwtSecret,
    { expiresIn: '15m' }
  );

  // Injeta o Bearer token como se tivesse vindo do cliente normal
  (req.headers as any).authorization = `Bearer ${token}`;

  return next();
};
