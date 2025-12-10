// api/src/infrastructure/http/routes/areas.upload.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import multer from 'multer';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

// S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as mime from 'mime-types';

const router = Router();

/* ==========================
   Configurações de S3
========================== */
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1', // ← default corrigido
  // Em Railway, o SDK lê AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY das envs
});

const S3_BUCKET = process.env.S3_BUCKET!;
const PUBLIC_BASE = (process.env.S3_PUBLIC_URL_BASE || '').replace(/\/+$/, '');

if (!S3_BUCKET) {
  // eslint-disable-next-line no-console
  console.error('[upload:s3] Variável S3_BUCKET ausente!');
}

/* ==========================
   Multer (buffer em memória)
========================== */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpeg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.memoryStorage(), // recebemos em memória e subimos direto pro S3
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
function sanitizeName(original: string) {
  const base = path.basename(original);
  return base.normalize().replace(/[^\w.\-]+/g, '_');
}

function buildS3Key(areaId: string, original: string, mimetype?: string) {
  const safe = sanitizeName(original);
  const extFromMime = mimetype && EXT_BY_MIME[mimetype] ? EXT_BY_MIME[mimetype] : '';
  const hasExt = /\.[a-z0-9]{2,8}$/i.test(safe);
  const finalName = hasExt ? safe : `${safe}${extFromMime || ''}`;
  return `uploads/areas/${areaId}/${Date.now()}-${finalName}`;
}

function absoluteUrlForKey(key: string, req: Request): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`; // S3 direto ou CDN
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/${key}`;
}

/* ==========================
   POST /v1/areas/:id/photo  (STAFF|ADMIN)
========================== */
router.post(
  '/:id/photo',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: { message: 'Arquivo não enviado (campo "file")' } });
      }

      const key = buildS3Key(id, file.originalname, file.mimetype);
      const contentType =
        file.mimetype || (mime.lookup(file.originalname) as string) || 'application/octet-stream';

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: contentType
        })
      );

      const photoUrl = `/${key}`; // relativo (compatível com o resto do app)
      const photoUrlAbsolute = absoluteUrlForKey(key, req);

      const updated = await prisma.area.update({
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
    } catch (e) {
      next(e);
    }
  }
);

export default router;
