/**
 * search-categorizacion.js
 * Implementa CAJÓN 2: búsqueda por encabezados (agrupación de proyectos)
 */

(function(){
  document.addEventListener('dataset:loaded', () => {
    setupCategorizacion();
  });

  function setupCategorizacion(){
    const input = document.getElementById('search2');
    const sug = document.getElementById('suggestions2');
    if (!input || !sug) return;

    input.addEventListener('input', debounce((e)=>{
      const q = e.target.value;
      if (!q || q.trim().length < 2){ sug.style.display='none'; showSummaryView(); return; }
      hideSummaryCharts();
      renderCategorySuggestions(q);
    },180));

    document.addEventListener('click', (ev)=>{
      if (!sug.contains(ev.target) && ev.target !== input) sug.style.display='none';
    });

    document.addEventListener('localizador:clear', ()=>{ input.value=""; sug.innerHTML=""; sug.style.display='none'; });
  }

  function debounce(fn, ms=180){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); }; }
  function hideSummaryCharts(){ const sc = document.getElementById('summary-charts'); if (sc) sc.style.display='none'; }
  function showSummaryView(){ const sc = document.getElementById('summary-charts'); if (sc) sc.style.display='block'; document.getElementById('table-container').classList.add('hidden'); }

  // build groups: base label -> array of raw headers
  function buildHeaderGroups(){
    const headers = window.RAW_HEADERS || [];
    const map = {};
    for (const h of headers){
      if (!h) continue;
      // remove year tokens (simple)
      const base = h.replace(/\b(19|20)\d{2}\b/g,'').replace(/[_\-\(\)]/g,' ').replace(/\s+/g,' ').trim();
      if (!map[base]) map[base]=[];
      map[base].push(h);
    }
    return map;
  }

  function searchCategoryGroups(q){
    const baseQ = Utils.normalizeForSearch(q);
    const groups = buildHeaderGroups();
    const out = [];
    for (const base in groups){
      const baseNorm = Utils.normalizeForSearch(base);
      if (baseNorm.includes(baseQ) || groups[base].some(h => Utils.normalizeForSearch(h).includes(baseQ))){
        // count rows where any of these headers has a non-empty value
        let countAny = 0; const topMun = {};
        for (const r of window.DATASET || []){
          let any = false;
          for (const h of groups[base]) { if (String(r[h] || "").trim() !== "") { any = true; break; } }
          if (any){ countAny++; const m = r[ Utils.findHeaderKey('MUNICIPIO') ] || "SIN MUNICIPIO"; topMun[m] = (topMun[m]||0)+1; }
        }
        out.push({ base, headers: groups[base], countAny, topMun });
      }
    }
    out.sort((a,b)=>b.countAny - a.countAny);
    return out;
  }

  function buildCategorySuggestionDOM(result){
    const div = document.createElement('div'); div.className='suggestion-item'; div.tabIndex=0; div.style.fontSize='12px';
    const main = document.createElement('div'); main.style.fontWeight='700'; main.textContent = result.base;
    const sub = document.createElement('div'); sub.style.color='#555'; const top = Object.entries(result.topMun || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>`${x[0]}(${x[1]})`).join(", ");
    sub.textContent = `Sedes con dato: ${result.countAny} · Top municipios: ${top}`;
    div.appendChild(main); div.appendChild(sub);

    div.addEventListener('click', ()=>{
      // select category: show rows where any header in result.headers is non-empty
      const headers = result.headers.slice();
      const rows = (window.DATASET || []).filter(r => headers.some(h => String(r[h]||"").trim() !== ""));
      window.__activeFiltered = rows;
      window.__activeCategoryHeaders = headers;
      document.getElementById('table-container').classList.remove('hidden');
      renderTableWithPagination(true);
      updateResultsCount(rows.length);
      // dispatch event to clear localizador
      document.dispatchEvent(new CustomEvent('categorizacion:selected', { detail:{ headers } }));
      // clear input and suggestions
      document.dispatchEvent(new CustomEvent('localizador:clear'));
      document.getElementById('suggestions2').style.display='none';
      scrollToTable();
    });

    return div;
  }

  function renderCategorySuggestions(q){
    const cont = document.getElementById('suggestions2'); cont.innerHTML='';
    const results = searchCategoryGroups(q).slice(0,3);
    if (!results || results.length===0){ const none = document.createElement('div'); none.className='suggestion-item'; none.textContent='No se encontraron encabezados'; cont.appendChild(none); cont.style.display=''; return; }
    results.forEach(r=>cont.appendChild(buildCategorySuggestionDOM(r)));
    cont.style.display='';
  }

  function updateResultsCount(n){ const el = document.getElementById('results-count'); if (el) el.textContent = n; }
  function scrollToTable(){ const t = document.getElementById('table-container'); if (t) t.scrollIntoView({behavior:'smooth'}); }

  // expose minimal API
  window.Categorizacion = { searchCategoryGroups };
})();

