// src/ui/hooks/useUnits.ts
import * as React from 'react';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/query';

export type UnitOption = { id: string; name: string; slug: string };

/** slugify simples: remove acentos, troca espaços/sep. por "-", minúsculas */
function normalizeSlug(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeUnits(list: any[]): UnitOption[] {
  const seenIds = new Set<string>();
  const out: UnitOption[] = [];

  for (const u of Array.isArray(list) ? list : []) {
    const id = String(u?.id ?? u?._id ?? '').trim();
    if (!id) continue; // ⚠️ só aceita ID real (nunca slug/name)

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = String(u?.name ?? u?.title ?? u?.slug ?? '').trim();
    const slugRaw = String(u?.slug ?? '').trim();
    const slug = slugRaw || normalizeSlug(name);

    out.push({ id, name, slug });
  }

  // ordena por nome (pt-BR), sem considerar acentos/caixa
  out.sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  );

  return out;
}

/**
 * Retorna as unidades como objetos { id, name, slug } para selects/filtros.
 * - Tenta endpoint público rápido; se falhar, cai no autenticado paginado.
 * - QueryKey estável: "units:all"
 * - topics: ['units'] para reagir a invalidations
 */
export function useUnits(enabled: boolean = true) {
  const key = React.useMemo(() => 'units:all', []);

  const { data, loading, refetch } = useQuery<UnitOption[]>(
    key,
    async () => {
      // 1) Tenta endpoint público leve
      try {
        const list = await api('/v1/units/public/options/list');
        return normalizeUnits(list);
      } catch {
        // 2) Fallback autenticado (puxa bastante para caber tudo)
        const page = await api('/v1/units?page=1&pageSize=1000&active=1', { auth: true });
        const items = Array.isArray(page) ? page : page?.items ?? [];
        return normalizeUnits(items);
      }
    },
    {
      enabled,
      topics: ['units'],
      staleTime: 5 * 60 * 1000, // 5min
    }
  );

  return {
    units: data ?? [],
    loading,
    refetch,
  };
}
