"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// api/src/infrastructure/http/routes/areas.upload.routes.ts
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../../db/prisma");
const requireAuth_1 = require("../middlewares/requireAuth");
// S3
const client_s3_1 = require("@aws-sdk/client-s3");
const mime = __importStar(require("mime-types"));
const router = (0, express_1.Router)();
/* ==========================
   Configurações de S3
========================== */
const s3 = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1', // ← default corrigido
    // Em Railway, o SDK lê AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY das envs
});
const S3_BUCKET = process.env.S3_BUCKET;
const PUBLIC_BASE = (process.env.S3_PUBLIC_URL_BASE || '').replace(/\/+$/, '');
if (!S3_BUCKET) {
    // eslint-disable-next-line no-console
    console.error('[upload:s3] Variável S3_BUCKET ausente!');
}
/* ==========================
   Multer (buffer em memória)
========================== */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT_BY_MIME = {
    'image/jpeg': '.jpeg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(), // recebemos em memória e subimos direto pro S3
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter(_req, file, cb) {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou GIF.'));
        }
        cb(null, true);
    },
});
/* ==========================
   Helpers
========================== */
function sanitizeName(original) {
    const base = path_1.default.basename(original);
    return base.normalize().replace(/[^\w.\-]+/g, '_');
}
function buildS3Key(areaId, original, mimetype) {
    const safe = sanitizeName(original);
    const extFromMime = mimetype && EXT_BY_MIME[mimetype] ? EXT_BY_MIME[mimetype] : '';
    const hasExt = /\.[a-z0-9]{2,8}$/i.test(safe);
    const finalName = hasExt ? safe : `${safe}${extFromMime || ''}`;
    return `uploads/areas/${areaId}/${Date.now()}-${finalName}`;
}
function absoluteUrlForKey(key, req) {
    if (PUBLIC_BASE)
        return `${PUBLIC_BASE}/${key}`; // S3 direto ou CDN
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    return `${proto}://${host}/${key}`;
}
/* ==========================
   POST /v1/areas/:id/photo  (STAFF|ADMIN)
========================== */
router.post('/:id/photo', requireAuth_1.requireAuth, (0, requireAuth_1.requireRole)(['STAFF', 'ADMIN']), upload.single('file'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ ok: false, error: { message: 'Arquivo não enviado (campo "file")' } });
        }
        const key = buildS3Key(id, file.originalname, file.mimetype);
        const contentType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: contentType,
            // Se bucket for privado/CloudFront, REMOVA a ACL abaixo.
            ACL: 'public-read',
        }));
        const photoUrl = `/${key}`; // relativo (compatível com o resto do app)
        const photoUrlAbsolute = absoluteUrlForKey(key, req);
        const updated = await prisma_1.prisma.area.update({
            where: { id },
            data: { photoUrl },
            select: { id: true, name: true, photoUrl: true },
        });
        return res.status(200).json({
            ok: true,
            ...updated,
            photoUrl,
            photoUrlAbsolute,
            storage: 's3',
            bucket: S3_BUCKET,
            key,
            size: file.size,
            mime: file.mimetype,
        });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
