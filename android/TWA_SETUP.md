# Setup Android com TWA (Trusted Web Activity)

Este guia empacota a PWA como app Android.

## Pré-requisitos

- Node.js LTS
- Java 17+
- Android Studio + SDK
- PWA publicada em **HTTPS**

## 1) Publicar a PWA

Publique a pasta `../web` em um domínio HTTPS, por exemplo:

- `https://seu-dominio.com/financeiro/`

Valide no navegador Android:

- abre offline (após primeira carga)
- permite instalar como app

## 2) Gerar projeto TWA com Bubblewrap

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://seu-dominio.com/financeiro/manifest.webmanifest
```

Responda os prompts (packageId, appName, host, etc).

## 3) Build do APK/AAB

Dentro da pasta gerada pelo Bubblewrap:

```bash
bubblewrap build
```

Isso gera artefatos Android para testes/publicação.

## 4) Testar no celular

- Ative modo desenvolvedor + USB debugging
- Instale o APK
- Teste sem internet (modo avião)

## Observações

- TWA usa Chrome/WebView do dispositivo para renderizar a PWA.
- Se precisar banco local nativo (SQLite) e plugins, considere Capacitor em vez de TWA.
