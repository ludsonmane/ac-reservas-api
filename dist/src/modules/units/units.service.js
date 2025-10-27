"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unitsService = void 0;
// src/modules/units/units.service.ts
const client_1 = require("../../infrastructure/db/client");
exports.unitsService = {
    async listPublicOptions() {
        const rows = await client_1.prisma.unit.findMany({
            where: { isActive: true },
            select: { id: true, name: true, slug: true },
            orderBy: [{ name: 'asc' }],
        });
        return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug }));
    },
};
