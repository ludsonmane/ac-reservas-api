export interface ReservationProps {
  id: string;
  fullName: string;
  people: number;
  reservationDate: Date;
  cpf?: string | null;
  birthdayDate?: Date | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  s_utmsource?: string | null;
  s_utmmedium?: string | null;
  s_utmcampaign?: string | null;
  s_utmcontent?: string | null;
  s_utmterm?: string | null;
  s_url?: string | null;
  s_ref?: string | null;
  unit?: string | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Reservation {
  private props: ReservationProps;

  constructor(props: ReservationProps) {
    if (props.people <= 0) throw new Error('people must be > 0');
    this.props = props;
  }

  get id() { return this.props.id; }
  get fullName() { return this.props.fullName; }
}
