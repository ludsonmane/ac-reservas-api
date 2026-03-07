import { useSyncExternalStore } from 'react';
import { invalidate } from './lib/query';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | string;
};

type State = {
  token: string | null;
  user: User | null;
};

// hidrata estado inicial do localStorage (com fallback seguro)
function readUserFromStorage(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

let state: State = {
  token: localStorage.getItem('token') || null,
  user: readUserFromStorage(),
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): State {
  return state;
}

export function setToken(token: string) {
  state.token = token;
  localStorage.setItem('token', token);
  emit();
  invalidate('*'); // <- atualiza listas após login
}
export function clearAuth() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('token');
  emit();
  invalidate('*'); // <- limpa views dependentes
}

/** Seta/limpa o usuário e persiste em localStorage */
export function setUser(user: User | null) {
  state = { ...state, user };
  if (user) localStorage.setItem('user', JSON.stringify(user));
  else localStorage.removeItem('user');
  emit();
}


/** Snapshot atual (se precisar em utilidades) */
export function getState(): State {
  return state;
}

/** Hook de leitura do estado global (SSR-safe via useSyncExternalStore) */
export function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
