// api/src/application/ports/ReservationRepository.ts
import { Reservation } from '../../domain/entities/Reservation';

export interface FindManyParams {
  /** Busca livre (nome, email, phone, cpf, utm_campaign, reservationCode) */
  search?: string;
  /** Unidade (ex.: 'aguas-claras') */
  unit?: string;
  /** Filtro de data inicial (inclusive) para reservationDate */
  from?: Date;
  /** Filtro de data final (inclusive) para reservationDate */
  to?: Date;
  /** Offset para paginação */
  skip: number;
  /** Limite (1..100) para paginação */
  take: number;
}

export interface ReservationRepository {
  /** Cria e retorna a reserva recém-criada */
  create(data: any): Promise<Reservation>;

  /** Lista reservas com paginação e total */
  findMany(params: FindManyParams): Promise<{ items: Reservation[]; total: number }>;

  /** Retorna uma reserva por id (ou null) */
  findById(id: string): Promise<Reservation | null>;

  /** Atualiza e retorna a reserva completa */
  update(id: string, data: any): Promise<Reservation>;

  /** Exclui a reserva */
  delete(id: string): Promise<void>;
}
