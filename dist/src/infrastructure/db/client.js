"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/db/client.ts
const client_1 = require("@prisma/client");
exports.prisma = global.__prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    });
if (process.env.NODE_ENV !== 'production')
    global.__prisma = exports.prisma;
exports.default = exports.prisma;
