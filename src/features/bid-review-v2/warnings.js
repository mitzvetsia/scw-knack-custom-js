/*** BID REVIEW V2 — WARNINGS ************************************************
 *
 * Surfaces the SAME issue warnings the worksheet-v2 Build-SOW grid shows
 * (missing required photos, disconnected cam/reader, wrong accessory) on
 * the comparison grid's SOW column + MDF/IDF group headers.
 *
 * Detection sources (all SOW ITEMS ONLY — bid records are never analyzed):
 *   - photos / disconnected: delegated to worksheet-v2's analyzer pointed
 *     at view_3921. Those checks read object-level fields (field_2219
 *     bucket, field_2197 connected device) + scrape the view's photo cells
 *     (field_771 / field_2446 / field_2447), all of which view_3921 mirrors
 *     from view_3610.
 *   - wrong accessory: computed LOCALLY here by scraping each SOW item's
 *     own row field_2244 cell (the per-accessory match-check spans). On
 *     scene_1155 the accessory child records aren't in view_3921's model,
 *     so worksheet-v2's accessory-record approach finds nothing — but the
 *     parent row still renders one connection-value span per accessory with
 *     its Yes/No match value (same source v1's connected-records.js reads).
 *     An explicit No / False on any accessory flags the parent.
 *
 * Public API:
 *   ns.warnings.analyze(sowItems)           — run once per render
 *   ns.warnings.issuesFor(sowItemId)        — [] or [issueType, ...]
 *   ns.warnings.chipsHtml(sowItemId)        — per-cell chip markup
 *   ns.warnings.summaryChipsHtml(ids)       — aggregate chips (L1 header)
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var SOW_VIEW = (ns.CONFIG && ns.CONFIG.sourceViewKeys && ns.CONFIG.sourceViewKeys[1]) ||
                 'view_3921';
  var TYPES = ['photos', 'disconnected', 'bracket'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // worksheet-v2 analyzer (same bundle, registered on app boot regardless
  // of scene). Null if unavailable so we fail soft.
  function wv2() {
    var w = window.SCW && window.SCW.worksheetV2 && window.SCW.worksheetV2.warnings;
    return (w && typeof w.analyze === 'function') ? w : null;
  }

  // Wrong-accessory maps for the current render.
  var bracketByParent    = Object.create(null);
  var bracketByAccessory = Object.create(null);

  // Walk up from a node to the owning SOW line-item record id (24-hex).
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

  /** Wrong-accessory detection for the comparison grid. The mounting-bracket
   *  RECORDS are filtered out of view_3921, so they're not rows/model records
   *  we can read directly (the v2 own-field approach finds nothing). Instead
   *  the field_2244 cell on each PARENT line item renders one connection-value
   *  span per attached accessory (span id = accessory id, text = Yes/No) — the
   *  same representation v1 reads. Scan the WHOLE view element (the cell may be
   *  relocated into a worksheet card by device-worksheet), flag any No/False
   *  accessory span, and roll up to the owning parent record. */
  function buildBracketMaps() {
    var byParent = Object.create(null);
    var byAccessory = Object.create(null);
    var dbg = { cells: 0, spans: 0, noHits: 0, crWarn: 0 };
    var view = document.getElementById(SOW_VIEW);
    if (view) {
      // Source 1 — raw per-accessory spans in the parent's field_2244 cell.
      var cells = view.querySelectorAll(
        'td.field_2244, td[data-field-key="field_2244"]');
      dbg.cells = cells.length;
      for (var c = 0; c < cells.length; c++) {
        var spans = cells[c].querySelectorAll('span[id][data-kn="connection-value"]');
        if (!spans.length) continue;
        var parentId = ownerRecordId(cells[c]);
        for (var s = 0; s < spans.length; s++) {
          dbg.spans++;
          var accId = (spans[s].id || '').trim();
          var v = (spans[s].textContent || '').trim().toLowerCase();
          if (accId && (v === 'no' || v === 'false')) {
            byAccessory[accId] = true;
            if (parentId) byParent[parentId] = true;
            dbg.noHits++;
          }
        }
      }
      // Source 2 — connected-records.js already computes the mismatch on
      // view_3921 and tags the offending accessory item .scw-cr-item-warn
      // (accessory id on the inner .scw-cr-remove[data-record-id]). This is
      // the most reliable signal since device-worksheet relocates/replaces
      // the raw field_2244 cell into its mounting-hardware widget.
      var warns = view.querySelectorAll('.scw-cr-item-warn');
      dbg.crWarn = warns.length;
      for (var w2 = 0; w2 < warns.length; w2++) {
        var rem = warns[w2].querySelector('.scw-cr-remove[data-record-id]');
        var aId = rem ? (rem.getAttribute('data-record-id') || '').trim() : '';
        var pId = ownerRecordId(warns[w2]);
        if (aId) byAccessory[aId] = true;
        if (pId) byParent[pId] = true;
      }
    }
    // TEMP diagnostic (remove once confirmed).
    try {
      console.log('[scw-br-v2] bracket scan view_3921', dbg,
        'parents=' + Object.keys(byParent).length,
        'accessories=' + Object.keys(byAccessory).length);
    } catch (e) {}
    return { byParent: byParent, byAccessory: byAccessory };
  }

  function analyze(sowItems) {
    var w = wv2();
    if (w) {
      try { w.analyze(sowItems || [], SOW_VIEW); }
      catch (e) {
        if (ns.CONFIG && ns.CONFIG.debug) console.warn('[scw-br-v2] warnings analyze failed', e);
      }
    }
    var maps = buildBracketMaps();
    bracketByParent    = maps.byParent;
    bracketByAccessory = maps.byAccessory;
    // Feed the offending bracket ids to worksheet-v2 so the embedded card's
    // per-accessory chit (isAccessoryMismatch) lights up on this scene too.
    if (w && typeof w.mergeAccessoryMismatch === 'function') {
      try { w.mergeAccessoryMismatch(bracketByAccessory); } catch (e2) { /* ignore */ }
    }
  }

  function issuesFor(sowItemId) {
    if (!sowItemId) return [];
    var out = [];
    var w = wv2();
    if (w && typeof w.getIssuesFor === 'function') {
      var base = [];
      try { base = w.getIssuesFor(SOW_VIEW, sowItemId) || []; } catch (e) { base = []; }
      for (var i = 0; i < base.length; i++) {
        // Bracket comes from the parent-span scan above (brackets are
        // filtered out of view_3921, so the analyzer can't see them).
        if (base[i] !== 'bracket' && out.indexOf(base[i]) === -1) out.push(base[i]);
      }
    }
    if (bracketByParent[sowItemId] && out.indexOf('bracket') === -1) out.push('bracket');
    return out;
  }

  /** Per-cell chips — icon-only, one per issue type the SOW item has. */
  function chipsHtml(sowItemId) {
    var w = wv2();
    if (!w) return '';
    var issues = issuesFor(sowItemId);
    if (!issues.length) return '';
    var ICONS  = w.ICONS  || {};
    var LABELS = w.LABELS || {};
    var parts = [];
    for (var t = 0; t < TYPES.length; t++) {
      var k = TYPES[t];
      if (issues.indexOf(k) === -1) continue;
      parts.push('<span class="scw-bid-review-v2__warn-chip" ' +
        'data-issue-type="' + k + '" title="' + esc(LABELS[k] || k) + '">' +
        (ICONS[k] || '') + '</span>');
    }
    return parts.length
      ? '<div class="scw-bid-review-v2__warn-chips">' + parts.join('') + '</div>'
      : '';
  }

  /** Aggregate chips for a set of SOW item ids — count + label per issue
   *  type. Rendered into the MDF/IDF (L1) group header. */
  function summaryChipsHtml(ids) {
    var w = wv2();
    if (!w || !ids || !ids.length) return '';
    var ICONS  = w.ICONS  || {};
    var LABELS = w.LABELS || {};
    var counts = { photos: 0, disconnected: 0, bracket: 0 };
    for (var i = 0; i < ids.length; i++) {
      var issues = issuesFor(ids[i]);
      for (var j = 0; j < issues.length; j++) {
        if (counts[issues[j]] != null) counts[issues[j]]++;
      }
    }
    var parts = [];
    for (var t = 0; t < TYPES.length; t++) {
      var k = TYPES[t];
      var n = counts[k];
      if (!n) continue;
      parts.push('<span class="scw-bid-review-v2__warn-chip scw-bid-review-v2__warn-chip--sum" ' +
        'data-issue-type="' + k + '" title="' + esc(LABELS[k] || k) + '">' +
        (ICONS[k] || '') +
        '<span class="scw-bid-review-v2__warn-chip-n">' + n + '</span>' +
        '<span class="scw-bid-review-v2__warn-chip-l">' + esc(LABELS[k] || k) + '</span>' +
        '</span>');
    }
    return parts.length
      ? '<span class="scw-bid-review-v2__warn-chips scw-bid-review-v2__warn-chips--sum">' +
          parts.join('') + '</span>'
      : '';
  }

  ns.warnings = {
    analyze:          analyze,
    issuesFor:        issuesFor,
    chipsHtml:        chipsHtml,
    summaryChipsHtml: summaryChipsHtml
  };
})();
/*** END BID REVIEW V2 — WARNINGS ********************************************/
