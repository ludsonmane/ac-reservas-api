import mongoose from "mongoose";
const { Schema, models, model } = mongoose;

const ReservationSchema = new Schema(
  {
    fullName: { type: String, required: true },
    cpf: { type: String, required: true },
    people: { type: Number, required: true, min: 1 },
    reservationDate: { type: Date, required: true },
    birthdayDate: { type: Date },
    utms: { type: Schema.Types.Mixed },
    source: { type: String },
    raw: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
    collection: "reservations"
  }
);

export default models.Reservation || model("Reservation", ReservationSchema);
