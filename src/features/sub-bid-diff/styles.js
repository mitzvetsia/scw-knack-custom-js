/*** SUB-BID DIFF — STYLES ***************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;

  var STYLE_ID = ns.CONFIG.cssId;
  if (document.getElementById(STYLE_ID)) return;

  var T = ns.CONFIG.TIERS;

  var css = [
    '#' + ns.CONFIG.mountId + ' { margin: 18px 0; border: 1px solid #e2e8f0;',
    '  border-radius: 10px; background: #fff; overflow: hidden;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',

    /* banner */
    '.scw-sbd-banner { display: flex; align-items: center; gap: 10px;',
    '  padding: 10px 14px; background: #0f172a; color: #fff; font-size: 13px; }',
    '.scw-sbd-banner__title { font-weight: 600; letter-spacing: .2px; }',
    '.scw-sbd-pill { background: #1e293b; color: #93c5fd; border-radius: 999px;',
    '  padding: 2px 9px; font-size: 11px; font-weight: 600; text-transform: uppercase; }',
    '.scw-sbd-banner__spacer { flex: 1 1 auto; }',

    /* per-SOW section */
    '.scw-sbd-sec { border-top: 1px solid #e2e8f0; }',
    '.scw-sbd-sec:first-child { border-top: none; }',
    '.scw-sbd-sow-head { padding: 10px 14px 0; }',
    '.scw-sbd-sow-name { font-size: 14px; font-weight: 700; color: #0f172a; }',

    /* baseline picker */
    '.scw-sbd-baseline select[disabled] { background: #f1f5f9; color: #334155; cursor: default; }',
    '.scw-sbd-baseline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
    '  padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; }',
    '.scw-sbd-baseline label { color: #475569; font-weight: 600; }',
    '.scw-sbd-baseline select { padding: 5px 8px; border: 1px solid #cbd5e1;',
    '  border-radius: 6px; font-size: 13px; background: #fff; max-width: 460px; }',
    '.scw-sbd-baseline__meta { color: #64748b; font-size: 12px; }',

    /* tally header */
    '.scw-sbd-tally { display: flex; gap: 8px; flex-wrap: wrap; align-items: center;',
    '  padding: 12px 14px; border-bottom: 1px solid #e2e8f0; }',
    '.scw-sbd-stat { display: flex; flex-direction: column; gap: 2px; min-width: 92px;',
    '  padding: 8px 12px; border-radius: 8px; background: #f8fafc; border: 1px solid #eef2f7; }',
    '.scw-sbd-stat__n { font-size: 20px; font-weight: 700; line-height: 1; }',
    '.scw-sbd-stat__l { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .3px; }',
    '.scw-sbd-stat--delta { margin-left: auto; align-items: flex-end; background: #fff; }',
    '.scw-sbd-stat--delta .scw-sbd-stat__n.pos { color: ' + T.added.color + '; }',
    '.scw-sbd-stat--delta .scw-sbd-stat__n.neg { color: #047857; }',
    '.scw-sbd-stat--delta .scw-sbd-stat__n.zero { color: #475569; }',

    /* coverage banner */
    '.scw-sbd-flag { display: flex; align-items: center; gap: 8px; margin: 0 14px 12px;',
    '  padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }',
    '.scw-sbd-flag--gap { background: #fff1f2; color: ' + T.added.color + '; border: 1px solid #fecdd3; }',
    '.scw-sbd-flag--ok  { background: #f0fdf4; color: #047857; border: 1px solid #bbf7d0; }',

    /* table */
    '.scw-sbd-table { width: 100%; border-collapse: collapse; font-size: 13px; }',
    '.scw-sbd-table th { text-align: left; padding: 8px 14px; background: #f8fafc;',
    '  color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .3px;',
    '  border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; }',
    '.scw-sbd-table td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }',
    '.scw-sbd-table tr:last-child td { border-bottom: none; }',
    '.scw-sbd-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.scw-sbd-mdf { color: #94a3b8; font-size: 11px; }',
    '.scw-sbd-label { font-weight: 600; color: #0f172a; }',
    '.scw-sbd-product { color: #64748b; font-size: 12px; }',
    '.scw-sbd-delta-pos { color: ' + T.added.color + '; font-weight: 600; }',
    '.scw-sbd-delta-neg { color: #047857; font-weight: 600; }',
    '.scw-sbd-delta-zero { color: #cbd5e1; }',

    /* tier badge + row accents */
    '.scw-sbd-badge { display: inline-block; padding: 2px 8px; border-radius: 999px;',
    '  font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; }',
    '.scw-sbd-row--covered td:first-child { box-shadow: inset 3px 0 0 ' + T.covered.color + '; }',
    '.scw-sbd-row--spec td:first-child { box-shadow: inset 3px 0 0 ' + T.spec.color + '; }',
    '.scw-sbd-row--material td:first-child { box-shadow: inset 3px 0 0 ' + T.material.color + '; }',
    '.scw-sbd-row--added td:first-child { box-shadow: inset 3px 0 0 ' + T.added.color + '; }',
    '.scw-sbd-row--orphan td:first-child { box-shadow: inset 3px 0 0 ' + T.orphan.color + '; }',
    '.scw-sbd-row--covered { opacity: .72; }',

    /* covered-rows toggle */
    '.scw-sbd-toggle { padding: 8px 14px; font-size: 12px; color: #475569;',
    '  border-top: 1px solid #f1f5f9; cursor: pointer; user-select: none; }',
    '.scw-sbd-toggle:hover { background: #f8fafc; }',
    '#' + ns.CONFIG.mountId + '[data-hide-covered="1"] .scw-sbd-row--covered { display: none; }',

    '.scw-sbd-empty { padding: 22px 14px; color: #94a3b8; text-align: center; font-size: 13px; }'
  ].join('\n');

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*** END SUB-BID DIFF — STYLES ***********************************************/
