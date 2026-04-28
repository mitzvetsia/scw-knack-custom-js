/*** FEATURE: Ops-side stepper (view_3345 rich-text host) ***/
/**
 * Button actions rendered into the role-gated rich-text host view_3345
 * on the Ops proposal page. Each button opens a notes-prompt modal and
 * fires a Make webhook with the SOW context + payload fields so Make
 * can update the CU project task, post to Slack, and (where relevant)
 * create the supporting records / publish a quote.
 *
 * Steps
 *   1. Mark Ready for Survey
 *        showWhen: field_2723 = No AND NOT field_2728 > 0
 *        webhook : MAKE_OPS_MARK_READY_WEBHOOK
 *        server  : flips field_2723 = Yes, updates CU task, Slack
 *
 *   2. Request Alternative Bid from Subcontractor
 *        showWhen: field_2706 = No  AND field_2728 > 0
 *        hideWhen: field_2706 = Yes — once survey is requested we offer
 *                  Update Subcontractor Bid Request instead.
 *        webhook : MAKE_OPS_REQUEST_ALT_BID_WEBHOOK
 *        server  : creates missing Survey Item records + alt-bid package,
 *                  updates CU task, posts to Slack
 *
 *   3. Update Subcontractor Bid Request
 *        showWhen: field_2706 = Yes
 *        webhook : MAKE_OPS_UPDATE_MATCHING_BID_WEBHOOK
 *        server  : updates the matching bid record(s) for the chosen
 *                  survey(s); same payload shape as Request Alt Bid.
 *
 *   4. Publish as SOW only (TBD Labor)
 *        showWhen: always (no gate)
 *        webhook : MAKE_OPS_PUBLISH_SOW_TBD_WEBHOOK
 *
 *   5. Publish Quote as GFE
 *        showWhen: always (no gate)
 *        webhook : MAKE_OPS_PUBLISH_GFE_WEBHOOK
 *
 *   6. Publish Quote as Final
 *        showWhen: any of field_2728 > 0 / field_2723 = Yes
 *        webhook : MAKE_OPS_PUBLISH_FINAL_WEBHOOK
 *
 * Payload for every step includes every field from SOURCE_VIEW
 * (view_3861) plus field_2126, line-item record ids from view_3341,
 * and license record ids from LICENSE_VIEW. The publish steps and the
 * mark-ready / request-alt-bid / update-matching-bid steps additionally
 * merge in the standalone publish payload from proposal-pdf-export
 * (html / json / totals / etc.) so every code path that publishes (or
 * snapshots) a quote looks identical on Make's side. The step.id field
 * on the body is what tells Make which scenario branch to run.
 */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────
  var HOST_VIEW      = 'view_3345';   // role-gated rich-text host in Knack
  var SOURCE_VIEW    = 'view_3861';   // SOW details view on the proposal page
  var LINE_ITEM_VIEW = 'view_3341';   // SOW Line Items grid
  var LICENSE_VIEW   = 'view_3371';   // License records table on the proposal page
  var EXTRA_FIELD    = 'field_2126';  // SOW Name — always in the payload

  // Survey picker — used by the Request Alt Bid step to ask Ops
  // which survey(s) the alt-bid request should target.
  var SURVEY_PICKER_VIEW    = 'view_3897';   // grid of available surveys for this SOW
  var PICKER_SUB_FIELD      = 'field_2347';  // subcontractor connection / identifier
  var PICKER_LABEL_FIELD    = 'field_2345';  // survey identifier (e.g. SR-1)

  var NS         = '.scwOpsStepper';
  var BLOCK_CLS  = 'scw-ops-stepper';
  var STYLE_ID   = 'scw-ops-stepper-css';

  // Per-step ClickUp status radio configs. Each publish button only
  // surfaces the status that semantically matches its purpose, so Ops
  // can't accidentally flip "Final Bid Submitted" from the GFE button.
  // Make's scenario reads payload.clickupStatus and updates the matching
  // CU task field.
  var CLICKUP_STATUS_RADIO_GFE = {
    question:  'Update ClickUp Status?',
    noneLabel: 'No status change',
    options: [
      { value: 'gfe-submitted', label: 'GFE Submitted' }
    ]
  };
  var CLICKUP_STATUS_RADIO_FINAL = {
    question:  'Update ClickUp Status?',
    noneLabel: 'No status change',
    options: [
      { value: 'final-bid-submitted', label: 'Final Bid Submitted' }
    ]
  };
  // SOW-only / TBD Labor still surfaces both options — Ops may publish a
  // SOW skeleton mid-flow toward either end-state, so keep both reachable.
  var CLICKUP_STATUS_RADIO_BOTH = {
    question:  'Update ClickUp Status?',
    noneLabel: 'No status change',
    options: [
      { value: 'gfe-submitted',       label: 'GFE Submitted' },
      { value: 'final-bid-submitted', label: 'Final Bid Submitted' }
    ]
  };

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
      // Hide entirely in either of:
      //   - no change requests yet — nothing to alt-bid against
      //   - survey already requested (field_2706 = Yes) — at that point
      //     the bid record exists and Update Subcontractor Bid Request takes over
      hideWhen: {
        any: [
          { not: { field: 'field_2728', gt: 0 } },
          { field: 'field_2706', value: 'Yes' }
        ]
      },
      showWhen: {
        all: [
          { field: 'field_2706', value: 'No' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      webhookKey: 'MAKE_OPS_REQUEST_ALT_BID_WEBHOOK',
      // Survey picker — Ops chooses which survey(s) the alt bid
      // request goes to before the notes prompt opens. Selected
      // survey ids land in the webhook payload as
      // selectedSurveyIds[].
      pickSurveys: true,
      modal: {
        title:       'Request Alternative Bid',
        intro:       'Note for the subcontractor (and a heads-up will also post back to Sales that an alternative bid was requested).',
        placeholder: 'e.g. Budget-friendly alternative — fewer cameras in the lot, cheaper NVR',
        submitLabel: 'Send Request'
      },
      includeFullPayload: true
    },
    {
      id: 'update-matching-bid',
      label: 'Update Subcontractor Bid Request',
      tone: 'amber',
      // Mirror image of request-alt-bid — only available once the
      // survey has been requested (field_2706 = Yes). Same payload, same
      // picker UX; Make routes to a different scenario that updates the
      // existing bid record(s) instead of creating a new alt-bid package.
      showWhen: { field: 'field_2706', value: 'Yes' },
      hideWhen: { field: 'field_2706', value: 'No' },
      webhookKey: 'MAKE_OPS_UPDATE_MATCHING_BID_WEBHOOK',
      pickSurveys: true,
      modal: {
        title:       'Update Subcontractor Bid Request',
        intro:       'Note for the subcontractor (Sales will also be notified that the matching bid was updated).',
        placeholder: 'e.g. Updated cabling assumptions per latest survey notes',
        submitLabel: 'Send Update'
      },
      includeFullPayload: true
    },
    {
      id: 'publish-sow-tbd',
      label: 'Publish as SOW only (TBD Labor)',
      tone: 'success',
      // Always available — SOW-only / TBD-labor publishing should be
      // reachable at any point in the workflow, including before Ops
      // has marked the SOW ready or any CRs have queued.
      webhookKey: 'MAKE_OPS_PUBLISH_SOW_TBD_WEBHOOK',
      // Submission options — surfaced as a radio group inside the notes
      // modal. Selected value rides on payload.submission so Make can
      // branch on it. SOW-TBD only offers the Sales submission; the
      // second-set-of-eyes path is GFE / Final only.
      submission: {
        question:   'After publishing, do you want to also submit?',
        noneLabel:  'No — just publish',
        options: [
          { value: 'sales', label: 'Also submit to Sales' }
        ]
      },
      // Optional ClickUp status update — second radio group rendered below
      // submission. Selected value rides on payload.clickupStatus so Make
      // can flip the project task without us caring which CU list/field.
      clickupStatus: CLICKUP_STATUS_RADIO_BOTH,
      modal: {
        title:       'Publish as SOW only (TBD Labor)',
        intro:       'Publishing the SOW with placeholder labor figures.',
        placeholder: 'e.g. SOW finalized, labor pending sub bids',
        submitLabel: 'Publish',
        primaryMode: 'publish-and-notify'
      },
      includeFullPayload: true
    },
    {
      id: 'publish-gfe',
      label: 'Publish Quote as GFE',
      tone: 'success',
      // Always available — GFEs are intentionally generatable at any
      // workflow stage so Sales can stamp something to send out before
      // SOW-ready / CR signals exist.
      webhookKey: 'MAKE_OPS_PUBLISH_GFE_WEBHOOK',
      submission: {
        question:   'After publishing, do you want to also submit?',
        noneLabel:  'No — just publish',
        options: [
          { value: 'sales',      label: 'Also submit to Sales' },
          { value: 'second-set', label: 'Submit to Second Set of Eyes (instead of Sales)' }
        ]
      },
      clickupStatus: CLICKUP_STATUS_RADIO_GFE,
      modal: {
        title:       'Publish Quote as GFE',
        intro:       'Publishing as a Good-Faith Estimate (labor included).',
        placeholder: 'e.g. GFE bundle for client review — final on bid validation',
        submitLabel: 'Publish',
        primaryMode: 'publish-and-notify'
      },
      includeFullPayload: true
    },
    {
      id: 'publish-final',
      label: 'Publish Quote as Final',
      tone: 'success',
      showWhen: {
        any: [
          { field: 'field_2728', gt: 0 },
          { field: 'field_2723', value: 'Yes' }
        ]
      },
      webhookKey: 'MAKE_OPS_PUBLISH_FINAL_WEBHOOK',
      submission: {
        question:   'After publishing, do you want to also submit?',
        noneLabel:  'No — just publish',
        options: [
          { value: 'sales',      label: 'Also submit to Sales' },
          { value: 'second-set', label: 'Submit to Second Set of Eyes (instead of Sales)' }
        ]
      },
      clickupStatus: CLICKUP_STATUS_RADIO_FINAL,
      modal: {
        title:       'Publish Quote as Final',
        intro:       'Publishing the final, fully-priced quote.',
        placeholder: 'e.g. Final bid validated, SCW-1041 total $12,325.99',
        submitLabel: 'Publish',
        primaryMode: 'publish-and-notify'
      },
      includeFullPayload: true
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  // Ops stepper icons. These intentionally diverge from
  // workflow-stepper.js's CIRCLE / CHECK shapes — workflow-stepper
  // represents a sequential build checklist where each step gets ticked
  // off in order. The Ops stepper is six discrete actions Ops can fire
  // independently and sometimes repeatedly (re-publish a quote in a
  // different format, update a matching bid, etc.), so a "step you
  // haven't finished yet" affordance reads wrong here.
  //
  //   ZAP_SVG    — available action (lightning-bolt: "fire this")
  //   CHECK_CIRCLE_SVG — only used by mark-ready, which IS a one-time
  //                      gate (field_2723 flips Yes once and stays)
  //   LOCK_SVG   — locked / unavailable
  //   SPINNER_SVG — webhook in flight
  var ZAP_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
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

      // Submission options (radio group rendered between the textarea
      // and the action buttons for Publish steps).
      '.scw-ops-modal-submission {' +
      '  margin-top: 12px;' +
      '  padding: 10px 12px;' +
      '  background: #f9fafb;' +
      '  border: 1px solid #e5e7eb;' +
      '  border-radius: 6px;' +
      '}' +
      '.scw-ops-modal-submission__q {' +
      '  font-size: 12px; font-weight: 700; color: #374151;' +
      '  letter-spacing: 0.02em;' +
      '  margin-bottom: 8px;' +
      '}' +
      '.scw-ops-modal-submission__opt {' +
      '  display: flex; align-items: center; gap: 8px;' +
      '  padding: 5px 6px; border-radius: 4px;' +
      '  cursor: pointer; font-size: 13px; color: #1f2937;' +
      '}' +
      '.scw-ops-modal-submission__opt:hover { background: #eef2f6; }' +
      '.scw-ops-modal-submission__opt input[type="radio"] {' +
      '  flex-shrink: 0; cursor: pointer; margin: 0;' +
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
      '}' +
      // Survey-picker list (Request Alt Bid step).
      '.scw-ops-modal-list {' +
      '  list-style: none; margin: 0 0 6px; padding: 6px 0;' +
      '  max-height: 340px; overflow-y: auto;' +
      '  border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;' +
      '}' +
      '.scw-ops-modal-list li { padding: 0; }' +
      '.scw-ops-modal-list label {' +
      '  display: flex; align-items: center; gap: 8px;' +
      '  padding: 7px 4px; cursor: pointer;' +
      '  font-size: 13px; color: #1f2937;' +
      '  border-radius: 4px;' +
      '}' +
      '.scw-ops-modal-list label:hover { background: #f3f4f6; }' +
      '.scw-ops-modal-list input[type="checkbox"] { flex-shrink: 0; cursor: pointer; }' +
      '.scw-ops-modal-list .scw-ops-modal-list-all {' +
      '  font-weight: 700; color: #111827; border-bottom: 1px solid #e5e7eb;' +
      '  margin-bottom: 4px; padding-bottom: 8px;' +
      '}' +
      '.scw-ops-modal-list-empty {' +
      '  padding: 16px; text-align: center; color: #6b7280; font-size: 13px;' +
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
    // stepId is the canonical machine-readable discriminator (Make
    // scenarios should branch on this). actionLabel mirrors the
    // visible button text so scenarios don't have to maintain their
    // own id→label map for Slack messages, CU-task descriptions, etc.
    // Both matter when two buttons share a webhook URL — e.g.
    // 'request-alt-bid' and 'update-matching-bid' both fire to
    // MAKE_OPS_REQUEST_ALT_BID_WEBHOOK and the scenario splits on
    // payload.stepId.
    var payload = {
      sourceRecordId: getSourceRecordId(),
      stepId:         step.id,
      actionLabel:    step.label || '',
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
    // Steps that need the standalone publish payload merged in
    // (html / json / totals / etc.). The three publish-* variants all
    // need it (Make formats labor differently per step.id but the rest
    // of the body is identical), and so do mark-ready / request-alt-bid /
    // update-matching-bid because their Make scenarios also produce
    // snapshot quotes alongside the primary action.
    if (step.id === 'mark-ready' ||
        step.id === 'request-alt-bid' ||
        step.id === 'update-matching-bid' ||
        step.id === 'publish-sow-tbd' ||
        step.id === 'publish-gfe' ||
        step.id === 'publish-final' ||
        step.id === 'publish-proposal') {

      // Per-step TBD treatment for the publish html. The three publish
      // variants force their own behavior; everyone else falls back to
      // the field_2725-based default that lives inside proposal-pdf-export.
      //   publish-sow-tbd → ALWAYS TBD (SOW-only quote, labor pending)
      //   publish-gfe     → NEVER TBD  (Good-Faith Estimate, labor shown)
      //   publish-final   → NEVER TBD  (Final, labor shown)
      var tbdMode;
      if (step.id === 'publish-sow-tbd') tbdMode = true;
      else if (step.id === 'publish-gfe' || step.id === 'publish-final') tbdMode = false;
      else tbdMode = undefined;   // default — read field_2725

      payload.publishAsTbd = (tbdMode === true)
        || (tbdMode === undefined && shouldPublishAsTbd());

      try {
        // Pass the proposal scene explicitly — more reliable than
        // auto-detect, and the Ops stepper is only active on scene_1096.
        var pub = window.SCW && SCW.pdfExport && SCW.pdfExport.buildPublishPayload
          ? SCW.pdfExport.buildPublishPayload('scene_1096', { tbdMode: tbdMode })
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
          // GFE callout — big bold panel injected at the top of <body>
          // so it's the first thing the reader sees on the published
          // quote. publishAsGfe is set on the payload so Make can also
          // gate scenario branches on it without parsing the html.
          if (step.id === 'publish-gfe' && typeof payload.html === 'string') {
            payload.publishAsGfe = true;
            payload.html = injectGfeCallout(payload.html);
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

  // ── GFE callout ──────────────────────────────────────────
  // Big bold disclaimer panel injected into the published-quote html
  // in two places: BELOW the SCW logo (first <img> in the body) so it's
  // the first thing the reader sees, and AGAIN below the project-totals
  // block so it stays in view alongside the bottom-line numbers without
  // the reader having to scroll back up. Inline-styled because the
  // published html is consumed by external tools / PDF renderers that
  // may strip or remap classes.
  function injectGfeCallout(html) {
    if (!html || typeof html !== 'string') return html;
    var calloutText = 'This is a Good Faith Estimate based on the ' +
      'information provided. Final pricing may change following a Site ' +
      'Survey, including but not limited to adjustments for site ' +
      'conditions, access requirements, or changes to project scope.';
    var callout =
      '<div style="' +
        'margin: 28px 0;' +
        'padding: 22px 24px;' +
        'background: #fef3c7;' +
        'border: 2px solid #d97706;' +
        'border-radius: 8px;' +
        'color: #78350f;' +
        'font: 700 15px/1.4 "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;' +
        'text-align: center;' +
      '">' +
        '<div style="' +
          'font-size: 12px; font-weight: 800; letter-spacing: 0.08em;' +
          'text-transform: uppercase; margin-bottom: 6px; opacity: 0.85;' +
        '">Good Faith Estimate</div>' +
        calloutText +
      '</div>';

    // ── Top placement: after the SCW logo ──
    // Anchor to the closing </div> of the block that holds the first
    // <img> (the Knack `.detail-label-none` wrapper that proposal-pdf-
    // export.js renders the logo into). Closing it cleanly puts the
    // callout between the logo row and the project-name heading without
    // ever splitting an element.
    var inserted = false;
    var imgMatch = html.match(/<img\b[^>]*>/i);
    if (imgMatch) {
      var imgEnd = imgMatch.index + imgMatch[0].length;
      var divCloseIdx = html.indexOf('</div>', imgEnd);
      if (divCloseIdx >= 0) {
        var insertAt = divCloseIdx + '</div>'.length;
        html = html.slice(0, insertAt) + callout + html.slice(insertAt);
        inserted = true;
      }
    }
    // Fallback for the top placement: inject immediately after <body…>
    // if no <img> anchor was found (no logo on this proposal — rare).
    if (!inserted) {
      var bodyOpen = html.match(/<body\b[^>]*>/i);
      if (bodyOpen) {
        var bIdx = bodyOpen.index + bodyOpen[0].length;
        html = html.slice(0, bIdx) + callout + html.slice(bIdx);
      } else {
        // Final fallback: fragment with no <body>, just prepend.
        html = callout + html;
      }
    }

    // ── Bottom placement: under the project-totals block ──
    // proposal-pdf-export.js wraps the totals in
    // `<div class="project-totals">…</div>`. Find that opening tag and
    // walk forward to its matching closing tag (the next `</div>` after
    // the opener — the totals body uses `<div class="pt-line">` children
    // but those each close their own div before the wrapper's close).
    // To be safe against nested children, count opens vs. closes.
    var totalsOpen = html.match(/<div\b[^>]*class="[^"]*\bproject-totals\b[^"]*"[^>]*>/i);
    if (totalsOpen) {
      var scanFrom = totalsOpen.index + totalsOpen[0].length;
      var depth = 1;
      var i = scanFrom;
      while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<div', i);
        var nextClose = html.indexOf('</div>', i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          i = nextOpen + 4;
        } else {
          depth--;
          i = nextClose + '</div>'.length;
          if (depth === 0) {
            html = html.slice(0, i) + callout + html.slice(i);
            break;
          }
        }
      }
    }

    return html;
  }

  // ── Notes prompt modal ───────────────────────────────────
  // ── Survey picker modal ─────────────────────────────────
  // Reads the available surveys from view_3897, displays them as a
  // multi-select list (with a Select-All toggle), and calls onPick
  // with the array of selected survey-record ids. onCancel fires
  // when the user dismisses without picking. Used by Request Alt Bid
  // so Ops can target a single sub or fan the request out to all.
  function openSurveyPickerModal(opts, onPick, onCancel) {
    opts = opts || {};
    var surveys = readSurveyOptions();

    var overlay = document.createElement('div');
    overlay.className = 'scw-ops-modal-overlay';

    var card = document.createElement('div');
    card.className = 'scw-ops-modal';

    var hdr = document.createElement('div');
    hdr.className = 'scw-ops-modal-hdr';
    hdr.textContent = opts.title || 'Pick survey(s)';
    card.appendChild(hdr);

    if (opts.intro) {
      var intro = document.createElement('div');
      intro.className = 'scw-ops-modal-intro';
      intro.textContent = opts.intro;
      card.appendChild(intro);
    }

    var list = document.createElement('ul');
    list.className = 'scw-ops-modal-list';

    if (!surveys.length) {
      var empty = document.createElement('li');
      empty.className = 'scw-ops-modal-list-empty';
      empty.textContent = 'No surveys available for this SOW.';
      list.appendChild(empty);
    } else {
      // Select-All toggle row.
      var allLi = document.createElement('li');
      allLi.className = 'scw-ops-modal-list-all';
      var allLbl = document.createElement('label');
      var allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.setAttribute('data-id', '__all__');
      allLbl.appendChild(allCb);
      var allTxt = document.createElement('span');
      allTxt.textContent = 'Select all (' + surveys.length + ')';
      allLbl.appendChild(allTxt);
      allLi.appendChild(allLbl);
      list.appendChild(allLi);

      surveys.forEach(function (s) {
        var li = document.createElement('li');
        var lbl = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-id', s.id);
        lbl.appendChild(cb);
        var txt = document.createElement('span');
        txt.textContent = s.label;
        lbl.appendChild(txt);
        li.appendChild(lbl);
        list.appendChild(li);
      });

      allCb.addEventListener('change', function () {
        var on = allCb.checked;
        var rows = list.querySelectorAll('input[type="checkbox"][data-id]:not([data-id="__all__"])');
        for (var i = 0; i < rows.length; i++) rows[i].checked = on;
        refreshSubmitState();
      });
      list.addEventListener('change', function (e) {
        if (e.target === allCb) return;
        if (e.target.tagName !== 'INPUT') return;
        // Sync the all-toggle state based on individual selections.
        var rows = list.querySelectorAll('input[type="checkbox"][data-id]:not([data-id="__all__"])');
        var checkedCount = 0;
        for (var i = 0; i < rows.length; i++) if (rows[i].checked) checkedCount++;
        allCb.checked = (checkedCount === rows.length && rows.length > 0);
        refreshSubmitState();
      });
    }

    card.appendChild(list);

    var actions = document.createElement('div');
    actions.className = 'scw-ops-modal-actions';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-ops-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'scw-ops-modal-submit';
    submitBtn.textContent = opts.submitLabel || 'Continue';
    submitBtn.disabled = true; // until at least one survey is checked
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close(viaCancel) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', escListener);
      if (viaCancel && typeof onCancel === 'function') onCancel();
    }
    function escListener(e) {
      if (e.key === 'Escape') close(true);
    }
    function refreshSubmitState() {
      var picked = list.querySelectorAll(
        'input[type="checkbox"][data-id]:checked:not([data-id="__all__"])'
      );
      submitBtn.disabled = picked.length === 0;
    }

    cancelBtn.addEventListener('click', function () { close(true); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close(true);
    });
    document.addEventListener('keydown', escListener);
    submitBtn.addEventListener('click', function () {
      var picked = list.querySelectorAll(
        'input[type="checkbox"][data-id]:checked:not([data-id="__all__"])'
      );
      var ids = [];
      for (var i = 0; i < picked.length; i++) ids.push(picked[i].getAttribute('data-id'));
      if (!ids.length) return;
      close(false);
      onPick(ids, surveys);
    });
  }

  /** Read the survey records from view_3897's model and return
   *  { id, label } pairs for the picker. Label is the concatenation
   *  of field_2347 (subcontractor) and field_2345 (survey identifier),
   *  separated by a middle-dot. Falls back to record id if neither
   *  field has data. */
  function readSurveyOptions() {
    var out = [];
    try {
      var v = Knack && Knack.views && Knack.views[SURVEY_PICKER_VIEW];
      var data = v && v.model && v.model.data;
      var models = (data && data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var attrs = models[i].attributes || models[i];
        if (!attrs || !attrs.id) continue;
        var sub   = readDisplayValue(attrs, PICKER_SUB_FIELD);
        var label = readDisplayValue(attrs, PICKER_LABEL_FIELD);
        var combined = [sub, label].filter(Boolean).join(' · ') || attrs.id;
        out.push({ id: attrs.id, label: combined, sub: sub, surveyLabel: label });
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  /** Resolve a Knack field's display string from a model attrs object.
   *  Prefers the connection identifier (_raw[0].identifier) for
   *  connection fields, falls back to stripped HTML from the bare
   *  field. Returns '' when the field is empty. */
  function readDisplayValue(attrs, fieldKey) {
    if (!attrs) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].identifier) {
      return String(raw[0].identifier).trim();
    }
    if (raw && typeof raw === 'object' && raw.identifier) {
      return String(raw.identifier).trim();
    }
    var v = attrs[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

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

    // Build a single radio-group section (question + "no" default +
    // one entry per option). Returns { element, getValue } or null when
    // the config is missing/empty so we can no-op cheaply.
    function buildRadioGroup(config) {
      if (!config || !Array.isArray(config.options) || !config.options.length) return null;
      var groupName = 'scw-ops-radio-' + Math.random().toString(36).slice(2, 9);

      var wrap = document.createElement('div');
      wrap.className = 'scw-ops-modal-submission';

      var q = document.createElement('div');
      q.className = 'scw-ops-modal-submission__q';
      q.textContent = config.question || '';
      wrap.appendChild(q);

      function addOption(value, label, isDefault) {
        var optLbl = document.createElement('label');
        optLbl.className = 'scw-ops-modal-submission__opt';
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = groupName;
        radio.value = value;
        if (isDefault) radio.checked = true;
        var span = document.createElement('span');
        span.textContent = label;
        optLbl.appendChild(radio);
        optLbl.appendChild(span);
        wrap.appendChild(optLbl);
      }
      addOption('', config.noneLabel || 'No', true);
      config.options.forEach(function (o) { addOption(o.value, o.label, false); });

      var radios = wrap.querySelectorAll('input[type="radio"]');
      return {
        element: wrap,
        getValue: function () {
          for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) return radios[i].value || null;
          }
          return null;
        }
      };
    }

    // Submission options — also-submit-to-Sales / Second Set / no.
    var submissionGroup = buildRadioGroup(opts.submission);
    if (submissionGroup) card.appendChild(submissionGroup.element);

    // ClickUp status — independent radio group, rendered beneath
    // submission. Selected value rides on ctx.clickupStatus.
    var clickupGroup = buildRadioGroup(opts.clickupStatus);
    if (clickupGroup) card.appendChild(clickupGroup.element);

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
        mode: opts.primaryMode || null,
        submission:    submissionGroup ? submissionGroup.getValue() : null,
        clickupStatus: clickupGroup    ? clickupGroup.getValue()    : null
      });
    });
    if (secondaryBtn) {
      secondaryBtn.addEventListener('click', function () {
        err.style.display = 'none';
        var notes = (ta.value || '').trim();
        onSubmit(notes, {
          setSubmitting: setSubmitting, showError: showError, close: close,
          mode: opts.secondaryMode || null,
          submission:    submissionGroup ? submissionGroup.getValue() : null,
          clickupStatus: clickupGroup    ? clickupGroup.getValue()    : null
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

    // Steps that target a subset of surveys (Request Alt Bid) ask
    // the user to pick first, then fall through to the standard
    // notes prompt with the picked ids in scope.
    if (step.pickSurveys) {
      openSurveyPickerModal({
        title: 'Choose survey(s) for the alt bid',
        intro: 'Pick one or more subcontractors. The alt bid request will be sent to each selected survey separately.',
        submitLabel: 'Continue'
      }, function (selectedSurveyIds, surveyOptions) {
        runNotesPromptAndFire(step, btn, url, selectedSurveyIds, surveyOptions);
      });
      return;
    }

    runNotesPromptAndFire(step, btn, url, null, null);
  }

  function runNotesPromptAndFire(step, btn, url, selectedSurveyIds, surveyOptions) {
    // Merge step-level submission options onto the modal opts so the
    // notes-prompt modal can render the radio group when present. Keeps
    // the data on the step (where the rest of the step config lives)
    // instead of cluttering step.modal.
    var modalOpts = $.extend({}, step.modal, {
      submission:    step.submission    || null,
      clickupStatus: step.clickupStatus || null
    });
    openNotesPromptModal(modalOpts, function (notes, ctx) {
      ctx.setSubmitting(true);
      setBtnLoading(btn, true);
      // mode is meaningful only when the user actually opted into a
      // submission. The publish-* steps set primaryMode='publish-and-notify'
      // on their modal so the Submit button has a default action, but if
      // the user picks "No — just publish" on the radio, ctx.submission
      // is null and 'publish-and-notify' would be misleading on the
      // payload. Null it out in that case so Make's scenario can read
      // payload.mode as the source of truth alongside payload.submission.
      var effectiveMode = (step.submission && !ctx.submission) ? null : ctx.mode;
      var payload = buildPayload(step, notes, effectiveMode);
      // Selected submission option ('sales' / 'second-set' / null).
      // Make's scenario branches on this — it's orthogonal to step.id
      // (which webhook to fire) and to mode (publish-and-notify, etc.).
      if (ctx.submission)    payload.submission    = ctx.submission;
      // ClickUp status update ('gfe-submitted' / 'final-bid-submitted' /
      // null). Independent of submission — the user can pick any combo.
      if (ctx.clickupStatus) payload.clickupStatus = ctx.clickupStatus;
      if (selectedSurveyIds && selectedSurveyIds.length) {
        payload.selectedSurveyIds = selectedSurveyIds;
        // Echo the labels Ops actually saw in the picker so Make
        // doesn't have to re-derive them when, e.g., posting a
        // confirmation Slack message.
        if (surveyOptions && surveyOptions.length) {
          var byId = {};
          for (var i = 0; i < surveyOptions.length; i++) byId[surveyOptions[i].id] = surveyOptions[i];
          payload.selectedSurveys = selectedSurveyIds
            .map(function (id) { return byId[id]; })
            .filter(Boolean);
        }
      }

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
      if (icon) icon.innerHTML = ZAP_SVG;
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
                     : available ? ZAP_SVG
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
