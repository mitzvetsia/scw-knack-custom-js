/*** FEATURE: "Import Unique Items" button on each row of view_3869 ***/
/**
 * For each row in view_3869 (alternative SOWs on the same project),
 * injects an "Import Unique Items (N)" button. N = count of line items
 * connected to that source SOW that are NOT already connected to the
 * current (receiving) SOW. N is computed from view_3913 — a hidden grid
 * of all SOW line items connected to the project, where field_2154 is
 * the multi-connection back to SOW headers.
 *
 * Click fires the Make webhook at SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK
 * with:
 *   {
 *     receivingRecordId: <current SOW id from view_3827>,
 *     sourceRecordId:    <tr.id of the row where the button lives>,
 *     triggeredBy:       { id, name, email }
 *   }
 *
 * Make is expected to look up all line items on the source SOW, filter
 * to those NOT already on the receiving SOW, and append the receiving
 * SOW's id to each such item's field_2154 connection. The button is
 * never rendered on the self-row (hidden by hide-self-row).
 */
(function () {
  'use strict';

  var TARGET_VIEW    = 'view_3869';
  var GATE_VIEW      = 'view_3827';   // SOW detail view on the same scene
  var LINE_ITEM_VIEW = 'view_3913';   // Hidden grid of all SOW line items on this project
  var SOW_CONN_FIELD = 'field_2154';  // SOW Header connection on a line item
  var BTN_MARKER     = 'scw-import-unique-items-btn';
  var BTN_LABEL      = 'Import Unique Items';
  var EVENT_NS       = '.scwImportUniqueItems';
  var COL_CLASS      = 'scw-import-unique-items-col';

  // sowId → Set<lineItemId>
  var sowToItems = null;

  var DOWNLOAD_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // Inject styles once.
  (function injectStyles() {
    if (document.getElementById('scw-import-unique-items-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-import-unique-items-css';
    s.textContent =
      '#' + TARGET_VIEW + ' th.' + COL_CLASS + ',' +
      '#' + TARGET_VIEW + ' td.' + COL_CLASS + ' {' +
      '  text-align: center; white-space: nowrap; padding: 4px 8px;' +
      '}' +
      '.' + BTN_MARKER + ' {' +
      '  display: flex; align-items: center; justify-content: center; gap: 6px;' +
      '  width: 100%;' +
      '  font-size: 12px; font-weight: 600;' +
      '  padding: 7px 10px; border-radius: 5px;' +
      '  background: #163C6E; color: #fff !important;' +
      '  border: 1px solid #163C6E; cursor: pointer;' +
      '  line-height: 1.2; white-space: nowrap;' +
      '  transition: background 0.15s;' +
      '}' +
      '.' + BTN_MARKER + ':hover { background: #0f2d55; border-color: #0f2d55; }' +
      '.' + BTN_MARKER + '.is-loading {' +
      '  pointer-events: none; opacity: 0.7; cursor: wait;' +
      '}' +
      '.' + BTN_MARKER + '.is-loading svg {' +
      '  animation: scw-import-unique-spin 0.8s linear infinite;' +
      '}' +
      '.' + BTN_MARKER + '[data-unique-count="0"] {' +
      '  pointer-events: none; opacity: 0.5; cursor: default;' +
      '  background: #6b7280; border-color: #6b7280;' +
      '}' +
      '@keyframes scw-import-unique-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  })();

  function getReceivingSowId() {
    try {
      var v = Knack.views && Knack.views[GATE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Build sowId → Set<lineItemId> from view_3913's model.
  function buildSowIndex() {
    sowToItems = null;
    try {
      var v = Knack.views && Knack.views[LINE_ITEM_VIEW];
      if (!v || !v.model || !v.model.data || !v.model.data.models) return;
      var models = v.model.data.models;
      var idx = {};
      for (var i = 0; i < models.length; i++) {
        var rec = models[i] && models[i].attributes;
        if (!rec || !rec.id) continue;
        var conns = rec[SOW_CONN_FIELD + '_raw'];
        if (!conns || !conns.length) continue;
        for (var j = 0; j < conns.length; j++) {
          var sowId = conns[j] && conns[j].id;
          if (!sowId) continue;
          if (!idx[sowId]) idx[sowId] = {};
          idx[sowId][rec.id] = 1;
        }
      }
      sowToItems = idx;
    } catch (e) { /* ignore */ }
  }

  // Count line items connected to sourceSowId that are NOT connected to receivingSowId.
  function uniqueCountFor(sourceSowId, receivingSowId) {
    if (!sowToItems) return null;
    var src = sowToItems[sourceSowId];
    if (!src) return 0;
    var rcv = sowToItems[receivingSowId] || {};
    var n = 0;
    for (var itemId in src) {
      if (Object.prototype.hasOwnProperty.call(src, itemId) && !rcv[itemId]) n++;
    }
    return n;
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    var iconSpan = btn.querySelector('.scw-import-unique-items-icon');
    if (loading) {
      btn.classList.add('is-loading');
      if (iconSpan) iconSpan.innerHTML = SPINNER_SVG;
    } else {
      btn.classList.remove('is-loading');
      if (iconSpan) iconSpan.innerHTML = DOWNLOAD_SVG;
    }
  }

  function setBtnLabel(btn, sourceRecordId) {
    var labelSpan = btn.querySelector('.scw-import-unique-items-label');
    if (!labelSpan) return;
    var rcv = getReceivingSowId();
    var count = (rcv && sourceRecordId) ? uniqueCountFor(sourceRecordId, rcv) : null;
    if (count === null) {
      labelSpan.textContent = BTN_LABEL;
      btn.removeAttribute('data-unique-count');
      btn.title = 'Copy items from this SOW that are not already on the current SOW';
    } else {
      labelSpan.textContent = BTN_LABEL + ' (' + count + ')';
      btn.setAttribute('data-unique-count', String(count));
      btn.title = count === 0
        ? 'No unique items on this SOW — nothing to import'
        : 'Copy ' + count + ' item' + (count === 1 ? '' : 's') +
          ' from this SOW not already on the current SOW';
    }
  }

  function refreshAllBtnLabels() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var btns = viewEl.querySelectorAll('.' + BTN_MARKER);
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var tr  = btn.closest('tr[id]');
      if (!tr) continue;
      setBtnLabel(btn, tr.id);
    }
  }

  function fireWebhook(btn, sourceRecordId) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Import-unique-items webhook URL is not configured.');
      return;
    }
    var receivingRecordId = getReceivingSowId();
    if (!receivingRecordId) {
      alert('Could not determine current SOW record ID.');
      return;
    }
    if (!sourceRecordId) {
      alert('Could not determine source SOW record ID.');
      return;
    }
    if (receivingRecordId === sourceRecordId) {
      alert('Source and receiving SOW are the same — nothing to import.');
      return;
    }

    setBtnLoading(btn, true);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receivingRecordId: receivingRecordId,
        sourceRecordId:    sourceRecordId,
        triggeredBy:       getTriggeredBy()
      })
    }).then(function (resp) {
      return resp.json().catch(function () { return null; });
    }).then(function (data) {
      if (data && data.success) {
        // Reload so the newly-imported items appear in the worksheet.
        window.location.reload();
        return;
      }
      setBtnLoading(btn, false);
      alert((data && (data.error || data.message)) || 'Failed to import items.');
    }).catch(function (err) {
      setBtnLoading(btn, false);
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // ── Inject a button-cell into each data row ──────────────
  function buildButton(sourceRecordId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_MARKER;
    btn.title = 'Copy items from this SOW that are not already on the current SOW';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'scw-import-unique-items-icon';
    iconSpan.style.cssText = 'display:inline-flex; align-items:center;';
    iconSpan.innerHTML = DOWNLOAD_SVG;
    btn.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'scw-import-unique-items-label';
    labelSpan.textContent = BTN_LABEL;
    btn.appendChild(labelSpan);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('is-loading')) return;
      if (btn.getAttribute('data-unique-count') === '0') return;
      fireWebhook(btn, sourceRecordId);
    });

    setBtnLabel(btn, sourceRecordId);
    return btn;
  }

  function syncRows() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var table  = viewEl.querySelector('table.kn-table-table');
    if (!table) return;
    var thead  = table.querySelector('thead tr');
    var tbody  = table.querySelector('tbody');

    // Append a dedicated header cell once (empty label; buttons are self-describing).
    if (thead && !thead.querySelector('th.' + COL_CLASS)) {
      var th = document.createElement('th');
      th.className = COL_CLASS;
      th.innerHTML = '<span class="table-fixed-label"></span>';
      thead.appendChild(th);
    }

    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      // Skip no-data rows and any row hidden by hide-self-row etc.
      if (tr.classList.contains('kn-tr-nodata')) continue;
      var recordId = tr.id;
      if (!/^[a-f0-9]{24}$/.test(recordId)) continue;
      // Don't inject into the current SOW's own row (safety even though
      // hide-self-row hides it already).
      if (recordId === getReceivingSowId()) continue;
      if (tr.querySelector('.' + BTN_MARKER)) continue;

      var td = document.createElement('td');
      td.className = COL_CLASS;
      td.appendChild(buildButton(recordId));
      tr.appendChild(td);
    }
  }

  // ── Bindings ─────────────────────────────────────────────
  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
      setTimeout(function () { syncRows(); refreshAllBtnLabels(); }, 400);
    });

  $(document)
    .off('knack-view-render.' + GATE_VIEW + EVENT_NS)
    .on('knack-view-render.' + GATE_VIEW + EVENT_NS, function () {
      setTimeout(function () { syncRows(); refreshAllBtnLabels(); }, 400);
    });

  $(document)
    .off('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS)
    .on('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS, function () {
      buildSowIndex();
      refreshAllBtnLabels();
    });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(function () { syncRows(); refreshAllBtnLabels(); }, 1200);
    });
})();
