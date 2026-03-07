// src/ui/hooks/useAreas.ts
import * as React from 'react';
import { api } from '../../lib/api';

export function useAreas(open: boolean) {
  const enabled = !!open;
  const [areas, setAreas] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAreas = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      // Endpoint público criado no backend: GET /v1/reservations/areas
      const list: unknown = await api('/v1/reservations/areas', { headers: { 'x-no-auth': '1' } });
      if (signal?.aborted) return;

      const arr = Array.isArray(list) ? list.filter(Boolean) as string[] : [];
      setAreas(arr);
    } catch (e: any) {
      if (signal?.aborted) return;
      setAreas([]);
      setError(e?.error?.message || e?.message || 'Falha ao carregar áreas');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Primeira carga / quando habilita
  React.useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    fetchAreas(ac.signal);
    return () => ac.abort();
  }, [enabled, fetchAreas]);

  // Refetch automático em invalidações (se lib/query existir)
  React.useEffect(() => {
    let unsub1: undefined | (() => void);
    let unsub2: undefined | (() => void);
    let mounted = true;

    (async () => {
      try {
        const mod: any = await import('../../lib/query'); // opcional
        if (!mounted || typeof mod.subscribe !== 'function') return;
        // Recarrega quando qualquer write tocar em 'areas' ou 'reservations'
        unsub1 = mod.subscribe('areas', () => fetchAreas());
        unsub2 = mod.subscribe('reservations', () => fetchAreas());
      } catch {
        // lib/query não existe — tudo bem, só não assinamos
      }
    })();

    return () => {
      mounted = false;
      if (typeof unsub1 === 'function') unsub1();
      if (typeof unsub2 === 'function') unsub2();
    };
  }, [fetchAreas]);

  return { areas, loading, error, refetch: () => fetchAreas() };
}
