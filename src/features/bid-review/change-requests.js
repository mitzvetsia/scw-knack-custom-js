/*** BID REVIEW — CHANGE REQUESTS ***/
/**
 * Captures proposed changes to bid items from the comparison grid
 * and groups them into per-package change request headers that can
 * be submitted back to the subcontractor via the Make webhook.
 *
 * Persistence:
 *   - sessionStorage for instant same-tab rehydration
 *   - field_2684 on the SOW record for cross-session durability
 *   - Writes to Knack are debounced (3s after last change)
 *   - On submit, the submitted package is removed and the field is updated
 *
 * Field registry: FIELD_DEFS drives both the "Current Values" display
 * and the "Requested Changes" form. To add a new field, add one entry.
 *
 * Reads : SCW.bidReview.CONFIG, SCW.bidReview.submitAction,
 *         SCW.bidReview.renderToast
 * Writes: SCW.bidReview.changeRequests
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;
  var FK  = CFG.fieldKeys;

  var CR_CSS_ID       = 'scw-bid-cr-css';
  var OVERLAY_ID      = 'scw-bid-cr-overlay';
  var STORAGE_KEY     = 'scw-bid-cr-pending';
  var SAVE_DEBOUNCE   = 3000;

  // ── Field registry ─────────────────────────────────────
  // visKey: skip this field when the matching visibility flag is false
  // multiline: render as textarea instead of input
  // connection: Knack field key — renders as dropdown loaded from the connected object
  // idsKey: cell property holding the raw connection IDs (for pre-fill)
  var FIELD_DEFS = [
    { key: 'productName',     label: 'Product',            type: 'text', displayOnly: true },
    { key: 'qty',             label: 'Qty',                type: 'number',  visKey: 'qty' },
    { key: 'rate',            label: 'Rate ($)',           type: 'number',  currency: true },
    { key: 'laborDesc',       label: 'Labor Description',  type: 'text',    multiline: true },
    { key: 'bidExistCabling', label: 'Existing Cabling',   type: 'select',  options: ['Yes', 'No'], visKey: 'cabling' },
    { key: 'bidPlenum',       label: 'Plenum',             type: 'select',  options: ['Yes', 'No'], visKey: 'cabling' },
    { key: 'bidExterior',     label: 'Exterior',           type: 'select',  options: ['Yes', 'No'], visKey: 'cabling' },
    { key: 'bidDropLength',   label: 'Drop Length',        type: 'text',    visKey: 'cabling' },
    { key: 'bidConduit',      label: 'Conduit',            type: 'text',    visKey: 'cabling' },
    { key: 'bidConnDevice',   label: 'Connected Devices',  type: 'connection', connection: 'field_2380', idsKey: 'bidConnDeviceIds', visKey: 'connDevice', addable: true },
    { key: 'bidConnTo',       label: 'Connected To',       type: 'connection', connection: 'field_2381', idsKey: 'bidConnToIds', visKey: 'cabling', single: true, addable: true },
    { key: 'bidMdfIdf',       label: 'MDF/IDF',            type: 'connection', connection: 'field_2375', idsKey: 'bidMdfIdfIds', addable: true, single: true },
  ];

  // ── State ──────────────────────────────────────────────
  var _pending = {};
  var _saveTimer = null;
  var _knownSowIds = {};      // SOW IDs we've written to (for cleanup)

  function pendingCount() {
    var c = 0, keys = Object.keys(_pending);
    for (var i = 0; i < keys.length; i++) c += _pending[keys[i]].items.length;
    return c;
  }

  // ── HTML helpers ───────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtCurrency(v) {
    if (v == null || v === 0) return '$0.00';
    return '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function hasValue(v) {
    if (v == null) return false;
    if (typeof v === 'number') return true;
    if (typeof v === 'string') return v.trim().length > 0;
    return Boolean(v);
  }

  function formatDisplay(def, v) { return def.currency ? fmtCurrency(v) : String(v); }

  /** Check if any reciprocal source set the given connection key. */
  function isReciprocalField(reciprocalSources, connKey) {
    if (!reciprocalSources) return false;
    var keys = Object.keys(reciprocalSources);
    for (var i = 0; i < keys.length; i++) {
      if (reciprocalSources[keys[i]] === connKey) return true;
    }
    return false;
  }

  // ── sessionStorage (write-through cache) ───────────────
  function ssave() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_pending)); } catch (e) {}
  }
  function sload() {
    try { var r = sessionStorage.getItem(STORAGE_KEY); if (r) _pending = JSON.parse(r); } catch (e) {}
  }
  function sclear() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Connection field helpers ────────────────────────────
  // Connection options are built from the grid rows in init.js
  // and passed through params.connOptions — no API call needed.

  // ── Knack API: read / write field_2684 ─────────────────
  // Uses the scene/view record URL (via SCW.knackRecordUrl) to avoid
  // CORS errors — the raw objects API is blocked cross-origin.

  function readSowField(sowId) {
    return SCW.knackAjax({
      url: SCW.knackRecordUrl(CFG.sowItemsViewKey, sowId),
      type: 'GET',
    }).then(function (resp) {
      var raw = resp[FK.changeRequestDraft + '_raw'] || resp[FK.changeRequestDraft] || '';
      // Strip HTML wrappers if rich-text
      if (typeof raw === 'string') raw = raw.replace(/<[^>]*>/g, '').trim();
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    });
  }

  function writeSowField(sowId, data) {
    var body = {};
    body[FK.changeRequestDraft] = data ? JSON.stringify(data) : '';

    return SCW.knackAjax({
      url: SCW.knackRecordUrl(CFG.sowItemsViewKey, sowId),
      type: 'PUT',
      data: JSON.stringify(body),
    });
  }

  // ── Debounced save to Knack ────────────────────────────
  function debouncedSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () { _saveTimer = null; saveToKnack(); }, SAVE_DEBOUNCE);
  }

  function saveToKnack() {
    // Group pending by SOW
    var bySow = {};
    var pkgIds = Object.keys(_pending);
    for (var i = 0; i < pkgIds.length; i++) {
      var pkg = _pending[pkgIds[i]];
      if (!bySow[pkg.sowId]) bySow[pkg.sowId] = {};
      bySow[pkg.sowId][pkgIds[i]] = pkg;
    }

    // Write each SOW that has pending items
    var active = Object.keys(bySow);
    for (var a = 0; a < active.length; a++) {
      _knownSowIds[active[a]] = true;
      writeSowField(active[a], bySow[active[a]]);
    }

    // Clear SOWs that no longer have pending items
    var prev = Object.keys(_knownSowIds);
    for (var p = 0; p < prev.length; p++) {
      if (!bySow[prev[p]]) {
        writeSowField(prev[p], null);
        delete _knownSowIds[prev[p]];
      }
    }
  }

  // ── Rehydrate from Knack (called by init.js after state build) ──
  function rehydrateFromKnack(sowGrids) {
    if (!sowGrids || !sowGrids.length) return;

    var promises = [];
    var sowIds = [];
    for (var i = 0; i < sowGrids.length; i++) {
      sowIds.push(sowGrids[i].sowId);
      promises.push(readSowField(sowGrids[i].sowId));
    }

    $.when.apply($, promises).then(function () {
      var results = sowIds.length === 1 ? [arguments[0]] : Array.prototype.slice.call(arguments);
      var merged = {};

      for (var r = 0; r < results.length; r++) {
        // $.when with multiple deferreds wraps each result in an array [data, status, xhr]
        var data = Array.isArray(results[r]) ? results[r][0] : results[r];
        if (!data || typeof data !== 'object') continue;

        var pkgIds = Object.keys(data);
        for (var p = 0; p < pkgIds.length; p++) {
          merged[pkgIds[p]] = data[pkgIds[p]];
          _knownSowIds[sowIds[r]] = true;
        }
      }

      if (Object.keys(merged).length) {
        _pending = merged;
        ssave();
        triggerRerender();
        if (CFG.debug) console.log('[BidReview CR] Rehydrated from Knack:', pendingCount(), 'items');
      }
    }).fail(function () {
      if (CFG.debug) console.warn('[BidReview CR] Knack rehydration failed — using sessionStorage');
    });
  }

  // ── Persist helper (called after every mutation) ───────
  function persist() {
    ssave();
    debouncedSave();
  }

  // ── CSS injection ──────────────────────────────────────
  function injectCrStyles() {
    if (document.getElementById(CR_CSS_ID)) return;
    var css = [
      '.scw-bid-cr-overlay {',
      '  position: fixed; inset: 0; z-index: 100001;',
      '  background: rgba(0,0,0,.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.scw-bid-cr-modal {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,.25);',
      '  width: 480px; max-width: 94vw; max-height: 90vh;',
      '  display: flex; flex-direction: column;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif;',
      '  color: #1e293b;',
      '}',
      '.scw-bid-cr-modal__header {',
      '  display: flex; align-items: flex-start; gap: 8px;',
      '  padding: 16px 20px 12px; border-bottom: 1px solid #e2e8f0;',
      '  position: relative;',
      '}',
      '.scw-bid-cr-modal__title { font-size: 16px; font-weight: 700; color: #0f172a; }',
      '.scw-bid-cr-modal__subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }',
      '.scw-bid-cr-modal__close {',
      '  position: absolute; top: 12px; right: 14px;',
      '  background: none; border: none; font-size: 22px;',
      '  color: #94a3b8; cursor: pointer; line-height: 1; padding: 0 4px;',
      '}',
      '.scw-bid-cr-modal__close:hover { color: #334155; }',
      '.scw-bid-cr-modal__body { padding: 16px 20px; overflow-y: auto; flex: 1 1 auto; }',
      '.scw-bid-cr-modal__section { margin-bottom: 16px; }',
      '.scw-bid-cr-modal__section-title {',
      '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .5px; color: #64748b; margin-bottom: 8px;',
      '}',
      '.scw-bid-cr-modal__hint { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }',
      '.scw-bid-cr-modal__current {',
      '  display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 12px;',
      '}',
      '.scw-bid-cr-modal__current-label { font-weight: 600; color: #64748b; white-space: nowrap; }',
      '.scw-bid-cr-modal__current-value { color: #1e293b; }',
      '.scw-bid-cr-modal__field { margin-bottom: 10px; }',
      '.scw-bid-cr-modal__label {',
      '  display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 3px;',
      '}',
      '.scw-bid-cr-modal__input, .scw-bid-cr-modal__select, .scw-bid-cr-modal__textarea {',
      '  display: block; width: 100%; box-sizing: border-box;',
      '  padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 5px;',
      '  font: inherit; font-size: 13px; color: #1e293b; background: #f8fafc;',
      '  transition: border-color .15s;',
      '}',
      '.scw-bid-cr-modal__input:focus, .scw-bid-cr-modal__select:focus, .scw-bid-cr-modal__textarea:focus {',
      '  outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15);',
      '}',
      '.scw-bid-cr-modal__textarea { resize: vertical; min-height: 60px; }',
      '.scw-bid-cr-modal__footer {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 12px 20px; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-bid-cr-modal__btn {',
      '  padding: 8px 16px; border: none; border-radius: 5px;',
      '  font: 600 13px/1 system-ui, sans-serif; cursor: pointer; transition: filter .15s;',
      '}',
      '.scw-bid-cr-modal__btn:hover { filter: brightness(.92); }',
      '.scw-bid-cr-modal__btn--cancel { background: #e2e8f0; color: #475569; }',
      '.scw-bid-cr-modal__btn--add { background: #0891b2; color: #fff; }',
      '.scw-bid-cr-modal__btn--remove { background: #dc2626; color: #fff; }',
      '.scw-bid-cr-modal__checkbox-list {',
      '  display: flex; flex-direction: column; gap: 4px;',
      '  padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 5px;',
      '  background: #f8fafc; max-height: 160px; overflow-y: auto;',
      '}',
      '.scw-bid-cr-modal__checkbox-item {',
      '  display: flex; align-items: center; gap: 6px;',
      '  font-size: 13px; color: #1e293b; cursor: pointer;',
      '  padding: 3px 0;',
      '}',
      '.scw-bid-cr-modal__checkbox-item input { margin: 0; cursor: pointer; }',
      '.scw-bid-cr-modal__checkbox-item label { cursor: pointer; flex: 1; }',
      '.scw-bid-cr-modal__checkbox-empty {',
      '  font-size: 12px; color: #94a3b8; font-style: italic; padding: 4px 0;',
      '}',
      '.scw-bid-cr-modal__checkbox-list--locked {',
      '  opacity: .6; pointer-events: none;',
      '}',
      '.scw-bid-cr-modal__checkbox-locked {',
      '  font-size: 11px; color: #9333ea; font-style: italic; padding: 2px 0 4px;',
      '  pointer-events: auto;',
      '}',
      '.scw-bid-cr-modal__display-value {',
      '  display: block; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 5px;',
      '  font-size: 13px; color: #64748b; background: #f1f5f9;',
      '}',
    ].join('\n');

    var s = document.createElement('style');
    s.id = CR_CSS_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Modal ──────────────────────────────────────────────

  /** Find existing pending item for this row+package (for edit-existing). */
  function findPendingItem(pkgId, rowId) {
    if (!_pending[pkgId]) return null;
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === rowId) return items[i];
    }
    return null;
  }

  function openChangeModal(params) {
    injectCrStyles();
    closeModal();

    var cell = params.cell || {};
    var vis  = params.visibility || {};
    var existing = findPendingItem(params.pkgId, params.rowId);

    // Connection options come from the grid rows (built in init.js),
    // keyed by FIELD_DEFS key (e.g. bidConnDevice, bidConnTo).
    var connRecords = {};
    var opts = params.connOptions || {};
    for (var ci = 0; ci < FIELD_DEFS.length; ci++) {
      if (FIELD_DEFS[ci].type === 'connection') {
        connRecords[FIELD_DEFS[ci].key] = opts[FIELD_DEFS[ci].key] || [];
      }
    }

    if (CFG.debug) {
      var keys = Object.keys(connRecords);
      for (var ck = 0; ck < keys.length; ck++) {
        console.log('[BidReview CR] ' + keys[ck] + ':', connRecords[keys[ck]].length, 'options');
      }
    }
    buildModal(params, cell, vis, existing, connRecords);
  }

  function buildModal(params, cell, vis, existing, connRecords) {
    var overlay = el('div', 'scw-bid-cr-overlay');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = el('div', 'scw-bid-cr-modal');

    // Header
    var header = el('div', 'scw-bid-cr-modal__header');
    var hLeft = el('div');
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__title',
      existing ? 'Edit Change Request' : 'Request Change'));
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__subtitle',
      params.pkgName + ' \u2014 ' + (params.displayLabel || params.productName || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = el('button', 'scw-bid-cr-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body — single form pre-filled with current values
    var body = el('div', 'scw-bid-cr-modal__body');
    body.appendChild(el('div', 'scw-bid-cr-modal__hint',
      'Values are pre-filled from the current bid. Edit any field to request a change.'));

    var inputs = {};
    for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
      var fd = FIELD_DEFS[fi];

      // Skip hidden fields based on visibility rules
      if (fd.visKey && !vis[fd.visKey]) continue;

      var fRow = el('div', 'scw-bid-cr-modal__field');
      fRow.appendChild(el('label', 'scw-bid-cr-modal__label', fd.label));

      // Determine pre-fill value: existing pending change > current cell value
      var prefill = (existing && hasValue(existing.requested[fd.key]))
        ? existing.requested[fd.key]
        : cell[fd.key];

      var inp;
      if (fd.displayOnly) {
        inp = el('span', 'scw-bid-cr-modal__display-value', hasValue(prefill) ? formatDisplay(fd, prefill) : '\u2014');
        inp.setAttribute('data-field', fd.key);
        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
        continue;
      }
      if (fd.type === 'connection') {
        // Build set of IDs locked by reciprocal logic (per-ID, not whole field)
        var lockedIdSet = {};
        if (existing && existing.reciprocalLockedIds && existing.reciprocalLockedIds[fd.key]) {
          var lids = existing.reciprocalLockedIds[fd.key];
          for (var li = 0; li < lids.length; li++) lockedIdSet[lids[li]] = true;
        }
        var hasLockedIds = Object.keys(lockedIdSet).length > 0;

        var recs = connRecords[fd.key] || [];
        var currentIds = cell[fd.idsKey] || [];
        var prefillIds = (existing && existing.requested[fd.key + 'Ids']) || currentIds;

        if (fd.single) {
          // Single-select connection → radio button list
          inp = el('div', 'scw-bid-cr-modal__checkbox-list');
          if (!recs.length) {
            inp.appendChild(el('span', 'scw-bid-cr-modal__checkbox-empty', 'No available records'));
          }
          for (var ri = 0; ri < recs.length; ri++) {
            var rec = recs[ri];
            var item = el('div', 'scw-bid-cr-modal__checkbox-item');
            var rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = 'scw-cr-radio-' + fd.key;
            rb.value = rec.id;
            rb.id = 'scw-cr-rb-' + fd.key + '-' + ri;
            if (rec.noBid) rb.setAttribute('data-no-bid', '1');
            if (rec.rowId) rb.setAttribute('data-row-id', rec.rowId);
            if (lockedIdSet[rec.id]) rb.disabled = true;
            for (var pi = 0; pi < prefillIds.length; pi++) {
              if (prefillIds[pi] === rec.id) { rb.checked = true; break; }
            }
            item.appendChild(rb);
            var rbLabel = document.createElement('label');
            rbLabel.setAttribute('for', rb.id);
            var rbText = (rec.identifier || rec.id) + (rec.noBid ? ' (not on bid)' : '');
            if (lockedIdSet[rec.id]) rbText += ' (locked)';
            rbLabel.textContent = rbText;
            if (rec.noBid) rbLabel.style.fontStyle = 'italic';
            if (lockedIdSet[rec.id]) rbLabel.style.opacity = '0.6';
            item.appendChild(rbLabel);
            inp.appendChild(item);
          }
        } else {
          // Multi-select connection → checkbox list
          inp = el('div', 'scw-bid-cr-modal__checkbox-list');
          if (!recs.length) {
            inp.appendChild(el('span', 'scw-bid-cr-modal__checkbox-empty', 'No available records'));
          }
          for (var ri = 0; ri < recs.length; ri++) {
            var rec = recs[ri];
            var item = el('div', 'scw-bid-cr-modal__checkbox-item');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = rec.id;
            cb.id = 'scw-cr-cb-' + fd.key + '-' + ri;
            if (rec.noBid) cb.setAttribute('data-no-bid', '1');
            if (rec.rowId) cb.setAttribute('data-row-id', rec.rowId);
            // Only lock the specific checkbox managed by reciprocal
            if (lockedIdSet[rec.id]) cb.disabled = true;
            for (var pi = 0; pi < prefillIds.length; pi++) {
              if (prefillIds[pi] === rec.id) { cb.checked = true; break; }
            }
            item.appendChild(cb);
            var cbLabel = document.createElement('label');
            cbLabel.setAttribute('for', cb.id);
            var cbText = (rec.identifier || rec.id) + (rec.noBid ? ' (not on bid)' : '');
            if (lockedIdSet[rec.id]) cbText += ' (locked)';
            cbLabel.textContent = cbText;
            if (rec.noBid) cbLabel.style.fontStyle = 'italic';
            if (lockedIdSet[rec.id]) cbLabel.style.opacity = '0.6';
            item.appendChild(cbLabel);
            inp.appendChild(item);
          }
        }
      } else if (fd.type === 'select') {
        inp = document.createElement('select');
        inp.className = 'scw-bid-cr-modal__select';
        var blk = document.createElement('option');
        blk.value = ''; blk.textContent = '\u2014 select \u2014';
        inp.appendChild(blk);
        for (var oi = 0; oi < fd.options.length; oi++) {
          var sopt = document.createElement('option');
          sopt.value = fd.options[oi]; sopt.textContent = fd.options[oi];
          if (hasValue(prefill) && String(prefill) === fd.options[oi]) sopt.selected = true;
          inp.appendChild(sopt);
        }
      } else if (fd.multiline) {
        inp = document.createElement('textarea');
        inp.className = 'scw-bid-cr-modal__textarea';
        inp.rows = 3;
        if (hasValue(prefill)) inp.value = String(prefill);
      } else {
        inp = document.createElement('input');
        inp.type = fd.type;
        inp.className = 'scw-bid-cr-modal__input';
        if (fd.type === 'number') inp.setAttribute('step', 'any');
        if (hasValue(prefill)) inp.value = fd.type === 'number' ? prefill : String(prefill);
      }
      inp.setAttribute('data-field', fd.key);
      inputs[fd.key] = inp;
      fRow.appendChild(inp);
      body.appendChild(fRow);
    }

    // Change notes
    var notesRow = el('div', 'scw-bid-cr-modal__field');
    notesRow.appendChild(el('label', 'scw-bid-cr-modal__label', 'Change Notes'));
    var ta = document.createElement('textarea');
    ta.className = 'scw-bid-cr-modal__textarea';
    ta.placeholder = 'Describe the changes you need\u2026';
    ta.rows = 3;
    if (existing && existing.changeNotes) ta.value = existing.changeNotes;
    notesRow.appendChild(ta);
    body.appendChild(notesRow);
    modal.appendChild(body);

    // Footer
    var footer = el('div', 'scw-bid-cr-modal__footer');
    var cancelBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var saveLabel = existing ? 'Update Change Request' : 'Add to Change Request';
    var addBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--add', saveLabel);
    addBtn.addEventListener('click', function () {
      // Diff against original cell values — only capture changes
      var requested = {}, hasChange = false;
      var noBidAdds = [];   // noBid items newly selected in connection fields
      for (var k = 0; k < FIELD_DEFS.length; k++) {
        var d = FIELD_DEFS[k];
        if (d.displayOnly) continue;
        if (d.visKey && !vis[d.visKey]) continue;
        if (!inputs[d.key]) continue;

        if (d.type === 'connection') {
          if (d.single) {
            // Single-select connection (radio buttons)
            var radioContainer = inputs[d.key];
            var checkedRadio = radioContainer.querySelector('input[type="radio"]:checked');
            var selVal = checkedRadio ? checkedRadio.value : '';
            var origIds = cell[d.idsKey] || [];
            var origId = origIds.length ? origIds[0] : '';
            if (selVal !== origId) {
              var rbLbl = checkedRadio ? radioContainer.querySelector('label[for="' + checkedRadio.id + '"]') : null;
              var selLabel = rbLbl ? rbLbl.textContent.replace(/\s*\(not on bid\)\s*$/, '').replace(/\s*\(locked\)\s*$/, '') : selVal;
              requested[d.key] = selVal ? selLabel : '';
              requested[d.key + 'Ids'] = selVal ? [selVal] : [];
              // Classify add vs change
              if (selVal && checkedRadio && checkedRadio.getAttribute('data-no-bid') === '1') {
                requested[d.key + 'AddIds'] = [selVal];
                if (selVal !== origId) {
                  noBidAdds.push({
                    id:    selVal,
                    rowId: checkedRadio.getAttribute('data-row-id'),
                    label: selLabel,
                    connKey: d.key,
                  });
                }
              } else if (selVal) {
                requested[d.key + 'ChangeIds'] = [selVal];
              }
              hasChange = true;
            }
          } else {
            // Multi-select connection (checkbox list)
            var container = inputs[d.key];
            var cbs = container.querySelectorAll('input[type="checkbox"]');
            var selIds = [], labels = [];
            var origIdSet = {};
            var origIds = cell[d.idsKey] || [];
            for (var oii = 0; oii < origIds.length; oii++) origIdSet[origIds[oii]] = true;
            var connAddIds = [], connChangeIds = [];
            for (var si = 0; si < cbs.length; si++) {
              if (cbs[si].checked) {
                selIds.push(cbs[si].value);
                var cbLbl = container.querySelector('label[for="' + cbs[si].id + '"]');
                var rawLabel = cbLbl ? cbLbl.textContent.replace(/\s*\(locked\)\s*$/, '').replace(/\s*\(not on bid\)\s*$/, '') : cbs[si].value;
                if (cbLbl) labels.push(rawLabel);
                // Classify: SOW items (noBid) are ADDs, Survey items are CHANGEs
                if (cbs[si].getAttribute('data-no-bid') === '1') {
                  connAddIds.push(cbs[si].value);
                  // Detect newly-selected noBid items for add-to-bid creation
                  if (!origIdSet[cbs[si].value]) {
                    noBidAdds.push({
                      id:    cbs[si].value,
                      rowId: cbs[si].getAttribute('data-row-id'),
                      label: rawLabel,
                      connKey: d.key,
                    });
                  }
                } else {
                  connChangeIds.push(cbs[si].value);
                }
              }
            }
            if (selIds.sort().join(',') !== origIds.slice().sort().join(',')) {
              requested[d.key] = labels.join(', ');
              requested[d.key + 'Ids'] = selIds;
              if (connAddIds.length)    requested[d.key + 'AddIds']    = connAddIds;
              if (connChangeIds.length) requested[d.key + 'ChangeIds'] = connChangeIds;
              hasChange = true;
            }
          }
        } else {
          var v = (inputs[d.key].value || '').trim();
          var orig = hasValue(cell[d.key]) ? String(cell[d.key]) : '';
          if (d.type === 'number') {
            var nv = v ? parseFloat(v) : 0;
            var no = cell[d.key] || 0;
            if (nv !== no) { requested[d.key] = nv; hasChange = true; }
          } else {
            if (v !== orig) { requested[d.key] = v; hasChange = true; }
          }
        }
      }

      var cn = ta.value.trim();
      var origNotes = (existing && existing.changeNotes) || '';
      if (cn !== origNotes) hasChange = true;

      if (!hasChange) {
        ns.renderToast('No changes detected', 'info');
        return;
      }

      var current = {};
      for (var c2 = 0; c2 < FIELD_DEFS.length; c2++) {
        var cd2 = FIELD_DEFS[c2];
        if (hasValue(cell[cd2.key])) current[cd2.key] = cell[cd2.key];
      }

      // Clear old reciprocals/noBid-adds from this source before saving.
      // For source items this clears reciprocal connection changes;
      // for reciprocal items this clears noBid add-to-bid entries they created.
      var isRecipItem = existing && existing.reciprocalSource;
      clearReciprocalsFromSource(params.rowId);

      var newItem = {
        rowId: params.rowId, bidRecordId: cell.id,
        sowItemId: params.sowItemId || '',
        displayLabel: params.displayLabel, productName: cell.productName,
        current: current, requested: requested, changeNotes: cn,
      };
      // Preserve ALL reciprocal metadata so cascade-delete + locking still works
      if (existing && existing.reciprocal) newItem.reciprocal = true;
      if (existing && existing.reciprocalSource) newItem.reciprocalSource = existing.reciprocalSource;
      if (existing && existing.reciprocalSources) newItem.reciprocalSources = existing.reciprocalSources;
      if (existing && existing.reciprocalLockedIds) newItem.reciprocalLockedIds = existing.reciprocalLockedIds;

      addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, newItem, params.surveyId);

      // Only run reciprocal logic for source items (not reciprocal items).
      // Locked connection fields on reciprocal items are already managed
      // by the source — re-deriving would create circular reciprocals.
      if (!isRecipItem) {
        var recipCount = createReciprocalChanges(params, cell, requested);
        if (recipCount) {
          ns.renderToast(recipCount + ' reciprocal change(s) created', 'info');
        }
      }

      // Create "add to bid" requests for noBid items selected in connection fields.
      // Runs for both source AND reciprocal items — per-ID locking prevents
      // circular issues, and noBid entries don't trigger createReciprocalChanges.
      if (noBidAdds.length) {
        for (var nbi = 0; nbi < noBidAdds.length; nbi++) {
          var nba = noBidAdds[nbi];
          // Find the noBid row in gridRows to get its details
          var nbaRow = null;
          if (params.gridRows) {
            for (var nri = 0; nri < params.gridRows.length; nri++) {
              if (params.gridRows[nri].id === nba.rowId) { nbaRow = params.gridRows[nri]; break; }
            }
          }
          var nbaProduct = nbaRow ? (nbaRow.sowProduct || nbaRow.productName || nba.label) : nba.label;
          var nbaDisplay = nbaRow ? (nbaRow.displayLabel || nbaProduct) : nba.label;
          // Mirror key: if selected in bidConnDevice, set bidConnTo on the new item
          var nbaMirrorKey = nba.connKey === 'bidConnDevice' ? 'bidConnTo' : 'bidConnDevice';
          var nbaReq = {};
          nbaReq.productName = nbaProduct;
          if (nbaRow && nbaRow.sowQty) nbaReq.qty = nbaRow.sowQty;
          // Pre-fill reciprocal connection: point back to the source record
          nbaReq[nbaMirrorKey] = params.displayLabel || params.productName || cell.id;
          nbaReq[nbaMirrorKey + 'Ids'] = [cell.id];
          // Copy source's MDF/IDF to the reciprocal add
          var srcMdfIdf    = requested.bidMdfIdf    || cell.bidMdfIdf    || '';
          var srcMdfIdfIds = requested.bidMdfIdfIds || cell.bidMdfIdfIds || [];
          if (srcMdfIdf)          nbaReq.bidMdfIdf    = srcMdfIdf;
          if (srcMdfIdfIds.length) nbaReq.bidMdfIdfIds = srcMdfIdfIds;

          addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
            rowId:        nba.rowId,
            bidRecordId:  null,
            sowItemId:    nba.rowId,
            displayLabel: nbaDisplay,
            productName:  nbaProduct,
            addToBid:     true,
            reciprocal:   true,
            reciprocalSource: params.rowId,
            current:      {},
            requested:    nbaReq,
            changeNotes:  'Add to bid — connected from ' + (params.displayLabel || params.productName),
          }, params.surveyId);
        }
        if (noBidAdds.length) {
          ns.renderToast(noBidAdds.length + ' item(s) will be added to bid', 'info');
        }
      }

      closeModal();
      ns.renderToast(existing ? 'Change request updated' : 'Change added to request', 'success');
    });
    footer.appendChild(addBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var first = modal.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }

  function closeModal() {
    var o = document.getElementById(OVERLAY_ID);
    if (o) o.remove();
  }

  // ── Pending management ─────────────────────────────────
  function addPendingItem(pkgId, pkgName, sowId, sowName, item, surveyId) {
    if (!_pending[pkgId]) _pending[pkgId] = { pkgName: pkgName, sowId: sowId, sowName: sowName, surveyId: surveyId || '', items: [] };
    if (surveyId && !_pending[pkgId].surveyId) _pending[pkgId].surveyId = surveyId;
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === item.rowId) { items[i] = item; persist(); triggerRerender(); return; }
    }
    items.push(item);
    persist();
    triggerRerender();
  }

  /**
   * Add a reciprocal item. If the target row already has a non-reciprocal
   * pending item, merge the connection field into it. Otherwise create a
   * new reciprocal-only item.
   */
  function addReciprocalItem(pkgId, pkgName, sowId, sowName, item, connKey, sourceRowId, lockedId) {
    if (!_pending[pkgId]) _pending[pkgId] = { pkgName: pkgName, sowId: sowId, sowName: sowName, surveyId: '', items: [] };
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === item.rowId) {
        // Merge connection field into existing item
        items[i].requested[connKey] = item.requested[connKey];
        items[i].requested[connKey + 'Ids'] = item.requested[connKey + 'Ids'];
        // Track that this item has reciprocal content from this source
        if (!items[i].reciprocalSources) items[i].reciprocalSources = {};
        items[i].reciprocalSources[sourceRowId] = connKey;
        // Track the specific locked ID (not the whole field)
        if (lockedId) {
          if (!items[i].reciprocalLockedIds) items[i].reciprocalLockedIds = {};
          if (!items[i].reciprocalLockedIds[connKey]) items[i].reciprocalLockedIds[connKey] = [];
          if (items[i].reciprocalLockedIds[connKey].indexOf(lockedId) === -1) {
            items[i].reciprocalLockedIds[connKey].push(lockedId);
          }
        }
        if (item.changeNotes) {
          items[i].changeNotes = items[i].changeNotes
            ? items[i].changeNotes + ' | ' + item.changeNotes
            : item.changeNotes;
        }
        persist();
        triggerRerender();
        return;
      }
    }
    // New purely-reciprocal item
    item.reciprocal = true;
    item.reciprocalSource = sourceRowId;
    if (lockedId) {
      item.reciprocalLockedIds = {};
      item.reciprocalLockedIds[connKey] = [lockedId];
    }
    items.push(item);
    persist();
    triggerRerender();
  }

  /**
   * Remove all reciprocal items that were created by a given source row.
   * For merged items (non-reciprocal with reciprocal fields), strips
   * the reciprocal connection fields instead of deleting the whole item.
   */
  function clearReciprocalsFromSource(sourceRowId) {
    var pkgIds = Object.keys(_pending);
    for (var p = 0; p < pkgIds.length; p++) {
      var items = _pending[pkgIds[p]].items;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        // Purely reciprocal item from this source → delete
        if (it.reciprocal && it.reciprocalSource === sourceRowId) {
          items.splice(i, 1);
          continue;
        }
        // Merged item with reciprocal fields from this source → strip those fields
        if (it.reciprocalSources && it.reciprocalSources[sourceRowId]) {
          var connKey = it.reciprocalSources[sourceRowId];
          delete it.requested[connKey];
          delete it.requested[connKey + 'Ids'];
          delete it.reciprocalSources[sourceRowId];
          if (!Object.keys(it.reciprocalSources).length) delete it.reciprocalSources;
          // Clean up locked IDs for this source
          if (it.reciprocalLockedIds && it.reciprocalLockedIds[connKey]) {
            delete it.reciprocalLockedIds[connKey];
            if (!Object.keys(it.reciprocalLockedIds).length) delete it.reciprocalLockedIds;
          }
          // If nothing left in requested, remove the item
          if (!Object.keys(it.requested).length) { items.splice(i, 1); }
        }
      }
      if (!items.length) delete _pending[pkgIds[p]];
    }
  }

  /**
   * Reciprocal connection logic for fields 2380 / 2381.
   *
   * These fields are reciprocal:
   *   field_2380 (Connected Devices) ↔ field_2381 (Connected To)
   *
   * When a record's 2380 changes, each affected record's 2381 must mirror:
   *   - Device ADDED to 2380   → add source to that device's 2381
   *   - Device REMOVED from 2380 → remove source from that device's 2381
   *
   * Same logic applies in reverse when 2381 changes:
   *   - Record ADDED to 2381   → add source to that record's 2380
   *   - Record REMOVED from 2381 → remove source from that record's 2380
   */
  function createReciprocalChanges(params, cell, requested) {
    if (!params.gridRows) return 0;

    var sourceId    = cell.id;
    var sourceLabel = params.displayLabel || params.productName || sourceId;
    var count       = 0;

    // Check both directions
    var pairs = [
      { changedKey: 'bidConnDevice', changedIds: 'bidConnDeviceIds',
        mirrorKey:  'bidConnTo',     mirrorIds:  'bidConnToIds' },
      { changedKey: 'bidConnTo',     changedIds: 'bidConnToIds',
        mirrorKey:  'bidConnDevice', mirrorIds:  'bidConnDeviceIds' },
    ];

    for (var pi = 0; pi < pairs.length; pi++) {
      var pair = pairs[pi];
      if (!requested[pair.changedIds]) continue;

      var origIds = cell[pair.changedIds] || [];
      var newIds  = requested[pair.changedIds];

      // Build lookup sets
      var origSet = {}, newSet = {};
      for (var oi = 0; oi < origIds.length; oi++) origSet[origIds[oi]] = true;
      for (var ni = 0; ni < newIds.length; ni++)  newSet[newIds[ni]]   = true;

      // IDs added → add source to their mirror field
      var added = [];
      for (var ai = 0; ai < newIds.length; ai++) {
        if (!origSet[newIds[ai]]) added.push(newIds[ai]);
      }

      // IDs removed → remove source from their mirror field
      var removed = [];
      for (var ri = 0; ri < origIds.length; ri++) {
        if (!newSet[origIds[ri]]) removed.push(origIds[ri]);
      }

      // Process additions
      for (var a = 0; a < added.length; a++) {
        count += applyReciprocal(params, cell, sourceId, sourceLabel, params.rowId,
          added[a], pair.mirrorKey, pair.mirrorIds, 'add');
      }

      // Process removals
      for (var r = 0; r < removed.length; r++) {
        count += applyReciprocal(params, cell, sourceId, sourceLabel, params.rowId,
          removed[r], pair.mirrorKey, pair.mirrorIds, 'remove');
      }
    }

    return count;
  }

  /**
   * Apply a single reciprocal change: add or remove sourceId from
   * targetRecordId's mirror connection field.
   */
  function applyReciprocal(params, cell, sourceId, sourceLabel, sourceRowId,
                           targetRecordId, mirrorKey, mirrorIds, action) {
    for (var ri = 0; ri < params.gridRows.length; ri++) {
      var row     = params.gridRows[ri];
      var tgtCell = row.cellsByPackage[params.pkgId];
      if (!tgtCell || tgtCell.id !== targetRecordId) continue;

      var curIds    = tgtCell[mirrorIds] || [];
      var curLabels = tgtCell[mirrorKey] ? String(tgtCell[mirrorKey]).split(', ') : [];
      var resultIds = [], resultLabels = [];

      if (action === 'add') {
        // Skip if already present
        var found = false;
        for (var ci = 0; ci < curIds.length; ci++) {
          if (curIds[ci] === sourceId) { found = true; break; }
        }
        if (found) return 0;
        resultIds    = curIds.concat([sourceId]);
        resultLabels = curLabels.concat([sourceLabel]);
      } else {
        // Remove sourceId
        var hadIt = false;
        for (var fi = 0; fi < curIds.length; fi++) {
          if (curIds[fi] === sourceId) { hadIt = true; continue; }
          resultIds.push(curIds[fi]);
          if (curLabels[fi]) resultLabels.push(curLabels[fi]);
        }
        if (!hadIt) return 0;
      }

      // Snapshot current values
      var current = {};
      for (var di = 0; di < FIELD_DEFS.length; di++) {
        if (hasValue(tgtCell[FIELD_DEFS[di].key])) {
          current[FIELD_DEFS[di].key] = tgtCell[FIELD_DEFS[di].key];
        }
      }

      var reqObj = {};
      reqObj[mirrorKey]          = resultLabels.join(', ');
      reqObj[mirrorKey + 'Ids'] = resultIds;

      var verb = action === 'add' ? 'added to' : 'removed from';
      var tgtLabel = row.displayLabel || tgtCell.productName || targetRecordId;

      addReciprocalItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
        rowId:        row.id,
        bidRecordId:  tgtCell.id,
        displayLabel: row.displayLabel,
        productName:  tgtCell.productName,
        current:      current,
        requested:    reqObj,
        changeNotes:  'Reciprocal: ' + sourceLabel + ' ' + verb + ' ' + tgtLabel,
      }, mirrorKey, sourceRowId, sourceId);

      return 1;
    }
    return 0;
  }

  /**
   * When dismissing an addToBid item that was auto-created from a connection
   * field selection, update the source item's change request to remove
   * this item from its connection field (field_2380 / field_2381).
   */
  function removeAddToBidFromSource(pkgId, addItem) {
    var sourceRowId = addItem.reciprocalSource;
    var removedId   = addItem.rowId;   // the noBid row ID
    if (!sourceRowId || !_pending[pkgId]) return;

    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      var src = items[i];
      if (src.rowId !== sourceRowId) continue;
      if (!src.requested) break;

      // Check both connection fields for the removed ID
      var connPairs = [
        { key: 'bidConnDevice', idsKey: 'bidConnDeviceIds' },
        { key: 'bidConnTo',     idsKey: 'bidConnToIds' },
      ];
      for (var cp = 0; cp < connPairs.length; cp++) {
        var ids = src.requested[connPairs[cp].idsKey];
        if (!ids) continue;
        var idx = ids.indexOf(removedId);
        if (idx === -1) continue;

        // Remove from IDs and rebuild label
        ids.splice(idx, 1);
        var labels = src.requested[connPairs[cp].key]
          ? String(src.requested[connPairs[cp].key]).split(', ')
          : [];
        if (idx < labels.length) labels.splice(idx, 1);
        src.requested[connPairs[cp].key] = labels.join(', ');

        // If IDs are now empty, remove the field from requested
        if (!ids.length) {
          delete src.requested[connPairs[cp].idsKey];
          delete src.requested[connPairs[cp].key];
        }
      }

      // If nothing left in requested, remove the source item entirely
      if (!Object.keys(src.requested).length) {
        items.splice(i, 1);
        if (!items.length) delete _pending[pkgId];
      }
      break;
    }
    persist();
  }

  function removePendingItem(pkgId, rowId) {
    if (!_pending[pkgId]) return;
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === rowId) { items.splice(i, 1); break; }
    }
    if (!items.length) delete _pending[pkgId];
    // Cascade: remove any reciprocals this item created
    clearReciprocalsFromSource(rowId);
    persist();
    triggerRerender();
  }

  function triggerRerender() {
    if (ns.rerender) ns.rerender();
  }

  function summarizeChanges(item) {
    var parts = [], r = item.requested, c = item.current;
    for (var i = 0; i < FIELD_DEFS.length; i++) {
      var d = FIELD_DEFS[i];
      if (!hasValue(r[d.key])) continue;
      var from = hasValue(c[d.key]) ? (d.currency ? fmtCurrency(c[d.key]) : String(c[d.key])) : '?';
      var to = d.currency ? fmtCurrency(r[d.key]) : String(r[d.key]);
      parts.push(d.label + ': ' + from + '\u2192' + to);
    }
    return parts.join(', ');
  }

  /** Build a styled card DOM element summarizing a pending change item. */
  function buildSummaryCard(item, pkgId, pkgName) {
    var cardClass = 'scw-bid-cr-card' + (item.removeFromBid ? ' scw-bid-cr-card--removal' : '');
    var card = el('div', cardClass);
    card.style.cursor = 'pointer';

    var headerLabel = item.removeFromBid ? 'Remove from Bid'
                    : item.addToBid      ? 'Add to Bid'
                    : 'Pending Change';
    if (pkgName) headerLabel += ' \u2014 ' + pkgName;
    if (item.reciprocalSource) headerLabel += ' (auto)';
    var header = el('div', 'scw-bid-cr-card__header', headerLabel);

    // Dismiss button — hidden for reciprocal revise/remove items, but shown for addToBid
    var canDismiss = !item.reciprocalSource || item.addToBid;
    if (canDismiss) {
      var dismiss = el('button', 'scw-bid-cr-card__dismiss', '\u00d7');
      dismiss.title = 'Remove this change';
      dismiss.addEventListener('click', function (e) {
        e.stopPropagation();
        // If this is an addToBid item with a reciprocal source, also update the source's connection field
        if (item.addToBid && item.reciprocalSource) {
          removeAddToBidFromSource(pkgId, item);
        }
        removePendingItem(pkgId, item.rowId);
      });
      header.appendChild(dismiss);
    }
    card.appendChild(header);

    // Display label above change details
    if (item.displayLabel) {
      var labelEl = el('div', 'scw-bid-cr-card__item-label', item.displayLabel);
      card.appendChild(labelEl);
    }

    if (item.removeFromBid) {
      card.appendChild(el('div', 'scw-bid-cr-card__row', 'Requesting removal'));
      if (item.changeNotes) {
        card.appendChild(el('div', 'scw-bid-cr-card__notes', '\u201c' + item.changeNotes + '\u201d'));
      }
      return card;
    }

    var r = item.requested, c = item.current;
    for (var i = 0; i < FIELD_DEFS.length; i++) {
      var d = FIELD_DEFS[i];
      if (!hasValue(r[d.key])) continue;

      // Connection fields: show each item on its own line (label-only)
      if (d.type === 'connection') {
        var row = el('div', 'scw-bid-cr-card__row');
        row.appendChild(el('span', 'scw-bid-cr-card__label', d.label + ':'));

        var fromItems = hasValue(c[d.key]) ? String(c[d.key]).split(/,\s*/) : [];
        var toItems   = String(r[d.key]).split(/,\s*/);

        // Strip product name — keep only the label portion (before " — ")
        function labelOnly(s) {
          var dash = s.indexOf(' \u2014 ');
          return dash !== -1 ? s.substring(0, dash).trim() : s.trim();
        }

        var fromList = el('div', 'scw-bid-cr-card__from');
        for (var fi = 0; fi < fromItems.length; fi++) {
          if (fi > 0) fromList.appendChild(document.createElement('br'));
          fromList.appendChild(document.createTextNode(labelOnly(fromItems[fi])));
        }
        if (!fromItems.length) fromList.textContent = '\u2014';

        var toList = el('div', 'scw-bid-cr-card__to');
        for (var ti = 0; ti < toItems.length; ti++) {
          if (ti > 0) toList.appendChild(document.createElement('br'));
          toList.appendChild(document.createTextNode(labelOnly(toItems[ti])));
        }

        row.appendChild(fromList);
        row.appendChild(el('span', 'scw-bid-cr-card__arrow', '\u2192'));
        row.appendChild(toList);
        card.appendChild(row);
        continue;
      }

      var row = el('div', 'scw-bid-cr-card__row');
      row.appendChild(el('span', 'scw-bid-cr-card__label', d.label + ':'));

      var from = hasValue(c[d.key]) ? (d.currency ? fmtCurrency(c[d.key]) : String(c[d.key])) : '\u2014';
      var to   = d.currency ? fmtCurrency(r[d.key]) : String(r[d.key]);

      row.appendChild(el('span', 'scw-bid-cr-card__from', from));
      row.appendChild(el('span', 'scw-bid-cr-card__arrow', '\u2192'));
      row.appendChild(el('span', 'scw-bid-cr-card__to', to));
      card.appendChild(row);
    }

    if (item.changeNotes) {
      var notes = el('div', 'scw-bid-cr-card__notes', '\u201c' + item.changeNotes + '\u201d');
      card.appendChild(notes);
    }

    return card;
  }

  // ── Submit ─────────────────────────────────────────────

  /** Escape HTML entities for safe embedding. */
  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Format a number as currency ($1,234.56). */
  function fmtCurrencyHtml(v) {
    if (v == null || v === 0) return '$0.00';
    return '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Classify a pending item into a human-readable action type.
   */
  function itemActionType(item) {
    if (item.removeFromBid) return 'remove';
    if (item.addToBid)      return 'add';
    return 'revise';
  }

  /**
   * Build a flat array of field-level changes for one pending item.
   * Each entry: { field, label, from, to }
   * Connection fields also include fromIds / toIds arrays.
   */
  function buildItemFields(item) {
    var fields = [];
    var r = item.requested || {};
    var c = item.current   || {};

    for (var i = 0; i < FIELD_DEFS.length; i++) {
      var d = FIELD_DEFS[i];
      if (!hasValue(r[d.key])) continue;

      var fromVal = hasValue(c[d.key]) ? c[d.key] : null;
      var toVal   = r[d.key];
      var entry   = {
        field: d.key,
        label: d.label,
        from:  fromVal,
        to:    toVal,
      };

      // Connection fields: include ID arrays + add/change classification
      if (d.type === 'connection' && d.idsKey) {
        if (c[d.idsKey])              entry.fromIds   = c[d.idsKey];
        if (r[d.idsKey])              entry.toIds     = r[d.idsKey];
        if (r[d.key + 'AddIds'])      entry.addIds    = r[d.key + 'AddIds'];
        if (r[d.key + 'ChangeIds'])   entry.changeIds = r[d.key + 'ChangeIds'];
      }

      fields.push(entry);
    }
    return fields;
  }

  /**
   * Build the JSON payload for a change request submission.
   *
   * Shape:
   *   {
   *     actionType:  'change_request',
   *     timestamp:   ISO string,
   *     packageId:   Knack record ID,
   *     packageName: 'BD-1',
   *     sowId:       Knack record ID,
   *     sowName:     'SOW Name',
   *     items: [
   *       {
   *         action:       'revise' | 'remove' | 'add',
   *         rowId:        Knack record ID or pseudo-ID,
   *         bidRecordId:  Knack record ID or null (add),
   *         sowItemId:    Knack record ID (related SOW line item),
   *         displayLabel: 'E-003',
   *         productName:  'Cat 6 Drop',
   *         changeNotes:  'free text',
   *         changes: { qty: 4, rate: 150, bidConnDeviceIds: ['id1','id2'] },
   *         fields: [
   *           { field: 'qty', label: 'Qty', from: 2, to: 4,
   *             fromIds: [...], toIds: [...] (connection fields only) },
   *           ...
   *         ]
   *       }
   *     ]
   *   }
   */
  /**
   * Build a self-contained HTML card for a single change-request item.
   * Designed to be stored in a Knack rich-text field on the bid change
   * record so it can render inside view_3505 without custom JS.
   */
  function buildItemHtml(item, fieldList) {
    var action = itemActionType(item);
    var palette = action === 'add'    ? { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a33', badge: '#dcfce7', badgeText: '#166534', label: 'ADD' }
                : action === 'remove' ? { color: '#dc2626', bg: '#fef2f2', border: '#dc262633', badge: '#fee2e2', badgeText: '#991b1b', label: 'REMOVE' }
                :                       { color: '#3b82f6', bg: '#eff6ff', border: '#3b82f633', badge: '#dbeafe', badgeText: '#1e40af', label: 'REVISE' };

    var h = [];
    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:600px;">');
    h.push('<div style="background:' + palette.bg + ';border:1px solid ' + palette.border + ';border-radius:6px;padding:10px 14px;">');

    // Badge + item header
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">');
    h.push('<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + palette.badge + ';color:' + palette.badgeText + ';font-size:10px;font-weight:700;letter-spacing:0.5px;">' + palette.label + '</span>');
    h.push('<span style="font-weight:600;font-size:13px;">' + escHtml(item.displayLabel || item.productName || 'Item') + '</span>');
    if (item.productName && item.displayLabel && item.productName !== item.displayLabel) {
      h.push('<span style="color:#64748b;font-size:12px;">&mdash; ' + escHtml(item.productName) + '</span>');
    }
    h.push('</div>');

    if (action === 'remove') {
      // Removal — just notes
      if (item.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + escHtml(item.changeNotes) + '&rdquo;</div>');
      }
    } else if (fieldList && fieldList.length) {
      // Revise or Add — field changes table
      h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;">');
      for (var fi = 0; fi < fieldList.length; fi++) {
        var f = fieldList[fi];
        var isCurrency = false;
        var isConn = false;
        for (var fd = 0; fd < FIELD_DEFS.length; fd++) {
          if (FIELD_DEFS[fd].key === f.field) {
            if (FIELD_DEFS[fd].currency) isCurrency = true;
            if (FIELD_DEFS[fd].type === 'connection') isConn = true;
            break;
          }
        }
        var fromStr = f.from != null ? escHtml(isCurrency ? fmtCurrencyHtml(f.from) : String(f.from)) : '&mdash;';
        var toStr   = escHtml(isCurrency ? fmtCurrencyHtml(f.to) : String(f.to));
        // Connection fields: use line breaks instead of commas for device lists
        if (isConn) {
          fromStr = fromStr.replace(/,\s*/g, '<br>');
          toStr   = toStr.replace(/,\s*/g, '<br>');
        }

        h.push('<tr>');
        h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;font-weight:500;">' + escHtml(f.label) + '</td>');
        if (action === 'revise') {
          h.push('<td style="padding:3px 8px;color:#94a3b8;text-decoration:line-through;">' + fromStr + '</td>');
          h.push('<td style="padding:3px 0;color:#94a3b8;">&rarr;</td>');
        }
        h.push('<td style="padding:3px 8px;font-weight:600;color:' + palette.color + ';">' + toStr + '</td>');
        h.push('</tr>');
      }
      h.push('</table>');

      if (item.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;border-top:1px solid ' + palette.border + ';padding-top:4px;">&ldquo;' + escHtml(item.changeNotes) + '&rdquo;</div>');
      }
    }

    h.push('</div>');
    h.push('</div>');
    return h.join('');
  }

  /** Build a plain-text version of one item (ClickUp-safe). */
  function buildItemPlainText(item, fieldList) {
    var action = itemActionType(item);
    var label  = (action === 'add' ? 'ADD' : action === 'remove' ? 'REMOVE' : 'REVISE');
    var displayName = item.displayLabel || item.productName || 'Item';

    var lines = [];
    var header = label + ' — ' + displayName;
    if (item.productName && item.displayLabel && item.productName !== item.displayLabel) {
      header += ' (' + item.productName + ')';
    }
    lines.push(header);

    if (action === 'remove') {
      if (item.changeNotes) lines.push('  "' + item.changeNotes + '"');
      else lines.push('  Requesting removal');
    } else if (fieldList && fieldList.length) {
      for (var fi = 0; fi < fieldList.length; fi++) {
        var f = fieldList[fi];
        var isCurrency = false;
        for (var fd = 0; fd < FIELD_DEFS.length; fd++) {
          if (FIELD_DEFS[fd].key === f.field && FIELD_DEFS[fd].currency) { isCurrency = true; break; }
        }
        var fromStr = f.from != null ? (isCurrency ? fmtCurrencyHtml(f.from) : String(f.from)) : '—';
        var toStr   = isCurrency ? fmtCurrencyHtml(f.to) : String(f.to);
        if (action === 'revise') {
          lines.push('  ' + f.label + ': ' + fromStr + ' → ' + toStr);
        } else {
          lines.push('  ' + f.label + ': ' + toStr);
        }
      }
      if (item.changeNotes) lines.push('  "' + item.changeNotes + '"');
    }

    return lines.join('\n');
  }

  function buildSubmitPayload(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg) return null;

    // Build lookup: bid cell ID → row ID (survey item ID from view_3680)
    // and set of known SOW item IDs (noBid items from view_3728)
    var cellToRow = {};   // bidRecordId → rowId
    var sowIdSet  = {};   // rowId for ADD/noBid items
    for (var pi = 0; pi < pkg.items.length; pi++) {
      var _it = pkg.items[pi];
      if (_it.bidRecordId && _it.rowId) {
        cellToRow[_it.bidRecordId] = _it.rowId;
      }
      if (_it.addToBid || itemActionType(_it) === 'add') {
        sowIdSet[_it.rowId] = true;
      }
    }

    var items = [];
    for (var i = 0; i < pkg.items.length; i++) {
      var it = pkg.items[i];
      var fieldList = buildItemFields(it);

      // Base item — IDs, labels, notes
      var entry = {
        action:       itemActionType(it),
        rowId:        it.rowId,
        bidRecordId:  it.bidRecordId || null,
        sowItemId:    it.sowItemId || '',
        displayLabel: it.displayLabel || '',
        productName:  it.productName || '',
        changeNotes:  it.changeNotes || '',
      };

      // Proposal bucket + sort order (for ordering ADD items in revision view)
      if (it.proposalBucket)   entry.proposalBucket   = it.proposalBucket;
      if (it.proposalBucketId) entry.proposalBucketId = it.proposalBucketId;
      entry.sortOrder = it.sortOrder != null ? it.sortOrder : 0;
      if (it.sowMapConn)       entry.sowMapConn        = it.sowMapConn;

      // Snapshot of current item data (before changes)
      entry.current = it.current || {};

      // Flatten requested values directly onto the item
      // (field key → "to" value, connection Ids arrays included)
      var r = it.requested || {};
      for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
        var d = FIELD_DEFS[fi];
        if (!hasValue(r[d.key])) continue;
        entry[d.key] = r[d.key];
        if (d.type === 'connection' && d.idsKey) {
          if (r[d.idsKey])              entry[d.idsKey]              = r[d.idsKey];
          if (r[d.key + 'AddIds'])      entry[d.key + 'AddIds']     = r[d.key + 'AddIds'];
          if (r[d.key + 'ChangeIds'])   entry[d.key + 'ChangeIds']  = r[d.key + 'ChangeIds'];
        }
      }

      // Classify connection IDs into survey (view_3680) vs SOW (view_3728)
      // Survey items use bid cell IDs → translate to row IDs via cellToRow
      // SOW items already use their own record IDs
      function classifyConnIds(allIds, addIds) {
        var survey = [], sow = [];
        var addSet = {};
        for (var a = 0; a < addIds.length; a++) addSet[addIds[a]] = true;
        for (var j = 0; j < allIds.length; j++) {
          var cid = allIds[j];
          if (addSet[cid] || sowIdSet[cid]) {
            // SOW/noBid item (view_3728) — ID is already the SOW item ID
            sow.push(cid);
          } else {
            // Survey item (view_3680) — translate bid cell ID to row ID
            survey.push(cellToRow[cid] || cid);
          }
        }
        return { survey: survey, sow: sow };
      }

      var cdClass = classifyConnIds(r.bidConnDeviceIds || [], r.bidConnDeviceAddIds || []);
      entry.ConnDevices_surveyitem = cdClass.survey;
      entry.ConnDevices_sowitem    = cdClass.sow;

      var ctClass = classifyConnIds(r.bidConnToIds || [], r.bidConnToAddIds || []);
      entry.ConnTO_surveyitem = ctClass.survey;
      entry.ConnTO_sowitem    = ctClass.sow;

      // Detailed from→to diffs
      entry.fields = fieldList;

      // Per-item JSON snapshot (stringified before HTML/plainText are added)
      entry.json = JSON.stringify(entry);

      // Per-item HTML card for display in view_3505 + plain-text for ClickUp
      entry.html      = buildItemHtml(it, fieldList);
      entry.plainText = buildItemPlainText(it, fieldList);

      items.push(entry);
    }

    return {
      actionType:  'change_request',
      timestamp:   new Date().toISOString(),
      packageId:   pkgId,
      packageName: pkg.pkgName,
      surveyId:    pkg.surveyId || '',
      sowId:       pkg.sowId,
      sowName:     pkg.sowName || '',
      user:        getUser(),
      items:       items,
    };
  }

  /** Safe read of Knack's logged-in user attributes. */
  function getUser() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes
        ? Knack.getUserAttributes()
        : null;
      if (!u || typeof u !== 'object') return null;
      return {
        id:    u.id || '',
        name:  u.name || '',
        email: u.email || '',
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Build a self-contained HTML document for the change request.
   * Designed to be stored in a Knack rich-text field and displayed
   * on a revision request detail page.
   */
  function buildSubmitHtml(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg) return '';

    var h = [];
    // Inline styles — the HTML will render inside Knack's page so we
    // can't rely on external CSS.
    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:720px;">');

    // Header
    h.push('<div style="border-bottom:2px solid #3b82f6;padding-bottom:8px;margin-bottom:16px;">');
    h.push('<div style="font-size:18px;font-weight:700;color:#0f172a;">Change Request</div>');
    h.push('<div style="font-size:13px;color:#64748b;margin-top:2px;">');
    h.push(escHtml(pkg.pkgName));
    if (pkg.sowName) h.push(' &mdash; ' + escHtml(pkg.sowName));
    h.push('</div>');
    h.push('</div>');

    // Group items by action type for readability
    var groups = { revise: [], add: [], remove: [] };
    for (var i = 0; i < pkg.items.length; i++) {
      var it = pkg.items[i];
      groups[itemActionType(it)].push(it);
    }

    var sectionOrder = [
      { key: 'revise', title: 'Revisions',        color: '#3b82f6', bg: '#eff6ff', icon: '\u270E' },
      { key: 'add',    title: 'Items to Add',      color: '#16a34a', bg: '#f0fdf4', icon: '+' },
      { key: 'remove', title: 'Items to Remove',   color: '#dc2626', bg: '#fef2f2', icon: '\u2212' },
    ];

    for (var si = 0; si < sectionOrder.length; si++) {
      var sec = sectionOrder[si];
      var arr = groups[sec.key];
      if (!arr.length) continue;

      h.push('<div style="margin-bottom:20px;">');
      h.push('<div style="font-size:14px;font-weight:700;color:' + sec.color + ';margin-bottom:8px;">');
      h.push(sec.icon + ' ' + escHtml(sec.title) + ' (' + arr.length + ')');
      h.push('</div>');

      for (var j = 0; j < arr.length; j++) {
        var item = arr[j];
        var label = item.displayLabel || item.productName || 'Item';

        h.push('<div style="background:' + sec.bg + ';border:1px solid ' + sec.color + '33;border-radius:6px;padding:10px 14px;margin-bottom:8px;">');

        // Item header
        h.push('<div style="font-weight:600;font-size:13px;margin-bottom:4px;">');
        h.push(escHtml(label));
        if (item.productName && item.displayLabel && item.productName !== item.displayLabel) {
          h.push(' <span style="font-weight:400;color:#64748b;">&mdash; ' + escHtml(item.productName) + '</span>');
        }
        h.push('</div>');

        if (sec.key === 'remove') {
          // Removal — just show the item name and optional notes
          if (item.changeNotes) {
            h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:4px;">');
            h.push('&ldquo;' + escHtml(item.changeNotes) + '&rdquo;');
            h.push('</div>');
          }
        } else {
          // Revise or Add — show field changes in a compact table
          var fields = buildItemFields(item);
          if (fields.length) {
            h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">');
            h.push('<tr style="border-bottom:1px solid ' + sec.color + '22;">');
            h.push('<th style="text-align:left;padding:3px 8px 3px 0;color:#64748b;font-weight:600;">Field</th>');
            if (sec.key === 'revise') {
              h.push('<th style="text-align:left;padding:3px 8px;color:#64748b;font-weight:600;">Current</th>');
            }
            h.push('<th style="text-align:left;padding:3px 8px;color:#64748b;font-weight:600;">');
            h.push(sec.key === 'revise' ? 'Requested' : 'Value');
            h.push('</th>');
            h.push('</tr>');

            for (var fi = 0; fi < fields.length; fi++) {
              var f = fields[fi];
              var fromStr = f.from != null ? escHtml(String(f.from)) : '&mdash;';
              var toStr   = escHtml(String(f.to));
              // Currency formatting
              var isCurrency = false;
              var isConn2 = false;
              for (var fd = 0; fd < FIELD_DEFS.length; fd++) {
                if (FIELD_DEFS[fd].key === f.field) {
                  if (FIELD_DEFS[fd].currency) isCurrency = true;
                  if (FIELD_DEFS[fd].type === 'connection') isConn2 = true;
                  break;
                }
              }
              if (isCurrency) {
                fromStr = f.from != null ? escHtml(fmtCurrencyHtml(f.from)) : '&mdash;';
                toStr   = escHtml(fmtCurrencyHtml(f.to));
              }
              // Connection fields: use line breaks instead of commas for device lists
              if (isConn2) {
                fromStr = fromStr.replace(/,\s*/g, '<br>');
                toStr   = toStr.replace(/,\s*/g, '<br>');
              }

              h.push('<tr>');
              h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;">' + escHtml(f.label) + '</td>');
              if (sec.key === 'revise') {
                h.push('<td style="padding:3px 8px;color:#94a3b8;">' + fromStr + '</td>');
              }
              h.push('<td style="padding:3px 8px;font-weight:600;color:' + sec.color + ';">' + toStr + '</td>');
              h.push('</tr>');
            }
            h.push('</table>');
          }

          if (item.changeNotes) {
            h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;">');
            h.push('&ldquo;' + escHtml(item.changeNotes) + '&rdquo;');
            h.push('</div>');
          }
        }

        h.push('</div>');  // card
      }

      h.push('</div>');  // section
    }

    // Footer
    h.push('<div style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;">');
    h.push('Generated ' + new Date().toLocaleString());
    h.push('</div>');

    h.push('</div>');
    return h.join('');
  }

  /** Build a plain-text ClickUp-safe version of the whole change request. */
  function buildSubmitPlainText(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg) return '';

    var lines = [];
    lines.push('CHANGE REQUEST');
    lines.push(pkg.pkgName + (pkg.sowName ? ' — ' + pkg.sowName : ''));
    lines.push(pkg.items.length + ' item(s) — ' + new Date().toLocaleString());
    lines.push('────────────────────');
    lines.push('');

    var groups = { revise: [], add: [], remove: [] };
    for (var i = 0; i < pkg.items.length; i++) {
      var it = pkg.items[i];
      var at = itemActionType(it);
      if (groups[at]) groups[at].push(it);
    }

    var sections = [
      { key: 'revise', title: 'REVISIONS' },
      { key: 'add',    title: 'ITEMS TO ADD' },
      { key: 'remove', title: 'ITEMS TO REMOVE' },
    ];

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var arr = groups[sec.key];
      if (!arr || !arr.length) continue;
      lines.push(sec.title + ' (' + arr.length + ')');
      for (var j = 0; j < arr.length; j++) {
        lines.push(buildItemPlainText(arr[j], buildItemFields(arr[j])));
        lines.push('');
      }
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function submitChangeRequest(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg || !pkg.items.length) return;
    if (!window.confirm('Submit change request for ' + pkg.pkgName + '?\n\n' +
      pkg.items.length + ' item(s) will be sent.')) return;

    var payload = buildSubmitPayload(pkgId);
    payload.html      = buildSubmitHtml(pkgId);
    payload.plainText = buildSubmitPlainText(pkgId);
    var html = payload.html;

    if (CFG.debug) {
      console.log('[BidReview CR] Submitting:', payload);
      console.log('[BidReview CR] HTML preview:', html.substring(0, 500) + '...');
    }

    var deferred = $.Deferred();

    SCW.knackAjax({
      url:  CFG.changeRequestWebhook,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function (resp) {
        if (CFG.debug) console.log('[BidReview CR] Submit success:', resp);
        delete _pending[pkgId];
        persist();
        triggerRerender();
        ns.renderToast('Change request submitted for ' + pkg.pkgName, 'success');
        deferred.resolve(resp);
      },
      error: function (xhr) {
        // CORS may block the response even though Make received and
        // processed the request (status 0). Treat as success if so.
        if (xhr && xhr.status === 0) {
          if (CFG.debug) console.log('[BidReview CR] Webhook CORS-blocked (status 0) — treating as success');
          delete _pending[pkgId];
          persist();
          triggerRerender();
          ns.renderToast('Change request submitted for ' + pkg.pkgName, 'success');
          deferred.resolve();
        } else {
          console.error('[BidReview CR] Submit failed:', xhr.status, xhr.responseText);
          ns.renderToast('Failed to submit change request — please try again', 'error');
          deferred.reject(xhr);
        }
      },
    });

    // Rebuild the comparison grid after Make finishes processing.
    // Runs regardless of success/error since Make may have already
    // received the data even if CORS blocks the response.
    if (ns.refresh) {
      setTimeout(function () { ns.refresh(); }, 3000);
    }

    return deferred.promise();
  }

  // ── Remove from Bid ─────────────────────────────────────
  function openRemoveModal(params) {
    injectCrStyles();
    closeModal();

    var overlay = el('div', 'scw-bid-cr-overlay');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = el('div', 'scw-bid-cr-modal');

    var header = el('div', 'scw-bid-cr-modal__header');
    var hLeft = el('div');
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__title', 'Remove from Bid'));
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__subtitle',
      params.pkgName + ' \u2014 ' + (params.displayLabel || params.productName || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = el('button', 'scw-bid-cr-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = el('div', 'scw-bid-cr-modal__body');
    body.appendChild(el('div', 'scw-bid-cr-modal__hint',
      'Request that this line item be removed from the bid.'));
    var notesRow = el('div', 'scw-bid-cr-modal__field');
    notesRow.appendChild(el('label', 'scw-bid-cr-modal__label', 'Reason for removal'));
    var ta = document.createElement('textarea');
    ta.className = 'scw-bid-cr-modal__textarea';
    ta.placeholder = 'Why should this item be removed\u2026';
    ta.rows = 3;
    if (params.prefillNotes) ta.value = params.prefillNotes;
    notesRow.appendChild(ta);
    body.appendChild(notesRow);
    modal.appendChild(body);

    var footer = el('div', 'scw-bid-cr-modal__footer');
    footer.appendChild(el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--cancel', 'Cancel'));
    footer.lastChild.addEventListener('click', closeModal);
    var removeBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--remove', 'Remove from Bid');
    removeBtn.addEventListener('click', function () {
      addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
        rowId:         params.rowId,
        bidRecordId:   params.cell.id,
        sowItemId:     params.sowItemId || '',
        displayLabel:  params.displayLabel,
        productName:   params.cell.productName,
        removeFromBid: true,
        current:       {},
        requested:     {},
        changeNotes:   ta.value.trim(),
      }, params.surveyId);
      closeModal();
      ns.renderToast('Removal added to change request', 'success');
    });
    footer.appendChild(removeBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Add Line Item ──────────────────────────────────────
  function openAddItemModal(params) {
    injectCrStyles();
    closeModal();

    var vis = params.visibility || {};
    var existing = params.existing || null;

    var overlay = el('div', 'scw-bid-cr-overlay');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = el('div', 'scw-bid-cr-modal');

    var header = el('div', 'scw-bid-cr-modal__header');
    var hLeft = el('div');
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__title', existing ? 'Edit Line Item' : 'Add Line Item'));
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__subtitle',
      params.pkgName + ' \u2014 ' + (params.displayLabel || params.sowProduct || params.productName || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = el('button', 'scw-bid-cr-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = el('div', 'scw-bid-cr-modal__body');
    body.appendChild(el('div', 'scw-bid-cr-modal__hint',
      existing ? 'Edit the add-to-bid line item details.'
               : 'Request a new line item be added to this bid package. Fields are pre-filled from the SOW.'));

    // Pre-fill: use existing pending values (if editing), otherwise SOW data
    var req = existing ? existing.requested : {};
    var prefill = {
      productName:     req.productName || params.sowProduct || params.productName || '',
      qty:             hasValue(req.qty) ? req.qty : (params.sowQty || ''),
      rate:            hasValue(req.rate) ? req.rate : (params.sowFee || ''),
      laborDesc:       req.laborDesc || params.sowLaborDesc || '',
      bidExistCabling: req.bidExistCabling || params.sowExistCabling || '',
      bidPlenum:       req.bidPlenum || params.sowPlenum || '',
      bidExterior:     req.bidExterior || params.sowExterior || '',
      bidDropLength:   req.bidDropLength || params.sowDropLength || '',
      bidConduit:      req.bidConduit || params.sowConduit || '',
      bidMdfIdf:       req.bidMdfIdf || params.sowMdfIdf || '',
      bidMdfIdfIds:    req.bidMdfIdfIds || params.sowMdfIdfIds || [],
      bidConnDevice:      req.bidConnDevice || '',
      bidConnDeviceIds:   req.bidConnDeviceIds || [],
      bidConnTo:          req.bidConnTo || '',
      bidConnToIds:       req.bidConnToIds || [],
    };

    // Connection options for addable connection fields (e.g. MDF/IDF)
    var addConnOpts = params.connOptions || {};

    // Use FIELD_DEFS with visKey filtering — skip most connection fields for Add
    var inputs = {};
    for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
      var fd = FIELD_DEFS[fi];
      // Skip connection fields unless marked addable
      if (fd.type === 'connection' && !fd.addable) continue;
      // Skip hidden fields based on visibility rules
      if (fd.visKey && !vis[fd.visKey]) continue;

      var fRow = el('div', 'scw-bid-cr-modal__field');
      fRow.appendChild(el('label', 'scw-bid-cr-modal__label', fd.label));
      var inp;
      if (fd.displayOnly) {
        inp = el('span', 'scw-bid-cr-modal__display-value', prefill[fd.key] || '\u2014');
        inp.setAttribute('data-field', fd.key);
        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
        continue;
      }
      if (fd.type === 'connection' && fd.addable) {
        // Connection field for addable fields — radio if single, checkbox if multi
        var addRecs = (addConnOpts[fd.key] || []).slice();
        var addPrefillIds = prefill[fd.key + 'Ids'] || [];
        // Inject prefilled IDs that aren't in the options list (e.g. pending add sources)
        if (addPrefillIds.length) {
          var addRecsById = {};
          for (var adi = 0; adi < addRecs.length; adi++) addRecsById[addRecs[adi].id] = true;
          var addLabels = (prefill[fd.key] || '').split(',');
          for (var api2 = 0; api2 < addPrefillIds.length; api2++) {
            if (!addRecsById[addPrefillIds[api2]]) {
              var injLabel = (addLabels[api2] || '').trim() || addPrefillIds[api2];
              addRecs.push({ id: addPrefillIds[api2], identifier: injLabel });
            }
          }
        }
        inp = el('div', 'scw-bid-cr-modal__checkbox-list');
        if (!addRecs.length) {
          inp.appendChild(el('span', 'scw-bid-cr-modal__checkbox-empty', 'No available records'));
        }
        for (var ari = 0; ari < addRecs.length; ari++) {
          var arec = addRecs[ari];
          var aItem = el('div', 'scw-bid-cr-modal__checkbox-item');
          var aInp = document.createElement('input');
          aInp.type = fd.single ? 'radio' : 'checkbox';
          if (fd.single) aInp.name = 'scw-cr-add-radio-' + fd.key;
          aInp.value = arec.id;
          aInp.id = 'scw-cr-add-cb-' + fd.key + '-' + ari;
          if (arec.noBid) aInp.setAttribute('data-no-bid', '1');
          if (arec.rowId) aInp.setAttribute('data-row-id', arec.rowId);
          for (var api = 0; api < addPrefillIds.length; api++) {
            if (addPrefillIds[api] === arec.id) { aInp.checked = true; break; }
          }
          aItem.appendChild(aInp);
          var aCbLabel = document.createElement('label');
          aCbLabel.setAttribute('for', aInp.id);
          var aLblText = (arec.identifier || arec.id) + (arec.noBid ? ' (not on bid)' : '');
          aCbLabel.textContent = aLblText;
          if (arec.noBid) aCbLabel.style.fontStyle = 'italic';
          aItem.appendChild(aCbLabel);
          inp.appendChild(aItem);
        }
      } else if (fd.multiline) {
        inp = document.createElement('textarea');
        inp.className = 'scw-bid-cr-modal__textarea';
        inp.rows = 3;
        if (prefill[fd.key]) inp.value = String(prefill[fd.key]);
      } else if (fd.type === 'select') {
        inp = document.createElement('select');
        inp.className = 'scw-bid-cr-modal__select';
        var blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '\u2014';
        inp.appendChild(blankOpt);
        for (var oi = 0; oi < fd.options.length; oi++) {
          var opt = document.createElement('option');
          opt.value = fd.options[oi];
          opt.textContent = fd.options[oi];
          inp.appendChild(opt);
        }
        if (prefill[fd.key]) inp.value = String(prefill[fd.key]);
      } else {
        inp = document.createElement('input');
        inp.type = fd.type;
        inp.className = 'scw-bid-cr-modal__input';
        if (fd.type === 'number') inp.setAttribute('step', 'any');
        if (prefill[fd.key]) inp.value = fd.type === 'number' ? prefill[fd.key] : String(prefill[fd.key]);
      }
      inputs[fd.key] = inp;
      fRow.appendChild(inp);
      body.appendChild(fRow);
    }

    var notesRow = el('div', 'scw-bid-cr-modal__field');
    notesRow.appendChild(el('label', 'scw-bid-cr-modal__label', 'Notes'));
    var ta = document.createElement('textarea');
    ta.className = 'scw-bid-cr-modal__textarea';
    ta.placeholder = 'Additional details\u2026';
    ta.rows = 2;
    if (existing && existing.changeNotes) ta.value = existing.changeNotes;
    notesRow.appendChild(ta);
    body.appendChild(notesRow);
    modal.appendChild(body);

    var footer = el('div', 'scw-bid-cr-modal__footer');
    footer.appendChild(el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--cancel', 'Cancel'));
    footer.lastChild.addEventListener('click', closeModal);
    var addBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--add',
      existing ? 'Update Change Request' : 'Add to Change Request');
    addBtn.addEventListener('click', function () {
      var product = (inputs.productName ? (inputs.productName.textContent || '').trim() : '') ||
                    params.sowProduct || params.productName || '';
      if (!product) {
        ns.renderToast('Product name is required', 'error');
        return;
      }
      var requested = {};
      var noBidAdds = [];
      for (var k in inputs) {
        var inpEl = inputs[k];
        // Skip display-only fields (not editable)
        if (inpEl.classList && inpEl.classList.contains('scw-bid-cr-modal__display-value')) continue;
        // Connection checkbox/radio list
        if (inpEl.classList && inpEl.classList.contains('scw-bid-cr-modal__checkbox-list')) {
          var addCbs = inpEl.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked');
          if (addCbs.length) {
            var addSelIds = [], addLabels = [];
            for (var asi = 0; asi < addCbs.length; asi++) {
              addSelIds.push(addCbs[asi].value);
              var addCbLbl = inpEl.querySelector('label[for="' + addCbs[asi].id + '"]');
              var rawLbl = addCbLbl ? addCbLbl.textContent.replace(/\s*\(not on bid\)\s*$/, '') : addCbs[asi].value;
              if (addCbLbl) addLabels.push(rawLbl);
              // Detect noBid selections for reciprocal add-to-bid
              if (addCbs[asi].getAttribute('data-no-bid') === '1') {
                noBidAdds.push({
                  id:    addCbs[asi].value,
                  rowId: addCbs[asi].getAttribute('data-row-id'),
                  label: rawLbl,
                  connKey: k,
                });
              }
            }
            requested[k] = addLabels.join(', ');
            requested[k + 'Ids'] = addSelIds;
          }
          continue;
        }
        var v = (inpEl.value || '').trim();
        if (v) requested[k] = k === 'qty' || k === 'rate' ? parseFloat(v) : v;
      }
      // Use the noBid row ID if available, else generate a pseudo-ID
      var itemRowId = params.rowId || ('new_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
      var displayLabel = params.displayLabel || params.sowProduct || product;
      var newItem = {
        rowId:        itemRowId,
        bidRecordId:  null,
        sowItemId:    params.sowItemId || '',
        displayLabel: displayLabel,
        productName:  product,
        addToBid:     true,
        proposalBucket:   params.proposalBucket || '',
        proposalBucketId: params.proposalBucketId || '',
        sortOrder:        params.sortOrder || 0,
        sowMapConn:       params.sowMapConn || '',
        current:      {},
        requested:    requested,
        changeNotes:  ta.value.trim(),
      };
      // Preserve reciprocal metadata when editing a reciprocal add-to-bid item
      if (existing && existing.reciprocal)       newItem.reciprocal = true;
      if (existing && existing.reciprocalSource) newItem.reciprocalSource = existing.reciprocalSource;

      // Clear old reciprocals from this source before saving (handles edits)
      var isRecipItem = existing && existing.reciprocalSource;
      if (!isRecipItem) clearReciprocalsFromSource(itemRowId);

      addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, newItem, params.surveyId);

      // Create reciprocal add-to-bid for noBid items selected in connection fields
      if (!isRecipItem && noBidAdds.length) {
        for (var nbi = 0; nbi < noBidAdds.length; nbi++) {
          var nba = noBidAdds[nbi];
          var nbaRow = null;
          if (params.gridRows) {
            for (var nri = 0; nri < params.gridRows.length; nri++) {
              if (params.gridRows[nri].id === nba.rowId) { nbaRow = params.gridRows[nri]; break; }
            }
          }
          var nbaProduct = nbaRow ? (nbaRow.sowProduct || nbaRow.productName || nba.label) : nba.label;
          var nbaDisplay = nbaRow ? (nbaRow.displayLabel || nbaProduct) : nba.label;
          // Mirror key: if selected in bidConnDevice, set bidConnTo on the new item
          var nbaMirrorKey = nba.connKey === 'bidConnDevice' ? 'bidConnTo' : 'bidConnDevice';
          var nbaReq = {};
          nbaReq.productName = nbaProduct;
          if (nbaRow && nbaRow.sowQty) nbaReq.qty = nbaRow.sowQty;
          // Pre-fill reciprocal connection: point back to the source
          nbaReq[nbaMirrorKey] = displayLabel || product;
          nbaReq[nbaMirrorKey + 'Ids'] = [itemRowId];
          // Copy source's MDF/IDF to the reciprocal add
          var srcMdfIdf    = requested.bidMdfIdf || '';
          var srcMdfIdfIds = requested.bidMdfIdfIds || [];
          if (srcMdfIdf)          nbaReq.bidMdfIdf    = srcMdfIdf;
          if (srcMdfIdfIds.length) nbaReq.bidMdfIdfIds = srcMdfIdfIds;

          // Reciprocal inherits the source's proposal bucket and sort order
          var nbaSort = 0;
          var nbaBucket = '';
          var nbaBucketId = '';
          if (nbaRow) {
            nbaSort = nbaRow.sortOrder || 0;
            nbaBucket = nbaRow.proposalBucket || '';
            nbaBucketId = nbaRow.proposalBucketId || '';
          }
          addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
            rowId:        nba.rowId,
            bidRecordId:  null,
            sowItemId:    nba.rowId,
            displayLabel: nbaDisplay,
            productName:  nbaProduct,
            addToBid:     true,
            proposalBucket:   nbaBucket,
            proposalBucketId: nbaBucketId,
            sortOrder:        nbaSort,
            reciprocal:   true,
            reciprocalSource: itemRowId,
            current:      {},
            requested:    nbaReq,
            changeNotes:  'Add to bid \u2014 connected from ' + (displayLabel || product),
          }, params.surveyId);
        }
        ns.renderToast(noBidAdds.length + ' item(s) will be added to bid', 'info');
      }

      closeModal();
      ns.renderToast(existing ? 'Change request updated' : 'New line item added to change request', 'success');
    });
    footer.appendChild(addBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
  }

  // ── Init: rehydrate from sessionStorage immediately ────
  sload();

  // ── Public API ─────────────────────────────────────────
  ns.changeRequests = {
    open:             openChangeModal,
    openRemove:       openRemoveModal,
    openAddItem:      openAddItemModal,
    rehydrate:        rehydrateFromKnack,
    getPending:       function () { return _pending; },
    summarizeItem:    summarizeChanges,
    buildSummaryCard: buildSummaryCard,
    submitForPackage: submitChangeRequest,
    clear:            function () { _pending = {}; sclear(); saveToKnack(); triggerRerender(); },
  };

})();
