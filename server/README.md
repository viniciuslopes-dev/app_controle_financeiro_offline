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

- `GET /users/me/backup`
  - Header: `Authorization: Bearer <token>`
  - Resposta 200: `{ "payload": { ... }, "savedAt": "ISO" }`
  - Erro `404 { reason: "backup-not-found" }` quando a conta ainda não possui backup

- `PUT /users/me/backup`
  - Header: `Authorization: Bearer <token>`
  - Body JSON: `{ "payload": { "version": "1.1", "transactions": [...], "categories": {...} } }`
  - Resposta 200: `{ "ok": true, "savedAt": "ISO" }`

- `GET /users/me/changes?since=<cursor-iso>`
  - Header: `Authorization: Bearer <token>`
  - Retorna somente alterações incrementais desde o cursor informado.
  - Resposta 200: `{ "cursor": "ISO", "changes": [{ "id", "updated_at", "deleted_at", "version", "etag", "device_id", "data" }] }`
  - `deleted_at` preenchido representa tombstone (remoção sincronizada entre aparelhos).

- `PUT /users/me/changes`
  - Header: `Authorization: Bearer <token>`
  - Body JSON:
    ```json
    {
      "device_id": "device-xyz",
      "changes": [
        {
          "id": "uuid",
          "updated_at": "ISO",
          "deleted_at": null,
          "version": 4,
          "base_version": 3,
          "etag": "W/\"uuid:4\"",
          "device_id": "device-xyz",
          "data": { "...lancamento" }
        }
      ]
    }
    ```
  - Resposta 200: `{ "ok": true, "applied": [...], "conflicts": [...], "cursor": "ISO" }`
  - Conflitos são resolvidos por versionamento otimista (base_version != versão atual do servidor).

## Configuração rápida

```bash
npm install
npm run auth:init -- usuario@exemplo.com senha-forte
npm start
```

Por padrão, o servidor sobe em `http://localhost:3000` e usa `server/auth.db`.
