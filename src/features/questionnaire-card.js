/*** FEATURE: System Setup Questionnaire card (view_4015) *******************
 *
 * Replaces the deploy page's raw questionnaire grid (KTL chrome, 12 columns,
 * inline audit-log text, a wall of connected line items) with a clean card,
 * same treatment as the Acceptances section (acceptance-card.js):
 *
 *   - status pill + "Open questionnaire" button (the detail child page —
 *     all questionnaire editing happens there)
 *   - signoff progression: Customer → Project Manager → Tech Support, each
 *     step done / current / todo with who + date where known
 *   - Who has access — the customer-account cell scraped verbatim, so the
 *     edit/add links customer-account-link.js injects keep working
 *   - AUDIT TRAIL collapsed behind a click (<details>) — the raw log never
 *     paints unless the user deliberately opens it
 *   - connected install line items likewise collapsed to a count
 *
 * The grid stays rendered (Backbone model + questionnaire-deployment-audit
 * keep working) — it's just display:none'd, like view_3914's.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_4015';
  var STYLE_ID = 'scw-qst-card-css';
  var EVENT_NS = '.scwQstCard';

  var F = {
    status:   'field_1772',
    access:   'field_1778',
    custDate: 'field_1782',
    custBy:   'field_1790',
    signer:   'field_1781',
    pmBy:     'field_1791',
    pmDate:   'field_1795',
    audit:    'field_2937',
    items:    'field_2934'
  };

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>';
  var GOTO_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>' +
    '<polyline points="15 3 21 3 21 9"></polyline>' +
    '<line x1="10" y1="14" x2="21" y2="3"></line></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Hide the raw grid chrome — the card replaces it. Model + audit
         module keep reading the (hidden) table. */
      '#' + VIEW + ' .view-header,',
      '#' + VIEW + ' .kn-records-nav,',
      '#' + VIEW + ' .kn-table-wrapper,',
      '#' + VIEW + ' .ktlShrinkLink { display: none !important; }',
      '#' + VIEW + ' .ktlHideShowSection {',
      '  border: none !important; padding: 0 !important; margin: 0 !important;',
      '}',
      '.scw-qst-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 14px 18px 12px;',
      '  margin-top: 8px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
      '}',
      '.scw-qst-top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }',
      /* "Open questionnaire" is pure NAVIGATION, not an action — filled navy
         buttons on this page DO things. Style it like the page\'s other
         go-to-a-page links: navy underline + external-link icon. */
      '.scw-qst-open { display: inline-flex; align-items: center; gap: 6px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; margin-left: auto;',
      '  color: #0f4c75 !important; text-decoration: underline !important;',
      '  text-decoration-color: #93b8d6 !important; text-underline-offset: 3px; }',
      '.scw-qst-open:hover { color: #0a3a63 !important; text-decoration-color: currentColor !important; }',
      '.scw-qst-open svg { flex: none; opacity: .7; }',
      '.scw-qst-open:hover svg { opacity: 1; }',
      /* Signoff progression */
      '.scw-qst-steps { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 2px; }',
      '.scw-qst-step { flex: 1 1 170px; min-width: 150px; display: flex; gap: 8px;',
      '  align-items: flex-start; padding: 8px 10px; border-radius: 8px;',
      '  border: 1px solid #e5e7eb; background: #f8fafc; }',
      '.scw-qst-step-ic { display: inline-flex; align-items: center; justify-content: center;',
      '  width: 20px; height: 20px; border-radius: 50%; flex: none; margin-top: 1px;',
      '  background: #e2e8f0; color: #64748b; }',
      '.scw-qst-step.is-done { border-color: #bbf7d0; background: #f0fdf4; }',
      '.scw-qst-step.is-done .scw-qst-step-ic { background: #16a34a; color: #fff; }',
      '.scw-qst-step.is-current { border-color: #fde68a; background: #fffbeb; }',
      '.scw-qst-step.is-current .scw-qst-step-ic { background: #f59e0b; color: #fff; }',
      '.scw-qst-step-lbl { font: 700 11px/1.3 system-ui, sans-serif;',
      '  text-transform: uppercase; letter-spacing: .04em; color: #334155; }',
      '.scw-qst-step-sub { font: 400 12px/1.4 system-ui, sans-serif; color: #64748b; }',
      /* Access block — scraped cell keeps customer-account-link\'s widgets */
      '.scw-qst-access { margin: 10px 0 4px; }',
      '.scw-qst-lbl { font: 700 10px/1.2 system-ui, sans-serif; letter-spacing: .07em;',
      '  text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }',
      '.scw-qst-access-body { font: 13px/2 system-ui, sans-serif; color: #1e293b; }',
      /* customer-account-link\'s widgets ride in via the scrape, but that
         module\'s CSS is scoped to the (hidden) grid cell — restate the
         layout here so the pencil icon + add link get breathing room. */
      '.scw-qst-access-body .scw-cust-edit-link { display: inline-flex; align-items: center;',
      '  gap: 6px; color: #0f4c75; font-weight: 600; text-decoration: underline;',
      '  text-decoration-color: #93b8d6; text-underline-offset: 3px; }',
      '.scw-qst-access-body .scw-cust-edit-link:hover { color: #0a3a63;',
      '  text-decoration-color: currentColor; }',
      '.scw-qst-access-body .scw-cust-edit-ic { flex: none; opacity: .65; }',
      '.scw-qst-access-body .scw-cust-add-btn { display: inline-flex; align-items: center;',
      '  gap: 5px; margin-left: 14px; padding: 3px 10px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; background: #fff; color: #0f4c75 !important;',
      '  font: 600 12px/1.4 system-ui, sans-serif; text-decoration: none !important; }',
      '.scw-qst-access-body .scw-cust-add-btn:hover { border-color: #94a3b8; background: #f8fafc; }',
      /* Collapsed disclosures — audit + line items only exist on click */
      '.scw-qst-details { margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 6px; }',
      '.scw-qst-details > summary { cursor: pointer; list-style: none;',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  font: 600 12px/1.4 system-ui, sans-serif; color: #64748b; }',
      '.scw-qst-details > summary::-webkit-details-marker { display: none; }',
      '.scw-qst-details > summary::before { content: "\\25B8"; font-size: 10px;',
      '  color: #94a3b8; transition: transform .12s; }',
      '.scw-qst-details[open] > summary::before { transform: rotate(90deg); }',
      '.scw-qst-details > summary:hover { color: #0f4c75; }',
      '.scw-qst-audit-list { margin: 8px 0 2px; padding: 8px 10px; background: #f8fafc;',
      '  border: 1px solid #e5e7eb; border-radius: 8px; max-height: 260px; overflow: auto; }',
      '.scw-qst-audit-line { font: 11.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;',
      '  color: #475569; padding: 2px 0; border-bottom: 1px dashed #e2e8f0;',
      '  overflow-wrap: anywhere; }',
      '.scw-qst-audit-line:last-child { border-bottom: none; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function cell(tr, fk) {
    return tr.querySelector('td[data-field-key="' + fk + '"]');
  }
  function cellText(tr, fk) {
    var td = cell(tr, fk);
    return td ? String(td.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function cellInnerHtml(tr, fk) {
    var td = cell(tr, fk);
    var span = td && td.querySelector('span[class^="col-"]');
    return span ? span.innerHTML : (td ? td.innerHTML : '');
  }

  function auditLines(tr) {
    var td = cell(tr, F.audit);
    if (!td) return [];
    var txt = td.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Entries start with an ISO stamp — split on those so multi-line values
    // stay attached to their entry.
    var lines = txt.split(/\n(?=\[\d{4}-)/).join('\n').split(/\n+/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l) out.push(l);
    }
    return out;
  }

  /** Signoff stage states from the STATUS text + date columns. */
  function stageStates(tr, status) {
    var cur = -1;
    if (/pending/i.test(status)) {
      if (/customer/i.test(status)) cur = 0;
      else if (/project\s*manager|pm\b/i.test(status)) cur = 1;
      else if (/tech\s*support/i.test(status)) cur = 2;
    }
    var allDone = /complete|approved|closed/i.test(status);
    var custDate = cellText(tr, F.custDate);
    var pmDate   = cellText(tr, F.pmDate);
    var stages = [
      { label: 'Customer',
        sub: [cellText(tr, F.custBy) || cellText(tr, F.signer), custDate]
          .filter(Boolean).join(' · '),
        done: allDone || !!custDate || cur > 0 },
      { label: 'Project Manager',
        sub: [cellText(tr, F.pmBy), pmDate].filter(Boolean).join(' · '),
        done: allDone || !!pmDate || cur > 1 },
      { label: 'Tech Support', sub: '', done: allDone }
    ];
    for (var i = 0; i < stages.length; i++) {
      stages[i].state = stages[i].done ? 'done' : (i === cur ? 'current' : 'todo');
      if (!stages[i].sub) stages[i].sub = stages[i].done ? 'Signed off' :
        (stages[i].state === 'current' ? 'Awaiting signoff' : '—');
    }
    return stages;
  }

  function buildCard(tr) {
    var status = cellText(tr, F.status);
    var openA  = tr.querySelector('td.kn-table-link a[href]');
    var stages = stageStates(tr, status);
    var audit  = auditLines(tr);

    var card = document.createElement('div');
    card.className = 'scw-qst-card';

    // No in-card status pill — the accordion header's rollup already says
    // it, and the highlighted step below repeats it. Just the nav link.
    var html =
      (openA
        ? '<div class="scw-qst-top">' +
            '<a class="scw-qst-open" href="' + esc(openA.getAttribute('href')) + '">' +
              'Open questionnaire' + GOTO_SVG + '</a>' +
          '</div>'
        : '') +
      '<div class="scw-qst-steps">';
    for (var s = 0; s < stages.length; s++) {
      var st = stages[s];
      html +=
        '<div class="scw-qst-step is-' + st.state + '">' +
          '<span class="scw-qst-step-ic">' +
            (st.state === 'done' ? CHECK_SVG : CLOCK_SVG) + '</span>' +
          '<span><span class="scw-qst-step-lbl">' + esc(st.label) + '</span>' +
          '<div class="scw-qst-step-sub">' + esc(st.sub) + '</div></span>' +
        '</div>';
    }
    html += '</div>' +
      '<div class="scw-qst-access">' +
        '<div class="scw-qst-lbl">Who has access</div>' +
        '<div class="scw-qst-access-body">' + cellInnerHtml(tr, F.access) + '</div>' +
      '</div>';

    if (audit.length) {
      html += '<details class="scw-qst-details"><summary>Audit trail · ' +
        audit.length + (audit.length === 1 ? ' entry' : ' entries') + '</summary>' +
        '<div class="scw-qst-audit-list">';
      // Newest first — the field appends chronologically.
      for (var a = audit.length - 1; a >= 0; a--) {
        html += '<div class="scw-qst-audit-line">' + esc(audit[a]) + '</div>';
      }
      html += '</div></details>';
    }
    card.innerHTML = html;
    return card;
  }

  function render() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();
    var prior = viewEl.querySelectorAll(':scope > .scw-qst-card');
    for (var p = 0; p < prior.length; p++) prior[p].remove();
    var rows = viewEl.querySelectorAll('tbody tr[id]');
    for (var r = 0; r < rows.length; r++) {
      viewEl.appendChild(buildCard(rows[r]));
    }
    watchGrid(viewEl);
  }

  // customer-account-link decorates the (hidden) access cell only after
  // view_4040 renders and its hrefs are harvested — timing we can't predict
  // from here. Rebuild the card whenever the hidden table mutates, so the
  // edit/add widgets ride into the scrape no matter when they land. The
  // card lives OUTSIDE .kn-table-wrapper, so rebuilds can't retrigger the
  // observer. Knack re-renders replace the wrapper element, killing the
  // observer — render() reattaches on every pass.
  var _obsTimer = null;
  function watchGrid(viewEl) {
    var wrap = viewEl.querySelector('.kn-table-wrapper');
    if (!wrap || wrap.getAttribute('data-scw-qst-obs') === '1') return;
    wrap.setAttribute('data-scw-qst-obs', '1');
    new MutationObserver(function () {
      if (_obsTimer) clearTimeout(_obsTimer);
      _obsTimer = setTimeout(render, 150);
    }).observe(wrap, { childList: true, subtree: true });
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () {
      // Immediate pass + one late pass; the mutation observer covers the
      // decorated-after-us case in between and beyond.
      setTimeout(render, 60);
      setTimeout(render, 700);
    }, EVENT_NS);
  }
})();
/*** END FEATURE: System Setup Questionnaire card ***************************/
