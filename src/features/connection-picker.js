/*** FEATURE: Custom connection picker — replaces Knack's native popover *********
 *
 * Scope:
 *   - Target: field_1957 (Connected Devices) on view_3586 (SOW line items).
 *   - Other connection fields and other views keep Knack's native picker.
 *
 * Why:
 *   - Knack's native connection popover is slow on 100+ item lists
 *     (~400ms INP per checkbox click due to its internal form-state churn)
 *     and has a label→input click-synthesis quirk that fights shift-range
 *     selection. Replacing it with our own UI puts every interaction on
 *     our own fast path.
 *   - Save uses the existing silent-regroup pipeline
 *     (SCW.silentRegroupView3586 — see mirror-connection-sync.js), so the
 *     reciprocal field_2197 and parent-group field_1946 propagate to
 *     children without a view-wide re-render flash.
 *
 * Chunk 1 of 5:
 *   - Modal shell, CSS, shift-click range, selected-first reorder, grouped
 *     list rendering. No data fetching, no save, no click interception on
 *     the cell yet. Verified via SCW.connectionPicker._testOpen() in DevTools.
 *
 * Feature flag:
 *   SCW.CONFIG.customConnectionPicker (default true). Flip to false to
 *   restore Knack's native picker instantly — no code removal needed.
 **************************************************************************************/
