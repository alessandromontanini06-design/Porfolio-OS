// Funzione server di Vercel: riceve un estratto del foglio e chiede a Gemini
// di proporre correzioni. La chiave resta qui sul server, nella variabile
// d'ambiente GEMINI_API_KEY, e non arriva mai al browser.

const WINDOW_MS = 60 * 60 * 1000;                       // finestra di un'ora
const LIMIT = Number(process.env.AI_HOURLY_LIMIT || 20); // richieste per IP all'ora
const MAX_BODY = 60_000;                                 // caratteri massimi in ingresso
const hits = new Map();

const ROLES = ["date", "price", "ret", "retpct", "ignore"];
let cachedModel = null;

// Elenca i modelli disponibili per questa chiave e sceglie il "flash" più recente.
async function pickModel(key) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const j = await r.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => String(m.name || "").replace(/^models\//, ""))
      .filter(n => /flash/.test(n) && !/(lite|image|tts|audio|live|thinking|exp|preview)/.test(n));
    const ver = n => (n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;
    names.sort((a, b) => ver(b) - ver(a));
    return names[0] || null;
  } catch { return null; }
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    roles: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          col: { type: "STRING" },
          role: { type: "STRING", enum: ROLES },
          why: { type: "STRING" }
        },
        required: ["col", "role", "why"]
      }
    },
    cells: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          row: { type: "INTEGER" },
          col: { type: "STRING" },
          value: { type: "NUMBER", nullable: true },
          why: { type: "STRING" }
        },
        required: ["row", "col", "why"]
      }
    }
  },
  required: ["summary", "roles", "cells"]
};

function buildPrompt(data) {
  return `Sei un analista quantitativo che pulisce dati finanziari prima di un'analisi.
Ricevi un estratto di un foglio Excel: le colonne con l'interpretazione proposta da un motore a regole, le prime righe del foglio e alcune righe sospette con il loro contesto.

Ruoli possibili per una colonna:
- "date": date delle osservazioni
- "price": prezzi o valori (sempre positivi)
- "ret": rendimenti in forma decimale (0,012 = 1,2%)
- "retpct": rendimenti in punti percentuali (1,2 = 1,2%)
- "ignore": note, flussi, volumi, codici o qualsiasi cosa che non sia una serie di prezzi o rendimenti

Regole:
1. Proponi un ruolo solo per le colonne con interpretazione "incerto" o confidenza "media", oppure se l'interpretazione proposta è chiaramente sbagliata.
2. Proponi la correzione di una cella solo se è un errore evidente di battitura o di scala (per esempio un prezzo moltiplicato per 10, una virgola spostata, un segno sbagliato) e il valore corretto si deduce con certezza dai valori vicini. Usa il numero di riga e la lettera di colonna esattamente come compaiono nei dati.
3. Non inventare mai dati mancanti. Per celle vuote o con testi come "n/d" non proporre valori.
4. Non correggere valori plausibili anche se estremi: crolli reali come quelli del 2008 o di marzo 2020 sono dati veri.
5. Ogni proposta ha una spiegazione di una frase, in italiano.
6. "summary" riassume in una o due frasi, in italiano, cosa hai trovato.
Se non serve alcuna correzione, restituisci liste vuote.

DATI:
${JSON.stringify(data)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa una richiesta POST." });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "La chiave Gemini non è configurata sul server." });
    return;
  }

  // Solo il tuo sito può usare questa funzione (se ALLOWED_ORIGIN è impostata).
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin || "";
  if (allowed.length && !allowed.includes(origin)) {
    res.status(403).json({ error: "Richiesta da un sito non autorizzato." });
    return;
  }

  // Limite di richieste per indirizzo IP.
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anonimo";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    res.status(429).json({ error: "Hai raggiunto il limite di correzioni per quest'ora. Riprova più tardi." });
    return;
  }
  recent.push(now);
  hits.set(ip, recent);

  let data = req.body;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { res.status(400).json({ error: "Dati non leggibili." }); return; }
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.colonne || data.columns)) {
    res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." });
    return;
  }
  if (JSON.stringify(data).length > MAX_BODY) {
    res.status(413).json({ error: "L'estratto del foglio è troppo grande." });
    return;
  }

  let model = process.env.GEMINI_MODEL || cachedModel || "gemini-3.8-flash";
  const call = m => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(data) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA }
      })
    }
  );
  try {
    let r = await call(model);
    // Se Google ha ritirato il modello, ne sceglie da solo uno "flash" disponibile.
    if (r.status === 404) {
      const alt = await pickModel(key);
      if (alt && alt !== model) { model = alt; cachedModel = alt; r = await call(model); }
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j && j.error && j.error.message ? ` ${j.error.message}` : "";
      res.status(502).json({ error: `Gemini ha risposto con un errore (${r.status}).${msg}` });
      return;
    }
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("");
    let out;
    try { out = JSON.parse(text); } catch { res.status(502).json({ error: "La risposta dell'IA non è valida. Riprova." }); return; }
    res.status(200).json({
      summary: String(out.summary || ""),
      roles: Array.isArray(out.roles) ? out.roles.slice(0, 40) : [],
      cells: Array.isArray(out.cells) ? out.cells.slice(0, 60) : [],
      model
    });
  } catch (e) {
    res.status(502).json({ error: "Non riesco a contattare Gemini. Riprova tra poco." });
  }
}
