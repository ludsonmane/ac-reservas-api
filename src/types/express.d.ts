// src/types/express.d.ts
import 'express';
import type { Role } from '../infrastructure/http/middlewares/requireAuth';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id?: string;
      role?: Role;
      email?: string;
      [k: string]: any;
    };
  }
}
