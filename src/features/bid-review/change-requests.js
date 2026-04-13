/*** BID REVIEW — CHANGE REQUESTS ***/
/**
 * Captures proposed changes to bid items from the comparison grid
 * and groups them into per-package change request headers that can
 * be submitted back to the subcontractor via the Make webhook.
 *
 * Flow:
 *   1. User clicks "Request Change" on a bid cell
 *   2. Modal opens showing current values + fields for requested changes
 *   3. Change is added to a pending list, grouped by bid package
 *   4. Floating panel shows all pending changes
 *   5. User submits the change request per package → webhook
 *
 * Persistence: pending changes are saved to sessionStorage so they
 * survive page refreshes within the same tab.
 *
 * Field registry: FIELD_DEFS drives both the "Current Values" display
 * and the "Requested Changes" form. To add a new field to the change
 * request modal, add one entry to FIELD_DEFS.
 *
 * Reads : SCW.bidReview.CONFIG, SCW.bidReview.submitAction,
 *         SCW.bidReview.renderToast
 * Writes: SCW.bidReview.changeRequests
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  var CR_CSS_ID    = 'scw-bid-cr-css';
  var OVERLAY_ID   = 'scw-bid-cr-overlay';
  var PANEL_ID     = 'scw-bid-cr-panel';
  var STORAGE_KEY  = 'scw-bid-cr-pending';

  // ── Field registry ─────────────────────────────────────
  // Drives both the current-values display and the requested-changes
  // form in the modal.  To show a new field, add one entry here.
  //
  //   key      — property name on the cell object (from transform.js)
  //   label    — human-readable label
  //   type     — 'text' | 'number' | 'select'
  //   options  — (select only) array of option strings
  //   currency — true → format as $ in current-values display
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

  // ── Pending changes state ──────────────────────────────
  // { pkgId: { pkgName, sowId, sowName, items: [...] } }
  var _pending = {};

  function pendingCount() {
    var count = 0;
    var keys = Object.keys(_pending);
    for (var i = 0; i < keys.length; i++) {
      count += _pending[keys[i]].items.length;
    }
    return count;
  }

  // ── sessionStorage persistence ─────────────────────────

  function savePending() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_pending));
    } catch (e) { /* quota exceeded or private browsing — ignore */ }
  }

  function loadPending() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) _pending = JSON.parse(raw);
    } catch (e) { _pending = {}; }
  }

  function clearStorage() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── HTML helpers ───────────────────────────────────────

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function fmtCurrency(val) {
    if (val == null || val === 0) return '$0.00';
    return '$' + Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function hasValue(val) {
    if (val == null) return false;
    if (typeof val === 'number') return true;
    if (typeof val === 'string') return val.trim().length > 0;
    return Boolean(val);
  }

  function formatDisplay(def, val) {
    if (def.currency) return fmtCurrency(val);
    return String(val);
  }

  // ── CSS injection ──────────────────────────────────────

  function injectCrStyles() {
    if (document.getElementById(CR_CSS_ID)) return;

    var css = [

      /* ── overlay ───────────────────────────────────── */
      '.scw-bid-cr-overlay {',
      '  position: fixed; inset: 0; z-index: 100001;',
      '  background: rgba(0,0,0,.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',

      /* ── modal ─────────────────────────────────────── */
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
      '.scw-bid-cr-modal__title {',
      '  font-size: 16px; font-weight: 700; color: #0f172a;',
      '}',
      '.scw-bid-cr-modal__subtitle {',
      '  font-size: 12px; color: #64748b; margin-top: 2px;',
      '}',
      '.scw-bid-cr-modal__close {',
      '  position: absolute; top: 12px; right: 14px;',
      '  background: none; border: none; font-size: 22px;',
      '  color: #94a3b8; cursor: pointer; line-height: 1;',
      '  padding: 0 4px;',
      '}',
      '.scw-bid-cr-modal__close:hover { color: #334155; }',

      '.scw-bid-cr-modal__body {',
      '  padding: 16px 20px; overflow-y: auto; flex: 1 1 auto;',
      '}',

      '.scw-bid-cr-modal__section { margin-bottom: 16px; }',
      '.scw-bid-cr-modal__section-title {',
      '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .5px; color: #64748b; margin-bottom: 8px;',
      '}',
      '.scw-bid-cr-modal__hint {',
      '  font-size: 11px; color: #94a3b8; margin-bottom: 10px;',
      '}',

      /* current values grid */
      '.scw-bid-cr-modal__current {',
      '  display: grid; grid-template-columns: auto 1fr; gap: 3px 10px;',
      '  font-size: 12px;',
      '}',
      '.scw-bid-cr-modal__current-label {',
      '  font-weight: 600; color: #64748b; white-space: nowrap;',
      '}',
      '.scw-bid-cr-modal__current-value { color: #1e293b; }',

      /* form fields */
      '.scw-bid-cr-modal__field { margin-bottom: 10px; }',
      '.scw-bid-cr-modal__label {',
      '  display: block; font-size: 11px; font-weight: 600;',
      '  color: #475569; margin-bottom: 3px;',
      '}',
      '.scw-bid-cr-modal__input, .scw-bid-cr-modal__select, .scw-bid-cr-modal__textarea {',
      '  display: block; width: 100%; box-sizing: border-box;',
      '  padding: 7px 10px; border: 1px solid #cbd5e1;',
      '  border-radius: 5px; font: inherit; font-size: 13px;',
      '  color: #1e293b; background: #f8fafc;',
      '  transition: border-color .15s;',
      '}',
      '.scw-bid-cr-modal__input:focus, .scw-bid-cr-modal__select:focus, .scw-bid-cr-modal__textarea:focus {',
      '  outline: none; border-color: #3b82f6;',
      '  box-shadow: 0 0 0 2px rgba(59,130,246,.15);',
      '}',
      '.scw-bid-cr-modal__textarea { resize: vertical; min-height: 60px; }',

      /* footer */
      '.scw-bid-cr-modal__footer {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 12px 20px; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-bid-cr-modal__btn {',
      '  padding: 8px 16px; border: none; border-radius: 5px;',
      '  font: 600 13px/1 system-ui, sans-serif; cursor: pointer;',
      '  transition: filter .15s;',
      '}',
      '.scw-bid-cr-modal__btn:hover { filter: brightness(.92); }',
      '.scw-bid-cr-modal__btn--cancel {',
      '  background: #e2e8f0; color: #475569;',
      '}',
      '.scw-bid-cr-modal__btn--add {',
      '  background: #0891b2; color: #fff;',
      '}',

      /* ── floating panel ────────────────────────────── */
      '.scw-bid-cr-panel {',
      '  position: fixed; bottom: 0; left: 50%;',
      '  transform: translateX(-50%);',
      '  width: 600px; max-width: 96vw;',
      '  max-height: 45vh; overflow-y: auto;',
      '  background: #fff; border-radius: 10px 10px 0 0;',
      '  box-shadow: 0 -4px 24px rgba(0,0,0,.18);',
      '  z-index: 100000;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '  color: #1e293b;',
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
      '.scw-bid-cr-panel__clear:hover {',
      '  border-color: rgba(255,255,255,.6); color: #fff;',
      '}',

      '.scw-bid-cr-panel__body { padding: 10px 16px 14px; }',

      '.scw-bid-cr-panel__pkg { margin-bottom: 12px; }',
      '.scw-bid-cr-panel__pkg:last-child { margin-bottom: 0; }',

      '.scw-bid-cr-panel__pkg-header {',
      '  display: flex; align-items: center; gap: 8px;',
      '  margin-bottom: 6px;',
      '}',
      '.scw-bid-cr-panel__pkg-name {',
      '  font-weight: 700; font-size: 13px; color: #0f172a;',
      '}',
      '.scw-bid-cr-panel__pkg-count {',
      '  font-size: 11px; color: #64748b;',
      '}',

      '.scw-bid-cr-panel__item {',
      '  display: flex; align-items: flex-start; gap: 8px;',
      '  padding: 5px 8px; border-radius: 4px;',
      '  background: #f8fafc; margin-bottom: 4px;',
      '}',
      '.scw-bid-cr-panel__item-text { flex: 1 1 auto; min-width: 0; }',
      '.scw-bid-cr-panel__item-label {',
      '  display: block; font-weight: 600; font-size: 12px;',
      '  color: #1e293b;',
      '}',
      '.scw-bid-cr-panel__item-changes {',
      '  display: block; font-size: 11px; color: #0891b2;',
      '}',
      '.scw-bid-cr-panel__item-notes {',
      '  display: block; font-size: 11px; color: #64748b;',
      '  font-style: italic;',
      '}',
      '.scw-bid-cr-panel__item-remove {',
      '  flex-shrink: 0; background: none; border: none;',
      '  font-size: 16px; color: #94a3b8; cursor: pointer;',
      '  padding: 0 2px; line-height: 1;',
      '}',
      '.scw-bid-cr-panel__item-remove:hover { color: #dc2626; }',

      '.scw-bid-cr-panel__submit {',
      '  display: block; width: 100%; margin-top: 8px;',
      '  padding: 8px 12px; border: none; border-radius: 5px;',
      '  background: #0891b2; color: #fff;',
      '  font: 600 12px/1.2 system-ui, sans-serif;',
      '  cursor: pointer; transition: filter .15s;',
      '}',
      '.scw-bid-cr-panel__submit:hover { filter: brightness(.9); }',
      '.scw-bid-cr-panel__submit:disabled {',
      '  opacity: .5; cursor: default; filter: none;',
      '}',

    ].join('\n');

    var style = document.createElement('style');
    style.id = CR_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Modal ──────────────────────────────────────────────

  /**
   * Open the change request modal for a specific bid cell.
   *
   * @param {object} params
   * @param {string} params.rowId
   * @param {string} params.pkgId
   * @param {string} params.pkgName
   * @param {string} params.sowId
   * @param {string} params.sowName
   * @param {string} params.displayLabel
   * @param {string} params.productName
   * @param {object} params.cell — cell data from transform state
   */
  function openChangeModal(params) {
    injectCrStyles();
    closeModal();

    var cell = params.cell || {};

    // Overlay
    var overlay = el('div', 'scw-bid-cr-overlay');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    // Modal
    var modal = el('div', 'scw-bid-cr-modal');

    // ── header ──
    var header = el('div', 'scw-bid-cr-modal__header');
    var headerLeft = el('div');
    headerLeft.appendChild(el('div', 'scw-bid-cr-modal__title', 'Request Change'));
    headerLeft.appendChild(el('div', 'scw-bid-cr-modal__subtitle',
      params.pkgName + ' \u2014 ' + (params.displayLabel || params.productName || 'Item')));
    header.appendChild(headerLeft);

    var closeBtn = el('button', 'scw-bid-cr-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // ── body ──
    var body = el('div', 'scw-bid-cr-modal__body');

    // ── Current values — driven by FIELD_DEFS ──
    var curSection = el('div', 'scw-bid-cr-modal__section');
    curSection.appendChild(el('div', 'scw-bid-cr-modal__section-title', 'Current Bid Values'));
    var curGrid = el('div', 'scw-bid-cr-modal__current');
    for (var ci = 0; ci < FIELD_DEFS.length; ci++) {
      var cd = FIELD_DEFS[ci];
      if (hasValue(cell[cd.key])) {
        curGrid.appendChild(el('span', 'scw-bid-cr-modal__current-label', cd.label + ':'));
        curGrid.appendChild(el('span', 'scw-bid-cr-modal__current-value', formatDisplay(cd, cell[cd.key])));
      }
    }
    curSection.appendChild(curGrid);
    body.appendChild(curSection);

    // ── Requested changes — driven by FIELD_DEFS ──
    var reqSection = el('div', 'scw-bid-cr-modal__section');
    reqSection.appendChild(el('div', 'scw-bid-cr-modal__section-title', 'Requested Changes'));
    reqSection.appendChild(el('div', 'scw-bid-cr-modal__hint',
      'Leave blank for no change. Fill in only the fields you want updated.'));

    var inputs = {};
    for (var fi = 0; fi < FIELD_DEFS.length; fi++) {
      var fd = FIELD_DEFS[fi];
      var fieldRow = el('div', 'scw-bid-cr-modal__field');
      fieldRow.appendChild(el('label', 'scw-bid-cr-modal__label', fd.label));

      var input;
      if (fd.type === 'select') {
        input = document.createElement('select');
        input.className = 'scw-bid-cr-modal__select';
        // Blank "no change" option
        var blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '\u2014 no change \u2014';
        input.appendChild(blankOpt);
        for (var oi = 0; oi < fd.options.length; oi++) {
          var opt = document.createElement('option');
          opt.value = fd.options[oi];
          opt.textContent = fd.options[oi];
          input.appendChild(opt);
        }
      } else {
        input = document.createElement('input');
        input.type = fd.type;
        input.className = 'scw-bid-cr-modal__input';
        input.placeholder = hasValue(cell[fd.key]) ? String(cell[fd.key]) : '';
        if (fd.type === 'number') input.setAttribute('step', 'any');
      }

      input.setAttribute('data-field', fd.key);
      inputs[fd.key] = input;
      fieldRow.appendChild(input);
      reqSection.appendChild(fieldRow);
    }

    // Change Notes — free-text (separate from any bid field)
    var notesRow = el('div', 'scw-bid-cr-modal__field');
    notesRow.appendChild(el('label', 'scw-bid-cr-modal__label', 'Change Notes'));
    var textarea = document.createElement('textarea');
    textarea.className = 'scw-bid-cr-modal__textarea';
    textarea.placeholder = 'Describe the changes you need\u2026';
    textarea.rows = 3;
    notesRow.appendChild(textarea);
    reqSection.appendChild(notesRow);

    body.appendChild(reqSection);
    modal.appendChild(body);

    // ── footer ──
    var footer = el('div', 'scw-bid-cr-modal__footer');

    var cancelBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var addBtn = el('button', 'scw-bid-cr-modal__btn scw-bid-cr-modal__btn--add', 'Add to Change Request');
    addBtn.addEventListener('click', function () {
      var requested = {};
      var hasChange = false;

      for (var k = 0; k < FIELD_DEFS.length; k++) {
        var def = FIELD_DEFS[k];
        var inp = inputs[def.key];
        var val = (inp.value || '').trim();
        if (val) {
          requested[def.key] = (def.type === 'number') ? parseFloat(val) : val;
          hasChange = true;
        }
      }

      var changeNotes = textarea.value.trim();
      if (changeNotes) hasChange = true;

      if (!hasChange) {
        ns.renderToast('Please specify at least one change or add notes', 'info');
        return;
      }

      // Snapshot current values for every FIELD_DEF that has data
      var current = {};
      for (var ci2 = 0; ci2 < FIELD_DEFS.length; ci2++) {
        var cd2 = FIELD_DEFS[ci2];
        if (hasValue(cell[cd2.key])) current[cd2.key] = cell[cd2.key];
      }

      addPendingItem(params.pkgId, params.pkgName, params.sowId, params.sowName, {
        rowId:        params.rowId,
        bidRecordId:  cell.id,
        displayLabel: params.displayLabel,
        productName:  cell.productName,
        current:      current,
        requested:    requested,
        changeNotes:  changeNotes,
      });

      closeModal();
      ns.renderToast('Change added to request', 'success');
    });
    footer.appendChild(addBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus first input
    var firstInput = modal.querySelector('input, select');
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
  }

  function closeModal() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  // ── Pending items management ───────────────────────────

  function addPendingItem(pkgId, pkgName, sowId, sowName, item) {
    if (!_pending[pkgId]) {
      _pending[pkgId] = {
        pkgName: pkgName,
        sowId:   sowId,
        sowName: sowName,
        items:   [],
      };
    }

    // Replace existing entry for same row
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === item.rowId) {
        items[i] = item;
        savePending();
        renderPanel();
        return;
      }
    }

    items.push(item);
    savePending();
    renderPanel();
  }

  function removePendingItem(pkgId, rowId) {
    if (!_pending[pkgId]) return;
    var items = _pending[pkgId].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].rowId === rowId) {
        items.splice(i, 1);
        break;
      }
    }
    if (!items.length) delete _pending[pkgId];
    savePending();
    renderPanel();
  }

  // ── Panel rendering ────────────────────────────────────

  function renderPanel() {
    injectCrStyles();

    var existing = document.getElementById(PANEL_ID);
    var count = pendingCount();

    if (count === 0) {
      if (existing) existing.remove();
      return;
    }

    var panel = el('div', 'scw-bid-cr-panel');
    panel.id = PANEL_ID;

    // Header
    var header = el('div', 'scw-bid-cr-panel__header');
    header.appendChild(el('span', 'scw-bid-cr-panel__title',
      'Change Request (' + count + ' item' + (count !== 1 ? 's' : '') + ')'));

    var clearBtn = el('button', 'scw-bid-cr-panel__clear', 'Clear All');
    clearBtn.addEventListener('click', function () {
      if (window.confirm('Clear all pending change requests?')) {
        _pending = {};
        savePending();
        renderPanel();
      }
    });
    header.appendChild(clearBtn);
    panel.appendChild(header);

    // Body — grouped by package
    var body = el('div', 'scw-bid-cr-panel__body');
    var pkgIds = Object.keys(_pending);

    for (var p = 0; p < pkgIds.length; p++) {
      var pkgId = pkgIds[p];
      var pkg   = _pending[pkgId];

      var pkgSection = el('div', 'scw-bid-cr-panel__pkg');

      var pkgHeader = el('div', 'scw-bid-cr-panel__pkg-header');
      pkgHeader.appendChild(el('span', 'scw-bid-cr-panel__pkg-name', pkg.pkgName));
      pkgHeader.appendChild(el('span', 'scw-bid-cr-panel__pkg-count',
        pkg.items.length + ' change' + (pkg.items.length !== 1 ? 's' : '')));
      pkgSection.appendChild(pkgHeader);

      // Items
      for (var i = 0; i < pkg.items.length; i++) {
        pkgSection.appendChild(buildPanelItem(pkgId, pkg.items[i]));
      }

      // Submit button for this package
      var submitBtn = el('button', 'scw-bid-cr-panel__submit',
        'Submit Change Request for ' + pkg.pkgName);
      submitBtn.setAttribute('data-pkg-id', pkgId);
      submitBtn.addEventListener('click', function () {
        submitChangeRequest(this.getAttribute('data-pkg-id'));
      });
      pkgSection.appendChild(submitBtn);

      body.appendChild(pkgSection);
    }

    panel.appendChild(body);

    // Replace or insert
    if (existing) {
      existing.parentNode.replaceChild(panel, existing);
    } else {
      document.body.appendChild(panel);
    }
  }

  function buildPanelItem(pkgId, item) {
    var row = el('div', 'scw-bid-cr-panel__item');

    var text = el('div', 'scw-bid-cr-panel__item-text');
    text.appendChild(el('span', 'scw-bid-cr-panel__item-label',
      item.displayLabel || item.productName || 'Item'));

    var changes = summarizeChanges(item);
    if (changes) text.appendChild(el('span', 'scw-bid-cr-panel__item-changes', changes));
    if (item.changeNotes) text.appendChild(el('span', 'scw-bid-cr-panel__item-notes', item.changeNotes));
    row.appendChild(text);

    var rmBtn = el('button', 'scw-bid-cr-panel__item-remove', '\u00d7');
    rmBtn.setAttribute('data-pkg-id', pkgId);
    rmBtn.setAttribute('data-row-id', item.rowId);
    rmBtn.addEventListener('click', function () {
      removePendingItem(
        this.getAttribute('data-pkg-id'),
        this.getAttribute('data-row-id')
      );
    });
    row.appendChild(rmBtn);

    return row;
  }

  function summarizeChanges(item) {
    var parts = [];
    var r = item.requested;
    var c = item.current;

    for (var i = 0; i < FIELD_DEFS.length; i++) {
      var def = FIELD_DEFS[i];
      if (!hasValue(r[def.key])) continue;

      var from = hasValue(c[def.key]) ? (def.currency ? fmtCurrency(c[def.key]) : String(c[def.key])) : '?';
      var to   = def.currency ? fmtCurrency(r[def.key]) : String(r[def.key]);
      parts.push(def.label + ': ' + from + '\u2192' + to);
    }

    return parts.join(', ');
  }

  // ── Submit change request for one package ──────────────

  function submitChangeRequest(pkgId) {
    var pkg = _pending[pkgId];
    if (!pkg || !pkg.items.length) return;

    var confirmed = window.confirm(
      'Submit change request for ' + pkg.pkgName + '?\n\n' +
      pkg.items.length + ' item(s) will be sent to the subcontractor.'
    );
    if (!confirmed) return;

    // Build payload
    var items = [];
    for (var i = 0; i < pkg.items.length; i++) {
      var it = pkg.items[i];
      items.push({
        rowId:        it.rowId,
        bidRecordId:  it.bidRecordId,
        displayLabel: it.displayLabel,
        productName:  it.productName,
        current:      it.current,
        requested:    it.requested,
        changeNotes:  it.changeNotes,
      });
    }

    // Disable submit button while sending
    var submitBtn = document.querySelector(
      '#' + PANEL_ID + ' .scw-bid-cr-panel__submit[data-pkg-id="' + pkgId + '"]'
    );
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending\u2026';
    }

    ns.submitAction({
      actionType: 'change_request',
      packageId:  pkgId,
      sowId:      pkg.sowId,
      items:      items,
    }).done(function () {
      delete _pending[pkgId];
      savePending();
      renderPanel();
    }).fail(function () {
      // Re-enable button on failure
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Change Request for ' + pkg.pkgName;
      }
    });
  }

  // ── Rehydrate from sessionStorage on load ──────────────

  loadPending();
  if (pendingCount() > 0) {
    // Defer panel render until DOM is ready
    setTimeout(function () { renderPanel(); }, 500);
  }

  // ── Public API ─────────────────────────────────────────

  ns.changeRequests = {
    open:        openChangeModal,
    renderPanel: renderPanel,
    getPending:  function () { return _pending; },
    clear:       function () { _pending = {}; clearStorage(); renderPanel(); },
  };

})();
