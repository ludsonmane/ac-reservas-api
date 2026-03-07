/**
 * src/services/zig.billing.job.ts
 *
 * Job agendado que busca automaticamente o faturamento ZIG
 * para as reservas do dia e salva no banco.
 *
 * Horários:
 *   16:00 → processa reservas AFTERNOON (almoço) do dia atual
 *   01:00 → processa reservas NIGHT (jantar) do dia anterior
 *
 * Requisitos: ZIG_TOKEN + ZIG_LOJA_MAP configurados no Railway.
 */

import cron from 'node-cron';
import { prisma } from '../infrastructure/db/prisma';
import { getZigBillingForReservation, getPeriod } from './zig.service';

// ─── Logger simples ───────────────────────────────────────────────────────────

function log(msg: string, ...args: any[]) {
  console.log(`[zig-job] ${new Date().toISOString()} ${msg}`, ...args);
}
function logErr(msg: string, err: any) {
  console.error(`[zig-job] ${new Date().toISOString()} ${msg}`, err?.message || err);
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

/**
 * Busca todas as reservas do período informado na data informada,
 * que tenham mesas vinculadas e ainda não tenham faturamento salvo,
 * e salva o resultado no banco uma a uma.
 *
 * @param targetDate  Data das reservas a processar (Date)
 * @param period      'AFTERNOON' | 'NIGHT'
 */
export async function processZigBillingForPeriod(
  targetDate: Date,
  period: 'AFTERNOON' | 'NIGHT',
): Promise<{ processed: number; errors: number }> {
  if (!process.env.ZIG_TOKEN || !process.env.ZIG_LOJA_MAP) {
    log('ZIG_TOKEN ou ZIG_LOJA_MAP não configurados — job ignorado.');
    return { processed: 0, errors: 0 };
  }

  const ymd        = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const startOfDay = new Date(`${ymd}T00:00:00.000Z`);
  const endOfDay   = new Date(`${ymd}T23:59:59.999Z`);

  // Corte de horário para filtrar reservas pelo período
  // AFTERNOON: 00:00–17:29  |  NIGHT: 17:30–23:59
  const cutoffHour   = 17;
  const cutoffMinute = 30;

  log(`Iniciando processamento — data: ${ymd}, período: ${period}`);

  // Busca reservas do dia com mesas vinculadas e sem faturamento ZIG ainda
  const reservations = await prisma.reservation.findMany({
    where: {
      reservationDate: { gte: startOfDay, lte: endOfDay },
      tables:          { not: null },
      zigBillingCents: null,                  // ainda não processado
      status:          { in: ['CHECKED_IN', 'AWAITING_CHECKIN'] },
    },
    select: {
      id:              true,
      tables:          true,
      reservationDate: true,
      unitId:          true,
      unitRef:         { select: { slug: true } },
    },
  });

  // Filtra só as reservas do período correto pelo horário
  const filtered = reservations.filter((r) => {
    const p = getPeriod(new Date(r.reservationDate));
    return p === period;
  });

  log(`Reservas encontradas: ${reservations.length} total, ${filtered.length} no período ${period}`);

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
        data: {
          zigBillingCents: billing.totalValueCents,
          zigBilledAt:     new Date(),
        },
      });

      log(`✅ ${r.id} → ${billing.totalValueBRL} (${billing.transactions.length} transações)`);
      processed++;

      // Pequena pausa entre chamadas pra não sobrecarregar a ZIG
      await new Promise((res) => setTimeout(res, 300));

    } catch (err: any) {
      logErr(`❌ ${r.id} → erro:`, err);
      errors++;
    }
  }

  log(`Concluído — processadas: ${processed}, erros: ${errors}`);
  return { processed, errors };
}

// ─── Registro dos jobs cron ──────────────────────────────────────────────────

export function startZigBillingJobs() {
  if (!process.env.ZIG_TOKEN) {
    console.log('[zig-job] ZIG_TOKEN não configurado — jobs não registrados.');
    return;
  }

  /**
   * 16:00 — processa almoços do dia atual
   * Cron: "0 16 * * *"  (América/São Paulo via TZ no Railway)
   */
  cron.schedule('0 16 * * *', async () => {
    log('⏰ Disparando job AFTERNOON (almoço)...');
    const today = new Date();
    await processZigBillingForPeriod(today, 'AFTERNOON');
  }, { timezone: 'America/Sao_Paulo' });

  /**
   * 01:00 — processa jantares do dia ANTERIOR
   * Cron: "0 1 * * *"  (América/São Paulo)
   */
  cron.schedule('0 1 * * *', async () => {
    log('⏰ Disparando job NIGHT (jantar)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processZigBillingForPeriod(yesterday, 'NIGHT');
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[zig-job] Jobs registrados: AFTERNOON (16:00) e NIGHT (01:00) — fuso: America/Sao_Paulo');
}
