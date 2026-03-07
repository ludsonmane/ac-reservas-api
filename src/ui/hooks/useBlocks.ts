// src/ui/hooks/useBlocks.ts
import { api } from '../../lib/api';

export type BlockPeriod = 'AFTERNOON' | 'NIGHT' | 'ALL_DAY';

export type BlockPayload = {
  unitId: string;
  date: string;              // YYYY-MM-DD
  period: BlockPeriod;
  reason?: string;
  areaId?: string | null;    // null = todas as áreas
};

export async function createBlock(params: BlockPayload) {
  const { unitId, date, period, reason, areaId = null } = params;

  return api('/v1/blocks/period', {
    method: 'POST',
    auth: true,
    body: {
      unitId,
      date,
      period,
      reason,
      areaId,
    },
  });
}

export async function updateBlock(id: string, params: Partial<BlockPayload>) {
  // espera um PATCH /v1/blocks/:id no backend
  return api(`/v1/blocks/${id}`, {
    method: 'PATCH',
    auth: true,
    body: params,
  });
}

export async function deleteBlock(id: string) {
  // espera um DELETE /v1/blocks/:id no backend
  return api(`/v1/blocks/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}
