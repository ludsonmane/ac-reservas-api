// src/modules/units/units.service.ts
import { prisma } from '../../infrastructure/db/client';

export const unitsService = {
  async listPublicOptions() {
    const rows = await prisma.unit.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug }));
  },
};
