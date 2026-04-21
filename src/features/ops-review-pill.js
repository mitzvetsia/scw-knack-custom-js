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
 *      from Subcontractor" (amber) — there are pending CRs to address.
 *   2. field_2706 = No                    → "Mark Ready for Survey"
 *      (blue) — SOW needs Ops sign-off before sales can request survey.
 *   3. field_2725 = No                    → "Publish & Submit Completed
 *      Proposal" (green) — survey + bids are back, proposal ready to go.
 *   4. field_2725 = Yes (terminal)        → "Bid Published" (green check,
 *      no link).
 *
 * Reads these fields from the row DOM, so they must be added as
 * columns on view_3325 (hidden by this feature's CSS):
 *   field_2706  FLAG_survey requested
 *   field_2728  count of pending change requests
 *   field_2725  FLAG_validated bid
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
  var SURVEY_FIELD   = 'field_2706';   // FLAG_survey requested
  var CR_COUNT_FIELD = 'field_2728';   // count of pending change requests
  var VALID_FIELD    = 'field_2725';   // FLAG_validated bid
  var NOTE_FIELD     = 'field_2736';   // auto-revert note (tooltip)

  var WRITE_VIEW   = 'view_3841';      // form that edits 2725 + 2736 (for auto-revert)
  var STYLE_ID     = 'scw-ops-review-css';
  var EVENT_NS     = '.scwOpsReview';
  var CELL_CLASS   = 'scw-ops-review-cell';
  var PROCESSED    = 'data-scw-ops-review';

  // ── Step definitions (priority order) ───────────────────
  // First matching step wins. Mirror these with the Ops stepper
  // (ops-stepper.js) so grid and page agree on "next action".
  var STEPS = [
    {
      id:       'request-alt-bid',
      label:    'Request Alternative Bid',
      tone:     'amber',
      showWhen: function (f) { return f.survey !== 'yes' && toNum(f.crCount) > 0; }
    },
    {
      id:       'mark-ready',
      label:    'Mark Ready for Survey',
      tone:     'primary',
      showWhen: function (f) { return f.survey !== 'yes'; }
    },
    {
      id:       'publish-proposal',
      label:    'Publish & Submit Proposal',
      tone:     'success',
      showWhen: function (f) { return f.validated !== 'yes'; }
    }
  ];

  // ── CSS ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Hide source columns this feature consumes. */
      '#' + VIEW_ID + ' th.' + VALID_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + VALID_FIELD + ',' +
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
      '  white-space: nowrap;' +
      '  min-width: 190px;' +
      '  vertical-align: middle;' +
      '}' +

      /* Suppress Knack inline-edit popup on this cell. */
      'td[' + PROCESSED + '] .kn-edit-col,' +
      'td[' + PROCESSED + '] .kn-td-edit {' +
      '  display: none !important;' +
      '}' +

      /* Pill (link or span) */
      '.scw-ops-pill {' +
      '  display: inline-flex; align-items: center; gap: 6px;' +
      '  padding: 4px 11px; border-radius: 12px;' +
      '  font-weight: 600; font-size: 11.5px; letter-spacing: 0.01em;' +
      '  border: 1px solid transparent; white-space: nowrap;' +
      '  text-decoration: none !important;' +
      '  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;' +
      '}' +
      'a.scw-ops-pill { cursor: pointer; }' +
      'a.scw-ops-pill:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.15); }' +
      '.scw-ops-pill .scw-ops-arrow {' +
      '  font-size: 12px; line-height: 1;' +
      '  opacity: 0.85; margin-left: 2px;' +
      '}' +

      /* Primary (blue) — Mark Ready */
      '.scw-ops-pill.is-primary {' +
      '  background: #dbeafe; color: #1d4ed8; border-color: #93c5fd;' +
      '}' +
      'a.scw-ops-pill.is-primary:hover { background: #bfdbfe; }' +

      /* Amber — Request Alt Bid */
      '.scw-ops-pill.is-amber {' +
      '  background: #fef3c7; color: #92400e; border-color: #fde68a;' +
      '}' +
      'a.scw-ops-pill.is-amber:hover { background: #fde68a; }' +

      /* Success (green outline) — Publish */
      '.scw-ops-pill.is-success {' +
      '  background: #d1fae5; color: #065f46; border-color: #6ee7b7;' +
      '}' +
      'a.scw-ops-pill.is-success:hover { background: #a7f3d0; }' +

      /* Terminal (green filled) — Bid Published */
      '.scw-ops-pill.is-terminal {' +
      '  background: #065f46; color: #ffffff; border-color: #064e3b;' +
      '  cursor: default;' +
      '}' +

      /* Inline info glyph for the auto-revert note trail. */
      '.scw-ops-info {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 13px; height: 13px; border-radius: 50%;' +
      '  background: rgba(0,0,0,0.1); color: inherit;' +
      '  font-style: italic; font-weight: 700;' +
      '  font-size: 9px; line-height: 1; cursor: help;' +
      '  font-family: Georgia, "Times New Roman", serif;' +
      '}';

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────
  function readBool(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!td) return 'no';
    var t = (td.textContent || '').replace(/[ \s]/g, ' ').trim().toLowerCase();
    return (t === 'yes' || t === 'true') ? 'yes' : 'no';
  }
  function readText(tr, fieldKey) {
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
      survey:    readBool(tr, SURVEY_FIELD),
      crCount:   readText(tr, CR_COUNT_FIELD),
      validated: readBool(tr, VALID_FIELD)
    };
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i].showWhen(fields)) return STEPS[i];
    }
    return null; // terminal
  }

  // Pull the per-row proposal/detail URL — the first kn-link-page anchor
  // in the row (the existing "Proposal" column). This is where the real
  // Ops stepper lives (view_3345) so the pill becomes a deep-link to
  // the exact SOW's proposal page.
  function getRowLink(tr) {
    var a = tr.querySelector('a.kn-link-page[href]');
    return (a && a.getAttribute('href')) || '';
  }

  // ── Render one cell ─────────────────────────────────────
  function renderCell(hostTd, tr) {
    hostTd.innerHTML = '';
    hostTd.classList.add(CELL_CLASS);
    hostTd.setAttribute(PROCESSED, '1');

    var step = resolveStep(tr);
    var note = readNote(tr);

    var pill;
    if (step) {
      // Active next-step → link to the proposal page.
      pill = document.createElement('a');
      pill.className = 'scw-ops-pill is-' + step.tone;
      var href = getRowLink(tr);
      if (href) pill.setAttribute('href', href);

      var labelSpan = document.createElement('span');
      labelSpan.textContent = step.label;
      pill.appendChild(labelSpan);

      if (note) {
        pill.setAttribute('title', note);
        var info = document.createElement('span');
        info.className = 'scw-ops-info';
        info.setAttribute('title', note);
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
      t.textContent = 'Bid Published';
      pill.appendChild(t);

      if (note) {
        pill.setAttribute('title', note);
      }
    }

    hostTd.appendChild(pill);
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
      if (lbl) lbl.textContent = 'Ops Review';
      var link = hostTh.querySelector('a.kn-sort');
      if (link) link.removeAttribute('href');
    }

    var rows = table.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
      var hostTd = tr.querySelector('td.' + HOST_FIELD +
                                   ', td[data-field-key="' + HOST_FIELD + '"]');
      if (!hostTd) continue;
      renderCell(hostTd, tr);
    }
  }

  // Suppress Knack's inline-edit popup on the managed cell — the pill
  // is the only interactive surface, and it's a link, not an edit control.
  document.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td[' + PROCESSED + ']');
    if (!td) return;
    if (e.target.closest('.scw-ops-pill, .scw-ops-info')) {
      e.stopPropagation();
    }
  }, true);

  // ── Bindings ────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + VIEW_ID + EVENT_NS)
      .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
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
  // Flips field_2725 → No on the SOW (so the "Bid Published" pill drops
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
    body[VALID_FIELD] = 'No';
    body[NOTE_FIELD]  = noteText;

    var writeView = opts.viewId || WRITE_VIEW;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, sowRecordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function (resp) {
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(writeView, sowRecordId, resp, VALID_FIELD, 'No');
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
