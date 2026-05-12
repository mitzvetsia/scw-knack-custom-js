/*****  Install Camera Config Sub-panel  ************************/
/**
 * On the Implementation page (scene_1311), view_3916 holds IP-camera
 * configs that connect back to install line items (view_3915) via
 * field_2835. This module folds each config into the matching install
 * worksheet card's detail panel and hides the standalone view_3916
 * table so the data lives in one place.
 *
 * v1 scope: read-only display of the 4 config fields.  A small
 * "Show config grid" button at the top of the install worksheet
 * un-hides view_3916 for direct inline editing when needed.
 *
 * Fields displayed:
 *   field_2836  INPUT_recording schedule
 *   field_2837  INPUT_osd
 *   field_2842  INPUT_audio
 *   field_2843  INPUT_client notes
 *
 * Source row connection:
 *   field_2835  INSTALL_line item  (connection to view_3915 record)
 *
 * Merge strategy:
 *   1. Run on knack-view-render.view_3915 (after device-worksheet has
 *      built the worksheet cards).
 *   2. Run on knack-view-render.view_3916 (after the config grid loads).
 *   3. Re-run at staggered delays (50/250/750/2000 ms) because the two
 *      views can render in either order and device-worksheet may run
 *      post-render passes that rebuild the detail panel.
 *   4. MutationObserver on view_3915 catches any later DOM rebuild.
 */
