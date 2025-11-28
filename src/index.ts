import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());

// Whitelist de origens permitidas (pode usar .env)
const ALLOWED_ORIGINS = [
  'https://reservas.mane.com.vc',
  'https://mane.com.vc',
  'https://admin.mane.com.vc',
  'http://localhost:3000',
  'http://localhost:5173',   // sem "/" no final
  'http://127.0.0.1:4000',   // adiciona o esquema http://
];

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // requests sem Origin (ex.: curl, healthcheck) são liberados
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // bloqueia as demais
    return cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Client-Version',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: true,         // deixe true se usa cookie/sessão; false se só Bearer
  maxAge: 600,               // cache do preflight (10 min)
};

app.use(cors(corsOptions));
// importante: responder preflight antes das rotas
app.options('*', cors(corsOptions));

app.use(express.json());

// ... suas rotas
// app.use('/v1', routes);

export default app;
