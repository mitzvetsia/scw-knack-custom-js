/*** PHOTO GRID — UNLINKED FILTER (view_3522 "Additional Photos", sales) ******
 *
 * The sales scope-of-work page's "Additional Photos" grid (view_3522) is
 * the DOC_photos grid the worksheet's photo modal SAVES through (photo-
 * edit-panel.js SAVE_VIEWS: view_3586 → view_3522). A view-based PUT can
 * only touch records the view actually serves, so the grid's Builder filter
 * has to cover EVERY photo on the SOW — not just the unassigned ones the
 * section is meant to show. This module keeps the section honest anyway:
 * rows whose "Assign to SOW Item" connection is populated are hidden
 * client-side on every render, so "Additional Photos" still reads as
 * "photos not attached to a line item" while the grid underneath serves
 * the whole SOW for the save path.
 *
 * Also patches what the row count feeds: the "Showing 1-N of N" summary
 * and the KTL accordion pill (via the data-scw-acc-count override
 * ktl-accordion.js computeCount reads), and drops in a "nothing unassigned"
 * placeholder row when everything on the page is attached.
 *
 * Config-driven (VIEWS) — any DOC_photos grid that should display only
 * unlinked photos while serving all of them can opt in.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEWS = [
    {
      id: 'view_3522',                 // sales "Additional Photos" (scene_1116)
      linkFields: ['field_2342'],      // DOC_photos → SOW line item ("Assign to SOW Item")
      emptyText: 'No additional photos — every photo on this SOW is attached to a line item.'
    }
  ];

  var STYLE_ID = 'scw-pguf-css';
  var NS       = 'scwPhotoGridUnlinked';
  var ATTR     = 'data-scw-pguf-linked';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      'tr[' + ATTR + '="1"] { display: none !important; }',
      'tr.scw-pguf-empty td {',
      '  color: #64748b; font: 12.5px/1.4 system-ui, -apple-system, sans-serif;',
      '  padding: 14px 12px; text-align: left;',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  // A row counts as LINKED when any configured connection cell holds a
  // connection value. Empty connection cells render `&nbsp;` only (see
  // CLAUDE.md "Reading Connection Fields from Table DOM").
  function isLinked(tr, linkFields) {
    for (var i = 0; i < linkFields.length; i++) {
      var td = tr.querySelector('td[data-field-key="' + linkFields[i] + '"]');
      if (!td) continue;
      if (td.querySelector('span[data-kn="connection-value"]')) return true;
      var txt = (td.textContent || '').replace(/ /g, ' ').trim();
      if (txt) return true;
    }
    return false;
  }

  function apply(cfg) {
    var view = document.getElementById(cfg.id);
    if (!view) return;
    var table = view.querySelector('table.kn-table');
    var tbody = table && table.querySelector('tbody');
    if (!tbody) return;

    var rows = tbody.querySelectorAll('tr[id]');
    var visible = 0, hidden = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!/^[a-f0-9]{24}$/i.test(tr.id)) continue;
      if (isLinked(tr, cfg.linkFields)) {
        if (tr.getAttribute(ATTR) !== '1') tr.setAttribute(ATTR, '1');
        hidden++;
      } else {
        if (tr.hasAttribute(ATTR)) tr.removeAttribute(ATTR);
        visible++;
      }
    }

    // "Showing 1-N of N" — reflect what's actually visible on this page.
    var summary = view.querySelector('.kn-entries-summary');
    if (summary && hidden) {
      var txt = '<span class="light">Showing</span> ' +
        (visible ? '1-' + visible : '0') + ' <span class="light">of</span> ' + visible;
      if (summary.innerHTML !== txt) summary.innerHTML = txt;
    }

    // Placeholder when every rendered row is attached to a line item —
    // Knack's own "No data" row only exists when the grid is truly empty.
    var empty = tbody.querySelector('tr.scw-pguf-empty');
    if (!visible && hidden) {
      if (!empty) {
        var cols = table.querySelectorAll('thead th').length || 1;
        empty = document.createElement('tr');
        empty.className = 'scw-pguf-empty';
        var td = document.createElement('td');
        td.setAttribute('colspan', String(cols));
        td.textContent = cfg.emptyText || 'No unassigned photos.';
        empty.appendChild(td);
        tbody.appendChild(empty);
      }
    } else if (empty && empty.parentNode) {
      empty.parentNode.removeChild(empty);
    }

    // KTL accordion pill — ktl-accordion.js computeCount honors this
    // override ahead of the model count (which includes the hidden rows).
    var countStr = String(visible);
    if (view.getAttribute('data-scw-acc-count') !== countStr) {
      view.setAttribute('data-scw-acc-count', countStr);
    }
  }

  injectStyles();
  for (var v = 0; v < VIEWS.length; v++) {
    (function (cfg) {
      var handler = function () { apply(cfg); };
      if (window.SCW && typeof SCW.onViewRender === 'function') {
        SCW.onViewRender(cfg.id, handler, NS);
      } else {
        $(document)
          .off('knack-view-render.' + cfg.id + '.' + NS)
          .on('knack-view-render.' + cfg.id + '.' + NS, handler);
      }
      if (document.getElementById(cfg.id)) handler();
    })(VIEWS[v]);
  }

  window.SCW = window.SCW || {};
  SCW.photoGridUnlinkedFilter = { apply: function (viewId) {
    for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].id === viewId) apply(VIEWS[i]);
  } };
})();
/*** END PHOTO GRID — UNLINKED FILTER ****************************************/
