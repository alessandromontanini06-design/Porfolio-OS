// Funzione server: dati descrittivi di un ETF dalla sua scheda pubblica su justETF (per ISIN).
// GET /api/etfinfo?isin=IE00B4L5Y983
// Legge solo la scheda del fondo (paesi, settori, TER, indice, valuta, replica…), MAI prezzi o quotazioni:
// le condizioni di justETF (art. 3.1) vietano programmi che chiedono quotazioni in automatico e il sovraccarico del servizio.
// Per questo ogni scheda viene conservata una settimana (memoria + rete di Vercel): al massimo una richiesta a settimana per fondo.

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const TTL = 7 * 24 * 3600 * 1000, cache = new Map();

function fromOwnSite(req) {
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const h = req.headers || {};
  return allowed.includes(h.origin || "") || h["sec-fetch-site"] === "same-origin" || allowed.some(a => String(h.referer || "").startsWith(a + "/"));
}
const text = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const pctNum = s => { const m = String(s).match(/(-?\d+(?:[.,]\d+)?)\s*%/); return m ? Math.round(+m[1].replace(",", ".") * 1e4) / 1e6 : null; };

/* tabella paesi o settori: righe «nome  xx,xx%» (i primi 4 più «Altri», come nella scheda pubblica) */
function table(html, kind) {
  const i = html.indexOf(`etf-holdings_${kind}_table`);
  if (i < 0) return null;
  const end = html.indexOf("</table>", i), seg = html.slice(i, end > i ? end : i + 10000);
  const rows = [...seg.matchAll(/data-testid="etf-holdings_[a-z]+_row"[\s\S]*?<\/tr>/g)].map(m => {
    const name = text((m[0].match(/value_name"[^>]*>([\s\S]*?)<\/td>/) || [])[1]), pct = pctNum(text((m[0].match(/value_percentage"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || m[0]));
    return name && pct != null ? { nome: name, peso: Math.round(pct * 1e6) / 1e6 } : null;
  }).filter(Boolean);
  return rows.length ? rows : null;
}
/* prime 10 partecipazioni: nome, ISIN dell'azienda (dal link alla sua scheda), peso; più peso totale delle prime 10 e numero di titoli */
function topHoldings(html) {
  const i = html.indexOf("etf-holdings_top-holdings_container");
  if (i < 0) return null;
  const end = html.indexOf("</table>", i), seg = html.slice(i, end > i ? end : i + 20000);
  const rows = [...seg.matchAll(/data-testid="etf-holdings_top-holdings_row"[\s\S]*?<\/tr>/g)].map(m => {
    const href = (m[0].match(/href="[^"]*\/([A-Z]{2}[A-Z0-9]{9}\d)"/) || [])[1] || null;
    const nome = text((m[0].match(/title="([^"]*)"/) || [])[1] || (m[0].match(/<span>([\s\S]*?)<\/span>/) || [])[1]);
    const peso = pctNum(text((m[0].match(/top-holdings_value_percentage"[^>]*>([\s\S]*?)<\/span>/) || [])[1]));
    return nome && peso != null ? { nome, isin: href, peso } : null;
  }).filter(Boolean);
  if (!rows.length) return null;
  const tot = pctNum(text((seg.match(/top-holdings_weight"[^>]*>([\s\S]*?)<\/span>/) || [])[1]));
  const cnt = (text((seg.match(/top-holdings_count"[^>]*>([\s\S]*?)<\/div>/) || [])[1]).match(/[\d.]+/) || [])[0];
  return { righe: rows, pesoTop: tot, numero: cnt ? Number(cnt.replace(/\./g, "")) : null };
}
function basics(html) {
  const out = {};
  for (const m of html.matchAll(/data-testid="etf-basics_row_([a-z-]+)"[\s\S]*?<\/tr>/g)) {
    const cells = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => text(c[1]));
    if (cells.length >= 2) out[m[1]] = cells[cells.length - 1];
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  const isin = String((req.query && req.query.isin) || "").trim().toUpperCase();
  if (!ISIN.test(isin)) { res.status(400).json({ error: "ISIN non valido." }); return; }
  const hit = cache.get(isin);
  if (hit && Date.now() - hit.t < TTL) { res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400"); res.status(200).json(hit.v); return; }
  try {
    const url = `https://www.justetf.com/it/etf-profile.html?isin=${isin}`;
    let r = null, err = null;
    for (let k = 0; k < 2 && !r; k++) {
      try { r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "it-IT,it;q=0.9" }, signal: AbortSignal.timeout(25000) }); }
      catch (e) { err = e; }
    }
    if (!r) throw new Error(err && err.name === "TimeoutError" ? "justETF lento" : "justETF non raggiungibile");
    if (r.status === 404) { res.status(404).json({ isin, error: "Non è un ETF presente su justETF." }); return; }
    if (!r.ok) throw new Error(`justETF ${r.status}`);
    const html = await r.text();
    const b = basics(html), countries = table(html, "countries"), sectors = table(html, "sectors"), top = topHoldings(html);
    const name = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
    if (!b.ter && !countries && !sectors) { res.setHeader("Cache-Control", "no-store"); res.status(404).json({ isin, error: "Scheda justETF non trovata per questo ISIN (forse non è un ETF)." }); return; }
    const v = {
      isin, nome: name || null, fonte: "justETF · scheda pubblica del fondo", url, letto: new Date().toISOString().slice(0, 10),
      ter: pctNum(b.ter), indice: (b["index-name"] || "").replace(/^Indice\s*/i, "") || null, focus: (b["investment-focus"] || "").replace(/^Focus di investimento\s*/i, "") || null,
      valuta: (b["fund-currency"] || "").replace(/^Valuta dell'ETF\s*/i, "") || null, copertura: b["currency-hedge"] || null, replica: (b.replication || "").replace(/^Replicazione\s*/i, "") || null,
      distribuzione: (b["distribution-policy"] || "").replace(/^Politica di distribuzione\s*/i, "") || null, emittente: (b["fund-provider"] || "").replace(/^Emittente\s*/i, "") || null,
      lancio: (b["launch-date"] || "").replace(/^Data di lancio\/? ?quotazione\s*/i, "") || null, dimensione: (b["fund-size"] || "").replace(/^Dimensione del fondo\s*/i, "") || null,
      paesi: countries, settori: sectors, partecipazioni: top,
      nota: "Paesi e settori: le prime posizioni pubblicate da justETF più «Altri»; partecipazioni: le prime 10. I dati dipendono dalle composizioni dichiarate dall'emittente."
    };
    cache.set(isin, { t: Date.now(), v });
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
    res.status(200).json(v);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ isin, error: `Scheda justETF non disponibile (${e.message}).` });
  }
}
