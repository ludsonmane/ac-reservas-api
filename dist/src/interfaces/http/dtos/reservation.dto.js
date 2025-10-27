"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateReservationDTO = exports.CreateReservationDTO = void 0;
// api/src/interfaces/http/dtos/reservation.dto.ts
const zod_1 = require("zod");
exports.CreateReservationDTO = zod_1.z.object({
    fullName: zod_1.z.string().min(3).trim(),
    cpf: zod_1.z.string().trim().optional().nullable(),
    people: zod_1.z.coerce.number().int().min(1).max(20),
    kids: zod_1.z.coerce.number().int().min(0).max(20).default(0),
    // LEGADO: nome livre da área (mantido por compat)
    area: zod_1.z.string().trim().optional().nullable(),
    // Preferencial: IDs relacionais
    unitId: zod_1.z.string().uuid().optional().nullable(),
    areaId: zod_1.z.string().uuid().optional().nullable(),
    // ISO string vinda do front
    reservationDate: zod_1.z.string().min(1),
    birthdayDate: zod_1.z.string().optional().nullable(),
    email: zod_1.z.string().email().trim().optional().nullable(),
    phone: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    utm_source: zod_1.z.string().trim().optional().nullable(),
    utm_medium: zod_1.z.string().trim().optional().nullable(),
    utm_campaign: zod_1.z.string().trim().optional().nullable(),
    utm_content: zod_1.z.string().trim().optional().nullable(),
    utm_term: zod_1.z.string().trim().optional().nullable(),
    url: zod_1.z.string().trim().optional().nullable(),
    ref: zod_1.z.string().trim().optional().nullable(),
    // LEGADO: nome/slug de unidade (mantido por compat)
    unit: zod_1.z.string().trim().optional().nullable(),
    source: zod_1.z.string().trim().optional().nullable(),
});
exports.UpdateReservationDTO = zod_1.z.object({
    fullName: zod_1.z.string().min(1).trim().optional(),
    cpf: zod_1.z.string().trim().optional().nullable(),
    people: zod_1.z.number().int().min(1).optional(),
    kids: zod_1.z.coerce.number().int().min(0).max(20).optional(),
    // LEGADO
    area: zod_1.z.string().trim().optional().nullable(),
    // Preferencial: IDs relacionais (não convertem undefined p/ null)
    unitId: zod_1.z.string().uuid().optional().nullable(),
    areaId: zod_1.z.string().uuid().optional().nullable(),
    // update aceita Date (coerce) para facilitar PUT parcial
    reservationDate: zod_1.z.coerce.date().optional(),
    birthdayDate: zod_1.z.coerce.date().optional().nullable(),
    phone: zod_1.z.string().trim().optional().nullable(),
    email: zod_1.z.string().email().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    utm_source: zod_1.z.string().trim().optional().nullable(),
    utm_medium: zod_1.z.string().trim().optional().nullable(),
    utm_campaign: zod_1.z.string().trim().optional().nullable(),
    utm_content: zod_1.z.string().trim().optional().nullable(),
    utm_term: zod_1.z.string().trim().optional().nullable(),
    url: zod_1.z.string().trim().optional().nullable(),
    ref: zod_1.z.string().trim().optional().nullable(),
    // LEGADO
    unit: zod_1.z.string().trim().optional().nullable(),
    source: zod_1.z.string().trim().optional().nullable(),
});
