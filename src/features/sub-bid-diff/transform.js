/*** SUB-BID DIFF — TRANSFORM (diff engine) **********************************
 *
 * Pure data: given the bid line items (view_3680), SOW line items
 * (view_3921) and bid packages (view_3573), produce:
 *   - the candidate packages ranked by overlap with the current SOW
 *   - the chosen baseline package (auto-pick, overridable)
 *   - a tiered, line-level diff joined on field_2404 (bid → SOW line)
 *   - tallies + a labor-dollar headline
 *
 * The JOIN KEY is the bid item's field_2404 (REL_sow Line Item). Product
 * is never compared as an equivalence key — a model swap on the SOW line
 * is invisible unless it moves labor, which is exactly the intent.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;
  var F = ns.CONFIG.f;

  // ── value helpers ─────────────────────────────────────────────────────

  /** Numeric value of a (possibly currency-formatted) field. Prefers the
   *  _raw number Knack stamps on currency/number fields; falls back to
   *  stripping $ and commas from the formatted string. */
  function num(rec, key) {
    if (!rec) return 0;
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return raw;
    if (raw && typeof raw === 'object' && typeof raw.amount === 'number') return raw.amount;
    var v = (raw != null ? raw : rec[key]);
    if (v == null) return 0;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /** Array of connected record ids from a connection field's _raw. */
  function connIds(rec, key) {
    if (!rec) return [];
    var raw = rec[key + '_raw'];
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].id) out.push(raw[i].id);
      }
    } else if (raw && raw.id) {
      out.push(raw.id);
    }
    return out;
  }

  function firstConnId(rec, key) {
    var ids = connIds(rec, key);
    return ids.length ? ids[0] : '';
  }

  /** Plain-text value of a field (strip HTML, prefer raw identifier). */
  function text(rec, key) {
    if (!rec) return '';
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) {
      return raw.map(function (r) { return r && (r.identifier || r.id) || ''; })
                .filter(Boolean).join(', ');
    }
    var v = (rec[key] != null ? rec[key] : raw);
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function moneyEq(a, b) { return Math.abs((a || 0) - (b || 0)) <= ns.CONFIG.moneyEps; }

  // ── baseline selection ────────────────────────────────────────────────

  /** Rank every bid package by how much its line items overlap the current
   *  SOW line-item set (shared field_2404 targets). The baseline is the
   *  package with the most overlap, preferring "complete"-looking status. */
  function rankPackages(bidRecords, sowItems, bidPackages) {
    var sowIds = Object.create(null);
    for (var s = 0; s < sowItems.length; s++) {
      if (sowItems[s] && sowItems[s].id) sowIds[sowItems[s].id] = true;
    }

    // Group bid items by package id, tallying overlap.
    var byPkg = Object.create(null);
    for (var b = 0; b < bidRecords.length; b++) {
      var rec = bidRecords[b];
      var pkgId = firstConnId(rec, F.bidToPackage);
      if (!pkgId) continue;
      var entry = byPkg[pkgId] || (byPkg[pkgId] = { pkgId: pkgId, items: 0, overlap: 0, labor: 0 });
      entry.items++;
      entry.labor += num(rec, F.bidLabor);
      var sowLine = firstConnId(rec, F.bidToSowLine);
      if (sowLine && sowIds[sowLine]) entry.overlap++;
    }

    // Decorate with package metadata (name / status / pdf).
    var pkgMeta = Object.create(null);
    for (var p = 0; p < bidPackages.length; p++) {
      var pk = bidPackages[p];
      if (pk && pk.id) pkgMeta[pk.id] = pk;
    }

    var ranked = [];
    Object.keys(byPkg).forEach(function (pkgId) {
      var e = byPkg[pkgId];
      var meta = pkgMeta[pkgId];
      var status = meta ? text(meta, F.pkgStatus) : '';
      ranked.push({
        pkgId:    pkgId,
        name:     (meta ? text(meta, F.pkgName) : '') || 'Bid',
        status:   status,
        complete: ns.CONFIG.completeStatusRe.test(status),
        items:    e.items,
        overlap:  e.overlap,
        labor:    e.labor,
        hasPdf:   !!(meta && firstConnId(meta, F.pkgPdf)) ||
                  !!(meta && meta[F.pkgPdf])
      });
    });

    // Sort: complete-first, then most overlap, then most items.
    ranked.sort(function (a, b) {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (b.overlap !== a.overlap)   return b.overlap - a.overlap;
      return b.items - a.items;
    });
    return ranked;
  }

  // ── line-level diff ───────────────────────────────────────────────────

  /** Build the tiered diff for a single chosen baseline package. */
  function diffForPackage(pkgId, bidRecords, sowItems) {
    var rows = [];
    var tally = { covered: 0, spec: 0, material: 0, added: 0, orphan: 0 };
    var laborDelta = 0;           // current − sub, summed line-by-line
    var sowLaborTotal = 0, bidLaborTotal = 0;

    // Index SOW items by id, and bid items (for this package) by their
    // field_2404 target. A SOW line may collect >1 bid item → sum labor.
    var sowById = Object.create(null);
    for (var s = 0; s < sowItems.length; s++) {
      var si = sowItems[s];
      if (si && si.id) sowById[si.id] = si;
    }

    var bidBySowLine = Object.create(null);  // sowLineId → [bidItem,…]
    var pkgBidItems = [];
    for (var b = 0; b < bidRecords.length; b++) {
      var br = bidRecords[b];
      if (firstConnId(br, F.bidToPackage) !== pkgId) continue;
      pkgBidItems.push(br);
      bidLaborTotal += num(br, F.bidLabor);
      var line = firstConnId(br, F.bidToSowLine);
      if (line) (bidBySowLine[line] || (bidBySowLine[line] = [])).push(br);
    }

    // 1) Walk every CURRENT SOW line — matched or uncovered.
    var matchedSowIds = Object.create(null);
    for (var si2 = 0; si2 < sowItems.length; si2++) {
      var sow = sowItems[si2];
      if (!sow || !sow.id) continue;
      var sowLabor = num(sow, F.sowLabor);
      sowLaborTotal += sowLabor;
      var bids = bidBySowLine[sow.id];

      if (bids && bids.length) {
        matchedSowIds[sow.id] = true;
        var bidLabor = 0;
        for (var k = 0; k < bids.length; k++) bidLabor += num(bids[k], F.bidLabor);
        var d = sowLabor - bidLabor;
        laborDelta += d;

        var tier;
        if (!moneyEq(sowLabor, bidLabor)) tier = 'material';
        else if (specChanged(sow, bids[0])) tier = 'spec';
        else tier = 'covered';
        tally[tier]++;

        rows.push({
          tier:      tier,
          sowId:     sow.id,
          label:     text(sow, F.sowLabel) || text(bids[0], F.bidLabel),
          product:   text(sow, F.sowProduct),
          mdfIdf:    text(sow, F.sowMdfIdf),
          sortOrder: num(sow, F.sowSortOrder),
          sowLabor:  sowLabor,
          bidLabor:  bidLabor,
          delta:     d,
          bidCount:  bids.length
        });
      } else {
        // SOW line nobody bid → coverage gap (Tier 2).
        laborDelta += sowLabor;        // full SOW labor is "unpriced add"
        tally.added++;
        rows.push({
          tier:      'added',
          sowId:     sow.id,
          label:     text(sow, F.sowLabel),
          product:   text(sow, F.sowProduct),
          mdfIdf:    text(sow, F.sowMdfIdf),
          sortOrder: num(sow, F.sowSortOrder),
          sowLabor:  sowLabor,
          bidLabor:  0,
          delta:     sowLabor,
          bidCount:  0
        });
      }
    }

    // 2) Walk the package's bid items — flag orphans (no live SOW line).
    for (var pb = 0; pb < pkgBidItems.length; pb++) {
      var bi = pkgBidItems[pb];
      var sowLine2 = firstConnId(bi, F.bidToSowLine);
      var live = sowLine2 && sowById[sowLine2];
      if (live) continue;            // already counted as matched/spec/material
      // Orphan: sub priced work with no current SOW line.
      var bl = num(bi, F.bidLabor);
      laborDelta -= bl;              // sub priced something gone → credit
      tally.orphan++;
      rows.push({
        tier:      'orphan',
        sowId:     '',
        bidId:     bi.id,
        label:     text(bi, F.bidLabel),
        product:   text(bi, F.bidProduct),
        mdfIdf:    '',
        sortOrder: 1e9,             // sink orphans to the bottom
        sowLabor:  0,
        bidLabor:  bl,
        delta:     -bl,
        bidCount:  1
      });
    }

    // Canonical order: by MDF/IDF then sort order then label.
    rows.sort(function (a, b) {
      if (a.mdfIdf !== b.mdfIdf) {
        if (!a.mdfIdf) return 1;
        if (!b.mdfIdf) return -1;
        return a.mdfIdf < b.mdfIdf ? -1 : 1;
      }
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
    });

    var materialCount = tally.material + tally.added + tally.orphan;
    return {
      rows:          rows,
      tally:         tally,
      laborDelta:    laborDelta,
      sowLaborTotal: sowLaborTotal,
      bidLaborTotal: bidLaborTotal,
      materialCount: materialCount,       // Tier 1+2 — the "needs a look" count
      coverageGaps:  tally.added + tally.orphan,
      hasIssues:     materialCount > 0
    };
  }

  /** Spec-only change detection for a matched line: same labor, but a
   *  non-labor attribute (qty, product) differs. Demoted (Tier 1 'spec'),
   *  never hidden — catches the rare labor-neutral-but-breaking swap. */
  function specChanged(sow, bid) {
    var sq = num(sow, F.sowQty), bq = num(bid, F.bidQty);
    if (bq && sq && sq !== bq) return true;
    var sp = text(sow, F.sowProduct).toLowerCase();
    var bp = text(bid, F.bidProduct).toLowerCase();
    if (sp && bp && sp !== bp) return true;
    return false;
  }

  /** Top-level entry — rank packages, pick baseline (or honor override),
   *  build its diff. Returns everything render.js needs. */
  function buildDiff(bidRecords, sowItems, bidPackages, overridePkgId) {
    bidRecords  = bidRecords  || [];
    sowItems    = sowItems    || [];
    bidPackages = bidPackages || [];

    var ranked = rankPackages(bidRecords, sowItems, bidPackages);
    if (!ranked.length) {
      return { isEmpty: true, ranked: [], baselineId: '', diff: null };
    }
    var baselineId = '';
    if (overridePkgId) {
      for (var i = 0; i < ranked.length; i++) {
        if (ranked[i].pkgId === overridePkgId) { baselineId = overridePkgId; break; }
      }
    }
    if (!baselineId) baselineId = ranked[0].pkgId;

    var diff = diffForPackage(baselineId, bidRecords, sowItems);
    return {
      isEmpty:    false,
      ranked:     ranked,
      baselineId: baselineId,
      baseline:   ranked.filter(function (r) { return r.pkgId === baselineId; })[0],
      diff:       diff
    };
  }

  ns.transform = {
    buildDiff:   buildDiff,
    rankPackages: rankPackages,
    num: num, text: text, connIds: connIds, firstConnId: firstConnId
  };
})();
/*** END SUB-BID DIFF — TRANSFORM ********************************************/
