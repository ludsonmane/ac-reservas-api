/**
 * src/services/zig.billing.job.ts
 *
 * Scheduler de faturamento ZIG — sem dependências externas.
 * Usa setTimeout nativo do Node para agendar os jobs.
 *
 * Horários (America/Sao_Paulo):
 *   16:00 → processa reservas AFTERNOON (almoço) do dia atual
 *   01:00 → processa reservas NIGHT (jantar) do dia anterior
 */

import { prisma } from '../infrastructure/db/prisma';
import { getZigBillingForReservation, getPeriod } from './zig.service';

// ─── Logger ───────────────────────────────────────────────────────────────────

function log(msg: string, ...args: any[]) {
  console.log(`[zig-job] ${new Date().toISOString()} ${msg}`, ...args);
}
function logErr(msg: string, err: any) {
  console.error(`[zig-job] ${new Date().toISOString()} ${msg}`, err?.message || err);
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

export async function processZigBillingForPeriod(
  targetDate: Date,
  period: 'AFTERNOON' | 'NIGHT',
): Promise<{ processed: number; errors: number }> {
  if (!process.env.ZIG_TOKEN || !process.env.ZIG_LOJA_MAP) {
    log('ZIG_TOKEN ou ZIG_LOJA_MAP não configurados — job ignorado.');
    return { processed: 0, errors: 0 };
  }

  const ymd        = targetDate.toISOString().slice(0, 10);
  const startOfDay = new Date(`${ymd}T00:00:00.000Z`);
  const endOfDay   = new Date(`${ymd}T23:59:59.999Z`);

  log(`Iniciando — data: ${ymd}, período: ${period}`);

  const reservations = await prisma.reservation.findMany({
    where: {
      reservationDate: { gte: startOfDay, lte: endOfDay },
      tables:          { not: null },
      zigBillingCents: null,
      status:          { in: ['CHECKED_IN', 'AWAITING_CHECKIN'] },
    },
    select: {
      id:              true,
      tables:          true,
      reservationDate: true,
      unitRef:         { select: { slug: true } },
    },
  });

  const filtered = reservations.filter(
    (r) => getPeriod(new Date(r.reservationDate)) === period,
  );

  log(`${reservations.length} reservas no dia, ${filtered.length} no período ${period}`);

  let processed = 0;
  let errors    = 0;

  for (const r of filtered) {
    try {
      const billing = await getZigBillingForReservation(
        r.tables!,
        r.reservationDate,
        r.unitRef?.slug ?? null,
      );

      await prisma.reservation.update({
        where: { id: r.id },
        data:  { zigBillingCents: billing.totalValueCents, zigBilledAt: new Date() },
      });

      log(`✅ ${r.id} → ${billing.totalValueBRL} (${billing.transactions.length} tx)`);
      processed++;

      // Pausa para não sobrecarregar a ZIG
      await new Promise((res) => setTimeout(res, 300));
    } catch (err: any) {
      logErr(`❌ ${r.id}`, err);
      errors++;
    }
  }

  log(`Concluído — processadas: ${processed}, erros: ${errors}`);
  return { processed, errors };
}

// ─── Scheduler nativo (sem node-cron) ────────────────────────────────────────

/**
 * Calcula quantos ms faltam até o próximo HH:MM no fuso America/Sao_Paulo.
 * Se o horário já passou hoje, agenda para amanhã.
 */
function msUntilNext(hour: number, minute: number): number {
  // Obtém a hora atual em São Paulo
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const now    = new Date(nowStr);

  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1); // já passou → próximo dia
  }

  return target.getTime() - now.getTime();
}

/**
 * Agenda um job recorrente para rodar todos os dias em HH:MM (horário de SP).
 * Usa setTimeout recursivo para se manter alinhado ao horário correto.
 */
function scheduleDailyAt(hour: number, minute: number, job: () => Promise<void>) {
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  function scheduleNext() {
    const ms = msUntilNext(hour, minute);
    log(`Próximo job ${label} em ${Math.round(ms / 60000)} min`);
    setTimeout(async () => {
      try {
        await job();
      } catch (err) {
        logErr(`Job ${label} falhou:`, err);
      }
      scheduleNext(); // reagenda para o próximo dia
    }, ms);
  }

  scheduleNext();
}

// ─── Registro ─────────────────────────────────────────────────────────────────

export function startZigBillingJobs() {
  if (!process.env.ZIG_TOKEN) {
    console.log('[zig-job] ZIG_TOKEN não configurado — jobs não iniciados.');
    return;
  }

  // 16:00 → almoço do dia ANTERIOR
  // (mesas são preenchidas manualmente, então só processamos no dia seguinte)
  scheduleDailyAt(16, 0, async () => {
    log('⏰ Disparando job AFTERNOON (almoço do dia anterior)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processZigBillingForPeriod(yesterday, 'AFTERNOON');
  });

  // 01:00 → jantar do dia ANTERIOR
  scheduleDailyAt(1, 0, async () => {
    log('⏰ Disparando job NIGHT (jantar do dia anterior)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processZigBillingForPeriod(yesterday, 'NIGHT');
  });

  console.log('[zig-job] Jobs agendados: AFTERNOON (16:00 D+1) e NIGHT (01:00 D+1) — fuso: America/Sao_Paulo');
}
