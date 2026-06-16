/*** WORKSHEET V2 — PICKER ****************************************************
 *
 * Connection-picker modal. Generic enough to handle every connection
 * field v2 cards need to edit:
 *   - field_1957 Connected Devices (multi, NVR → cameras/readers)
 *   - field_1958 Mounting Hardware (multi, line item → products)
 *   - any future single- or multi-connection field
 *
 * Public API:
 *   ns.picker.open({
 *     sourceViewKey:    'view_3962',          // for the PUT endpoint
 *     recordId:         '<24-hex>',           // record being edited
 *     fieldKey:         'field_1957',         // connection field on it
 *     label:            'Connected Devices',  // modal title
 *     selectedIds:      ['id1', 'id2', ...],  // currently connected
 *     candidates:       [recordAttrs, ...],   // pre-filtered options
 *     groupBy:          function (rec) -> {id, label},   // optional
 *     itemLabel:        function (rec) -> 'E-001 · NVR Pro 16ch',
 *     multi:            true,                 // false → single-select
 *     onSaved:          function (newIds) {} // after PUT success
 *   })
 *
 * Save fires a direct PUT via SCW.knackAjax — same pattern as
 * sub-variant-bid + edit.js. Sets field_<key> to the array of
 * selected ids (multi) or the single id (single-select).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function close(overlay, onKey) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (onKey) document.removeEventListener('keydown', onKey);
  }

  // ── Canonical record-picker grouping + sort (UI/UX directive) ─────
  // Any picker serving SOW line-item records groups by MDF/IDF and sorts in
  // the SAME order as the worksheet devices, for a consistent UI/UX. This is
  // the picker DEFAULT: open() with no `groupBy` uses groupByMdfIdf, and every
  // group's items are sorted by the canonical comparator below. Non-record
  // pickers (products, MDF/IDF locations, prefixes, SOWs) carry no field_1946,
  // so they collapse to a single flat list automatically — or opt out
  // explicitly with `groupBy: false`. (See CLAUDE.md "Picker conventions".)
  var MDF_IDF_FIELD = 'field_1946';
  var SORT_FIELD    = 'field_2218';

  // field_2218 (proposal-bucket sortOrder) can arrive as a plain number, a
  // connection-via-formula [{identifier}], or HTML-wrapped text. Mirror
  // groups.js readNumber so the picker order matches the worksheet exactly.
  function readSortNumber(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (typeof raw === 'number') return raw;
    if (Array.isArray(raw) && raw.length && raw[0]) {
      var ident = raw[0].identifier;
      if (typeof ident === 'number') return ident;
      if (typeof ident === 'string') { var ni = parseFloat(ident); if (isFinite(ni)) return ni; }
    }
    var s = rec[fieldKey];
    if (s == null) return null;
    s = String(s).replace(/<[^>]*>/g, ' ');
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  // Comma-joined SOW labels (SW-####) for a candidate record, read from its
  // SOW connection (field_2154). Empty string for non-record candidates
  // (products / MDF / prefixes) that carry no SOW. Shown under the item label.
  function sowLabelsOf(rec) {
    var raw = rec && rec.field_2154_raw;
    if (!Array.isArray(raw) || !raw.length) return '';
    var names = [];
    for (var i = 0; i < raw.length; i++) {
      var lbl = raw[i] && (raw[i].identifier || raw[i].id);
      if (lbl) names.push(String(lbl).replace(/<[^>]*>/g, '').trim());
    }
    return names.join(', ');
  }

  // Canonical groupBy: MDF/IDF location (field_1946). No-MDF records sink to a
  // "No MDF / IDF" group (id '__unknown' → sorted last).
  function groupByMdfIdf(rec) {
    var raw = rec && rec[MDF_IDF_FIELD + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) {
      var lbl = String(raw[0].identifier || '').replace(/<[^>]*>/g, '').trim();
      return { id: raw[0].id, label: lbl || 'MDF / IDF' };
    }
    return { id: '__unknown', label: 'No MDF / IDF' };
  }

  // Canonical item comparator — field_2218 (sortOrder) asc, blanks last, then
  // display label (natural/numeric), then record id. itemLabel is the
  // picker's resolved label fn.
  function canonicalItemSort(itemLabel) {
    return function (a, b) {
      var sa = readSortNumber(a, SORT_FIELD); if (sa == null) sa = Infinity;
      var sb = readSortNumber(b, SORT_FIELD); if (sb == null) sb = Infinity;
      if (sa !== sb) return sa - sb;
      var c = String(itemLabel(a)).localeCompare(String(itemLabel(b)),
        undefined, { numeric: true, sensitivity: 'base' });
      if (c) return c;
      return String(a.id || '').localeCompare(String(b.id || ''));
    };
  }

  /** Group candidates via opts.groupBy → [{ id, label, items: [...] }, ...].
   *  Default (undefined) = canonical MDF/IDF grouping; `false`/`null` opts out
   *  to a flat list. */
  function groupCandidates(candidates, groupBy) {
    if (groupBy === false || groupBy === null) {
      return [{ id: '__all', label: '', items: candidates.slice() }];
    }
    if (typeof groupBy !== 'function') groupBy = groupByMdfIdf;
    var groups = Object.create(null);
    var order = [];
    for (var i = 0; i < candidates.length; i++) {
      var g = groupBy(candidates[i]) || { id: '__unknown', label: 'Unassigned' };
      if (!groups[g.id]) {
        groups[g.id] = { id: g.id, label: g.label || '', items: [] };
        order.push(g.id);
      }
      groups[g.id].items.push(candidates[i]);
    }
    // A candidate set with no MDF/IDF anywhere collapses to one '__unknown'
    // group — render it FLAT (no lone "No MDF / IDF" header) so non-record
    // pickers look ungrouped.
    if (order.length === 1 && order[0] === '__unknown') {
      return [{ id: '__all', label: '', items: groups['__unknown'].items }];
    }
    // Sort groups: by label natural-asc; unknowns sink to bottom.
    order.sort(function (a, b) {
      var la = groups[a].label, lb = groups[b].label;
      if (a === '__unknown' && b !== '__unknown') return 1;
      if (b === '__unknown' && a !== '__unknown') return -1;
      return String(la).localeCompare(String(lb), undefined, {
        numeric: true, sensitivity: 'base'
      });
    });
    return order.map(function (k) { return groups[k]; });
  }

  function injectStyles() {
    if (document.getElementById('scw-ws-v2-picker-css')) return;
    var css = [
      '.scw-ws-v2-picker-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-ws-v2-picker {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  min-width: 480px; max-width: 640px;',
      '  max-height: 80vh; display: flex; flex-direction: column;',
      '  overflow: hidden;',
      '}',
      '.scw-ws-v2-picker-hd {',
      '  display: flex; align-items: baseline; gap: 12px;',
      '  padding: 14px 18px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  font-size: 15px; font-weight: 700; color: #07467c;',
      '}',
      '.scw-ws-v2-picker-hd .scw-ws-v2-picker-sub {',
      '  font-weight: 500; font-size: 12px; color: #64748b;',
      '  margin-left: auto;',
      '}',
      '.scw-ws-v2-picker-close {',
      '  flex: 0 0 auto;',
      '  width: 28px; height: 28px;',
      '  padding: 0;',
      '  background: transparent;',
      '  color: #64748b;',
      '  border: 0;',
      '  border-radius: 50%;',
      '  font: 700 22px/1 system-ui, sans-serif;',
      '  cursor: pointer;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '}',
      '.scw-ws-v2-picker-close:hover { background: #fee2e2; color: #b91c1c; }',
      '.scw-ws-v2-picker-item--none {',
      '  background: #f8fafc;',
      '  border-bottom: 1px solid #e2e8f0;',
      '  font-style: italic;',
      '  color: #64748b;',
      '}',
      '.scw-ws-v2-picker-item--none:hover { background: #f1f5f9; }',
      '.scw-ws-v2-picker-bd {',
      '  flex: 1 1 auto; overflow: auto; padding: 8px 0;',
      '}',
      '.scw-ws-v2-picker-empty {',
      '  padding: 24px;',
      '  text-align: center;',
      '  color: #64748b;',
      '  font-style: italic;',
      '}',
      '.scw-ws-v2-picker-group {',
      '  padding: 6px 18px 4px;',
      '  font: 700 11px/1.2 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: 0.05em;',
      '  text-transform: uppercase;',
      '  color: #475569;',
      '  background: #f8fafc;',
      '  border-top: 1px solid #e2e8f0;',
      '  border-bottom: 1px solid #e2e8f0;',
      '  position: sticky; top: 0; z-index: 2;',
      '}',
      '.scw-ws-v2-picker-item {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 6px 18px;',
      '  font-size: 13px; color: #1f2937;',
      '  cursor: pointer;',
      '  user-select: none; -webkit-user-select: none;',
      '  transition: background-color 80ms ease;',
      '}',
      '.scw-ws-v2-picker-item:hover { background: #f1f5f9; }',
      '.scw-ws-v2-picker-item-label {',
      '  font-weight: 600; color: #07467c;',
      '  min-width: 60px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.scw-ws-v2-picker-item-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }',
      '.scw-ws-v2-picker-item-name { }',
      '.scw-ws-v2-picker-item-sow {',
      '  font-size: 11px; font-weight: 600; color: #64748b; line-height: 1.2;',
      '}',
      '.scw-ws-v2-picker-item-sow b { font-weight: 700; color: #475569; }',
      '.scw-ws-v2-picker-item input[type=checkbox],',
      '.scw-ws-v2-picker-item input[type=radio] {',
      '  width: 16px; height: 16px; cursor: pointer;',
      '}',
      '.scw-ws-v2-picker-ft {',
      '  padding: 12px 18px;',
      '  border-top: 1px solid #e5e7eb;',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  gap: 12px;',
      '}',
      '.scw-ws-v2-picker-status {',
      '  font-size: 12px; color: #64748b;',
      '}',
      '.scw-ws-v2-picker-status--err { color: #b45309; }',
      '.scw-ws-v2-picker-actions { display: flex; gap: 8px; }',
      '.scw-ws-v2-picker-btn {',
      '  appearance: none; cursor: pointer;',
      '  padding: 8px 16px; border-radius: 6px;',
      '  font: 600 13px system-ui, sans-serif;',
      '  border: 1px solid transparent;',
      '}',
      '.scw-ws-v2-picker-btn--cancel {',
      '  background: #fff; color: #1f2937; border-color: #d1d5db;',
      '}',
      '.scw-ws-v2-picker-btn--cancel:hover { background: #f3f4f6; }',
      '.scw-ws-v2-picker-btn--confirm {',
      '  background: #07467c; color: #fff; border-color: #053659;',
      '}',
      '.scw-ws-v2-picker-btn--confirm:hover { background: #053659; }',
      '.scw-ws-v2-picker-btn[disabled] { opacity: 0.6; cursor: not-allowed; }',
      // Inline note section — appears only when all selections are cleared
      // (e.g. clearing the Bid requires a survey note in the SAME save).
      '.scw-ws-v2-picker-note {',
      '  border-top: 1px solid #e5e7eb;',
      '  background: #fffbeb;',
      '  padding: 12px 18px 14px;',
      '}',
      '.scw-ws-v2-picker-note[hidden] { display: none; }',
      '.scw-ws-v2-picker-note-title {',
      '  font: 700 12px system-ui, sans-serif; color: #92400e;',
      '  display: flex; align-items: center; gap: 6px; margin-bottom: 2px;',
      '}',
      '.scw-ws-v2-picker-note-help {',
      '  font-size: 12px; color: #78716c; margin: 0 0 8px;',
      '}',
      '.scw-ws-v2-picker-note textarea {',
      '  width: 100%; box-sizing: border-box;',
      '  min-height: 72px; resize: vertical;',
      '  padding: 8px 10px; border: 1px solid #d6b46a; border-radius: 6px;',
      '  font: 13px/1.4 system-ui, sans-serif; color: #1f2937; background: #fff;',
      '}',
      '.scw-ws-v2-picker-note textarea:focus {',
      '  outline: none; border-color: #b45309;',
      '  box-shadow: 0 0 0 3px rgba(180,83,9,0.15);',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'scw-ws-v2-picker-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Open the picker modal. */
  function open(opts) {
    if (!opts || !opts.fieldKey || !opts.recordId || !opts.sourceViewKey) {
      console.warn('[scw-ws-v2-picker] open() requires fieldKey, recordId, sourceViewKey');
      return;
    }
    injectStyles();

    var multi      = opts.multi !== false; // default true
    var selected   = (opts.selectedIds || []).slice();
    var candidates = (opts.candidates || []).slice();
    var groups     = groupCandidates(candidates, opts.groupBy);
    var itemLabel  = (typeof opts.itemLabel === 'function')
      ? opts.itemLabel
      : function (r) { return (r.identifier || r.id) || ''; };

    // Canonical item order — same as the worksheet devices: field_2218
    // (sortOrder) asc, then display label (natural/numeric), then id. Keeps
    // every picker's list consistent with the grid (e.g. E-001…E-010 within a
    // bucket, buckets in sortOrder).
    var itemCmp = canonicalItemSort(itemLabel);
    groups.forEach(function (g) { g.items.sort(itemCmp); });

    // Build modal scaffold
    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-picker-overlay';
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-picker';
    overlay.appendChild(card);

    var hd = document.createElement('div');
    hd.className = 'scw-ws-v2-picker-hd';
    hd.innerHTML = escapeHtml(opts.label || 'Pick a record') +
      '<span class="scw-ws-v2-picker-sub">' +
        (multi ? candidates.length + ' options' : 'Single select') +
      '</span>' +
      '<button type="button" class="scw-ws-v2-picker-close" aria-label="Close">&times;</button>';
    card.appendChild(hd);

    var bd = document.createElement('div');
    bd.className = 'scw-ws-v2-picker-bd';
    card.appendChild(bd);

    if (!candidates.length) {
      bd.innerHTML = '<div class="scw-ws-v2-picker-empty">No candidates available.</div>';
    } else {
      var inputType = multi ? 'checkbox' : 'radio';
      var inputName = 'scw-ws-v2-pick-' + opts.fieldKey;
      // Always-available "(no choice)" sentinel — same input name as
      // the regular options so the radio/checkbox model handles the
      // exclusivity automatically. Confirm reads `[name]:checked` and
      // builds the ids array — the none row\'s value is '' so it
      // serializes to either an empty string (single) or skipped
      // entirely (multi → resulting in `[]`).
      var noneRow = document.createElement('label');
      noneRow.className = 'scw-ws-v2-picker-item scw-ws-v2-picker-item--none';
      noneRow.innerHTML =
        '<input type="' + inputType + '" name="' + inputName + '" value=""' +
          (selected.length === 0 ? ' checked' : '') + '>' +
        '<span class="scw-ws-v2-picker-item-text">' +
          (multi ? 'Clear all selections' : '(no selection)') +
        '</span>';
      bd.appendChild(noneRow);
      groups.forEach(function (g) {
        if (g.label) {
          var head = document.createElement('div');
          head.className = 'scw-ws-v2-picker-group';
          head.textContent = g.label;
          bd.appendChild(head);
        }
        g.items.forEach(function (rec) {
          var row = document.createElement('label');
          row.className = 'scw-ws-v2-picker-item';
          var labelText = itemLabel(rec) || rec.id;
          var isChecked = selected.indexOf(rec.id) !== -1;
          // Show each record's SOW(s) (field_2154) beneath its label so the
          // user can tell which SOW a candidate belongs to — items on the
          // same MDF/IDF can live on different SOWs. Only rendered for record
          // candidates that actually carry a SOW connection.
          var sowText = sowLabelsOf(rec);
          var sowHtml = sowText
            ? '<span class="scw-ws-v2-picker-item-sow"><b>SOW:</b> ' + escapeHtml(sowText) + '</span>'
            : '';
          row.innerHTML =
            '<input type="' + inputType + '" name="' + inputName + '" value="' +
              escapeHtml(rec.id) + '"' + (isChecked ? ' checked' : '') + '>' +
            '<span class="scw-ws-v2-picker-item-text">' +
              '<span class="scw-ws-v2-picker-item-name">' + escapeHtml(labelText) + '</span>' +
              sowHtml +
            '</span>';
          bd.appendChild(row);
        });
      });
    }

    // Multi/checkbox-mode behaviors. Checkboxes that share a `name` do NOT
    // get radio-style exclusivity (only radios do), so the "Clear all
    // selections" row needs its mutual-exclusivity wired in JS.
    if (multi && candidates.length) {
      var optBoxes = Array.prototype.slice.call(bd.querySelectorAll(
        '.scw-ws-v2-picker-item:not(.scw-ws-v2-picker-item--none) input[type="checkbox"]'));
      var noneBox = bd.querySelector(
        '.scw-ws-v2-picker-item--none input[type="checkbox"]');
      var lastIdx = null;

      // "Clear all selections" — checking it unchecks every option.
      if (noneBox) {
        noneBox.addEventListener('change', function () {
          if (noneBox.checked) {
            optBoxes.forEach(function (b) { b.checked = false; });
            lastIdx = null;
          }
        });
      }

      // Suppress the browser's native shift-click text selection.
      bd.addEventListener('mousedown', function (e) {
        if (e.shiftKey) e.preventDefault();
      });

      optBoxes.forEach(function (box, idx) {
        box.addEventListener('click', function (e) {
          // Shift-click range select — click one option, then shift-click
          // another to set every option between them to the second's state
          // (Gmail / file-manager idiom).
          if (e.shiftKey && lastIdx !== null && lastIdx !== idx) {
            var lo = Math.min(lastIdx, idx), hi = Math.max(lastIdx, idx);
            var state = box.checked; // the just-clicked box's new state
            for (var k = lo; k <= hi; k++) optBoxes[k].checked = state;
          }
          // Selecting any option clears the "Clear all" sentinel.
          if (box.checked && noneBox) noneBox.checked = false;
          lastIdx = idx;
        });
      });
    }

    // ── Inline "clear note" section ──────────────────────────────────
    // When opts.clearNote is configured (e.g. the Bid picker), clearing
    // every selection requires a note written in the SAME PUT. Rather than
    // stack a second modal, the note field lives inside the picker and is
    // revealed only while no option is selected. Prefilled with the record's
    // current note so the user appends/edits rather than starting blank.
    var noteWrap = null, noteTextarea = null;
    var clearNote = (opts.clearNote && multi) ? opts.clearNote : null;
    if (clearNote) {
      var curNote = (clearNote.current != null)
        ? String(clearNote.current).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
        : '';
      noteWrap = document.createElement('div');
      noteWrap.className = 'scw-ws-v2-picker-note';
      noteWrap.innerHTML =
        '<div class="scw-ws-v2-picker-note-title">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
            '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
          '</svg>' +
          escapeHtml(clearNote.title || 'Survey note required') +
        '</div>' +
        '<p class="scw-ws-v2-picker-note-help">' +
          escapeHtml(clearNote.help ||
            "You're clearing this connection — add or edit the note explaining why.") +
        '</p>' +
        '<textarea placeholder="' + escapeHtml(clearNote.placeholder || '') + '"></textarea>';
      card.appendChild(noteWrap);
      noteTextarea = noteWrap.querySelector('textarea');
      noteTextarea.value = curNote;
    }

    // Reveal the note section only while nothing is selected (all cleared).
    function anySelected() {
      var checked = bd.querySelectorAll(
        'input[name="scw-ws-v2-pick-' + opts.fieldKey + '"]:checked');
      for (var i = 0; i < checked.length; i++) { if (checked[i].value) return true; }
      return false;
    }
    function syncNoteVisibility() {
      if (!noteWrap) return;
      noteWrap.hidden = anySelected();
    }
    if (noteWrap) {
      // React to every input toggle (option clicks + the "Clear all" row).
      bd.addEventListener('change', syncNoteVisibility);
      syncNoteVisibility();
    }

    var ft = document.createElement('div');
    ft.className = 'scw-ws-v2-picker-ft';
    ft.innerHTML =
      '<span class="scw-ws-v2-picker-status"></span>' +
      '<div class="scw-ws-v2-picker-actions">' +
        '<button type="button" class="scw-ws-v2-picker-btn scw-ws-v2-picker-btn--confirm">Save</button>' +
      '</div>';
    card.appendChild(ft);

    var statusEl  = ft.querySelector('.scw-ws-v2-picker-status');
    // Cancel is now the X in the header. Keep the binding name
    // so the in-flight handlers (which call cancelBtn.disabled = …)
    // still resolve to a real element.
    var cancelBtn = hd.querySelector('.scw-ws-v2-picker-close');
    var confirmBtn = ft.querySelector('.scw-ws-v2-picker-btn--confirm');

    function setStatus(msg, err) {
      statusEl.className = 'scw-ws-v2-picker-status' + (err ? ' scw-ws-v2-picker-status--err' : '');
      statusEl.textContent = msg || '';
    }

    function onKey(e) { if (e.key === 'Escape') close(overlay, onKey); }
    document.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', function () { close(overlay, onKey); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close(overlay, onKey);
    });

    confirmBtn.addEventListener('click', function () {
      var inputs = bd.querySelectorAll('input[name="' + 'scw-ws-v2-pick-' + opts.fieldKey + '"]:checked');
      var ids = [];
      for (var i = 0; i < inputs.length; i++) {
        // The "(no selection)" row\'s value is '' — drop it so the
        // confirm sends [] for multi / '' for single, which Knack
        // interprets as "clear the connection".
        var v = inputs[i].value;
        if (v) ids.push(v);
      }

      // Bulk-edit mode: caller wants the chosen ids only — no PUT.
      // Used by bulk.js to capture a value the user picked once and
      // then apply it across N records via its own concurrency queue.
      if (opts.pickOnly && typeof opts.onChoose === 'function') {
        close(overlay, onKey);
        opts.onChoose(ids);
        return;
      }

      // Integrated "clear note" — when every selection is cleared and a
      // clearNote field is configured (the Bid picker), the note written into
      // the inline textarea is required and rides in the SAME PUT. No second
      // modal: the note field is part of this picker.
      var extra = null;
      if (clearNote && ids.length === 0) {
        var noteVal = noteTextarea ? noteTextarea.value.trim() : '';
        if (!noteVal) {
          setStatus(clearNote.requiredMsg || 'A note is required to clear this.', true);
          if (noteWrap) { noteWrap.hidden = false; }
          if (noteTextarea) noteTextarea.focus();
          return;
        }
        extra = {};
        extra[clearNote.fieldKey] = noteVal;
        // Let the caller suppress any downstream re-prompt (e.g. survey-bid-
        // validate's knack-cell-update gate) now that the note is handled here.
        if (typeof clearNote.onClear === 'function') {
          try { clearNote.onClear(noteVal); } catch (e) {}
        }
      }

      doSave(ids, extra);
    });

    // Build the PUT body (the chosen ids + any extra fields, e.g. the
    // integrated clearNote survey note) and write it. Extracted so the
    // confirm handler stays a thin validate-then-save shell.
    function doSave(ids, extra) {
      // Always send connection fields as arrays — Knack\'s REST API
      // accepts arrays for single- and multi-connection writes alike,
      // but a bare string can silently no-op on connection fields
      // whose mirror (or the field itself) is many-sided. Sending
      // [id] (or [] to clear) is the safe canonical form.
      var body = {};
      body[opts.fieldKey] = ids;
      // Extra fields (e.g. the integrated clearNote) ride in the same PUT.
      if (extra) {
        for (var _ek in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, _ek)) body[_ek] = extra[_ek];
        }
      }

      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      setStatus('Saving…');

      var putKey = opts.putViewKey || opts.sourceViewKey;

      try {
        SCW.knackAjax({
          // PUT URL is normally the source view, but for fields whose
          // mirror-connection-sync cascade is bound to a DIFFERENT
          // view (e.g. field_1957 — its cascade lives on view_3610,
          // not v2's source view_3962), the caller can override
          // putViewKey so the cascade runs on the view that's bound.
          url:  SCW.knackRecordUrl(putKey, opts.recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function (resp) {
            // ── Wire up the cascade ─────────────────────────────────
            // SCW.knackAjax's PUT updates Knack's data server-side but
            // does NOT fire knack-cell-update on its own — that event
            // is Knack's inline-edit-internal signal. mirror-connection-
            // sync listens for knack-cell-update.<putViewKey>, so unless
            // we do two extra things ourselves the cascade never runs:
            //
            //   1. Patch the local Backbone model for putViewKey with
            //      the new attrs so a subsequent read in the cascade
            //      reflects the user's selection (not the pre-PUT state).
            //
            //   2. Dispatch knack-cell-update.<putViewKey> with the
            //      same (view, record) args Knack would normally pass,
            //      so mirror-connection-sync's handler treats it like
            //      a real inline edit.
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                // Pass the value as {id} objects, not bare id strings. When
                // the PUT response has no _raw companion, syncKnackModel
                // stores this value as field_X_raw — and mirror-connection-
                // sync's cascades read entry.id off each _raw element. An
                // array of bare strings made them see "no children" and clear
                // the reciprocal (Connected To) instead of re-pointing it.
                var rawObjs = (body[opts.fieldKey] || []).map(function (v) {
                  return (v && typeof v === 'object') ? v : { id: v };
                });
                SCW.syncKnackModel(putKey, opts.recordId, resp,
                  opts.fieldKey, rawObjs);
              }
              var view = Knack.views[putKey];
              if (view && view.model && view.model.data) {
                var rec = (typeof view.model.data.get === 'function')
                  ? view.model.data.get(opts.recordId)
                  : null;
                if (rec) {
                  // Pass the edited field key as a 4th arg so mirror-
                  // connection-sync can tell an MDF/IDF move (field_1946)
                  // apart from a connection edit (field_2197/field_1957).
                  // Native Knack inline edits don't supply this, so the
                  // mirror falls back to its cache-diff path there.
                  //
                  // 5th arg: the AUTHORITATIVE ids the user just chose
                  // (the exact PUT body). field_1957 and field_2197 are
                  // SEPARATE Knack fields kept aligned only by the cascade
                  // — so the cascade MUST know precisely what was selected.
                  // Relying on the Backbone model is unsafe: a refetch can
                  // race ahead of the server commit and repopulate the old
                  // value, making the cascade clear connections that are
                  // actually still selected. Passing the chosen ids removes
                  // that ambiguity entirely.
                  $(document).trigger(
                    'knack-cell-update.' + putKey,
                    [view, rec.attributes || rec, opts.fieldKey, (body[opts.fieldKey] || [])]
                  );
                }
              }
            } catch (eSync) {
              console.warn('[scw-ws-v2-picker] cascade trigger failed', eSync);
            }

            close(overlay, onKey);
            if (typeof opts.onSaved === 'function') opts.onSaved(ids, resp);
          },
          error: function (xhr) {
            console.warn('[scw-ws-v2-picker] PUT failed', xhr);
            setStatus('Save failed. Try again.', true);
            confirmBtn.disabled = false;
            cancelBtn.disabled  = false;
          }
        });
      } catch (e) {
        setStatus('Save failed. Try again.', true);
        confirmBtn.disabled = false;
        cancelBtn.disabled  = false;
      }
    }

    document.body.appendChild(overlay);
  }

  ns.picker = {
    open:          open,
    // Canonical MDF/IDF groupBy — exported so callers can pass it explicitly,
    // though open() already uses it by default for record pickers.
    groupByMdfIdf: groupByMdfIdf
  };
})();
/*** END WORKSHEET V2 — PICKER ************************************************/
