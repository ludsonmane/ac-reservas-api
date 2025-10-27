// api/src/interfaces/http/dtos/unit.dto.ts
import { z } from 'zod';

export const UnitCreateDTO = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  slug: z.string().min(2, 'Slug muito curto').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Slug inválido').optional(),
  isActive: z.boolean().optional(),
});

export const UnitUpdateDTO = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i).optional(),
  isActive: z.boolean().optional(),
});

export type UnitCreateInput = z.infer<typeof UnitCreateDTO>;
export type UnitUpdateInput = z.infer<typeof UnitUpdateDTO>;
