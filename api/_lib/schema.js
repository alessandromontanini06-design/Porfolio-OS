// Schemi degli strumenti per Gemini: tipi in MAIUSCOLO, niente additionalProperties né $schema. Usato da llm.js e dalla chiamata.
// File a parte (senza librerie) così i test lo caricano anche dove il pacchetto dell'IA non è installato.
export const upperTypes = s => {
  if (Array.isArray(s)) return s.map(upperTypes);
  if (!s || typeof s !== "object") return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type" && typeof v === "string") o.type = v.toUpperCase();
    else if (k === "type" && Array.isArray(v)) { const t = v.find(x => x !== "null"); o.type = String(t).toUpperCase(); if (v.includes("null")) o.nullable = true; }
    else o[k] = upperTypes(v);
  }
  return o;
};
