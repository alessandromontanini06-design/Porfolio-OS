# Portfolio OS

AI Financial Intelligence Lab: carichi un Excel o un CSV di prezzi o rendimenti e ottieni un laboratorio di analisi con calcoli verificabili. La matematica è il motore, i dati sono la fonte della verità, l'IA interpreta. Ogni numero ha una "ricevuta" con formula e dati usati. Tassi e inflazione arrivano da fonti ufficiali (BCE, e FRED se configurata).

## Moduli

| Sezione | Cosa calcola |
|---|---|
| Scansione e Mappa | Riconoscimento di date, prezzi e rendimenti; controllo qualità (date duplicate o non valide, buchi nel calendario, valori mancanti, rendimenti anomali); correzione manuale delle colonne; correzione e ricostruzione con l'IA. |
| Laboratorio | CAGR, rendimento reale, volatilità, Sharpe con tasso BCE, drawdown, correlazioni (rete 3D o matrice), portafoglio dell'utente e ribilanciamento. |
| Rischio | VaR e CVaR storici 95%, Sortino, Calmar, asimmetria, curtosi, drawdown nel tempo e più lungo, contributo di ogni asset al rischio, asset effettivi, rapporto di diversificazione. |
| Simulazioni | Monte Carlo con bootstrap storico, bootstrap a blocchi o distribuzione normale; versamenti o prelievi mensili, costi, inflazione; ventaglio dei percentili, distribuzione finale, probabilità di raggiungere un obiettivo, di perdita e di esaurire il capitale. Seme fisso: risultati riproducibili. |
| Stress test | Libreria di crisi (dot-com, 2008, debito euro 2011, COVID 2020, inflazione 2022) rivissute solo con i dati del file: perdita massima, tempo per il minimo e per il recupero, rendimento e contributo alla perdita di ogni asset, correlazioni in crisi, confronto tra crisi. Le crisi fuori dai dati non vengono stimate. Shock personalizzati per asset, con propagazione agli altri asset tramite la covarianza storica (Σ_UK · Σ_KK⁻¹ · s). |
| Frontiera | Frontiera efficiente di Markowitz (min wᵀΣw − λ·μᵀw con limiti di peso, gradiente proiettato accelerato), nuvola di portafogli casuali, linea di allocazione del capitale. Ottimizzatore: massimo Sharpe, minima volatilità, risk parity, pesi uguali, volatilità o rendimento target; peso minimo e massimo, vendite allo scoperto. Confronto prima/dopo e pesi ottimizzati riutilizzabili in Rischio, Simulazioni e Stress test. |
| Quanta | Analista IA in chat. Capisce la domanda e chiama gli strumenti del motore (metriche, rischio, confronto tra allocazioni, correlazioni, macro, Monte Carlo, crisi storiche, stress test, ottimizzazione): non calcola e non inventa numeri. |

## Struttura

| File | Cosa fa |
|---|---|
| `index.html` | Tutta l'app. I calcoli girano nel browser. |
| `api/_lib/llm.js` | Centralino delle IA: Claude, Gemini e Groq con riserve automatiche, tempi massimi, cache di un'ora e limite di richieste all'ora. |
| `api/fix.js` | Riceve un estratto del foglio e chiede all'IA le correzioni. |
| `api/understand.js` | Capisce che tipo di file è (serie storica o riepilogo di portafoglio) e tiene solo gli asset. |
| `api/assistant.js` | Quanta: il modello sceglie gli strumenti, il browser li esegue sui dati confermati. |
| `api/rates.js` | Euribor 3 mesi e HICP dalla BCE (e T-bill e CPI USA dalla FRED, se c'è la chiave). |
| `api/prices.js` | Storico mensile dei prezzi da Alpha Vantage, con cache di 24 ore. |
| `package.json` | Dipendenze del server (SDK di Anthropic e zod). Vercel le installa da solo. |

## Variabili d'ambiente su Vercel

| Nome | Obbligatoria | Valore |
|---|---|---|
| `GEMINI_API_KEY` | Sì, per Quanta | Chiave gratuita da aistudio.google.com. |
| `GROQ_API_KEY` | Consigliata | Chiave gratuita da console.groq.com: riserva quando Gemini non risponde. |
| `ANTHROPIC_API_KEY` | Consigliata | Chiave di Claude: prima scelta per correzione e ricostruzione del file. |
| `CLAUDE_MODEL` | Consigliata | `claude-haiku-5-5` per spendere pochissimo. Se non la imposti si usa `claude-opus-5-5`, più capace ma molto più caro. |
| `ALPHAVANTAGE_API_KEY` | Sì, per la ricostruzione | Chiave gratuita da alphavantage.co. |
| `FRED_API_KEY` | No | Chiave gratuita da fred.stlouisfed.org, per i dati USA. |
| `ALLOWED_ORIGIN` | Consigliata | L'indirizzo del sito: solo il tuo sito può usare le funzioni. |
| `AI_HOURLY_LIMIT` / `ASSISTANT_HOURLY_LIMIT` | No | Richieste massime all'ora per visitatore (predefinite 20 e 60). |
| `ASSISTANT_ORDER` | No | Ordine delle IA per Quanta (predefinito `gemini,groq`). |

Dopo ogni modifica delle variabili: Deployments → ⋯ sull'ultima → Redeploy.

## Aggiornare l'app
Carica su GitHub i file modificati sovrascrivendo quelli vecchi: Vercel ripubblica da solo.

## Sviluppo locale e test
- `node tools/test-engine.mjs` esegue i test del motore quantitativo: casi con risultato noto per numeri e date, CAGR, volatilità, covarianza, correlazione, VaR, CVaR, drawdown e recupero, contributo al rischio, importazione con date duplicate e valori mancanti, Monte Carlo (montante, inflazione, costi, prelievi, riproducibilità, velocità), crisi storiche (finestre, contributi, recupero, dati parziali o assenti) e shock condizionati, frontiera e ottimizzatore (varianza minima e tangenza analitiche, vincoli, target, risk parity, vendite allo scoperto).
- `node tools/build.js` ricrea `index.html` da `portfolio-os.html`.
- `node tools/serve.mjs` apre un'anteprima su http://localhost:5181 con i dati veri della BCE e risposte IA simulate.

## Privacy
- Il file viene letto nel browser; i calcoli non lasciano mai il dispositivo.
- Con la correzione IA arrivano al modello solo intestazioni, prime righe e righe sospette del foglio.
- A Quanta arrivano solo le domande e i risultati riassuntivi calcolati dal motore, mai il file.
- Alla BCE e alla FRED arriva solo il periodo del dataset, nessun dato del file.
- Le chiavi non arrivano mai al browser.
