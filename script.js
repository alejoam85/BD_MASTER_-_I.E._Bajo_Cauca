/* script.js */

/* ================= CONFIG ================= */
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRe5o92LzVVZNSuqn2eUpGf3t1nr_rf58V37ypPjGldYnxNg1B9XTrtZCvNSU-VTKdszHXD9WeqE8sk/pub?gid=1700850446&single=true&output=csv";
const DEBOUNCE_MS = 250;
const SUGGEST_LIMIT = 3;
const CAJON1_FIELDS = ["MUNICIPIO", "COD_IE_DANE", "INSTITUCION", "COD_SEDE_DANE", "SEDE", "UBICACION"];
const CAJON2_INDEXABLE_HEADERS = [
  "2022 ERA", "2023 Docentes", "2023 Estudiantes", "2024 Docentes", "2024 Estudiantes", "2025 Docentes", "2025 Estudiantes",
  "2022 ESC_VIDA", "2023 ESC_VIDA", "2024 ESC_VIDA", "2025 ESC_VIDA", "2024 NIDO", "2025 NIDO", "BATUTA 2025", "ATAL 2025", "FCC 2025", "PASC 2025",
  "MAMM 2025", "BECA UDEA 2025", "PC 2023", "PC 2024", "Bibliográfica (Dotación)", "Deportiva (Dotación)", "INFRAEST. Gob",
  "Legalización Predio Resolución de sana posesión", "Bienestar Maestro", "SENA (Oferta)", "COMFAMA inspiración", "AGUA (Alianza por el Agua)",
  "Agua Fund.EPM", "Agua potable", "Conectividad", "Embellecimiento Escuelas"
];

/* ================ Estado ================ */
let rawRows = [];
let headerRow = []; 
let rows = []; 
let filtered = [];
let indices = {}; 
let queryCacheLocal = new Map();
let queryCacheCat = new Map();
let showTable = false; 
let activeCategoryHeaders = []; 

