import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'ADMIN' | 'STAFF' | 'USER' | string;

export interface JwtPayloadMinimal {
  sub?: string;
  id?: string;
  role?: Role;
  email?: string;
  [k: string]: any;
}

function getBearerToken(req: Request): string | undefined {
  const h = (req.headers.authorization || (req.headers as any).Authorization) as string | undefined;
  if (!h || typeof h !== 'string') return undefined;
  const [type, token] = h.split(' ');
  if (!type || type.toLowerCase() !== 'bearer') return undefined;
  return token?.trim() || undefined;
}

function getCookieToken(req: Request): string | undefined {
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  const map = Object.fromEntries(
    cookie.split(';').map((p) => {
      const [k, ...r] = p.trim().split('=');
      return [k, decodeURIComponent((r.join('=') || '').trim())];
    })
  );
  return map['access_token'] || map['token'] || undefined;
}

function verifyToken(token: string): JwtPayloadMinimal | null {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '';
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as JwtPayloadMinimal;
  } catch {
    return null;
  }
}

// pega x-api-key (case-insensitive, array-safe)
function getApiKeyHeader(req: Request): string | undefined {
  const raw =
    (req.headers['x-api-key'] as string | string[] | undefined) ??
    ((req.headers as any)['X-API-KEY'] as string | string[] | undefined);

  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw.trim();
  return undefined;
}

/** Factory que exige auth e, opcionalmente, restringe por roles. */
export function makeRequireAuth(roles?: ReadonlyArray<Role>): RequestHandler {
  const allowed = roles && new Set(roles);

  return (req: Request, res: Response, next: NextFunction) => {
    /* 1) Atalho: auth via x-api-key (token fixo de integrações) */
    const apiKey = getApiKeyHeader(req);
    const externalKey = process.env.EXTERNAL_API_KEY;

    if (apiKey) {
      // Se tiver externalKey configurada, valida. Se não tiver, aceita qualquer x-api-key.
      if (externalKey && apiKey !== externalKey) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
      }

      (req as any).user = {
        id: 'system-api',
        role: 'ADMIN' as Role,
        email: undefined,
        apiKeyAuth: true,
      };

      return next();
    }

    /* 2) Fluxo padrão: Bearer + cookie (igual antes) */
    const token = getBearerToken(req) || getCookieToken(req);
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing token' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    (req as any).user = {
      id: (payload.sub || payload.id || '') as string,
      role: (payload.role || 'USER') as Role,
      email: payload.email,
      ...payload,
    };

    const role: Role = (((req as any).user?.role) ?? 'USER') as Role;

    if (allowed && !allowed.has(role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    next();
  };
}

/** Igual ao requireAuth atual das rotas. */
export const requireAuth: RequestHandler = makeRequireAuth();

/** Ex.: `requireRole(['ADMIN'])` */
export function requireRole(roles: ReadonlyArray<Role>): RequestHandler {
  return makeRequireAuth(roles);
}

/** Se houver token válido, preenche req.user; senão segue anônimo. */
export const softAuth: RequestHandler = (req, _res, next) => {
  const token = getBearerToken(req) || getCookieToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    (req as any).user = {
      id: (payload.sub || payload.id || '') as string,
      role: (payload.role || 'USER') as Role,
      email: payload.email,
      ...payload,
    };
  }
  next();
};
