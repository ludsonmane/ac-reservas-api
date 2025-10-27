// api/src/interfaces/http/dtos/reservation.dto.ts
import { z } from 'zod';

export const CreateReservationDTO = z.object({
  fullName: z.string().min(3).trim(),
  cpf: z.string().trim().optional().nullable(),
  people: z.coerce.number().int().min(1).max(20),
  kids: z.coerce.number().int().min(0).max(20).default(0),

  // LEGADO: nome livre da área (mantido por compat)
  area: z.string().trim().optional().nullable(),

  // Preferencial: IDs relacionais
  unitId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),

  // ISO string vinda do front
  reservationDate: z.string().min(1),
  birthdayDate: z.string().optional().nullable(),

  email: z.string().email().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),

  utm_source: z.string().trim().optional().nullable(),
  utm_medium: z.string().trim().optional().nullable(),
  utm_campaign: z.string().trim().optional().nullable(),
  utm_content: z.string().trim().optional().nullable(),
  utm_term: z.string().trim().optional().nullable(),

  url: z.string().trim().optional().nullable(),
  ref: z.string().trim().optional().nullable(),

  // LEGADO: nome/slug de unidade (mantido por compat)
  unit: z.string().trim().optional().nullable(),

  source: z.string().trim().optional().nullable(),
});
export type CreateReservationDTOType = z.infer<typeof CreateReservationDTO>;

export const UpdateReservationDTO = z.object({
  fullName: z.string().min(1).trim().optional(),
  cpf: z.string().trim().optional().nullable(),
  people: z.number().int().min(1).optional(),
  kids: z.coerce.number().int().min(0).max(20).optional(),

  // LEGADO
  area: z.string().trim().optional().nullable(),

  // Preferencial: IDs relacionais (não convertem undefined p/ null)
  unitId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),

  // update aceita Date (coerce) para facilitar PUT parcial
  reservationDate: z.coerce.date().optional(),
  birthdayDate: z.coerce.date().optional().nullable(),

  phone: z.string().trim().optional().nullable(),
  email: z.string().email().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),

  utm_source: z.string().trim().optional().nullable(),
  utm_medium: z.string().trim().optional().nullable(),
  utm_campaign: z.string().trim().optional().nullable(),
  utm_content: z.string().trim().optional().nullable(),
  utm_term: z.string().trim().optional().nullable(),

  url: z.string().trim().optional().nullable(),
  ref: z.string().trim().optional().nullable(),

  // LEGADO
  unit: z.string().trim().optional().nullable(),

  source: z.string().trim().optional().nullable(),
});
export type UpdateReservationInput = z.infer<typeof UpdateReservationDTO>;
