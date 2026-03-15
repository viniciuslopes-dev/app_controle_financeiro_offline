# Serviço de autenticação

## Segurança implementada

- Hash de senha com **bcrypt + salt** (`bcryptjs`, custo configurável em `BCRYPT_ROUNDS`).
- **Rate limiting** por fingerprint (`ip + identifier`) para login.
- **Bloqueio progressivo** por usuário após falhas de autenticação.
- **HTTPS obrigatório** por padrão (exceto localhost, se `ALLOW_INSECURE_LOCALHOST=true`).
- Access token JWT de curta duração + **refresh token rotativo** salvo em cookie **HttpOnly**.
- Trilha mínima de auditoria em `audit_logs` para login/sessão/sincronização.

## Endpoints

- `POST /auth/login`
  - Body JSON: `{ "identifier": "usuario@dominio.com", "secret": "senha" }`
  - Resposta 200: `{ "identifier", "token", "expiresAt" }`
  - Define cookie HttpOnly com refresh token.
  - Erros comuns:
    - `404 { reason: "account-not-found" }`
    - `401 { reason: "invalid-credentials" }`
    - `423 { reason: "account-locked" }`
    - `429 { reason: "too-many-attempts" }`

- `POST /auth/refresh`
  - Usa refresh token do cookie HttpOnly.
  - Rotaciona refresh token e retorna novo access token.
  - Resposta 200: `{ "identifier", "token", "expiresAt" }`

- `GET /auth/session`
  - Header: `Authorization: Bearer <token>`
  - Resposta 200: `{ "identifier", "expiresAt" }`
  - Erro `401 { reason: "session-expired" }`

- `POST /auth/logout`
  - Revoga refresh token atual e limpa cookie.

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

- `PUT /users/me/changes`
  - Header: `Authorization: Bearer <token>`
  - Body JSON com lote de alterações para sincronização.
  - Resposta 200: `{ "ok": true, "applied": [...], "conflicts": [...], "cursor": "ISO" }`

## Configuração rápida

```bash
npm install
npm run auth:init -- usuario@exemplo.com senha-forte
npm start
```

## Variáveis de ambiente (principais)

- `JWT_SECRET`
- `JWT_TTL_SECONDS` (default: 900 = 15 min)
- `REFRESH_TOKEN_TTL_SECONDS` (default: 7 dias)
- `CORS_ALLOWED_ORIGINS` (lista separada por vírgula com origens permitidas, ex.: `https://app.seudominio.com,https://admin.seudominio.com`)
- `REQUIRE_HTTPS` (default: `true`)
- `ALLOW_INSECURE_LOCALHOST` (default: `true`)
- `REFRESH_COOKIE_DOMAIN` (opcional, ex.: `.seudominio.com`)
- `REFRESH_COOKIE_SAME_SITE` (`strict`, `lax` ou `none`; default: `lax`)
- `LOGIN_RATE_WINDOW_SECONDS`
- `LOGIN_RATE_MAX_ATTEMPTS`
- `LOGIN_LOCK_BASE_SECONDS`
- `LOGIN_LOCK_MAX_SECONDS`
- `BCRYPT_ROUNDS`

## Checklist operacional de produção

### Front-end

- [ ] Configurar `window.AUTH_API_BASE_URL` no deploy do front para a API publicada (`https://...`).
- [ ] Publicar front em domínio definitivo com HTTPS válido.

### Backend

- [ ] Publicar backend com TLS válido (certificado confiável).
- [ ] Definir `CORS_ALLOWED_ORIGINS` com os domínios do front e manter `credentials: true`.
- [ ] Ajustar cookie de refresh para o domínio de publicação (`REFRESH_COOKIE_DOMAIN`) e política `SameSite` (`REFRESH_COOKIE_SAME_SITE`).
- [ ] Em cenários cross-site, usar `REFRESH_COOKIE_SAME_SITE=none` com HTTPS obrigatório.

### Dados e continuidade

- [ ] Persistir o banco fora do container efêmero (`AUTH_DB_PATH` em volume/disco persistente).
- [ ] Definir rotina de backup e teste de restauração do banco (`auth.db` + WAL/SHM quando aplicável).
- [ ] Monitorar logs de autenticação/sincronização e estabelecer retenção.
