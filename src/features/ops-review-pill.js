/*** FEATURE: Ops Review pill on view_3325 (SOW list) ***/
/**
 * Replaces the two inline-edit Yes/No columns on view_3325 —
 *   field_2723 (FLAG_ready for survey)
 *   field_2725 (FLAG_validated bid)
 * — with a single "Ops Review" column containing a status pill
 * plus a next-step action button. This makes the 2-step review
 * flow (Mark Ready → Validate Bid) explicit and gives the Ops
 * team one obvious click per SOW instead of two Yes/No toggles.
 *
 * States
 *   unreviewed: both fields = No
 *     → grey "Not reviewed" pill, primary btn "Mark Ready for Survey"
 *   ready:      field_2723 = Yes, field_2725 = No
 *     → amber "Ready for Survey" pill (+ revoke X), primary btn "Validate Bid"
 *   validated:  field_2725 = Yes
 *     → green "Bid Validated" pill (+ revoke X)
 *
 * Writes go via SCW.knackAjax PUT (same pattern as boolean-chips.js)
 * and SCW.syncKnackModel keeps Knack's Backbone model in sync so
 * re-renders don't revert the value.
 */
(function () {
  'use strict';

  var VIEW_ID      = 'view_3325';
  var READY_FIELD  = 'field_2723';
  var VALID_FIELD  = 'field_2725';
  var NOTE_FIELD   = 'field_2736';   // paragraph-ish field holding the auto-revert note
  var WRITE_VIEW   = 'view_3841';    // form on the sales-build / proposal scene that edits 2725 + 2735
  var STYLE_ID     = 'scw-ops-review-css';
  var EVENT_NS     = '.scwOpsReview';
  var CELL_CLASS   = 'scw-ops-review-cell';
  var PROCESSED    = 'data-scw-ops-review';

  // ── CSS ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Hide the original field_2725 + note columns (we host in field_2723 cell). */
      '#' + VIEW_ID + ' th.' + VALID_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + VALID_FIELD + ',' +
      '#' + VIEW_ID + ' th.' + NOTE_FIELD + ',' +
      '#' + VIEW_ID + ' td.' + NOTE_FIELD + ' {' +
      '  display: none !important;' +
      '}' +

      /* Host cell — widen a bit so pill + btn fit on one line. */
      '#' + VIEW_ID + ' td.' + CELL_CLASS + ',' +
      '#' + VIEW_ID + ' th.' + CELL_CLASS + ' {' +
      '  white-space: nowrap;' +
      '  min-width: 250px;' +
      '}' +

      /* Suppress Knack inline-edit on this cell. */
      'td[' + PROCESSED + '] .kn-edit-col,' +
      'td[' + PROCESSED + '] .kn-td-edit {' +
      '  display: none !important;' +
      '}' +

      /* Layout wrapper: pill on the left, action on the right. */
      '.scw-ops-review {' +
      '  display: inline-flex; align-items: center; gap: 8px;' +
      '  font-size: 12px; line-height: 1.3;' +
      '}' +

      /* Pill base */
      '.scw-ops-pill {' +
      '  display: inline-flex; align-items: center; gap: 5px;' +
      '  padding: 3px 9px; border-radius: 12px;' +
      '  font-weight: 600; font-size: 11px;' +
      '  border: 1px solid transparent; white-space: nowrap;' +
      '}' +
      '.scw-ops-pill svg { flex: 0 0 auto; }' +

      /* Pill: unreviewed — grey */
      '.scw-ops-pill.is-unreviewed {' +
      '  background: #f3f4f6; color: #6b7280;' +
      '  border-color: #d1d5db;' +
      '}' +
      /* Pill: ready — amber */
      '.scw-ops-pill.is-ready {' +
      '  background: #fef3c7; color: #92400e;' +
      '  border-color: #fde68a;' +
      '}' +
      /* Pill: validated — green */
      '.scw-ops-pill.is-validated {' +
      '  background: #d1fae5; color: #065f46;' +
      '  border-color: #6ee7b7;' +
      '}' +

      /* Revoke ✕ inside the pill */
      '.scw-ops-revoke {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 14px; height: 14px; border-radius: 50%;' +
      '  margin-left: 2px; cursor: pointer;' +
      '  background: rgba(0,0,0,0.08); color: inherit;' +
      '  font-size: 10px; font-weight: 700;' +
      '  transition: background 0.15s;' +
      '}' +
      '.scw-ops-revoke:hover { background: rgba(0,0,0,0.18); }' +

      /* Primary action button */
      '.scw-ops-action {' +
      '  display: inline-flex; align-items: center; gap: 4px;' +
      '  padding: 3px 10px; border-radius: 5px;' +
      '  font-size: 11px; font-weight: 600;' +
      '  background: #2563eb; color: #fff !important;' +
      '  border: 1px solid #1d4ed8; cursor: pointer;' +
      '  line-height: 1.3; white-space: nowrap;' +
      '  transition: background 0.15s;' +
      '}' +
      '.scw-ops-action:hover { background: #1d4ed8; }' +
      '.scw-ops-action.is-validate {' +
      '  background: #059669; border-color: #047857;' +
      '}' +
      '.scw-ops-action.is-validate:hover { background: #047857; }' +

      /* Saving flash */
      '.scw-ops-review.is-saving {' +
      '  opacity: 0.55; pointer-events: none; cursor: wait;' +
      '}' +

      /* Note indicator dot — visible whenever field_2736 has a value. */
      '.scw-ops-note-dot {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 14px; height: 14px; border-radius: 50%;' +
      '  font-size: 10px; font-weight: 700; cursor: help;' +
      '  background: #fde68a; color: #92400e;' +
      '  border: 1px solid #f59e0b;' +
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
    var txt = (td.textContent || '').replace(/[ ​]/g, ' ').trim().toLowerCase();
    return (txt === 'yes' || txt === 'true') ? 'yes' : 'no';
  }

  function getRecordId(tr) {
    var m = (tr.id || '').match(/[0-9a-f]{24}/i);
    return m ? m[0] : null;
  }

  function stateFor(ready, validated) {
    if (validated === 'yes') return 'validated';
    if (ready === 'yes')     return 'ready';
    return 'unreviewed';
  }

  function updateSourceCell(tr, fieldKey, value) {
    var td = tr.querySelector('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!td) return;
    // Replace visible text but preserve the .col-N wrapper Knack uses.
    var span = td.querySelector('[class^="col-"]');
    if (span) span.textContent = '\n' + (value === 'yes' ? 'Yes' : 'No') + '\n  ';
    else td.textContent = value === 'yes' ? 'Yes' : 'No';
  }

  // Read the auto-revert note (field_2735) out of the row, if the column is
  // present. Empty string when the field isn't on view_3325 or is blank.
  function readNote(tr) {
    var td = tr.querySelector('td.' + NOTE_FIELD +
                              ', td[data-field-key="' + NOTE_FIELD + '"]');
    if (!td) return '';
    return (td.textContent || '').replace(/[ \s]+/g, ' ').trim();
  }

  // ── Save one or both fields, then refresh the cell UI ────
  // Accepts an updates object like { field_2723: 'yes', field_2725: 'no' }.
  // Issues one PUT per field (Knack's record endpoint accepts multiple keys
  // in one body, but keeping this linear makes sync + error handling simpler).
  function saveUpdates(tr, hostTd, updates, onDone) {
    var keys = Object.keys(updates);
    if (!keys.length) { if (onDone) onDone(); return; }
    var recordId = getRecordId(tr);
    if (!recordId) { if (onDone) onDone(); return; }

    var pending = keys.length;
    keys.forEach(function (fk) {
      var val = updates[fk];
      var body = {};
      body[fk] = val === 'yes' ? 'Yes' : 'No';

      SCW.knackAjax({
        url:  SCW.knackRecordUrl(VIEW_ID, recordId),
        type: 'PUT',
        data: JSON.stringify(body),
        success: function (resp) {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(VIEW_ID, recordId, resp, fk, body[fk]);
          }
          updateSourceCell(tr, fk, val);
          if (--pending === 0 && onDone) onDone();
        },
        error: function (xhr) {
          console.warn('[scw-ops-review] Save failed for ' + recordId + ' / ' + fk,
                       xhr && xhr.responseText);
          if (--pending === 0 && onDone) onDone();
        }
      });
    });
  }

  // ── Render one cell based on current state ───────────────
  function renderCell(hostTd, tr) {
    var ready     = readBool(tr, READY_FIELD);
    var validated = readBool(tr, VALID_FIELD);
    var state     = stateFor(ready, validated);

    // Clear and build
    hostTd.innerHTML = '';
    hostTd.classList.add(CELL_CLASS);
    hostTd.setAttribute(PROCESSED, '1');

    var wrap = document.createElement('span');
    wrap.className = 'scw-ops-review is-' + state;

    var pill = document.createElement('span');
    pill.className = 'scw-ops-pill is-' + state;

    var icon = '';
    var label = '';
    if (state === 'unreviewed') {
      icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
      label = 'Not reviewed';
    } else if (state === 'ready') {
      icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      label = 'Ready for Survey';
    } else {
      icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="14 14 9 19 4 14" transform="translate(6 -2)"/></svg>';
      label = 'Bid Validated';
    }
    pill.innerHTML = icon + '<span>' + label + '</span>';

    // Revoke ✕ on non-unreviewed pills
    if (state !== 'unreviewed') {
      var x = document.createElement('span');
      x.className = 'scw-ops-revoke';
      x.setAttribute('title',
        state === 'validated' ? 'Revoke validation' : 'Revoke ready-for-survey');
      x.textContent = '✕';
      x.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        wrap.classList.add('is-saving');
        var updates;
        if (state === 'validated') {
          // Drop back to Ready.
          updates = {}; updates[VALID_FIELD] = 'no';
        } else {
          // Drop back to Unreviewed (also clears validated, which shouldn't be Yes
          // here but clears defensively).
          updates = {}; updates[READY_FIELD] = 'no'; updates[VALID_FIELD] = 'no';
        }
        saveUpdates(tr, hostTd, updates, function () { renderCell(hostTd, tr); });
      });
      pill.appendChild(x);
    }
    wrap.appendChild(pill);

    // If a note exists (auto-revert trail), surface it as a tooltip on the
    // pill and add a small ⓘ dot next to it so the trail is discoverable.
    var note = readNote(tr);
    if (note) {
      pill.setAttribute('title', note);
      var dot = document.createElement('span');
      dot.className = 'scw-ops-note-dot';
      dot.setAttribute('title', note);
      dot.textContent = 'i';
      wrap.appendChild(dot);
    }

    // Action button — only on non-terminal states
    if (state === 'unreviewed') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-ops-action';
      btn.textContent = 'Mark Ready for Survey';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        wrap.classList.add('is-saving');
        var u = {}; u[READY_FIELD] = 'yes';
        saveUpdates(tr, hostTd, u, function () { renderCell(hostTd, tr); });
      });
      wrap.appendChild(btn);
    } else if (state === 'ready') {
      var vbtn = document.createElement('button');
      vbtn.type = 'button';
      vbtn.className = 'scw-ops-action is-validate';
      vbtn.textContent = 'Validate Bid';
      vbtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        wrap.classList.add('is-saving');
        var u = {}; u[VALID_FIELD] = 'yes';
        saveUpdates(tr, hostTd, u, function () { renderCell(hostTd, tr); });
      });
      wrap.appendChild(vbtn);
    }

    hostTd.appendChild(wrap);
  }

  // ── Scan view, transform each data row ───────────────────
  function transform() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    var table = view.querySelector('table.kn-table-table');
    if (!table) return;

    // Relabel the host column header once.
    var hostTh = table.querySelector('thead th.' + READY_FIELD);
    if (hostTh && !hostTh.getAttribute('data-scw-ops-review-th')) {
      hostTh.classList.add(CELL_CLASS);
      hostTh.setAttribute('data-scw-ops-review-th', '1');
      var lbl = hostTh.querySelector('.table-fixed-label span');
      if (lbl) lbl.textContent = 'Ops Review';
      var link = hostTh.querySelector('a.kn-sort');
      if (link) link.removeAttribute('href');      // disable sort on this col
    }

    var rows = table.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      var recordId = getRecordId(tr);
      if (!recordId) continue;
      var hostTd = tr.querySelector('td.' + READY_FIELD +
                                   ', td[data-field-key="' + READY_FIELD + '"]');
      if (!hostTd) continue;
      renderCell(hostTd, tr);
    }
  }

  // Block Knack's inline-edit popup on the managed cell (pill/button clicks
  // already stopPropagation, but suppress mousedown too so the cell
  // doesn't flash into edit mode on the first click).
  document.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td[' + PROCESSED + ']');
    if (!td) return;
    if (e.target.closest('.scw-ops-action, .scw-ops-revoke, .scw-ops-pill')) {
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
  // Flips field_2725 → No on the SOW (so the "Bid Validated" pill drops back
  // to "Ready for Survey") and drops a timestamped note into field_2736 so
  // the UI can surface the "why" as a tooltip.
  //
  // Must run on a scene where WRITE_VIEW is rendered — which is the Sales
  // Build / proposal page (same place the Sales CR feature lives). If the
  // view isn't on the current scene the PUT will 404; we log and move on
  // rather than blocking the CR submit success toast.
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
    // M/D/YY — short and matches the UX copy.
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' +
           String(d.getFullYear()).slice(-2);
  }

  window.SCW = window.SCW || {};
  SCW.opsReview = SCW.opsReview || {};
  SCW.opsReview.autoRevertValidation = autoRevertValidation;
})();
