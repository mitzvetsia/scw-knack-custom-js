/*** SALES CHANGE REQUEST — STATE + HELPERS ***/
/**
 * Shared state, persistence (sessionStorage), DOM/format helpers,
 * and toast notifications.
 *
 * Reads : SCW.salesCR.CONFIG
 * Writes: SCW.salesCR  (state helpers + public getters)
 */
(function () {
  'use strict';

  var ns  = (window.SCW.salesCR = window.SCW.salesCR || {});
  var CFG = ns.CONFIG;
  var P   = CFG.prefix;   // CSS class prefix

  // ═══════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════

  // id → { rowId, displayLabel, productName, action, current, requested, changeNotes }
  var _pending  = {};
  // recordId → { fieldKey: normalised value, _label, _product, _addCount }
  var _baseline = {};
  // true when field_2706 = "Yes" on proposalView
  var _isAddMode = false;
  // records loaded from view_3837
  var _revisionData = [];
  // true when worksheetView is on the current page
  var _onPage = false;

  // ── SessionStorage persistence (write-through cache) ───
  function ssave() {
    try { sessionStorage.setItem(CFG.storageKey, JSON.stringify(_pending)); } catch (e) {}
  }
  function sload() {
    try {
      var r = sessionStorage.getItem(CFG.storageKey);
      if (r) _pending = JSON.parse(r);
    } catch (e) {}
  }

  // ── Knack field persistence (field_2707 on SOW record) ──
  // Mirrors the bid-review pattern: debounced writes to a paragraph
  // field for cross-session durability.
  var _saveTimer = null;
  var _sowRecordId = '';   // set by init when the page loads
  var SAVE_DEBOUNCE = 3000;

  function setDraftRecordId(id) { _sowRecordId = id; }

  /** Extract the SOW record ID from the URL hash.
   *  URL pattern: #.../scope-of-work-details/<sowId>/... */
  function detectSowRecordId() {
    var hash = window.location.hash || '';
    var match = hash.match(/scope-of-work-details\/([a-f0-9]{24})/i);
    if (match) {
      _sowRecordId = match[1];
      if (CFG.debug) SCW.debug('[SalesCR] SOW record ID:', _sowRecordId);
    }
  }

  function readDraftField() {
    if (!_sowRecordId) return $.Deferred().resolve(null).promise();
    return SCW.knackAjax({
      url: SCW.knackRecordUrl(CFG.draftView, _sowRecordId),
      type: 'GET',
    }).then(function (resp) {
      var raw = resp[CFG.draftField + '_raw'] || resp[CFG.draftField] || '';
      if (typeof raw === 'string') raw = raw.replace(/<[^>]*>/g, '').trim();
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    });
  }

  function writeDraftField(data) {
    if (!_sowRecordId) return;
    var body = {};
    body[CFG.draftField] = data ? JSON.stringify(data) : '';
    SCW.knackAjax({
      url: SCW.knackRecordUrl(CFG.draftView, _sowRecordId),
      type: 'PUT',
      data: JSON.stringify(body),
    });
  }

  function debouncedSaveDraft() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      var count = Object.keys(_pending).length;
      writeDraftField(count ? _pending : null);
    }, SAVE_DEBOUNCE);
  }

  function persist() {
    ssave();
    debouncedSaveDraft();
  }

  /** Force immediate write to field_2707 (no debounce). */
  function forceSaveDraft() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    var count = Object.keys(_pending).length;
    if (CFG.debug) SCW.debug('[SalesCR] Force saving draft to Knack, sowId:', _sowRecordId, 'items:', count);
    writeDraftField(count ? _pending : null);
  }

  function pendingCount() { return Object.keys(_pending).length; }

  /** Rehydrate pending state from field_2707. Called by init after
   *  the worksheet view renders and we know the SOW record ID. */
  function rehydrateFromKnack() {
    if (!_sowRecordId) return;
    readDraftField().then(function (data) {
      if (!data || typeof data !== 'object') return;
      // Merge Knack data with any sessionStorage data (sessionStorage wins on conflicts)
      var knackKeys = Object.keys(data);
      var merged = false;
      for (var i = 0; i < knackKeys.length; i++) {
        if (!_pending[knackKeys[i]]) {
          _pending[knackKeys[i]] = data[knackKeys[i]];
          merged = true;
        }
      }
      if (merged) {
        ssave();
        if (ns.refresh) ns.refresh();
        if (CFG.debug) SCW.debug('[SalesCR] Rehydrated from Knack:', Object.keys(data).length, 'items');
      }
    }).fail(function () {
      if (CFG.debug) console.warn('[SalesCR] Knack rehydration failed — using sessionStorage');
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  DOM HELPERS
  // ═══════════════════════════════════════════════════════════

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════════════════
  //  VALUE HELPERS
  // ═══════════════════════════════════════════════════════════

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  /** Extract a human-readable string from a Knack field value.
   *  Handles connection _raw arrays, HTML strings, and plain text. */
  function readableVal(raw) {
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw)) {
      return raw.map(function (r) { return r.identifier || r.id || String(r); }).join(', ');
    }
    return stripHtml(raw);
  }

  /** Extract record IDs from a connection _raw array. Returns [] otherwise. */
  function extractIds(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id) out.push(raw[i].id);
    }
    return out;
  }

  function fmtCurrency(v) {
    if (v == null || v === 0) return '$0.00';
    return '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Normalise a raw Knack field value for comparison / display. */
  function normVal(def, raw) {
    if (raw == null || raw === '') return '';
    if (def.type === 'number') {
      var n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : 0;
    }
    if (def.type === 'connection') {
      if (Array.isArray(raw)) return raw.map(function (r) { return r.identifier || r.id; }).join(', ');
    }
    return stripHtml(raw);
  }

  /** Human-readable display of a field value. */
  function formatFieldValue(def, v) {
    if (v === '' || v == null) return '\u2014';
    if (def.currency) return fmtCurrency(v);
    if (def.pct) return v + '%';
    return String(v);
  }

  // ═══════════════════════════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════════════════════════

  var _toastTimer = null;

  function showToast(msg, type) {
    var id = P + '-toast';
    var prev = document.getElementById(id);
    if (prev) prev.remove();
    if (_toastTimer) clearTimeout(_toastTimer);

    var bg = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#0891b2';
    var t = el('div', '', msg);
    t.id = id;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:' + bg + ';color:#fff;padding:10px 20px;border-radius:8px;' +
      'font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:100002;';
    document.body.appendChild(t);

    _toastTimer = setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity 300ms';
      setTimeout(function () { if (t.parentNode) t.remove(); }, 300);
    }, CFG.toastDuration);
  }

  // ═══════════════════════════════════════════════════════════
  //  REHYDRATE ON LOAD
  // ═══════════════════════════════════════════════════════════

  sload();

  // Force-save to Knack on tab close so no changes are lost. Also flush
  // when there's a pending debounce timer even if _pending is empty —
  // otherwise a 'Clear all' followed by a quick refresh leaves the
  // cleared state unwritten and the next page load rehydrates the
  // stale field value.
  window.addEventListener('beforeunload', function () {
    if (!_sowRecordId) return;
    if (_saveTimer || Object.keys(_pending).length) {
      forceSaveDraft();
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  EXPOSE ON NAMESPACE
  // ═══════════════════════════════════════════════════════════

  // State accessors (used by sibling modules)
  ns._state = {
    pending:      function ()  { return _pending; },
    setPending:   function (p) { _pending = p; },
    baseline:     function ()  { return _baseline; },
    setBaseline:  function (b) { _baseline = b; },
    isAddMode:    function ()  { return _isAddMode; },
    setAddMode:   function (v) { _isAddMode = v; },
    revisionData: function ()  { return _revisionData; },
    setRevisionData: function (d) { _revisionData = d; },
    onPage:       function ()  { return _onPage; },
    setOnPage:    function (v) { _onPage = v; },
    sowRecordId:  function ()  { return _sowRecordId; },
  };

  ns.persist             = persist;
  ns.forceSaveDraft      = forceSaveDraft;
  ns.pendingCount        = pendingCount;
  ns.showToast           = showToast;
  ns.setDraftRecordId    = setDraftRecordId;
  ns.detectSowRecordId   = detectSowRecordId;
  ns.rehydrateFromKnack  = rehydrateFromKnack;

  // Helpers (used by sibling modules)
  ns._h = {
    el:               el,
    escHtml:          escHtml,
    stripHtml:        stripHtml,
    readableVal:      readableVal,
    extractIds:       extractIds,
    fmtCurrency:      fmtCurrency,
    normVal:          normVal,
    formatFieldValue: formatFieldValue,
  };

})();
