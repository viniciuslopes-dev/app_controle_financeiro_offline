# Versão simplificada: PWA + TWA (Android)

Esta pasta contém um MVP **offline-first** para controle financeiro com:

- **PWA** (aplicação web instalável)
- **Sem login/controle de acesso**
- **Dados locais no dispositivo** (localStorage neste MVP)
- **Sem arquivos binários (ícones em SVG)**
- **Guia para Android via TWA**

## Estrutura

- `web/`: app PWA funcional (HTML/CSS/JS + Service Worker + Manifest)
- `android/`: instruções para empacotar como TWA

## Rodar localmente

> O Service Worker exige servidor HTTP (não funciona com `file://`).

```bash
cd pwa_twa_simplificado/web
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

1. Publique o conteúdo de `web/` em HTTPS (Vercel/Netlify/GitHub Pages/etc).
2. Garanta que o domínio serve:
   - `manifest.webmanifest`
   - `service-worker.js`
   - `icons/icon.svg`
3. Use o guia em `android/TWA_SETUP.md` para gerar o app Android.

## Próximos passos recomendados

- Trocar `localStorage` por `IndexedDB` (Dexie) para maior robustez.
- Adicionar exportação/importação de backup JSON.
- Adicionar categorias e recorrência como no app principal.
