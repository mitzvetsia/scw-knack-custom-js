/////*********** CO ADD/REMOVE BAND MOCKUPS (proposal preview) ***************//////
/**
 * MOCKUP feature — two live layout variants for presenting a Change Order
 * on the proposal preview grid (scene_1096), switchable via a floating
 * pill so both can be evaluated on the real page:
 *
 *   V1 — bands per MDF/IDF: inside each L1 (MDF/IDF) section, all added
 *        items regroup under a green "ITEMS TO BE ADDED" band and all
 *        removed items under a red "ITEMS TO BE REMOVED" band. L2
 *        subsection headers (Cameras, Networking & Headend, …) are kept
 *        inside each band (cloned when a subsection has both).
 *
 *   V2 — bands per subsection: inside each L2 subsection, its items
 *        split into the same green/red bands (structure otherwise
 *        unchanged).
 *
 * "Current" restores the shipped presentation (in-place tint + credit
 * banners). The choice persists in localStorage.
 *
 * Implementation notes:
 *   - Runs AFTER proposal-grid's pipeline (bundle order + delayed
 *     re-apply). Rows are only ever MOVED WITHIN their L1 section /
 *     L2 block, so proposal-grid's manifest scrape (which walks
 *     previousElementSibling up to the enclosing L1/L3 header) keeps
 *     resolving correctly.
 *   - Row action comes from the classes proposal-grid already stamps
 *     (scw-co-add-row / scw-co-rm-row from field_2965).
 *   - The original tbody order is snapshotted before the first move so
 *     "Current" restores it exactly; a Knack re-render replaces the
 *     tbody children, which invalidates (and garbage-collects) the
 *     snapshot naturally.
 *   - ⚠ While a band variant is active, the DOM the publish pipeline
 *     scrapes includes the band rows — flip back to "Current" before
 *     issuing a CO for real. (Mockup-only caveat; if a variant wins it
 *     gets folded into proposal-grid + the publish renderer properly.)
 */
