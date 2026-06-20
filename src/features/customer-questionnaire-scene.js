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
  var STATUS_FIELD = 'field_1772'; // STATUS — page is editable ONLY while this is
                                   // "Pending Customer Sign off"; any other status
                                   // (e.g. "PENDING PROJECT MANAGER SIGNOFF") → all
                                   // fields read-only. Matched loosely (contains
                                   // "customer" + "sign off"/"signoff", any case).

  // EVERY POC field is required before the customer can sign off. With Knack's
  // "required" setting turned OFF (so partial per-field PUTs save), this is the
  // client-side gate — derived dynamically from the form's fields (pocFields),
  // and we draw the asterisks ourselves since Knack's are gone.
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
      S + ' .scw-cqf-status.is-err { color: #b91c1c; }',
      // Sign-off gate: highlight incomplete required POC fields + error banner.
      S + ' .kn-input.scw-cqf-missing input, ' + S + ' .kn-input.scw-cqf-missing textarea {',
      '  border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,.14) !important; background: #fff7f7 !important; }',
      S + ' .kn-input.scw-cqf-missing .kn-label { color: #b91c1c !important; }',
      S + ' #' + SIGNOFF + ' .scw-cq-signoff-error {',
      '  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px;',
      '  padding: 10px 12px; margin-bottom: 12px; font: 500 13px/1.45 system-ui, sans-serif; }',
      S + ' #' + SIGNOFF + ' .scw-cq-signoff-error b { font-weight: 700; }',
      // Section instruction blocks → soft blue callouts for a cleaner read.
      S + ' .kn-section-break .kn-description {',
      '  background: #f0f6ff; border-left: 3px solid #3b82f6; border-radius: 0 6px 6px 0;',
      '  padding: 9px 12px; margin-top: 6px; }',
      // "Same as System Super Admin" copy button (sits in the POC section heads).
      S + ' .scw-cq-copy-btn {',
      '  display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;',
      '  font: 600 12px/1 system-ui, sans-serif; color: #0f4c75; cursor: pointer;',
      '  background: #eef5fc; border: 1px solid #bcd6ef; border-radius: 6px; padding: 7px 11px;',
      '  transition: background .12s, border-color .12s; }',
      S + ' .scw-cq-copy-btn:hover { background: #dceafa; border-color: #93c5fd; }',
      S + ' .scw-cq-copy-btn.is-done { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      S + ' .scw-cq-copy-ico { font-size: 13px; line-height: 1; }',
      // Read-only lock banner.
      S + ' .scw-cq-lock-banner {',
      '  background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px;',
      '  padding: 10px 13px; margin-bottom: 14px; font: 500 13px/1.45 system-ui, sans-serif; }',
      S + ' .scw-cq-lock-banner b { font-weight: 700; }',
      // ── Locked state (status ≠ Pending Customer Sign off): read-only, no graying.
      // White bg + pointer-events:none per the repo's locked-field convention.
      S + '.scw-cq-locked #' + POC_FORM + ' input, ' + S + '.scw-cq-locked #' + POC_FORM + ' textarea, ' +
        S + '.scw-cq-locked #' + SIGNOFF + ' input, ' + S + '.scw-cq-locked #' + SIGNOFF + ' textarea {',
      '  pointer-events: none !important; background: #fff !important; }',
      S + '.scw-cq-locked #' + POC_FORM + ' .kn-submit, ' +
        S + '.scw-cq-locked .scw-cq-copy-btn, ' +
        S + '.scw-cq-locked #' + SIGNOFF + ' .kn-submit { display: none !important; }',
      // Deliverables grid controls (own module) lock too.
      S + '.scw-cq-locked #' + DEELIV + ' .scw-deliverables-input, ' +
        S + '.scw-cq-locked #' + DEELIV + ' .scw-deliverables-chip {',
      '  pointer-events: none !important; background: #fff !important; }'
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

  /* ── Sign-off gate: block view_4029 submit until required POC fields filled ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function fieldFilled(key) {
    var fieldEl = document.querySelector('#' + POC_FORM + ' .kn-input[data-input-id="' + key + '"]');
    if (!fieldEl) return true;   // field not on the form → don't block
    var type = fieldType(fieldEl);
    var val = readVal(fieldEl, type);
    if (type === 'name') return !!((val.first && val.first.trim()) || (val.last && val.last.trim()));
    return !!String(val == null ? '' : val).trim();
  }
  // Every editable POC field, as { key, label }. Label read from the field's
  // own <label> (asterisk stripped).
  function pocFields() {
    var form = document.getElementById(POC_FORM);
    if (!form) return [];
    var out = [];
    var els = form.querySelectorAll('.kn-input[data-input-id]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-input-id');
      if (!key || !fieldType(el)) continue;
      var span = el.querySelector('.kn-label > span');
      var label = span ? span.textContent.replace(/\*/g, '').trim() : key;
      out.push({ key: key, label: label });
    }
    return out;
  }
  function requiredMissing() {
    var req = pocFields();
    var out = [];
    for (var i = 0; i < req.length; i++) if (!fieldFilled(req[i].key)) out.push(req[i]);
    return out;
  }
  function clearMissingHighlights() {
    var els = document.querySelectorAll('#' + POC_FORM + ' .scw-cqf-missing');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('scw-cqf-missing');
  }
  function clearSignoffError() {
    var err = document.querySelector('#' + SIGNOFF + ' .scw-cq-signoff-error');
    if (err && err.parentNode) err.parentNode.removeChild(err);
  }
  function showSignoffError(missing) {
    clearMissingHighlights();
    var first = null;
    for (var i = 0; i < missing.length; i++) {
      var fieldEl = document.querySelector('#' + POC_FORM + ' .kn-input[data-input-id="' + missing[i].key + '"]');
      if (fieldEl) { fieldEl.classList.add('scw-cqf-missing'); if (!first) first = fieldEl; }
    }
    var form = document.querySelector('#' + SIGNOFF + ' form');
    if (form) {
      var err = form.querySelector('.scw-cq-signoff-error');
      if (!err) {
        err = document.createElement('div');
        err.className = 'scw-cq-signoff-error';
        form.insertBefore(err, form.firstChild);
      }
      err.innerHTML = 'Please complete these required fields above before signing off: <b>' +
        missing.map(function (m) { return esc(m.label); }).join(', ') + '</b>';
    }
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  // Copy live input values into the cloned scene — input values live in the
  // DOM .value, not the serialized HTML, so a raw clone would print blank
  // fields. Clone is a deep copy so the node order matches the live tree.
  function syncValuesIntoClone(live, clone) {
    var L = live.querySelectorAll('input, textarea, select');
    var C = clone.querySelectorAll('input, textarea, select');
    for (var i = 0; i < L.length && i < C.length; i++) {
      var l = L[i], c = C[i];
      if (l.tagName === 'SELECT') {
        var opts = c.querySelectorAll('option');
        for (var j = 0; j < opts.length; j++) {
          if (j === l.selectedIndex) opts[j].setAttribute('selected', 'selected');
          else opts[j].removeAttribute('selected');
        }
      } else if (l.type === 'checkbox' || l.type === 'radio') {
        if (l.checked) c.setAttribute('checked', 'checked'); else c.removeAttribute('checked');
      } else if (l.tagName === 'TEXTAREA') {
        c.textContent = l.value;
      } else {
        c.setAttribute('value', l.value);
      }
    }
  }
  // Self-contained printable HTML of the scene as the customer sees it.
  function buildPrintableHtml() {
    var scene = document.getElementById('kn-' + SCENE);
    if (!scene) return '';
    var clone = scene.cloneNode(true);
    syncValuesIntoClone(scene, clone);
    // Strip page chrome / interactive-only bits that don't belong in a record.
    var drop = clone.querySelectorAll(
      'script, .scw-cqf-status, .scw-cq-copy-btn, .kn-submit, .kn-records-nav, ' +
      '.scw-cq-lock-banner, .scw-cq-signoff-error, .kn-add-filter, .kn-filters-nav');
    for (var i = 0; i < drop.length; i++) if (drop[i].parentNode) drop[i].parentNode.removeChild(drop[i]);
    var css = '';
    var st = document.getElementById(STYLE_ID);
    if (st) css = st.textContent || '';
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>System Setup Questionnaire</title><style>' +
      'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;margin:24px;background:#fff;}' +
      css +
      '</style></head><body>' + clone.innerHTML + '</body></html>';
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

  var _signoffAuthorized = false;   // our webhook done → let Knack's submit run
  var _signoffSending = false;      // in-flight guard

  function wireSignoffGate() {
    if (document.documentElement.hasAttribute('data-scw-cq-signoff-bound')) return;
    document.documentElement.setAttribute('data-scw-cq-signoff-bound', '1');
    function gate(e) {
      var inForm = e.target.closest && e.target.closest('#' + SIGNOFF + ' form');
      var onBtn = e.target.closest && e.target.closest('#' + SIGNOFF + ' .kn-submit button, #' + SIGNOFF + ' button[type="submit"]');
      if (!inForm && !onBtn) return;
      // Our webhook already fired → this is the re-triggered submit; let Knack run.
      if (_signoffAuthorized) return;

      function block() {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }

      // Page locked (status ≠ Pending Customer Sign off) → never submit.
      if (!isEditable()) { block(); return; }

      // Required POC fields incomplete → block + highlight.
      var missing = requiredMissing();
      if (missing.length) { block(); showSignoffError(missing); return; }

      // Passed validation: hold the submit, POST the snapshot to Make, then
      // re-trigger the button so Knack does its native sign-off save + redirect.
      block();
      if (_signoffSending) return;
      _signoffSending = true;
      var btn = document.querySelector('#' + SIGNOFF + ' .kn-submit button, #' + SIGNOFF + ' button[type="submit"]');
      if (btn) { btn.setAttribute('data-scw-orig', btn.textContent); btn.textContent = 'Submitting…'; }
      sendSignoffWebhook(function () {
        _signoffAuthorized = true;
        _signoffSending = false;
        if (btn && btn.getAttribute('data-scw-orig')) btn.textContent = btn.getAttribute('data-scw-orig');
        var b2 = document.querySelector('#' + SIGNOFF + ' .kn-submit button, #' + SIGNOFF + ' button[type="submit"]');
        if (b2) b2.click(); else if (inForm && inForm.submit) inForm.submit();
        // Safety: if the redirect doesn't happen, let a later retry re-fire.
        setTimeout(function () { _signoffAuthorized = false; }, 5000);
      });
    }
    document.addEventListener('submit', gate, true);   // primary block (capture, before Knack)
    document.addEventListener('click', gate, true);    // backup if Knack binds the button click
    // Clear a field's red state as soon as the user fills it; drop the banner
    // once nothing's missing.
    document.addEventListener('input', function (e) {
      var fieldEl = e.target.closest && e.target.closest('#' + POC_FORM + ' .scw-cqf-missing');
      if (fieldEl) fieldEl.classList.remove('scw-cqf-missing');
      if (!requiredMissing().length) clearSignoffError();
    }, true);
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
  function isEditable() {
    var s = readStatus().toLowerCase();
    return /customer/.test(s) && /sign\s*off/.test(s);
  }
  function toggleLockBanner(locked, status) {
    var form = document.getElementById(POC_FORM);
    var existing = document.getElementById('scw-cq-lock-banner');
    if (!locked) { if (existing && existing.parentNode) existing.parentNode.removeChild(existing); return; }
    if (!form) return;
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'scw-cq-lock-banner';
      existing.className = 'scw-cq-lock-banner';
      form.insertBefore(existing, form.firstChild);
    }
    existing.innerHTML = 'This questionnaire is <b>read-only</b> — it isn’t currently awaiting ' +
      'customer sign-off' + (status ? ' (status: <b>' + esc(status) + '</b>)' : '') +
      '. Contact your SCW representative if changes are needed.';
  }
  function applyLock() {
    var status = readStatus();
    var locked = !isEditable();
    var scene = document.getElementById('kn-' + SCENE);
    if (scene) scene.classList.toggle('scw-cq-locked', locked);
    // readOnly on the POC + sign-off text controls so the keyboard can't edit
    // either (CSS pointer-events only stops the mouse). White bg via CSS keeps
    // them fully readable per the repo's locked-field convention.
    [POC_FORM, SIGNOFF].forEach(function (vid) {
      var v = document.getElementById(vid);
      if (!v) return;
      var inps = v.querySelectorAll('input, textarea');
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
      if (s.breakEl.querySelector('.scw-cq-copy-btn')) return;   // already added
      if (!fieldOfType(s, 'name') && !fieldOfType(s, 'email')) return;
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
      s.breakEl.appendChild(btn);
    });
  }

  function run() {
    injectCss(); initFields(); wire(); wireSignoffGate();
    applyLock(); addCopyButtons();
  }

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    SCW.onSceneRender(SCENE, function () { setTimeout(run, 60); }, NS);
  }
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(POC_FORM, function () { setTimeout(run, 30); }, NS);
    // Status view may render after the form — re-apply the lock when it does.
    SCW.onViewRender(STATUS_VIEW, function () { setTimeout(applyLock, 30); }, NS);
  }
  setTimeout(run, 400);
})();
/*** END CUSTOMER QUESTIONNAIRE SCENE ***/
