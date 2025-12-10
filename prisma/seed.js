"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// prisma/seed.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const argon2_1 = __importDefault(require("argon2"));
const prisma = new client_1.PrismaClient();
function slugify(s) {
    return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}
async function seedAdmin() {
    const name = process.env.ADMIN_NAME || 'Admin Mané';
    const email = process.env.ADMIN_EMAIL || 'admin@mane.com.vc';
    const rawPassword = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
    const roleEnv = (process.env.ADMIN_ROLE || 'ADMIN').toUpperCase();
    const role = (['ADMIN', 'STAFF'].includes(roleEnv) ? roleEnv : 'ADMIN');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`ℹ️  Usuário já existe: ${email} (id=${existing.id}) — nada a fazer.`);
        return existing;
    }
    const passwordHash = await argon2_1.default.hash(rawPassword, {
        type: argon2_1.default.argon2id,
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
function parseUnitsFromEnv() {
    const raw = process.env.UNITS_JSON?.trim();
    if (raw) {
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return arr
                    .map((u) => ({
                    name: String(u?.name || '').trim(),
                    slug: u?.slug ? String(u.slug).trim() : undefined,
                    isActive: typeof u?.isActive === 'boolean' ? u.isActive : true,
                }))
                    .filter((u) => u.name.length > 1);
            }
        }
        catch (e) {
            console.warn('⚠️  UNITS_JSON inválido, usando defaults. Erro:', e);
        }
    }
    return [
        { name: 'Mané Centro' },
        { name: 'Mané Asa Sul' },
    ];
}
async function seedUnits() {
    const units = parseUnitsFromEnv();
    const createdOrUpdated = [];
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
async function seedAreasForUnits(units) {
    const templates = [
        { name: 'Salão', afternoon: 30, night: 50 },
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
            if (exists)
                continue;
            await prisma.area.create({
                data: {
                    unitId: u.id,
                    name: t.name,
                    isActive: true,
                    capacityAfternoon: t.afternoon,
                    capacityNight: t.night,
                },
            });
            created++;
        }
    }
    console.log(`✅ Áreas semeadas: ${created}`);
}
/**
 * Backfill de unitId em reservas legadas que só têm o nome da unidade em `unit`.
 * Evita `undefined` e evita `mode` em slug (fazemos resolução em JS quando necessário).
 */
async function backfillReservationUnitId() {
    const toFix = await prisma.reservation.findMany({
        where: { unitId: null, unit: { not: null } },
        select: { id: true, unit: true },
        take: 2000,
    });
    if (toFix.length === 0) {
        console.log('ℹ️  Nenhuma reserva precisa de backfill de unitId.');
        return;
    }
    // cache simples das unidades para comparação JS (case-insensitive)
    const allUnits = await prisma.unit.findMany({
        select: { id: true, name: true, slug: true },
    });
    const bySlug = new Map(allUnits.map((u) => [u.slug.toLowerCase(), u]));
    const byName = new Map(allUnits.map((u) => [u.name.toLowerCase(), u]));
    let fixCount = 0;
    for (const r of toFix) {
        const rawName = (r.unit || '').trim();
        if (!rawName)
            continue;
        // 1) tenta slug direto
        const guessSlug = slugify(rawName);
        let u = bySlug.get(guessSlug) ??
            null;
        // 2) tenta nome exato (case-insensitive)
        if (!u) {
            u = byName.get(rawName.toLowerCase()) ?? null;
        }
        // 3) tenta "contains" em JS
        if (!u) {
            const lowered = rawName.toLowerCase();
            u =
                allUnits.find((x) => x.name.toLowerCase().includes(lowered)) ??
                    null;
        }
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
