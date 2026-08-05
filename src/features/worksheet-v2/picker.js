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

  // Connection fields whose optimistic write must NOT be protected by the
  // pending-writes overlay after a save. These are the mirror-connection-sync
  // cascade fields (field_1957↔field_2197, field_2380↔field_2381, accessory
  // field_2464 / field_1958 / field_2207): their reconciliation diffs against
  // the SERVER truth on refetch, so re-applying a client overlay would mask a
  // legitimate cascade correction. Every OTHER connection (bid field_2415,
  // MDF/IDF field_2375, product, SOW …) is safe to overlay.
  var CASCADE_OVERLAY_SKIP = {
    field_1957: 1, field_2197: 1, field_2380: 1, field_2381: 1,
    field_1958: 1, field_2207: 1, field_2464: 1
  };

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
      if (!raw[i]) continue;
      // Identifier can be blank on freshly created SOWs — resolve the
      // friendly name via card.js's scene-grid lookup before falling
      // back to the raw record id.
      var lbl = String(raw[i].identifier || '').replace(/<[^>]*>/g, '').trim() ||
        (ns.sowNameById && ns.sowNameById(raw[i].id)) || raw[i].id;
      if (lbl) names.push(lbl);
    }
    return names.join(', ');
  }

  // SOW record IDS for a candidate (same field_2154 read as sowLabelsOf) —
  // used to compare a candidate's SOW membership against the record being
  // edited (opts.anchorSowIds) so cross-SOW picks are flagged.
  function sowIdsOf(rec) {
    var raw = rec && rec.field_2154_raw;
    if (!Array.isArray(raw)) return [];
    var ids = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id) ids.push(raw[i].id);
    }
    return ids;
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
   *  to a flat list. groupBy may return an optional numeric `rank` — groups
   *  order by rank asc FIRST (default 0), then label natural-asc, so a caller
   *  can float priority groups to the top (e.g. the re-link picker's
   *  "no bid item yet" partition) without hacking sortable label prefixes. */
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
        groups[g.id] = { id: g.id, label: g.label || '', rank: g.rank || 0, items: [] };
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
    // Sort groups: rank asc, then label natural-asc; unknowns sink to bottom.
    order.sort(function (a, b) {
      var ra = groups[a].rank || 0, rb = groups[b].rank || 0;
      if (ra !== rb) return ra - rb;
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
      '.scw-ws-v2-picker-search {',
      '  padding: 10px 18px; border-bottom: 1px solid #e5e7eb; background: #fff;',
      '  flex: 0 0 auto;',
      '}',
      '.scw-ws-v2-picker-search-input {',
      '  width: 100%; box-sizing: border-box;',
      '  padding: 8px 12px; font-size: 13px;',
      '  border: 1px solid #cbd5e1; border-radius: 7px;',
      '  outline: none; color: #1f2937;',
      '}',
      '.scw-ws-v2-picker-search-input:focus {',
      '  border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15);',
      '}',
      '.scw-ws-v2-picker-search-empty {',
      '  padding: 18px; text-align: center; color: #64748b; font-style: italic;',
      '}',
      /* SOW filter pills — toggle the list to ONLY items on a given SOW. */
      '.scw-ws-v2-picker-sowpills {',
      '  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;',
      '  padding: 10px 18px; border-bottom: 1px solid #e5e7eb; background: #fff;',
      '  flex: 0 0 auto;',
      '}',
      '.scw-ws-v2-picker-sowpills-lbl {',
      '  font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .05em; color: #64748b; margin-right: 2px;',
      '}',
      '.scw-ws-v2-picker-sowpill {',
      '  padding: 3px 10px; border-radius: 999px; border: 1px solid #cbd5e1;',
      '  background: #fff; color: #334155; cursor: pointer;',
      '  font: 600 11.5px/1.4 system-ui, sans-serif;',
      '  transition: background .12s, border-color .12s;',
      '}',
      '.scw-ws-v2-picker-sowpill:hover { border-color: #94a3b8; background: #f8fafc; }',
      '.scw-ws-v2-picker-sowpill--active {',
      '  background: #0f4c75; border-color: #0f4c75; color: #fff;',
      '}',
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
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 6px 18px 4px;',
      '  font: 700 11px/1.2 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: 0.05em;',
      '  text-transform: uppercase;',
      '  color: #475569;',
      '  background: #f8fafc;',
      '  border-top: 1px solid #e2e8f0;',
      '  border-bottom: 1px solid #e2e8f0;',
      '  position: sticky; top: 0; z-index: 2;',
      '  cursor: pointer; user-select: none; -webkit-user-select: none;',
      '}',
      '.scw-ws-v2-picker-group:hover { background: #eef2f7; }',
      '.scw-ws-v2-picker-group-chev {',
      '  flex: 0 0 auto; display: inline-flex;',
      '  transition: transform 120ms ease;',
      '}',
      '.scw-ws-v2-picker-groupwrap.is-collapsed .scw-ws-v2-picker-group-chev {',
      '  transform: rotate(-90deg);',
      '}',
      '.scw-ws-v2-picker-group-lbl { flex: 1 1 auto; min-width: 0; }',
      // "sel / total" tally per group — total = devices in the section,
      // first number = how many are currently checked (live).
      '.scw-ws-v2-picker-group-count {',
      '  flex: 0 0 auto;',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0;',
      '  color: #475569; background: #e2e8f0;',
      '  padding: 3px 8px; border-radius: 999px;',
      '  font-variant-numeric: tabular-nums; text-transform: none;',
      '}',
      '.scw-ws-v2-picker-group-count.has-sel { color: #fff; background: #07467c; }',
      '.scw-ws-v2-picker-groupwrap.is-collapsed .scw-ws-v2-picker-group-body {',
      '  display: none;',
      '}',
      // While the search box has a query, collapsed groups open so
      // matches are never hidden; collapse state returns when cleared.
      '.scw-ws-v2-picker-bd.is-searching .scw-ws-v2-picker-group-body {',
      '  display: block !important;',
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
      // Generic secondary line beneath the name (e.g. a product SKU).
      // Rendered from a candidate\'s `sub` property; searchable because the
      // filter matches the row\'s full textContent.
      '.scw-ws-v2-picker-item-sub {',
      '  font-size: 11px; font-weight: 600; color: #64748b; line-height: 1.2;',
      '  letter-spacing: .02em;',
      '}',
      '.scw-ws-v2-picker-item-sow {',
      '  font-size: 11px; font-weight: 600; color: #64748b; line-height: 1.2;',
      '}',
      '.scw-ws-v2-picker-item-sow b { font-weight: 700; color: #475569; }',
      // Candidate lives on a DIFFERENT SOW than the record being edited —
      // amber (warning convention), never red.
      '.scw-ws-v2-picker-item-sow--none { color: #94a3b8; font-style: italic; }',
      '.scw-ws-v2-picker-item-sow--none b { color: #94a3b8; }',
      '.scw-ws-v2-picker-item-sow--diff { color: #b45309; }',
      '.scw-ws-v2-picker-item-sow--diff b { color: #b45309; }',
      '.scw-ws-v2-picker-item-sow--diff svg { vertical-align: -1px; margin-right: 2px; }',
      '.scw-ws-v2-picker-item input[type=checkbox],',
      '.scw-ws-v2-picker-item input[type=radio] {',
      '  width: 16px; height: 16px; cursor: pointer;',
      '}',
      // Locked item — claimed by another device. Grayed, non-selectable
      // until the user clicks "Take over".
      '.scw-ws-v2-picker-item--locked {',
      '  color: #94a3b8; cursor: default;',
      '}',
      '.scw-ws-v2-picker-item--locked:hover { background: transparent; }',
      '.scw-ws-v2-picker-item--locked .scw-ws-v2-picker-item-name { color: #94a3b8; }',
      '.scw-ws-v2-picker-item--locked input { cursor: not-allowed; }',
      '.scw-ws-v2-picker-item-lock {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  font-size: 11px; font-weight: 600; color: #b45309; line-height: 1.2;',
      '}',
      '.scw-ws-v2-picker-takeover {',
      '  flex: 0 0 auto; margin-left: auto;',
      '  appearance: none; cursor: pointer;',
      '  padding: 3px 10px; border-radius: 999px;',
      '  font: 600 11px system-ui, sans-serif;',
      '  color: #b45309; background: #fff; border: 1px solid #f0c489;',
      '}',
      '.scw-ws-v2-picker-takeover:hover { background: #fffbeb; border-color: #d97706; }',
      // Once stealing, the row re-lights and the button flips to "Undo".
      '.scw-ws-v2-picker-item--stealing { color: #1f2937; }',
      '.scw-ws-v2-picker-item--stealing .scw-ws-v2-picker-item-name { color: #07467c; }',
      '.scw-ws-v2-picker-item--stealing .scw-ws-v2-picker-takeover {',
      '  color: #fff; background: #d97706; border-color: #b45309;',
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
      // Blocking "syncing connected records" state — the modal stays open
      // and locked until the reciprocal cascade settles so the user can\'t
      // navigate or start another edit mid-sync.
      '.scw-ws-v2-picker-status--sync {',
      '  color: #07467c; font-weight: 700;',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '}',
      '.scw-ws-v2-picker-status--sync::before {',
      '  content: ""; width: 13px; height: 13px; flex: 0 0 auto;',
      '  border: 2px solid rgba(7,70,124,0.3); border-top-color: #07467c;',
      '  border-radius: 50%; display: inline-block;',
      '  animation: scwWsV2PickerSpin 0.8s linear infinite;',
      '}',
      '@keyframes scwWsV2PickerSpin { to { transform: rotate(360deg); } }',
      '.scw-ws-v2-picker-overlay.is-syncing { cursor: wait; }',
      '.scw-ws-v2-picker-overlay.is-syncing .scw-ws-v2-picker-bd {',
      '  opacity: 0.5; pointer-events: none;',
      '}',
      '.scw-ws-v2-picker-actions { display: flex; gap: 10px; align-items: center; }',
      '.scw-ws-v2-picker-count {',
      '  font: 600 12px system-ui, sans-serif; color: #475569;',
      '  font-variant-numeric: tabular-nums; white-space: nowrap;',
      '}',
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
    var stateFn    = (typeof opts.itemState === 'function') ? opts.itemState : null;

    // Canonical item order — same as the worksheet devices: field_2218
    // (sortOrder) asc, then display label (natural/numeric), then id. Keeps
    // every picker's list consistent with the grid (e.g. E-001…E-010 within a
    // bucket, buckets in sortOrder).
    var itemCmp = canonicalItemSort(itemLabel);
    // Optional opts.itemRank(rec) → number: a coarse partition WITHIN each
    // group applied before the canonical comparator (rank asc). Lets the
    // Connected Devices picker keep SOW-carrying items ahead of no-SOW
    // items inside the same MDF/IDF section without forking the sort.
    var rankFn = (typeof opts.itemRank === 'function') ? opts.itemRank : null;
    var rankedCmp = rankFn
      ? function (a, b) {
          var ra = rankFn(a) || 0, rb = rankFn(b) || 0;
          if (ra !== rb) return ra - rb;
          return itemCmp(a, b);
        }
      : itemCmp;
    groups.forEach(function (g) { g.items.sort(rankedCmp); });

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
        // Anchor context (e.g. "This device: SW-1361") so cross-SOW
        // flags on the items have a visible baseline to compare against.
        (opts.anchorSowLabels
          ? ' · This device: ' + escapeHtml(opts.anchorSowLabels) : '') +
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
      // Suppressed via allowClear:false — e.g. bulk "Add to existing" mode,
      // where "clear" is meaningless (you can only ADD records, never clear).
      if (opts.allowClear !== false) {
        var noneRow = document.createElement('label');
        noneRow.className = 'scw-ws-v2-picker-item scw-ws-v2-picker-item--none';
        noneRow.innerHTML =
          '<input type="' + inputType + '" name="' + inputName + '" value=""' +
            (selected.length === 0 ? ' checked' : '') + '>' +
          '<span class="scw-ws-v2-picker-item-text">' +
            (multi ? 'Clear all selections' : '(no selection)') +
          '</span>';
        bd.appendChild(noneRow);
      }
      // Group sections are wrappers of (clickable header + body) so each
      // MDF/IDF can collapse. Auto-collapse below keeps big pickers
      // scannable; headers carry a live "checked / total" tally.
      var groupWraps = [];   // [{ wrap, body, countEl }]
      groups.forEach(function (g) {
        var itemHost = bd;
        if (g.label) {
          var wrap = document.createElement('div');
          wrap.className = 'scw-ws-v2-picker-groupwrap';
          var head = document.createElement('div');
          head.className = 'scw-ws-v2-picker-group';
          head.setAttribute('role', 'button');
          head.setAttribute('title', 'Click to collapse / expand this section');
          head.innerHTML =
            '<span class="scw-ws-v2-picker-group-chev">' +
              '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
                'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="6 9 12 15 18 9"/></svg>' +
            '</span>' +
            '<span class="scw-ws-v2-picker-group-lbl">' + escapeHtml(g.label) + '</span>' +
            '<span class="scw-ws-v2-picker-group-count"></span>';
          var body = document.createElement('div');
          body.className = 'scw-ws-v2-picker-group-body';
          wrap.appendChild(head);
          wrap.appendChild(body);
          bd.appendChild(wrap);
          head.addEventListener('click', function () {
            wrap.classList.toggle('is-collapsed');
          });
          groupWraps.push({
            wrap: wrap, body: body,
            countEl: head.querySelector('.scw-ws-v2-picker-group-count'),
            total: g.items.length
          });
          itemHost = body;
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
          // Cross-SOW flag: when the caller supplies the edited record's own
          // SOW ids (opts.anchorSowIds), a candidate sharing NONE of them is
          // on a different SOW — amber + warning triangle so e.g. a camera
          // on SW-1060 stands out inside a switch that lives on SW-1001.
          var sowDiff = false;
          if (sowText && Array.isArray(opts.anchorSowIds) && opts.anchorSowIds.length) {
            var candSows = sowIdsOf(rec);
            if (candSows.length) {
              sowDiff = true;
              for (var cs = 0; cs < candSows.length; cs++) {
                if (opts.anchorSowIds.indexOf(candSows[cs]) !== -1) { sowDiff = false; break; }
              }
            }
          }
          var sowHtml = sowText
            ? '<span class="scw-ws-v2-picker-item-sow' +
                (sowDiff ? ' scw-ws-v2-picker-item-sow--diff' : '') + '"' +
                (sowDiff ? ' title="On a different SOW than the record you\'re editing"' : '') + '>' +
                (sowDiff
                  ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
                      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
                      '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
                  : '') +
                '<b>SOW:</b> ' + escapeHtml(sowText) + '</span>'
            : '';
          // No-SOW candidate on a SOW-aware picker (anchorSowIds supplied):
          // render a muted "SOW: —" so the no-SOW tail inside a group is
          // visibly distinct from SOW-carrying items, not just unlabeled.
          if (!sowHtml && Array.isArray(opts.anchorSowIds) && opts.anchorSowIds.length) {
            sowHtml = '<span class="scw-ws-v2-picker-item-sow ' +
              'scw-ws-v2-picker-item-sow--none"><b>SOW:</b> &mdash;</span>';
          }
          // Per-item "locked" state (opts.itemState). Used by the Connected
          // Devices picker to SHOW cam/readers already claimed by another
          // device — grayed + a "Take over" button — instead of hiding them,
          // so the user sees WHY a device isn't freely available and can
          // deliberately steal it. An already-selected (ours) item is never
          // locked. `note` (e.g. "Connected to E-005 · NVR 16ch") is shown
          // beneath the label.
          var st = stateFn ? (stateFn(rec) || {}) : {};
          var locked = !!st.locked && !isChecked;
          if (locked) row.className += ' scw-ws-v2-picker-item--locked';
          var lockHtml = (locked && st.note)
            ? '<span class="scw-ws-v2-picker-item-lock">' +
                '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
                  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                  '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
                  '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
                escapeHtml(st.note) +
              '</span>'
            : '';
          var takeoverHtml = locked
            ? '<button type="button" class="scw-ws-v2-picker-takeover">Take over</button>'
            : '';
          // Optional secondary line (candidate `sub`, e.g. product SKU) —
          // shown muted beneath the name, included in the search filter.
          var subHtml = rec.sub
            ? '<span class="scw-ws-v2-picker-item-sub">' + escapeHtml(rec.sub) + '</span>'
            : '';
          row.innerHTML =
            '<input type="' + inputType + '" name="' + inputName + '" value="' +
              escapeHtml(rec.id) + '"' + (isChecked ? ' checked' : '') +
              (locked ? ' disabled' : '') + '>' +
            '<span class="scw-ws-v2-picker-item-text">' +
              '<span class="scw-ws-v2-picker-item-name">' + escapeHtml(labelText) + '</span>' +
              subHtml +
              lockHtml +
              sowHtml +
            '</span>' +
            takeoverHtml;
          // SOW membership stamp — the SOW filter pills read this to show
          // ONLY the items on the active SOW.
          var rowSows = sowIdsOf(rec);
          if (rowSows.length) row.setAttribute('data-scw-sows', rowSows.join(','));
          itemHost.appendChild(row);
        });
      });

      // ── Group tallies + auto-collapse ─────────────────────────────
      // Each header shows "checked / total" (live). With multiple groups
      // and a big candidate list, groups holding NO current selection
      // start collapsed — one click opens them; the tally says what's
      // inside without scrolling.
      if (groupWraps.length) {
        var syncGroupCounts = function () {
          for (var gi = 0; gi < groupWraps.length; gi++) {
            var gw = groupWraps[gi];
            var n = 0;
            var boxes = gw.body.querySelectorAll('input:checked');
            for (var bi = 0; bi < boxes.length; bi++) {
              if (boxes[bi].value) n++;
            }
            gw.countEl.textContent = n + ' / ' + gw.total;
            gw.countEl.classList.toggle('has-sel', n > 0);
          }
        };
        bd.addEventListener('change', syncGroupCounts);
        syncGroupCounts();

        var AUTO_COLLAPSE_MIN = 16;
        if (groupWraps.length > 1 && candidates.length >= AUTO_COLLAPSE_MIN) {
          for (var gc = 0; gc < groupWraps.length; gc++) {
            if (!groupWraps[gc].body.querySelector('input:checked')) {
              groupWraps[gc].wrap.classList.add('is-collapsed');
            }
          }
        }
      }
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
            // Never toggle a locked (disabled) box via range-select — those
            // are claimed by another device and must be stolen explicitly.
            for (var k = lo; k <= hi; k++) {
              if (!optBoxes[k].disabled) optBoxes[k].checked = state;
            }
          }
          // Selecting any option clears the "Clear all" sentinel.
          if (box.checked && noneBox) noneBox.checked = false;
          lastIdx = idx;
        });
      });
    }

    // ── "Take over" (steal a locked item) ────────────────────────────
    // Locked items (claimed by another device) render a disabled checkbox
    // + a "Take over" button. Clicking it enables + checks the box and
    // flags the row as stealing; clicking again releases it. Explicit, so
    // reassigning a cam/reader away from its current device is deliberate.
    if (candidates.length) {
      bd.addEventListener('click', function (e) {
        var tb = e.target && e.target.closest &&
          e.target.closest('.scw-ws-v2-picker-takeover');
        if (!tb) return;
        // Inside a <label>: stop the click from toggling the (disabled) input
        // and from bubbling to the row.
        e.preventDefault();
        e.stopPropagation();
        var row = tb.closest('.scw-ws-v2-picker-item');
        if (!row) return;
        var box = row.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!box) return;
        var stealing = row.classList.toggle('scw-ws-v2-picker-item--stealing');
        if (stealing) {
          box.disabled = false;
          box.checked  = true;
          tb.textContent = 'Undo';
          // For single-select, taking one over clears the others.
          if (!multi) {
            var others = bd.querySelectorAll(
              'input[name="scw-ws-v2-pick-' + opts.fieldKey + '"]');
            for (var o = 0; o < others.length; o++) {
              if (others[o] !== box) others[o].checked = false;
            }
          }
          var noneNow = bd.querySelector(
            '.scw-ws-v2-picker-item--none input');
          if (noneNow) noneNow.checked = false;
        } else {
          box.checked  = false;
          box.disabled = true;
          tb.textContent = 'Take over';
        }
        // Nudge the count / note listeners bound on bd's change event.
        var ev;
        try { ev = new Event('change', { bubbles: true }); }
        catch (_e) { ev = document.createEvent('Event'); ev.initEvent('change', true, true); }
        bd.dispatchEvent(ev);
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
        (multi ? '<span class="scw-ws-v2-picker-count"></span>' : '') +
        '<button type="button" class="scw-ws-v2-picker-btn scw-ws-v2-picker-btn--confirm">Save</button>' +
      '</div>';
    card.appendChild(ft);

    var statusEl  = ft.querySelector('.scw-ws-v2-picker-status');
    var countEl   = ft.querySelector('.scw-ws-v2-picker-count');

    // Live "N selected" tally next to Save (multi-select only). Counts the
    // checked option inputs whose value is non-empty (the "Clear all" sentinel
    // has value '' so it never counts). Recomputed on every toggle — bd's
    // change event fires for direct clicks, the clear-all row, and after
    // shift-click range selects (the clicked box still emits change).
    function updateCount() {
      if (!countEl) return;
      var checked = bd.querySelectorAll(
        'input[name="scw-ws-v2-pick-' + opts.fieldKey + '"]:checked');
      var n = 0;
      for (var i = 0; i < checked.length; i++) { if (checked[i].value) n++; }
      countEl.textContent = n + ' selected';
    }
    if (countEl) {
      bd.addEventListener('change', updateCount);
      updateCount();
    }
    // Cancel is now the X in the header. Keep the binding name
    // so the in-flight handlers (which call cancelBtn.disabled = …)
    // still resolve to a real element.
    var cancelBtn = hd.querySelector('.scw-ws-v2-picker-close');
    var confirmBtn = ft.querySelector('.scw-ws-v2-picker-btn--confirm');

    // While the reciprocal cascade is settling we lock the modal: no
    // Escape, no outside-click, no X — the user must wait for the sync to
    // finish before they can do anything else (prevents a mid-cascade
    // navigation that cancels in-flight PUTs or a follow-up edit that
    // diffs off a half-written baseline).
    var syncing = false;

    function setStatus(msg, err, sync) {
      var cls = 'scw-ws-v2-picker-status';
      if (err) cls += ' scw-ws-v2-picker-status--err';
      if (sync) cls += ' scw-ws-v2-picker-status--sync';
      statusEl.className = cls;
      statusEl.textContent = msg || '';
    }

    function onKey(e) { if (e.key === 'Escape' && !syncing) close(overlay, onKey); }
    document.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', function () { if (!syncing) close(overlay, onKey); });
    overlay.addEventListener('click', function (e) {
      if (syncing) return;
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
                // Candidate id → display label, so the overlay _raw carries a
                // readable identifier (not a bare hex id) if it has to render
                // before the refetch re-projects the connection.
                var _candName = Object.create(null);
                if (Array.isArray(opts.candidates)) {
                  for (var _ci = 0; _ci < opts.candidates.length; _ci++) {
                    var _c = opts.candidates[_ci];
                    if (_c && _c.id) _candName[_c.id] = _c.name;
                  }
                }
                // Prefer the PUT response's own _raw identifiers — the
                // server's REAL connection labels — over the candidate
                // names. Candidates often carry a shorter label than the
                // connection identifier (product picker: "Name" vs the
                // stored "Name - SKU"), and whatever lands here is what
                // registerPendingWrite re-asserts over every refetch for
                // its TTL — so a mismatched label makes the card show one
                // thing now and another after refresh.
                var _respRec = (resp && resp.record &&
                  typeof resp.record === 'object' && resp.record.id)
                  ? resp.record : resp;
                var _respRaw = _respRec ? _respRec[opts.fieldKey + '_raw'] : null;
                if (Array.isArray(_respRaw)) {
                  for (var _rj = 0; _rj < _respRaw.length; _rj++) {
                    var _rv = _respRaw[_rj];
                    if (_rv && _rv.id && _rv.identifier != null) {
                      _candName[_rv.id] = _rv.identifier;
                    }
                  }
                } else if (_respRaw && _respRaw.id && _respRaw.identifier != null) {
                  _candName[_respRaw.id] = _respRaw.identifier;
                }
                var rawObjs = (body[opts.fieldKey] || []).map(function (v) {
                  var id = (v && typeof v === 'object') ? v.id : v;
                  var o  = (v && typeof v === 'object') ? v : { id: id };
                  if (o.identifier == null && _candName[id] != null) o.identifier = _candName[id];
                  return o;
                });
                SCW.syncKnackModel(putKey, opts.recordId, resp,
                  opts.fieldKey, rawObjs);
                // Protect the just-saved selection from the follow-up refetch
                // (onSaved → refetchAndNotify) racing Knack's connection
                // projection: register it as a pending write so
                // applyPendingOverlay re-applies it after the fetch reset —
                // otherwise the card reverts to blank until a LATER fetch
                // finally reads the committed value (reported: a set survey Bid
                // showing '—' on the card while the data was actually saved).
                // Cascade fields are excluded (they must read server truth).
                if (!CASCADE_OVERLAY_SKIP[opts.fieldKey] &&
                    ns.data && typeof ns.data.registerPendingWrite === 'function') {
                  ns.data.registerPendingWrite(putKey, opts.recordId, opts.fieldKey, rawObjs);
                }
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

            // For connection fields whose reciprocal cascade fires in the
            // background (field_1957/2197, field_2380/2381, field_2820/2821),
            // KEEP THE MODAL OPEN in a locked "syncing" state until every
            // cascade PUT (incl. the converging verify pass) settles. The
            // caller opts in with awaitCascade:true. This replaces the
            // close-immediately + rely-on-toast flow so users can't navigate
            // or start another edit while the sync is mid-flight.
            if (opts.awaitCascade &&
                window.SCW && window.SCW.mirrorConn &&
                typeof window.SCW.mirrorConn.whenIdle === 'function') {
              syncing = true;
              overlay.classList.add('is-syncing');
              setStatus('Syncing connected records — please wait, don’t close this.', false, true);
              // confirm/cancel already disabled by doSave; keep them so.
              confirmBtn.disabled = true;
              cancelBtn.disabled  = true;
              window.SCW.mirrorConn.whenIdle({ graceMs: 700, maxMs: 30000 })
                .then(function () {
                  syncing = false;
                  close(overlay, onKey);
                  if (typeof opts.onSaved === 'function') opts.onSaved(ids, resp);
                });
              return;
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

    // ── SOW filter pills + search filter ────────────────────────────
    // Both funnel into ONE applyFilters(): an item must match the live
    // search query AND the active SOW pill. The "Clear all / (no
    // selection)" row is never filtered; group headers hide when none of
    // their items survive the filters.
    var searchInput = null;
    var activeSow = null;   // null = All
    var filterItems = [];
    var filterWraps = [];
    var noMatchEl = null;
    if (candidates.length) {
      filterItems = Array.prototype.slice.call(bd.querySelectorAll(
        '.scw-ws-v2-picker-item:not(.scw-ws-v2-picker-item--none)'));
      filterWraps = Array.prototype.slice.call(
        bd.querySelectorAll('.scw-ws-v2-picker-groupwrap'));
      noMatchEl = document.createElement('div');
      noMatchEl.className = 'scw-ws-v2-picker-search-empty';
      noMatchEl.textContent = 'No matches.';
      noMatchEl.style.display = 'none';
      bd.appendChild(noMatchEl);
    }

    var applyFilters = function () {
      var q = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
      // While a query or SOW filter is live, collapsed groups force-open
      // (CSS keyed on is-searching) so matches inside them are never
      // hidden; the user's collapse state comes back when both clear.
      bd.classList.toggle('is-searching', !!q || !!activeSow);
      var anyVisible = false;
      for (var i = 0; i < filterItems.length; i++) {
        var it = filterItems[i];
        var show = !q || (it.textContent || '').toLowerCase().indexOf(q) !== -1;
        if (show && activeSow) {
          // Only items ON the active SOW — no-SOW items hide too.
          var sows = it.getAttribute('data-scw-sows') || '';
          show = (',' + sows + ',').indexOf(',' + activeSow + ',') !== -1;
        }
        it.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      }
      for (var g = 0; g < filterWraps.length; g++) {
        var wrap = filterWraps[g];
        var vis = false;
        var its = wrap.querySelectorAll(
          '.scw-ws-v2-picker-item:not(.scw-ws-v2-picker-item--none)');
        for (var k = 0; k < its.length; k++) {
          if (its[k].style.display !== 'none') { vis = true; break; }
        }
        wrap.style.display = vis ? '' : 'none';
      }
      if (noMatchEl) noMatchEl.style.display = anyVisible ? 'none' : '';
    };

    // SOW pills — distinct SOWs across the candidates, naturally sorted.
    // Rendered whenever toggling is meaningful: 2+ distinct SOWs, or one
    // SOW alongside no-SOW candidates (so "only SW-1001" still filters).
    if (candidates.length) {
      var sowById = {};
      var sowCount = 0;
      var hasNoSow = false;
      for (var sc = 0; sc < candidates.length; sc++) {
        var sraw = candidates[sc] && candidates[sc].field_2154_raw;
        if (!Array.isArray(sraw) || !sraw.length) { hasNoSow = true; continue; }
        var any = false;
        for (var sr = 0; sr < sraw.length; sr++) {
          var se = sraw[sr];
          if (!se || !se.id) continue;
          any = true;
          if (sowById[se.id]) continue;
          sowById[se.id] = String(se.identifier || '').replace(/<[^>]*>/g, '').trim() ||
            (ns.sowNameById && ns.sowNameById(se.id)) || se.id;
          sowCount++;
        }
        if (!any) hasNoSow = true;
      }
      if (sowCount >= 2 || (sowCount === 1 && hasNoSow)) {
        var pillWrap = document.createElement('div');
        pillWrap.className = 'scw-ws-v2-picker-sowpills';
        var pillList = Object.keys(sowById).map(function (id) {
          return { id: id, label: sowById[id] };
        }).sort(function (a, b) {
          return String(a.label).localeCompare(String(b.label), undefined,
            { numeric: true, sensitivity: 'base' });
        });
        var pillHtml = '<span class="scw-ws-v2-picker-sowpills-lbl">SOW</span>' +
          '<button type="button" class="scw-ws-v2-picker-sowpill ' +
            'scw-ws-v2-picker-sowpill--active" data-scw-sow-pill="">All</button>';
        for (var pi = 0; pi < pillList.length; pi++) {
          pillHtml += '<button type="button" class="scw-ws-v2-picker-sowpill" ' +
            'data-scw-sow-pill="' + escapeHtml(pillList[pi].id) + '" ' +
            'title="Show only items on ' + escapeHtml(pillList[pi].label) + '">' +
            escapeHtml(pillList[pi].label) + '</button>';
        }
        pillWrap.innerHTML = pillHtml;
        card.insertBefore(pillWrap, bd);
        pillWrap.addEventListener('click', function (ev) {
          var btn = ev.target && ev.target.closest &&
            ev.target.closest('[data-scw-sow-pill]');
          if (!btn) return;
          activeSow = btn.getAttribute('data-scw-sow-pill') || null;
          var all = pillWrap.querySelectorAll('.scw-ws-v2-picker-sowpill');
          for (var ai = 0; ai < all.length; ai++) {
            all[ai].classList.toggle('scw-ws-v2-picker-sowpill--active', all[ai] === btn);
          }
          applyFilters();
        });
      }
    }

    // Sizable lists (the product picker especially) get a type-to-filter
    // box between the header and the scrolling list. Matches each option's
    // text (name + any SOW line).
    if (candidates.length >= 8) {
      var searchWrap = document.createElement('div');
      searchWrap.className = 'scw-ws-v2-picker-search';
      searchWrap.innerHTML = '<input type="text" class="scw-ws-v2-picker-search-input" ' +
        'placeholder="Search…" autocomplete="off" spellcheck="false">';
      card.insertBefore(searchWrap, bd);
      searchInput = searchWrap.querySelector('input');
      searchInput.addEventListener('input', applyFilters);
    }

    document.body.appendChild(overlay);

    // Focus the search box so the user can type immediately (after the
    // node is in the document, or focus() is a no-op).
    if (searchInput) { try { searchInput.focus(); } catch (e) {} }
  }

  ns.picker = {
    open:          open,
    // Canonical MDF/IDF groupBy — exported so callers can pass it explicitly,
    // though open() already uses it by default for record pickers.
    groupByMdfIdf: groupByMdfIdf
  };
})();
/*** END WORKSHEET V2 — PICKER ************************************************/
