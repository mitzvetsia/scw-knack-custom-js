/*** WORKSHEET V2 — WARNINGS **************************************************
 *
 * Per-record issue detector + view-level rollup. Cheap-first
 * implementation — detects the obvious issues from data already
 * loaded, no extra fetches, no UI filter wiring yet.
 *
 * Issue types (extensible — add more here + a label and the rest of
 * the pipeline picks them up automatically):
 *   photos       — record has at least one required photo (field_2446
 *                  = Yes) that is not yet completed (field_2447 != Yes).
 *                  Reads via ns.photos.extractPhotoRecords so this stays
 *                  in lockstep with what the photo strip shows.
 *   disconnected — cam/reader bucket record whose Connected Device
 *                  (field_2197_raw) is empty.
 *   bracket      — record has at least one attached accessory whose
 *                  warning flag (field_2244) is Yes. Walks the source-
 *                  view\'s model once per analyze() to map parents to
 *                  flagged accessory ids.
 *
 * Public API:
 *   ns.warnings.analyze(records, viewKey)  — run once per render,
 *                                            caches per viewKey
 *   ns.warnings.getIssuesFor(recordId)     — [] or [issueType, ...]
 *   ns.warnings.getCountsForRecords(ids)   — { photos: N, disconnected: N, ... }
 *   ns.warnings.LABELS                      — { issueType: 'short label' }
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var TYPES  = ['photos', 'disconnected', 'bracket'];
  var LABELS = {
    photos:       'photos',
    disconnected: 'disconnected',
    bracket:      'wrong accessory'
  };

  // Per-issue-type inline SVG. Picked to match v1\'s vocabulary —
  // photos → camera, disconnected → broken link, bracket → cube. All
  // currentColor so the amber chip palette tints them automatically.
  // Bold, high-contrast glyphs (solid fills where it helps) so they read
  // at a glance in the small chips. Each issue type is also colour-coded in
  // CSS (see [data-issue-type]) for fast scanning.
  var ICONS = {
    // Camera — solid body so the silhouette pops.
    photos:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">' +
      '<path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',
    // Broken chain (Lucide "unlink") — two link halves pulled apart with
    // snap ticks. Universal "connection severed" glyph; reads clearly small.
    disconnected:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71"/>' +
      '<path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71"/>' +
      '<line x1="8" y1="2" x2="8" y2="5"/>' +
      '<line x1="2" y1="8" x2="5" y2="8"/>' +
      '<line x1="16" y1="19" x2="16" y2="22"/>' +
      '<line x1="19" y1="16" x2="22" y2="16"/></svg>',
    // Exclamation in a diamond — strong "alert / problem" for a mismatched
    // accessory. Bold rotated-square outline + bang reads at chip size.
    bracket:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M12 2 22 12 12 22 2 12Z"/>' +
      '<line x1="12" y1="8" x2="12" y2="13"/>' +
      '<line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>'
  };

  // Per-view cache of the last analyze() result. analyze() is cheap
  // (one pass through records + one accessory scan) so we re-run it
  // on every render rather than trying to memoize across renders.
  var cache = Object.create(null);
  // Most recently analyzed viewKey — chip helpers fall back to this
  // when the caller doesn\'t know which view they\'re in.
  var lastViewKey = '';

  function isYes(rec, fieldKey) {
    var raw = rec && rec[fieldKey + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec[fieldKey] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  function hasMissingRequiredPhotos(rec, viewKey) {
    if (!ns.photos || typeof ns.photos.extractPhotoRecords !== 'function') return false;
    try {
      var photos = ns.photos.extractPhotoRecords(viewKey, rec.id) || [];
      for (var i = 0; i < photos.length; i++) {
        if (photos[i].required && !photos[i].completed) return true;
      }
    } catch (e) { /* DOM not ready yet — skip */ }
    return false;
  }

  function isCamReader(rec) {
    var CAM = (ns.card && ns.card.CAM_READER_BUCKET) || '6481e5ba38f283002898113c';
    var bid = (ns.card && ns.card.bucketIdOf && ns.card.bucketIdOf(rec)) || '';
    return bid === CAM;
  }

  function isDisconnected(rec) {
    if (!isCamReader(rec)) return false;
    var raw = rec && rec.field_2197_raw;
    return !Array.isArray(raw) || raw.length === 0;
  }

  function isNoOrUnset(rec, fieldKey) {
    var raw = rec && rec[fieldKey + '_raw'];
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    var s = (rec && rec[fieldKey] || '').toString().trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return false;
    // empty / "no" / "false" / "0" → treated as warning state
    return true;
  }

  function isExplicitNoVal(raw, str) {
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    var s = (str == null ? '' : str).toString().trim().toLowerCase();
    return s === 'no' || s === 'false' || s === '0';
  }

  /** Wrong-accessory detection. field_2244 ("accessory match check") lives
   *  on the ACCESSORY record (No/false = wrong). Accessories are hidden from
   *  the v2 tree, so the analyzed record set doesn't include them — we read
   *  the FULL model (ns.data.readRecords) and, as a fallback, the accessory's
   *  own plain field_2244 cell in the source-view DOM (NOT the parent's
   *  per-accessory array cell). An accessory that is explicitly No is rolled
   *  up to its parent(s) via field_2464. Returns:
   *    { byAccessory: { accId: true }, byParent: { parentId: true } } */
  function buildBracketMaps(viewKey) {
    var byAccessory = Object.create(null);
    var byParent = Object.create(null);

    var recs = [];
    try {
      if (ns.data && typeof ns.data.readRecords === 'function') {
        recs = ns.data.readRecords(viewKey) || [];
      }
    } catch (e) { recs = []; }

    // DOM fallback: each record's OWN boolean field_2244 = the cell with no
    // per-accessory connection-value spans.
    var domVal = Object.create(null);
    var view = document.getElementById(viewKey) ||
               document.getElementById('view_3962');
    if (view) {
      var rows = view.querySelectorAll('tbody tr[id]');
      for (var i = 0; i < rows.length; i++) {
        var rid = (rows[i].getAttribute('id') || '').trim();
        if (!rid) continue;
        var cells = rows[i].querySelectorAll(
          'td.field_2244, td[data-field-key="field_2244"]');
        for (var c = 0; c < cells.length; c++) {
          if (cells[c].querySelector('span[id][data-kn="connection-value"]')) continue;
          domVal[rid] = (cells[c].textContent || '').trim().toLowerCase();
          break;
        }
      }
    }

    var dbgAcc = 0, dbgWrong = 0, dbgModelField = 0, dbgSample = null;
    for (var k = 0; k < recs.length; k++) {
      var rec = recs[k];
      if (!rec || !rec.id) continue;
      var par = rec.field_2464_raw;
      if (!Array.isArray(par) || !par.length) continue;   // not an accessory
      dbgAcc++;
      if (rec.field_2244_raw != null || rec.field_2244 != null) dbgModelField++;
      if (!dbgSample) dbgSample = { id: rec.id, raw: rec.field_2244_raw,
                                    fmt: rec.field_2244, ownDom: domVal[rec.id] };
      var dv = domVal[rec.id];
      var wrong = isExplicitNoVal(rec.field_2244_raw, rec.field_2244) ||
        (dv === 'no' || dv === 'false' || dv === '0');
      if (!wrong) continue;
      dbgWrong++;
      byAccessory[rec.id] = true;
      for (var p = 0; p < par.length; p++) {
        if (par[p] && par[p].id) byParent[par[p].id] = true;
      }
    }

    // TEMP diagnostic for the comparison grid (view_3921) only — confirms
    // the v2 own-field detection sees brackets + their field_2244 there.
    if (viewKey === 'view_3921') {
      try {
        console.log('[scw-ws-v2] bracket scan view_3921',
          { accessories: dbgAcc, withModelField: dbgModelField,
            flagged: dbgWrong, totalRecords: recs.length, sample: dbgSample });
      } catch (e) {}
    }
    return { byAccessory: byAccessory, byParent: byParent };
  }

  // Latest accessory→mismatch map, so card.js can mark the specific
  // offending accessory chip without re-scanning the DOM.
  var lastAccMismatch = Object.create(null);

  function analyze(records, viewKey) {
    var byRecord = Object.create(null);
    var bracket = buildBracketMaps(viewKey);
    lastAccMismatch = bracket.byAccessory;
    var bracketParents = bracket.byParent;

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      var issues = [];
      if (hasMissingRequiredPhotos(rec, viewKey)) issues.push('photos');
      if (isDisconnected(rec))                     issues.push('disconnected');
      if (bracketParents[rec.id])                  issues.push('bracket');
      if (issues.length) byRecord[rec.id] = issues;
    }

    cache[viewKey] = byRecord;
    lastViewKey = viewKey;
    return byRecord;
  }

  function getIssuesFor(viewKey, recordId) {
    if (arguments.length === 1) { recordId = viewKey; viewKey = lastViewKey; }
    var v = cache[viewKey];
    return (v && v[recordId]) || [];
  }

  /** Aggregate counts across a record-id list. Each record contributes
   *  +1 to every issue type it has. viewKey is optional — defaults to
   *  the most recently analyzed view. */
  function getCountsForRecords(viewKey, recordIds) {
    if (arguments.length === 1) { recordIds = viewKey; viewKey = lastViewKey; }
    var v = cache[viewKey] || {};
    var counts = {};
    for (var t = 0; t < TYPES.length; t++) counts[TYPES[t]] = 0;
    for (var i = 0; i < recordIds.length; i++) {
      var issues = v[recordIds[i]];
      if (!issues) continue;
      for (var j = 0; j < issues.length; j++) {
        var key = issues[j];
        if (counts[key] != null) counts[key]++;
      }
    }
    return counts;
  }

  /** True when this accessory record id is flagged (field_2244 = No) by the
   *  most recent analyze() DOM scan. Used by card.js for the per-chip mark. */
  function isAccessoryMismatch(accessoryId) {
    return !!(accessoryId && lastAccMismatch[accessoryId]);
  }

  /** Merge externally-computed accessory-mismatch ids into the current map.
   *  Used by bid-review-v2 (scene_1155): it detects wrong brackets from the
   *  view_3921 SOW-items records and feeds the offending ids here so the
   *  embedded worksheet card's per-accessory chit lights up there too. */
  function mergeAccessoryMismatch(map) {
    if (!map) return;
    for (var id in map) { if (map[id]) lastAccMismatch[id] = true; }
  }

  ns.warnings = {
    TYPES:               TYPES,
    LABELS:              LABELS,
    ICONS:               ICONS,
    analyze:             analyze,
    getIssuesFor:        getIssuesFor,
    getCountsForRecords: getCountsForRecords,
    isAccessoryMismatch: isAccessoryMismatch,
    mergeAccessoryMismatch: mergeAccessoryMismatch
  };
})();
/*** END WORKSHEET V2 — WARNINGS **********************************************/
