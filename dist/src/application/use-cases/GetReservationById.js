"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetReservationById = void 0;
class GetReservationById {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(id) {
        return this.repo.findById(id);
    }
}
exports.GetReservationById = GetReservationById;
