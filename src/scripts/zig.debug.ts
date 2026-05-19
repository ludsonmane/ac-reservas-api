/**
 * src/scripts/zig.debug.ts
 *
 * Diagnóstico: lista obs/bar_name distintos num dia de uma unidade no MySQL Zig Full.
 *
 * Uso:
 *   npx tsx src/scripts/zig.debug.ts --date=2026-05-18 --unit=mane-aguas-claras
 *   npx tsx src/scripts/zig.debug.ts --date=2026-05-18 --unit=mane-bsb --mesa=321
 */

import '../config/env';
import { getZigMysqlPool } from '../infrastructure/db/zig-mysql';
import { resolveLojaId } from '../services/zig.service';

type Row = {
  transaction_date: Date;
  product_name:     string;
  unit_value:       number;
  count:            number;
  discount_value:   number;
  obs:              string | null;
  bar_name:         string | null;
  bar_id:           string | null;
};

const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1] || new Date().toISOString().slice(0, 10);
const unitArg = args.find(a => a.startsWith('--unit='))?.split('=')[1] || 'mane-aguas-claras';
const mesaArg = args.find(a => a.startsWith('--mesa='))?.split('=')[1];

async function main() {
  const lojaId = resolveLojaId(unitArg);
  console.log(`\n🔍 Debug ZIG — data: ${dateArg}, unidade: ${unitArg}, lojaId: ${lojaId}`);
  if (mesaArg) console.log(`   Filtrando mesa: ${mesaArg}`);

  const pool = getZigMysqlPool();
  const [rows] = await pool.query<any[]>(
    `
    SELECT transaction_date, product_name, unit_value, \`count\`,
           discount_value, obs, bar_name, bar_id
    FROM zig_produtos
    WHERE loja_id = ? AND event_date = ?
    ORDER BY transaction_date ASC
    `,
    [lojaId, dateArg],
  );
  const txs = rows as Row[];

  console.log(`\n📦 Total no dia: ${txs.length}\n`);
  if (txs.length === 0) { await pool.end(); return; }

  const obsValues = new Set<string>();
  const barNameValues = new Set<string>();
  for (const tx of txs) {
    if (tx.obs) obsValues.add(tx.obs);
    if (tx.bar_name) barNameValues.add(tx.bar_name);
  }

  console.log(`📋 obs distintos (${obsValues.size}):`);
  for (const v of Array.from(obsValues).sort()) {
    const count = txs.filter((t: Row) => t.obs === v).length;
    console.log(`   "${v}" (${count} tx)`);
  }

  console.log(`\n📋 bar_name distintos (${barNameValues.size}):`);
  for (const v of Array.from(barNameValues).sort()) {
    const count = txs.filter((t: Row) => t.bar_name === v).length;
    console.log(`   "${v}" (${count} tx)`);
  }

  if (mesaArg) {
    console.log(`\n🔎 Transações que contêm "${mesaArg}" em obs:`);
    const matching = txs.filter((tx: Row) => tx.obs && tx.obs.includes(mesaArg));
    console.log(`   Encontradas: ${matching.length}`);
    for (const tx of matching.slice(0, 10)) {
      const val = (tx.unit_value * tx.count - (tx.discount_value ?? 0)) / 100;
      console.log(`   - ${tx.product_name} | R$${val.toFixed(2)} | obs="${tx.obs}" | ${tx.transaction_date.toISOString()}`);
    }
  }

  console.log(`\n📊 Amostra (primeiras 20):`);
  for (const tx of txs.slice(0, 20)) {
    const val = (tx.unit_value * tx.count - (tx.discount_value ?? 0)) / 100;
    console.log(`   ${tx.transaction_date.toISOString()} | ${tx.product_name.padEnd(30).slice(0,30)} | R$${val.toFixed(2).padStart(8)} | obs="${tx.obs || ''}" | bar_name="${tx.bar_name || ''}"`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
