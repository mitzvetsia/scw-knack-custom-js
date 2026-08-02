/*** WORKFLOW STEPPER — unified step states on scene_1116 ***/
(function () {
  'use strict';

  var NS = '.scwStepper';
  var STYLE_ID = 'scw-workflow-stepper-css';
  var SCENE_ID = 'scene_1116';
  var SOURCE_VIEW = 'view_3827';

  // ── Step definitions ─────────────────────────────────────
  var STEPS = [
    {
      type: 'accordion',
      viewKey: 'view_2924',
      label: 'Project Playbook',
      completed: { field: 'field_2724', value: 'Yes' }
    },
    {
      // Renamed 2026-08-02 (docs/project-stage-workflow.md): initiation now
      // ALWAYS means "please validate this SOW" — the Make scenario behind
      // the form sends the Ops validation ping alongside project setup.
      // Mechanics are unchanged: same form (menu view_3828), same
      // field_1199 poll, same view_3491 refresh.
      type: 'action',
      id: 'initiate-install',
      label: 'Request SOW Validation Only (request survey later)',
      menuView: 'view_3828',
      insertAfter: 'view_2924',
      // ⚠️ Completion proxy: field_1199 (CU project link) signals "project
      // submitted to Ops", which coincides with "validation requested" for
      // the FIRST SOW but not for alternatives (a clone may copy — or not
      // copy — field_1199, and neither means validation was asked for THIS
      // SOW). TODO(validation-requested stamp): once Builder gains a
      // per-SOW "DATE_validation requested" field written by every Make
      // scenario that carries the validation ask, key `completed` (and the
      // pollAfterClick exit) on that stamp instead of field_1199.
      // field_2723 = Yes also completes it — Ops validating makes the
      // request moot.
      completed: {
        any: [
          { field: 'field_1199', hasValue: true },
          { field: 'field_2723', value: 'Yes' }
        ]
      },
      lockWhenCompleted: true,
      // Array form: first matching entry wins. NOTE this step must ALWAYS
      // exist in the DOM (scene-tweaks.js uses #scw-step-initiate-install
      // as a scene-reveal marker) — so state gating here locks, never
      // hides (no showWhen).
      disabled: [
        { when: { field: 'field_2724', notValue: 'Yes' },
          message: 'Complete the Project Playbook first' },
        // Sibling SOW already has the survey (change-request path): the
        // right ask is the alternative-bid action below, not a plain
        // validation request.
        { when: { all: [ { field: 'field_2728', gt: 0 },
                         { field: 'field_2706', notValue: 'Yes' } ] },
          message: 'Use "Request Validation & Add as Alternative Bid" below' }
      ],
      // Once fired, show the waiting state until Ops validates (or the
      // flow advances via survey / change-request paths).
      completedMessage: {
        when: {
          all: [
            { field: 'field_2723', notValue: 'Yes' },
            { field: 'field_2706', notValue: 'Yes' },
            { not: { field: 'field_2728', gt: 0 } }
          ]
        },
        text: 'Validation requested — waiting on Ops'
      },
      // When the Make automation finishes (field_1199 populated), refresh
      // these views so their DOM reflects the new install-project state
      // (e.g. view_3491's Clickup task / project link) without a manual reload.
      refreshViewsOnComplete: ['view_3491'],
      // After the user clicks → submits the form → returns here, Make
      // takes a few seconds to populate field_1199 with the install
      // project link. Lock the action and poll view_3827 until that
      // field appears so the user can't double-fire the action and the
      // step transitions to "completed" automatically.
      pollAfterClick: {
        pendingLabel: 'Setting up project & requesting validation — please wait…',
        pollMs:       4000,
        timeoutMs:    120 * 1000
      }
    },
    // The standalone "Request SOW validated as ready for Survey" step was
    // REMOVED 2026-08-02: both remaining sales actions ARE validation
    // requests (docs/project-stage-workflow.md), so the notify-only side
    // channel (MAKE_REQUEST_SOW_VALIDATION_WEBHOOK + localStorage
    // requestedState) is retired.
    {
      type: 'accordion',
      viewKey: 'view_3853',
      label: 'Request Site Survey',
      // Dynamic header label (2026-08-02): the SAME form serves both
      // paths — Make branches on the SOW's validation state at submission
      // time (docs/project-stage-workflow.md).
      //   field_2723 != Yes → "Validate SOW & Request Survey" (Make
      //     creates the REQ as Pending Validation, pings Ops, and runs
      //     project setup when field_1199 is empty; the survey fires when
      //     Ops marks ready)
      //   field_2723 = Yes  → "Request Survey" (fires immediately — the
      //     original behavior)
      // First matching entry wins; a no-`when` entry is the fallback.
      // Once the step is completed (survey requested here or on a
      // sibling), fall back to the neutral historical label so a done
      // step never reads as an offer.
      dynamicLabel: [
        { when: { any: [ { field: 'field_2706', value: 'Yes' },
                         { field: 'field_2728', gt: 0 } ] },
          label: 'Request Site Survey' },
        { when: { field: 'field_2723', notValue: 'Yes' }, label: 'Validate SOW & Request Survey' },
        { label: 'Request Survey' }
      ],
      // Complete if the survey has been requested (field_2706 = Yes)
      // OR if there are any change requests queued (field_2728 > 0),
      // since the workflow has advanced past the initial survey step.
      completed: {
        any: [
          { field: 'field_2706', value: 'Yes' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      lockWhenCompleted: true,
      // When the step is completed via the change-request path (i.e.
      // the survey was actually requested on a sibling SOW), surface
      // an info note linking back to that SOW. The {link} token pulls
      // the connection's identifier + record-id from field_2329 on
      // view_3876, then builds an href by swapping the second record-id
      // in the current URL hash (the SOW slot) for the linked record id.
      completedMessage: {
        when: { field: 'field_2728', gt: 0 },
        text: 'Survey Requested on {link}',
        link: { view: 'view_3876', field: 'field_2329' }
      },
      // Ungated except for the Playbook (was: locked on field_2723 with
      // "Waiting on Ops to validate SOW"). Pre-validation submits are
      // legitimate now — Make's branch decides pending-vs-fire.
      disabled: { field: 'field_2724', notValue: 'Yes', message: 'Complete the Project Playbook first' },
      // Info note while unvalidated so Sales knows the survey won't reach
      // the sub until Ops signs off.
      // TODO(pending-REQ rollup): once the Builder rollup field (count of
      // Pending Validation REQs) exists on view_3827, add an armed state
      // here — "Survey request armed — sends when Ops validates" — keyed
      // on it, IF discovery shows field_2706 does NOT flip on a pending
      // submit. If field_2706 flips at submit regardless, the completed
      // gate above already covers it.
      activeMessage: {
        when: { field: 'field_2723', notValue: 'Yes' },
        text: 'Sent after Ops validates the SOW'
      }
    },
    {
      type: 'action',
      id: 'review-site-survey',
      label: 'Review Site Survey Report',
      // Route to the new survey-report-page (the old view_3862 menu
      // pointed at the deprecated site-survey-report-deprecated route).
      // This step fully replaces that menu view, so hide it — but
      // DON'T source the href from it (hideMenuView, not menuView),
      // otherwise resolveHref could fall back to the deprecated route.
      hrefTemplate: '#survey-report-page/site-survey-report/{sowId}/',
      hideMenuView: 'view_3862',
      insertAfter: 'view_3853',
      activeIcon: 'eye',
      newTab: true,
      // Locked only when the survey hasn't been requested AND the
      // workflow hasn't advanced via the change-request path (field_2728 > 0).
      disabled: {
        all: [
          { field: 'field_2706', notValue: 'Yes' },
          { not: { field: 'field_2728', gt: 0 } }
        ],
        message: 'Site survey not yet requested'
      }
    },
    {
      // STATE 3 (docs/project-stage-workflow.md gating): a SIBLING SOW has
      // the survey (field_2728 > 0) and THIS SOW doesn't (field_2706 = No)
      // — the one sales ask is "validate this SOW and add it to that
      // survey as an alternative bid". Click opens a notes-prompt modal →
      // MAKE_REQUEST_ALT_PROPOSAL_WEBHOOK (payload now carries stepId so
      // Make can treat it as a validation request too).
      type: 'action',
      id: 'request-alternative-proposal',
      label: 'Request Alternative Proposal',
      // Validation state decides how much the ask claims to do.
      dynamicLabel: [
        { when: { field: 'field_2723', notValue: 'Yes' },
          label: 'Request Validation & Add as Alternative Bid to Survey' },
        { label: 'Request Addition to Survey as Alternative Bid' }
      ],
      insertAfterStepId: 'review-site-survey',
      webhookAction: 'requestAlternativeProposal',
      showWhen: {
        all: [
          { field: 'field_2728', gt: 0 },
          { field: 'field_2706', value: 'No' }
        ]
      }
    },
    {
      // STATE 4: the survey lives on THIS SOW (field_2706 = Yes) and
      // changes have queued since (field_2728 > 0) — sales asks for the
      // surveyed bid package to be brought back in line with the SOW.
      // Sales-side mirror of Ops's "Update Subcontractor Bid Request".
      type: 'action',
      id: 'request-bid-update-to-match',
      label: 'Request Survey Bid Updated to Match SOW',
      insertAfterStepId: 'request-alternative-proposal',
      webhookAction: 'requestBidUpdate',
      showWhen: {
        all: [
          { field: 'field_2706', value: 'Yes' },
          { field: 'field_2728', gt: 0 }
        ]
      }
    },
    {
      // Navigates to the currently-published-proposal details page.
      // Scrapes the href from view_3814's first "View Published Proposal"
      // row link — same source the totals panel's proposal block uses.
      type: 'action',
      id: 'review-final-proposal',
      label: 'Review Completed Proposal',
      insertAfterStepId: 'request-bid-update-to-match',
      hrefSelector: '#view_3814 tbody tr a.kn-link-page',
      activeIcon: 'eye',
      newTab: true,
      disabled: { field: 'field_2725', notValue: 'Yes', message: 'Not yet released to Sales' }
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  var CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';

  var CHECK_CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
    '<polyline points="22 4 12 14.01 9 11.01"/></svg>';

  var EYE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  var LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // Animated spinner used while a pollAfterClick step is waiting for
  // a Make automation to populate the field that flips it to completed.
  var SPIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'class="scw-step-spin">' +
    '<path d="M12 2a10 10 0 1 0 10 10" />' +
    '</svg>';

  var LOCK_SM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  var INFO_SM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  var COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── CSS ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      /* ── Fix empty Knack column in view-group-4 ── */
      '#kn-scene_1116 .view-group-4 > .view-column:empty {' +
      '  display: none !important;' +
      '}' +

      /* ── Completed accordion ── */
      '.scw-step-completed .scw-acc-icon { color: #16a34a !important; opacity: 1 !important; }' +

      /* ── Disabled accordion ── */
      '.scw-step-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-disabled .scw-ktl-accordion__header { cursor: default; }' +
      '.scw-step-disabled .scw-acc-icon { color: #94a3b8 !important; }' +
      /* Completed + locked accordion: keep full opacity + green icon,
         still block clicks. Same spirit as action-step variant. */
      '.scw-step-completed.scw-step-disabled {' +
      '  opacity: 1; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-acc-icon {' +
      '  color: #16a34a !important; opacity: 1 !important;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-ktl-accordion__header {' +
      '  cursor: default;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-acc-chevron {' +
      '  display: none !important;' +
      '}' +

      /* ── Disabled message (inline in header/step) ── */
      '.scw-step-disabled-msg {' +
      '  display: flex; align-items: center; gap: 5px;' +
      '  font-size: 11px; color: #94a3b8; font-weight: 500;' +
      '  margin-left: auto; flex-shrink: 0; white-space: nowrap;' +
      '}' +
      /* Token-expanded anchor inside the header message. */
      '.scw-step-msg-link {' +
      '  color: #2563eb; text-decoration: underline;' +
      '  pointer-events: auto; cursor: pointer;' +
      '}' +
      '.scw-step-msg-link:hover { color: #1d4ed8; }' +
      /* Even when the host step has pointer-events:none (locked-by-
         completion), the inline link stays clickable. */
      '.scw-step-completed.scw-step-disabled .scw-step-msg-link,' +
      '.scw-step-action.is-completed.is-disabled .scw-step-msg-link {' +
      '  pointer-events: auto; cursor: pointer;' +
      '}' +

      /* ── Action step row (matches accordion header) ── */
      '.scw-step-action {' +
      '  position: relative; display: flex; align-items: center;' +
      '  width: 100%; min-height: 44px;' +
      '  padding: 14px 16px 14px 22px;' +
      '  background: #fff; cursor: pointer; user-select: none;' +
      '  box-sizing: border-box; transition: background 180ms ease;' +
      '  border: 1px solid #e5e7eb; border-radius: 14px;' +
      '  margin-bottom: 8px; text-decoration: none; color: inherit;' +
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
      '  text-overflow: ellipsis;' +
      '}' +

      /* ── Action step states ── */
      '.scw-step-action.is-completed {' +
      '  --scw-step-accent: #16a34a;' +
      '}' +
      '.scw-step-action.is-completed .scw-step-icon { color: #16a34a; opacity: 1; }' +
      '.scw-step-action.is-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-action.is-disabled .scw-step-icon { color: #94a3b8; opacity: 1; }' +
      // Processing state — locked while a Make automation runs after
      // the user clicks. Keep full opacity (so it doesn't read as
      // "disabled / unavailable"), block clicks, and spin the icon.
      '.scw-step-action.is-processing {' +
      '  opacity: 1; pointer-events: none; cursor: wait;' +
      '  background: rgba(41,95,145,0.04);' +
      '}' +
      '.scw-step-action.is-processing .scw-step-icon { color: #295F91; opacity: 1; }' +
      '.scw-step-action.is-processing .scw-step-title { color: #295F91; font-style: italic; }' +
      '.scw-step-spin { animation: scw-step-spin 0.8s linear infinite; transform-origin: 50% 50%; }' +
      '@keyframes scw-step-spin { to { transform: rotate(360deg); } }' +
      /* Completed + locked (no re-trigger): keep normal appearance,
         only block clicks. No opacity fade, no gray icon. */
      '.scw-step-action.is-completed.is-disabled {' +
      '  opacity: 1; cursor: default; pointer-events: none;' +
      '}' +
      '.scw-step-action.is-completed.is-disabled .scw-step-icon {' +
      '  color: #16a34a; opacity: 1;' +
      '}' +
      /* Webhook in-flight spinner */
      '.scw-step-action.is-loading {' +
      '  pointer-events: none; opacity: 0.75; cursor: wait;' +
      '}' +
      '.scw-step-action.is-loading .scw-step-icon svg {' +
      '  animation: scw-step-spin 0.8s linear infinite;' +
      '}' +
      '@keyframes scw-step-spin { to { transform: rotate(360deg); } }' +

      /* ── Notes-prompt modal ───────────────────────────── */
      '.scw-step-modal-overlay {' +
      '  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);' +
      '  z-index: 10000; display: flex; align-items: center; justify-content: center;' +
      '  padding: 20px;' +
      '}' +
      '.scw-step-modal {' +
      '  background: #fff; border-radius: 10px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);' +
      '  width: 100%; max-width: 520px; padding: 22px;' +
      '  display: flex; flex-direction: column; gap: 12px;' +
      '  font-family: inherit;' +
      '}' +
      '.scw-step-modal-hdr {' +
      '  font-size: 17px; font-weight: 700; color: #0f172a;' +
      '}' +
      '.scw-step-modal-intro {' +
      '  margin: 0; font-size: 13px; color: #475569; line-height: 1.4;' +
      '}' +
      '.scw-step-modal-textarea {' +
      '  width: 100%; box-sizing: border-box; font-family: inherit;' +
      '  font-size: 13px; line-height: 1.4; padding: 8px 10px;' +
      '  border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical;' +
      '  min-height: 100px;' +
      '}' +
      '.scw-step-modal-textarea:focus {' +
      '  outline: none; border-color: #2563eb;' +
      '  box-shadow: 0 0 0 2px rgba(37,99,235,0.2);' +
      '}' +
      '.scw-step-modal-error {' +
      '  font-size: 12px; color: #b91c1c; background: #fee2e2;' +
      '  border: 1px solid #fecaca; border-radius: 6px; padding: 8px 10px;' +
      '  white-space: pre-wrap; word-break: break-word;' +
      '}' +
      '.scw-step-modal-actions {' +
      '  display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;' +
      '}' +
      '.scw-step-modal-cancel, .scw-step-modal-submit {' +
      '  font-family: inherit; font-size: 13px; font-weight: 600;' +
      '  padding: 8px 14px; border-radius: 6px; cursor: pointer;' +
      '  border: 1px solid transparent; transition: all 0.15s ease;' +
      '}' +
      '.scw-step-modal-cancel {' +
      '  background: #fff; color: #475569; border-color: #cbd5e1;' +
      '}' +
      '.scw-step-modal-cancel:hover:not(:disabled) { background: #f1f5f9; }' +
      '.scw-step-modal-submit {' +
      '  background: #2563eb; color: #fff;' +
      '}' +
      '.scw-step-modal-submit:hover:not(:disabled) { background: #1d4ed8; }' +
      '.scw-step-modal-cancel:disabled, .scw-step-modal-submit:disabled {' +
      '  opacity: 0.6; cursor: wait;' +
      '}' +

      /* ── Hide original menu view ── */
      '.scw-step-menu-hidden { display: none !important; }';

    // Hide any view a step fully replaces but doesn't source its href
    // from (step.hideMenuView). CSS-based + view-id selector so there's
    // no render-timing flash when the orphaned menu view repaints — a
    // JS-only hide would have to chase every re-render of that view.
    var deadViews = STEPS
      .filter(function (s) { return s.hideMenuView; })
      .map(function (s) { return '#' + s.hideMenuView; });
    if (deadViews.length) {
      style.textContent += '\n' + deadViews.join(',') + ' { display: none !important; }';
    }

    document.head.appendChild(style);
  }

  // ── Read field value from the source view ────────────────
  // Prefer the Knack model attributes: onFormSubmit calls model.fetch(),
  // which refreshes the model with record-rule updates (e.g. field_2724
  // flipping to Yes), but a bare fetch does NOT re-render the detail view's
  // DOM — so reading the DOM alone returns the stale pre-submit value and
  // the stepper never advances. Fall back to the DOM when the model isn't
  // available or doesn't carry the field.
  function readField(fieldKey) {
    try {
      var v = Knack && Knack.views && Knack.views[SOURCE_VIEW];
      var attrs = v && v.model && v.model.attributes;
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, fieldKey)) {
        var raw = attrs[fieldKey];
        if (raw == null) return '';
        return String(raw).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }
    } catch (e) { /* fall back to DOM */ }
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').trim();
    return '';
  }

  // ── Check a condition ────────────────────────────────────
  function conditionMet(cond) {
    if (!cond) return false;

    // Compound: all of the child conditions must match (AND)
    if (Array.isArray(cond.all)) return cond.all.every(conditionMet);
    // Compound: any of the child conditions must match (OR)
    if (Array.isArray(cond.any)) return cond.any.some(conditionMet);
    // Negation: passes when the wrapped condition does NOT match
    if (cond.not) return !conditionMet(cond.not);

    var val = readField(cond.field);
    if (cond.hasValue)  return val.length > 0;
    if (cond.value    !== undefined) return val.toLowerCase() === String(cond.value).toLowerCase();
    if (cond.notValue !== undefined) return val.toLowerCase() !== String(cond.notValue).toLowerCase();

    // Numeric comparisons — parse the field value as a float. Returns
    // false on non-numeric values so a missing/blank field never passes.
    if (cond.gt  !== undefined) { var n1 = parseFloat(val); return !isNaN(n1) && n1 >  cond.gt;  }
    if (cond.gte !== undefined) { var n2 = parseFloat(val); return !isNaN(n2) && n2 >= cond.gte; }
    if (cond.lt  !== undefined) { var n3 = parseFloat(val); return !isNaN(n3) && n3 <  cond.lt;  }
    if (cond.lte !== undefined) { var n4 = parseFloat(val); return !isNaN(n4) && n4 <= cond.lte; }

    return false;
  }

  // ── Find accordion wrapper by inner view key ─────────────
  function findAccordion(viewKey) {
    var hdr = document.querySelector('.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]');
    return hdr ? hdr.closest('.scw-ktl-accordion') : null;
  }

  // ── Extract link href from a menu view ───────────────────
  function getMenuHref(menuViewId) {
    var menu = document.getElementById(menuViewId);
    if (!menu) return '';
    var link = menu.querySelector('a.kn-link-page, a.kn-link');
    return link ? (link.getAttribute('href') || '') : '';
  }

  // ── Resolve the click href for a step ────────────────────
  // Priority: step.hrefSelector (arbitrary CSS selector, scrapes the
  // first match's href) > step.menuView (hidden Knack menu view).
  // Used so a step can point at, e.g., a row inside a table view
  // rather than a single-link menu view.
  function resolveHref(step) {
    if (step.hrefTemplate) {
      var sowId = '';
      try {
        var v = Knack && Knack.views && Knack.views[SOURCE_VIEW];
        sowId = (v && v.model && (v.model.id || (v.model.attributes && v.model.attributes.id))) || '';
      } catch (e) { /* ignore */ }
      if (sowId) return step.hrefTemplate.replace('{sowId}', sowId);
    }
    if (step.hrefSelector) {
      var el = document.querySelector(step.hrefSelector);
      if (el) return el.getAttribute('href') || '';
    }
    if (step.menuView) return getMenuHref(step.menuView);
    return '';
  }

  // ── Build a standalone action step element ───────────────
  function buildActionStep(step) {
    var el = document.createElement('a');
    el.id = 'scw-step-' + step.id;
    el.className = 'scw-step-action';

    if (step.webhookAction) {
      el.href = 'javascript:void(0)';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.classList.contains('is-loading') ||
            el.classList.contains('is-disabled')) return;
        var handler = WEBHOOK_ACTIONS[step.webhookAction];
        if (handler) handler(step, el);
      });
    } else {
      var href = resolveHref(step);
      if (href) el.href = href;
      if (step.newTab) {
        el.target = '_blank';
        el.rel = 'noopener';
      }
      // pollAfterClick steps: stamp a per-SOW flag the moment the
      // user clicks. The browser then navigates to the form view as
      // normal; when the user returns, applyActionState sees the
      // flag and locks the step into "processing" + starts polling.
      // Block the click outright if we're already processing or
      // disabled so a double-tap doesn't navigate twice.
      if (step.pollAfterClick) {
        el.addEventListener('click', function (e) {
          if (el.classList.contains('is-disabled') ||
              el.classList.contains('is-processing')) {
            e.preventDefault();
            return;
          }
          setPollFlag(step.id);
        });
      }
    }

    var icon = document.createElement('span');
    icon.className = 'scw-step-icon';
    icon.innerHTML = CIRCLE_SVG;
    el.appendChild(icon);

    var title = document.createElement('span');
    title.className = 'scw-step-title';
    title.textContent = step.label;
    el.appendChild(title);

    return el;
  }

  // ── Resolve the insertion anchor for an action step ──────
  // `insertAfter` points to an accordion by inner viewKey;
  // `insertAfterStepId` points to another action step by id.
  // Walk backwards through STEPS from the given step, returning the
  // first rendered DOM element (action-step or accordion wrapper).
  // Used as a fallback when insertAfterStepId points at a step that
  // isn't currently in the DOM (showWhen gated it out).
  function nearestRenderedPredecessor(step) {
    var idx = -1;
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i] === step) { idx = i; break; }
    }
    if (idx < 0) return null;
    for (var j = idx - 1; j >= 0; j--) {
      var prev = STEPS[j];
      if (prev.type === 'action') {
        var prevEl = document.getElementById('scw-step-' + prev.id);
        if (prevEl) return prevEl;
      } else if (prev.type === 'accordion') {
        var acc = findAccordion(prev.viewKey);
        if (acc) return acc;
      }
    }
    return null;
  }

  function findInsertAnchor(step) {
    if (step.insertAfterStepId) {
      var el = document.getElementById('scw-step-' + step.insertAfterStepId);
      if (el) return el;
      // Anchor step isn't in the DOM — gated out by showWhen. Fall back
      // to the nearest rendered predecessor in STEPS order.
      return nearestRenderedPredecessor(step);
    }
    return findAccordion(step.insertAfter);
  }

  // ── Webhook-driven step actions ──────────────────────────
  // Used by action steps with `webhookAction: 'key'`. Each handler
  // receives the step config and the step's DOM element so it can
  // toggle the in-flight spinner and re-enable on error.
  function setStepLoading(el, loading) {
    if (!el) return;
    if (loading) {
      el.classList.add('is-loading');
      var icon = el.querySelector('.scw-step-icon');
      if (icon) icon.innerHTML = SPINNER_SVG;
    } else {
      el.classList.remove('is-loading');
      // Icon will be re-applied on next applySteps() cycle.
    }
  }

  function getSourceSowId() {
    try {
      var v = Knack.views && Knack.views[SOURCE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* fall through */ }
    return '';
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

  // Reads a connection field's first {id, identifier} from a view's model.
  // Returns null when the field is empty or the view isn't available.
  function readConnectionFromView(viewId, fieldKey) {
    try {
      var v = Knack.views && Knack.views[viewId];
      var attrs = v && v.model && v.model.attributes;
      if (!attrs) return null;
      var raw = attrs[fieldKey + '_raw'];
      if (Array.isArray(raw) && raw.length) {
        return { id: raw[0].id || '', identifier: raw[0].identifier || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Reads a plain field value from a view's model (falls back to non-raw attr).
  function readFieldFromView(viewId, fieldKey) {
    try {
      var v = Knack.views && Knack.views[viewId];
      var attrs = v && v.model && v.model.attributes;
      if (!attrs) return '';
      var raw = attrs[fieldKey + '_raw'];
      if (raw != null && typeof raw !== 'object') return raw;
      if (attrs[fieldKey] != null) return attrs[fieldKey];
    } catch (e) { /* ignore */ }
    return '';
  }

  var WEBHOOK_ACTIONS = {
    duplicateSow: function (step, el) {
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('Duplicate-SOW webhook URL is not configured.');
        return;
      }
      var sourceRecordId = getSourceSowId();
      if (!sourceRecordId) {
        alert('Could not determine current SOW record ID.');
        return;
      }

      var payload = {
        sourceRecordId: sourceRecordId,
        triggeredBy: getTriggeredBy()
      };

      setStepLoading(el, true);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
        return resp.json().catch(function () { return null; });
      }).then(function (data) {
        if (data && data.success && data.newSowUrl) {
          window.location.href = data.newSowUrl;
          return;
        }
        setStepLoading(el, false);
        var errMsg = (data && (data.error || data.message)) || 'Failed to create SOW option.';
        alert(errMsg);
      }).catch(function (err) {
        setStepLoading(el, false);
        alert('Webhook error: ' + (err && err.message ? err.message : err));
      });
    },

    // Opens a modal prompt for notes, then POSTs notes + SOW id to
    // the MAKE_REQUEST_ALT_PROPOSAL_WEBHOOK. On success, reloads so
    // the stepper can re-evaluate the step states against new server
    // data (e.g. the alternative-proposal record that Make creates).
    requestAlternativeProposal: function (step, el) {
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_REQUEST_ALT_PROPOSAL_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('Request-alternative-proposal webhook URL is not configured.');
        return;
      }
      var sourceRecordId = getSourceSowId();
      if (!sourceRecordId) {
        alert('Could not determine current SOW record ID.');
        return;
      }
      openNotesPromptModal({
        title:         'Request Alternative Proposal',
        intro:         'Give our bid team some context — what should they know about this alternative bid?',
        placeholder:   'e.g. Budget option — fewer cameras in the parking lot, cheaper NVR',
        submitLabel:   'Submit Request',
        onSubmit: function (notes, setSubmitting, onError) {
          setSubmitting(true);
          setStepLoading(el, true);
          // Extra context pulled from the SOW Account / Project details
          // view (view_3491) so Make doesn't need to round-trip Knack for
          // the account + project linked records or the project name.
          var account = readConnectionFromView('view_3491', 'field_2119');
          var project = readConnectionFromView('view_3491', 'field_6');
          var projectName = readFieldFromView('view_3491', 'field_1456');
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceRecordId: sourceRecordId,
              // stepId lets Make also treat this as a validation request
              // for THIS SOW (state 3 of the gating model — see
              // docs/project-stage-workflow.md). Additive: existing
              // scenario branches ignore unknown keys.
              stepId:         step.id,
              actionLabel:    step.label || '',
              notes:          notes,
              account:        account,
              project:        project,
              projectName:    projectName,
              triggeredBy:    getTriggeredBy()
            })
          }).then(function (resp) {
            return resp.text().then(function (body) {
              var data = null;
              try { data = body ? JSON.parse(body) : null; } catch (e) {}
              return { ok: resp.ok, status: resp.status, body: body, data: data };
            });
          }).then(function (resp) {
            if (resp.data && resp.data.success) {
              // Make did its thing — reload so the stepper re-evaluates
              // against the latest field values (e.g. an alt-proposal
              // record may now be present / flags may have flipped).
              window.location.reload();
              return;
            }
            setSubmitting(false);
            setStepLoading(el, false);
            onError(
              (resp.data && (resp.data.error || resp.data.message)) ||
              (resp.ok
                ? 'Webhook returned a non-JSON or unexpected response.'
                : 'Webhook returned HTTP ' + resp.status + '.')
            );
          }).catch(function (err) {
            setSubmitting(false);
            setStepLoading(el, false);
            onError('Network error: ' + (err && err.message ? err.message : err));
          });
        }
      });
    },
    // requestSowValidation handler REMOVED 2026-08-02 — the standalone
    // validation-request step is retired (see the STEPS comment above).

    // State 4: survey already on THIS SOW, changes queued — ask the bid
    // team to bring the surveyed bid package back in line with the SOW.
    // Sibling copy of requestAlternativeProposal (same modal + payload
    // shape, its own webhook key so Make can be wired independently).
    requestBidUpdate: function (step, el) {
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_REQUEST_BID_UPDATE_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('Request-bid-update webhook URL is not configured.');
        return;
      }
      var sourceRecordId = getSourceSowId();
      if (!sourceRecordId) {
        alert('Could not determine current SOW record ID.');
        return;
      }
      openNotesPromptModal({
        title:         'Request Survey Bid Update',
        intro:         'Ask the bid team to update the surveyed bid package to match the current SOW.',
        placeholder:   'e.g. Swapped 2 cameras to the cheaper model, added a reader at the side door',
        submitLabel:   'Submit Request',
        onSubmit: function (notes, setSubmitting, onError) {
          setSubmitting(true);
          setStepLoading(el, true);
          var account = readConnectionFromView('view_3491', 'field_2119');
          var project = readConnectionFromView('view_3491', 'field_6');
          var projectName = readFieldFromView('view_3491', 'field_1456');
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceRecordId: sourceRecordId,
              stepId:         step.id,
              actionLabel:    step.label || '',
              notes:          notes,
              account:        account,
              project:        project,
              projectName:    projectName,
              triggeredBy:    getTriggeredBy()
            })
          }).then(function (resp) {
            return resp.text().then(function (body) {
              var data = null;
              try { data = body ? JSON.parse(body) : null; } catch (e) {}
              return { ok: resp.ok, status: resp.status, body: body, data: data };
            });
          }).then(function (resp) {
            var ok = resp.ok || (resp.data && resp.data.success === true);
            if (!ok) {
              setSubmitting(false);
              setStepLoading(el, false);
              onError(
                (resp.data && (resp.data.error || resp.data.message)) ||
                ('Webhook returned HTTP ' + resp.status + '.')
              );
              return;
            }
            window.location.reload();
          }).catch(function (err) {
            setSubmitting(false);
            setStepLoading(el, false);
            onError('Network error: ' + (err && err.message ? err.message : err));
          });
        }
      });
    }
  };

  // ── Notes-prompt modal ───────────────────────────────────
  // Minimal modal reused by any webhook action that wants to collect
  // a short note before firing. Builds its own DOM each call and
  // tears itself down on close. Keeps primary action on the right
  // per the UI convention in CLAUDE.md.
  function openNotesPromptModal(opts) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'scw-step-modal-overlay';

    var card = document.createElement('div');
    card.className = 'scw-step-modal';
    overlay.appendChild(card);

    var hdr = document.createElement('div');
    hdr.className = 'scw-step-modal-hdr';
    hdr.textContent = opts.title || 'Notes';
    card.appendChild(hdr);

    if (opts.intro) {
      var intro = document.createElement('p');
      intro.className = 'scw-step-modal-intro';
      intro.textContent = opts.intro;
      card.appendChild(intro);
    }

    var ta = document.createElement('textarea');
    ta.className = 'scw-step-modal-textarea';
    ta.rows = 6;
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    card.appendChild(ta);

    var errEl = document.createElement('div');
    errEl.className = 'scw-step-modal-error';
    errEl.style.display = 'none';
    card.appendChild(errEl);

    var actions = document.createElement('div');
    actions.className = 'scw-step-modal-actions';
    card.appendChild(actions);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-step-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'scw-step-modal-submit';
    submitBtn.textContent = opts.submitLabel || 'Submit';
    actions.appendChild(submitBtn);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape' && !submitBtn.disabled) close();
    }
    function setSubmitting(isSubmitting) {
      submitBtn.disabled = isSubmitting;
      cancelBtn.disabled = isSubmitting;
      ta.disabled       = isSubmitting;
      submitBtn.textContent = isSubmitting ? 'Submitting…' : (opts.submitLabel || 'Submit');
    }
    function onError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    cancelBtn.addEventListener('click', close);
    submitBtn.addEventListener('click', function () {
      errEl.style.display = 'none';
      var notes = (ta.value || '').trim();
      if (typeof opts.onSubmit === 'function') {
        opts.onSubmit(notes, setSubmitting, onError);
      }
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 30);
  }

  // ── Pick the right icon for a state ──────────────────────
  var ACTIVE_ICONS = { eye: EYE_SVG, copy: COPY_SVG };

  function getIcon(isCompleted, isDisabled, step) {
    // Completed wins over disabled so a step whose prerequisite is
    // technically unmet but which is factually done (e.g. workflow
    // advanced past it via an alternate path) still reads as done.
    if (isCompleted) return CHECK_CIRCLE_SVG;
    if (isDisabled) return LOCK_SVG;
    if (step && step.activeIcon && ACTIVE_ICONS[step.activeIcon]) return ACTIVE_ICONS[step.activeIcon];
    return CIRCLE_SVG;
  }

  // ── Apply states to an accordion step ────────────────────
  // HTML-escape for safely injecting user-provided text into innerHTML.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Read a connection field's { recordId, identifier } from a given
  // view (details or table). Returns null if the field isn't visible
  // or has no connection value.
  function readConnectionFromView(viewId, fieldKey) {
    var view = document.getElementById(viewId);
    if (!view) return null;
    var scope = view.querySelector(
      '.kn-detail.' + fieldKey +
      ', td.' + fieldKey +
      ', [data-field-key="' + fieldKey + '"]'
    );
    if (!scope) return null;
    var spans = scope.querySelectorAll('span[data-kn="connection-value"]');
    for (var i = 0; i < spans.length; i++) {
      var el = spans[i];
      var cls = (el.className || '').trim();
      var id  = el.id || '';
      var rec = /^[a-f0-9]{24}$/.test(cls) ? cls
             : (/^[a-f0-9]{24}$/.test(id)  ? id  : '');
      if (rec) {
        return {
          id: rec,
          identifier: (el.textContent || '').replace(/\u00a0/g, ' ').trim()
        };
      }
    }
    return null;
  }

  // Build an href by swapping the SECOND 24-char hex record-id in the
  // current URL hash with the supplied one. Used to construct a link
  // to a sibling SOW on the same company (the second record-id slot).
  function hrefWithSwappedSowId(newSowId) {
    var hash = window.location.hash || '';
    if (!/^#/.test(hash)) hash = '#' + hash;
    var count = 0;
    return hash.replace(/[a-f0-9]{24}/g, function (m) {
      count++;
      return count === 2 ? newSowId : m;
    });
  }

  // Substitute tokens in a message template:
  //   {field_XXXX}  — plain text value from the SOURCE_VIEW (view_3827)
  //   {link}        — anchor tag to a sibling SOW, when cfg.link is set
  function expandMessage(text, cfg) {
    if (typeof text !== 'string') return '';
    // {field_XXXX} → escaped plain text
    var out = text.replace(/\{(field_\d+)\}/g, function (_, key) {
      return escapeHtml(readField(key) || '');
    });
    // {link} → <a href="<swapped-url>">identifier</a>
    out = out.replace(/\{link\}/g, function () {
      if (!cfg || !cfg.link || !cfg.link.view || !cfg.link.field) return '';
      var conn = readConnectionFromView(cfg.link.view, cfg.link.field);
      if (!conn || !conn.id) return escapeHtml(conn && conn.identifier || '');
      var href = hrefWithSwappedSowId(conn.id);
      var label = escapeHtml(conn.identifier || conn.id);
      return '<a href="' + escapeHtml(href) + '" class="scw-step-msg-link">' + label + '</a>';
    });
    return out.trim();
  }

  // Compute which header message (if any) to show for a step.
  // Priority:
  //   1. step.completedMessage when step is completed (optionally gated
  //      by .when) — uses info icon.
  //   2. step.disabled.message when baseDisabled AND step is NOT
  //      completed — uses lock icon.
  //   3. step.activeMessage when the step is active (neither completed
  //      nor disabled), optionally gated by .when — uses info icon.
  //   4. none otherwise.
  function resolveHeaderMessage(step, isCompleted, baseDisabled) {
    if (isCompleted && step.completedMessage) {
      var cm = step.completedMessage;
      var cmText = typeof cm === 'string' ? cm : (cm && cm.text) || '';
      var cmWhen = typeof cm === 'object' ? cm.when : null;
      if (cmText && (!cmWhen || conditionMet(cmWhen))) {
        var finalHtml = expandMessage(cmText, typeof cm === 'object' ? cm : null);
        if (finalHtml) return { html: finalHtml, icon: INFO_SM_SVG };
      }
    }
    if (baseDisabled && !isCompleted && step.disabled) {
      // Lock messages don't accept tokens — plain text. resolveDisabled
      // picks the matching message for array-form disabled configs.
      var dMsg = resolveDisabled(step).message;
      if (dMsg) return { html: escapeHtml(dMsg), icon: LOCK_SM_SVG };
    }
    if (!isCompleted && !baseDisabled && step.activeMessage) {
      var am = step.activeMessage;
      var amText = typeof am === 'string' ? am : (am && am.text) || '';
      var amWhen = typeof am === 'object' ? am.when : null;
      if (amText && (!amWhen || conditionMet(amWhen))) {
        var amHtml = expandMessage(amText, typeof am === 'object' ? am : null);
        if (amHtml) return { html: amHtml, icon: INFO_SM_SVG };
      }
    }
    return null;
  }

  // Resolve step.disabled to { disabled, message }. Supports the original
  // single condition-object form ({ field…, message }) and an ARRAY of
  // { when, message } entries — first matching entry wins, so different
  // lock reasons can carry different messages.
  function resolveDisabled(step) {
    if (!step.disabled) return { disabled: false, message: '' };
    if (Array.isArray(step.disabled)) {
      for (var i = 0; i < step.disabled.length; i++) {
        var d = step.disabled[i];
        if (conditionMet(d.when || d)) {
          return { disabled: true, message: d.message || '' };
        }
      }
      return { disabled: false, message: '' };
    }
    return {
      disabled: conditionMet(step.disabled),
      message: step.disabled.message || ''
    };
  }

  // Resolve a state-dependent step label: first dynamicLabel entry whose
  // `when` matches wins; an entry with no `when` is the fallback. Returns
  // null when the step has no dynamicLabel (caller keeps step.label).
  function resolveDynamicLabel(step) {
    if (!step.dynamicLabel) return null;
    for (var i = 0; i < step.dynamicLabel.length; i++) {
      var d = step.dynamicLabel[i];
      if (!d.when || conditionMet(d.when)) return d.label || null;
    }
    return null;
  }

  function renderHeaderMessage(hdr, step, stepKey, isCompleted, baseDisabled) {
    var msgEl = hdr.querySelector('.scw-step-disabled-msg[data-step="' + stepKey + '"]');
    var msg = resolveHeaderMessage(step, isCompleted, baseDisabled);
    if (!msg) {
      if (msgEl) msgEl.remove();
      return;
    }
    if (!msgEl) {
      msgEl = document.createElement('span');
      msgEl.className = 'scw-step-disabled-msg';
      msgEl.setAttribute('data-step', stepKey);
      var chevron = hdr.querySelector('.scw-acc-chevron');
      if (chevron) hdr.insertBefore(msgEl, chevron);
      else hdr.appendChild(msgEl);
    }
    // innerHTML so token-expanded <a> tags render. All user text
    // passes through escapeHtml in expandMessage before reaching here.
    msgEl.innerHTML = msg.icon + '<span>' + msg.html + '</span>';

    // Prevent clicks on inline links from bubbling up to the
    // accordion / action-step click handler (which would toggle the
    // accordion instead of navigating). Re-attach on every render
    // since innerHTML wipes previous listeners.
    var links = msgEl.querySelectorAll('.scw-step-msg-link');
    for (var li = 0; li < links.length; li++) {
      links[li].addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
  }

  function applyAccordionState(step) {
    var wrap = findAccordion(step.viewKey);
    if (!wrap) return;
    var hdr = wrap.querySelector('.scw-ktl-accordion__header');
    var iconEl = hdr.querySelector('.scw-acc-icon');

    // State-dependent header label (dynamicLabel). Change-guarded write —
    // ktl-accordion's syncState runs off a MutationObserver, so an
    // unconditional textContent write would re-fire it every pass.
    var dynLabel = resolveDynamicLabel(step);
    if (dynLabel) {
      var ttlEl = hdr.querySelector('.scw-acc-title');
      if (ttlEl && ttlEl.textContent !== dynLabel) ttlEl.textContent = dynLabel;
    }

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var baseDisabled = resolveDisabled(step).disabled;
    var lockedByCompletion = !!(step.lockWhenCompleted && isCompleted);
    var isDisabled = baseDisabled || lockedByCompletion;

    // Icon — show the completed checkmark even when locked-by-completion,
    // so the header reads as "done" rather than showing the lock.
    if (iconEl) iconEl.innerHTML = getIcon(isCompleted, baseDisabled, step);

    // Both completed AND disabled can apply simultaneously when the step
    // is locked by completion; CSS (scw-step-completed.scw-step-disabled)
    // styles that combined state (full opacity, green icon, no clicks).
    wrap.classList.toggle('scw-step-completed', isCompleted);
    wrap.classList.toggle('scw-step-disabled', isDisabled);

    renderHeaderMessage(hdr, step, step.viewKey, isCompleted, baseDisabled);
  }

  // ── Apply states to an action step ───────────────────────
  // Hide the original Knack menu view (and any injected action button) that
  // a step replaces, so the raw "Start Install Project" link never leaks
  // through. Must run in every applyActionState path — including the
  // processing/polling early-return — because the menu view re-renders
  // visible on each poll fetch.
  function hideStepMenu(step) {
    if (!step.menuView) return;
    var origMenu = document.getElementById(step.menuView);
    if (origMenu) origMenu.style.display = 'none';
    var injected = document.querySelector('.scw-acc-actions[data-scw-menu-src="' + step.menuView + '"]');
    if (injected) injected.classList.add('scw-step-menu-hidden');
  }

  function applyActionState(step) {
    var el = document.getElementById('scw-step-' + step.id);

    // Render gate: skip (and remove if present) when the showWhen
    // condition isn't met. Distinct from `disabled` which dims a
    // visible step — `showWhen` controls whether it exists at all.
    if (step.showWhen && !conditionMet(step.showWhen)) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      el = buildActionStep(step);
      var afterAcc = findInsertAnchor(step);
      if (afterAcc) afterAcc.after(el);
    }

    // Update href (only for navigation-type steps, not webhook steps)
    if (!step.webhookAction) {
      var href = resolveHref(step);
      if (href) el.href = href;
    }

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var baseDisabled = resolveDisabled(step).disabled;
    var lockedByCompletion = !!(step.lockWhenCompleted && isCompleted);
    var isDisabled = baseDisabled || lockedByCompletion;

    // ── pollAfterClick: processing-state override ──
    // When the user has clicked this step recently (flag set in click
    // handler) and the completion field hasn't flipped yet, lock the
    // step into a "Processing — please wait…" state and start polling
    // SOURCE_VIEW so the moment the field flips we re-render to the
    // completed state. Cleanup once the step IS completed (the flag
    // becomes irrelevant) so a future fresh click works.
    var processing = false;
    if (step.pollAfterClick) {
      var flag = getPollFlag(step.id, step.pollAfterClick.timeoutMs);
      if (flag && !isCompleted) {
        processing = true;
        startStepPoll(step);
      } else if (isCompleted && flag) {
        // Field flipped → drop the flag + stop polling so the step
        // renders as a normal "completed" action.
        clearPollFlag(step.id);
        stopStepPoll(step.id);
      }
    }

    var icon = el.querySelector('.scw-step-icon');
    if (processing) {
      // Override visual + lock click. is-disabled blocks pointer events
      // via existing CSS, plus is-processing adds the spinner styling.
      if (icon) icon.innerHTML = SPIN_SVG;
      var titleEl = el.querySelector('.scw-step-title');
      if (titleEl) {
        titleEl.textContent = step.pollAfterClick.pendingLabel || 'Processing…';
      }
      el.classList.add('is-processing');
      el.classList.add('is-disabled');
      el.classList.remove('is-completed');
      // Drop the href so even an accessibility-tab-Enter doesn't fire.
      el.removeAttribute('href');
      renderHeaderMessage(el, step, step.id, false, false);
      hideStepMenu(step);
      return;
    }

    // Not processing — restore in case we just exited that state.
    // (dynamicLabel wins over the static label when configured.)
    el.classList.remove('is-processing');
    var stepLabel = resolveDynamicLabel(step) || step.label;
    var titleEl2 = el.querySelector('.scw-step-title');
    if (titleEl2 && titleEl2.textContent !== stepLabel) {
      titleEl2.textContent = stepLabel;
    }
    if (!step.webhookAction) {
      var hrefAfter = resolveHref(step);
      if (hrefAfter && el.getAttribute('href') !== hrefAfter) el.href = hrefAfter;
    }

    // Icon — keep the completed check when locked-by-completion so the
    // user still sees the "done" state rather than a lock.
    if (icon) icon.innerHTML = getIcon(isCompleted, baseDisabled, step);

    // Classes: prefer is-completed styling when locked by completion so
    // the step reads as "done" while still being non-clickable.
    el.classList.toggle('is-completed', isCompleted);
    el.classList.toggle('is-disabled', isDisabled);

    // Disabled / informational message — shared helper with accordions.
    renderHeaderMessage(el, step, step.id, isCompleted, baseDisabled);

    // Hide original menu view
    hideStepMenu(step);
  }

  // ── Main apply ───────────────────────────────────────────
  function applySteps() {
    for (var i = 0; i < STEPS.length; i++) {
      var step = STEPS[i];
      if (step.type === 'accordion') applyAccordionState(step);
      else if (step.type === 'action') applyActionState(step);
    }
  }

  // ── pollAfterClick: lock + poll until a step's completion field flips ──
  // For action steps that fire a Knack form whose post-submit data is
  // populated by an async Make automation. Click sets a per-SOW
  // localStorage flag; on next render we lock the step ("processing")
  // and start polling SOURCE_VIEW's model until step.completed flips.
  // Cleared on success, on timeout, or when the SOW changes.
  var POLL_FLAG_PREFIX = 'scw-step-polling:';
  var _activePolls = {};   // stepId -> intervalId

  function pollFlagKey(stepId) {
    return POLL_FLAG_PREFIX + stepId + ':' + (getSourceSowId() || '');
  }
  function getPollFlag(stepId, timeoutMs) {
    try {
      var raw = localStorage.getItem(pollFlagKey(stepId));
      if (!raw) return null;
      var ts = parseInt(raw, 10);
      if (!isFinite(ts)) return null;
      if (Date.now() - ts > (timeoutMs || 120000)) {
        localStorage.removeItem(pollFlagKey(stepId));
        return null;
      }
      return ts;
    } catch (e) { return null; }
  }
  function setPollFlag(stepId) {
    try { localStorage.setItem(pollFlagKey(stepId), String(Date.now())); }
    catch (e) {}
  }
  function clearPollFlag(stepId) {
    try { localStorage.removeItem(pollFlagKey(stepId)); } catch (e) {}
  }

  function startStepPoll(step) {
    if (_activePolls[step.id]) return;
    var opts = step.pollAfterClick || {};
    var pollMs    = opts.pollMs    || 4000;
    var timeoutMs = opts.timeoutMs || 120000;

    _activePolls[step.id] = setInterval(function () {
      // Bail out if the user navigated to a different SOW or cleared
      // the flag manually.
      if (!getPollFlag(step.id, timeoutMs)) {
        stopStepPoll(step.id);
        applySteps();
        return;
      }
      // Refetch the SOW detail view so step.completed re-evaluates
      // against the freshest field values.
      try {
        var v = Knack && Knack.views && Knack.views[SOURCE_VIEW];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch({
            success: function () {
              if (step.completed && conditionMet(step.completed)) {
                clearPollFlag(step.id);
                stopStepPoll(step.id);
                refreshStepViews(step);
              }
              applySteps();
            }
          });
        }
      } catch (e) { /* swallow — try again on next tick */ }
    }, pollMs);
  }
  function stopStepPoll(stepId) {
    if (_activePolls[stepId]) {
      clearInterval(_activePolls[stepId]);
      delete _activePolls[stepId];
    }
  }

  // Re-fetch + re-render the views a step declares in refreshViewsOnComplete
  // so their DOM reflects post-automation data (a bare model.fetch updates
  // the model but doesn't repaint a details view).
  function refreshStepViews(step) {
    var views = step.refreshViewsOnComplete;
    if (!views || !views.length) return;
    views.forEach(function (vk) {
      try {
        var v = Knack && Knack.views && Knack.views[vk];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch({
            success: function () {
              try { if (typeof v.render === 'function') v.render(); } catch (e) {}
            }
          });
        }
      } catch (e) { /* ignore */ }
    });
  }


  // ── Playbook form display rules (view_2924) ──────────────
  var PLAYBOOK_VIEW = 'view_2924';
  var ACCESS_CONTROL_ID = '6977d26243bab906665fe872';
  var CAMERAS_ID = '6977d25a3a701a1a3e4c9d70';

  function getConnectionVal(fieldKey) {
    // Read from the <select> first — Chosen.js keeps this in sync
    var select = document.getElementById(PLAYBOOK_VIEW + '-' + fieldKey);
    if (select && select.value) return select.value.trim();
    // Fallback to hidden input
    var hidden = document.querySelector('#' + PLAYBOOK_VIEW + ' input.connection[name="' + fieldKey + '"]');
    if (hidden) {
      var v = decodeURIComponent(hidden.value || '').replace(/[\[\]"]/g, '').trim();
      if (v) return v;
    }
    return '';
  }

  function getRadioVal(fieldKey) {
    var checked = document.querySelector('#' + PLAYBOOK_VIEW + ' input[name="' + PLAYBOOK_VIEW + '-' + fieldKey + '"]:checked');
    return checked ? checked.value : '';
  }

  function setFieldVisible(fieldKey, visible) {
    var wrap = document.querySelector('#' + PLAYBOOK_VIEW + ' #kn-input-' + fieldKey);
    if (wrap) wrap.style.display = visible ? '' : 'none';
  }

  function applyPlaybookRules() {
    var projectType = getConnectionVal('field_2228');

    // field_1756 (locking hardware): only for Access Control
    setFieldVisible('field_1756', projectType === ACCESS_CONTROL_ID);

    // field_1752 (multiple buildings): only for Cameras
    setFieldVisible('field_1752', projectType === CAMERAS_ID);

    // field_1753 (building assumptions): only when field_1752 = Yes
    var multiBuilding = getRadioVal('field_1752');
    setFieldVisible('field_1753', projectType === CAMERAS_ID && /^yes$/i.test(multiBuilding));
  }

  function bindPlaybookRules() {
    var form = document.getElementById(PLAYBOOK_VIEW);
    if (!form) return;
    // Mark the form (purely informational — handlers are idempotent
    // via jQuery namespace .off().on() below). The previous once-only
    // guard on this attribute caused intermittent breakage: Knack's
    // post-submit re-render replaces the inner <select> + <input>
    // elements while keeping the outer <form>, which left our flag
    // set but the handlers detached. Re-binding every render is safe
    // because .off(NS) clears any prior listeners first.
    form.setAttribute('data-scw-playbook-rules', '1');

    // Connection field change (Chosen.js fires change on the original select).
    // The select element is replaced on every form re-render, so we have
    // to re-bind each time — namespace .off() clears the previous handler
    // (if any) without affecting other modules' listeners.
    $('#' + PLAYBOOK_VIEW + '-field_2228')
      .off('change' + NS)
      .on('change' + NS, applyPlaybookRules);

    // Radio change for field_1752 — delegated on the form so it survives
    // input replacement, but still namespaced + .off()'d for safety.
    $(form)
      .off('change' + NS, 'input[name="' + PLAYBOOK_VIEW + '-field_1752"]')
      .on('change' + NS, 'input[name="' + PLAYBOOK_VIEW + '-field_1752"]', applyPlaybookRules);

    applyPlaybookRules();
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    injectStyles();
    // Immediate pass first: applySteps is idempotent and no-ops for any
    // step whose accordion shell isn't wrapped yet, so when the shells
    // ARE already up this lands the stepper without the flat delay (the
    // scene load veil waits for #scw-step-initiate-install before
    // revealing — see scene-tweaks.js transformsReady). The delayed
    // pass stays as the catch-up for late accordion wraps.
    applySteps();
    setTimeout(applySteps, 500);
    setTimeout(bindPlaybookRules, 600);
  }

  // Idempotent collapse of a step accordion. Unlike a header click (which
  // toggles), this always forces the collapsed state, so it's safe to call
  // repeatedly. Mirrors ktl-accordion's own collapse DOM ops.
  function collapseStepAccordion(viewKey) {
    var wrap = findAccordion(viewKey);
    if (!wrap) return;
    var hdr = wrap.querySelector('.scw-ktl-accordion__header');
    wrap.classList.remove('is-expanded');
    if (hdr) hdr.setAttribute('aria-expanded', 'false');
    var body = wrap.querySelector('.scw-ktl-accordion__body');
    if (body) body.style.display = 'none';
    var section = document.querySelector('.hideShow_' + viewKey + '.ktlHideShowSection');
    if (section) section.style.display = 'none';
    var arrow = document.getElementById('hideShow_' + viewKey + '_arrow');
    if (arrow) { arrow.classList.remove('ktlDown'); arrow.classList.add('ktlUp'); }
  }

  // Collapse accordion and refresh steps after form submit
  function onFormSubmit(viewKey) {
    // KTL persistent forms re-render after submit (showing the "Form
    // successfully submitted" confirmation), which re-expands the section.
    // Collapse now and re-assert a few times to outlast that re-render.
    collapseStepAccordion(viewKey);
    [300, 700, 1400].forEach(function (ms) {
      setTimeout(function () { collapseStepAccordion(viewKey); }, ms);
    });
    // Refresh source view to get updated field values, then re-apply steps
    if (typeof Knack !== 'undefined' && Knack.views[SOURCE_VIEW] && Knack.views[SOURCE_VIEW].model) {
      Knack.views[SOURCE_VIEW].model.fetch({
        success: function () { setTimeout(applySteps, 300); }
      });
    }
    setTimeout(applySteps, 1500);
  }

  // Any view referenced by a step's menuView / hrefSelector is a source
  // of the step's navigation href. Re-run applySteps when that view
  // renders so the step's href stays current (e.g. published proposal
  // link appearing after view_3814 loads).
  function collectDependencyViews() {
    var ids = {};
    STEPS.forEach(function (s) {
      if (s.menuView) ids[s.menuView] = true;
      if (s.hrefSelector) {
        var m = String(s.hrefSelector).match(/#(view_\d+)/);
        if (m) ids[m[1]] = true;
      }
      // completedMessage.link pulls a record from a specific view —
      // re-run applySteps on that view's render so the token refreshes.
      var cm = s.completedMessage;
      if (cm && typeof cm === 'object' && cm.link && cm.link.view) {
        ids[cm.link.view] = true;
      }
    });
    return Object.keys(ids);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, init, NS);
    SCW.onViewRender(PLAYBOOK_VIEW, function () {
      setTimeout(bindPlaybookRules, 200);
    }, NS);

    collectDependencyViews().forEach(function (vid) {
      if (vid === SOURCE_VIEW || vid === PLAYBOOK_VIEW) return;
      SCW.onViewRender(vid, function () {
        setTimeout(applySteps, 200);
      }, NS);
    });
  }

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    setTimeout(init, 800);
  });

  // Listen for form submissions on step accordion views. Knack fires
  // different events depending on the form: a brand-new record emits
  // knack-record-create, an edit emits knack-record-update, and
  // knack-form-submit fires for some (but not all) forms — notably KTL
  // persistent edit forms like the Playbook (view_2924) often emit only
  // knack-record-update. Bind all three and de-dupe so onFormSubmit (which
  // collapses the accordion + re-runs applySteps) always fires exactly once.
  var STEP_FORM_VIEWS = ['view_2924', 'view_3853'];
  var _lastStepFormHandled = {};

  function handleStepFormSubmit(viewKey) {
    var now = Date.now();
    if (_lastStepFormHandled[viewKey] && (now - _lastStepFormHandled[viewKey]) < 1200) return;
    _lastStepFormHandled[viewKey] = now;
    onFormSubmit(viewKey);
  }

  STEP_FORM_VIEWS.forEach(function (vk) {
    ['knack-form-submit', 'knack-record-update', 'knack-record-create'].forEach(function (evt) {
      $(document)
        .off(evt + '.' + vk + NS)
        .on(evt + '.' + vk + NS, function () { handleStepFormSubmit(vk); });
    });
  });

  // ── Cross-tab refresh after Ops stepper completion ───────
  // ops-stepper.js (on the Ops tab) writes
  //   scw-ops-stepper-completed:<sowId> = <timestamp>
  // to localStorage when its webhook returns success. Same-origin
  // tabs receive a 'storage' event. If the signal is for the SOW
  // currently loaded on this build page, show a "refreshing" banner
  // then reload so the user doesn't stare at pre-action field values.
  function showStaleDataBanner() {
    if (document.getElementById('scw-stale-refresh-banner')) return;
    // Inline styles so we don't need a separate stylesheet injection —
    // the banner is short-lived and only appears on this one event.
    var banner = document.createElement('div');
    banner.id = 'scw-stale-refresh-banner';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:100000;' +
      'background:#1e40af;color:#fff;' +
      'font:600 13px/1.4 system-ui, sans-serif;' +
      'padding:10px 16px;text-align:center;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.2);' +
      'display:flex;align-items:center;justify-content:center;gap:10px;';
    banner.innerHTML =
      '<span style="display:inline-block;width:14px;height:14px;' +
      'border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;' +
      'border-radius:50%;animation:scw-stale-spin 0.8s linear infinite;"></span>' +
      '<span>Data just changed on the Ops page — refreshing…</span>';

    // Inject the keyframes once.
    if (!document.getElementById('scw-stale-spin-css')) {
      var s = document.createElement('style');
      s.id = 'scw-stale-spin-css';
      s.textContent = '@keyframes scw-stale-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(s);
    }
    document.body.appendChild(banner);
  }

  try {
    SCW.debug('[scw-workflow-stepper] storage listener installing');
    window.addEventListener('storage', function (e) {
      // Catch-all log first so we can see if storage events are
      // firing at all during debugging — previously the storage
      // listener was silently skipping every event.
      SCW.debug('[scw-workflow-stepper] storage event:', e.key, '=', e.newValue);
      var prefix = 'scw-ops-stepper-completed:';
      if (!e.key || e.key.indexOf(prefix) !== 0) return;

      // Only reload tabs that actually display ops-stepper-affected
      // data. view_3325 hosts the Ops Review pills; view_3885 hosts
      // the published-proposal rows. Tabs on unrelated scenes (Project
      // Calendar, Bid Review for a different project, Photos, etc.)
      // get this storage event too because localStorage broadcasts
      // same-origin — but reloading them throws away whatever the user
      // was doing for no benefit.
      // The originating tab handles its own local reload, so we don't
      // need to match SOW ids here — presence of either view is enough.
      if (!document.getElementById('view_3325') &&
          !document.getElementById('view_3885')) {
        SCW.debug('[scw-workflow-stepper] ops-stepper signal — no affected views on this tab, ignoring');
        return;
      }

      SCW.debug('[scw-workflow-stepper] ops-stepper signal matched — reloading');
      showStaleDataBanner();
      // ~1.2s gives Knack/Make a beat to commit and the user time
      // to register the banner before the reload.
      setTimeout(function () { window.location.reload(); }, 1200);
    });
  } catch (e) { /* ignore — non-fatal */ }
})();
