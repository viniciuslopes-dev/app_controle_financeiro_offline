# Serviço de autenticação

## Endpoints

- `POST /auth/login`
  - Body JSON: `{ "identifier": "usuario@dominio.com", "secret": "senha" }`
  - Resposta 200: `{ "identifier", "token", "expiresAt" }`
  - Erros:
    - `404 { reason: "account-not-found" }`
    - `401 { reason: "invalid-credentials" }`

- `GET /auth/session`
  - Header: `Authorization: Bearer <token>`
  - Resposta 200: `{ "identifier", "expiresAt" }`
  - Erro `401 { reason: "session-expired" }`

- `POST /auth/logout`
  - Stateless (retorna 204)

## Configuração rápida

```bash
npm install
npm run auth:init -- usuario@exemplo.com senha-forte
npm start
```

Por padrão, o servidor sobe em `http://localhost:3000` e usa `server/auth.db`.
