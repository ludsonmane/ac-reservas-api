"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListReservations = void 0;
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
class ListReservations {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(params) {
        // Nenhuma transformação aqui: o Controller já sanitiza,
        // e o repositório também valida limites.
        return this.repo.findMany(params);
    }
}
exports.ListReservations = ListReservations;
