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
    // false → v2 renders below the v1 grid for side-by-side parity checks.
    // true  → v1's table is hidden (still running for publish) and v2 is
    //         the only visible grid.
    replaceV1: false,
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
      if (len >= 3) out.push(parsed[runStart].lbl + '–' + cur.lbl);
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

    function pushRow(cls, cells, coState) {
      rows.push({ cls: cls, cells: cells, co: coState || '' });
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
      var l1Hardware = sumRecs(l1Recs, F.hardware);
      var l1Labor = laborSum(l1Recs);
      var l1Subtotal = l1Hardware + l1Labor;
      if (Math.abs(l1Subtotal) >= 0.01) anyNonZeroL1 = true;

      if (!promoted) {
        pushRow('scw-pg2-l1', [
          { html: esc(l1g.label), cls: 'scw-pg2-l1-label' },
          { html: Math.abs(l1Subtotal) >= 0.01 ? '<strong>Qty</strong>' : '' },
          { html: Math.abs(l1Subtotal) >= 0.01 ? '<strong>Cost</strong>' : '' }
        ]);
      }

      l1g.bucketOrder.forEach(function (bk) {
        var bucket = l1g.buckets[bk];
        var kind = bucketKind(bucket);
        var displayLabel = bucket.label;
        if (rule && rule.renames[displayLabel]) displayLabel = rule.renames[displayLabel];
        if (promoted && kind === 'assumptions') displayLabel = 'General Project Assumptions';
        var context = contextOf(displayLabel, bucket);
        var hideL3 = kind === 'services' || kind === 'assumptions';
        var hideQtyCost = kind === 'services' || kind === 'assumptions';

        // Bucket records (parents only; accessories render in clusters).
        var bucketParentRecs = [], bucketAllRecs = [];
        bucket.productOrder.forEach(function (pk) {
          bucket.products[pk].items.forEach(function (it) {
            bucketParentRecs.push(it);
            bucketAllRecs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) { bucketAllRecs.push(a); });
          });
        });
        if (!bucketParentRecs.length) return;

        pushRow(
          'scw-pg2-l2' + (promoted ? ' scw-pg2-l2--promoted' : '') +
            (kind !== 'default' ? ' scw-pg2-l2--' + kind : ''),
          promoted
            ? [{ html: esc(displayLabel), cls: 'scw-pg2-l1-label' },
               { html: Math.abs(l1Subtotal) >= 0.01 ? '<strong>Qty</strong>' : '' },
               { html: Math.abs(l1Subtotal) >= 0.01 ? '<strong>Cost</strong>' : '' }]
            : [{ html: esc(displayLabel) }, { html: '' }, { html: '' }]
        );

        bucket.productOrder.forEach(function (pk, pi) {
          var product = bucket.products[pk];
          var accessories = [];
          product.items.forEach(function (it) {
            (tree.accByParent[it.id] || []).forEach(function (a) { accessories.push(a); });
          });

          var coStates = product.items.map(coActionOf);
          var allRemove = coStates.length > 0 && coStates.every(function (s) { return s === 'remove'; });
          var allAdd = coStates.length > 0 && coStates.every(function (s) { return s === 'add'; });

          // L3 product line — qty/cost of PARENT devices only.
          if (!hideL3 && !isBlankish(product.label)) {
            var pQty = sumRecs(product.items, F.qty);
            var pHardware = sumRecs(product.items, F.hardware);
            pushRow('scw-pg2-l3' + (pi === 0 ? ' scw-pg2-l3--first' : ''), [
              { html: esc(product.label) },
              { html: '<strong>' + Math.round(pQty) + '</strong>' },
              { html: '<strong>' + amountHtml(pHardware, false) + '</strong>' }
            ], allRemove ? 'remove' : (allAdd ? 'add' : ''));
          }

          // L4 install-description lines — qty + labor.
          product.l4Order.forEach(function (dk) {
            var l4 = product.l4s[dk];
            var hasLabel = !isBlankish(norm(stripHtml(l4.html)));
            if (!hasLabel && hideL3) {
              // Assumptions/services rows with no desc — nothing to show.
              return;
            }
            var l4CoStates = l4.items.map(coActionOf);
            var l4Remove = l4CoStates.length > 0 && l4CoStates.every(function (s) { return s === 'remove'; });
            var l4Add = l4CoStates.length > 0 && l4CoStates.every(function (s) { return s === 'add'; });
            if (!hasLabel) return;   // blank L4 header → hidden (v1 parity)
            var l4Qty = sumRecs(l4.items, F.qty);
            var l4Labor = sumRecs(l4.items, F.labor);
            var camHtml = '';
            if (context === 'drop') {
              var list = designatorList(l4.items);
              // Same tight labeled callout as Connected devices.
              if (list) camHtml = '<span class="scw-pg2-l4-conn"><b>Applies to:</b> ' + esc(list) + '</span>';
            }
            // Connected devices (orange, labeled) — beneath the labor
            // description. Only names that resolve to records in THIS view
            // (other-SOW connections are dropped).
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
            pushRow('scw-pg2-l4' + (hideQtyCost ? ' scw-pg2-hide-qtycost' : ''), [
              { html: '<span class="scw-pg2-l4-desc">' + l4.html + '</span>' + camHtml + connHtml },
              { html: hideQtyCost ? '' : '<strong>' + Math.round(l4Qty) + '</strong>' },
              { html: hideQtyCost ? '' : '<strong>' + (masked ? tbd() : esc(money(l4Labor))) + '</strong>' }
            ], l4Remove ? 'remove' : (l4Add ? 'add' : ''));
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
              pushRow('scw-pg2-mount', [
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
                  pushRow('scw-pg2-mount-labor', [
                    { html: esc(desc) },
                    { html: '' },
                    { html: masked ? tbd() : esc(money(gLabor)) }
                  ]);
                }
              }
            });
          }
        });

        // L2 footer — total = hardware + labor for the whole bucket
        // (accessories included); qty shown only for the drop bucket.
        var isAssumptions = kind === 'assumptions';
        if (!isAssumptions) {
          var bHardware = sumRecs(bucketAllRecs, F.hardware);
          var bLabor = laborSum(bucketAllRecs);
          var bQty = sumRecs(bucketParentRecs, F.qty);
          pushRow('scw-pg2-l2foot' + (hideQtyCost ? ' scw-pg2-hide-qtycost' : ''), [
            { html: '<strong>' + esc(displayLabel) + '</strong>', cls: 'scw-pg2-l2foot-label' },
            { html: context === 'drop' ? '<strong>' + Math.round(bQty) + '</strong>' : '' },
            { html: '<strong>' + (masked && bLabor === 0 && bHardware === 0 ? tbd() : esc(money(bHardware + bLabor))) + '</strong>' }
          ]);
        }

        // Promoted L2 acts as L1 → gets the L1 footer treatment.
        if (promoted && !isAssumptions) {
          pushL1Footer(displayLabel, bucketAllRecs);
        }
      });

      if (!promoted) pushL1Footer(l1g.label, l1Recs);
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
    var prevRemoved = false;
    rows.forEach(function (row) {
      var removed = row.co === 'remove';
      if (removed && !prevRemoved) {
        html.push('<tr class="scw-pg2-co-banner"><td colspan="3">Removed from install scope — credit</td></tr>');
      }
      prevRemoved = removed;
      var coCls = row.co === 'remove' ? ' scw-pg2-co-rm' : (row.co === 'add' ? ' scw-pg2-co-add' : '');
      if (row.title !== undefined) {
        html.push('<tr class="' + row.cls + coCls + '"><td colspan="2"><div class="scw-pg2-l1foot-title">' +
          esc(row.title) + '</div></td><td></td></tr>');
      } else if (row.label !== undefined) {
        var valueHtml = row.maskedValue ? '<strong>' + tbd() + '</strong>' : esc(row.value);
        html.push('<tr class="' + row.cls + coCls + '">' +
          '<td colspan="2"><div class="scw-pg2-l1foot-label">' + esc(row.label) + '</div></td>' +
          '<td><div class="scw-pg2-l1foot-value">' + valueHtml + '</div>' +
          (row.note ? '<div class="scw-pg2-disc-note">' + esc(row.note) + '</div>' : '') +
          '</td></tr>');
      } else {
        html.push('<tr class="' + row.cls + coCls + '">' + row.cells.map(function (c, idx) {
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
    for (var ci = 0; ci < records.length; ci++) {
      if (coActionOf(records[ci])) return null;
    }

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
      var section = null;
      if (!promoted) {
        section = { level: 1, label: l1g.label, promoted: false, buckets: [], footer: null };
        sections.push(section);
      }

      l1g.bucketOrder.forEach(function (bk) {
        var bucket = l1g.buckets[bk];
        var kind = bucketKind(bucket);
        var displayLabel = bucket.label;
        if (rule && rule.renames[displayLabel]) displayLabel = rule.renames[displayLabel];
        if (promoted && kind === 'assumptions') displayLabel = 'General Project Assumptions';
        var context = contextOf(displayLabel, bucket);
        var hideL3 = kind === 'services' || kind === 'assumptions';
        var isMounting = norm(displayLabel).toLowerCase() === CONFIG.mountingHardwareLabel;

        var bucketParentRecs = [], bucketAllRecs = [];
        bucket.productOrder.forEach(function (pk) {
          bucket.products[pk].items.forEach(function (it) {
            bucketParentRecs.push(it);
            bucketAllRecs.push(it);
            (tree.accByParent[it.id] || []).forEach(function (a) { bucketAllRecs.push(a); });
          });
        });
        if (!bucketParentRecs.length) return;

        var sec = section;
        if (promoted) {
          sec = { level: 1, label: displayLabel, promoted: true, buckets: [], footer: null };
          sections.push(sec);
        }
        var b2 = { level: 2, label: displayLabel, isPromoted: promoted, products: [], footer: null };
        sec.buckets.push(b2);

        // hideL3 buckets (services/assumptions) collect ALL their line
        // items under ONE label-less product with qty/cost suppressed —
        // mirrors the v1 scraper's synthetic-L3 behavior.
        var synth = null;

        bucket.productOrder.forEach(function (pk) {
          var product = bucket.products[pk];
          var accessories = [];
          product.items.forEach(function (it) {
            (tree.accByParent[it.id] || []).forEach(function (a) { accessories.push(a); });
          });

          var prod = null;
          if (!hideL3 && !isBlankish(product.label)) {
            prod = {
              level: 3, label: product.label,
              qty: Math.round(sumRecs(product.items, F.qty)),
              cost: pubMoney(sumRecs(product.items, F.hardware)),
              rate: '', hideCost: false,
              connectedDevices: connDevicesOf(product.items),
              isMountingHardware: isMounting, lineItems: [],
            };
            b2.products.push(prod);
          }

          product.l4Order.forEach(function (dk) {
            var l4 = product.l4s[dk];
            var text = norm(stripHtml(l4.html));
            if (isBlankish(text)) return;
            var item = {
              level: 4, label: text, description: l4.html,
              qty: Math.round(sumRecs(l4.items, F.qty)),
              cost: pubMoney(sumRecs(l4.items, F.labor)),
              cameraList: context === 'drop' ? designatorList(l4.items) : '',
            };
            if (prod) prod.lineItems.push(item);
            else {
              if (!synth) {
                synth = { level: 3, label: '', qty: 0, cost: '', rate: '', hideCost: true,
                          connectedDevices: [], isMountingHardware: false, lineItems: [] };
                b2.products.push(synth);
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

        if (kind !== 'assumptions') {
          b2.footer = {
            label: displayLabel,
            qty: context === 'drop' ? Math.round(sumRecs(bucketParentRecs, F.qty)) : 0,
            cost: pubMoney(sumRecs(bucketAllRecs, F.hardware) + sumRecs(bucketAllRecs, F.labor)),
          };
          if (promoted) sec.footer = l1FooterData(displayLabel, bucketAllRecs);
        }
      });

      if (!promoted && section) section.footer = l1FooterData(l1g.label, l1Recs);
    });

    var projectTotals = null;
    if (vcfg.showProjectTotals !== false) {
      var equipmentSubtotal = sumRecs(tree.allRecords, F.hardware);
      var lineItemDiscounts = sumRecs(tree.allRecords, F.lineDiscount);
      var proposalDiscount = Math.abs(readDetailNum('2302'));
      var equipmentTotal = equipmentSubtotal - lineItemDiscounts;
      var installationTotal = sumRecs(tree.allRecords, F.labor);
      var grandTotal = equipmentTotal + installationTotal - proposalDiscount;
      projectTotals = { title: 'Project Totals', lines: [] };
      if (lineItemDiscounts !== 0 || proposalDiscount !== 0) {
        projectTotals.lines.push({ type: 'sub', label: 'Equipment Subtotal', value: pubMoney(equipmentSubtotal) });
        if (lineItemDiscounts !== 0) projectTotals.lines.push({ type: 'disc', label: 'Line Item Discounts', value: '-' + pubMoney(Math.abs(lineItemDiscounts)) });
      }
      projectTotals.lines.push({ type: 'final', label: 'Equipment Total', value: pubMoney(equipmentTotal) });
      projectTotals.lines.push({ type: 'final', label: 'Installation Total', value: pubMoney(installationTotal) });
      if (proposalDiscount !== 0) projectTotals.lines.push({ type: 'disc', label: 'Proposal Discount', value: '-' + pubMoney(proposalDiscount) });
      projectTotals.lines.push({ type: 'final', label: 'Grand Total', value: pubMoney(grandTotal) });
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
      '.scw-pg2-l1 td:first-child, .scw-pg2-l2--promoted td:first-child { font-size: 24px; font-weight: 200; padding-left: 20px; }',
      // L2 — background-clip keeps the aliceblue bar from bleeding into
      // the transparent spacing borders (the "big blue blur").
      '.scw-pg2-l2 td { background: aliceblue; background-clip: padding-box; font-size: 16px; padding: 5px 0 5px 20px; border-top: 20px solid transparent; }',
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
      '.scw-pg2-l1foot-label { opacity: .85; font-weight: 600; white-space: nowrap; }',
      '.scw-pg2-l1foot-value { font-weight: 700; white-space: nowrap; display: inline-block; min-width: 120px; }',
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
      // CO treatment
      '.scw-pg2-co-rm td { background: #fff1f2 !important; }',
      '.scw-pg2-co-rm td:first-child { box-shadow: inset 4px 0 0 #e11d48; }',
      '.scw-pg2-co-add td { background: #f0fdf4 !important; }',
      '.scw-pg2-co-add td:first-child { box-shadow: inset 4px 0 0 #059669; }',
      '.scw-pg2-co-banner td { background: #e11d48 !important; color: #fff; padding: 3px 12px; font: 700 10px/1.7 system-ui, -apple-system, sans-serif; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }',
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
    var css = '#' + dataViewKey + ' { display: none !important; }';
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
      var root = document.getElementById(v1ViewId);
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
