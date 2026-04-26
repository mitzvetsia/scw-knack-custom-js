/*** FEATURE: Ops-side stepper (view_3345 rich-text host) ***/
/**
 * Three button-actions rendered into the role-gated rich-text host
 * view_3345 on the Ops proposal page. Each button opens a notes-prompt
 * modal and fires a Make webhook with the SOW context + payload fields
 * so Make can update the CU project task, post to Slack, and (for
 * step 2 / 3) create the supporting records.
 *
 * Steps
 *   1. Mark Ready for Survey
 *        showWhen: field_2706 = No
 *        webhook : MAKE_OPS_MARK_READY_WEBHOOK
 *        server  : flips field_2723 = Yes, updates CU task, Slack
 *
 *   2. Request Alternative Bid from Subcontractor
 *        showWhen: field_2706 = No AND field_2728 > 0
 *        webhook : MAKE_OPS_REQUEST_ALT_BID_WEBHOOK
 *        server  : creates missing Survey Item records + alt-bid package,
 *                  updates CU task, posts to Slack
 *
 *   3. Publish and Submit Completed Proposal to Sales
 *        showWhen: field_2725 (FLAG_released to sales) = No
 *        webhook : MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK
 *        server  : flips field_2725 = Yes (i.e. releases to Sales),
 *                  updates CU task, Slack
 *
 * Payload for steps 2 and 3 includes every field from SOURCE_VIEW
 * (view_3861) plus field_2126, line-item record ids from view_3341,
 * and license record ids from LICENSE_VIEW (empty placeholder until
 * the view is supplied).
 */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────
  var HOST_VIEW      = 'view_3345';   // role-gated rich-text host in Knack
  var SOURCE_VIEW    = 'view_3861';   // SOW details view on the proposal page
  var LINE_ITEM_VIEW = 'view_3341';   // SOW Line Items grid
  var LICENSE_VIEW   = 'view_3371';   // License records table on the proposal page
  var EXTRA_FIELD    = 'field_2126';  // SOW Name — always in the payload

  var NS         = '.scwOpsStepper';
  var BLOCK_CLS  = 'scw-ops-stepper';
  var STYLE_ID   = 'scw-ops-stepper-css';

  var STEPS = [
    {
      id: 'mark-ready',
      label: 'Mark Ready for Survey',
      tone: 'primary',
      // Keyed on field_2723 — the flag this step's webhook actually
      // flips server-side. field_2706 ("survey requested") only flips
      // downstream when Sales requests the survey, so keying the step
      // state on it made it effectively un-completable from Ops' side.
      //
      // Hide the step entirely once the flow has advanced to the change-
      // request stage. If the SOW hasn't been marked ready AND there
      // are already CRs queued, the Request Alternative Bid step takes
      // over — surfacing a grayed-out Mark Ready here would just be noise.
      hideWhen: {
        all: [
          { field: 'field_2723', value: 'No' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      // Once Ops has marked the SOW ready, render as completed (green
      // check, non-clickable) to mirror the sales build stepper.
      completed: { field: 'field_2723', value: 'Yes' },
      // Active (clickable) when Ops hasn't marked it ready and there
      // are no CRs yet.
      showWhen: {
        all: [
          { field: 'field_2723', value: 'No' },
          { not: { field: 'field_2728', gt: 0 } }
        ]
      },
      // Single webhook handles both "mark ready" and the draft publish
      // server-side. Payload includes full SOW context + publishAsTbd
      // (see buildPayload) so Make has everything it needs to also
      // produce the TBD-numbered draft published quote.
      webhookKey: 'MAKE_OPS_MARK_READY_WEBHOOK',
      modal: {
        title:       'Mark Ready for Survey',
        intro:       'Note to the sales team — what should they know?',
        placeholder: 'e.g. Proposal is internally consistent, ready to hand off',
        submitLabel: 'Mark Ready'
      },
      includeFullPayload: true
    },
    {
      id: 'request-alt-bid',
      label: 'Request Alternative Bid from Subcontractor',
      tone: 'amber',
      // Hide entirely when there are no change requests — the whole
      // premise of an alt bid is to respond to CRs, so without any
      // there's nothing to show.
      hideWhen: { not: { field: 'field_2728', gt: 0 } },
      showWhen: {
        all: [
          { field: 'field_2706', value: 'No' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      webhookKey: 'MAKE_OPS_REQUEST_ALT_BID_WEBHOOK',
      modal: {
        title:       'Request Alternative Bid',
        intro:       'Note for the subcontractor (and a heads-up will also post back to Sales that an alternative bid was requested).',
        placeholder: 'e.g. Budget-friendly alternative — fewer cameras in the lot, cheaper NVR',
        submitLabel: 'Send Request'
      },
      includeFullPayload: true
    },
    {
      id: 'publish-proposal',
      label: 'Submit Final Proposal to Sales',
      tone: 'success',
      // Unlocked once EITHER:
      //   - the SOW has at least one change request (field_2728 > 0), OR
      //   - Ops has marked the SOW ready for survey (field_2723 = Yes).
      // Either signal means there's something worth publishing — a CR
      // queue to surface, or an Ops-validated SOW headed to survey.
      showWhen: {
        any: [
          { field: 'field_2728', gt: 0 },
          { field: 'field_2723', value: 'Yes' }
        ]
      },
      webhookKey: 'MAKE_OPS_PUBLISH_PROPOSAL_WEBHOOK',
      modal: {
        title:       'Submit Final Proposal to Sales',
        intro:       'Anything to include in the update to Sales?',
        placeholder: 'e.g. Final bid validated, SCW-1041 total $12,325.99',
        submitLabel: 'Submit',
        primaryMode: 'publish-and-notify'
      },
      includeFullPayload: true
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  // Same shapes as workflow-stepper.js so the Ops actions render visually
  // identical to the sales build stepper rows (CIRCLE for available, LOCK
  // for disabled, SPINNER while a webhook is in flight).
  var CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  var CHECK_CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
    '<polyline points="22 4 12 14.01 9 11.01"/></svg>';
  var LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── Styles (injected once) ───────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Container — sits flush inside the rich-text host (view_3345). */
      '.' + BLOCK_CLS + ' {' +
      '  display: flex; flex-direction: column; gap: 0;' +
      '  margin: 8px 0;' +
      '}' +
      '.' + BLOCK_CLS + '__title {' +
      '  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;' +
      '  text-transform: uppercase; color: #6b7280;' +
      '  margin-bottom: 6px;' +
      '}' +

      /* ── Action step row (mirrors workflow-stepper.js) ──
         These rules also live in workflow-stepper.js, but that file only
         injects them on the sales build page (view_3827 scope). The Ops
         proposal page doesn't have view_3827, so we re-declare the same
         rules here so the buttons render identically. */
      '.scw-step-action {' +
      '  position: relative; display: flex; align-items: center;' +
      '  width: 100%; min-height: 44px;' +
      '  padding: 14px 16px 14px 22px;' +
      '  background: #fff; cursor: pointer; user-select: none;' +
      '  box-sizing: border-box; transition: background 180ms ease;' +
      '  border: 1px solid #e5e7eb; border-radius: 14px;' +
      '  margin-bottom: 8px; text-decoration: none !important; color: inherit;' +
      '}' +
      '.scw-step-action::before {' +
      '  content: ""; position: absolute; left: 0; top: 0; bottom: 0;' +
      '  width: 6px; background: var(--scw-step-accent, #295f91);' +
      '  border-radius: 14px 0 0 14px;' +
      '}' +
      '.scw-step-action:hover { background: rgba(41,95,145,0.06); }' +
      '.scw-step-action .scw-step-icon {' +
      '  flex: 0 0 auto; display: inline-flex; align-items: center;' +
      '  justify-content: center; width: 28px; margin-right: 6px;' +
      '  color: var(--scw-step-accent, #295f91); opacity: .75;' +
      '}' +
      '.scw-step-action .scw-step-title {' +
      '  flex: 1 1 auto; font-size: 14px; font-weight: 600;' +
      '  color: #1e293b; white-space: nowrap; overflow: hidden;' +
      '  text-overflow: ellipsis; text-decoration: none !important;' +
      '}' +
      '.scw-step-action.is-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-action.is-disabled .scw-step-icon { color: #94a3b8; opacity: 1; }' +
      /* Completed: green accent + check icon. When locked-by-completion
         (is-completed + is-disabled) keep full opacity — the step should
         read as "done", not as faded-out. */
      '.scw-step-action.is-completed {' +
      '  --scw-step-accent: #16a34a;' +
      '}' +
      '.scw-step-action.is-completed .scw-step-icon { color: #16a34a; opacity: 1; }' +
      '.scw-step-action.is-completed.is-disabled {' +
      '  opacity: 1; cursor: default; pointer-events: none;' +
      '}' +
      '.scw-step-action.is-completed.is-disabled .scw-step-icon {' +
      '  color: #16a34a; opacity: 1;' +
      '}' +
      '.scw-step-action.is-loading {' +
      '  pointer-events: none; opacity: 0.75; cursor: wait;' +
      '}' +
      '.scw-step-action.is-loading .scw-step-icon svg {' +
      '  animation: scw-step-spin 0.8s linear infinite;' +
      '}' +
      '@keyframes scw-step-spin { to { transform: rotate(360deg); } }' +

      /* Modal — mirrors workflow-stepper's notes-prompt modal. */
      '.scw-ops-modal-overlay {' +
      '  position: fixed; inset: 0; z-index: 10000;' +
      '  display: flex; align-items: center; justify-content: center;' +
      '  background: rgba(15,23,42,0.55);' +
      '}' +
      '.scw-ops-modal {' +
      '  width: 480px; max-width: 92vw; background: #fff;' +
      '  border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);' +
      '  padding: 20px 22px 16px;' +
      '  font-family: inherit; color: #111827;' +
      '}' +
      '.scw-ops-modal-hdr {' +
      '  font-size: 16px; font-weight: 700; margin-bottom: 4px;' +
      '}' +
      '.scw-ops-modal-intro {' +
      '  font-size: 13px; color: #4b5563; margin-bottom: 12px;' +
      '}' +
      '.scw-ops-modal-textarea {' +
      '  width: 100%; box-sizing: border-box; min-height: 110px;' +
      '  padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px;' +
      '  font-family: inherit; font-size: 13px; resize: vertical;' +
      '}' +
      '.scw-ops-modal-error {' +
      '  margin-top: 8px; color: #b91c1c; font-size: 12px;' +
      '}' +
      '.scw-ops-modal-actions {' +
      '  display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;' +
      '}' +
      '.scw-ops-modal-cancel, .scw-ops-modal-secondary, .scw-ops-modal-submit {' +
      '  padding: 7px 14px; border-radius: 5px; font-size: 13px;' +
      '  font-weight: 600; cursor: pointer; border: 1px solid transparent;' +
      '}' +
      '.scw-ops-modal-cancel {' +
      '  background: #fff; color: #374151; border-color: #d1d5db;' +
      '}' +
      '.scw-ops-modal-cancel:hover { background: #f3f4f6; }' +
      '.scw-ops-modal-secondary {' +
      '  background: #fff; color: #1f2937; border-color: #cbd5e1;' +
      '}' +
      '.scw-ops-modal-secondary:hover { background: #f3f4f6; }' +
      '.scw-ops-modal-secondary[disabled] { opacity: 0.6; cursor: wait; }' +
      '.scw-ops-modal-submit {' +
      '  background: #2563eb; color: #fff; border-color: #1d4ed8;' +
      '}' +
      '.scw-ops-modal-submit:hover { background: #1d4ed8; }' +
      '.scw-ops-modal-submit[disabled] {' +
      '  opacity: 0.6; cursor: wait;' +
      '}';

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────
  function getSourceModel() {
    try {
      var v = Knack.views && Knack.views[SOURCE_VIEW];
      return (v && v.model && v.model.attributes) || null;
    } catch (e) { return null; }
  }

  function getSourceRecordId() {
    var attrs = getSourceModel();
    return (attrs && attrs.id) || '';
  }

  // Read from the source-view DOM (matches workflow-stepper.js's pattern).
  // The Details view renders each field as `.kn-detail.field_XXXX` with
  // the value inside `.kn-detail-body`. The Knack model isn't always
  // populated when the view first renders, but the DOM always is.
  function readField(fieldKey) {
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').replace(/ /g, ' ').trim();
    return '';
  }

  // Numeric comparison for `gt` / `gte` etc.
  function toNum(v) {
    if (v == null) return NaN;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? NaN : n;
  }

  function conditionMet(cond) {
    if (!cond) return true;
    if (cond.all) return cond.all.every(conditionMet);
    if (cond.any) return cond.any.some(conditionMet);
    if (cond.not) return !conditionMet(cond.not);
    if (cond.field) {
      var v = String(readField(cond.field) || '').trim();
      if (cond.value    != null) return v.toLowerCase() === String(cond.value).toLowerCase();
      if (cond.notValue != null) return v.toLowerCase() !== String(cond.notValue).toLowerCase();
      if (cond.hasValue === true)  return v !== '';
      if (cond.hasValue === false) return v === '';
      if (cond.gt  != null) return toNum(v) >  Number(cond.gt);
      if (cond.gte != null) return toNum(v) >= Number(cond.gte);
      if (cond.lt  != null) return toNum(v) <  Number(cond.lt);
      if (cond.lte != null) return toNum(v) <= Number(cond.lte);
    }
    return true;
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

  // Pull every attribute off the source view's model. Skips internal Knack
  // keys (id, account_id, object, etc) and keeps both raw and display values
  // — Make can pick whichever it needs per field.
  function readAllFields() {
    var attrs = getSourceModel();
    if (!attrs) return {};
    var out = {};
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (/^field_\d+(_raw)?$/.test(k)) out[k] = attrs[k];
    }
    return out;
  }

  function collectRecordIdsFromView(viewId) {
    var out = [];
    if (!viewId) return out;
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var data = v && v.model && v.model.data;
      var models = data && data.models;
      if (!models || !models.length) return out;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes;
        if (a && typeof a.id === 'string' && /^[a-f0-9]{24}$/.test(a.id)) {
          out.push(a.id);
        }
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // ── Payload ──────────────────────────────────────────────
  // True when the SOW hasn't been released to Sales yet — Make's
  // Publish scenario publishes with TBD placeholder numbers rather
  // than finalized figures. Ops can SEE the real numbers internally
  // (including via Submit-to-Second-Set), but until field_2725
  // (FLAG_released to sales) flips to Yes, the published quote
  // keeps TBDs so Sales / customers aren't shown numbers Ops hasn't
  // signed off on for external delivery.
  function shouldPublishAsTbd() {
    return (readField('field_2725') || '').trim().toLowerCase() !== 'yes';
  }

  function buildPayload(step, notes, mode) {
    var payload = {
      sourceRecordId: getSourceRecordId(),
      stepId:         step.id,
      notes:          notes || '',
      mode:           mode || null,
      triggeredBy:    getTriggeredBy()
    };
    if (step.includeFullPayload) {
      payload.sowFields = readAllFields();
      // EXTRA_FIELD (field_2126 — SOW Name) is usually in sowFields already,
      // but surface it at the top level so Make can reference it without
      // digging through the map.
      payload.sowName        = readField(EXTRA_FIELD);
      payload.sowLineItemIds = collectRecordIdsFromView(LINE_ITEM_VIEW);
      payload.licenseIds     = collectRecordIdsFromView(LICENSE_VIEW);
    }
    // Any payload that will trigger publishing server-side carries the
    // TBD flag so Make knows whether to stamp real numbers or
    // placeholders. Mark Ready (which also publishes a draft), the
    // standalone Publish step, and Request Alt Bid (which packages
    // the current SOW into an alt-bid request — Make needs the same
    // html/json snapshot for that) all qualify.
    //
    // Also merges in the exact shape the standalone "Publish Quote"
    // button (proposal-pdf-export.js) sends to its save webhook —
    // html / json / sowId / totals / expirationDate / etc. — so every
    // code path that publishes (or snapshots) a quote looks identical
    // on Make's side.
    if (step.id === 'publish-proposal' ||
        step.id === 'mark-ready' ||
        step.id === 'request-alt-bid') {
      payload.publishAsTbd = shouldPublishAsTbd();
      try {
        // Pass the proposal scene explicitly — more reliable than
        // auto-detect, and the Ops stepper is only active on scene_1096.
        var pub = window.SCW && SCW.pdfExport && SCW.pdfExport.buildPublishPayload
          ? SCW.pdfExport.buildPublishPayload('scene_1096')
          : null;
        if (pub) {
          // Flatten publish fields onto the top-level payload. Don't
          // clobber the ops-stepper-native keys (sourceRecordId, etc.).
          var PUBLISH_KEYS = [
            'recordId', 'hash', 'sceneId', 'type',
            'sowId', 'equipmentTotal', 'installationTotal',
            'grandTotal', 'expirationDate', 'html', 'json'
          ];
          for (var pi = 0; pi < PUBLISH_KEYS.length; pi++) {
            var pk = PUBLISH_KEYS[pi];
            if (pub[pk] !== undefined) payload[pk] = pub[pk];
          }
        } else {
          console.warn('[scw-ops-stepper] buildPublishPayload returned null — ' +
            'SCW.pdfExport not ready or scene not configured. html/json ' +
            'fields will be missing from this webhook call.');
        }
      } catch (e) {
        console.warn('[scw-ops-stepper] buildPublishPayload threw:', e);
      }
    }
    return payload;
  }

  // ── Notes prompt modal ───────────────────────────────────
  function openNotesPromptModal(opts, onSubmit) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'scw-ops-modal-overlay';

    var card = document.createElement('div');
    card.className = 'scw-ops-modal';

    var hdr = document.createElement('div');
    hdr.className = 'scw-ops-modal-hdr';
    hdr.textContent = opts.title || 'Add a note';
    card.appendChild(hdr);

    if (opts.intro) {
      var intro = document.createElement('div');
      intro.className = 'scw-ops-modal-intro';
      intro.textContent = opts.intro;
      card.appendChild(intro);
    }

    var ta = document.createElement('textarea');
    ta.className = 'scw-ops-modal-textarea';
    ta.placeholder = opts.placeholder || '';
    card.appendChild(ta);

    var err = document.createElement('div');
    err.className = 'scw-ops-modal-error';
    err.style.display = 'none';
    card.appendChild(err);

    var actions = document.createElement('div');
    actions.className = 'scw-ops-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-ops-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    // Optional secondary action (used by the Publish step to offer
    // "Just Publish" alongside "Publish & Notify Sales").
    var secondaryBtn = null;
    if (opts.secondaryLabel) {
      secondaryBtn = document.createElement('button');
      secondaryBtn.type = 'button';
      secondaryBtn.className = 'scw-ops-modal-secondary';
      secondaryBtn.textContent = opts.secondaryLabel;
    }

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'scw-ops-modal-submit';
    submitBtn.textContent = opts.submitLabel || 'Submit';

    actions.appendChild(cancelBtn);
    if (secondaryBtn) actions.appendChild(secondaryBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 30);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    function setSubmitting(on) {
      submitBtn.disabled = !!on;
      submitBtn.textContent = on ? 'Submitting…' : (opts.submitLabel || 'Submit');
      cancelBtn.disabled = !!on;
      if (secondaryBtn) secondaryBtn.disabled = !!on;
    }
    function showError(msg) {
      err.textContent = msg || 'Something went wrong.';
      err.style.display = 'block';
    }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    submitBtn.addEventListener('click', function () {
      err.style.display = 'none';
      var notes = (ta.value || '').trim();
      onSubmit(notes, {
        setSubmitting: setSubmitting, showError: showError, close: close,
        mode: opts.primaryMode || null
      });
    });
    if (secondaryBtn) {
      secondaryBtn.addEventListener('click', function () {
        err.style.display = 'none';
        var notes = (ta.value || '').trim();
        onSubmit(notes, {
          setSubmitting: setSubmitting, showError: showError, close: close,
          mode: opts.secondaryMode || null
        });
      });
    }
  }

  // Navigate up one level in Knack's hash-based route — strips the
  // last two hash segments (child-slug + child-id) so e.g.
  //   #…/build-sow/<sowId>/proposal/<sowId>
  // becomes
  //   #…/build-sow/<sowId>
  //
  // No reload and no banner: the pending flag we just wrote causes
  // ops-review-pill on the parent scene to render a grey "Processing…"
  // pill for this SOW. That's the visual cue. Polling over there
  // refreshes the underlying data (view_3325 + view_3885) as soon as
  // Make commits its writes, without ever replacing the whole page.
  function redirectToParent() {
    var hash = (window.location.hash || '').split('?')[0].replace(/\/+$/, '');
    var parts = hash.replace(/^#\/?/, '').split('/');
    if (parts.length >= 2) {
      parts.splice(-2, 2);
      window.location.hash = '#' + parts.join('/');
    } else {
      window.location.hash = '#';
    }
  }

  // localStorage key name used to signal same-origin tabs that an Ops
  // stepper action finished. workflow-stepper.js listens on the build
  // page and reloads when its own SOW id matches, so the user never
  // lingers on stale data after clicking Mark Ready from a new tab.
  var COMPLETION_SIGNAL_KEY_PREFIX = 'scw-ops-stepper-completed:';
  var PENDING_KEY_PREFIX           = 'scw-ops-stepper-pending:';

  function signalOpsStepperCompletion(sowId) {
    if (!sowId) return;
    try {
      // Value is just the timestamp — every write triggers a storage
      // event in other tabs even if the key already existed.
      localStorage.setItem(COMPLETION_SIGNAL_KEY_PREFIX + sowId, String(Date.now()));
      SCW.debug('[scw-ops-stepper] completion signal written:', sowId);
    } catch (e) { /* localStorage might be disabled; non-fatal */ }
  }

  // Mark the SOW's current step as "in flight" — Make has accepted the
  // webhook but hasn't finished yet. ops-review-pill reads this flag
  // and renders the pill in a grayed "Processing" state until field
  // values on the record catch up (polled via Knack.views.model.fetch)
  // or the 90s timeout lapses.
  function markStepPending(sowId, stepId) {
    if (!sowId || !stepId) return;
    try {
      localStorage.setItem(
        PENDING_KEY_PREFIX + sowId,
        JSON.stringify({ stepId: stepId, timestamp: Date.now() })
      );
      SCW.debug('[scw-ops-stepper] pending flag written:', sowId, stepId);
    } catch (e) { /* localStorage might be disabled; non-fatal */ }
  }

  // Close the current tab on success. The Ops list opens the proposal
  // page in a new tab (target="_blank"), so window.close() should work;
  // if the browser blocks it, fall back to redirectToParent after a
  // short delay so the user still ends up somewhere sensible.
  //
  // The setTimeout before window.close() is intentional: some browsers
  // miss the cross-tab storage-event IPC if the origin tab closes too
  // quickly after setItem. 150ms is plenty for the event to propagate.
  function dismissAfterSuccess() {
    setTimeout(function () {
      window.close();
      setTimeout(function () {
        // Still here? window.close() was blocked. Navigate up instead.
        redirectToParent();
      }, 300);
    }, 150);
  }

  // ── Webhook ──────────────────────────────────────────────
  // POST the payload as JSON. Resolves with {ok, status, data} where
  // `data` is the parsed JSON body (or null if the body isn't JSON).
  function postWebhook(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) {}
        return { ok: resp.ok, status: resp.status, body: body, data: data };
      });
    });
  }

  // Extract a user-facing error message from a webhook response. Used
  // when resp.data.success isn't truthy — prefers the server's error
  // string, falls back to a generic HTTP-status message.
  function webhookErrorMsg(resp, genericLabel) {
    if (resp.data && (resp.data.error || resp.data.message)) {
      return resp.data.error || resp.data.message;
    }
    if (resp.ok) return (genericLabel || 'Webhook') + ' returned a non-JSON or unexpected response.';
    return (genericLabel || 'Webhook') + ' returned HTTP ' + resp.status + '.';
  }

  function fireStep(step, btn) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[step.webhookKey]) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert(step.label + ' webhook URL is not configured (' + step.webhookKey + ').');
      return;
    }
    if (!getSourceRecordId()) {
      alert('Could not determine the SOW record ID from ' + SOURCE_VIEW + '.');
      return;
    }

    openNotesPromptModal(step.modal, function (notes, ctx) {
      ctx.setSubmitting(true);
      setBtnLoading(btn, true);
      var payload = buildPayload(step, notes, ctx.mode);

      postWebhook(url, payload).then(function (resp) {
        // Accept either `success: true` or `status: 'accepted'` —
        // Make scenarios respond with one or the other depending on
        // how the acknowledgement was configured.
        var accepted = resp.data && (
          resp.data.success === true ||
          (typeof resp.data.status === 'string' &&
           resp.data.status.toLowerCase() === 'accepted')
        );
        if (!accepted) {
          throw new Error(webhookErrorMsg(resp, step.label + ' webhook'));
        }
        // Close the notes modal before navigating — the redirect is
        // just a hash change, it doesn't tear down body-level overlays.
        ctx.close();
        // Fire a cross-tab signal so the build page (if open in
        // another tab) reloads and doesn't show stale data.
        signalOpsStepperCompletion(getSourceRecordId());
        // Mark the step as pending so the parent page's next-step
        // pill renders grayed out until Make finishes flipping the
        // underlying field values.
        markStepPending(getSourceRecordId(), step.id);
        // Close this tab — the Ops list opened us in a new window,
        // so there's no reason to keep it around once the action
        // is done. Falls back to a parent-page redirect if the
        // browser blocks window.close().
        dismissAfterSuccess();
      }).catch(function (e) {
        setBtnLoading(btn, false);
        ctx.setSubmitting(false);
        ctx.showError(
          (e && e.message) ? e.message : ('Network error: ' + e)
        );
      });
    });
  }

  function setBtnLoading(btn, on) {
    if (!btn) return;
    var icon = btn.querySelector('.scw-step-icon');
    if (on) {
      btn.classList.add('is-loading');
      if (icon) icon.innerHTML = SPINNER_SVG;
    } else {
      btn.classList.remove('is-loading');
      if (icon) icon.innerHTML = CIRCLE_SVG;
    }
  }

  // ── Render ───────────────────────────────────────────────
  function renderInto(host) {
    // Clear any previous render — the source view may re-render many times.
    var prev = host.querySelector('.' + BLOCK_CLS);
    if (prev) prev.remove();

    var block = document.createElement('div');
    block.className = BLOCK_CLS;

    var title = document.createElement('div');
    title.className = BLOCK_CLS + '__title';
    title.textContent = 'Ops Actions';
    block.appendChild(title);

    // Render every step in fixed order. Three possible states per step:
    //   hideWhen  matches → skip rendering entirely (step is inapplicable)
    //   completed matches → render with green-check + is-completed (done, not clickable)
    //   showWhen  matches → render clickable with circle icon
    //   otherwise         → render disabled with gray lock icon
    // Completed takes priority over showWhen so a finished step always
    // reads as "done" rather than as locked.
    STEPS.forEach(function (step) {
      if (step.hideWhen && conditionMet(step.hideWhen)) return;

      var completed = step.completed ? conditionMet(step.completed) : false;
      var available = step.showWhen ? conditionMet(step.showWhen) : true;
      var locked    = !completed && !available;

      var el = document.createElement('a');
      el.href = 'javascript:void(0)';
      var cls = 'scw-step-action';
      if (completed) cls += ' is-completed is-disabled';
      else if (locked) cls += ' is-disabled';
      el.className = cls;
      if (locked) el.setAttribute('title', 'Not available for this SOW right now.');

      var icon = document.createElement('span');
      icon.className = 'scw-step-icon';
      icon.innerHTML = completed ? CHECK_CIRCLE_SVG
                     : available ? CIRCLE_SVG
                                 : LOCK_SVG;
      el.appendChild(icon);

      var titleEl = document.createElement('span');
      titleEl.className = 'scw-step-title';
      titleEl.textContent = step.label;
      el.appendChild(titleEl);

      if (available && !completed) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          if (el.classList.contains('is-loading')) return;
          fireStep(step, el);
        });
      }
      block.appendChild(el);
    });

    host.appendChild(block);
  }

  function render() {
    var host = document.getElementById(HOST_VIEW);
    if (!host) return;           // view is hidden by role rule — nothing to do
    var sourceEl = document.getElementById(SOURCE_VIEW);
    if (!sourceEl) return;       // source not in DOM yet — wait for its render event
    renderInto(host);
  }

  // ── Bindings ─────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + HOST_VIEW + NS)
      .on('knack-view-render.' + HOST_VIEW + NS, function () { setTimeout(render, 200); });

    $(document)
      .off('knack-view-render.' + SOURCE_VIEW + NS)
      .on('knack-view-render.' + SOURCE_VIEW + NS, function () { setTimeout(render, 200); });

    $(document)
      .off('knack-scene-render.any' + NS)
      .on('knack-scene-render.any' + NS, function () { setTimeout(render, 600); });
  }

  injectStyles();
  bind();
  if (document.getElementById(HOST_VIEW)) setTimeout(render, 200);
})();
