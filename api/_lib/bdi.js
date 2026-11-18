// Curva dei rendimenti dei BTP benchmark (3, 5, 10 e 30 anni) dalla Banca d'Italia, serie BMK0200.
// Dati ufficiali e gratuiti: si possono usare citando «Fonte: Banca d'Italia» e senza modificarli
// (https://www.bancaditalia.it/statistiche/condizioni-utilizzo/). Il sito li usa per STIMARE il prezzo dei BTP a tasso fisso.
// Il servizio risponde con un file zip che contiene un solo CSV: «;» come separatore, virgola decimale, date «AAAA/MM/GG» dalla più recente.
import { inflateRawSync } from "node:zlib";

export const BMK_URL = "https://a2a.bancaditalia.it/infostat/dataservices/export/IT/CSV/DATA/CUBE/BANKITALIA/DIFF/BMK0200";
const COLS = { 3: "MFN_BMK.D.020.922.0.EUR.203", 5: "MFN_BMK.D.020.922.0.EUR.205", 10: "MFN_BMK.D.020.922.0.EUR.210", 30: "MFN_BMK.D.020.922.0.EUR.230" };
export const SCADENZE = [3, 5, 10, 30];

/* primo file di uno zip: directory centrale in fondo al file, poi i dati compressi (deflate) dopo l'intestazione locale */
export function unzipFirst(buf) {
  const b = Buffer.from(buf);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("zip non valido");
  const cd = b.readUInt32LE(e + 16);
  if (b.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip non valido");
  const method = b.readUInt16LE(cd + 10), size = b.readUInt32LE(cd + 20), off = b.readUInt32LE(cd + 42);
  if (b.readUInt32LE(off) !== 0x04034b50) throw new Error("zip non valido");
  const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), data = b.subarray(start, start + size);
  if (method === 0) return data.toString("utf-8");
  if (method === 8) return inflateRawSync(data).toString("utf-8");
  throw new Error(`zip compresso con il metodo ${method}`);
}

/* CSV → curva: per ogni mese l'ultimo giorno con dati (dal 1994, quando ci sono tutte e quattro le scadenze), più ogni giorno degli ultimi 3 anni
   (servono ad allineare la stima al prezzo vero di un acquisto recente nel giorno esatto) */
export function parseBmk(text) {
  const lines = String(text).replace(/^\uFEFF/, "").trim().split(/\r?\n/), un = s => String(s || "").replace(/^"|"$/g, "").trim();
  const head = lines.shift().split(";").map(un), iD = head.indexOf("DATA_OSS"), idx = SCADENZE.map(k => head.indexOf(COLS[k]));
  if (iD < 0 || idx.some(i => i < 0)) throw new Error("colonne della curva non trovate");
  const rows = [];
  for (const l of lines) {
    const c = l.split(";").map(un), d = c[iD].replace(/\//g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const ys = idx.map(i => { const v = c[i] === "" ? NaN : Number(c[i].replace(",", ".")); return Number.isFinite(v) ? v : null; /* valori come pubblicati, senza arrotondare */ });
    if (ys.every(v => v == null)) continue;
    rows.push([d, ys]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const full = rows.filter(r => r[0] >= "1994-01-01" && r[1].every(v => v != null)), byM = new Map();
  full.forEach(r => byM.set(r[0].slice(0, 7), r));
  const from3 = new Date(Date.now() - 3 * 365.25 * 864e5).toISOString().slice(0, 10), mesi = [...byM.values()], giorni = full.filter(r => r[0] >= from3);
  if (mesi.length < 24) throw new Error("curva troppo corta");
  return { fonte: "Banca d'Italia", serie: "BMK0200 · rendimenti lordi dei BTP benchmark", scadenze: SCADENZE, al: giorni.length ? giorni[giorni.length - 1][0] : mesi[mesi.length - 1][0], mesi, giorni };
}

export async function fetchCurva() {
  const r = await fetch(BMK_URL, { signal: AbortSignal.timeout(25_000), headers: { Accept: "application/zip, text/csv, */*" } });
  if (!r.ok) throw new Error(`Banca d'Italia ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.readUInt32LE(0) === 0x04034b50 ? unzipFirst(buf) : buf.toString("utf-8");
  return parseBmk(text);
}
