// src/lib/analytics.ts
type AnyObj = Record<string, any>;

const UNIT_PIXEL_MAP: Record<string, string> = {
  bsb: '328827303217903',
  brasilia: '328827303217903',
  'brasília': '328827303217903',
  'arena brasilia': '328827303217903',
  'arena brasília': '328827303217903',
  'arena bsb': '328827303217903',
  'mane bsb': '328827303217903',
  'mané bsb': '328827303217903',
  'aguas claras': '1160688802149033',
  'águas claras': '1160688802149033',
  'aguas-claras': '1160688802149033',
  'mane aguas claras': '1160688802149033',
  'mané aguas claras': '1160688802149033',
  'mane águas claras': '1160688802149033',
  'mané águas claras': '1160688802149033',
};

const GA4_ID: string = ((import.meta as any)?.env?.VITE_GA4_ID as string | undefined) || '';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    dataLayer?: any[];
    __manePixels?: {
      scriptLoaded?: boolean;
      loadedIds: Set<string>;
      pageViewForId: Set<string>;
      activeId?: string;
    };
  }
}

function hasGA4() {
  return typeof window !== 'undefined' && typeof (window as AnyObj).gtag === 'function' && !!GA4_ID;
}
function gtagFn(): ((...args: any[]) => void) | undefined {
  return ((window as AnyObj)?.gtag as any) || undefined;
}

function normalizeKey(input?: string | null) {
  if (!input) return '';
  return input
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim();
}

export function ensureAnalyticsReady() {
  if (typeof window === 'undefined') return;

  if (GA4_ID && !(window as AnyObj).gtag) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
    document.head.appendChild(s);
    (window as AnyObj).dataLayer = (window as AnyObj).dataLayer || [];
    function gtag(...args: any[]) {
      (window as AnyObj).dataLayer.push(args);
    }
    (window as AnyObj).gtag = gtag;
    const g = gtagFn();
    g?.('js', new Date());
    g?.('config', GA4_ID);
    console.debug('[analytics] GA4 bootstrap', GA4_ID);
  }

  ensureMetaScript();
}

