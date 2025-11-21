// api/src/application/ports/ReservationRepository.ts
import { Reservation } from '../../domain/entities/Reservation';

/** Parâmetros de listagem de reservas */
export interface FindManyParams {
  /** Busca livre (nome, email, phone, cpf, utm_campaign, reservationCode) */
  search?: string;
  /** Unidade (ex.: 'aguas-claras') — legado (nome/slug) */
  unit?: string;
  /** Filtro de data inicial (inclusive) para reservationDate */
  unitId?: string;    // ✅ NOVO (ID relacional)
  
  from?: Date;
  /** Filtro de data final (inclusive) para reservationDate */
  to?: Date;
  /** Filtro por área (ID relacional) */
  areaId?: string; // ✅ NOVO
  /** Offset para paginação */
  skip: number;
  /** Limite (1..100) para paginação */
  take: number;
}

/** Payload para inserir convidados */
export type GuestInput = {
  name: string;
  email: string;
  role?: 'GUEST' | 'HOST';
};

/** Contrato do repositório de Reservas */
export interface ReservationRepository {
  /** Cria e retorna a reserva recém-criada */
  create(data: any): Promise<Reservation>;

  /** Lista reservas com paginação e total */
  findMany(params: FindManyParams): Promise<{ items: any[]; total: number }>;

  /** Retorna uma reserva por id (ou null) */
  findById(id: string): Promise<Reservation | null>;

  /** Atualiza e retorna a reserva completa */
  update(id: string, data: any): Promise<Reservation>;

  /** Exclui a reserva */
  delete(id: string): Promise<void>;

  /** ✅ Insere convidados em massa (dedup por [reservationId, email]) */
  addGuestsBulk(
    reservationId: string,
    guests: GuestInput[]
  ): Promise<{ created: number; skipped: number }>;
}
