# Test di Portfolio OS

Test del motore e dell'interfaccia (Chrome headless con puppeteer-core). Questa cartella non va su Vercel (vedi `.vercelignore`).

```bash
cd tests
npm ci
node test-engine.mjs
node test-ui.mjs files/shots
```

- `serve.mjs` avvia il sito in locale con le API simulate (`REAL_PRICES=1` per i prezzi veri di Yahoo).
- Serve Chrome in `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- File d'esempio: solo dati inventati (cliente «Marco Bianchi») o export pubblici open source (`files/web`, da Export-To-Ghostfolio e capital-gains-calculator). Nessun file di utenti o tester va messo qui: il repository è pubblico.
- `test-banca` e `test-conti` falliscono di proposito: riguardano funzioni tolte.
