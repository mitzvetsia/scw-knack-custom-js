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
 *   notes        — record\'s SCW Notes field (logical `scwNotes`, e.g.
 *                  field_1953 on the SOW object) is non-blank. Purely
 *                  informational (not a data-quality problem like the
 *                  other three) but flagged the same way so it can\'t be
 *                  scrolled past — reused as-is by bid-review-v2\'s
 *                  warnings.js, so this single check covers both the
 *                  build-SOW worksheet and the bid comparison grid.
 *   surveyAdded  — the record\'s product name carries the "added during
 *                  survey" marker (a line item created during the field
 *                  survey rather than the original quote). Informational,
 *                  like notes; also reused by bid-review-v2.
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

  var TYPES  = ['photos', 'disconnected', 'bracket', 'notes', 'surveyAdded'];
  var LABELS = {
    photos:       'missing photos',
    disconnected: 'disconnected',
    bracket:      'wrong accessory',
    notes:        'has SCW notes',
    surveyAdded:  'added during survey'
  };

  // Per-issue-type inline SVG. Picked to match v1\'s vocabulary —
  // photos → camera, disconnected → broken link, bracket → cube. All
  // currentColor so the amber chip palette tints them automatically.
  // Bold, high-contrast glyphs (solid fills where it helps) so they read
  // at a glance in the small chips. Each issue type is also colour-coded in
  // CSS (see [data-issue-type]) for fast scanning.
  var ICONS = {
    // Camera with a slash (Lucide "camera-off") — reads "no photo / missing"
    // rather than a plain camera, which looked like a photo was present.
    // Stroke style to match the disconnected + bracket glyphs.
    photos:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<line x1="2" y1="2" x2="22" y2="22"/>' +
      '<path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12"/>' +
      '<path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>' +
      '<path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/></svg>',
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
      '<line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>',
    // Speech bubble (Lucide "message-square") — "there\'s a note here, go
    // read it" rather than a data-quality alarm; the distinct 4th chip
    // colour (teal, see styles.js) keeps it visually apart from the three
    // actual problem types.
    notes:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    // Clipboard with a plus (Lucide "clipboard-plus") — "this line item was
    // added during the survey", i.e. it grew out of the field walk rather
    // than the original quote. Informational, like notes.
    surveyAdded:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
      '<path d="M9 14h6"/><path d="M12 11v6"/></svg>'
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

  // Cache of the photo-warning boolean per record id, persisted ACROSS renders.
  // extractPhotoRecords (a source-view DOM scrape) is the dominant analyze()
  // cost on large worksheets (~476ms for 334 records when the source DOM is
  // present) and recurs on EVERY render — but photo state only changes on a
  // photo add/remove/replace. Memoize it (photos.js invalidates on mutation),
  // so a non-photo edit never re-scrapes. Only cache a result computed while
  // the source row is actually present — a scrape against a not-yet-rendered
  // row is a transient false-negative we must not persist.
  var photoWarnCache = Object.create(null);   // recId -> bool

  // Source-view <tr> map, rebuilt ONCE per analyze() pass. The photo scan and
  // the presence check both need the record's source row; without a shared map
  // each was doing view.querySelector('tr[id=…]') per record — a full O(rows)
  // scan × O(records) = O(n²) (≈110k row-walks / 333 rows, the ~580ms cold
  // cost). One querySelectorAll up front makes every per-record lookup O(1).
  var _trMap = null;            // recId -> <tr>  (valid only during a pass)
  function buildTrMap(viewKey) {
    var map = Object.create(null);
    try {
      var v = document.getElementById(viewKey) || document.getElementById('view_3962');
      if (!v) return map;
      var rows = v.querySelectorAll('tbody > tr[id]');
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].id;
        if (id) map[id] = rows[i];
      }
    } catch (e) { /* ignore */ }
    return map;
  }

  function sourceRowPresent(viewKey, recId) {
    if (_trMap) return !!_trMap[recId];
    try {
      var v = document.getElementById(viewKey) || document.getElementById('view_3962');
      return !!(v && v.querySelector('tr[id="' + recId + '"]'));
    } catch (e) { return false; }
  }

  // Lean photo-warning scan. extractPhotoRecords (used by the photo STRIP)
  // makes ~11 full passes over every cell in the row + builds a map + sorts —
  // far more than a yes/no warning needs, and it dominated the cold render
  // (~384ms for 333 rows). This reads ONLY the two cells that matter: the
  // required (field_2446) and completed (field_2447) connection columns, both
  // keyed per-photo by the PIC record id. Warning = any required="Yes" photo
  // whose matching completed span isn't "Yes". One queryable cell pair, no map,
  // no sort — an order of magnitude cheaper.
  function hasMissingRequiredPhotos(rec, viewKey) {
    try {
      var tr = _trMap ? _trMap[rec.id] : null;
      if (!tr) {
        var view = document.getElementById(viewKey) || document.getElementById('view_3962');
        if (!view) return false;
        tr = view.querySelector('tr[id="' + rec.id + '"]');
      }
      if (!tr) return false;
      var FF      = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      var reqKey  = FF.photoRequired  || 'field_2446';
      var compKey = FF.photoCompleted || 'field_2447';
      var reqCell = tr.querySelector('td[data-field-key="' + reqKey + '"]');
      if (!reqCell) return false;
      var reqSpans = reqCell.querySelectorAll('span[id][data-kn="connection-value"]');
      if (!reqSpans.length) return false;
      // Map of completed photo ids (only built if at least one is required).
      var done = Object.create(null);
      var compCell = tr.querySelector('td[data-field-key="' + compKey + '"]');
      if (compCell) {
        var compSpans = compCell.querySelectorAll('span[id][data-kn="connection-value"]');
        for (var c = 0; c < compSpans.length; c++) {
          if ((compSpans[c].textContent || '').trim().toLowerCase() === 'yes') {
            done[compSpans[c].id] = true;
          }
        }
      }
      for (var r = 0; r < reqSpans.length; r++) {
        if ((reqSpans[r].textContent || '').trim().toLowerCase() === 'yes' &&
            !done[reqSpans[r].id]) {
          return true;
        }
      }
    } catch (e) { /* DOM not ready yet — skip */ }
    return false;
  }

  /** v1 parity: the survey/device worksheet drives its photo warning off a
   *  precomputed Knack count field (field_2454, "SYS_incomplete photos"),
   *  mapped per-view as the logical `warningCount`. Prefer it when present —
   *  it's reliable even before the photo strip DOM is built. Falls back to
   *  client-side detection (extractPhotoRecords) for views without the field. */
  function hasPhotoWarning(rec, viewKey) {
    var countKey = F().warningCount;
    if (countKey) {
      var rawN = (rec[countKey + '_raw'] != null) ? rec[countKey + '_raw'] : rec[countKey];
      var n = parseFloat(String(rawN == null ? '' : rawN).replace(/[^0-9.\-]/g, ''));
      if (isFinite(n)) return n > 0;   // count field present → trust it (cheap)
    }
    // No count field (e.g. SOW view_3962) → scrape the photo DOM, but memoize:
    // compute ONCE per record (when its source row is present) and reuse on
    // every later render until photos.js invalidates it.
    var id = rec && rec.id;
    if (!id) return hasMissingRequiredPhotos(rec, viewKey);
    if (id in photoWarnCache) return photoWarnCache[id];
    if (!sourceRowPresent(viewKey, id)) return false;   // DOM not ready — don't cache
    var v = hasMissingRequiredPhotos(rec, viewKey);
    photoWarnCache[id] = v;
    return v;
  }

  // Drop cached photo warnings so the next analyze() re-scrapes. Call after a
  // photo add/remove/replace (photos.js). recId clears one record; no arg clears all.
  function invalidatePhotos(recId) {
    if (recId) delete photoWarnCache[recId];
    else photoWarnCache = Object.create(null);
  }

  // Active source view for the current analyze() pass — lets the helpers
  // below resolve field keys / bucket ids through the per-view config.
  var curView = '';
  function F() { return (ns.cfg && ns.cfg.fields(curView)) || {}; }

  function isCamReader(rec) {
    var CAM = (ns.cfg && ns.cfg.bucket('camReader', curView)) ||
              (ns.card && ns.card.CAM_READER_BUCKET) || '6481e5ba38f283002898113c';
    // Pass curView so bucketIdOf resolves the per-object bucket field
    // (survey = field_2366, NOT the SOW default field_2219) — otherwise
    // survey rows read no bucket and never register as cam/readers.
    var bid = (ns.card && ns.card.bucketIdOf && ns.card.bucketIdOf(rec, curView)) || '';
    return bid === CAM;
  }

  function isDisconnected(rec) {
    if (!isCamReader(rec)) return false;
    var key = F().connectedDevice || 'field_2197';
    var raw = rec && rec[key + '_raw'];
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

  /** Product name carries the "added during survey" marker — the product
   *  chosen for line items created during the field survey rather than the
   *  original quote. Checks the display text AND the connection identifiers
   *  (the marker lives in the product's name either way). Substring match,
   *  case-insensitive, so naming variants like "(Added During Survey)"
   *  all register. */
  var SURVEY_ADDED_RE = /added\s+during\s+survey/i;
  function isSurveyAddedProduct(rec) {
    var key = F().productName || 'field_1949';
    if (!rec) return false;
    var txt = (rec[key] == null ? '' : String(rec[key])).replace(/<[^>]*>/g, ' ');
    if (SURVEY_ADDED_RE.test(txt)) return true;
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var ident = raw[i] && (raw[i].identifier || raw[i].name || '');
        if (SURVEY_ADDED_RE.test(String(ident))) return true;
      }
    }
    return false;
  }

  /** SCW Notes (logical `scwNotes`) is non-blank. Plain-text/textarea field —
   *  read the record directly (no DOM scrape needed, unlike photos). */
  function hasScwNotesText(rec) {
    var key = F().scwNotes;
    if (!key || !rec) return false;
    var raw = rec[key + '_raw'];
    var v = (raw != null && typeof raw !== 'object') ? raw : rec[key];
    if (v == null) return false;
    var txt = String(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    return !!txt;
  }

  function isExplicitNoVal(raw, str) {
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    var s = (str == null ? '' : str).toString().trim().toLowerCase();
    return s === 'no' || s === 'false' || s === '0';
  }

  /** Wrong-accessory detection. The authoritative per-accessory match
   *  warning is what connected-records.js computes from the PARENT row's
   *  field_2244 array (one Yes/No span per attached accessory) — it renders
   *  the flagged item as .scw-cr-item-warn (accessory id on the inner
   *  .scw-cr-remove). The accessory's OWN field_2244 record value under-flags
   *  (Knack computes the match on the parent side), so we read the parent
   *  signal instead, matching the bid comparison exactly. Sources, unioned:
   *    1. .scw-cr-item-warn anywhere in the document (connected-records runs
   *       on view_3610/3313/3921/3586 — scan document-wide).
   *    2. Raw per-accessory field_2244 spans (No/False) on the source view,
   *       for views connected-records doesn't process (e.g. view_3962).
   *  Returns { byAccessory: { accId: true }, byParent: { parentId: true } } */
  function ownerRecordId(el) {
    var node = el;
    while (node && node.getAttribute) {
      var id = node.getAttribute('data-record-id') ||
               node.getAttribute('data-scw-ws-v2-record') ||
               node.getAttribute('id') || '';
      if (/^[a-f0-9]{24}$/i.test(id)) return id;
      node = node.parentNode;
    }
    return '';
  }

  function buildBracketMaps(viewKey) {
    var byAccessory = Object.create(null);
    var byParent = Object.create(null);

    // (1) connected-records' computed warnings (the correct, parent-derived
    //     signal). Document-wide so it works regardless of which SOW-item
    //     view connected-records rendered into.
    var warns = document.querySelectorAll('.scw-cr-item-warn');
    for (var w = 0; w < warns.length; w++) {
      var rem = warns[w].querySelector('.scw-cr-remove[data-record-id]');
      var aId = rem ? (rem.getAttribute('data-record-id') || '').trim() : '';
      if (!aId) continue;
      byAccessory[aId] = true;
      var pId = ownerRecordId(warns[w]);
      if (pId) byParent[pId] = true;
    }

    // (2) Raw per-accessory field_2244 spans on the source view (covers
    //     views connected-records doesn't process, e.g. view_3962).
    var view = document.getElementById(viewKey) ||
               document.getElementById('view_3962');
    if (view) {
      var BF = ((ns.cfg && ns.cfg.fields(viewKey).accessoryMatch)) || 'field_2244';
      var cells = view.querySelectorAll(
        'td.' + BF + ', td[data-field-key="' + BF + '"]');
      for (var c = 0; c < cells.length; c++) {
        var spans = cells[c].querySelectorAll('span[id][data-kn="connection-value"]');
        if (!spans.length) continue;
        var parentId = ownerRecordId(cells[c]);
        for (var s = 0; s < spans.length; s++) {
          var accId = (spans[s].id || '').trim();
          var v = (spans[s].textContent || '').trim().toLowerCase();
          if (accId && (v === 'no' || v === 'false')) {
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
    curView = viewKey || '';
    var byRecord = Object.create(null);
    // Build the source-row lookup ONCE for this pass (kills the per-record
    // O(n) tr scan the photo check used to do). Cleared in the finally so a
    // stale map can never leak into a later pass against changed DOM.
    _trMap = buildTrMap(viewKey);
    try {
    var bracket = buildBracketMaps(viewKey);
    lastAccMismatch = bracket.byAccessory;
    var bracketParents = bracket.byParent;

    // Removed-by-CO records (install views map removedByCo → field_2967) are
    // dead scope — nagging about missing photos / disconnections on an item
    // that will never be installed is noise. Views without the mapping
    // (SOW/survey) resolve no key and skip nothing.
    var removedKey = F().removedByCo || null;
    function isRemovedByCo(rec) {
      if (!removedKey) return false;
      var raw = rec[removedKey + '_raw'];
      return Array.isArray(raw) && raw.length > 0;
    }

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      if (isRemovedByCo(rec)) continue;
      var issues = [];
      if (hasPhotoWarning(rec, viewKey))           issues.push('photos');
      if (isDisconnected(rec))                     issues.push('disconnected');
      if (bracketParents[rec.id])                  issues.push('bracket');
      if (hasScwNotesText(rec))                    issues.push('notes');
      if (isSurveyAddedProduct(rec))               issues.push('surveyAdded');
      if (issues.length) byRecord[rec.id] = issues;
    }

    cache[viewKey] = byRecord;
    lastViewKey = viewKey;
    return byRecord;
    } finally {
      _trMap = null;   // never let the map outlive the pass
    }
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
    invalidatePhotos:    invalidatePhotos,
    getIssuesFor:        getIssuesFor,
    getCountsForRecords: getCountsForRecords,
    isAccessoryMismatch: isAccessoryMismatch,
    mergeAccessoryMismatch: mergeAccessoryMismatch
  };
})();
/*** END WORKSHEET V2 — WARNINGS **********************************************/
