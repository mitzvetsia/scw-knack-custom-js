/*** FEATURE: Acceptance summary card (view_3914) **************************
 *
 * Replaces the raw single-row INSTALL_acceptance table on the deploy scene
 * with a clean card: the proposal as the title, Yes/No flags as status pills,
 * and the document links + the "Create Questionnaire" action rendered as
 * buttons. The native table is hidden (kept in the DOM) and the buttons proxy
 * clicks to its original anchors so Knack's asset/action handlers still fire.
 *
 * Columns:
 *   field_2755  REL proposal (connection link)        → title
 *   field_2765  FLAG_initial payment received (Yes/No) → pill
 *   field_2766  FLAG_agreement signed (Yes/No)         → pill
 *   field_1847  Xero Equipment Invoice Link (URL)      → button
 *   field_2767  SYS_signed agreement (file)            → button
 *   .kn-action-link "Create Questionnaire"             → primary button
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_3914';
  var STYLE_ID = 'scw-acpt-css';
  var EVENT_NS = '.scwAcceptanceCard';
  var F = {
    proposal:  'field_2755',
    payment:   'field_2765',
    signed:    'field_2766',
    xero:      'field_1847',
    agreement: 'field_2767'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function cellText(row, fk) {
    var td = row.querySelector('td.' + fk);
    return td ? td.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function cellAnchor(row, fk, sel) {
    var td = row.querySelector('td.' + fk);
    return td ? td.querySelector(sel || 'a[href]') : null;
  }
  function isYes(v) { return /^(yes|true)$/i.test(String(v || '').trim()); }

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle>' +
    '<polyline points="12 7 12 12 15 14"></polyline></svg>';
  var FILE_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  var LINK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      // Hide the raw grid chrome — the card replaces it.
      '#' + VIEW + ' .view-header,',
      '#' + VIEW + ' .kn-records-nav,',
      '#' + VIEW + ' .kn-table-wrapper { display: none !important; }',
      '.scw-acpt-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 18px; margin-top: 8px;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '.scw-acpt-eyebrow { font: 700 10px/1.2 system-ui, sans-serif; letter-spacing: .07em;',
      '  text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }',
      '.scw-acpt-title { font: 700 15px/1.35 system-ui, sans-serif; color: #0f4c75;',
      '  text-decoration: none; display: inline-block; }',
      '.scw-acpt-title:hover { text-decoration: underline; }',
      '.scw-acpt-status { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }',
      '.scw-acpt-pill { display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px; border-radius: 999px; font: 600 12px/1 system-ui, sans-serif;',
      '  border: 1px solid transparent; }',
      '.scw-acpt-pill.is-yes { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      '.scw-acpt-pill.is-no  { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-acpt-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.scw-acpt-btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer;',
      '  font: 600 12.5px/1 system-ui, sans-serif; padding: 8px 14px; border-radius: 6px;',
      '  text-decoration: none; transition: background .12s, border-color .12s; }',
      '.scw-acpt-btn--ghost { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; }',
      '.scw-acpt-btn--ghost:hover { background: #eef2f7; border-color: #94a3b8; }',
      '.scw-acpt-btn--primary { background: #0f4c75; border: 1px solid #0a3a63; color: #fff;',
      '  margin-left: auto; }',
      '.scw-acpt-btn--primary:hover { background: #0a3a63; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function pill(label, yes) {
    return '<span class="scw-acpt-pill ' + (yes ? 'is-yes' : 'is-no') + '">' +
      (yes ? CHECK_SVG : CLOCK_SVG) + '<span>' + esc(label) + '</span></span>';
  }

  function render() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();
    var row = viewEl.querySelector('tbody tr[id]');
    var prior = viewEl.querySelector(':scope > .scw-acpt-card');
    if (!row) { if (prior) prior.remove(); return; }

    var propA   = cellAnchor(row, F.proposal, 'a[data-kn="connection-link"]') || cellAnchor(row, F.proposal);
    var propTxt = propA ? propA.textContent.replace(/\s+/g, ' ').trim() : (cellText(row, F.proposal) || 'Proposal');
    var propHref = propA ? (propA.getAttribute('href') || '') : '';
    var paid    = isYes(cellText(row, F.payment));
    var signed  = isYes(cellText(row, F.signed));
    var xeroA   = cellAnchor(row, F.xero);
    var fileA   = cellAnchor(row, F.agreement, 'a.kn-view-asset') || cellAnchor(row, F.agreement);
    var actionA = row.parentNode &&
      (row.querySelector('.kn-action-link') || row.querySelector('.kn-table-link a'));

    var html =
      '<div class="scw-acpt-eyebrow">Acceptance</div>' +
      (propHref
        ? '<a class="scw-acpt-title" href="' + esc(propHref) + '">' + esc(propTxt) + '</a>'
        : '<div class="scw-acpt-title">' + esc(propTxt) + '</div>') +
      '<div class="scw-acpt-status">' +
        pill(paid   ? 'Initial payment received' : 'Initial payment pending', paid) +
        pill(signed ? 'Agreement signed'         : 'Agreement not signed',    signed) +
      '</div>' +
      '<div class="scw-acpt-actions">' +
        (fileA  ? '<a class="scw-acpt-btn scw-acpt-btn--ghost" data-proxy="file" href="javascript:void(0)">' + FILE_SVG + 'Signed agreement</a>' : '') +
        (xeroA  ? '<a class="scw-acpt-btn scw-acpt-btn--ghost" target="_blank" rel="noopener" href="' + esc(xeroA.getAttribute('href') || '') + '">' + LINK_SVG + 'Xero invoice</a>' : '') +
        (actionA ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--primary" data-proxy="action">Create Questionnaire</button>' : '') +
      '</div>';

    var card = prior || document.createElement('div');
    card.className = 'scw-acpt-card';
    card.innerHTML = html;
    if (!prior) viewEl.appendChild(card);

    // Proxy clicks to the original (hidden) anchors so Knack's asset preview +
    // action-rule handlers still run.
    var fileBtn = card.querySelector('[data-proxy="file"]');
    if (fileBtn && fileA) fileBtn.addEventListener('click', function (e) { e.preventDefault(); fileA.click(); });
    var actBtn = card.querySelector('[data-proxy="action"]');
    if (actBtn && actionA) actBtn.addEventListener('click', function () { actionA.click(); });
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(render, 30); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(render, 150); });
})();
/*** END FEATURE: Acceptance summary card **********************************/
