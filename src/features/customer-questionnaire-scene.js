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

  var SCENE     = 'scene_1347';
  var POC_FORM  = 'view_4025';     // editable POC form → per-field auto-save
  var SIGNOFF   = 'view_4029';     // final sign-off form → gated by required POC fields
  var DEELIV    = 'view_4031';     // customer deliverables grid (own module)
  var STATUS_VIEW  = 'view_4024';  // details view exposing the workflow STATUS
  // On sign-off, POST a printable snapshot + record id + submitter to Make.
  var SIGNOFF_WEBHOOK = 'https://hook.us1.make.com/sreazoatcr18tpjy2mhn9fg4qa4vqbrm';
  // @getscw.com edits are appended here (tamper audit trail). field_2937 lives
  // on view_4048, so audit reads/writes go through that view's record endpoint
  // (the view itself is hidden). The write is GUARDED on the view actually being
  // present on the scene — firing a PUT at an absent view 401/403s, which the
  // global auth interceptor turns into a false "session expired" toast.
  var AUDIT_FIELD = 'field_2937';
  var AUDIT_VIEW  = 'view_4048';
  var STATUS_FIELD = 'field_1772'; // STATUS. Editability rule:
                                   //   @getscw.com staff      → ALWAYS editable
                                   //   everyone else (customer)→ editable ONLY while
                                   //     STATUS is "Pending Customer Sign off"
                                   //     (matched loosely: "customer" + "sign off"/
                                   //     "signoff", any case); otherwise read-only.
                                   // Staff edits are appended to AUDIT_FIELD.

  // Every POC field still gets a drawn asterisk (Knack's "required" setting is
  // off so partial per-field PUTs save) — purely a visual required indicator.
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
      // Native sign-off form is replaced by the custom PM button (syncPmButton).
      '#' + SIGNOFF + ' { display: none !important; }',
      // view_4046 ("PM: Finalize Questionnaire") is hidden — we use it only as
      // the writable endpoint for the audit field (field_2937); the custom PM
      // button drives sign-off, not its native Finalize submit.
      '#' + AUDIT_VIEW + ' { display: none !important; }',
      // Custom PM sign-off button (staff-only, shown when past customer sign-off).
      S + ' .scw-cq-pm-wrap {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 20px; margin-bottom: 16px; }',
      S + ' .scw-cq-pm-title { font: 700 15px/1.35 system-ui, sans-serif; color: #0f172a; margin-bottom: 8px; }',
      S + ' .scw-cq-pm-note { font: 500 13px/1.55 system-ui, sans-serif; color: #475569; margin-bottom: 12px; }',
      S + ' .scw-cq-pm-note strong { display: block; margin-bottom: 6px; font-weight: 700; font-size: 14px;',
      '  color: #0f4c75; }',
      S + ' .scw-cq-pm-btn {',
      '  background: #0f4c75; border: 1px solid #0a3a63; color: #fff;',
      '  font: 600 13px system-ui, sans-serif; border-radius: 6px; padding: 9px 18px; cursor: pointer; }',
      S + ' .scw-cq-pm-btn:hover { background: #0a3a63; }',
      S + ' .scw-cq-pm-btn[disabled] { cursor: default; opacity: .9; }',
      S + ' .scw-cq-pm-btn.is-done { background: #15803d; border-color: #166534; }',
      S + ' .scw-cq-pm-status { margin-left: 10px; font: 600 12px system-ui, sans-serif; color: #94a3b8; }',
      S + ' .scw-cq-pm-status.is-saving { color: #2563eb; }',
      S + ' .scw-cq-pm-status.is-ok { color: #15803d; }',
      // view_4031 native table + header hidden (customer-questionnaire renders cards)
      '#view_4031 .view-header { display: none !important; }',
      // Per-field auto-save status pill
      S + ' .scw-cqf-status { margin-left: 8px; font: 600 11px/1 system-ui, sans-serif; color: #94a3b8; }',
      S + ' .scw-cqf-status.is-saving { color: #2563eb; }',
      S + ' .scw-cqf-status.is-ok { color: #15803d; }',
      S + ' .scw-cqf-status.is-err { color: #b91c1c; }',
      // Sign-off gate: highlight incomplete required POC fields + error banner.
      S + ' .kn-input.scw-cqf-missing input, ' + S + ' .kn-input.scw-cqf-missing textarea {',
      '  border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,.14) !important; background: #fff7f7 !important; }',
      S + ' .kn-input.scw-cqf-missing .kn-label { color: #b91c1c !important; }',
      S + ' #' + SIGNOFF + ' .scw-cq-signoff-error {',
      '  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px;',
      '  padding: 10px 12px; margin-bottom: 12px; font: 500 13px/1.45 system-ui, sans-serif; }',
      S + ' #' + SIGNOFF + ' .scw-cq-signoff-error b { font-weight: 700; }',
      // Section instruction blocks → calm, low-contrast slate callouts so the
      // input fields (not the guidance) are the visual focus.
      S + ' .kn-section-break .kn-description {',
      '  background: #f8fafc; border-left: 3px solid #cbd5e1; border-radius: 0 6px 6px 0;',
      '  padding: 8px 12px; margin-top: 6px;',
      '  font: 400 12px/1.5 system-ui, sans-serif; color: #64748b; }',
      S + ' .kn-section-break .kn-description b, ' + S + ' .kn-section-break .kn-description strong {',
      '  color: #475569; font-weight: 600; }',
      // "Same as System Super Admin" copy button — sits ABOVE the fields it
      // fills (its own row), not under the instructions.
      S + ' .scw-cq-copy-row { margin: 0 0 10px; }',
      S + ' .scw-cq-copy-btn {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  font: 600 12px/1 system-ui, sans-serif; color: #0f4c75; cursor: pointer;',
      '  background: #eef5fc; border: 1px solid #bcd6ef; border-radius: 6px; padding: 7px 11px;',
      '  transition: background .12s, border-color .12s; }',
      S + ' .scw-cq-copy-btn:hover { background: #dceafa; border-color: #93c5fd; }',
      S + ' .scw-cq-copy-btn.is-done { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      S + ' .scw-cq-copy-ico { font-size: 13px; line-height: 1; }',
      // ── Section layout: each kn-form-group <ul> is ONE section = the left
      //    column (title + instructions) sits beside the right column (the
      //    fields it describes) inside a single card, so the association is
      //    obvious. Flatten the form's own outer card chrome first.
      S + ' #' + POC_FORM + '.kn-form.kn-view {',
      '  background: transparent !important; border: 0 !important;',
      '  box-shadow: none !important; padding: 0 !important; }',
      S + ' #' + POC_FORM + ' .kn-form-group.columns {',
      '  display: flex !important; flex-wrap: wrap; gap: 6px 30px; margin: 0 0 16px !important;',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 18px 22px; }',
      S + ' #' + POC_FORM + ' .kn-form-col.column { padding: 0 !important; }',
      S + ' #' + POC_FORM + ' .kn-form-col.is-one-half {',
      '  flex: 1 1 calc(50% - 15px); max-width: calc(50% - 15px); min-width: 240px; }',
      // Freeform paragraph sections (no section-break) span the full card width.
      S + ' #' + POC_FORM + ' .kn-form-col:has(.kn-input-paragraph_text) {',
      '  flex: 1 1 100%; max-width: 100%; }',
      // Section title = card header (drop the old under-title divider rule).
      S + ' #' + POC_FORM + ' .kn-section-break .kn-title {',
      '  border-bottom: 0 !important; padding-bottom: 0 !important; margin: 0 0 8px !important;',
      '  font: 700 15px/1.3 system-ui, sans-serif !important; color: #0f4c75 !important; }',
      // Stack each field with breathing room inside the fields column.
      S + ' #' + POC_FORM + ' .kn-form-col .kn-input { margin-bottom: 12px; }',
      S + ' #' + POC_FORM + ' .kn-form-col .kn-input:last-child { margin-bottom: 0; }',
      // Read-only lock banner — prominent + sticky so the state is unmissable.
      S + ' .scw-cq-lock-banner {',
      '  position: sticky; top: 8px; z-index: 40;',
      '  display: flex; align-items: flex-start; gap: 12px;',
      '  background: #fef3c7; border: 1px solid #fcd34d; border-left: 5px solid #d97706;',
      '  color: #92400e; border-radius: 10px; padding: 13px 18px; margin: 0 0 18px;',
      '  box-shadow: 0 4px 14px rgba(217,119,6,.18); }',
      S + ' .scw-cq-lock-ico { flex: 0 0 auto; width: 22px; height: 22px; color: #d97706; margin-top: 1px; }',
      S + ' .scw-cq-lock-title { font: 800 15px/1.3 system-ui, sans-serif; color: #7c2d12; margin-bottom: 2px; }',
      S + ' .scw-cq-lock-sub { font: 500 13px/1.5 system-ui, sans-serif; color: #92400e; }',
      S + ' .scw-cq-lock-sub b { font-weight: 700; }',
      // Locked scene: a faint top accent rail reinforces the read-only state.
      S + '.scw-cq-locked { position: relative; }',
      // ── Locked state: strip ALL input chrome so values read as plain text,
      // not editable fields (no border / box / fill / dropdown arrow). Covers
      // the POC form, sign-off, and the deliverables cards (.scw-cq-panel is a
      // SIBLING of #view_4031, so scope to the panel).
      S + '.scw-cq-locked #' + POC_FORM + ' input, ' + S + '.scw-cq-locked #' + POC_FORM + ' textarea, ' +
        S + '.scw-cq-locked #' + SIGNOFF + ' input, ' + S + '.scw-cq-locked #' + SIGNOFF + ' textarea, ' +
        S + '.scw-cq-locked .scw-cq-panel .scw-cq-input {',
      '  pointer-events: none !important; background: transparent !important;',
      '  border: 0 !important; box-shadow: none !important;',
      '  padding-left: 0 !important; padding-right: 0 !important;',
      '  -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important;',
      '  resize: none !important; color: #1f2937 !important; }',
      // Hide the empty/unused parts: submit buttons, copy buttons, bulk bar,
      // select checkboxes, and freeze (but keep visible) the multi-select chips.
      S + '.scw-cq-locked #' + POC_FORM + ' .kn-submit, ' +
        S + '.scw-cq-locked .scw-cq-copy-row, ' +
        S + '.scw-cq-locked .scw-cq-copy-btn, ' +
        S + '.scw-cq-locked #' + SIGNOFF + ' .kn-submit, ' +
        S + '.scw-cq-locked .scw-cq-panel .scw-cq-bulkbar, ' +
        S + '.scw-cq-locked .scw-cq-panel .scw-cq-select { display: none !important; }',
      S + '.scw-cq-locked .scw-cq-panel .scw-cq-chip { pointer-events: none !important; }'
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
    var prev = fieldEl._scwPrev;            // for the staff-edit audit trail
    setStatus(fieldEl, 'saving', 'Saving…');
    var data = {}; data[key] = val;
    var done = function (ok) {
      if (!ok) { setStatus(fieldEl, 'err', 'Save failed'); return; }
      fieldEl._scwPrev = now;
      setStatus(fieldEl, 'ok', 'Saved');
      logInternalEdit(fieldEl, prev == null ? '' : prev, now);   // @getscw.com → audit
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

  /* ── Staff-edit audit trail (appended to AUDIT_FIELD on the record) ──
   * Every @getscw.com edit appends a timestamped line so we can see if a PM
   * changed the customer's answers. We seed the existing log once (GET the
   * record) so appends never clobber prior history, then keep it in memory.
   * Writes go through the POC form view — AUDIT_FIELD must be present + writable
   * on view_4025 (add it as a hidden field on that form). */
  var _auditExisting = null;   // null = not yet seeded
  var _auditBusy = false;
  var _auditPending = [];
  // Seed the existing audit log from the already-loaded form (NOT a network
  // GET — view_4046 is a form view whose record endpoint rejects GET with 401,
  // which knackAjax misreads as an expired session). The form model is
  // prefilled with the record, so read field_2937 from there / the textarea.
  function seedAudit(cb) {
    if (_auditExisting !== null) { cb(); return; }
    var val = '';
    try {
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[AUDIT_VIEW] : null;
      var a = v && v.model && (v.model.attributes || (v.model.data && v.model.data.attributes));
      if (a) {
        var raw = (a[AUDIT_FIELD + '_raw'] != null) ? a[AUDIT_FIELD + '_raw'] : a[AUDIT_FIELD];
        if (raw != null) val = String(raw).replace(/<[^>]*>/g, '').trim();
      }
    } catch (e) { /* fall through to DOM */ }
    if (!val) {
      var ta = document.querySelector('#' + AUDIT_VIEW + ' textarea[name="' + AUDIT_FIELD + '"]');
      if (ta) val = ta.value || '';
    }
    _auditExisting = val;
    cb();
  }
  function auditViewPresent() {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[AUDIT_VIEW] : null;
    return !!(v && v.model);
  }
  function pumpAudit() {
    if (_auditBusy || !_auditPending.length) return;
    var recId = recordId();
    // GUARD: never PUT at a view that isn't on this scene — a doomed request
    // 401/403s and trips the global session-expired toast. Skip silently.
    if (!recId || !AUDIT_FIELD || !auditViewPresent()) {
      _auditPending = [];
      if (window.console && window.console.warn) {
        console.warn('[scw-cq] audit skipped — ' + AUDIT_VIEW + ' not present on this scene');
      }
      return;
    }
    _auditBusy = true;
    seedAudit(function () {
      var lines = _auditPending.splice(0, _auditPending.length);
      var combined = (_auditExisting ? _auditExisting + '\n' : '') + lines.join('\n');
      var data = {}; data[AUDIT_FIELD] = combined;
      var done = function (ok) {
        if (ok) _auditExisting = combined;
        _auditBusy = false;
        if (_auditPending.length) pumpAudit();
      };
      var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[AUDIT_VIEW] : null;
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recId, data, { success: function () { done(true); }, error: function () { done(false); } });
      } else {
        SCW.knackAjax({ url: SCW.knackRecordUrl(AUDIT_VIEW, recId), type: 'PUT', data: JSON.stringify(data),
          success: function () { done(true); }, error: function () { done(false); } });
      }
    });
  }
  function logInternalEdit(fieldEl, oldVal, newVal) {
    if (!isInternal() || !AUDIT_FIELD) return;   // only staff edits are audited
    var key = fieldEl.getAttribute('data-input-id');
    var labelEl = fieldEl.querySelector('.kn-label > span');
    var label = labelEl ? labelEl.textContent.replace(/\*/g, '').trim() : key;
    var who = getSubmitter();
    _auditPending.push('[' + new Date().toISOString() + '] ' +
      (who.email || who.name || 'staff') + ' set "' + label + '" (' + key + ') to "' +
      String(newVal) + '" (was "' + String(oldVal) + '")');
    pumpAudit();
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
      if (label) {
        // Every POC field is required → draw our own asterisk (Knack's is gone
        // once the required setting is turned off). One per field.
        var firstSpan = label.querySelector(':scope > span');
        if (firstSpan && !label.querySelector('.scw-cqf-star')) {
          var star = document.createElement('span');
          star.className = 'kn-required scw-cqf-star';
          star.textContent = ' *';
          firstSpan.insertAdjacentElement('afterend', star);
        }
        if (!label.querySelector('.scw-cqf-status')) {
          var st = document.createElement('span');
          st.className = 'scw-cqf-status';
          st.setAttribute('aria-live', 'polite');
          label.appendChild(st);
        }
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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  /* ── Sign-off webhook: printable snapshot + record id + submitter → Make ── */
  function formRecordId(viewId) {
    var i = document.querySelector('#' + viewId + ' input[name="id"]');
    return i ? i.value : '';
  }
  function getSubmitter() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return {};
      var name = u.name;
      if (name && typeof name === 'object') name = ((name.first || '') + ' ' + (name.last || '')).trim();
      return { id: u.id || '', name: name || '', email: u.email || '' };
    } catch (e) { return {}; }
  }
  // ── Printable document (Make → PDF). Built fresh from the page data as a
  //    clean, branded document modeled on the Location Approval Form PDF —
  //    NOT a clone of the editable scene (which renders as ugly input boxes). ──
  var SCW_LOGO = 'https://www.getscw.com/media/logo/stores/1/logo-scw.jpeg';
  function _txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function _today() {
    var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }
  // Top "info" rows from the details view (Status, Company, Site, …).
  function collectDetails() {
    var out = [], v = document.getElementById(STATUS_VIEW);
    if (!v) return out;
    var dets = v.querySelectorAll('.kn-detail');
    for (var i = 0; i < dets.length; i++) {
      var label = _txt(dets[i].querySelector('.kn-detail-label'));
      var val = _txt(dets[i].querySelector('.kn-detail-body'));
      if (label) out.push({ label: label, value: val });
    }
    return out;
  }
  // One POC field → { label, value } (name fields collapse to "First Last").
  function fieldLabelValue(fieldEl) {
    var type = fieldType(fieldEl);
    if (!type) return null;
    var span = fieldEl.querySelector('.kn-label > span');
    var label = span ? span.textContent.replace(/\*/g, '').trim() : '';
    var val = readVal(fieldEl, type);
    if (type === 'name') val = ((val.first || '') + ' ' + (val.last || '')).trim();
    return { label: label, value: String(val == null ? '' : val).trim() };
  }
  // Deliverables answers, one block per device card.
  function collectDeliverables() {
    var out = [];
    var cards = document.querySelectorAll('#kn-' + SCENE + ' .scw-cq-panel .scw-cq-card');
    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      var fields = [];
      var fEls = card.querySelectorAll('.scw-cq-field');
      for (var f = 0; f < fEls.length; f++) {
        var lab = fEls[f].querySelector('.scw-cq-label');
        var label = lab ? lab.textContent.replace(/\*/g, '').trim() : '';
        var val = '';
        var chips = fEls[f].querySelector('.scw-cq-chips');
        if (chips) {
          val = Array.prototype.map.call(chips.querySelectorAll('.scw-cq-chip.is-on'),
            function (b) { return b.textContent.trim(); }).join(', ');
        } else {
          var inp = fEls[f].querySelector('.scw-cq-input');
          val = inp ? (inp.value || '') : '';
        }
        fields.push({ label: label, value: val });
      }
      out.push({
        title: _txt(card.querySelector('.scw-cq-card-title')),
        sub:   _txt(card.querySelector('.scw-cq-card-sub')),
        fields: fields
      });
    }
    return out;
  }
  function _infoVal(details, re) {
    for (var i = 0; i < details.length; i++) if (re.test(details[i].label)) return details[i].value;
    return '';
  }
  function _row(label, value) {
    return '<div class="q-field"><div class="q-k">' + esc(label) + '</div>' +
      '<div class="q-v">' + (value ? esc(value) : '<span class="q-empty">—</span>') + '</div></div>';
  }
  function _printCss() {
    return [
      '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap");',
      '@page{size:letter;margin:16mm 14mm;@bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:"Inter",sans-serif;font-size:9px;color:#94a3b8;}}',
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif;color:#1f2937;font-size:12px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '.q-header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #07467c;padding-bottom:14px;margin-bottom:18px;}',
      '.q-logo img{max-height:54px;max-width:220px;display:block;}',
      '.q-head-right{text-align:right;}',
      '.q-title{font-size:20px;font-weight:800;color:#07467c;margin:0 0 4px;}',
      '.q-meta{font-size:11px;color:#64748b;}.q-meta b{color:#334155;}',
      '.q-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;}',
      '.q-info-item{font-size:12px;}',
      '.q-info-label{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;margin-bottom:1px;}',
      '.q-info-value{color:#1f2937;font-weight:600;}',
      '.q-section{margin-bottom:18px;page-break-inside:avoid;break-inside:avoid;}',
      '.q-section-title{font-size:13px;font-weight:800;color:#07467c;background:#eef4fa;border-left:4px solid #07467c;padding:7px 12px;border-radius:4px;margin:0 0 10px;}',
      '.q-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 24px;}',
      '.q-field{font-size:11.5px;}',
      '.q-k{color:#94a3b8;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.05em;margin-bottom:1px;}',
      '.q-v{color:#334155;font-weight:600;white-space:pre-wrap;}',
      '.q-empty{color:#cbd5e1;font-weight:400;}',
      '.q-device{border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;margin-bottom:10px;page-break-inside:avoid;break-inside:avoid;}',
      '.q-device-head{font-size:13px;font-weight:800;color:#07467c;margin-bottom:8px;}',
      '.q-device-head .sub{font-weight:500;color:#64748b;font-size:11px;}',
      '.q-sign{margin-top:8px;display:flex;align-items:flex-end;gap:24px;border-top:2px solid #07467c;padding-top:14px;page-break-inside:avoid;}',
      '.q-sign img{max-height:70px;max-width:280px;}',
      '.q-sign-cap{font-size:10px;color:#64748b;}'
    ].join('');
  }
  function buildPrintableHtml() {
    var details = collectDetails();
    // ── Info grid (skip the workflow STATUS row — internal). ──
    var infoHtml = '';
    for (var i = 0; i < details.length; i++) {
      if (/^status$/i.test(details[i].label)) continue;
      infoHtml += '<div class="q-info-item"><div class="q-info-label">' + esc(details[i].label) +
        '</div><div class="q-info-value">' + (details[i].value ? esc(details[i].value) : '—') + '</div></div>';
    }

    // ── POC sections (title + label/value rows). ──
    var body = '';
    var sections = (typeof buildSections === 'function') ? buildSections() : [];
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var rows = '';
      for (var fi = 0; fi < sec.fields.length; fi++) {
        var lv = fieldLabelValue(sec.fields[fi]);
        if (lv) rows += _row(lv.label, lv.value);
      }
      if (!rows) continue;
      var title = sec.title || 'Details';
      body += '<div class="q-section"><div class="q-section-title">' + esc(title) +
        '</div><div class="q-fields">' + rows + '</div></div>';
    }

    // ── Deliverables (per-device answers). ──
    var devs = collectDeliverables();
    if (devs.length) {
      var devHtml = '';
      for (var d = 0; d < devs.length; d++) {
        var dv = devs[d];
        var drows = '';
        for (var df = 0; df < dv.fields.length; df++) drows += _row(dv.fields[df].label, dv.fields[df].value);
        devHtml += '<div class="q-device"><div class="q-device-head">' + esc(dv.title) +
          (dv.sub ? ' <span class="sub">— ' + esc(dv.sub) + '</span>' : '') + '</div>' +
          '<div class="q-fields">' + drows + '</div></div>';
      }
      body += '<div class="q-section"><div class="q-section-title">Device Configuration</div>' +
        devHtml + '</div>';
    }

    // ── Signature block (view_4047), if present. ──
    var sig = document.querySelector('#view_4047 .field_1776 img');
    var sigDate = _txt(document.querySelector('#view_4047 .field_1782 .kn-detail-body'));
    if (sig) {
      body += '<div class="q-sign"><div><img src="' + esc(sig.getAttribute('src') || '') + '">' +
        '<div class="q-sign-cap">Customer signature</div></div>' +
        (sigDate ? '<div><div style="font-weight:700;color:#334155;">' + esc(sigDate) +
          '</div><div class="q-sign-cap">Date signed</div></div>' : '') + '</div>';
    }

    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<title>System Setup Questionnaire</title><style>' + _printCss() + '</style></head><body>' +
        '<div class="q-header">' +
          '<div class="q-logo"><img src="' + SCW_LOGO + '" alt="SCW"></div>' +
          '<div class="q-head-right"><div class="q-title">System Setup Questionnaire</div>' +
            '<div class="q-meta"><b>Date:</b> ' + _today() + '</div></div>' +
        '</div>' +
        '<div class="q-info">' + infoHtml + '</div>' +
        body +
      '</body></html>';
  }
  // Fire-and-(briefly-)wait POST. Calls done() on completion OR an 8s timeout
  // so the sign-off is never blocked by a slow/failing webhook.
  function sendSignoffWebhook(done) {
    var payload = {
      event:         'customer-questionnaire-signoff',
      recordId:      formRecordId(POC_FORM) || formRecordId(SIGNOFF),
      signoffRecordId: formRecordId(SIGNOFF),
      sceneId:       SCENE,
      pageUrl:       location.href,
      status:        readStatus(),
      submittedAt:   new Date().toISOString(),
      submittedBy:   getSubmitter(),
      printableHtml: buildPrintableHtml()
    };
    var finished = false;
    function fin() { if (finished) return; finished = true; if (done) done(); }
    try {
      $.ajax({
        url: SIGNOFF_WEBHOOK, type: 'POST', contentType: 'application/json',
        data: JSON.stringify(payload), crossDomain: true, timeout: 30000
      }).always(function () { fin(); });
    } catch (e) { fin(); }
    setTimeout(fin, 8000);   // hard cap — release the submit regardless
  }

  var _pmSending = false;   // in-flight guard for the PM sign-off button

  // PM sign-off: the native form (view_4029) is hidden; instead we show a
  // custom button — ONLY for @getscw.com staff AND only once the record is
  // PAST "Pending Customer Sign off". Clicking it fires the Make webhook with
  // the printable snapshot + record + who, then confirms. Make owns whatever
  // happens next (status change / PDF). Re-runnable: rebuilt on every render.
  var PM_BTN_ID = 'scw-cq-pm-signoff';
  function syncPmButton() {
    var show = isInternal() && !statusIsCustomerSignoff();
    var existing = document.getElementById(PM_BTN_ID);
    if (!show) { if (existing && existing.parentNode) existing.parentNode.removeChild(existing); return; }
    if (existing) return;   // already mounted

    // Mount where the (now hidden) sign-off form sat, else at the scene end.
    var host = document.getElementById(SIGNOFF) || document.getElementById('kn-' + SCENE);
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.id = PM_BTN_ID;
    wrap.className = 'scw-cq-pm-wrap';
    wrap.innerHTML =
      '<div class="scw-cq-pm-title">Click below when you’re ready to finalize the Questionnaire.</div>' +
      '<div class="scw-cq-pm-note">' +
        '<strong>Review the customer’s answers below and submit your sign-off to finalize.</strong> ' +
        'This will trigger submission of the questionnaire to our install partners and an update ' +
        'to be sent to all POC’s referenced in the questionnaire. Any edits you made are recorded ' +
        'on the audit trail.</div>' +
      '<button type="button" class="scw-cq-pm-btn">Submit Sign-Off</button>' +
      '<span class="scw-cq-pm-status" aria-live="polite"></span>';
    if (host.id === SIGNOFF) host.parentNode.insertBefore(wrap, host.nextSibling);
    else host.appendChild(wrap);

    var btn = wrap.querySelector('.scw-cq-pm-btn');
    var status = wrap.querySelector('.scw-cq-pm-status');
    btn.addEventListener('click', function () {
      if (_pmSending) return;
      _pmSending = true;
      btn.disabled = true;
      var orig = btn.textContent;
      btn.textContent = 'Submitting…';
      status.className = 'scw-cq-pm-status is-saving';
      status.textContent = '';
      sendSignoffWebhook(function () {
        _pmSending = false;
        btn.textContent = '✓ Submitted';
        btn.classList.add('is-done');
        status.className = 'scw-cq-pm-status is-ok';
        status.textContent = 'Sign-off sent.';
        // Leave it disabled — the record is being finalized by Make.
      });
    });
  }

  /* ── Read-only gate: editable only while STATUS is "Pending Customer Sign off" ── */
  function readStatus() {
    try {
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[STATUS_VIEW] : null;
      var a = v && v.model && (v.model.attributes || (v.model.data && v.model.data.attributes));
      if (a) {
        var raw = (a[STATUS_FIELD + '_raw'] != null) ? a[STATUS_FIELD + '_raw'] : a[STATUS_FIELD];
        if (raw != null && raw !== '') return String(raw).replace(/<[^>]*>/g, '').trim();
      }
    } catch (e) { /* fall through to DOM */ }
    var cell = document.querySelector('#' + STATUS_VIEW + ' .' + STATUS_FIELD + ' .kn-detail-body');
    return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function isInternal() {
    return !!(window.SCW && typeof SCW.isInternalUser === 'function' && SCW.isInternalUser());
  }
  function statusIsCustomerSignoff() {
    var s = readStatus().toLowerCase();
    return /customer/.test(s) && /sign\s*off/.test(s);
  }
  // Editable for @getscw.com staff ALWAYS; for everyone else only while the
  // record is "Pending Customer Sign off". Otherwise the page is read-only.
  function isEditable() {
    return isInternal() || statusIsCustomerSignoff();
  }
  function toggleLockBanner(locked, status) {
    var scene = document.getElementById('kn-' + SCENE);
    var existing = document.getElementById('scw-cq-lock-banner');
    if (!locked) { if (existing && existing.parentNode) existing.parentNode.removeChild(existing); return; }
    if (!scene) return;
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'scw-cq-lock-banner';
      existing.className = 'scw-cq-lock-banner';
    }
    // Keep it pinned as the scene's first element so it's the first thing seen.
    if (scene.firstChild !== existing) scene.insertBefore(existing, scene.firstChild);
    existing.innerHTML =
      '<svg class="scw-cq-lock-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>' +
        '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
      '<div>' +
        '<div class="scw-cq-lock-title">This questionnaire is read-only</div>' +
        '<div class="scw-cq-lock-sub">Client sign-off received on the Questionnaire. ' +
          'Contact your SCW representative if changes are needed.</div>' +
      '</div>';
  }
  function applyLock() {
    var status = readStatus();
    var locked = !isEditable();
    var scene = document.getElementById('kn-' + SCENE);
    if (scene) scene.classList.toggle('scw-cq-locked', locked);
    // readOnly on the text controls across the POC form, sign-off, AND the
    // deliverables cards so the keyboard can't edit either (CSS pointer-events
    // only stops the mouse). White bg via CSS keeps them fully readable per the
    // repo's locked-field convention. The deliverables cards render in a
    // .scw-cq-panel SIBLING of #view_4031, so target that, not the view.
    var lockRoots = [document.getElementById(POC_FORM), document.getElementById(SIGNOFF)];
    var panels = scene ? scene.querySelectorAll('.scw-cq-panel') : [];
    for (var p = 0; p < panels.length; p++) lockRoots.push(panels[p]);
    lockRoots.forEach(function (root) {
      if (!root) return;
      var inps = root.querySelectorAll('input, textarea');
      for (var i = 0; i < inps.length; i++) inps[i].readOnly = locked;
    });
    toggleLockBanner(locked, status);
  }

  /* ── Copy POC answers from "System Super Admin" down to the two POC sections ── */
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Group the form into sections keyed off the section-break titles, each with
  // its ordered list of editable fields. Document order: a section's fields
  // follow its break and precede the next break.
  function buildSections() {
    var form = document.getElementById(POC_FORM);
    if (!form) return [];
    var nodes = form.querySelectorAll('.kn-section-break, .kn-input[data-input-id]');
    var sections = [], cur = null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.classList.contains('kn-section-break')) {
        var t = n.querySelector('.kn-title');
        cur = { title: t ? t.textContent.trim() : '', breakEl: n, fields: [] };
        sections.push(cur);
      } else if (fieldType(n)) {
        if (!cur) { cur = { title: '', breakEl: null, fields: [] }; sections.push(cur); }
        cur.fields.push(n);
      }
    }
    return sections;
  }
  function fieldOfType(section, type) {
    for (var i = 0; i < section.fields.length; i++) {
      if (fieldType(section.fields[i]) === type) return section.fields[i];
    }
    return null;
  }
  function copySection(src, dst) {
    var moved = false;
    var sn = fieldOfType(src, 'name'), dn = fieldOfType(dst, 'name');
    if (sn && dn) {
      var nv = readVal(sn, 'name');
      var df = dn.querySelector('input[name="first"]'), dl = dn.querySelector('input[name="last"]');
      if (df) { df.value = nv.first || ''; fireInput(df); }
      if (dl) { dl.value = nv.last || ''; fireInput(dl); }
      saveField(dn); moved = true;
    }
    var se = fieldOfType(src, 'email'), de = fieldOfType(dst, 'email');
    if (se && de) {
      var ev = readVal(se, 'email');
      var ei = de.querySelector('input, textarea');
      if (ei) { ei.value = ev == null ? '' : ev; fireInput(ei); }
      saveField(de); moved = true;
    }
    return moved;
  }
  function addCopyButtons() {
    if (!isEditable()) return;   // locked → no copy affordance
    var sections = buildSections();
    var src = null;
    for (var i = 0; i < sections.length; i++) {
      if (/super\s*admin/i.test(sections[i].title)) { src = sections[i]; break; }
    }
    if (!src) return;
    sections.forEach(function (s) {
      if (s === src || !s.breakEl) return;
      if (!(/location\s*approval/i.test(s.title) || /view\s*approval/i.test(s.title))) return;
      // Mount it WITH the fields it fills (above the first input), not under the
      // instructions where it reads as unrelated.
      var firstField = s.fields[0];
      if (!firstField || !firstField.parentNode) return;
      if (firstField.parentNode.querySelector('.scw-cq-copy-row')) return;   // already added
      if (!fieldOfType(s, 'name') && !fieldOfType(s, 'email')) return;
      var row = document.createElement('div');
      row.className = 'scw-cq-copy-row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-cq-copy-btn';
      btn.innerHTML = '<span class="scw-cq-copy-ico">⧉</span> Same as System Super Admin';
      btn.addEventListener('click', function () {
        if (copySection(src, s)) {
          btn.classList.add('is-done');
          var orig = btn.innerHTML;
          btn.innerHTML = '✓ Copied';
          setTimeout(function () { btn.innerHTML = orig; btn.classList.remove('is-done'); }, 1600);
        }
      });
      row.appendChild(btn);
      firstField.parentNode.insertBefore(row, firstField);
    });
  }

  function run() {
    injectCss(); initFields(); wire();
    applyLock(); addCopyButtons(); syncPmButton();
  }

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    SCW.onSceneRender(SCENE, function () { setTimeout(run, 60); }, NS);
  }
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(POC_FORM, function () { setTimeout(run, 30); }, NS);
    // Status view may render after the form — re-apply the lock when it does.
    SCW.onViewRender(STATUS_VIEW, function () { setTimeout(applyLock, 30); }, NS);
    // Deliverables grid (view_4031) rebuilds its own cards — re-apply readOnly.
    SCW.onViewRender(DEELIV, function () { setTimeout(applyLock, 60); }, NS);
  }
  setTimeout(run, 400);
})();
/*** END CUSTOMER QUESTIONNAIRE SCENE ***/
