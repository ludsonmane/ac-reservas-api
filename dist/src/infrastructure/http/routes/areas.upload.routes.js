"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.areasUploadRouter = void 0;
// api/src/infrastructure/http/routes/areas.upload.routes.ts
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ⚠️ Mantém o mesmo entry do prisma usado nas outras rotas
const prisma_1 = require("../../db/prisma");
// Auth guards
const requireAuth_1 = require("../middlewares/requireAuth");
// ✅ Usamos require para evitar dependência de @types/multer no build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
exports.areasUploadRouter = (0, express_1.Router)();
// Destino: uploads/areas
const destDir = path_1.default.resolve(process.cwd(), 'uploads', 'areas');
if (!fs_1.default.existsSync(destDir))
    fs_1.default.mkdirSync(destDir, { recursive: true });
// Storage com nome único
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
        const id = String(req.params?.id || 'area');
        const ext = (path_1.default.extname(file?.originalname || '') || '.jpg').toLowerCase();
        const name = `${id}-${Date.now()}${ext}`;
        cb(null, name);
    },
});
// Filtro de tipos aceitos
function fileFilter(_req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file?.mimetype);
    if (!ok)
        return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou GIF.'));
    cb(null, true);
}
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
// POST /v1/areas/:id/photo  (STAFF | ADMIN)
exports.areasUploadRouter.post('/:id/photo', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), upload.single('file'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: { message: 'Arquivo não enviado (campo "file")' } });
        }
        // Monta URL pública (certifique-se de servir /uploads como estático no app)
        const publicBase = `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
        const relPath = `uploads/areas/${file.filename}`;
        const photoUrl = `${publicBase}/${relPath}`;
        const updated = await prisma_1.prisma.area.update({
            where: { id },
            data: { photoUrl },
            select: { id: true, name: true, photoUrl: true },
        });
        return res.json({ ok: true, ...updated });
    }
    catch (e) {
        next(e);
    }
});
exports.default = exports.areasUploadRouter;
