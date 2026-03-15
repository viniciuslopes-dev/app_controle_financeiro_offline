# Deploy do front-end (produção)

## 1) Definir URL pública da API

Antes de publicar o front, edite `docs/auth-config.js` com a URL HTTPS do backend:

```js
window.AUTH_API_BASE_URL = 'https://api.seudominio.com';
```

> O app usa `window.AUTH_API_BASE_URL` para login, refresh de sessão e sincronização.

## 2) Publicar arquivos estáticos

Publique todo o conteúdo de `docs/` no domínio do app (ex.: `https://app.seudominio.com`).

## 3) Checklist rápido de produção

- [ ] `window.AUTH_API_BASE_URL` aponta para o backend publicado (`https://...`).
- [ ] Front publicado em domínio definitivo (`https://app.seudominio.com`).
- [ ] Backend com TLS válido e certificado confiável.
- [ ] CORS do backend permite o domínio do front com credenciais.
- [ ] Cookie de refresh compatível com seu domínio/cenário (SameSite/Domain/Secure).
