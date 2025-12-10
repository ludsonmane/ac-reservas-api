// src/index.ts
import http from 'http';
import { buildServer } from './infrastructure/http/server';

const app = buildServer();

// Railway/Heroku/etc informam a porta via env.
// NÃO hardcode — use process.env.PORT e 0.0.0.0
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});

// opcional: lidar com sinais para shutdown gracioso
process.on('SIGTERM', () => {
  console.log('[api] SIGTERM received, closing server…');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[api] SIGINT received, closing server…');
  server.close(() => process.exit(0));
});

export default server;
