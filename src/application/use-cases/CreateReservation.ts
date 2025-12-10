// api/src/application/use-cases/CreateReservation.ts
import { ReservationRepository } from '../ports/ReservationRepository';
import { CreateReservationDTOType } from '../../interfaces/http/dtos/reservation.dto';

export class CreateReservation {
  constructor(private repo: ReservationRepository) {}

  async execute(input: CreateReservationDTOType) {
    // Converte datas para Date e repassa TUDO (kids incluído)
    const data = {
      ...input,
      reservationDate: new Date(input.reservationDate),
      birthdayDate: input.birthdayDate ? new Date(input.birthdayDate) : null,
    };
    return this.repo.create(data as any);
  }
}
