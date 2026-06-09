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
  // Accessory match-check field (No/False = wrong accessory).
  var BRACKET_FIELD = 'field_2244';

  // Local wrong-accessory map for the current render: { sowItemId: true }.
  var bracketSet = Object.create(null);

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

  /** Scrape one SOW item's own row for an explicit-No accessory match. The
   *  parent row's field_2244 cell renders one connection-value span per
   *  attached accessory; textContent = Yes/No. Any No / False → wrong. */
  function rowHasWrongAccessory(view, sowItemId) {
    var tr = view.querySelector('tr[id="' + sowItemId + '"]');
    if (!tr) return false;
    var cells = tr.querySelectorAll(
      'td.' + BRACKET_FIELD + ', td[data-field-key="' + BRACKET_FIELD + '"]');
    for (var c = 0; c < cells.length; c++) {
      var spans = cells[c].querySelectorAll('span[id][data-kn="connection-value"]');
      if (spans.length) {
        for (var i = 0; i < spans.length; i++) {
          var v = (spans[i].textContent || '').trim().toLowerCase();
          if (v === 'no' || v === 'false') return true;
        }
      } else {
        // No per-accessory spans — single plain value for the cell.
        var pv = (cells[c].textContent || '').trim().toLowerCase();
        if (pv === 'no' || pv === 'false') return true;
      }
    }
    return false;
  }

  function buildLocalBracket(sowItems) {
    var set = Object.create(null);
    var view = document.getElementById(SOW_VIEW);
    if (!view || !sowItems) return set;
    for (var i = 0; i < sowItems.length; i++) {
      var rec = sowItems[i];
      var id = rec && rec.id;
      if (!id) continue;
      if (rowHasWrongAccessory(view, id)) set[id] = true;
    }
    return set;
  }

  function analyze(sowItems) {
    var w = wv2();
    if (w) {
      try { w.analyze(sowItems || [], SOW_VIEW); }
      catch (e) {
        if (ns.CONFIG && ns.CONFIG.debug) console.warn('[scw-br-v2] warnings analyze failed', e);
      }
    }
    bracketSet = buildLocalBracket(sowItems);
  }

  function issuesFor(sowItemId) {
    if (!sowItemId) return [];
    var out = [];
    var w = wv2();
    if (w && typeof w.getIssuesFor === 'function') {
      var base = [];
      try { base = w.getIssuesFor(SOW_VIEW, sowItemId) || []; } catch (e) { base = []; }
      for (var i = 0; i < base.length; i++) {
        // Drop the analyzer's bracket result — we compute wrong-accessory
        // locally (accessory records aren't in view_3921's model here).
        if (base[i] !== 'bracket' && out.indexOf(base[i]) === -1) out.push(base[i]);
      }
    }
    if (bracketSet[sowItemId] && out.indexOf('bracket') === -1) out.push('bracket');
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
