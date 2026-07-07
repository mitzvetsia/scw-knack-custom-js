/*** FEATURE: Ops Review pill on view_3325 (SOW list) ***/
/**
 * Replaces the raw flag columns on view_3325 with a single
 * "Ops Review" column containing a status pill that surfaces the
 * NEXT Ops action for this SOW (matching the Ops stepper on the
 * proposal page).
 *
 * Pill is status + navigation only — clicking takes the reviewer
 * to the proposal page (scene that hosts view_3345 / the real
 * Ops stepper). The actual writes happen there, not in the grid.
 *
 * Priority (first match wins)
 *   1. field_2728 > 0 AND field_2706 = No → "Request Alternative Bid
 *      from Subcontractor" — there are pending CRs to address.
 *   2. field_2723 = No AND field_2728 = 0 → "Mark Ready for Survey"
 *      — Ops hasn't marked the SOW ready yet.
 *   3. field_2723 = Yes AND field_2706 = No AND field_2728 = 0 →
 *      "Ready for Survey" (info, non-clickable) — Ops has marked ready,
 *      Sales hasn't requested the survey yet.
 *   4. field_2725 = No                    → "Publish & Submit Completed
 *      Proposal" — survey + bids are back, proposal ready to go.
 *   5. field_2725 = Yes (terminal)        → "Released to Sales" (grey check,
 *      non-clickable).
 *
 * All active (clickable) pills share one teal background — the pill is
 * a status-and-navigation affordance, not a meaningful colour-coded
 * action. Non-clickable states (info, terminal) use muted text/greys.
 *
 * Reads these fields from the row DOM, so they must be added as
 * columns on view_3325 (hidden by this feature's CSS):
 *   field_2706  FLAG_survey requested
 *   field_2728  count of pending change requests
 *   field_2725  FLAG_released to sales (formerly "validated bid"; flipped
 *               only by the Submit-to-Sales action, drives Sales-side
 *               visibility / TBD-vs-real-numbers gates)
 *   field_2736  auto-revert note (surfaced as pill tooltip)
 *
 * Also exposes SCW.opsReview.autoRevertValidation(sowId, opts) —
 * called from sales-change-request/submit.js to flip field_2725=No
 * and drop a timestamped note into field_2736 when a CR is submitted.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var VIEW_ID        = 'view_3325';
  var HOST_FIELD     = 'field_2723';   // existing column used as the Ops Review host cell
  var READY_FIELD    = 'field_2723';   // FLAG_ready for survey (flipped by Ops Mark Ready)
  var SURVEY_FIELD   = 'field_2706';   // FLAG_survey requested (flipped by Sales)
  var CR_COUNT_FIELD = 'field_2728';   // count of pending change requests
  var RELEASED_FIELD = 'field_2725';   // FLAG_released to sales (was "validated bid")
  var NOTE_FIELD     = 'field_2736';   // auto-revert note (tooltip)

  var WRITE_VIEW   = 'view_3841';      // form that edits 2725 + 2736 (for auto-revert)
  var STYLE_ID     = 'scw-ops-review-css';
  var EVENT_NS     = '.scwOpsReview';
  var CELL_CLASS   = 'scw-ops-review-cell';
  var PROCESSED    = 'data-scw-ops-review';

  // Per-row margin warning. Surfaced inside the Ops Review host cell
  // (between the pill and the published-proposal block) so reviewers
  // see it alongside the next-step affordance for that SOW.
  var MARGIN_FIELD       = 'field_2749';   // SOW margin %
  var MARGIN_THRESHOLD   = 10;             // % — anything below trips the warning
  var MARGIN_WARNING_MSG = 'Margin is low; consider adding base ' +
    'project management & small project mobilization costs ' +
    'or increases project overall margin.';

  // Fields used by the margin-low action buttons (mirrors bid-review's
  // recovery actions). subBidTotal + surveyCosts feed the formula that
  // computes a target margin landing at 12% effective after survey
  // costs are absorbed; projectMargin is the field we PUT back.
  var SUB_BID_TOTAL_FIELD   = 'field_2162';  // SOW sub-bid total (project-wide)
  var SURVEY_COSTS_FIELD    = 'field_2750';  // INPUT_survey costs (editable)
  var PROJECT_MARGIN_FIELD  = 'field_2158';  // SOW project margin % (input)
  var EFFECTIVE_MARGIN_TARGET = 0.12;        // recovery target: 12% post-survey

  // ── Pending-step flags ──────────────────────────────────
  // ops-stepper.js (on the Ops proposal tab) writes
  //   scw-ops-stepper-pending:<sowId> = {"stepId":"...","timestamp":...}
  // to localStorage when Make responds with {status:"accepted"}. The
  // pill for that SOW renders as grayed "Processing …" until the
  // underlying fields flip (checked by polling view_3325.model.fetch)
  // — at which point the resolved step will differ from pending.stepId
  // and we clear the flag.
  var PENDING_KEY_PREFIX = 'scw-ops-stepper-pending:';
  var PENDING_TIMEOUT_MS = 90 * 1000;   // safety net — clear stuck flags
  var POLL_INTERVAL_MS   = 5 * 1000;    // cadence for model.fetch while pending

  // ── Published-proposal lookup (view_3885) ───────────────
  // Each published proposal record connects back to its SOW via
  // field_2666. Reading view_3885's Knack model + indexing by the
  // connection field lets us show the proposal name / exp date / PDF
  // link per SOW row (mirroring the sales build totals panel, which
  // reads the same structure from view_3814).
  var PROPOSAL_VIEW   = 'view_3885';
  var PROPOSAL_NAME   = 'field_2665';  // proposal display name
  var PROPOSAL_SOW    = 'field_2666';  // connection → SOW
  var PROPOSAL_EXP    = 'field_2659';  // expiration date
  var PROPOSAL_PDF    = 'field_2681';  // PDF file
  var PROPOSAL_STATUS = 'field_2658';  // "Published" / "Draft" / etc.

  // ── Step definitions (priority order) ───────────────────
  // First matching step wins. Mirror these with the Ops stepper
  // (ops-stepper.js) so grid and page agree on "next action". The
  // `label` here is what the "Processing X…" pending pill renders
  // while Make is in flight, so each id present in ops-stepper needs
  // a corresponding entry here even though the visible *active* pill
  // text is hardcoded to "Preview Proposal for Next Steps" in
  // renderCell().
  var STEPS = [
    {
      id:       'request-alt-bid',
      label:    'Request Alternative Bid',
      showWhen: function (f) { return f.survey !== 'yes' && toNum(f.crCount) > 0; }
    },
    {
      // Mirror image of request-alt-bid — once Sales has actually
      // requested the survey (field_2706 = Yes) the matching bid
      // exists, so an "update" path makes sense. Same pending label
      // shape as the alt-bid path.
      id:       'update-matching-bid',
      label:    'Update Subcontractor Bid Request',
      showWhen: function (f) { return f.survey === 'yes' && toNum(f.crCount) > 0; }
    },
    {
      // Ops still needs to mark the SOW ready. Keyed on field_2723
      // (the flag the Mark Ready webhook actually flips), not the
      // downstream field_2706 which only flips when Sales requests
      // the survey.
      id:       'mark-ready',
      label:    'Mark Ready for Survey',
      showWhen: function (f) {
        return f.ready !== 'yes' && !(toNum(f.crCount) > 0);
      }
    },
    // ── Publish variants ─────────────────────────────────
    // All three share the same showWhen; the SOW grid pill only
    // surfaces ONE "next step" at a time, so first-match wins picks
    // publish-sow-tbd by default. Pending detection is keyed on the
    // exact step.id ops-stepper kicked off, so all three need entries
    // here for the "Processing X…" message to be accurate.
    {
      id:       'publish-sow-tbd',
      label:    'Publish as SOW only (TBD Labor)',
      showWhen: function (f) { return f.validated !== 'yes'; }
    },
    {
      id:       'publish-gfe',
      label:    'Publish Quote as GFE',
      showWhen: function () { return false; }   // pending-only entry
    },
    {
      id:       'publish-final',
      label:    'Publish Quote as Final',
      showWhen: function () { return false; }   // pending-only entry
    }
  ];

  // ── CSS ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Hide source columns this feature consumes. */
      '#' + VIEW_ID + ' th.' + RELEASED_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + RELEASED_FIELD + ',' +
      '#' + VIEW_ID + ' th.' + NOTE_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + NOTE_FIELD + ',' +
      '#' + VIEW_ID + ' th.' + SURVEY_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + SURVEY_FIELD + ',' +
      '#' + VIEW_ID + ' th.' + CR_COUNT_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + CR_COUNT_FIELD + ' {' +
      '  display: none !important;' +
      '}' +

      /* Host cell */
      '#' + VIEW_ID + ' td.' + CELL_CLASS + ',' +
      '#' + VIEW_ID + ' th.' + CELL_CLASS + ' {' +
      '  white-space: normal;' +
      '  min-width: 260px;' +
      '  vertical-align: middle;' +
      '  text-align: center;' +
      '}' +

      // Per-row published-proposal block CSS lives in the shared
      // published-quote-info.js (.scw-pq-info / --compact / etc.). This
      // file only contains the SOW-grid-specific styles below.

      /* Low-margin warning — sits between the pill and the published
         proposal block. Amber chrome matches the existing card-header
         warning vocabulary (#b45309). Compact line-height so the cell
         doesn't grow too tall on long rows. */
      '.scw-ops-margin-warning {' +
      '  display: flex; align-items: flex-start; gap: 6px;' +
      '  margin-top: 8px; padding: 6px 8px;' +
      '  background: #fef3c7; border: 1px solid #d97706;' +
      '  border-radius: 6px; color: #78350f;' +
      '  font: 600 10.5px/1.35 system-ui, sans-serif;' +
      '  text-align: left;' +
      '}' +
      '.scw-ops-margin-warning svg {' +
      '  flex: 0 0 auto; margin-top: 1px; color: #b45309;' +
      '}' +
      /* Allow the optional action button to wrap to its own line below
         the svg+text without disturbing the existing row-1 layout. */
      '.scw-ops-margin-warning { flex-wrap: wrap; }' +
      /* Optional inline action button inside the margin-low warning —
         used by bid-review to surface "Add PM & Mobilization line item". */
      '.scw-ops-margin-warning__btn {' +
      '  flex: 0 0 100%; align-self: flex-start;' +
      '  margin: 4px 0 0 20px; padding: 4px 10px;' +
      '  background: #b45309; color: #fff; border: none;' +
      '  border-radius: 4px; font: 600 11px/1.2 system-ui, sans-serif;' +
      '  cursor: pointer; white-space: nowrap; max-width: max-content;' +
      '}' +
      '.scw-ops-margin-warning__btn:hover { background: #92400e; }' +
      '.scw-ops-margin-warning__btn:disabled {' +
      '  opacity: 0.6; cursor: not-allowed; background: #b45309;' +
      '}' +

      /* Suppress Knack inline-edit popup on this cell. */
      'td[' + PROCESSED + '] .kn-edit-col,' +
      'td[' + PROCESSED + '] .kn-td-edit {' +
      '  display: none !important;' +
      '}' +

      /* Let the tooltip pseudo-element escape Knack's table wrapper,
         which has overflow set on .kn-table-wrapper / its parents. */
      '#' + VIEW_ID + ' .kn-table-wrapper,' +
      '#' + VIEW_ID + ' table.kn-table-table,' +
      '#' + VIEW_ID + ' tbody,' +
      '#' + VIEW_ID + ' tbody tr,' +
      '#' + VIEW_ID + ' tbody td.' + CELL_CLASS + ' {' +
      '  overflow: visible !important;' +
      '}' +

      /* Pill — matches the bid-comparison "Convert All →" button styling
         (.scw-bid-review__btn / --adopt) so all action affordances on
         the page share one visual language. */
      '.scw-ops-pill {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  gap: 6px;' +
      '  min-width: 230px; box-sizing: border-box;' +
      '  padding: 6px 12px; border-radius: 4px;' +
      '  font: 600 12px/1.2 system-ui, sans-serif;' +
      '  border: none; white-space: nowrap;' +
      '  background: #0891b2;' +
      '  color: #ffffff !important;' +
      '  text-decoration: none !important;' +
      '  cursor: pointer;' +
      '  transition: opacity .15s, filter .15s;' +
      '}' +
      'a.scw-ops-pill,' +
      'a.scw-ops-pill:visited,' +
      'a.scw-ops-pill:hover,' +
      'a.scw-ops-pill:focus { color: #ffffff !important; }' +
      'a.scw-ops-pill:hover { filter: brightness(0.92); }' +
      '.scw-ops-pill > span { color: inherit; }' +
      '.scw-ops-pill .scw-ops-arrow {' +
      '  font-size: 13px; line-height: 1; opacity: 0.9;' +
      '}' +

      /* Terminal (already published) — neutral grey, non-interactive. */
      '.scw-ops-pill.is-terminal {' +
      '  background: #e2e8f0; color: #475569 !important; cursor: default;' +
      '}' +
      '.scw-ops-pill.is-terminal:hover { filter: none; }' +

      /* Pending — Make accepted the webhook but hasn't finished.
         Grey pill with an inline spinner, non-interactive. Polling
         clears this state once the SOW's field values catch up. */
      '.scw-ops-pill.is-pending {' +
      '  background: #e2e8f0; color: #475569 !important; cursor: wait;' +
      '}' +
      '.scw-ops-pill.is-pending:hover { filter: none; }' +
      '.scw-ops-pending-spinner {' +
      '  display: inline-block; width: 12px; height: 12px;' +
      '  border: 2px solid rgba(71,85,105,0.25);' +
      '  border-top-color: #475569; border-radius: 50%;' +
      '  animation: scw-ops-pending-spin 0.8s linear infinite;' +
      '}' +
      '@keyframes scw-ops-pending-spin { to { transform: rotate(360deg); } }' +

      /* Info status message (e.g. "Ready for Survey") — plain muted
         italic text, no background, no border. Reads as status, not
         as a button. */
      '.scw-ops-status-msg {' +
      '  display: inline-block; font: italic 500 12px/1.2 system-ui, sans-serif;' +
      '  color: #64748b; cursor: default;' +
      '}' +

      /* Inline info glyph for the auto-revert note trail. */
      '.scw-ops-info {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 13px; height: 13px; border-radius: 50%;' +
      '  background: rgba(255,255,255,0.25); color: inherit;' +
      '  font-style: italic; font-weight: 700;' +
      '  font-size: 9px; line-height: 1; cursor: help;' +
      '  font-family: Georgia, "Times New Roman", serif;' +
      '}' +
      '.scw-ops-pill.is-terminal .scw-ops-info { background: rgba(0,0,0,0.12); }' +

      /* Floating tooltip — JS appends a single .scw-ops-floating-tip div
         to <body> and positions it via fixed coords on hover. CSS pseudo
         tooltips were getting clipped by Knack's .kn-table-wrapper /
         accordion overflow chain; living on body bypasses all of that. */
      /* Survey-costs gate. A BLANK survey-costs field blocks the Preview
         pill and flags the field red; an explicit $0 is a valid answer
         and clears the gate. */
      '.scw-ops-pill--gated {' +
      '  background: #e5e7eb !important; color: #9ca3af !important;' +
      '  border-color: #d1d5db !important; cursor: not-allowed !important;' +
      '  box-shadow: none !important; pointer-events: auto;' +
      '}' +
      '.scw-ops-pill--gated .scw-ops-arrow { opacity: 0.5; }' +
      '#' + VIEW_ID + ' td.scw-ops-survey-missing,' +
      '#' + VIEW_ID + ' td.scw-ops-survey-missing.cell-edit {' +
      '  background: #fef2f2 !important;' +
      '  box-shadow: inset 0 0 0 2px #dc2626 !important;' +
      '}' +

      '.scw-ops-floating-tip {' +
      '  position: fixed; display: none;' +
      '  background: #1f2937; color: #fff;' +
      '  padding: 6px 10px; border-radius: 5px;' +
      '  font: 500 11.5px/1.35 system-ui, sans-serif;' +
      '  max-width: 280px; white-space: normal; text-align: left;' +
      '  box-shadow: 0 6px 16px rgba(0,0,0,0.3);' +
      '  z-index: 100000; pointer-events: none;' +
      '}';

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────
  // Look up the Knack record attrs for a table row by its 24-hex id.
  // Preferred over DOM scraping — the model carries the raw field
  // value regardless of column display format (text vs. checkbox icon
  // vs. hidden column). Returns null if the model isn't ready.
  function getRowAttrs(tr) {
    try {
      var id = tr && tr.id;
      if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
      var v = Knack && Knack.views && Knack.views[VIEW_ID];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return null;
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === id) return models[i].attributes;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function readBoolFromModel(a, fieldKey) {
    if (!a) return null;
    var raw = a[fieldKey + '_raw'];
    if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
    if (typeof raw === 'string') {
      var rs = raw.trim().toLowerCase();
      if (rs === 'yes' || rs === 'true')  return 'yes';
      if (rs === 'no'  || rs === 'false') return 'no';
    }
    var dv = a[fieldKey];
    if (typeof dv === 'string') {
      var ds = dv.replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (ds === 'yes' || ds === 'true')  return 'yes';
      if (ds === 'no'  || ds === 'false') return 'no';
    }
    return null;
  }
  function readBool(tr, fieldKey) {
    var fromModel = readBoolFromModel(getRowAttrs(tr), fieldKey);
    if (fromModel) return fromModel;
    var td = tr.querySelector('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!td) return 'no';
    var t = (td.textContent || '').replace(/[ \s]/g, ' ').trim().toLowerCase();
    return (t === 'yes' || t === 'true') ? 'yes' : 'no';
  }
  function readText(tr, fieldKey) {
    var a = getRowAttrs(tr);
    if (a) {
      var raw = a[fieldKey + '_raw'];
      if (raw != null && typeof raw !== 'object') return String(raw);
      var v = a[fieldKey];
      if (v != null) return String(v).replace(/<[^>]*>/g, '').trim();
    }
    var td = tr.querySelector('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    return td ? (td.textContent || '').replace(/[ \s]+/g, ' ').trim() : '';
  }
  function toNum(v) {
    if (v == null) return 0;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function readNote(tr) { return readText(tr, NOTE_FIELD); }

  // ── Survey-costs gate ──────────────────────────────────────────
  // Survey costs (field_2750) must be answered before a proposal can be
  // previewed. BLANK (never entered) blocks the Preview pill; an explicit
  // $0 is a valid answer ("no survey costs") and clears the gate. Zero and
  // blank are distinguishable because a real 0 reads as "0" while an empty
  // field reads as "".
  function surveyCostsBlank(tr) {
    if (!tr) return false;
    var raw = String(readText(tr, SURVEY_COSTS_FIELD) || '').trim();
    return raw === '';
  }

  var SURVEY_GATE_TIP =
    'Enter survey costs first (enter $0 if there were none) to preview the proposal.';

  // Block + restyle a Preview pill when survey costs are missing. Shared by
  // renderCell (view_3325) and buildPillForRow (bid-review v1 + v2). The
  // gate is class-based so it can be toggled live (see applySurveyGate)
  // without a re-render; a delegated click handler (below) blocks navigation
  // on any .scw-ops-pill--gated.
  function applySurveyGate(pill, blank) {
    if (!pill) return pill;
    if (blank) {
      pill.classList.add('scw-ops-pill--gated');
      // Stash + strip href so the link can't be followed (keyboard, etc.).
      var href = pill.getAttribute('href');
      if (href != null) {
        pill.setAttribute('data-scw-gated-href', href);
        pill.removeAttribute('href');
      }
      pill.setAttribute('aria-disabled', 'true');
      pill.setAttribute('data-scw-tip', SURVEY_GATE_TIP);
      pill.setAttribute('title', SURVEY_GATE_TIP);
    } else {
      pill.classList.remove('scw-ops-pill--gated');
      var stashed = pill.getAttribute('data-scw-gated-href');
      if (stashed != null) {
        pill.setAttribute('href', stashed);
        pill.removeAttribute('data-scw-gated-href');
      }
      pill.removeAttribute('aria-disabled');
      // Only clear the tip/title if it's the gate's (don't clobber notes).
      if (pill.getAttribute('data-scw-tip') === SURVEY_GATE_TIP) {
        pill.removeAttribute('data-scw-tip');
      }
      if (pill.getAttribute('title') === SURVEY_GATE_TIP) {
        pill.removeAttribute('title');
      }
    }
    return pill;
  }

  function gatePillForSurvey(pill, tr) {
    return applySurveyGate(pill, surveyCostsBlank(tr));
  }

  // Flag the survey-costs cell red in view_3325 when blank.
  function markSurveyCostCell(tr) {
    if (!tr) return;
    var td = tr.querySelector('td.' + SURVEY_COSTS_FIELD +
      ', td[data-field-key="' + SURVEY_COSTS_FIELD + '"]');
    if (td) td.classList.toggle('scw-ops-survey-missing', surveyCostsBlank(tr));
  }

  // Returns the margin as a percent (0-100). Knack percent fields can
  // be stored as a fraction (0.095) or as a percent (9.5) depending on
  // how the field was configured; normalize so the threshold check is
  // always against a percent.
  function readMarginPct(tr) {
    var raw = readText(tr, MARGIN_FIELD);
    if (raw === '' || raw == null) return NaN;
    var n = toNum(raw);
    if (!isFinite(n)) return NaN;
    // Fraction-stored field → convert to percent. 1.5 cap leaves enough
    // headroom that "100%" stored as 100 isn't accidentally interpreted
    // as a fraction.
    if (n > 0 && n <= 1.5) n = n * 100;
    return n;
  }

  function buildMarginWarning(extraButton) {
    var box = document.createElement('div');
    box.className = 'scw-ops-margin-warning';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
      '<line x1="12" y1="9" x2="12" y2="13"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
      '</svg>' +
      '<span></span>';
    box.querySelector('span').textContent = MARGIN_WARNING_MSG;

    // Optional inline action button(s) — pass a single { label, dataAttrs }
    // object or an array of them. The caller is responsible for wiring up
    // the click handlers; we just render the buttons with the supplied
    // label + data-* attributes.
    var buttons = extraButton ? (Array.isArray(extraButton) ? extraButton : [extraButton]) : [];
    for (var bi = 0; bi < buttons.length; bi++) {
      var bcfg = buttons[bi];
      if (!bcfg || !bcfg.label) continue;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-ops-margin-warning__btn';
      btn.textContent = bcfg.label;
      if (bcfg.dataAttrs) {
        var dKeys = Object.keys(bcfg.dataAttrs);
        for (var di = 0; di < dKeys.length; di++) {
          btn.setAttribute(dKeys[di], bcfg.dataAttrs[dKeys[di]]);
        }
      }
      box.appendChild(btn);
    }
    return box;
  }

  function resolveStep(tr) {
    var fields = {
      ready:     readBool(tr, READY_FIELD),
      survey:    readBool(tr, SURVEY_FIELD),
      crCount:   readText(tr, CR_COUNT_FIELD),
      validated: readBool(tr, RELEASED_FIELD)
    };
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].showWhen(fields)) return STEPS[i];
    }
    return null; // terminal
  }

  // Per-row proposal URL. Hardcoded slug — the proposal page lives at
  // #proposals/proposal/<sowRecordId>/ regardless of where the user
  // navigates from. Scraping the row's anchors (or building from the
  // current hash) was fragile: the moment another action-page column
  // got added to the table, querySelector picked up the wrong link;
  // and current-hash construction depended on which child page the
  // user was viewing. The slug is the contract — pin to it.
  var PROPOSAL_SLUG = '#proposals/proposal/';
  function getRowLink(tr) {
    var m = (tr.id || '').match(/[a-f0-9]{24}/i);
    if (!m) return '';
    return PROPOSAL_SLUG + m[0] + '/';
  }

  // ── Published-proposal index ────────────────────────────
  // Delegates to the shared SCW.publishedQuoteInfo helper. Field keys
  // were defined at the top of this file as PROPOSAL_NAME / etc. and
  // are passed through; the helper handles model-first / DOM-fallback
  // and Published-status filtering.
  function buildProposalIndex(sourceViewOverride, reviewPdfField) {
    if (!window.SCW || !SCW.publishedQuoteInfo) return {};
    return SCW.publishedQuoteInfo.readById({
      sourceView:  sourceViewOverride || PROPOSAL_VIEW,
      statusField: PROPOSAL_STATUS,
      nameField:   PROPOSAL_NAME,
      expField:    PROPOSAL_EXP,
      pdfField:    PROPOSAL_PDF,
      reviewPdfField: reviewPdfField || '',
      sowField:    PROPOSAL_SOW
    });
  }

  function renderProposalBlock(hostTd, proposal, tr) {
    if (!proposal || !window.SCW || !SCW.publishedQuoteInfo) return;
    var block = SCW.publishedQuoteInfo.buildBlock(proposal, {
      variant: 'compact',
      // The row id IS the SOW record id on this grid — carry it onto the block
      // so pq-expiration-edit can mirror field_2659 → the SOW's field_2135.
      sowRecordId: (tr && tr.id) || '',
      // Default linkBuilder targets
      //   #published-proposals/sow-published-proposal-details/<recordId>
      // — the canonical "view the published quote" destination. The pill
      // itself navigates to the SOW proposal page; this link is for the
      // proposal record specifically.
      customerLink: {
        url:                  proposal.tokenUrl || '',
        label:                'Open Customer Link',
        expiredFallbackUrl:   proposal.viewLink || '',
        expiredFallbackLabel: 'View Published Details'
      }
    });
    if (block) hostTd.appendChild(block);
  }

  function findStepById(stepId) {
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].id === stepId) return STEPS[i];
    }
    return null;
  }

  // ── Pending helpers ─────────────────────────────────────
  function readPending(sowId) {
    if (!sowId) return null;
    try {
      var raw = localStorage.getItem(PENDING_KEY_PREFIX + sowId);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.stepId || !data.timestamp) return null;
      if (Date.now() - data.timestamp > PENDING_TIMEOUT_MS) {
        clearPending(sowId);
        return null;
      }
      return data;
    } catch (e) { return null; }
  }
  function clearPending(sowId) {
    try { localStorage.removeItem(PENDING_KEY_PREFIX + sowId); } catch (e) {}
  }
  function hasAnyPending() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PENDING_KEY_PREFIX) === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  // ── Polling while pending flags are set ─────────────────
  // Single timer at module scope — schedulePoll is idempotent, so
  // multiple renderCell invocations during one transform don't stack
  // up competing pollers.
  var _pollTimer = null;
  function schedulePoll() {
    if (_pollTimer) return;
    if (!hasAnyPending()) return;
    _pollTimer = setTimeout(function () {
      _pollTimer = null;
      pollOnce();
    }, POLL_INTERVAL_MS);
  }
  function pollOnce() {
    // Fetch both the SOW grid AND the published-proposal grid so
    // (a) the pending flag clears as soon as the row's field flags
    // flip, and (b) any new published-proposal record Make created
    // shows up in the per-row info block under the pill. Both fetches
    // trigger knack-view-render → transform, which is idempotent.
    try {
      var views = [VIEW_ID, PROPOSAL_VIEW];
      for (var i = 0; i < views.length; i++) {
        var v = Knack && Knack.views && Knack.views[views[i]];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch();
        }
      }
    } catch (e) { /* ignore */ }
    // Schedule the next poll unconditionally — schedulePoll bails on
    // its own when no pending flags remain.
    setTimeout(schedulePoll, 200);
  }

  function renderPendingCell(hostTd, pendingStep) {
    var pill = document.createElement('span');
    pill.className = 'scw-ops-pill is-pending';

    var spinner = document.createElement('span');
    spinner.className = 'scw-ops-pending-spinner';
    pill.appendChild(spinner);

    var label = document.createElement('span');
    label.textContent = 'Processing ' + (pendingStep ? pendingStep.label : 'action') + '…';
    pill.appendChild(label);

    hostTd.appendChild(pill);
  }

  // ── Render one cell ─────────────────────────────────────
  function renderCell(hostTd, tr, proposalIndex) {
    hostTd.innerHTML = '';
    hostTd.classList.add(CELL_CLASS);
    hostTd.setAttribute(PROCESSED, '1');

    var step = resolveStep(tr);
    var note = readNote(tr);

    // Pending-step short-circuit. If Make is still working on this
    // SOW AND the currently-resolved step matches what ops-stepper
    // just kicked off, show a grayed-out "Processing…" pill and
    // leave the proposal block off for now. If the resolved step
    // differs from what's pending, Make finished — clear the flag.
    var pending = readPending(tr.id);
    if (pending) {
      var pendingStep = findStepById(pending.stepId);
      if (step && step.id === pending.stepId) {
        renderPendingCell(hostTd, pendingStep || step);
        schedulePoll();
        return;
      }
      // Step advanced past what was pending → Make committed its
      // writes. Clear and fall through to normal rendering.
      clearPending(tr.id);
    }

    var pill;
    // The Preview button is the universal "next-step" affordance — it
    // navigates to the proposal page where every actual action lives.
    // Always render it, regardless of whether a STEP matches: even
    // when the SOW is in a waiting state ("ready, awaiting Sales") or
    // a terminal state ("released to sales"), the reviewer should
    // still be able to click through to the proposal page. STEP
    // resolution is kept around purely so the pending pill can show
    // "Processing X…" with the right label.
    pill = document.createElement('a');
    pill.className = 'scw-ops-pill';
    var href = getRowLink(tr);
    if (href) pill.setAttribute('href', href);
    pill.setAttribute('target', '_blank');
    pill.setAttribute('rel', 'noopener');

    var labelSpan = document.createElement('span');
    labelSpan.textContent = 'Preview Proposal for Next Steps';
    pill.appendChild(labelSpan);

    if (note) {
      pill.setAttribute('data-scw-tip', note);
      var info = document.createElement('span');
      info.className = 'scw-ops-info';
      info.setAttribute('data-scw-tip', note);
      info.textContent = 'i';
      pill.appendChild(info);
    }

    var arrow = document.createElement('span');
    arrow.className = 'scw-ops-arrow';
    arrow.textContent = '›';
    pill.appendChild(arrow);

    // Gate the Preview pill + flag the survey-costs cell when survey
    // costs are blank ($0 is a valid answer and clears the gate).
    gatePillForSurvey(pill, tr);
    markSurveyCostCell(tr);

    hostTd.appendChild(pill);

    // Margin warning — fires whenever field_2749 < 10%. Sits between
    // the pill and the proposal block so reviewers see it next to the
    // next-step affordance for that SOW. Now includes the same two
    // recovery action buttons as the bid-review margin warning:
    //   1. Add Project Management & Mobilization line item
    //   2. Increase project margin to <target>% (shown only when
    //      subBidTotal is readable from the row)
    var marginPct = readMarginPct(tr);
    if (isFinite(marginPct) && marginPct < MARGIN_THRESHOLD) {
      var warning = buildMarginWarning(buildMarginRecoveryButtons(tr));
      bindMarginRecoveryClicks(warning, tr);
      hostTd.appendChild(warning);
    }

    // Per-row published-proposal info (view_3885 → matched via field_2666).
    // Rendered regardless of step state so a published proposal shows
    // up even when the SOW is in "Released to Sales" terminal state.
    if (proposalIndex && tr.id) {
      var proposal = proposalIndex[tr.id];
      if (proposal) {
        renderProposalBlock(hostTd, proposal, tr);
      } else {
        renderNoProposalMessage(hostTd);
      }
    }
  }

  function renderNoProposalMessage(hostTd) {
    if (!window.SCW || !SCW.publishedQuoteInfo) return;
    var block = SCW.publishedQuoteInfo.buildBlock(null, {
      variant: 'compact',
      emptyText: 'No published quotes'
    });
    if (block) hostTd.appendChild(block);
  }

  // ── Scan view, transform each data row ──────────────────
  function transform() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    var table = view.querySelector('table.kn-table-table');
    if (!table) return;

    // Relabel the host column header once.
    var hostTh = table.querySelector('thead th.' + HOST_FIELD);
    if (hostTh && !hostTh.getAttribute('data-scw-ops-review-th')) {
      hostTh.classList.add(CELL_CLASS);
      hostTh.setAttribute('data-scw-ops-review-th', '1');
      var lbl = hostTh.querySelector('.table-fixed-label span');
      if (lbl) lbl.textContent = 'Next Step:';
      var link = hostTh.querySelector('a.kn-sort');
      if (link) link.removeAttribute('href');
    }

    // Build the published-proposal index once per transform — each
    // row's renderCell looks up its match by SOW id.
    var proposalIndex = buildProposalIndex();

    var rows = table.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
      var hostTd = tr.querySelector('td.' + HOST_FIELD +
                                   ', td[data-field-key="' + HOST_FIELD + '"]');
      if (!hostTd) continue;
      renderCell(hostTd, tr, proposalIndex);
    }
  }

  // Suppress Knack's inline-edit popup on the managed cell — the pill
  // is the only interactive surface, and it's a link, not an edit control.
  // Stop mousedown AND click from bubbling to the td.cell-edit handler,
  // but do NOT preventDefault on click so the anchor's native navigation
  // still fires.
  document.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td[' + PROCESSED + ']');
    if (!td) return;
    if (e.target.closest('.scw-ops-pill, .scw-ops-info, .scw-pq-info')) {
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('click', function (e) {
    var td = e.target.closest('td[' + PROCESSED + ']');
    if (!td) return;
    if (e.target.closest('.scw-ops-pill, .scw-ops-info, .scw-pq-info')) {
      e.stopPropagation();
    }
  }, true);

  // Block navigation on any gated Preview pill (survey costs missing),
  // anywhere it's rendered — view_3325 cell OR the bid-review status bar.
  document.addEventListener('click', function (e) {
    var gated = e.target.closest && e.target.closest('.scw-ops-pill--gated');
    if (gated) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Live gate for the bid-review status-bar survey-costs input (v1 + v2).
  // Toggle the Preview pill + the red field flag as the user types, so the
  // gate clears the instant a value (incl. $0) is entered — no waiting for
  // a grid re-render. The pill lives in the same SOW header (thead) as the
  // input; there's exactly one .scw-ops-pill per SOW header.
  function liveSurveyGate(e) {
    var input = e.target;
    if (!input || !input.classList ||
        !input.classList.contains('scw-bid-review__sow-metric-input') ||
        input.getAttribute('data-action') !== 'sow_survey_costs') return;
    var blank = String(input.value == null ? '' : input.value).trim() === '';
    var head = input.closest('thead') ||
               input.closest('.scw-bid-review__sow-section') || document;
    var pill = head.querySelector('.scw-ops-pill');
    if (pill) applySurveyGate(pill, blank);
    var wrap = input.closest('.scw-bid-review__sow-metric');
    if (wrap) wrap.classList.toggle('scw-bid-review__sow-metric--missing', blank);
  }
  document.addEventListener('input', liveSurveyGate, true);
  document.addEventListener('change', liveSurveyGate, true);

  // ── Floating tooltip ────────────────────────────────────
  // Single tooltip element on <body>, positioned with fixed coords on
  // hover. Living on body avoids clipping by Knack's table wrappers /
  // accordion overflow.
  var _tipEl = null;
  function ensureTip() {
    if (_tipEl) return _tipEl;
    _tipEl = document.createElement('div');
    _tipEl.className = 'scw-ops-floating-tip';
    document.body.appendChild(_tipEl);
    return _tipEl;
  }
  function showTip(target) {
    var text = target.getAttribute('data-scw-tip');
    if (!text) return;
    var tip = ensureTip();
    tip.textContent = text;
    tip.style.display = 'block';
    // Measure after content is set
    var rect = target.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var top  = rect.top - th - 8;
    var left = rect.left + (rect.width / 2) - (tw / 2);
    // Clamp horizontally
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    // Flip below if no room above
    if (top < 8) top = rect.bottom + 8;
    tip.style.top  = top  + 'px';
    tip.style.left = left + 'px';
  }
  function hideTip() {
    if (_tipEl) _tipEl.style.display = 'none';
  }
  // Use mouseover/mouseout (which bubble) with .closest() for delegation.
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('.scw-ops-pill[data-scw-tip], .scw-ops-info[data-scw-tip], .scw-ops-status-msg[data-scw-tip]');
    if (t) showTip(t);
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest('.scw-ops-pill[data-scw-tip], .scw-ops-info[data-scw-tip], .scw-ops-status-msg[data-scw-tip]');
    if (t) hideTip();
  });
  // Hide on scroll so the tooltip doesn't drift away from its anchor.
  window.addEventListener('scroll', hideTip, true);

  // ── Bindings ────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + VIEW_ID + EVENT_NS)
      .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
        setTimeout(transform, 150);
      });

    // view_3885 (published proposals) may render after view_3325.
    // Re-run transform when it arrives so per-row proposal info
    // populates as soon as the data is available.
    $(document)
      .off('knack-view-render.' + PROPOSAL_VIEW + EVENT_NS)
      .on('knack-view-render.' + PROPOSAL_VIEW + EVENT_NS, function () {
        setTimeout(transform, 150);
      });

    $(document)
      .off('knack-cell-update.' + VIEW_ID + EVENT_NS)
      .on('knack-cell-update.' + VIEW_ID + EVENT_NS, function () {
        setTimeout(transform, 150);
      });
  }

  injectStyles();
  bind();
  if (document.getElementById(VIEW_ID)) transform();

  // ── Public API ──────────────────────────────────────────
  // Called from sales-change-request/submit.js after a successful submit.
  // Flips field_2725 → No on the SOW (so the "Released to Sales" pill drops
  // back to "Publish & Submit Proposal") and drops a timestamped note
  // into field_2736 so the UI can surface the "why" as a tooltip.
  function autoRevertValidation(sowRecordId, opts) {
    if (!sowRecordId || !/^[a-f0-9]{24}$/i.test(sowRecordId)) return;
    opts = opts || {};
    var count = opts.itemCount || 0;
    var noteText = 'Auto-reverted ' + formatDate(new Date()) +
                   ' — change request submitted' +
                   (count ? ' (' + count + ' item' + (count === 1 ? '' : 's') + ')' : '');

    var body = {};
    body[RELEASED_FIELD] = 'No';
    body[NOTE_FIELD]  = noteText;

    var writeView = opts.viewId || WRITE_VIEW;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, sowRecordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function (resp) {
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(writeView, sowRecordId, resp, RELEASED_FIELD, 'No');
          SCW.syncKnackModel(writeView, sowRecordId, resp, NOTE_FIELD,  noteText);
        }
      },
      error: function (xhr) {
        console.warn('[scw-ops-review] autoRevertValidation failed for ' +
                     sowRecordId, xhr && xhr.responseText);
      }
    });
  }

  function formatDate(d) {
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' +
           String(d.getFullYear()).slice(-2);
  }

  // ── Individual builders (composable from outside) ──
  // Each returns a fresh DOM element OR null when the corresponding
  // affordance doesn't apply. bid-review uses these to compose the
  // SOW status bar in a different order from the ops-list default.

  /** Build the next-step pill (or the "Processing X…" pending pill).
   *  Honors readPending → schedulePoll just like renderCell. */
  function buildPillForRow(tr) {
    if (!tr) return null;

    var step = resolveStep(tr);
    var note = readNote(tr);

    var pending = readPending(tr.id);
    if (pending) {
      var pendingStep = findStepById(pending.stepId);
      if (step && step.id === pending.stepId) {
        var pendingPill = document.createElement('span');
        pendingPill.className = 'scw-ops-pill is-pending';
        var spinner = document.createElement('span');
        spinner.className = 'scw-ops-pending-spinner';
        pendingPill.appendChild(spinner);
        var pendingLabel = document.createElement('span');
        pendingLabel.textContent = 'Processing ' +
          (pendingStep ? pendingStep.label : 'action') + '…';
        pendingPill.appendChild(pendingLabel);
        schedulePoll();
        return pendingPill;
      }
      clearPending(tr.id);
    }

    var pill = document.createElement('a');
    pill.className = 'scw-ops-pill';
    var href = getRowLink(tr);
    if (href) pill.setAttribute('href', href);
    pill.setAttribute('target', '_blank');
    pill.setAttribute('rel', 'noopener');

    var labelSpan = document.createElement('span');
    labelSpan.textContent = 'Preview Proposal for Next Steps';
    pill.appendChild(labelSpan);

    if (note) {
      pill.setAttribute('data-scw-tip', note);
      var info = document.createElement('span');
      info.className = 'scw-ops-info';
      info.setAttribute('data-scw-tip', note);
      info.textContent = 'i';
      pill.appendChild(info);
    }

    var arrow = document.createElement('span');
    arrow.className = 'scw-ops-arrow';
    arrow.textContent = '›';
    pill.appendChild(arrow);

    // Block when survey costs are blank (bid-review v1 + v2 reuse this).
    gatePillForSurvey(pill, tr);

    return pill;
  }

  /** Build the margin-low warning when applicable, or null. */
  function buildMarginWarningForRow(tr, opts) {
    if (!tr) return null;
    opts = opts || {};
    var marginPct = readMarginPct(tr);
    if (!isFinite(marginPct) || marginPct >= MARGIN_THRESHOLD) return null;
    return buildMarginWarning(opts.marginButton);
  }

  // ── Margin-recovery buttons (for view_3325) ──────────────
  // Mirrors bid-review/render.js's marginButtons block. Used by
  // renderCell so the same Add-PM and Set-Margin affordances appear
  // on the ops review SOW list, not just on the bid comparison grid.
  function buildMarginRecoveryButtons(tr) {
    if (!tr || !tr.id) return null;
    var sowId   = tr.id;
    var sowName = readText(tr, 'field_2155') || sowId;  // SOW Name field

    var buttons = [{
      label: 'Add Project Management & Mobilization line item',
      dataAttrs: {
        'data-action':   'add_pm_mobilization',
        'data-sow-id':   sowId,
        'data-sow-name': sowName
      }
    }];

    // Compute the new margin target — same math as bid-review.
    // Knack stores field_2158 as decimal margin (gross). We want the
    // EFFECTIVE margin after survey costs to land at 12%:
    //   margin = (0.12 × subBidTotal + surveyCosts) / (subBidTotal + surveyCosts)
    // If subBidTotal isn't readable (column not on view, missing
    // data), skip the second button — there's nothing meaningful to
    // suggest.
    var subBidTotal = parseFloat(
      String(readText(tr, SUB_BID_TOTAL_FIELD) || '').replace(/[$,]/g, '')
    ) || 0;
    var surveyCosts = parseFloat(
      String(readText(tr, SURVEY_COSTS_FIELD) || '').replace(/[$,]/g, '')
    ) || 0;
    if (subBidTotal > 0) {
      var newMargin = (EFFECTIVE_MARGIN_TARGET * subBidTotal + surveyCosts) /
                      (subBidTotal + surveyCosts);
      var newMarginPct = Math.ceil(newMargin * 1000) / 10;
      buttons.push({
        label: 'Increase project margin to ' + newMarginPct.toFixed(1) + '%',
        dataAttrs: {
          'data-action':       'set_project_margin',
          'data-sow-id':       sowId,
          'data-margin-value': String(newMargin),
          'data-margin-pct':   newMarginPct.toFixed(1),
          'data-margin-field': PROJECT_MARGIN_FIELD
        }
      });
    }
    return buttons;
  }

  // Attach click handlers to the recovery buttons inside a margin-
  // warning box. We bind directly to the rendered DOM nodes (rather
  // than via document-level delegation) so the binding lives and dies
  // with the warning element — no risk of accumulating duplicate
  // handlers across re-renders, no scoping ambiguity if the same
  // action keys are wired elsewhere (e.g. bid-review's mount).
  function bindMarginRecoveryClicks(warningEl, tr) {
    if (!warningEl) return;
    var btns = warningEl.querySelectorAll('.scw-ops-margin-warning__btn[data-action]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var action = btn.getAttribute('data-action');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (action === 'add_pm_mobilization') handleAddPmAction(btn, tr);
          else if (action === 'set_project_margin') handleSetMarginAction(btn, tr);
        });
      })(btns[i]);
    }
  }

  // Fire the same PM/Mobilization webhook bid-review uses. Goes
  // through SCW.bidReview.submitAction so the routing + payload
  // shape stay in one place — that helper is defined globally by
  // bid-review/actions.js so it's available on every page.
  function handleAddPmAction(btn, tr) {
    var sowId   = btn.getAttribute('data-sow-id');
    var sowName = btn.getAttribute('data-sow-name') || sowId;
    if (!sowId) return;
    if (!window.confirm(
      'Add a Project Management & Mobilization line item to ' + sowName + '?'
    )) return;

    var surveyCostsRaw = String(readText(tr, SURVEY_COSTS_FIELD) || '').trim();
    var surveyCostsNum = null;
    var stripped = surveyCostsRaw.replace(/[^0-9.\-]/g, '');
    if (stripped !== '') {
      var n = parseFloat(stripped);
      if (isFinite(n)) surveyCostsNum = n;
    }

    if (!window.SCW || !SCW.bidReview ||
        typeof SCW.bidReview.submitAction !== 'function') {
      console.warn('[scw-ops-margin] SCW.bidReview.submitAction unavailable');
      return;
    }
    btn.disabled = true;
    SCW.bidReview.submitAction({
      actionType:       'add_pm_mobilization',
      sowId:            sowId,
      surveyCosts:      surveyCostsNum,
      surveyCostsRaw:   surveyCostsRaw,
      surveyCostsField: SURVEY_COSTS_FIELD
    }).always(function () {
      btn.disabled = false;
      // Refetch view_3325 so the margin recalculates from the new
      // line item. Bid-review's own refresh path doesn't run here.
      try {
        var v = Knack && Knack.views && Knack.views[VIEW_ID];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) { /* ignore */ }
    });
  }

  // Direct PUT to view_3325's record endpoint setting field_2158.
  // Bid-review's flow uses a form view (view_3923) to update margin,
  // but that form isn't on this scene — so we write the field directly.
  // If view_3325 doesn't have field_2158 in its inline-edit allow-list,
  // Knack will silently strip it; we log a warning if the response
  // comes back without the new value so the user knows to add it.
  function handleSetMarginAction(btn, tr) {
    var sowId       = btn.getAttribute('data-sow-id');
    var marginValue = parseFloat(btn.getAttribute('data-margin-value'));
    var marginPct   = btn.getAttribute('data-margin-pct') || '';
    if (!sowId || !isFinite(marginValue)) return;
    if (!window.confirm(
      'Bump project margin to ' + marginPct + '% on this SOW?'
    )) return;

    if (!window.SCW || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      console.warn('[scw-ops-margin] SCW.knackAjax unavailable');
      return;
    }
    btn.disabled = true;
    var body = {};
    body[PROJECT_MARGIN_FIELD] = marginValue;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(VIEW_ID, sowId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        var R = (resp && resp.record) || resp || {};
        var saved = R[PROJECT_MARGIN_FIELD];
        if (saved == null || saved === '' ||
            (typeof saved === 'number' && Math.abs(saved - marginValue) > 0.001)) {
          console.warn('[scw-ops-margin] set_project_margin: response',
            'came back without the expected value. field_2158 may not be',
            'inline-editable on view_3325 — check the view\'s Inline Edit',
            'config.', resp);
        }
        // Refetch view_3325 to recompute the margin warning state.
        try {
          var v = Knack && Knack.views && Knack.views[VIEW_ID];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e) { /* ignore */ }
      },
      error: function (xhr) {
        console.error('[scw-ops-margin] set_project_margin PUT failed',
          xhr && xhr.status, xhr && xhr.responseText);
      },
      complete: function () { btn.disabled = false; }
    });
  }

  /** Build the published-proposal block (or "No published quotes"
   *  placeholder) for this SOW. opts.proposalViewKey overrides the
   *  default ops-list source view (view_3885). opts.reviewPdfField
   *  additionally surfaces the internal sub-bid review PDF when the
   *  source view carries it; opts.proposalLinkBuilder(proposal) → href
   *  makes the proposal number itself a link. */
  function buildProposalBlockForRow(tr, opts) {
    if (!tr) return null;
    opts = opts || {};
    if (!window.SCW || !SCW.publishedQuoteInfo) return null;
    var proposalIndex = buildProposalIndex(opts.proposalViewKey, opts.reviewPdfField);
    if (!proposalIndex || !tr.id) return null;
    var proposal = proposalIndex[tr.id];
    if (proposal) {
      return SCW.publishedQuoteInfo.buildBlock(proposal, {
        variant: 'compact',
        linkBuilder: opts.proposalLinkBuilder,
        customerLink: {
          url:                  proposal.tokenUrl || '',
          label:                'Open Customer Link',
          expiredFallbackUrl:   proposal.viewLink || '',
          expiredFallbackLabel: 'View Published Details'
        }
      });
    }
    return SCW.publishedQuoteInfo.buildBlock(null, {
      variant: 'compact',
      emptyText: 'No published quotes'
    });
  }

  // ── Public: build a next-step DOM block for an arbitrary view_3325 row ──
  // Default-order composer (pill → margin warning → proposal block).
  // Callers wanting a different order should compose the individual
  // builders above instead.
  function buildBlockForRow(tr, opts) {
    opts = opts || {};
    if (!tr) return null;

    var container = document.createElement('div');
    container.className = 'scw-ops-block';

    var pill = buildPillForRow(tr);
    if (pill) container.appendChild(pill);

    // Margin warning. When the caller supplies no explicit marginButton
    // (e.g. sow-grid-cards calls buildBlockForRow(tr) bare), default to the
    // FULL recovery buttons + click bindings — the same affordances the old
    // view_3325 table cell rendered. Without this default, the SOW-cards
    // transition silently dropped the "Add Project Management & Mobilization
    // line item" / "Increase project margin" buttons (warning text only), so
    // the PM webhook could never fire from that page. Callers that pass
    // marginButton (bid-review) keep full control.
    var warning;
    if (opts.marginButton === undefined) {
      warning = buildMarginWarningForRow(tr, { marginButton: buildMarginRecoveryButtons(tr) });
      bindMarginRecoveryClicks(warning, tr);
    } else {
      warning = buildMarginWarningForRow(tr, opts);
    }
    if (warning) container.appendChild(warning);

    if (opts.includeProposalBlock !== false) {
      var block = buildProposalBlockForRow(tr, opts);
      if (block) container.appendChild(block);
    }

    return container;
  }

  window.SCW = window.SCW || {};
  SCW.opsReview = SCW.opsReview || {};
  SCW.opsReview.autoRevertValidation       = autoRevertValidation;
  SCW.opsReview.buildBlockForRow           = buildBlockForRow;
  SCW.opsReview.buildPillForRow            = buildPillForRow;
  SCW.opsReview.surveyCostsBlank           = surveyCostsBlank;
  SCW.opsReview.applySurveyGate            = applySurveyGate;
  SCW.opsReview.buildMarginWarningForRow   = buildMarginWarningForRow;
  SCW.opsReview.buildProposalBlockForRow   = buildProposalBlockForRow;
})();