/* ================ Utils ================ */
function safeText(x) { return x === undefined || x === null ? '' : String(x); }
function fixEncoding(s) { try { return decodeURIComponent(escape(s)); } catch (e) { return s; } }
function normalizeCell(raw) {
  const fixed = fixEncoding(safeText(raw)).replace(/[\u0000-\u001F]/g, '').trim();
  const noAccents = fixed.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const visible = noAccents.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim();
  const key = visible.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { visible, key };
}
function normalizeForSearch(s) {
  if (s === undefined || s === null) return '';
  return fixEncoding(String(s)).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
function parseNumber(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).replace(/[^\d\-\.\,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

/* highlighting helpers */
function mapNormToOriginalIndices(original) {
  const orig = safeText(original);
  const norm = orig.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const mapping = [];
  for (let i = 0; i < orig.length; i++) { mapping.push(i); }
  return { orig, norm, mapping };
}
function findNormalizedMatches(original, query) {
  const q = query.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (!q) return [];
  const { orig, norm, mapping } = mapNormToOriginalIndices(original);
  const positions = [];
  let startIndex = 0;
  while (true) {
    const idx = norm.indexOf(q, startIndex);
    if (idx === -1) break;
    const origStart = mapping[idx] !== undefined ? mapping[idx] : idx;
    const origEnd = (mapping[idx + q.length - 1] !== undefined) ? mapping[idx + q.length - 1] + 1 : origStart + q.length;
    positions.push([origStart, origEnd]);
    startIndex = idx + q.length;
  }
  return positions;
}
function buildHighlightedFragment(text, query) {
  const frag = document.createDocumentFragment();
  if (!text) { frag.appendChild(document.createTextNode('')); return frag; }
  const matches = findNormalizedMatches(text, query);
  if (matches.length === 0) { frag.appendChild(document.createTextNode(text)); return frag; }
  let cursor = 0;
  for (const [s, e] of matches) {
    if (s > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, s)));
    const strong = document.createElement('strong'); strong.textContent = text.slice(s, e);
    frag.appendChild(strong);
    cursor = e;
  }
  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
  return frag;
}

/* ================= CSV load & preproc ================= */
function loadCSV() {
  document.getElementById('loading').textContent = 'Cargando CSV…';
  Papa.parse(CSV_URL, {
    download: true, skipEmptyLines: false, complete: function (res) {
      rawRows = res.data.map(r => r.map(c => c === undefined ? '' : String(c)));
      while (rawRows.length && rawRows[rawRows.length - 1].every(x => x.trim() === '')) rawRows.pop();
      if (rawRows.length < 3) {
        document.getElementById('loading').textContent = 'CSV inválido: se esperaban al menos 3 filas (secciones + encabezado).';
        return;
      }
      headerRow = rawRows[2].map(cell => normalizeCell(cell));
      rows = rawRows.slice(3).map(r => {
        const obj = {};
        for (let i = 0; i < headerRow.length; i++) {
          const key = headerRow[i] ? headerRow[i].visible : `C${i}`;
          obj[key] = r[i] === undefined ? '' : r[i];
        }
        // attempt robust detection for TOTAL GENERAL variants
        const tgCandidates = ["TOTAL GENERAL", "TOTAL_GENERAL", "TOTALGENERAL", "TOTAL"];
        let tgVal = NaN;
        for (const cand of tgCandidates) {
          if (obj[cand] !== undefined && obj[cand] !== '') { tgVal = parseNumber(obj[cand]); break; }
        }
        // fallback: try any numeric-like header
        if (isNaN(tgVal)) {
          for (const h of Object.keys(obj)) {
            if (/total/i.test(h) && obj[h] && /\d/.test(obj[h])) { tgVal = parseNumber(obj[h]); break; }
          }
        }
        // meta normalized
        obj.__meta = {
          total_general: isNaN(tgVal) ? 0 : tgVal,
          norm: {
            sede: normalizeForSearch(obj["SEDE"] || ''),
            inst: normalizeForSearch(obj["INSTITUCION"] || ''),
            mun: normalizeForSearch(obj["MUNICIPIO"] || ''),
            ubic: normalizeForSearch(obj["UBICACION"] || ''),
            full: normalizeForSearch(Object.values(obj).join(' '))
          },
          cod_sede: normalizeForSearch(obj["COD_SEDE_DANE"] || ''),
          cod_ie: normalizeForSearch(obj["COD_IE_DANE"] || '')
        };
        return obj;
      });

      // header indices
      indices.municipio = findHeaderVisible("MUNICIPIO");
      indices.institucion = findHeaderVisible("INSTITUCION");
      indices.sede = findHeaderVisible("SEDE");
      indices.cod_sede = findHeaderVisible("COD_SEDE_DANE");
      indices.cod_ie = findHeaderVisible("COD_IE_DANE");
      indices.total_general = findHeaderVisible("TOTAL GENERAL") !== -1 ? findHeaderVisible("TOTAL GENERAL") : findHeaderVisible("TOTAL_GENERAL");
      indices.ubicacion = findHeaderVisible("UBICACION");
      indices.status = findHeaderVisible("STATUS");

      filtered = []; 
      computeAndRenderSummary(); 
      initUI();
    }, error: function (err) {
      document.getElementById('loading').textContent = 'Error leyendo CSV: ' + (err && err.message ? err.message : JSON.stringify(err));
    }
  });
}
function findHeaderVisible(name) {
  const U = (name || '').toUpperCase();
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i].visible.toUpperCase() === U) return i;
  }
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i].visible.toUpperCase().includes(U)) return i;
  }
  return -1;
}

