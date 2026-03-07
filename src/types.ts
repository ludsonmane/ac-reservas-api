export type Reservation = {
  id: string;
  reservationCode?: string | null;
  reservationType: string;
  fullName: string;
  cpf?: string | null;
  people: number;
  kids: number;
  area?: string | null;
  reservationDate: string;
  birthdayDate?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  tables?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  unitId?: string | null;   // NOVO
  areaId?: string | null;   // NOVO
  areaName?: string | null; // NOVO (denormalizado)
  source?: string | null;
  zigBillingCents?: number | null;
  zigBilledAt?: string | null;
  status: 'AWAITING_CHECKIN' | 'CHECKED_IN' | 'NO_SHOW';
  qrToken: string;
  qrExpiresAt?: string | null;
  checkedInAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CONCIERGE';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
