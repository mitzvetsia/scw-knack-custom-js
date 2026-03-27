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
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px 16px;
  margin-bottom: 0;
}
#view_3418 .view-header {
  margin-bottom: 14px;
  padding-bottom: 0;
  border-bottom: none;
}
#view_3418 .view-header h2 {
  font-size: 18px !important;
  font-weight: 700 !important;
  color: #163C6E !important;
  letter-spacing: 0;
  text-transform: none;
  margin: 0 !important;
}

/* Detail rows — table-like with cell borders */
#view_3418 .kn-detail.kn-detail-body {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}
#view_3418 .kn-detail.kn-detail-body .kn-detail-body-item {
  padding: 0;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  gap: 0;
}
#view_3418 .kn-detail-body-item:last-child {
  border-bottom: none;
}
/* Labels — left column */
#view_3418 .kn-detail-body-item .kn-detail-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  text-transform: none;
  letter-spacing: 0;
  padding: 10px 16px;
  min-width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
  background: transparent;
}
/* Values — right column */
#view_3418 .kn-detail-body-item .kn-detail-body {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  padding: 10px 16px;
  font-variant-numeric: tabular-nums;
}
/* Project Total row — bold emphasis (last row before hero extraction) */
#view_3418 .kn-detail-body-item:last-child .kn-detail-label {
  font-weight: 700;
}
#view_3418 .kn-detail-body-item:last-child .kn-detail-body {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

/* view_3492 / view_3490 form styling now handled by inline-form-recompose.js */
`;

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
})();