(function () {
  'use strict';

  // ── Feature flag ──────────────────────────────────────────────────
  window.SCW = window.SCW || {};
  window.SCW.CONFIG = window.SCW.CONFIG || {};
  if (typeof window.SCW.CONFIG.customConnectionPicker === 'undefined') {
    window.SCW.CONFIG.customConnectionPicker = true;
  }

  // ── Layout constants ──────────────────────────────────────────────
  var CLASS_PREFIX       = 'scw-cp';
  var STYLE_ID           = 'scw-connection-picker-css';
  var ITEM_THRESHOLD     = 20;   // below → single column
  var ROWS_PER_COLUMN    = 30;
  var MAX_COLUMNS        = 6;

  // ── CSS ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var P = '.' + CLASS_PREFIX;
    var css = [
      // Backdrop
      P + '-backdrop {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(0,0,0,0.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 14px/1.4 system-ui, -apple-system, sans-serif;',
      '}',

      // Modal shell
      P + '-modal {',
      '  background: #fff;',
      '  border-radius: 10px;',
      '  box-shadow: 0 20px 60px rgba(0,0,0,0.35);',
      '  max-width: 95vw;',
      '  max-height: 90vh;',
      '  width: max-content;',
      '  min-width: 420px;',
      '  display: flex;',
      '  flex-direction: column;',
      '  overflow: hidden;',
      '}',

      // Header
      P + '-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 14px 18px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  background: #f9fafb;',
      '}',
      P + '-title {',
      '  margin: 0; font-size: 15px; font-weight: 700; color: #111827;',
      '  letter-spacing: 0.01em;',
      '}',
      P + '-close {',
      '  appearance: none; background: none; border: none;',
      '  color: #6b7280; font-size: 22px; line-height: 1; cursor: pointer;',
      '  padding: 2px 6px; margin: -4px -4px -4px 8px; border-radius: 4px;',
      '}',
      P + '-close:hover { color: #111827; background: #e5e7eb; }',

      // Body
      P + '-body {',
      '  padding: 10px 18px;',
      '  overflow-y: auto;',
      '  flex: 1 1 auto;',
      '}',

      // Group section
      P + '-group {',
      '  margin: 6px 0 14px;',
      '  contain: layout style;',
      '}',
      P + '-group-label {',
      '  font-size: 11px; font-weight: 700; color: #163C6E;',
      '  text-transform: uppercase; letter-spacing: 0.05em;',
      '  padding: 6px 0 4px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  margin-bottom: 4px;',
      '}',

      // Multi-column list inside each group
      P + '-list {',
      '  column-gap: 18px;',
      '  contain: layout style;',
      '  margin: 0; padding: 0; list-style: none;',
      '}',
      // .control wrapper per item — mirrors Knack's structure so the
      // shift-click + reorder helpers read the same DOM shape.
      P + '-list > .control {',
      '  break-inside: avoid;',
      '  -webkit-column-break-inside: avoid;',
      '  page-break-inside: avoid;',
      '  contain: layout style;',
      '  display: block;',
      '  padding: 2px 0;',
      '}',
      P + '-list label {',
      '  display: flex; align-items: flex-start; gap: 6px;',
      '  line-height: 1.35;',
      '  cursor: pointer;',
      '  padding: 2px 4px;',
      '  border-radius: 3px;',
      '  user-select: none;',
      '}',
      P + '-list label:hover { background: #f3f4f6; }',
      P + '-list label input[type="checkbox"] {',
      '  flex-shrink: 0; margin-top: 3px; cursor: pointer;',
      '}',
      P + '-list label span {',
      '  flex: 1; min-width: 0; color: #1f2937;',
      '}',

      // Footer
      P + '-footer {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 12px 18px;',
      '  border-top: 1px solid #e5e7eb;',
      '  background: #f9fafb;',
      '}',
      P + '-btn {',
      '  appearance: none; border: 1px solid #d1d5db;',
      '  background: #fff; color: #374151;',
      '  padding: 7px 16px; border-radius: 6px;',
      '  font-size: 13px; font-weight: 600; cursor: pointer;',
      '}',
      P + '-btn:hover { background: #f3f4f6; }',
      P + '-btn-primary {',
      '  background: #163C6E; border-color: #163C6E; color: #fff;',
      '}',
      P + '-btn-primary:hover { background: #0f2d55; }',
      P + '-btn[disabled] { opacity: 0.55; cursor: default; }',

      // Empty state
      P + '-empty {',
      '  padding: 24px 18px; text-align: center; color: #6b7280;',
      '  font-size: 13px;',
      '}',

      // Inline error banner
      P + '-error {',
      '  background: #fef2f2; color: #991b1b; border-bottom: 1px solid #fecaca;',
      '  padding: 10px 18px; font-size: 13px; font-weight: 500;',
      '}',

      // Disabled state on footer buttons (Save mid-PUT)
      P + '-btn[disabled] { pointer-events: none; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Column-count scaling (same math as inline-edit-checkbox-layout) ──
  function applyMultiColLayout(listEl) {
    var controls = listEl.querySelectorAll(':scope > .control');
    var count = controls.length;
    if (count <= ITEM_THRESHOLD) {
      listEl.style.columnCount = '';
      return;
    }
    var cols = Math.max(
      2,
      Math.min(MAX_COLUMNS, Math.ceil(count / ROWS_PER_COLUMN))
    );
    listEl.style.columnCount = String(cols);
  }

  // ── Reorder: checked items first within each list ──
  function reorderSelectedFirst(listEl) {
    var controls = listEl.querySelectorAll(':scope > .control');
    if (!controls.length) return;
    var checkedFrag = document.createDocumentFragment();
    var otherFrag = document.createDocumentFragment();
    for (var i = 0; i < controls.length; i++) {
      var cb = controls[i].querySelector('input[type="checkbox"]');
      if (cb && cb.checked) checkedFrag.appendChild(controls[i]);
      else otherFrag.appendChild(controls[i]);
    }
    listEl.appendChild(checkedFrag);
    listEl.appendChild(otherFrag);
  }

  // ── Shift-click range select, scoped to the modal ──
  // Attached on the backdrop element so it only sees clicks while the
  // modal is open. One anchor per list (we have one list per group).
  function installShiftClickInRoot(rootEl) {
    var anchors = new WeakMap();

    function resolveCheckbox(target) {
      if (!target || !target.closest) return null;
      if (target.tagName === 'INPUT' && target.type === 'checkbox') return target;
      var label = target.closest('label');
      if (!label) return null;
      var input = label.querySelector('input[type="checkbox"]');
      return (input && input.type === 'checkbox') ? input : null;
    }

    rootEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var cb = resolveCheckbox(e.target);
      if (!cb) return;
      var list = cb.closest('.' + CLASS_PREFIX + '-list');
      if (!list) return;

      if (e.shiftKey) {
        var anchor = anchors.get(list);
        if (anchor && anchor !== cb && list.contains(anchor)) {
          // Skip cb itself; native click will toggle it to the target
          // state naturally. We just set the in-between boxes.
          var all = Array.prototype.slice.call(
            list.querySelectorAll('input[type="checkbox"]')
          );
          var ai = all.indexOf(anchor);
          var bi = all.indexOf(cb);
          if (ai >= 0 && bi >= 0) {
            var lo = Math.min(ai, bi);
            var hi = Math.max(ai, bi);
            var target = !cb.checked;  // what cb will become after native toggle
            for (var i = lo; i <= hi; i++) {
              if (i === bi) continue;
              var node = all[i];
              if (node.checked !== target) {
                node.checked = target;
                node.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            try { window.getSelection().removeAllRanges(); } catch (_) {}
          }
          anchors.set(list, cb);
          return;
        }
      }
      anchors.set(list, cb);
    }, true);
  }

  // ── Modal construction ────────────────────────────────────────────
  // options: {
  //   title:        string,
  //   groups:       [{ label, items: [{id, identifier, checked}] }],
  //   onSave(ids):  function,
  //   onCancel():   function
  // }
  function openModal(options) {
    injectStyles();

    var backdrop = document.createElement('div');
    backdrop.className = CLASS_PREFIX + '-backdrop';

    var modal = document.createElement('div');
    modal.className = CLASS_PREFIX + '-modal';

    // Header
    var header = document.createElement('div');
    header.className = CLASS_PREFIX + '-header';
    var titleEl = document.createElement('h2');
    titleEl.className = CLASS_PREFIX + '-title';
    titleEl.textContent = options.title || 'Connected Devices';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = CLASS_PREFIX + '-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Inline error banner — hidden by default, shown via showError().
    var errorBar = document.createElement('div');
    errorBar.className = CLASS_PREFIX + '-error';
    errorBar.style.display = 'none';

    // Body — one list per group. Rendered by renderGroups() so setGroups
    // can swap contents in place (no close+reopen flicker).
    var body = document.createElement('div');
    body.className = CLASS_PREFIX + '-body';

    function renderGroups(groups) {
      body.innerHTML = '';
      if (!groups || !groups.length) {
        var empty = document.createElement('div');
        empty.className = CLASS_PREFIX + '-empty';
        empty.textContent = 'No candidates available.';
        body.appendChild(empty);
        return;
      }
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var groupEl = document.createElement('div');
        groupEl.className = CLASS_PREFIX + '-group';

        var labelEl = document.createElement('div');
        labelEl.className = CLASS_PREFIX + '-group-label';
        labelEl.textContent = group.label || '—';
        groupEl.appendChild(labelEl);

        var listEl = document.createElement('ul');
        listEl.className = CLASS_PREFIX + '-list';
        for (var i = 0; i < (group.items || []).length; i++) {
          var item = group.items[i];
          var li = document.createElement('li');
          li.className = 'control';
          var lbl = document.createElement('label');
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.value = item.id;
          if (item.checked) input.checked = true;
          var span = document.createElement('span');
          span.textContent = item.identifier || item.id;
          lbl.appendChild(input);
          lbl.appendChild(span);
          li.appendChild(lbl);
          listEl.appendChild(li);
        }
        groupEl.appendChild(listEl);
        body.appendChild(groupEl);

        reorderSelectedFirst(listEl);
        applyMultiColLayout(listEl);
      }
    }
    renderGroups(options.groups);

    // Footer
    var footer = document.createElement('div');
    footer.className = CLASS_PREFIX + '-footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = CLASS_PREFIX + '-btn';
    cancelBtn.textContent = 'Cancel';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = CLASS_PREFIX + '-btn ' + CLASS_PREFIX + '-btn-primary';
    saveBtn.textContent = 'Save';
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(errorBar);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    installShiftClickInRoot(backdrop);

    var closed = false;
    var saving = false;

    function close() {
      if (closed) return;
      closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey, true);
    }

    function readSelectedIds() {
      var ids = [];
      var checks = backdrop.querySelectorAll('.' + CLASS_PREFIX + '-list input[type="checkbox"]:checked');
      for (var i = 0; i < checks.length; i++) ids.push(checks[i].value);
      return ids;
    }

    /** Replace the modal body with a new set of groups, in place. */
    function setGroups(groups) {
      renderGroups(groups);
    }

    /** Toggle the modal's saving state — disables Save, swaps its label,
     *  and blocks cancel/backdrop-click so the user can't dismiss mid-PUT. */
    function setSaving(isSaving) {
      saving = !!isSaving;
      saveBtn.disabled = saving;
      cancelBtn.disabled = saving;
      closeBtn.disabled = saving;
      saveBtn.textContent = saving ? 'Saving…' : 'Save';
    }

    /** Show or clear an inline error banner inside the modal. */
    function showError(msg) {
      if (!msg) {
        errorBar.style.display = 'none';
        errorBar.textContent = '';
        return;
      }
      errorBar.textContent = msg;
      errorBar.style.display = 'block';
    }

    function tryCancel() {
      if (saving) return;
      close();
      if (typeof options.onCancel === 'function') options.onCancel();
    }

    closeBtn.addEventListener('click', tryCancel);
    cancelBtn.addEventListener('click', tryCancel);
    saveBtn.addEventListener('click', function () {
      if (saving) return;
      var ids = readSelectedIds();
      showError('');
      if (typeof options.onSave === 'function') options.onSave(ids);
    });
    // Click outside modal → cancel (but not mid-save)
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) tryCancel();
    });
    // Esc → cancel (but not mid-save)
    function onKey(e) {
      if (e.key === 'Escape') tryCancel();
    }
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(backdrop);

    return {
      close: close,
      setGroups: setGroups,
      setSaving: setSaving,
      showError: showError
    };
  }

  // ── Candidate fetching (chunk 3) ──────────────────────────────────
  // All candidate camera/reader line items are already rendered on
  // view_3586 — the SOW line-items view we're editing. Every row is the
  // same SOW (that's the view's scope), bucket classification lives in
  // field_2219, and the reciprocal on each camera row is field_2197.
  // So we read from Knack.views[view_3586].model directly and filter
  // client-side; no HTTP round-trip required.
  //
  // The earlier REST-based approach (GET /v1/pages/.../connections/
  // field_1957) 400s live on this scene — the endpoint isn't the one
  // the native popover uses, and even after matching the documented
  // filter shape the response never comes back. Reading the already-
  // loaded model is strictly simpler and faster.

  var CAMERAS_BUCKET_ID       = '6481e5ba38f283002898113c';
  var BUCKET_FIELD            = 'field_2219';
  var RECIPROCAL_FIELD        = 'field_2197';
  var SOW_CONNECTION_FIELD    = 'field_2154';
  var GROUPING_FIELD          = 'field_1946';   // MDF/IDF connection on SOW line item
  var IDENTIFIER_FIELD        = 'field_1950';   // Human label (E-001, RA-I-020, ...)

  function getViewModels() {
    if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[TARGET_VIEW]) return [];
    var view = Knack.views[TARGET_VIEW];
    var model = view && view.model;
    if (!model) return [];
    return (model.data && model.data.models) || model.models || [];
  }

  function readRecordAttrs(recordId) {
    var records = getViewModels();
    for (var i = 0; i < records.length; i++) {
      var entry = records[i];
      if (!entry) continue;
      var attrs = entry.attributes || entry;
      if (attrs && attrs.id === recordId) return attrs;
    }
    return null;
  }

  function getCurrentlySelectedIds(recordId) {
    var attrs = readRecordAttrs(recordId);
    if (!attrs) return [];
    var raw = attrs[TARGET_FIELD + '_raw'];
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id) out.push(raw[i].id);
    }
    return out;
  }

  function attrsHaveBucket(attrs, bucketId) {
    var raw = attrs[BUCKET_FIELD + '_raw'];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].id === bucketId) return true;
      }
      return false;
    }
    if (raw && typeof raw === 'object' && raw.id === bucketId) return true;
    return false;
  }

  function attrsReciprocalIsBlank(attrs) {
    var raw = attrs[RECIPROCAL_FIELD + '_raw'];
    if (Array.isArray(raw)) return raw.length === 0;
    if (!raw) return true;
    if (typeof raw === 'object' && !raw.id) return true;
    return false;
  }

  /** Enumerate camera/reader candidates from the view model.
   *  selectedIdSet: { id -> true } for items already picked by the clicked
   *  record — those always stay visible so the user can uncheck them,
   *  even if their reciprocal is no longer blank. */
  function collectCandidates(selectedIdSet) {
    var records = getViewModels();
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var entry = records[i];
      if (!entry) continue;
      var attrs = entry.attributes || entry;
      if (!attrs || !attrs.id) continue;
      if (!attrsHaveBucket(attrs, CAMERAS_BUCKET_ID)) continue;
      var alreadySelected = !!(selectedIdSet && selectedIdSet[attrs.id]);
      if (!alreadySelected && !attrsReciprocalIsBlank(attrs)) continue;
      out.push(attrs);
    }
    return out;
  }

  /** Group candidate records by their MDF/IDF identifier, preserving
   *  the model-provided order within each group. Records with a blank
   *  MDF/IDF land in a trailing "Unassigned" group. */
  function groupByMdfIdf(records, selectedIdSet) {
    var orderedLabels = [];
    var groupMap = {};  // label → { label, items }
    var UNASSIGNED_LABEL = 'Unassigned';

    function bucketFor(label) {
      if (!groupMap[label]) {
        groupMap[label] = { label: label, items: [] };
        orderedLabels.push(label);
      }
      return groupMap[label];
    }

    function identifierFor(attrs) {
      var raw = attrs[IDENTIFIER_FIELD];
      if (typeof raw === 'string' && raw.trim()) {
        return raw.replace(/<[^>]*>/g, '').trim();
      }
      if (attrs.identifier) return String(attrs.identifier).trim();
      return attrs.id;
    }

    for (var i = 0; i < records.length; i++) {
      var attrs = records[i];
      if (!attrs || !attrs.id) continue;
      var label = UNASSIGNED_LABEL;
      var raw = attrs[GROUPING_FIELD + '_raw'];
      if (Array.isArray(raw) && raw[0] && raw[0].identifier) {
        label = String(raw[0].identifier).trim() || UNASSIGNED_LABEL;
      } else if (attrs[GROUPING_FIELD]) {
        var stripped = String(attrs[GROUPING_FIELD]).replace(/<[^>]*>/g, '').trim();
        if (stripped) label = stripped;
      }
      bucketFor(label).items.push({
        id: attrs.id,
        identifier: identifierFor(attrs),
        checked: !!(selectedIdSet && selectedIdSet[attrs.id])
      });
    }

    // Pull Unassigned to the end if present
    var unassignedIdx = orderedLabels.indexOf(UNASSIGNED_LABEL);
    if (unassignedIdx !== -1 && unassignedIdx !== orderedLabels.length - 1) {
      orderedLabels.splice(unassignedIdx, 1);
      orderedLabels.push(UNASSIGNED_LABEL);
    }
    return orderedLabels.map(function (l) { return groupMap[l]; });
  }

  // ── Click interceptor (chunk 2) ───────────────────────────────────
  // Capture-phase listener on document. Knack's inline-edit wiring is
  // bubble-phase jQuery delegation on document, so our capture-phase
  // handler runs first. stopImmediatePropagation then prevents Knack
  // from seeing the click.
  //
  // The listener is document-wide but filters strictly: only fires when
  // the click lands on an editable td.field_1957 inside #view_3586.
  // Everything else (other fields, other views, locked cells, non-left-
  // click) falls through untouched to the normal handlers.
  var TARGET_VIEW  = 'view_3586';
  var TARGET_FIELD = 'field_1957';
  var RECORD_ID_RE = /^[0-9a-f]{24}$/i;

  function isCellLocked(td) {
    if (!td) return true;
    if (!td.classList.contains('cell-edit')) return true;       // not editable
    if (td.classList.contains('scw-cell-locked')) return true;  // lock-fields.js
    if (td.classList.contains('scw-ws-td-locked')) return true; // device-worksheet cell lock
    // Row-level lock (field_2551 = Yes → card gets scw-ws-locked)
    var card = td.closest('.scw-ws-card, .scw-ws-row');
    if (card && card.classList.contains('scw-ws-locked')) return true;
    return false;
  }

  function getRecordIdFromCell(td) {
    // device-worksheet moves the id onto the wsTr wrapper
    var wsTr = td.closest('tr.scw-ws-row');
    if (wsTr && wsTr.id && RECORD_ID_RE.test(wsTr.id)) return wsTr.id;
    // Flat view / pre-transform fallback
    var tr = td.closest('tr[id]');
    if (tr && RECORD_ID_RE.test(tr.id)) return tr.id;
    return null;
  }

  function handleCellClick(e) {
    if (!window.SCW.CONFIG.customConnectionPicker) return;
    if (e.button !== undefined && e.button !== 0) return;      // left-click only
    if (!e.target || !e.target.closest) return;

    var td = e.target.closest('td.' + TARGET_FIELD);
    if (!td) return;
    if (!td.closest('#' + TARGET_VIEW)) return;
    if (isCellLocked(td)) return;

    var recordId = getRecordIdFromCell(td);
    if (!recordId) return;

    // Intercept — Knack's native popover must not open.
    e.preventDefault();
    e.stopImmediatePropagation();

    openPickerForRecord(recordId, td);
  }

  // ── Save (chunk 4) ────────────────────────────────────────────────
  // Direct AJAX PUT against the parent record with the new field_1957
  // id array. On success:
  //   1. Patch Knack's Backbone model attrs (field_1957 + _raw) so
  //      subsequent reads don't revert to stale connection state.
  //   2. Fire a synthetic knack-cell-update.view_3586 carrying the
  //      updated record. SCW.silentRegroupView3586 (mirror-connection-
  //      sync.js) listens on that event and deterministically reparents
  //      the child rows, patches their field_2197 + field_1946, and
  //      fires per-child PUTs with a final model.fetch() to resync.
  //
  // We don't use Knack.views[...].model.updateRecord() because — per the
  // boolean-chips.js comment — that path silently fails in the worksheet
  // context where device-worksheet has restructured the rows. Direct PUT
  // is the pattern every other SCW device-worksheet writer uses today.
  function saveSelection(recordId, selectedIds, onDone) {
    if (!window.SCW || typeof window.SCW.knackAjax !== 'function' ||
        typeof window.SCW.knackRecordUrl !== 'function') {
      console.error('[scw-cp] SCW.knackAjax/knackRecordUrl unavailable — cannot save');
      if (typeof onDone === 'function') onDone(new Error('ajax helpers unavailable'));
      return;
    }
    var body = {};
    body[TARGET_FIELD] = selectedIds;

    window.SCW.knackAjax({
      type: 'PUT',
      url: window.SCW.knackRecordUrl(TARGET_VIEW, recordId),
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        // Patch Knack's model so the parent row reflects the new
        // selection immediately (no visible "flash then populate").
        if (typeof window.SCW.syncKnackModel === 'function') {
          try {
            window.SCW.syncKnackModel(TARGET_VIEW, recordId, resp, TARGET_FIELD, selectedIds);
          } catch (e) { /* best-effort */ }
        }

        // Patch the clicked row's worksheet card from the PUT response so
        // the field_1957 cell repaints with the new camera labels. The
        // mirror (triggered below) handles the reciprocal children via
        // the same patchCard helper, but not the parent — we have to.
        try {
          if (window.SCW && window.SCW.deviceWorksheet &&
              typeof window.SCW.deviceWorksheet.patchCard === 'function') {
            window.SCW.deviceWorksheet.patchCard(TARGET_VIEW, recordId, resp);
          }
        } catch (e) {
          console.warn('[scw-cp] patchCard threw for parent', e);
        }

        // Fire a synthetic cell-update event so the silent-regroup
        // mirror picks it up and handles the reciprocal children.
        try {
          var viewObj = (typeof Knack !== 'undefined' && Knack.views)
            ? Knack.views[TARGET_VIEW] : null;
          // The mirror reads record[TARGET_FIELD + '_raw'] on the
          // event payload; make sure it's populated from resp (Knack
          // returns the raw shape for connection fields).
          $(document).trigger('knack-cell-update.' + TARGET_VIEW, [viewObj, resp]);
        } catch (e) {
          console.warn('[scw-cp] cell-update trigger threw', e);
        }

        if (typeof onDone === 'function') onDone(null, resp);
      },
      error: function (xhr) {
        console.error('[scw-cp] save failed',
          xhr && xhr.status, xhr && xhr.responseText);
        if (typeof onDone === 'function') onDone(xhr || new Error('save failed'));
      }
    });
  }

  function openPickerForRecord(recordId, td) {
    var selectedIds = getCurrentlySelectedIds(recordId);
    var selectedSet = {};
    for (var i = 0; i < selectedIds.length; i++) selectedSet[selectedIds[i]] = true;

    // Candidates come straight from the view model — synchronous, no
    // network call — so we can build the grouped list before opening
    // the modal and skip the Loading… placeholder entirely.
    var candidates = collectCandidates(selectedSet);
    var grouped = groupByMdfIdf(candidates, selectedSet);

    // Orphans: currently-selected items whose reciprocal is no longer
    // blank AND whose row is not on this view page. Preserve them so
    // the user can still uncheck.
    var candidateById = {};
    for (var c = 0; c < candidates.length; c++) {
      candidateById[candidates[c].id] = true;
    }
    var orphans = [];
    for (var s = 0; s < selectedIds.length; s++) {
      var sid = selectedIds[s];
      if (!candidateById[sid]) {
        var attrs = readRecordAttrs(sid) || {};
        orphans.push({
          id: sid,
          identifier: (attrs[IDENTIFIER_FIELD] && String(attrs[IDENTIFIER_FIELD]).replace(/<[^>]*>/g, '').trim()) ||
                      attrs.identifier || sid,
          checked: true
        });
      }
    }
    if (orphans.length) {
      grouped.unshift({ label: 'Already selected', items: orphans });
    }

    var handle = openModal({
      title: 'Connected Devices',
      groups: grouped.length ? grouped : [{ label: 'No candidates', items: [] }],
      onSave: function (ids) {
        handle.setSaving(true);
        handle.showError('');
        saveSelection(recordId, ids, function (err) {
          if (err) {
            handle.setSaving(false);
            handle.showError('Failed to save. Please try again.');
            return;
          }
          handle.close();
        });
      },
      onCancel: function () { /* no-op */ }
    });
  }

  document.addEventListener('click', handleCellClick, true);

  // ── Public ────────────────────────────────────────────────────────
  window.SCW.connectionPicker = {
    open: openModal,

    /** DevTools helper: open the modal with fake data so the shell can
     *  be verified before click-interception + fetching are wired up. */
    _testOpen: function () {
      function mkItem(id, label, checked) {
        return { id: id, identifier: label, checked: !!checked };
      }
      var groups = [
        {
          label: 'HEADEND :: Default',
          items: [
            mkItem('a1', 'SCW 24 Port PoE Switch — SW24PEXT-V2 #1'),
            mkItem('a2', 'SCW 24 Port PoE Switch — SW24PEXT-V2 #2'),
            mkItem('a3', 'SCW 16 Port Gigabit PoE Switch #1', true)
          ]
        },
        {
          label: 'IDF: 01: Ground Floor Riser Room',
          items: (function () {
            var arr = [];
            for (var i = 1; i <= 48; i++) {
              arr.push(mkItem('idf01-' + i, 'E-' + (60 + i).toString().padStart(3, '0'), i === 2 || i === 5));
            }
            return arr;
          })()
        },
        {
          label: 'IDF: 02: Second Floor Riser Room',
          items: (function () {
            var arr = [];
            for (var i = 1; i <= 32; i++) {
              arr.push(mkItem('idf02-' + i, 'E-' + (110 + i).toString().padStart(3, '0')));
            }
            return arr;
          })()
        }
      ];
      openModal({
        title: 'Connected Devices',
        groups: groups,
        onSave: function (ids) { console.log('[scw-cp] save', ids); },
        onCancel: function () { console.log('[scw-cp] cancel'); }
      });
    }
  };
})();
/*** END FEATURE: Custom connection picker ********************************************/