(function () {
  'use strict';

  var VIEWS = ['view_3301', 'view_3341', 'view_3371'];
  var STORE_KEY = 'scwCoBandMockupMode';   // 'off' | 'v1' | 'v2'
  var STYLE_ID  = 'scw-co-band-mockup-css';
  var TOGGLE_ID = 'scw-co-band-mockup-toggle';
  var EVENT_NS  = '.scwCoBandMock';

  var BAND_CLS  = 'scw-co-band';
  var CLONE_CLS = 'scw-co-band-clone';

  // Mockup feature — keep loud console diagnostics so "toggle shows but
  // nothing happens" is debuggable from the user's console.
  function log() {
    try {
      var a = ['[scw-co-band]'];
      for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
      console.info.apply(console, a);
    } catch (e) { /* ignore */ }
  }

  function getMode() {
    try { return window.localStorage.getItem(STORE_KEY) || 'off'; }
    catch (e) { return 'off'; }
  }
  function setMode(m) {
    try { window.localStorage.setItem(STORE_KEY, m); } catch (e) { /* ignore */ }
  }

  // Removed-side color scheme: classic red or lavender — its own live
  // sub-toggle on the pill so both can be compared on the real page.
  var COLOR_KEY = 'scwCoBandRmColor';   // 'red' | 'lav'
  function getRmColor() {
    try { return window.localStorage.getItem(COLOR_KEY) || 'red'; }
    catch (e) { return 'red'; }
  }
  function setRmColor(c) {
    try { window.localStorage.setItem(COLOR_KEY, c); } catch (e) { /* ignore */ }
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      'tr.' + BAND_CLS + ' td {',
      '  font: 700 13px/1.2 system-ui, sans-serif;',
      '  text-transform: uppercase; letter-spacing: 0.06em;',
      '  padding: 9px 12px !important;',
      '}',
      'tr.' + BAND_CLS + '--add td {',
      '  background: #ecfdf5 !important; color: #065f46 !important;',
      '  box-shadow: inset 4px 0 0 #059669;',
      '  border-top: 2px solid #059669 !important;',
      '}',
      'tr.' + BAND_CLS + '--rm td {',
      '  background: #fff1f2 !important; color: #9f1239 !important;',
      // 26px of breathing room above the Removed band, then an echo of the
      // navy L1 divider bar (inset top stripe) so the two bands read as
      // clearly separated sections — plus the red left accent.
      '  border-top: 26px solid #fff !important;',
      '  box-shadow: inset 4px 0 0 #e11d48, inset 0 6px 0 #07467c;',
      '  padding-top: 15px !important;',
      '}',
      // Band modes replace the per-block "Removed from install scope"
      // banners — the red band already says it once per group.
      '.scw-co-band-mode tr.scw-co-rm-banner { display: none !important; }',
      // Add = green / Remove = red parallel: every row placed INSIDE a band
      // is stamped scw-co-band-tint-add/-rm on apply, so the whole section
      // carries the tint (L3 product headers, L4 descriptions, mounting
      // lines — not just the data rows proposal-grid already tints).
      // Subsection (L2) headers keep their own look for orientation.
      '.scw-co-band-mode tr.scw-co-band-tint-add td { background: #f0fdf4 !important; }',
      '.scw-co-band-mode tr.scw-co-band-tint-add td:first-child { box-shadow: inset 4px 0 0 #059669; }',
      '.scw-co-band-mode tr.scw-co-band-tint-rm td { background: #fff1f2 !important; }',
      '.scw-co-band-mode tr.scw-co-band-tint-rm td:first-child { box-shadow: inset 4px 0 0 #e11d48; }',
      // Lavender variant for the removed side (scw-co-band-lav on the view
      // root). Extra ancestor class outscores proposal-grid's red rules.
      '.scw-co-band-lav tr.' + BAND_CLS + '--rm td {',
      '  background: #f5f3ff !important; color: #6d28d9 !important;',
      '  box-shadow: inset 4px 0 0 #8b5cf6, inset 0 6px 0 #07467c;',
      '}',
      '.scw-co-band-lav tr.scw-co-band-tint-rm td { background: #f5f3ff !important; }',
      '.scw-co-band-lav tr.scw-co-band-tint-rm td:first-child { box-shadow: inset 4px 0 0 #8b5cf6; }',
      '.scw-co-band-lav tr.scw-co-rm-row td { background: #f5f3ff !important; }',
      '.scw-co-band-lav tr.scw-co-rm-row td:first-child { box-shadow: inset 4px 0 0 #8b5cf6; }',
      '.scw-co-band-lav tr.kn-table-group.scw-co-rm-row td { background: #ede9fe !important; }',
      // Band subtotal rows — one at the end of each Added / Removed band,
      // amount aligned to the grid's Cost column.
      'tr.scw-co-band-sub td {',
      '  font: 700 12.5px system-ui, sans-serif; padding: 7px 12px !important;',
      '}',
      'tr.scw-co-band-sub .scw-co-band-sub-label { text-align: right; letter-spacing: 0.03em; }',
      'tr.scw-co-band-sub .scw-co-band-sub-amt { text-align: center; white-space: nowrap; }',
      'tr.scw-co-band-sub--add td {',
      '  background: #dcfce7 !important; color: #065f46 !important;',
      '  border-top: 2px solid #059669 !important;',
      '}',
      'tr.scw-co-band-sub--rm td {',
      '  background: #ffe4e6 !important; color: #9f1239 !important;',
      '  border-top: 2px solid #e11d48 !important;',
      '}',
      '.scw-co-band-lav tr.scw-co-band-sub--rm td {',
      '  background: #ede9fe !important; color: #5b21b6 !important;',
      '  border-top: 2px solid #8b5cf6 !important;',
      '}',

      // Floating switcher
      '#' + TOGGLE_ID + ' {',
      '  position: fixed; right: 18px; bottom: 18px; z-index: 99990;',
      '  background: #0f172a; color: #e2e8f0;',
      '  border-radius: 10px; box-shadow: 0 8px 26px rgba(0,0,0,0.35);',
      '  padding: 8px 10px; font: 12px/1.3 system-ui, sans-serif;',
      '  display: flex; align-items: center; gap: 6px;',
      '}',
      '#' + TOGGLE_ID + ' .scw-cbm-lbl {',
      '  font-weight: 700; letter-spacing: 0.04em; margin-right: 2px;',
      '  color: #94a3b8; text-transform: uppercase; font-size: 10px;',
      '}',
      '#' + TOGGLE_ID + ' button {',
      '  appearance: none; border: 1px solid #334155; background: #1e293b;',
      '  color: #cbd5e1; border-radius: 6px; padding: 5px 9px;',
      '  font: 600 11.5px system-ui, sans-serif; cursor: pointer;',
      '  white-space: nowrap;',
      '}',
      '#' + TOGGLE_ID + ' button:hover { border-color: #64748b; }',
      '#' + TOGGLE_ID + ' button.is-active {',
      '  background: #0369a1; border-color: #38bdf8; color: #fff;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── DOM helpers ──────────────────────────────────────────────────
  function groupLevel(tr) {
    if (!tr.classList || !tr.classList.contains('kn-table-group')) return 0;
    var m = tr.className.match(/kn-group-level-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  // Section head = a real L1, or an L2 promoted to L1 (single-MDF grids).
  function isSectionHead(tr) {
    var l = groupLevel(tr);
    return l === 1 || (l === 2 && tr.classList.contains('scw-promoted-l2-as-l1'));
  }
  function isL2Head(tr) {
    return groupLevel(tr) === 2 && !tr.classList.contains('scw-promoted-l2-as-l1');
  }
  function isTotalsRow(tr) {
    return tr.classList && (tr.classList.contains('scw-level-total-row') ||
      tr.classList.contains('scw-co-rm-banner'));
  }
  function rowAction(tr) {
    if (!tr.classList) return '';
    if (tr.classList.contains('scw-co-rm-row'))  return 'rm';
    if (tr.classList.contains('scw-co-add-row')) return 'add';
    return '';
  }

  function bandRow(kind, label, colCount) {
    var tr = document.createElement('tr');
    tr.className = BAND_CLS + ' ' + BAND_CLS + '--' + kind;
    var td = document.createElement('td');
    td.colSpan = colCount;
    td.textContent = label;
    tr.appendChild(td);
    return tr;
  }

  // ── Band subtotals ────────────────────────────────────────────────
  // Money comes from the Backbone model (field_2203 = line item total,
  // the same figure the grid's Cost column and L2 subtotals use) keyed
  // by record id — so display-only rows (mounting product lines) and
  // hidden raw accessory rows can never double-count.
  var HEX24 = /^[0-9a-f]{24}$/i;
  function costMapFor(viewId) {
    var map = Object.create(null);
    try {
      var v = window.Knack && Knack.views && Knack.views[viewId];
      var ms = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i] && ms[i].attributes;
        if (!a || !a.id) continue;
        var n = (typeof a.field_2203_raw === 'number') ? a.field_2203_raw
          : parseFloat(String(a.field_2203 || '').replace(/[^0-9.\-]/g, ''));
        map[a.id] = isFinite(n) ? n : 0;
      }
    } catch (e) { /* empty map → subtotal renders $0.00, still visible */ }
    return map;
  }
  function unitCost(u, costMap) {
    var sum = 0, nodes = unitNodes(u);
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].id;
      if (id && HEX24.test(id) && costMap[id] != null) sum += costMap[id];
    }
    return sum;
  }
  function bandMoney(n) {
    return '$' + (n < 0 ? '-' : '') +
      Math.abs(n || 0).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Subtotal row aligned to the grid's Cost column (th.field_2203).
  function bandSubRow(kind, label, amount, tbody) {
    var ths = tbody.closest('table').querySelectorAll('thead th');
    var idx = ths.length - 1;
    for (var i = 0; i < ths.length; i++) {
      if (ths[i].classList.contains('field_2203')) { idx = i; break; }
    }
    var tr = document.createElement('tr');
    tr.className = 'scw-co-band-sub scw-co-band-sub--' + kind;
    var lbl = document.createElement('td');
    lbl.colSpan = Math.max(idx, 1);
    lbl.className = 'scw-co-band-sub-label';
    lbl.textContent = label;
    tr.appendChild(lbl);
    var amt = document.createElement('td');
    amt.className = 'scw-co-band-sub-amt';
    amt.textContent = bandMoney(amount);
    tr.appendChild(amt);
    var rest = ths.length - idx - 1;
    if (rest > 0) {
      var pad = document.createElement('td');
      pad.colSpan = rest;
      tr.appendChild(pad);
    }
    return tr;
  }

  /**
   * Parse the tbody into sections → L2 blocks → units.
   * A unit = an L3 header (nullable for stray rows) + every row beneath it
   * until the next header of level ≤ 3 / totals row / section end. L4
   * headers and relocated accessory rows ride inside their unit.
   */
  function parseTbody(tbody) {
    var rows = Array.prototype.slice.call(tbody.children);
    var sections = [];
    var section = null, block = null, unit = null;

    function closeUnit()  { if (unit && block) block.units.push(unit); unit = null; }
    function closeBlock() { closeUnit(); if (block && section) section.blocks.push(block); block = null; }
    function closeSection() { closeBlock(); if (section) sections.push(section); section = null; }

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList && (tr.classList.contains(BAND_CLS) ||
          tr.classList.contains(CLONE_CLS))) continue;   // prior injections — cleaned by caller
      if (isSectionHead(tr)) {
        closeSection();
        section = { header: tr, blocks: [], tail: [] };
        block = { header: null, units: [] };
        continue;
      }
      if (!section) continue;   // rows before the first section (unlikely)
      if (isL2Head(tr)) {
        closeBlock();
        block = { header: tr, units: [] };
        continue;
      }
      if (isTotalsRow(tr)) {
        closeUnit();
        // An L2 (subsection) subtotal belongs to its block — V1 re-seats it
        // after the block's last band chunk so it doesn't strand at the
        // bottom of the section, detached from its subsection.
        if (block && tr.classList.contains('scw-subtotal--level-2')) {
          (block.subtotals = block.subtotals || []).push(tr);
        } else {
          // L1 subtotal/discount/total rows (and credit banners) — leave in
          // place; they always trail the section they summarize.
          section.tail.push(tr);
        }
        continue;
      }
      if (groupLevel(tr) === 3) {
        closeUnit();
        unit = { header: tr, rows: [] };
        continue;
      }
      // level-4 headers, data rows, anything else → current unit
      if (!unit) unit = { header: null, rows: [] };
      unit.rows.push(tr);
    }
    closeSection();
    return sections;
  }

  function unitAction(u) {
    var add = false, rm = false;
    for (var i = 0; i < u.rows.length; i++) {
      var a = rowAction(u.rows[i]);
      if (a === 'rm') rm = true;
      else if (a === 'add') add = true;
    }
    if (rm && !add) return 'rm';
    // mixed / none sink into the add band — on a real CO every row
    // carries an action, so this is just the fail-safe.
    return 'add';
  }

  function unitNodes(u) {
    var out = [];
    if (u.header) out.push(u.header);
    return out.concat(u.rows);
  }

  // Stamp every row of a unit with the band tint (green for adds, red for
  // removes) so the whole section carries the color, not just the data rows.
  function stampUnit(u, kind) {
    var nodes = unitNodes(u);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('scw-co-band-tint-' + kind);
    }
    return nodes;
  }

  function colCountFor(tbody) {
    var table = tbody.closest('table');
    return (table && table.querySelectorAll('thead th').length) || 12;
  }

  // Remove every injected band header / cloned L2 header from the tbody,
  // and strip the band tint classes off the (persistent) grid rows.
  function cleanInjected(tbody) {
    Array.prototype.slice.call(
      tbody.querySelectorAll(
        'tr.' + BAND_CLS + ', tr.' + CLONE_CLS + ', tr.scw-co-band-sub')
    ).forEach(function (tr) { tr.remove(); });
    Array.prototype.slice.call(
      tbody.querySelectorAll('tr.scw-co-band-tint-add, tr.scw-co-band-tint-rm')
    ).forEach(function (tr) {
      tr.classList.remove('scw-co-band-tint-add');
      tr.classList.remove('scw-co-band-tint-rm');
    });
  }

  function snapshotOrder(tbody) {
    if (!tbody.__scwCoOrig) {
      tbody.__scwCoOrig = Array.prototype.slice.call(tbody.children);
    }
  }
  function restoreOrder(tbody) {
    var snap = tbody.__scwCoOrig;
    if (!snap) return;
    for (var i = 0; i < snap.length; i++) {
      if (snap[i]) tbody.appendChild(snap[i]);
    }
  }

  function insertAfter(refNode, node) {
    refNode.parentNode.insertBefore(node, refNode.nextSibling);
  }

  // ── The two variants ─────────────────────────────────────────────
  // V1: per L1 section — ADD band (subsection headers kept inside),
  //     then REMOVE band. An L2 with both sides keeps its original
  //     header in the add band and gets a visual clone in the remove band.
  function applyV1(tbody, costMap) {
    var cols = colCountFor(tbody);
    parseTbody(tbody).forEach(function (section) {
      var frag = document.createDocumentFragment();
      var addSeq = [], rmSeq = [];
      var addSum = 0, rmSum = 0;
      section.blocks.forEach(function (blk) {
        var adds = blk.units.filter(function (u) { return unitAction(u) === 'add'; });
        var rms  = blk.units.filter(function (u) { return unitAction(u) === 'rm'; });
        if (adds.length && blk.header) addSeq.push(blk.header);
        adds.forEach(function (u) {
          addSum += unitCost(u, costMap);
          addSeq.push.apply(addSeq, stampUnit(u, 'add'));
        });
        if (rms.length && blk.header) {
          if (adds.length) {
            var clone = blk.header.cloneNode(true);
            clone.classList.add(CLONE_CLS);
            rmSeq.push(clone);
          } else {
            rmSeq.push(blk.header);
          }
        }
        rms.forEach(function (u) {
          rmSum += unitCost(u, costMap);
          rmSeq.push.apply(rmSeq, stampUnit(u, 'rm'));
        });
        // Re-seat the subsection's subtotal after its LAST band chunk (its
        // removes when it has any, else its adds) so it stays visually
        // attached to its subsection instead of stranding at section end.
        var subs = blk.subtotals || [];
        if (subs.length) {
          var dest = rms.length ? rmSeq : (adds.length ? addSeq : null);
          if (dest) subs.forEach(function (t) { dest.push(t); });
          // no units in this block → leave the subtotal where it stands
        }
      });
      if (addSeq.length) {
        frag.appendChild(bandRow('add', 'Items to be Added', cols));
        addSeq.forEach(function (n) { frag.appendChild(n); });
        frag.appendChild(bandSubRow('add', 'Items to be Added — subtotal', addSum, tbody));
      }
      if (rmSeq.length) {
        frag.appendChild(bandRow('rm', 'Items to be Removed', cols));
        rmSeq.forEach(function (n) { frag.appendChild(n); });
        frag.appendChild(bandSubRow('rm', 'Items to be Removed — subtotal', rmSum, tbody));
      }
      insertAfter(section.header, frag);
    });
  }

  // V2: per L2 subsection — its units split into the two bands beneath
  //     the (untouched) subsection header.
  function applyV2(tbody, costMap) {
    var cols = colCountFor(tbody);
    parseTbody(tbody).forEach(function (section) {
      section.blocks.forEach(function (blk) {
        var adds = blk.units.filter(function (u) { return unitAction(u) === 'add'; });
        var rms  = blk.units.filter(function (u) { return unitAction(u) === 'rm'; });
        if (!adds.length && !rms.length) return;
        var frag = document.createDocumentFragment();
        if (adds.length) {
          var addSum = 0;
          frag.appendChild(bandRow('add', 'Items to be Added', cols));
          adds.forEach(function (u) {
            addSum += unitCost(u, costMap);
            stampUnit(u, 'add').forEach(function (n) { frag.appendChild(n); });
          });
          frag.appendChild(bandSubRow('add', 'Items to be Added — subtotal', addSum, tbody));
        }
        if (rms.length) {
          var rmSum = 0;
          frag.appendChild(bandRow('rm', 'Items to be Removed', cols));
          rms.forEach(function (u) {
            rmSum += unitCost(u, costMap);
            stampUnit(u, 'rm').forEach(function (n) { frag.appendChild(n); });
          });
          frag.appendChild(bandSubRow('rm', 'Items to be Removed — subtotal', rmSum, tbody));
        }
        insertAfter(blk.header || section.header, frag);
      });
    });
  }

  // The GRID's tbody — never the What's-Changing manifest's. The view root
  // itself carries the `kn-table` class, so a loose `.kn-table tbody` lookup
  // matches the FIRST tbody under the root — which on a CO page is the
  // #scw-co-change-summary manifest's own <table> (it sits above the grid
  // inside .kn-table-wrapper). That made applyMode band an invisible no-op:
  // the manifest tbody has no scw-co-add/rm rows, so hasCo read false and it
  // returned silently. Target Knack's real grid table (`kn-table-table`).
  function gridTbody(root) {
    return root.querySelector('table.kn-table-table tbody') ||
           root.querySelector('.kn-table-wrapper > table tbody');
  }

  function applyMode(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return;
    var tbody = gridTbody(root);
    if (!tbody) return;

    // Only meaningful on a CO grid (proposal-grid stamps action classes).
    var hasCo = !!tbody.querySelector('tr.scw-co-add-row, tr.scw-co-rm-row');
    var mode = getMode();

    cleanInjected(tbody);
    root.classList.toggle('scw-co-band-mode', hasCo && mode !== 'off');
    root.classList.toggle('scw-co-band-lav',
      hasCo && mode !== 'off' && getRmColor() === 'lav');

    if (!hasCo) return;
    log('applyMode', viewId, 'mode=' + mode);
    if (mode === 'off') { restoreOrder(tbody); return; }

    snapshotOrder(tbody);
    // Rebuild from pristine order so v1 ↔ v2 flips don't compound.
    restoreOrder(tbody);
    var costMap = costMapFor(viewId);
    if (mode === 'v1') applyV1(tbody, costMap);
    else if (mode === 'v2') applyV2(tbody, costMap);
    log('applyMode done', viewId,
      'bands=' + tbody.querySelectorAll('tr.' + BAND_CLS).length);
  }

  function applyAll() {
    VIEWS.forEach(function (v) {
      try { applyMode(v); }
      catch (e) { console.error('[scw-co-band] applyMode threw for ' + v, e); }
    });
  }

  // ── Floating switcher ────────────────────────────────────────────
  function ensureToggle() {
    // Only show when some grid on the page actually has CO rows.
    var anyCo = VIEWS.some(function (v) {
      var root = document.getElementById(v);
      return !!(root && root.querySelector('tr.scw-co-add-row, tr.scw-co-rm-row'));
    });
    var el = document.getElementById(TOGGLE_ID);
    if (!anyCo) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = TOGGLE_ID;
      el.innerHTML =
        '<span class="scw-cbm-lbl">CO layout</span>' +
        '<button type="button" data-scw-cbm="off">Current</button>' +
        '<button type="button" data-scw-cbm="v1" title="Added / Removed bands ' +
          'within each MDF/IDF">V1 · MDF bands</button>' +
        '<button type="button" data-scw-cbm="v2" title="Added / Removed bands ' +
          'within each subsection (Cameras, Networking & Headend, …)">' +
          'V2 · Section bands</button>' +
        '<span class="scw-cbm-lbl" style="margin-left:8px">Remove</span>' +
        '<button type="button" data-scw-cbm-color="red">Red</button>' +
        '<button type="button" data-scw-cbm-color="lav">Lavender</button>';
      document.body.appendChild(el);
      log('toggle mounted (mode=' + getMode() + ')');
    }
    syncToggle();
  }

  // Click handling lives at the DOCUMENT level (capture) rather than on the
  // toggle element — one binding that survives any toggle re-mount and can't
  // be starved by other document-level handlers.
  if (!document.documentElement.hasAttribute('data-scw-co-band-click')) {
    document.documentElement.setAttribute('data-scw-co-band-click', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest &&
        e.target.closest('#' + TOGGLE_ID + ' button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var m = btn.getAttribute('data-scw-cbm');
      var c = btn.getAttribute('data-scw-cbm-color');
      if (m) { log('toggle click →', m); setMode(m); }
      else if (c) { log('color click →', c); setRmColor(c); }
      else return;
      syncToggle();
      applyAll();
    }, true);
  }
  function syncToggle() {
    var el = document.getElementById(TOGGLE_ID);
    if (!el) return;
    var mode = getMode();
    var col  = getRmColor();
    Array.prototype.slice.call(el.querySelectorAll('button')).forEach(function (b) {
      var m = b.getAttribute('data-scw-cbm');
      var c = b.getAttribute('data-scw-cbm-color');
      b.classList.toggle('is-active', m ? m === mode : c === col);
    });
  }

  // ── Bind ─────────────────────────────────────────────────────────
  // Runs after proposal-grid's synchronous pipeline (bundle order), then
  // re-applies after its 300/1200ms safety-net windows have settled.
  function armFor(viewId) {
    injectCss();
    [400, 1500, 3300].forEach(function (ms) {
      setTimeout(function () {
        ensureToggle();
        try { applyMode(viewId); }
        catch (e) { console.error('[scw-co-band] applyMode threw for ' + viewId, e); }
      }, ms);
    });
  }
  VIEWS.forEach(function (viewId) {
    $(document)
      .off('knack-records-render.' + viewId + EVENT_NS)
      .on('knack-records-render.' + viewId + EVENT_NS, function () {
        log('records-render', viewId);
        armFor(viewId);
      });
  });

  // Scene render: toggle cleanup on non-grid scenes AND a catch-up apply —
  // if knack-records-render fired before the bundle loaded (slow first
  // load), the per-view binding above never saw it; this path still arms.
  $(document).on('knack-scene-render.any' + EVENT_NS, function () {
    setTimeout(function () {
      ensureToggle();
      VIEWS.forEach(function (viewId) {
        var root = document.getElementById(viewId);
        if (root && root.querySelector('tr.scw-co-add-row, tr.scw-co-rm-row')) {
          armFor(viewId);
        }
      });
    }, 500);
  });
})();
/*** END FEATURE: CO ADD/REMOVE BAND MOCKUPS **********************************/
