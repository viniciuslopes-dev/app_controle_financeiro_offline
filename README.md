# Controle Financeiro Offline (PWA)

MVP **offline-first** para controle financeiro com:

- **PWA** (aplicação web instalável)
- **Sem login/controle de acesso**
- **Dados locais no dispositivo** (localStorage neste MVP)
- **Sem arquivos binários pesados** (ícone SVG)
- **Guia para Android via TWA**

## Estrutura do repositório

- `docs/`: versão publicada no **GitHub Pages** (fonte recomendada do site)
- `android/`: instruções para empacotar como TWA
- Raiz (`index.html`, `app.js`, etc.): cópia de desenvolvimento local

## Publicar no GitHub Pages (recomendado)

Para evitar o Pages renderizar o `README.md` em vez da aplicação, publique a pasta `docs/`:

1. Acesse **Settings → Pages**
2. Em **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/docs`
3. Salve e aguarde o deploy.

A pasta `docs/` contém:

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `service-worker.js`
- `icons/icon.svg`
- `.nojekyll` (evita processamento Jekyll)

## Rodar localmente

> O Service Worker exige servidor HTTP (não funciona com `file://`).

```bash
python -m http.server 8080
```

Abra:

- `http://localhost:8080`

## Funcionalidades do MVP

- Cadastro de transações (receita/despesa/investimento/meta)
- Lista de transações
- Resumo total por tipo + saldo
- Persistência local no navegador
- Cache offline do app shell via Service Worker

## Como transformar em Android (TWA)

1. Publique o conteúdo em HTTPS (GitHub Pages/Vercel/Netlify/etc).
2. Garanta que o domínio serve:
   - `manifest.webmanifest`
   - `service-worker.js`
   - `icons/icon.svg`
3. Use o guia em `android/TWA_SETUP.md` para gerar o app Android.
