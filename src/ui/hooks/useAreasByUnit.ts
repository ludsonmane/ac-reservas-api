// src/ui/hooks/useAreasByUnit.ts
import * as React from 'react';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/query';

export type AreaOption = { id: string; name: string; capacity: number };

/**
 * Busca áreas públicas por unidade.
 * - Key estável em string para evitar re-fetch em loop.
 * - Só faz request quando `enabled` e `unitId` existem.
 * - Usa o tópico "areas" para cache/invalidação.
 */
export function useAreasByUnit(unitId?: string, enabled = true) {
  const key = React.useMemo(
    () => `areas:by-unit:${unitId || 'none'}`,
    [unitId]
  );

  return useQuery<AreaOption[]>(
    key,
    async () => {
      if (!unitId) return [];
      return api(`/v1/areas/public/by-unit/${unitId}`);
    },
    { enabled: enabled && !!unitId, topics: ['areas'] }
  );
}
