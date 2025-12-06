/**
 * dataset-loader.js
 * - carga CSV público y construye:
 *   window.DATASET (array de rows)
 *   window.RAW_HEADERS (array de header strings tal como vienen)
 *
 * Reemplaza CSV_URL con tu link público CSV (output=csv).
 */

(function(){
  const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRe5o92LzVVZNSuqn2eUpGf3t1nr_rf58V37ypPjGldYnxNg1B9XTrtZCvNSU-VTKdszHXD9WeqE8sk/pub?gid=1700850446&single=true&output=csv";

  window.DATASET = [];
  window.RAW_HEADERS = [];

  // robust CSV parser that preserves original header strings
  function splitCSVLinePreserve(line){
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++){
      const ch = line[i];
      if (ch === '"'){ inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes){ parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  }

  function detectHeaderLine(lines){
    for (let i = 0; i < Math.min(6, lines.length); i++){
      if (!lines[i] || !lines[i].trim()) continue;
      if (/MUNICIPIO/i.test(lines[i])) return i;
    }
    for (let i = 0; i < lines.length; i++){
      if (lines[i] && lines[i].trim()) return i;
    }
    return 0;
  }

  async function fetchCSVText(){
    try {
      const resp = await fetch(CSV_URL);
      if (!resp.ok) throw new Error("Status " + resp.status);
      return await resp.text();
    } catch (err) {
      console.error("Error fetch CSV:", err);
      throw err;
    }
  }

  function buildRowsFromCSVTextPreserve(csvText){
    const lines = csvText.split(/\r?\n/);
    const headerLineIndex = detectHeaderLine(lines);
    const rawHeaders = splitCSVLinePreserve(lines[headerLineIndex]).map(h => (h||"").trim());
    const dataLines = lines.slice(headerLineIndex + 1);
    const rows = dataLines.map(line => {
      if (!line || !line.trim()) return null;
      const parts = splitCSVLinePreserve(line);
      const obj = {};
      for (let i = 0; i < rawHeaders.length; i++){
        obj[rawHeaders[i]] = (parts[i] === undefined ? "" : parts[i]).trim();
      }
      return obj;
    }).filter(r => r !== null);
    return { rawHeaders, rows };
  }

  async function init(){
    try {
      const txt = await fetchCSVText();
      const { rawHeaders, rows } = buildRowsFromCSVTextPreserve(txt);
      window.RAW_HEADERS = rawHeaders;
      window.DATASET = rows;
      console.log("Dataset loaded:", rows.length, "headers:", rawHeaders.length);
      // dispatch event to signal other modules
      document.dispatchEvent(new CustomEvent('dataset:loaded', { detail:{ rowsCount: rows.length, headersCount: rawHeaders.length } }));
      // update status display if exists
      const st = document.getElementById('conn-status'); if (st) st.textContent = 'conectado';
    } catch (err){
      const st = document.getElementById('conn-status'); if (st) st.textContent = 'error';
      console.error(err);
    }
  }

  // start
  init();
})();

