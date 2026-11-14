/* Portfolio OS · workspace: analisi salvate nel browser (IndexedDB).
   Niente lascia il dispositivo: i file e le impostazioni restano in questo browser finché l'utente non li cancella.
   Due archivi:
   - "files":    il contenuto dei file caricati (fogli e celle), salvato una volta sola e condiviso tra le analisi
   - "analyses": le analisi (mappatura delle colonne, pesi, parametri dei laboratori, sezione aperta)
   L'analisi con id "__last" è il salvataggio automatico dell'ultima sessione. */

const DB = "portfolio-os", VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Questo browser non permette di salvare dati.")); return; }
    const rq = indexedDB.open(DB, VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "key" });
      if (!db.objectStoreNames.contains("analyses")) db.createObjectStore("analyses", { keyPath: "id" });
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error || new Error("Archivio non disponibile (navigazione privata?)."));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Salvataggio annullato (spazio esaurito?)."));
  });
};
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const available = () => typeof indexedDB !== "undefined";

/* file: { key, name, size, kind, sheets: [{ name, aoa }] } — scritto solo se non c'è già */
export async function saveFile(file) {
  return tx("files", "readwrite", async s => { const have = await req(s.get(file.key)); if (!have) s.put({ ...file, saved: Date.now() }); });
}
export const getFile = key => tx("files", "readonly", s => req(s.get(key)));

export const saveAnalysis = a => tx("analyses", "readwrite", s => { s.put({ ...a, updated: Date.now() }); });
export const getAnalysis = id => tx("analyses", "readonly", s => req(s.get(id)));
export async function listAnalyses() {
  const all = await tx("analyses", "readonly", s => req(s.getAll()));
  return (all || []).filter(a => a.id !== "__last").sort((a, b) => b.updated - a.updated);
}
/* elimina un'analisi e il file se nessun'altra analisi lo usa più */
export async function deleteAnalysis(id) {
  const a = await getAnalysis(id); if (!a) return;
  await tx("analyses", "readwrite", s => { s.delete(id); });
  const rest = await tx("analyses", "readonly", s => req(s.getAll()));
  if (!rest.some(x => x.fileKey === a.fileKey)) await tx("files", "readwrite", s => { s.delete(a.fileKey); });
}
export async function clearAll() {
  await tx("analyses", "readwrite", s => { s.clear(); });
  await tx("files", "readwrite", s => { s.clear(); });
}
export async function usage() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch { return null; }
}
