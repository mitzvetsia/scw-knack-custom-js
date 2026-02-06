// src/features/proposal-grid/css.js
// CSS injector extracted (CommonJS). Requires CONFIG and uses the same style content as original.

const CONFIG = require('./config');
const { escapeHtml } = require('./utils');

let cssInjected = false;

function injectCssOnce() {
  if (cssInjected) return;

  if (document.getElementById(CONFIG.cssId)) {
    cssInjected = true;
    return;
  }

  cssInjected = true;

  const sceneSelectors = (CONFIG.styleSceneIds || []).map((id) => `#kn-${id}`).join(', ');
  const viewIds = Object.keys(CONFIG.views);

  function sel(suffix) {
    return viewIds.map((id) => `#${id} ${suffix}`.trim()).join(', ');
  }

  const anyView = CONFIG.views[viewIds[0]];
  const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_1964';
  const COST_FIELD_KEY = anyView?.keys?.cost || 'field_2203';

  const style = document.createElement('style');
  style.id = CONFIG.cssId;

  style.textContent = `
/* ============================================================
   SCW Totals helper CSS
   ============================================================ */
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-l4-2019 { display: inline-block; margin-top: 2px; line-height: 1.2; }
.scw-l4-2019-br { line-height: 0; }

.scw-l4-2019 b,
.scw-concat-cameras b,
.scw-l4-2019 strong,
.scw-concat-cameras strong { font-weight: 800 !important; }

.scw-each { line-height: 1.1; }
.scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

tr.scw-hide-level3-header { display: none !important; }
tr.scw-hide-level4-header { display: none !important; }

/* ✅ Hide Qty/Cost content while preserving column layout
   ✅ GUARD: never hide qty/cost on L1 subtotal rows */
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${QTY_FIELD_KEY},
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${COST_FIELD_KEY} { visibility: hidden !important; }

/* ============================================================
   ✅ L1 footer layout (multi-column spanning)
   ============================================================ */
${sel('tr.scw-subtotal--level-1 td.scw-level-total-label')} { 
  text-align: right !important; 
  padding-right: 20px !important;
  font-weight: 700 !important;
}

/* Hide qty cell completely on L1 footer */
${sel('tr.scw-subtotal--level-1 td.scw-l1-qty-cell')} { 
  display: none !important;
}

/* Span labor+hardware+cost for breathing room */
${sel('tr.scw-subtotal--level-1 td.scw-l1-totals-span')} { 
  text-align: right !important;
  padding-right: 30px !important;
}

.scw-l1-totals-grid { 
  display: grid;
  grid-template-columns: auto auto;
  gap: 8px 20px;
  justify-content: end;
  line-height: 1.4;
  max-width: 500px;
  margin-left: auto;
}

.scw-l1-totals-grid__label { 
  opacity: .85; 
  font-weight: 600;
  text-align: right;
}

.scw-l1-totals-grid__value { 
  font-weight: 700;
  text-align: right;
}

/* ✅ FIXED: robust selectors (apply to all views, all L1 subtotal rows)
   These override the td's base color and any inherited table styles. */
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__label.scw-l1-totals-grid__pre,
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__value.scw-l1-totals-grid__pre { 
  color: rgba(255,255,255,.78) !important; 
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__label.scw-l1-totals-grid__disc,
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__value.scw-l1-totals-grid__disc { 
  color: #ffcf7a !important; 
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__label.scw-l1-totals-grid__final,
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__value.scw-l1-totals-grid__final { 
  color: #ffffff !important; 
  font-weight: 900 !important;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__value.scw-l1-totals-grid__final { 
  font-size: 18px !important; 
}

/* ============================================================
   YOUR PROVIDED CSS — APPLIED TO ALL CONFIG.views
   ============================================================ */

/********************* OVERAL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERAL -- GRID ***********************/


/********************* LEVEL 1 (MDF/IDF) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-1 td {border-bottom-width: 20px !important; border-color: #07467c !important;}

${sel('tr.scw-subtotal--level-1 td')} {
  background: RGB(7, 70, 124, 1);
  border-top:1px solid #dadada;
  font-weight:600;
  color: white;
  text-align: right;
  border-bottom-width: 80px;
  border-color: transparent;
  font-size: 16px;
}

/* ✅ PATCH (2026-02-03d): force L1 subtotal row background to apply to all TDs */
${sel('tr.scw-level-total-row.scw-subtotal--level-1')} {
  background: RGB(7, 70, 124, 1) !important;
}
${sel('tr.scw-level-total-row.scw-subtotal--level-1 td')} {
  background: inherit !important;
}

${sel('tr.scw-grand-total-sep td')} { height:10px; background:transparent; border:none !important; }
${sel('tr.scw-grand-total-row td')} {
  background:white;
  border-top:2px solid #bbb !important;
  font-weight:800;
  color: #07467c;
  font-size: 20px;
  text-align: right;
}
/********************* LEVEL 1 (MDF/IDF) ***********************/


/********************* LEVEL 2 (BUCKET) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-2 {
  font-size: 16px;
  font-weight: 400 !important;
  background-color: aliceblue !important;
  color: #07467c;
}
${sceneSelectors} .kn-table-group.kn-group-level-2 td {padding: 5px 0px 5px 20px !important; border-top: 20px solid transparent !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-l2--assumptions td {font-weight: 600 !important;}

${sel('tr.scw-subtotal--level-2 td')} {
  background: aliceblue;
  border-top:1px solid #dadada;
  font-weight:800 !important;
  color: #07467c;
  text-align: center !important;
  border-bottom-width: 20px !important;
  border-color: transparent;
}
${sel('tr.scw-subtotal--level-2 td:first-child')} {text-align: right !important;}
/********************* LEVEL 2 (BUCKET) ***********************/


/********************* LEVEL 3 (PRODUCT) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-3 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td {padding-top: 10px !important; font-weight: 300 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:first-child {font-size: 20px;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:nth-last-child(-n+3) {font-weight:600 !important;}

${sel('tr.kn-table-group.kn-group-level-3.scw-level3--mounting-hardware td:first-child')} {
  padding-left: 80px !important;
  font-size: 14px !important;
  font-weight: 400 !important;
}
/********************* LEVEL 3 (PRODUCT) ***********************/


/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-4 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:nth-last-child(-n+3) {font-weight:600 !important; color: #07467c !important;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td {padding-top: 5px !important; font-weight: 300;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:first-child {padding-left:80px !important;}

.scw-l4-2019 b {font-weight: 600 !important;}
/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
`;

  document.head.appendChild(style);
}

module.exports = { injectCssOnce };