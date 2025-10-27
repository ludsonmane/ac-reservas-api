"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
// api/src/infrastructure/http/routes/users.routes.ts
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../db/prisma");
const requireAuth_1 = require("../middlewares/requireAuth");
exports.usersRouter = (0, express_1.Router)();
/* ------------------------- helpers/validations ------------------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
function isEmail(s) { return EMAIL_RE.test(String(s || '').trim()); }
function toDbRole(uiRole) {
    return uiRole === 'ADMIN' ? 'ADMIN' : 'STAFF';
}
function toUiRole(dbRole) {
    return dbRole === 'ADMIN' ? 'ADMIN' : 'CONCIERGE';
}
function sanitizeUser(u) {
    if (!u)
        return u;
    const { passwordHash, ...rest } = u;
    // converte role do banco para o rótulo do UI
    return { ...rest, role: toUiRole(rest.role) };
}
async function ensureNotLastAdmin(id) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        return;
    if (user.role !== 'ADMIN')
        return;
    const countAdmins = await prisma_1.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (countAdmins <= 1) {
        const e = new Error('Não é possível remover o último ADMIN.');
        e.status = 409;
        throw e;
    }
}
/* ---------------------------- LIST & READ ----------------------------- */
// GET /v1/users?search=&page=1&pageSize=20&active=all|true|false
exports.usersRouter.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const { search = '', page = '1', pageSize = '20', active = 'all' } = req.query;
    const take = Math.min(200, Math.max(1, Number(pageSize)));
    const skip = (Math.max(1, Number(page)) - 1) * take;
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: String(search), mode: 'insensitive' } },
            { email: { contains: String(search), mode: 'insensitive' } },
        ];
    }
    if (active !== 'all') {
        where.isActive = String(active) === 'true';
    }
    const [items, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where,
            skip, take,
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
        }),
        prisma_1.prisma.user.count({ where }),
    ]);
    // mapeia role para os rótulos do UI
    const mapped = items.map((u) => ({ ...u, role: toUiRole(u.role) }));
    res.json({ items: mapped, total, page: Number(page), pageSize: take, totalPages: Math.ceil(total / take) });
});
// GET /v1/users/:id
exports.usersRouter.get('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const u = await prisma_1.prisma.user.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    });
    if (!u)
        return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ...u, role: toUiRole(u.role) });
});
/* ------------------------------ CREATE ------------------------------- */
// POST /v1/users
// body: { name, email, role ('ADMIN'|'CONCIERGE'), password, isActive? }
exports.usersRouter.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const { name, email, role, password, isActive = true } = req.body || {};
    if (!String(name || '').trim())
        return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!isEmail(email))
        return res.status(400).json({ error: 'E-mail inválido' });
    if (!password || String(password).length < 6)
        return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    const uiRole = String(role).toUpperCase();
    if (!['ADMIN', 'CONCIERGE'].includes(uiRole))
        return res.status(400).json({ error: 'Role inválido' });
    try {
        const passwordHash = await bcryptjs_1.default.hash(String(password), 10);
        const created = await prisma_1.prisma.user.create({
            data: {
                name: String(name).trim(),
                email: String(email).toLowerCase().trim(),
                role: toDbRole(uiRole), // 👈 salva como enum do banco
                isActive: Boolean(isActive),
                passwordHash,
            },
        });
        res.status(201).json(sanitizeUser(created));
    }
    catch (e) {
        if (String(e?.code) === 'P2002') {
            return res.status(409).json({ error: 'E-mail já cadastrado' });
        }
        res.status(400).json({ error: 'Falha ao criar usuário', details: e?.message });
    }
});
/* ------------------------------ UPDATE ------------------------------- */
// PUT /v1/users/:id
// body: { name?, email?, role?('ADMIN'|'CONCIERGE'), isActive?, password? }
exports.usersRouter.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const id = String(req.params.id);
    const { name, email, role, isActive, password } = req.body || {};
    const data = {};
    if (typeof name !== 'undefined') {
        if (!String(name || '').trim())
            return res.status(400).json({ error: 'Nome é obrigatório' });
        data.name = String(name).trim();
    }
    if (typeof email !== 'undefined') {
        if (!isEmail(email))
            return res.status(400).json({ error: 'E-mail inválido' });
        data.email = String(email).toLowerCase().trim();
    }
    if (typeof role !== 'undefined') {
        const uiRole = String(role).toUpperCase();
        if (!['ADMIN', 'CONCIERGE'].includes(uiRole))
            return res.status(400).json({ error: 'Role inválido' });
        data.role = toDbRole(uiRole); // 👈 converte para enum do banco
    }
    if (typeof isActive === 'boolean') {
        data.isActive = isActive;
    }
    if (typeof password !== 'undefined') {
        if (!password || String(password).length < 6)
            return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
        data.passwordHash = await bcryptjs_1.default.hash(String(password), 10);
    }
    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }
    try {
        // impedir remover último ADMIN ao desativar/trocar role
        if (typeof isActive !== 'undefined' || typeof role !== 'undefined') {
            const user = await prisma_1.prisma.user.findUnique({ where: { id } });
            if (!user)
                return res.status(404).json({ error: 'Usuário não encontrado' });
            const nextRole = (typeof role !== 'undefined') ? toDbRole(String(role).toUpperCase()) : user.role;
            const nextActive = (typeof isActive !== 'undefined') ? !!isActive : user.isActive;
            const willNoLongerBeAdmin = (user.role === 'ADMIN') && (nextRole !== 'ADMIN' || nextActive === false);
            if (willNoLongerBeAdmin) {
                await ensureNotLastAdmin(id); // lança 409 se for o último admin
            }
        }
        const updated = await prisma_1.prisma.user.update({ where: { id }, data });
        res.json(sanitizeUser(updated));
    }
    catch (e) {
        if (e?.status === 409) {
            return res.status(409).json({ error: e.message || 'Não é possível remover o último ADMIN.' });
        }
        if (String(e?.code) === 'P2002')
            return res.status(409).json({ error: 'E-mail já cadastrado' });
        if (String(e?.code) === 'P2025')
            return res.status(404).json({ error: 'Usuário não encontrado' });
        res.status(400).json({ error: 'Falha ao atualizar usuário', details: e?.message });
    }
});
/* ------------------------------ DELETE ------------------------------- */
// DELETE /v1/users/:id
exports.usersRouter.delete('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['ADMIN']), async (req, res) => {
    const id = String(req.params.id);
    const meId = req.user?.id;
    if (meId && meId === id) {
        return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' });
    }
    try {
        await ensureNotLastAdmin(id);
        await prisma_1.prisma.user.delete({ where: { id } });
        res.sendStatus(204);
    }
    catch (e) {
        const status = e?.status || 400;
        res.status(status).json({ error: e?.message || 'Falha ao excluir usuário' });
    }
});
