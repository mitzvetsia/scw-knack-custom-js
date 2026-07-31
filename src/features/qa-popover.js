/*** QA POPOVER ***
 *
 * Click handler + inline editor for the required-photo chits in the
 * device-worksheet header.  Lets a PM walk down rows and sign off on
 * each photo's QA status without ever leaving the worksheet.
 *
 * Triggered by: click on .scw-ws-req-photo-chit[data-photo-id]
 *
 * The chit is rendered by device-worksheet.js (renderSummaryField case
 * 'requiredPhotos'); this module is decoupled — it reads the source
 * <tr> still attached above each .scw-ws-row to pull the photo's
 * current QA fields, then writes back to the PIC record via the Knack
 * object-based REST endpoint.
 *
 * Data contract (all fields on the PIC object):
 *   field_2859 — QA_status         (Multiple Choice: Pending/Pass/Fail)
 *   field_2860 — QA_client_signoff (Multiple Choice: N/A/Pending/Approved/Bypassed)
 *   field_2861 — QA_notes          (Paragraph Text)
 *   field_2862 — QA_completed_by   (Connection → user)
 *   field_2863 — QA_completed_date (Date/Time)
 *   field_2865 — QA_history        (Paragraph Text — append-only audit trail)
 *
 * Sign-off math:
 *   complete = QA_status='Pass' AND (QA_client_signoff in {N/A, Approved, Bypassed})
 *   When complete flips to true:   set _completed_by + _completed_date, log to _history.
 *   When complete flips to false:  clear _completed_by + _completed_date, log to _history.
 */
