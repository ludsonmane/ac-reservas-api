# MANE • Monorepo (API + WEB)

Este pacote traz dois apps separados:

- `api/` → Express + Mongoose (CRUD /reservas)
- `web/` → Next.js (frontend), consumindo a API via `NEXT_PUBLIC_API_BASE`

## Como rodar localmente

### 1) API
```bash
cd api
cp .env.example .env
# edite MONGODB_URI com usuário/senha do Atlas e deixe o DB em minúsculo (mane)
npm i
npm run dev
# sobe em http://localhost:8080
```

### 2) WEB
```bash
cd ../web
cp .env.local.example .env.local
# se a API estiver em outra URL, ajuste NEXT_PUBLIC_API_BASE
npm i
npm run dev
# abra http://localhost:3000
```

## Rotas úteis

- API:
  - `GET http://localhost:8080/reservas?limit=100&page=1`
  - `POST http://localhost:8080/reservas` (body JSON)
- WEB:
  - `http://localhost:3000/reservas` → lista do banco
  - `http://localhost:3000/reservar` → wizard de criação

## Exemplo de POST (curl)
```bash
curl -X POST http://localhost:8080/reservas \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Cliente Teste","cpf":"98765432100","people":4,"reservationDate":"2025-12-05T23:00:00.000Z","birthdayDate":"1990-07-15"}'
```
