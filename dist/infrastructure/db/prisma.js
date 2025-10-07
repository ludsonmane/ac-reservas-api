"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// api/src/infrastructure/db/prisma.ts
const client_1 = require("@prisma/client");
const isProd = process.env.NODE_ENV === 'production';
// Em dev, cacheia no global para evitar múltiplas conexões a cada hot-reload
exports.prisma = isProd
    ? new client_1.PrismaClient({ log: ['warn', 'error'] })
    : global.__PRISMA__ ?? new client_1.PrismaClient({ log: ['warn', 'error'] });
if (!isProd) {
    global.__PRISMA__ = exports.prisma;
}
