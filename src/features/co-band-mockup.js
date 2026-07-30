/////*********** CO ADD/REMOVE BANDS (proposal preview — LIVE) ***************//////
/**
 * LIVE CO presentation (cutover 2026-07-16, was a mockup with a toggle):
 * on a change order's proposal preview grid (scene_1096), each MDF/IDF
 * section regroups into a green "ITEMS TO BE ADDED" band and a neutral
 * gray "ITEMS TO BE REMOVED" band with accounting-red credit amounts in
 * the money columns (V1 layout + gray/red scheme). Every subsection gets
 * a per-band subtotal (native mixed-value subtotals are hidden), and each
 * band closes with its own total row.
 *
 * Debug/console overrides (no UI): SCW.coBands.set(mode, color) or
 * localStorage scwCoBandMockupMode = 'off'|'v1'|'v2',
 * scwCoBandRmColor = 'red'|'lav'|'gray' — then reload/re-render.
 *
 * Implementation notes:
 *   - SERIALIZED with proposal-grid: its executePipeline calls
 *     SCW.coBands.suspend(viewId) before transforming (un-band → the
 *     pipeline sees native row order) and SCW.coBands.applyView(viewId)
 *     after (re-band the fresh output). No self-timers. Rows are only
 *     ever MOVED WITHIN their L1 section / L2 block, so proposal-grid's
 *     manifest scrape (which walks previousElementSibling up to the
 *     enclosing L1/L3 header) keeps resolving correctly.
 *   - Row action comes from the classes proposal-grid already stamps
 *     (scw-co-add-row / scw-co-rm-row from field_2965).
 *   - The original tbody order is snapshotted before the first move so
 *     the 'off' override restores it exactly; a Knack re-render replaces
 *     the tbody children, which invalidates the snapshot naturally.
 *   - The publish pipeline scrapes the banded DOM — the published page /
 *     PDF render it via matching band CSS in proposal-pdf-export.js
 *     getPdfCss (kept in sync with the in-page styles here).
 */
