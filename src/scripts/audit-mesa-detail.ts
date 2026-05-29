/**
 * src/scripts/audit-mesa-detail.ts
 *
 * Audit detalhado pra reservas específicas. Read-only.
 *
 * Pra cada reservationCode:
 *   1. Lê do DB: reservationDate, tables, cpf, fullName, checkedInAt
 *   2. Puxa Manezin /transacoes do dia (AC apenas)
 *   3. Pra cada mesa: acha pivot (1ª venda após reservationDate), marca dentro/fora da janela 4h
 *   4. Agrupa por chipNfc/cpf — detecta "mesmo cliente passou da janela" vs walk-in
 *   5. Sai um markdown em out/audit-mesa/<code>.md
 *
 * Uso:
 *   DATABASE_URL=mysql://... npx tsx src/scripts/audit-mesa-detail.ts --codes=9WUFAP,R3FN2U,HP8T5E
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

const MANEZIN_BASE  = 'https://manezin.com.br/api/externo';
const MANEZIN_TOKEN = process.env.MANEZIN_TOKEN || 'mane_ludson_2026_x7K9pLmN3qR5sT8w';
const AC_EVENT_NAME = 'MANÉ MERCADO - ÁGUAS CLARAS';
const WINDOW_HOURS  = 4;
const MAX_LATE_HRS  = 8;   // mesma const do zig.service.ts: até pivot pode ser reservationDate + 8h

interface Transacao {
  id: number;
  transactionId: string;
  transactionDate: string;
  unitValue: number;
  count: number;
  discountValue: number | null;
  productName: string;
  obs: string | null;
  isRefunded: boolean;
  eventName: string;
  barName: string | null;
  compr_userDocument: string | null;
  compr_userName: string | null;
  compr_chipNfc: string | null;
}

const args     = process.argv.slice(2);
const codesArg = args.find(a => a.startsWith('--codes='))?.split('=')[1];
if (!codesArg) { console.error('❌ Falta --codes=A,B,C'); process.exit(1); }
const codes = codesArg.split(',').map(c => c.trim()).filter(Boolean);

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
  const body = await res.json() as { data: Transacao[]; total: number };
  return body.data.filter(t => t.eventName === AC_EVENT_NAME);
}

async function audit(code: string, txByMesa: Map<string, Transacao[]>): Promise<string | null> {
  const r = await prisma.reservation.findFirst({
    where: { reservationCode: code },
    select: {
      id: true, reservationCode: true, fullName: true, cpf: true,
      reservationDate: true, checkedInAt: true, tables: true, people: true,
      zigBillingCents: true,
      areaRef: { select: { name: true } },
    },
  });
  if (!r) { console.warn(`  ⚠️  ${code} não encontrada`); return null; }

  const tables    = (r.tables || '').split(',').map(s => s.trim()).filter(Boolean);
  const reservaMs = r.reservationDate.getTime();
  const upperMs   = reservaMs + (MAX_LATE_HRS + WINDOW_HOURS) * 3600_000;

  let md = `# Audit ${r.reservationCode} — ${r.fullName}\n\n`;
  md += `- **Área:** ${r.areaRef?.name || '—'}\n`;
  md += `- **Reserva:** ${brTime(r.reservationDate)} BR\n`;
  md += `- **Checkin:** ${r.checkedInAt ? brTime(r.checkedInAt) + ' BR' : '—'}\n`;
  md += `- **Pax:** ${r.people}\n`;
  md += `- **CPF titular:** ${r.cpf || '—'}\n`;
  md += `- **Mesas:** ${tables.join(', ')}\n`;
  md += `- **zigBillingCents (salvo no DB):** ${r.zigBillingCents != null ? 'R$ ' + fmtBR(r.zigBillingCents) : 'null'}\n`;
  md += `- **Janela máxima de busca:** ${brTime(r.reservationDate)} → +${MAX_LATE_HRS + WINDOW_HOURS}h\n\n`;

  let grandIn = 0, grandOut = 0, grandSameCustomerOut = 0;

  for (const mesa of tables) {
    const all = (txByMesa.get(mesa) || [])
      .filter(t => {
        const ms = new Date(t.transactionDate).getTime();
        return ms >= reservaMs && ms <= upperMs;
      })
      .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

    md += `## Mesa ${mesa}\n\n`;
    if (all.length === 0) {
      md += `_Sem vendas casadas após reservationDate dentro da janela máxima._\n\n`;
      continue;
    }

    const pivot     = new Date(all[0].transactionDate).getTime();
    const windowEnd = pivot + WINDOW_HOURS * 3600_000;
    const lagMin    = Math.round((pivot - reservaMs) / 60_000);

    md += `- **Pivot (1ª venda após reserva):** ${brTime(new Date(pivot).toISOString())} BR  _(${lagMin}min após reserva)_\n`;
    md += `- **Cutoff (pivot + 4h):** ${brTime(new Date(windowEnd).toISOString())} BR\n\n`;

    md += `| # | Hora BR | Produto | R$ | Cliente / Chip | Janela |\n`;
    md += `|---|---------|---------|----|----------------|--------|\n`;

    let mesaIn = 0, mesaOut = 0;
    all.forEach((t, i) => {
      const ms       = new Date(t.transactionDate).getTime();
      const inWindow = ms <= windowEnd;
      const val      = t.unitValue * t.count - (t.discountValue ?? 0);
      if (inWindow) mesaIn += val; else mesaOut += val;
      const chip = t.compr_chipNfc || '—';
      const refund = t.isRefunded ? ' ↩️REF' : '';
      const prod = (t.productName || '').slice(0, 28);
      const nome = (t.compr_userName || '—').slice(0, 16);
      const chipTail = chip === '—' ? '—' : chip.slice(-6);
      md += `| ${i + 1} | ${brTime(t.transactionDate).slice(11, 16)} | ${prod} | ${fmtBR(val)} | ${nome} / \`${chipTail}\` | ${inWindow ? '✓ IN' : '✗ OUT'} |\n`;
    });

    md += `\n**Totais mesa ${mesa}:**\n`;
    md += `- DENTRO 4h: **R$ ${fmtBR(mesaIn)}** (${all.filter(t => new Date(t.transactionDate).getTime() <= windowEnd).length} tx)\n`;
    md += `- FORA 4h: **R$ ${fmtBR(mesaOut)}** (${all.filter(t => new Date(t.transactionDate).getTime() > windowEnd).length} tx)\n\n`;

    // Análise por chipNfc — "mesmo cliente continuou?"
    const chipsIn  = new Set<string>();
    const chipsOut = new Set<string>();
    for (const t of all) {
      const chip = t.compr_chipNfc;
      if (!chip) continue;
      const ms = new Date(t.transactionDate).getTime();
      if (ms <= windowEnd) chipsIn.add(chip); else chipsOut.add(chip);
    }
    const continuedSame = [...chipsOut].filter(c => chipsIn.has(c));
    const newAfter      = [...chipsOut].filter(c => !chipsIn.has(c));

    let sameCustomerOutValue = 0;
    if (continuedSame.length > 0) {
      sameCustomerOutValue = all
        .filter(t => t.compr_chipNfc && continuedSame.includes(t.compr_chipNfc))
        .filter(t => new Date(t.transactionDate).getTime() > windowEnd)
        .reduce((acc, t) => acc + t.unitValue * t.count - (t.discountValue ?? 0), 0);
    }

    md += `**Análise pelo chipNfc:**\n`;
    md += `- Chips distintos DENTRO da janela: **${chipsIn.size}**\n`;
    md += `- Chips DEPOIS da janela: **${chipsOut.size}**\n`;
    md += `- ↳ Já estavam dentro (mesmo cliente continuou): **${continuedSame.length}** → R$ ${fmtBR(sameCustomerOutValue)} excluídos pela regra atual\n`;
    md += `- ↳ Novos (provavelmente walk-in / próximo cliente): **${newAfter.length}**\n\n`;

    grandIn              += mesaIn;
    grandOut             += mesaOut;
    grandSameCustomerOut += sameCustomerOutValue;
  }

  md += `---\n\n## 📊 Totais (todas as mesas)\n\n`;
  md += `| Métrica | R$ |\n|---|---|\n`;
  md += `| Regra atual (DENTRO 4h) | **R$ ${fmtBR(grandIn)}** |\n`;
  md += `| Excluído pela regra (FORA 4h) | R$ ${fmtBR(grandOut)} |\n`;
  md += `| ↳ Excluído sendo do mesmo chip (continuação real do cliente) | **R$ ${fmtBR(grandSameCustomerOut)}** |\n`;
  md += `| Total bruto da(s) mesa(s) na janela máxima | R$ ${fmtBR(grandIn + grandOut)} |\n`;
  md += `\n`;
  md += `**Comparação com o banco:** zigBillingCents = ${r.zigBillingCents != null ? 'R$ ' + fmtBR(r.zigBillingCents) : 'null'} • esta auditoria: R$ ${fmtBR(grandIn)}\n`;

  const outDir = resolve(__dirname, '../../out/audit-mesa');
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `${code}.md`);
  writeFileSync(file, md, 'utf8');
  console.log(`  ✅ ${code} → ${file}`);
  console.log(`     IN: R$ ${fmtBR(grandIn)} | OUT: R$ ${fmtBR(grandOut)} | OUT-mesmo-chip: R$ ${fmtBR(grandSameCustomerOut)}`);
  return file;
}

async function main() {
  console.log(`\n🔍 Audit detalhado — ${codes.length} reservas: ${codes.join(', ')}\n`);

  const reservas = await prisma.reservation.findMany({
    where: { reservationCode: { in: codes } },
    select: { reservationCode: true, reservationDate: true },
  });
  if (reservas.length === 0) { console.error('Nenhuma reserva achada.'); process.exit(1); }

  // Pra cada reserva, precisa do dia da reservaDate em UTC E do dia seguinte
  // (pra capturar cauda que cruza meia-noite UTC).
  const dates = new Set<string>();
  for (const r of reservas) {
    dates.add(r.reservationDate.toISOString().slice(0, 10));
    const next = new Date(r.reservationDate.getTime() + 24 * 3600_000);
    dates.add(next.toISOString().slice(0, 10));
  }

  console.log(`📅 Dias Manezin a buscar: ${[...dates].sort().join(', ')}`);

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

  console.log(`🍽️  ${txByMesa.size} mesas distintas com vendas casadas\n`);

  for (const code of codes) {
    await audit(code, txByMesa);
  }

  await prisma.$disconnect();
  console.log(`\n✨ Pronto. Veja os relatórios em out/audit-mesa/\n`);
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
