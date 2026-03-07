// src/lib/env.ts
export function getPublicAppBaseUrl() {
  const fromEnv = (import.meta as any)?.env?.VITE_PUBLIC_APP_BASE_URL as string | undefined;
  const fromLs = (typeof window !== 'undefined')
    ? (localStorage.getItem('PUBLIC_APP_BASE_URL') || undefined)
    : undefined;

  const url = (fromEnv || fromLs || 'http://localhost:3000').replace(/\/+$/, '');
  return url;
}
