/**
 * src/scripts/audit-mesa-list.ts
 *
 * Lista reservas CHECKED_IN com mesa, de uma unidade num dia. Read-only.
 * Saída: tabela pra escolher candidatas pra audit detalhado de faturamento.
 *
 * Uso:
 *   npx tsx src/scripts/audit-mesa-list.ts --date=2026-05-23
 *   npx tsx src/scripts/audit-mesa-list.ts --date=2026-05-23 --unit=mane-aguas-claras
 *
 * Nota: instancia o PrismaClient inline (não usa o singleton de infrastructure/db/prisma.ts)
 * porque o ambiente do Warp injeta DATABASE_URL=undefined que sobrescreve o .env.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Honra DATABASE_URL do shell se válida; senão, força carregar do .env
const shellDbUrl = process.env.DATABASE_URL || '';
if (shellDbUrl.length < 30) {
  delete process.env.DATABASE_URL;
  dotenvConfig({ path: resolve(__dirname, '../../.env'), override: true });
}

const prisma = new PrismaClient();

const args     = process.argv.slice(2);
const dateArg  = args.find(a => a.startsWith('--date='))?.split('=')[1];
const unitArg  = args.find(a => a.startsWith('--unit='))?.split('=')[1] || 'mane-aguas-claras';

if (!dateArg) {
  console.error('❌ Falta --date=YYYY-MM-DD');
  process.exit(1);
}

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
      id:                  true,
      reservationCode:     true,
      fullName:            true,
      cpf:                 true,
      people:              true,
      reservationDate:     true,
      checkedInAt:         true,
      tables:              true,
      zigBillingCents:     true,
      manezinBillingCents: true,
      areaRef:             { select: { name: true } },
    },
    orderBy: { reservationDate: 'asc' },
  });

  console.log(`\n📅 ${dateArg} • unidade: ${unitArg} • CHECKED_IN com mesa: ${reservas.length}\n`);
  if (reservas.length === 0) { await prisma.$disconnect(); return; }

  console.log(
    'code   | nome                   | reservaBR | checkinBR | pax | mesas                | area           | zigR$    | manezinR$',
  );
  console.log(
    '-------+------------------------+-----------+-----------+-----+----------------------+----------------+----------+----------',
  );

  for (const r of reservas) {
    const horaBR  = new Date(r.reservationDate.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
    const checkin = r.checkedInAt
      ? new Date(r.checkedInAt.getTime() - 3 * 3600_000).toISOString().slice(11, 16)
      : '—    ';
    const code    = (r.reservationCode || r.id.slice(0, 6)).padEnd(6);
    const nome    = (r.fullName || '').slice(0, 22).padEnd(22);
    const mesas   = (r.tables || '').slice(0, 20).padEnd(20);
    const area    = (r.areaRef?.name || '').slice(0, 14).padEnd(14);
    const zigR$   = r.zigBillingCents     != null ? (r.zigBillingCents     / 100).toFixed(2).padStart(8) : '       —';
    const manR$   = r.manezinBillingCents != null ? (r.manezinBillingCents / 100).toFixed(2).padStart(8) : '       —';
    console.log(
      `${code} | ${nome} | ${horaBR}     | ${checkin}     | ${String(r.people).padStart(3)} | ${mesas} | ${area} | ${zigR$} | ${manR$}`,
    );
  }

  console.log(`\n→ Escolhe 2-3 codes pra audit. Eu puxo a timeline crua da Manezin pra cada um.\n`);
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
