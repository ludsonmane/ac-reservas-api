"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const http_1 = __importDefault(require("http"));
const server_1 = require("./infrastructure/http/server");
const app = (0, server_1.buildServer)();
// Railway/Heroku/etc informam a porta via env.
// NÃO hardcode — use process.env.PORT e 0.0.0.0
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const server = http_1.default.createServer(app);
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
exports.default = server;
