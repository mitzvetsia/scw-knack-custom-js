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
  var PANEL_ID        = 'scw-bid-cr-panel';
  var STORAGE_KEY     = 'scw-bid-cr-pending';
  var SAVE_DEBOUNCE   = 3000;

  // ── Field registry ─────────────────────────────────────
  var FIELD_DEFS = [
    { key: 'productName',     label: 'Product',            type: 'text' },
    { key: 'qty',             label: 'Qty',                type: 'number' },
    { key: 'rate',            label: 'Rate ($)',           type: 'number',  currency: true },
    { key: 'labor',           label: 'Extended ($)',       type: 'number',  currency: true },
    { key: 'laborDesc',       label: 'Labor Description',  type: 'text' },
    { key: 'bidExistCabling', label: 'Existing Cabling',   type: 'select',  options: ['Yes', 'No'] },
    { key: 'bidConnDevice',   label: 'Connected Devices',  type: 'text' },
    { key: 'notes',           label: 'Survey Notes',       type: 'text' },
  ];

  // ── State ──────────────────────────────────────────────
  var _pending = {};
  var _saveTimer = null;
  var _sowObjectKey = null;   // cached Knack object key for the SOW table
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

  // ── Knack object key discovery ─────────────────────────
  function getSowObjectKey() {
    if (_sowObjectKey) return _sowObjectKey;
    try {
      var models = Knack.objects.models || [];
      for (var i = 0; i < models.length; i++) {
        var obj = models[i].attributes || models[i];
        var fields = obj.fields || [];
        for (var f = 0; f < fields.length; f++) {
          var fld = fields[f].attributes || fields[f];
          if (fld.key === FK.changeRequestDraft) {
            _sowObjectKey = obj.key;
            if (CFG.debug) console.log('[BidReview CR] SOW object key:', _sowObjectKey);
            return _sowObjectKey;
          }
        }
      }
    } catch (e) {
      if (CFG.debug) console.warn('[BidReview CR] Object key discovery failed:', e);
    }
    return null;
  }

  // ── Knack API: read / write field_2684 ─────────────────
  function readSowField(sowId) {
    var objKey = getSowObjectKey();
    if (!objKey) return $.Deferred().reject('no object key').promise();

    return SCW.knackAjax({
      url: Knack.api_url + '/v1/objects/' + objKey + '/records/' + sowId,
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
    var objKey = getSowObjectKey();
    if (!objKey) return $.Deferred().reject('no object key').promise();

    var body = {};
    body[FK.changeRequestDraft] = data ? JSON.stringify(data) : '';

    return SCW.knackAjax({
      url: Knack.api_url + '/v1/objects/' + objKey + '/records/' + sowId,
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
        renderPanel();
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

      '.scw-bid-cr-panel {',
      '  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);',
      '  width: 600px; max-width: 96vw; max-height: 45vh; overflow-y: auto;',
      '  background: #fff; border-radius: 10px 10px 0 0;',
      '  box-shadow: 0 -4px 24px rgba(0,0,0,.18); z-index: 100000;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #1e293b;',
      '}',
      '.scw-bid-cr-panel__header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 10px 16px; background: #1e293b; color: #fff;',
      '  border-radius: 10px 10px 0 0; position: sticky; top: 0; z-index: 1;',
      '}',
      '.scw-bid-cr-panel__title { font-weight: 700; font-size: 13px; }',
      '.scw-bid-cr-panel__clear {',
      '  background: none; border: 1px solid rgba(255,255,255,.3);',
      '  color: rgba(255,255,255,.8); font-size: 11px; font-weight: 600;',
      '  padding: 3px 10px; border-radius: 4px; cursor: pointer;',
      '}',
      '.scw-bid-cr-panel__clear:hover { border-color: rgba(255,255,255,.6); color: #fff; }',
      '.scw-bid-cr-panel__body { padding: 10px 16px 14px; }',
      '.scw-bid-cr-panel__pkg { margin-bottom: 12px; }',
      '.scw-bid-cr-panel__pkg:last-child { margin-bottom: 0; }',
      '.scw-bid-cr-panel__pkg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }',
      '.scw-bid-cr-panel__pkg-name { font-weight: 700; font-size: 13px; color: #0f172a; }',
      '.scw-bid-cr-panel__pkg-count { font-size: 11px; color: #64748b; }',
      '.scw-bid-cr-panel__item {',
      '  display: flex; align-items: flex-start; gap: 8px;',
      '  padding: 5px 8px; border-radius: 4px; background: #f8fafc; margin-bottom: 4px;',
      '}',
      '.scw-bid-cr-panel__item-text { flex: 1 1 auto; min-width: 0; }',
      '.scw-bid-cr-panel__item-label { display: block; font-weight: 600; font-size: 12px; color: #1e293b; }',
      '.scw-bid-cr-panel__item-changes { display: block; font-size: 11px; color: #0891b2; }',
      '.scw-bid-cr-panel__item-notes { display: block; font-size: 11px; color: #64748b; font-style: italic; }',
      '.scw-bid-cr-panel__item-remove {',
      '  flex-shrink: 0; background: none; border: none;',
      '  font-size: 16px; color: #94a3b8; cursor: pointer; padding: 0 2px; line-height: 1;',
      '}',
      '.scw-bid-cr-panel__item-remove:hover { color: #dc2626; }',
      '.scw-bid-cr-panel__submit {',
      '  display: block; width: 100%; margin-top: 8px; padding: 8px 12px;',
      '  border: none; border-radius: 5px; background: #0891b2; color: #fff;',
      '  font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; transition: filter .15s;',
      '}',
      '.scw-bid-cr-panel__submit:hover { filter: brightness(.9); }',
      '.scw-bid-cr-panel__submit:disabled { opacity: .5; cursor: default; filter: none; }',
    ].join('\n');

    var s = document.createElement('style');
    s.id = CR_CSS_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Modal ──────────────────────────────────────────────
  function openChangeModal(params) {
    injectCrStyles();
    closeModal();

    var cell = params.cell || {};
    var overlay = el('div', 'scw-bid-cr-overlay');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = el('div', 'scw-bid-cr-modal');

    // Header
    var header = el('div', 'scw-bid-cr-modal__header');
    var hLeft = el('div');
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__title', 'Request Change'));
    hLeft.appendChild(el('div', 'scw-bid-cr-modal__subtitle',
      params.pkgName + ' \u2014 ' + (params.displayLabel || params.productName || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = el('button', 'scw-bid-cr-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    var body = el('div', 'scw-bid-cr-modal__body');

    // Current values
    var curSec = el('div', 'scw-bid-cr-modal__section');
    curSec.appendChild(el('div', 'scw-bid-cr-modal__section-title', 'Current Bid Values'));
    var curGrid = el('div', 'scw-bid-cr-modal__current');
    for (var ci = 0; ci < FIELD_DEFS.length; ci++) {
      var cd = FIELD_DEFS[ci];
      if (hasValue(cell[cd.key])) {
        curGrid.appendChild(el('span', 'scw-bid-cr-modal__current-label', cd.label + ':'));
        curGrid.appendChild(el('span', 'scw-bid-cr-modal__current-value', formatDisplay(cd, cell[cd.key])));
      }
    }
    curSec.appendChild(curGrid);
    body.appendChild(curSec);

    // Requested changes
    var reqSec = el('div', 'scw-bid-cr-modal__section');
    reqSec.appendChild(el('div', 'scw-bid-cr-modal__section-title', 'Requested Changes'));
    reqSec.appendChild(el('div', 'scw-bid-cr-modal__hint',
      'Leave blank for no change. Fill in only the fields you want updated.'));

    var inputs = {};
    for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
      var fd = FIELD_DEFS[fi];
      var fRow = el('div', 'scw-bid-cr-modal__field');
      fRow.appendChild(el('label', 'scw-bid-cr-modal__label', fd.label));

      var inp;
      if (fd.type === 'select') {
        inp = document.createElement('select');
        inp.className = 'scw-bid-cr-modal__select';
        var blank = document.createElement('option');
        blank.value = ''; blank.textContent = '\u2014 no change \u2014';
        inp.appendChild(blank);
        for (var oi = 0; oi < fd.options.length; oi++) {
          var opt = document.createElement('option');
          opt.value = fd.options[oi]; opt.textContent = fd.options[oi];
          inp.appendChild(opt);
        }
      } else {
        inp = document.createElement('input');
        inp.type = fd.type;
        inp.className = 'scw-bid-cr-modal__input';
        inp.placeholder = hasValue(cell[fd.key]) ? String(cell[fd.key]) : '';
        if (fd.type === 'number') inp.setAttribute('step', 'any');
      }
      inp.setAttribute('data-field', fd.key);
      inputs[fd.key] = inp;
      fRow.appendChild(inp);
      reqSec.appendChild(fRow);
    }

    var notesRow = el('div', 'scw-bid-cr-modal__field');
    notesRow.appendChild(el('label', 'scw-bid-cr-modal__label', 'Change Notes'));
    var ta = document.createElement('textarea');
    ta.className = 'scw-bid-cr-modal__textarea';
    ta.placeholder = 'Describe the changes you need\u2026';
    ta.rows = 3;
    notesRow.appendChild(ta);
    reqSec.appendChild(notesRow);
    body.appendChild(reqSec);
    modal.appendChild(body);

    // Footer
    var footer = el('div', 'scw-bid-cr-modal__footer');
    var cancelBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var addBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--add', 'Add to Change Request');
    addBtn.addEventListener('click', function () {
      var requested = {}, hasChange = false;
      for (var k = 0; k < FIELD_DEFS.length; k++) {
        var d = FIELD_DEFS[k], v = (inputs[d.key].value || '').trim();
        if (v) { requested[d.key] = d.type === 'number' ? parseFloat(v) : v; hasChange = true; }
      }
      var cn = ta.value.trim();
      if (cn) hasChange = true;
      if (!hasChange) { ns.renderToast('Please specify at least one change or add notes', 'info'); return; }

      var current = {};
      for (var c2 = 0; c2 < FIELD_DEFS.length; c2++) {
        var cd2 = FIELD_DEFS[c2];
        if (hasValue(cell[cd2.key])) current[cd2.key] = cell[cd2.key];
      }

      addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
        rowId: params.rowId, bidRecordId: cell.id,
        displayLabel: params.displayLabel, productName: cell.productName,
        current: current, requested: requested, changeNotes: cn,
      });
      closeModal();
      ns.renderToast('Change added to request', 'success');
    });
    footer.appendChild(addBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var first = modal.querySelector('input, select');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }

  function closeModal() {
    var o = document.getElementById(OVERLAY_ID);
    if (o) o.remove();
  }

  // ── Pending management ─────────────────────────────────
  function addPendingItem(pkgId, pkgName, sowId, sowName, item) {
    if (!_pending[pkgId]) _pending[pkgId] = { pkgName: pkgName, sowId: sowId, sowName: sowName, items: [] };
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === item.rowId) { items[i] = item; persist(); renderPanel(); return; }
    }
    items.push(item);
    persist();
    renderPanel();
  }

  function removePendingItem(pkgId, rowId) {
    if (!_pending[pkgId]) return;
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === rowId) { items.splice(i, 1); break; }
    }
    if (!items.length) delete _pending[pkgId];
    persist();
    renderPanel();
  }

  // ── Panel ──────────────────────────────────────────────
  function renderPanel() {
    injectCrStyles();
    var existing = document.getElementById(PANEL_ID);
    var count = pendingCount();
    if (count === 0) { if (existing) existing.remove(); return; }

    var panel = el('div', 'scw-bid-cr-panel');
    panel.id = PANEL_ID;

    var header = el('div', 'scw-bid-cr-panel__header');
    header.appendChild(el('span', 'scw-bid-cr-panel__title',
      'Change Request (' + count + ' item' + (count !== 1 ? 's' : '') + ')'));
    var clearBtn = el('button', 'scw-bid-cr-panel__clear', 'Clear All');
    clearBtn.addEventListener('click', function () {
      if (!window.confirm('Clear all pending change requests?')) return;
      _pending = {};
      persist();
      renderPanel();
    });
    header.appendChild(clearBtn);
    panel.appendChild(header);

    var body = el('div', 'scw-bid-cr-panel__body');
    var pkgIds = Object.keys(_pending);
    for (var p = 0; p < pkgIds.length; p++) {
      var pkgId = pkgIds[p], pkg = _pending[pkgId];
      var sec = el('div', 'scw-bid-cr-panel__pkg');
      var ph = el('div', 'scw-bid-cr-panel__pkg-header');
      ph.appendChild(el('span', 'scw-bid-cr-panel__pkg-name', pkg.pkgName));
      ph.appendChild(el('span', 'scw-bid-cr-panel__pkg-count',
        pkg.items.length + ' change' + (pkg.items.length !== 1 ? 's' : '')));
      sec.appendChild(ph);

      for (var i = 0; i < pkg.items.length; i++) sec.appendChild(buildPanelItem(pkgId, pkg.items[i]));

      var sub = el('button', 'scw-bid-cr-panel__submit', 'Submit Change Request for ' + pkg.pkgName);
      sub.setAttribute('data-pkg-id', pkgId);
      sub.addEventListener('click', function () { submitChangeRequest(this.getAttribute('data-pkg-id')); });
      sec.appendChild(sub);
      body.appendChild(sec);
    }
    panel.appendChild(body);

    if (existing) existing.parentNode.replaceChild(panel, existing);
    else document.body.appendChild(panel);
  }

  function buildPanelItem(pkgId, item) {
    var row = el('div', 'scw-bid-cr-panel__item');
    var text = el('div', 'scw-bid-cr-panel__item-text');
    text.appendChild(el('span', 'scw-bid-cr-panel__item-label', item.displayLabel || item.productName || 'Item'));
    var ch = summarizeChanges(item);
    if (ch) text.appendChild(el('span', 'scw-bid-cr-panel__item-changes', ch));
    if (item.changeNotes) text.appendChild(el('span', 'scw-bid-cr-panel__item-notes', item.changeNotes));
    row.appendChild(text);
    var rm = el('button', 'scw-bid-cr-panel__item-remove', '\u00d7');
    rm.setAttribute('data-pkg-id', pkgId); rm.setAttribute('data-row-id', item.rowId);
    rm.addEventListener('click', function () {
      removePendingItem(this.getAttribute('data-pkg-id'), this.getAttribute('data-row-id'));
    });
    row.appendChild(rm);
    return row;
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

  // ── Submit ─────────────────────────────────────────────
  function submitChangeRequest(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg || !pkg.items.length) return;
    if (!window.confirm('Submit change request for ' + pkg.pkgName + '?\n\n' +
      pkg.items.length + ' item(s) will be sent to the subcontractor.')) return;

    var items = [];
    for (var i = 0; i < pkg.items.length; i++) {
      var it = pkg.items[i];
      items.push({
        rowId: it.rowId, bidRecordId: it.bidRecordId,
        displayLabel: it.displayLabel, productName: it.productName,
        current: it.current, requested: it.requested, changeNotes: it.changeNotes,
      });
    }

    var btn = document.querySelector('#' + PANEL_ID + ' .scw-bid-cr-panel__submit[data-pkg-id="' + pkgId + '"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }

    ns.submitAction({ actionType: 'change_request', packageId: pkgId, sowId: pkg.sowId, items: items })
      .done(function () {
        delete _pending[pkgId];
        persist();
        renderPanel();
      })
      .fail(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Change Request for ' + pkg.pkgName; }
      });
  }

  // ── Init: rehydrate from sessionStorage immediately ────
  sload();
  if (pendingCount() > 0) setTimeout(function () { renderPanel(); }, 500);

  // ── Public API ─────────────────────────────────────────
  ns.changeRequests = {
    open:        openChangeModal,
    renderPanel: renderPanel,
    rehydrate:   rehydrateFromKnack,
    getPending:  function () { return _pending; },
    clear:       function () { _pending = {}; sclear(); saveToKnack(); renderPanel(); },
  };

})();
