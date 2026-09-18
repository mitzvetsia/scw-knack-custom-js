/*** FEATURE: System Setup Questionnaire card (view_4015 / view_4053) *******
 *
 * Replaces the deploy pages' raw questionnaire grid (KTL chrome, 12 columns,
 * inline audit-log text, a wall of connected line items) with a clean card,
 * same treatment as the Acceptances section (acceptance-card.js):
 *
 *   - status pill + "Open questionnaire" button (the detail child page —
 *     all questionnaire editing happens there)
 *   - signoff progression: Customer → Project Manager → Tech Support, each
 *     step done / current / todo with who + date where known
 *   - Who has access — built HERE from primary sources (customer ids from
 *     the raw connection spans, edit/add hrefs harvested straight from
 *     the deployment's CORE_company details view), NOT scraped from
 *     customer-account-link's decorated cell. That makes the card a pure
 *     function of the two views' DOM: rebuild on either view's render and
 *     the result is order-independent — no race against another module's
 *     mutations.
 *   - AUDIT TRAIL collapsed behind a click (<details>) — the raw log never
 *     paints unless the user deliberately opens it
 *   - connected install line items likewise collapsed to a count
 *
 * The grid stays rendered (Backbone model + questionnaire-deployment-audit
 * keep working) — it's just display:none'd, like view_3914's.
 *
 * One entry per deployment page. The sub entry deliberately carries NO
 * details view: subs don't manage customer accounts (decided 2026-08-12),
 * so its access list renders plain names — no edit links, no add button.
 ****************************************************************************/
