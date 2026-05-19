// api/src/infrastructure/db/zig-mysql.ts
//
// Pool de conexão para o MySQL "Zig Mané DB FULL" (Railway).
// Em prod usa o host interno (mysql-b648.railway.internal); em dev, o proxy externo.
// A URL é resolvida a partir de ZIG_MYSQL_URL (formato: mysql://user:pass@host:port/db).

import mysql, { Pool } from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var __ZIG_MYSQL_POOL__: Pool | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

function createPool(): Pool {
  const url = process.env.ZIG_MYSQL_URL;
  if (!url) {
    throw new Error('[zig-mysql] ZIG_MYSQL_URL não configurada');
  }
  return mysql.createPool({
    uri:               url,
    connectionLimit:   5,
    waitForConnections: true,
    enableKeepAlive:   true,
    keepAliveInitialDelay: 10_000,
    timezone:          'Z',
  });
}

export function getZigMysqlPool(): Pool {
  if (isProd) {
    return (global.__ZIG_MYSQL_POOL__ ??= createPool());
  }
  // Em dev cacheia no global para sobreviver a hot-reloads do ts-node-dev
  if (!global.__ZIG_MYSQL_POOL__) global.__ZIG_MYSQL_POOL__ = createPool();
  return global.__ZIG_MYSQL_POOL__;
}
