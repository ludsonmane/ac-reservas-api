// api/src/infrastructure/http/routes/areas.upload.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

// Prisma (mesmo entry das outras rotas)
import { prisma } from '../../db/prisma';

// Auth guards
import { requireAuth, requireRole } from '../middlewares/requireAuth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer: any = require('multer');

export const areasUploadRouter = Router();

/* =========================================================
   Diretórios (alinhado com server.ts)
========================================================= */
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

const AREAS_DIR = path.join(UPLOADS_DIR, 'areas');
if (!fs.existsSync(AREAS_DIR)) fs.mkdirSync(AREAS_DIR, { recursive: true });

/* =========================================================
   Multer storage
========================================================= */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpeg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req: Request, _file: any, cb: any) => cb(null, AREAS_DIR),

  filename: (req: Request, file: any, cb: any) => {
    const rawId = String(req.params?.id || 'area');
    // só para garantir: id sem caracteres estranhos
    const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
    const ts = Date.now();

    const fromMime = EXT_BY_MIME[file?.mimetype] || '';
    const fromName = (path.extname(file?.originalname || '') || '').toLowerCase();
    const ext = (fromMime || fromName || '.jpeg').toLowerCase();

    cb(null, `${safeId}-${ts}${ext}`);
  },
});

function fileFilter(_req: Request, file: any, cb: any) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file?.mimetype);
  if (!ok) return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou GIF.'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* =========================================================
   Helpers
========================================================= */
function getPublicBaseUrl(req: Request): string {
  // Permite forçar domínio (ex.: https://api.mane.com.vc) em prod
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

/* =========================================================
   POST /v1/areas/:id/photo  (STAFF | ADMIN)
   - grava **caminho relativo** no banco (ex.: /uploads/areas/abc-123.jpeg)
   - responde também a URL absoluta para conveniência do caller
========================================================= */
areasUploadRouter.post(
  '/:id/photo',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const file = (req as any).file as { filename: string } | undefined;

      if (!file) {
        return res.status(400).json({ error: { message: 'Arquivo não enviado (campo "file")' } });
      }

      // Caminho relativo (começando com /) — casa com o static do server.ts
      const photoPath = `/uploads/areas/${file.filename}`;
      // URL absoluta só para resposta (útil em testes/upload via painel)
      const photoUrlAbs = `${getPublicBaseUrl(req)}${photoPath}`;

      // Atualiza área gravando o **relativo** (front normaliza com resolvePhotoUrl)
      const updated = await prisma.area.update({
        where: { id },
        data: { photoUrl: photoPath },
        select: { id: true, name: true, photoUrl: true },
      });

      return res.json({
        ok: true,
        ...updated,             // photoUrl aqui será o relativo salvo no banco
        photoPath,              // explícito
        photoUrlAbsolute: photoUrlAbs, // conveniência
      });
    } catch (e) {
      next(e);
    }
  }
);

export default areasUploadRouter;
