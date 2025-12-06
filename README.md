# Visor Inteligente de Sedes — BD_MASTER_ - I.E. Bajo Cauca

Este repositorio contiene el visor web para la base de datos pública `BD_MASTER_█_I.E._Bajo_Cauca`, alimentado directamente desde Google Sheets mediante un enlace CSV (`output=csv`).

## Estructura del proyecto
index.html
/css/main.css
/js/dataset-loader.js
/js/utils.js
/js/search-localizador.js
/js/search-categorizacion.js
/js/charts.js
/js/ui.js

markdown
Copiar código

## Cómo desplegar en GitHub Pages
1. Asegúrate de que todos los archivos estén en las rutas indicadas.  
2. En GitHub ve a: **Settings → Pages → Source → main (branch) → /root** → Guardar.  
3. GitHub generará una URL pública donde se podrá ver el visor.

## Cómo cambiar la hoja CSV
Si la URL del Google Sheets CSV cambia:
1. Publica la nueva hoja como CSV (`output=csv`).  
2. Ve al archivo:  
/js/dataset-loader.js

markdown
Copiar código
3. Reemplaza el valor de `CSV_URL` por la nueva URL.  
4. Guarda los cambios (commit + push).

## Verificación rápida
- Abre la página del visor.  
- Abre la consola (F12).  
- Debes ver un mensaje como:  
Dataset loaded: 556 rows, 100+ headers

markdown
Copiar código
- Si aparece 0 filas, el CSV no es público o no es accesible.

## Notas importantes
- El visor usa un dataset global en memoria (`window.DATASET`).  
- Los nombres de columnas del CSV se respetan tal como vienen.  
- Los módulos JS separan la lógica: búsqueda, categorización, gráficos y UI.
