/*** WORKSHEET V2 — SUMMARY ***************************************************
 *
 * 2026-10-09: the grand panel is now the SCOPE STRIP (buildScopeStrip —
 * family tiles with the camera splits, products by name) and each MDF/IDF
 * header carries its own scope line (l1ScopeLine); the per-L1 panel below
 * is no longer rendered. The product table lives on behind the strip's
 * "Products" disclosure. The aggregate() pipeline below feeds that table.
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
    var isLicense = (ns.card && ns.card.isLicenseBucket) || function () { return false; };
    // Recurring licenses: their own section, LAST, never in `totals` —
    // billed separately, like the proposal's Recurring Services band.
    var licenses = { label: 'Recurring licenses — billed separately', byProduct: Object.create(null),
                     subtotal: emptyAgg() };

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
      if (isLicense(r, viewKey)) {
        var lprod = (fProductNm && stripHtml(r[fProductNm])) || stripHtml(r[fProduct]) || '(license)';
        var lqty  = readNum(r, fQty) || 1;
        var lp = licenses.byProduct[lprod] || (licenses.byProduct[lprod] = {
          label: lprod, isCamReader: false, labels: [],
          count: 0, existCabling: 0, newCabling: 0, exterior: 0, interior: 0, plenum: 0, subBidSum: 0 });
        lp.count += lqty; licenses.subtotal.count += lqty;
        var lbid = readNum(r, moneyField);
        if (lbid) { lp.subBidSum += lbid; licenses.subtotal.subBidSum += lbid; }
        continue;
      }
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
    var licProducts = productList(licenses.byProduct);
    var hasLicenses = licProducts.length > 0;

    return { sections: sections, totals: totals,
             licenses: hasLicenses ? { key: 'licenses', label: licenses.label, isCamReader: false, isLicense: true,
                                       products: licProducts, subtotal: licenses.subtotal } : null };
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
    // Recurring licenses after the total, so the total plainly excludes them.
    if (agg.licenses) {
      rows += sectionHeadRow(agg.licenses.label);
      for (var li = 0; li < agg.licenses.products.length; li++) rows += productRow(agg.licenses.products[li], false);
      rows += subtotalRow('Recurring licenses subtotal (not in Total)', agg.licenses.subtotal, false);
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


  // ── SCOPE STRIP (2026-10-09) ──────────────────────────────────────
  // Replaces the grand summary panel; the per-MDF panels' numbers move into
  // the L1 header line (l1ScopeLine). One question: what is on this
  // proposal? Families are the proposal bucket every line already carries
  // — cameras / readers (with the splits: new drops vs existing cable,
  // interior vs exterior, plenum; QA passed on install), headend &
  // networking and other equipment (their products listed BY NAME with
  // counts — no product family field, no name rules), services and
  // licenses as muted tiles. Mounts fold into the camera tile. Removed-by-
  // CO rows (install) are counted apart and excluded from everything else.
  // Design: canvas "Worksheet Scope Summary" (2026-10-09).
  var SCOPE_BUCKETS = {
    cam:         '6481e5ba38f283002898113c',
    mount:       '594a94536877675816984cb9',
    networking:  '647953bb54b4e1002931ed97',
    otherEquip:  '5df12ce036f91b0015404d78',
    materials:   '6a14eee134e422f3769ada00',
    services:    '6977caa7f246edf67b52cbcd',
    assumptions: '697b7a023a31502ec68b3303',
    license:     '645554dce6f3a60028362a6a'
  };
  function scopeBucketIds(viewKey) {
    var ids = {};
    for (var k in SCOPE_BUCKETS) ids[k] = SCOPE_BUCKETS[k];
    try {
      var b = ns.cfg && typeof ns.cfg.buckets === 'function' ? ns.cfg.buckets(viewKey) : null;
      if (b) {
        if (b.camReader)        ids.cam = b.camReader;
        if (b.mountingHardware) ids.mount = b.mountingHardware;
        if (b.networking)       ids.networking = b.networking;
        if (b.otherEquip)       ids.otherEquip = b.otherEquip;
        if (b.services)         ids.services = b.services;
        if (b.assumptions)      ids.assumptions = b.assumptions;
      }
    } catch (e) { /* defaults */ }
    return ids;
  }
  function bucketIdOfRec(rec, viewKey) {
    if (ns.card && typeof ns.card.bucketIdOf === 'function') return ns.card.bucketIdOf(rec, viewKey) || '';
    var raw = rec && rec.field_2219_raw;
    return (Array.isArray(raw) && raw[0] && raw[0].id) || '';
  }
  /** Family of a record: cam | mount | headend | other | services | assumptions | license. */
  function familyOf(rec, viewKey, ids) {
    ids = ids || scopeBucketIds(viewKey);
    var isLicense = (ns.card && ns.card.isLicenseBucket) || function () { return false; };
    if (isLicense(rec, viewKey)) return 'license';
    var id = bucketIdOfRec(rec, viewKey);
    if (id === ids.cam)         return 'cam';
    if (id === ids.mount)       return 'mount';
    if (id === ids.networking)  return 'headend';
    if (id === ids.services)    return 'services';
    if (id === ids.assumptions) return 'assumptions';
    return 'other';
  }
  function removedByCoMarker(rec, F) {
    var key = (F && F.removedByCo) || '';
    if (!key) return null;
    var raw = rec && rec[key + '_raw'];
    return (Array.isArray(raw) && raw.length && raw[0]) ? raw[0] : null;
  }
  function emptyFam() { return { count: 0, money: 0, ids: [], byProduct: Object.create(null), products: [] }; }
  function addProduct(fam, name, qty) {
    var p = fam.byProduct[name] || (fam.byProduct[name] = { name: name, qty: 0 });
    p.qty += qty;
  }
  function finishProducts(fam) {
    var out = [];
    for (var k in fam.byProduct) out.push(fam.byProduct[k]);
    out.sort(function (a, b) {
      return (b.qty - a.qty) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    fam.products = out;
    delete fam.byProduct;
    return fam;
  }
  /** The scope aggregate for a set of records (same opts as aggregate()). */
  function aggregateScope(records, opts) {
    opts = opts || {};
    var F = opts.fields || {};
    var viewKey = opts.viewKey;
    var moneyField = opts.hideMoney ? '' : (opts.moneyField || F.subBid || 'field_2150');
    var fProduct   = F.product      || 'field_1949';
    var fProductNm = F.productName  || null;
    var fQty       = F.qty          || 'field_1964';
    var fExist     = F.existCabling || 'field_2461';
    var fExt       = F.exterior     || 'field_1984';
    var fPlenum    = F.plenum       || 'field_1983';
    var fQaPassed  = F.qaPassed     || '';
    var fQaStatus  = F.qaStatus     || '';
    var fLaborDesc = F.laborDesc    || '';
    var ids = scopeBucketIds(viewKey);
    var fams = { cam: emptyFam(), mount: emptyFam(), headend: emptyFam(), other: emptyFam(),
                 services: emptyFam(), license: emptyFam() };
    var cam = fams.cam;
    cam.newDrops = 0; cam.existing = 0; cam.interior = 0; cam.exterior = 0; cam.plenum = 0;
    cam.qaPassed = 0; cam.qaOpen = 0; cam.readers = 0;
    var removed = { count: 0, ids: [], labels: [] };
    var lineItems = 0, total = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      var fam = familyOf(r, viewKey, ids);
      if (fam === 'assumptions') continue;
      var rm = removedByCoMarker(r, F);
      if (rm) {
        removed.count++; removed.ids.push(r.id);
        var rl = stripHtml(rm.identifier);
        if (rl && removed.labels.indexOf(rl) === -1) removed.labels.push(rl);
        continue;
      }
      var qty  = readNum(r, fQty) || 1;
      var name = (fProductNm && stripHtml(r[fProductNm])) || stripHtml(r[fProduct]) ||
                 (fam === 'services' && fLaborDesc ? stripHtml(r[fLaborDesc]) : '') ||
                 (fam === 'services' ? '(service)' : '(unnamed)');
      var f = fams[fam];
      f.count += qty; f.ids.push(r.id); addProduct(f, name, qty);
      var money = moneyField ? readNum(r, moneyField) : 0;
      if (money) f.money += money;
      lineItems++;
      if (fam !== 'license' && money) total += money;
      if (fam === 'cam') {
        if (/\breader\b|keypad|intercom/i.test(name)) cam.readers += qty;
        if (r[fExist] != null && stripHtml(r[fExist]) !== '') {
          if (isYes(r, fExist)) cam.existing += qty; else cam.newDrops += qty;
        }
        if (r[fExt] != null && stripHtml(r[fExt]) !== '') {
          if (isYes(r, fExt)) cam.exterior += qty; else cam.interior += qty;
        }
        if (isYes(r, fPlenum)) cam.plenum += qty;
        if (fQaPassed || fQaStatus) {
          var passed = (fQaPassed && isYes(r, fQaPassed)) ||
                       (fQaStatus && /^pass/i.test(stripHtml(r[fQaStatus])));
          if (passed) cam.qaPassed += qty; else cam.qaOpen += qty;
        }
      }
    }
    for (var fk in fams) finishProducts(fams[fk]);
    // Cameras and readers never share a proposal (either/or); the tile says which.
    var title = !cam.count ? 'Cameras' :
      (cam.readers >= cam.count ? 'Readers' : (cam.readers ? 'Cameras & readers' : 'Cameras'));
    return { title: title, cam: cam, mounts: fams.mount, headend: fams.headend, other: fams.other,
             services: fams.services, licenses: fams.license, removed: removed,
             lineItems: lineItems, total: total, hasQa: !!(fQaPassed || fQaStatus),
             hideMoney: !!opts.hideMoney };
  }

  function pct(part, whole) {
    return whole ? Math.max(0, Math.min(100, Math.round(part / whole * 100))) : 0;
  }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  /** A two-segment bar with the labels inside. aLabel/bLabel may be
   *  [singular, plural]. A zero side collapses into the other segment's
   *  text ("0 new drops · 6 existing cable") instead of a sliver. */
  function scopeBar(aN, aLabel, bN, bLabel, mod) {
    var whole = aN + bN;
    if (!whole) return '';
    var la = Array.isArray(aLabel) ? plural(aN, aLabel[0], aLabel[1]) : aLabel;
    var lb = Array.isArray(bLabel) ? plural(bN, bLabel[0], bLabel[1]) : bLabel;
    var aCls = 'scw-ws-v2-scope-bar-a' + (mod ? ' scw-ws-v2-scope-bar-a--' + mod : '');
    if (!bN) {
      return '<span class="scw-ws-v2-scope-bar"><span class="' + aCls + ' scw-ws-v2-scope-bar-a--full" style="width:100%">' +
        aN + ' ' + esc(la) + ' · 0 ' + esc(lb) + '</span></span>';
    }
    if (!aN) {
      return '<span class="scw-ws-v2-scope-bar"><span class="scw-ws-v2-scope-bar-b">0 ' + esc(la) + ' · ' +
        bN + ' ' + esc(lb) + '</span></span>';
    }
    return '<span class="scw-ws-v2-scope-bar">' +
      '<span class="' + aCls + '" style="width:' + pct(aN, whole) + '%">' + aN + ' ' + esc(la) + '</span>' +
      '<span class="scw-ws-v2-scope-bar-b">' + bN + ' ' + esc(lb) + '</span>' +
    '</span>';
  }
  function scopeProductList(fam, max) {
    max = max || 6;
    var n = fam.products.length, h = '';
    for (var i = 0; i < Math.min(n, max); i++) {
      h += '<span class="scw-ws-v2-scope-q">' + fam.products[i].qty + '×</span>' +
           '<span class="scw-ws-v2-scope-p">' + esc(fam.products[i].name) + '</span>';
    }
    if (n > max) h += '<span class="scw-ws-v2-scope-q"></span><span class="scw-ws-v2-scope-p scw-ws-v2-scope-more">+ ' + (n - max) + ' more</span>';
    return h ? '<span class="scw-ws-v2-scope-list">' + h + '</span>' : '';
  }
  function scopeProductsInline(fam, max) {
    var parts = [];
    for (var i = 0; i < Math.min(fam.products.length, max); i++) parts.push(fam.products[i].qty + '× ' + esc(fam.products[i].name));
    if (fam.products.length > max) parts.push('+ ' + (fam.products.length - max) + ' more');
    return parts.join(' · ');
  }
  function scopeTile(fam, key, label, mod, inner, corner) {
    return '<button type="button" class="scw-ws-v2-scope-tile' + (mod ? ' ' + mod : '') + '" ' +
      'data-scw-ws-v2-scope-tile="' + key + '" data-scw-ws-v2-scope-ids="' + esc(fam.ids.join(',')) + '" ' +
      'aria-pressed="false" title="Highlight these rows in the worksheet">' +
      '<span class="scw-ws-v2-scope-k"><span>' + esc(label) + '</span>' +
        (corner ? '<span class="scw-ws-v2-scope-corner">' + corner + '</span>' : '') + '</span>' +
      '<span class="scw-ws-v2-scope-n">' + fam.count + '</span>' +
      (inner || '') +
    '</button>';
  }
  /** Records attached under a parent card (groups.js hides them from the
   *  tree) whose parent is one of `recs` — so a group's mounts count with
   *  its cameras. Needs opts.records (the render's full record list). */
  function attachedTo(recs, opts) {
    var pool = opts && opts.records;
    if (!Array.isArray(pool) || !pool.length) return [];
    var F = opts.fields || {};
    var fParent = F.parent || 'field_2464';
    var have = Object.create(null), i;
    for (i = 0; i < recs.length; i++) if (recs[i] && recs[i].id) have[recs[i].id] = true;
    var out = [];
    for (i = 0; i < pool.length; i++) {
      var r = pool[i];
      if (!r || !r.id || have[r.id]) continue;
      var raw = r[fParent + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var k = 0; k < raw.length; k++) {
        if (raw[k] && raw[k].id && have[raw[k].id]) { out.push(r); break; }
      }
    }
    return out;
  }
  /** The scope strip — the grand slot at the top of the worksheet.
   *  opts.records (the render's full, filtered record list) feeds the tiles
   *  so attached accessories count; the Products table keeps the tree's
   *  records (the rows the worksheet shows), as the old panel did. */
  function buildScopeStrip(tree, opts) {
    opts = opts || {};
    _hideMoney = !!opts.hideMoney;
    var all = [], l1Count = 0;
    for (var i = 0; i < tree.length; i++) {
      var recs = collectRecords(tree[i]);
      if (recs.length && !tree[i].isSynthetic) l1Count++;
      all = all.concat(recs);
    }
    var scopeRecs = (Array.isArray(opts.records) && opts.records.length) ? opts.records : all;
    var a = aggregateScope(scopeRecs, opts);
    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-scope';
    wrap.setAttribute('data-scw-ws-v2-scope-view', opts.viewKey || '');
    if (!a.lineItems && !a.removed.count) {
      wrap.classList.add('scw-ws-v2-scope--empty');
      wrap.innerHTML = '<div class="scw-ws-v2-summary-empty">No hardware line items yet.</div>';
      return wrap;
    }
    var money = function (n) { return (!_hideMoney && n) ? esc(fmtMoney(n)) : ''; };
    var tiles = '';
    if (a.cam.count || a.mounts.count) {
      var bars = '';
      if (a.cam.count) {
        bars += scopeBar(a.cam.newDrops, ['new drop', 'new drops'], a.cam.existing, 'existing cable');
        bars += scopeBar(a.cam.interior, 'interior', a.cam.exterior, 'exterior');
        if (a.cam.plenum) bars += scopeBar(a.cam.plenum, 'plenum', a.cam.count - a.cam.plenum, 'not plenum');
        if (a.hasQa && (a.cam.qaPassed || a.cam.qaOpen)) bars += scopeBar(a.cam.qaPassed, 'QA passed', a.cam.qaOpen, 'open', 'ok');
      }
      var mountsLine = a.mounts.count
        ? '<span class="scw-ws-v2-scope-mounts" data-scw-ws-v2-scope-ids="' + esc(a.mounts.ids.join(',')) + '">' +
            '<span><b>' + a.mounts.count + '</b> ' + plural(a.mounts.count, 'mount') + '</span>' +
            (money(a.mounts.money) ? '<span>' + money(a.mounts.money) + '</span>' : '') + '</span>'
        : '';
      var camFam = a.cam.count ? a.cam : a.mounts;
      tiles += scopeTile(camFam, a.cam.count ? 'cam' : 'mount', a.cam.count ? a.title : 'Mounts', 'scw-ws-v2-scope-tile--cam',
        (bars ? '<span class="scw-ws-v2-scope-bars">' + bars + '</span>' : '') + (a.cam.count ? mountsLine : ''),
        money(a.cam.count ? a.cam.money : a.mounts.money));
    }
    if (a.headend.count) tiles += scopeTile(a.headend, 'headend', 'Headend & networking', 'scw-ws-v2-scope-tile--headend', scopeProductList(a.headend, 6), money(a.headend.money));
    if (a.other.count)   tiles += scopeTile(a.other, 'other', 'Other equipment', 'scw-ws-v2-scope-tile--other', scopeProductList(a.other, 4), money(a.other.money));
    if (a.services.count) tiles += scopeTile(a.services, 'services', 'Services', 'scw-ws-v2-scope-tile--muted',
      '<span class="scw-ws-v2-scope-sub">' + scopeProductsInline(a.services, 3) + (money(a.services.money) ? ' · ' + money(a.services.money) : '') + '</span>');
    if (a.licenses.count) tiles += scopeTile(a.licenses, 'license', 'Licenses', 'scw-ws-v2-scope-tile--muted',
      '<span class="scw-ws-v2-scope-sub">recurring · billed separately · not in total</span>');
    if (a.removed.count) {
      tiles += scopeTile(a.removed, 'removed', 'Removed by change order', 'scw-ws-v2-scope-tile--removed',
        '<span class="scw-ws-v2-scope-sub">' + esc(a.removed.labels.slice(0, 2).join(' · ')) + '</span>');
    }
    // "Products" disclosure = the per-product table the old panel showed.
    var tableAgg = aggregate(all, opts);
    var prodCount = 0;
    for (var s = 0; s < tableAgg.sections.length; s++) prodCount += tableAgg.sections[s].products.length;
    if (tableAgg.licenses) prodCount += tableAgg.licenses.products.length;
    var viewKey = opts.viewKey || '';
    var open = isSumOpen(viewKey, 'grand');
    var meta = a.lineItems + ' line item' + (a.lineItems === 1 ? '' : 's') + ' · ' + l1Count + ' MDF/IDF' + (l1Count === 1 ? '' : 's') +
      (money(a.total) ? ' · <b>' + money(a.total) + '</b> ' + esc(opts.moneyLabel || 'sub bid') : '') +
      (a.licenses.count ? ' · licenses not included' : '');
    wrap.innerHTML =
      '<div class="scw-ws-v2-scope-tiles">' + tiles + '</div>' +
      '<div class="scw-ws-v2-scope-products' + (open ? ' scw-ws-v2-summary--open' : '') + '" ' +
        'data-scw-ws-v2-summary-id="grand" data-scw-ws-v2-summary-view="' + esc(viewKey) + '">' +
        '<button type="button" class="scw-ws-v2-scope-prodtoggle" data-scw-ws-v2-summary-toggle aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="scw-ws-v2-summary-chev">' + CHEV_SVG + '</span>Products (' + prodCount + ')</button>' +
        '<span class="scw-ws-v2-scope-meta">' + meta + '</span>' +
        '<div class="scw-ws-v2-summary-body">' +
          (tableAgg.sections.length
            ? '<table class="scw-ws-v2-summary-table">' + tableHeaderRow(opts.moneyLabel) +
              '<tbody>' + buildSectionsRows(tableAgg, { alwaysSubtotal: true }) + '</tbody></table>'
            : '<div class="scw-ws-v2-summary-empty">No hardware line items.</div>') +
        '</div>' +
      '</div>';
    return wrap;
  }
  function l1Chip(n, label, detail, mod) {
    return '<span class="scw-ws-v2-l1-scope-chip' + (mod ? ' ' + mod : '') + '"><b>' + n + '</b> ' + esc(label) +
      (detail ? '<span class="scw-ws-v2-l1-scope-detail"> · ' + detail + '</span>' : '') + '</span>';
  }
  /** One MDF/IDF's scope as chips for its header (replaces the per-group panel). */
  function l1ScopeLine(l1, opts) {
    var recs = collectRecords(l1);
    if (!recs.length) return '';
    recs = recs.concat(attachedTo(recs, opts || {}));
    var a = aggregateScope(recs, opts || {});
    var chips = [];
    if (a.cam.count) {
      var parts = [];
      if (a.cam.newDrops || a.cam.existing) parts.push(a.cam.newDrops + ' new · ' + a.cam.existing + ' existing');
      if (a.cam.interior || a.cam.exterior) parts.push(a.cam.interior + ' int · ' + a.cam.exterior + ' ext');
      if (a.cam.plenum) parts.push(a.cam.plenum + ' plenum');
      if (a.hasQa && (a.cam.qaPassed || a.cam.qaOpen)) parts.push(a.cam.qaPassed + ' QA passed');
      var camLabel = a.title.toLowerCase();
      if (a.cam.count === 1) camLabel = camLabel === 'readers' ? 'reader' : 'camera';
      chips.push(l1Chip(a.cam.count, camLabel, parts.join(' · ')));
    }
    if (a.mounts.count)   chips.push(l1Chip(a.mounts.count, plural(a.mounts.count, 'mount'), '', 'scw-ws-v2-l1-scope-chip--muted'));
    if (a.headend.count)  chips.push(l1Chip(a.headend.count, 'headend', scopeProductsInline(a.headend, 3)));
    if (a.other.count)    chips.push(l1Chip(a.other.count, 'other', scopeProductsInline(a.other, 2)));
    if (a.services.count) chips.push(l1Chip(a.services.count, plural(a.services.count, 'service'), '', 'scw-ws-v2-l1-scope-chip--muted'));
    if (a.licenses.count) chips.push(l1Chip(a.licenses.count, plural(a.licenses.count, 'license'), 'recurring', 'scw-ws-v2-l1-scope-chip--muted'));
    if (a.removed.count)  chips.push(l1Chip(a.removed.count, 'removed by CO', '', 'scw-ws-v2-l1-scope-chip--removed'));
    return chips.join('');
  }

  ns.summary = {
    buildL1Summary:    buildL1Summary,
    buildGrandSummary: buildGrandSummary,
    buildScopeStrip:   buildScopeStrip,
    aggregateScope:    aggregateScope,
    l1ScopeLine:       l1ScopeLine,
    familyOf:          familyOf,
    issueChipsForL1:   issueChipsForL1,
    grandIssueChips:   grandIssueChips,
    l1MoneyTotal:      l1MoneyTotal,
    fmtMoney:          fmtMoney,
    persistOpen:       persistOpen
  };
})();
/*** END WORKSHEET V2 — SUMMARY ***********************************************/
