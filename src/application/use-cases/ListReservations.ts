// api/src/application/use-cases/ListReservations.ts
import { ReservationRepository, FindManyParams } from '../ports/ReservationRepository';

export class ListReservations {
  constructor(private repo: ReservationRepository) {}

  // Encaminha filtros/paginação para o repositório
  async execute(params: FindManyParams) {
    return this.repo.findMany(params);
  }
}
