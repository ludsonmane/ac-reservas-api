# Mané API — Clean/Hexagonal

## Requisitos
- Node 20 (LTS)
- MySQL/MariaDB (Railway) — `DATABASE_URL`/`DIRECT_URL`

## Setup local
```bash
cp .env.example .env
# edite .env com sua URL mysql:// do Railway
npm install
npx prisma migrate dev --name init_mysql
npm run dev
# http://localhost:3001/health
# http://localhost:3001/docs
```

## Build/Produção
```bash
npm run build
npm start
```

## Endpoints
- `GET /health`
- `GET /v1/reservations`
- `POST /v1/reservations`
- `GET /v1/reservations/:id`
- `PUT /v1/reservations/:id`
- `DELETE /v1/reservations/:id`

## Observabilidade/Security
- Helmet, CORS, Rate Limit
- Logs com Pino (pino-http)
