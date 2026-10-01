/*** BILL OF MATERIALS TRAY (deploy pages) **********************************
 *
 * docs/deploy-page-redesign.md. Replaces the worksheet's Summary panels
 * (per-MDF and grand: product × existing / new cabling / exterior /
 * interior / plenum) with one question a PM can answer at a glance: am I
 * shipping the right stuff?
 *
 * The first row of "Also on this project" ("Bill of materials", added by
 * deploy-page-nav.js) opens the deploy drawer (openPanel) around a tray:
 *   head       N new drops · M on existing cable, and a By category /
 *              By MDF-IDF / By SOW toggle
 *   Shipping   what goes in the SCW box, grouped by proposal bucket (the
 *              L2 name the SOW already uses), by MDF/IDF (items with no
 *              location last) or by the SOW the line came from (items with
 *              no SOW link last; a line shared by two SOWs names both), one row per
 *              product: Product | SKU | Qty | Retail | Discount | After
 *              discount. Pricing on the ops page only; the sub's tray has
 *              Product | SKU | Qty.
 *   Not shipping  a separate, muted block: Pre-existing (on site, we
 *              connect to it, not installing it) and Customer-supplied (the
 *              customer provides it, we install it). Both read off the
 *              product NAME.
 *   Removed by change order  a third muted block: rows a signed CO pulled
 *              from the install scope (field_2967 set, same rule as the
 *              worksheet's "Removed by CO" fold), grouped by the CO's SOW
 *              number, struck through, never counted or priced.
 * Change orders are read off the CO's OWN lines on the proposed SOW grid
 * (a CO line carries its target install record field_2966, its action
 * field_2965 and its SOW field_2154, "SW1418CO"). The ACTION is taken
 * first from the CO's pricing snapshot JSON (the {lines:{id:{action,qty,
 * item}}} blob co-stage-strip.js writes when the CO goes to the sub,
 * carried on the acceptance / proposal records already on this scene and
 * keyed by the same line ids), then the grid's own action column, then
 * the sign of the line's qty (a Remove line is negative) — the grid may
 * not expose the action column, and without it every line read as an Add.
 * Lines are paired to the record they target BY CATEGORY: a camera's swap
 * is the camera-bucket Add/Remove pair; a mount line targeting the same
 * record is the accessory riding along, never the camera's replacement.
 * That is where the CO
 * number comes from (field_2967's own display value is the removed line's
 * product name, useless as a heading), and it is what shows the two
 * things the install record alone cannot: a REMOVE on a CO not yet signed
 * (row stays in Shipping with an amber "Removal pending" chip — nothing
 * leaves scope before signature) and a SWAP, where signature changed the
 * install record's product IN PLACE (row shows its new product with a
 * "Swapped in by … · was …" chip). No record was removed, but the OLD unit
 * is real hardware — quoted, possibly shipped, possibly on site — so the
 * swap's Remove line (its product + qty) is listed in the same block as
 * removals, "Swapped out", as extra hardware to bring back.
 * Services and assumptions never appear. Accessories (mounts) are line
 * items with a product and ship like anything else: they are rows in their
 * own bucket.
 *
 * Data: the install line items (view_4093 ops / view_4056 sub), read
 * through worksheet-v2's record cache when it is there (same records the
 * cards render), else the Knack model. Pricing lives on the PROPOSED SOW
 * line item the install record points at (field_2819) — the hidden
 * view_4072 grid on the ops scene — retail (field_1960), discount $ each
 * (field_2262), net unit (field_2268); shown extended (× qty). The same
 * record's SOW connection (field_2154) is the By SOW grouping.
 *
 * The tray element is created ONCE per open and re-painted in place when
 * the grouping changes: the deploy drawer tags that element to clear it
 * when another section or panel opens, so swapping it for a fresh element
 * would leave an untagged copy behind under the next tray.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENES = [
    { sceneId: 'scene_1311', installView: 'view_4093', sowView: 'view_4072', mount: 'scw-ws-v2-view_4093', pricing: true },
    { sceneId: 'scene_1353', installView: 'view_4056', sowView: 'view_4151', mount: 'scw-ws-v2-view_4056', pricing: false }
  ];
  // Install line item (worksheet-v2 config, view_4093 / view_4056)
  var IF = {
    productName:  'field_2790',   // PRODUCT STORED_name
    product:      'field_2846',   // CORE_product (connection)
    displayLabel: 'field_2802',   // LABEL_DISPLAY (I-003)
    qty:          'field_2789',
    existCabling: 'field_2807',   // Yes = existing cable, else a new drop (cam/reader rows)
    mdfIdf:       'field_2818',   // L1 location (connection)
    bucket:       'field_2822',   // REL_CONFIG_proposal bucket (connection, L2 name)
    removedByCo:  'field_2967',   // populated = removed from install scope
    sowItem:      'field_2819',   // → proposed SOW line item (pricing)
    sortOrder:    'field_2218',   // proposal bucket sort order (same key as the SOW)
    parent:       'field_2853'    // accessory → its device (install object's parent pointer)
  };
  // Proposed SOW line item (view_4072 / view_4151)
  var SF = {
    retail:       'field_1960',   // PRODUCT STORED_price (unit list price)
    discountEach: 'field_2262',   // INPUT line discount $ each
    netUnit:      'field_2268',   // CALC unit price after discounts
    sow:          'field_2154',   // REL_scope of work (multi: a line shared by two SOWs names both)
    sku:          'field_56'      // INPUT_sku — fallback; the live key is read off the grid header (skuField)
  };
  // Change-order lines on the proposed SOW grid (view_4072 / view_4151)
  var CF = {
    target: 'field_2966',   // Target install item (the install record a CO line acts on)
    action: 'field_2965',   // CO Action (Remove on credit lines, else an Add)
    sow:    'field_2154',   // the CO's SOW ("SW1418CO")
    product:'field_1949',   // Product (connection → name)
    qty:    'field_1964',   // Quantity on the CO line (negative on a Remove)
    bucket: 'field_2219'    // proposal bucket (connection, L2 name)
  };
  var MOUNT_RE = /mount|bracket|hardware|accessor|adapter|plate|pole\b/i;
  var NO_LOC = 'No MDF / IDF';
  var NO_SOW = 'No SOW';
  var UNKNOWN_CO = 'Change order';
  /** The SKU column's field key, found by its header text on the SOW grid
   *  (view_4072 / view_4151) or the install grid — whichever carries a
   *  column labelled SKU. Hidden Knack grids keep their DOM, so the header
   *  is there to read. Returns { view, key } or null. */
  function skuField(cfg) {
    var views = [cfg.sowView, cfg.installView];
    for (var v = 0; v < views.length; v++) {
      var ths = document.querySelectorAll('#' + views[v] + ' thead th');
      for (var i = 0; i < ths.length; i++) {
        var m = (ths[i].className || '').match(/\bfield_\d+\b/);
        if (m && /\bsku\b/i.test(ths[i].textContent)) return { view: views[v], key: m[0] };
      }
    }
    return null;
  }
  var STYLE_ID = 'scw-bom-css';
  var EVENT_NS = '.scwBomTray';
  var PRE_RE   = /^\s*pre[\s-]*existing\b/i;
  var CUST_RE  = /\b(customer|client)[\s-]*supplied\b/i;
  var SPECIAL_RE = /\bspecial[\s-]*order\b/i;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var hide = [];
    for (var i = 0; i < SCENES.length; i++) {
      var m = '#' + SCENES[i].mount;
      hide.push(m + ' .scw-ws-v2-summary', m + ' .scw-ws-v2-grand-summary',
                m + ' .scw-ws-v2-toolbar-btn[data-scw-ws-v2-mode="summary"]');
    }
    var css = [
      /* The old summary panels + the "Summary only" mode: the tray replaces them. */
      hide.join(',\n') + ' { display: none !important; }',
      '.scw-bom { font: 12.5px/1.4 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.scw-bom__head { display: flex; align-items: center; gap: 14px; padding: 4px 0 12px; border-bottom: 1px solid #e2e8f0; }',
      '.scw-bom__drops { font-size: 13px; color: #475569; }',
      '.scw-bom__drops b { color: #163c6e; }',
      '.scw-bom__spring { flex: 1 1 auto; }',
      '.scw-bom__toggle { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }',
      '.scw-bom__toggle button { padding: 5px 10px; border: 0; background: #fff; color: #475569; font: 600 11.5px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-bom__toggle button.is-on { background: #163c6e; color: #fff; }',
      '.scw-bom__section { display: flex; align-items: baseline; gap: 10px; padding: 16px 0 6px; }',
      '.scw-bom__section-title { font-size: 13px; font-weight: 800; }',
      '.scw-bom__section-sub { color: #64748b; }',
      '.scw-bom__table { width: 100%; border-collapse: collapse; }',
      '.scw-bom__table th { padding: 5px 8px; text-align: left; font: 700 10.5px/1.2 system-ui, sans-serif; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #0f172a; white-space: nowrap; }',
      '.scw-bom__table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }',
      '.scw-bom__table th.num, .scw-bom__table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.scw-bom__group td { padding: 26px 8px 6px; border-bottom: 2px solid #cbd5e1; font: 800 15px/1.2 system-ui, sans-serif; color: #163c6e; }',
      '.scw-bom__group:first-child td { padding-top: 10px; }',
      '.scw-bom__group--none td { color: #64748b; }',
      '.scw-bom__sub td { padding: 12px 8px 3px; border-bottom: 1px solid #e2e8f0; font: 700 10.5px/1.2 system-ui, sans-serif; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; }',
      '.scw-bom__name { font-weight: 700; }',
      '.scw-bom__desig { color: #64748b; font-weight: 400; }',
      '.scw-bom__sku { color: #64748b; white-space: nowrap; }',
      '.scw-bom__qty { font-weight: 700; }',
      '.scw-bom__muted { color: #64748b; }',
      '.scw-bom__total td { border-top: 2px solid #0f172a; border-bottom: 0; font-weight: 700; padding-top: 7px; }',
      '.scw-bom__subtotal td { border-top: 1px solid #cbd5e1; border-bottom: 0; font-weight: 700; color: #475569; padding-top: 6px; }',
      '.scw-bom__chip { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; font: 700 11px/1.5 system-ui, sans-serif; white-space: nowrap; vertical-align: middle; }',
      '.scw-bom__chip--drops { background: #eaf0f7; color: #163c6e; }',
      '.scw-bom__chip--special { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; }',
      '.scw-bom__chip--pre { border: 1px solid #cbd5e1; background: #fff; color: #475569; }',
      '.scw-bom__chip--cust { border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; }',
      '.scw-bom__chip--removed { border: 1px solid #fca5a5; background: #fef2f2; color: #b91c1c; }',
      '.scw-bom__chip--pending { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; }',
      '.scw-bom__chip--swap { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; }',
      '.scw-bom__removed .scw-bom__name { text-decoration: line-through; text-decoration-color: #94a3b8; color: #64748b; font-weight: 600; }',
      '.scw-bom__removed .scw-bom__group td { font-size: 13px; padding-top: 14px; }',
      '.scw-bom__noship { margin-top: 22px; padding: 10px 12px 4px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #f8fafc; color: #475569; }',
      '.scw-bom__noship .scw-bom__section { padding-top: 0; }',
      '.scw-bom__noship .scw-bom__section-title { color: #475569; }',
      '.scw-bom__noship td { border-bottom-color: #e2e8f0; }',
      '.scw-bom__why { color: #94a3b8; }',
      '.scw-bom__empty { padding: 24px 0; color: #64748b; }'
    ].join('\n');
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function num(v) {
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function isYes(v) {
    if (v === true) return true;
    return /^(yes|true|1)$/i.test(plain(v));
  }
  function connLabel(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? plain(raw[0].identifier) : '';
    if (raw && typeof raw === 'object') return plain(raw.identifier);
    return plain(rec[fk]);
  }
  /** Every identifier on a (multi) connection, in order. */
  function connLabels(rec, fk) {
    var raw = rec[fk + '_raw'], out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i]) { var l = plain(raw[i].identifier); if (l) out.push(l); }
      return out;
    }
    var one = connLabel(rec, fk);
    return one ? [one] : [];
  }
  /** "1524" / "SW1524" / "61507493933-SW1524" → "SOW 1524"; anything else as is. */
  function sowLabel(s) {
    var m = String(s || '').match(/(?:^|-)\s*(?:SW)?(\d+[A-Z]*)\s*$/i);
    return m ? 'SOW ' + m[1].toUpperCase() : String(s || '');
  }
  function connId(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? (raw[0].id || '') : '';
    if (raw && typeof raw === 'object') return raw.id || '';
    return '';
  }
  function hasValue(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length > 0;
    if (raw != null && raw !== '') return true;
    return plain(rec[fk]) !== '';
  }
  function money(n) {
    var neg = n < 0, a = Math.abs(n);
    var s = a.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + '$' + s;
  }

  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      if (document.getElementById('kn-' + SCENES[i].sceneId)) return SCENES[i];
    }
    return null;
  }
  function modelRecords(viewKey) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewKey] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  /** The install records the worksheet renders: worksheet-v2's cache when
   *  it is there (it tracks Knack's collection and inline edits), else
   *  the Knack model. */
  function installRecords(cfg) {
    var ns = window.SCW && SCW.worksheetV2;
    try {
      if (ns && ns.data && typeof ns.data.readRecords === 'function') {
        var recs = ns.data.readRecords(cfg.installView);
        if (recs && recs.length) return recs;
      }
    } catch (e) { /* fall through */ }
    return modelRecords(cfg.installView);
  }
  function sowIndex(cfg) {
    var out = {}, recs = modelRecords(cfg.sowView);
    for (var i = 0; i < recs.length; i++) if (recs[i] && recs[i].id) out[recs[i].id] = recs[i];
    return out;
  }
  function parseLooseJson(v) {
    if (v == null) return null;
    var t = String(v).trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { /* entities / tags */ }
    try { var ta = document.createElement('textarea'); ta.innerHTML = t; return JSON.parse(ta.value.trim()); } catch (e) { /* */ }
    try { return JSON.parse(t.replace(/<[^>]*>/g, '').trim()); } catch (e) { return null; }
  }
  /** Every CO pricing snapshot on the page ({lines:{lineId:{action,qty,
   *  item}}}), wherever a view's model carries one (the acceptance grid's
   *  proposal / stamp columns, a CO header's field_2972): lineId → line. */
  function coSnapshotLines() {
    var out = {}, views = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views : {};
    for (var vk in views) {
      var recs = modelRecords(vk);
      for (var i = 0; i < recs.length; i++) {
        var a = recs[i];
        if (!a) continue;
        for (var k in a) {
          if (!/^field_\d+$/.test(k) || typeof a[k] !== 'string' || a[k].indexOf('"lines"') === -1) continue;
          var snap = parseLooseJson(a[k]);
          if (!snap || !snap.lines || typeof snap.lines !== 'object' || Array.isArray(snap.lines)) continue;
          for (var id in snap.lines) if (snap.lines[id] && typeof snap.lines[id] === 'object' && !out[id]) out[id] = snap.lines[id];
        }
      }
    }
    return out;
  }
  /** Which side of a swap a CO line is on: 'cam' (camera / reader), 'mount'
   *  (accessory) or 'default' from its bucket; with no bucket on the grid,
   *  'mount?' when the product name reads like one, else 'unknown'. */
  function lineCat(bucketLabel, name) {
    if (bucketLabel) {
      if (/camera|reader/i.test(bucketLabel)) return 'cam';
      return MOUNT_RE.test(bucketLabel) ? 'mount' : 'default';
    }
    return MOUNT_RE.test(name) ? 'mount?' : 'unknown';
  }
  /** Product names compare loosely: case, spacing and a trailing " - SKU"
   *  (the CO line's product identifier carries one, the install record's
   *  stored name does not). */
  function normName(s) {
    return plain(s).toLowerCase().replace(/\s+-\s+[a-z0-9][a-z0-9.\-\/]*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function sameProduct(a, b) {
    var x = normName(a), y = normName(b);
    return !!x && !!y && (x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0);
  }
  /** Change-order lines by the install record they act on:
   *  { installId: [ { id, co, name, qty, cat, remove, rec } ] }. */
  function coIndex(cfg) {
    var out = {}, recs = modelRecords(cfg.sowView), snap = coSnapshotLines();
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      var tid = connId(r, CF.target);
      if (!tid) continue;
      var sl = snap[r.id] || null;
      var action = (sl && sl.action) ? String(sl.action) : plain(r[CF.action]);
      var qty = num(r[CF.qty]);
      if (!qty && sl && sl.qty != null) qty = Number(sl.qty) || 0;
      var name = connLabel(r, CF.product) || plain(r[IF.productName]) || (sl && sl.item) || '';
      out[tid] = out[tid] || [];
      out[tid].push({
        id: r.id,
        co:   connLabels(r, CF.sow).map(sowLabel).filter(function (l) { return /CO/i.test(l); })[0] ||
              connLabels(r, CF.sow).map(sowLabel)[0] || UNKNOWN_CO,
        name: name,
        qty:  Math.abs(qty) || 0,
        cat:  lineCat(connLabel(r, CF.bucket), name),
        remove: /remove|credit/i.test(action) || qty < 0,
        rec:  r
      });
    }
    return out;
  }
  /** The CO lines that act on one install record, split into the record's
   *  OWN pair (same category) and accessory lines riding on it. */
  function coFor(lines, recCat) {
    var o = { adds: [], removes: [], accRemoves: [] };
    if (!lines) return o;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var isMount = l.cat === 'mount' || l.cat === 'mount?';
      var own = l.cat === recCat || l.cat === 'unknown' || (isMount && recCat === 'mount');
      if (own) (l.remove ? o.removes : o.adds).push(l);
      else if (isMount && l.remove) o.accRemoves.push(l);
    }
    return o;
  }
  /** The CO a removed install record names on field_2967 — only when its
   *  display value is a SOW/CO number; the live data shows the removed
   *  line's product name there. */
  function coFromFlag(rec) {
    var l = connLabel(rec, IF.removedByCo);
    return /^\s*(SW)?\d+CO\b/i.test(l) || /^\s*\d+[-\s]*(SW)?\d+CO\b/i.test(l) ? sowLabel(l) : '';
  }
  function categoryOf(rec, cfg) {
    var ns = window.SCW && SCW.worksheetV2;
    try {
      if (ns && ns.card && typeof ns.card.bucketCategoryOf === 'function') return ns.card.bucketCategoryOf(rec, cfg.installView);
    } catch (e) { /* fall through */ }
    var b = connLabel(rec, IF.bucket);
    if (/camera|reader/i.test(b)) return 'cam';
    if (/service/i.test(b)) return 'services';
    if (/assumption/i.test(b)) return 'assumptions';
    return 'default';
  }

  // ── Model ──────────────────────────────────────────────────────────
  /** One entry per install line item worth listing. */
  function items(cfg) {
    var recs = installRecords(cfg), sow = sowIndex(cfg), cos = coIndex(cfg), out = [], swaps = [];
    var skuCol = skuField(cfg);
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      var cat = categoryOf(r, cfg);
      if (cat === 'services' || cat === 'assumptions') continue;
      var name = plain(r[IF.productName]) || connLabel(r, IF.product) || '(unnamed)';
      var removed = hasValue(r, IF.removedByCo);
      var recCat = cat === 'cam' ? 'cam' : (MOUNT_RE.test(connLabel(r, IF.bucket)) || (!connLabel(r, IF.bucket) && MOUNT_RE.test(name)) ? 'mount' : 'default');
      var co = cos[r.id] ? coFor(cos[r.id], recCat) : null;
      var kind = removed ? 'removed' : (PRE_RE.test(name) ? 'pre' : (CUST_RE.test(name) ? 'cust' : 'ship'));
      // What the CO lines say about this record (see the header):
      //   Remove line, record not flagged → removal pending (CO unsigned).
      //   Add line targeting it → a swap; applied once the record's product
      //   is the Add line's (signature updates it in place), else pending.
      var tag = '';
      if (removed) {
        tag = 'Removed';
      } else if (co && co.adds.length) {
        var add = co.adds[co.adds.length - 1], was = co.removes.length ? co.removes[0].name : '';
        var applied = sameProduct(add.name, name);
        tag = (applied ? 'Swapped in by ' : 'Swap pending · ') + add.co + (was && !sameProduct(was, name) ? ' · was ' + was : '');
        if (!applied && add.name) tag += ' → ' + add.name;
      } else if (co && co.removes.length) {
        tag = 'Removal pending · ' + co.removes[0].co + ' not signed';
      }
      var qty = num(r[IF.qty]) || 1;
      var s = sow[connId(r, IF.sowItem)] || null;
      var sku = '';
      if (skuCol) {
        var src = skuCol.view === cfg.installView ? r : s;
        sku = src ? (connLabel(src, skuCol.key) || plain(src[skuCol.key])) : '';
      }
      if (!sku) sku = plain(s && s[SF.sku]) || plain(r[SF.sku]);
      var it = {
        id: r.id, name: name, kind: kind, qty: qty, sku: sku,
        bucket: connLabel(r, IF.bucket) || 'Other',
        bucketOrder: hasValue(r, IF.sortOrder) ? num(r[IF.sortOrder]) : Infinity,
        parent: connId(r, IF.parent),
        loc: connLabel(r, IF.mdfIdf) || NO_LOC,
        co: removed ? ((co && co.removes.length && co.removes[0].co) || coFromFlag(r) || UNKNOWN_CO) : '',
        tag: tag,
        sow: s ? (connLabels(s, SF.sow).map(sowLabel).join(' + ') || NO_SOW) : NO_SOW,
        designator: plain(r[IF.displayLabel]),
        isCam: cat === 'cam',
        newDrop: false, existingDrop: false,
        special: SPECIAL_RE.test(name),
        retail: null, discount: null, net: null
      };
      if (!removed && it.isCam && hasValue(r, IF.existCabling)) {
        if (isYes(r[IF.existCabling])) it.existingDrop = true; else it.newDrop = true;
      }
      if (s) {
        it.retail   = hasValue(s, SF.retail)       ? num(s[SF.retail]) : null;
        it.discount = hasValue(s, SF.discountEach) ? num(s[SF.discountEach]) : null;
        it.net      = hasValue(s, SF.netUnit)      ? num(s[SF.netUnit]) : null;
        if (it.net == null && it.retail != null) it.net = it.retail - (it.discount || 0);
      }
      out.push(it);
      if (/^Swapped in/.test(tag)) swaps.push({ it: it, co: co, rec: r });
    }
    // Second pass — an applied swap's old unit (the pair's Remove line)
    // and any accessory the CO pulled with it are extra hardware: list
    // them with the removals so they get brought back. An accessory that
    // ALSO has its own install record flagged removed (signature flags the
    // ride-along mount as well as targeting it on the device's line) is
    // listed ONCE: its own row keeps the CO from the device's line, and
    // the line is not listed again.
    var removedByParent = {};
    for (var ri = 0; ri < out.length; ri++) {
      var rit = out[ri];
      if (rit.kind === 'removed' && rit.parent) (removedByParent[rit.parent] = removedByParent[rit.parent] || []).push(rit);
    }
    for (var si = 0; si < swaps.length; si++) {
      var sw = swaps[si], itx = sw.it, cox = sw.co;
      var olds = (cox.removes.length ? [cox.removes[0]] : []).concat(cox.accRemoves);
      for (var oi = 0; oi < olds.length; oi++) {
        var old = olds[oi];
        if (oi > 0) {
          var own = null, kids = removedByParent[itx.id] || [];
          for (var ki = 0; ki < kids.length; ki++) if (sameProduct(kids[ki].name, old.name)) { own = kids[ki]; break; }
          if (own) { if (own.co === UNKNOWN_CO) own.co = old.co; continue; }
        }
        var oldSku = '';
        if (skuCol && skuCol.view === cfg.sowView && old.rec) oldSku = connLabel(old.rec, skuCol.key) || plain(old.rec[skuCol.key]);
        out.push({
          id: itx.id + ':swapped-out:' + old.id, name: old.name || '(unnamed)', kind: 'swapped', qty: old.qty || itx.qty, sku: oldSku,
          bucket: oi === 0 ? itx.bucket : 'Mounting Hardware', bucketOrder: oi === 0 ? itx.bucketOrder : itx.bucketOrder + 0.5,
          loc: itx.loc, sow: itx.sow, co: old.co, designator: oi === 0 ? itx.designator : '', parent: '',
          tag: oi === 0 ? 'Swapped out · replaced by ' + itx.name : 'Swapped out · ' + old.co,
          isCam: false, newDrop: false, existingDrop: false, special: false, retail: null, discount: null, net: null
        });
      }
    }
    return out;
  }
  /** Merge items into rows by product (one row per product per group);
   *  groups keyed by `by` (bucket | loc), in order of first appearance. */
  function groupRows(list, by) {
    var groups = [], byKey = {};
    for (var i = 0; i < list.length; i++) {
      var it = list[i], gk = it[by];
      var g = byKey[gk];
      if (!g) { g = byKey[gk] = { label: gk, rows: [], byProduct: {}, qty: 0, retail: 0, discount: 0, net: 0, priced: false, bucketOrder: Infinity }; groups.push(g); }
      var rk = it.name + '|' + it.sku + '|' + (it.tag || '');
      var row = g.byProduct[rk];
      if (!row) {
        row = g.byProduct[rk] = { name: it.name, sku: it.sku, kind: it.kind, tag: it.tag || '', qty: 0, designators: [], locs: {}, newDrops: 0,
                                  bucket: it.bucket, bucketOrder: it.bucketOrder, seq: g.rows.length,
                                  special: it.special, retail: 0, discount: 0, net: 0, priced: false };
        g.rows.push(row);
      }
      if (it.bucketOrder < row.bucketOrder) row.bucketOrder = it.bucketOrder;
      if (it.bucketOrder < g.bucketOrder) g.bucketOrder = it.bucketOrder;
      row.qty += it.qty;
      if (it.designator) row.designators.push(it.designator);
      row.locs[it.loc] = (row.locs[it.loc] || 0) + it.qty;
      if (it.newDrop) row.newDrops += 1;
      if (it.retail != null || it.net != null) {
        row.priced = true; g.priced = true;
        row.retail   += (it.retail   || 0) * it.qty;
        row.discount += (it.discount || 0) * it.qty;
        row.net      += (it.net      || 0) * it.qty;
      }
      g.qty += it.qty;
    }
    for (var gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi];
      for (var ri = 0; ri < grp.rows.length; ri++) {
        grp.retail += grp.rows[ri].retail; grp.discount += grp.rows[ri].discount; grp.net += grp.rows[ri].net;
      }
    }
    // Rows inside every group follow the proposal's bucket order (the
    // line's field_2218, the order the SOW and proposal already use), then
    // the name — so a location or a SOW reads cameras, then mounts, then
    // headend, the way the paperwork does.
    for (var gi0 = 0; gi0 < groups.length; gi0++) {
      groups[gi0].rows.sort(function (a, b) {
        var ao = isFinite(a.bucketOrder) ? a.bucketOrder : Infinity, bo = isFinite(b.bucketOrder) ? b.bucketOrder : Infinity;
        if (ao !== bo) return ao - bo;
        return a.seq - b.seq;   // same bucket (or no order known): the worksheet's own order
      });
    }
    // Groups by bucket: the proposal's bucket order too (cameras / readers
    // first when the order is unknown). By location / SOW: alphabetical
    // (numbers in order), the group with nothing to group by last, so the
    // assigned rows read top to bottom.
    if (by === 'bucket') groups.sort(function (a, b) {
      var ao = isFinite(a.bucketOrder) ? a.bucketOrder : Infinity, bo = isFinite(b.bucketOrder) ? b.bucketOrder : Infinity;
      if (ao !== bo) return ao - bo;
      var ac = /camera|reader/i.test(a.label) ? 0 : 1, bc = /camera|reader/i.test(b.label) ? 0 : 1;
      return ac - bc;
    });
    else groups.sort(function (a, b) {
      var an = isNoneGroup(a.label) ? 1 : 0, bn = isNoneGroup(b.label) ? 1 : 0;
      if (an !== bn) return an - bn;
      return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' });
    });
    for (var ni = 0; ni < groups.length; ni++) {
      groups[ni].none = isNoneGroup(groups[ni].label);
      // Cameras / readers get a subtotal (the drop count is what a PM checks);
      // it adds nothing on mounts or headend gear.
      groups[ni].subtotal = by === 'bucket' && /camera|reader/i.test(groups[ni].label);
    }
    return groups;
  }
  function isNoneGroup(label) {
    return label === NO_LOC || label === NO_SOW || /^\s*(unassigned|none|no\s+(mdf|idf|location|sow))\b/i.test(label);
  }
  function model(cfg, mode) {
    var all = items(cfg);
    var ship = [], noShip = [], removed = [], newDrops = 0, existing = 0;
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      if (it.newDrop) newDrops++;
      if (it.existingDrop) existing++;
      (it.kind === 'removed' || it.kind === 'swapped' ? removed : (it.kind === 'ship' ? ship : noShip)).push(it);
    }
    var by = mode === 'loc' ? 'loc' : (mode === 'sow' ? 'sow' : 'bucket');
    return {
      count: all.length, newDrops: newDrops, existing: existing,
      ship: groupRows(ship, by),
      noShip: groupRows(noShip, 'bucket'),
      removed: groupRows(removed, 'co'),
      shipQty: ship.reduce(function (n, it) { return n + it.qty; }, 0),
      shipRetail: ship.reduce(function (n, it) { return n + (it.retail || 0) * it.qty; }, 0),
      shipDiscount: ship.reduce(function (n, it) { return n + (it.discount || 0) * it.qty; }, 0),
      shipNet: ship.reduce(function (n, it) { return n + (it.net || 0) * it.qty; }, 0),
      anyPriced: ship.some(function (it) { return it.retail != null || it.net != null; })
    };
  }

  // ── Render ─────────────────────────────────────────────────────────
  /** Which columns have data on at least one row (a column with nothing in
   *  it is left out entirely). `pricing` false = never money columns. */
  function columnsFor(groups, pricing) {
    var c = { sku: false, retail: false, discount: false, net: false };
    for (var g = 0; g < groups.length; g++) {
      for (var r = 0; r < groups[g].rows.length; r++) {
        var row = groups[g].rows[r];
        if (row.sku) c.sku = true;
        if (pricing && row.priced) {
          if (row.retail) c.retail = true;
          if (row.discount) c.discount = true;
          if (row.net || row.retail) c.net = true;
        }
      }
    }
    return c;
  }
  function rowHtml(row, cols, showLoc) {
    var desig = row.designators.length ? ' <span class="scw-bom__desig">· ' + esc(compactList(row.designators)) + '</span>' : '';
    var locs = Object.keys(row.locs);
    var where = showLoc && locs.length ? ' <span class="scw-bom__desig">· ' +
      esc(locs.map(function (l) { return l + (locs.length > 1 ? ' ' + row.locs[l] : ''); }).join(' · ')) + '</span>' : '';
    var chips = '';
    if (row.newDrops) chips += ' <span class="scw-bom__chip scw-bom__chip--drops">' + row.newDrops + ' new drop' + (row.newDrops === 1 ? '' : 's') + '</span>';
    if (row.special) chips += ' <span class="scw-bom__chip scw-bom__chip--special">Special order</span>';
    if (row.kind === 'pre') chips += ' <span class="scw-bom__chip scw-bom__chip--pre">Pre-existing</span>';
    if (row.kind === 'cust') chips += ' <span class="scw-bom__chip scw-bom__chip--cust">Customer-supplied</span>';
    if (row.kind === 'removed') chips += ' <span class="scw-bom__chip scw-bom__chip--removed">Removed</span>';
    else if (/^Swap/.test(row.tag)) chips += ' <span class="scw-bom__chip scw-bom__chip--swap">' + esc(row.tag) + '</span>';
    else if (row.tag) chips += ' <span class="scw-bom__chip scw-bom__chip--pending">' + esc(row.tag) + '</span>';
    var html = '<tr>' +
      '<td><span class="scw-bom__name">' + esc(row.name) + '</span>' + desig + where + chips + '</td>';
    if (cols.sku) html += '<td class="scw-bom__sku">' + (row.sku ? esc(row.sku) : '<span class="scw-bom__muted">—</span>') + '</td>';
    html += '<td class="num scw-bom__qty">' + row.qty + '</td>';
    if (cols.retail)   html += '<td class="num scw-bom__muted">' + (row.priced && row.retail ? money(row.retail) : '—') + '</td>';
    if (cols.discount) html += '<td class="num scw-bom__muted">' + (row.priced && row.discount ? '−' + money(row.discount).replace('−', '') : '—') + '</td>';
    if (cols.net)      html += '<td class="num">' + (row.priced ? money(row.net) : '—') + '</td>';
    return html + '</tr>';
  }
  /** "I-001, I-002, I-003" → "I-001 to I-003" when the run is unbroken. */
  function compactList(labels) {
    var ls = labels.slice().sort();
    if (ls.length <= 2) return ls.join(', ');
    var m0 = ls[0].match(/^(.*?)(\d+)$/), m1 = ls[ls.length - 1].match(/^(.*?)(\d+)$/);
    if (m0 && m1 && m0[1] === m1[1] && parseInt(m1[2], 10) - parseInt(m0[2], 10) === ls.length - 1) return ls[0] + ' to ' + ls[ls.length - 1];
    return ls.length > 6 ? ls.slice(0, 5).join(', ') + ' +' + (ls.length - 5) : ls.join(', ');
  }
  function headRow(cols) {
    return '<tr><th>Product</th>' + (cols.sku ? '<th>SKU</th>' : '') + '<th class="num">Qty</th>' +
      (cols.retail ? '<th class="num">Retail</th>' : '') +
      (cols.discount ? '<th class="num">Discount</th>' : '') +
      (cols.net ? '<th class="num">After discount</th>' : '') + '</tr>';
  }
  function tableHtml(groups, pricing, showLoc, total, subHeads) {
    var cols = columnsFor(groups, pricing);
    var ncols = 2 + (cols.sku ? 1 : 0) + (cols.retail ? 1 : 0) + (cols.discount ? 1 : 0) + (cols.net ? 1 : 0);
    var html = '<table class="scw-bom__table"><thead>' + headRow(cols) + '</thead><tbody>';
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      if (grp.label !== UNKNOWN_CO) html += '<tr class="scw-bom__group' + (grp.none ? ' scw-bom__group--none' : '') + '"><td colspan="' + ncols + '">' + esc(grp.label) + '</td></tr>';
      var lastBucket = null;
      for (var r = 0; r < grp.rows.length; r++) {
        if (subHeads && grp.rows[r].bucket !== lastBucket) {
          lastBucket = grp.rows[r].bucket;
          html += '<tr class="scw-bom__sub"><td colspan="' + ncols + '">' + esc(lastBucket) + '</td></tr>';
        }
        html += rowHtml(grp.rows[r], cols, showLoc);
      }
      if (grp.subtotal) {
        html += '<tr class="scw-bom__subtotal"><td>' + esc(grp.label) + ' subtotal</td>' + (cols.sku ? '<td></td>' : '') +
          '<td class="num">' + grp.qty + '</td>' +
          (cols.retail   ? '<td class="num">' + (grp.priced ? money(grp.retail) : '—') + '</td>' : '') +
          (cols.discount ? '<td class="num">' + (grp.priced && grp.discount ? '−' + money(grp.discount).replace('−', '') : '—') + '</td>' : '') +
          (cols.net      ? '<td class="num">' + (grp.priced ? money(grp.net) : '—') + '</td>' : '') + '</tr>';
      }
    }
    if (total) {
      html += '<tr class="scw-bom__total"><td>' + esc(total.label) + '</td>' + (cols.sku ? '<td></td>' : '') +
        '<td class="num">' + total.qty + '</td>' +
        (cols.retail   ? '<td class="num">' + money(total.retail) + '</td>' : '') +
        (cols.discount ? '<td class="num">' + (total.discount ? '−' + money(total.discount).replace('−', '') : '—') + '</td>' : '') +
        (cols.net      ? '<td class="num">' + money(total.net) + '</td>' : '') + '</tr>';
    }
    return html + '</tbody></table>';
  }
  function paint(el, cfg, mode) {
    var m = model(cfg, mode), pricing = !!cfg.pricing;
    el.setAttribute('data-scw-bom-mode', mode);
    var html =
      '<div class="scw-bom__head">' +
        '<span class="scw-bom__drops"><b>' + m.newDrops + '</b> new drop' + (m.newDrops === 1 ? '' : 's') +
          ' · <b>' + m.existing + '</b> on existing cable</span>' +
        '<span class="scw-bom__spring"></span>' +
        '<span class="scw-bom__toggle">' +
          '<button type="button" data-scw-bom-set="bucket"' + (mode !== 'loc' ? ' class="is-on"' : '') + '>By category</button>' +
          '<button type="button" data-scw-bom-set="loc"' + (mode === 'loc' ? ' class="is-on"' : '') + '>By MDF / IDF</button>' +
          '<button type="button" data-scw-bom-set="sow"' + (mode === 'sow' ? ' class="is-on"' : '') + '>By SOW</button>' +
        '</span>' +
      '</div>';
    if (!m.count) {
      html += '<div class="scw-bom__empty">No install line items loaded yet.</div>';
    } else {
      html += '<div class="scw-bom__section"><span class="scw-bom__section-title">Shipping</span>' +
              '<span class="scw-bom__section-sub">what goes in the SCW box</span></div>';
      html += m.ship.length
        ? tableHtml(m.ship, pricing, false,
            { label: 'Shipping total', qty: m.shipQty, retail: m.shipRetail, discount: m.shipDiscount, net: m.shipNet, priced: m.anyPriced },
            mode === 'loc' || mode === 'sow')
        : '<div class="scw-bom__empty">Nothing to ship.</div>';
      if (m.noShip.length) {
        html += '<div class="scw-bom__noship">' +
          '<div class="scw-bom__section"><span class="scw-bom__section-title">Not shipping</span>' +
          '<span class="scw-bom__section-sub">on the SOW, not in the box · ' +
          '<span class="scw-bom__why">Pre-existing: on site, we connect to it. Customer-supplied: they provide it, we install it.</span></span></div>' +
          tableHtml(m.noShip, false, false, null) +
        '</div>';
      }
      if (m.removed.length) {
        html += '<div class="scw-bom__noship scw-bom__removed">' +
          '<div class="scw-bom__section"><span class="scw-bom__section-title">Removed or swapped out by change order</span>' +
          '<span class="scw-bom__section-sub">out of scope · not shipping, not counted · ' +
          '<span class="scw-bom__why">if it already shipped, it is extra hardware on site — bring it back</span></span></div>' +
          tableHtml(m.removed, false, false, null) +
        '</div>';
      }
    }
    el.innerHTML = html;
  }
  /** The tray element. Regrouping repaints THIS element (see the header:
   *  the drawer tags it, so it must stay the one the drawer knows). */
  function render(cfg, mode) {
    var el = document.createElement('div');
    el.className = 'scw-bom';
    paint(el, cfg, mode);
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-scw-bom-set]');
      if (!b) return;
      var next = b.getAttribute('data-scw-bom-set');
      _mode = next;
      try { window.localStorage.setItem('scw:bom:mode', next); } catch (err) { /* optional */ }
      paint(el, cfg, next);
    });
    return el;
  }
  var MODES = { bucket: 1, loc: 1, sow: 1 };
  var _mode = 'bucket';
  try { var saved = window.localStorage.getItem('scw:bom:mode'); if (MODES[saved]) _mode = saved; } catch (e) { /* default */ }

  function open(cfg) {
    var api = window.SCW && SCW.deployNav;
    if (!api || typeof api.openPanel !== 'function') return false;
    // One tray at a time: anything an earlier open left in the page goes.
    var stale = document.querySelectorAll('.scw-bom');
    for (var i = 0; i < stale.length; i++) if (stale[i].parentNode) stale[i].parentNode.removeChild(stale[i]);
    return api.openPanel({
      eyebrow: '3 · Installation',
      title: 'Bill of materials',
      sub: cfg.pricing ? 'What ships in the SCW box, with pricing from the SOW' : 'What ships in the SCW box',
      el: render(cfg, _mode)
    });
  }

  // ── Summary takedown ───────────────────────────────────────────────
  // The entry point is the "Bill of materials" row deploy-page-nav.js puts
  // first in "Also on this project" (it calls SCW.bomTray.open). Here: a
  // saved "Summary only" worksheet mode would now show an empty worksheet,
  // so bounce it back to the default.
  function takedown(cfg) {
    var mount = document.getElementById(cfg.mount);
    if (!mount) return;
    if (mount.classList.contains('scw-ws-v2-mode-summary')) {
      var other = mount.querySelector('.scw-ws-v2-toolbar-btn[data-scw-ws-v2-mode]:not([data-scw-ws-v2-mode="summary"])');
      if (other) other.click();
    }
  }
  var _timer = null;
  function schedule(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var cfg = activeScene();
      if (!cfg) return;
      injectStyles();
      try { takedown(cfg); } catch (e) { /* worksheet not up yet */ }
    }, delay == null ? 150 : delay);
  }
  // Styles at load: the old summary panels + "Summary only" button are
  // hidden before worksheet-v2 renders them, not a timer later.
  injectStyles();
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { schedule(300); });
    $(document).on('knack-view-render.' + SCENES[s].installView + EVENT_NS, function () { schedule(200); });
  }
  $(document).on('knack-view-render.any' + EVENT_NS, function () { if (activeScene()) schedule(200); });
  setInterval(function () { if (activeScene()) schedule(0); }, 5000);

  window.SCW = window.SCW || {};
  window.SCW.bomTray = { open: function () { var c = activeScene(); return c ? open(c) : false; }, model: model, items: items };
})();
/*** END BILL OF MATERIALS TRAY *********************************************/
