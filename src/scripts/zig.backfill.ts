/**
 * src/scripts/zig.backfill.ts
 *
 * Script de backfill — roda UMA VEZ para preencher o faturamento ZIG
 * em reservas antigas que já estão no banco sem zigBillingCents.
 *
 * Uso:
 *   npx tsx src/scripts/zig.backfill.ts
 *   npx tsx src/scripts/zig.backfill.ts --days=60     (últimos 60 dias, padrão: 30)
 *   npx tsx src/scripts/zig.backfill.ts --dry-run     (mostra o que faria, sem salvar)
 *   npx tsx src/scripts/zig.backfill.ts --all         (todas as reservas sem limite de data)
 */

import '../config/env'; // carrega as env vars
import { prisma } from '../infrastructure/db/prisma';
import { getZigBillingForReservation } from '../services/zig.service';

// ─── Flags de CLI ─────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const allTime   = args.includes('--all');
const daysArg   = args.find(a => a.startsWith('--days='));
const days      = daysArg ? parseInt(daysArg.split('=')[1], 10) : 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[backfill] ${new Date().toISOString()} ${msg}`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ZIG_TOKEN || !process.env.ZIG_LOJA_MAP) {
    console.error('[backfill] ❌ ZIG_TOKEN ou ZIG_LOJA_MAP não configurados. Abortando.');
    process.exit(1);
  }

  log(`Iniciando backfill — modo: ${dryRun ? 'DRY-RUN' : 'REAL'}, período: ${allTime ? 'TODAS' : `últimos ${days} dias`}`);

  // Filtro de data
  const where: any = {
    tables:          { not: null },
    zigBillingCents: null,
    status:          'CHECKED_IN',
  };

  if (!allTime) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
    where.reservationDate = { gte: from };
  }

  const reservations = await prisma.reservation.findMany({
    where,
    orderBy: { reservationDate: 'asc' },
    select: {
      id:              true,
      fullName:        true,
      tables:          true,
      reservationDate: true,
      unitRef:         { select: { slug: true, name: true } },
    },
  });

  log(`Encontradas: ${reservations.length} reservas sem faturamento ZIG`);

  if (reservations.length === 0) {
    log('Nada a processar. Encerrando.');
    await prisma.$disconnect();
    return;
  }

  let ok     = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    const prefix = `[${i + 1}/${reservations.length}] ${r.id} (${r.fullName})`;

    try {
      const billing = await getZigBillingForReservation(
        r.tables!,
        r.reservationDate,
        r.unitRef?.slug ?? null,
      );

      if (dryRun) {
        log(`${prefix} → DRY-RUN: ${billing.totalValueBRL} (${billing.transactions.length} tx, período: ${billing.period})`);
        ok++;
      } else {
        await prisma.reservation.update({
          where: { id: r.id },
          data: {
            zigBillingCents: billing.totalValueCents,
            zigBilledAt:     new Date(),
          },
        });
        log(`✅ ${prefix} → ${billing.totalValueBRL} (${billing.transactions.length} tx, período: ${billing.period})`);
        ok++;
      }

    } catch (err: any) {
      // Se a ZIG retornou 0 transações (não é erro, mesa não encontrada)
      if (err?.message?.includes('ZIG_EMPTY') || billing_was_zero(err)) {
        log(`⚠️  ${prefix} → sem transações na ZIG (mesa não encontrada ou período sem vendas)`);
        if (!dryRun) {
          // Salva como 0 pra não tentar de novo
          await prisma.reservation.update({
            where: { id: r.id },
            data:  { zigBillingCents: 0, zigBilledAt: new Date() },
          });
        }
        skipped++;
      } else {
        console.error(`❌ ${prefix} → ERRO: ${err?.message || err}`);
        errors++;
      }
    }

    // Pausa entre chamadas pra não sobrecarregar a ZIG (sem rate limit documentado)
    await sleep(500);
  }

  log(`─────────────────────────────────────────`);
  log(`Concluído!`);
  log(`  ✅ Processados com sucesso: ${ok}`);
  log(`  ⚠️  Sem transações ZIG:     ${skipped}`);
  log(`  ❌ Erros:                   ${errors}`);
  log(`  Total:                      ${reservations.length}`);

  await prisma.$disconnect();
}

function billing_was_zero(err: any): boolean {
  // getZigBillingForReservation nunca lança pra 0 resultados — retorna totalValueCents = 0
  // então esse caso não vai acontecer, mas deixo o guard por segurança
  return false;
}

main().catch(async (err) => {
  console.error('[backfill] Erro fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
