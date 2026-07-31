/*** PROPOSAL GRID V2 — model-driven rebuild (Known Issue #20, phase 1) ***/
/*
 * Rebuilds the proposal preview grid from a FLAT hidden data view's
 * Backbone model into our own DOM, instead of layering transforms on
 * Knack's grouped grid render (proposal-grid.js, ~4.3k lines).
 *
 * Deployment contract (per-view):
 *  - `dataViewKey` = a Builder DUPLICATE of the v1 view with ALL GROUPINGS
 *    REMOVED, same source filters + sort, and columns covering every field
 *    in CONFIG.fields. The duplicate is visually hidden here and read
 *    whole off its model (rows_per_page forced to 1000 pre-fetch).
 *  - v1 (proposal-grid.js) KEEPS RUNNING untouched — it still feeds the
 *    publish/PDF scrape, SCW.proposalGridTotals, the CO What's-Changing
 *    manifest, and co-band-mockup. Phase 1 only replaces the VISUAL table.
 *  - `replaceV1: false` renders v2 side-by-side BELOW the v1 grid (parity
 *    testing); `true` hides v1's table and shows only v2.
 *
 * Grouping hierarchy (derived from raw fields — v1 got it from Builder
 * groupings, which the flat duplicate doesn't have). Confirmed against
 * view_3341's live grouped DOM 2026-07-30:
 *    L1 = field_1946 (MDF/IDF location connection — "HEADEND: …",
 *         "IDF: 01: …"; blank → the L2s below promote to L1 styling)
 *    L2 = field_2219 (proposal bucket connection), ordered by field_2218
 *         (bucket sortOrder connection: numeric identifier, id = the
 *         bucket record id) asc
 *    L3 = field_2208 (product name + SKU display text), ordered by line
 *         total sum desc
 *    L4 = field_2019 (install/labor description rich text), model order
 * field_2228 (per-row Project Type connection: Video / Access Control /
 * Cameras / …) is NOT a grouping level — it only drives the per-L1-section
 * L2 rename rules, exactly like v1's l2Selector.
 */
