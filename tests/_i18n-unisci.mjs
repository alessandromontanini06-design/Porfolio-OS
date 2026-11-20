// Unisce le traduzioni numerate (files/i18n/<lingua>-N.txt: «indice<TAB>testo») nel dizionario js/i18n/<lingua>.json.
// Controlla che ogni traduzione tenga gli stessi segnaposto {0}, {1}… della frase italiana.
import fs from "node:fs"; import path from "node:path";
const here = import.meta.dirname, K = JSON.parse(fs.readFileSync(path.join(here, "files", "i18n-da-tradurre.json"), "utf8"));
fs.mkdirSync(path.join(here, "..", "js", "i18n"), { recursive: true });
for (const L of ["en", "es", "fr"]) {
  const out = {}; let n = 0, male = [];
  for (const f of fs.readdirSync(path.join(here, "files", "i18n")).filter(f => f.startsWith(L + "-")).sort()) {
    for (const riga of fs.readFileSync(path.join(here, "files", "i18n", f), "utf8").split(/\r?\n/)) {
      /* «numero<TAB>traduzione» (frasi raccolte) oppure «=chiave italiana<TAB>traduzione» (frasi aggiunte a mano) */
      const m = riga.match(/^(\d+)\t(.*)$/) || riga.match(/^=([^\t]+)\t(.*)$/); if (!m) continue;
      const k = riga[0] === "=" ? m[1].trim() : K[+m[1]], t = m[2].trim(); if (!k || !t) continue;
      const ph = s => (s.match(/\{\d+\}/g) || []).sort().join();
      if (ph(k) !== ph(t)) { male.push(m[1]); continue; }
      out[k] = t; n++;
    }
  }
  fs.writeFileSync(path.join(here, "..", "js", "i18n", L + ".json"), JSON.stringify(out));
  console.log(L, "frasi:", n, "su", K.length, male.length ? "· segnaposto sbagliati: " + male.join(",") : "");
}
