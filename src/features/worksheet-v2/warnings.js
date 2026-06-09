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
  var ICONS = {
    photos:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
      '<circle cx="12" cy="13" r="4"/></svg>',
    disconnected:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      // Broken-link icon: two link halves with a slash through the gap.
      '<path d="M9 17H7a5 5 0 0 1 0-10h2"/>' +
      '<path d="M15 7h2a5 5 0 0 1 4.54 7.13"/>' +
      '<line x1="8" y1="12" x2="13" y2="12"/>' +
      '<line x1="2" y1="22" x2="22" y2="2"/></svg>',
    bracket:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      // Mismatch / "not equal" — two offset arrows with a slash, reads as
      // "this doesn\'t match" at small sizes.
      '<line x1="4" y1="9" x2="20" y2="9"/>' +
      '<line x1="4" y1="15" x2="20" y2="15"/>' +
      '<line x1="17" y1="4" x2="7" y2="20"/></svg>'
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

  /** Build a Set of parent ids whose attached accessories have
   *  field_2244 ≠ Yes (i.e., the accessory match check is No or
   *  hasn\'t been confirmed). One pass through the full record list. */
  function buildBracketParentSet(records) {
    var flagged = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      if (!isNoOrUnset(r, 'field_2244')) continue;
      var raw = r.field_2464_raw;
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id) flagged[raw[j].id] = true;
      }
    }
    return flagged;
  }

  function analyze(records, viewKey) {
    var byRecord = Object.create(null);
    var bracketParents = buildBracketParentSet(records);

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

  ns.warnings = {
    TYPES:               TYPES,
    LABELS:              LABELS,
    ICONS:               ICONS,
    analyze:             analyze,
    getIssuesFor:        getIssuesFor,
    getCountsForRecords: getCountsForRecords
  };
})();
/*** END WORKSHEET V2 — WARNINGS **********************************************/