(function () {
  'use strict';

  var INSTALL_VIEW = 'view_3915';
  var CONFIG_VIEW  = 'view_3916';

  var CONNECTION_FIELD = 'field_2835';   // → install line item record id
  var FIELDS = [
    { key: 'field_2836', label: 'Recording schedule' },
    { key: 'field_2837', label: 'OSD' },
    { key: 'field_2842', label: 'Audio' },
    { key: 'field_2843', label: 'Client notes' }
  ];

  var SUBPANEL_CLS  = 'scw-install-config';
  var CSS_ID        = 'scw-install-config-css';
  // (former toggle-button constants removed — the camera-config grid is
  // now always hidden; configs are folded into the worksheet detail panel.)

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Camera-config grid view is always hidden — its data is folded
         into each worksheet card's detail panel via the merge() pass. */
      '#' + CONFIG_VIEW + ' { display: none !important; }',

      /* Match .scw-ws-section padding so the camera-config left edge
         lines up with the detail-panel field labels above. */
      '.' + SUBPANEL_CLS + ' {',
      '  border-top: 1px dashed #e2e8f0;',
      '  padding: 14px 20px 14px 70px;',
      '}',

      /* ── Existing-cabling / Exterior / Plenum as inline info chips ──
         The fields live in the detail's Info section as normal field
         rows.  showWhenFieldIsYes hides the row when value != Yes via
         inline style="display: none", so we MUST NOT override the
         host .scw-ws-field's display — we only restyle the LABEL
         (which becomes the chip) and HIDE the value.  Sky-blue
         palette so it reads informational, not as a warning. */
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2807"] .scw-ws-field-label,',
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2805"] .scw-ws-field-label,',
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2806"] .scw-ws-field-label {',
      '  display: inline-block;',
      '  width: auto;',
      '  min-width: 0;',
      '  padding: 3px 10px;',
      '  background: #e0f2fe;',
      '  border: 1px solid #7dd3fc;',
      '  color: #075985;',
      '  border-radius: 999px;',
      '  font-size: 12px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.4px;',
      '  white-space: nowrap;',
      '}',
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2807"] .scw-ws-field-value,',
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2805"] .scw-ws-field-value,',
      '#' + INSTALL_VIEW + ' .scw-ws-field[data-scw-field="field_2806"] .scw-ws-field-value {',
      '  display: none;',
      '}',
      '.' + SUBPANEL_CLS + '-title {',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.3px;',
      '  text-transform: uppercase;',
      '  color: #0f4c75;',
      '  margin-bottom: 6px;',
      '}',

      /* 4-column grid — each config row uses one full grid line. */
      '.' + SUBPANEL_CLS + '-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, minmax(0, 1fr));',
      '  gap: 8px 16px;',
      '  align-items: start;',
      '}',
      '.' + SUBPANEL_CLS + '-cell {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 2px;',
      '  min-width: 0;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-label {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #4b5563;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-value {',
      '  font-size: 13px;',
      '  color: #1f2937;',
      '  word-break: break-word;',
      '  overflow-wrap: anywhere;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-empty {',
      '  color: #94a3b8;',
      '}',
      /* On narrower viewports collapse to 2 cols */
      '@media (max-width: 900px) {',
      '  .' + SUBPANEL_CLS + '-grid { grid-template-columns: 1fr 1fr; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Read a cell's html + text. Preserves spaces; only strips &nbsp;. */
  function readCell(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return { html: '', text: '' };
    // The col-N wrapper exists for table cells; fall back to td if missing.
    var wrapper = td.querySelector('span[class^="col-"]') || td;
    var html = (wrapper.innerHTML || '').replace(/&nbsp;/g, ' ').trim();
    var text = (wrapper.textContent || '').replace(/ /g, ' ').trim();
    return { html: html, text: text };
  }

  /** Read the connected install-line-item record id from a config row. */
  function readLineItemId(configTr) {
    var td = configTr.querySelector('td.' + CONNECTION_FIELD);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    return (span.className || '').trim();
  }

  /** Build { lineItemId → [configRec, ...] } from view_3916 DOM. */
  function buildConfigIndex() {
    var index = {};
    var configView = document.getElementById(CONFIG_VIEW);
    if (!configView) return index;
    var rows = configView.querySelectorAll('table tbody > tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var lineItemId = readLineItemId(tr);
      if (!lineItemId) continue;
      var cfg = { id: tr.id, fields: {} };
      for (var f = 0; f < FIELDS.length; f++) {
        cfg.fields[FIELDS[f].key] = readCell(tr, FIELDS[f].key);
      }
      if (!index[lineItemId]) index[lineItemId] = [];
      index[lineItemId].push(cfg);
    }
    return index;
  }

  /** Inject the configs sub-panel into one worksheet card. The panel
   *  lives INSIDE .scw-ws-detail so it follows the accordion (hidden
   *  when the row is collapsed). */
  function injectSubpanel(wsTr, configs) {
    var prior = wsTr.querySelector('.' + SUBPANEL_CLS);
    if (prior) prior.parentNode.removeChild(prior);
    if (!configs || !configs.length) return;

    var detail = wsTr.querySelector('.scw-ws-card > .scw-ws-detail');
    if (!detail) return;

    var panel = document.createElement('div');
    panel.className = SUBPANEL_CLS;

    var title = document.createElement('div');
    title.className = SUBPANEL_CLS + '-title';
    title.textContent = configs.length > 1
      ? 'Camera Configs (' + configs.length + ')'
      : 'Camera Config';
    panel.appendChild(title);

    for (var c = 0; c < configs.length; c++) {
      var cfg = configs[c];
      var grid = document.createElement('div');
      grid.className = SUBPANEL_CLS + '-grid';

      for (var f = 0; f < FIELDS.length; f++) {
        var spec = FIELDS[f];
        var val = cfg.fields[spec.key] || { html: '', text: '' };

        var cell = document.createElement('div');
        cell.className = SUBPANEL_CLS + '-cell';

        var lbl = document.createElement('div');
        lbl.className = SUBPANEL_CLS + '-cell-label';
        lbl.textContent = spec.label;
        cell.appendChild(lbl);

        var v = document.createElement('div');
        v.className = SUBPANEL_CLS + '-cell-value';
        if (val.text) {
          v.innerHTML = val.html || val.text;
        } else {
          v.textContent = '—';
          v.classList.add(SUBPANEL_CLS + '-cell-empty');
        }
        cell.appendChild(v);
        grid.appendChild(cell);
      }

      panel.appendChild(grid);

      if (c < configs.length - 1) {
        var sep = document.createElement('hr');
        sep.style.cssText = 'border: 0; border-top: 1px dashed #e2e8f0; margin: 8px 0;';
        panel.appendChild(sep);
      }
    }

    // Mount as the FIRST child of .scw-ws-detail so the camera config
    // sits above the sections grid (and stays hidden when the row
    // accordion is closed, since it lives inside the collapsible
    // panel).
    detail.insertBefore(panel, detail.firstChild);
  }

  // Set true while we're writing our own DOM so the MutationObserver
  // doesn't re-fire merge() in response to our own injections.
  var _selfMutating = false;
  // Hash of (configs + wsRow ids) from the last successful merge —
  // skip work when nothing changed.
  var _lastHash = '';

  function computeHash(index, wsRows) {
    var keys = Object.keys(index).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k++) {
      var lid = keys[k];
      parts.push(lid);
      var arr = index[lid];
      for (var a = 0; a < arr.length; a++) {
        var cfg = arr[a];
        parts.push(cfg.id);
        for (var f = 0; f < FIELDS.length; f++) {
          var v = cfg.fields[FIELDS[f].key];
          parts.push(v ? v.text : '');
        }
      }
    }
    for (var w = 0; w < wsRows.length; w++) parts.push(wsRows[w].id);
    return parts.join('|');
  }

  /** Merge configs into every install worksheet card. */
  function merge() {
    var wsRows = document.querySelectorAll(
      'tr.scw-ws-row[data-scw-view-id="' + INSTALL_VIEW + '"]'
    );
    if (!wsRows.length) return;
    var index = buildConfigIndex();
    var hash = computeHash(index, wsRows);
    var needsInject = (hash !== _lastHash);
    _lastHash = hash;

    _selfMutating = true;
    try {
      for (var i = 0; i < wsRows.length; i++) {
        if (needsInject) {
          injectSubpanel(wsRows[i], index[wsRows[i].id] || []);
        }
      }
    } finally {
      // Defer clearing so the observer ignores the microtask batch
      // emitted by our DOM writes above.
      setTimeout(function () { _selfMutating = false; }, 0);
    }
  }

  /** Reset the hash so the next merge() rebuilds even if data is unchanged. */
  function invalidate() { _lastHash = ''; }

  /** Watch only the install-view tbody (row add/remove). Anything deeper
   *  is our own work and is ignored via _selfMutating. */
  function installMutationObserver() {
    var installView = document.getElementById(INSTALL_VIEW);
    if (!installView || installView.__scwInstallObs) return;
    var tbody = installView.querySelector('table tbody');
    if (!tbody) return;
    installView.__scwInstallObs = true;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (_selfMutating || pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        // Row set may have changed — re-evaluate.
        invalidate();
        merge();
      }, 150);
    });
    obs.observe(tbody, { childList: true });
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    injectCss();
    if (!window.SCW || typeof window.SCW.onViewRender !== 'function') return;

    window.SCW.onViewRender(INSTALL_VIEW, function () {
      // tbody is re-built; row set may have changed.
      invalidate();
      installMutationObserver();
      setTimeout(merge, 50);
    }, 'scwInstallConfig');

    window.SCW.onViewRender(CONFIG_VIEW, function () {
      // Config data may have changed after an inline edit.
      invalidate();
      setTimeout(merge, 50);
    }, 'scwInstallConfig');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
