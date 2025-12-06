/**
 * charts.js
 * Renderiza Gráfica1 y Gráfica2 usando Chart.js
 */

(function(){
  document.addEventListener('dataset:loaded', () => {
    try { renderCharts(); } catch(e){ console.warn(e); }
  });

  let CH1=null, CH2=null;

  function computeSummary(){
    const headers = window.RAW_HEADERS || [];
    const rows = window.DATASET || [];
    const muniKey = Utils.findHeaderKey('MUNICIPIO');
    const zonaKey = Utils.findHeaderKey('ZONA');
    const statusKey = Utils.findHeaderKey('Status') || Utils.findHeaderKey('STATUS');
    const sectorKey = Utils.findHeaderKey('SECTOR');
    const projectHints = ["NIDO","ESC_VIDA","BATUTA","PASC","ATAL","FCC","BECA","PC","BIBLIOGRAFICA","DEPORTIVA","INFRAEST","LEGALIZACION","BIENESTAR","SENA","COMFAMA","AGUA","CONECTIVIDAD","EMBELLECIMIENTO"];
    const projectCols = headers.filter(h=>{
      const hn = Utils.normalizeForSearch(h);
      return projectHints.some(ph => hn.includes(ph.toLowerCase()));
    });

    const summary = { municipios:{}, proyectosPorSede:{} };

    for (const r of rows){
      const muni = r[muniKey] || "SIN MUNICIPIO";
      if (!summary.municipios[muni]) summary.municipios[muni] = { sedesActivas:0, sedesRural:0, sedesUrbano:0, totalEst:0, ruralEst:0, urbanoEst:0 };
      const status = r[statusKey] || "";
      const sector = r[sectorKey] || "";
      const isActive = /ACTIV/i.test(String(status || ""));
      const isOfficial = /OFICIAL/i.test(String(sector || ""));
      if (isActive && isOfficial){
        summary.municipios[muni].sedesActivas++;
        const z = String(r[zonaKey] || "");
        if (/RURAL/i.test(z)) summary.municipios[muni].sedesRural++; else summary.municipios[muni].sedesUrbano++;
        const tg = Utils.getTotalGeneral(r);
        summary.municipios[muni].totalEst += tg;
        if (/RURAL/i.test(z)) summary.municipios[muni].ruralEst += tg; else summary.municipios[muni].urbanoEst += tg;
      }
      // proyectos por sede
      const key = Utils.getRowKey(r);
      if (!summary.proyectosPorSede[key]) summary.proyectosPorSede[key] = { sede: r[ Utils.findHeaderKey('SEDE') ] || "", institucion: r[ Utils.findHeaderKey('INSTITUCION') ] || "", municipio: muni, totalProyectos:0 };
      let projCount = 0;
      for (const pc of projectCols) if (String(r[pc] || "").trim() !== "") projCount++;
      summary.proyectosPorSede[key].totalProyectos += projCount;
    }
    return { summary, projectCols };
  }

  function renderCharts(){
    const { summary } = computeSummary();
    // chart1 top 7 by sedesActivas
    const munList = Object.entries(summary.municipios).map(([m,obj])=>({ municipio:m, ...obj })).sort((a,b)=>b.sedesActivas - a.sedesActivas).slice(0,7);
    const labels = munList.map(x=>x.municipio);
    const sedR = munList.map(x=>x.sedesRural);
    const sedU = munList.map(x=>x.sedesUrbano);
    const estR = munList.map(x=>x.ruralEst);
    const estU = munList.map(x=>x.urbanoEst);

    if (CH1) CH1.destroy();
    if (CH2) CH2.destroy();

    const ctx1 = document.getElementById('chart1').getContext('2d');
    CH1 = new Chart(ctx1, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Sedes Rurales', data:sedR, stack:'sedes', backgroundColor:'#4C8BF5' },
          { label:'Sedes Urbanas', data:sedU, stack:'sedes', backgroundColor:'#1B66CA' },
          { label:'Estudiantes Rurales', data:estR, stack:'est', backgroundColor:'#A6C8FF' },
          { label:'Estudiantes Urbanos', data:estU, stack:'est', backgroundColor:'#7FB2FF' }
        ]
      },
      options:{
        responsive:true,
        plugins:{legend:{position:'bottom'}},
        scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } }
      }
    });

    // chart2 top12 sedes by projects
    const sList = Object.values(summary.proyectosPorSede).sort((a,b)=>b.totalProyectos - a.totalProyectos).slice(0,12);
    const labels2 = sList.map(s => s.sede ? `${s.sede} (${s.municipio})` : `${s.institucion} (${s.municipio})`);
    const data2 = sList.map(s => s.totalProyectos);
    const ctx2 = document.getElementById('chart2').getContext('2d');
    CH2 = new Chart(ctx2, {
      type:'bar',
      data:{ labels: labels2, datasets:[ { label:'Proyectos', data: data2, backgroundColor:'#1B66CA' } ] },
      options:{ indexAxis:'y', responsive:true, plugins:{legend:{display:false}}, scales:{ x:{ beginAtZero:true } } }
    });
  }

  // expose for manual refresh
  window.VisCharts = { renderCharts };
})();

