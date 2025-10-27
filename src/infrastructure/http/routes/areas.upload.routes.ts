// api/src/infrastructure/http/routes/areas.upload.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../db/client'; // <- ajuste do path
import { requireAuth, requireRole } from '../middlewares/requireAuth';

export const areasUploadRouter = Router();

// pasta destino: uploads/areas
const destDir = path.resolve(process.cwd(), 'uploads', 'areas');
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

// storage com nome único
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destDir),
  filename: (req, file, cb) => {
    // pega id da rota /:id/photo
    const id = String((req as Request).params?.id || 'area');
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
    const name = `${id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
  if (!ok) return cb(new Error('Formato de imagem inválido. Use JPG, PNG, WEBP ou GIF.'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// POST /v1/areas/:id/photo (STAFF ou ADMIN)
areasUploadRouter.post(
  '/:id/photo',
  requireAuth,
  requireRole(['STAFF', 'ADMIN']),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: { message: 'Arquivo não enviado (campo: file)' } });
      }

      // monta URL pública (server já serve /uploads como estático)
      const publicBase = `${req.protocol}://${req.get('host')}`;
      const relPath = `uploads/areas/${req.file.filename}`;
      const photoUrl = `${publicBase}/${relPath}`;

      // atualiza área
      const updated = await prisma.area.update({
        where: { id },
        data: { photoUrl },
        select: { id: true, name: true, photoUrl: true },
      });

      res.json({ ok: true, ...updated });
    } catch (e) {
      next(e);
    }
  }
);

export default areasUploadRouter;
