// src/db/client.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // Evita múltiplas instâncias em dev com hot-reload
  // (o "var" no escopo global do Node)
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

export default prisma;
