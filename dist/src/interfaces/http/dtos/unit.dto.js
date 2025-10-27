"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnitUpdateDTO = exports.UnitCreateDTO = void 0;
// api/src/interfaces/http/dtos/unit.dto.ts
const zod_1 = require("zod");
exports.UnitCreateDTO = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome muito curto'),
    slug: zod_1.z.string().min(2, 'Slug muito curto').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Slug inválido').optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.UnitUpdateDTO = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    slug: zod_1.z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i).optional(),
    isActive: zod_1.z.boolean().optional(),
});
