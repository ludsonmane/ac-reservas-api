import { ReservationRepository } from '../ports/ReservationRepository';

export class DeleteReservation {
  constructor(private repo: ReservationRepository) {}
  async execute(id: string) { return this.repo.delete(id); }
}
