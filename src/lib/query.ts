// src/lib/query.ts
import * as React from 'react';

type CacheEntry<T = any> = {
  data?: T;
  error?: any;
  loading: boolean;
  updatedAt?: number;
};

type Unsub = () => void;
type Handler = () => void;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>(); // evita fetch duplicado
const keySubs = new Map<string, Set<Handler>>();

const topicSubs = new Map<string, Set<Handler>>(); // "reservations", "units", "areas", etc.

// ---------- notificação por chave/tópico ----------
function notifyKey(key: string) {
  keySubs.get(key)?.forEach(fn => fn());
}
function notifyTopic(topic: string) {
  topicSubs.get(topic)?.forEach(fn => fn());
}

// ---------- API pública de tópicos ----------
export function subscribe(topic: string, handler: Handler): Unsub {
  let set = topicSubs.get(topic);
  if (!set) topicSubs.set(topic, (set = new Set()));
  set.add(handler);
  return () => set!.delete(handler);
}

/** Alias mais semântico para invalidar tópicos */
export function publish(topic: string | string[] | '*') {
  invalidate(topic);
}

/** Invalida 1+ tópicos (ou todos com '*') e avisa os hooks para refetch. */
export function invalidate(topic: string | string[] | '*') {
  if (topic === '*') {
    for (const subs of topicSubs.values()) subs.forEach(fn => fn());
    return;
  }
  const topics = Array.isArray(topic) ? topic : [topic];
  topics.forEach(t => notifyTopic(t));
}

// ---------- Helpers de cache (modo “mutate”) ----------
export function getQueryData<T = any>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/** Atualiza o cache localmente e notifica quem escuta a `key`. */
export function setQueryData<T = any>(
  key: string,
  updater: T | ((prev: T | undefined) => T)
) {
  const prev = cache.get(key)?.data as T | undefined;
  const next = typeof updater === 'function'
    ? (updater as any)(prev)
    : updater;

  const entry: CacheEntry<T> = {
    data: next,
    error: undefined,
    loading: false,
    updatedAt: Date.now(),
  };
  cache.set(key, entry);
  notifyKey(key);
}

export function clearQuery(key: string) {
  cache.delete(key);
  notifyKey(key);
}

export function clearAll() {
  cache.clear();
  // notifica todo mundo (todas as keys)
  for (const [, subs] of keySubs) subs.forEach(fn => fn());
}

// ---------- Hook principal ----------
type UseQueryOpts = {
  enabled?: boolean;
  topics?: string[];
  /** ms para considerar “velho” e revalidar */
  staleTime?: number;
  /** valor inicial (opcional) */
  initialData?: any;
};

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: UseQueryOpts
) {
  const enabled = opts?.enabled ?? true;
  const topics = opts?.topics ?? [];
  const staleTime = opts?.staleTime ?? 0;

  const [, force] = React.useReducer(x => x + 1, 0);

  // assina mudanças por key (quando cache muda manualmente via setQueryData/clearQuery)
  React.useEffect(() => {
    let set = keySubs.get(key);
    if (!set) keySubs.set(key, (set = new Set()));
    set.add(force);
    return () => { set!.delete(force); };
  }, [key]);

  // assina invalidação por tópico
  React.useEffect(() => {
    const unsubFns: Unsub[] = [];
    topics.forEach(t => {
      let set = topicSubs.get(t);
      if (!set) topicSubs.set(t, (set = new Set()));
      const cb = () => { void doFetch(true); };
      set.add(cb);
      unsubFns.push(() => set!.delete(cb));
    });
    return () => { unsubFns.forEach(fn => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(topics)]);

  // refetch ao voltar foco/online
  React.useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void doFetch(true); };
    const onOnline = () => void doFetch(true);

    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  async function doFetch(fromInvalidate = false) {
    if (!enabled) return;

    // de-dup por chave
    if (inflight.has(key)) return inflight.get(key);

    const current = cache.get(key) || { loading: false } as CacheEntry<T>;
    // Se vier de invalidate/focus/online, forçamos loading=true visualmente
    const next: CacheEntry<T> = { ...current, loading: true };
    cache.set(key, next);
    notifyKey(key);

    const p = (async () => {
      try {
        const data = await fetcher();
        const ok: CacheEntry<T> = { data, error: undefined, loading: false, updatedAt: Date.now() };
        cache.set(key, ok);
        notifyKey(key);
        return data;
      } catch (e) {
        const err: CacheEntry<T> = { data: current.data, error: e, loading: false, updatedAt: Date.now() };
        cache.set(key, err);
        notifyKey(key);
        throw e;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, p);
    return p;
  }

  // primeira carga / revalidação por staleness
  React.useEffect(() => {
    if (!enabled) return;

    // inicializa cache com initialData se fornecido
    if (opts?.initialData !== undefined && !cache.has(key)) {
      cache.set(key, {
        data: opts.initialData,
        loading: false,
        error: undefined,
        updatedAt: Date.now(),
      });
    }

    const entry = cache.get(key);
    const isMissing = !entry;
    const isStale =
      !!entry &&
      staleTime > 0 &&
      (Date.now() - (entry.updatedAt || 0)) > staleTime;

    if (isMissing || isStale) {
      cache.set(key, { ...(entry || {}), loading: true });
      notifyKey(key);
      void doFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, staleTime]);

  const current = cache.get(key) as CacheEntry<T> | undefined;

  return {
    data: current?.data as T | undefined,
    error: current?.error,
    loading: !!current?.loading,
    refetch: () => doFetch(),
    /** mutate local (sem chamar servidor) */
    setData: (updater: T | ((prev: T | undefined) => T)) => setQueryData<T>(key, updater),
  };
}
