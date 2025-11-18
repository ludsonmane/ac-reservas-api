// api/src/infrastructure/http/routes/areas.upload.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

const router = Router();

/* ==========================
   Diretórios (alinhado c/ server.ts)
========================== */
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

const AREAS_DIR = path.join(UPLOADS_DIR, 'areas');
fs.mkdirSync(AREAS_DIR, { recursive: true });

/* ==========================
   Multer
========================== */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpeg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const areaId = String(req.params.id);
    const dir = path.join(UPLOADS_DIR, 'areas', areaId);
    try { fs.mkdirSync(dir, { recursive: true }); } catch { }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file?.mimetype);
  if (!ok) return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou GIF.'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* ==========================
   Helpers
========================== */
function getPublicBaseUrl(req: Request): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

/* ==========================
   POST /v1/areas/:id/photo  (STAFF|ADMIN)
   - grava path relativo no banco (ex.: /uploads/areas/<file>.jpeg)
   - responde também url absoluta
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
        return res.status(400).json({ error: { message: 'Arquivo não enviado (campo "file")' } });
      }

      const photoPath = `/uploads/areas/${file.filename}`;
      const photoUrlAbsolute = `${getPublicBaseUrl(req)}${photoPath}`;

      const updated = await prisma.area.update({
        where: { id },
        data: { photoUrl: photoPath }, // salva o RELATIVO
        select: { id: true, name: true, photoUrl: true },
      });

      return res.status(200).json({
        ok: true,
        ...updated,                 // photoUrl = relativo
        photoPath,                  // explícito
        photoUrlAbsolute,           // conveniência
        size: file.size,
        mime: file.mimetype,
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
