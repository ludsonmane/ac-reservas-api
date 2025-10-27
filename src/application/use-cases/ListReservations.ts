// api/src/application/use-cases/ListReservations.ts
import { ReservationRepository, FindManyParams } from '../ports/ReservationRepository';

/**
 * Lista reservas com filtros/paginação.
 * Encaminha diretamente para o repositório, suportando:
 * - search (texto)
 * - unit (LEGADO: nome/slug)
 * - areaId (NOVO: filtro por área)
 * - from / to (período)
 * - skip / take (paginação)
 * - (opcional futuro) unitId, se você adicionar no FindManyParams
 */
export class ListReservations {
  constructor(private repo: ReservationRepository) {}

  async execute(params: FindManyParams) {
    // Nenhuma transformação aqui: o Controller já sanitiza,
    // e o repositório também valida limites.
    return this.repo.findMany(params);
  }
}
