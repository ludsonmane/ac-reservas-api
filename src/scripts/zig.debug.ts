/**
 * src/scripts/zig.debug.ts
 *
 * Diagnóstico: busca transações ZIG de um dia e mostra os campos obs/barName
 * para entender como a ZIG identifica as mesas.
 *
 * Uso:
 *   npx tsx src/scripts/zig.debug.ts --date=2026-03-26 --unit=mane-aguas-claras
 *   npx tsx src/scripts/zig.debug.ts --date=2026-03-26 --unit=mane-west-plaza-sp
 *   npx tsx src/scripts/zig.debug.ts --date=2026-03-26 --unit=mane-bsb --mesa=321
 */

import '../config/env';
import { fetchSaidaProdutos, resolveLojaId } from '../services/zig.service';

const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1] || new Date().toISOString().slice(0, 10);
const unitArg = args.find(a => a.startsWith('--unit='))?.split('=')[1] || 'mane-aguas-claras';
const mesaArg = args.find(a => a.startsWith('--mesa='))?.split('=')[1];

async function main() {
  const lojaId = resolveLojaId(unitArg);
  console.log(`\n🔍 Debug ZIG — data: ${dateArg}, unidade: ${unitArg}, lojaId: ${lojaId}`);
  if (mesaArg) console.log(`   Filtrando mesa: ${mesaArg}`);

  const txs = await fetchSaidaProdutos(dateArg, dateArg, lojaId);
  console.log(`\n📦 Total de transações no dia: ${txs.length}\n`);

  if (txs.length === 0) {
    console.log('Nenhuma transação encontrada.');
    return;
  }

  // Coleta valores únicos de obs e barName
  const obsValues = new Set<string>();
  const barNameValues = new Set<string>();

  for (const tx of txs) {
    if (tx.obs) obsValues.add(tx.obs);
    if (tx.barName) barNameValues.add(tx.barName);
  }

  console.log(`📋 Valores únicos de "obs" (${obsValues.size}):`);
  for (const v of Array.from(obsValues).sort()) {
    const count = txs.filter(t => t.obs === v).length;
    console.log(`   "${v}" (${count} tx)`);
  }

  console.log(`\n📋 Valores únicos de "barName" (${barNameValues.size}):`);
  for (const v of Array.from(barNameValues).sort()) {
    const count = txs.filter(t => t.barName === v).length;
    console.log(`   "${v}" (${count} tx)`);
  }

  // Se mesa foi especificada, mostra as transações que deveriam bater
  if (mesaArg) {
    console.log(`\n🔎 Transações que contêm "${mesaArg}" em obs ou barName:`);
    const matching = txs.filter(tx =>
      (tx.obs && tx.obs.includes(mesaArg)) ||
      (tx.barName && tx.barName.includes(mesaArg))
    );
    console.log(`   Encontradas: ${matching.length}`);
    for (const tx of matching.slice(0, 10)) {
      const val = (tx.unitValue * tx.count - (tx.discountValue ?? 0)) / 100;
      console.log(`   - ${tx.productName} | R$${val.toFixed(2)} | obs="${tx.obs}" | barName="${tx.barName}" | ${tx.transactionDate}`);
    }
  }

  // Amostra das primeiras 20 transações com todos os campos relevantes
  console.log(`\n📊 Amostra (primeiras 20 transações):`);
  for (const tx of txs.slice(0, 20)) {
    const val = (tx.unitValue * tx.count - (tx.discountValue ?? 0)) / 100;
    console.log(`   ${tx.transactionDate} | ${tx.productName.padEnd(30).slice(0,30)} | R$${val.toFixed(2).padStart(8)} | obs="${tx.obs || ''}" | barName="${tx.barName || ''}" | barId="${tx.barId || ''}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
