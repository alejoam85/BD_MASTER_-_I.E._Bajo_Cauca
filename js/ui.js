/**
 * ui.js
 * Lógica UI: tabla, paginación, limpieza, integración entre módulos
 */

(function(){
  // state
  window.__activeFiltered = []; // rows to display in table
  window.__activeCategoryHeaders = [];

  document.addEventListener('dataset:loaded', ()=>{
    // initial render: summary charts shown, table hidden
    document.getElementById('summary-charts').style.display = 'block';
    document.getElementById('table-container').classList.add('hidden');
    // hook clear buttons
    setupButtons();
    // render charts initially
    try { window.VisCharts.renderCharts(); } catch(e){ console.warn(e); }
  });

  function setupButtons(){
    const more = document.getElementById('table-more-btn');
    const clear = document.getElementById('btn-clear');
    more.addEventListener('click', ()=>{ TABLE_OFFSET += TABLE_PAGE_SIZE; renderTableWithPagination(false); });
    clear.addEventListener('click', ()=>{ clearAll(); });
    // events to update table when localizador or categorizacion selects
    document.addEventListener('localizador:selected', (e)=>{ window.__activeFiltered = [ e.detail.row ]; renderTableWithPagination(true); document.getElementById('table-container').classList.remove('hidden'); updateResultsCount(window.__activeFiltered.length); });
    document.addEventListener('categorizacion:selected', (e)=>{ /* handled by categorization module */ });
  }

  function clearAll(){
    window.__activeFiltered = [];
    window.__activeCategoryHeaders = [];
    document.getElementById('search1').value = "";
    document.getElementById('search2').value = "";
    document.getElementById('suggestions1').innerHTML = ""; document.getElementById('suggestions1').style.display='none';
    document.getElementById('suggestions2').innerHTML = ""; document.getElementById('suggestions2').style.display='none';
    document.getElementById('table-container').classList.add('hidden');
    document.getElementById('results-count').textContent = '0';
    document.getElementById('results-info').textContent = 'La vista inicial muestra resumen. Use los buscadores para filtrar.';
    // show charts
    document.getElementById('summary-charts').style.display = 'block';
  }

  // TABLE rendering with pagination
  let TABLE_PAGE_SIZE = 10;
  let TABLE_OFFSET = 0;

  function renderTableWithPagination(reset=false){
    if (reset) TABLE_OFFSET = 0;
    const table = document.getElementById('data-table');
    if (!table) return;
    table.innerHTML = "";
    const baseCols = ['MUNICIPIO','INSTITUCION','SEDE','TOTAL GENERAL','Status'];
    const headersRow = document.createElement('thead'); const trh = document.createElement('tr');
    const hdrKeys = [];
    for (const c of baseCols){
      const key = Utils.findHeaderKey(c) || c;
      hdrKeys.push(key);
      const th = document.createElement('th'); th.textContent = c; trh.appendChild(th);
    }
    // add active category headers if any
    for (const h of (window.__activeCategoryHeaders || [])){
      const th = document.createElement('th'); th.textContent = h; trh.appendChild(th); hdrKeys.push(h);
    }
    headersRow.appendChild(trh); table.appendChild(headersRow);

    const tbody = document.createElement('tbody');
    const rows = window.__activeFiltered || [];
    const sliceRows = rows.slice(TABLE_OFFSET, TABLE_OFFSET + TABLE_PAGE_SIZE);
    for (const r of sliceRows){
      const tr = document.createElement('tr');
      for (const h of hdrKeys){
        const td = document.createElement('td'); td.textContent = String(r[h] || ""); tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    // more button
    const moreBtn = document.getElementById('table-more-btn');
    if (rows.length > TABLE_OFFSET + TABLE_PAGE_SIZE) { moreBtn.classList.remove('hidden'); } else { moreBtn.classList.add('hidden'); }
  }

  function updateResultsCount(n){ const el = document.getElementById('results-count'); if (el) el.textContent = n; }

  // Provide global helper render function used by modules
  window.renderTableWithPagination = function(reset){ renderTableWithPagination(reset); };
  window.updateResultsCount = updateResultsCount;

})();

