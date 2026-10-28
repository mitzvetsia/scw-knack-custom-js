/*** SUB BID DOCUMENT (scene_1149 — preview / submit bid page, view_3550) ****
 *
 * The bid document the sub sees on "Preview bid" IS the bid PDF. One builder
 * reads the bid's survey line items off the grid's Backbone model (never the
 * transformed table) and renders them as a document: on the page in place of
 * the Knack grid, and, on "Finalize & Submit to SCW", as the HTML
 * proposal-pdf-export posts to Make — its scene_1149 `html`, `bidLineItems`
 * and `grandTotal` come from here (SCW.bidDocument). Before this the page was
 * bid-items-grid.js's transform of the Knack table and the PDF a DOM scrape of
 * it; the scrape never captured the "Other Associated Equipment" rows the
 * transform built for no-sub-bid items (K-Bin, 2026-10-28: the PC and the TV
 * were "missing" from the bid), and the two renders drifted.
 *
 * Rules (decided 2026-10-28):
 *  - every item is its own line, grouped by MDF/IDF, then by category (the
 *    proposal bucket); Other Services lines sit under "Project Wide Services"
 *    whatever their MDF/IDF; Assumptions are a section of their own;
 *  - an item that names a REL_parent (field_2416) on this bid sits UNDER that
 *    parent (its top-level ancestor), priced or not;
 *  - a dollar amount in the sub bid field (field_2400) makes a line priced,
 *    whatever Require Sub Bid says; so does Require Sub Bid = Yes (or blank).
 *    Require Sub Bid = No with no amount = SCW-provided, "Not priced": under
 *    its parent, or in the location's closing list;
 *  - a REL_parent that is not on this bid: the item stands alone and names the
 *    parent ("Goes with E-001").
 *
 * Builder: every field in CONFIG.fields must be a COLUMN on view_3550 (Knack
 * loads only the columns a grid has); the columns can stay hidden, the table
 * itself is hidden under the document. A missing column is reported once in
 * the console and, for @getscw.com logins, in an amber note on the page.
 ****************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    sceneId: 'scene_1149',
    hostView: 'view_3550',        // Bid Items grid — this bid's survey line items (object_114)
    headerView: 'view_3552',      // bid package details: label (field_2638), expiration, client site, address, version
    hideHeaderView: true,         // the document header carries every row of view_3552 — hide the native view
    fields: {
      label:            'field_2365',   // Label (text formula: drop label on devices)
      prefix:           'field_2361',   // LABEL_drop prefix
      number:           'field_2362',   // LABEL_drop number
      product:          'field_2379',   // PRODUCT (stored name)
      productRel:       'field_2627',   // REL_product
      bucket:           'field_2366',   // REL_proposal bucket
      system:           'field_2228',   // type of system (Video / Access Control) — category titles
      mdf:              'field_2375',   // MDF / IDF
      parent:           'field_2416',   // REL_parent (child → parent)
      qty:              'field_2399',
      rate:             'field_2400',   // Labor Each — the sub bid
      ext:              'field_2401',   // Labor Total (display only)
      rsb:              'field_2478',   // FLAG_require sub bid
      labor:            'field_2409',   // Install Labor Description (rich text: <b>title</b> body)
      note:             'field_2412',   // Survey Notes
      sort:             'field_2218',   // CONFIG_sort order
      dropLength:       'field_2367',
      conduit:          'field_2368',
      existing:         'field_2370',
      plenum:           'field_2371',
      exterior:         'field_2372',
      height:           'field_2455',
      connectedDevices: 'field_2380',
      connectedTo:      'field_2381'
    },
    header: { title: 'field_2638', expires: 'field_2635', skip: ['field_2631'] },
    bucketIds: {
      assumptions: '697b7a023a31502ec68b3303',
      services:    '6977caa7f246edf67b52cbcd',
      mounting:    '594a94536877675816984cb9',
      license:     '645554dce6f3a60028362a6a'
    },
    // Category titles by proposal-bucket label, per type of system — the
    // renames bid-items-grid.js applied on the old grid.
    bucketTitles: {
      'Camera or Reader':      { 'default': 'Cameras', 'Access Control': 'Entries' },
      'Networking or Headend': { 'default': 'Networking and Headend', 'Video': 'NVRs, Switches, and Networking',
                                 'Access Control': 'AC Controllers, Switches, and Networking' },
      'Other Services':        { 'default': 'Services' }
    },
    projectWideName: 'Project Wide Services',
    noLocationName:  'No MDF / IDF',
    accent: '#07467c',
    debug: false
  };

  var NS = '[scw-bid-doc]';
  var EV = '.scwBidDocument';
  var STYLE_ID = 'scw-bid-doc-css';
  var ROOT_CLASS = 'scw-bid-doc';
  var F = CONFIG.fields;
  var FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  function dbg() {
    if (CONFIG.debug && window.console) console.log.apply(console, [NS].concat([].slice.call(arguments)));
  }

  // ── text helpers ─────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Rendered HTML → text with its line structure (one line per <br> / block).
  function lines(html) {
    var s = String(html == null ? '' : html);
    if (s.indexOf('<') === -1 && s.indexOf('&') === -1) {
      return s.split(/\r?\n/).map(norm).filter(Boolean);
    }
    var d = document.createElement('div');
    d.innerHTML = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
    return String(d.textContent || '').split(/\r?\n/).map(norm).filter(Boolean);
  }
  function clean(html) { return lines(html).join(' '); }
  // Install Labor Description: Knack stores "<p><b>Title<br></b>body</p>".
  function laborParts(html) {
    var s = String(html == null ? '' : html);
    if (!/<(b|strong)[\s>]/i.test(s)) {
      var ls = lines(s);
      return { title: '', body: ls.join(' ') };
    }
    var d = document.createElement('div');
    d.innerHTML = s;
    var b = d.querySelector('b, strong');
    var title = norm(b.textContent);
    b.parentNode.removeChild(b);
    return { title: title, body: lines(d.innerHTML).join(' ') };
  }
  function money(n) {
    n = typeof n === 'number' && isFinite(n) ? n : 0;
    var abs = Math.abs(n).toFixed(2);
    var parts = abs.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + '$' + parts.join('.');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function natCompare(a, b) {
    var ax = String(a || '').toLowerCase().split(/(\d+)/), bx = String(b || '').toLowerCase().split(/(\d+)/);
    for (var i = 0; i < Math.max(ax.length, bx.length); i++) {
      var p = ax[i] || '', q = bx[i] || '';
      if (p === q) continue;
      var pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
      if (pn && qn) return parseInt(p, 10) - parseInt(q, 10);
      return p < q ? -1 : 1;
    }
    return 0;
  }
  // "HEADEND: : behind cashregister" → "HEADEND: behind cashregister"; "IDF: 01: Guard Shack" → "IDF 01: Guard Shack"
  function tidyLocation(s) {
    s = norm(s).replace(/:\s*:/g, ':');
    return s.replace(/^IDF:\s*(\d+):/i, 'IDF $1:');
  }

  // ── record reads (Backbone attributes: field_XXXX rendered, field_XXXX_raw structured) ──
  function rawOf(rec, f) { return rec ? rec[f + '_raw'] : undefined; }
  function text(rec, f) {
    var raw = rawOf(rec, f);
    if (typeof raw === 'string') return clean(raw);
    if (typeof raw === 'number') return String(raw);
    if (Array.isArray(raw)) {
      return raw.map(function (c) { return c && typeof c === 'object' ? clean(c.identifier || c.name || '') : clean(c); })
        .filter(Boolean).join(', ');
    }
    if (raw && typeof raw === 'object') return clean(raw.identifier || raw.name || '');
    var v = rec ? rec[f] : '';
    return v == null ? '' : clean(String(v));
  }
  function textLines(rec, f) {
    var raw = rawOf(rec, f);
    return lines(typeof raw === 'string' ? raw : (rec && rec[f] != null ? rec[f] : ''));
  }
  function num(rec, f) {
    var raw = rawOf(rec, f);
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    var s = (raw != null && raw !== '' && typeof raw !== 'object') ? raw : text(rec, f);
    var n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function bool(rec, f) {                     // true / false / null (blank)
    var raw = rawOf(rec, f);
    if (typeof raw === 'boolean') return raw;
    var s = text(rec, f).toLowerCase();
    if (s === 'yes' || s === 'true') return true;
    if (s === 'no' || s === 'false') return false;
    return null;
  }
  function conns(rec, f) {
    var raw = rawOf(rec, f), out = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (c) { if (c && c.id) out.push({ id: String(c.id), label: clean(c.identifier || c.name || '') }); });
      return out;
    }
    if (raw && typeof raw === 'object' && raw.id) return [{ id: String(raw.id), label: clean(raw.identifier || raw.name || '') }];
    var html = rec ? rec[f] : '';
    if (typeof html === 'string' && html.indexOf('<span') !== -1) {
      var re = /<span[^>]*class="([0-9a-f]{24})"[^>]*>([\s\S]*?)<\/span>/gi, m;
      while ((m = re.exec(html))) out.push({ id: m[1], label: clean(m[2]) });
    }
    return out;
  }
  function has(rec, f) { return !!rec && ((f in rec) || ((f + '_raw') in rec)); }

  // ── per-record facts ─────────────────────────────────────────────────
  function bucketOf(rec) {
    var c = conns(rec, F.bucket)[0];
    return { id: c ? c.id : '', label: c ? c.label : text(rec, F.bucket) };
  }
  function bucketKind(rec) {
    var b = bucketOf(rec), ids = CONFIG.bucketIds;
    if (b.id && b.id === ids.assumptions) return 'assumptions';
    if (b.id && b.id === ids.services) return 'services';
    if (b.id && b.id === ids.mounting) return 'mounting';
    if (b.id && b.id === ids.license) return 'license';
    if (/assumption/i.test(b.label)) return 'assumptions';
    if (/service/i.test(b.label)) return 'services';
    if (/mounting/i.test(b.label)) return 'mounting';
    if (/^licen[cs]e/i.test(b.label)) return 'license';
    return 'default';
  }
  function categoryTitle(rec) {
    var label = bucketOf(rec).label || 'Other';
    var rule = CONFIG.bucketTitles[label];
    if (!rule) return label;
    var sys = (conns(rec, F.system)[0] || {}).label || text(rec, F.system);
    return rule[sys] || rule['default'] || label;
  }
  function dropLabel(rec) {                   // "E-011" — devices only; other rows carry no item label
    if (!text(rec, F.prefix)) return '';
    var lab = text(rec, F.label);
    if (lab) return lab;
    var n = text(rec, F.number);
    return n ? text(rec, F.prefix) + n : '';
  }
  function productName(rec) {
    return text(rec, F.product) || (conns(rec, F.productRel)[0] || {}).label || '';
  }
  function qtyOf(rec) { var q = num(rec, F.qty); return q > 0 ? q : 1; }
  function rateOf(rec) { return num(rec, F.rate); }
  // SCW-provided = marked no sub bid AND no amount in the sub bid field.
  function isProvided(rec) { return bool(rec, F.rsb) === false && rateOf(rec) <= 0; }
  function sortNum(rec) { var n = parseFloat(text(rec, F.sort)); return isFinite(n) ? n : 9999; }
  // The worksheet's canonical order: sort order → label (natural) → record id.
  function cmpRecords(a, b) {
    var d = sortNum(a) - sortNum(b);
    if (d) return d;
    d = natCompare(dropLabel(a) || productName(a), dropLabel(b) || productName(b));
    if (d) return d;
    return String(a.id || '') < String(b.id || '') ? -1 : 1;
  }
  function laborOf(rec) {
    var raw = rawOf(rec, F.labor);
    return laborParts(typeof raw === 'string' ? raw : (rec && rec[F.labor]) || '');
  }
  function noteOf(rec) { return textLines(rec, F.note); }

  function detailsOf(rec, kind, onBid) {
    var d = [];
    if (kind === 'default' && /camera|reader|entr/i.test(bucketOf(rec).label)) {
      if (bool(rec, F.existing) === true) d.push(['Cable', 'Existing cable']);
      else {
        var ln = num(rec, F.dropLength);
        d.push(['Cable', 'New drop' + (ln > 0 ? ', ' + ln + ' ft' : '')]);
      }
      var where = bool(rec, F.exterior) === true ? 'Exterior' : 'Interior';
      if (bool(rec, F.plenum) === true) where += ', plenum';
      d.push(['Location', where]);
      var cf = num(rec, F.conduit);
      if (cf > 0) d.push(['Conduit', cf + ' ft']);
      var h = text(rec, F.height);
      if (h) d.push(['Height', h]);
    }
    var up = conns(rec, F.connectedTo);
    if (up.length) d.push(['Connects to', up.map(function (c) { return c.label; }).join(', ')]);
    var down = conns(rec, F.connectedDevices).filter(function (c) { return onBid[c.id]; });
    if (down.length) d.push(['Connected devices', down.map(function (c) { return c.label; }).join(', ')]);
    return d;
  }

  // ── the document model ───────────────────────────────────────────────
  function build(records, header) {
    records = (records || []).filter(function (r) { return r && r.id; });
    var onBid = {};
    records.forEach(function (r) { onBid[r.id] = true; });
    var parent = {}, parentOut = {};
    records.forEach(function (r) {
      var pc = conns(r, F.parent)[0];
      if (!pc) return;
      if (onBid[pc.id] && pc.id !== r.id) parent[r.id] = pc.id;
      else parentOut[r.id] = pc.label;
    });
    function hostOf(id) {                      // top-level ancestor on this bid; null on a cycle
      var seen = {}; seen[id] = true;
      while (parent[id]) {
        id = parent[id];
        if (seen[id]) return null;
        seen[id] = true;
      }
      return id;
    }

    var sorted = records.slice().sort(cmpRecords);
    var locs = {}, assumptions = [], rowsById = {}, kids = [];

    function locationFor(r, kind) {
      var wide = kind === 'services';
      var name = wide ? CONFIG.projectWideName : (tidyLocation(text(r, F.mdf)) || CONFIG.noLocationName);
      var L = locs[name];
      if (!L) {
        L = locs[name] = { name: name, projectWide: wide, buckets: {}, bucketOrder: [], provided: [] };
      }
      return L;
    }
    function itemOf(r, kind) {
      var lab = laborOf(r), prod = productName(r);
      return {
        id: r.id, label: dropLabel(r), product: prod || lab.title || lab.body,
        descTitle: prod ? lab.title : '', desc: prod ? lab.body : (lab.title ? lab.body : ''),
        details: detailsOf(r, kind, onBid), note: noteOf(r),
        qty: qtyOf(r), rate: rateOf(r), amount: qtyOf(r) * rateOf(r),
        bucket: categoryTitle(r), kind: kind, children: []
      };
    }
    function childOf(r) {
      var priced = !isProvided(r), lab = priced ? laborOf(r) : { title: '', body: '' };
      return {
        id: r.id, label: dropLabel(r), product: productName(r), priced: priced, bucket: categoryTitle(r),
        descTitle: lab.title, desc: lab.body, note: noteOf(r),
        qty: qtyOf(r), rate: priced ? rateOf(r) : 0, amount: priced ? qtyOf(r) * rateOf(r) : 0, children: []
      };
    }
    function placeTop(r) {
      var kind = bucketKind(r), L = locationFor(r, kind), row;
      if (isProvided(r)) {
        row = { id: r.id, label: dropLabel(r), product: productName(r),
                where: categoryTitle(r) + (parentOut[r.id] ? ' · for ' + parentOut[r.id] : ''), qty: qtyOf(r), children: [] };
        L.provided.push(row);
      } else {
        row = itemOf(r, kind);
        if (parentOut[r.id]) row.details.unshift(['Goes with', parentOut[r.id]]);
        var title = row.bucket;
        if (!L.buckets[title]) {
          L.buckets[title] = { title: title, sort: sortNum(r), items: [] };
          L.bucketOrder.push(title);
        }
        L.buckets[title].items.push(row);
      }
      rowsById[r.id] = row;
    }

    sorted.forEach(function (r) {
      var kind = bucketKind(r);
      if (kind === 'assumptions') {
        var lab = laborOf(r);
        assumptions.push({ id: r.id, title: productName(r) || lab.title, text: lab.title && productName(r) ? (lab.title + ' ' + lab.body).trim() : lab.body });
        return;
      }
      if (parent[r.id] && hostOf(r.id)) kids.push(r);
      else placeTop(r);
    });
    kids.forEach(function (r) {
      var host = rowsById[hostOf(r.id)];
      if (!host) { placeTop(r); return; }      // the parent is not a row here (an assumption, say)
      var c = childOf(r);
      if (c.label && c.label === host.label) c.label = '';   // a bracket stamped with its camera's label says nothing new
      host.children.push(c);
    });

    function locKey(L) {
      var n = L.name;
      if (L.projectWide) return [4, 0, n];
      if (n === CONFIG.noLocationName) return [3, 0, n];
      if (/^HEADEND/i.test(n)) return [0, 0, n];
      var m = /^IDF\s*:?\s*(\d+)/i.exec(n);
      return m ? [1, parseInt(m[1], 10), n] : [2, 0, n];
    }
    var locations = Object.keys(locs).map(function (k) { return locs[k]; }).sort(function (a, b) {
      var ka = locKey(a), kb = locKey(b);
      return (ka[0] - kb[0]) || (ka[1] - kb[1]) || natCompare(ka[2], kb[2]);
    });

    var grand = 0, pricedCount = 0, providedCount = 0, units = 0, lineItems = [];
    var out = locations.map(function (L) {
      var sum = 0, count = 0, lines = 0;
      // A priced child is a bid line (money + count, its own category, the
      // parent named); an unpriced one is an SCW-provided line.
      function tallyKids(row, hostLabel) {
        var k = { sum: 0, count: 0 };
        row.children.forEach(function (c) {
          if (c.priced) {
            k.sum += c.amount; k.count += 1;
            lineItems.push(lineOf(c, L, c.bucket || row.bucket || '', hostLabel));
          } else { lines += 1; units += c.qty; }
        });
        return k;
      }
      var buckets = L.bucketOrder.map(function (t) { return L.buckets[t]; })
        .sort(function (a, b) { return (a.sort - b.sort) || natCompare(a.title, b.title); })
        .map(function (B) {
          var bsum = 0, bcount = 0;
          B.items.forEach(function (it) {
            lineItems.push(lineOf(it, L, B.title, ''));
            var k = tallyKids(it, it.label || it.product);
            bsum += it.amount + k.sum; bcount += 1 + k.count;
          });
          sum += bsum; count += bcount;
          return { title: B.title, items: B.items, amount: bsum, count: bcount, meta: plural(bcount, 'item', 'items') + ' · ' + money(bsum) };
        });
      L.provided.forEach(function (p) {
        lines += 1; units += p.qty;
        var k = tallyKids(p, p.label || p.product);
        sum += k.sum; count += k.count;
      });
      grand += sum; pricedCount += count; providedCount += lines;
      var meta = plural(count, 'bid item', 'bid items');
      if (lines) meta += ' · ' + lines + ' SCW-provided';
      return { name: L.name, projectWide: L.projectWide, buckets: buckets, provided: L.provided,
               amount: sum, count: count, providedCount: lines, meta: meta, subtotal: money(sum) };
    });

    function lineOf(row, L, bucket, hostLabel) {
      var labor = ((row.descTitle || '') + ' ' + (row.desc || '')).trim();
      return {
        recordId: row.id, label: row.label || '', mdfIdf: L.name, bucket: bucket,
        productName: row.product || '', laborDescription: labor,
        description: ((row.product || '') + ' ' + labor).trim(),
        parent: hostLabel || '',
        qty: row.qty, rate: money(row.rate), cost: money(row.amount), amount: row.amount
      };
    }

    var places = out.filter(function (L) { return !L.projectWide; }).length;
    var hasWide = out.some(function (L) { return L.projectWide; });
    return {
      header: header || {},
      locations: out,
      assumptions: assumptions,
      lineItems: lineItems,
      totals: {
        lines: out.map(function (L) { return { label: L.name, value: money(L.amount), amount: L.amount }; }),
        grand: grand, grandText: money(grand),
        pricedCount: pricedCount, providedCount: providedCount, units: units,
        summaryLine: plural(pricedCount, 'priced item', 'priced items') + ' · ' +
          plural(providedCount, 'SCW-provided item', 'SCW-provided items') + ' · ' +
          plural(places, 'location', 'locations') + (hasWide ? ' plus project-wide services' : ''),
        countsLine: plural(pricedCount, 'priced item', 'priced items') + ' · ' + providedCount +
          ' SCW-provided (' + plural(units, 'unit', 'units') + '), not priced'
      }
    };
  }

  // ── the bid header (view_3552, read off its rendered DOM — hidden DOM is readable) ──
  function readHeader() {
    var root = document.getElementById(CONFIG.headerView);
    var H = CONFIG.header, out = { title: '', expires: '', facts: [], survey: '', bidNo: '', projectNumber: '' };
    function bodyText(fk) {
      if (!root) return '';
      var el = root.querySelector('.kn-detail.' + fk + ' .kn-detail-body, .kn-label-none.' + fk + ' .kn-detail-body') ||
               root.querySelector('.kn-detail.' + fk + ', .kn-label-none.' + fk);
      return el ? norm(el.textContent) : '';
    }
    out.title = bodyText(H.title).replace(/[|\s]+$/, '');
    out.expires = bodyText(H.expires);
    if (root) {
      var rows = root.querySelectorAll('.kn-detail');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i], m = /\bfield_\d+\b/.exec(row.className || '');
        var fk = m ? m[0] : '';
        if (!fk || fk === H.title || fk === H.expires || H.skip.indexOf(fk) !== -1) continue;
        if (row.style && row.style.display === 'none') continue;
        var lab = row.querySelector('.kn-detail-label'), body = row.querySelector('.kn-detail-body');
        var k = lab ? norm(lab.textContent) : '', v = body ? norm(body.textContent) : '';
        if (k && v) out.facts.push({ k: k, v: v, field: fk });
      }
    }
    var sm = /\b(SR\d+)\b/i.exec(out.title), bm = /\b(B\d+)\b/.exec(out.title);
    out.survey = sm ? sm[1].toUpperCase() : '';
    out.bidNo = bm ? bm[1] : '';
    try {
      var pid = window.SCW && window.SCW.projectId;
      if (pid && typeof pid.resolve === 'function') out.projectNumber = pid.resolve(CONFIG.sceneId).id || '';
    } catch (e) { /* the banner reads "not on record" */ }
    return out;
  }

  // ── HTML ─────────────────────────────────────────────────────────────
  var A = CONFIG.accent;
  var ST = {
    muted: 'color:#64748b;',
    colHead: 'display:grid;grid-template-columns:76px minmax(0,1fr) 40px 84px 92px;column-gap:12px;padding:7px 8px 5px;border-bottom:1px solid #c8d1dc;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;',
    itemGrid: 'display:grid;grid-template-columns:76px minmax(0,1fr) 40px 84px 92px;column-gap:12px;align-items:start;',
    childGrid: 'display:grid;grid-template-columns:76px minmax(0,1fr) 40px 188px;column-gap:12px;align-items:center;font-size:12px;',
    provGrid: 'display:grid;grid-template-columns:76px minmax(0,1fr) 40px 188px;column-gap:12px;font-size:12px;color:#1f2937;',
    num: 'text-align:right;font-size:12px;font-variant-numeric:tabular-nums;',
    keep: 'page-break-inside:avoid;break-inside:avoid;'
  };

  function bannerHtml(h) {
    var pid = window.SCW && window.SCW.projectId;
    var right = [h.survey ? 'Survey ' + h.survey : '', h.bidNo ? 'Bid ' + h.bidNo : ''];
    if (pid && typeof pid.banner === 'function') {
      try { return pid.banner(h.projectNumber, { right: right }); } catch (e) { /* inline fallback below */ }
    }
    return '<div style="border-top:3px solid #0f4c75;border-bottom:1px solid #d5dde6;padding:12px 0 10px;margin:0 0 18px;">' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;">' +
        '<div><div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:5px;">Project #</div>' +
        '<div style="font-size:28px;font-weight:800;line-height:1;letter-spacing:.02em;font-variant-numeric:tabular-nums;color:#0f172a;">' +
          (h.projectNumber ? esc(h.projectNumber) : '<span style="font-size:16px;font-weight:600;color:#94a3b8;">not on record</span>') + '</div></div>' +
        '<div style="text-align:right;font-size:12px;font-weight:500;line-height:1.5;color:#475569;">' +
          right.filter(Boolean).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' +
      '</div>' +
      '<div style="margin-top:7px;font-size:12px;font-weight:500;color:#334155;">Reference this project number when contacting SCW support</div>' +
    '</div>';
  }
  function footerHtml(h) {
    var pid = window.SCW && window.SCW.projectId;
    var right = [h.survey, h.bidNo].filter(Boolean).join(' · ');
    if (pid && typeof pid.footer === 'function' && h.projectNumber) {
      try { return pid.footer(h.projectNumber, right); } catch (e) { /* inline fallback below */ }
    }
    return '<div style="margin-top:28px;padding-top:8px;border-top:1px solid #d5dde6;display:flex;justify-content:space-between;gap:16px;font-size:12px;color:#64748b;">' +
      '<div>' + (h.projectNumber ? '<span style="font-weight:700;color:#334155;">Project # ' + esc(h.projectNumber) + '</span>' + (right ? ' · ' + esc(right) : '') : esc(right)) + '</div>' +
      '<div>SCW Installation Services</div></div>';
  }

  function detailsHtml(details) {
    if (!details.length) return '';
    return '<div style="display:flex;flex-wrap:wrap;column-gap:14px;row-gap:2px;font-size:12px;color:#1f2937;">' +
      details.map(function (d) { return '<span><span style="color:#64748b;">' + esc(d[0]) + '</span> ' + esc(d[1]) + '</span>'; }).join('') +
    '</div>';
  }
  function noteHtml(note) {
    if (!note || !note.length) return '';
    return '<div style="font-size:12px;font-style:italic;color:#475569;">Survey note: ' + note.map(esc).join('<br>') + '</div>';
  }
  function descHtml(title, body) {
    if (!title && !body) return '';
    return '<div style="font-size:12px;color:#334155;">' +
      (title ? '<span style="font-weight:600;color:#1f2937;">' + esc(title) + '</span> ' : '') + esc(body) + '</div>';
  }
  function childHtml(c) {
    var chip = c.priced ? ['Accessory', A, '#eef6ff'] : ['SCW-provided', '#475569', '#f3f4f6'];
    var money_ = c.priced
      ? '<div style="display:grid;grid-template-columns:84px 92px;column-gap:12px;">' +
          '<div style="' + ST.num + '">' + esc(money(c.rate)) + '</div>' +
          '<div style="' + ST.num + 'font-weight:600;color:' + A + ';">' + esc(money(c.amount)) + '</div></div>'
      : '<div style="text-align:right;color:#64748b;">Not priced</div>';
    return '<div style="' + ST.childGrid + ST.keep + '">' +
      '<div></div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;padding:4px 8px;background:' + chip[2] + ';border-radius:3px;">' +
        '<div style="display:flex;flex-wrap:wrap;align-items:baseline;column-gap:8px;">' +
          '<span style="font-weight:600;color:' + chip[1] + ';">' + chip[0] + '</span>' +
          (c.label ? '<span style="font-weight:700;color:' + A + ';font-variant-numeric:tabular-nums;">' + esc(c.label) + '</span>' : '') +
          '<span style="font-weight:600;color:#1f2937;">' + esc(c.product) + '</span>' +
        '</div>' +
        (c.priced ? descHtml(c.descTitle, c.desc) : '') +
        noteHtml(c.note) +
      '</div>' +
      '<div style="' + ST.num + '">' + c.qty + '</div>' +
      '<div>' + money_ + '</div>' +
    '</div>';
  }
  function childrenHtml(children) {
    if (!children.length) return '';
    return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">' + children.map(childHtml).join('') + '</div>';
  }
  function itemHtml(it) {
    return '<div style="padding:9px 8px;border-bottom:1px solid #dfe5ec;' + ST.keep + '">' +
      '<div style="' + ST.itemGrid + '">' +
        '<div style="font-size:13px;font-weight:700;color:' + A + ';font-variant-numeric:tabular-nums;">' + esc(it.label) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
          '<div style="font-size:13px;font-weight:600;color:' + A + ';">' + esc(it.product) + '</div>' +
          descHtml(it.descTitle, it.desc) +
          detailsHtml(it.details) +
          noteHtml(it.note) +
        '</div>' +
        '<div style="' + ST.num + '">' + it.qty + '</div>' +
        '<div style="' + ST.num + '">' + esc(money(it.rate)) + '</div>' +
        '<div style="' + ST.num + 'font-weight:600;color:' + A + ';">' + esc(money(it.amount)) + '</div>' +
      '</div>' +
      childrenHtml(it.children) +
    '</div>';
  }
  function providedHtml(p) {
    return '<div style="padding:7px 8px;border-bottom:1px solid #e5e7eb;' + ST.keep + '">' +
      '<div style="' + ST.provGrid + '">' +
        '<div style="font-weight:600;color:#475569;">' + esc(p.label) + '</div>' +
        '<div><span style="font-weight:600;">' + esc(p.product) + '</span><span style="color:#64748b;"> · ' + esc(p.where) + '</span></div>' +
        '<div style="' + ST.num + '">' + p.qty + '</div>' +
        '<div style="text-align:right;color:#64748b;">Not priced</div>' +
      '</div>' +
      childrenHtml(p.children).replace('margin-top:6px', 'margin-top:5px') +
    '</div>';
  }
  function locationHtml(L) {
    var h = '<div style="margin-top:30px;">' +
      '<div style="padding:0 8px 6px;border-bottom:3px solid ' + A + ';display:flex;align-items:baseline;justify-content:space-between;gap:16px;page-break-after:avoid;break-after:avoid;">' +
        '<div style="font-size:20px;font-weight:300;color:' + A + ';">' + esc(L.name) + '</div>' +
        '<div style="font-size:12px;color:#475569;">' + esc(L.meta) + '</div>' +
      '</div>' +
      '<div style="' + ST.colHead + '"><div>Item</div><div>Description</div><div style="text-align:right;">Qty</div><div style="text-align:right;">Rate</div><div style="text-align:right;">Total</div></div>';
    L.buckets.forEach(function (B) {
      h += '<div style="margin-top:10px;padding:6px 8px;background:#eef6ff;display:flex;justify-content:space-between;gap:16px;font-size:13px;page-break-after:avoid;break-after:avoid;">' +
        '<span style="font-weight:600;color:' + A + ';">' + esc(B.title) + '</span>' +
        '<span style="font-weight:500;color:#475569;">' + esc(B.meta) + '</span></div>';
      h += B.items.map(itemHtml).join('');
    });
    if (L.provided.length) {
      h += '<div style="margin-top:14px;padding:8px;background:#f3f4f6;border-top:1px dashed #8a96a3;page-break-after:avoid;break-after:avoid;">' +
        '<div style="font-size:13px;font-weight:700;color:#1f2937;">Other SCW-provided equipment · no install labor</div>' +
        '<div style="margin-top:2px;font-size:12px;color:#475569;">On site at this location, not tied to one item, and not priced in this bid. If any SCW-provided equipment on this bid needs install labor, tell SCW before you submit.</div></div>' +
        '<div style="' + ST.colHead.replace('76px minmax(0,1fr) 40px 84px 92px', '76px minmax(0,1fr) 40px 188px') + 'padding:6px 8px 4px;"><div>Item</div><div>Equipment</div><div style="text-align:right;">Qty</div><div style="text-align:right;">Price</div></div>' +
        L.provided.map(providedHtml).join('');
    }
    h += '<div style="margin-top:10px;padding:8px 8px 0;border-top:2px solid ' + A + ';display:flex;justify-content:flex-end;gap:24px;font-size:13px;color:' + A + ';">' +
      '<span style="font-weight:600;">' + esc(L.name) + ' subtotal</span>' +
      '<span style="min-width:92px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;">' + esc(L.subtotal) + '</span></div>' +
    '</div>';
    return h;
  }

  function bodyHtml(model, opts) {
    opts = opts || {};
    var h = model.header || {}, T = model.totals;
    // On the page the document fills the view like the other grids do; the
    // PDF is letter-width through @page.
    var pad = opts.pdf ? '0' : '28px 40px 40px';
    var out = '<div class="scw-bid-doc-body" style="box-sizing:border-box;width:100%;' +
      'padding:' + pad + ';background:#fff;font-family:' + FONT + ';color:#1f2937;font-size:12px;line-height:1.45;">';
    out += bannerHtml(h);
    if (h.title || h.expires) {
      out += '<div class="bid-id-header" style="margin:0 0 16px;padding:0 0 10px;border-bottom:2px solid #e2e8f0;">' +
        (h.title ? '<div style="font-size:17px;font-weight:700;line-height:1.3;color:' + A + ';">' + esc(h.title) + '</div>' : '') +
        (h.expires ? '<div style="margin-top:2px;font-size:12px;color:#475569;">Bid expires: ' + esc(h.expires) + '</div>' : '') +
      '</div>';
    }
    if (h.facts && h.facts.length) {
      out += '<div style="margin-bottom:20px;font-size:12px;">' + h.facts.map(function (f) {
        return '<div style="display:grid;grid-template-columns:150px minmax(0,1fr);border-bottom:1px solid #e5e9ef;">' +
          '<div style="padding:5px 12px 5px 0;font-weight:600;color:' + A + ';">' + esc(f.k) + '</div>' +
          '<div style="padding:5px 0;">' + esc(f.v) + '</div></div>';
      }).join('') + '</div>';
    }
    out += '<div style="font-size:22px;font-weight:800;color:' + A + ';padding-bottom:4px;border-bottom:3px solid ' + A + ';">Bid Items</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#334155;">Every item is on its own line, and anything that belongs to an item sits under it: an accessory with a sub bid shows its price, SCW-provided equipment that needs no install labor is marked Not priced. SCW-provided equipment not tied to one item closes its location.</div>' +
      '<div style="margin-top:4px;font-size:12px;font-weight:600;color:#475569;">' + esc(T.summaryLine) + '</div>';
    if (!model.locations.length) {
      out += '<div style="margin-top:16px;padding:12px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:4px;font-size:12px;color:#475569;">No items on this bid yet.</div>';
    }
    out += model.locations.map(locationHtml).join('');
    if (model.assumptions.length) {
      out += '<div style="margin-top:30px;">' +
        '<div style="padding:0 8px 6px;border-bottom:3px solid ' + A + ';font-size:20px;font-weight:300;color:' + A + ';page-break-after:avoid;break-after:avoid;">General Project Assumptions</div>' +
        '<div style="margin-top:8px;padding:0 8px;display:flex;flex-direction:column;gap:7px;font-size:12px;color:#334155;">' +
          model.assumptions.map(function (a) {
            return '<div style="' + ST.keep + '">' + (a.title ? '<span style="font-weight:600;color:#1f2937;">' + esc(a.title) + '.</span> ' : '') + esc(a.text) + '</div>';
          }).join('') +
        '</div></div>';
    }
    out += '<div style="margin-top:36px;' + ST.keep + '">' +
      '<div style="font-size:20px;font-weight:600;color:' + A + ';padding-bottom:8px;border-bottom:3px solid ' + A + ';">Bid Totals</div>' +
      T.lines.map(function (t) {
        return '<div style="display:flex;justify-content:flex-end;gap:24px;padding:4px 8px;font-size:13px;">' +
          '<span style="color:#334155;">' + esc(t.label) + '</span>' +
          '<span style="min-width:110px;text-align:right;font-weight:600;color:' + A + ';font-variant-numeric:tabular-nums;">' + esc(t.value) + '</span></div>';
      }).join('') +
      '<div class="bid-grand-total" style="display:flex;justify-content:flex-end;gap:24px;margin-top:4px;padding:8px 8px 0;border-top:1px solid #c8d1dc;font-size:17px;font-weight:800;color:' + A + ';">' +
        '<span>Bid total</span><span style="min-width:110px;text-align:right;font-variant-numeric:tabular-nums;">' + esc(T.grandText) + '</span></div>' +
      '<div style="padding:6px 8px 0;text-align:right;font-size:12px;color:#475569;">' + esc(T.countsLine) + '</div>' +
    '</div>';
    out += footerHtml(h);
    out += '</div>';
    return out;
  }

  function pdfCss() {
    return [
      '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap");',
      '@page { size: letter; margin: 0.42in 0.53in; }',
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
      '*, *::before, *::after { box-sizing: border-box; }',
      'body { margin: 0; padding: 14px; background: #fff; font-family: ' + FONT + '; color: #1f2937; font-size: 12px; line-height: 1.45; }'
    ].join('\n');
  }
  // The complete document (what Make renders to the bid PDF).
  function documentHtml(model) {
    var h = model.header || {};
    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">' +
      '<title>' + esc(h.title || 'Subcontractor bid') + '</title>' +
      '<style>' + pdfCss() + '</style></head><body>' +
      // A body-level copy survives HTML→PDF modules that wrap the input in their own template.
      '<style>' + pdfCss().replace(/@import[^;]+;/g, '') + '</style>' +
      bodyHtml(model, { pdf: true }) +
      '</body></html>';
  }

  // The scrape-shaped projection proposal-pdf-export keeps in its payload
  // (sections / projectTotals); its own renderer is only a fallback for the
  // document above, but grandTotal and bidLineItems read from this shape.
  function publishView(model, viewKey) {
    var sections = model.locations.map(function (L) {
      return {
        level: 1, label: L.name, promoted: false, footer: null,
        buckets: L.buckets.map(function (B) {
          var products = [];
          B.items.forEach(function (it) {
            products.push(productEntry(it, it.children));
          });
          return { level: 2, label: B.title, products: products, footer: null };
        })
      };
    });
    function productEntry(row, children) {
      var labor = ((row.descTitle || '') + ' ' + (row.desc || '')).trim();
      return {
        label: ((row.product || '') + ' ' + labor).trim(), productLabel: row.product || '', descText: labor,
        qty: row.qty, rate: money(row.rate), cost: money(row.amount), hideCost: false, isMountingHardware: false,
        connectedDevices: [], lineItems: (children || []).filter(function (c) { return c.priced; }).map(function (c) {
          return { label: c.product, qty: c.qty, cost: money(c.amount) };
        })
      };
    }
    return {
      viewId: viewKey, type: 'grid', title: 'Bid Items', gridSource: 'bid-document',
      sections: sections,
      projectTotals: {
        title: 'Bid Totals',
        lines: model.totals.lines.map(function (t) { return { type: 'section', label: t.label, value: t.value }; })
          .concat([{ type: 'grand', label: 'Grand Total', value: model.totals.grandText }])
      }
    };
  }

  // ── data plumbing ─────────────────────────────────────────────────────
  function readRecords(viewKey) {
    var v = typeof Knack !== 'undefined' && Knack.views && Knack.views[viewKey];
    var data = v && v.model && v.model.data;
    var models = data && (Array.isArray(data) ? data : data.models);
    if (!models) return null;
    return models.map(function (m) {
      if (m && typeof m.toJSON === 'function') return m.toJSON();
      return m && m.attributes ? m.attributes : m;
    });
  }
  var _truncTries = {};
  function ensureFullPage(viewKey) {          // the grid must hold EVERY item (change-record-limit.js sets 1000/page too)
    try {
      var v = Knack.views && Knack.views[viewKey];
      var mv = v && v.model && v.model.view;
      if (mv && mv.rows_per_page !== 1000 && mv.rows_per_page !== '1000') {
        mv.rows_per_page = 1000;
        if (mv.source) mv.source.limit = 1000;
      }
      var data = v && v.model && v.model.data;
      var loaded = data && data.models ? data.models.length : 0;
      var total = data && (data.total_records != null ? data.total_records
        : (data.pagination_meta && data.pagination_meta.total_records));
      if (total != null && loaded < total && loaded > 0) {
        var tries = _truncTries[viewKey] || 0;
        if (tries < 2 && document.getElementById(viewKey)) {
          _truncTries[viewKey] = tries + 1;
          console.warn(NS + ' ' + viewKey + ' holds ' + loaded + ' of ' + total + ' items — refetching');
          v.model.fetch();
          return false;
        }
      }
    } catch (e) { /* best effort */ }
    return true;
  }
  function modelFor(viewKey) {
    viewKey = viewKey || CONFIG.hostView;
    var records = readRecords(viewKey);
    if (!records) return null;
    return build(records, readHeader());
  }

  var _warned = {};
  function missingColumns(records) {
    if (!records || !records.length) return [];
    var sample = records[0], missing = [];
    Object.keys(F).forEach(function (k) {
      if (k === 'ext' || k === 'system' || k === 'productRel' || k === 'number') return;   // optional
      if (!has(sample, F[k])) missing.push(F[k] + ' (' + k + ')');
    });
    return missing;
  }

  // ── CSS (once) ────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Everything Knack renders for the grid (view header, filter bar, "Showing
      // 1-18 of 18", the table, the records nav) stays in the DOM, hidden.
      '.scw-bid-doc-host > :not(.' + ROOT_CLASS + ') { display: none !important; }',
      '.scw-bid-doc-hidden { display: none !important; }',
      '.' + ROOT_CLASS + ' { margin: 0 0 24px; }',
      '.' + ROOT_CLASS + ' .scw-bid-doc-body { box-shadow: 0 1px 3px rgba(15, 23, 42, .12), 0 0 0 1px #e2e8f0; border-radius: 4px; }',
      '.' + ROOT_CLASS + ' .scw-bid-doc-note { margin: 0 0 10px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; font: 12px/1.45 ' + FONT + '; color: #92400e; }',
      '@media (max-width: 720px) { .' + ROOT_CLASS + ' .scw-bid-doc-body { padding: 16px !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── render on the page ───────────────────────────────────────────────
  var _lastModel = null;
  function render(viewKey) {
    viewKey = viewKey || CONFIG.hostView;
    var root = document.getElementById(viewKey);
    if (!root) return false;
    injectCss();
    if (!ensureFullPage(viewKey)) return false;
    var records = readRecords(viewKey);
    if (!records) { dbg('model not ready', viewKey); return false; }
    // Knack re-renders the table from the model, so an empty model under a
    // table that still shows rows is a model mid-reload: wait for the next render.
    if (!records.length && root.querySelector('.kn-table tbody tr[id]')) { dbg('model empty under a populated table — waiting'); return false; }

    var model = build(records, readHeader());
    var el = root.querySelector('.' + ROOT_CLASS);
    if (!el) {
      el = document.createElement('div');
      el.className = ROOT_CLASS;
      root.appendChild(el);
    }
    var note = '';
    var missing = missingColumns(records);
    if (missing.length) {
      if (!_warned[viewKey]) {
        _warned[viewKey] = true;
        console.warn(NS + ' ' + viewKey + ' is missing columns the bid document reads — add them to the view in Builder (hidden is fine): ' + missing.join(', '));
      }
      if (window.SCW && typeof window.SCW.isInternalUser === 'function' && window.SCW.isInternalUser()) {
        note = '<div class="scw-bid-doc-note"><b>Builder:</b> ' + esc(viewKey) + ' is missing columns the bid document reads — ' +
          esc(missing.join(', ')) + '. Those details are left off the page and the PDF until the columns exist. (Shown to SCW staff only.)</div>';
      }
    }
    el.innerHTML = note + bodyHtml(model, { pdf: false });
    root.classList.add('scw-bid-doc-host');
    if (CONFIG.hideHeaderView && CONFIG.headerView) {
      var hv = document.getElementById(CONFIG.headerView);
      if (hv) hv.classList.add('scw-bid-doc-hidden');
    }
    _lastModel = model;
    dbg('rendered', viewKey, model.totals.pricedCount + ' priced, ' + model.totals.providedCount + ' SCW-provided, ' + model.totals.grandText);
    return true;
  }

  // ── public API ────────────────────────────────────────────────────────
  window.SCW = window.SCW || {};
  window.SCW.bidDocument = {
    CONFIG: CONFIG,
    owns: function (viewKey) { return viewKey === CONFIG.hostView; },
    build: build,
    bodyHtml: bodyHtml,
    documentHtmlOf: documentHtml,
    model: modelFor,
    lastModel: function () { return _lastModel; },
    // The complete bid document for the PDF, built fresh from the grid's model
    // (the same build the page shows). '' when the model is not loaded.
    documentHtml: function (viewKey) { var m = modelFor(viewKey); return m ? documentHtml(m) : ''; },
    // One entry per PRICED line (accessories with a sub bid included) — the
    // submit webhook's bidLineItems. null when the model is not loaded.
    lineItems: function (viewKey) { var m = modelFor(viewKey); return m ? m.lineItems : null; },
    publishView: function (viewKey) {
      viewKey = viewKey || CONFIG.hostView;
      var m = modelFor(viewKey);
      return m ? publishView(m, viewKey) : null;
    },
    render: render,
    readHeader: readHeader,
    _util: { text: text, num: num, bool: bool, conns: conns, laborParts: laborParts, money: money, tidyLocation: tidyLocation, natCompare: natCompare, lines: lines }
  };

  // ── bindings ──────────────────────────────────────────────────────────
  if (typeof $ !== 'undefined' && window.SCW && typeof window.SCW.onViewRender === 'function') {
    window.SCW.onViewRender(CONFIG.hostView, function () { render(CONFIG.hostView); }, EV);
    $(document)
      .off('knack-records-render.' + CONFIG.hostView + EV)
      .on('knack-records-render.' + CONFIG.hostView + EV, function () { render(CONFIG.hostView); });
  }
})();
/*** END SUB BID DOCUMENT ****************************************************/
