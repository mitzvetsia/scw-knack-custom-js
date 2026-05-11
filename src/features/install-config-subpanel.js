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
 * The merge re-runs on both knack-view-render.view_3915 and
 * knack-view-render.view_3916 events so it tolerates either view
 * re-rendering independently (after inline edits, filter changes, etc.)
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
  var SECTION_CLS   = 'scw-ws-section';     // matches device-worksheet
  var FIELD_CLS     = 'scw-ws-field';
  var LABEL_CLS     = 'scw-ws-field-label';
  var VALUE_CLS     = 'scw-ws-field-value';
  var CSS_ID        = 'scw-install-config-css';
  var TOGGLE_BTN_ID = 'scw-install-config-toggle';
  var SHOWN_STATE   = 'scw-install-config-grid-shown';

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Hide the raw config grid — its data is folded into the worksheet.
         A toggle button can re-show it on demand. */
      'body:not(.' + SHOWN_STATE + ') #' + CONFIG_VIEW + ' {',
      '  display: none !important;',
      '}',

      /* Sub-panel header */
      '.' + SUBPANEL_CLS + ' {',
      '  border-top: 1px dashed #e2e8f0;',
      '  padding-top: 10px;',
      '  margin-top: 10px;',
      '}',
      '.' + SUBPANEL_CLS + '-title {',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.3px;',
      '  text-transform: uppercase;',
      '  color: #0f4c75;',
      '  margin-bottom: 6px;',
      '}',
      '.' + SUBPANEL_CLS + '-empty {',
      '  font-size: 12px;',
      '  color: #94a3b8;',
      '  font-style: italic;',
      '}',

      /* Toggle button for un-hiding the raw config grid */
      '#' + TOGGLE_BTN_ID + ' {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 4px 10px;',
      '  margin: 6px 0;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: #0f4c75;',
      '  background: #f1f5f9;',
      '  border: 1px solid #cbd5e1;',
      '  border-radius: 4px;',
      '  cursor: pointer;',
      '}',
      '#' + TOGGLE_BTN_ID + ':hover { background: #e2e8f0; }',
      'body.' + SHOWN_STATE + ' #' + TOGGLE_BTN_ID + ' {',
      '  background: #dbeafe;',
      '  border-color: #93c5fd;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Pull cell text — rich text preserved via innerHTML, plain via textContent. */
  function readCell(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return '';
    var wrapper = td.querySelector('span.col-' + td.cellIndex) || td;
    var html = (wrapper.innerHTML || '').trim();
    var text = (wrapper.textContent || '').replace(/ /g, '').trim();
    return { html: html, text: text };
  }

  /** Pull the connected line-item record id from a config row's field_2835 cell. */
  function readLineItemId(configTr) {
    var td = configTr.querySelector('td.' + CONNECTION_FIELD);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    return (span.className || '').trim();
  }

  /** Index configs by their connected install line-item id. */
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

  /** Inject a config sub-panel into one worksheet card's detail sections. */
  function injectSubpanel(wsTr, configs) {
    // Remove any previous instance (idempotent re-render)
    var prior = wsTr.querySelector('.' + SUBPANEL_CLS);
    if (prior) prior.parentNode.removeChild(prior);

    if (!configs || !configs.length) return;

    // Find the detail panel's right section (or the last section, whichever exists).
    var sections = wsTr.querySelector('.scw-ws-sections');
    if (!sections) return;

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
      for (var f = 0; f < FIELDS.length; f++) {
        var spec = FIELDS[f];
        var val = cfg.fields[spec.key];
        var fieldRow = document.createElement('div');
        fieldRow.className = FIELD_CLS;

        var lbl = document.createElement('div');
        lbl.className = LABEL_CLS;
        lbl.textContent = spec.label;
        fieldRow.appendChild(lbl);

        var v = document.createElement('div');
        v.className = VALUE_CLS;
        if (val && val.text) {
          // Use innerHTML for fields that may carry markup (client notes etc.)
          v.innerHTML = val.html || val.text;
        } else {
          v.textContent = '—';
          v.style.color = '#94a3b8';
        }
        fieldRow.appendChild(v);
        panel.appendChild(fieldRow);
      }
      // Separator between multiple configs on the same line item
      if (c < configs.length - 1) {
        var sep = document.createElement('hr');
        sep.style.cssText = 'border: 0; border-top: 1px dashed #e2e8f0; margin: 8px 0;';
        panel.appendChild(sep);
      }
    }

    // Append into the *last* section so it doesn't disrupt the left/right grid.
    var lastSection = sections.lastElementChild;
    if (lastSection) {
      lastSection.appendChild(panel);
    } else {
      sections.appendChild(panel);
    }
  }

  /** Ensure the "Show config grid" toggle button is present above view_3915. */
  function ensureToggleButton() {
    var installView = document.getElementById(INSTALL_VIEW);
    if (!installView) return;
    if (document.getElementById(TOGGLE_BTN_ID)) return;

    var btn = document.createElement('button');
    btn.id = TOGGLE_BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Show camera-config grid';
    btn.addEventListener('click', function () {
      var on = document.body.classList.toggle(SHOWN_STATE);
      btn.textContent = on ? 'Hide camera-config grid' : 'Show camera-config grid';
    });

    var header = installView.querySelector('.view-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(btn, header.nextSibling);
    } else {
      installView.insertBefore(btn, installView.firstChild);
    }
  }

  /** Merge configs into every worksheet card on view_3915. */
  function merge() {
    var index = buildConfigIndex();
    var wsRows = document.querySelectorAll(
      'tr.scw-ws-row[data-scw-view-id="' + INSTALL_VIEW + '"]'
    );
    for (var i = 0; i < wsRows.length; i++) {
      var wsTr = wsRows[i];
      injectSubpanel(wsTr, index[wsTr.id] || []);
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    injectCss();
    if (!window.SCW || typeof window.SCW.onViewRender !== 'function') return;

    // After the install worksheet rebuilds its cards, fold configs in.
    // device-worksheet builds wsTr rows synchronously inside transformView,
    // so by the time knack-view-render.view_3915 handlers run *after*
    // device-worksheet's own handler, the cards are ready.  We defer one
    // tick (setTimeout 0) just to make sure we run last.
    window.SCW.onViewRender(INSTALL_VIEW, function () {
      ensureToggleButton();
      setTimeout(merge, 0);
    }, 'scwInstallConfig');

    // When the config grid re-renders (e.g. after an inline edit while
    // it's been temporarily un-hidden), refresh the merge.
    window.SCW.onViewRender(CONFIG_VIEW, function () {
      setTimeout(merge, 0);
    }, 'scwInstallConfig');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
