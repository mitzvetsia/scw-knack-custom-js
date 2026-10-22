/* Velocity Worksheet core: pure math + HTML string renderers.
   Used by the node build (bakes the first frame) and inlined in the page (live recompute). */
(function (root) {
  'use strict';

  var DEFAULT_SETTINGS = { sharePct: 25, minUnits: 20, horizon: 8, baseline: '6', leadMonths: 0 };
  var STATUS_LABEL = { unknown: 'Not assessed', ongoing: 'Ongoing', ending: 'Ending', oneoff: 'One-off' };
  var DECISION_LABEL = { '': '— decide', order: 'Order', hold: 'Hold', watch: 'Watch', skip: 'Skip' };

  function sum(a, from, to) { var s = 0; for (var i = Math.max(0, from); i < Math.min(a.length, to); i++) s += a[i]; return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; d = d == null ? 0 : d; return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function money(n) { return n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
  function docId(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function monthLabel(ym) { var p = ym.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0].slice(2); }
  function addMonths(ym, n) { var p = ym.split('-'); var y = +p[0], m = +p[1] - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); }
  function monthsBetween(a, b) { var pa = a.split('-'), pb = b.split('-'); return (+pb[0] - +pa[0]) * 12 + (+pb[1] - +pa[1]); }

  function windows(units) {
    var L = units.length;
    return { u12: sum(units, L - 12, L), u6: sum(units, L - 6, L), u3: sum(units, L - 3, L) };
  }
  function baselineVel(units, mode) {
    var w = windows(units), v12 = w.u12 / 12, v6 = w.u6 / 6, v3 = w.u3 / 3;
    if (mode === '3') return v3; if (mode === '12') return v12;
    if (mode === 'blend') return 0.5 * v3 + 0.3 * v6 + 0.2 * v12;
    return v6;
  }

  /* A driver is a customer whose purchases of one SKU are big enough to distort its velocity. */
  function detectDrivers(sku, months, settings) {
    var w = windows(sku.units), out = [], L = months.length;
    sku.customers.forEach(function (c) {
      var share = w.u12 > 0 ? c.total / w.u12 : 0;
      var first = -1, last = -1, active = 0;
      for (var i = 0; i < L; i++) if (c.units[i] > 0) { if (first < 0) first = i; last = i; active++; }
      var flagged = share >= settings.sharePct / 100 && c.total >= settings.minUnits;
      if (flagged) out.push({ cid: c.cid, units: c.units, total: c.total, share: share, monthsActive: active,
        first: months[first], last: months[last], stillBuying: last >= L - 2, orders: c.orders, pipeline: c.pipeline,
        recentRate: sum(c.units, L - 3, L) / 3 });
    });
    return out;
  }

  /* outlooks: { "<sku>|<cid>": {status, rate, endMonth, note} } */
  function computeSku(sku, data, settings, outlooks) {
    var months = data.months, L = months.length, asOf = data.asOf, H = Number(settings.horizon) || 8;
    var w = windows(sku.units);
    var drivers = detectDrivers(sku, months, settings);
    var adjUnits = sku.units.slice(), extra = 0, notes = [], unresolved = 0;
    drivers.forEach(function (d) {
      var o = outlooks[sku.sku + '|' + d.cid] || {};
      var st = o.status || 'unknown';
      d.status = st; d.outlook = o;
      var rate = o.rate != null && o.rate !== '' ? Number(o.rate) : null;
      function strip() { for (var i = 0; i < L; i++) adjUnits[i] -= d.units[i]; }
      if (st === 'unknown') { unresolved++; return; }
      if (st === 'oneoff') { strip(); d.effect = 'removed from baseline'; return; }
      if (st === 'ongoing') {
        if (rate == null) { d.effect = 'kept in baseline'; return; }
        strip(); extra += rate * H; d.effect = '+' + fmt(rate) + '/mo over horizon'; return;
      }
      if (st === 'ending') {
        strip();
        var r = rate == null ? d.recentRate : rate;
        var until = o.endMonth ? Math.max(0, Math.min(H, monthsBetween(asOf, o.endMonth))) : 0;
        extra += r * until; d.effect = until > 0 ? '+' + fmt(r) + '/mo for ' + until + ' mo' : 'removed from baseline';
      }
    });
    for (var i = 0; i < L; i++) if (adjUnits[i] < 0) adjUnits[i] = 0;
    var v12 = w.u12 / 12, v6 = w.u6 / 6, v3 = w.u3 / 3;
    var base = baselineVel(adjUnits, settings.baseline);
    var rawBase = baselineVel(sku.units, settings.baseline);
    var fwdUnits = base * H + extra;
    var fwdVel = fwdUnits / H;
    var covered = (sku.onHand || 0) + (sku.onOrder || 0);
    var hasInv = sku.onHand != null || sku.onOrder != null;
    var gap = fwdUnits - covered;
    var cs = sku.caseQty && sku.caseQty > 0 ? sku.caseQty : 1;
    var noReorder = /^(DWO|DISC)/i.test(sku.status || '');
    var suggested = gap > 0 && !noReorder ? Math.ceil(gap / cs) * cs : 0;
    var cover = fwdVel > 0 ? covered / fwdVel : (covered > 0 ? Infinity : 0);
    var runout = fwdVel > 0 ? addMonths(asOf, Math.floor(cover)) : null;
    var trend = v12 > 0 ? v3 / v12 : (v3 > 0 ? Infinity : 1);
    return { w: w, v12: v12, v6: v6, v3: v3, trend: trend, drivers: drivers, unresolved: unresolved,
      base: base, rawBase: rawBase, extra: extra, fwdUnits: fwdUnits, fwdVel: fwdVel, covered: covered, hasInv: hasInv,
      suggested: suggested, noReorder: noReorder, gap: gap, cover: cover, runout: runout, cost: sku.cost != null ? suggested * sku.cost : null };
  }

  function computeAll(data, settings, outlooks) {
    var out = {};
    data.skus.forEach(function (s) { out[s.sku] = computeSku(s, data, settings, outlooks); });
    return out;
  }

  /* ---------- renderers (HTML strings) ---------- */
  function spark(units, driverUnits, w, h) {
    w = w || 96; h = h || 26; var n = units.length, max = 0;
    for (var i = 0; i < n; i++) max = Math.max(max, units[i]);
    if (max <= 0) return '<svg class="spk" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><line x1="0" y1="' + (h - 1) + '" x2="' + w + '" y2="' + (h - 1) + '" class="spk-base"/></svg>';
    var bw = (w - (n - 1) * 2) / n, s = '';
    for (var j = 0; j < n; j++) {
      var x = j * (bw + 2), bh = Math.max(1, (units[j] / max) * (h - 2)), y = h - bh;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="1" class="spk-bar"/>';
      if (driverUnits && driverUnits[j] > 0) {
        var dh = Math.min(bh, (driverUnits[j] / max) * (h - 2));
        s += '<rect x="' + x.toFixed(1) + '" y="' + (h - dh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + dh.toFixed(1) + '" rx="1" class="spk-drv"/>';
      }
    }
    return '<svg class="spk" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + s + '</svg>';
  }
  function trendChip(t) {
    if (t === Infinity) return '<span class="chip up" title="No sales a year ago, selling now">new</span>';
    if (t >= 1.3) return '<span class="chip up">▲ ' + fmt((t - 1) * 100) + '%</span>';
    if (t <= 0.7) return '<span class="chip down">▼ ' + fmt((1 - t) * 100) + '%</span>';
    return '<span class="chip flat">● ' + (t >= 1 ? '+' : '−') + fmt(Math.abs(t - 1) * 100) + '%</span>';
  }
  function coverCell(r) {
    if (!r.hasInv) return '<span class="dim">no inv.</span>';
    if (r.cover === Infinity) return '<span class="dim">∞</span>';
    if (r.fwdVel < 1) return '<span class="dim">' + fmt(r.cover, 1) + ' mo</span>';
    var cls = r.cover < 3 ? 'crit' : r.cover < 6 ? 'warn' : 'ok';
    return '<span class="cov ' + cls + '">' + fmt(r.cover, 1) + ' mo</span>';
  }
  function driverUnitsOf(r, L) { var a = []; for (var i = 0; i < L; i++) a.push(0); r.drivers.forEach(function (d) { for (var j = 0; j < L; j++) a[j] += d.units[j]; }); return a; }

  function renderPlanRow(sku, r, data, decision) {
    decision = decision || {};
    var L = data.months.length, dec = decision.status || '';
    var drvCount = r.drivers.length, unk = r.unresolved;
    var drvCell = drvCount ? '<button type="button" class="drvbtn' + (unk ? ' unk' : '') + '" data-expand="' + esc(sku.sku) + '" title="' + (unk ? unk + ' not yet assessed' : 'all assessed') + '">' + drvCount + (unk ? ' <i>?</i>' : '') + '</button>' : '<span class="dim">–</span>';
    var inb = sku.inbound ? (sku.inbound['Early Nov'] + sku.inbound['Mid Nov'] + sku.inbound['Early Dec']) : 0;
    var statusChip = sku.status === 'LIVE' ? '' : '<span class="chip mut">' + esc(sku.status) + '</span>';
    return '<tr class="prow" data-sku="' + esc(sku.sku) + '" data-type="' + esc(sku.type || '') + '" data-status="' + esc(sku.status) + '" data-dec="' + esc(dec) + '" data-cover="' + (r.hasInv ? (r.cover === Infinity ? 9999 : r.cover.toFixed(2)) : 9998) + '" data-sug="' + r.suggested + '" data-u12="' + r.w.u12 + '" data-drv="' + drvCount + '" data-name="' + esc((sku.name + ' ' + sku.scwSku + ' ' + sku.sku).toLowerCase()) + '">' +
      '<td class="skutd"><button type="button" class="tgl" data-expand="' + esc(sku.sku) + '" aria-label="Show detail"></button><div><div class="nm">' + esc(sku.name || sku.sku) + ' ' + statusChip + '</div><div class="ids"><span class="id">' + esc(sku.scwSku || '') + '</span><span class="id dim">' + esc(sku.sku) + '</span></div></div></td>' +
      '<td class="num">' + (sku.onHand == null ? '<span class="dim">—</span>' : fmt(sku.onHand)) + '</td>' +
      '<td class="num">' + (sku.onOrder == null ? '<span class="dim">—</span>' : fmt(sku.onOrder)) + (inb ? '<div class="sub">' + fmt(inb) + ' due by Dec</div>' : '') + '</td>' +
      '<td class="num">' + fmt(r.v12, 1) + '</td><td class="num">' + fmt(r.v6, 1) + '</td><td class="num">' + fmt(r.v3, 1) + '</td>' +
      '<td class="trd">' + trendChip(r.trend) + '</td>' +
      '<td class="spktd">' + spark(sku.units, driverUnitsOf(r, L)) + '</td>' +
      '<td class="num drvtd">' + drvCell + '</td>' +
      '<td class="num fwd"><b>' + fmt(r.fwdVel, 1) + '</b>' + (Math.abs(r.fwdVel - r.rawBase) > 0.05 ? '<div class="sub">raw ' + fmt(r.rawBase, 1) + '</div>' : '') + '</td>' +
      '<td class="num">' + coverCell(r) + (r.runout && r.cover !== Infinity && r.cover < 24 ? '<div class="sub">' + monthLabel(r.runout) + '</div>' : '') + '</td>' +
      '<td class="num sug">' + (r.noReorder ? '<span class="dim" title="Status ' + esc(sku.status) + ': sell down, no reorder' + (r.gap > 0 ? '; demand exceeds stock by ' + fmt(r.gap) : '') + '">sell down</span>' : r.hasInv ? (r.suggested > 0 ? '<b>' + fmt(r.suggested) + '</b>' + (r.cost != null ? '<div class="sub">' + money(r.cost) + '</div>' : '') : '<span class="dim">0</span>') : '<span class="dim">—</span>') + '</td>' +
      '<td class="num edit"><input type="number" min="0" step="1" class="qty" id="qty-' + docId(sku.sku) + '" data-sku="' + esc(sku.sku) + '" value="' + (decision.qty != null && decision.qty !== '' ? esc(decision.qty) : '') + '" placeholder="' + (r.hasInv && r.suggested > 0 ? fmt(r.suggested) : '0') + '" aria-label="Planned order quantity"></td>' +
      '<td class="dectd"><button type="button" class="dec" data-sku="' + esc(sku.sku) + '" data-dec="' + esc(dec) + '" title="Click to cycle: decide → Order → Hold → Watch → Skip">' + DECISION_LABEL[dec] + '</button></td>' +
      '<td class="notetd"><div class="notecell" contenteditable="true" data-note-sku="' + esc(sku.sku) + '" id="note-' + docId(sku.sku) + '">' + esc(decision.note || '') + '</div></td>' +
      '</tr>';
  }

  function outlookControls(sku, d, data, custs) {
    var o = d.outlook || {}, st = d.status || 'unknown', key = sku.sku + '|' + d.cid;
    var c = custs[d.cid] || { name: d.cid };
    var statuses = ['unknown', 'ongoing', 'ending', 'oneoff'];
    var chips = statuses.map(function (s) { return '<button type="button" class="ol' + (s === st ? ' on' : '') + ' ol-' + s + '" data-ol="' + esc(key) + '" data-st="' + s + '">' + STATUS_LABEL[s] + '</button>'; }).join('');
    return '<div class="olrow" data-olkey="' + esc(key) + '">' +
      '<div class="olwho"><b>' + esc(c.name) + '</b>' + (c.hs ? ' <a href="https://app.hubspot.com/contacts/5417380/record/0-2/' + esc(c.hs) + '" target="_blank" rel="noopener" class="hs">HubSpot ↗</a>' : c.dealId ? ' <a href="https://app.hubspot.com/contacts/5417380/record/0-3/' + esc(c.dealId) + '" target="_blank" rel="noopener" class="hs">deal ↗</a>' : '') +
      '<div class="sub">' + fmt(d.total) + ' of ' + fmt(windows(sku.units).u12) + ' units (' + fmt(d.share * 100) + '%) · ' + d.orders + ' order' + (d.orders === 1 ? '' : 's') + ' · ' + monthLabel(d.first) + (d.first === d.last ? '' : ' → ' + monthLabel(d.last)) + (d.stillBuying ? ' · <span class="ok">still buying</span>' : ' · <span class="dim">fell off</span>') + (d.pipeline ? ' · ' + esc(d.pipeline) : '') + '</div></div>' +
      '<div class="olspk">' + spark(d.units, null, 96, 22) + '</div>' +
      '<div class="olchips">' + chips + '</div>' +
      '<div class="olin"><label>units / mo <input type="number" min="0" step="1" class="olrate" id="rate-' + docId(key) + '" data-ol="' + esc(key) + '" value="' + (o.rate != null && o.rate !== '' ? esc(o.rate) : '') + '" placeholder="' + fmt(d.recentRate, 0) + '"></label>' +
      '<label>until <input type="month" class="olend" id="end-' + docId(key) + '" data-ol="' + esc(key) + '" value="' + esc(o.endMonth || '') + '"></label></div>' +
      '<div class="oleff">' + (d.effect ? esc(d.effect) : st === 'unknown' ? '<span class="warn">kept in baseline until assessed</span>' : '') + '</div>' +
      '<div class="notecell olnote" contenteditable="true" data-olnote="' + esc(key) + '" id="olnote-' + docId(key) + '">' + esc(o.note || '') + '</div>' +
      '</div>';
  }

  function renderDetail(sku, r, data, custs) {
    var L = data.months.length, months = data.months;
    var bars = '', max = 0;
    for (var i = 0; i < L; i++) max = Math.max(max, sku.units[i]);
    var drv = driverUnitsOf(r, L);
    for (var j = 0; j < L; j++) {
      var u = sku.units[j], pct = max > 0 ? (u / max) * 100 : 0, dp = max > 0 ? (drv[j] / max) * 100 : 0;
      bars += '<div class="mcol"><div class="mbar"><div class="mfill" style="height:' + pct.toFixed(1) + '%"></div><div class="mdrv" style="height:' + dp.toFixed(1) + '%"></div></div><div class="mval">' + fmt(u) + '</div><div class="mlab">' + monthLabel(months[j]).slice(0, 3) + '</div></div>';
    }
    var ch = sku.channels, cw = windows(ch.web), ci = windows(ch.install), co = windows(ch.other), tot = r.w.u12 || 1;
    var mix = '<span>Web ' + fmt(cw.u12) + ' (' + fmt(cw.u12 / tot * 100) + '%)</span><span>Install ' + fmt(ci.u12) + ' (' + fmt(ci.u12 / tot * 100) + '%)</span><span>Stock / other ' + fmt(co.u12) + ' (' + fmt(co.u12 / tot * 100) + '%)</span>';
    var top = sku.customers.slice(0, 8).map(function (c) {
      var cu = custs[c.cid] || { name: c.cid }; var isD = r.drivers.some(function (d) { return d.cid === c.cid; });
      return '<tr><td>' + esc(cu.name) + (isD ? ' <span class="chip drv">driver</span>' : '') + '</td><td class="num">' + fmt(c.total) + '</td><td class="num">' + fmt(c.total / tot * 100) + '%</td><td class="num">' + c.orders + '</td><td class="spktd">' + spark(c.units, null, 96, 20) + '</td></tr>';
    }).join('');
    var retail = sum(sku.retail, 0, L);
    var inv = sku.inbound ? Object.keys(sku.inbound).map(function (k) { return sku.inbound[k] ? '<span>' + esc(k) + ' <b>' + fmt(sku.inbound[k]) + '</b></span>' : ''; }).join('') : '';
    var math = '<div class="mathbox"><div><span class="lb">Baseline</span><b>' + fmt(r.base, 1) + '</b>/mo' + (Math.abs(r.base - r.rawBase) > 0.05 ? ' <span class="dim">(raw ' + fmt(r.rawBase, 1) + ')</span>' : '') + '</div>' +
      '<div><span class="lb">Driver add-backs</span><b>' + fmt(r.extra) + '</b> units over horizon</div>' +
      '<div><span class="lb">Need</span><b>' + fmt(r.fwdUnits) + '</b> units</div>' +
      '<div><span class="lb">Covered</span><b>' + fmt(r.covered) + '</b> on hand + on order</div>' +
      '<div><span class="lb">Suggested</span><b>' + fmt(r.suggested) + '</b>' + (sku.caseQty ? ' <span class="dim">(case ' + fmt(sku.caseQty) + ')</span>' : '') + (r.cost != null ? ' · ' + money(r.cost) : '') + '</div></div>';
    return '<tr class="det" data-det="' + esc(sku.sku) + '"><td colspan="15"><div class="detwrap">' +
      '<div class="detgrid"><div><div class="dhead">Units shipped by month · darker = flagged drivers</div><div class="mchart">' + bars + '</div><div class="mix">' + mix + '</div></div>' +
      '<div><div class="dhead">Order math</div>' + math + (inv ? '<div class="dhead" style="margin-top:10px">Inbound (Adam\'s sheet)</div><div class="mix">' + inv + '</div>' : '') + (sku.supplier || sku.cost != null ? '<div class="mix" style="margin-top:6px"><span>' + esc(sku.supplier || '') + '</span>' + (sku.cost != null ? '<span>cost ' + money(sku.cost) + '</span>' : '') + (sku.caseQty ? '<span>case ' + fmt(sku.caseQty) + '</span>' : '') + '</div>' : '') + '</div></div>' +
      (r.drivers.length ? '<div class="dhead">Drivers · set the outlook for each</div>' + r.drivers.map(function (d) { return outlookControls(sku, d, data, custs); }).join('') : '<div class="dhead">No customer meets the driver rule for this SKU</div>') +
      (top ? '<div class="dhead" style="margin-top:14px">Top customers (12 months)' + (retail ? ' · plus ' + fmt(retail) + ' units from small orders' : '') + '</div><div class="tblwrap"><table class="ctbl"><thead><tr><th>Customer</th><th class="num">Units</th><th class="num">Share</th><th class="num">Orders</th><th>By month</th></tr></thead><tbody>' + top + '</tbody></table></div>' : '') +
      '</div></td></tr>';
  }

  function renderDriversTab(data, results, custs) {
    var rows = [];
    data.skus.forEach(function (s) {
      results[s.sku].drivers.forEach(function (d) { rows.push({ s: s, d: d, r: results[s.sku] }); });
    });
    rows.sort(function (a, b) { return b.d.total - a.d.total; });
    if (!rows.length) return '<div class="note">No customer meets the current driver rule. Loosen the share or unit threshold above.</div>';
    return rows.map(function (x) {
      var c = custs[x.d.cid] || { name: x.d.cid };
      return '<div class="dcard" data-st="' + x.d.status + '"><div class="dcard-hd"><div><b>' + esc(c.name) + '</b> <span class="dim">on</span> <b>' + esc(x.s.name || x.s.sku) + '</b> <span class="id dim">' + esc(x.s.scwSku || x.s.sku) + '</span></div><span class="chip ' + (x.d.status === 'unknown' ? 'warn' : 'mut') + '">' + STATUS_LABEL[x.d.status] + '</span></div>' + outlookControls(x.s, x.d, data, custs) + '</div>';
    }).join('');
  }

  function renderCustomersTab(data, results, custs) {
    var agg = {};
    data.skus.forEach(function (s) {
      s.customers.forEach(function (c) {
        var a = agg[c.cid] || (agg[c.cid] = { cid: c.cid, total: 0, skus: [], drv: 0, units: data.months.map(function () { return 0; }) });
        a.total += c.total; a.skus.push({ sku: s, total: c.total });
        for (var i = 0; i < c.units.length; i++) a.units[i] += c.units[i];
        if (results[s.sku].drivers.some(function (d) { return d.cid === c.cid; })) a.drv++;
      });
    });
    var list = Object.keys(agg).map(function (k) { return agg[k]; }).filter(function (a) { return a.total >= 10; });
    list.sort(function (a, b) { return b.total - a.total; });
    return list.slice(0, 150).map(function (a) {
      var c = custs[a.cid] || { name: a.cid }; a.skus.sort(function (x, y) { return y.total - x.total; });
      var top = a.skus.slice(0, 4).map(function (x) { return esc(x.sku.scwSku || x.sku.name || x.sku.sku) + ' <span class="dim">' + fmt(x.total) + '</span>'; }).join(' · ');
      var L = a.units.length, act = 0; for (var i = 0; i < L; i++) if (a.units[i] > 0) act++;
      return '<tr data-cname="' + esc(c.name.toLowerCase()) + '"><td><b>' + esc(c.name) + '</b>' + (c.hs ? ' <a class="hs" target="_blank" rel="noopener" href="https://app.hubspot.com/contacts/5417380/record/0-2/' + esc(c.hs) + '">HubSpot ↗</a>' : c.kind === 'order' ? ' <span class="chip mut">no deal match</span>' : '') + '<div class="sub">' + top + '</div></td><td class="num">' + fmt(a.total) + '</td><td class="num">' + a.skus.length + '</td><td class="num">' + act + '</td><td class="num">' + (a.drv ? '<span class="chip drv">' + a.drv + '</span>' : '<span class="dim">–</span>') + '</td><td class="spktd">' + spark(a.units, null, 110, 22) + '</td></tr>';
    }).join('');
  }

  function stats(data, results) {
    var n = 0, u12 = 0, drv = 0, unk = 0, low = 0, cost = 0, order = 0;
    data.skus.forEach(function (s) {
      var r = results[s.sku]; if (s.status === 'NOT IN MASTER') return;
      n++; u12 += r.w.u12; drv += r.drivers.length; unk += r.unresolved;
      if (r.hasInv && r.fwdVel >= 1 && r.cover < 3) low++;
      if (r.suggested > 0) { order++; if (r.cost != null) cost += r.cost; }
    });
    return { skus: n, u12: u12, drivers: drv, unknown: unk, low: low, orderSkus: order, cost: cost };
  }

  root.VelocityCore = { DEFAULT_SETTINGS: DEFAULT_SETTINGS, STATUS_LABEL: STATUS_LABEL, DECISION_LABEL: DECISION_LABEL,
    computeSku: computeSku, computeAll: computeAll, detectDrivers: detectDrivers, windows: windows,
    renderPlanRow: renderPlanRow, renderDetail: renderDetail, renderDriversTab: renderDriversTab, renderCustomersTab: renderCustomersTab,
    stats: stats, fmt: fmt, money: money, esc: esc, docId: docId, monthLabel: monthLabel, spark: spark };
})(typeof window !== 'undefined' ? window : globalThis);
