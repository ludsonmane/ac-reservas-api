// api/src/infrastructure/db/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

// Em dev, cacheia no global para evitar múltiplas conexões a cada hot-reload
export const prisma =
  isProd
    ? new PrismaClient({ log: ['warn', 'error'] })
    : global.__PRISMA__ ?? new PrismaClient({ log: ['warn', 'error'] });

if (!isProd) {
  global.__PRISMA__ = prisma;
}
