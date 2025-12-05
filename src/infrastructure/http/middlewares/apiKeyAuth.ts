// src/infrastructure/http/middlewares/apiKeyAuth.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const HEADER_NAME = 'x-api-key';

function extractApiKey(req: Request): string | undefined {
  const header =
    (req.headers[HEADER_NAME] as string | undefined) ||
    (req.headers[HEADER_NAME.toLowerCase()] as string | undefined);

  if (header && typeof header === 'string') return header;

  const fromQuery = req.query.api_key;
  if (typeof fromQuery === 'string') return fromQuery;

  return undefined;
}

export const apiKeyAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.EXTERNAL_API_KEY;

  if (!expected) {
    // Config errada – melhor quebrar visível do que fingir que tá ok
    return res.status(500).json({
      error: 'EXTERNAL_API_KEY not configured on server',
    });
  }

  const received = extractApiKey(req);

  if (!received || received !== expected) {
    return res.status(401).json({
      error: 'Invalid or missing API key',
    });
  }

  return next();
};
