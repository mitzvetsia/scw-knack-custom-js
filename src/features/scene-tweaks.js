/*** Per-scene visual tweaks — organized by scene ID ***/
(function () {
  'use strict';
  var STYLE_ID = 'scw-scene-tweaks-css';
  if (document.getElementById(STYLE_ID)) return;

  var css = `
/* ══════════════════════════════════════════════════════════════
   SCENE 1116 — Sales Edit Proposal
   ══════════════════════════════════════════════════════════════ */

/* ── Totals details view (view_3418) — card treatment ── */
#view_3418 {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
  padding: 20px 24px 16px;
  margin-bottom: 12px;
}
#view_3418 .view-header {
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid #163C6E;
}
#view_3418 .view-header h2 {
  font-size: 18px !important;
  font-weight: 700 !important;
  color: #163C6E !important;
  letter-spacing: 0.02em;
  margin: 0 !important;
}
/* Detail field rows */
#view_3418 .kn-detail.kn-detail-body .kn-detail-body-item {
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
#view_3418 .kn-detail-body-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
/* Labels */
#view_3418 .kn-detail-body-item .kn-detail-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 160px;
  flex-shrink: 0;
}
/* Values */
#view_3418 .kn-detail-body-item .kn-detail-body {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}
/* Project Total — hero treatment (last row) */
#view_3418 .kn-detail-body-item:last-child {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 2px solid #163C6E;
}
#view_3418 .kn-detail-body-item:last-child .kn-detail-label {
  font-size: 13px;
  font-weight: 700;
  color: #163C6E;
}
#view_3418 .kn-detail-body-item:last-child .kn-detail-body {
  font-size: 20px;
  font-weight: 800;
  color: #163C6E;
}

/* view_3492 / view_3490 form styling now handled by inline-form-recompose.js */
`;

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
})();
