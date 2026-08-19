/*** CHANGE ORDER CARDS (deploy dashboards) ********************************
 *
 * Replaces the raw Change Orders grid on the deployment dashboards with a
 * card strip consistent with the rest of the deploy UI (acceptance-card /
 * other-files-gallery family): one card per CO — friendly name + CO number,
 * a status pill colored per CO lifecycle stage, expiration date (amber when
 * past), proposal basis when present, and an Open button that follows the
 * grid's own edit link.
 *
 * Detection is by COLUMNS, not view id: any kn-table whose header carries
 * BOTH field_2953 (CO status) and field_2122 (CALC_sow id) is a CO grid —
 * field keys are object-level, so this covers the sub dashboard grid
 * (view_4123, scene_1353), the ops analogue, and any future CO list with no
 * config change. The native table + records nav are hidden (DOM kept — the
 * deploy nav counts rows off it); cards rebuild from the rows on every
 * render, so inline updates and refetches stay correct.
 ***************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-co-cards-css';
  var ON_CLS   = 'scw-co-cards-on';

  // CO (SOW-object) field keys — same on every CO grid.
  var F = {
    number: 'field_2122',   // CALC_sow id ("60236777605-SW1638CO")
    status: 'field_2953',   // FLAG_change order status
    basis:  'field_2942',   // REL_proposal basis (connection)
    exp:    'field_2135',   // INPUT_expiration date
    name:   'field_2126'    // INPUT: sow friendly name
  };

  // Status pill palette — one entry per CO Status option (docs/change-orders).
  // Unknown/blank statuses fall back to the Draft slate.
  var STATUS_COLORS = {
    'draft':               { bg: '#f1f5f9', bd: '#e2e8f0', fg: '#475569' },
    'pending sub pricing': { bg: '#fffbeb', bd: '#fde68a', fg: '#b45309' },
    'ops review':          { bg: '#eef2ff', bd: '#c7d2fe', fg: '#4338ca' },
    'issued':              { bg: '#f0f9ff', bd: '#bae6fd', fg: '#0369a1' },
    'accepted':            { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534' },
    'applied':             { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#047857' },
    'declined':            { bg: '#fff1f2', bd: '#fecdd3', fg: '#be123c' },
    'void':                { bg: '#f3f4f6', bd: '#e5e7eb', fg: '#6b7280' }
  };
  function statusColors(status) {
    return STATUS_COLORS[String(status || '').trim().toLowerCase()] ||
           STATUS_COLORS['draft'];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function cellText(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return '';
    return String(td.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  /** MM/DD/YYYY → true when strictly before today (local). */
  function isPastDate(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return false;
    var d = new Date(+m[3], +m[1] - 1, +m[2]);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      // Full cutover inside a transformed view: cards replace the table.
      '.' + ON_CLS + ' .kn-table-wrapper,',
      '.' + ON_CLS + ' .kn-records-nav { display: none !important; }',

      '.scw-co-cards { display: flex; flex-direction: column; gap: 8px; }',
      '.scw-co-card {',
      '  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  padding: 11px 14px;',
      '  box-shadow: inset 3px 0 0 var(--scw-co-accent, #94a3b8);',
      '}',
      '.scw-co-card__main { flex: 1 1 220px; min-width: 0; }',
      '.scw-co-card__name {',
      '  font: 700 14px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '  overflow-wrap: anywhere;',
      '}',
      '.scw-co-card__num {',
      '  font: 500 11px/1.4 system-ui, sans-serif; color: #94a3b8;',
      '  letter-spacing: .02em; margin-top: 1px;',
      '}',
      '.scw-co-card__meta {',
      '  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
      '  flex: 0 1 auto;',
      '}',
      '.scw-co-card__pill {',
      '  display: inline-flex; align-items: center; padding: 2px 10px;',
      '  border-radius: 999px; border: 1px solid;',
      '  font: 700 11px/1.6 system-ui, sans-serif; letter-spacing: .02em;',
      '  white-space: nowrap;',
      '}',
      '.scw-co-card__exp {',
      '  font: 500 12px/1.4 system-ui, sans-serif; color: #64748b; white-space: nowrap;',
      '}',
      '.scw-co-card__exp--past { color: #b45309; font-weight: 700; }',
      '.scw-co-card__basis {',
      '  font: 500 12px/1.4 system-ui, sans-serif; color: #64748b; white-space: nowrap;',
      '}',
      '.scw-co-card__open {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 6px 14px; border-radius: 7px; white-space: nowrap;',
      '  background: #0f4c75; color: #fff !important; text-decoration: none !important;',
      '  border: 1px solid #0f4c75;',
      '  font: 600 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-co-card__open:hover { background: #0d3f61; border-color: #0d3f61; }',
      '.scw-co-card--empty {',
      '  box-shadow: none; border-style: dashed; justify-content: center;',
      '  color: #94a3b8; font: 500 12.5px/1.4 system-ui, sans-serif;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function isCoGrid(viewEl) {
    return !!(viewEl &&
      viewEl.querySelector('thead th.' + F.status) &&
      viewEl.querySelector('thead th.' + F.number));
  }

  function buildCard(tr) {
    var name   = cellText(tr, F.name);
    var number = cellText(tr, F.number);
    var status = cellText(tr, F.status);
    var exp    = cellText(tr, F.exp);
    var basis  = cellText(tr, F.basis);
    var link   = tr.querySelector('td.kn-table-link a.kn-link-page');
    var href   = link ? link.getAttribute('href') : '';
    var col    = statusColors(status);

    var card = document.createElement('div');
    card.className = 'scw-co-card';
    card.style.setProperty('--scw-co-accent', col.fg);
    card.innerHTML =
      '<div class="scw-co-card__main">' +
        '<div class="scw-co-card__name">' + esc(name || number || 'Change Order') + '</div>' +
        (name && number ? '<div class="scw-co-card__num">' + esc(number) + '</div>' : '') +
      '</div>' +
      '<div class="scw-co-card__meta">' +
        (status
          ? '<span class="scw-co-card__pill" style="background:' + col.bg +
            ';border-color:' + col.bd + ';color:' + col.fg + ';">' + esc(status) + '</span>'
          : '') +
        (exp
          ? '<span class="scw-co-card__exp' + (isPastDate(exp) ? ' scw-co-card__exp--past' : '') +
            '" title="Pricing expiration">' + (isPastDate(exp) ? 'Expired ' : 'Expires ') +
            esc(exp) + '</span>'
          : '') +
        (basis ? '<span class="scw-co-card__basis">Basis: ' + esc(basis) + '</span>' : '') +
      '</div>' +
      (href ? '<a class="scw-co-card__open" href="' + esc(href) + '">Open</a>' : '');
    return card;
  }

  function transform(viewEl) {
    if (!viewEl || !isCoGrid(viewEl)) return;
    injectCss();
    viewEl.classList.add(ON_CLS);

    var wrap = viewEl.querySelector('.kn-table-wrapper');
    if (!wrap) return;
    var prior = viewEl.querySelector(':scope > .scw-co-cards, .scw-co-cards');
    if (prior && prior.parentNode) prior.parentNode.removeChild(prior);

    var list = document.createElement('div');
    list.className = 'scw-co-cards';
    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!rows.length) {
      list.innerHTML = '<div class="scw-co-card scw-co-card--empty">No change orders yet.</div>';
    } else {
      for (var i = 0; i < rows.length; i++) list.appendChild(buildCard(rows[i]));
    }
    wrap.parentNode.insertBefore(list, wrap.nextSibling);
  }

  function scanAll() {
    var views = document.querySelectorAll('.kn-table.kn-view');
    for (var i = 0; i < views.length; i++) transform(views[i]);
  }

  $(document)
    .off('knack-view-render.any.scwCoCards')
    .on('knack-view-render.any.scwCoCards', function (event, view) {
      if (!view || !view.key) return;
      transform(document.getElementById(view.key));
    });
  $(document)
    .off('knack-scene-render.any.scwCoCards')
    .on('knack-scene-render.any.scwCoCards', function () {
      // Late sweep — KTL accordion wrapping can re-home the view element
      // after the per-view render event.
      setTimeout(scanAll, 400);
    });
})();
/*** END CHANGE ORDER CARDS ************************************************/
