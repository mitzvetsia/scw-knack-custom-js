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
      '@keyframes scw-import-unique-spin { to { transform: rotate(360deg); } }' +

      // ── Confirm modal ──
      '.scw-iui-overlay {' +
      '  position: fixed; inset: 0; z-index: 100000;' +
      '  background: rgba(15, 23, 42, 0.55);' +
      '  display: flex; align-items: center; justify-content: center;' +
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;' +
      '}' +
      '.scw-iui-card {' +
      '  background: #fff; border-radius: 10px;' +
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);' +
      '  padding: 22px 24px; min-width: 380px; max-width: 540px;' +
      '  text-align: center;' +
      '}' +
      '.scw-iui-msg {' +
      '  font-size: 15px; font-weight: 700; color: #111827;' +
      '  margin-bottom: 8px;' +
      '}' +
      '.scw-iui-sub {' +
      '  font-size: 13px; color: #4b5563; margin-bottom: 18px;' +
      '}' +
      '.scw-iui-sub strong { color: #111827; }' +
      '.scw-iui-btns {' +
      '  display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;' +
      '}' +
      '.scw-iui-btn {' +
      '  appearance: none; cursor: pointer;' +
      '  padding: 9px 18px; border-radius: 6px;' +
      '  font: 600 13px system-ui, sans-serif;' +
      '  border: 1px solid transparent;' +
      '}' +
      '.scw-iui-btn--cancel {' +
      '  background: #fff; color: #1f2937; border-color: #d1d5db;' +
      '}' +
      '.scw-iui-btn--cancel:hover { background: #f3f4f6; }' +
      '.scw-iui-btn--delete {' +
      '  background: #b91c1c; color: #fff; border-color: #991b1b;' +
      '}' +
      '.scw-iui-btn--delete:hover { background: #991b1b; }' +
      '.scw-iui-btn--primary {' +
      '  background: #163C6E; color: #fff; border-color: #163C6E;' +
      '}' +
      '.scw-iui-btn--primary:hover { background: #0f2d55; border-color: #0f2d55; }';
    document.head.appendChild(s);
  })();

  // Pull a human-readable label (e.g. "SW-1042") for a row in view_3869.
  // Falls back to the record id when no label-bearing cell is found.
  function getRowLabel(tr) {
    if (!tr) return '';
    var cells = tr.querySelectorAll('td:not(.' + COL_CLASS + ')');
    for (var i = 0; i < cells.length; i++) {
      var txt = (cells[i].textContent || '').trim();
      if (txt && txt.length < 80) return txt;
    }
    return tr.id || '';
  }

  // Confirm modal. Resolves with {action: 'cancel'|'import'|'import-delete'}.
  function showImportConfirm(opts) {
    return new Promise(function (resolve) {
      var count       = opts.count;
      var sourceLabel = opts.sourceLabel || 'this SOW';
      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-msg">Import ' + count +
            ' unique item' + (count === 1 ? '' : 's') + '?</div>' +
          '<div class="scw-iui-sub">' +
            'Items will be copied from <strong>' + sourceLabel +
            '</strong> into the current SOW.<br>' +
            'Do you also want to <strong>delete ' + sourceLabel +
            '</strong> after importing?' +
          '</div>' +
          '<div class="scw-iui-btns">' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--delete">Import &amp; Delete ' +
              sourceLabel + '</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--primary">Import only</button>' +
          '</div>' +
        '</div>';

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({ action: answer });
      }
      function onKey(e) { if (e.key === 'Escape') close('cancel'); }

      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      overlay.querySelector('.scw-iui-btn--delete')
        .addEventListener('click', function () { close('import-delete'); });
      overlay.querySelector('.scw-iui-btn--primary')
        .addEventListener('click', function () { close('import'); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      var cancelBtn = overlay.querySelector('.scw-iui-btn--cancel');
      if (cancelBtn) cancelBtn.focus();
    });
  }

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

  function fireWebhook(btn, sourceRecordId, deleteSourceAfterImport) {
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
        receivingRecordId:        receivingRecordId,
        sourceRecordId:           sourceRecordId,
        deleteSourceAfterImport:  !!deleteSourceAfterImport,
        triggeredBy:              getTriggeredBy()
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
      var tr = btn.closest('tr[id]');
      var count = parseInt(btn.getAttribute('data-unique-count') || '0', 10);
      showImportConfirm({
        count:       count,
        sourceLabel: getRowLabel(tr)
      }).then(function (res) {
        if (res.action === 'cancel') return;
        fireWebhook(btn, sourceRecordId, res.action === 'import-delete');
      });
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

  // Force view_3913 to load 1000 records/page so the SOW→items index covers
  // every line item on the project (default page size of 25 would truncate
  // counts on larger projects). Re-fires render with the larger page; we
  // build the index on the second render once limit==1000.
  function ensureFullPage(viewKey) {
    var $select = $('#' + viewKey + ' select[name="limit"]');
    if ($select.length && $select.val() !== '1000') {
      $select.val('1000').trigger('change');
      return false;
    }
    return true;
  }

  $(document)
    .off('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS)
    .on('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS, function () {
      if (!ensureFullPage(LINE_ITEM_VIEW)) return; // wait for re-render at 1000/page
      buildSowIndex();
      refreshAllBtnLabels();
    });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(function () { syncRows(); refreshAllBtnLabels(); }, 1200);
    });
})();
