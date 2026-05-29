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
import { getManezinBillingForReservation, type ManezinDayCache } from '../services/manezin.service';

// ─── Flags de CLI ─────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const allTime   = args.includes('--all');
const force     = args.includes('--force');   // recalcula mesmo com zigBillingCents já preenchido
const daysArg   = args.find(a => a.startsWith('--days='));
const days      = daysArg ? parseInt(daysArg.split('=')[1], 10) : 30;
const unitArg   = args.find(a => a.startsWith('--unit='))?.split('=')[1] || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[backfill] ${new Date().toISOString()} ${msg}`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.MANEZIN_TOKEN) {
    console.error('[backfill] ❌ MANEZIN_TOKEN não configurado. Abortando.');
    process.exit(1);
  }

  log(`Iniciando backfill — modo: ${dryRun ? 'DRY-RUN' : 'REAL'}, período: ${allTime ? 'TODAS' : `últimos ${days} dias`}${force ? ', FORCE (sobrescreve)' : ''}`);

  // Filtro: CHECKED_IN com mesas
  // Sem --force: só processa as que ainda estão null (comportamento original do job noturno)
  // Com  --force: reprocessa tudo (útil pra aplicar regra nova retroativamente)
  const where: any = {
    tables: { not: null },
    status: 'CHECKED_IN',
  };
  if (!force) where.zigBillingCents = null;

  // Filtro por unidade (--unit=mane-west-plaza-sp)
  if (unitArg) {
    where.unitRef = { slug: unitArg };
    log(`Filtrando por unidade: ${unitArg}`);
  }

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
      checkedInAt:     true,
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
  // Cache compartilhado por dia — evita refetch da Manezin pra múltiplas reservas do mesmo dia
  const dayCache: ManezinDayCache = new Map();

  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    const prefix = `[${i + 1}/${reservations.length}] ${r.id} (${r.fullName})`;

    // Retry com backoff (API Manezin pode ser lenta)
    let lastErr: any;
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const billing = await getManezinBillingForReservation(
          r.tables!,
          r.reservationDate,
          r.unitRef?.slug ?? null,
          undefined,
          r.checkedInAt,
          dayCache,
        );

        if (dryRun) {
          log(`${prefix} → DRY-RUN: ${billing.totalValueBRL} (${billing.transactions.length} tx, período: ${billing.period})`);
        } else {
          await prisma.reservation.update({
            where: { id: r.id },
            data: {
              zigBillingCents: billing.totalValueCents,
              zigBilledAt:     new Date(),
            },
          });
          log(`✅ ${prefix} → ${billing.totalValueBRL} (${billing.transactions.length} tx, período: ${billing.period})`);
        }
        ok++;
        success = true;
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < 3) {
          const wait = attempt * 2000;
          log(`⏳ ${prefix} → tentativa ${attempt}/3 falhou, retry em ${wait/1000}s...`);
          await sleep(wait);
        }
      }
    }
    if (!success) {
      console.error(`❌ ${prefix} → ERRO (3 tentativas): ${lastErr?.message || lastErr}`);
      errors++;
    }

    // MySQL é local/intra-Railway — pausa curta só pra não saturar conexão
    await sleep(50);
  }

  log(`─────────────────────────────────────────`);
  log(`Concluído!`);
  log(`  ✅ Processados com sucesso: ${ok}`);
  log(`  ⚠️  Sem transações ZIG:     ${skipped}`);
  log(`  ❌ Erros:                   ${errors}`);
  log(`  Total:                      ${reservations.length}`);

  await prisma.$disconnect();
}


main().catch(async (err) => {
  console.error('[backfill] Erro fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
