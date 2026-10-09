/*** FEATURE: Share / Consolidate alternative SOWs (view_3869) ***/
/**
 * On the SOW page, view_3869 lists the OTHER SOWs on the same project. This
 * module adds, per row, an "Add (N) unique items" button (N = that SOW's line
 * items not yet on the current SOW, counted from view_3913 — a hidden grid of
 * every line item on the project; field_2154 is the multi-connection back to
 * the SOW headers) and, above the grid, a bar with two project-wide buttons.
 *
 * TWO INTENTS — every modal makes the user pick one and says what it leaves:
 *   SHARE        Link the selected items onto the current SOW. field_2154 is a
 *                multi-connection, so the source SOW keeps them: ONE line item
 *                on both SOWs, and edits / margin / pricing changes apply to
 *                both. The default (non-destructive) — the same idiom as the
 *                bid-review tray's "+ Add to this SOW" and Create Alternate
 *                SOW's link mode.
 *   CONSOLIDATE  Move EVERYTHING onto the current SOW and DELETE the source
 *                SOW(s), so the user ends up with one SOW. Knack drops a
 *                deleted record's connections, which is what makes the items
 *                end up on this SOW only. Offered ONLY when NO survey has been
 *                requested anywhere on the project (surveyBlockers: this SOW's
 *                field_2706, its project-wide count field_2728, any row in the
 *                SURVEY_requests grid view_4155, each source SOW's field_2706)
 *                — surveyed scope has bids hanging off it and must stay. The
 *                bulk Consolidate takes every
 *                other SOW on the project, including ones with nothing unique
 *                to add; the per-row one takes that row's SOW. The checklist
 *                locks to "everything" in this mode: a partial consolidate
 *                would orphan the unticked items when their SOW is deleted.
 *
 * Click fires the Make webhook at SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK
 * (contract in src/config.js): Make appends the receiving SOW's id to each
 * uniqueItemIds record's field_2154 and deletes deleteSourceIds. `mode`
 * ('share' | 'consolidate') names the intent. The button is never rendered on
 * the self-row (hidden by hide-self-row).
 */
