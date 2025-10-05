// api/src/application/use-cases/UpdateReservation.ts
import { ReservationRepository } from '../ports/ReservationRepository';
import { UpdateReservationInput } from '../../interfaces/http/dtos/reservation.dto';

export class UpdateReservation {
  constructor(private repo: ReservationRepository) {}

  async execute(id: string, input: UpdateReservationInput) {
    return this.repo.update(id, {
      ...input,
      // não força default aqui; só atualiza se vier
    });
  }
}
