import jwt from 'jsonwebtoken';
import { env } from './env';

export type AccessTokenClaims = {
  sub: string;
  role: 'ADMIN' | 'STAFF';
  email: string;
  iat?: number;
  exp?: number;
};

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(
    claims as Record<string, unknown>,
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims;
}
