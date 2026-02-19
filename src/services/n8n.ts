// src/services/n8n.ts
// src/services/n8n.ts
export type N8NContactPayload = {
  type?: 'reservation_created' | 'guest_added' | string;

  // contato
  name: string;
  email: string | null;
  phone?: string | null;
  cpf?: string | null;

  // contexto
  store?: string | null;
  unitId?: string | null;
  areaId?: string | null;
  areaName?: string | null;

  // reserva
  reservationId?: string | null;
  reservationCode?: string | null;
  reservationType?: string | null;
  reservationDate?: string | null;
  people?: number | null;
  kids?: number | null;

  // origem
  source: string;
  url?: string | null;
  ref?: string | null;

  // utm
  utm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };

  role?: 'HOST' | 'GUEST';
};


export async function notifyN8nNewContact(payload: N8NContactPayload) {
  const url = process.env.N8N_NEW_CONTACT_WEBHOOK_URL;
  if (!url) return;

  // Não travar a resposta da API: fire-and-forget
  setImmediate(async () => {
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // opcional: proteção simples no webhook do n8n
          ...(process.env.N8N_WEBHOOK_API_KEY
            ? { 'x-api-key': process.env.N8N_WEBHOOK_API_KEY }
            : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // não estoura erro pro cliente, só loga
      console.error('[n8n webhook] failed', e);
    }
  });
}