/* ================= UI init ================= */
function initUI() {
  document.getElementById('loading').style.display = 'none';
  populateMunicipios();

  // CAJON1 (LOCALIZADOR)
  const sbLocal = document.getElementById('searchLocal');
  let debounceLocal = null;
  sbLocal.addEventListener('input', (e) => {
    clearTimeout(debounceLocal);
    debounceLocal = setTimeout(() => onLocalInput(e.target.value), DEBOUNCE_MS);
  });
  document.getElementById('clearLocal').addEventListener('click', () => {
    sbLocal.value = ''; clearLocalSuggestions(); 
    filtered = []; showTable = false; toggleView(); document.getElementById('activeFilters').textContent = ''; computeAndRenderSummary();
  });
  sbLocal.addEventListener('keydown', (e) => keyboardNavHandler(e, 'local'));

  // CAJON2 (CATEGORIZACION)
  const sbCat = document.getElementById('searchCategory');
  let debounceCat = null;
  sbCat.addEventListener('input', (e) => {
    clearTimeout(debounceCat);
    debounceCat = setTimeout(() => onCategoryInput(e.target.value), DEBOUNCE_MS);
  });
  document.getElementById('clearCat').addEventListener('click', () => {
    sbCat.value = ''; clearCatSuggestions(); filtered = []; showTable = false; toggleView(); document.getElementById('activeFilters').textContent = ''; computeAndRenderSummary();
  });
  sbCat.addEventListener('keydown', (e) => keyboardNavHandler(e, 'cat'));

  document.addEventListener('click', (ev) => {
    const listLocal = document.getElementById('suggestLocal');
    const listCat = document.getElementById('suggestCat');
    if (!listLocal.contains(ev.target) && ev.target !== sbLocal) clearLocalSuggestions();
    if (!listCat.contains(ev.target) && ev.target !== sbCat) clearCatSuggestions();
  });

  document.getElementById('applyFilters').addEventListener('click', () => applyFiltersFromUI());
  document.getElementById('resetFilters').addEventListener('click', () => { document.getElementById('filterMunicipio').value = ''; filtered = []; showTable = false; toggleView(); document.getElementById('activeFilters').textContent = ''; computeAndRenderSummary(); });

  document.getElementById('closeModal').addEventListener('click', () => document.getElementById('modalBack').style.display = 'none');

  toggleView();
}

/* populate municipios filter */
function populateMunicipios() {
  const setM = new Set();
  rows.forEach(r => {
    const v = safeText(r[headerRow[indices.municipio]?.visible]);
    if (v.trim()) setM.add(v.trim());
  });
  const sel = document.getElementById('filterMunicipio');
  sel.innerHTML = '<option value="">— Todos —</option>';
  Array.from(setM).sort((a, b) => a.localeCompare(b)).forEach(v => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = v; sel.appendChild(opt);
  });
}

/* ================= Keyboard nav for suggestions ================= */
function keyboardNavHandler(e, kind) {
  const listEl = (kind === 'local') ? document.getElementById('suggestLocal') : document.getElementById('suggestCat');
  if (listEl.style.display === 'none') return;
  const items = Array.from(listEl.querySelectorAll('.suggest-item'));
  if (items.length === 0) return;
  let activeIndex = items.findIndex(i => i.classList.contains('active'));
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(items.length - 1, activeIndex + 1); items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex)); items[activeIndex].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex)); items[activeIndex].focus(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex === -1) activeIndex = 0; items[activeIndex].click(); }
  else if (e.key === 'Escape') { clearLocalSuggestions(); clearCatSuggestions(); }
}

/* ================= LOCALIZADOR: dedupe key ================= */
function uniqueKeyForRow(r) {
  const codS = (r["COD_SEDE_DANE"] || r["COD_SEDE_DANE "] || '').trim();
  const codI = (r["COD_IE_DANE"] || r["COD_IE_DANE "] || '').trim();
  if (codS) return `S:${codS.toLowerCase()}`;
  if (codI) return `I:${codI.toLowerCase()}`;
  return `K:${safeText(r["SEDE"]).toLowerCase()}|${safeText(r["INSTITUCION"]).toLowerCase()}|${safeText(r["MUNICIPIO"]).toLowerCase()}`;
}

/* searchCandidatesLocal improved with dedupe and prioritization */
function searchCandidatesLocal(q) {
  if (!q || q.trim().length < 2) return [];
  const qn = normalizeForSearch(q);
  if (queryCacheLocal.has(qn)) return queryCacheLocal.get(qn);

  const cand = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const valMap = {
      "MUNICIPIO": r.__meta.norm.mun || '',
      "COD_IE_DANE": r.__meta.cod_ie || '',
      "INSTITUCION": r.__meta.norm.inst || '',
      "COD_SEDE_DANE": r.__meta.cod_sede || '',
      "SEDE": r.__meta.norm.sede || '',
      "UBICACION": r.__meta.norm.ubic || ''
    };
    let matched = false;
    let score = 999;
    let matchedField = null;

    for (let p = 0; p < CAJON1_FIELDS.length; p++) {
      const field = CAJON1_FIELDS[p];
      const fv = (valMap[field] || '');
      if (fv && fv.startsWith(qn)) { matched = true; score = p + 1; matchedField = field; break; }
    }
    if (!matched) {
      for (let p = 0; p < CAJON1_FIELDS.length; p++) {
        const field = CAJON1_FIELDS[p];
        const fv = (valMap[field] || '');
        if (fv && fv.includes(qn)) { matched = true; score = 20 + p; matchedField = field; break; }
      }
    }
    if (!matched && r.__meta.norm.full.includes(qn)) { matched = true; score = 50; matchedField = 'OTHER'; }

    if (matched) {
      const pos = (valMap[matchedField] || '').indexOf(qn);
      const finalScore = score + (pos >= 0 ? pos / 1000 : 0);
      cand.push({ row: r, score: finalScore, matchedField });
    }
  }

  cand.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const ta = a.row.__meta.total_general || 0;
    const tb = b.row.__meta.total_general || 0;
    if (ta !== tb) return tb - ta;
    return safeText(a.row["SEDE"] || a.row["INSTITUCION"] || '').localeCompare(safeText(b.row["SEDE"] || b.row["INSTITUCION"] || ''));
  });

  const seen = new Set(); const unique = [];
  for (const c of cand) {
    const key = uniqueKeyForRow(c.row);
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
    if (unique.length >= 500) break;
  }

  queryCacheLocal.set(qn, unique);
  return unique;
}

