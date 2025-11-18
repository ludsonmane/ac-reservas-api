"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuestsBulkSchema = exports.GuestItemSchema = void 0;
// api/src/interfaces/http/dtos/guest.dto.ts
const zod_1 = require("zod");
exports.GuestItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome obrigatório'),
    email: zod_1.z.string().email('E-mail inválido'),
    role: zod_1.z.enum(['GUEST', 'HOST']).optional().default('GUEST'),
});
exports.GuestsBulkSchema = zod_1.z.object({
    guests: zod_1.z.array(exports.GuestItemSchema).min(1, 'Envie pelo menos 1 convidado'),
});
