/**
 * utils.js
 * Funciones auxiliares compartidas
 */

(function(){
  const U = {};

  U.normalizeForSearch = function(s){
    if (s === undefined || s === null) return "";
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  };

  // normalizador para headers (quita tildes y símbolos)
  U.normHeader = function(s){
    if (!s) return "";
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  };

  // Highlight first occurrence (returns DOM fragment)
  U.buildHighlightedFrag = function(text, query){
    const frag = document.createDocumentFragment();
    if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }
    const t = String(text || "");
    const q = U.normalizeForSearch(query);
    const lower = U.normalizeForSearch(t);
    const pos = lower.indexOf(q);
    if (pos === -1){ frag.appendChild(document.createTextNode(t)); return frag; }
    // find actual substring positions in original text by mapping tokens
    // simplest: highlight by slicing based on characters (works well for same-case)
    const before = t.slice(0, pos);
    const match = t.slice(pos, pos + q.length);
    const after = t.slice(pos + q.length);
    frag.appendChild(document.createTextNode(before));
    const strong = document.createElement("strong"); strong.textContent = match; frag.appendChild(strong);
    frag.appendChild(document.createTextNode(after));
    return frag;
  };

  // dedupe array of rows by COD_SEDE or COD_IE or combination
  U.getRowKey = function(row){
    const r = row || {};
    const cods = r['COD_SEDE_DANE'] || r['COD_SEDE'] || r['COD_SEDE_DAN'] || "";
    const codi = r['COD_IE_DANE'] || r['COD_IE'] || "";
    if (cods) return 'S:' + cods;
    if (codi) return 'I:' + codi;
    return 'K:' + (r['SEDE']||'') + '|' + (r['INSTITUCION']||'') + '|' + (r['MUNICIPIO']||'');
  };

  U.getTotalGeneral = function(row){
    // prefer header that matches EXACT "TOTAL GENERAL" ignoring case and accents
    const headers = window.RAW_HEADERS || [];
    // try exact match normalized
    for (const h of headers){
      if (!h) continue;
      if (U.normHeader(h) === U.normHeader("TOTAL GENERAL")){
        const v = row[h] || "";
        const num = Number(String(v).replace(/[^\d\-]/g,''));
        return isNaN(num) ? 0 : num;
      }
    }
    // fallback: any header containing 'total' and a digit in its values
    for (const h of headers){
      if (!h) continue;
      if (/total/i.test(h)){
        const v = row[h] || "";
        const n = Number(String(v).replace(/[^\d\-]/g,''));
        if (!isNaN(n)) return n;
      }
    }
    // last resort: scan all values for a numeric-looking field with relatively large numbers
    let maxVal = 0;
    for (const h of headers){
      const v = Number(String(row[h]||"").replace(/[^\d\-]/g,''));
      if (!isNaN(v) && v > maxVal) maxVal = v;
    }
    return maxVal || 0;
  };

  // find header key by canonical name, returns raw header string if found, else null
  U.findHeaderKey = function(canonical){
    if (!canonical) return null;
    const headers = window.RAW_HEADERS || [];
    const target = U.normHeader(canonical);
    // exact normalized match
    for (const h of headers){
      if (!h) continue;
      if (U.normHeader(h) === target) return h;
    }
    // contains
    for (const h of headers){
      if (!h) continue;
      if (U.normHeader(h).includes(target)) return h;
    }
    // startsWith
    for (const h of headers){
      if (!h) continue;
      if (U.normHeader(h).startsWith(target) || target.startsWith(U.normHeader(h))) return h;
    }
    // try splitting by tokens
    const core = target.split(' ')[0];
    if (core){
      for (const h of headers){
        if (!h) continue;
        if (U.normHeader(h).includes(core)) return h;
      }
    }
    return null;
  };

  // export
  window.Utils = U;
})();

