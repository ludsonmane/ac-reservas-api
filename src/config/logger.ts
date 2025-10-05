// api/src/config/logger.ts
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  // Evita vazar credenciais em logs
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'config.database.password',
      'DATABASE_URL',
      'env.DATABASE_URL'
    ],
    censor: '***'
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' }
      }
});
