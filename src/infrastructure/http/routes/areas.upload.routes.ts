// api/src/infrastructure/http/routes/areas.upload.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

// ⚠️ Mantém o mesmo entry do prisma usado nas outras rotas
import { prisma } from '../../db/prisma';

// Auth guards
import { requireAuth, requireRole } from '../middlewares/requireAuth';

// ✅ Usamos require para evitar dependência de @types/multer no build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer: any = require('multer');

export const areasUploadRouter = Router();

// Destino: uploads/areas
const destDir = path.resolve(process.cwd(), 'uploads', 'areas');
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

// Storage com nome único
const storage = multer.diskStorage({
  destination: (_req: Request, _file: any, cb: any) => cb(null, destDir),
  filename: (req: Request, file: any, cb: any) => {
    const id = String(req.params?.id || 'area');
    const ext = (path.extname(file?.originalname || '') || '.jpg').toLowerCase();
    const name = `${id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

// Filtro de tipos aceitos
function fileFilter(_req: Request, file: any, cb: any) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file?.mimetype);
  if (!ok) return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou GIF.'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// POST /v1/areas/:id/photo  (STAFF | ADMIN)
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

      // Monta URL pública (certifique-se de servir /uploads como estático no app)
      const publicBase = `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
      const relPath = `uploads/areas/${file.filename}`;
      const photoUrl = `${publicBase}/${relPath}`;

      const updated = await prisma.area.update({
        where: { id },
        data: { photoUrl },
        select: { id: true, name: true, photoUrl: true },
      });

      return res.json({ ok: true, ...updated });
    } catch (e) {
      next(e);
    }
  }
);

export default areasUploadRouter;
