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
    bracket:      'wrong bracket'
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

  /** Build a Set of parent ids whose attached accessories have
   *  field_2244 = Yes. One pass through the full record list. */
  function buildBracketParentSet(records) {
    var flagged = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      if (!isYes(r, 'field_2244')) continue;
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
    analyze:             analyze,
    getIssuesFor:        getIssuesFor,
    getCountsForRecords: getCountsForRecords
  };
})();
/*** END WORKSHEET V2 — WARNINGS **********************************************/