(function () {
  'use strict';

  var CONFIG = {
    enabled: true,
    // CUTOVER 2026-07-30: v2 is the sole proposal grid on view_3341's
    // scene. v1 (proposal-grid.js) no longer transforms view_3341 — it
    // remains in the bundle ONLY for view_3371 (recurring licenses).
    // false → side-by-side parity mode (v2 renders below the v1 grid).
    replaceV1: true,
    // v2 renders the CO "What's Changing" manifest
    // (#scw-co-change-summary) — same id + structure v1 produced, so the
    // publish scrape and e-sign walker are unchanged.
    ownCoManifest: true,
    debug: false,

    views: {
      // v1 view id → per-instance config. dataViewKey MUST be filled in
      // with the flat Builder duplicate before this instance activates.
      // NOTE: keep dataViewKeys UNIQUE across entries — the bindings use a
      // shared event namespace, so two entries sharing one data view would
      // unbind each other.
      view_3341: {
        // view_4140 = flat Builder duplicate on the Proposal Preview scene
        // (scene_1096, whose v1 grid is view_3341): no groupings, same
        // filters/sort, all CONFIG.fields as columns, hidden here.
        dataViewKey: 'view_4140',
        showProjectTotals: true
      }
    },

    fields: {
      l1:            'field_1946',  // MDF/IDF location (connection) — the real L1
      projectType:   'field_2228',  // per-row Project Type (connection) — rename rules only
      bucket:        'field_2219',  // proposal bucket (connection)
      bucketSort:    'field_2218',  // bucket sortOrder (connection, numeric identifier)
      product:       'field_2208',  // product name + SKU (L3 label)
      installDesc:   'field_2019',  // labor description (L4 label, limited html)
      qty:           'field_1964',
      labor:         'field_2028',  // install price extended
      hardware:      'field_2201',  // equipment extended price
      cost:          'field_2203',  // line item total
      lineDiscount:  'field_2303',
      prefix:        'field_2240',  // drop prefix (connection)
      number:        'field_1951',  // drop number
      accessoryParent: 'field_2464',
      accessoryProduct: 'field_1958',
      connectedDevices: 'field_1957',
      coAction:      'field_2965'
    },

    // Detail views already on the scene (rendered hidden) that v1 also reads.
    sowDetailView:      'view_3861',  // field_2725 FLAG_released to sales
    discountDetailView: 'view_3342',  // field_2302 proposal discount, field_2291 reason
    opsStepperView:     'view_3345',  // presence+visible = Ops viewer (mask bypass)

    camReaderBucketId:   '6481e5ba38f283002898113c',
    servicesBucketIds:   ['6977caa7f246edf67b52cbcd'],
    assumptionsBucketIds: ['697b7a023a31502ec68b3303'],

    // L2 label context by (possibly renamed) label — mirrors v1's l2Context.
    contextByLabel: {
      'cameras & cabling': 'drop', 'cameras and cabling': 'drop',
      'cameras or cabling': 'drop', 'camera or reader': 'drop',
      'cameras': 'drop', 'entries': 'drop',
      'networking or headend': 'headend', 'networking & headend': 'headend',
      'nvrs, switches, and networking': 'headend',
      'nvr, switches, and networking': 'headend',
      'ac controllers, switches, and networking': 'headend',
      'services': 'services'
    },

    // Per-section L2 renames keyed off the rows' Project Type
    // (field_2228) — mirrors v1's level2LabelRewrite + l2Selector.
    // "Cameras" (and anything unlisted) fires no rename.
    renameRules: [
      { when: 'video', match: 'exact', renames: {
          'Camera or Reader': 'Cameras',
          'Networking or Headend': 'NVRs, Switches, and Networking' } },
      { when: 'access control', match: 'exact', renames: {
          'Camera or Reader': 'Entries',
          'Networking or Headend': 'AC Controllers, Switches, and Networking' } },
      { when: 'video', match: 'contains', renames: {
          'Networking or Headend': 'NVR, Switches, and Networking' } }
    ],

    assumptionsLabels: ['assumptions', 'general project assumptions'],
    mountingHardwareLabel: 'mounting hardware'
  };

  var NS = '[scw-pg2]';
  function dbg() {
    if (CONFIG.debug && window.console) console.log.apply(console, [NS].concat([].slice.call(arguments)));
  }

  // ── utils ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }
  function stripHtml(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); }
  function norm(s) {
    return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  function isBlankish(v) {
    var t = norm(v);
    return !t || t === '-' || t === '—' || t === '–';
  }
  function money(n) {
    var v = Number(n || 0);
    var s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '−$' : '$') + s;
  }
  // Limited-HTML sanitize for field_2019 (allow b/br/ul/ol/li — same as v1).
  var _decoder = null;
  function decodeEntities(s) {
    if (!_decoder) _decoder = document.createElement('textarea');
    _decoder.innerHTML = String(s == null ? '' : s);
    return _decoder.value;
  }
  function sanitizeLimited(html) {
    if (!html) return '';
    return decodeEntities(String(html))
      .replace(/<\/?strong\b[^>]*>/gi, function (t) { return t.replace(/strong/gi, 'b'); })
      .replace(/<(?!\/?(br|b|ul|ol|li)\b)[^>]*>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '<br />');
  }
  // Same product-label hygiene as v1 (baked designator lists, doubled SKU).
  function cleanProductLabel(s) {
    var out = norm(s);
    var desigList = /\s*\(\s*[A-Za-z]{1,6}-(?:[A-Za-z]{1,6}-)?\d+[A-Za-z]?\s*(?:,\s*[A-Za-z]{1,6}-(?:[A-Za-z]{1,6}-)?\d+[A-Za-z]?\s*)*\)$/;
    while (desigList.test(out)) out = out.replace(desigList, '').trim();
    out = out.replace(/(\s\S+)\1$/, '$1');
    return out;
  }

  // ── record readers (plain attrs) ──────────────────────────────────
  function connFirst(rec, f) {
    var raw = rec && rec[f + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) {
      return { id: raw[0].id, label: norm(stripHtml(raw[0].identifier)) };
    }
    return null;
  }
  function readText(rec, f) { return norm(stripHtml(rec && rec[f])); }
  function readNum(rec, f) {
    var raw = rec && rec[f + '_raw'];
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    var n = parseFloat(norm(stripHtml(rec && rec[f])).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  // ── scene detail reads (masking + proposal discount) ──────────────
  function isInstallationMasked() {
    var ops = document.getElementById(CONFIG.opsStepperView);
    if (ops && ops.offsetParent !== null) return false;
    var view = document.getElementById(CONFIG.sowDetailView);
    if (view) {
      var cell = view.querySelector('.kn-detail.field_2725 .kn-detail-body');
      if (cell) return !/^yes$/i.test(norm(cell.textContent));
    }
    try {
      var kv = Knack.views[CONFIG.sowDetailView];
      var attrs = kv && kv.model && (kv.model.attributes || (kv.model.toJSON && kv.model.toJSON()));
      if (attrs && attrs.field_2725 !== undefined) {
        return !/^yes$/i.test(norm(stripHtml(attrs.field_2725)));
      }
    } catch (e) { /* fall through */ }
    return true;   // fail masked — never leak labor to sales
  }
  function readDetail(fieldKey) {
    var el = document.querySelector('#' + CONFIG.discountDetailView +
      ' .kn-detail.field_' + fieldKey + ' .kn-detail-body');
    return el ? norm(el.textContent) : '';
  }
  function readDetailNum(fieldKey) {
    var n = parseFloat(readDetail(fieldKey).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  // ── tree build ────────────────────────────────────────────────────
  function coActionOf(rec) {
    var t = readText(rec, CONFIG.fields.coAction).toLowerCase();
    if (/remove/.test(t)) return 'remove';
    if (/add/.test(t)) return 'add';
    return '';
  }
  // Band money ("$-2,069.00") — the exact format co-band-mockup rendered,
  // preserved so scraped/published band rows keep their historical shape.
  function bandMoney(n) {
    return '$' + (n < 0 ? '-' : '') + Math.abs(n || 0).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Split a product unit into per-band slices for the CO presentation.
  // Parent rows band by their own action; each accessory follows the band
  // of ITS parent record (a removed camera drags its mount into the
  // Removed band even when the mount row's own action is blank). This is
  // sharper than co-band-mockup's whole-unit fail-safe: a same-product
  // swap (remove old + add new) shows in BOTH bands with correct sums.
  function coProductSlices(product, accessories) {
    function bandOfRec(r) { return coActionOf(r) === 'remove' ? 'rm' : 'add'; }
    var parentBandById = Object.create(null);
    product.items.forEach(function (it) { parentBandById[it.id] = bandOfRec(it); });
    var out = [];
    ['add', 'rm'].forEach(function (band) {
      var items = product.items.filter(function (it) { return bandOfRec(it) === band; });
      if (!items.length) return;
      var l4Order = [], l4s = Object.create(null);
      product.l4Order.forEach(function (dk) {
        var l4 = product.l4s[dk];
        var sub = l4.items.filter(function (it) { return bandOfRec(it) === band; });
        if (!sub.length) return;
        l4Order.push(dk);
        l4s[dk] = { key: l4.key, html: l4.html, items: sub };
      });
      var accs = accessories.filter(function (a) {
        var pc = connFirst(a, CONFIG.fields.accessoryParent);
        var pb = pc && parentBandById[pc.id];
        return (pb || bandOfRec(a)) === band;
      });
      out.push({
        band: band,
        product: { key: product.key, label: product.label, items: items, l4Order: l4Order, l4s: l4s },
        accessories: accs
      });
    });
    return out;
  }

  function buildTree(records) {
    var F = CONFIG.fields;
    var byId = Object.create(null);
    var i, r;
    for (i = 0; i < records.length; i++) {
      r = records[i];
      if (r && r.id) byId[r.id] = r;
    }

    // Split accessories (field_2464 → a parent that's IN this record set).
    var accByParent = Object.create(null);
    var mainRecs = [];
    for (i = 0; i < records.length; i++) {
      r = records[i];
      if (!r || !r.id) continue;
      var pConn = connFirst(r, F.accessoryParent);
      if (pConn && pConn.id !== r.id && byId[pConn.id]) {
        (accByParent[pConn.id] = accByParent[pConn.id] || []).push(r);
      } else {
        mainRecs.push(r);
      }
    }

    // L1 → L2 → L3 → L4 grouping.
    var l1Map = Object.create(null), l1Order = [];
    for (i = 0; i < mainRecs.length; i++) {
      r = mainRecs[i];
      var l1c = connFirst(r, F.l1);
      var l1Key = l1c ? l1c.id : '';
      var l1 = l1Map[l1Key];
      if (!l1) {
        l1 = l1Map[l1Key] = { key: l1Key, label: l1c ? l1c.label : '', buckets: Object.create(null), bucketOrder: [] };
        l1Order.push(l1Key);
      }
      var bc = connFirst(r, F.bucket);
      var bKey = bc ? bc.id : ('lbl:' + readText(r, F.bucket));
      var b = l1.buckets[bKey];
      if (!b) {
        var sortConn = connFirst(r, F.bucketSort);
        var sortNum = sortConn ? parseFloat(sortConn.label.replace(/[^0-9.\-]/g, '')) : NaN;
        b = l1.buckets[bKey] = {
          key: bKey,
          bucketId: bc ? bc.id : '',
          label: bc ? bc.label : readText(r, F.bucket),
          sort: isFinite(sortNum) ? sortNum : Infinity,
          products: Object.create(null), productOrder: []
        };
        l1.bucketOrder.push(bKey);
      }
      var pLabel = cleanProductLabel(readText(r, F.product));
      var pKey = pLabel.toLowerCase();
      var p = b.products[pKey];
      if (!p) {
        p = b.products[pKey] = { key: pKey, label: pLabel, l4s: Object.create(null), l4Order: [], items: [] };
        b.productOrder.push(pKey);
      }
      p.items.push(r);
      var dHtml = sanitizeLimited(r[F.installDesc]);
      var dKey = norm(stripHtml(dHtml)).toLowerCase();
      var l4 = p.l4s[dKey];
      if (!l4) {
        l4 = p.l4s[dKey] = { key: dKey, html: dHtml, items: [] };
        p.l4Order.push(dKey);
      }
      l4.items.push(r);
    }

    // Order: L1 alphabetical (blanks last), L2 by sort asc (missing last),
    // L3 by line-total sum desc.
    l1Order.sort(function (a, b2) {
      var la = l1Map[a].label, lb = l1Map[b2].label;
      var ab = la === '', bb = lb === '';
      if (ab !== bb) return ab ? 1 : -1;
      return la.localeCompare(lb);
    });
    var out = [];
    for (i = 0; i < l1Order.length; i++) {
      var l1g = l1Map[l1Order[i]];
      l1g.bucketOrder.sort(function (a, b2) {
        var sa = l1g.buckets[a].sort, sb = l1g.buckets[b2].sort;
        if (sa !== sb) return sa - sb;
        return 0;
      });
      for (var bi = 0; bi < l1g.bucketOrder.length; bi++) {
        var bg = l1g.buckets[l1g.bucketOrder[bi]];
        bg.productOrder.sort(function (a, b2) {
          var pa = bg.products[a], pb = bg.products[b2];
          var ca = sumRecs(pa.items, F.cost), cb = sumRecs(pb.items, F.cost);
          if (ca !== cb) return cb - ca;
          return 0;
        });
      }
      out.push(l1g);
    }
    return { l1s: out, accByParent: accByParent, byId: byId, allRecords: records, mainRecs: mainRecs };
  }

  function sumRecs(recs, f) {
    var t = 0;
    for (var i = 0; i < recs.length; i++) t += readNum(recs[i], f);
    return t;
  }

  // ── label helpers ─────────────────────────────────────────────────
  function findRenameRule(recs) {
    // v1 parity: collect the distinct per-row Project Type (field_2228)
    // identifiers within the section, then first value → first rule hit.
    var seen = Object.create(null), values = [], i;
    for (i = 0; i < recs.length; i++) {
      var c = connFirst(recs[i], CONFIG.fields.projectType);
      var v = norm(c ? c.label : readText(recs[i], CONFIG.fields.projectType)).toLowerCase();
      if (v && !seen[v]) { seen[v] = 1; values.push(v); }
    }
    for (i = 0; i < values.length; i++) {
      for (var ri = 0; ri < CONFIG.renameRules.length; ri++) {
        var rule = CONFIG.renameRules[ri];
        var w = rule.when.toLowerCase();
        var hit = rule.match === 'contains'
          ? values[i].indexOf(w) !== -1
          : values[i] === w;
        if (hit) return rule;
      }
    }
    return null;
  }
  function bucketKind(bucket) {
    if (CONFIG.servicesBucketIds.indexOf(bucket.bucketId) !== -1) return 'services';
    if (CONFIG.assumptionsBucketIds.indexOf(bucket.bucketId) !== -1) return 'assumptions';
    var lb = norm(bucket.label).toLowerCase();
    if (lb === 'services') return 'services';
    if (CONFIG.assumptionsLabels.indexOf(lb) !== -1) return 'assumptions';
    return 'default';
  }
  function contextOf(displayLabel, bucket) {
    if (bucket.bucketId === CONFIG.camReaderBucketId) return 'drop';
    return CONFIG.contextByLabel[norm(displayLabel).toLowerCase()] || 'default';
  }
  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }
  // Compress a list of designator labels ("I-068", "RA-I-122", …) into
  // sorted, deduped, range-collapsed form: consecutive runs of 3+ within a
  // prefix become "I-068–I-071". Labels with no trailing number pass
  // through untouched (appended at the end).
  function compressLabelsArr(labels) {
    var seen = Object.create(null), parsed = [], plain = [], i;
    for (i = 0; i < labels.length; i++) {
      var lbl = norm(labels[i]);
      if (!lbl || seen[lbl]) continue;
      seen[lbl] = 1;
      var m = /^(.*?)(\d+)$/.exec(lbl);
      if (m) parsed.push({ p: m[1], n: parseInt(m[2], 10), lbl: lbl });
      else plain.push(lbl);
    }
    parsed.sort(function (a, b) { return a.p === b.p ? a.n - b.n : (a.p < b.p ? -1 : 1); });
    var out = [], runStart = -1;
    for (i = 0; i < parsed.length; i++) {
      var cur = parsed[i], next = parsed[i + 1];
      if (runStart === -1) runStart = i;
      var continues = next && next.p === cur.p && next.n === cur.n + 1;
      if (continues) continue;
      var len = i - runStart + 1;
      // "thru", not an en dash — the designators already contain hyphens,
      // so "I-046–I-048" read as a 2-item list instead of a span.
      if (len >= 3) out.push(parsed[runStart].lbl + ' thru ' + cur.lbl);
      else for (var j = runStart; j <= i; j++) out.push(parsed[j].lbl);
      runStart = -1;
    }
    return out.concat(plain);
  }
  function compressLabels(labels) { return compressLabelsArr(labels).join(', '); }
  function designatorList(recs) {
    var F = CONFIG.fields, labels = [];
    for (var i = 0; i < recs.length; i++) {
      var pc = connFirst(recs[i], F.prefix);
      var prefix = pc ? pc.label : readText(recs[i], F.prefix);
      var digits = readText(recs[i], F.number).replace(/\D/g, '');
      var n = parseInt(digits, 10);
      if (!prefix || !isFinite(n)) continue;
      // Zero-padded ("I-001") — matches the composed drop labels used
      // everywhere else (connected devices, worksheet cards).
      labels.push(prefix.toUpperCase() + pad3(n));
    }
    return compressLabels(labels);
  }
  function isCamReaderRec(rec) {
    // Bucket id shows up on both the bucket connection and the sortOrder
    // connection (same record id) — accept either so a blank one can't
    // hide the parent designators.
    var c = connFirst(rec, CONFIG.fields.bucket);
    if (c && c.id === CONFIG.camReaderBucketId) return true;
    c = connFirst(rec, CONFIG.fields.bucketSort);
    return !!(c && c.id === CONFIG.camReaderBucketId);
  }

  // ── render ────────────────────────────────────────────────────────
  function tbd() { return '<span class="scw-pg2-tbd">TBD</span>'; }

  function renderGrid(tree, opts) {
    var F = CONFIG.fields;
    var masked = opts.masked;
    var rows = [];
    var anyNonZeroL1 = false;
    var isCO = false;
    for (var ci = 0; ci < tree.allRecords.length; ci++) {
      if (coActionOf(tree.allRecords[ci])) { isCO = true; break; }
    }

    function amountHtml(n, maskThis) {
      return maskThis ? tbd() : esc(money(n));
    }
    function laborSum(recs) { return masked ? 0 : sumRecs(recs, F.labor); }

    function pushRow(cls, cells) {
      rows.push({ cls: cls, cells: cells });
    }

    // ── shared emitters (base + banded-CO paths) ────────────────────
    function emitBucketHeaderRow(bctx, promoted, showQtyCost) {
      pushRow(
        'scw-pg2-l2' + (promoted ? ' scw-pg2-l2--promoted' : '') +
          (bctx.kind !== 'default' ? ' scw-pg2-l2--' + bctx.kind : ''),
        promoted
          ? [{ html: esc(bctx.displayLabel), cls: 'scw-pg2-l1-label' },
             { html: showQtyCost ? '<strong>Qty</strong>' : '' },
             { html: showQtyCost ? '<strong>Cost</strong>' : '' }]
          : [{ html: esc(bctx.displayLabel) }, { html: '' }, { html: '' }]
      );
    }

    function emitProductBlock(product, accessories, bctx, tint, first) {
      var tintCls = tint ? ' scw-pg2-co-' + tint : '';

      // L3 product line — qty/cost of PARENT devices only.
      if (!bctx.hideL3 && !isBlankish(product.label)) {
        var pQty = sumRecs(product.items, F.qty);
        var pHardware = sumRecs(product.items, F.hardware);
        pushRow('scw-pg2-l3' + (first ? ' scw-pg2-l3--first' : '') + tintCls, [
          { html: esc(product.label) },
          { html: '<strong>' + Math.round(pQty) + '</strong>' },
          { html: '<strong>' + amountHtml(pHardware, false) + '</strong>' }
        ]);
      }

      // L4 install-description lines — qty + labor.
      product.l4Order.forEach(function (dk) {
        var l4 = product.l4s[dk];
        var hasLabel = !isBlankish(norm(stripHtml(l4.html)));
        if (!hasLabel) return;   // blank L4 header → hidden (v1 parity)
        var l4Qty = sumRecs(l4.items, F.qty);
        var l4Labor = sumRecs(l4.items, F.labor);
        var camHtml = '';
        if (bctx.context === 'drop') {
          var list = designatorList(l4.items);
          // Same tight labeled callout as Connected devices.
          if (list) camHtml = '<span class="scw-pg2-l4-conn"><b>Applies to:</b> ' + esc(list) + '</span>';
        }
        // Connected devices (labeled) — beneath the labor description.
        // Only names that resolve to records in THIS view.
        var connNames = [];
        l4.items.forEach(function (it) {
          var raw = it[F.connectedDevices + '_raw'];
          if (!Array.isArray(raw)) return;
          raw.forEach(function (c) {
            if (!c || !c.id || !tree.byId[c.id]) return;
            var t = norm(stripHtml(c.identifier));
            if (t && !isBlankish(t)) connNames.push(t);
          });
        });
        var connHtml = connNames.length
          ? '<span class="scw-pg2-l4-conn"><b>Connected devices:</b> ' + esc(compressLabels(connNames)) + '</span>'
          : '';
        pushRow('scw-pg2-l4' + (bctx.hideQtyCost ? ' scw-pg2-hide-qtycost' : '') + tintCls, [
          { html: '<span class="scw-pg2-l4-desc">' + l4.html + '</span>' + camHtml + connHtml },
          { html: bctx.hideQtyCost ? '' : '<strong>' + Math.round(l4Qty) + '</strong>' },
          { html: bctx.hideQtyCost ? '' : '<strong>' + (masked ? tbd() : esc(money(l4Labor))) + '</strong>' }
        ]);
      });

      // Mounting-hardware cluster beneath the product: one line per
      // accessory product (equipment price), + labor sub-line when the
      // accessory carries install labor.
      if (accessories.length) {
        var byProduct = Object.create(null), order = [];
        accessories.forEach(function (a) {
          var name = cleanProductLabel(readText(a, F.accessoryProduct)) ||
                     cleanProductLabel(readText(a, F.product)) || 'Mounting Hardware';
          if (!byProduct[name]) { byProduct[name] = []; order.push(name); }
          byProduct[name].push(a);
        });
        order.forEach(function (name) {
          var grp = byProduct[name];
          var gQty = sumRecs(grp, F.qty);
          var gHardware = sumRecs(grp, F.hardware);
          var gLabor = sumRecs(grp, F.labor);
          // Parent designators — cam/reader parents only (v1 parity).
          var parentRecs = [];
          grp.forEach(function (a) {
            var pc = connFirst(a, F.accessoryParent);
            var parent = pc && tree.byId[pc.id];
            if (parent && isCamReaderRec(parent)) parentRecs.push(parent);
          });
          var pl = designatorList(parentRecs);
          pushRow('scw-pg2-mount' + tintCls, [
            { html: esc(name) + (pl ? '<span class="scw-pg2-l4-conn">' + esc(pl) + '</span>' : '') },
            { html: String(Math.round(gQty)) },
            { html: esc(money(gHardware)) }
          ]);
          if (gLabor > 0) {
            var desc = '';
            for (var gi = 0; gi < grp.length; gi++) {
              if (readNum(grp[gi], F.labor) > 0) {
                desc = readText(grp[gi], F.installDesc);
                if (desc) break;
              }
            }
            if (desc) {
              pushRow('scw-pg2-mount-labor' + tintCls, [
                { html: esc(desc) },
                { html: '' },
                { html: masked ? tbd() : esc(money(gLabor)) }
              ]);
            }
          }
        });
      }
    }

    // L2 footer — total = hardware + labor for the whole bucket
    // (accessories included); qty shown only for the drop bucket.
    function emitBucketFooter(bctx) {
      var bHardware = sumRecs(bctx.allRecs, F.hardware);
      var bLabor = laborSum(bctx.allRecs);
      var bQty = sumRecs(bctx.parentRecs, F.qty);
      pushRow('scw-pg2-l2foot' + (bctx.hideQtyCost ? ' scw-pg2-hide-qtycost' : ''), [
        { html: '<strong>' + esc(bctx.displayLabel) + '</strong>', cls: 'scw-pg2-l2foot-label' },
        { html: bctx.context === 'drop' ? '<strong>' + Math.round(bQty) + '</strong>' : '' },
        { html: '<strong>' + (masked && bLabor === 0 && bHardware === 0 ? tbd() : esc(money(bHardware + bLabor))) + '</strong>' }
      ]);
    }

    // Banded CO: an "Items to be Added" band then an "Items to be
    // Removed" band per section — mirrors the live v1 + co-band-mockup
    // presentation. Band money sums the LINE TOTAL (F.cost), the same
    // figure co-band-mockup's costMap used.
    function emitBands(bctxList, sectionPromoted) {
      ['add', 'rm'].forEach(function (band) {
        var inBand = [];
        bctxList.forEach(function (bctx) {
          var prs = bctx.prods.filter(function (pr) { return pr.band === band; });
          if (prs.length) inBand.push({ bctx: bctx, prs: prs });
        });
        if (!inBand.length) return;
        var bandLabel = band === 'add' ? 'Items to be Added' : 'Items to be Removed';
        pushRow('scw-pg2-band scw-pg2-band--' + band, [
          { html: esc(bandLabel) }, { html: '' }, { html: '' }
        ]);
        var bandQty = 0, bandCost = 0;
        inBand.forEach(function (e) {
          if (!sectionPromoted) emitBucketHeaderRow(e.bctx, false, false);
          var q = 0, c = 0;
          e.prs.forEach(function (pr, pi) {
            emitProductBlock(pr.product, pr.accessories, e.bctx, band, pi === 0);
            pr.product.items.concat(pr.accessories).forEach(function (r) {
              q += readNum(r, F.qty);
              c += readNum(r, F.cost);
            });
          });
          bandQty += q; bandCost += c;
          pushRow('scw-pg2-band-sub scw-pg2-band-sub--' + band, [
            { html: '<strong>' + esc(e.bctx.displayLabel) + '</strong>', cls: 'scw-pg2-l2foot-label' },
            { html: '<strong>' + Math.round(q) + '</strong>' },
            { html: '<strong>' + esc(bandMoney(c)) + '</strong>' }
          ]);
        });
        pushRow('scw-pg2-band-total scw-pg2-band-total--' + band, [
          { html: '<strong>' + esc(bandLabel + ' — subtotal') + '</strong>', cls: 'scw-pg2-l2foot-label' },
          { html: '<strong>' + Math.round(bandQty) + '</strong>' },
          { html: '<strong>' + esc(bandMoney(bandCost)) + '</strong>' }
        ]);
      });
    }

    tree.l1s.forEach(function (l1g) {
      var promoted = isBlankish(l1g.label);   // blank L1 → L2s act as L1

      // L1 subtotal across every record (incl. accessories) in this L1.
      var l1Recs = [];
      l1g.bucketOrder.forEach(function (bk) {
        var b = l1g.buckets[bk];
        b.productOrder.forEach(function (pk) {
          var p = b.products[pk];
          p.items.forEach(function (it) {
            l1Recs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) { l1Recs.push(a); });
          });
        });
      });
      var rule = findRenameRule(l1Recs);
      var l1Subtotal = sumRecs(l1Recs, F.hardware) + laborSum(l1Recs);
      if (Math.abs(l1Subtotal) >= 0.01) anyNonZeroL1 = true;
      var showHdr = Math.abs(l1Subtotal) >= 0.01;

      // Per-bucket context + product units (accessories attached).
      var bctxs = [];
      l1g.bucketOrder.forEach(function (bk) {
        var bucket = l1g.buckets[bk];
        var kind = bucketKind(bucket);
        var displayLabel = bucket.label;
        if (rule && rule.renames[displayLabel]) displayLabel = rule.renames[displayLabel];
        if (promoted && kind === 'assumptions') displayLabel = 'General Project Assumptions';
        var bctx = {
          kind: kind,
          displayLabel: displayLabel,
          context: contextOf(displayLabel, bucket),
          // Services hide the product-name headers but KEEP qty/cost and
          // the subtotal (matches v1's live rendering of "Other Services");
          // assumptions hide all of it.
          hideL3: kind === 'services' || kind === 'assumptions',
          hideQtyCost: kind === 'assumptions',
          prods: [], parentRecs: [], allRecs: []
        };
        bucket.productOrder.forEach(function (pk) {
          var product = bucket.products[pk];
          var accessories = [];
          product.items.forEach(function (it) {
            bctx.parentRecs.push(it);
            bctx.allRecs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) {
              accessories.push(a);
              bctx.allRecs.push(a);
            });
          });
          if (isCO) {
            coProductSlices(product, accessories).forEach(function (sl) {
              bctx.prods.push({ product: sl.product, accessories: sl.accessories, band: sl.band });
            });
          } else {
            bctx.prods.push({ product: product, accessories: accessories, band: '' });
          }
        });
        if (bctx.parentRecs.length) bctxs.push(bctx);
      });

      if (promoted) {
        // Each promoted bucket is its own section.
        bctxs.forEach(function (bctx) {
          emitBucketHeaderRow(bctx, true, showHdr);
          if (isCO) {
            emitBands([bctx], true);
          } else {
            bctx.prods.forEach(function (pr, pi) {
              emitProductBlock(pr.product, pr.accessories, bctx, '', pi === 0);
            });
          }
          if (bctx.kind !== 'assumptions') {
            if (!isCO) emitBucketFooter(bctx);
            pushL1Footer(bctx.displayLabel, bctx.allRecs);
          }
        });
        return;
      }

      pushRow('scw-pg2-l1', [
        { html: esc(l1g.label), cls: 'scw-pg2-l1-label' },
        { html: showHdr ? '<strong>Qty</strong>' : '' },
        { html: showHdr ? '<strong>Cost</strong>' : '' }
      ]);

      if (isCO) {
        emitBands(bctxs, false);
      } else {
        bctxs.forEach(function (bctx) {
          emitBucketHeaderRow(bctx, false, false);
          bctx.prods.forEach(function (pr, pi) {
            emitProductBlock(pr.product, pr.accessories, bctx, '', pi === 0);
          });
          if (bctx.kind !== 'assumptions') emitBucketFooter(bctx);
        });
      }

      pushL1Footer(l1g.label, l1Recs);
    });

    function pushL1Footer(title, recs) {
      var hardware = sumRecs(recs, F.hardware);
      var labor = laborSum(recs);
      var subtotal = hardware + labor;
      if (Math.abs(subtotal) < 0.01) return;
      var discount = Math.abs(sumRecs(recs, F.lineDiscount));
      var hasDiscount = discount > 0.004;
      rows.push({ cls: 'scw-pg2-l1foot scw-pg2-l1foot--title', title: title });
      if (hasDiscount) {
        rows.push({ cls: 'scw-pg2-l1foot scw-pg2-l1foot--sub', label: 'Subtotal', value: money(subtotal) });
        rows.push({ cls: 'scw-pg2-l1foot scw-pg2-l1foot--disc', label: 'Discount', value: '–' + money(discount) });
        rows.push({ cls: 'scw-pg2-l1foot scw-pg2-l1foot--final scw-pg2-l1foot--last', label: 'Total', value: money(subtotal - discount) });
      } else {
        rows.push({ cls: 'scw-pg2-l1foot scw-pg2-l1foot--final scw-pg2-l1foot--last', label: 'Total', value: money(subtotal) });
      }
    }

    // ── project totals ──────────────────────────────────────────────
    if (opts.showProjectTotals && tree.allRecords.length) {
      var equipmentSubtotal = sumRecs(tree.allRecords, F.hardware);
      var lineItemDiscounts = sumRecs(tree.allRecords, F.lineDiscount);
      var proposalDiscount = Math.abs(readDetailNum('2302'));
      var discountNote = readDetail('2291');
      var equipmentTotal = equipmentSubtotal - lineItemDiscounts;
      var installationTotal = sumRecs(tree.allRecords, F.labor);
      var grandTotal = equipmentTotal + installationTotal - proposalDiscount;
      var hasAnyDiscount = lineItemDiscounts !== 0 || proposalDiscount !== 0;

      rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--title scw-pg2-pt--first',
        title: isCO ? 'Change Order Totals' : 'Project Totals' });
      if (hasAnyDiscount) {
        rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--sub scw-pg2-pt--tight', label: 'Equipment Subtotal', value: money(equipmentSubtotal) });
        if (lineItemDiscounts !== 0) {
          rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--disc scw-pg2-pt--tight', label: 'Line Item Discounts', value: '–' + money(Math.abs(lineItemDiscounts)) });
        }
      }
      rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--final scw-pg2-pt--equipment', label: isCO ? 'Equipment Net' : 'Equipment Total', value: money(equipmentTotal) });
      rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--final scw-pg2-pt--install', label: isCO ? 'Installation Net' : 'Installation Total',
        value: masked ? null : money(installationTotal), maskedValue: masked });
      if (proposalDiscount !== 0) {
        rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--disc scw-pg2-pt--tight', label: 'Proposal Discount', value: '–' + money(proposalDiscount), note: discountNote });
      }
      rows.push({ cls: 'scw-pg2-pt scw-pg2-l1foot--final scw-pg2-pt--grand scw-pg2-pt--last',
        label: isCO ? 'Change Order Total' : 'Grand Total',
        value: masked ? null : money(grandTotal), maskedValue: masked });
    }

    // ── materialize ─────────────────────────────────────────────────
    var html = ['<table class="scw-pg2-table"><colgroup>' +
      '<col class="scw-pg2-col-label"><col class="scw-pg2-col-qty"><col class="scw-pg2-col-cost">' +
      '</colgroup><tbody>'];
    rows.forEach(function (row) {
      if (row.title !== undefined) {
        // Full-width cell — a colspan-2 title stopped at the qty column's
        // edge instead of reaching the table's right edge.
        html.push('<tr class="' + row.cls + '"><td colspan="3"><div class="scw-pg2-l1foot-title">' +
          esc(row.title) + '</div></td></tr>');
      } else if (row.label !== undefined) {
        var valueHtml = row.maskedValue ? '<strong>' + tbd() + '</strong>' : esc(row.value);
        // Label + value share one flexed cell so the label sits snug
        // against its value at the right edge (separate table columns
        // left a fixed-width gap).
        html.push('<tr class="' + row.cls + '"><td colspan="3">' +
          '<div class="scw-pg2-l1foot-line">' +
          '<div class="scw-pg2-l1foot-label">' + esc(row.label) + '</div>' +
          '<div class="scw-pg2-l1foot-value">' + valueHtml + '</div>' +
          '</div>' +
          (row.note ? '<div class="scw-pg2-disc-note">' + esc(row.note) + '</div>' : '') +
          '</td></tr>');
      } else {
        html.push('<tr class="' + row.cls + '">' + row.cells.map(function (c) {
          return '<td class="' + (c.cls || '') + '">' + c.html + '</td>';
        }).join('') + '</tr>');
      }
    });
    html.push('</tbody></table>');

    var el = document.createElement('div');
    el.className = 'scw-pg2';
    el.innerHTML = html.join('');
    if (!anyNonZeroL1) {
      el.querySelectorAll('.scw-pg2-l1 td:nth-child(2), .scw-pg2-l1 td:nth-child(3)')
        .forEach(function (td) { td.innerHTML = ''; });
    }
    return el;
  }

  // ── CO "What's Changing" manifest (dormant until v1 retires) ──────
  // proposal-grid.js (v1) still renders and owns #scw-co-change-summary;
  // the publish pipeline scrapes that element scene-wide and the e-sign
  // walker consumes the same scw-cos-* structure. When v1 is deleted,
  // flip CONFIG.ownCoManifest — v2 then renders the IDENTICAL id +
  // structure from the model, so scrapeCoChangeSummary and everything
  // downstream keep working unchanged.
  var CO_SUMMARY_ID = 'scw-co-change-summary';
  function coMoney(n) {
    return (n < 0 ? '−' : '') + '$' + Math.abs(n || 0).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function injectManifestCss() {
    var ID = 'scw-pg2-cos-css';
    if (document.getElementById(ID) || document.getElementById('scw-co-rm-css')) return;
    var S = '#' + CO_SUMMARY_ID;
    var s = document.createElement('style');
    s.id = ID;
    s.textContent = [
      S + ' { margin: 0 0 16px; border: 1px solid #dbe4ee; border-radius: 10px; overflow: hidden; background: #fff; font-family: system-ui, -apple-system, sans-serif; }',
      S + ' .scw-cos-title { padding: 9px 16px 8px; background: #163C6E; color: #fff; font-size: 13px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; }',
      S + ' .scw-cos-chevron { margin-left: auto; font-size: 12px; line-height: 1; transition: transform 0.15s ease; }',
      S + '.scw-cos-collapsed .scw-cos-chevron { transform: rotate(-90deg); }',
      S + '.scw-cos-collapsed .scw-cos-desc, ' + S + '.scw-cos-collapsed .scw-cos-cols { display: none; }',
      S + '.scw-cos--docked { margin: 12px 0 4px; width: 66%; min-width: 560px; max-width: 100%; }',
      S + ' .scw-cos-desc { padding: 8px 16px; background: #f0f4fa; color: #334155; font-size: 12px; line-height: 1.45; border-bottom: 1px solid #dbe4ee; }',
      S + ' .scw-cos-desc b { color: #163C6E; }',
      S + ' .scw-cos-cols { display: flex; flex-wrap: wrap; }',
      S + ' .scw-cos-col { flex: 1 1 320px; min-width: 280px; padding: 12px 16px; }',
      S + ' .scw-cos-col--add { box-shadow: inset 4px 0 0 #059669; }',
      S + ' .scw-cos-col--rm  { box-shadow: inset 4px 0 0 #e11d48; background: #fff7f7; }',
      S + ' .scw-cos-head { font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; margin-bottom: 8px; }',
      S + ' .scw-cos-col--add .scw-cos-head { color: #065f46; }',
      S + ' .scw-cos-col--rm  .scw-cos-head { color: #9f1239; }',
      S + ' table.scw-cos-table { width: 100%; border-collapse: collapse; }',
      S + ' table.scw-cos-table td { padding: 4px 6px; font-size: 12.5px; color: #1e293b; border-bottom: 1px solid #eef2f7; vertical-align: top; }',
      S + ' td.scw-cos-qty { width: 42px; text-align: right; color: #64748b; white-space: nowrap; }',
      S + ' td.scw-cos-amt { width: 96px; text-align: right; font-weight: 600; white-space: nowrap; }',
      S + ' .scw-cos-col--rm td.scw-cos-amt { color: #be123c; }',
      S + ' .scw-cos-lbl { color: #64748b; font-size: 11.5px; }',
      S + ' .scw-cos-meta { display: block; color: #64748b; font-size: 11px; margin-top: 1px; }',
      S + ' tr.scw-cos-sub td { border-bottom: 0; padding-top: 7px; font-weight: 800; font-size: 12.5px; }',
      S + ' .scw-cos-net { display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; padding: 9px 16px; border-top: 1px solid #dbe4ee; background: #f8fafc; font-size: 13px; font-weight: 800; color: #163C6E; }',
      S + ' .scw-cos-net-label { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: #64748b; }',
      S + ' .scw-cos-desc .scw-cos-g { color: #059669; }',
      S + ' .scw-cos-desc .scw-cos-r { color: #e11d48; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function renderCoManifest(tree) {
    var F = CONFIG.fields;
    var adds = [], removes = [], anyAction = false;

    function pushEntry(rec, productLabel, loc) {
      var action = coActionOf(rec);
      if (action) anyAction = true;
      var pc = connFirst(rec, F.prefix);
      var prefix = pc ? pc.label : readText(rec, F.prefix);
      var digits = readText(rec, F.number).replace(/\D/g, '');
      var n = parseInt(digits, 10);
      var entry = {
        product: productLabel,
        desig: (prefix && isFinite(n)) ? prefix.toUpperCase() + pad3(n) : '',
        loc: loc,
        qty: readNum(rec, F.qty) || 1,
        amt: readNum(rec, F.cost),
      };
      if (action === 'remove') removes.push(entry);
      // Adds: only rows with something to show (skips assumptions rows).
      else if (entry.product || entry.amt) adds.push(entry);
    }

    tree.l1s.forEach(function (l1g) {
      l1g.bucketOrder.forEach(function (bk) {
        var bucket = l1g.buckets[bk];
        bucket.productOrder.forEach(function (pk) {
          var product = bucket.products[pk];
          product.items.forEach(function (rec) {
            pushEntry(rec, product.label, l1g.label);
            (tree.accByParent[rec.id] || []).forEach(function (a) {
              var nm = cleanProductLabel(readText(a, F.accessoryProduct)) ||
                       cleanProductLabel(readText(a, F.product)) || 'Mounting Hardware';
              pushEntry(a, nm, l1g.label);
            });
          });
        });
      });
    });

    var summary = document.getElementById(CO_SUMMARY_ID);
    if (!anyAction) { if (summary) summary.remove(); return; }
    injectManifestCss();

    if (!summary) {
      summary = document.createElement('div');
      summary.id = CO_SUMMARY_ID;
      var stepper = document.querySelector('.scw-ops-stepper');
      var grid = document.querySelector('.scw-pg2');
      if (stepper) stepper.parentNode.insertBefore(summary, stepper.nextSibling);
      else if (grid && grid.parentNode) grid.parentNode.insertBefore(summary, grid);
      else return;
    }

    // Merge identical products (same product + location) into one row —
    // qty/amounts sum, designators join into the meta line (v1 parity).
    function groupEntries(list) {
      var byKey = Object.create(null), order = [];
      list.forEach(function (e) {
        var key = e.product + '¦' + e.loc;
        var g = byKey[key];
        if (g) {
          g.qty += e.qty;
          g.amt += e.amt;
          if (e.desig) g.desigs.push(e.desig);
        } else {
          byKey[key] = { product: e.product, loc: e.loc, qty: e.qty, amt: e.amt, desigs: e.desig ? [e.desig] : [] };
          order.push(key);
        }
      });
      return order.map(function (k) {
        var g = byKey[k];
        g.desig = compressLabels(g.desigs);
        return g;
      });
    }
    var addsG = groupEntries(adds);
    var removesG = groupEntries(removes);
    var countOf = function (list) {
      return list.reduce(function (t, e) { return t + (e.qty || 1); }, 0);
    };
    var locSet = Object.create(null), locCount = 0;
    addsG.concat(removesG).forEach(function (e) {
      if (e.loc && !locSet[e.loc]) { locSet[e.loc] = 1; locCount++; }
    });
    var showLoc = locCount > 1;
    var itemRows = function (list) {
      return list.map(function (e) {
        var meta = [e.desig, showLoc ? e.loc : ''].filter(Boolean).join(' · ');
        return '<tr><td>' + esc(e.product || '(item)') +
          (meta ? '<span class="scw-cos-meta">' + esc(meta) + '</span>' : '') +
          '</td><td class="scw-cos-qty">' + Math.round(e.qty) + '</td>' +
          '<td class="scw-cos-amt">' + esc(coMoney(e.amt)) + '</td></tr>';
      }).join('');
    };
    var subRow = function (label, total) {
      return '<tr class="scw-cos-sub"><td>' + esc(label) + '</td><td></td>' +
        '<td class="scw-cos-amt">' + esc(coMoney(total)) + '</td></tr>';
    };
    var addTotal = addsG.reduce(function (t, e) { return t + e.amt; }, 0);
    var rmTotal = removesG.reduce(function (t, e) { return t + e.amt; }, 0);

    summary.innerHTML =
      '<div class="scw-cos-title">Change Order — What\'s Changing</div>' +
      '<div class="scw-cos-desc">This change order amends the previously approved ' +
        'installation scope. In the itemized list below, added items are shaded ' +
        '<b class="scw-cos-g">green</b>; removed items are shaded ' +
        '<b class="scw-cos-r">red</b> and credited back.</div>' +
      '<div class="scw-cos-cols">' +
        (addsG.length ?
          '<div class="scw-cos-col scw-cos-col--add">' +
            '<div class="scw-cos-head">Adding to install scope (' + countOf(addsG) + ')</div>' +
            '<table class="scw-cos-table"><tbody>' + itemRows(addsG) + subRow('Subtotal — additions', addTotal) + '</tbody></table>' +
          '</div>' : '') +
        (removesG.length ?
          '<div class="scw-cos-col scw-cos-col--rm">' +
            '<div class="scw-cos-head">Removing from install scope — credit (' + countOf(removesG) + ')</div>' +
            '<table class="scw-cos-table"><tbody>' + itemRows(removesG) + subRow('Subtotal — credits', rmTotal) + '</tbody></table>' +
          '</div>' : '') +
      '</div>' +
      '<div class="scw-cos-net"><span class="scw-cos-net-label">Net change</span>' +
      '<span>' + esc(coMoney(addTotal + rmTotal)) + '</span></div>';

    // Dock under the ops stepper + chevron + collapse (v1's behavior).
    var stepperEl = document.querySelector('.scw-ops-stepper');
    if (stepperEl) {
      if (summary.previousElementSibling !== stepperEl) {
        stepperEl.parentNode.insertBefore(summary, stepperEl.nextSibling);
      }
      summary.classList.add('scw-cos--docked');
    }
    var titleEl = summary.querySelector('.scw-cos-title');
    if (titleEl && !titleEl.querySelector('.scw-cos-chevron')) {
      var ch = document.createElement('span');
      ch.className = 'scw-cos-chevron';
      ch.textContent = '▾';
      titleEl.appendChild(ch);
    }
    var stored = null;
    try { stored = window.localStorage.getItem('scwCoSummaryCollapsed'); } catch (e) { /* ignore */ }
    if (stored === '1') summary.classList.add('scw-cos-collapsed');
    else if (stored === '0') summary.classList.remove('scw-cos-collapsed');
    else {
      summary.classList.remove('scw-cos-collapsed');
      if (summary.offsetHeight > 300) summary.classList.add('scw-cos-collapsed');
    }
    // Collapse click binding — same guard attribute v1 uses, so exactly
    // one document-level handler exists whichever module registers first.
    if (!document.documentElement.hasAttribute('data-scw-cos-collapse')) {
      document.documentElement.setAttribute('data-scw-cos-collapse', '1');
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest &&
          e.target.closest('#' + CO_SUMMARY_ID + ' .scw-cos-title');
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        var sm = t.closest('#' + CO_SUMMARY_ID);
        if (!sm) return;
        var collapsed = !sm.classList.contains('scw-cos-collapsed');
        sm.classList.toggle('scw-cos-collapsed', collapsed);
        try { window.localStorage.setItem('scwCoSummaryCollapsed', collapsed ? '1' : '0'); }
        catch (err) { /* ignore */ }
      }, true);
    }
  }

  // ── publish/PDF data (proposal-pdf-export delegation) ─────────────
  // Builds the EXACT intermediate structure proposal-pdf-export's
  // scrapeGridView() derives from the v1 DOM — sections → buckets →
  // products → lineItems (+ footers, projectTotals) — straight from the
  // flat model, no DOM involved. Values are UNMASKED real numbers;
  // applyTbdToPublishPayload masks them downstream exactly as it does
  // for the v1 scrape. Returns null when v2 can't own the publish for
  // this view (not configured, model not ready, missing columns, or a
  // CO — banded CO publish isn't ported yet; the v1 scrape handles it).
  function pubMoney(n) {
    var v = Number(n || 0);
    // ASCII minus — downstream summary parsers strip non-[0-9.-] chars,
    // so a typographic minus would silently drop the sign.
    return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildPublishData(v1ViewId) {
    if (!CONFIG.enabled) return null;
    var vcfg = CONFIG.views[v1ViewId];
    if (!vcfg || !vcfg.dataViewKey) return null;
    var records = readRecords(vcfg.dataViewKey);
    if (!records || !records.length) return null;
    if (missingColumns(records).length) return null;
    var isCO = false;
    for (var ci = 0; ci < records.length; ci++) {
      if (coActionOf(records[ci])) { isCO = true; break; }
    }
    // CO payloads come from v2 only once v2 OWNS the page (replaceV1) —
    // while v1 is still the visible CO surface, its banded DOM scrape
    // stays the publish source so signed documents can't drift from what
    // is on screen.
    if (isCO && !CONFIG.replaceV1) return null;

    var F = CONFIG.fields;
    var tree = buildTree(records);
    var sections = [];

    function connDevicesOf(recs) {
      var names = [];
      recs.forEach(function (it) {
        var raw = it[F.connectedDevices + '_raw'];
        if (!Array.isArray(raw)) return;
        raw.forEach(function (c) {
          if (!c || !c.id || !tree.byId[c.id]) return;
          var t = norm(stripHtml(c.identifier));
          if (t && !isBlankish(t)) names.push(t);
        });
      });
      return compressLabelsArr(names);
    }

    function l1FooterData(title, recs) {
      var subtotal = sumRecs(recs, F.hardware) + sumRecs(recs, F.labor);
      if (Math.abs(subtotal) < 0.01) return null;
      var discount = Math.abs(sumRecs(recs, F.lineDiscount));
      var hasDiscount = discount > 0.004;
      var lines = [];
      if (hasDiscount) {
        lines.push({ type: 'sub', label: 'Subtotal', value: pubMoney(subtotal) });
        lines.push({ type: 'disc', label: 'Discount', value: '-' + pubMoney(discount) });
        lines.push({ type: 'final', label: 'Total', value: pubMoney(subtotal - discount) });
      } else {
        lines.push({ type: 'final', label: 'Total', value: pubMoney(subtotal) });
      }
      return { title: title, hasDiscount: hasDiscount, lines: lines };
    }

    // Products array for a set of product-units within one bucket. hideL3
    // buckets (services/assumptions) collect ALL their line items under
    // ONE label-less synthetic product — mirrors the v1 scraper.
    function buildBucketProducts(bctx, prs) {
      var products = [];
      var synth = null;
      prs.forEach(function (pr) {
        var product = pr.product, accessories = pr.accessories;
        var prod = null;
        if (!bctx.hideL3 && !isBlankish(product.label)) {
          prod = {
            level: 3, label: product.label,
            qty: Math.round(sumRecs(product.items, F.qty)),
            cost: pubMoney(sumRecs(product.items, F.hardware)),
            rate: '', hideCost: false,
            connectedDevices: connDevicesOf(product.items),
            isMountingHardware: bctx.isMounting, lineItems: [],
          };
          products.push(prod);
        }

        product.l4Order.forEach(function (dk) {
          var l4 = product.l4s[dk];
          var text = norm(stripHtml(l4.html));
          if (isBlankish(text)) return;
          var item = {
            level: 4, label: text, description: l4.html,
            qty: Math.round(sumRecs(l4.items, F.qty)),
            cost: pubMoney(sumRecs(l4.items, F.labor)),
            cameraList: bctx.context === 'drop' ? designatorList(l4.items) : '',
          };
          if (prod) prod.lineItems.push(item);
          else {
            if (!synth) {
              // Services keep qty/cost visible (only their product-name
              // headers are hidden); assumptions suppress both.
              synth = { level: 3, label: '', qty: 0, cost: '', rate: '',
                        hideCost: bctx.kind === 'assumptions',
                        connectedDevices: [], isMountingHardware: false, lineItems: [] };
              products.push(synth);
            }
            synth.lineItems.push(item);
          }
        });

        if (prod && accessories.length) {
          var byProduct = Object.create(null), order = [];
          accessories.forEach(function (a) {
            var nm = cleanProductLabel(readText(a, F.accessoryProduct)) ||
                     cleanProductLabel(readText(a, F.product)) || 'Mounting Hardware';
            if (!byProduct[nm]) { byProduct[nm] = []; order.push(nm); }
            byProduct[nm].push(a);
          });
          order.forEach(function (nm) {
            var grp = byProduct[nm];
            var parentRecs = [];
            grp.forEach(function (a) {
              var pc = connFirst(a, F.accessoryParent);
              var parent = pc && tree.byId[pc.id];
              if (parent && isCamReaderRec(parent)) parentRecs.push(parent);
            });
            prod.lineItems.push({
              level: 4, label: nm, description: '',
              qty: Math.round(sumRecs(grp, F.qty)),
              cost: pubMoney(sumRecs(grp, F.hardware)),
              cameraList: designatorList(parentRecs),
              // Relocated EQUIPMENT accessory — must NOT be TBD-masked.
              isEquipment: true,
            });
            var gLabor = sumRecs(grp, F.labor);
            if (gLabor > 0) {
              var desc = '';
              for (var gi = 0; gi < grp.length; gi++) {
                if (readNum(grp[gi], F.labor) > 0) { desc = readText(grp[gi], F.installDesc); if (desc) break; }
              }
              if (desc) prod.lineItems.push({ level: 4, label: desc, description: '', qty: '', cost: pubMoney(gLabor), cameraList: '' });
            }
          });
        }
      });
      return products;
    }

    function pubBucketFooter(bctx) {
      return {
        label: bctx.displayLabel,
        qty: bctx.context === 'drop' ? Math.round(sumRecs(bctx.parentRecs, F.qty)) : 0,
        cost: pubMoney(sumRecs(bctx.allRecs, F.hardware) + sumRecs(bctx.allRecs, F.labor)),
      };
    }

    // Banded CO bucket stream — the marker entries scrapeGridView derives
    // from the banded v1 DOM, emitted directly: coBandHeader → band
    // buckets (coBand + per-band footer) → coBandTotal.
    function emitPubBands(sec, bctxList, promotedSec) {
      ['add', 'rm'].forEach(function (band) {
        var inBand = [];
        bctxList.forEach(function (bctx) {
          var prs = bctx.prods.filter(function (pr) { return pr.band === band; });
          if (prs.length) inBand.push({ bctx: bctx, prs: prs });
        });
        if (!inBand.length) return;
        var bandLabel = band === 'add' ? 'Items to be Added' : 'Items to be Removed';
        sec.buckets.push({ level: 2, coBandHeader: true, kind: band, label: bandLabel, products: [], footer: null });
        var bandCost = 0;
        inBand.forEach(function (e) {
          var q = 0, c = 0;
          e.prs.forEach(function (pr) {
            pr.product.items.concat(pr.accessories).forEach(function (r) {
              q += readNum(r, F.qty);
              c += readNum(r, F.cost);
            });
          });
          bandCost += c;
          sec.buckets.push({
            level: 2, label: e.bctx.displayLabel, isPromoted: promotedSec,
            coBand: band,
            products: buildBucketProducts(e.bctx, e.prs),
            footer: { label: e.bctx.displayLabel, qty: Math.round(q), cost: bandMoney(c), coBand: band },
          });
        });
        sec.buckets.push({ level: 2, coBandTotal: true, kind: band, label: bandLabel + ' — subtotal', cost: bandMoney(bandCost), products: [], footer: null });
      });
    }

    tree.l1s.forEach(function (l1g) {
      var promoted = isBlankish(l1g.label);
      var l1Recs = [];
      l1g.bucketOrder.forEach(function (bk) {
        var b = l1g.buckets[bk];
        b.productOrder.forEach(function (pk) {
          b.products[pk].items.forEach(function (it) {
            l1Recs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) { l1Recs.push(a); });
          });
        });
      });
      var rule = findRenameRule(l1Recs);

      // Per-bucket context + product units (same derivation as the render).
      var bctxs = [];
      l1g.bucketOrder.forEach(function (bk) {
        var bucket = l1g.buckets[bk];
        var kind = bucketKind(bucket);
        var displayLabel = bucket.label;
        if (rule && rule.renames[displayLabel]) displayLabel = rule.renames[displayLabel];
        if (promoted && kind === 'assumptions') displayLabel = 'General Project Assumptions';
        var bctx = {
          kind: kind, displayLabel: displayLabel,
          context: contextOf(displayLabel, bucket),
          hideL3: kind === 'services' || kind === 'assumptions',
          isMounting: norm(displayLabel).toLowerCase() === CONFIG.mountingHardwareLabel,
          prods: [], parentRecs: [], allRecs: []
        };
        bucket.productOrder.forEach(function (pk) {
          var product = bucket.products[pk];
          var accessories = [];
          product.items.forEach(function (it) {
            bctx.parentRecs.push(it);
            bctx.allRecs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) {
              accessories.push(a);
              bctx.allRecs.push(a);
            });
          });
          if (isCO) {
            coProductSlices(product, accessories).forEach(function (sl) {
              bctx.prods.push({ product: sl.product, accessories: sl.accessories, band: sl.band });
            });
          } else {
            bctx.prods.push({ product: product, accessories: accessories, band: '' });
          }
        });
        if (bctx.parentRecs.length) bctxs.push(bctx);
      });

      if (promoted) {
        bctxs.forEach(function (bctx) {
          var sec = { level: 1, label: bctx.displayLabel, promoted: true, buckets: [], footer: null };
          sections.push(sec);
          if (isCO) {
            emitPubBands(sec, [bctx], true);
          } else {
            var b2 = { level: 2, label: bctx.displayLabel, isPromoted: true, products: buildBucketProducts(bctx, bctx.prods), footer: null };
            sec.buckets.push(b2);
            if (bctx.kind !== 'assumptions') b2.footer = pubBucketFooter(bctx);
          }
          if (bctx.kind !== 'assumptions') sec.footer = l1FooterData(bctx.displayLabel, bctx.allRecs);
        });
        return;
      }

      var section = { level: 1, label: l1g.label, promoted: false, buckets: [], footer: null };
      sections.push(section);
      if (isCO) {
        emitPubBands(section, bctxs, false);
      } else {
        bctxs.forEach(function (bctx) {
          var b2 = { level: 2, label: bctx.displayLabel, isPromoted: false, products: buildBucketProducts(bctx, bctx.prods), footer: null };
          section.buckets.push(b2);
          if (bctx.kind !== 'assumptions') b2.footer = pubBucketFooter(bctx);
        });
      }
      section.footer = l1FooterData(l1g.label, l1Recs);
    });

    var projectTotals = null;
    if (vcfg.showProjectTotals !== false) {
      var equipmentSubtotal = sumRecs(tree.allRecords, F.hardware);
      var lineItemDiscounts = sumRecs(tree.allRecords, F.lineDiscount);
      var proposalDiscount = Math.abs(readDetailNum('2302'));
      var equipmentTotal = equipmentSubtotal - lineItemDiscounts;
      var installationTotal = sumRecs(tree.allRecords, F.labor);
      var grandTotal = equipmentTotal + installationTotal - proposalDiscount;
      projectTotals = { title: isCO ? 'Change Order Totals' : 'Project Totals', lines: [] };
      if (lineItemDiscounts !== 0 || proposalDiscount !== 0) {
        projectTotals.lines.push({ type: 'sub', label: 'Equipment Subtotal', value: pubMoney(equipmentSubtotal) });
        if (lineItemDiscounts !== 0) projectTotals.lines.push({ type: 'disc', label: 'Line Item Discounts', value: '-' + pubMoney(Math.abs(lineItemDiscounts)) });
      }
      projectTotals.lines.push({ type: 'final', label: isCO ? 'Equipment Net' : 'Equipment Total', value: pubMoney(equipmentTotal) });
      projectTotals.lines.push({ type: 'final', label: isCO ? 'Installation Net' : 'Installation Total', value: pubMoney(installationTotal) });
      if (proposalDiscount !== 0) projectTotals.lines.push({ type: 'disc', label: 'Proposal Discount', value: '-' + pubMoney(proposalDiscount) });
      projectTotals.lines.push({ type: 'final', label: isCO ? 'Change Order Total' : 'Grand Total', value: pubMoney(grandTotal) });
    }

    return { sections: sections, projectTotals: projectTotals };
  }

  // ── styles ────────────────────────────────────────────────────────
  function injectCss() {
    var ID = 'scw-pg2-css';
    if (document.getElementById(ID)) return;
    var s = document.createElement('style');
    s.id = ID;
    s.textContent = [
      '.scw-pg2 { font-family: inherit; color: #07467c; }',
      '.scw-pg2-table { width: 100%; border-collapse: collapse; }',
      '.scw-pg2-table td { padding: 4px 8px; vertical-align: middle; border: 0; }',
      '.scw-pg2-col-qty { width: 90px; } .scw-pg2-col-cost { width: 140px; }',
      '.scw-pg2-table td:nth-child(2) { text-align: center; white-space: nowrap; }',
      '.scw-pg2-table td:nth-child(3) { text-align: right; white-space: nowrap; }',
      '.scw-pg2-tbd { color: #94a3b8; font-style: italic; font-weight: 600; }',
      // L1
      '.scw-pg2-l1 td, .scw-pg2-l2--promoted td { border-bottom: 20px solid #07467c !important; padding-top: 30px; }',
      // One shared 8px left edge for every level (L1 header, bucket bars,
      // products, descriptions, accessories).
      '.scw-pg2-l1 td:first-child, .scw-pg2-l2--promoted td:first-child { font-size: 24px; font-weight: 200; padding-left: 8px; }',
      // L2 — background-clip keeps the aliceblue bar from bleeding into
      // the transparent spacing borders (the "big blue blur").
      '.scw-pg2-l2 td { background: aliceblue; background-clip: padding-box; font-size: 16px; padding: 5px 0 5px 8px; border-top: 20px solid transparent; }',
      '.scw-pg2-l2--assumptions td { font-weight: 600; background: #f0f7ff; }',
      '.scw-pg2-l2--promoted td { background: #fff; }',
      // L3 — extra air + hairline above each product block (suppressed on
      // the first product in a section, right under the bucket bar)
      '.scw-pg2-l3 td { padding-top: 18px; font-weight: 300; border-top: 1px solid #e2e8f0; }',
      '.scw-pg2-l3--first td { border-top: 0; }',
      '.scw-pg2-l3 td:first-child { font-size: 20px; }',
      '.scw-pg2-l3 td:nth-child(n+2) { font-weight: 600; }',
      // Callouts: orange for the LABEL only; the designator list itself is
      // quiet gray fine print (dense projects were a wall of bold orange).
      '.scw-pg2-l4-conn { display: block; margin-top: 4px; line-height: 1.4; font-size: 12px; color: #64748b; font-weight: 400; max-width: 110ch; }',
      '.scw-pg2-l4-conn b { color: orange; font-weight: 800; }',
      // L4 — no extra indent beneath the product header (2026-07-30)
      '.scw-pg2-l4 td { padding-top: 5px; font-weight: 300; }',
      '.scw-pg2-l4 td:nth-child(n+2) { font-weight: 600; }',
      '.scw-pg2-l4-desc { display: block; line-height: 1.35; max-width: 110ch; }',
      '.scw-pg2-l4-desc b { font-weight: 600; }',
      '.scw-pg2-hide-qtycost td:nth-child(n+2) { visibility: hidden; }',
      // Mounting cluster — flush with the labor description (no indent),
      // muted slate so accessories read as secondary to the product
      '.scw-pg2-mount td { color: #5f6b7a; font-size: 14px; font-weight: 400; }',
      '.scw-pg2-mount-labor td { font-size: 13px; font-weight: 300; line-height: 1.2; }',
      // L2 footer — border-collapse merges adjacent transparent borders,
      // so this 40px alone sets the gap to the next section header.
      '.scw-pg2-l2foot td { background: aliceblue; background-clip: padding-box; border-top: 1px solid #dadada; font-weight: 800; border-bottom: 40px solid transparent; }',
      '.scw-pg2-l2foot td:first-child { text-align: right; }',
      // L1 footer + project totals. Their value cell is td #2 (label has a
      // colspan), so out-specify the qty-column centering rule above.
      '.scw-pg2-table .scw-pg2-l1foot td, .scw-pg2-table .scw-pg2-pt td { text-align: right; font-size: 16px; }',
      '.scw-pg2-l1foot--title td { border-top: 20px solid transparent; border-bottom: 5px solid #07467c; }',
      '.scw-pg2-l1foot-title { font-weight: 700; font-size: 16px; overflow-wrap: anywhere; }',
      '.scw-pg2-pt--first .scw-pg2-l1foot-title { font-size: 2.2em; font-weight: 600; }',
      '.scw-pg2-l1foot-line { display: flex; justify-content: flex-end; align-items: baseline; gap: 14px; }',
      '.scw-pg2-l1foot-label { opacity: .85; font-weight: 600; white-space: nowrap; }',
      '.scw-pg2-l1foot-value { font-weight: 700; white-space: nowrap; }',
      '.scw-pg2-l1foot--sub .scw-pg2-l1foot-label, .scw-pg2-l1foot--sub .scw-pg2-l1foot-value { color: #07467c; }',
      '.scw-pg2-l1foot--disc .scw-pg2-l1foot-label, .scw-pg2-l1foot--disc .scw-pg2-l1foot-value { color: orange; }',
      '.scw-pg2-l1foot--final .scw-pg2-l1foot-label, .scw-pg2-l1foot--final .scw-pg2-l1foot-value { color: #07467c; font-weight: 900; }',
      '.scw-pg2-l1foot--final .scw-pg2-l1foot-value { font-size: 18px; }',
      '.scw-pg2-l1foot--sub td, .scw-pg2-l1foot--disc td, .scw-pg2-pt--tight td { border-bottom: 0; padding-bottom: 0; }',
      '.scw-pg2-l1foot--last td { border-bottom: 60px solid #fff; }',
      '.scw-pg2-pt--equipment td, .scw-pg2-pt--install td { border-bottom: 14px solid transparent; }',
      '.scw-pg2-pt--grand .scw-pg2-l1foot-label { font-size: 21px; }',
      '.scw-pg2-pt--grand .scw-pg2-l1foot-value { font-size: 23px; }',
      '.scw-pg2-disc-note { margin-top: 3px; font-size: 12px; font-style: italic; font-weight: 400; line-height: 1.3; color: #64748b; text-align: right; white-space: normal; max-width: 340px; margin-left: auto; }',
      // CO treatment — banded add/remove presentation (mirrors the live
      // v1 + co-band scheme: green adds; neutral slate removes with
      // accounting-red money).
      '.scw-pg2-co-add td { background: #f0fdf4; background-clip: padding-box; }',
      '.scw-pg2-co-add td:first-child { box-shadow: inset 4px 0 0 #059669; }',
      '.scw-pg2-co-rm td { background: #f8fafc; background-clip: padding-box; }',
      '.scw-pg2-co-rm td:first-child { box-shadow: inset 4px 0 0 #94a3b8; }',
      '.scw-pg2-table .scw-pg2-co-rm td:nth-child(3) { color: #be123c; }',
      // Band header rows
      '.scw-pg2-band td { font: 700 13px/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .06em; padding: 9px 8px; background-clip: padding-box; }',
      // Accent stripe on the FIRST cell only — per-td insets painted
      // stray bars at the qty/cost column edges.
      '.scw-pg2-band--add td { background: #ecfdf5; color: #065f46; border-top: 2px solid #059669; }',
      '.scw-pg2-band--add td:first-child { box-shadow: inset 4px 0 0 #059669; }',
      '.scw-pg2-band--rm td { background: #f4f7fa; color: #334155; border-top: 26px solid transparent; }',
      '.scw-pg2-band--rm td:first-child { box-shadow: inset 4px 0 0 #64748b; }',
      // Per-bucket band subtotals (native-subtotal look) + band totals
      '.scw-pg2-band-sub td { background: #f0f4fa; background-clip: padding-box; color: #163C6E; }',
      '.scw-pg2-band-sub td:first-child { text-align: right; }',
      '.scw-pg2-band-total td { background-clip: padding-box; border-bottom: 20px solid transparent; }',
      '.scw-pg2-band-total td:first-child { text-align: right; }',
      '.scw-pg2-band-total--add td { background: #dcfce7; color: #065f46; border-top: 2px solid #059669; }',
      '.scw-pg2-band-total--rm td { background: #eef2f7; color: #334155; border-top: 2px solid #64748b; }',
      '.scw-pg2-table .scw-pg2-band-sub--rm td:nth-child(3), .scw-pg2-table .scw-pg2-band-total--rm td:nth-child(3) { color: #be123c; }',
      // Missing-columns notice
      '.scw-pg2-notice { margin: 10px 0; padding: 10px 14px; border: 1px solid #f5d199; border-radius: 8px; background: #fff9ec; color: #7a4a09; font: 13px/1.5 system-ui, sans-serif; }',
      '.scw-pg2-notice code { font-size: 12px; color: #92400e; }',
      // Side-by-side parity frame (replaceV1: false)
      '.scw-pg2--preview { margin-top: 28px; border-top: 3px dashed #94a3b8; padding-top: 10px; }',
      '.scw-pg2--preview::before { content: "v2 preview (model-driven rebuild)"; display: block; font: 600 11px/1.6 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function injectViewCss(v1ViewId, dataViewKey) {
    var ID = 'scw-pg2-view-css-' + v1ViewId;
    if (document.getElementById(ID)) return;
    var s = document.createElement('style');
    s.id = ID;
    // display:none (not the clip trick): the data view is never read from
    // the DOM — model only — and a 1000-row grid left renderable is real
    // layout/paint weight on an already-heavy scene.
    var css = '#' + dataViewKey + ' { display: none !important; }\n' +
      // After the v1 view is deleted in Builder, v2 mounts INTO the data
      // view's root (run() adds scw-pg2-host): unhide the root, keep its
      // native grid chrome hidden.
      '#' + dataViewKey + '.scw-pg2-host { display: block !important; }\n' +
      '#' + dataViewKey + '.scw-pg2-host .kn-table-wrapper, ' +
      '#' + dataViewKey + '.scw-pg2-host .kn-records-nav { display: none !important; }';
    if (CONFIG.replaceV1) {
      css += '\n#' + v1ViewId + ' .kn-table-wrapper, #' + v1ViewId + ' .kn-records-nav { display: none !important; }';
    }
    s.textContent = css;
    document.head.appendChild(s);
  }

  // The data view's model must actually carry the fields the tree is built
  // from — a Builder duplicate can silently drop grouping columns (removing
  // a grouping can remove its column) and view_3341 never had field_2464.
  // Rendering off an incomplete model produces a degenerate grid (single
  // blank section, accessories duplicated as their own products), so refuse
  // to render and surface the exact missing columns instead.
  var PROBE_FIELDS = ['l1', 'projectType', 'bucket', 'bucketSort', 'product',
    'installDesc', 'qty', 'labor', 'hardware', 'cost', 'accessoryParent'];
  function missingColumns(records) {
    if (!records.length) return [];
    var missing = [];
    for (var i = 0; i < PROBE_FIELDS.length; i++) {
      var f = CONFIG.fields[PROBE_FIELDS[i]];
      var present = false;
      // Check several records — a single record can legitimately have a
      // field omitted from its attrs when blank.
      for (var r = 0; r < records.length && r < 25; r++) {
        var rec = records[r];
        if (rec && ((f in rec) || ((f + '_raw') in rec))) { present = true; break; }
      }
      if (!present) missing.push(f + ' (' + PROBE_FIELDS[i] + ')');
    }
    return missing;
  }
  function renderMissingNotice(root, dataViewKey, missing) {
    var el = document.createElement('div');
    el.className = 'scw-pg2 scw-pg2--notice';
    el.innerHTML = '<div class="scw-pg2-notice">' +
      '<b>Proposal grid v2 is waiting on Builder columns.</b><br>' +
      'The data view <b>' + esc(dataViewKey) + '</b> is missing these fields ' +
      'as columns (add them to the view in Builder — they can be narrow, ' +
      'the view is hidden):<br><code>' + esc(missing.join(', ')) + '</code></div>';
    return el;
  }

  // ── data plumbing ─────────────────────────────────────────────────
  function readRecords(viewKey) {
    var v = typeof Knack !== 'undefined' && Knack.views && Knack.views[viewKey];
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models) return null;
    return models.map(function (m) { return m.attributes || m; });
  }

  var _truncTries = {};
  function ensureFullPage(viewKey) {
    // Stamp 1000/page pre-fetch; if the model is already loaded but
    // truncated (loaded < total), refetch (bounded).
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
          console.warn(NS + ' data view truncated (' + loaded + '/' + total + ') — refetching', viewKey);
          v.model.fetch();
          return false;
        }
      }
    } catch (e) { /* best effort */ }
    return true;
  }

  // ── pipeline ──────────────────────────────────────────────────────
  var _debounce = {};
  function scheduleRun(v1ViewId) {
    if (_debounce[v1ViewId]) clearTimeout(_debounce[v1ViewId]);
    _debounce[v1ViewId] = setTimeout(function () {
      _debounce[v1ViewId] = 0;
      run(v1ViewId);
    }, 120);
  }

  function run(v1ViewId) {
    if (!CONFIG.enabled) return;
    var vcfg = CONFIG.views[v1ViewId];
    if (!vcfg || !vcfg.dataViewKey) return;
    var root = document.getElementById(v1ViewId);
    if (!root) {
      // v1 view deleted in Builder — mount into the data view's root.
      root = document.getElementById(vcfg.dataViewKey);
      if (root) root.classList.add('scw-pg2-host');
    }
    if (!root) return;

    try {
      injectCss();
      injectViewCss(v1ViewId, vcfg.dataViewKey);

      if (!ensureFullPage(vcfg.dataViewKey)) return;   // refetch in flight
      var records = readRecords(vcfg.dataViewKey);
      if (!records) { dbg('data view model not ready', vcfg.dataViewKey); return; }

      var el;
      var missing = missingColumns(records);
      if (missing.length) {
        console.warn(NS + ' NOT rendering — ' + vcfg.dataViewKey +
          ' model is missing columns: ' + missing.join(', '));
        el = renderMissingNotice(root, vcfg.dataViewKey, missing);
      } else {
        var tree = buildTree(records);
        el = renderGrid(tree, {
          masked: isInstallationMasked(),
          showProjectTotals: vcfg.showProjectTotals !== false
        });
        // CO What's-Changing manifest (v2 owns it since the cutover).
        if (CONFIG.ownCoManifest) {
          try { renderCoManifest(tree); }
          catch (me) { console.warn(NS + ' CO manifest render failed', me); }
        }
        // Totals stash — v1's buildProjectTotalRows used to write this;
        // v2 is the sole writer now. Read by proposal-pdf-export
        // (extractSummaryFields fallback, invoiceTotal, invoiceIsCredit)
        // and sales-stepper's publish gate. REAL numbers, never masked.
        try {
          var tEquipSub = sumRecs(tree.allRecords, CONFIG.fields.hardware);
          var tLineDisc = sumRecs(tree.allRecords, CONFIG.fields.lineDiscount);
          var tPropDisc = Math.abs(readDetailNum('2302'));
          var tEquip = tEquipSub - tLineDisc;
          var tInstall = sumRecs(tree.allRecords, CONFIG.fields.labor);
          window.SCW.proposalGridTotals = {
            viewId: v1ViewId,
            equipmentSubtotal: tEquipSub,
            lineItemDiscounts: tLineDisc,
            proposalDiscount: tPropDisc,
            equipmentTotal: tEquip,
            installationTotal: tInstall,
            grandTotal: tEquip + tInstall - tPropDisc,
            at: Date.now()
          };
        } catch (te) { /* stash is best-effort */ }
      }
      if (!CONFIG.replaceV1) el.classList.add('scw-pg2--preview');

      var existing = root.querySelector('.scw-pg2');
      if (existing) existing.replaceWith(el);
      else root.appendChild(el);
      dbg('rendered', v1ViewId, records.length + ' records');
    } catch (e) {
      // Never leave a half-rendered grid or break the page — v1 is still
      // the live surface; v2 failing must be loud in the console only.
      console.error(NS + ' render failed for ' + v1ViewId, e);
      try {
        var stale = root.querySelector('.scw-pg2');
        if (stale) stale.remove();
      } catch (e2) { /* nothing */ }
    }
  }

  // ── bindings ──────────────────────────────────────────────────────
  var EV = '.scwPg2';
  Object.keys(CONFIG.views).forEach(function (v1ViewId) {
    var vcfg = CONFIG.views[v1ViewId];
    if (!vcfg.dataViewKey) return;   // inert until the duplicate exists
    // Hide the data view IMMEDIATELY at parse — if the render bails for any
    // reason (missing columns, model race, exception) the raw 1000-row flat
    // grid must never paint. This was the "doubled accessories + page
    // struggling" failure: view_4140 rendered visibly as a full raw grid.
    injectViewCss(v1ViewId, vcfg.dataViewKey);
    $(document)
      .off('knack-view-render.' + v1ViewId + EV)
      .on('knack-view-render.' + v1ViewId + EV, function () { scheduleRun(v1ViewId); });
    $(document)
      .off('knack-view-render.' + vcfg.dataViewKey + EV)
      .on('knack-view-render.' + vcfg.dataViewKey + EV, function () { scheduleRun(v1ViewId); });
    // Proposal-discount + FLAG_released detail views re-render → totals/mask.
    [CONFIG.discountDetailView, CONFIG.sowDetailView].forEach(function (dv) {
      $(document)
        .off('knack-view-render.' + dv + EV + v1ViewId)
        .on('knack-view-render.' + dv + EV + v1ViewId, function () { scheduleRun(v1ViewId); });
    });
    // Catch-up: bundle parsed after the scene rendered.
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var have = readRecords(vcfg.dataViewKey);
      var root = document.getElementById(v1ViewId) || document.getElementById(vcfg.dataViewKey);
      if (have && root) { scheduleRun(v1ViewId); clearInterval(iv); }
      else if (tries >= 20) clearInterval(iv);
    }, 300);
  });

  // Console surface for parity debugging.
  window.SCW = window.SCW || {};
  window.SCW.proposalGridV2 = {
    CONFIG: CONFIG,
    run: run,
    // proposal-pdf-export delegates its grid scrape here when v2 owns
    // the view — see scrapeGridView() in proposal-pdf-export.js.
    buildPublishData: buildPublishData,
    // Dump the v1 view's Builder grouping config — used to verify the
    // derived grouping fields match what Knack actually groups by.
    dumpV1Groups: function (viewKey) {
      try {
        var mv = Knack.views[viewKey || 'view_3341'].model.view;
        var cols = (mv.columns || []).map(function (c) {
          return { field: c.field && c.field.key, grouping: !!c.grouping, group_sort: c.group_sort || null, header: c.header };
        });
        return { groups: mv.groups || null, groupedColumns: cols.filter(function (c) { return c.grouping; }), allColumns: cols };
      } catch (e) { return String(e); }
    }
  };
})();
/*** END PROPOSAL GRID V2 ***/
