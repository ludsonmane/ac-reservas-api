// src/services/n8n.ts
import axios from 'axios';

export type N8NContactPayload = {
  type?: string;

  name: string;
  email: string | null;
  phone?: string | null;
  cpf?: string | null;

  store?: string | null;
  unitId?: string | null;
  areaId?: string | null;
  areaName?: string | null;

  reservationId?: string | null;
  reservationCode?: string | null;
  reservationType?: string | null;
  reservationDate?: string | null;
  people?: number | null;
  kids?: number | null;

  source: string;
  url?: string | null;
  ref?: string | null;

  utm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };

  role?: 'HOST' | 'GUEST';
};

function safeJsonPreview(obj: any, max = 400) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? s.slice(0, max) + '...' : s;
  } catch {
    return '[unserializable]';
  }
}

export function notifyN8nNewContact(payload: N8NContactPayload) {
  const url = process.env.N8N_NEW_CONTACT_WEBHOOK_URL;

  if (!url) {
    console.warn('[n8n] missing env N8N_NEW_CONTACT_WEBHOOK_URL');
    return;
  }

  // fire-and-forget (não bloquear reserva)
  void (async () => {
    try {
      const apiKey = process.env.N8N_WEBHOOK_API_KEY;

      const resp = await axios.post(url, payload, {
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        timeout: 8000,
        // não jogar exception por status != 2xx, a gente loga
        validateStatus: () => true,
      });

      if (resp.status < 200 || resp.status >= 300) {
        console.warn(
          `[n8n] webhook non-2xx status=${resp.status} body=${safeJsonPreview(resp.data)}`
        );
      } else {
        console.log(`[n8n] webhook ok status=${resp.status}`);
      }
    } catch (err: any) {
      console.error('[n8n] webhook request failed:', err?.message || err);
    }
  })();
}