function ensureMetaScript() {
  if (typeof window === 'undefined') return;
  (window as AnyObj).__manePixels = (window as AnyObj).__manePixels || {
    loadedIds: new Set(),
    pageViewForId: new Set(),
  };
  if ((window as AnyObj).__manePixels.scriptLoaded) return;

  if (!(window as AnyObj).fbq) {
    (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }

  (window as AnyObj).__manePixels.scriptLoaded = true;
  console.debug('[analytics] Meta fbevents.js injected');
}

function ensurePixel(pixelId: string) {
  if (!pixelId) return;
  ensureMetaScript();
  (window as AnyObj).__manePixels = (window as AnyObj).__manePixels || {
    loadedIds: new Set(),
    pageViewForId: new Set(),
  };

  if (!(window as AnyObj).__manePixels.loadedIds.has(pixelId)) {
    (window as AnyObj).fbq?.('init', pixelId);
    (window as AnyObj).__manePixels.loadedIds.add(pixelId);
    console.debug('[analytics] Meta Pixel init', pixelId);
  }

  if (!(window as AnyObj).__manePixels.pageViewForId.has(pixelId)) {
    (window as AnyObj).fbq?.('trackSingle', pixelId, 'PageView');
    (window as AnyObj).__manePixels.pageViewForId.add(pixelId);
    console.debug('[analytics] Meta Pixel PageView sent', pixelId);
  }
}

function findPixelForUnit(input?: string | null): string | undefined {
  if (!input) return;
  const key = normalizeKey(input);
  if (UNIT_PIXEL_MAP[key]) return UNIT_PIXEL_MAP[key];
  if (key.includes('bsb') || key.includes('brasilia') || key.includes('brasil')) return UNIT_PIXEL_MAP['brasilia'];
  if (key.includes('aguas') && key.includes('claras')) return UNIT_PIXEL_MAP['aguas claras'];
  if (key.includes('arena') && (key.includes('brasilia') || key.includes('brasil'))) return UNIT_PIXEL_MAP['arena brasilia'];
  return;
}

export function setActiveUnitPixelByKey(unitKeyOrName?: string | null) {
  if (!unitKeyOrName) return;
  const id = findPixelForUnit(unitKeyOrName);
  if (!id) { console.debug('[analytics] Pixel not mapped for key:', unitKeyOrName); return; }
  ensurePixel(id);
  (window as AnyObj).__manePixels = (window as AnyObj).__manePixels || { loadedIds: new Set(), pageViewForId: new Set() };
  (window as AnyObj).__manePixels.activeId = id;
  console.debug('[analytics] Active pixel set:', id, 'for', unitKeyOrName);
}

export function setActiveUnitPixelFromUnit(
  unit: { id?: string; name?: string | null; slug?: string | null } | string | null | undefined
) {
  if (!unit) return;
  const candidates: string[] = [];
  if (typeof unit === 'string') candidates.push(unit);
  else {
    if (unit.slug) candidates.push(unit.slug);
    if (unit.name) candidates.push(unit.name);
    if (unit.id)   candidates.push(unit.id);
  }
  for (const k of candidates) {
    const id = findPixelForUnit(k);
    if (id) {
      ensurePixel(id);
      (window as AnyObj).__manePixels = (window as AnyObj).__manePixels || { loadedIds: new Set(), pageViewForId: new Set() };
      (window as AnyObj).__manePixels.activeId = id;
      console.debug('[analytics] Active pixel set from unit:', id, candidates);
      return;
    }
  }
  console.debug('[analytics] No pixel mapping found for unit candidates:', candidates);
}

function norm(v?: string | null) { return (v || '').trim(); }
function splitName(full?: string | null) {
  const name = norm(full);
  if (!name) return { first_name: '', last_name: '' };
  const parts = name.split(/\s+/);
  const first = parts.shift() || '';
  const last = parts.length ? parts.join(' ') : '';
  return { first_name: first, last_name: last };
}

async function sha256(s: string) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256LowerTrim(v?: string | null) { return v ? sha256(v.toLowerCase().trim()) : ''; }

async function setGA4UserData(user: { name?: string|null; email?: string|null; phone?: string|null }) {
  if (!hasGA4()) return;
  const { first_name, last_name } = splitName(user.name);
  const payload: AnyObj = {};
  if (user.email) payload.email = await sha256LowerTrim(user.email);
  if (user.phone) payload.phone_number = await sha256LowerTrim(user.phone.replace(/\D+/g, ''));
  if (first_name) payload.first_name = await sha256LowerTrim(first_name);
  if (last_name)  payload.last_name  = await sha256LowerTrim(last_name);
  if (Object.keys(payload).length) {
    const g = gtagFn();
    g?.('set', 'user_data', payload);
  }
}

export type ReservationEvent = {
  reservationCode?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  unit?: string | null;
  area?: string | null;
  status?: string | null;
  source?: string | null;
};
function toParams(ev: ReservationEvent) {
  return {
    reservation_code: norm(ev.reservationCode),
    full_name:        norm(ev.fullName),
    email:            norm(ev.email),
    phone:            norm(ev.phone),
    unit:             norm(ev.unit),
    area:             norm(ev.area),
    status:           norm(ev.status),
    source:           norm(ev.source),
  };
}
function fbqTrackCustomActive(singleEventName: string, payload: any) {
  const active = (window as AnyObj).__manePixels?.activeId;
  if (active) (window as AnyObj).fbq?.('trackSingle', active, singleEventName, payload);
  else (window as AnyObj).fbq?.('trackCustom', singleEventName, payload);
}

export async function trackReservationMade(ev: ReservationEvent) {
  const params = toParams(ev);
  if (hasGA4()) {
    await setGA4UserData({ name: ev.fullName, email: ev.email, phone: ev.phone });
    const g = gtagFn();
    g?.('event', 'reservation_made', {
      reservation_code: params.reservation_code,
      unit: params.unit, area: params.area, status: params.status, source: params.source,
    });
  }
  fbqTrackCustomActive('Reservation Made', params);
  (window as AnyObj).dataLayer?.push({ event: 'reservation_made', ...params });
}

export async function trackReservationCheckin(ev: ReservationEvent) {
  const params = toParams(ev);
  if (hasGA4()) {
    await setGA4UserData({ name: ev.fullName, email: ev.email, phone: ev.phone });
    const g = gtagFn();
    g?.('event', 'reservation_checkin', {
      reservation_code: params.reservation_code,
      unit: params.unit, area: params.area, status: params.status, source: params.source,
    });
  }
  fbqTrackCustomActive('Reservation Checkin', params);
  (window as AnyObj).dataLayer?.push({ event: 'reservation_checkin', ...params });
}
