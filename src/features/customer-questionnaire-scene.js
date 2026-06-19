/*** CUSTOMER QUESTIONNAIRE SCENE — design polish + form auto-save (scene_1347) ***
 *
 * The customer "System Setup Questionnaire" scene mixes a details view, a POC
 * form (view_4025), instruction blocks, the deliverables grid (view_4031, handled
 * by customer-questionnaire.js), and a sign-off form (view_4029). This module:
 *
 *   1. Injects scene-scoped CSS so the page reads as one cohesive v2-styled
 *      surface (cards, section headers, consistent inputs/buttons, tidy details).
 *   2. Converts the POC form's text/name/email/phone/paragraph fields to the v2
 *      optimistic-UI pattern: each field auto-saves on blur (tab/click-away) or
 *      Enter with inline "Saving… → Saved" feedback — no "UPDATE FORM" button.
 *
 * The sign-off form (view_4029, checkbox + signature + Submit) is left as a real
 * submit — it's a deliberate finalize action, not field-by-field editing.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENE    = 'scene_1347';
  var POC_FORM = 'view_4025';      // editable POC form → auto-save
  var NS       = '.scwCqScene';
  var STYLE_ID = 'scw-cq-scene-css';

  /* ── CSS ── */
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var S = '#kn-' + SCENE;
    var css = [
      // Scene canvas
      S + ' { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      // Each top-level view becomes a clean white card.
      S + ' .kn-details.kn-view, ' + S + ' .kn-form.kn-view, ' + S + ' .kn-rich_text.kn-view {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 18px 20px; margin-bottom: 16px;',
      '}',
      // Title block
      S + ' #view_4023 h1 { font: 700 22px/1.2 system-ui, sans-serif; color: #0f4c75; margin: 0; }',
      S + ' #view_4023 h2 { display: none; }',
      // Details (Company / Site / …) — tight read-only info grid.
      S + ' #view_4024 .kn-detail { display: flex; gap: 10px; padding: 4px 0; align-items: baseline; }',
      S + ' #view_4024 .kn-detail-label { min-width: 130px !important; max-width: 130px !important;',
      '  font: 600 11px/1.3 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .03em; color: #64748b; }',
      S + ' #view_4024 .kn-detail-body { font: 500 13px/1.4 system-ui, sans-serif; color: #1f2937; }',
      // Form section breaks → section headers
      S + ' .kn-section-break { margin: 6px 0 4px; }',
      S + ' .kn-section-break .kn-title { font: 700 14px/1.3 system-ui, sans-serif; color: #0f4c75;',
      '  border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 0 0 6px; }',
      S + ' .kn-section-break .kn-description { font: 400 12px/1.5 system-ui, sans-serif; color: #64748b; }',
      // Hide the empty divider <hr> rows (we use section headers for rhythm).
      S + ' .kn-input-divider { display: none !important; }',
      // Labels
      S + ' .kn-form .kn-label, ' + S + ' .kn-form .label.kn-label {',
      '  font: 600 12px/1.3 system-ui, sans-serif !important; color: #374151 !important; }',
      S + ' .kn-required { color: #b45309 !important; }',
      // Inputs / textareas → v2 style
      S + ' .kn-form input.input, ' + S + ' .kn-form input[type="text"], ' +
        S + ' .kn-form input[type="email"], ' + S + ' .kn-form textarea, ' + S + ' .kn-form .kn-textarea {',
      '  font: 14px/1.35 system-ui, sans-serif !important; padding: 8px 10px !important;',
      '  border: 1px solid #cbd5e1 !important; border-radius: 6px !important; background: #fff !important;',
      '  color: #1f2937 !important; box-shadow: none !important; transition: border-color .12s, box-shadow .12s; }',
      S + ' .kn-form input.input:focus, ' + S + ' .kn-form input[type="text"]:focus, ' +
        S + ' .kn-form input[type="email"]:focus, ' + S + ' .kn-form textarea:focus {',
      '  outline: none !important; border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,.14) !important; }',
      S + ' .kn-form textarea, ' + S + ' .kn-form .kn-textarea { min-height: 64px !important; resize: vertical; }',
      // Primary buttons (sign-off Submit) → v2 primary
      S + ' .kn-button.is-primary {',
      '  background: #0f4c75 !important; border: 1px solid #0a3a63 !important; color: #fff !important;',
      '  font: 600 13px system-ui, sans-serif !important; border-radius: 6px !important; padding: 9px 18px !important;',
      '  text-transform: none !important; box-shadow: none !important; }',
      S + ' .kn-button.is-primary:hover { background: #0a3a63 !important; }',
      // POC form: hide the UPDATE FORM submit — fields auto-save.
      '#' + POC_FORM + ' .kn-submit { display: none !important; }',
      // view_4031 native table + header hidden (customer-questionnaire renders cards)
      '#view_4031 .view-header { display: none !important; }',
      // Per-field auto-save status pill
      S + ' .scw-cqf-status { margin-left: 8px; font: 600 11px/1 system-ui, sans-serif; color: #94a3b8; }',
      S + ' .scw-cqf-status.is-saving { color: #2563eb; }',
      S + ' .scw-cqf-status.is-ok { color: #15803d; }',
      S + ' .scw-cqf-status.is-err { color: #b91c1c; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── POC form auto-save ── */
  function recordId() {
    var inp = document.querySelector('#' + POC_FORM + ' input[name="id"]');
    return inp ? inp.value : '';
  }
  function fieldType(el) {
    if (el.classList.contains('kn-input-name')) return 'name';
    if (el.classList.contains('kn-input-email')) return 'email';
    if (el.classList.contains('kn-input-phone')) return 'phone';
    if (el.classList.contains('kn-input-paragraph_text')) return 'paragraph';
    if (el.classList.contains('kn-input-short_text')) return 'text';
    return null;
  }
  function readVal(fieldEl, type) {
    if (type === 'name') {
      var f = fieldEl.querySelector('input[name="first"]');
      var l = fieldEl.querySelector('input[name="last"]');
      return { first: f ? f.value : '', last: l ? l.value : '' };
    }
    var inp = fieldEl.querySelector('textarea, input');
    return inp ? inp.value : '';
  }
  function valKey(v) { return (v && typeof v === 'object') ? JSON.stringify(v) : String(v == null ? '' : v); }

  function setStatus(fieldEl, kind, text) {
    var st = fieldEl.querySelector('.scw-cqf-status');
    if (!st) return;
    st.className = 'scw-cqf-status' + (kind ? ' is-' + kind : '');
    st.textContent = text || '';
  }

  var _fadeTimers = {};
  function saveField(fieldEl) {
    var key = fieldEl.getAttribute('data-input-id');
    var type = key && fieldType(fieldEl);
    if (!key || !type) return;
    var recId = recordId();
    if (!recId) return;
    var val = readVal(fieldEl, type);
    var now = valKey(val);
    if (fieldEl._scwPrev === now) return;   // unchanged since last save
    setStatus(fieldEl, 'saving', 'Saving…');
    var data = {}; data[key] = val;
    var done = function (ok) {
      if (!ok) { setStatus(fieldEl, 'err', 'Save failed'); return; }
      fieldEl._scwPrev = now;
      setStatus(fieldEl, 'ok', 'Saved');
      clearTimeout(_fadeTimers[key]);
      _fadeTimers[key] = setTimeout(function () { setStatus(fieldEl, '', ''); }, 1600);
    };
    var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[POC_FORM] : null;
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recId, data, { success: function () { done(true); }, error: function () { done(false); } });
      return;
    }
    SCW.knackAjax({
      url: SCW.knackRecordUrl(POC_FORM, recId), type: 'PUT', data: JSON.stringify(data),
      success: function () { done(true); }, error: function () { done(false); }
    });
  }

  // Snapshot each field's saved value + add a status pill. Re-run per render
  // (Knack rebuilds the form DOM, dropping _scwPrev).
  function initFields() {
    var form = document.getElementById(POC_FORM);
    if (!form) return;
    var fields = form.querySelectorAll('.kn-input[data-input-id]');
    for (var i = 0; i < fields.length; i++) {
      var fieldEl = fields[i];
      var type = fieldType(fieldEl);
      if (!type) continue;
      fieldEl._scwPrev = valKey(readVal(fieldEl, type));
      var label = fieldEl.querySelector('.kn-label');
      if (label && !label.querySelector('.scw-cqf-status')) {
        var st = document.createElement('span');
        st.className = 'scw-cqf-status';
        st.setAttribute('aria-live', 'polite');
        label.appendChild(st);
      }
    }
  }

  // Delegated commit handlers (bound once).
  function wire() {
    if (document.documentElement.hasAttribute('data-scw-cqf-bound')) return;
    document.documentElement.setAttribute('data-scw-cqf-bound', '1');

    // Blur (tab / click-away). Skip when focus stays within the same field
    // (e.g. moving from First to Last of a name field).
    document.addEventListener('focusout', function (e) {
      var fieldEl = e.target.closest && e.target.closest('#' + POC_FORM + ' .kn-input[data-input-id]');
      if (!fieldEl) return;
      if (e.relatedTarget && fieldEl.contains(e.relatedTarget)) return;
      saveField(fieldEl);
    }, true);

    // Enter commits single-line inputs; Shift+Enter (or plain Enter in a
    // textarea) keeps the newline.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (!t.closest) return;
      var fieldEl = t.closest('#' + POC_FORM + ' .kn-input[data-input-id]');
      if (!fieldEl) return;
      if (t.tagName === 'TEXTAREA') return;   // newline in paragraph fields
      e.preventDefault();
      saveField(fieldEl);
      if (t.blur) t.blur();
    }, true);
  }

  function run() { injectCss(); initFields(); wire(); }

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    SCW.onSceneRender(SCENE, function () { setTimeout(run, 60); }, NS);
  }
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(POC_FORM, function () { setTimeout(run, 30); }, NS);
  }
  setTimeout(run, 400);
})();
/*** END CUSTOMER QUESTIONNAIRE SCENE ***/
