// src/lib/assets.ts
import { getBaseUrl } from './api';

function toHttps(u: string) {
  try {
    const url = new URL(u);
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      url.protocol === 'http:'
    ) {
      url.protocol = 'https:';
      return url.toString();
    }
  } catch {
    // não era absoluta, ignora
  }
  return u;
}

function sanitizePhoto(raw?: any): string | undefined {
  if (raw == null) return undefined;
  const value =
    typeof raw === 'object' && 'url' in (raw as any)
      ? String((raw as any).url ?? '')
      : String(raw);
  const r = value.trim();
  if (!r || r === 'null' || r === 'undefined' || r === '[object Object]') return undefined;
  return r;
}

/**
 * Resolve uma URL de imagem:
 * - aceita absoluta (http/https/data);
 * - trata //cdn...;
 * - para caminhos relativos, prefixa com a base da API (getBaseUrl).
 */
export function resolvePhotoUrl(raw?: any): string | undefined {
  let s = sanitizePhoto(raw);
  if (!s) return undefined;

  // normaliza barras invertidas e espaços
  s = s.replace(/\\/g, '/').trim();

  // suporta //cdn...
  if (s.startsWith('//')) return `https:${s}`;

  // absoluta (http/https/data)
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) {
    return toHttps(s);
  }

  // limpar barras extras do começo
  s = s.replace(/^\/+/, '/');

  // base da API já saneada (sem barra final)
  const ASSET_BASE = (getBaseUrl() || '').replace(/\/+$/, '');
  if (!ASSET_BASE) {
    return s.startsWith('/') ? s : `/${s}`;
  }

  // evita duplicar base
  if (s.startsWith(ASSET_BASE)) return toHttps(s);

  return toHttps(`${ASSET_BASE}${s.startsWith('/') ? s : `/${s}`}`);
}

/**
 * Retorna a melhor URL da área:
 * - prioriza `photoUrlAbsolute` (S3/CDN);
 * - fallback para `photoUrl` relativo servido pela API;
 * - retorna '' se nada disponível.
 */
export function imgFromArea(area?: { photoUrl?: string | null; photoUrlAbsolute?: string | null }): string {
  if (!area) return '';
  const abs = resolvePhotoUrl(area.photoUrlAbsolute);
  if (abs) return abs;
  const rel = resolvePhotoUrl(area.photoUrl);
  return rel ?? '';
}

/**
 * (Opcional) adiciona cache-busting quando quiser forçar refresh de preview.
 */
export function withCacheBust(url?: string, seed?: string | number): string {
  if (!url) return '';
  const v = typeof seed !== 'undefined' ? String(seed) : String(Date.now());
  return url.includes('?') ? `${url}&v=${v}` : `${url}?v=${v}`;
}
