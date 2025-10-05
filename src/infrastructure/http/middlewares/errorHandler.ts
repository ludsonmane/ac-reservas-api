// api/src/infrastructure/http/middlewares/errorHandler.ts
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../../config/logger';

type HttpError = Error & { status?: number; code?: string; details?: unknown };

function fromZod(err: ZodError) {
  return {
    message: 'Validation error',
    issues: err.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code
    }))
  };
}

export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction) {
  // Zod
  if (err instanceof ZodError) {
    logger.warn({ err }, 'zod validation error');
    return res.status(400).json(fromZod(err));
  }

  const status = typeof err.status === 'number' ? err.status : 500;
  const payload = {
    message: err.message || 'Internal Server Error',
    code: err.code,
    details: err.details && process.env.NODE_ENV !== 'production' ? err.details : undefined
  };

  if (status >= 500) {
    logger.error({ err }, 'unhandled error');
  } else {
    logger.warn({ err }, 'handled error');
  }

  return res.status(status).json(payload);
}
