# Interfaccia di Portfolio OS: i moduli

Fino al 18/11/2026 tutta l'interfaccia era in un solo file, `js/app.js` (4.143 righe).
Ora `js/app.js` è solo il punto di partenza e il codice sta qui, diviso per argomento.
Il codice di ogni parte è lo stesso di prima: sono cambiati solo `import` ed `export`.

| File | Cosa contiene |
| --- | --- |
| `core.js` | Cose comuni: stato `S`, `$`, `esc`, colori, formati. Non importa altri moduli dell'interfaccia. |
| `scene.js` | Scene e dock, cursore, titolo animato, particelle, ticker |
| `importa.js` | Caricamento dei file, lettura con l'IA, «Crea il tuo portafoglio», import, correzioni, ricostruzione con i prezzi, controlli, modelli, tracker, obbligazioni |
| `portafoglio.js` | Il tuo portafoglio: pesi, ribilanciamento, confronto allocazioni, proposta, profilo, costi |
| `archivio.js` | Archivio (IndexedDB), «cosa è cambiato», pagina Archivio |
| `laboratorio.js` | Dati macro, «Dove sei investito», laboratorio, rete 3D |
| `analisi.js` | Rischio, Monte Carlo, FIRE, stress test e crisi, frontiera, benchmark |
| `rendimento.js` | Rendimento reale dalle transazioni |
| `quanta.js` | Quanta: chat con l'analista e presentazione |
| `report.js` | Ricevute, «in parole semplici», report PDF, presentazione al cliente |
| `home.js` | Home: terminale BCE e mappa dei laboratori |

Regole per non rompere niente:

- I moduli si importano a vicenda (dipendenze circolari): va bene perché al caricamento il codice usa subito solo `core.js`, e l'avvio sta in `app.js`.
- Non assegnare mai una variabile `let` di un altro modulo (`current = …` da fuori): gli import sono di sola lettura. Se serve, metti il valore dentro `S`.
- Un nuovo nome usato in un altro modulo va aggiunto all'`export { … }` in fondo al suo file e all'`import` di chi lo usa.
- Controllo della sintassi: `node --check` su ogni file con `"type": "module"`, oppure aprire il sito e guardare la console.
