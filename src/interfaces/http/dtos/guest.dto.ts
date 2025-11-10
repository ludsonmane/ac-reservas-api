// api/src/interfaces/http/dtos/guest.dto.ts
import { z } from 'zod';

export const GuestItemSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('E-mail inválido'),
  role: z.enum(['GUEST', 'HOST']).optional().default('GUEST'),
});

export const GuestsBulkSchema = z.object({
  guests: z.array(GuestItemSchema).min(1, 'Envie pelo menos 1 convidado'),
});

export type GuestItemInput = z.infer<typeof GuestItemSchema>;
export type GuestsBulkInput = z.infer<typeof GuestsBulkSchema>;
