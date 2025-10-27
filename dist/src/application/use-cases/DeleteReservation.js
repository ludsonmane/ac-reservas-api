"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteReservation = void 0;
class DeleteReservation {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(id) { return this.repo.delete(id); }
}
exports.DeleteReservation = DeleteReservation;