(function () {
  'use strict';

  var DEPLOYMENTS = [
    { view: 'view_4015', detailView: 'view_4040' },  // ops deploy (scene_1311)
    { view: 'view_4053', detailView: '' }            // sub dashboard — names only
  ];
  var STYLE_ID    = 'scw-qst-card-css';
  var EVENT_NS    = '.scwQstCard';
  var HEX24       = /^[a-f0-9]{24}$/i;

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
  var PENCIL_SVG =
    '<svg class="scw-cust-edit-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
    '<path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  var PLUS_SVG =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="12" y1="5" x2="12" y2="19"></line>' +
    '<line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    /* Hide the raw grid chrome on every deployment view — the card replaces
       it. Model + audit module keep reading the (hidden) table. */
    var hideSel = [], flatSel = [];
    for (var d = 0; d < DEPLOYMENTS.length; d++) {
      var v = DEPLOYMENTS[d].view;
      hideSel.push('#' + v + ' .view-header', '#' + v + ' .kn-records-nav',
                   '#' + v + ' .kn-table-wrapper', '#' + v + ' .ktlShrinkLink');
      flatSel.push('#' + v + ' .ktlHideShowSection');
    }
    var css = [
      hideSel.join(',\n') + ' { display: none !important; }',
      flatSel.join(',\n') + ' {',
      '  border: none !important; padding: 0 !important; margin: 0 !important;',
      '}',
      '.scw-qst-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 14px 18px 12px;',
      '  margin-top: 8px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
      '}',
      /* Signoff progression — the stage tiles ARE the navigation: every
         tile links to the questionnaire page (they all describe it), with
         a go-arrow on the current stage. No separate "Open" button. */
      '.scw-qst-steps { display: flex; flex-wrap: wrap; gap: 10px; margin: 2px 0 2px; }',
      '.scw-qst-step { flex: 1 1 170px; min-width: 150px; display: flex; gap: 8px;',
      '  align-items: flex-start; padding: 8px 10px; border-radius: 8px;',
      '  border: 1px solid #e5e7eb; background: #f8fafc; }',
      'a.scw-qst-step { text-decoration: none !important; cursor: pointer; }',
      'a.scw-qst-step:hover { border-color: #94a3b8;',
      '  box-shadow: 0 1px 4px rgba(15,23,42,.1); }',
      'a.scw-qst-step.is-current:hover { border-color: #f59e0b; }',
      'a.scw-qst-step.is-done:hover { border-color: #4ade80; }',
      '.scw-qst-step-go { margin-left: auto; align-self: center; flex: none;',
      '  color: #b45309; opacity: .75; }',
      'a.scw-qst-step:hover .scw-qst-step-go { opacity: 1; }',
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
      '.scw-qst-access-body { font: 13px/1.6 system-ui, sans-serif; color: #1e293b; }',
      /* Account widgets are built by THIS module from primary sources —
         one row per customer account, add-chip on its own line below. */
      '.scw-qst-acct { margin: 3px 0; }',
      '.scw-qst-access-body .scw-cust-edit-link { display: inline-flex; align-items: center;',
      '  gap: 6px; color: #0f4c75; font-weight: 600; text-decoration: underline;',
      '  text-decoration-color: #93b8d6; text-underline-offset: 3px; }',
      '.scw-qst-access-body .scw-cust-edit-link:hover { color: #0a3a63;',
      '  text-decoration-color: currentColor; }',
      '.scw-qst-access-body .scw-cust-edit-ic { flex: none; opacity: .65; }',
      '.scw-qst-access-body .scw-cust-edit-link:hover .scw-cust-edit-ic { opacity: 1; }',
      '.scw-qst-access-body .scw-cust-add-btn { display: inline-flex; align-items: center;',
      '  gap: 5px; margin: 8px 0 2px; padding: 3px 10px; border: 1px solid #cbd5e1;',
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

  // ── Who-has-access, from primary sources (no scrape of decorated DOM) ──
  // Edit/add hrefs harvested straight from the deployment's details view,
  // exactly like customer-account-link does. Captured once per deployment,
  // kept across renders. Deployments with no details view keep empty links
  // (names render plain — no edit/add affordances).
  var _links = {};   // view key → { editBase, addUrl }
  function captureAccountLinks(dep) {
    var l = (_links[dep.view] = _links[dep.view] || { editBase: '', addUrl: '' });
    if (!dep.detailView) return l;
    var detail = document.getElementById(dep.detailView);
    if (!detail) return l;
    var addA  = detail.querySelector('a[href*="add-customer-account2/"]');
    var editA = detail.querySelector('a[href*="edit-customer-account/"]');
    if (addA) l.addUrl = addA.getAttribute('href') || l.addUrl;
    var src = (editA && editA.getAttribute('href')) ||
              (addA && addA.getAttribute('href')) || '';
    var m = src.match(/^(#.*\/)(?:edit-customer-account|add-customer-account2)\//);
    if (m) l.editBase = m[1] + 'edit-customer-account/';
    return l;
  }

  // Customer record ids = the 24-hex CLASS on the inner connection-value
  // spans — raw grid markup, present the moment the row renders. Reading
  // textContent works whether or not customer-account-link has decorated
  // the cell (its anchor adds no text), so render order is irrelevant.
  function accessHtml(tr, links) {
    var td = cell(tr, F.access);
    if (!td) return '';
    var html = '';
    var spans = td.querySelectorAll('span[data-kn="connection-value"]');
    for (var i = 0; i < spans.length; i++) {
      var cls = (spans[i].className || '').trim();
      if (!HEX24.test(cls)) continue;         // skip the outer (id-only) wrapper
      var name = String(spans[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      html += '<div class="scw-qst-acct">' +
        (links.editBase
          ? '<a class="scw-cust-edit-link" title="Edit customer account" href="' +
              esc(links.editBase + cls) + '">' + esc(name) + PENCIL_SVG + '</a>'
          : esc(name)) +
        '</div>';
    }
    if (links.addUrl) {
      html += '<a class="scw-cust-add-btn" href="' + esc(links.addUrl) + '">' +
        PLUS_SVG + '<span>Add customer account</span></a>';
    }
    return html;
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

  function buildCard(tr, links) {
    var status = cellText(tr, F.status);
    var openA  = tr.querySelector('td.kn-table-link a[href]');
    var href   = openA ? openA.getAttribute('href') : '';
    var stages = stageStates(tr, status);
    var audit  = auditLines(tr);

    var card = document.createElement('div');
    card.className = 'scw-qst-card';

    // No status pill (the header rollup + highlighted step already say it)
    // and no Open button — the stage tiles themselves navigate to the
    // questionnaire page.
    var html = '<div class="scw-qst-steps">';
    for (var s = 0; s < stages.length; s++) {
      var st = stages[s];
      var tag = href ? 'a' : 'div';
      html +=
        '<' + tag + ' class="scw-qst-step is-' + st.state + '"' +
          (href ? ' href="' + esc(href) + '" title="Open questionnaire"' : '') + '>' +
          '<span class="scw-qst-step-ic">' +
            (st.state === 'done' ? CHECK_SVG : CLOCK_SVG) + '</span>' +
          '<span><span class="scw-qst-step-lbl">' + esc(st.label) + '</span>' +
          '<div class="scw-qst-step-sub">' + esc(st.sub) + '</div></span>' +
          (href && st.state === 'current'
            ? '<span class="scw-qst-step-go">' + GOTO_SVG + '</span>' : '') +
        '</' + tag + '>';
    }
    html += '</div>' +
      '<div class="scw-qst-access">' +
        '<div class="scw-qst-lbl">Who has access</div>' +
        '<div class="scw-qst-access-body">' + accessHtml(tr, links) + '</div>' +
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

  function render(dep) {
    var viewEl = document.getElementById(dep.view);
    if (!viewEl) return;
    injectCss();
    var links = captureAccountLinks(dep);
    var prior = viewEl.querySelectorAll(':scope > .scw-qst-card');
    for (var p = 0; p < prior.length; p++) prior[p].remove();
    var rows = viewEl.querySelectorAll('tbody tr[id]');
    for (var r = 0; r < rows.length; r++) {
      viewEl.appendChild(buildCard(rows[r], links));
    }
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    // The card is a pure function of the grid (row data) + the details view
    // (edit/add hrefs) — rebuilding on EITHER view's render makes the
    // final state order-independent. No timers racing other modules.
    DEPLOYMENTS.forEach(function (dep) {
      var rerun = function () { setTimeout(function () { render(dep); }, 30); };
      SCW.onViewRender(dep.view, rerun, EVENT_NS);
      if (dep.detailView) SCW.onViewRender(dep.detailView, rerun, EVENT_NS);
    });
  }
})();
/*** END FEATURE: System Setup Questionnaire card ***************************/
