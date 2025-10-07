"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateReservation = void 0;
class CreateReservation {
    constructor(repo) {
        this.repo = repo;
    }
    async execute(input) {
        // Converte datas para Date e repassa TUDO (kids incluído)
        const data = {
            ...input,
            reservationDate: new Date(input.reservationDate),
            birthdayDate: input.birthdayDate ? new Date(input.birthdayDate) : null,
        };
        return this.repo.create(data);
    }
}
exports.CreateReservation = CreateReservation;
