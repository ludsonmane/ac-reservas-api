import 'dotenv/config';
import { sendReservationTicket } from '../services/email/sendReservationTicket';

(async () => {
  const now = new Date();
  const in30min = new Date(now.getTime() + 30 * 60 * 1000);

  const res = await sendReservationTicket({
    id: 'test-id-123',
    reservationCode: 'ABC123',
    code: 'ABC123',
    fullName: 'Teste SendGrid',
    email: 'SEU_EMAIL@exemplo.com',   // <-- troque
    phone: '61999999999',
    people: 4,
    kids: 1,
    unit: 'Mané Brasília',
    table: '—',
    reservationDate: in30min.toISOString(),
    notes: 'Teste de ticket',
    checkinUrl: 'https://mane.com.vc/checkin/abc',
  });

  console.log('ENVIADO:', res);
})();
