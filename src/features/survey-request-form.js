/*** SURVEY REQUEST FORM (custom) — DORMANT until wired in ******************
 *
 * Replacement for the view_3853 Knack form (Request Site Survey). The
 * copied Knack form never executes its page connection on create (records
 * arrive with REL_scope of work blank), and the sales team re-types the
 * same contacts every time. This form:
 *
 *   • asks the SAME questions as view_3853 (POC / authorized / badging /
 *     PPE / details / notes) with the same show-details logic,
 *   • presents CONTACT PICKERS fed from the hidden view_4156 CORE_contacts
 *     grid — one for the Installation Agreement contact, one for the
 *     Billing / AP contact — each with an "Add a new contact" option that
 *     swaps to manual first/last/email/phone entry,
 *   • submits EVERYTHING to a Make webhook
 *     (SCW.CONFIG.MAKE_SURVEY_REQUEST_FORM_WEBHOOK — see the payload
 *     contract next to the key in config.js). MAKE creates the
 *     SOW_OPS_site survey request record, connects it to the SOW +
 *     project, resolves/creates the contact records, and drops it in the
 *     correct status (Pending Validation vs fire-now per the validated
 *     flag — docs/project-stage-workflow.md branch table). No Knack form
 *     insert = no broken page connection.
 *
 * ── DORMANT ──────────────────────────────────────────────────────────
 * CONFIG.enabled is false: nothing is injected into the page and no
 * button opens this. The module only registers the API. To preview:
 *
 *     SCW.surveyRequestForm.open()        // from the console, scene_1116
 *
 * Wiring it in later = flip CONFIG.enabled and bind open() wherever the
 * survey step should launch it (workflow-stepper's view_3853 slot), then
 * point the step away from the Knack form. view_4156 is hidden via
 * hide-data-source-views.js in the meantime.
 *
 * ── TBDs for the wiring pass ─────────────────────────────────────────
 *   • MAKE_SURVEY_REQUEST_FORM_WEBHOOK is a PLACEHOLDER — build the Make
 *     scenario and fill the URL.
 *   • CONFIG.contactFields: field keys for view_4156's name/email/phone
 *     columns. Left null = auto-detect from the rendered DOM (mailto/tel
 *     anchors + first text cell), which works on any column layout but
 *     is worth pinning once the view's columns are final.
 *   • CONFIG.requireBilling: billing/AP contact currently optional.
 */
