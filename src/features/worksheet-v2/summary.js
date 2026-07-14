/*** WORKSHEET V2 — SUMMARY ***************************************************
 *
 * Per-L1 summary panel — table of products with per-product counts,
 * cabling / exterior / plenum metrics (cam/reader bucket only), qty, and
 * total sub bid. Mirrors v1's mdf-summary-panel.js shape so users get
 * the same at-a-glance information they\'re used to.
 *
 * Columns:
 *   Product | Exist Cabling | New Cabling | Exterior | Interior | Plenum
 *           | Qty | Sub Bid
 *
 * Cabling / Exterior / Interior / Plenum cells stay blank for non-cam
 * products. Avg sub bid is the SUM of every sub bid value across the
 * product\'s rows (matches v1\'s "total sub bid" per product).
 *
 * The panel sits at the top of each L1 body so it\'s always visible in
 * default mode and is the only thing visible in "Summary only" mode.
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

  // ── Per-summary open/closed persistence ──────────────────────
  // The summary head is a collapse toggle (default closed). Every rebuild
  // — notably the survey Bid filter — regenerates the summary, which
  // otherwise reset it to closed and lost the user's choice. Persist the
  // open state per scene+view+summary id and re-apply it at build time
  // (same pattern as group/column collapse). id = 'grand' for the grand
  // summary, 'l1:<id>' per MDF/IDF group.
  function sumScene() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function sumOpenKey(viewKey, id) {
    return 'scw:wsv2:sumopen:' + sumScene() + ':' + (viewKey || '') + ':' + (id || '');
  }
  function isSumOpen(viewKey, id) {
    try { return localStorage.getItem(sumOpenKey(viewKey, id)) === '1'; }
    catch (e) { return false; }
  }
  function setSumOpen(viewKey, id, open) {
    try {
      if (open) localStorage.setItem(sumOpenKey(viewKey, id), '1');
      else localStorage.removeItem(sumOpenKey(viewKey, id));
    } catch (e) {}
  }
  // Persist from a built panel element (reads the data-attrs set on build).
  function persistOpen(panelEl, open) {
    if (!panelEl || !panelEl.getAttribute) return;
    var id = panelEl.getAttribute('data-scw-ws-v2-summary-id');
    if (!id) return;
    setSumOpen(panelEl.getAttribute('data-scw-ws-v2-summary-view') || '', id, open);
  }

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
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
  function isYes(rec, fieldKey) {
    var raw = rec && rec[fieldKey + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec[fieldKey] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    // Sign-aware: CO Remove lines carry NEGATIVE money (credits) — render
    // −$700, not the "$-700" toLocaleString would produce.
    return (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    });
  }
  function fmtNum(n) { return n ? String(n) : ''; }

  // ── Aggregate records by product, grouped by bucket category ──
  // Skips assumptions and services entirely (per v1 parity) — the
  // summary table is about countable hardware, not text-only buckets.
  // Returns:
  //   { sections: [{label, products, subtotal}], totals }
  // where sections are ordered: cam/reader first, then "default"
  // (networking / headend / everything else).
  function aggregate(records, opts) {
    opts = opts || {};
    var F = opts.fields || {};
    var viewKey = opts.viewKey;
    // Field map — logical name → field key, resolved per-view via
    // cfg.fields (see CLAUDE.md #15). SOW defaults keep the build-SOW
    // path byte-identical; survey/install resolve their own keys.
    var moneyField = opts.moneyField || F.subBid || 'field_2150';
    var fProduct   = F.product      || 'field_1949';
    var fProductNm = F.productName  || null;   // stored name (survey); SOW has none
    var fQty       = F.qty          || 'field_1964';
    var fSort      = F.sortOrder    || 'field_2218';
    var fLabel     = F.displayLabel || 'field_1950';
    var fExist     = F.existCabling || 'field_2461';
    var fExt       = F.exterior     || 'field_1984';
    var fPlenum    = F.plenum       || 'field_1983';
    var fLaborDesc = F.laborDesc    || '';
    var includeServices = !!opts.includeServices;   // bid: count services too
    var bucketCategoryOf = (ns.card && ns.card.bucketCategoryOf) ||
                           function () { return 'default'; };

    var groups = {
      cam:      { label: 'Camera / Reader',     byProduct: Object.create(null),
                  subtotal: emptyAgg(), minSort: Infinity },
      'default':{ label: 'Networking / Headend', byProduct: Object.create(null),
                  subtotal: emptyAgg(), minSort: Infinity },
      services: { label: 'Services',            byProduct: Object.create(null),
                  subtotal: emptyAgg(), minSort: Infinity }
    };
    var totals = emptyAgg();

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      var cat = bucketCategoryOf(r, viewKey);
      // Assumptions never belong in the summary. Services are skipped UNLESS
      // includeServices (bid) — then they roll into a "Services" section so the
      // per-MDF sub-bid total is complete.
      if (cat === 'assumptions') continue;
      if (cat === 'services' && !includeServices) continue;
      var groupKey = (cat === 'cam') ? 'cam' : (cat === 'services' ? 'services' : 'default');
      var grp = groups[groupKey];

      // Track the section\'s sort key = minimum sortOrder (proposal
      // bucket sortOrder) across its records, so the section ordering
      // matches the main grid\'s L2 sort.
      var so = readNum(r, fSort);
      if (isFinite(so) && so < grp.minSort) grp.minSort = so;

      var prod = (fProductNm && stripHtml(r[fProductNm])) || stripHtml(r[fProduct]) ||
                 (groupKey === 'services' && fLaborDesc ? stripHtml(r[fLaborDesc]) : '') ||
                 (groupKey === 'services' ? '(service)' : '(unnamed)');
      var qty = readNum(r, fQty) || 1;

      var p = grp.byProduct[prod];
      if (!p) {
        p = grp.byProduct[prod] = {
          label: prod,
          isCamReader: groupKey === 'cam',
          labels: [],
          count: 0, existCabling: 0, newCabling: 0,
          exterior: 0, interior: 0, plenum: 0, subBidSum: 0
        };
      }

      p.count += qty;
      grp.subtotal.count += qty;
      totals.count       += qty;

      if (groupKey === 'cam') {
        var devLabel = stripHtml(r[fLabel]);
        if (devLabel) p.labels.push(devLabel);

        if (r[fExist] != null && stripHtml(r[fExist]) !== '') {
          if (isYes(r, fExist)) {
            p.existCabling++; grp.subtotal.existCabling++; totals.existCabling++;
          } else {
            p.newCabling++;   grp.subtotal.newCabling++;   totals.newCabling++;
          }
        }
        if (r[fExt] != null && stripHtml(r[fExt]) !== '') {
          if (isYes(r, fExt)) {
            p.exterior++; grp.subtotal.exterior++; totals.exterior++;
          } else {
            p.interior++; grp.subtotal.interior++; totals.interior++;
          }
        }
        if (isYes(r, fPlenum)) {
          p.plenum++; grp.subtotal.plenum++; totals.plenum++;
        }
      }

      // Include negative money — CO Remove lines are credits and must net
      // against adds in every subtotal (they used to be skipped as "no bid").
      var bid = readNum(r, moneyField);
      if (bid) {
        p.subBidSum         += bid;
        grp.subtotal.subBidSum += bid;
        totals.subBidSum    += bid;
      }
    }

    function productList(byProduct) {
      var out = [];
      for (var k in byProduct) out.push(byProduct[k]);
      out.sort(function (a, b) {
        return a.label.localeCompare(b.label, undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return out;
    }

    var sections = [];
    var camProducts = productList(groups.cam.byProduct);
    if (camProducts.length) {
      sections.push({
        key: 'cam',
        label: groups.cam.label,
        isCamReader: true,
        sortOrder: groups.cam.minSort,
        products: camProducts,
        subtotal: groups.cam.subtotal
      });
    }
    var defProducts = productList(groups['default'].byProduct);
    if (defProducts.length) {
      sections.push({
        key: 'default',
        label: groups['default'].label,
        isCamReader: false,
        sortOrder: groups['default'].minSort,
        products: defProducts,
        subtotal: groups['default'].subtotal
      });
    }
    var svcProducts = productList(groups.services.byProduct);
    if (svcProducts.length) {
      sections.push({
        key: 'services',
        label: groups.services.label,
        isCamReader: false,
        sortOrder: groups.services.minSort,
        products: svcProducts,
        subtotal: groups.services.subtotal
      });
    }
    // Sort sections by their minimum field_2218 (proposal bucket
    // sortOrder) so the grouping order matches the main grid\'s L2
    // ordering. Ties fall back to the original push order so
    // cam/reader still wins when both buckets resolve to the same
    // sortOrder (e.g. when the field is missing on records).
    sections.sort(function (a, b) {
      var ao = isFinite(a.sortOrder) ? a.sortOrder : Infinity;
      var bo = isFinite(b.sortOrder) ? b.sortOrder : Infinity;
      return ao - bo;
    });

    return { sections: sections, totals: totals };
  }

  function emptyAgg() {
    return { count: 0, existCabling: 0, newCabling: 0,
             exterior: 0, interior: 0, plenum: 0, subBidSum: 0 };
  }

  function collectRecords(l1) {
    var all = [];
    var l2s = l1.l2 || [];
    for (var i = 0; i < l2s.length; i++) {
      var recs = (l2s[i] && l2s[i].records) || [];
      for (var j = 0; j < recs.length; j++) all.push(recs[j]);
    }
    return all;
  }

  // Set per build (buildL1Summary / buildGrandSummary) — when true the money
  // (Sub Bid) column is omitted entirely (e.g. the install worksheet, which has
  // no money columns). Synchronous build, so a module flag is safe.
  var _hideMoney = false;

  function productRow(p, isSubtotal) {
    var cls = isSubtotal ? ' class="scw-ws-v2-summary-row--total"' : '';
    var showCR = isSubtotal ? true : p.isCamReader;
    var labels = '';
    if (!isSubtotal && p.isCamReader && p.labels.length) {
      var sorted = p.labels.slice().sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
      labels = '<span class="scw-ws-v2-summary-labels">' +
        sorted.map(esc).join(', ') + '</span>';
    }
    return '<tr' + cls + '>' +
      '<td class="scw-ws-v2-summary-prod">' + esc(p.label) + labels + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.existCabling) : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.newCabling)   : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.exterior)     : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.interior)     : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.plenum)       : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + fmtNum(p.count) + '</td>' +
      (_hideMoney ? '' :
        '<td class="scw-ws-v2-summary-money">' +
          (p.subBidSum !== 0 ? esc(fmtMoney(p.subBidSum)) : '') +
        '</td>') +
    '</tr>';
  }

  function tableHeaderRow(moneyLabel) {
    return '<thead><tr>' +
      '<th class="scw-ws-v2-summary-prod">Product</th>' +
      '<th class="scw-ws-v2-summary-num" title="Existing cabling">Exist Cab</th>' +
      '<th class="scw-ws-v2-summary-num" title="New cabling">New Cab</th>' +
      '<th class="scw-ws-v2-summary-num">Ext</th>' +
      '<th class="scw-ws-v2-summary-num">Int</th>' +
      '<th class="scw-ws-v2-summary-num">Plen</th>' +
      '<th class="scw-ws-v2-summary-num">Qty</th>' +
      (_hideMoney ? '' :
        '<th class="scw-ws-v2-summary-money">' + esc(moneyLabel || 'Sub Bid') + '</th>') +
    '</tr></thead>';
  }

  function sectionHeadRow(label) {
    return '<tr class="scw-ws-v2-summary-row--bucket">' +
      '<td colspan="' + (_hideMoney ? 7 : 8) + '">' + esc(label) + '</td>' +
    '</tr>';
  }

  function subtotalRow(label, sub, isCam) {
    var p = {
      label: label,
      count: sub.count,
      isCamReader: isCam,
      labels: [],
      existCabling: sub.existCabling,
      newCabling:   sub.newCabling,
      exterior:     sub.exterior,
      interior:     sub.interior,
      plenum:       sub.plenum,
      subBidSum:    sub.subBidSum
    };
    return productRow(p, true);
  }

  function buildSectionsRows(agg, opts) {
    opts = opts || {};
    var rows = '';
    for (var s = 0; s < agg.sections.length; s++) {
      var sec = agg.sections[s];
      rows += sectionHeadRow(sec.label);
      for (var i = 0; i < sec.products.length; i++) {
        rows += productRow(sec.products[i], false);
      }
      // Per-bucket subtotal — only when the section has >1 product
      // OR the user asked for it explicitly via opts.alwaysSubtotal.
      if (opts.alwaysSubtotal || sec.products.length > 1) {
        rows += subtotalRow(sec.label + ' subtotal', sec.subtotal, sec.isCamReader);
      }
    }
    // Grand total — across both sections
    if (agg.sections.length > 1) {
      rows += subtotalRow('Total', agg.totals, true);
    }
    return rows;
  }

  var CHEV_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /** Issue-chip strip rendered into the summary head. Reads from
   *  ns.warnings cache (analyzed once per render in render.js). Empty
   *  string when there are no flagged records in the given set. */
  // asSpan=true renders non-interactive <span> chips (used inside the L1
  // header button, where a nested <button> would be invalid + fight the
  // accordion toggle). The grand summary keeps clickable button chips.
  function fmtIssueChips(recordIds, asSpan) {
    if (!ns.warnings || typeof ns.warnings.getCountsForRecords !== 'function') return '';
    if (!recordIds.length) return '';
    var counts;
    try { counts = ns.warnings.getCountsForRecords(recordIds); }
    catch (e) { return ''; }
    var labels = ns.warnings.LABELS || {};
    var icons  = ns.warnings.ICONS  || {};
    var types  = ns.warnings.TYPES  || [];
    var parts = [];
    for (var t = 0; t < types.length; t++) {
      var k = types[t];
      var n = counts[k] || 0;
      if (!n) continue;
      var inner =
        (icons[k] || WARN_SVG) +
        '<span class="scw-ws-v2-warn-chip-n">' + n + '</span>' +
        '<span class="scw-ws-v2-warn-chip-l">' + esc(labels[k] || k) + '</span>';
      if (asSpan) {
        // Rendered inside the L1 (MDF/IDF) header button, so it can't be a
        // nested <button> — use a span with role=button. init.js's delegated
        // handler catches data-scw-ws-v2-warn-chip and highlights the
        // matching rows scoped to this L1 (and stops the accordion toggle).
        parts.push('<span class="scw-ws-v2-warn-chip" ' +
          'data-issue-type="' + k + '" ' +
          'data-scw-ws-v2-warn-chip="' + k + '" ' +
          'role="button" tabindex="0" ' +
          'title="Click to highlight the ' + n + ' affected row' +
          (n === 1 ? '' : 's') + ' in this group">' + inner + '</span>');
      } else {
        parts.push(
          '<button type="button" class="scw-ws-v2-warn-chip" ' +
            'data-issue-type="' + k + '" ' +
            'data-scw-ws-v2-warn-chip="' + k + '" ' +
            'title="Click to highlight the ' + n + ' affected row' +
            (n === 1 ? '' : 's') + '">' + inner + '</button>'
        );
      }
    }
    return parts.length
      ? '<span class="scw-ws-v2-warn-chips">' + parts.join('') + '</span>'
      : '';
  }

  function collectRecordIds(l1) {
    var out = [];
    var l2s = (l1 && l1.l2) || [];
    for (var i = 0; i < l2s.length; i++) {
      var recs = (l2s[i] && l2s[i].records) || [];
      for (var j = 0; j < recs.length; j++) if (recs[j] && recs[j].id) out.push(recs[j].id);
    }
    return out;
  }

  function fmtSummaryStat(totals) {
    var bits = [];
    if (totals.count) bits.push(totals.count + ' items');
    if (!_hideMoney && totals.subBidSum) bits.push(fmtMoney(totals.subBidSum));
    return bits.join(' · ');
  }

  function buildL1Summary(l1, opts) {
    opts = opts || {};
    _hideMoney = !!opts.hideMoney;
    var recs = collectRecords(l1);
    var agg = aggregate(recs, opts);
    if (!agg.sections.length) {
      var wrapEmpty = document.createElement('div');
      wrapEmpty.className = 'scw-ws-v2-summary scw-ws-v2-summary--empty';
      wrapEmpty.innerHTML = '<div class="scw-ws-v2-summary-empty">' +
        'No hardware in ' + esc(l1.label) + '.</div>';
      return wrapEmpty;
    }

    var tableHtml =
      '<table class="scw-ws-v2-summary-table">' +
        tableHeaderRow(opts.moneyLabel) +
        '<tbody>' + buildSectionsRows(agg) + '</tbody>' +
      '</table>';

    // Issue chips now live in the MDF/IDF header bar (render.js), not here.
    var l1Id = 'l1:' + (l1.id || l1.label || '');
    var l1ViewKey = opts.viewKey || '';
    var l1Open = isSumOpen(l1ViewKey, l1Id);
    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-summary' + (l1Open ? ' scw-ws-v2-summary--open' : '');
    wrap.setAttribute('data-scw-ws-v2-summary-id', l1Id);
    wrap.setAttribute('data-scw-ws-v2-summary-view', l1ViewKey);
    wrap.innerHTML =
      '<button type="button" class="scw-ws-v2-summary-head" ' +
        'data-scw-ws-v2-summary-toggle aria-expanded="' + (l1Open ? 'true' : 'false') + '">' +
        '<span class="scw-ws-v2-summary-chev">' + CHEV_SVG + '</span>' +
        '<span class="scw-ws-v2-summary-title">Summary</span>' +
        '<span class="scw-ws-v2-summary-stats">' + esc(fmtSummaryStat(agg.totals)) + '</span>' +
      '</button>' +
      '<div class="scw-ws-v2-summary-body">' + tableHtml + '</div>';
    return wrap;
  }

  /** Grand summary — aggregates EVERY record across every L1. */
  function buildGrandSummary(tree, opts) {
    opts = opts || {};
    _hideMoney = !!opts.hideMoney;
    var all = [];
    for (var i = 0; i < tree.length; i++) {
      all = all.concat(collectRecords(tree[i]));
    }
    var agg = aggregate(all, opts);
    if (!agg.sections.length) {
      var wrapEmpty = document.createElement('div');
      wrapEmpty.className = 'scw-ws-v2-grand-summary scw-ws-v2-grand-summary--empty';
      wrapEmpty.innerHTML = '<div class="scw-ws-v2-summary-empty">' +
        'No hardware line items yet.</div>';
      return wrapEmpty;
    }

    var tableHtml =
      '<table class="scw-ws-v2-summary-table">' +
        tableHeaderRow(opts.moneyLabel) +
        '<tbody>' + buildSectionsRows(agg, { alwaysSubtotal: true }) + '</tbody>' +
      '</table>';

    // Aggregate issue chips no longer live in the summary head — they're
    // rendered up in the panel banner (render.js → grandIssueChips).
    var grandViewKey = opts.viewKey || '';
    var grandOpen = isSumOpen(grandViewKey, 'grand');
    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-grand-summary' + (grandOpen ? ' scw-ws-v2-summary--open' : '');
    wrap.setAttribute('data-scw-ws-v2-summary-id', 'grand');
    wrap.setAttribute('data-scw-ws-v2-summary-view', grandViewKey);
    wrap.innerHTML =
      '<button type="button" class="scw-ws-v2-summary-head scw-ws-v2-summary-head--grand" ' +
        'data-scw-ws-v2-summary-toggle aria-expanded="' + (grandOpen ? 'true' : 'false') + '">' +
        '<span class="scw-ws-v2-summary-chev">' + CHEV_SVG + '</span>' +
        '<span class="scw-ws-v2-summary-title">Summary</span>' +
        '<span class="scw-ws-v2-summary-stats">' +
          all.length + ' line items · ' + esc(fmtSummaryStat(agg.totals)) +
        '</span>' +
      '</button>' +
      '<div class="scw-ws-v2-summary-body">' + tableHtml + '</div>';
    return wrap;
  }

  // Issue-count chips for one L1's records — rendered into the MDF/IDF
  // header bar by render.js (instead of the summary head).
  function issueChipsForL1(l1) {
    return fmtIssueChips(collectRecordIds(l1), true);
  }

  // Whole-grid aggregate issue chips (clickable buttons) for the banner.
  function grandIssueChips(tree) {
    var all = [];
    for (var i = 0; i < tree.length; i++) all = all.concat(collectRecords(tree[i]));
    var allIds = [];
    for (var ri = 0; ri < all.length; ri++) if (all[ri] && all[ri].id) allIds.push(all[ri].id);
    return fmtIssueChips(allIds);
  }

  // Sub-bid total for one L1 (respects moneyField + includeServices; skips
  // assumptions). Surfaced in the MDF/IDF header by render.js.
  function l1MoneyTotal(l1, opts) {
    var agg = aggregate(collectRecords(l1), opts || {});
    return (agg.totals && agg.totals.subBidSum) || 0;
  }

  ns.summary = {
    buildL1Summary:    buildL1Summary,
    buildGrandSummary: buildGrandSummary,
    issueChipsForL1:   issueChipsForL1,
    grandIssueChips:   grandIssueChips,
    l1MoneyTotal:      l1MoneyTotal,
    fmtMoney:          fmtMoney,
    persistOpen:       persistOpen
  };
})();
/*** END WORKSHEET V2 — SUMMARY ***********************************************/