(function () {
  'use strict';

  var TARGET_VIEW      = 'view_3869';
  var GATE_VIEW        = 'view_3827';   // SOW detail view on the same scene
  var LINE_ITEM_VIEW   = 'view_3913';   // Hidden grid of all SOW line items on this project
  var SOW_CONN_FIELD   = 'field_2154';  // SOW Header connection on a line item
  var ITEM_LABEL_FIELD = 'field_1950';  // Device label for a line item (e.g. "E-003"; blank on non-device items)
  var ITEM_PRODUCT_FIELD = 'field_1949'; // Product (connection) — fallback label for non-device line items
  var MDF_FIELD        = 'field_1946';  // MDF/IDF connection on a line item
  var BUCKET_FIELD     = 'field_2219';  // Proposal bucket connection
  var ASSUMPTIONS_BUCKET_ID = '697b7a023a31502ec68b3303';
  var SURVEY_FIELD     = 'field_2706';  // Yes/No: FLAG_survey requested on a SOW Header
  // Project-wide survey evidence (the gate for Consolidate — see surveyBlockers):
  var SURVEY_COUNT_FIELD = 'field_2728';  // on the SOW detail (view_3827): # of the project's
                                          // SOWs with a survey requested, THIS one included
  var SURVEY_REQS_VIEW   = 'view_4155';   // SURVEY_requests grid — one row per survey round
                                          // on the project (hidden; same source the stepper uses)
  var REQ_ID_FIELD       = 'field_2345';  // REQ_ID  (e.g. 61052838674-SR121)
  var REQ_STATUS_FIELD   = 'field_2349';  // FLAG_survey status (Submitted / …)
  var SOW_NAME_FIELD     = 'field_2126';  // SOW Name (view_3827) — for the blocker's label
  var BTN_MARKER     = 'scw-import-unique-items-btn';
  var BTN_LABEL      = 'Add unique items';
  var EVENT_NS       = '.scwImportUniqueItems';
  var COL_CLASS      = 'scw-import-unique-items-col';

  // sowId → Set<lineItemId>
  var sowToItems = null;
  var itemLabels = null;   // itemId → display label (field_1950)
  var itemMeta   = null;   // itemId → { mdfId, mdfLabel, isAssumption }
  var indexLoaded = 0;     // records actually loaded into the index
  var indexTotal  = null;  // view_3913's server-side total_records
  var indexTruncated = false;   // total > loaded → counts are WRONG

  var DOWNLOAD_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var CLOSE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" ' +
    'stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/>' +
    '<line x1="18" y1="6" x2="6" y2="18"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // Inject styles once.
  (function injectStyles() {
    if (document.getElementById('scw-import-unique-items-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-import-unique-items-css';
    s.textContent =
      '#' + TARGET_VIEW + ' th.' + COL_CLASS + ',' +
      '#' + TARGET_VIEW + ' td.' + COL_CLASS + ' {' +
      '  text-align: center; white-space: nowrap; padding: 4px 8px;' +
      '}' +
      '.' + BTN_MARKER + ' {' +
      '  display: flex; align-items: center; justify-content: center; gap: 6px;' +
      '  width: 100%;' +
      '  font-size: 12px; font-weight: 600;' +
      '  padding: 7px 10px; border-radius: 5px;' +
      '  background: #163C6E; color: #fff !important;' +
      '  border: 1px solid #163C6E; cursor: pointer;' +
      '  line-height: 1.2; white-space: nowrap;' +
      '  transition: background 0.15s;' +
      '}' +
      '.' + BTN_MARKER + ':hover { background: #0f2d55; border-color: #0f2d55; }' +
      '.' + BTN_MARKER + '.is-loading {' +
      '  pointer-events: none; opacity: 0.7; cursor: wait;' +
      '}' +
      '.' + BTN_MARKER + '.is-loading svg {' +
      '  animation: scw-import-unique-spin 0.8s linear infinite;' +
      '}' +
      '.' + BTN_MARKER + '[data-mode="disabled"] {' +
      '  pointer-events: none; opacity: 0.5; cursor: default;' +
      '  background: #6b7280; border-color: #6b7280;' +
      '}' +
      '.' + BTN_MARKER + '.is-delete-only {' +
      '  background: #b91c1c; border-color: #991b1b;' +
      '}' +
      '.' + BTN_MARKER + '.is-delete-only:hover {' +
      '  background: #991b1b; border-color: #7f1d1d;' +
      '}' +
      '@keyframes scw-import-unique-spin { to { transform: rotate(360deg); } }' +

      // ── Bulk-import bar ──
      '.scw-iui-bulkbar {' +
      '  display: flex; justify-content: flex-end; align-items: center;' +
      '  gap: 10px; padding: 8px 0 12px;' +
      '}' +
      '.scw-iui-bulkbar-msg {' +
      '  font: 12px/1.4 system-ui, -apple-system, sans-serif;' +
      '  color: #6b7280;' +
      '}' +
      '.scw-iui-bulkbar-btn {' +
      '  display: inline-flex; align-items: center; gap: 6px;' +
      '  appearance: none; cursor: pointer;' +
      '  padding: 8px 14px; border-radius: 6px;' +
      '  font: 600 13px system-ui, sans-serif;' +
      '  background: #163C6E; color: #fff; border: 1px solid #163C6E;' +
      '  transition: background 0.15s, border-color 0.15s;' +
      '}' +
      '.scw-iui-bulkbar-btn:hover {' +
      '  background: #0f2d55; border-color: #0f2d55;' +
      '}' +
      '.scw-iui-bulkbar-btn[disabled] {' +
      '  background: #9ca3af; border-color: #9ca3af; cursor: default;' +
      '}' +
      '.scw-iui-bulkbar-btn.is-loading {' +
      '  pointer-events: none; opacity: 0.7; cursor: wait;' +
      '}' +
      '.scw-iui-bulkbar-btn.is-loading svg {' +
      '  animation: scw-import-unique-spin 0.8s linear infinite;' +
      '}' +
      '.scw-iui-bulkbar-btn--consolidate {' +
      '  background: #b91c1c; border-color: #991b1b;' +
      '}' +
      '.scw-iui-bulkbar-btn--consolidate:hover {' +
      '  background: #991b1b; border-color: #7f1d1d;' +
      '}' +
      /* Blocked (a survey is requested somewhere): still clickable so the
         reason can be shown, but reads as unavailable. */
      '.scw-iui-bulkbar-btn.is-blocked,' +
      '.scw-iui-bulkbar-btn.is-blocked:hover {' +
      '  background: #fff; color: #6b7280; border-color: #d1d5db;' +
      '  cursor: not-allowed;' +
      '}' +

      // ── Confirm modal ──
      '.scw-iui-overlay {' +
      '  position: fixed; inset: 0; z-index: 100000;' +
      '  background: rgba(15, 23, 42, 0.55);' +
      '  display: flex; align-items: center; justify-content: center;' +
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;' +
      '}' +
      '.scw-iui-card {' +
      '  background: #fff; border-radius: 10px;' +
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);' +
      '  width: 440px; max-width: calc(100vw - 32px);' +
      '  overflow: hidden;' +
      '}' +
      '.scw-iui-body {' +
      '  padding: 22px 24px 18px;' +
      '}' +
      '.scw-iui-msg {' +
      '  font-size: 16px; font-weight: 700; color: #111827;' +
      '  margin: 0 0 6px;' +
      '}' +
      '.scw-iui-sub {' +
      '  font-size: 13px; color: #4b5563; margin: 0 0 16px;' +
      '}' +
      '.scw-iui-sub strong { color: #111827; }' +
      '.scw-iui-source {' +
      '  display: block; margin-top: 4px; color: #6b7280;' +
      '  font-size: 12px; word-break: break-word;' +
      '}' +
      // ── Share / Consolidate tiles ──
      '.scw-iui-modes {' +
      '  display: flex; flex-direction: column; gap: 8px; margin-top: 4px;' +
      '}' +
      '.scw-iui-mode {' +
      '  display: flex; align-items: flex-start; gap: 10px;' +
      '  padding: 10px 12px; border: 1px solid #e5e7eb;' +
      '  border-radius: 8px; cursor: pointer; background: #fff;' +
      '  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;' +
      '}' +
      '.scw-iui-mode:hover { background: #f9fafb; }' +
      '.scw-iui-mode.is-selected {' +
      '  border-color: #163C6E; background: #f0f5fb;' +
      '  box-shadow: inset 0 0 0 1px #163C6E;' +
      '}' +
      '.scw-iui-mode--danger.is-selected {' +
      '  border-color: #b91c1c; background: #fef2f2;' +
      '  box-shadow: inset 0 0 0 1px #b91c1c;' +
      '}' +
      '.scw-iui-mode.is-blocked {' +
      '  cursor: not-allowed; background: #f9fafb; opacity: 0.8;' +
      '}' +
      '.scw-iui-mode input {' +
      '  margin: 2px 0 0; flex: 0 0 auto;' +
      '  width: 16px; height: 16px; cursor: pointer;' +
      '  accent-color: #163C6E;' +
      '}' +
      '.scw-iui-mode--danger input { accent-color: #b91c1c; }' +
      '.scw-iui-mode.is-blocked input { cursor: not-allowed; }' +
      '.scw-iui-mode-text {' +
      '  display: flex; flex-direction: column; gap: 2px;' +
      '  font-size: 13px; color: #1f2937; line-height: 1.45;' +
      '}' +
      '.scw-iui-mode-title { font-weight: 700; }' +
      '.scw-iui-mode--danger .scw-iui-mode-title { color: #b91c1c; }' +
      '.scw-iui-mode.is-blocked .scw-iui-mode-title { color: #6b7280; }' +
      '.scw-iui-mode-hint { color: #6b7280; font-size: 12px; }' +
      '.scw-iui-note {' +
      '  font-size: 12px; color: #6b7280; line-height: 1.45;' +
      '  padding: 10px 12px; border-radius: 6px;' +
      '  background: #f3f4f6; border: 1px solid #e5e7eb;' +
      '}' +
      '.scw-iui-items {' +
      '  margin-bottom: 14px; border: 1px solid #e5e7eb;' +
      '  border-radius: 8px; overflow: hidden;' +
      '}' +
      '.scw-iui-items-header {' +
      '  display: flex; align-items: center; justify-content: space-between;' +
      '  padding: 8px 12px; background: #f9fafb;' +
      '  border-bottom: 1px solid #e5e7eb;' +
      '  font-size: 12px; color: #4b5563; font-weight: 600;' +
      '}' +
      '.scw-iui-link {' +
      '  appearance: none; background: none; border: none; padding: 0;' +
      '  color: #163C6E; font: 600 12px system-ui, sans-serif;' +
      '  cursor: pointer; text-decoration: underline;' +
      '}' +
      '.scw-iui-link:hover { color: #0f2d55; }' +
      '.scw-iui-items-list {' +
      '  max-height: 240px; overflow-y: auto;' +
      '}' +
      '.scw-iui-group-header {' +
      '  padding: 6px 12px; background: #f3f4f6;' +
      '  font: 600 11px system-ui, sans-serif;' +
      '  color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em;' +
      '  border-top: 1px solid #e5e7eb;' +
      '}' +
      '.scw-iui-items-list .scw-iui-group-header:first-child { border-top: 0; }' +
      '.scw-iui-item {' +
      '  display: flex; align-items: center; gap: 10px;' +
      '  padding: 6px 12px; cursor: pointer;' +
      '  border-top: 1px solid #f3f4f6;' +
      '  font-size: 13px; color: #1f2937;' +
      '}' +
      '.scw-iui-item:hover { background: #f9fafb; }' +
      '.scw-iui-item input {' +
      '  margin: 0; width: 15px; height: 15px;' +
      '  accent-color: #163C6E; cursor: pointer; flex: 0 0 auto;' +
      '}' +
      '.scw-iui-item-label {' +
      '  flex: 1; min-width: 0;' +
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
      '}' +
      /* Consolidate locks the checklist: everything moves. */
      '.scw-iui-items.is-locked .scw-iui-item { cursor: default; }' +
      '.scw-iui-items.is-locked .scw-iui-item input { accent-color: #9ca3af; }' +
      '.scw-iui-items.is-locked .scw-iui-toggle-all { display: none; }' +
      '.scw-iui-footer {' +
      '  display: flex; justify-content: flex-end; gap: 8px;' +
      '  padding: 14px 20px;' +
      '  background: #f9fafb; border-top: 1px solid #e5e7eb;' +
      '}' +
      '.scw-iui-btn {' +
      '  appearance: none; cursor: pointer;' +
      '  padding: 9px 18px; border-radius: 6px; min-width: 96px;' +
      '  font: 600 13px system-ui, sans-serif;' +
      '  border: 1px solid transparent;' +
      '}' +
      '.scw-iui-btn--cancel {' +
      '  background: #fff; color: #1f2937; border-color: #d1d5db;' +
      '}' +
      '.scw-iui-btn--cancel:hover { background: #f3f4f6; }' +
      '.scw-iui-btn--primary {' +
      '  background: #163C6E; color: #fff; border-color: #163C6E;' +
      '}' +
      '.scw-iui-btn--primary:hover { background: #0f2d55; border-color: #0f2d55; }' +
      '.scw-iui-btn--primary.is-delete {' +
      '  background: #b91c1c; border-color: #991b1b;' +
      '}' +
      '.scw-iui-btn--primary.is-delete:hover {' +
      '  background: #991b1b; border-color: #7f1d1d;' +
      '}' +
      '.scw-iui-btn--primary:disabled,' +
      '.scw-iui-btn--primary[disabled] {' +
      '  background: #9ca3af; border-color: #9ca3af; cursor: default;' +
      '}';
    document.head.appendChild(s);
  })();

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Render a checklist of items inside a modal's body. Returns an object
  // with helpers the modal can call to read the current selection.
  //   groups: [{ token, items: [{id, label}] }]
  //   When passed a single group, no group header is rendered.
  function renderItemChecklist(container, groups, onChange) {
    var totalCount = 0;
    var defaultSelectedCount = 0;
    groups.forEach(function (g) {
      totalCount += g.items.length;
      g.items.forEach(function (it) {
        if (it.defaultChecked !== false) defaultSelectedCount++;
      });
    });
    var showGroupHeaders = groups.length > 1 ||
      (groups.length === 1 && groups[0].token);

    var html =
      '<div class="scw-iui-items">' +
        '<div class="scw-iui-items-header">' +
          '<span class="scw-iui-items-count">' +
            defaultSelectedCount + ' of ' + totalCount + ' selected' +
          '</span>' +
          '<button type="button" class="scw-iui-link scw-iui-toggle-all">' +
            (defaultSelectedCount === totalCount ? 'Deselect all' : 'Select all') +
          '</button>' +
        '</div>' +
        '<div class="scw-iui-items-list">';
    groups.forEach(function (g) {
      if (showGroupHeaders) {
        html += '<div class="scw-iui-group-header">' +
          escapeHtml(g.token || 'Source') +
          ' &middot; ' + g.items.length +
          ' item' + (g.items.length === 1 ? '' : 's') +
          '</div>';
      }
      g.items.forEach(function (item) {
        var checked = (item.defaultChecked !== false) ? ' checked' : '';
        html += '<label class="scw-iui-item">' +
          '<input type="checkbox" class="scw-iui-item-cb" ' +
            'data-item-id="' + escapeHtml(item.id) + '"' + checked + '>' +
          '<span class="scw-iui-item-label" title="' + escapeHtml(item.label) + '">' +
            escapeHtml(item.label) +
          '</span>' +
        '</label>';
      });
    });
    html += '</div></div>';
    container.insertAdjacentHTML('beforeend', html);

    var listEl   = container.querySelector('.scw-iui-items');
    var countEl  = listEl.querySelector('.scw-iui-items-count');
    var toggleEl = listEl.querySelector('.scw-iui-toggle-all');
    var checkboxes = listEl.querySelectorAll('.scw-iui-item-cb');

    function getSelectedIds() {
      var ids = [];
      for (var i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) ids.push(checkboxes[i].getAttribute('data-item-id'));
      }
      return ids;
    }

    function syncHeader() {
      var sel = getSelectedIds();
      countEl.textContent = sel.length + ' of ' + totalCount + ' selected';
      toggleEl.textContent = sel.length === totalCount ? 'Deselect all' : 'Select all';
      if (typeof onChange === 'function') onChange(sel);
    }

    toggleEl.addEventListener('click', function () {
      var anyUnchecked = false;
      for (var i = 0; i < checkboxes.length; i++) {
        if (!checkboxes[i].checked) { anyUnchecked = true; break; }
      }
      var nextState = anyUnchecked; // if any unchecked → select all; else → deselect all
      for (var j = 0; j < checkboxes.length; j++) checkboxes[j].checked = nextState;
      syncHeader();
    });
    listEl.addEventListener('change', function (e) {
      if (e.target && e.target.classList.contains('scw-iui-item-cb')) syncHeader();
    });

    // Consolidate locks the list: every item is going (a partial consolidate
    // would orphan the unticked rows the moment their SOW is deleted). The
    // user's share-mode selection is remembered and restored on unlock.
    var remembered = null;
    function setLocked(locked) {
      if (locked) {
        if (remembered === null) remembered = getSelectedIds();
        for (var a = 0; a < checkboxes.length; a++) {
          checkboxes[a].checked = true;
          checkboxes[a].disabled = true;
        }
        listEl.classList.add('is-locked');
        countEl.textContent = 'All ' + totalCount + ' item' +
          (totalCount === 1 ? '' : 's') + ' move';
      } else {
        for (var b = 0; b < checkboxes.length; b++) {
          checkboxes[b].disabled = false;
          if (remembered) {
            checkboxes[b].checked =
              remembered.indexOf(checkboxes[b].getAttribute('data-item-id')) !== -1;
          }
        }
        remembered = null;
        listEl.classList.remove('is-locked');
        syncHeader();
      }
    }

    return {
      getSelectedIds: getSelectedIds,
      setLocked:      setLocked,
      total:          totalCount
    };
  }

  // Returns { token, full }. token = "SW-####" if found in the row text,
  // otherwise the first short cell. full = the verbose row label (for the
  // smaller subtitle line).
  function getRowLabel(tr) {
    if (!tr) return { token: '', full: '' };
    var full = '';
    var cells = tr.querySelectorAll('td:not(.' + COL_CLASS + ')');
    for (var i = 0; i < cells.length; i++) {
      var txt = (cells[i].textContent || '').trim().replace(/\s+/g, ' ');
      if (txt && !full) full = txt;
      var m = txt.match(/\bSW-\d+\b/);
      if (m) return { token: m[0], full: full || txt };
    }
    return { token: full || tr.id || '', full: full };
  }

  // ── Share / Consolidate tiles (shared by both modals) ───────────────
  // The two intents look identical on the page afterwards except for what
  // is left behind, so each tile spells that out.
  //   opts.sourceLabel  what keeps the items in share mode ("SW-1334")
  //   opts.deleteLabel  what consolidate deletes ("SW-1334" / "3 SOWs (…)")
  //   opts.blockers     tokens of surveyed SOWs — non-empty renders the
  //                     consolidate tile disabled with the reason
  //   opts.initialMode  'share' (default) | 'consolidate' (pre-selected when
  //                     not blocked)
  function modeTilesHtml(opts) {
    opts = opts || {};
    var blockers    = opts.blockers || [];
    var blocked     = blockers.length > 0;
    var sourceLabel = escapeHtml(opts.sourceLabel || 'The other SOW');
    var deleteLabel = escapeHtml(opts.deleteLabel || opts.sourceLabel || 'the other SOW');
    var startConsolidate = !blocked && opts.initialMode === 'consolidate';
    return (
      '<div class="scw-iui-modes">' +
        '<label class="scw-iui-mode' + (startConsolidate ? '' : ' is-selected') + '">' +
          '<input type="radio" name="scw-iui-mode" value="share"' +
            (startConsolidate ? '' : ' checked') + '>' +
          '<span class="scw-iui-mode-text">' +
            '<span class="scw-iui-mode-title">Share — add the selected items to this SOW</span>' +
            '<span class="scw-iui-mode-hint">' + sourceLabel + ' keeps them too: one line item ' +
              'on both SOWs, so edits, margin and pricing changes apply to both.</span>' +
          '</span>' +
        '</label>' +
        '<label class="scw-iui-mode scw-iui-mode--danger' +
            (blocked ? ' is-blocked' : (startConsolidate ? ' is-selected' : '')) + '">' +
          '<input type="radio" name="scw-iui-mode" value="consolidate"' +
            (blocked ? ' disabled' : (startConsolidate ? ' checked' : '')) + '>' +
          '<span class="scw-iui-mode-text">' +
            '<span class="scw-iui-mode-title">Consolidate — move everything here and delete ' +
              deleteLabel + '</span>' +
            '<span class="scw-iui-mode-hint">' +
              (blocked
                ? 'Unavailable: a survey has been requested on this project — ' +
                  escapeHtml(blockers.join('; ')) +
                  '. Surveyed scope has bids attached, so no SOW can be deleted from here.'
                : 'Every item moves onto this SOW (the whole list, not just the selection) and ' +
                  (opts.plural ? 'those SOWs are' : 'that SOW is') + ' deleted. This cannot be undone.') +
            '</span>' +
          '</span>' +
        '</label>' +
      '</div>');
  }

  // Which tile is picked right now ('share' when nothing is).
  function currentMode(overlay) {
    var r = overlay.querySelector('input[name="scw-iui-mode"]:checked');
    return (r && r.value) || 'share';
  }

  // Wire the tiles: highlight the picked one, lock the checklist in
  // consolidate mode, and let the modal re-sync its button + copy.
  function bindModeTiles(overlay, checklist, onChange) {
    var radios = overlay.querySelectorAll('input[name="scw-iui-mode"]');
    function apply() {
      var m = currentMode(overlay);
      for (var i = 0; i < radios.length; i++) {
        var tile = radios[i].closest('.scw-iui-mode');
        if (tile) tile.classList.toggle('is-selected', !!radios[i].checked);
      }
      if (checklist && typeof checklist.setLocked === 'function') {
        checklist.setLocked(m === 'consolidate');
      }
      if (typeof onChange === 'function') onChange();
    }
    for (var r = 0; r < radios.length; r++) radios[r].addEventListener('change', apply);
    apply();
  }

  // Per-row confirm. Resolves with { action: 'cancel'|'share'|'consolidate',
  // selectedIds } — in consolidate mode selectedIds is every unique item.
  //   opts.blockers         labels from surveyBlockers — non-empty disables
  //                         consolidate (opts.surveyRequested: true is the
  //                         one-SOW shorthand)
  function showImportConfirm(opts) {
    return new Promise(function (resolve) {
      var tokenRaw  = opts.sourceToken || 'this SOW';
      var token     = escapeHtml(tokenRaw);
      var fullLabel = escapeHtml(opts.sourceFull || '');
      var showFull  = fullLabel && fullLabel !== opts.sourceToken;
      var items     = opts.items || [];
      var blockers  = (opts.blockers && opts.blockers.length)
        ? opts.blockers
        : (opts.surveyRequested ? [tokenRaw + ' — survey requested'] : []);
      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-body">' +
            '<div class="scw-iui-msg"></div>' +
            '<div class="scw-iui-sub">' +
              'Items on <strong>' + token + '</strong> that are not yet on the current SOW.' +
              (showFull ? '<span class="scw-iui-source">' + fullLabel + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="scw-iui-footer">' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--primary">Add</button>' +
          '</div>' +
        '</div>';

      var body       = overlay.querySelector('.scw-iui-body');
      var msgEl      = body.querySelector('.scw-iui-msg');
      var primaryBtn = overlay.querySelector('.scw-iui-btn--primary');

      var checklist = renderItemChecklist(body, [{ token: '', items: items }],
        function () { syncPrimary(); });
      body.insertAdjacentHTML('beforeend', modeTilesHtml({
        sourceLabel: tokenRaw, deleteLabel: tokenRaw, blockers: blockers, plural: false
      }));

      function syncPrimary() {
        var selCount = checklist.getSelectedIds().length;
        if (currentMode(overlay) === 'consolidate') {
          msgEl.textContent = 'Consolidate ' + tokenRaw + ' into this SOW?';
          primaryBtn.disabled = false;
          primaryBtn.classList.add('is-delete');
          primaryBtn.textContent = 'Consolidate & delete ' + tokenRaw;
        } else {
          msgEl.textContent = 'Add ' + selCount + ' unique item' +
            (selCount === 1 ? '' : 's') + '?';
          primaryBtn.disabled = selCount === 0;
          primaryBtn.classList.remove('is-delete');
          primaryBtn.textContent = 'Add';
        }
      }
      bindModeTiles(overlay, checklist, syncPrimary);

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({ action: answer, selectedIds: checklist.getSelectedIds() });
      }
      function confirmAction() {
        if (primaryBtn.disabled) return;
        close(currentMode(overlay));
      }
      function onKey(e) {
        if (e.key === 'Escape') close('cancel');
        else if (e.key === 'Enter') confirmAction();
      }

      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      primaryBtn.addEventListener('click', confirmAction);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      primaryBtn.focus();
    });
  }

  // Delete-only modal (count = 0 and survey not requested). Resolves with
  // {action: 'cancel'|'delete'}.
  function showDeleteConfirm(opts) {
    return new Promise(function (resolve) {
      var token     = escapeHtml(opts.sourceToken || 'this SOW');
      var fullLabel = escapeHtml(opts.sourceFull || '');
      var showFull  = fullLabel && fullLabel !== opts.sourceToken;
      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-body">' +
            '<div class="scw-iui-msg">Delete ' + token + '?</div>' +
            '<div class="scw-iui-sub">' +
              'There are no unique line items to add from <strong>' + token +
              '</strong>. Would you like to delete this SOW?' +
              (showFull ? '<span class="scw-iui-source">' + fullLabel + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="scw-iui-footer">' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--primary is-delete">Delete ' +
              token + '</button>' +
          '</div>' +
        '</div>';

      var primaryBtn = overlay.querySelector('.scw-iui-btn--primary');

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({ action: answer });
      }
      function onKey(e) {
        if (e.key === 'Escape') close('cancel');
        else if (e.key === 'Enter') close('delete');
      }

      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      primaryBtn.addEventListener('click', function () { close('delete'); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      // For destructive-only flow, focus Cancel so Enter doesn't auto-delete.
      var cancelBtn = overlay.querySelector('.scw-iui-btn--cancel');
      if (cancelBtn) cancelBtn.focus();
    });
  }

  function getReceivingSowId() {
    try {
      var v = Knack.views && Knack.views[GATE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* ignore */ }
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

  // Strip HTML + collapse whitespace.
  function cleanText(v) {
    if (v == null) return '';
    return String(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Human-readable label for a line-item record from view_3913's model.
  // Device label (field_1950) preferred; product name (field_1949) used as
  // fallback (and appended when both exist) so non-device line items don't
  // surface as raw record IDs in the modal.
  function recordLabel(rec) {
    var device = cleanText(rec[ITEM_LABEL_FIELD]);
    var product = '';
    var praw = rec[ITEM_PRODUCT_FIELD + '_raw'];
    if (Array.isArray(praw) && praw.length) {
      var names = [];
      for (var i = 0; i < praw.length; i++) {
        var n = praw[i] && cleanText(praw[i].identifier);
        if (n) names.push(n);
      }
      product = names.join(', ');
    }
    if (!product) product = cleanText(rec[ITEM_PRODUCT_FIELD]);
    if (device && product) return device + ' · ' + product;
    return device || product || '';
  }

  // Build sowId → Set<lineItemId> and itemId → label from view_3913's model.
  function buildSowIndex() {
    sowToItems = null;
    itemLabels = null;
    itemMeta   = null;
    try {
      var v = Knack.views && Knack.views[LINE_ITEM_VIEW];
      if (!v || !v.model || !v.model.data || !v.model.data.models) return;
      var models = v.model.data.models;

      // Truncation guard: the index only covers what LOADED (max
      // 1000/page). If the server-side total exceeds that, view_3913 is
      // holding line items beyond this project (missing Builder source
      // filter) and every count this feature shows is unreliable.
      var data = v.model.data;
      var total = data.total_records != null ? data.total_records
        : (data.pagination_meta && data.pagination_meta.total_records);
      indexLoaded = models.length;
      indexTotal  = (typeof total === 'number') ? total : null;
      indexTruncated = indexTotal !== null && indexTotal > indexLoaded;
      if (indexTruncated) {
        console.error('[scw-import-unique] ' + LINE_ITEM_VIEW + ' holds ' +
          indexTotal + ' line items but only ' + indexLoaded + ' loaded — ' +
          'unique-item counts are WRONG. The view needs a Builder source ' +
          'filter scoping it to THIS project\'s line items.');
      }
      var idx    = {};
      var labels = {};
      var meta   = {};
      for (var i = 0; i < models.length; i++) {
        var rec = models[i] && models[i].attributes;
        if (!rec || !rec.id) continue;

        var label = recordLabel(rec);
        if (label) labels[rec.id] = label;

        // MDF/IDF + bucket signal for the modal\'s grouping +
        // default-deselect-assumptions behavior.
        var mdfRaw = rec[MDF_FIELD + '_raw'];
        var mdfId = '', mdfLabel = '';
        if (Array.isArray(mdfRaw) && mdfRaw.length && mdfRaw[0]) {
          mdfId    = mdfRaw[0].id || '';
          mdfLabel = cleanText(mdfRaw[0].identifier) || '';
        }
        var bucketRaw = rec[BUCKET_FIELD + '_raw'];
        var bucketId = '';
        if (Array.isArray(bucketRaw) && bucketRaw.length && bucketRaw[0]) {
          bucketId = bucketRaw[0].id || '';
        }
        meta[rec.id] = {
          mdfId: mdfId,
          mdfLabel: mdfLabel,
          isAssumption: (bucketId === ASSUMPTIONS_BUCKET_ID)
        };

        var conns = rec[SOW_CONN_FIELD + '_raw'];
        if (!conns || !conns.length) continue;
        for (var j = 0; j < conns.length; j++) {
          var sowId = conns[j] && conns[j].id;
          if (!sowId) continue;
          if (!idx[sowId]) idx[sowId] = {};
          idx[sowId][rec.id] = 1;
        }
      }
      sowToItems = idx;
      itemLabels = labels;
      itemMeta   = meta;
    } catch (e) { /* ignore */ }
  }

  function getItemMeta(id) {
    return (itemMeta && itemMeta[id]) || { mdfId: '', mdfLabel: '', isAssumption: false };
  }

  function getItemLabel(itemId) {
    return (itemLabels && itemLabels[itemId]) || 'Untitled line item';
  }

  // Look up a SOW's "SW-####" token via the row in view_3869's DOM.
  function getSowToken(sowId) {
    if (!sowId) return '';
    var tr = document.querySelector(
      '#' + TARGET_VIEW + ' tr[id="' + sowId + '"]');
    if (tr) {
      var label = getRowLabel(tr);
      if (label.token) return label.token;
    }
    return sowId.substring(0, 6) + '…';
  }

  // Line items connected to sourceSowId that are NOT connected to receivingSowId.
  // Returns an array of record IDs (or null if the index hasn't been built yet).
  function uniqueItemsFor(sourceSowId, receivingSowId) {
    if (!sowToItems) return null;
    var src = sowToItems[sourceSowId];
    if (!src) return [];
    var rcv = sowToItems[receivingSowId] || {};
    var ids = [];
    for (var itemId in src) {
      if (Object.prototype.hasOwnProperty.call(src, itemId) && !rcv[itemId]) {
        ids.push(itemId);
      }
    }
    return ids;
  }

  function uniqueCountFor(sourceSowId, receivingSowId) {
    var ids = uniqueItemsFor(sourceSowId, receivingSowId);
    return ids === null ? null : ids.length;
  }

  // SOWs allowed to contribute items: the receiving SOW plus the rows
  // actually rendered in view_3869 (alternative SOWs on the SAME project).
  // view_3913's model can carry line items from OTHER projects (its
  // Builder source filter has drifted before) — without this guard, the
  // bar's Share / Consolidate would union other projects' SOWs into the
  // import (and Consolidate would try to delete them).
  function allowedSowIds() {
    var out = {};
    var rcv = getReceivingSowId();
    if (rcv) out[rcv] = 1;
    try {
      var v = Knack.views && Knack.views[TARGET_VIEW];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models) {
        for (var i = 0; i < models.length; i++) {
          var rec = models[i] && models[i].attributes;
          if (rec && rec.id) out[rec.id] = 1;
        }
      }
    } catch (e) { /* fall through to DOM */ }
    var rows = document.querySelectorAll('#' + TARGET_VIEW + ' tbody tr[id]');
    for (var j = 0; j < rows.length; j++) {
      if (/^[a-f0-9]{24}$/.test(rows[j].id)) out[rows[j].id] = 1;
    }
    return out;
  }

  // Union of unique item ids across every source SOW that has at least one
  // unique item relative to the receiving SOW. Splits contributing source
  // SOWs into delete-eligible (no survey requested) vs. blocked (survey
  // requested → cannot be auto-deleted). Returns
  //   { itemIds, sourceIds, deletableSourceIds, blockedSourceIds }
  // or null if the index hasn't been built yet.
  function aggregateAllUnique(receivingSowId) {
    if (!sowToItems || !receivingSowId) return null;
    var allowed = allowedSowIds();
    var rcv = sowToItems[receivingSowId] || {};
    var seen = {};
    var itemIds = [];
    var sourceIds = [];
    var deletableSourceIds = [];
    var blockedSourceIds   = [];
    for (var sowId in sowToItems) {
      if (!Object.prototype.hasOwnProperty.call(sowToItems, sowId)) continue;
      if (sowId === receivingSowId) continue;
      if (!allowed[sowId]) continue;   // other-project SOW — never import from it
      var items = sowToItems[sowId];
      var contributed = false;
      for (var itemId in items) {
        if (!Object.prototype.hasOwnProperty.call(items, itemId)) continue;
        if (rcv[itemId] || seen[itemId]) continue;
        seen[itemId] = 1;
        itemIds.push(itemId);
        contributed = true;
      }
      if (contributed) {
        sourceIds.push(sowId);
        if (isSurveyRequested(sowId)) blockedSourceIds.push(sowId);
        else                          deletableSourceIds.push(sowId);
      }
    }
    return {
      itemIds:            itemIds,
      sourceIds:          sourceIds,
      deletableSourceIds: deletableSourceIds,
      blockedSourceIds:   blockedSourceIds
    };
  }

  // A change order is a SOW subtype (field_2952 Type = "change order",
  // CLAUDE.md "Change Orders"). It must never be swept up by Consolidate —
  // deleting a signed CO's header is unrecoverable — so when view_3869
  // exposes field_2952 those rows are excluded from the source set and
  // reported back as kept. When the column is NOT on the view this cannot
  // tell, so Builder should either expose field_2952 on view_3869 or filter
  // change orders out of it.
  var SOW_TYPE_FIELD = 'field_2952';
  function isChangeOrderSow(sowId) {
    try {
      var v = Knack.views && Knack.views[TARGET_VIEW];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return false;
      for (var i = 0; i < models.length; i++) {
        var rec = models[i] && models[i].attributes;
        if (!rec || rec.id !== sowId) continue;
        var raw = rec[SOW_TYPE_FIELD + '_raw'];
        var txt = (raw != null && typeof raw !== 'object') ? String(raw) : String(rec[SOW_TYPE_FIELD] || '');
        return /change\s*order/i.test(txt.replace(/<[^>]+>/g, ''));
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  // Consolidate's scope: EVERY other SOW on the project (view_3869's rows —
  // allowedSowIds minus the receiving SOW), whether or not it has anything
  // unique to add, because the point is ending up with ONE SOW. Change-order
  // SOWs are kept (see isChangeOrderSow). Returns
  //   { sourceIds, itemIds (every unique item, deduped), blockedSourceIds
  //     (source SOWs with their own survey flag), surveyBlockers (EVERY
  //     reason consolidate is unavailable, project-wide — see
  //     surveyBlockers; empty = allowed), coKeptIds, perSow: sowId → [itemIds] }
  // or null before the index is built.
  function aggregateConsolidate(receivingSowId) {
    if (!sowToItems || !receivingSowId) return null;
    var allowed = allowedSowIds();
    var rcv = sowToItems[receivingSowId] || {};
    var seen = {};
    var itemIds = [], sourceIds = [], blockedSourceIds = [], coKeptIds = [];
    var perSow = {};
    for (var sowId in allowed) {
      if (!Object.prototype.hasOwnProperty.call(allowed, sowId)) continue;
      if (sowId === receivingSowId) continue;
      if (isChangeOrderSow(sowId)) { coKeptIds.push(sowId); continue; }
      sourceIds.push(sowId);
      perSow[sowId] = [];
      var items = sowToItems[sowId] || {};
      for (var itemId in items) {
        if (!Object.prototype.hasOwnProperty.call(items, itemId)) continue;
        if (rcv[itemId]) continue;
        perSow[sowId].push(itemId);
        if (seen[itemId]) continue;
        seen[itemId] = 1;
        itemIds.push(itemId);
      }
      if (isSurveyRequested(sowId)) blockedSourceIds.push(sowId);
    }
    return {
      sourceIds:        sourceIds,
      itemIds:          itemIds,
      blockedSourceIds: blockedSourceIds,
      surveyBlockers:   surveyBlockers(receivingSowId, sourceIds),
      coKeptIds:        coKeptIds,
      perSow:           perSow
    };
  }

  // ── Consolidate gate: "no survey requested anywhere on this project" ──
  // Consolidate deletes SOW headers, and a SOW with a survey has bids and
  // survey records hanging off it. So it is offered only when NO survey has
  // been requested anywhere on the project — not just on the SOWs being
  // deleted. Every signal the SOW page carries is checked, because each
  // one alone has blind spots (a legacy round has no REQ row; the alt grid
  // may not expose field_2706; the receiving SOW is not in the alt grid):
  //   1. this SOW's own FLAG_survey requested (field_2706, view_3827)
  //   2. field_2728 on this SOW — the project's count of SOWs with a survey
  //      requested, this one included
  //   3. the SURVEY_requests grid (view_4155): any survey round on the project
  //   4. each source SOW's own field_2706 (view_3869 rows)
  // Returns [{ id, label }], one per distinct reason; empty = allowed.
  function surveyBlockers(receivingSowId, sourceIds) {
    var out = [], seen = {};
    function add(id, label) {
      if (seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, label: label });
    }
    function truthy(v) {
      if (v === true) return true;
      var t = String(v == null ? '' : v).replace(/<[^>]+>/g, '').trim().toLowerCase();
      return t === 'yes' || t === 'true' || t === '1';
    }
    // 1 + 2 — the receiving SOW's detail record.
    try {
      var gv = Knack.views && Knack.views[GATE_VIEW];
      var attrs = gv && gv.model && gv.model.attributes;
      if (attrs) {
        var selfName = cleanText(attrs[SOW_NAME_FIELD]);
        var selfTok  = (selfName.match(/\bSW-?\d+(?:CO)?\b/i) || [])[0] || selfName || 'this SOW';
        if (truthy(attrs[SURVEY_FIELD]) || truthy(attrs[SURVEY_FIELD + '_raw'])) {
          add('self', selfTok + ' (this SOW) — survey requested');
        }
        var cntRaw = attrs[SURVEY_COUNT_FIELD + '_raw'];
        var cnt = parseFloat((cntRaw != null && typeof cntRaw !== 'object')
          ? cntRaw : cleanText(attrs[SURVEY_COUNT_FIELD]).replace(/[^0-9.\-]/g, ''));
        if (cnt > 0) {
          add('count', cnt + ' SOW' + (cnt === 1 ? '' : 's') + ' on this project ' +
            (cnt === 1 ? 'has' : 'have') + ' a survey requested');
        }
      }
    } catch (e) { /* no evidence from the detail view */ }
    // 3 — survey rounds on the project.
    try {
      var rv = Knack.views && Knack.views[SURVEY_REQS_VIEW];
      var rounds = (rv && rv.model && rv.model.data && rv.model.data.models) || [];
      for (var r = 0; r < rounds.length; r++) {
        var a = rounds[r] && (rounds[r].attributes || rounds[r]);
        if (!a || !a.id) continue;
        var reqId  = cleanText(a[REQ_ID_FIELD]) || a.id;
        var status = cleanText(a[REQ_STATUS_FIELD]);
        add('req:' + a.id, 'survey request ' + reqId + (status ? ' (' + status + ')' : ''));
      }
    } catch (e) { /* view absent — no evidence */ }
    // 4 — the source SOWs' own flags.
    var ids = sourceIds || [];
    for (var i = 0; i < ids.length; i++) {
      if (isSurveyRequested(ids[i])) add('sow:' + ids[i], getSowToken(ids[i]) + ' — survey requested');
    }
    return out;
  }

  // Read field_2706 (FLAG_survey requested) for a row in view_3869. Returns
  // true only when the value is explicitly Yes / true. Falls back to a DOM
  // scrape of the row when the model isn't yet populated.
  function isSurveyRequested(sourceSowId, tr) {
    function truthy(v) {
      if (v === true) return true;
      var s = String(v == null ? '' : v).trim().toLowerCase();
      return s === 'yes' || s === 'true' || s === '1';
    }
    try {
      var v = Knack.views && Knack.views[TARGET_VIEW];
      if (v && v.model && v.model.data && v.model.data.models) {
        var models = v.model.data.models;
        for (var i = 0; i < models.length; i++) {
          var rec = models[i] && models[i].attributes;
          if (!rec || rec.id !== sourceSowId) continue;
          if (truthy(rec[SURVEY_FIELD])) return true;
          if (truthy(rec[SURVEY_FIELD + '_raw'])) return true;
          return false;
        }
      }
    } catch (e) { /* ignore */ }
    if (tr) {
      var cell = tr.querySelector('td.' + SURVEY_FIELD);
      if (cell) return truthy(cell.textContent);
    }
    return false;
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.classList.add('is-loading');
      setBtnIcon(btn, SPINNER_SVG);
    } else {
      btn.classList.remove('is-loading');
      setBtnIcon(btn,
        btn.getAttribute('data-mode') === 'delete-only' ? CLOSE_SVG : DOWNLOAD_SVG);
    }
  }

  function setBtnIcon(btn, svg) {
    var iconSpan = btn.querySelector('.scw-import-unique-items-icon');
    if (iconSpan) iconSpan.innerHTML = svg;
  }

  function setBtnLabel(btn, sourceRecordId) {
    var labelSpan = btn.querySelector('.scw-import-unique-items-label');
    if (!labelSpan) return;
    var rcv   = getReceivingSowId();
    var count = (rcv && sourceRecordId) ? uniqueCountFor(sourceRecordId, rcv) : null;
    var tr    = btn.closest('tr[id]');
    var label = getRowLabel(tr);
    var token = label.token || 'this SOW';

    btn.classList.remove('is-delete-only');

    if (count === null) {
      // Index not built yet — show neutral pre-load label.
      labelSpan.textContent = BTN_LABEL;
      btn.removeAttribute('data-unique-count');
      btn.setAttribute('data-mode', 'pending');
      btn.title = 'Loading…';
      setBtnIcon(btn, DOWNLOAD_SVG);
      return;
    }

    btn.setAttribute('data-unique-count', String(count));

    if (count > 0) {
      labelSpan.textContent = 'Add (' + count + ') unique item' +
        (count === 1 ? '' : 's');
      btn.setAttribute('data-mode', 'import');
      btn.title = 'Add ' + count + ' item' + (count === 1 ? '' : 's') +
        ' from ' + token + ' not already on the current SOW — shared, or consolidated; you choose next';
      setBtnIcon(btn, DOWNLOAD_SVG);
      return;
    }

    // count === 0 — the only thing left to offer is deleting the SOW, which
    // is a consolidate: gated on the same project-wide survey rule.
    var blockers = surveyBlockers(rcv, [sourceRecordId]);
    if (blockers.length) {
      labelSpan.textContent = '0 unique · survey requested';
      btn.setAttribute('data-mode', 'disabled');
      btn.title = 'No unique items, and a survey has been requested on this project (' +
        blockers.map(function (b) { return b.label; }).join('; ') +
        ') — no SOW can be deleted from here.';
      setBtnIcon(btn, DOWNLOAD_SVG);
    } else {
      labelSpan.textContent = 'Delete ' + token;
      btn.setAttribute('data-mode', 'delete-only');
      btn.classList.add('is-delete-only');
      btn.title = 'No unique items to add. Delete ' + token + '.';
      setBtnIcon(btn, CLOSE_SVG);
    }
  }

  function refreshAllBtnLabels() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var btns = viewEl.querySelectorAll('.' + BTN_MARKER);
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var tr  = btn.closest('tr[id]');
      if (!tr) continue;
      setBtnLabel(btn, tr.id);
    }
  }

  // Per-row flow. mode: 'share' (link the user's selection, source SOW kept)
  // | 'consolidate' (link EVERY unique item, then delete the source SOW).
  // explicitItemIds is the share-mode selection; consolidate ignores it and
  // sends the full unique set, because a partial consolidate orphans items.
  function fireWebhook(btn, sourceRecordId, mode, explicitItemIds) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Import-unique-items webhook URL is not configured.');
      return;
    }
    var receivingRecordId = getReceivingSowId();
    if (!receivingRecordId) {
      alert('Could not determine current SOW record ID.');
      return;
    }
    if (!sourceRecordId) {
      alert('Could not determine source SOW record ID.');
      return;
    }
    if (receivingRecordId === sourceRecordId) {
      alert('Source and receiving SOW are the same — nothing to add.');
      return;
    }
    var consolidate = (mode === 'consolidate');
    if (consolidate) {
      var rowBlockers = surveyBlockers(receivingRecordId, [sourceRecordId]);
      if (rowBlockers.length) {
        alert('Consolidate is unavailable: a survey has been requested on this project — ' +
          rowBlockers.map(function (b) { return b.label; }).join('; ') +
          '. No SOW can be deleted from here.');
        return;
      }
    }

    var allUnique = uniqueItemsFor(sourceRecordId, receivingRecordId) || [];
    var uniqueItemIds = (!consolidate && explicitItemIds && explicitItemIds.length)
      ? explicitItemIds
      : allUnique;
    postWebhook(btn, {
      mode:                    consolidate ? 'consolidate' : 'share',
      receivingRecordId:       receivingRecordId,
      sourceRecordId:          sourceRecordId,
      sourceRecordIds:         [sourceRecordId],
      uniqueItemIds:           uniqueItemIds,
      deleteSourceIds:         consolidate ? [sourceRecordId] : [],
      deleteSourceAfterImport: consolidate,
      bulk:                    false,
      triggeredBy:             getTriggeredBy()
    });
  }

  // Bulk flow. share → the union of unique items across the contributing
  // SOWs (user-trimmed), nothing deleted. consolidate → EVERY other SOW on
  // the project is a source (even one with nothing unique to add), every
  // unique item is linked, and every source SOW is deleted. Refused when any
  // source SOW has a survey requested — the bar's button is already blocked
  // then; this is the belt to that suspender.
  function fireBulkWebhook(btn, mode, explicitItemIds) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Import-unique-items webhook URL is not configured.');
      return;
    }
    var receivingRecordId = getReceivingSowId();
    if (!receivingRecordId) {
      alert('Could not determine current SOW record ID.');
      return;
    }
    var consolidate = (mode === 'consolidate');
    // Same scope for both modes — every other non-change-order SOW on the
    // project (aggregateConsolidate). Share reports only the SOWs that
    // actually contribute an item; consolidate names them all.
    var agg = aggregateConsolidate(receivingRecordId);
    if (!agg) {
      alert('Line items are still loading — try again in a moment.');
      return;
    }
    if (!consolidate && !agg.itemIds.length) {
      alert('No unique items to add.');
      return;
    }
    var contributing = contributingSources(agg);
    if (consolidate && !agg.sourceIds.length) {
      alert('There are no other SOWs on this project to consolidate.');
      return;
    }
    if (consolidate && agg.surveyBlockers.length) {
      alert('Consolidate is unavailable: a survey has been requested on this project — ' +
        agg.surveyBlockers.map(function (b) { return b.label; }).join('; ') +
        '. No SOW can be deleted from here.');
      return;
    }
    var uniqueItemIds = (!consolidate && explicitItemIds && explicitItemIds.length)
      ? explicitItemIds
      : agg.itemIds;
    postWebhook(btn, {
      mode:                    consolidate ? 'consolidate' : 'share',
      receivingRecordId:       receivingRecordId,
      sourceRecordId:          null,
      sourceRecordIds:         consolidate ? agg.sourceIds : contributing,
      uniqueItemIds:           uniqueItemIds,
      deleteSourceIds:         consolidate ? agg.sourceIds : [],
      deleteSourceAfterImport: consolidate,
      bulk:                    true,
      triggeredBy:             getTriggeredBy()
    }, /*isBulk=*/true);
  }

  // Shared POST + response handling. `isBulk` only changes the loading
  // visual treatment (the per-row buttons have their own spinner swap).
  function postWebhook(btn, payload, isBulk) {
    var url = SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK;
    console.log('[scw-import-unique] POST', url, payload);
    if (isBulk) {
      btn.classList.add('is-loading');
      btn.disabled = true;
    } else {
      setBtnLoading(btn, true);
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      return resp.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { /* plain-text body */ }
        console.log('[scw-import-unique] response HTTP ' + resp.status + ':', text);
        // Success = HTTP 2xx and the body doesn't explicitly report
        // failure. Make webhooks answer plain-text "Accepted" by default
        // (no JSON at all) — that IS a successful hand-off; requiring
        // {success:true} made every such run alert "Failed to import".
        var failed = !resp.ok ||
          (data && data.success === false) ||
          (data && data.error);
        if (!failed) {
          // Make writes the field_2154 connections AFTER responding —
          // an immediate reload races those PUTs and repaints the page
          // unchanged ("the button did nothing"). Give the scenario a
          // beat to land before refreshing; spinners stay on meanwhile.
          setTimeout(function () { window.location.reload(); }, 3000);
          return;
        }
        if (isBulk) { btn.classList.remove('is-loading'); btn.disabled = false; }
        else setBtnLoading(btn, false);
        alert('Import failed (HTTP ' + resp.status + '): ' +
          ((data && (data.error || data.message)) || text || 'no response body'));
      });
    }).catch(function (err) {
      console.error('[scw-import-unique] webhook error', err);
      if (isBulk) { btn.classList.remove('is-loading'); btn.disabled = false; }
      else setBtnLoading(btn, false);
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // ── Bulk modal ───────────────────────────────────────────
  // One modal for both bar buttons; `initialMode` pre-selects the tile the
  // button named. Resolves with { action: 'cancel'|'share'|'consolidate',
  // selectedIds } — in consolidate mode selectedIds is every item listed.
  //   opts.groups        [{ token, items: [{id, label, defaultChecked}] }] by MDF/IDF
  //   opts.sourceCount   contributing SOWs (share copy)
  //   opts.allSources    every other SOW on the project (consolidate copy): [{ id, token }]
  //   opts.blockers      tokens of surveyed SOWs (consolidate disabled when non-empty)
  //   opts.coKeptCount   change-order SOWs consolidate leaves alone
  function showBulkConfirm(opts) {
    return new Promise(function (resolve) {
      var groups      = opts.groups || [];
      var sourceCount = opts.sourceCount || 0;
      var allSources  = opts.allSources || [];
      var blockers    = opts.blockers || [];
      var coKept      = opts.coKeptCount || 0;
      var totalItems  = 0;
      groups.forEach(function (g) { totalItems += g.items.length; });
      var nAll       = allSources.length;
      var sourceList = allSources.map(function (x) { return x.token; }).join(', ');

      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-body">' +
            '<div class="scw-iui-msg"></div>' +
            '<div class="scw-iui-sub"></div>' +
          '</div>' +
          '<div class="scw-iui-footer">' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--primary">Add All</button>' +
          '</div>' +
        '</div>';

      var body       = overlay.querySelector('.scw-iui-body');
      var msgEl      = body.querySelector('.scw-iui-msg');
      var subEl      = body.querySelector('.scw-iui-sub');
      var primaryBtn = overlay.querySelector('.scw-iui-btn--primary');

      var checklist = renderItemChecklist(body, groups, function () { syncPrimary(); });
      body.insertAdjacentHTML('beforeend', modeTilesHtml({
        sourceLabel: nAll === 1 ? 'The other SOW' : 'The other SOWs',
        deleteLabel: nAll + ' SOW' + (nAll === 1 ? '' : 's') + (sourceList ? ' (' + sourceList + ')' : ''),
        blockers:    blockers,
        plural:      nAll !== 1,
        initialMode: opts.initialMode
      }));

      function syncPrimary() {
        var selCount = checklist.getSelectedIds().length;
        if (currentMode(overlay) === 'consolidate') {
          msgEl.textContent = 'Consolidate ' + nAll + ' SOW' + (nAll === 1 ? '' : 's') +
            ' into this one?';
          subEl.innerHTML =
            'Everything on <strong>' + escapeHtml(sourceList) + '</strong> moves onto the ' +
            'current SOW and ' + (nAll === 1 ? 'that SOW is' : 'those SOWs are') +
            ' deleted. Items already on both stay here.' +
            (coKept ? ' ' + coKept + ' change order' + (coKept === 1 ? ' is' : 's are') + ' kept.' : '');
          primaryBtn.disabled = false;
          primaryBtn.classList.add('is-delete');
          primaryBtn.textContent = 'Consolidate & delete ' + nAll + ' SOW' + (nAll === 1 ? '' : 's');
        } else {
          msgEl.textContent = 'Add ' + selCount + ' unique item' +
            (selCount === 1 ? '' : 's') + '?';
          subEl.innerHTML =
            'Items will be added from <strong>' + sourceCount +
            ' alternative SOW' + (sourceCount === 1 ? '' : 's') +
            '</strong> to the current SOW. They stay on their original SOW' +
            (sourceCount === 1 ? '' : 's') + ' too.';
          primaryBtn.disabled = selCount === 0;
          primaryBtn.classList.remove('is-delete');
          primaryBtn.textContent = 'Add All';
        }
      }
      bindModeTiles(overlay, checklist, syncPrimary);

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({ action: answer, selectedIds: checklist.getSelectedIds() });
      }
      function confirmAction() {
        if (primaryBtn.disabled) return;
        close(currentMode(overlay));
      }
      function onKey(e) {
        if (e.key === 'Escape') close('cancel');
        else if (e.key === 'Enter') confirmAction();
      }

      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      primaryBtn.addEventListener('click', confirmAction);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      primaryBtn.focus();
    });
  }

  // ── Bulk bar ─────────────────────────────────────────────
  // Two project-wide buttons above view_3869:
  //   "Add (N) unique items from other SOWs"   → share modal
  //   "Consolidate K SOWs into this one"        → consolidate modal; blocked
  //                                               (reads as unavailable, click
  //                                               explains) while any other SOW
  //                                               has a survey requested
  var BULK_BAR_ID = 'scw-iui-bulkbar';

  // Every unique item grouped by its MDF/IDF location. Items without an MDF
  // (typically Project Wide assumptions / services) land in a "Project Wide"
  // bucket; assumption items there are pre-deselected for SHARE (they would
  // duplicate the receiving SOW's own assumptions). Consolidate locks the
  // list to everything anyway.
  function buildGroups(receivingSowId, sourceIds) {
    var rcvSet = sowToItems[receivingSowId] || {};
    var seenItem = {};
    var byMdf = Object.create(null);   // mdfId → { label, items: [] }
    var PROJECT_WIDE_KEY = '__project_wide__';
    for (var si = 0; si < sourceIds.length; si++) {
      var items = sowToItems[sourceIds[si]] || {};
      for (var iid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, iid)) continue;
        if (rcvSet[iid] || seenItem[iid]) continue;
        seenItem[iid] = 1;
        var m = getItemMeta(iid);
        var key   = m.mdfId || PROJECT_WIDE_KEY;
        var label = m.mdfLabel || 'Project Wide';
        if (!byMdf[key]) byMdf[key] = { label: label, items: [] };
        byMdf[key].items.push({
          id: iid,
          label: getItemLabel(iid),
          defaultChecked: !(key === PROJECT_WIDE_KEY && m.isAssumption)
        });
      }
    }
    var groups = [];
    Object.keys(byMdf).forEach(function (k) {
      byMdf[k].items.sort(function (a, b) {
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
      });
      groups.push({ key: k, token: byMdf[k].label, items: byMdf[k].items });
    });
    groups.sort(function (a, b) {
      if (a.key === PROJECT_WIDE_KEY) return 1;
      if (b.key === PROJECT_WIDE_KEY) return -1;
      return a.token.localeCompare(b.token, undefined, { numeric: true, sensitivity: 'base' });
    });
    return groups;
  }

  function countItems(groups) {
    var n = 0;
    for (var i = 0; i < groups.length; i++) n += groups[i].items.length;
    return n;
  }
  // The source SOWs that actually have something unique to give.
  function contributingSources(cons) {
    return cons.sourceIds.filter(function (id) { return (cons.perSow[id] || []).length > 0; });
  }

  function openBulkModal(btn, initialMode) {
    var rcv  = getReceivingSowId();
    var cons = rcv ? aggregateConsolidate(rcv) : null;
    if (!cons) return;
    var groups   = buildGroups(rcv, cons.sourceIds);
    var blockers = cons.surveyBlockers.map(function (b) { return b.label; });
    if (initialMode === 'consolidate' && blockers.length) {
      alert('Consolidate is unavailable: a survey has been requested on this project — ' +
        blockers.join('; ') + '. Surveyed scope has bids attached, so no SOW can be deleted from here.');
      return;
    }
    if (initialMode === 'consolidate' && !cons.sourceIds.length) {
      alert('There are no other SOWs on this project to consolidate.');
      return;
    }
    if (initialMode !== 'consolidate' && !countItems(groups)) {
      alert('No unique items to add.');
      return;
    }
    showBulkConfirm({
      initialMode: initialMode,
      groups:      groups,
      sourceCount: contributingSources(cons).length,
      allSources:  cons.sourceIds.map(function (id) { return { id: id, token: getSowToken(id) }; }),
      blockers:    blockers,
      coKeptCount: cons.coKeptIds.length
    }).then(function (res) {
      if (res.action === 'cancel') return;
      if (res.action === 'consolidate') { fireBulkWebhook(btn, 'consolidate'); return; }
      if (!res.selectedIds || !res.selectedIds.length) return;
      fireBulkWebhook(btn, 'share', res.selectedIds);
    });
  }

  function syncBulkBar() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var rcv  = getReceivingSowId();
    var cons = rcv ? aggregateConsolidate(rcv) : null;

    var bar = document.getElementById(BULK_BAR_ID);

    // Nothing to offer until the index is built and another (non-CO) SOW exists.
    if (!cons || !cons.sourceIds.length) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = BULK_BAR_ID;
      bar.className = 'scw-iui-bulkbar';
      bar.innerHTML =
        '<span class="scw-iui-bulkbar-msg"></span>' +
        '<button type="button" class="scw-iui-bulkbar-btn scw-iui-bulkbar-btn--share">' +
          '<span class="scw-iui-bulkbar-icon" style="display:inline-flex;align-items:center;">' +
            DOWNLOAD_SVG +
          '</span>' +
          '<span class="scw-iui-bulkbar-label"></span>' +
        '</button>' +
        '<button type="button" class="scw-iui-bulkbar-btn scw-iui-bulkbar-btn--consolidate">' +
          '<span class="scw-iui-bulkbar-icon" style="display:inline-flex;align-items:center;">' +
            CLOSE_SVG +
          '</span>' +
          '<span class="scw-iui-bulkbar-label"></span>' +
        '</button>';

      var shareBtn = bar.querySelector('.scw-iui-bulkbar-btn--share');
      shareBtn.addEventListener('click', function () {
        if (shareBtn.classList.contains('is-loading') || shareBtn.disabled) return;
        openBulkModal(shareBtn, 'share');
      });
      var consBtn = bar.querySelector('.scw-iui-bulkbar-btn--consolidate');
      consBtn.addEventListener('click', function () {
        if (consBtn.classList.contains('is-loading')) return;
        openBulkModal(consBtn, 'consolidate');
      });

      // Mount above the table — try the records-nav block first, then fall
      // back to prepending into the view container.
      var recordsNav = viewEl.querySelector('.kn-records-nav');
      if (recordsNav && recordsNav.parentNode) {
        recordsNav.parentNode.insertBefore(bar, recordsNav);
      } else {
        viewEl.insertBefore(bar, viewEl.firstChild);
      }
    }

    var msgSpan   = bar.querySelector('.scw-iui-bulkbar-msg');
    var shareEl   = bar.querySelector('.scw-iui-bulkbar-btn--share');
    var shareLbl  = shareEl.querySelector('.scw-iui-bulkbar-label');
    var consEl    = bar.querySelector('.scw-iui-bulkbar-btn--consolidate');
    var consLbl   = consEl.querySelector('.scw-iui-bulkbar-label');

    var n = cons.itemIds.length;
    var k = cons.sourceIds.length;
    var contributing = contributingSources(cons).length;
    shareLbl.textContent = 'Add (' + n + ') unique item' + (n === 1 ? '' : 's') + ' from other SOWs';
    shareEl.disabled = (n === 0);
    shareEl.title = n
      ? 'Link the items the other SOWs have and this one lacks. They stay on their original SOWs too.'
      : 'Every item on the other SOWs is already on this one.';
    msgSpan.textContent = n
      ? n + ' unique item' + (n === 1 ? '' : 's') + ' across ' + contributing +
        ' SOW' + (contributing === 1 ? '' : 's')
      : 'No unique items on the other ' + k + ' SOW' + (k === 1 ? '' : 's');

    consLbl.textContent = 'Consolidate ' + k + ' SOW' + (k === 1 ? '' : 's') + ' into this one';
    var blockers = cons.surveyBlockers.map(function (b) { return b.label; });
    consEl.classList.toggle('is-blocked', blockers.length > 0);
    consEl.setAttribute('aria-disabled', blockers.length ? 'true' : 'false');
    consEl.title = blockers.length
      ? 'Unavailable — a survey has been requested on this project: ' + blockers.join('; ') +
        '. Surveyed scope has bids attached, so no SOW can be deleted from here.'
      : 'Move everything onto this SOW and delete the other ' + k + ' SOW' + (k === 1 ? '' : 's') +
        (cons.coKeptIds.length ? ' (change orders are kept)' : '') + '.';

    if (indexTruncated) {
      msgSpan.textContent = '⚠ counts unreliable (' + indexLoaded + ' of ' +
        indexTotal + ' line items loaded) · ' + msgSpan.textContent;
      msgSpan.style.color = '#b45309';
      msgSpan.title = LINE_ITEM_VIEW + ' holds more line items than one page ' +
        'can load — it needs a Builder source filter scoping it to this project.';
    } else {
      msgSpan.style.color = '';
      msgSpan.title = '';
    }
  }

  // ── Inject a button-cell into each data row ──────────────
  function buildButton(sourceRecordId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_MARKER;
    btn.title = 'Add items from this SOW that are not already on the current SOW';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'scw-import-unique-items-icon';
    iconSpan.style.cssText = 'display:inline-flex; align-items:center;';
    iconSpan.innerHTML = DOWNLOAD_SVG;
    btn.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'scw-import-unique-items-label';
    labelSpan.textContent = BTN_LABEL;
    btn.appendChild(labelSpan);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('is-loading')) return;
      var mode = btn.getAttribute('data-mode');
      if (mode === 'disabled' || mode === 'pending') return;

      var tr     = btn.closest('tr[id]');
      var label  = getRowLabel(tr);
      var rcv    = getReceivingSowId();
      var ids    = uniqueItemsFor(sourceRecordId, rcv) || [];
      var rowBlockers = surveyBlockers(rcv, [sourceRecordId]);

      if (mode === 'delete-only') {
        showDeleteConfirm({
          sourceToken: label.token,
          sourceFull:  label.full
        }).then(function (res) {
          if (res.action !== 'delete') return;
          fireWebhook(btn, sourceRecordId, 'consolidate');
        });
        return;
      }

      // mode === 'import' — share or consolidate, the user picks in the modal.
      var items = ids.map(function (id) {
        return { id: id, label: getItemLabel(id) };
      });
      showImportConfirm({
        sourceToken: label.token,
        sourceFull:  label.full,
        blockers:    rowBlockers.map(function (b) { return b.label; }),
        items:       items
      }).then(function (res) {
        if (res.action === 'cancel') return;
        if (res.action === 'consolidate') {
          fireWebhook(btn, sourceRecordId, 'consolidate');
          return;
        }
        if (!res.selectedIds || !res.selectedIds.length) return;
        fireWebhook(btn, sourceRecordId, 'share', res.selectedIds);
      });
    });

    setBtnLabel(btn, sourceRecordId);
    return btn;
  }

  function syncRows() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var table  = viewEl.querySelector('table.kn-table-table');
    if (!table) return;
    var thead  = table.querySelector('thead tr');
    var tbody  = table.querySelector('tbody');

    // Append a dedicated header cell once (empty label; buttons are self-describing).
    if (thead && !thead.querySelector('th.' + COL_CLASS)) {
      var th = document.createElement('th');
      th.className = COL_CLASS;
      th.innerHTML = '<span class="table-fixed-label"></span>';
      thead.appendChild(th);
    }

    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      // Skip no-data rows and any row hidden by hide-self-row etc.
      if (tr.classList.contains('kn-tr-nodata')) continue;
      var recordId = tr.id;
      if (!/^[a-f0-9]{24}$/.test(recordId)) continue;
      // Don't inject into the current SOW's own row (safety even though
      // hide-self-row hides it already), nor into a change-order SOW's row —
      // a CO's lines are deltas against install scope, never shared onto a
      // base SOW, and its header must never be deleted from here.
      if (recordId === getReceivingSowId()) continue;
      if (isChangeOrderSow(recordId)) continue;
      if (tr.querySelector('.' + BTN_MARKER)) continue;

      var td = document.createElement('td');
      td.className = COL_CLASS;
      td.appendChild(buildButton(recordId));
      tr.appendChild(td);
    }
  }

  // ── Bindings ─────────────────────────────────────────────
  function syncAll() {
    syncRows();
    refreshAllBtnLabels();
    syncBulkBar();
  }

  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
      setTimeout(syncAll, 400);
    });

  $(document)
    .off('knack-view-render.' + GATE_VIEW + EVENT_NS)
    .on('knack-view-render.' + GATE_VIEW + EVENT_NS, function () {
      setTimeout(syncAll, 400);
    });

  // Force view_3913 to load 1000 records/page so the SOW→items index covers
  // every line item on the project (default page size of 25 would truncate
  // counts on larger projects). Re-fires render with the larger page; we
  // build the index on the second render once limit==1000.
  function ensureFullPage(viewKey) {
    var $select = $('#' + viewKey + ' select[name="limit"]');
    if ($select.length && $select.val() !== '1000') {
      $select.val('1000').trigger('change');
      return false;
    }
    return true;
  }

  $(document)
    .off('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS)
    .on('knack-view-render.' + LINE_ITEM_VIEW + EVENT_NS, function () {
      if (!ensureFullPage(LINE_ITEM_VIEW)) return; // wait for re-render at 1000/page
      buildSowIndex();
      refreshAllBtnLabels();
      syncBulkBar();
    });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(syncAll, 1200);
    });

  // Console diagnostic — run SCW.importUniqueItems.dump() on the SOW page
  // to see exactly what the feature is working from.
  window.SCW = window.SCW || {};
  SCW.importUniqueItems = {
    // Exposed for tests/sow-page/test-share-consolidate.js.
    _internals: {
      showImportConfirm:    showImportConfirm,
      showBulkConfirm:      showBulkConfirm,
      modeTilesHtml:        modeTilesHtml,
      buildSowIndex:        buildSowIndex,
      uniqueItemsFor:       uniqueItemsFor,
      aggregateAllUnique:   aggregateAllUnique,
      aggregateConsolidate: aggregateConsolidate,
      surveyBlockers:       surveyBlockers
    },
    dump: function () {
      var out = {
        receivingSowId: getReceivingSowId(),
        indexBuilt:     !!sowToItems,
        itemsLoaded:    indexLoaded,
        itemsTotal:     indexTotal,
        truncated:      indexTruncated,
        sowsInIndex:    sowToItems ? Object.keys(sowToItems).length : 0,
        allowedSowIds:  Object.keys(allowedSowIds())
      };
      if (sowToItems) {
        var perSow = {};
        for (var sowId in sowToItems) {
          if (Object.prototype.hasOwnProperty.call(sowToItems, sowId)) {
            perSow[sowId] = Object.keys(sowToItems[sowId]).length;
          }
        }
        out.itemCountPerSow = perSow;
        // What each bar button would do right now — the quickest answer to
        // "why is Consolidate unavailable?" (blockedSourceIds) or "why does
        // Share count N?" (itemIds).
        if (out.receivingSowId) {
          out.share       = aggregateAllUnique(out.receivingSowId);
          out.consolidate = aggregateConsolidate(out.receivingSowId);
        }
      }
      console.table ? console.table(out) : console.log(out);
      return out;
    }
  };
})();
