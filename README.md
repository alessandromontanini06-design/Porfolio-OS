# Portfolio OS

AI Financial Intelligence Lab: carichi un Excel o un CSV di prezzi o rendimenti e ottieni un laboratorio di analisi con calcoli verificabili. Gemini propone le correzioni del file; l'utente le applica con un clic.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html` | Tutta l'app: import, scansione, mappa, controllo qualità, laboratorio. I calcoli girano nel browser. |
| `api/fix.js` | Funzione server di Vercel. Riceve un estratto del foglio e chiede a Gemini le correzioni. La chiave resta sul server. |
| `package.json` | Dice a Vercel di usare Node 18 o successivo. |

## Pubblicazione (una volta sola, circa 10 minuti)

### 1. Nuova chiave Gemini
1. Vai su https://aistudio.google.com/apikey
2. **Elimina la chiave vecchia** (quella scritta in chat).
3. Crea una chiave nuova e copiala. Non incollarla da nessun'altra parte se non al punto 3.4.

### 2. Carica il progetto su GitHub
1. Vai su https://github.com/new
2. Nome del repository: `portfolio-os`. Lascialo **Public** o **Private**, come preferisci. Non aggiungere README.
3. Clicca **Create repository**.
4. Nella pagina che si apre clicca il link **uploading an existing file**.
5. Trascina dentro **tutto il contenuto** della cartella `portfolio-os-vercel`: il file `index.html`, il file `package.json`, il file `README.md` e la cartella `api` (con `fix.js` dentro).
6. Clicca **Commit changes**.
7. Controlla che nel repository ci sia la cartella `api` con dentro `fix.js`. Se manca, aprila con **Add file → Create new file**, scrivi come nome `api/fix.js` e incolla il contenuto del file.

### 3. Collega Vercel
1. Vai su https://vercel.com/new
2. Alla voce **Import Git Repository** scegli `portfolio-os` (se non compare, clicca per dare a Vercel l'accesso a GitHub).
3. **Framework Preset**: Other. Lascia vuoti Build Command e Output Directory.
4. Apri **Environment Variables** e aggiungi:
   - `GEMINI_API_KEY` = la chiave nuova del punto 1
5. Clicca **Deploy** e aspetta un minuto.
6. Vercel ti dà un indirizzo tipo `https://portfolio-os-xxxx.vercel.app`. Aprilo: è la tua app.

### 4. Protezione consigliata
In Vercel → Settings → Environment Variables aggiungi anche:
- `ALLOWED_ORIGIN` = l'indirizzo esatto del tuo sito, per esempio `https://portfolio-os-xxxx.vercel.app`. Così solo il tuo sito può usare la funzione.
- `AI_HOURLY_LIMIT` = `20` (richieste massime all'ora per visitatore; puoi cambiarlo).

Poi vai su **Deployments** e clicca **Redeploy** sull'ultima pubblicazione, perché le variabili valgano.

Facoltativo: `GEMINI_MODEL` per scegliere il modello (predefinito `gemini-2.5-flash`). Se Google lo ritira, metti qui il nome di un modello attuale.

## Aggiornare l'app
Carica su GitHub il nuovo `index.html` (o `api/fix.js`) sovrascrivendo quello vecchio: Vercel ripubblica da solo.

## Privacy
- Il file viene letto nel browser. I calcoli non lasciano mai il dispositivo.
- Con la correzione IA, a Gemini arrivano solo intestazioni, prime righe e righe sospette del foglio.
- La chiave Gemini non arriva mai al browser.
