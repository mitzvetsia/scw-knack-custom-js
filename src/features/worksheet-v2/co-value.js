/*** CHANGE ORDER VALUE STRIP (scene_1362 + sub scene_1374) ****************
 *
 * Live valuation of the CO being drafted, rendered into the CO header card
 * directly under the CO-number/status row:
 *
 *   [ ADDS  n lines ]  [ CREDITS  n lines ]  [ NET CHANGE ]
 *     $1,252.00           −$1,336.00            −$84.00
 *     Equip … · Install …
 *
 * Money model (docs/change-orders.md decision 7): adds = charges, removes =
 * credits carried as NEGATIVE money on the Remove line itself. So the strip
 * is sign-agnostic — it buckets lines by CO Action (field_2965) and sums
 * exactly what the records say:
 *
 *   line value = equipment extended net (field_2269) + install fee (field_2028)
 *
 * If a Remove line's money hasn't been negated (seeding gap), its positive
 * value shows up in the Credits tile — deliberately visible, not masked.
 *
 * Data source: the CO worksheet's own view model via the v2 data layer —
 * subscribe() keeps the strip live as lines are added/edited/removed,
 * readRecords() serves the mount-time render.
 *
 * Deployments: internal CO drafting scene (view_4092 header ← view_4079
 * worksheet) and the sub portal Manage Change Order page (view_4121 header
 * ← view_4112 worksheet).
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  // mode 'labor' (sub portal): equip net + install fee are CLIENT-facing
  // money the sub must not see — the sub strip totals extended Sub Bid
  // (field_2151, their own labor pricing) instead.
  var PAIRS = [
    { coView: 'view_4079', hdrView: 'view_4092' },                  // internal scene_1362
    { coView: 'view_4112', hdrView: 'view_4121', mode: 'labor' }    // sub portal scene_1374
  ];
  var STYLE_ID = 'scw-co-value-css';

  var F_ACTION = 'field_2965';  // CO_FLAG action (Remove on credit lines)
  var F_EQUIP  = 'field_2269';  // equipment extended net
  var F_FEE    = 'field_2028';  // install fee extended
  var F_BID    = 'field_2151';  // extended sub bid (labor — the sub's number)

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-co-value{display:flex;gap:10px;flex-wrap:wrap;',
      'padding:12px 0;margin-bottom:14px;border-bottom:1px solid #e2e8f0;}',
      '.scw-co-val-tile{flex:1 1 170px;min-width:160px;border:1px solid #e2e8f0;',
      'border-radius:8px;padding:8px 12px;background:#fff;}',
      '.scw-co-val-tile--adds{background:#f0fdf4;border-color:#bbf7d0;}',
      '.scw-co-val-tile--credits{background:#fff1f2;border-color:#fecdd3;}',
      '.scw-co-val-tile--net{background:#eff6ff;border-color:#bfdbfe;}',
      '.scw-co-val-head{display:flex;align-items:baseline;gap:6px;margin-bottom:2px;}',
      '.scw-co-val-label{font:700 10px/1.2 system-ui,-apple-system,sans-serif;',
      'letter-spacing:.07em;text-transform:uppercase;color:#64748b;}',
      '.scw-co-val-count{font:400 10.5px/1.2 system-ui,sans-serif;color:#94a3b8;}',
      '.scw-co-val-amt{font:700 17px/1.25 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-co-val-tile--adds .scw-co-val-amt{color:#15803d;}',
      '.scw-co-val-tile--credits .scw-co-val-amt{color:#be123c;}',
      '.scw-co-val-tile--net .scw-co-val-amt{color:#0f4c75;font-size:18px;}',
      '.scw-co-val-split{font:400 11px/1.4 system-ui,sans-serif;color:#64748b;',
      'margin-top:1px;white-space:nowrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function readTxt(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'string' && raw) return raw;
    return String(rec[key] == null ? '' : rec[key]).replace(/<[^>]*>/g, '').trim();
  }

  function readNum(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    var s = readTxt(rec, key);
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  // Sign-aware currency: −$1,336.00 (real minus sign) / $540.00.
  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    var s = '$' + Math.abs(n).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−' : '') + s;
  }

  function compute(records) {
    var adds = { count: 0, eq: 0, fee: 0, bid: 0 };
    var rem  = { count: 0, eq: 0, fee: 0, bid: 0 };
    for (var i = 0; i < (records ? records.length : 0); i++) {
      var r = records[i];
      if (!r) continue;
      var b = /remove/i.test(readTxt(r, F_ACTION)) ? rem : adds;
      b.count++;
      b.eq  += readNum(r, F_EQUIP);
      b.fee += readNum(r, F_FEE);
      b.bid += readNum(r, F_BID);
    }
    return { adds: adds, rem: rem };
  }

  function tile(cls, label, count, eq, fee, countNoun) {
    var total = eq + fee;
    var noun = countNoun || (count === 1 ? 'line' : 'lines');
    return '<div class="scw-co-val-tile scw-co-val-tile--' + cls + '">' +
      '<div class="scw-co-val-head">' +
        '<span class="scw-co-val-label">' + esc(label) + '</span>' +
        (count != null ? '<span class="scw-co-val-count">' + count + ' ' + noun + '</span>' : '') +
      '</div>' +
      '<div class="scw-co-val-amt">' + esc(fmtMoney(total)) + '</div>' +
      '<div class="scw-co-val-split">Equip ' + esc(fmtMoney(eq)) +
        ' &middot; Install ' + esc(fmtMoney(fee)) + '</div>' +
    '</div>';
  }

  // Labor tile (sub mode): one number — the extended Sub Bid total. No
  // equip/install split, since those are client-facing figures.
  function tileLabor(cls, label, count, bid) {
    var noun = count === 1 ? 'line' : 'lines';
    return '<div class="scw-co-val-tile scw-co-val-tile--' + cls + '">' +
      '<div class="scw-co-val-head">' +
        '<span class="scw-co-val-label">' + esc(label) + '</span>' +
        (count != null ? '<span class="scw-co-val-count">' + count + ' ' + noun + '</span>' : '') +
      '</div>' +
      '<div class="scw-co-val-amt">' + esc(fmtMoney(bid)) + '</div>' +
      '<div class="scw-co-val-split">Labor (Sub Bid)</div>' +
    '</div>';
  }

  function render(pair) {
    var elId = 'scw-co-value-' + pair.coView;
    var viewEl = document.getElementById(pair.hdrView);
    var form = viewEl && viewEl.querySelector('form');
    if (!form) return;
    injectCss();

    var el = document.getElementById(elId);
    if (!el) {
      el = document.createElement('div');
      el.id = elId;
      el.className = 'scw-co-value';
    }
    // Keep the strip pinned under the header row — or under the stage strip
    // (co-stage-strip.js) when it's mounted between them. Both build on
    // their own timers, so reposition on every render.
    var stage = form.querySelector('#scw-co-stage');
    var hdr   = form.querySelector('.scw-co-hdr');
    var anchor = stage || hdr;
    var want = anchor ? anchor.nextSibling : form.firstChild;
    if (el.parentNode !== form || (anchor && anchor.nextElementSibling !== el)) {
      form.insertBefore(el, want);
    }

    var records = [];
    try {
      if (ns.data && typeof ns.data.readRecords === 'function') {
        records = ns.data.readRecords(pair.coView) || [];
      }
    } catch (e) { /* view not loaded yet — render zeros */ }

    var t = compute(records);
    if (pair.mode === 'labor') {
      el.innerHTML =
        tileLabor('adds',    'Adds',       t.adds.count, t.adds.bid) +
        tileLabor('credits', 'Credits',    t.rem.count,  t.rem.bid) +
        tileLabor('net',     'Net change', null, t.adds.bid + t.rem.bid);
    } else {
      el.innerHTML =
        tile('adds',    'Adds',       t.adds.count, t.adds.eq, t.adds.fee) +
        tile('credits', 'Credits',    t.rem.count,  t.rem.eq,  t.rem.fee) +
        tile('net',     'Net change', null,
             t.adds.eq + t.rem.eq, t.adds.fee + t.rem.fee);
    }
  }

  PAIRS.forEach(function (pair) {
    var EVENT_NS = '.scwCoValue' + pair.coView.replace('view_', '');
    function soon() {
      // After co-header-card's 50ms enhance pass so .scw-co-hdr exists.
      setTimeout(function () { render(pair); }, 120);
      setTimeout(function () { render(pair); }, 600);   // catch a late v2 model populate
    }

    // Live updates as CO lines are added / edited / removed.
    if (ns.data && typeof ns.data.subscribe === 'function') {
      ns.data.subscribe(pair.coView, function () { render(pair); });
    }

    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(pair.hdrView, soon, EVENT_NS);
      SCW.onViewRender(pair.coView, soon, EVENT_NS);
    }
    $(document).off('knack-view-render.' + pair.hdrView + EVENT_NS)
      .on('knack-view-render.' + pair.hdrView + EVENT_NS, soon);
  });
})();
/*** END: CO value strip ***************************************************/
