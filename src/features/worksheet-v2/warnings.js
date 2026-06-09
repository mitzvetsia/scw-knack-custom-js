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
    // Unplugged — a plug pulled out of a socket. Bold strokes.
    disconnected:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<line x1="2" y1="22" x2="22" y2="2"/>' +
      '<path d="M9 17H7a5 5 0 0 1 0-10h2"/>' +
      '<path d="M15 7h2a5 5 0 0 1 4 7.5"/></svg>',
    // Not-equal (≠) — clear "doesn\'t match".
    bracket:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<line x1="5" y1="9" x2="19" y2="9"/>' +
      '<line x1="5" y1="15" x2="19" y2="15"/>' +
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

  /** Accessory match check (field_2244) is rendered on the PARENT's row as
   *  per-accessory connection-value spans (id = accessory record id, text =
   *  that accessory's Yes/No) — NOT as a usable boolean on the accessory's
   *  own model record. So we read it from the live view DOM, exactly like
   *  v1's connected-records. An accessory is WRONG when its value is
   *  explicitly No / false. Returns:
   *    { byAccessory: { accId: true }, byParent: { parentId: true } }
   *  byParent is the rollup (a parent with any No accessory). */
  function buildBracketMaps(viewKey) {
    var byAccessory = Object.create(null);
    var byParent = Object.create(null);
    var view = document.getElementById(viewKey) ||
               document.getElementById('view_3962');
    if (!view) return { byAccessory: byAccessory, byParent: byParent };
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var parentId = (rows[i].getAttribute('id') || '').trim();
      // field_2244 can render twice on a row (the record's own boolean AND
      // the per-accessory connection array). We only want the array — the
      // cell whose spans carry per-accessory ids. Scan every matching cell.
      var cells = rows[i].querySelectorAll(
        'td.field_2244, td[data-field-key="field_2244"]');
      for (var c = 0; c < cells.length; c++) {
        var spans = cells[c].querySelectorAll('span[id][data-kn="connection-value"]');
        for (var s = 0; s < spans.length; s++) {
          var accId = (spans[s].getAttribute('id') || '').trim();
          if (!accId) continue;
          var v = (spans[s].textContent || '').trim().toLowerCase();
          if (v === 'no' || v === 'false' || v === '0') {
            byAccessory[accId] = true;
            if (parentId) byParent[parentId] = true;
          }
        }
      }
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

  ns.warnings = {
    TYPES:               TYPES,
    LABELS:              LABELS,
    ICONS:               ICONS,
    analyze:             analyze,
    getIssuesFor:        getIssuesFor,
    getCountsForRecords: getCountsForRecords,
    isAccessoryMismatch: isAccessoryMismatch
  };
})();
/*** END WORKSHEET V2 — WARNINGS **********************************************/