(function () {
  'use strict';

  var POPOVER_ID = 'scw-qa-popover';

  // The hidden DOC_photos grid on the deploy scene.  Saves go
  // through Knack's view-based PUT endpoint (which is CORS-safe and
  // honors the user's session token) — the object-based endpoint
  // requires a server-side API key, which we don't have client-side.
  // This view must include every field qa-popover writes to.
  var PIC_SAVE_VIEW = 'view_3937';

  // PIC field keys
  var F = {
    img:           'field_771',
    photoType:     'field_2445',
    required:      'field_2446',
    completed:     'field_2447',
    status:        'field_2859',
    client:        'field_2860',
    notes:         'field_2861',
    completedBy:   'field_2862',
    completedDate: 'field_2863',
    history:       'field_2865'
  };

  // Multiple-choice option labels (must match the Knack option values exactly).
  var STATUS_OPTIONS = ['Pending', 'Pass', 'Fail'];
  var CLIENT_OPTIONS = ['Pending', 'Approved', 'Bypassed'];

  // Currently open popover state.
  var _popover = null;          // DOM element
  var _photoId = null;          // PIC record id currently being edited
  var _initialState = null;     // snapshot at open time, used to detect changes
  var _hasUnsavedChanges = false;
  var _isSaving = false;
  var _savedFadeTimer = null;   // resets the "Saved ✓" status after a beat
  var _resavePending = null;    // edit that arrived mid-save → drained on completion
  // When the popover is opened off a host-supplied anchor (e.g. the V2
  // install photo strip via openForAnchor) rather than a worksheet chit,
  // this holds a callback(fields, photo) that lets the host refresh its own
  // chit in place after a save. V1's chit path leaves this null and uses
  // refreshChitAndCells (which walks the worksheet <tr>) instead.
  var _refreshHandler = null;

  // ── CSS ──────────────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-qa-popover-css')) return;
    // Visual language mirrors the closeout-deliverables FILES QA panel
    // (closeout-deliverables.js): same section labels, segmented status
    // control, notes field, audit/sign-off blocks and history list so the
    // photo QA panel reads as a sibling of the files QA panel. This stays
    // an anchored popover (not a full-screen modal) because it docks off a
    // small chit in the worksheet — but the inner content/styling matches.
    var css = [
      '.scw-qa-popover {',
      '  position: absolute; z-index: 10000;',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,0.25);',
      '  width: 360px; max-width: calc(100vw - 24px);',
      '  font: 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;',
      '  color: #1f2937;',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '}',
      /* Header strip — matches closeout __head */
      '.scw-qa-popover__head {',
      '  display: flex; align-items: center; gap: 12px;',
      '  padding: 10px 14px; border-bottom: 1px solid #e5e7eb;',
      '  background: #f9fafb; flex: 0 0 auto;',
      '}',
      '.scw-qa-popover__thumb {',
      '  width: 56px; height: 56px; border-radius: 6px; flex: 0 0 auto;',
      '  background: #f3f4f6 center/cover no-repeat;',
      '  border: 1px solid #e5e7eb; cursor: zoom-in;',
      '}',
      '.scw-qa-popover__thumb--empty {',
      '  display: flex; align-items: center; justify-content: center;',
      '  color: #9ca3af; font-size: 9px; text-align: center; cursor: default;',
      '}',
      '.scw-qa-popover__head-meta { flex: 1 1 auto; min-width: 0; }',
      '.scw-qa-popover__type {',
      '  font-weight: 700; font-size: 14px; color: #111827; line-height: 1.2;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.scw-qa-popover__sub  { font-size: 12px; color: #6b7280; margin-top: 2px; }',
      /* Body — scrollable content area, like closeout __sidebar-content */
      '.scw-qa-popover__body {',
      '  padding: 14px; overflow-y: auto; max-height: 60vh; flex: 1 1 auto;',
      '}',
      '.scw-qa-popover__section { margin-bottom: 16px; }',
      '.scw-qa-popover__label {',
      '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
      '  color: #6b7280; letter-spacing: 0.04em; margin-bottom: 6px;',
      '}',
      /* Segmented status control — matches closeout __chips */
      '.scw-qa-popover__chips { display: flex; gap: 6px; }',
      '.scw-qa-popover__chip {',
      '  flex: 1 1 0; min-width: 0; padding: 8px 10px; border-radius: 8px;',
      '  border: 1px solid #d1d5db; background: #fff; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui; text-align: center;',
      '  white-space: nowrap; user-select: none; transition: all 0.12s;',
      '}',
      '.scw-qa-popover__chip:hover { background: #f3f4f6; }',
      '.scw-qa-popover__chip.is-selected[data-value="Pending"]  { background: #ede9fe; color: #6d28d9; border-color: #8b5cf6; }',
      '.scw-qa-popover__chip.is-selected[data-value="Pass"],',
      '.scw-qa-popover__chip.is-selected[data-value="Approved"],',
      '.scw-qa-popover__chip.is-selected[data-value="Bypassed"] { background: #dcfce7; color: #15803d; border-color: #16a34a; }',
      '.scw-qa-popover__chip.is-selected[data-value="Fail"]     { background: #fee2e2; color: #b91c1c; border-color: #dc2626; }',
      /* Notes — matches closeout __notes */
      '.scw-qa-popover__notes {',
      '  width: 100%; min-height: 80px; box-sizing: border-box; resize: vertical;',
      '  padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px;',
      '  font: inherit; outline: none;',
      '}',
      '.scw-qa-popover__notes:focus { border-color: #6b7280; }',
      '.scw-qa-popover__notes-hint { font-size: 11px; color: #b91c1c; margin-top: 4px; }',
      /* Sign-off / audit summary block — matches closeout __signoff */
      '.scw-qa-popover__signoff {',
      '  font-size: 11px; color: #6b7280;',
      '  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;',
      '  padding: 8px 10px; margin-bottom: 8px;',
      '}',
      '.scw-qa-popover__signoff strong { color: #111827; font-weight: 600; }',
      /* History list — append-only audit trail */
      '.scw-qa-popover__history {',
      '  font-size: 11px; color: #4b5563; line-height: 1.6;',
      '  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;',
      '  padding: 8px 10px; max-height: 120px; overflow-y: auto;',
      '  white-space: normal; word-break: break-word;',
      '}',
      '.scw-qa-popover__history-empty { color: #9ca3af; font-style: italic; }',
      /* Footer — Cancel/Revert + primary, matches closeout __footer */
      '.scw-qa-popover__actions {',
      '  display: flex; gap: 8px; justify-content: space-between; align-items: center;',
      '  padding: 12px 14px; border-top: 1px solid #e5e7eb;',
      '  background: #fff; flex: 0 0 auto;',
      '}',
      '.scw-qa-popover__btns { display: flex; gap: 8px; align-items: center; }',
      /* Live save-status indicator (left of the action buttons). */
      '.scw-qa-popover__save-status {',
      '  font: 600 11px/1.2 system-ui; color: #6b7280; flex: 0 1 auto;',
      '  display: inline-flex; align-items: center; gap: 5px; min-width: 0;',
      '}',
      '.scw-qa-popover__save-status:empty { display: none; }',
      '.scw-qa-popover__save-status.is-dirty  { color: #b45309; }',
      '.scw-qa-popover__save-status.is-saving { color: #2563eb; }',
      '.scw-qa-popover__save-status.is-saved  { color: #15803d; }',
      '.scw-qa-popover__save-status.is-error  { color: #b91c1c; }',
      '.scw-qa-popover__btn {',
      '  padding: 8px 16px; border-radius: 6px;',
      '  font: 600 12px/1.2 system-ui; cursor: pointer; border: 1px solid #d1d5db;',
      '  background: #fff; color: #1f2937; transition: all 0.12s;',
      '}',
      '.scw-qa-popover__btn:hover { background: #f3f4f6; }',
      '.scw-qa-popover__btn--primary {',
      '  background: #2563eb; color: #fff; border-color: #1d4ed8;',
      '}',
      '.scw-qa-popover__btn--primary:hover { background: #1d4ed8; }',
      '.scw-qa-popover__btn--primary:disabled {',
      '  background: #cbd5e1; border-color: #cbd5e1; color: #fff; cursor: not-allowed;',
      '}',
      '.scw-qa-popover__btn--revert { color: #b91c1c; border-color: #fca5a5; }',
      '.scw-qa-popover__btn--revert:hover { background: #fef2f2; }',
      '.scw-qa-popover__error {',
      '  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;',
      '  padding: 6px 10px; border-radius: 6px; font-size: 11px; margin: 0 14px 12px;',
      '}',
      '.scw-qa-popover.is-saving { opacity: 0.7; pointer-events: none; }',

      /* ── Modal presentation (openForAnchor / V2 install path) ──────────
       * Mirrors the closeout-deliverables FILES QA modal: a centered
       * overlay with a large photo PREVIEW pane on the left and the QA
       * SIDEBAR (the exact same controls used by the docked popover) on the
       * right. The inner controls keep their .scw-qa-popover__* class names
       * so every save/validation routine works identically in both shells. */
      '.scw-qa-modal__overlay {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,0.55);',
      '  z-index: 10000; display: flex; align-items: center; justify-content: center;',
      '}',
      '.scw-qa-modal {',
      '  position: relative; background: #fff; border-radius: 10px;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,0.25);',
      '  width: 95vw; height: 92vh; max-width: 1400px; max-height: 1000px;',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '  font: 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; color: #1f2937;',
      '}',
      '.scw-qa-modal.is-saving { opacity: 0.7; pointer-events: none; }',
      /* Header strip */
      '.scw-qa-modal__head {',
      '  display: flex; align-items: center; gap: 16px;',
      '  padding: 12px 18px; border-bottom: 1px solid #e5e7eb;',
      '  background: #f9fafb; flex: 0 0 auto;',
      '}',
      '.scw-qa-modal__head-meta { flex: 1 1 auto; min-width: 0; }',
      '.scw-qa-modal__type {',
      '  font-size: 15px; font-weight: 700; color: #111827;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.scw-qa-modal__sub { font-size: 12px; color: #6b7280; margin-top: 2px; }',
      '.scw-qa-modal__head-actions { display: flex; gap: 8px; flex: 0 0 auto; }',
      '.scw-qa-modal__head-btn {',
      '  padding: 7px 14px; border-radius: 6px; background: #fff; color: #1f2937;',
      '  border: 1px solid #d1d5db; font: 600 12px/1.2 system-ui; cursor: pointer;',
      '}',
      '.scw-qa-modal__head-btn:hover { background: #f3f4f6; border-color: #9ca3af; }',
      '.scw-qa-modal__head-btn--close {',
      '  color: #6b7280; width: 32px; padding: 0; font-size: 18px; line-height: 30px;',
      '}',
      /* Body split — preview on the left, QA sidebar on the right */
      '.scw-qa-modal__body { display: flex; flex: 1 1 auto; min-height: 0; }',
      '.scw-qa-modal__viewer {',
      '  flex: 1 1 auto; min-width: 0; background: #1f2937; position: relative;',
      '  display: flex; align-items: center; justify-content: center; overflow: hidden;',
      '}',
      '.scw-qa-modal__viewer img {',
      '  max-width: 100%; max-height: 100%; object-fit: contain; cursor: zoom-in;',
      '}',
      '.scw-qa-modal__viewer-empty { color: #9ca3af; padding: 40px; text-align: center; font-size: 14px; }',
      /* Upload + classify panes live in the viewer column — stack them. */
      '.scw-qa-modal__viewer { flex-direction: column; gap: 12px; padding: 14px; }',
      '.scw-qa-modal__viewer > img { flex: 1 1 auto; min-height: 0; }',
      /* Viewer-top action bar — Replace / Remove photo (files-popover parity). */
      '.scw-qa-modal__viewer-bar { flex: 0 0 auto; align-self: stretch;',
      '  display: flex; gap: 8px; justify-content: flex-end; align-items: center; }',
      '.scw-qa-modal__viewer-bar button {',
      '  background: rgba(30,41,59,.85); color: #e5e7eb; border: 1px solid #475569;',
      '  border-radius: 6px; padding: 6px 12px; cursor: pointer;',
      '  font: 600 12px/1 system-ui, sans-serif; }',
      '.scw-qa-modal__viewer-bar button:hover { background: #334155; color: #fff; }',
      '.scw-qa-modal__viewer-bar button.is-danger { color: #fca5a5; border-color: #7f1d1d; }',
      '.scw-qa-modal__viewer-bar button.is-danger:hover { background: #450a0a; }',
      '.scw-qa-modal__viewer-bar button:disabled { opacity: .5; cursor: not-allowed; }',
      /* Classify bar — Type select + Required checkbox (deploy scene). */
      '.scw-qa-modal__classify { flex: 0 0 auto; align-self: stretch; display: flex;',
      '  align-items: center; gap: 14px; padding: 6px 2px; }',
      /* Inside the viewer-bar: sit left, push Replace/Remove right. */
      '.scw-qa-modal__viewer-bar .scw-qa-modal__classify { padding: 0; margin-right: auto; align-self: auto; }',
      '.scw-qa-modal__classify-item { display: flex; align-items: center; gap: 6px;',
      '  font: 600 12px/1.2 system-ui, sans-serif; color: #cbd5e1; cursor: pointer; }',
      '.scw-qa-modal__classify-item select {',
      '  max-width: 320px; padding: 4px 8px; border-radius: 6px;',
      '  border: 1px solid #475569; background: #1e293b; color: #e2e8f0;',
      '  font: 500 12px/1.3 system-ui, sans-serif; cursor: pointer; }',
      '.scw-qa-modal__classify-item select:disabled,',
      '.scw-qa-modal__classify-item input:disabled { opacity: .5; cursor: wait; }',
      '.scw-qa-modal__classify-req input { width: 14px; height: 14px; accent-color: #ed8326; cursor: pointer; }',
      '.scw-qa-modal__classify-status { font: 500 11px/1.2 system-ui, sans-serif; color: #86efac; }',
      '.scw-qa-modal__classify-status.is-err { color: #fca5a5; }',
      '.scw-qa-modal__uploadwrap { width: 100%; max-width: 420px; }',
      '.scw-qa-modal__drop { display: flex; flex-direction: column; align-items: center; gap: 8px;',
      '  justify-content: center; min-height: 150px; border: 2px dashed #6b7280; border-radius: 10px;',
      '  background: #111827; color: #9ca3af; cursor: pointer; text-align: center; padding: 16px;',
      '  font: 13px/1.4 system-ui, sans-serif; transition: border-color .15s, color .15s; }',
      '.scw-qa-modal__drop:hover, .scw-qa-modal__drop.is-over { border-color: #60a5fa; color: #e5e7eb; }',
      '.scw-qa-modal__drop-sub { font-size: 11.5px; }',
      '.scw-qa-modal__upstatus { margin-top: 8px; font: 600 12.5px/1.3 system-ui, sans-serif;',
      '  color: #60a5fa; text-align: center; }',
      '.scw-qa-modal__upstatus.is-err { color: #f87171; }',
      '  border-radius: 8px; padding: 10px 12px; flex: 0 0 auto; }',
      '  border-radius: 6px; font: 12.5px/1.3 system-ui, sans-serif; background: #fff; }',
      '  font: 600 12px/1 system-ui, sans-serif; color: #64748b; }',
      '  padding: 8px 14px; font: 600 12.5px/1 system-ui, sans-serif; cursor: pointer; }',
      '.scw-qa-modal__sidebar {',
      '  flex: 0 0 340px; border-left: 1px solid #e5e7eb;',
      '  display: flex; flex-direction: column; background: #fff;',
      '}',
      /* The reused QA body becomes the scroll region; neutralize the docked',
         max-height so it fills the sidebar column. */
      '.scw-qa-modal__sidebar .scw-qa-popover__body { max-height: none; flex: 1 1 auto; }',
      '.scw-qa-modal__sidebar .scw-qa-popover__actions { flex: 0 0 auto; }',
      /* No-QA (preview-only) modal — no sidebar, viewer fills full width. */
      '.scw-qa-modal--noqa .scw-qa-modal__viewer { flex: 1 1 100%; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'scw-qa-popover-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Value normalization ─────────────────────────────────────────

  /**
   * Knack often renders Multiple Choice option values in UPPERCASE
   * (theme-dependent), but the stored value uses the option's actual
   * casing (e.g. "Pending"). Map back to the canonical option label
   * so chip-selection comparisons match.
   */
  function normalizeOption(raw, options) {
    if (!raw) return '';
    var lower = String(raw).trim().toLowerCase();
    for (var i = 0; i < options.length; i++) {
      if (options[i].toLowerCase() === lower) return options[i];
    }
    return raw;
  }

  // ── Reading photo data from the worksheet DOM ───────────────────

  /**
   * Find the source <tr> that contains the photo metadata cells for
   * a given chit.  device-worksheet.js places the source row directly
   * above each .scw-ws-row in the DOM (display:none, attribute
   * PROCESSED_ATTR='1').  Walk back to find it.
   */
  function findSourceTr(chitEl) {
    var wsTr = chitEl.closest('tr.scw-ws-row');
    if (!wsTr) return null;
    var prev = wsTr.previousElementSibling;
    // Skip back over inline-photo rows or any other injected siblings.
    while (prev && (prev.classList.contains('scw-inline-photo-row') ||
                    prev.classList.contains('scw-ws-row'))) {
      prev = prev.previousElementSibling;
    }
    if (prev && prev.tagName === 'TR') return prev;
    return null;
  }

  /** Read a single photo's data from a source tr by photo record id. */
  function readPhoto(tr, photoId) {
    function readSpanText(fieldKey) {
      var cell = tr.querySelector('td.' + fieldKey);
      if (!cell) return '';
      var span = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      return span ? (span.textContent || '').trim() : '';
    }
    function readSpanHtml(fieldKey) {
      var cell = tr.querySelector('td.' + fieldKey);
      if (!cell) return '';
      var span = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      return span ? (span.innerHTML || '').trim() : '';
    }
    // Photo type: connection field — text lives in the INNER connection-value span.
    function readType() {
      var cell = tr.querySelector('td.' + F.photoType);
      if (!cell) return '';
      var outer = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      if (!outer) return '';
      var inner = outer.querySelector('span[data-kn="connection-value"]');
      return ((inner ? inner.textContent : outer.textContent) || '').trim();
    }
    // Image URL: lives in the field_771 outer span as <img>.
    function readImgUrl() {
      var cells = tr.querySelectorAll('td.' + F.img + ', td[data-field-key="' + F.img + '"]');
      for (var i = 0; i < cells.length; i++) {
        var span = cells[i].querySelector('span[id="' + photoId + '"]');
        if (!span) continue;
        var img = span.querySelector('img[data-kn-img-gallery]') || span.querySelector('img');
        if (img) {
          var url = img.getAttribute('data-kn-img-gallery') || img.getAttribute('src') || '';
          return url;
        }
      }
      return '';
    }

    // Connection fields render as inner connection-value span with the
    // identifier text; just textContent the outer for compatibility.
    function readConnText(fieldKey) {
      var cell = tr.querySelector('td.' + fieldKey);
      if (!cell) return '';
      var span = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      if (!span) return '';
      var inner = span.querySelector('span[data-kn="connection-value"]');
      return ((inner ? inner.textContent : span.textContent) || '').trim();
    }
    var rawStatus = readSpanText(F.status);
    var rawClient = readSpanText(F.client);
    return {
      id:         photoId,
      type:       readType(),
      status:     normalizeOption(rawStatus, STATUS_OPTIONS) || 'Pending',
      client:     normalizeOption(rawClient, ['N/A'].concat(CLIENT_OPTIONS)) || 'N/A',
      notes:      readSpanText(F.notes)   || '',
      history:    readSpanHtml(F.history) || '',
      imgUrl:     readImgUrl(),
      completedBy:   readConnText(F.completedBy),
      completedDate: readSpanText(F.completedDate),
      // The completed flag — used to decide whether QA is even possible.
      completed:  /^(yes|true)$/i.test(readSpanText(F.completed) || '')
    };
  }

  // ── Sign-off math ───────────────────────────────────────────────

  function isFullyComplete(status, client) {
    if (status !== 'Pass') return false;
    if (!client || client === 'N/A') return true;
    return (client === 'Approved' || client === 'Bypassed');
  }

  function isClientGateActive(client) {
    return client && client !== 'N/A' && client !== '';
  }

  // ── History formatting ──────────────────────────────────────────

  function nowStamp() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /**
   * Knack date fields expect MM/DD/YYYY on PUT (US-style by default
   * for this account — matches the rendered "05/12/2026" cell value).
   */
  function todayForKnack() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }

  function currentUserName() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u.name) return u.name;
      if (u && u.values && u.values.name) return u.values.name;
    } catch (e) {}
    return 'Unknown user';
  }

  function currentUserId() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u.id) return u.id;
    } catch (e) {}
    return '';
  }

  /** Prepend a one-line audit entry to the history text. */
  function prependHistory(existing, event, detail) {
    var line = nowStamp() + ' — ' + currentUserName() + ' — ' + event;
    if (detail) line += ': ' + detail;
    // existing is innerHTML (paragraph text preserves <br> linebreaks);
    // append as plain text + <br> so it stacks above previous entries.
    var safe = (line || '').replace(/[<>]/g, function (c) {
      return c === '<' ? '&lt;' : '&gt;';
    });
    if (!existing) return safe;
    return safe + '<br>' + existing;
  }

  // ── Save ────────────────────────────────────────────────────────

  function saveFields(fields, onDone) {
    if (typeof SCW === 'undefined' ||
        typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      onDone && onDone(new Error('SCW.knackAjax/knackRecordUrl unavailable'));
      return;
    }
    SCW.knackAjax({
      url: SCW.knackRecordUrl(PIC_SAVE_VIEW, _photoId),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () { onDone && onDone(null); },
      error: function (xhr) {
        onDone && onDone(new Error('PUT ' + xhr.status));
      }
    });
  }

  // ── Popover rendering ───────────────────────────────────────────

  function escHtmlChar(c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] || c;
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, escHtmlChar); }

  /**
   * Build the QA controls (header + body + actions).
   *
   * @param {Object}      photo    QA photo snapshot.
   * @param {HTMLElement} [hostPop] When provided (modal path), chip/notes
   *        handlers and updateActions operate on THIS element instead of the
   *        docked popover container — so the controls can be transplanted
   *        into the modal sidebar while still reading/writing the live shell
   *        (which owns .scw-qa-popover__body / __actions). The save routines
   *        treat hostPop as _popover. The docked __head is skipped in this
   *        mode (the modal supplies its own header + large preview).
   */
  function buildPopover(photo, hostPop) {
    var clientGateActive = isClientGateActive(photo.client);
    var alreadySignedOff = isFullyComplete(photo.status, photo.client);
    var isModal = !!hostPop;

    var pop = document.createElement('div');
    pop.className = 'scw-qa-popover';
    if (!isModal) {
      pop.id = POPOVER_ID;
      pop.setAttribute('data-photo-id', photo.id);
    }
    // ctl is the element chip/notes handlers + updateActions act on.
    var ctl = hostPop || pop;

    // ── Header strip: thumbnail + type/sub (mirrors closeout __head) ──
    var head = document.createElement('div');
    head.className = 'scw-qa-popover__head';
    var thumb = document.createElement('div');
    thumb.className = 'scw-qa-popover__thumb';
    if (photo.imgUrl) {
      thumb.style.backgroundImage = "url('" + photo.imgUrl.replace(/'/g, "\\'") + "')";
      thumb.title = 'Open full image';
      thumb.addEventListener('click', function () {
        window.open(photo.imgUrl, '_blank');
      });
    } else {
      thumb.classList.add('scw-qa-popover__thumb--empty');
      thumb.textContent = 'no photo';
    }
    head.appendChild(thumb);
    var meta = document.createElement('div');
    meta.className = 'scw-qa-popover__head-meta';
    var typeEl = document.createElement('div');
    typeEl.className = 'scw-qa-popover__type';
    typeEl.textContent = photo.type || 'Photo';
    typeEl.title = photo.type || 'Photo';
    var subEl = document.createElement('div');
    subEl.className = 'scw-qa-popover__sub';
    subEl.textContent = alreadySignedOff ? 'Signed off' : 'QA review';
    meta.appendChild(typeEl);
    meta.appendChild(subEl);
    head.appendChild(meta);
    // The modal supplies its own header + large preview, so the compact
    // docked header strip is only added in popover mode.
    if (!isModal) pop.appendChild(head);

    // ── Body: scrollable QA controls (mirrors closeout __sidebar-content) ──
    var body = document.createElement('div');
    body.className = 'scw-qa-popover__body';

    // Status chips
    body.appendChild(buildChipRow(
      'QA Status', STATUS_OPTIONS, photo.status, 'status', ctl, photo
    ));

    // Client signoff chips (only when applicable)
    if (clientGateActive) {
      body.appendChild(buildChipRow(
        'Client signoff', CLIENT_OPTIONS, photo.client, 'client', ctl, photo
      ));
    }

    // Notes
    var notesSec = document.createElement('div');
    notesSec.className = 'scw-qa-popover__section';
    var notesLbl = document.createElement('div');
    notesLbl.className = 'scw-qa-popover__label';
    notesLbl.textContent = 'Notes';
    notesSec.appendChild(notesLbl);
    var notes = document.createElement('textarea');
    notes.className = 'scw-qa-popover__notes';
    notes.value = photo.notes || '';
    notes.setAttribute('data-field', 'notes');
    notes.addEventListener('input', function () {
      photo.notes = notes.value;
      _hasUnsavedChanges = true;
      setSaveStatus(ctl, 'dirty', 'Unsaved changes');
      updateActions(ctl, photo);
    });
    // Auto-save on tab-out / click-away (blur) and on plain Enter, so the user
    // never has to hit a Save button. Shift+Enter inserts a newline.
    notes.addEventListener('blur', function () {
      if (_hasUnsavedChanges) saveDirty(ctl, photo);
    });
    notes.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (_hasUnsavedChanges) saveDirty(ctl, photo);
      }
    });
    notesSec.appendChild(notes);
    var hint = document.createElement('div');
    hint.className = 'scw-qa-popover__notes-hint';
    hint.style.display = 'none';
    notesSec.appendChild(hint);
    body.appendChild(notesSec);

    // Sign-off metadata summary (read-only) — matches closeout __signoff.
    if (alreadySignedOff && (photo.completedBy || photo.completedDate)) {
      var foot = document.createElement('div');
      foot.className = 'scw-qa-popover__signoff';
      foot.innerHTML =
        'Last signed off by <strong>' + escapeHtml(photo.completedBy || '—') +
        '</strong> on <strong>' + escapeHtml(photo.completedDate || '—') + '</strong>';
      body.appendChild(foot);
    }

    // History list (append-only audit) — matches closeout history block.
    var histSec = document.createElement('div');
    histSec.className = 'scw-qa-popover__section';
    var histLbl = document.createElement('div');
    histLbl.className = 'scw-qa-popover__label';
    histLbl.textContent = 'History';
    histSec.appendChild(histLbl);
    var hist = document.createElement('div');
    hist.className = 'scw-qa-popover__history';
    if (photo.history && photo.history.trim()) {
      // history is paragraph-text innerHTML (newlines as <br>) — render as-is.
      hist.innerHTML = photo.history;
    } else {
      hist.className += ' scw-qa-popover__history-empty';
      hist.textContent = 'No QA history yet.';
    }
    histSec.appendChild(hist);
    body.appendChild(histSec);

    pop.appendChild(body);

    // Footer: live save-status (left) + action buttons (right, filled by
    // updateActions). The status span persists across updateActions rebuilds
    // (which only re-fill the .scw-qa-popover__btns container).
    var actions = document.createElement('div');
    actions.className = 'scw-qa-popover__actions';
    var saveStatus = document.createElement('span');
    saveStatus.className = 'scw-qa-popover__save-status';
    actions.appendChild(saveStatus);
    var btns = document.createElement('div');
    btns.className = 'scw-qa-popover__btns';
    actions.appendChild(btns);
    pop.appendChild(actions);

    updateActions(pop, photo);
    return pop;
  }

  // ── Photo-add + classify sections (machinery: photo-edit-panel.js) ──
  function pepUtil() {
    return (window.SCW && SCW.photoEditPanel && SCW.photoEditPanel.util) || null;
  }
  function pepSaveView(viewKey) {
    var sv = window.SCW && SCW.photoEditPanel && SCW.photoEditPanel.SAVE_VIEWS;
    return (sv && viewKey && sv[viewKey]) || PIC_SAVE_VIEW;
  }
  function notifyHostSaved(photo) {
    if (_refreshHandler) { try { _refreshHandler({}, photo); } catch (e) {} }
  }

  /** Upload dropzone for a photo record with no image. Downsamples, uploads
   *  to Knack assets with the session token, PUTs field_771 through the
   *  scene's save view, then swaps itself for a live preview. Falls back to
   *  the old static "No photo uploaded yet." if the machinery is absent. */
  function buildUploadPane(photo) {
    var u = pepUtil();
    var saveView = pepSaveView(photo.viewKey);
    if (!u || !saveView) {
      var empty = document.createElement('div');
      empty.className = 'scw-qa-modal__viewer-empty';
      empty.textContent = 'No photo uploaded yet.';
      return empty;
    }
    var wrap = document.createElement('div');
    wrap.className = 'scw-qa-modal__uploadwrap';
    wrap.innerHTML =
      '<label class="scw-qa-modal__drop">' +
        '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.8"/>' +
          '<path d="M21 16l-5-5-9 9"/></svg>' +
        '<span><strong>Add a photo</strong> — click to choose or drag one here.<br>' +
        '<span class="scw-qa-modal__drop-sub">Large images are resized automatically.</span></span>' +
        '<input type="file" accept="image/*" style="display:none">' +
      '</label>' +
      '<div class="scw-qa-modal__upstatus" style="display:none"></div>';
    var drop   = wrap.querySelector('.scw-qa-modal__drop');
    var input  = wrap.querySelector('input[type="file"]');
    var status = wrap.querySelector('.scw-qa-modal__upstatus');
    function setStatus(msg, isErr) {
      status.style.display = '';
      status.textContent = msg;
      status.classList.toggle('is-err', !!isErr);
    }
    function handleFile(file) {
      if (!file) return;
      if ((file.type || '').indexOf('image/') !== 0) { setStatus('Not an image file.', true); return; }
      setStatus('Resizing…');
      u.downscale(file).then(function (blob) {
        if (!blob) { setStatus('Image too large and could not be resized.', true); return null; }
        setStatus('Uploading…');
        var name = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
        return u.uploadImage(blob, name).then(function (assetId) {
          setStatus('Saving…');
          var body = {}; body[F.img] = assetId;
          return u.putRecord(saveView, photo.id, body);
        }).then(function () {
          setStatus('Photo saved ✓');
          var url = URL.createObjectURL(blob);
          var img = document.createElement('img');
          img.src = url;
          img.alt = photo.type || 'Photo';
          drop.parentNode.replaceChild(img, drop);
          photo.imgUrl = url;
          photo.completed = true;
          notifyHostSaved(photo);
        });
      }).catch(function (err) {
        setStatus((err && err.message) || 'Upload failed — try again.', true);
      });
    }
    input.addEventListener('change', function () { handleFile(this.files && this.files[0]); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('is-over');
      handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    return wrap;
  }

  /** Viewer-top action bar for a photo that HAS an image: Replace photo
   *  (downsample → asset upload → PUT) and Remove photo (clears field_771,
   *  keeps the record — viewer swaps to the upload pane in place, modal
   *  stays open). Locked once QA is signed off, same rule as the files
   *  popover. Returns null when the save machinery isn't available. */
  function buildPhotoViewerBar(viewerEl, photo) {
    var u = pepUtil();
    var saveView = pepSaveView(photo.viewKey);
    if (!u || !saveView) return null;

    var bar = document.createElement('div');
    bar.className = 'scw-qa-modal__viewer-bar';

    var locked = photo.needsQa !== false && isFullyComplete(photo.status, photo.client);
    var lockTitle = 'QA is signed off — set it back to Pending or Fail first.';

    function swapToUploadPane() {
      // Keep the classify bar (Type/Required editors) across the swap.
      var keep = viewerEl.querySelector('.scw-qa-modal__classify');
      viewerEl.innerHTML = '';
      if (keep) viewerEl.appendChild(keep);
      viewerEl.appendChild(buildUploadPane(photo));
    }
    function pickImage(onFile) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        document.body.removeChild(input);
        if (f) onFile(f);
      });
      document.body.appendChild(input);
      input.click();
    }

    var repB = document.createElement('button');
    repB.type = 'button';
    repB.textContent = 'Replace photo';
    if (locked) { repB.disabled = true; repB.title = lockTitle; }
    repB.addEventListener('click', function () {
      if (repB.disabled) return;
      pickImage(function (file) {
        if ((file.type || '').indexOf('image/') !== 0) { alert('Not an image file.'); return; }
        repB.disabled = true;
        repB.textContent = 'Replacing…';
        u.downscale(file).then(function (blob) {
          if (!blob) throw new Error('image too large to resize');
          var name = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
          return u.uploadImage(blob, name).then(function (assetId) {
            var body = {}; body[F.img] = assetId;
            return u.putRecord(saveView, photo.id, body);
          }).then(function () {
            var url = URL.createObjectURL(blob);
            var imgEl = viewerEl.querySelector('img');
            if (imgEl) imgEl.src = url;
            photo.imgUrl = url;
            repB.disabled = locked;
            repB.textContent = 'Replace photo';
            notifyHostSaved(photo);
          });
        }).catch(function (err) {
          repB.disabled = false;
          repB.textContent = 'Replace photo';
          alert('Replace failed: ' + ((err && err.message) || 'unknown error'));
        });
      });
    });
    bar.appendChild(repB);

    var remB = document.createElement('button');
    remB.type = 'button';
    remB.className = 'is-danger';
    remB.textContent = 'Remove photo';
    if (locked) { remB.disabled = true; remB.title = lockTitle; }
    remB.addEventListener('click', function () {
      if (remB.disabled) return;
      if (!window.confirm('Remove this photo from ' + (photo.type || 'this record') + '?\n\n' +
            'The photo slot stays — only the image is cleared.')) return;
      remB.disabled = true;
      remB.textContent = 'Removing…';
      var extra = {};
      extra[F.completed] = 'No';
      // clearFileField verifies against the PUT response and retries with ''
      // when null is silently ignored (Knack file-field quirk).
      u.clearFileField(saveView, photo.id, F.img, extra).then(function () {
        photo.imgUrl = '';
        photo.completed = false;
        swapToUploadPane();
        notifyHostSaved(photo);
      }).catch(function (err) {
        remB.disabled = false;
        remB.textContent = 'Remove photo';
        alert('Remove failed: ' + ((err && err.message) || 'unknown error'));
      });
    });
    bar.appendChild(remB);
    return bar;
  }

  /** Classify bar — photo Type (field_2445 connection) + Required
   *  (field_2446 Yes/No) editors, auto-saving on change through the
   *  scene's save view. Deploy-scene only: the fields are exposed
   *  inline-editable on view_3937; other scenes' save views don't carry
   *  them, so the bar is omitted there. Type options come from
   *  photo-edit-panel's collectTypeOptions() (full Builder-snippet
   *  catalog, scene-scrape fallback). onTypeChanged(label) lets the
   *  modal retitle itself when the type is reassigned. */
  function buildClassifyBar(photo, onTypeChanged) {
    var u = pepUtil();
    var saveView = pepSaveView(photo.viewKey);
    if (!u || saveView !== PIC_SAVE_VIEW) return null;
    var options = u.collectTypeOptions();
    if (!options.length && photo.required == null) return null;

    var bar = document.createElement('div');
    bar.className = 'scw-qa-modal__classify';

    var status = document.createElement('span');
    status.className = 'scw-qa-modal__classify-status';
    function flash(msg, isErr) {
      status.textContent = msg;
      status.classList.toggle('is-err', !!isErr);
      if (!isErr) setTimeout(function () {
        if (status.textContent === msg) status.textContent = '';
      }, 1800);
    }

    // Type select
    var typeWrap = document.createElement('label');
    typeWrap.className = 'scw-qa-modal__classify-item';
    typeWrap.appendChild(document.createTextNode('Type'));
    var sel = document.createElement('select');
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '— select type —';
    sel.appendChild(ph);
    var currentLabel = (photo.type || '').trim().toLowerCase();
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      if (o.label.trim().toLowerCase() === currentLabel) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var id = sel.value;
      if (!id) return;
      var label = sel.options[sel.selectedIndex].textContent;
      sel.disabled = true;
      flash('Saving…');
      var body = {};
      body[F.photoType] = [id];
      u.putRecord(saveView, photo.id, body).then(function () {
        photo.type = label;
        sel.disabled = false;
        flash('Saved ✓');
        if (onTypeChanged) { try { onTypeChanged(label); } catch (e) {} }
        notifyHostSaved(photo);
      }).catch(function (err) {
        sel.disabled = false;
        flash((err && err.message) || 'Save failed', true);
      });
    });
    typeWrap.appendChild(sel);
    bar.appendChild(typeWrap);

    // Required toggle
    var reqWrap = document.createElement('label');
    reqWrap.className = 'scw-qa-modal__classify-item scw-qa-modal__classify-req';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!photo.required;
    cb.addEventListener('change', function () {
      var want = cb.checked;
      cb.disabled = true;
      flash('Saving…');
      var body = {};
      body[F.required] = want ? 'Yes' : 'No';
      u.putRecord(saveView, photo.id, body).then(function () {
        photo.required = want;
        cb.disabled = false;
        flash('Saved ✓');
        notifyHostSaved(photo);
      }).catch(function (err) {
        cb.checked = !want;
        cb.disabled = false;
        flash((err && err.message) || 'Save failed', true);
      });
    });
    reqWrap.appendChild(cb);
    reqWrap.appendChild(document.createTextNode('Required'));
    bar.appendChild(reqWrap);

    bar.appendChild(status);
    return bar;
  }

  /**
   * Modal shell (openForAnchor path). Reuses buildPopover to build the
   * exact same QA controls, then transplants its scrollable body + action
   * footer into a centered modal sidebar alongside a large photo preview.
   * Returns { overlay, dialog } — dialog is the element the save routines
   * treat as _popover (it owns .scw-qa-popover__body / __actions and the
   * is-saving toggle via .scw-qa-modal.is-saving).
   */
  function buildModal(photo) {
    var alreadySignedOff = isFullyComplete(photo.status, photo.client);
    // needsQa=false → plain big-photo viewer: no QA sidebar, no QA controls
    // built at all (so the save routines are never reachable for this photo).
    var showQa = (photo.needsQa !== false);

    var overlay = document.createElement('div');
    overlay.className = 'scw-qa-modal__overlay';

    var dialog = document.createElement('div');
    dialog.className = 'scw-qa-modal' + (showQa ? '' : ' scw-qa-modal--noqa');
    dialog.id = POPOVER_ID;
    dialog.setAttribute('data-photo-id', photo.id);

    // Build the QA controls wired to `dialog` (the live shell the save
    // routines treat as _popover), then harvest the body + actions and
    // mount them in the sidebar. `src` is a throwaway container. Skipped
    // entirely when the photo doesn't need QA (preview-only modal).
    var body = null, actions = null;
    if (showQa) {
      var src = buildPopover(photo, dialog);
      body    = src.querySelector('.scw-qa-popover__body');
      actions = src.querySelector('.scw-qa-popover__actions');
    }

    // ── Header ───────────────────────────────────────────────────────
    var head = document.createElement('div');
    head.className = 'scw-qa-modal__head';
    var meta = document.createElement('div');
    meta.className = 'scw-qa-modal__head-meta';
    var typeEl = document.createElement('div');
    typeEl.className = 'scw-qa-modal__type';
    typeEl.textContent = photo.type || 'Photo';
    typeEl.title = photo.type || 'Photo';
    var subEl = document.createElement('div');
    subEl.className = 'scw-qa-modal__sub';
    subEl.textContent = !showQa ? 'Photo' : (alreadySignedOff ? 'Signed off' : 'QA review');
    meta.appendChild(typeEl);
    meta.appendChild(subEl);
    head.appendChild(meta);

    var headActions = document.createElement('div');
    headActions.className = 'scw-qa-modal__head-actions';
    if (photo.imgUrl) {
      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'scw-qa-modal__head-btn';
      openBtn.textContent = 'Open ↗';
      openBtn.addEventListener('click', function () { window.open(photo.imgUrl, '_blank'); });
      headActions.appendChild(openBtn);
    }
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'scw-qa-modal__head-btn scw-qa-modal__head-btn--close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', function () { closePopover(false); });
    headActions.appendChild(closeBtn);
    head.appendChild(headActions);
    dialog.appendChild(head);

    // ── Body: photo preview (left) + reused QA sidebar (right) ───────
    var splitBody = document.createElement('div');
    splitBody.className = 'scw-qa-modal__body';

    var viewer = document.createElement('div');
    viewer.className = 'scw-qa-modal__viewer';
    // Type / Required editors (deploy scene only — see buildClassifyBar).
    var classify = buildClassifyBar(photo, function (label) {
      typeEl.textContent = label;
      typeEl.title = label;
      var im = viewer.querySelector('img');
      if (im) im.alt = label;
    });
    if (photo.imgUrl) {
      var pbar = buildPhotoViewerBar(viewer, photo);
      if (pbar) {
        // Classify controls join the top action bar: Type/Required on the
        // left, Replace/Remove on the right.
        if (classify) pbar.insertBefore(classify, pbar.firstChild);
        viewer.appendChild(pbar);
      } else if (classify) {
        viewer.appendChild(classify);
      }
      var img = document.createElement('img');
      img.src = photo.imgUrl;
      img.alt = photo.type || 'Photo';
      img.title = 'Open full image';
      img.addEventListener('click', function () { window.open(photo.imgUrl, '_blank'); });
      viewer.appendChild(img);
    } else {
      if (classify) viewer.appendChild(classify);
      viewer.appendChild(buildUploadPane(photo));
    }
    splitBody.appendChild(viewer);

    // QA sidebar — only when the photo needs QA. When omitted the viewer
    // pane flexes to fill the modal (a plain big-photo viewer).
    if (showQa) {
      var sidebar = document.createElement('div');
      sidebar.className = 'scw-qa-modal__sidebar';
      if (body)    sidebar.appendChild(body);     // reused QA controls
      if (actions) sidebar.appendChild(actions);  // reused footer buttons
      splitBody.appendChild(sidebar);
    }

    dialog.appendChild(splitBody);

    // The footer was populated by buildPopover while it still lived in the
    // throwaway `src`; now that it's mounted under `dialog`, re-run so any
    // later updateActions(dialog,…) calls (chip/notes edits) keep resolving.
    if (showQa) updateActions(dialog, photo);

    overlay.appendChild(dialog);
    return { overlay: overlay, dialog: dialog };
  }

  function buildChipRow(label, options, currentValue, fieldName, pop, photo) {
    var sec = document.createElement('div');
    sec.className = 'scw-qa-popover__section';
    var lbl = document.createElement('div');
    lbl.className = 'scw-qa-popover__label';
    lbl.textContent = label;
    sec.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'scw-qa-popover__chips';
    options.forEach(function (opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scw-qa-popover__chip';
      chip.setAttribute('data-value', opt);
      chip.textContent = opt;
      if (opt === currentValue) chip.classList.add('is-selected');
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        // Deselect siblings, select this
        var siblings = row.querySelectorAll('.scw-qa-popover__chip');
        for (var i = 0; i < siblings.length; i++) {
          siblings[i].classList.remove('is-selected');
        }
        chip.classList.add('is-selected');
        photo[fieldName] = opt;
        _hasUnsavedChanges = true;
        updateActions(pop, photo);
        // Auto-save the chip change immediately (with Saving…/Saved feedback).
        saveDirty(pop, photo);
      });
      row.appendChild(chip);
    });
    sec.appendChild(row);
    return sec;
  }

  // Update the live save-status indicator. ctl is the element owning the
  // footer (popover or modal dialog). kind: '' | 'dirty' | 'saving' | 'saved'
  // | 'error'. Idempotent — safe to call from any handler.
  function setSaveStatus(ctl, kind, text) {
    ctl = ctl || _popover;
    if (!ctl) return;
    var el = ctl.querySelector('.scw-qa-popover__save-status');
    if (!el) return;
    el.className = 'scw-qa-popover__save-status' + (kind ? ' is-' + kind : '');
    el.textContent = text || '';
  }

  function updateActions(pop, photo) {
    var btns = pop.querySelector('.scw-qa-popover__btns');
    if (!btns) return;
    btns.innerHTML = '';

    var hint = pop.querySelector('.scw-qa-popover__notes-hint');
    var notes = (photo.notes || '').trim();

    var alreadySignedOff = isFullyComplete(_initialState.status, _initialState.client);
    var wouldBeComplete  = isFullyComplete(photo.status, photo.client);

    // Validation: require notes when Fail or Bypassed selected.
    var requiresNotes = (photo.status === 'Fail') || (photo.client === 'Bypassed');
    var notesMissing  = requiresNotes && !notes;
    if (hint) {
      if (notesMissing) {
        hint.textContent = (photo.status === 'Fail')
          ? 'Notes required when marking Fail.'
          : 'Bypass reason required.';
        hint.style.display = '';
      } else {
        hint.style.display = 'none';
      }
    }

    // No explicit Save button — edits (chips + notes) auto-save on change /
    // tab / Enter with inline Saving…/Saved feedback. "Close" simply leaves
    // (a final autosave-on-close catches any not-yet-committed text as a
    // safety net).

    // Primary action depends on state.
    if (alreadySignedOff) {
      var revert = document.createElement('button');
      revert.type = 'button';
      revert.className = 'scw-qa-popover__btn scw-qa-popover__btn--revert';
      revert.textContent = 'Revert sign-off';
      revert.addEventListener('click', function () { onRevert(photo); });
      btns.appendChild(revert);

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'scw-qa-popover__btn scw-qa-popover__btn--cancel';
      close.textContent = 'Close';
      close.addEventListener('click', function () { closePopover(true); });
      btns.appendChild(close);
    } else {
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'scw-qa-popover__btn scw-qa-popover__btn--cancel';
      cancel.textContent = 'Close';
      cancel.addEventListener('click', function () { closePopover(false); });
      btns.appendChild(cancel);

      var signoff = document.createElement('button');
      signoff.type = 'button';
      signoff.className = 'scw-qa-popover__btn scw-qa-popover__btn--primary';
      signoff.textContent = 'Sign Off';
      signoff.disabled = !wouldBeComplete || notesMissing;
      signoff.addEventListener('click', function () { onSignOff(photo); });
      btns.appendChild(signoff);
    }
  }

  // Persist the current edits (notes + any chip changes) without closing the
  // panel — gives the user explicit "Saving… → Saved ✓" feedback. Mirrors the
  // field diff in autoSaveIfDirty but keeps the popover open.
  function saveDirty(pop, photo) {
    // A save requested while another is in flight (e.g. a chip click landing
    // during a notes-blur save) is queued, not dropped — drained on completion
    // so concurrent edits converge instead of being lost when the in-flight
    // save clears the dirty flag.
    if (_isSaving) { _resavePending = { pop: pop, photo: photo }; return; }
    var status = readSelectedChip(pop, 'status') || _initialState.status;
    var client = readSelectedChip(pop, 'client') || _initialState.client;
    var notesEl = pop.querySelector('.scw-qa-popover__notes');
    var notes  = notesEl ? notesEl.value : _initialState.notes;

    var requiresNotes = (status === 'Fail') || (client === 'Bypassed');
    if (requiresNotes && !(notes || '').trim()) {
      setSaveStatus(pop, 'error',
        status === 'Fail' ? 'Notes required to Fail.' : 'Bypass reason required.');
      return;
    }

    var fields = {};
    if (status !== _initialState.status) fields[F.status] = status;
    if (isClientGateActive(_initialState.client) && client !== _initialState.client) {
      fields[F.client] = client;
    }
    if (notes !== _initialState.notes) fields[F.notes] = notes;
    if (!Object.keys(fields).length) { setSaveStatus(pop, '', ''); return; }

    _isSaving = true;
    setSaveStatus(pop, 'saving', 'Saving…');
    updateActions(pop, photo);   // disable Save while in flight (via re-render)
    var chit = _popover && _popover._triggerChit;
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) {
        setSaveStatus(pop, 'error', 'Save failed — try again');
        // A queued edit still needs a home; leave it dirty for close-autosave.
        _resavePending = null;
        return;
      }
      // Commit to the baseline so close-autosave + diff stay consistent.
      if (fields[F.status] != null) _initialState.status = status;
      if (fields[F.client] != null) _initialState.client = client;
      if (fields[F.notes]  != null) { _initialState.notes = notes; photo.notes = notes; }
      photo.status = status; photo.client = client;
      _hasUnsavedChanges = false;
      if (_refreshHandler) _refreshHandler(fields, photo);
      else if (chit) refreshChitAndCells(chit, photo, fields);
      // Drain a queued save (an edit that arrived mid-flight). It re-diffs
      // against the just-updated baseline, so only genuinely-new changes save.
      if (_resavePending) {
        var pend = _resavePending; _resavePending = null;
        saveDirty(pend.pop, pend.photo);
        return;
      }
      setSaveStatus(pop, 'saved', 'Saved ✓');
      updateActions(pop, photo);
      clearTimeout(_savedFadeTimer);
      _savedFadeTimer = setTimeout(function () {
        if (!_hasUnsavedChanges) setSaveStatus(pop, '', '');
      }, 2500);
    });
  }

  // ── Sign-off / revert / autosave ────────────────────────────────

  function onSignOff(photo) {
    if (_isSaving) return;
    var fields = {};
    fields[F.status] = photo.status;
    if (isClientGateActive(_initialState.client)) {
      fields[F.client] = photo.client;
    }
    fields[F.notes] = photo.notes || '';
    fields[F.completedBy]   = currentUserId();
    fields[F.completedDate] = todayForKnack();
    var detail = 'status=' + photo.status +
      (isClientGateActive(_initialState.client) ? ', client=' + photo.client : '');
    fields[F.history] = prependHistory(photo.history, 'SIGNED OFF', detail);

    sendSave(fields, photo, 'Signed off.');
  }

  function onRevert(photo) {
    if (_isSaving) return;
    // Reset QA state back to Pending so the chit visibly leaves the
    // "signed off" appearance.  Audit fields cleared.  Notes preserved
    // so the prior context is retained.  History prepends the revert
    // event with the state that was reverted FROM.
    var prevStatus = _initialState.status;
    var prevClient = _initialState.client;
    var clientActive = isClientGateActive(prevClient);

    photo.status = 'Pending';
    if (clientActive) photo.client = 'Pending';

    var fields = {};
    fields[F.status] = 'Pending';
    if (clientActive) fields[F.client] = 'Pending';
    fields[F.notes] = photo.notes || '';
    fields[F.completedBy]   = '';
    fields[F.completedDate] = '';
    fields[F.history] = prependHistory(
      photo.history,
      'SIGN-OFF REVERTED',
      'was status=' + prevStatus +
        (clientActive ? ', client=' + prevClient : '')
    );
    sendSave(fields, photo, 'Sign-off reverted.');
  }

  function autoSaveIfDirty(onDone) {
    if (!_hasUnsavedChanges || _isSaving) {
      onDone && onDone();
      return;
    }
    // Pull current values back out of the popover DOM
    var pop = _popover;
    if (!pop) { onDone && onDone(); return; }
    var status = readSelectedChip(pop, 'status') || _initialState.status;
    var client = readSelectedChip(pop, 'client') || _initialState.client;
    var notesEl = pop.querySelector('.scw-qa-popover__notes');
    var notes  = notesEl ? notesEl.value : _initialState.notes;

    // Don't autosave Fail/Bypass without notes — that violates the rule
    // (validation in updateActions already kept Sign Off disabled,
    // but autosave on click-outside could otherwise persist invalid state).
    var requiresNotes = (status === 'Fail') || (client === 'Bypassed');
    if (requiresNotes && !(notes || '').trim()) {
      // Discard the offending change and just close.
      onDone && onDone();
      return;
    }

    var fields = {};
    if (status !== _initialState.status) fields[F.status] = status;
    if (isClientGateActive(_initialState.client) && client !== _initialState.client) {
      fields[F.client] = client;
    }
    if (notes !== _initialState.notes) fields[F.notes] = notes;

    if (!Object.keys(fields).length) {
      onDone && onDone();
      return;
    }

    _isSaving = true;
    var chit = _popover && _popover._triggerChit;
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) {
        console.warn('[scw-qa] autosave failed:', err);
        onDone && onDone();
        return;
      }
      // Build a minimal photo snapshot so the chit reflects the
      // autosaved values (note: completion isn't toggled here — that
      // only happens via the explicit Sign Off button).
      var snapshot = {
        id:        _photoId,
        type:      chit ? ((chit.querySelector('span:last-child') || {}).textContent || '') : '',
        completed: true,
        status:    status,
        client:    client
      };
      if (_refreshHandler) _refreshHandler(fields, snapshot);
      else if (chit) refreshChitAndCells(chit, snapshot, fields);
      onDone && onDone();
    });
  }

  function readSelectedChip(pop, fieldName) {
    var rows = pop.querySelectorAll('.scw-qa-popover__chips');
    // Map data-field on the row's parent section.  Easier: walk by chip's data-value.
    // We stored data-field on the textarea but not on the chip rows. Reconstruct
    // by looking at the first chip in each row's options.
    // Simpler: search by known option order.
    for (var i = 0; i < rows.length; i++) {
      var firstChip = rows[i].querySelector('.scw-qa-popover__chip');
      if (!firstChip) continue;
      var firstVal = firstChip.getAttribute('data-value');
      var isStatusRow = (firstVal === 'Pending') && (rows[i].querySelectorAll('.scw-qa-popover__chip').length === 3) &&
        rows[i].querySelector('.scw-qa-popover__chip[data-value="Pass"]');
      var isClientRow = rows[i].querySelector('.scw-qa-popover__chip[data-value="Approved"]');
      if ((fieldName === 'status' && isStatusRow) ||
          (fieldName === 'client' && isClientRow)) {
        var sel = rows[i].querySelector('.scw-qa-popover__chip.is-selected');
        return sel ? sel.getAttribute('data-value') : null;
      }
    }
    return null;
  }

  function sendSave(fields, photo, _successMsg) {
    if (_isSaving) return;
    _isSaving = true;
    if (_popover) _popover.classList.add('is-saving');
    var chit = _popover && _popover._triggerChit;
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) {
        if (_popover) _popover.classList.remove('is-saving');
        showError(err.message || 'Save failed');
        return;
      }
      // Optimistic in-page refresh: update the chit visual + the
      // hidden source-tr cells so subsequent reads (and the next
      // view-render pass) see the new values without waiting on a
      // model.fetch() roundtrip.
      if (_refreshHandler) _refreshHandler(fields, photo);
      else if (chit) refreshChitAndCells(chit, photo, fields);
      closePopover(true);
    });
  }

  // ── Optimistic DOM refresh after save ───────────────────────────

  /**
   * Recompute the chit state from the saved photo object, swap the
   * is-* class + icon + tooltip on the chit, and write the new field
   * values back into the source <tr>'s hidden cells so future reads
   * (and the next view-render pass) stay consistent.
   */
  function refreshChitAndCells(chit, photo, fields) {
    if (!chit) return;
    // 1) New chit visual state
    var newState = computeChitState(photo);
    var statesToStrip = ['is-missing', 'is-qa-pending', 'is-half-pass', 'is-done', 'is-fail'];
    for (var i = 0; i < statesToStrip.length; i++) {
      chit.classList.remove(statesToStrip[i]);
    }
    chit.classList.add('is-' + newState);
    chit.setAttribute('data-photo-state', newState);
    var photoType = (photo.type || 'Photo');
    chit.title = photoType + ' — ' + chitStateTooltip(newState);
    chit.innerHTML = chitStateIcon(newState);
    var nameSpan = document.createElement('span');
    nameSpan.className = 'scw-ws-req-photo-chit-name';
    nameSpan.textContent = photoType;
    chit.appendChild(nameSpan);
    var stateSpan = document.createElement('span');
    stateSpan.className = 'scw-ws-req-photo-chit-state';
    stateSpan.textContent = chitStateLabel(newState);
    chit.appendChild(stateSpan);

    // 2) Mirror the saved field values into the source <tr>'s cells
    // so the next read (e.g. when the view re-renders) starts from a
    // consistent state.
    var sourceTr = findSourceTr(chit);
    if (sourceTr) {
      var keys = Object.keys(fields);
      for (var k = 0; k < keys.length; k++) {
        writeSourceCell(sourceTr, photo.id, keys[k], fields[keys[k]]);
      }
    }
  }

  /**
   * Update the inner <span id="photoId" data-kn="connection-value">
   * inside td.fieldKey on the source tr.  For text values we set
   * textContent; for fields not yet shown for this photo (cell shows
   * &nbsp;) we create the inner span first.
   */
  function writeSourceCell(tr, photoId, fieldKey, value) {
    var cell = tr.querySelector('td.' + fieldKey);
    if (!cell) return;
    var span = cell.querySelector(
      'span[id="' + photoId + '"][data-kn="connection-value"]'
    );
    if (!span) {
      // Cell was empty (showing &nbsp;) — inject a fresh span so future
      // reads find the value.
      var wrapper = cell.querySelector('span[class^="col-"]') || cell;
      span = document.createElement('span');
      span.id = photoId;
      span.setAttribute('data-kn', 'connection-value');
      wrapper.appendChild(span);
    }
    span.textContent = value == null ? '' : String(value);
  }

  /**
   * Chit state computation — mirrors device-worksheet's
   * computePhotoChitState(ph, true).  Inlined here to avoid coupling.
   */
  function computeChitState(photo) {
    if (!photo.completed) return 'missing';
    var s = (photo.status || '').toLowerCase();
    if (s === 'fail') return 'fail';
    if (s === 'pass') {
      var c = (photo.client || '').toLowerCase();
      if (c === '' || c === 'n/a' || c === 'approved' || c === 'bypassed') return 'done';
      return 'half-pass';
    }
    return 'qa-pending';
  }

  function chitStateTooltip(state) {
    switch (state) {
      case 'missing':    return 'photo not uploaded';
      case 'qa-pending': return 'photo uploaded, QA not yet done';
      case 'half-pass':  return 'internal pass, awaiting client signoff';
      case 'done':       return 'signed off';
      case 'fail':       return 'QA failed';
      default:           return state;
    }
  }

  function chitStateLabel(state) {
    switch (state) {
      case 'missing':    return 'Missing';
      case 'qa-pending': return 'Needs QA';
      case 'half-pass':  return 'Client pending';
      case 'done':       return 'Signed off';
      case 'fail':       return 'Failed';
      default:           return '';
    }
  }

  function chitStateIcon(state) {
    var checkSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var warnSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var xSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var clockSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    var halfSvg =
      '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9" fill="none"/><path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor"/></svg>';
    switch (state) {
      case 'done':       return checkSvg;
      case 'half-pass':  return halfSvg;
      case 'missing':    return warnSvg;
      case 'fail':       return xSvg;
      case 'qa-pending': return clockSvg;
      default:           return clockSvg;
    }
  }

  function showError(msg) {
    if (!_popover) return;
    var existing = _popover.querySelector('.scw-qa-popover__error');
    if (existing) existing.remove();
    var err = document.createElement('div');
    err.className = 'scw-qa-popover__error';
    err.textContent = msg;
    // Insert just above the action footer so it reads as part of the panel.
    var actions = _popover.querySelector('.scw-qa-popover__actions');
    if (actions) _popover.insertBefore(err, actions);
    else _popover.appendChild(err);
  }

  function findCurrentViewId() {
    if (!_popover) return null;
    // Walk up from the chit that triggered this popover (we stored
    // the chit ref on the popover element).
    var chit = _popover._triggerChit;
    if (!chit) return null;
    var view = chit.closest('[id^="view_"]');
    return view ? view.id : null;
  }

  // ── Open / close lifecycle ──────────────────────────────────────

  function openForChit(chitEl) {
    closePopover(false);

    var photoId = chitEl.getAttribute('data-photo-id');
    if (!photoId) return;
    var sourceTr = findSourceTr(chitEl);
    if (!sourceTr) {
      console.warn('[scw-qa] Could not find source tr for chit', chitEl);
      return;
    }
    var photo = readPhoto(sourceTr, photoId);
    if (!photo.completed) {
      // Photo not yet uploaded — the chit's amber state already
      // signals that; QA isn't applicable yet. Let the existing
      // add-photo flow handle it (inline-photo-row owns that).
      return;
    }

    _photoId = photoId;
    _initialState = {
      status: photo.status,
      client: photo.client,
      notes:  photo.notes,
      history: photo.history
    };
    _hasUnsavedChanges = false;
    _isSaving = false;

    injectCSS();
    var pop = buildPopover(photo);
    pop._triggerChit = chitEl;
    document.body.appendChild(pop);
    _popover = pop;

    positionPopover(pop, chitEl);
  }

  /**
   * Host-agnostic open — used by surfaces that don't have a worksheet
   * source <tr> to scrape (e.g. the worksheet-v2 install photo strip).
   * The caller supplies the PIC record id, the anchor element to dock the
   * popover off, a QA snapshot, and an onSaved(fields, photo) callback so
   * the host can refresh its own chit in place. Save still goes through
   * view_3937 (saveFields) — identical write path to the chit flow.
   *
   * snapshot shape (all optional, sensible defaults applied):
   *   { type, imgUrl, status, client, notes, history,
   *     completedBy, completedDate, completed }
   */
  function openForAnchor(anchorEl, photoId, snapshot, onSaved) {
    closePopover(false);
    if (!anchorEl || !photoId) return;
    snapshot = snapshot || {};

    var photo = {
      id:            photoId,
      type:          snapshot.type || 'Photo',
      imgUrl:        snapshot.imgUrl || '',
      status:        normalizeOption(snapshot.status, STATUS_OPTIONS) || 'Pending',
      client:        normalizeOption(snapshot.client, ['N/A'].concat(CLIENT_OPTIONS)) || 'N/A',
      notes:         snapshot.notes   || '',
      history:       snapshot.history || '',
      completedBy:   snapshot.completedBy   || '',
      completedDate: snapshot.completedDate || '',
      // If the host didn't tell us, assume the photo exists (it has a chit).
      completed:     (snapshot.completed != null) ? !!snapshot.completed : true,
      // Whether to render the QA sidebar. When false, the modal opens as a
      // plain big-photo viewer (preview only) — e.g. non-required install
      // photos that don't get QA served. Default true for backward compat
      // (existing callers, e.g. the install QA chit, expect the sidebar).
      needsQa:       (snapshot.needsQa != null) ? !!snapshot.needsQa : true,
      // Photo-add support (photo-edit-panel.js machinery): viewKey
      // resolves the per-scene DOC_photos save view for upload/clear PUTs.
      required:      !!snapshot.required,
      viewKey:       snapshot.viewKey || ''
    };

    _photoId = photoId;
    _initialState = {
      status:  photo.status,
      client:  photo.client,
      notes:   photo.notes,
      history: photo.history
    };
    _hasUnsavedChanges = false;
    _isSaving = false;
    _refreshHandler = (typeof onSaved === 'function')
      ? function (fields, p) { onSaved(fields, p); }
      : null;

    injectCSS();
    // The install (host-anchored) path opens as a CENTERED MODAL with a
    // large photo preview + the QA sidebar — mirrors the closeout FILES QA
    // modal. _popover points at the dialog (it owns the QA body/actions the
    // save routines query + the is-saving toggle via .scw-qa-modal).
    var built = buildModal(photo);
    var overlay = built.overlay;
    var dialog  = built.dialog;
    dialog._triggerChit = anchorEl;   // outside-click guard + refresh anchor
    dialog._overlay = overlay;
    // Backdrop click closes (autosaves) — like closeout's overlay handler.
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closePopover(false);
    });
    document.body.appendChild(overlay);
    _popover = dialog;
  }

  function positionPopover(pop, anchor) {
    var rect = anchor.getBoundingClientRect();
    var popW = pop.offsetWidth;
    var popH = pop.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var GAP = 6;

    // Prefer below the anchor; flip above if overflow.
    var top = rect.bottom + GAP + window.pageYOffset;
    if (rect.bottom + GAP + popH > vh && rect.top - GAP - popH > 0) {
      top = rect.top - GAP - popH + window.pageYOffset;
    }
    // Align right edge with anchor's right when space is tight,
    // otherwise align left edge.
    var left = rect.left + window.pageXOffset;
    if (left + popW > vw - 8) {
      left = Math.max(8, vw - popW - 8) + window.pageXOffset;
    }
    pop.style.top  = top  + 'px';
    pop.style.left = left + 'px';
  }

  function closePopover(skipAutosave) {
    if (!_popover) return;
    var finish = function () {
      if (_popover) {
        // Modal path mounts the dialog inside a full-screen overlay; remove
        // the overlay so the backdrop goes too. Docked path has no overlay.
        var toRemove = _popover._overlay || _popover;
        if (toRemove && toRemove.parentNode) toRemove.parentNode.removeChild(toRemove);
        _popover = null;
      }
      _photoId = null;
      _initialState = null;
      _hasUnsavedChanges = false;
      _refreshHandler = null;
    };
    if (skipAutosave) {
      finish();
    } else {
      autoSaveIfDirty(finish);
    }
  }

  // ── Event delegation ────────────────────────────────────────────

  $(document).off('click.scwQA').on('click.scwQA', '.scw-ws-req-photo-chit[data-photo-id]', function (e) {
    var state = this.getAttribute('data-photo-state');
    // "missing" chits use the existing inline-photo-row add flow,
    // which is wired by inline-photo-row.js on a different element.
    // Don't intercept those here.
    if (state === 'missing') return;
    e.stopPropagation();
    openForChit(this);
  });

  // Click outside closes (and autosaves)
  document.addEventListener('mousedown', function (e) {
    if (!_popover) return;
    if (_popover.contains(e.target)) return;
    if (e.target.closest('.scw-ws-req-photo-chit')) return;
    // V2 install photo-strip QA chit (openForAnchor host) — its own click
    // handler opens/positions the popover; don't let this fire first.
    if (e.target.closest('.scw-ws-v2-photo-qa-chit')) return;
    closePopover(false);
  }, true);

  // Escape closes without autosave
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _popover) {
      closePopover(true);
    }
  });

  // Expose for diagnostics
  window.SCW = window.SCW || {};
  SCW.qaPopover = {
    open:       openForChit,     // V1 chit path (reads worksheet source <tr>)
    openAnchor: openForAnchor,   // host-agnostic path (V2 install photo strip)
    close:      function () { closePopover(true); }
  };
})();
