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
    {
      // Ops has marked ready but Sales hasn't requested the survey
      // yet — waiting state. Non-clickable status message.
      id:       'ready-for-survey',
      label:    'Ready for Survey!',
      info:     true,
      showWhen: function (f) {
        return f.ready === 'yes' && f.survey !== 'yes' && !(toNum(f.crCount) > 0);
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

      /* Per-row published-proposal info block — sits below the pill.
         Styled compact + muted so the pill stays the primary element. */
      '.scw-ops-proposal-info {' +
      '  margin-top: 8px;' +
      '  padding-top: 6px;' +
      '  border-top: 1px solid #e5e7eb;' +
      '  font: 400 11px/1.4 system-ui, sans-serif;' +
      '  color: #64748b;' +
      '  text-align: center;' +
      '}' +
      '.scw-ops-proposal-name {' +
      '  font-weight: 500;' +
      '  margin-bottom: 2px;' +
      '}' +
      '.scw-ops-proposal-name a,' +
      '.scw-ops-proposal-name a:visited {' +
      '  color: #2563eb; text-decoration: none;' +
      '}' +
      '.scw-ops-proposal-name a:hover { text-decoration: underline; }' +
      '.scw-ops-proposal-exp {' +
      '  font-size: 10.5px;' +
      '  color: #64748b;' +
      '}' +
      '.scw-ops-proposal-pdf,' +
      '.scw-ops-proposal-pdf:visited {' +
      '  display: inline-flex; align-items: center;' +
      '  margin-top: 3px; color: #2563eb;' +
      '  text-decoration: none; font-size: 10.5px;' +
      '}' +
      '.scw-ops-proposal-pdf:hover { text-decoration: underline; }' +
      /* Empty-state message when no matching published proposal
         exists for a SOW. Same layout as the info block, but muted
         and italicised so it reads as an absence rather than data. */
      '.scw-ops-proposal-empty {' +
      '  font-style: italic; color: #94a3b8;' +
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

  // Pull the per-row proposal/detail URL. Prefers an existing kn-link-page
  // anchor in the row (the "Proposal" column when it exists). When the
  // view doesn't include that column, fall back to constructing the URL
  // from the current page's hash plus the row's record id —
  //   <current-hash>/proposal/<sowRecordId>
  // matches the route pattern Knack uses for the proposal page.
  function getRowLink(tr) {
    var a = tr.querySelector('a.kn-link-page[href]');
    if (a && a.getAttribute('href')) return a.getAttribute('href');
    var m = (tr.id || '').match(/[a-f0-9]{24}/i);
    if (!m) return '';

    var hash  = window.location.hash || '';
    var qIdx  = hash.indexOf('?');
    var path  = qIdx >= 0 ? hash.substring(0, qIdx) : hash;
    var query = qIdx >= 0 ? hash.substring(qIdx)    : '';
    if (path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return path + '/proposal/' + m[0] + query;
  }

  // ── Published-proposal index ────────────────────────────
  // Keyed by the SOW id each proposal connects to (field_2666). Tries
  // the Knack model first; falls back to DOM scraping of view_3885's
  // table rows when the model isn't populated yet.
  //
  // Filters to status=Published (field_2658). view_3885 includes drafts
  // and earlier revisions as well — without the filter we'd pick up
  // whatever row happened to render first for a given SOW, not the
  // currently-published one.
  function buildProposalIndex() {
    var idx = {};
    var hits = 0;

    // 1. Knack model (preferred — has _raw values for every field).
    try {
      var v = Knack && Knack.views && Knack.views[PROPOSAL_VIEW];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i].attributes;
          if (!a) continue;
          if (!isPublishedFromAttrs(a)) continue;
          var sowId = readSowIdFromAttrs(a);
          if (!sowId || idx[sowId]) continue;
          idx[sowId] = extractProposalInfoFromAttrs(a);
          hits++;
        }
      }
    } catch (e) { /* fall through to DOM */ }

    // 2. DOM fallback — when the model is unavailable, scrape directly
    // from the rendered table. Works as long as field_2666 is one of
    // the columns on view_3885 (connection cells carry the record id
    // as the inner span's class attribute) and field_2658 (status) is
    // either in the view or absent entirely. If the status column is
    // absent from the DOM AND the model isn't ready, every row is
    // kept — but that's a degenerate case you'd only hit during a
    // race with initial render.
    if (!hits) {
      try {
        var viewEl = document.getElementById(PROPOSAL_VIEW);
        if (viewEl) {
          var rows = viewEl.querySelectorAll('tbody tr[id]');
          for (var r = 0; r < rows.length; r++) {
            var tr = rows[r];
            if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
            if (!isPublishedFromDom(tr)) continue;
            var sowIdDom = readSowIdFromDom(tr);
            if (!sowIdDom || idx[sowIdDom]) continue;
            idx[sowIdDom] = extractProposalInfoFromDom(tr);
            hits++;
          }
        }
      } catch (e) { /* ignore */ }
    }

    return idx;
  }

  function isPublishedFromAttrs(attrs) {
    var raw = attrs[PROPOSAL_STATUS + '_raw'];
    if (typeof raw === 'string' && raw.trim()) {
      return /published/i.test(raw);
    }
    var v = attrs[PROPOSAL_STATUS];
    if (typeof v === 'string' && v.trim()) {
      return /published/i.test(v.replace(/<[^>]*>/g, ''));
    }
    return false;
  }

  function isPublishedFromDom(tr) {
    var cell = tr.querySelector('td.' + PROPOSAL_STATUS +
                                ', td[data-field-key="' + PROPOSAL_STATUS + '"]');
    if (!cell) {
      // Status column isn't on the view — accept all rows rather than
      // silently filtering everything out.
      return true;
    }
    var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    return /published/i.test(text);
  }

  function readSowIdFromAttrs(attrs) {
    var raw = attrs[PROPOSAL_SOW + '_raw'];
    if (Array.isArray(raw) && raw.length) {
      var id = raw[0] && raw[0].id;
      return (id && /^[a-f0-9]{24}$/i.test(id)) ? id : '';
    }
    if (typeof raw === 'string' && /^[a-f0-9]{24}$/i.test(raw)) return raw;
    return '';
  }

  function readSowIdFromDom(tr) {
    var cell = tr.querySelector('td.' + PROPOSAL_SOW +
                                ', td[data-field-key="' + PROPOSAL_SOW + '"]');
    if (!cell) return '';
    var span = cell.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    var cls = (span.className || '').trim();
    return /^[a-f0-9]{24}$/i.test(cls) ? cls : '';
  }

  function extractProposalInfoFromAttrs(attrs) {
    var id = attrs.id || '';
    var name    = String(attrs[PROPOSAL_NAME] || '').replace(/<[^>]*>/g, '').trim();
    var expDate = String(attrs[PROPOSAL_EXP]  || '').replace(/<[^>]*>/g, '').trim();

    // File fields have two raw forms depending on Knack's version —
    // try both, plus an HTML-anchor regex fallback.
    var pdfUrl = '', pdfName = '';
    var pdfRaw = attrs[PROPOSAL_PDF + '_raw'];
    if (pdfRaw && typeof pdfRaw === 'object') {
      pdfUrl  = pdfRaw.url || '';
      pdfName = pdfRaw.filename || '';
    }
    if (!pdfUrl) {
      var pdfHtml = String(attrs[PROPOSAL_PDF] || '');
      var mHref = pdfHtml.match(/href="([^"]+)"/i);
      if (mHref) pdfUrl = mHref[1];
      var mName = pdfHtml.match(/>([^<]+\.pdf)</i);
      if (mName) pdfName = mName[1];
    }

    // "View Published Proposal" link — the kn-link-page anchor Knack
    // renders in the row. Scrape from the DOM since the href isn't
    // in the model.
    var viewLink = '';
    if (id) {
      var viewEl = document.getElementById(PROPOSAL_VIEW);
      if (viewEl) {
        var row = viewEl.querySelector('tr#' + id);
        if (row) {
          var a = row.querySelector('a.kn-link-page');
          if (a) viewLink = a.getAttribute('href') || '';
        }
      }
    }

    return {
      recordId: id,
      name:     name,
      expDate:  expDate,
      pdfUrl:   pdfUrl,
      pdfName:  pdfName || 'Download PDF',
      viewLink: viewLink
    };
  }

  function extractProposalInfoFromDom(tr) {
    function cellText(fieldKey) {
      var td = tr.querySelector('td.' + fieldKey +
                                ', td[data-field-key="' + fieldKey + '"]');
      if (!td) return '';
      // Strip the outer col-N wrapper and return clean text.
      return (td.textContent || '').replace(/\s+/g, ' ').trim();
    }
    function cellAnchor(fieldKey) {
      var td = tr.querySelector('td.' + fieldKey +
                                ', td[data-field-key="' + fieldKey + '"]');
      if (!td) return null;
      return td.querySelector('a');
    }

    var pdfA = cellAnchor(PROPOSAL_PDF);
    var pageA = tr.querySelector('a.kn-link-page');

    return {
      recordId: tr.id || '',
      name:     cellText(PROPOSAL_NAME),
      expDate:  cellText(PROPOSAL_EXP),
      pdfUrl:   pdfA ? (pdfA.getAttribute('href') || '') : '',
      pdfName:  pdfA ? ((pdfA.textContent || '').trim() || 'Download PDF') : 'Download PDF',
      viewLink: pageA ? (pageA.getAttribute('href') || '') : ''
    };
  }

  function renderProposalBlock(hostTd, proposal, tr) {
    if (!proposal) return;
    var wrap = document.createElement('div');
    wrap.className = 'scw-ops-proposal-info';

    if (proposal.name) {
      var nameRow = document.createElement('div');
      nameRow.className = 'scw-ops-proposal-name';
      // Proposal name links to the published-proposals detail page
      // for THIS proposal record (not the SOW's proposal-page route
      // the pill itself navigates to). The published-proposals route
      // is the canonical "view the published quote" destination —
      // distinct from the Ops/Sales preview view.
      var nameHref = proposal.recordId
        ? '#published-proposals/sow-published-proposal-details/' + proposal.recordId
        : '';
      if (nameHref) {
        var a = document.createElement('a');
        a.setAttribute('href', nameHref);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        a.textContent = proposal.name;
        nameRow.appendChild(a);
      } else {
        nameRow.textContent = proposal.name;
      }
      wrap.appendChild(nameRow);
    }

    if (proposal.expDate) {
      var expRow = document.createElement('div');
      expRow.className = 'scw-ops-proposal-exp';
      expRow.textContent = 'Expires: ' + proposal.expDate;
      wrap.appendChild(expRow);
    }

    if (proposal.pdfUrl) {
      var pdfLink = document.createElement('a');
      pdfLink.className = 'scw-ops-proposal-pdf';
      pdfLink.setAttribute('href', proposal.pdfUrl);
      // No target="_blank" here — PDFs should use the browser's
      // native handling (in-page viewer / download) rather than
      // opening in a new tab.
      // Small paperclip glyph + filename — same vocabulary the sales
      // totals panel uses so both pages read the same.
      pdfLink.innerHTML =
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/></svg>';
      pdfLink.appendChild(document.createTextNode(proposal.pdfName));
      wrap.appendChild(pdfLink);
    }

    hostTd.appendChild(wrap);
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
    if (step && step.info) {
      // Informational status only — no button, no background, no arrow.
      // Plain muted italic text so it reads as "here's where things
      // stand", not "click here".
      pill = document.createElement('span');
      pill.className = 'scw-ops-status-msg';
      pill.textContent = step.label;
      if (note) pill.setAttribute('data-scw-tip', note);
    } else if (step) {
      // Active next-step → link to the proposal page.
      // The visible label is fixed ("Preview Proposal for Next Steps")
      // because every active state — request-alt-bid, mark-ready,
      // publish-proposal — does the same thing here: navigate to the
      // proposal page where the actual action lives. step.label is still
      // used for the "Processing X…" pending message so reviewers can
      // see what action ops-stepper kicked off.
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
    } else {
      // Terminal state — no link, non-interactive.
      pill = document.createElement('span');
      pill.className = 'scw-ops-pill is-terminal';

      var check = document.createElement('span');
      check.textContent = '✓';
      check.style.cssText = 'font-size:11px; line-height:1;';
      pill.appendChild(check);

      var t = document.createElement('span');
      t.textContent = 'Released to Sales';
      pill.appendChild(t);

      if (note) {
        pill.setAttribute('data-scw-tip', note);
      }
    }

    hostTd.appendChild(pill);

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
    var wrap = document.createElement('div');
    wrap.className = 'scw-ops-proposal-info scw-ops-proposal-empty';
    wrap.textContent = 'No published quotes';
    hostTd.appendChild(wrap);
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
    if (e.target.closest('.scw-ops-pill, .scw-ops-info, .scw-ops-proposal-info')) {
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('click', function (e) {
    var td = e.target.closest('td[' + PROCESSED + ']');
    if (!td) return;
    if (e.target.closest('.scw-ops-pill, .scw-ops-info, .scw-ops-proposal-info')) {
      e.stopPropagation();
    }
  }, true);

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

  window.SCW = window.SCW || {};
  SCW.opsReview = SCW.opsReview || {};
  SCW.opsReview.autoRevertValidation = autoRevertValidation;
})();
