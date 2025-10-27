// prisma/seed.ts
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

function slugify(s: string) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

async function seedAdmin() {
  const name = process.env.ADMIN_NAME || 'Admin Mané';
  const email = process.env.ADMIN_EMAIL || 'admin@mane.com.vc';
  const rawPassword = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
  const roleEnv = (process.env.ADMIN_ROLE || 'ADMIN').toUpperCase();
  const role = (['ADMIN', 'STAFF'].includes(roleEnv) ? roleEnv : 'ADMIN') as Role;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`ℹ️  Usuário já existe: ${email} (id=${existing.id}) — nada a fazer.`);
    return existing;
  }

  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, isActive: true },
  });

  console.log('✅ Admin criado com sucesso:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Nome: ${user.name}`);
  console.log(`   E-mail: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log('   (Guarde a senha definida em ADMIN_PASSWORD no .env)');
  return user;
}

type UnitSeed = { name: string; slug?: string; isActive?: boolean };

function parseUnitsFromEnv(): UnitSeed[] {
  // Opcional: defina UNITS_JSON no .env, ex:
  // UNITS_JSON=[{"name":"Mané Centro"},{"name":"Mané Asa Sul","slug":"asa-sul"}]
  const raw = process.env.UNITS_JSON?.trim();
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr
          .map((u: any) => ({
            name: String(u.name || '').trim(),
            slug: u.slug ? String(u.slug).trim() : undefined,
            isActive: typeof u.isActive === 'boolean' ? u.isActive : true,
          }))
          .filter(u => u.name.length > 1);
      }
    } catch (e) {
      console.warn('⚠️  UNITS_JSON inválido, usando defaults. Erro:', e);
    }
  }
  // Defaults simpáticos
  return [
    { name: 'Mané Centro' },
    { name: 'Mané Asa Sul' },
  ];
}

async function seedUnits() {
  const units = parseUnitsFromEnv();

  const createdOrUpdated: { id: string; name: string; slug: string }[] = [];
  for (const u of units) {
    const name = u.name.trim();
    const slug = (u.slug && u.slug.trim()) || slugify(name);
    const isActive = u.isActive ?? true;

    const unit = await prisma.unit.upsert({
      where: { slug },
      update: { name, isActive },
      create: { name, slug, isActive },
      select: { id: true, name: true, slug: true },
    });
    createdOrUpdated.push(unit);
  }

  console.log(`✅ Units semeadas/atualizadas: ${createdOrUpdated.map(u => `${u.name}(${u.slug})`).join(', ') || 'nenhuma'}`);
  return createdOrUpdated;
}

async function seedAreasForUnits(units: { id: string; name: string; slug: string }[]) {
  // Templates simples de áreas por unidade (ajuste à vontade)
  const templates = [
    { name: 'Salão',   afternoon: 30, night: 50 },
    { name: 'Varanda', afternoon: 20, night: 30 },
    { name: 'Mezanino', afternoon: 15, night: 25 },
  ];

  let created = 0;
  for (const u of units) {
    for (const t of templates) {
      const exists = await prisma.area.findFirst({
        where: { unitId: u.id, name: t.name },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.area.create({
        data: {
          unitId: u.id,
          name: t.name,
          isActive: true,
          capacityAfternoon: t.afternoon,
          capacityNight: t.night,
          // photoUrl: null (pode subir pelo admin depois)
        },
      });
      created++;
    }
  }
  console.log(`✅ Áreas semeadas: ${created}`);
}

async function backfillReservationUnitId() {
  // Busca reservas com unitId nulo mas com 'unit' (legado) preenchido
  const toFix = await prisma.reservation.findMany({
    where: { unitId: null, unit: { not: null } },
    select: { id: true, unit: true },
    take: 2000,
  });

  if (toFix.length === 0) {
    console.log('ℹ️  Nenhuma reserva precisa de backfill de unitId.');
    return;
  }

  let fixCount = 0;
  for (const r of toFix) {
    const name = (r.unit || '').trim();
    if (!name) continue;

    const u = await prisma.unit.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });

    if (u) {
      await prisma.reservation.update({
        where: { id: r.id },
        data: { unitId: u.id },
      });
      fixCount++;
    }
  }

  console.log(`✅ Backfill de unitId concluído: ${fixCount}/${toFix.length} reservas atualizadas.`);
}

async function main() {
  await seedAdmin();
  const units = await seedUnits();
  await seedAreasForUnits(units);
  await backfillReservationUnitId();
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
