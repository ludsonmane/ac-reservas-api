/**
 * src/scripts/audit-mesa-v2.ts
 *
 * Audit com regra de SESSION DETECTION (vs. regra atual de pivot+4h hard cutoff).
 *
 * Regra nova:
 *   Pivot      = 1ª venda na mesa após reservationDate (max MAX_LATE_HRS atraso)
 *   Session    = contígua enquanto:
 *                  (a) gap p/ próxima venda ≤ GAP_MIN, OU
 *                  (b) chip da próxima venda já bipou na sessão
 *   Termina    = primeiro gap > GAP_MIN AND chip é NOVO
 *   Cap        = sessão dura no máx MAX_SESSION_HRS desde o pivot (safety net)
 *
 * Uso:
 *   DATABASE_URL=... npx tsx src/scripts/audit-mesa-v2.ts --date=2026-05-23
 *   DATABASE_URL=... npx tsx src/scripts/audit-mesa-v2.ts --date=2026-05-23 --codes=9WUFAP,R3FN2U,HP8T5E
 *   DATABASE_URL=... npx tsx src/scripts/audit-mesa-v2.ts --date=2026-05-23 --gap-mins=60
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const shellDbUrl = process.env.DATABASE_URL || '';
if (shellDbUrl.length < 30) {
  delete process.env.DATABASE_URL;
  dotenvConfig({ path: resolve(__dirname, '../../.env'), override: true });
}

const prisma = new PrismaClient();

const MANEZIN_BASE     = 'https://manezin.com.br/api/externo';
const MANEZIN_TOKEN    = process.env.MANEZIN_TOKEN || 'mane_ludson_2026_x7K9pLmN3qR5sT8w';
const AC_EVENT_NAME    = 'MANÉ MERCADO - ÁGUAS CLARAS';
const OLD_WINDOW_HRS   = 4;
const MAX_LATE_HRS     = 8;
const MAX_SESSION_HRS  = 8;

interface Transacao {
  transactionId: string;
  transactionDate: string;
  unitValue: number;
  count: number;
  discountValue: number | null;
  productName: string;
  obs: string | null;
  isRefunded: boolean;
  eventName: string;
  compr_userDocument: string | null;
  compr_userName: string | null;
  compr_chipNfc: string | null;
}

const args     = process.argv.slice(2);
const dateArg  = args.find(a => a.startsWith('--date='))?.split('=')[1];
const codesArg = args.find(a => a.startsWith('--codes='))?.split('=')[1];
const gapArg   = args.find(a => a.startsWith('--gap-mins='))?.split('=')[1];
const unitArg  = args.find(a => a.startsWith('--unit='))?.split('=')[1] || 'mane-aguas-claras';

if (!dateArg) { console.error('❌ Falta --date=YYYY-MM-DD'); process.exit(1); }

const GAP_MIN     = gapArg ? parseInt(gapArg, 10) : 60;
const detailCodes = codesArg ? codesArg.split(',').map(s => s.trim()).filter(Boolean) : [];

const MESA_RE = /^Mesa:\s*(\d+)(?:\s|$|-)/i;

function parseMesa(obs: string | null): string | null {
  if (!obs) return null;
  const m = MESA_RE.exec(obs.trim());
  return m ? String(parseInt(m[1], 10)) : null;
}

function brTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Date(dt.getTime() - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

function fmtBR(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function fetchManezinForDate(dateStr: string): Promise<Transacao[]> {
  const next = new Date(dateStr + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  const url = `${MANEZIN_BASE}/transacoes?data_inicio=${dateStr}&data_fim=${nextStr}&limit=50000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${MANEZIN_TOKEN}` } });
  if (!res.ok) throw new Error(`Manezin ${res.status} ${res.statusText}`);
  const body = await res.json() as { data: Transacao[] };
  return body.data.filter(t => t.eventName === AC_EVENT_NAME);
}

// ─── Regra ANTIGA: pivot + 4h hard cutoff ─────────────────────────────────────
function applyOldRule(allMesaTx: Transacao[], reservaMs: number) {
  const filtered = allMesaTx
    .filter(t => {
      const ms = new Date(t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z').getTime();
      return ms >= reservaMs && ms <= reservaMs + (MAX_LATE_HRS + OLD_WINDOW_HRS) * 3600_000;
    })
    .sort((a, b) => new Date(a.transactionDate.endsWith('Z') ? a.transactionDate : a.transactionDate + 'Z').getTime() - new Date(b.transactionDate.endsWith('Z') ? b.transactionDate : b.transactionDate + 'Z').getTime());
  if (filtered.length === 0) return { cents: 0, txs: [] as Transacao[], cutoffMs: 0, pivotMs: 0 };
  const pivotMs  = new Date(filtered[0].transactionDate).getTime();
  const cutoffMs = pivotMs + OLD_WINDOW_HRS * 3600_000;
  const inWin    = filtered.filter(t => new Date(t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z').getTime() <= cutoffMs);
  const cents    = inWin.reduce((acc, t) => acc + t.unitValue * t.count - (t.discountValue ?? 0), 0);
  return { cents, txs: inWin, cutoffMs, pivotMs };
}

// ─── Regra NOVA: session detection (gap + chip tracking) ──────────────────────
interface SessionTx {
  tx: Transacao;
  reason: 'pivot' | 'gap-ok' | 'chip-in-session' | 'rejected-new-after-gap' | 'rejected-cap';
}

function applyNewRule(allMesaTx: Transacao[], reservaMs: number) {
  const ordered = allMesaTx
    .filter(t => {
      const ms = new Date(t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z').getTime();
      return ms >= reservaMs && ms <= reservaMs + (MAX_LATE_HRS + MAX_SESSION_HRS) * 3600_000;
    })
    .sort((a, b) => new Date(a.transactionDate.endsWith('Z') ? a.transactionDate : a.transactionDate + 'Z').getTime() - new Date(b.transactionDate.endsWith('Z') ? b.transactionDate : b.transactionDate + 'Z').getTime());

  if (ordered.length === 0) return { cents: 0, items: [] as SessionTx[], pivotMs: 0, endMs: 0 };

  const pivotMs   = new Date(ordered[0].transactionDate).getTime();
  const sessionCap= pivotMs + MAX_SESSION_HRS * 3600_000;
  const chips     = new Set<string>();
  const items: SessionTx[] = [];
  let prevMs      = pivotMs;
  let sessionOver = false;

  for (let i = 0; i < ordered.length; i++) {
    const t   = ordered[i];
    const ms  = new Date(t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z').getTime();
    const chip= t.compr_chipNfc || '';

    if (i === 0) {
      items.push({ tx: t, reason: 'pivot' });
      if (chip) chips.add(chip);
      prevMs = ms;
      continue;
    }
    if (sessionOver) {
      items.push({ tx: t, reason: 'rejected-new-after-gap' });
      continue;
    }
    if (ms > sessionCap) {
      items.push({ tx: t, reason: 'rejected-cap' });
      sessionOver = true;
      continue;
    }

    const gapMin       = (ms - prevMs) / 60_000;
    const chipInSession= chip && chips.has(chip);

    if (gapMin <= GAP_MIN) {
      items.push({ tx: t, reason: 'gap-ok' });
      if (chip) chips.add(chip);
      prevMs = ms;
    } else if (chipInSession) {
      items.push({ tx: t, reason: 'chip-in-session' });
      prevMs = ms;
    } else {
      items.push({ tx: t, reason: 'rejected-new-after-gap' });
      sessionOver = true;
    }
  }

  const accepted = items.filter(it => it.reason !== 'rejected-new-after-gap' && it.reason !== 'rejected-cap');
  const cents    = accepted.reduce((acc, it) => acc + it.tx.unitValue * it.tx.count - (it.tx.discountValue ?? 0), 0);
  const endMs    = accepted.length > 0 ? new Date(accepted[accepted.length - 1].tx.transactionDate).getTime() : pivotMs;

  return { cents, items, pivotMs, endMs };
}

async function generateDetail(
  code: string,
  res: any,
  tables: string[],
  txByMesa: Map<string, Transacao[]>,
) {
  const reservaMs = res.reservationDate.getTime();

  let md = `# Audit ${code} — ${res.fullName}\n\n`;
  md += `- **Reserva:** ${brTime(res.reservationDate)} BR\n`;
  md += `- **Pax:** ${res.people} • **CPF titular:** ${res.cpf || '—'}\n`;
  md += `- **Mesas:** ${tables.join(', ')}\n`;
  md += `- **zigBillingCents (DB):** ${res.zigBillingCents != null ? 'R$ ' + fmtBR(res.zigBillingCents) : 'null'}\n`;
  md += `- **Regra nova gap_min:** ${GAP_MIN}\n\n`;

  let totalOld = 0, totalNew = 0;

  for (const mesa of tables) {
    const all = txByMesa.get(mesa) || [];
    const oldR = applyOldRule(all, reservaMs);
    const newR = applyNewRule(all, reservaMs);

    md += `## Mesa ${mesa}\n\n`;
    if (newR.items.length === 0) {
      md += `_Sem vendas casadas._\n\n`;
      continue;
    }

    const lagPivot = Math.round((newR.pivotMs - reservaMs) / 60_000);
    md += `- Pivot: ${brTime(new Date(newR.pivotMs).toISOString())} BR (+${lagPivot}min)\n`;
    md += `- Cutoff antigo (pivot+4h): ${brTime(new Date(oldR.cutoffMs).toISOString())} BR\n`;
    md += `- Fim da session nova: ${brTime(new Date(newR.endMs).toISOString())} BR\n\n`;

    md += `| # | Hora BR | Produto | R$ | Chip | Antiga | Nova | Por quê |\n`;
    md += `|---|---------|---------|----|------|--------|------|---------|\n`;

    let prevAcceptedMs = 0;
    for (let i = 0; i < newR.items.length; i++) {
      const item = newR.items[i];
      const t = item.tx;
      const ms = new Date(t.transactionDate.endsWith('Z') ? t.transactionDate : t.transactionDate + 'Z').getTime();
      const val = t.unitValue * t.count - (t.discountValue ?? 0);
      const oldIn = ms <= oldR.cutoffMs;
      const newIn = item.reason !== 'rejected-new-after-gap' && item.reason !== 'rejected-cap';
      const prod  = (t.productName || '').slice(0, 26);
      const chip  = (t.compr_chipNfc || '—').slice(-6);
      const nome  = (t.compr_userName || '—').slice(0, 14);

      let why = '';
      if (item.reason === 'pivot') why = 'pivot';
      else if (item.reason === 'gap-ok') {
        const gap = Math.round((ms - prevAcceptedMs) / 60_000);
        why = `gap ${gap}m ≤ ${GAP_MIN}`;
      } else if (item.reason === 'chip-in-session') {
        const gap = Math.round((ms - prevAcceptedMs) / 60_000);
        why = `gap ${gap}m, chip ${chip} já bipou`;
      } else if (item.reason === 'rejected-new-after-gap') {
        const gap = Math.round((ms - prevAcceptedMs) / 60_000);
        why = `gap ${gap}m > ${GAP_MIN} + chip novo → FIM`;
      } else if (item.reason === 'rejected-cap') {
        why = `> ${MAX_SESSION_HRS}h cap`;
      }

      if (newIn) prevAcceptedMs = ms;

      md += `| ${i + 1} | ${brTime(t.transactionDate).slice(11, 16)} | ${prod} | ${fmtBR(val)} | ${nome}/\`${chip}\` | ${oldIn ? '✓' : '✗'} | ${newIn ? '✓' : '✗'} | ${why} |\n`;
    }

    md += `\n**Mesa ${mesa}:** antiga R$ ${fmtBR(oldR.cents)} | nova R$ ${fmtBR(newR.cents)} | Δ R$ ${fmtBR(newR.cents - oldR.cents)}\n\n`;
    totalOld += oldR.cents;
    totalNew += newR.cents;
  }

  md += `---\n\n## 📊 Totais\n\n`;
  md += `| Métrica | R$ |\n|---|---|\n`;
  md += `| **Regra antiga** (pivot+4h hard) | R$ ${fmtBR(totalOld)} |\n`;
  md += `| **Regra nova** (gap ${GAP_MIN}min + chip tracking) | **R$ ${fmtBR(totalNew)}** |\n`;
  md += `| Δ | ${totalNew >= totalOld ? '+' : ''}R$ ${fmtBR(totalNew - totalOld)} |\n`;
  md += `| DB hoje (\`zigBillingCents\`) | ${res.zigBillingCents != null ? 'R$ ' + fmtBR(res.zigBillingCents) : 'null'} |\n`;

  const outDir = resolve(__dirname, `../../out/audit-mesa-v2-gap${GAP_MIN}`);
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `${code}.md`);
  writeFileSync(file, md, 'utf8');
  console.log(`  📄 ${code} → ${file}`);
}

async function main() {
  console.log(`\n🔍 Audit v2 — ${dateArg} • gap_min=${GAP_MIN}\n`);

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
      id: true, reservationCode: true, fullName: true, cpf: true, people: true,
      reservationDate: true, checkedInAt: true, tables: true,
      zigBillingCents: true,
      areaRef: { select: { name: true } },
    },
    orderBy: { reservationDate: 'asc' },
  });

  console.log(`📋 ${reservas.length} reservas CHECKED_IN com mesa\n`);

  // Pega dias Manezin (dia + próximo, pra cauda cruzando meia-noite)
  const dates = new Set<string>();
  for (const r of reservas) {
    dates.add(r.reservationDate.toISOString().slice(0, 10));
    dates.add(new Date(r.reservationDate.getTime() + 24 * 3600_000).toISOString().slice(0, 10));
  }

  const txByMesa = new Map<string, Transacao[]>();
  for (const d of [...dates].sort()) {
    process.stdout.write(`  Manezin ${d}... `);
    const txs = await fetchManezinForDate(d);
    console.log(`${txs.length} tx AC`);
    for (const t of txs) {
      const mesa = parseMesa(t.obs);
      if (!mesa) continue;
      if (!txByMesa.has(mesa)) txByMesa.set(mesa, []);
      txByMesa.get(mesa)!.push(t);
    }
  }

  console.log(`\n📊 Sumário (${reservas.length} reservas):\n`);
  console.log(`code   | nome                   | reservaBR | mesas              | DB (R$) | regra antiga | regra nova | Δ`);
  console.log(`-------+------------------------+-----------+--------------------+---------+--------------+------------+--------`);

  let sumOld = 0, sumNew = 0, sumDB = 0, dbBugCount = 0;

  for (const r of reservas) {
    const tables = (r.tables || '').split(',').map(s => s.trim()).filter(Boolean);
    let totalOld = 0, totalNew = 0;
    for (const mesa of tables) {
      const all = txByMesa.get(mesa) || [];
      totalOld += applyOldRule(all, r.reservationDate.getTime()).cents;
      totalNew += applyNewRule(all, r.reservationDate.getTime()).cents;
    }
    const horaBR = new Date(r.reservationDate.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
    const code   = (r.reservationCode || r.id.slice(0, 6)).padEnd(6);
    const nome   = (r.fullName || '').slice(0, 22).padEnd(22);
    const mesas  = (r.tables || '').slice(0, 18).padEnd(18);
    const dbStr  = r.zigBillingCents != null ? fmtBR(r.zigBillingCents).padStart(7) : '   null';
    const oldStr = fmtBR(totalOld).padStart(12);
    const newStr = fmtBR(totalNew).padStart(10);
    const delta  = totalNew - totalOld;
    const dStr   = (delta >= 0 ? '+' : '') + fmtBR(delta);
    const isBug  = r.zigBillingCents != null && totalOld > 100 && r.zigBillingCents < totalOld * 0.5;
    const bugFlag= isBug ? ' 🚨' : '';
    console.log(`${code} | ${nome} | ${horaBR}     | ${mesas} | ${dbStr} | ${oldStr} | ${newStr} | ${dStr}${bugFlag}`);
    sumOld += totalOld;
    sumNew += totalNew;
    if (r.zigBillingCents != null) sumDB += r.zigBillingCents;
    if (isBug) dbBugCount++;
  }

  console.log(`-------+------------------------+-----------+--------------------+---------+--------------+------------+--------`);
  console.log(`Σ                                                                 | ${fmtBR(sumDB).padStart(7)} | ${fmtBR(sumOld).padStart(12)} | ${fmtBR(sumNew).padStart(10)} | ${(sumNew - sumOld >= 0 ? '+' : '') + fmtBR(sumNew - sumOld)}`);
  console.log(`\n🚨 = DB tem < 50% do que a regra antiga calcularia (provável bug do job batch). Count: ${dbBugCount}\n`);

  for (const code of detailCodes) {
    const r = reservas.find(x => x.reservationCode === code);
    if (!r) { console.warn(`  ⚠️  ${code} não encontrada`); continue; }
    const tables = (r.tables || '').split(',').map(s => s.trim()).filter(Boolean);
    await generateDetail(code, r, tables, txByMesa);
  }

  await prisma.$disconnect();
  console.log(`\n✨ Pronto.\n`);
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
