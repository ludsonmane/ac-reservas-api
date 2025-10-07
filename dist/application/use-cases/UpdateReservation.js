"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateReservation = void 0;
class UpdateReservation {
    constructor(repo) {
        this.repo = repo;
    }
    async execute(id, input) {
        return this.repo.update(id, {
            ...input,
            // não força default aqui; só atualiza se vier
        });
    }
}
exports.UpdateReservation = UpdateReservation;
