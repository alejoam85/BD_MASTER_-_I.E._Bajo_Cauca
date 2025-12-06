/**
 * search-localizador.js
 * Implementa CAJÓN 1: LOCALIZADOR inteligente de I.E (lógica avanzada)
 */

(function(){
  // wait for dataset
  document.addEventListener('dataset:loaded', () => {
    setupLocalizador();
  });

  function setupLocalizador(){
    const input = document.getElementById('search1');
    const sug = document.getElementById('suggestions1');
    if (!input || !sug) return;

    function clear() { input.value = ""; sug.innerHTML=""; sug.style.display='none'; updateResultsCount(0); showSummaryView(); }

    input.addEventListener('input', debounce((e)=>{
      const q = e.target.value;
      if (!q || q.trim().length < 2){ sug.style.display='none'; showSummaryView(); return; }
      hideSummaryCharts();
      renderLocalSuggestions(q);
    }, 180));

    // click outside to clear suggestions
    document.addEventListener('click', function(ev){
      if (!sug.contains(ev.target) && ev.target !== input) { sug.style.display='none'; }
    });

    // when a selection is made elsewhere, clear this
    document.addEventListener('localizador:clear', clear);
    document.addEventListener('categorizacion:selected', clear);
  }

  // debounce util (local)
  function debounce(fn, ms=180){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); }; }

  function updateResultsCount(n){ const el = document.getElementById('results-count'); if (el) el.textContent = n; }
  function hideSummaryCharts(){ const sc = document.getElementById('summary-charts'); if (sc) sc.style.display='none'; }
  function showSummaryView(){ const sc = document.getElementById('summary-charts'); if (sc) sc.style.display='block'; document.getElementById('table-container').classList.add('hidden'); }

  // search candidates
  function searchLocalCandidates(q){
    const qn = Utils.normalizeForSearch(q);
    const rows = window.DATASET || [];
    const results = [];
    for (const row of rows){
      // fields to search exactly as requested (use raw headers lookup)
      const muni = row[ Utils.findHeaderKey('MUNICIPIO') ] || "";
      const cod_ie = row[ Utils.findHeaderKey('COD_IE_DANE') ] || row[ Utils.findHeaderKey('COD_IE') ] || "";
      const inst = row[ Utils.findHeaderKey('INSTITUCION') ] || "";
      const cod_sede = row[ Utils.findHeaderKey('COD_SEDE_DANE') ] || row[ Utils.findHeaderKey('COD_SEDE') ] || "";
      const sede = row[ Utils.findHeaderKey('SEDE') ] || "";
      // UBICACIÓN variants
      const ubic = row[ Utils.findHeaderKey('UBICACIÓN') ] || row[ Utils.findHeaderKey('UBICACION') ] || row[ Utils.findHeaderKey('UBICACIÃN') ] || "";

      const fields = [
        {k:'SEDE', v:Utils.normalizeForSearch(sede)},
        {k:'INSTITUCION', v:Utils.normalizeForSearch(inst)},
        {k:'UBICACION', v:Utils.normalizeForSearch(ubic)},
        {k:'MUNICIPIO', v:Utils.normalizeForSearch(muni)},
        {k:'COD_SEDE', v:Utils.normalizeForSearch(cod_sede)},
        {k:'COD_IE', v:Utils.normalizeForSearch(cod_ie)}
      ];

      let matched = false; let score = 999; let matchedField = null;

      // priority: startsWith on fields in order SEDE, INSTITUCION, UBICACION, MUNICIPIO, CODES
      for (let i=0;i<fields.length;i++){
        if (fields[i].v.startsWith(qn)){ matched = true; score = i+1; matchedField = fields[i].k; break; }
      }
      if (!matched){
        for (let i=0;i<fields.length;i++){
          if (fields[i].v.includes(qn)){ matched = true; score = 20 + i; matchedField = fields[i].k; break; }
        }
      }
      if (!matched){
        // fallback: fulltext join
        const full = Utils.normalizeForSearch( Object.values(row).join(' ') );
        if (full.includes(qn)){ matched = true; score = 500; matchedField = null; }
      }
      if (matched) results.push({row,score,matchedField});
    }

    // sort by score asc then Total General desc
    results.sort((a,b)=>{
      if (a.score !== b.score) return a.score - b.score;
      const ta = Utils.getTotalGeneral(a.row), tb = Utils.getTotalGeneral(b.row);
      if (ta !== tb) return tb - ta;
      return 0;
    });

    // dedupe keep first occurrence per key
    const seen = new Set(); const unique = [];
    for (const it of results){
      const key = Utils.getRowKey(it.row);
      if (!seen.has(key)){ seen.add(key); unique.push(it); }
    }
    return unique;
  }

  // build suggestion DOM: 4 lines (or 5 if code)
  function buildSuggestionLocal(it, q){
    const r = it.row; const qn = q;
    const item = document.createElement('div'); item.className='suggestion-item'; item.tabIndex = 0;
    item.style.fontSize = '12px'; item.style.lineHeight='1.05';
    const cod_s = r[ Utils.findHeaderKey('COD_SEDE_DANE') ] || r[ Utils.findHeaderKey('COD_SEDE') ] || "";
    const cod_i = r[ Utils.findHeaderKey('COD_IE_DANE') ] || r[ Utils.findHeaderKey('COD_IE') ] || "";

    // decide if search looks like a code
    const isCode = (Utils.normalizeForSearch(qn).length>0) && (Utils.normalizeForSearch(cod_s).startsWith(Utils.normalizeForSearch(qn)) || Utils.normalizeForSearch(cod_i).startsWith(Utils.normalizeForSearch(qn)));

    const lines = [];

    if (isCode){
      if (cod_s && Utils.normalizeForSearch(String(cod_s)).startsWith(Utils.normalizeForSearch(qn))) lines.push(['Código Sede', cod_s]);
      else if (cod_i && Utils.normalizeForSearch(String(cod_i)).startsWith(Utils.normalizeForSearch(qn))) lines.push(['Código IE', cod_i]);
      lines.push(['SEDE', r[ Utils.findHeaderKey('SEDE') ] || "—"]);
      lines.push(['INSTITUCION', r[ Utils.findHeaderKey('INSTITUCION') ] || "—"]);
      lines.push(['UBICACIÓN', r[ Utils.findHeaderKey('UBICACIÓN') ] || r[ Utils.findHeaderKey('UBICACION') ] || r[ Utils.findHeaderKey('UBICACIÃN') ] || "—"]);
      lines.push(['MUNICIPIO', r[ Utils.findHeaderKey('MUNICIPIO') ] || "—"]);
    } else {
      lines.push(['SEDE', r[ Utils.findHeaderKey('SEDE') ] || "—"]);
      lines.push(['INSTITUCION', r[ Utils.findHeaderKey('INSTITUCION') ] || "—"]);
      const statusV = r[ Utils.findHeaderKey('Status') ] || r[ Utils.findHeaderKey('STATUS') ] || "";
      const isCierre = /cier/i.test(String(statusV || ""));
      if (isCierre){
        lines.push(['Estado', statusV || "Cierre"]);
      } else {
        lines.push(['UBICACIÓN', r[ Utils.findHeaderKey('UBICACIÓN') ] || r[ Utils.findHeaderKey('UBICACION') ] || r[ Utils.findHeaderKey('UBICACIÃN') ] || "—"]);
      }
      lines.push(['MUNICIPIO', r[ Utils.findHeaderKey('MUNICIPIO') ] || "—"]);
    }

    for (let i=0;i<lines.length;i++){
      const d = document.createElement('div');
      if (i===0) { d.style.fontWeight='700'; } else { d.style.color='#444'; d.style.fontSize='12px'; }
      const frag = Utils.buildHighlightedFrag(String(lines[i][1]||''), qn);
      d.appendChild(frag);
      item.appendChild(d);
    }

    item.addEventListener('click', ()=>{
      // select this row => show table with only this row
      const tableRows = [r];
      window.__activeFiltered = tableRows;
      window.__activeCategoryHeaders = [];
      // dispatch event
      document.dispatchEvent(new CustomEvent('localizador:selected', { detail:{ row:r } }));
      // render table and show
      document.getElementById('table-container').classList.remove('hidden');
      renderTableWithPagination(true);
      updateResultsCount(tableRows.length);
      // clear inputs
      document.dispatchEvent(new CustomEvent('localizador:clear'));
      scrollToTable();
    });

    return item;
  }

  function renderLocalSuggestions(q){
    const container = document.getElementById('suggestions1');
    container.innerHTML = "";
    const cands = searchLocalCandidates(q).slice(0,3);
    if (!cands || cands.length === 0){
      const none = document.createElement('div'); none.className='suggestion-item'; none.textContent = 'No se encontraron sugerencias'; container.appendChild(none); container.style.display='';
      return;
    }
    for (const c of cands){ container.appendChild(buildSuggestionLocal(c,q)); }
    container.style.display='';
  }

  // helpers for table rendering (shared with ui.js; we keep local simple wrappers)
  function updateResultsCount(n){ const el = document.getElementById('results-count'); if (el) el.textContent = n; }
  function scrollToTable(){ const t = document.getElementById('table-container'); if (t) t.scrollIntoView({behavior:'smooth'}); }
  // expose for ui module
  window.Localizador = { renderLocalSuggestions, searchLocalCandidates };
})();

