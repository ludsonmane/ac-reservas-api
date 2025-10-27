"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reservation = void 0;
class Reservation {
    props;
    constructor(props) {
        if (props.people <= 0)
            throw new Error('people must be > 0');
        this.props = props;
    }
    get id() { return this.props.id; }
    get fullName() { return this.props.fullName; }
}
exports.Reservation = Reservation;