/* build suggestion element for local */
function buildLocalSuggestionElement(candidate, q) {
  const r = candidate.row;
  const matched = candidate.matchedField || 'SEDE';
  const qstr = q;
  const inst = safeText(r["INSTITUCION"]);
  const sede = safeText(r["SEDE"]);
  const ubic = safeText(r["UBICACION"]);
  const muni = safeText(r["MUNICIPIO"]);
  const codS = safeText(r["COD_SEDE_DANE"]);
  const codI = safeText(r["COD_IE_DANE"]);
  const status = safeText(r["STATUS"] || r["Status"] || r["status"] || '');
  const hasCierre = /cier/i.test(status);

  const qn = normalizeForSearch(qstr);
  const isCodeSearch = (normalizeForSearch(codS).startsWith(qn) || normalizeForSearch(codI).startsWith(qn));

  const lines = [];
  if (isCodeSearch) {
    if (normalizeForSearch(codS).startsWith(qn)) lines.push(['Código Sede', codS]);
    else if (normalizeForSearch(codI).startsWith(qn)) lines.push(['Código IE', codI]);
    lines.push(['SEDE', sede || '—']);
    lines.push(['INSTITUCIÓN', inst || '—']);
    lines.push(['UBICACIÓN', ubic || '—']);
    lines.push(['MUNICIPIO', muni || '—']);
  } else {
    lines.push(['SEDE', sede || (safeText(r[matched]) || '—')]);
    lines.push(['INSTITUCIÓN', inst || '—']);
    lines.push(['UBICACIÓN', ubic || '—']);
    if (hasCierre) lines.push(['Estado', status]);
    else lines.push(['MUNICIPIO', muni || '—']);
  }

  const div = document.createElement('div'); div.className = 'suggest-item'; div.tabIndex = 0;
  lines.forEach((ln, idx) => {
    const lineEl = document.createElement('div');
    if (idx === 0) {
      lineEl.className = 'suggest-line-main';
      lineEl.appendChild(buildHighlightedFragment(ln[1], qstr));
    } else {
      lineEl.className = 'suggest-line-sub';
      lineEl.appendChild(buildHighlightedFragment(ln[1], qstr));
    }
    div.appendChild(lineEl);
  });

  div.addEventListener('click', () => {
    filtered = [r];
    showTable = true; toggleView();
    document.getElementById('activeFilters').textContent = `Sugerencia: ${sede || inst}`;
    clearLocalSuggestions();
    document.getElementById('searchCategory').value = ''; clearCatSuggestions();
    renderTableReset();
    document.getElementById('dataTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return div;
}

function renderLocalSuggestions(q) {
  const el = document.getElementById('suggestLocal');
  el.innerHTML = '';
  if (!q || q.trim().length < 2) { el.style.display = 'none'; return; }
  const cands = searchCandidatesLocal(q);
  if (!cands.length) { const none = document.createElement('div'); none.className = 'suggest-item'; none.textContent = 'No se encontraron sugerencias'; el.appendChild(none); el.style.display = 'block'; return; }
  const top = cands.slice(0, SUGGEST_LIMIT);
  top.forEach(c => el.appendChild(buildLocalSuggestionElement(c, q)));
  el.style.display = 'block';
}
function clearLocalSuggestions() { const el = document.getElementById('suggestLocal'); el.innerHTML = ''; el.style.display = 'none'; }

function onLocalInput(val) { renderLocalSuggestions(val); }

/* ================= CATEGORIZACIÓN ================= */

function headerBaseLabel(h) {
  let b = h.replace(/\b(19|20)\d{2}\b/g, ''); 
  b = b.replace(/\s*[-_()\/\\].*/g, ''); 
  b = b.replace(/\s{2,}/g, ' ').trim();
  return b;
}

function searchCategoryHeaders(q) {
  if (!q || q.trim().length < 2) return [];
  const qn = normalizeForSearch(q);
  if (queryCacheCat.has(qn)) return queryCacheCat.get(qn);

  const baseMap = {};
  for (let i = 0; i < headerRow.length; i++) {
    const hv = headerRow[i].visible || '';
    const hvn = normalizeForSearch(hv);
    if (hvn.includes(qn)) {
      const base = headerBaseLabel(hv);
      if (!baseMap[base]) baseMap[base] = [];
      baseMap[base].push({ idx: i, header: hv });
    } else {
      for (const allow of CAJON2_INDEXABLE_HEADERS) {
        if (hv.toUpperCase().includes(allow.toUpperCase()) && normalizeForSearch(allow).includes(qn)) {
          const base = headerBaseLabel(hv);
          if (!baseMap[base]) baseMap[base] = [];
          baseMap[base].push({ idx: i, header: hv });
        }
      }
    }
  }

  const results = [];
  for (const base of Object.keys(baseMap)) {
    const hdrs = baseMap[base];
    let countAny = 0;
    const topMun = {};
    rows.forEach(r => {
      let any = false;
      for (const h of hdrs) { if (safeText(r[h.header]).trim() !== '') { any = true; break; } }
      if (any) {
        countAny++;
        const muni = safeText(r["MUNICIPIO"]);
        if (muni) topMun[muni] = (topMun[muni] || 0) + 1;
      }
    });
    results.push({ base, headers: hdrs.map(x => x.header), countAny, topMun });
  }

  results.sort((a, b) => b.countAny - a.countAny);
  queryCacheCat.set(qn, results);
  return results;
}

function buildCategorySuggestionElement(result, q) {
  const div = document.createElement('div'); div.className = 'suggest-item'; div.tabIndex = 0;
  const main = document.createElement('div'); main.className = 'suggest-line-main';
  main.appendChild(buildHighlightedFragment(result.base, q));
  const sub = document.createElement('div'); sub.className = 'suggest-line-sub';
  const topMunList = Object.entries(result.topMun || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => `${x[0]}(${x[1]})`).join(', ');
  sub.textContent = `Sedes con dato: ${result.countAny} · Top municipios: ${topMunList}`;
  div.appendChild(main); div.appendChild(sub);

  div.addEventListener('click', () => {
    activeCategoryHeaders = result.headers.slice();
    const matchesRows = rows.filter(r => {
      for (const h of activeCategoryHeaders) { if (safeText(r[h]).trim() !== '') return true; }
      return false;
    });
    filtered = matchesRows;
    showTable = true; toggleView();
    document.getElementById('activeFilters').textContent = `Categoría: ${result.base} (${filtered.length} sedes)`;
    document.getElementById('searchLocal').value = ''; clearLocalSuggestions();
    clearCatSuggestions();
    renderTableReset();
    document.getElementById('dataTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return div;
}

function renderCatSuggestions(q) {
  const el = document.getElementById('suggestCat');
  el.innerHTML = '';
  if (!q || q.trim().length < 2) { el.style.display = 'none'; return; }
  const matches = searchCategoryHeaders(q);
  if (!matches.length) { const none = document.createElement('div'); none.className = 'suggest-item'; none.textContent = 'No se encontraron encabezados'; el.appendChild(none); el.style.display = 'block'; return; }
  const top = matches.slice(0, SUGGEST_LIMIT);
  top.forEach(m => el.appendChild(buildCategorySuggestionElement(m, q)));
  el.style.display = 'block';
}
function clearCatSuggestions() { const el = document.getElementById('suggestCat'); el.innerHTML = ''; el.style.display = 'none'; }

function onCategoryInput(val) { renderCatSuggestions(val); }

/* ================= Table rendering & modal ================= */

function getTotalGeneralDisplay(row) {
  const variants = ["TOTAL GENERAL", "TOTAL_GENERAL", "TOTALGENERAL", "TOTAL", "Total General", "Total_General"];
  for (const v of variants) { if (row[v] !== undefined && safeText(row[v]) !== '') return safeText(row[v]); }
  if (row.__meta && row.__meta.total_general !== undefined) return String(row.__meta.total_general);
  return '';
}

function renderTableReset() {
  const table = document.getElementById('dataTable');
  table.innerHTML = '';
  const baseCols = ["MUNICIPIO", "INSTITUCION", "SEDE", "TOTAL GENERAL", "STATUS"];
  const extra = activeCategoryHeaders && activeCategoryHeaders.length ? activeCategoryHeaders.slice(0, 10) : [];
  const visibleCols = baseCols.concat(extra);

  const thead = document.createElement('thead'); const trh = document.createElement('tr');
  visibleCols.forEach(c => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const toShow = filtered.slice(0, 2000); 
  toShow.forEach(row => {
    const tr = document.createElement('tr');
    visibleCols.forEach(col => {
      const td = document.createElement('td');
      if (col === "TOTAL GENERAL") {
        td.textContent = getTotalGeneralDisplay(row);
      } else {
        td.textContent = safeText(row[col]);
      }
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => openModalDetail(row));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  document.getElementById('resultsCount').textContent = filtered.length;
}

function openModalDetail(row) {
  document.getElementById('modalTitle').textContent = row["INSTITUCION"] || 'Detalle';
  const body = document.getElementById('modalBody'); body.innerHTML = '';
  const t = document.createElement('table');
  for (const key of Object.keys(row)) {
    if (/COD_IE_DANE|COD_SEDE_DANE/i.test(key)) continue; 
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.style.fontWeight = '700'; td1.style.width = '35%'; td1.textContent = key;
    const td2 = document.createElement('td'); td2.textContent = safeText(row[key]);
    tr.appendChild(td1); tr.appendChild(td2); t.appendChild(tr);
  }
  body.appendChild(t);
  document.getElementById('modalBack').style.display = 'flex';
}

/* ================= Filters UI apply ================= */
function applyFiltersFromUI() {
  const mun = document.getElementById('filterMunicipio').value.trim();
  if (!mun) { filtered = []; showTable = false; toggleView(); document.getElementById('activeFilters').textContent = ''; computeAndRenderSummary(); return; }
  filtered = rows.filter(r => safeText(r["MUNICIPIO"]).trim() === mun);
  activeCategoryHeaders = []; showTable = true; toggleView();
  document.getElementById('activeFilters').textContent = `Municipio: ${mun}`;
  renderTableReset();
}

/* ================= Summary / KPIs / Chart ================= */
let chartInstance = null;
function computeAndRenderSummary() {
  const totalSedes = rows.length;
  let sumTotal = 0;
  const countsByMun = {};
  rows.forEach(r => {
    const tg = r.__meta && r.__meta.total_general ? r.__meta.total_general : 0;
    sumTotal += tg;
    const m = safeText(r["MUNICIPIO"]) || 'SIN MUNICIPIO';
    countsByMun[m] = (countsByMun[m] || 0) + 1;
  });
  document.getElementById('kpiTotal').textContent = Intl.NumberFormat('es-CO').format(sumTotal || 0);
  document.getElementById('kpiSedes').textContent = Intl.NumberFormat('es-CO').format(totalSedes || 0);
  const items = Object.entries(countsByMun).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = items.map(x => x[0]);
  const data = items.map(x => x[1]);
  renderChart(labels, data);
}

function renderChart(labels, data) {
  const ctx = document.getElementById('chartSedes').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sedes', data }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function toggleView() {
  const summ = document.getElementById('summaryArea');
  const tabWrap = document.getElementById('tablaWrapper');
  if (showTable) {
    summ.style.display = 'none';
    tabWrap.style.display = '';
    document.getElementById('dataTable').style.display = '';
  } else {
    summ.style.display = '';
    tabWrap.style.display = 'none';
  }
}

function clearLocalSuggestions() { const el = document.getElementById('suggestLocal'); el.innerHTML = ''; el.style.display = 'none'; }
function clearCatSuggestions() { const el = document.getElementById('suggestCat'); el.innerHTML = ''; el.style.display = 'none'; }

(function init() { loadCSV(); })();
