// src/ui/hooks/useAreasAdmin.ts
import * as React from 'react';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/query';
import { resolvePhotoUrl } from '../../lib/assets'; // << usar helper central

export type AreaFilters = {
  page?: number;
  pageSize?: number;
  unitId?: string | '';
  search?: string | '';
  active?: '' | boolean;
  /** tick opcional para forçar revalidação (ex.: após salvar/excluir) */
  _rt?: number;
};

export type AreaItem = {
  id: string;
  name: string;
  unitId: string;
  unitName?: string;
  /** caminho/URL legado (relativo ou absoluto, já normalizado) */
  photoUrl?: string | null;
  /** URL absoluta preferencial (S3/CDN) */
  photoUrlAbsolute?: string | null; // << novo
  capacityAfternoon: number | null;
  capacityNight: number | null;
  isActive: boolean;
  createdAt?: string;

  // ✅ NOVOS CAMPOS
  iconEmoji?: string | null;
  description?: string | null;
};

export type AreasPage = {
  items: AreaItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function useAreasAdmin(filters: AreaFilters) {
  const key = React.useMemo(
    () =>
      `areas:admin:${JSON.stringify({
        p: filters.page ?? 1,
        s: filters.pageSize ?? 10,
        u: filters.unitId || '',
        q: filters.search || '',
        a: filters.active === '' ? '' : !!filters.active,
        rt: filters._rt ?? 0, // 👈 garante refetch quando _rt muda
      })}`,
    [filters.page, filters.pageSize, filters.unitId, filters.search, filters.active, filters._rt]
  );

  const { data, loading, error, refetch } = useQuery<AreasPage>(
    key,
    async () => {
      const params = new URLSearchParams();
      params.set('page', String(filters.page ?? 1));
      params.set('pageSize', String(filters.pageSize ?? 10));
      if (filters.search) params.set('search', String(filters.search));
      if (filters.unitId) params.set('unitId', String(filters.unitId));
      if (filters.active !== '' && typeof filters.active === 'boolean') {
        params.set('active', String(filters.active));
      }
      // cache-buster para evitar respostas em cache do navegador/proxy
      params.set('__ts', String(Date.now()));

      // 🔐 precisa de auth para admin
      const res = await api(`/v1/areas?${params.toString()}`, { auth: true });

      const rawItems = res?.items ?? res?.data ?? [];
      const items: AreaItem[] = (rawItems as any[]).map((a) => {
        // candidatos de campo "foto relativa"
        const photoRel =
          a.photoUrl ??
          a.photo ??
          a.imageUrl ??
          a.image ??
          a.coverUrl ??
          a.photo_url;

        // campo absoluto preferencial vindo da API
        const photoAbs =
          a.photoUrlAbsolute ??
          a.photo_url_absolute ??
          undefined;

        // normaliza ambos (o helper aceita absoluto/relativo)
        const normalizedAbs = resolvePhotoUrl(photoAbs) ?? null;
        const normalizedRel = resolvePhotoUrl(photoRel) ?? null;

        return {
          id: String(a.id ?? a._id),
          name: String(a.name ?? ''),
          unitId: String(a.unitId ?? a.unit?.id ?? ''),
          unitName: a.unitName ?? a.unit?.name ?? a.unit ?? undefined,
          photoUrlAbsolute: normalizedAbs, // preferencial p/ UI
          photoUrl: normalizedRel,         // fallback legado
          capacityAfternoon:
            a.capacityAfternoon !== undefined
              ? (a.capacityAfternoon ?? null)
              : (a.capacity_afternoon ?? null),
          capacityNight:
            a.capacityNight !== undefined
              ? (a.capacityNight ?? null)
              : (a.capacity_night ?? null),
          isActive: !!(a.isActive ?? a.active ?? true),
          createdAt: a.createdAt ?? a.created_at ?? undefined,

          // ✅ NOVOS CAMPOS (camel + snake)
          iconEmoji: a.iconEmoji ?? a.icon_emoji ?? null,
          description: a.description ?? null,
        };
      });

      const page: AreasPage = {
        items,
        total: Number(res?.total ?? res?.count ?? items.length ?? 0),
        page: Number(res?.page ?? 1),
        pageSize: Number(res?.pageSize ?? res?.limit ?? 10),
        totalPages: Number(res?.totalPages ?? res?.pages ?? 1),
      };

      return page;
    },
    { enabled: true, topics: ['areas', 'units'] }
  );

  return {
    data:
      data ?? {
        items: [],
        total: 0,
        page: 1,
        pageSize: filters.pageSize ?? 10,
        totalPages: 1,
      },
    loading,
    error,
    refetch,
  };
}
