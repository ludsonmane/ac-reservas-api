// src/ui/hooks/useReservations.ts
import * as React from 'react';
import { api } from '../../lib/api';
import { useQuery, clearQuery } from '../../lib/query';

export type ReservationsFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  unitId?: string;   // preferencial
  unitSlug?: string; // legado (enviado como "unit" quando não houver unitId)
  areaId?: string;
  from?: string; // ISO (yyyy-mm-ddThh:mm:ssZ) ou yyyy-mm-dd
  to?: string;   // ISO
};

export type ReservationItem = any;
export type ReservationsPage = {
  items: ReservationItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/* ---------- utils ---------- */
const norm = (v: any) => {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
};
const maybe = (v: any): string | undefined => {
  const s = norm(v);
  return s ? s : undefined;
};

function normalizePage(res: any, fallbackSize: number): ReservationsPage {
  return {
    items: res?.items ?? res?.data ?? [],
    page: Number(res?.page ?? res?.currentPage ?? 1),
    pageSize: Number(res?.pageSize ?? res?.perPage ?? fallbackSize ?? 10),
    total: Number(res?.total ?? res?.totalItems ?? res?.count ?? 0),
    totalPages: Number(res?.totalPages ?? res?.pages ?? res?.lastPage ?? 1),
  };
}

/* ---------- hook (filtro apenas no servidor) ---------- */
export function useReservations(filters: ReservationsFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  // chave robusta: muda quando QUALQUER filtro relevante muda
  const key = React.useMemo(() => {
    return [
      'reservations',
      page,
      pageSize,
      norm(filters.search),
      norm(filters.unitId),
      norm(filters.unitSlug),
      norm(filters.areaId),
      norm(filters.from),
      norm(filters.to),
    ].join('|');
  }, [
    page, pageSize, filters.search,
    filters.unitId, filters.unitSlug, filters.areaId,
    filters.from, filters.to,
  ]);

  // Limpa o cache da key atual quando os filtros mudam para forçar refetch
  React.useEffect(() => {
    clearQuery(key);
  }, [key]);

  const { data, loading, error, refetch } = useQuery<ReservationsPage>(
    key,
    async () => {
      // monta SOMENTE os parâmetros que a API entende
      const params: Record<string, any> = { page, pageSize };

      const search = maybe(filters.search);
      const unitId = maybe(filters.unitId);
      const unitSlug = maybe(filters.unitSlug);
      const areaId = maybe(filters.areaId);
      const from = maybe(filters.from);
      const to = maybe(filters.to);

      if (search) params.search = search;

      // ✅ regra: se houver unitId, usa APENAS unitId (sem "unit" legado)
      if (unitId) {
        params.unitId = unitId;
      } else if (unitSlug) {
        // fallback legado quando não há unitId
        params.unit = unitSlug;
      }

      if (areaId) params.areaId = areaId;
      if (from) params.from = from;
      if (to) params.to = to;

      const qs = new URLSearchParams(params as any).toString();
      const res = await api(`/v1/reservations?${qs}`, { auth: true });
      return normalizePage(res, pageSize);
    },
    { enabled: true, topics: ['reservations'] }
  );

  return {
    data: data ?? { items: [], total: 0, page, pageSize, totalPages: 1 },
    loading,
    error,
    refetch,
  };
}
