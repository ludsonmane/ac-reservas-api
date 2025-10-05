// api/src/application/use-cases/GetReservationById.ts
import { ReservationRepository } from '../ports/ReservationRepository';

export class GetReservationById {
  constructor(private repo: ReservationRepository) {}
  async execute(id: string) {
    return this.repo.findById(id);
  }
}