(function () {
  'use strict';

  var VIEWS = ['view_3341', 'view_3371'];
  var STORE_KEY = 'scwCoBandMockupMode';   // 'off' | 'v1' | 'v2'
  var STYLE_ID  = 'scw-co-band-mockup-css';
  var TOGGLE_ID = 'scw-co-band-mockup-toggle';

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

  // LIVE (2026-07-16): V1 MDF bands + gray rows / red credit amounts is the
  // shipped CO presentation. localStorage keys remain as HIDDEN debug
  // overrides only (set scwCoBandMockupMode='off'|'v2' or
  // scwCoBandRmColor='red'|'lav' from the console to compare) — there is no
  // UI toggle anymore.
  function getMode() {
    try { return window.localStorage.getItem(STORE_KEY) || 'v1'; }
    catch (e) { return 'v1'; }
  }
  function setMode(m) {
    try { window.localStorage.setItem(STORE_KEY, m); } catch (e) { /* ignore */ }
  }

  var COLOR_KEY = 'scwCoBandRmColor';   // 'red' | 'lav' | 'gray'
  function getRmColor() {
    try { return window.localStorage.getItem(COLOR_KEY) || 'gray'; }
    catch (e) { return 'gray'; }
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
      // Gray + red numbers variant (scw-co-band-gray): neutral slate rows —
      // "removed, not bad" — while the money keeps the accounting-red
      // credit signal in the Cost/price columns.
      '.scw-co-band-gray tr.' + BAND_CLS + '--rm td {',
      '  background: #f4f7fa !important; color: #334155 !important;',
      '  box-shadow: inset 4px 0 0 #64748b, inset 0 6px 0 #07467c;',
      '}',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td { background: #f8fafc !important; }',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td:first-child { box-shadow: inset 4px 0 0 #94a3b8; }',
      '.scw-co-band-gray tr.scw-co-rm-row td { background: #f8fafc !important; }',
      '.scw-co-band-gray tr.scw-co-rm-row td:first-child { box-shadow: inset 4px 0 0 #94a3b8; }',
      '.scw-co-band-gray tr.kn-table-group.scw-co-rm-row td { background: #eef2f7 !important; }',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td.field_2203,',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td.field_2201,',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td.field_2028,',
      '.scw-co-band-gray tr.scw-co-band-tint-rm td.field_1960 { color: #be123c !important; }',
      // Native subsection subtotals mix adds + removes — hidden in V1
      // band mode, replaced by the per-band rows below.
      'tr.scw-co-band-hidden-sub { display: none !important; }',
      // Band subtotal rows — same cell structure as the grid's native L2
      // subtotal rows (label colspan to the Qty column, qty + amount in
      // their own columns) so size and alignment match exactly.
      'tr.scw-co-band-sub td {',
      '  font-size: inherit; padding: 7px 10px !important;',
      '}',
      'tr.scw-co-band-sub .scw-co-band-sub-label { text-align: right; }',
      // Per-subsection rows inside a band — native subtotal look (light
      // blue, navy text) so they read like the other section subtotals.
      'tr.scw-co-band-sub--section td {',
      '  background: #f0f4fa !important; color: #163C6E !important;',
      '}',
      // Band TOTAL rows — themed green/red (or lavender), slightly louder.
      'tr.scw-co-band-sub--add:not(.scw-co-band-sub--section) td {',
      '  background: #dcfce7 !important; color: #065f46 !important;',
      '  border-top: 2px solid #059669 !important;',
      '}',
      'tr.scw-co-band-sub--rm:not(.scw-co-band-sub--section) td {',
      '  background: #ffe4e6 !important; color: #9f1239 !important;',
      '  border-top: 2px solid #e11d48 !important;',
      '}',
      '.scw-co-band-lav tr.scw-co-band-sub--rm:not(.scw-co-band-sub--section) td {',
      '  background: #ede9fe !important; color: #5b21b6 !important;',
      '  border-top: 2px solid #8b5cf6 !important;',
      '}',
      '.scw-co-band-gray tr.scw-co-band-sub--rm:not(.scw-co-band-sub--section) td {',
      '  background: #eef2f7 !important; color: #334155 !important;',
      '  border-top: 2px solid #64748b !important;',
      '}',
      // Amount cell stays red on BOTH the section subtotals and the band
      // total — the :not(--section) form matches the slate row rule's
      // specificity so the (later) red rule wins on the band total too.
      '.scw-co-band-gray tr.scw-co-band-sub--rm td.scw-co-band-sub-amt,',
      '.scw-co-band-gray tr.scw-co-band-sub--rm:not(.scw-co-band-sub--section) td.scw-co-band-sub-amt,',
      '.scw-co-band-gray tr.scw-co-band-sub--rm td.scw-co-band-sub-amt strong {',
      '  color: #be123c !important;',
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
        var c = (typeof a.field_2203_raw === 'number') ? a.field_2203_raw
          : parseFloat(String(a.field_2203 || '').replace(/[^0-9.\-]/g, ''));
        var q = (typeof a.field_1964_raw === 'number') ? a.field_1964_raw
          : parseFloat(String(a.field_1964 || '').replace(/[^0-9.\-]/g, ''));
        map[a.id] = { c: isFinite(c) ? c : 0, q: isFinite(q) ? q : 0 };
      }
    } catch (e) { /* empty map → subtotal renders $0.00, still visible */ }
    return map;
  }
  function addSums(into, u, costMap) {
    var nodes = unitNodes(u);
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].id;
      if (id && HEX24.test(id) && costMap[id]) {
        into.c += costMap[id].c;
        into.q += costMap[id].q;
      }
    }
    return into;
  }
  function bandMoney(n) {
    return '$' + (n < 0 ? '-' : '') +
      Math.abs(n || 0).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Subtotal row mirroring the native L2 subtotal structure exactly —
  // label colspan up to the Qty column, then one td per remaining column
  // with <strong> qty / amount landing in the same cells the native
  // subtotal rows use (field_1964 / field_2203) — so size and alignment
  // match the grid's other section subtotals.
  function bandSubRow(kind, label, sums, tbody, isSection) {
    var ths = tbody.closest('table').querySelectorAll('thead th');
    var idxQty = -1, idxCost = -1;
    for (var i = 0; i < ths.length; i++) {
      if (idxQty === -1 && ths[i].classList.contains('field_1964')) idxQty = i;
      if (idxCost === -1 && ths[i].classList.contains('field_2203')) idxCost = i;
    }
    if (idxQty === -1) idxQty = Math.max(ths.length - 2, 1);
    if (idxCost === -1) idxCost = ths.length - 1;

    var tr = document.createElement('tr');
    tr.className = 'scw-co-band-sub scw-co-band-sub--' + kind +
      (isSection ? ' scw-co-band-sub--section' : '');
    var lbl = document.createElement('td');
    lbl.colSpan = Math.max(idxQty, 1);
    lbl.className = 'scw-co-band-sub-label';
    lbl.innerHTML = '<strong></strong>';
    lbl.firstChild.textContent = label;
    tr.appendChild(lbl);
    for (var k = idxQty; k < ths.length; k++) {
      var td = document.createElement('td');
      td.style.textAlign = 'center';
      // Carry the column's field_XXXX class so columns the grid hides by
      // class (field_2965/field_2966 CO Action) collapse on THIS row too —
      // otherwise these cells render the hidden tracks and push the table
      // wider than every other row (the phantom right-edge gutter).
      var fcls = '';
      for (var c = 0; c < ths[k].classList.length; c++) {
        if (/^field_\d+$/.test(ths[k].classList[c])) { fcls = ths[k].classList[c]; break; }
      }
      if (fcls) td.className = fcls;
      if (k === idxQty && sums.q) td.innerHTML = '<strong>' + sums.q + '</strong>';
      else if (k === idxCost) {
        td.className = (fcls ? fcls + ' ' : '') + 'scw-co-band-sub-amt';
        td.innerHTML = '<strong></strong>';
        td.firstChild.textContent = bandMoney(sums.c);
      }
      tr.appendChild(td);
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
    var add = false, rm = false, hasData = false;
    var nodes = unitNodes(u);
    for (var i = 0; i < nodes.length; i++) {
      var a = rowAction(nodes[i]);
      if (a === 'rm') rm = true;
      else if (a === 'add') add = true;
      if (nodes[i].id && HEX24.test(nodes[i].id)) hasData = true;
    }
    // No real data rows → presentational residue (scw-empty-group-header
    // duplicates from Knack's server-side grouping, hidden by
    // proposal-grid). Skip: don't band, don't tint, don't count — this is
    // what produced phantom "$0.00 Other Equipment / Mounting Hardware"
    // subtotals for subsections with no actual items.
    if (!hasData) return 'skip';
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
      tbody.querySelectorAll('tr.scw-co-band-tint-add, tr.scw-co-band-tint-rm, ' +
        'tr.scw-co-band-hidden-sub')
    ).forEach(function (tr) {
      tr.classList.remove('scw-co-band-tint-add');
      tr.classList.remove('scw-co-band-tint-rm');
      tr.classList.remove('scw-co-band-hidden-sub');
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
      // Skip rows other features removed since the snapshot (e.g.
      // proposal-grid's refreshProjectTotals removes + rebuilds the
      // Change Order Totals rows on every view_3342 render) —
      // re-appending a detached node RESURRECTS the deleted row,
      // which is how the totals block ended up in the grid twice.
      if (snap[i] && snap[i].isConnected) tbody.appendChild(snap[i]);
    }
  }

  /** Un-band a view so proposal-grid can re-run its pipeline against
   *  the native row order. Called by proposal-grid at the START of
   *  every executePipeline pass — its grouping walk anchors synthetic
   *  rows (mounting clusters, subtotals, totals) relative to row
   *  order, so transforming a banded tbody strands them at the top of
   *  the table, disconnected from their section. Drops the snapshot:
   *  the pipeline is about to rebuild rows, so it would be stale. */
  function suspendView(viewId) {
    var root = document.getElementById(viewId);
    var tbody = root && gridTbody(root);
    if (!tbody) return;
    cleanInjected(tbody);
    restoreOrder(tbody);
    delete tbody.__scwCoOrig;
  }

  function insertAfter(refNode, node) {
    refNode.parentNode.insertBefore(node, refNode.nextSibling);
  }

  // ── The two variants ─────────────────────────────────────────────
  // V1: per L1 section — ADD band (subsection headers kept inside),
  //     then REMOVE band. An L2 with both sides keeps its original
  //     header in the add band and gets a visual clone in the remove band.
  function blockLabel(blk) {
    if (!blk.header) return 'Items';
    var td = blk.header.querySelector('td');
    return ((td ? td.textContent : blk.header.textContent) || 'Items')
      .replace(/\s+/g, ' ').trim();
  }

  function applyV1(tbody, costMap) {
    var cols = colCountFor(tbody);
    parseTbody(tbody).forEach(function (section) {
      var frag = document.createDocumentFragment();
      var addSeq = [], rmSeq = [];
      var addTot = { c: 0, q: 0 }, rmTot = { c: 0, q: 0 };
      section.blocks.forEach(function (blk) {
        var adds = blk.units.filter(function (u) { return unitAction(u) === 'add'; });
        var rms  = blk.units.filter(function (u) { return unitAction(u) === 'rm'; });
        var lbl  = blockLabel(blk);
        if (adds.length && blk.header) addSeq.push(blk.header);
        var addS = { c: 0, q: 0 };
        adds.forEach(function (u) {
          addSums(addS, u, costMap);
          addSeq.push.apply(addSeq, stampUnit(u, 'add'));
        });
        if (adds.length) {
          addTot.c += addS.c; addTot.q += addS.q;
          addSeq.push(bandSubRow('add', lbl, addS, tbody, true));
        }
        if (rms.length && blk.header) {
          if (adds.length) {
            var clone = blk.header.cloneNode(true);
            clone.classList.add(CLONE_CLS);
            rmSeq.push(clone);
          } else {
            rmSeq.push(blk.header);
          }
        }
        var rmS = { c: 0, q: 0 };
        rms.forEach(function (u) {
          addSums(rmS, u, costMap);
          rmSeq.push.apply(rmSeq, stampUnit(u, 'rm'));
        });
        if (rms.length) {
          rmTot.c += rmS.c; rmTot.q += rmS.q;
          rmSeq.push(bandSubRow('rm', lbl, rmS, tbody, true));
        }
        // The NATIVE subsection subtotal mixes adds + removes into one
        // number — meaningless inside a single band. Hide it (class is
        // stripped by cleanInjected); the per-band subsection subtotals
        // above replace it in BOTH bands.
        (blk.subtotals || []).forEach(function (t) {
          t.classList.add('scw-co-band-hidden-sub');
        });
      });
      if (addSeq.length) {
        frag.appendChild(bandRow('add', 'Items to be Added', cols));
        addSeq.forEach(function (n) { frag.appendChild(n); });
        frag.appendChild(bandSubRow('add', 'Items to be Added — subtotal', addTot, tbody));
      }
      if (rmSeq.length) {
        frag.appendChild(bandRow('rm', 'Items to be Removed', cols));
        rmSeq.forEach(function (n) { frag.appendChild(n); });
        frag.appendChild(bandSubRow('rm', 'Items to be Removed — subtotal', rmTot, tbody));
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
          var addS = { c: 0, q: 0 };
          frag.appendChild(bandRow('add', 'Items to be Added', cols));
          adds.forEach(function (u) {
            addSums(addS, u, costMap);
            stampUnit(u, 'add').forEach(function (n) { frag.appendChild(n); });
          });
          frag.appendChild(bandSubRow('add', 'Items to be Added — subtotal', addS, tbody));
        }
        if (rms.length) {
          var rmS = { c: 0, q: 0 };
          frag.appendChild(bandRow('rm', 'Items to be Removed', cols));
          rms.forEach(function (u) {
            addSums(rmS, u, costMap);
            stampUnit(u, 'rm').forEach(function (n) { frag.appendChild(n); });
          });
          frag.appendChild(bandSubRow('rm', 'Items to be Removed — subtotal', rmS, tbody));
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
    var rmColor = getRmColor();
    root.classList.toggle('scw-co-band-lav',
      hasCo && mode !== 'off' && rmColor === 'lav');
    root.classList.toggle('scw-co-band-gray',
      hasCo && mode !== 'off' && rmColor === 'gray');

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

  // ── Live cutover (2026-07-16) ───────────────────────────────────
  // The evaluation pill is gone. One-time migration clears any stored
  // mode/color from the mockup period so everyone lands on the shipped
  // defaults (V1 + gray); console overrides still work after that.
  try {
    if (!window.localStorage.getItem('scwCoBandLive1')) {
      window.localStorage.removeItem(STORE_KEY);
      window.localStorage.removeItem(COLOR_KEY);
      window.localStorage.setItem('scwCoBandLive1', '1');
    }
    var _staleToggle = document.getElementById(TOGGLE_ID);
    if (_staleToggle) _staleToggle.remove();
  } catch (e) { /* ignore */ }

  // ── Bind (2026-07-17: serialized with proposal-grid) ─────────────
  // NO self-timers anymore. Banding is driven exclusively by
  // proposal-grid's executePipeline, which calls:
  //   SCW.coBands.suspend(viewId)   at the START of every pass (un-band
  //                                 so the pipeline sees native order)
  //   SCW.coBands.applyView(viewId) at the END of every pass (re-band
  //                                 the fresh output synchronously)
  // The old free-running 400/1500/3300ms timers raced proposal-grid's
  // own 300/1200/3000… safety-net re-runs: the pipeline would transform
  // a band-reordered tbody (stranding its synthetic mounting clusters /
  // subtotals / totals at the top of the table, disconnected from their
  // section) and the next timer here would restore a stale snapshot on
  // top of that. Serializing through the pipeline removes the race
  // entirely — the action classes this module keys off (scw-co-add-row /
  // scw-co-rm-row) only exist after a pipeline pass anyway.
  function applyView(viewId) {
    injectCss();
    try { applyMode(viewId); }
    catch (e) { console.error('[scw-co-band] applyMode threw for ' + viewId, e); }
  }

  // Console escape hatch: SCW.coBands.set('off'|'v1'|'v2', 'red'|'lav'|'gray')
  window.SCW = window.SCW || {};
  window.SCW.coBands = {
    set: function (mode, color) {
      if (mode) setMode(mode);
      if (color) setRmColor(color);
      applyAll();
    },
    apply: applyAll,
    // proposal-grid pipeline hooks — see the Bind comment above.
    suspend: suspendView,
    applyView: applyView
  };
})();
/*** END FEATURE: CO ADD/REMOVE BAND MOCKUPS **********************************/
