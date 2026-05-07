/*** FEATURE: "Import Unique Items" button on each row of view_3869 ***/
/**
 * For each row in view_3869 (alternative SOWs on the same project),
 * injects an "Import Unique Items (N)" button. N = count of line items
 * connected to that source SOW that are NOT already connected to the
 * current (receiving) SOW. N is computed from view_3913 — a hidden grid
 * of all SOW line items connected to the project, where field_2154 is
 * the multi-connection back to SOW headers.
 *
 * Click fires the Make webhook at SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK
 * with:
 *   {
 *     receivingRecordId: <current SOW id from view_3827>,
 *     sourceRecordId:    <tr.id of the row where the button lives>,
 *     triggeredBy:       { id, name, email }
 *   }
 *
 * Make is expected to look up all line items on the source SOW, filter
 * to those NOT already on the receiving SOW, and append the receiving
 * SOW's id to each such item's field_2154 connection. The button is
 * never rendered on the self-row (hidden by hide-self-row).
 */
(function () {
  'use strict';

  var TARGET_VIEW      = 'view_3869';
  var GATE_VIEW        = 'view_3827';   // SOW detail view on the same scene
  var LINE_ITEM_VIEW   = 'view_3913';   // Hidden grid of all SOW line items on this project
  var SOW_CONN_FIELD   = 'field_2154';  // SOW Header connection on a line item
  var ITEM_LABEL_FIELD = 'field_1950';  // Display label for a line item (added to view_3913)
  var SURVEY_FIELD     = 'field_2706';  // Yes/No: "Survey Requested?" on a SOW Header
  var BTN_MARKER     = 'scw-import-unique-items-btn';
  var BTN_LABEL      = 'Add unique items';
  var EVENT_NS       = '.scwImportUniqueItems';
  var COL_CLASS      = 'scw-import-unique-items-col';

  // sowId → Set<lineItemId>
  var sowToItems = null;
  var itemLabels = null;   // itemId → display label (field_1950)

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
      '.scw-iui-opt {' +
      '  display: flex; align-items: flex-start; gap: 10px;' +
      '  padding: 12px 14px; border: 1px solid #e5e7eb;' +
      '  border-radius: 8px; cursor: pointer;' +
      '  background: #f9fafb; transition: background 0.15s, border-color 0.15s;' +
      '}' +
      '.scw-iui-opt:hover { background: #fef2f2; border-color: #fecaca; }' +
      '.scw-iui-opt input {' +
      '  margin: 2px 0 0; flex: 0 0 auto;' +
      '  width: 16px; height: 16px; cursor: pointer;' +
      '  accent-color: #b91c1c;' +
      '}' +
      '.scw-iui-opt-label {' +
      '  font-size: 13px; color: #1f2937; line-height: 1.45;' +
      '}' +
      '.scw-iui-opt-label strong { color: #b91c1c; font-weight: 700; }' +
      '.scw-iui-opt-hint {' +
      '  display: block; color: #6b7280; font-size: 12px;' +
      '  margin-top: 2px;' +
      '}' +
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
    groups.forEach(function (g) { totalCount += g.items.length; });
    var showGroupHeaders = groups.length > 1 ||
      (groups.length === 1 && groups[0].token);

    var html =
      '<div class="scw-iui-items">' +
        '<div class="scw-iui-items-header">' +
          '<span class="scw-iui-items-count">' +
            totalCount + ' of ' + totalCount + ' selected' +
          '</span>' +
          '<button type="button" class="scw-iui-link scw-iui-toggle-all">' +
            'Deselect all' +
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
        html += '<label class="scw-iui-item">' +
          '<input type="checkbox" class="scw-iui-item-cb" ' +
            'data-item-id="' + escapeHtml(item.id) + '" checked>' +
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

    return {
      getSelectedIds: getSelectedIds,
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

  // Confirm modal. Resolves with {action: 'cancel'|'import'|'import-delete'}.
  function showImportConfirm(opts) {
    return new Promise(function (resolve) {
      var token          = escapeHtml(opts.sourceToken || 'this SOW');
      var fullLabel      = escapeHtml(opts.sourceFull || '');
      var showFull       = fullLabel && fullLabel !== opts.sourceToken;
      var allowDelete    = !!opts.allowDelete;
      var items          = opts.items || [];
      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-body">' +
            '<div class="scw-iui-msg">Add unique items?</div>' +
            '<div class="scw-iui-sub">' +
              'Add items from <strong>' + token +
              '</strong> to the current SOW.' +
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
        function (selectedIds) {
          msgEl.textContent = 'Add ' + selectedIds.length +
            ' unique item' + (selectedIds.length === 1 ? '' : 's') + '?';
          syncPrimary();
        });

      // Append delete-toggle / blocked-note tile AFTER the checklist.
      if (allowDelete) {
        body.insertAdjacentHTML('beforeend',
          '<label class="scw-iui-opt">' +
            '<input type="checkbox" class="scw-iui-delete-toggle">' +
            '<span class="scw-iui-opt-label">' +
              '<strong>Also delete ' + token + '</strong> after adding' +
              '<span class="scw-iui-opt-hint">' +
                'Removes the source SOW once its items have been added.' +
              '</span>' +
            '</span>' +
          '</label>');
      } else {
        body.insertAdjacentHTML('beforeend',
          '<div class="scw-iui-note">' +
            'A survey has already been requested for ' + token + ', ' +
            'so it cannot be deleted from here.' +
          '</div>');
      }

      var checkbox = overlay.querySelector('.scw-iui-delete-toggle');

      function syncPrimary() {
        var selCount = checklist.getSelectedIds().length;
        primaryBtn.disabled = selCount === 0;
        if (checkbox && checkbox.checked) {
          primaryBtn.classList.add('is-delete');
          primaryBtn.textContent = 'Add & Delete';
        } else {
          primaryBtn.classList.remove('is-delete');
          primaryBtn.textContent = 'Add';
        }
      }

      // Initial title (matches default all-selected state).
      msgEl.textContent = 'Add ' + items.length +
        ' unique item' + (items.length === 1 ? '' : 's') + '?';
      syncPrimary();

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({
          action:      answer,
          selectedIds: checklist.getSelectedIds()
        });
      }
      function onKey(e) {
        if (e.key === 'Escape') close('cancel');
        else if (e.key === 'Enter') {
          if (primaryBtn.disabled) return;
          close(checkbox && checkbox.checked ? 'import-delete' : 'import');
        }
      }

      if (checkbox) checkbox.addEventListener('change', syncPrimary);
      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      primaryBtn.addEventListener('click', function () {
        if (primaryBtn.disabled) return;
        close(checkbox && checkbox.checked ? 'import-delete' : 'import');
      });
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

  // Build sowId → Set<lineItemId> and itemId → label from view_3913's model.
  function buildSowIndex() {
    sowToItems = null;
    itemLabels = null;
    try {
      var v = Knack.views && Knack.views[LINE_ITEM_VIEW];
      if (!v || !v.model || !v.model.data || !v.model.data.models) return;
      var models = v.model.data.models;
      var idx    = {};
      var labels = {};
      for (var i = 0; i < models.length; i++) {
        var rec = models[i] && models[i].attributes;
        if (!rec || !rec.id) continue;

        // Display label — strip any HTML tags Knack may have wrapped it in.
        var raw = rec[ITEM_LABEL_FIELD];
        if (raw != null) {
          var label = String(raw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (label) labels[rec.id] = label;
        }

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
    } catch (e) { /* ignore */ }
  }

  function getItemLabel(itemId) {
    return (itemLabels && itemLabels[itemId]) || itemId;
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

  // Union of unique item ids across every source SOW that has at least one
  // unique item relative to the receiving SOW. Splits contributing source
  // SOWs into delete-eligible (no survey requested) vs. blocked (survey
  // requested → cannot be auto-deleted). Returns
  //   { itemIds, sourceIds, deletableSourceIds, blockedSourceIds }
  // or null if the index hasn't been built yet.
  function aggregateAllUnique(receivingSowId) {
    if (!sowToItems || !receivingSowId) return null;
    var rcv = sowToItems[receivingSowId] || {};
    var seen = {};
    var itemIds = [];
    var sourceIds = [];
    var deletableSourceIds = [];
    var blockedSourceIds   = [];
    for (var sowId in sowToItems) {
      if (!Object.prototype.hasOwnProperty.call(sowToItems, sowId)) continue;
      if (sowId === receivingSowId) continue;
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

  // Read field_2706 ("Survey Requested?") for a row in view_3869. Returns
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
      btn.title = 'Copy ' + count + ' item' + (count === 1 ? '' : 's') +
        ' from ' + token + ' not already on the current SOW';
      setBtnIcon(btn, DOWNLOAD_SVG);
      return;
    }

    // count === 0
    var surveyed = isSurveyRequested(sourceRecordId, tr);
    if (surveyed) {
      labelSpan.textContent = '0 unique · survey requested';
      btn.setAttribute('data-mode', 'disabled');
      btn.title = 'No unique items, and a survey has been requested — ' +
        'this SOW cannot be deleted.';
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

  // Per-row import / delete-only flow. sourceRecordId is required;
  // deleteSourceAfterImport may be true.
  // explicitItemIds: optional array — when present (e.g. user-trimmed
  // selection from the modal), it's used verbatim. Otherwise the full
  // unique set is recomputed.
  function fireWebhook(btn, sourceRecordId, deleteSourceAfterImport, explicitItemIds) {
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
      alert('Source and receiving SOW are the same — nothing to import.');
      return;
    }

    var uniqueItemIds = (explicitItemIds && explicitItemIds.length)
      ? explicitItemIds
      : (uniqueItemsFor(sourceRecordId, receivingRecordId) || []);
    var deleteSourceIds = deleteSourceAfterImport ? [sourceRecordId] : [];
    postWebhook(btn, {
      receivingRecordId:       receivingRecordId,
      sourceRecordId:          sourceRecordId,
      sourceRecordIds:         [sourceRecordId],
      uniqueItemIds:           uniqueItemIds,
      deleteSourceIds:         deleteSourceIds,
      deleteSourceAfterImport: !!deleteSourceAfterImport,
      bulk:                    false,
      triggeredBy:             getTriggeredBy()
    });
  }

  // Bulk import flow — fires the same webhook with the union of unique
  // items across every alternative SOW. Optionally deletes the
  // delete-eligible source SOWs (those without a survey requested).
  function fireBulkWebhook(btn, deleteEligibleSources, explicitItemIds) {
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
    var agg = aggregateAllUnique(receivingRecordId);
    if (!agg || !agg.itemIds.length) {
      alert('No unique items to import.');
      return;
    }
    var uniqueItemIds = (explicitItemIds && explicitItemIds.length)
      ? explicitItemIds
      : agg.itemIds;
    var deleteSourceIds = deleteEligibleSources ? agg.deletableSourceIds : [];
    postWebhook(btn, {
      receivingRecordId:       receivingRecordId,
      sourceRecordId:          null,
      sourceRecordIds:         agg.sourceIds,
      uniqueItemIds:           uniqueItemIds,
      deleteSourceIds:         deleteSourceIds,
      deleteSourceAfterImport: deleteSourceIds.length > 0,
      bulk:                    true,
      triggeredBy:             getTriggeredBy()
    }, /*isBulk=*/true);
  }

  // Shared POST + response handling. `isBulk` only changes the loading
  // visual treatment (the per-row buttons have their own spinner swap).
  function postWebhook(btn, payload, isBulk) {
    var url = SCW.CONFIG.MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK;
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
      return resp.json().catch(function () { return null; });
    }).then(function (data) {
      if (data && data.success) {
        window.location.reload();
        return;
      }
      if (isBulk) { btn.classList.remove('is-loading'); btn.disabled = false; }
      else setBtnLoading(btn, false);
      alert((data && (data.error || data.message)) || 'Failed to import items.');
    }).catch(function (err) {
      if (isBulk) { btn.classList.remove('is-loading'); btn.disabled = false; }
      else setBtnLoading(btn, false);
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // ── Bulk modal ───────────────────────────────────────────
  // Resolves with { action: 'cancel'|'import'|'import-delete' }.
  // opts.groups: [{ token, items: [{id, label}] }] — one entry per source SOW
  function showBulkConfirm(opts) {
    return new Promise(function (resolve) {
      var sourceCount    = opts.sourceCount;
      var deletableCount = opts.deletableCount;
      var blockedCount   = opts.blockedCount;
      var canDelete      = deletableCount > 0;
      var groups         = opts.groups || [];
      var totalItems     = 0;
      groups.forEach(function (g) { totalItems += g.items.length; });

      var overlay = document.createElement('div');
      overlay.className = 'scw-iui-overlay';
      overlay.innerHTML =
        '<div class="scw-iui-card" role="alertdialog" aria-modal="true">' +
          '<div class="scw-iui-body">' +
            '<div class="scw-iui-msg"></div>' +
            '<div class="scw-iui-sub">' +
              'Items will be added from <strong>' + sourceCount +
              ' alternative SOW' + (sourceCount === 1 ? '' : 's') +
              '</strong> to the current SOW.' +
            '</div>' +
          '</div>' +
          '<div class="scw-iui-footer">' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--cancel">Cancel</button>' +
            '<button type="button" class="scw-iui-btn scw-iui-btn--primary">Add All</button>' +
          '</div>' +
        '</div>';

      var body       = overlay.querySelector('.scw-iui-body');
      var msgEl      = body.querySelector('.scw-iui-msg');
      var primaryBtn = overlay.querySelector('.scw-iui-btn--primary');

      var checklist = renderItemChecklist(body, groups, function (selectedIds) {
        msgEl.textContent = 'Add ' + selectedIds.length +
          ' unique item' + (selectedIds.length === 1 ? '' : 's') + '?';
        syncPrimary();
      });

      // Append delete-option / blocked-note tile after the checklist.
      if (canDelete) {
        var blockedNote = blockedCount > 0
          ? ' ' + blockedCount + ' SOW' + (blockedCount === 1 ? '' : 's') +
            ' with a survey requested will be kept.'
          : '';
        body.insertAdjacentHTML('beforeend',
          '<label class="scw-iui-opt">' +
            '<input type="checkbox" class="scw-iui-delete-toggle">' +
            '<span class="scw-iui-opt-label">' +
              '<strong>Also delete ' + deletableCount + ' eligible SOW' +
                (deletableCount === 1 ? '' : 's') + '</strong> after adding' +
              '<span class="scw-iui-opt-hint">' +
                'Removes source SOWs without a survey requested.' + blockedNote +
              '</span>' +
            '</span>' +
          '</label>');
      } else if (blockedCount > 0) {
        body.insertAdjacentHTML('beforeend',
          '<div class="scw-iui-note">' +
            'All ' + blockedCount + ' source SOW' + (blockedCount === 1 ? '' : 's') +
            ' ha' + (blockedCount === 1 ? 's' : 've') +
            ' a survey requested and cannot be auto-deleted.' +
          '</div>');
      }

      var checkbox = overlay.querySelector('.scw-iui-delete-toggle');

      function syncPrimary() {
        var selCount = checklist.getSelectedIds().length;
        primaryBtn.disabled = selCount === 0;
        if (checkbox && checkbox.checked) {
          primaryBtn.classList.add('is-delete');
          primaryBtn.textContent = 'Add & Delete';
        } else {
          primaryBtn.classList.remove('is-delete');
          primaryBtn.textContent = 'Add All';
        }
      }

      msgEl.textContent = 'Add ' + totalItems +
        ' unique item' + (totalItems === 1 ? '' : 's') + '?';
      syncPrimary();

      function close(answer) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
        resolve({
          action:      answer,
          selectedIds: checklist.getSelectedIds()
        });
      }
      function onKey(e) {
        if (e.key === 'Escape') close('cancel');
        else if (e.key === 'Enter') {
          if (primaryBtn.disabled) return;
          close(checkbox && checkbox.checked ? 'import-delete' : 'import');
        }
      }

      if (checkbox) checkbox.addEventListener('change', syncPrimary);
      overlay.querySelector('.scw-iui-btn--cancel')
        .addEventListener('click', function () { close('cancel'); });
      primaryBtn.addEventListener('click', function () {
        if (primaryBtn.disabled) return;
        close(checkbox && checkbox.checked ? 'import-delete' : 'import');
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      primaryBtn.focus();
    });
  }

  // ── Bulk bar ─────────────────────────────────────────────
  var BULK_BAR_ID = 'scw-iui-bulkbar';

  function syncBulkBar() {
    var viewEl = document.getElementById(TARGET_VIEW);
    if (!viewEl) return;
    var rcv = getReceivingSowId();
    var agg = rcv ? aggregateAllUnique(rcv) : null;

    var bar = document.getElementById(BULK_BAR_ID);

    // Hide bar entirely until we have an index and at least one unique item.
    if (!agg || !agg.itemIds.length) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = BULK_BAR_ID;
      bar.className = 'scw-iui-bulkbar';
      bar.innerHTML =
        '<span class="scw-iui-bulkbar-msg"></span>' +
        '<button type="button" class="scw-iui-bulkbar-btn">' +
          '<span class="scw-iui-bulkbar-icon" style="display:inline-flex;align-items:center;">' +
            DOWNLOAD_SVG +
          '</span>' +
          '<span class="scw-iui-bulkbar-label"></span>' +
        '</button>';

      var btn = bar.querySelector('.scw-iui-bulkbar-btn');
      btn.addEventListener('click', function () {
        if (btn.classList.contains('is-loading') || btn.disabled) return;
        var rcvNow = getReceivingSowId();
        var aggNow = rcvNow ? aggregateAllUnique(rcvNow) : null;
        if (!aggNow || !aggNow.itemIds.length) return;

        // Build per-source groups so each item shows under its source SOW.
        // Re-walk sowToItems instead of inverting agg.itemIds — we need the
        // original SOW grouping, not the deduped union.
        var rcvSet = sowToItems[rcvNow] || {};
        var groups = [];
        var seenItem = {};
        for (var si = 0; si < aggNow.sourceIds.length; si++) {
          var sowId = aggNow.sourceIds[si];
          var items = sowToItems[sowId] || {};
          var groupItems = [];
          for (var iid in items) {
            if (!Object.prototype.hasOwnProperty.call(items, iid)) continue;
            if (rcvSet[iid] || seenItem[iid]) continue;
            seenItem[iid] = 1;
            groupItems.push({ id: iid, label: getItemLabel(iid) });
          }
          if (groupItems.length) {
            groups.push({ token: getSowToken(sowId), items: groupItems });
          }
        }

        showBulkConfirm({
          sourceCount:    aggNow.sourceIds.length,
          deletableCount: aggNow.deletableSourceIds.length,
          blockedCount:   aggNow.blockedSourceIds.length,
          groups:         groups
        }).then(function (res) {
          if (res.action === 'cancel') return;
          if (!res.selectedIds || !res.selectedIds.length) return;
          fireBulkWebhook(btn, res.action === 'import-delete', res.selectedIds);
        });
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

    var labelSpan = bar.querySelector('.scw-iui-bulkbar-label');
    var msgSpan   = bar.querySelector('.scw-iui-bulkbar-msg');
    var n = agg.itemIds.length;
    labelSpan.textContent = 'Combine All SOWs — add (' + n + ') unique item' +
      (n === 1 ? '' : 's');
    msgSpan.textContent =
      n + ' unique item' + (n === 1 ? '' : 's') +
      ' across ' + agg.sourceIds.length + ' SOW' + (agg.sourceIds.length === 1 ? '' : 's');
  }

  // ── Inject a button-cell into each data row ──────────────
  function buildButton(sourceRecordId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_MARKER;
    btn.title = 'Copy items from this SOW that are not already on the current SOW';

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
      var allowDelete = !isSurveyRequested(sourceRecordId, tr);

      if (mode === 'delete-only') {
        showDeleteConfirm({
          sourceToken: label.token,
          sourceFull:  label.full
        }).then(function (res) {
          if (res.action !== 'delete') return;
          fireWebhook(btn, sourceRecordId, true);
        });
        return;
      }

      // mode === 'import'
      var items = ids.map(function (id) {
        return { id: id, label: getItemLabel(id) };
      });
      showImportConfirm({
        sourceToken: label.token,
        sourceFull:  label.full,
        allowDelete: allowDelete,
        items:       items
      }).then(function (res) {
        if (res.action === 'cancel') return;
        if (!res.selectedIds || !res.selectedIds.length) return;
        fireWebhook(btn, sourceRecordId, res.action === 'import-delete',
          res.selectedIds);
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
      // hide-self-row hides it already).
      if (recordId === getReceivingSowId()) continue;
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
})();
