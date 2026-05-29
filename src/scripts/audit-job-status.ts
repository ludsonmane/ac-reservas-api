/**
 * src/scripts/audit-job-status.ts
 *
 * Diagnóstico: pra cada reserva CHECKED_IN do dia, mostra:
 *  - zigBillingCents
 *  - zigBilledAt  (timestamp do último job que rodou)
 *  - se job nunca rodou (zigBilledAt null) → job não disparou pra esta reserva
 *  - se job rodou e gravou 0 → MySQL Zig Full estava vazio na hora
 *
 * Uso:
 *   DATABASE_URL=... npx tsx src/scripts/audit-job-status.ts --date=2026-05-23
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

const shellDbUrl = process.env.DATABASE_URL || '';
if (shellDbUrl.length < 30) {
  delete process.env.DATABASE_URL;
  dotenvConfig({ path: resolve(__dirname, '../../.env'), override: true });
}

const prisma = new PrismaClient();

const args    = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1];
const unitArg = args.find(a => a.startsWith('--unit='))?.split('=')[1] || 'mane-aguas-claras';

if (!dateArg) { console.error('❌ Falta --date=YYYY-MM-DD'); process.exit(1); }

async function main() {
  const dayStart = new Date(`${dateArg}T00:00:00-03:00`);
  const dayEnd   = new Date(`${dateArg}T23:59:59-03:00`);

  const reservas = await prisma.reservation.findMany({
    where: {
      status:          'CHECKED_IN',
      tables:          { not: null },
      reservationDate: { gte: dayStart, lte: dayEnd },
      unitRef:         { slug: unitArg },
    },
    select: {
      reservationCode: true, fullName: true, reservationDate: true,
      zigBillingCents: true, zigBilledAt: true,
      manezinBillingCents: true, manezinBilledAt: true,
    },
    orderBy: { reservationDate: 'asc' },
  });

  console.log(`\n📅 ${dateArg} • ${reservas.length} reservas CHECKED_IN com mesa\n`);

  console.log(`code   | reservaBR | zigBillingCents | zigBilledAt              | manezinBillingCents | manezinBilledAt`);
  console.log(`-------+-----------+-----------------+--------------------------+---------------------+--------------------------`);

  let jobNuncaRodou = 0;
  let jobZerou       = 0;
  let jobComValor    = 0;

  for (const r of reservas) {
    const horaBR = new Date(r.reservationDate.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
    const code   = (r.reservationCode || '???').padEnd(6);
    const cents  = r.zigBillingCents !== null ? String(r.zigBillingCents).padStart(7) : '   null';
    const billed = r.zigBilledAt ? r.zigBilledAt.toISOString().replace('T', ' ').slice(0, 19) : '— (job nunca rodou)     ';
    const mCents = r.manezinBillingCents !== null ? String(r.manezinBillingCents).padStart(7) : '   null';
    const mBilled= r.manezinBilledAt ? r.manezinBilledAt.toISOString().replace('T', ' ').slice(0, 19) : '— (nunca)               ';

    let status = '';
    if (r.zigBilledAt === null) { jobNuncaRodou++; status = '🟡'; }
    else if (r.zigBillingCents === 0) { jobZerou++; status = '🚨'; }
    else { jobComValor++; status = '✅'; }

    console.log(`${code} | ${horaBR}     |   ${cents}       | ${billed.padEnd(24)} |   ${mCents}             | ${mBilled.padEnd(24)} ${status}`);
  }

  console.log(`\nResumo:`);
  console.log(`  ✅ Job rodou e gravou valor > 0: ${jobComValor}`);
  console.log(`  🚨 Job rodou mas gravou 0 (MySQL Zig estava vazio): ${jobZerou}`);
  console.log(`  🟡 Job NUNCA rodou (zigBilledAt null): ${jobNuncaRodou}\n`);

  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
