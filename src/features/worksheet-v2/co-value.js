/*** CHANGE ORDER VALUE STRIP (scene_1362 + sub scene_1374) ****************
 *
 * Live valuation of the CO being drafted, rendered into the CO header card
 * directly under the CO-number/status row:
 *
 *   CHANGE ORDER VALUE
 *                     Client      Equip · Install     Sub bid   Labor margin
 *   ● Adds  1 line    $1,137.00   $0.00 · $1,137.00   $850.00   25.2%
 *   ● Credits 0 lines     $0.00   …
 *   ● Net change      $1,137.00   …                   $850.00   25.2%
 *
 * One white card, deploy-page language (2026-10-01: replaced three tinted
 * boxes). The ops table shows BOTH sides of the money: the CLIENT change
 * (equip net + install fee) and the SUB change (extended sub bid,
 * field_2151) with the labor margin as a % of the install fee, so the PM sees
 * what the client pays AND what SCW owes the sub for the same lines — a
 * not-billable CO reads $0 client / real sub cost / negative margin.
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
 * Recurring licenses (License bucket) are NOT adds or credits: the
 * proposal bills them separately under Recurring Services, outside the
 * project total. They get their own fourth tile on the ops strip
 * ("Recurring licenses · billed separately", their extended net) and stay
 * out of Adds / Credits / Net change; the sub strip never counts them
 * (a license is not the sub's to price).
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
  var F_BUCKET = 'field_2219';  // proposal bucket (connection)
  var LICENSE_BUCKET = '645554dce6f3a60028362a6a';
  function isLicense(rec, viewKey) {
    try {
      if (ns.card && typeof ns.card.isLicenseBucket === 'function') return ns.card.isLicenseBucket(rec, viewKey);
    } catch (e) { /* fall through */ }
    var raw = rec && rec[F_BUCKET + '_raw'];
    var one = Array.isArray(raw) ? raw[0] : raw;
    return !!one && (one.id === LICENSE_BUCKET || /^\s*licen[cs]e/i.test(String(one.identifier || '')));
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // One white card, deploy-page language (docs/deploy-page-redesign.md
      // "Visual restraint"): 1px #e2e8f0 border, 12px radius, eyebrow label,
      // tabular numbers, a small colored DOT for sign — no tinted boxes.
      '.scw-co-value{margin:12px 0 14px;padding:10px 16px 6px;background:#fff;',
      'border:1px solid #e2e8f0;border-radius:12px;box-sizing:border-box;}',
      '.scw-co-val-eyebrow{font:700 10.5px/1 system-ui,-apple-system,sans-serif;letter-spacing:.1em;',
      'text-transform:uppercase;color:#64748b;margin-bottom:6px;}',
      '.scw-co-val-table{width:100%;border-collapse:collapse;font:13px/1.35 system-ui,-apple-system,sans-serif;',
      'color:#0f172a;font-variant-numeric:tabular-nums;}',
      '.scw-co-val-table th{font:700 10.5px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.06em;',
      'text-transform:uppercase;color:#94a3b8;text-align:right;padding:0 0 5px 14px;white-space:nowrap;}',
      '.scw-co-val-table th:first-child{text-align:left;padding-left:0;}',
      '.scw-co-val-table td{padding:6px 0 6px 14px;text-align:right;white-space:nowrap;',
      'border-top:1px solid #eef2f7;color:#334155;}',
      '.scw-co-val-table td:first-child{text-align:left;padding-left:0;}',
      '.scw-co-val-row-label{display:inline-flex;align-items:center;gap:7px;font-weight:600;color:#0f172a;}',
      '.scw-co-val-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#cbd5e1;}',
      '.scw-co-val-dot--adds{background:#16a34a;}',
      '.scw-co-val-dot--credits{background:#e11d48;}',
      '.scw-co-val-dot--net{background:#163C6E;}',
      '.scw-co-val-dot--lic{background:#94a3b8;}',
      '.scw-co-val-count{font-weight:400;color:#94a3b8;font-size:11.5px;margin-left:2px;}',
      '.scw-co-val-table td.scw-co-val-main{font-weight:700;color:#0f172a;}',
      '.scw-co-val-table tr.scw-co-val-net td{border-top:2px solid #163C6E;padding-top:8px;}',
      '.scw-co-val-table tr.scw-co-val-net td.scw-co-val-main{color:#163C6E;font-size:15px;}',
      '.scw-co-val-sub{color:#64748b;font-size:12px;}',
      '.scw-co-val-neg{color:#be123c;}',
      '.scw-co-val-foot{font:400 11px/1.4 system-ui,sans-serif;color:#94a3b8;margin-top:6px;}',
      '.scw-co-val-list{display:block;font:400 11px/1.3 system-ui,sans-serif;color:#94a3b8;text-decoration:line-through;}',
      '.scw-co-val-flag{margin-left:10px;font:600 10.5px/1 system-ui,sans-serif;letter-spacing:0;',
      'text-transform:none;color:#475569;}'
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

  function compute(records, viewKey) {
    var adds = { count: 0, eq: 0, fee: 0, bid: 0 };
    var rem  = { count: 0, eq: 0, fee: 0, bid: 0 };
    var lic  = { count: 0, eq: 0, fee: 0, bid: 0 };
    for (var i = 0; i < (records ? records.length : 0); i++) {
      var r = records[i];
      if (!r) continue;
      if (isLicense(r, viewKey)) {
        lic.count++;
        lic.eq += readNum(r, F_EQUIP);   // a Remove of a license carries its negative net
        continue;
      }
      var b = /remove/i.test(readTxt(r, F_ACTION)) ? rem : adds;
      b.count++;
      b.eq  += readNum(r, F_EQUIP);
      b.fee += readNum(r, F_FEE);
      b.bid += readNum(r, F_BID);
    }
    return { adds: adds, rem: rem, lic: lic };
  }
  function neg(n, str) { return n < 0 ? '<span class="scw-co-val-neg">' + str + '</span>' : str; }
  function money(n) { return neg(n, esc(fmtMoney(n))); }
  // Labor margin as a PERCENT of the install fee: (fee − bid) / fee. No fee
  // (nothing charged for labor) → "—"; a bid above the fee reads negative.
  function marginPct(fee, bid) {
    if (!fee) return '<span class="scw-co-val-sub">&mdash;</span>';
    var pct = (fee - bid) / Math.abs(fee) * 100;
    var str = (pct < 0 ? '−' : '') + Math.abs(pct).toFixed(pct % 1 === 0 ? 0 : 1) + '%';
    return neg(pct, esc(str));
  }
  function rowLabel(kind, label, count) {
    return '<span class="scw-co-val-row-label"><span class="scw-co-val-dot scw-co-val-dot--' + kind +
      '"></span>' + esc(label) +
      (count != null ? '<span class="scw-co-val-count">' + count + ' ' + (count === 1 ? 'line' : 'lines') + '</span>' : '') +
      '</span>';
  }

  // A CO authorized as NOT BILLABLE charges the client nothing, whatever
  // the lines carry — co-stage-strip reads that off the Acceptance.
  function notBillable() {
    try {
      var st = window.SCW && SCW.coStage;
      var a = st && typeof st.getAcceptance === 'function' ? st.getAcceptance() : null;
      return !!(a && a.notBillable);
    } catch (e) { return false; }
  }

  // Ops table: Client (equip net + install fee, with the split) | Sub bid |
  // Labor margin (fee − bid). Rows: Adds, Credits, Net change, and
  // Recurring licenses (billed separately) when the CO carries any.
  // Not billable: the client column reads $0.00 (the line prices stay
  // visible, muted, as "list"), and the margin column says what SCW eats.
  function opsTable(t) {
    var nb = notBillable();
    function row(kind, label, count, b, isNet) {
      var client = b.eq + b.fee;
      var clientCell = nb
        ? '<td class="scw-co-val-main">$0.00' +
            (client ? '<span class="scw-co-val-list">list ' + esc(fmtMoney(client)) + '</span>' : '') +
          '</td>'
        : '<td class="scw-co-val-main">' + money(client) + '</td>';
      var marginCell = nb
        ? '<td class="scw-co-val-sub">' + (b.bid ? 'SCW absorbs ' + esc(fmtMoney(Math.abs(b.bid))) : '&mdash;') + '</td>'
        : '<td>' + marginPct(b.fee, b.bid) + '</td>';
      return '<tr' + (isNet ? ' class="scw-co-val-net"' : '') + '>' +
        '<td>' + rowLabel(kind, label, count) + '</td>' +
        clientCell +
        '<td class="scw-co-val-sub">' + money(b.eq) + ' &middot; ' + money(b.fee) + '</td>' +
        '<td>' + money(b.bid) + '</td>' +
        marginCell +
      '</tr>';
    }
    var net = { eq: t.adds.eq + t.rem.eq, fee: t.adds.fee + t.rem.fee, bid: t.adds.bid + t.rem.bid };
    var lic = t.lic.count
      ? '<tr><td>' + rowLabel('lic', 'Recurring licenses', t.lic.count) + '</td>' +
        '<td class="scw-co-val-main">' + money(t.lic.eq) + '</td>' +
        '<td class="scw-co-val-sub" colspan="3">billed separately &middot; not in net change</td></tr>'
      : '';
    return '<div class="scw-co-val-eyebrow">Change order value' +
        (nb ? '<span class="scw-co-val-flag">Not billable &middot; client is charged nothing</span>' : '') +
      '</div>' +
      '<table class="scw-co-val-table"><thead><tr>' +
        '<th></th><th>Client</th><th>Equip &middot; Install</th><th>Sub bid</th><th>' +
        (nb ? 'Labor margin' : 'Labor margin') + '</th>' +
      '</tr></thead><tbody>' +
        row('adds',    'Adds',       t.adds.count, t.adds, false) +
        row('credits', 'Credits',    t.rem.count,  t.rem,  false) +
        row('net',     'Net change', null,         net,    true) +
        lic +
      '</tbody></table>' +
      '<div class="scw-co-val-foot">' + (nb
        ? 'Not billable: the client is invoiced $0 &middot; "list" is what the lines would have billed &middot; ' +
          'SCW absorbs the sub bid'
        : 'Client = equipment net + install fee &middot; ' +
          'Labor margin = (install fee &minus; sub bid) &divide; install fee') + '</div>';
  }

  // Sub portal: the sub's own labor only (equip / install fee are client
  // money the sub must not see).
  function laborTable(t) {
    function row(kind, label, count, bid, isNet) {
      return '<tr' + (isNet ? ' class="scw-co-val-net"' : '') + '>' +
        '<td>' + rowLabel(kind, label, count) + '</td>' +
        '<td class="scw-co-val-main">' + money(bid) + '</td></tr>';
    }
    return '<div class="scw-co-val-eyebrow">Change order value</div>' +
      '<table class="scw-co-val-table"><thead><tr><th></th><th>Labor (Sub Bid)</th></tr></thead><tbody>' +
        row('adds',    'Adds',       t.adds.count, t.adds.bid, false) +
        row('credits', 'Credits',    t.rem.count,  t.rem.bid,  false) +
        row('net',     'Net change', null, t.adds.bid + t.rem.bid, true) +
      '</tbody></table>';
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

    var t = compute(records, pair.coView);
    el.innerHTML = pair.mode === 'labor' ? laborTable(t) : opsTable(t);
  }

  // co-stage-strip calls this after its own render (it owns the Acceptance
  // read the ops table's not-billable branch depends on).
  window.SCW = window.SCW || {};
  SCW.coValue = { refresh: function () { PAIRS.forEach(render); } };

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
