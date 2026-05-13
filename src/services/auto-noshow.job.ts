/**
 * src/services/auto-noshow.job.ts
 *
 * Job de auto-NO_SHOW.
 * A cada 1h busca reservas com status AWAITING_CHECKIN cuja reservationDate
 * passou ha mais de HOURS_GRACE horas e marca como NO_SHOW automaticamente.
 *
 * Para desativar em prod: AUTO_NOSHOW_DISABLED=true
 * Para ajustar a janela: AUTO_NOSHOW_HOURS_GRACE=24 (default)
 * Para ajustar intervalo: AUTO_NOSHOW_INTERVAL_MIN=60 (default)
 */

import { prisma } from '../infrastructure/db/prisma';
import { logAction } from './audit/auditLog.service';
import { notifyN8nNewContact } from './n8n';

function log(msg: string, ...args: any[]) {
  console.log(`[auto-noshow] ${new Date().toISOString()} ${msg}`, ...args);
}
function logErr(msg: string, err: any) {
  console.error(`[auto-noshow] ${new Date().toISOString()} ${msg}`, err?.message || err);
}

const HOURS_GRACE = Number(process.env.AUTO_NOSHOW_HOURS_GRACE ?? 24);
const INTERVAL_MIN = Number(process.env.AUTO_NOSHOW_INTERVAL_MIN ?? 60);

export async function processAutoNoShow(): Promise<{ processed: number; errors: number }> {
  const cutoff = new Date(Date.now() - HOURS_GRACE * 60 * 60 * 1000);

  const expired = await prisma.reservation.findMany({
    where: {
      status: 'AWAITING_CHECKIN',
      reservationDate: { lt: cutoff },
    },
    select: {
      id: true,
      reservationCode: true,
      fullName: true,
      phone: true,
      people: true,
      kids: true,
      unitId: true,
      areaId: true,
      reservationDate: true,
    },
  });

  if (expired.length === 0) {
    log(`Nada a processar (cutoff ${cutoff.toISOString()}, janela ${HOURS_GRACE}h)`);
    return { processed: 0, errors: 0 };
  }

  log(`${expired.length} reserva(s) AWAITING_CHECKIN com reservationDate < ${cutoff.toISOString()} (${HOURS_GRACE}h)`);

  let processed = 0;
  let errors = 0;

  for (const r of expired) {
    try {
      await prisma.reservation.update({
        where: { id: r.id },
        data: { status: 'NO_SHOW' },
      });

      await logAction({
        action: 'NO_SHOW',
        entity: 'Reservation',
        entityId: r.id,
        userName: 'sistema-auto',
        oldData: { status: 'AWAITING_CHECKIN' },
        newData: { status: 'NO_SHOW', reason: `auto: >${HOURS_GRACE}h apos reservationDate sem check-in` },
      });

      try {
        notifyN8nNewContact({
          type: 'reservation_noshow_auto',
          name: r.fullName,
          email: null,
          phone: r.phone ?? null,
          reservationId: r.id,
          reservationCode: r.reservationCode ?? null,
          reservationDate: r.reservationDate.toISOString(),
          people: r.people,
          kids: r.kids ?? null,
          unitId: r.unitId ?? null,
          areaId: r.areaId ?? null,
          source: 'auto-noshow',
        });
      } catch {}

      log(`✅ ${r.reservationCode || r.id} → NO_SHOW (data ${r.reservationDate.toISOString()})`);
      processed++;
    } catch (err: any) {
      logErr(`❌ ${r.id}`, err);
      errors++;
    }
  }

  log(`Concluido — NO_SHOW: ${processed}, erros: ${errors}`);
  return { processed, errors };
}

export function startAutoNoShowJob() {
  if (String(process.env.AUTO_NOSHOW_DISABLED || '').toLowerCase() === 'true') {
    log('AUTO_NOSHOW_DISABLED=true — job nao iniciado.');
    return;
  }

  log(`Job iniciado — janela ${HOURS_GRACE}h, intervalo ${INTERVAL_MIN}min.`);

  // primeira execucao 30s apos boot
  setTimeout(() => {
    processAutoNoShow().catch((e) => logErr('Falha no run inicial:', e));
  }, 30_000);

  setInterval(() => {
    processAutoNoShow().catch((e) => logErr('Falha no run periodico:', e));
  }, INTERVAL_MIN * 60 * 1000);
}
