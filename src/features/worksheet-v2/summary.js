/*** WORKSHEET V2 — SUMMARY ***************************************************
 *
 * Per-L1 summary block. Rendered at the top of each L1 body. Visible in
 * "summary only" mode (cards hidden) and in the default expanded view
 * (sits above the cards as a glanceable header).
 *
 * Content (first cut — kept compact, can grow):
 *   - "N items"  — total card count under this L1
 *   - "$X.XX install fee" — sum of field_2028 across the L1\'s records
 *   - bucket chips: "Cam: 3 · NVR: 1 · Service: 2 · Assumption: 0"
 *
 * Numbers are read from the record attributes the same way card.js
 * reads them, so this stays consistent if v1 / Knack do formula
 * recomputes on save.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function readNum(rec, fieldKey) {
    if (!rec) return 0;
    var raw = rec[fieldKey + '_raw'];
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      var n = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    }
    var s = (rec[fieldKey] || '').toString().replace(/<[^>]*>/g, '');
    var v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }

  var CAT_LABEL = {
    cam:         'Cam/Reader',
    'default':   'NVR/Other',
    services:    'Service',
    assumptions: 'Assumption'
  };
  var CAT_ORDER = ['cam', 'default', 'services', 'assumptions'];

  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    return '$' + n.toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  /** Build a summary <div> for an L1 group. l1 is the same shape that
   *  groups.js produces — { id, label, l2: [...], recordCount, ... }. */
  function buildL1Summary(l1) {
    var totalFee = 0;
    var totalSub = 0;
    var byCat = { cam: 0, 'default': 0, services: 0, assumptions: 0 };

    var bucketCategoryOf = (ns.card && ns.card.bucketCategoryOf) ||
                           function () { return 'default'; };

    for (var i = 0; i < (l1.l2 || []).length; i++) {
      var l2 = l1.l2[i];
      var recs = (l2 && l2.records) || [];
      for (var j = 0; j < recs.length; j++) {
        var rec = recs[j];
        if (!rec) continue;
        var cat = bucketCategoryOf(rec);
        if (!(cat in byCat)) cat = 'default';
        byCat[cat]++;
        totalFee += readNum(rec, 'field_2028'); // install fee
        totalSub += readNum(rec, 'field_2150'); // sub bid
      }
    }

    var chips = '';
    for (var c = 0; c < CAT_ORDER.length; c++) {
      var cat = CAT_ORDER[c];
      if (!byCat[cat]) continue;
      chips +=
        '<span class="scw-ws-v2-summary-chip scw-ws-v2-summary-chip--' + cat + '">' +
          esc(CAT_LABEL[cat]) + ': ' + byCat[cat] +
        '</span>';
    }

    var html =
      '<div class="scw-ws-v2-summary">' +
        '<div class="scw-ws-v2-summary-stat">' +
          '<span class="scw-ws-v2-summary-stat-value">' + (l1.recordCount || 0) + '</span>' +
          '<span class="scw-ws-v2-summary-stat-label">items</span>' +
        '</div>' +
        '<div class="scw-ws-v2-summary-stat">' +
          '<span class="scw-ws-v2-summary-stat-value">' + esc(fmtMoney(totalSub)) + '</span>' +
          '<span class="scw-ws-v2-summary-stat-label">sub bid</span>' +
        '</div>' +
        '<div class="scw-ws-v2-summary-stat">' +
          '<span class="scw-ws-v2-summary-stat-value">' + esc(fmtMoney(totalFee)) + '</span>' +
          '<span class="scw-ws-v2-summary-stat-label">install fee</span>' +
        '</div>' +
        '<div class="scw-ws-v2-summary-chips">' + chips + '</div>' +
      '</div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    return wrap.firstChild;
  }

  ns.summary = {
    buildL1Summary: buildL1Summary
  };
})();
/*** END WORKSHEET V2 — SUMMARY ***********************************************/
