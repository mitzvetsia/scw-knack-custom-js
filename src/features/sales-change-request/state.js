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

  // ── SessionStorage persistence ────────────────────────────
  function ssave() {
    try { sessionStorage.setItem(CFG.storageKey, JSON.stringify(_pending)); } catch (e) {}
  }
  function sload() {
    try {
      var r = sessionStorage.getItem(CFG.storageKey);
      if (r) _pending = JSON.parse(r);
    } catch (e) {}
  }

  function persist() { ssave(); }

  function pendingCount() { return Object.keys(_pending).length; }

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
  };

  ns.persist      = persist;
  ns.pendingCount = pendingCount;
  ns.showToast    = showToast;

  // Helpers (used by sibling modules)
  ns._h = {
    el:               el,
    escHtml:          escHtml,
    stripHtml:        stripHtml,
    fmtCurrency:      fmtCurrency,
    normVal:          normVal,
    formatFieldValue: formatFieldValue,
  };

})();
