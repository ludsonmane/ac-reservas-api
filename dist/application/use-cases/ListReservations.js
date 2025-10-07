"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListReservations = void 0;
class ListReservations {
    constructor(repo) {
        this.repo = repo;
    }
    // Encaminha filtros/paginação para o repositório
    async execute(params) {
        return this.repo.findMany(params);
    }
}
exports.ListReservations = ListReservations;
