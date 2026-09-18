/*** CUSTOMER ACCOUNT LINKS — make "Who has Access" records open edit, + add button ***
 *
 * On the deploy questionnaire grids (view_4015 ops / view_4053 sub), the
 * "Who has Access" column (field_1778) shows connected customer-account
 * records as plain text. This makes each one a clickable link to its "edit
 * customer account" page, and injects an "Add customer account" button into
 * the cell.
 *
 * The real Knack links (with the correct route prefix + ref params) live in a
 * companion details view (view_4040, "CORE_company Details"):
 *   - edit:  <a href="#…/deploy/<proj>/edit-customer-account/<customerId>">
 *   - add:   <a href="#…/deploy/<proj>/add-customer-account2/<companyId>?ref=…">
 * We harvest those, derive the edit-base route, then hide view_4040 (kept in
 * the DOM, display:none, so its hrefs stay readable).
 *
 * Customer record id = the 24-hex CLASS on the inner connection-value span:
 *   <span id="<companyId>" data-kn="connection-value">
 *     <span class="<customerId>" data-kn="connection-value">Name — email</span>
 *   </span>
 ****************************************************************************/
(function () {
  'use strict';

  // One entry per deployment page. detail = the CORE_company details view
  // the edit/add hrefs are harvested from (hidden in place). The sub
  // dashboard questionnaire grid (view_4053) is deliberately NOT listed —
  // subs don't manage customer accounts (decided 2026-08-12).
  var PAIRS = [
    { grid: 'view_4015', detail: 'view_4040' }   // ops deploy (scene_1311)
  ];
  var CONN_FIELD  = 'field_1778';  // "Who has Access" connection column
  var NS          = '.scwCustAcct';
  var STYLE_ID    = 'scw-cust-acct-css';
  var HEX24       = /^[a-f0-9]{24}$/i;

  // Captured per pair from its details view (persist across renders).
  // grid view key → { editBase, addUrl }
  var _links = {};

  var PLUS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';

  var PENCIL_SVG =
    '<svg class="scw-cust-edit-ic" xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
    '<path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [];
    for (var p = 0; p < PAIRS.length; p++) {
      var GRID_VIEW = PAIRS[p].grid, DETAIL_VIEW = PAIRS[p].detail;
      if (DETAIL_VIEW) {
        // Hide the companion details view's accordion (links harvested from it).
        css.push(
          '.scw-acc-for-' + DETAIL_VIEW + ' { display: none !important; }',
          '#' + DETAIL_VIEW + ' { display: none !important; }');
      }
      css.push(
        // Customer name → clearly-clickable edit link (underline + pencil).
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-edit-link {',
        '  display: inline-flex; align-items: center; gap: 5px;',
        '  color: #0f4c75; font-weight: 600; cursor: pointer;',
        '  text-decoration: underline; text-decoration-color: #93b8d6;',
        '  text-underline-offset: 2px;',
        '}',
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-edit-link:hover {',
        '  color: #0a3a63; text-decoration-color: currentColor;',
        '}',
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-edit-ic {',
        '  flex: 0 0 auto; opacity: .65;',
        '}',
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-edit-link:hover .scw-cust-edit-ic { opacity: 1; }',
        // Add-customer button
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-add-btn {',
        '  display: inline-flex; align-items: center; gap: 5px; margin-top: 12px;',
        '  padding: 4px 10px; border: 1px solid #163C6E; border-radius: 6px;',
        '  background: #163C6E; color: #fff !important; cursor: pointer;',
        '  font: 600 12px system-ui, -apple-system, sans-serif; text-decoration: none !important;',
        '  white-space: nowrap; transition: background 150ms ease, border-color 150ms ease;',
        '}',
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-add-btn:hover {',
        '  background: #0f2d55; border-color: #0f2d55;',
        '}',
        '#' + GRID_VIEW + ' td.' + CONN_FIELD + ' .scw-cust-add-btn svg { flex-shrink: 0; }');
    }
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css.join('\n');
    document.head.appendChild(s);
  }

  // Harvest the edit-base route + the full add href from the pair's details
  // view. Kept in the DOM (display:none) so its hrefs stay readable.
  function captureLinks(pair) {
    var l = (_links[pair.grid] = _links[pair.grid] || { editBase: '', addUrl: '' });
    if (!pair.detail) return l;
    var detail = document.getElementById(pair.detail);
    if (!detail) return l;
    var addA  = detail.querySelector('a[href*="add-customer-account2/"]');
    var editA = detail.querySelector('a[href*="edit-customer-account/"]');
    if (addA)  l.addUrl = addA.getAttribute('href') || l.addUrl;
    // Derive the edit base from whichever link exists (same route prefix).
    var src = (editA && editA.getAttribute('href')) || (addA && addA.getAttribute('href')) || '';
    var m = src.match(/^(#.*\/)(?:edit-customer-account|add-customer-account2)\//);
    if (m) l.editBase = m[1] + 'edit-customer-account/';
    return l;
  }

  // Hide the companion accordion via JS too (the :has() CSS may not fire on
  // older engines). Idempotent.
  function hideDetailAccordion(pair) {
    if (!pair.detail) return;
    var header = document.querySelector(
      '.scw-ktl-accordion__header[data-view-key="' + pair.detail + '"]');
    var acc = header && header.closest ? header.closest('.scw-ktl-accordion') : null;
    if (acc) acc.style.display = 'none';
    var v = document.getElementById(pair.detail);
    if (v) v.style.display = 'none';
  }

  function decorateGrid(pair) {
    var grid = document.getElementById(pair.grid);
    if (!grid) return;
    var editBase = _links[pair.grid] ? _links[pair.grid].editBase : '';
    var addUrl   = _links[pair.grid] ? _links[pair.grid].addUrl : '';
    var cells = grid.querySelectorAll('td.' + CONN_FIELD);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      // No cell-level "done" marker: rely on the per-element guards below so a
      // pass that runs BEFORE view_4040's links are captured doesn't lock the
      // cell out of later passes.

      // 1) Turn each customer connection-value (the inner span carrying a
      //    24-hex class = the customer record id) into an edit link.
      if (editBase) {
        var spans = cell.querySelectorAll('span[data-kn="connection-value"]');
        for (var s = 0; s < spans.length; s++) {
          var span = spans[s];
          var cls = (span.className || '').trim();
          if (!HEX24.test(cls)) continue;            // skip the outer (id-only) wrapper
          if (span.querySelector('.scw-cust-edit-link')) continue;
          var txt = (span.textContent || '').trim();
          if (!txt) continue;
          var a = document.createElement('a');
          a.className = 'scw-cust-edit-link';
          a.href = editBase + cls;
          a.title = 'Edit customer account';
          a.textContent = txt;
          a.insertAdjacentHTML('beforeend', PENCIL_SVG);
          span.textContent = '';
          span.appendChild(a);
        }
      }

      // 2) Inject the "Add customer account" button into the cell.
      if (addUrl && !cell.querySelector('.scw-cust-add-btn')) {
        var host = cell.querySelector('span[class^="col-"]') || cell;
        var btn = document.createElement('a');
        btn.className = 'scw-cust-add-btn';
        btn.href = addUrl;
        btn.innerHTML = PLUS_SVG + '<span>Add customer account</span>';
        host.appendChild(btn);
      }
    }
  }

  // Open the row "view details" link (the magnifier in the .kn-table-link
  // column) in a NEW TAB. These are Knack SPA hash links with a Vue click
  // handler, so we intercept in capture phase (before Knack's router) and
  // window.open the absolute URL. Bound once on the grid container (survives
  // table re-renders).
  function wireNewTab(pair) {
    var grid = document.getElementById(pair.grid);
    if (!grid || grid.getAttribute('data-scw-newtab') === '1') return;
    grid.setAttribute('data-scw-newtab', '1');
    grid.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('td.kn-table-link a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var url = location.href.split('#')[0] + a.getAttribute('href');
      window.open(url, '_blank', 'noopener');
    }, true);
  }

  function run() {
    injectCss();
    for (var p = 0; p < PAIRS.length; p++) {
      var pair = PAIRS[p];
      if (!document.getElementById(pair.grid)) continue;
      captureLinks(pair);
      hideDetailAccordion(pair);
      decorateGrid(pair);
      wireNewTab(pair);
    }
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    PAIRS.forEach(function (pair) {
      var rerun = function () { setTimeout(run, 30); };
      SCW.onViewRender(pair.grid, rerun, NS);
      if (pair.detail) SCW.onViewRender(pair.detail, rerun, NS);
    });
  }
  $(document).off('knack-scene-render.any' + NS)
    .on('knack-scene-render.any' + NS, function () { setTimeout(run, 120); });
  // Views can render in either order; a couple of staggered passes cover the
  // case where the grid paints before the details view's links exist.
  setTimeout(run, 400);
  setTimeout(run, 1500);

  // On-demand diagnostic — run SCW.custAcctDebug() in the console.
  window.SCW = window.SCW || {};
  window.SCW.custAcctDebug = function () {
    var out = [];
    for (var p = 0; p < PAIRS.length; p++) {
      var pair = PAIRS[p];
      var grid = document.getElementById(pair.grid);
      var detail = pair.detail ? document.getElementById(pair.detail) : null;
      var l = _links[pair.grid] || { editBase: '', addUrl: '' };
      out.push({
        gridView: pair.grid,
        gridPresent: !!grid,
        detailPresent: !!detail,
        cells: grid ? grid.querySelectorAll('td.' + CONN_FIELD).length : 0,
        connSpans: grid ? grid.querySelectorAll('td.' + CONN_FIELD + ' span[data-kn="connection-value"]').length : 0,
        editBase: l.editBase,
        addUrl: l.addUrl,
        detailAddLink: detail ? !!detail.querySelector('a[href*="add-customer-account2/"]') : false,
        detailEditLink: detail ? !!detail.querySelector('a[href*="edit-customer-account/"]') : false,
        editLinksInjected: grid ? grid.querySelectorAll('.scw-cust-edit-link').length : 0,
        addBtnsInjected: grid ? grid.querySelectorAll('.scw-cust-add-btn').length : 0
      });
    }
    if (window.console) console.log('[scw-cust-acct] debug', out);
    return out;
  };
})();
/*** END CUSTOMER ACCOUNT LINKS ***/