(function () {
  'use strict';

  var CONFIG = {
    enabled: false,               // master switch — keep false until wired in
    contactsView: 'view_4156',    // hidden CORE_contacts grid, scene_1116
    // view_4156 column keys (null = auto-detect from DOM). If the model
    // read is preferred once keys are known: name may be a person field
    // (object with .first/.last) — readContactField handles both.
    contactFields: { name: null, email: null, phone: null },
    // SOW context sources, tried in order (model first, DOM fallback).
    sowViews: ['view_3827', 'view_3491'],
    sowFields: {
      name:      'field_2126',    // SOW Name
      project:   'field_2119',    // REL project connection
      company:   'field_6',       // REL company connection
      validated: 'field_2723',    // FLAG_ready for survey
      requested: 'field_2706'     // FLAG_survey requested
    },
    webhookKey:     'MAKE_SURVEY_REQUEST_FORM_WEBHOOK',
    requireBilling: false,        // flip true to make Billing/AP mandatory
    debug:          !!(window.SCW && window.SCW.DEBUG)
  };

  var STYLE_ID = 'scw-srqf-css';
  var OVERLAY_ID = 'scw-srqf-overlay';
  var P = 'scw-srqf';   // class prefix

  // ── Styles (injected on first open — zero footprint while dormant) ──
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + OVERLAY_ID + ' {' +
      '  position: fixed; inset: 0; z-index: 10050;' +
      '  background: rgba(15, 23, 42, 0.45);' +
      '  display: flex; align-items: flex-start; justify-content: center;' +
      '  overflow-y: auto; padding: 4vh 16px;' +
      '}' +
      '.' + P + ' {' +
      '  background: #fff; border-radius: 12px; width: 560px; max-width: 96vw;' +
      '  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);' +
      '  font-size: 13px; color: #334155; margin-bottom: 6vh;' +
      '}' +
      '.' + P + '__hd {' +
      '  padding: 16px 20px 12px; border-bottom: 1px solid #e5e7eb;' +
      '}' +
      '.' + P + '__title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0; }' +
      '.' + P + '__sow { font-size: 12px; color: #64748b; margin-top: 3px; }' +
      '.' + P + '__body { padding: 14px 20px 6px; }' +
      '.' + P + '__sec {' +
      '  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;' +
      '  text-transform: uppercase; color: #64748b; margin: 14px 0 6px;' +
      '}' +
      '.' + P + '__sec:first-child { margin-top: 0; }' +
      '.' + P + '__label { display: block; font-weight: 600; color: #0f172a; margin: 10px 0 4px; }' +
      '.' + P + '__req { color: #be123c; margin-left: 2px; }' +
      '.' + P + ' select, .' + P + ' input[type="text"], .' + P + ' input[type="email"],' +
      '.' + P + ' input[type="tel"], .' + P + ' textarea {' +
      '  width: 100%; box-sizing: border-box; padding: 7px 10px;' +
      '  border: 1px solid #cbd5e1; border-radius: 7px; font-size: 13px;' +
      '  color: #0f172a; background: #fff;' +
      '}' +
      '.' + P + ' textarea { min-height: 64px; resize: vertical; }' +
      '.' + P + '__new {' +
      '  margin-top: 8px; padding: 10px 12px; border: 1px dashed #cbd5e1;' +
      '  border-radius: 9px; background: #f8fafc;' +
      '}' +
      '.' + P + '__grid2 { display: flex; gap: 8px; }' +
      '.' + P + '__grid2 > * { flex: 1 1 0; }' +
      '.' + P + '__radios { display: flex; gap: 16px; margin-top: 2px; }' +
      '.' + P + '__radios label {' +
      '  display: inline-flex; align-items: center; gap: 5px; font-weight: 500;' +
      '  color: #334155; cursor: pointer;' +
      '}' +
      '.' + P + '__err {' +
      '  display: none; margin: 10px 0 0; padding: 8px 12px; border-radius: 8px;' +
      '  background: #fef2f2; color: #be123c; font-weight: 600; font-size: 12.5px;' +
      '}' +
      '.' + P + '__ok {' +
      '  display: none; margin: 10px 0 0; padding: 8px 12px; border-radius: 8px;' +
      '  background: #d1fae5; color: #047857; font-weight: 600; font-size: 12.5px;' +
      '}' +
      '.' + P + '__ft {' +
      '  display: flex; justify-content: flex-end; gap: 10px;' +
      '  padding: 12px 20px 16px; border-top: 1px solid #f1f5f9; margin-top: 12px;' +
      '}' +
      '.' + P + '__btn {' +
      '  border: 0; border-radius: 8px; padding: 9px 16px; font-size: 13px;' +
      '  font-weight: 700; cursor: pointer;' +
      '}' +
      '.' + P + '__btn--cancel { background: #f1f5f9; color: #475569; }' +
      '.' + P + '__btn--submit { background: #295f91; color: #fff; }' +
      '.' + P + '__btn[disabled] { opacity: 0.55; cursor: default; }' +
      '.' + P + ' [hidden] { display: none !important; }';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function clean(t) {
    return String(t || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── SOW context ──────────────────────────────────────────────────────
  function connId(raw) {
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  function sowContext() {
    var F = CONFIG.sowFields;
    var ctx = { sowId: '', sowName: '', projectId: '', companyId: '',
                validated: '', surveyRequested: '' };
    for (var i = 0; i < CONFIG.sowViews.length; i++) {
      var v = window.Knack && Knack.views && Knack.views[CONFIG.sowViews[i]];
      var a = v && v.model && v.model.attributes;
      if (!a || !a.id) continue;
      if (!ctx.sowId) ctx.sowId = a.id;
      if (!ctx.sowName && a[F.name] != null) {
        ctx.sowName = clean(String(a[F.name]).replace(/<[^>]*>/g, ''));
      }
      if (!ctx.projectId) ctx.projectId = connId(a[F.project + '_raw']);
      if (!ctx.companyId) ctx.companyId = connId(a[F.company + '_raw']);
      if (!ctx.validated && a[F.validated] != null) {
        ctx.validated = clean(String(a[F.validated]).replace(/<[^>]*>/g, ''));
      }
      if (!ctx.surveyRequested && a[F.requested] != null) {
        ctx.surveyRequested = clean(String(a[F.requested]).replace(/<[^>]*>/g, ''));
      }
    }
    if (!ctx.sowId) {
      // Hash fallback — second 24-hex token is the SOW on this page
      // (same convention as survey-request-cards.js currentSowId()).
      var m = (window.location.hash || '').match(/[a-f0-9]{24}/g);
      ctx.sowId = (m && m[1]) || '';
    }
    return ctx;
  }

  // ── Contact candidates from view_4156 ────────────────────────────────
  function readContactField(attrs, key) {
    if (!key || !attrs) return '';
    var raw = attrs[key + '_raw'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (raw.first != null || raw.last != null) {
        return clean((raw.first || '') + ' ' + (raw.last || ''));
      }
      if (raw.email != null) return clean(raw.email);
      if (raw.formatted != null) return clean(raw.formatted);
    }
    var v = attrs[key];
    if (v == null) return '';
    return clean(String(v).replace(/<[^>]*>/g, ''));
  }

  /** [{ id, name, email, phone }] from the hidden contacts grid. Model
   *  read when CONFIG.contactFields keys are pinned; otherwise a DOM
   *  heuristic that works on any column layout: email = the mailto
   *  anchor, phone = the tel anchor, name = the first text cell that is
   *  neither. The view is display:none but fully rendered. */
  function getContacts() {
    var out = [];
    var F = CONFIG.contactFields;
    if (F.name || F.email || F.phone) {
      try {
        var v = window.Knack && Knack.views && Knack.views[CONFIG.contactsView];
        var models = (v && v.model && v.model.data && v.model.data.models) || [];
        for (var i = 0; i < models.length; i++) {
          var a = models[i].attributes || models[i];
          if (!a || !a.id) continue;
          out.push({
            id: a.id,
            name:  readContactField(a, F.name),
            email: readContactField(a, F.email),
            phone: readContactField(a, F.phone)
          });
        }
      } catch (e) { out = []; }
      if (out.length) return out;
    }
    var viewEl = document.getElementById(CONFIG.contactsView);
    var rows = viewEl ? viewEl.querySelectorAll('tbody tr[id]') : [];
    for (var r = 0; r < rows.length; r++) {
      if (!/^[a-f0-9]{24}$/i.test(rows[r].id || '')) continue;
      var mailA = rows[r].querySelector('a[href^="mailto:"]');
      var telA  = rows[r].querySelector('a[href^="tel:"]');
      var email = mailA ? clean(mailA.textContent) : '';
      var phone = telA ? clean(telA.textContent) : '';
      var name  = '';
      var tds = rows[r].querySelectorAll('td');
      for (var c = 0; c < tds.length; c++) {
        var t = clean(tds[c].textContent);
        if (t && t !== email && t !== phone) { name = t; break; }
      }
      if (name || email) out.push({ id: rows[r].id, name: name, email: email, phone: phone });
    }
    return out;
  }

  // ── Modal ────────────────────────────────────────────────────────────
  function contactPickerHtml(role, label, required, contacts) {
    var opts = '<option value="">— Select a contact —</option>';
    for (var i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      var text = c.name + (c.email ? ' — ' + c.email : '');
      opts += '<option value="' + esc(c.id) + '">' + esc(text) + '</option>';
    }
    opts += '<option value="__new__">＋ Add a new contact…</option>';
    return '' +
      '<label class="' + P + '__label">' + esc(label) +
        (required ? '<span class="' + P + '__req">*</span>' : '') + '</label>' +
      '<select data-srqf-contact="' + role + '">' + opts + '</select>' +
      '<div class="' + P + '__new" data-srqf-new="' + role + '" hidden>' +
        '<div class="' + P + '__grid2">' +
          '<input type="text" placeholder="First name" data-srqf-f="' + role + ':first">' +
          '<input type="text" placeholder="Last name" data-srqf-f="' + role + ':last">' +
        '</div>' +
        '<div class="' + P + '__grid2" style="margin-top:8px;">' +
          '<input type="email" placeholder="Email" data-srqf-f="' + role + ':email">' +
          '<input type="tel" placeholder="Phone" data-srqf-f="' + role + ':phone">' +
        '</div>' +
      '</div>';
  }

  function radioRowHtml(name, label) {
    return '' +
      '<label class="' + P + '__label">' + esc(label) + '</label>' +
      '<div class="' + P + '__radios">' +
        '<label><input type="radio" name="srqf-' + name + '" value="Yes"> Yes</label>' +
        '<label><input type="radio" name="srqf-' + name + '" value="No" checked> No</label>' +
      '</div>';
  }

  function closeModal() {
    var el = document.getElementById(OVERLAY_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function openModal() {
    injectStyles();
    closeModal();

    var ctx = sowContext();
    var contacts = getContacts();

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '' +
      '<div class="' + P + '" role="dialog" aria-modal="true">' +
        '<div class="' + P + '__hd">' +
          '<h3 class="' + P + '__title">Request Site Survey</h3>' +
          (ctx.sowName ? '<div class="' + P + '__sow">' + esc(ctx.sowName) + '</div>' : '') +
        '</div>' +
        '<div class="' + P + '__body">' +

          '<div class="' + P + '__sec">Installation Agreement Contact</div>' +
          contactPickerHtml('install', 'Who is the point of contact for the installation?', true, contacts) +
          radioRowHtml('authorized', 'Is this POC authorized to make changes to the scope?') +

          '<div class="' + P + '__sec">Billing / AP Contact</div>' +
          contactPickerHtml('billing', 'Who should receive invoices / AP correspondence?',
                            CONFIG.requireBilling, contacts) +

          '<div class="' + P + '__sec">Site Access</div>' +
          radioRowHtml('badging', 'Are there any badging, security, training or other site access requirements?') +
          radioRowHtml('ppe', 'Are there PPE requirements?') +
          '<div data-srqf-details-wrap hidden>' +
            '<label class="' + P + '__label">Please detail badging, security, training, PPE, or other site access requirements' +
              '<span class="' + P + '__req">*</span></label>' +
            '<textarea data-srqf-f="badgingDetails"></textarea>' +
          '</div>' +

          '<div class="' + P + '__sec">Notes</div>' +
          '<label class="' + P + '__label">Anything else we should know?</label>' +
          '<textarea data-srqf-f="notes"></textarea>' +

          '<div class="' + P + '__err" data-srqf-err></div>' +
          '<div class="' + P + '__ok" data-srqf-ok></div>' +
        '</div>' +
        '<div class="' + P + '__ft">' +
          '<button type="button" class="' + P + '__btn ' + P + '__btn--cancel" data-srqf-cancel>Cancel</button>' +
          '<button type="button" class="' + P + '__btn ' + P + '__btn--submit" data-srqf-submit>Submit Request</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function q(sel) { return overlay.querySelector(sel); }
    function qa(sel) { return overlay.querySelectorAll(sel); }

    // Picker ↔ manual-entry toggle per role.
    ['install', 'billing'].forEach(function (role) {
      var sel = q('select[data-srqf-contact="' + role + '"]');
      sel.addEventListener('change', function () {
        q('[data-srqf-new="' + role + '"]').hidden = sel.value !== '__new__';
      });
    });

    // Details textarea mirrors the old form's display logic: visible
    // (and required) when badging = Yes OR PPE = Yes.
    function syncDetails() {
      var badging = (q('input[name="srqf-badging"]:checked') || {}).value === 'Yes';
      var ppe     = (q('input[name="srqf-ppe"]:checked') || {}).value === 'Yes';
      q('[data-srqf-details-wrap]').hidden = !(badging || ppe);
    }
    var flagRadios = qa('input[name="srqf-badging"], input[name="srqf-ppe"]');
    for (var fr = 0; fr < flagRadios.length; fr++) {
      flagRadios[fr].addEventListener('change', syncDetails);
    }

    function fieldVal(key) {
      var el = q('[data-srqf-f="' + key + '"]');
      return el ? clean(el.value) : '';
    }

    // { mode, … } | null. required drives the error string; a picked row
    // rides as the record id, a new contact as its parts.
    function contactPayload(role, required, label) {
      var sel = q('select[data-srqf-contact="' + role + '"]');
      var val = sel ? sel.value : '';
      if (val === '__new__') {
        var first = fieldVal(role + ':first'), last = fieldVal(role + ':last');
        var email = fieldVal(role + ':email'), phone = fieldVal(role + ':phone');
        if (!first && !last) return { error: label + ': enter the new contact’s name.' };
        if (!email) return { error: label + ': enter the new contact’s email.' };
        return { mode: 'new', first: first, last: last,
                 name: clean(first + ' ' + last), email: email, phone: phone };
      }
      if (val) {
        for (var i = 0; i < contacts.length; i++) {
          if (contacts[i].id === val) {
            return { mode: 'existing', id: val, name: contacts[i].name,
                     email: contacts[i].email, phone: contacts[i].phone };
          }
        }
        return { mode: 'existing', id: val, name: '', email: '', phone: '' };
      }
      if (required) return { error: label + ': pick a contact or add a new one.' };
      return null;
    }

    function showErr(msg) {
      var el = q('[data-srqf-err]');
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }

    q('[data-srqf-cancel]').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    q('[data-srqf-submit]').addEventListener('click', function () {
      showErr('');
      var install = contactPayload('install', true, 'Installation Agreement contact');
      if (install && install.error) return showErr(install.error);
      var billing = contactPayload('billing', CONFIG.requireBilling, 'Billing / AP contact');
      if (billing && billing.error) return showErr(billing.error);

      var badging = (q('input[name="srqf-badging"]:checked') || {}).value || 'No';
      var ppe     = (q('input[name="srqf-ppe"]:checked') || {}).value || 'No';
      var details = fieldVal('badgingDetails');
      if ((badging === 'Yes' || ppe === 'Yes') && !details) {
        return showErr('Please detail the badging / site access / PPE requirements.');
      }
      if (!ctx.sowId) {
        return showErr('Could not determine the SOW for this page — reload and try again.');
      }

      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[CONFIG.webhookKey]) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        return showErr('Survey request webhook is not configured yet (' + CONFIG.webhookKey + ').');
      }

      var user = {};
      try {
        var u = Knack.getUserAttributes();
        user = { id: u.id || '', name: u.name || '', email: u.email || '' };
      } catch (e) { /* anonymous — Make can live without it */ }

      var payload = {
        action: 'survey-request-create',
        sowId: ctx.sowId,
        sowName: ctx.sowName,
        projectId: ctx.projectId,
        companyId: ctx.companyId,
        validated: ctx.validated,
        surveyRequested: ctx.surveyRequested,
        installContact: install,
        billingContact: billing,
        pocAuthorized: (q('input[name="srqf-authorized"]:checked') || {}).value || 'No',
        badging: badging,
        badgingDetails: details,
        ppe: ppe,
        notes: fieldVal('notes'),
        requestedBy: user,
        submittedAt: new Date().toISOString()
      };

      var btns = qa('.' + P + '__btn');
      for (var b = 0; b < btns.length; b++) btns[b].disabled = true;
      q('[data-srqf-submit]').textContent = 'Submitting…';

      $.ajax({
        url: url, type: 'POST', contentType: 'application/json',
        data: JSON.stringify(payload)
      }).done(function (resp) {
        if (resp && resp.success === false) return fail(resp.error || 'The webhook rejected the request.');
        var ok = q('[data-srqf-ok]');
        ok.textContent = 'Survey request submitted — it will appear once processed.';
        ok.style.display = 'block';
        setTimeout(closeModal, 1400);
      }).fail(function (xhr) {
        // Make webhooks often answer without CORS headers → status 0 with
        // the POST actually delivered. Same treatment as the repo's other
        // Make posts: count it as accepted.
        if (xhr && xhr.status === 0) {
          var ok0 = q('[data-srqf-ok]');
          ok0.textContent = 'Survey request submitted.';
          ok0.style.display = 'block';
          setTimeout(closeModal, 1400);
          return;
        }
        fail('Webhook returned HTTP ' + (xhr && xhr.status));
      });

      function fail(msg) {
        for (var b2 = 0; b2 < btns.length; b2++) btns[b2].disabled = false;
        q('[data-srqf-submit]').textContent = 'Submit Request';
        showErr(msg);
      }
    });
  }

  // ── Public API (registration is the module's only side effect) ───────
  window.SCW = window.SCW || {};
  SCW.surveyRequestForm = {
    open: openModal,
    close: closeModal,
    getContacts: getContacts,
    CONFIG: CONFIG
  };

  if (CONFIG.enabled) {
    // Wiring pass lands here: bind open() into the survey step on
    // scene_1116 (workflow-stepper's view_3853 slot) and suppress the
    // Knack form. Intentionally empty while dormant.
    if (CONFIG.debug) console.log('[scw-srqf] enabled but not yet wired to a launcher');
  }

})();
/*** END SURVEY REQUEST FORM ***/
