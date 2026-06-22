/*** BID REVIEW V2 — TRANSFORM ************************************************
 *
 * Lean Phase 1 pivot. Takes records from view_3680 (bids) and builds:
 *
 *   sowGrids: [
 *     {
 *       sowId, sowName,
 *       packages: [{ id, label, name }, ...],   // column axis
 *       rows: [                                   // row axis
 *         { id, sowItem, displayLabel, productName, sortOrder,
 *           cellsByPackage: { pkgId: {id, qty, rate, labor, laborDesc, ...} } }
 *       ]
 *     }
 *   ]
 *
 * This is a copy-and-prune of v1's transform.js — adapters preserved
 * verbatim, but the heavy stuff (eligibility, MDF/IDF L1 grouping,
 * noBid/surveyNoBid row synthesis, payload-only field projection) is
 * deferred until Phase 2. v1's transform stays the source of truth for
 * those concerns; v2 will grow into them.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG || !ns.CONFIG.fieldKeys) return;

  var FK = ns.CONFIG.fieldKeys;

  // bid record id → SOW line item id; (re)built each buildState() run, read by
  // getMismatches to resolve bid-side connections to SOW line items.
  var _bidToSow = Object.create(null);

  // ── adapters (verbatim from v1's transform.js) ──────────────

  function stripHtml(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/<[^>]*>/g, '').trim();
  }
  function raw(rec, key) {
    var v = rec[key];
    if (v == null) return '';
    if (typeof v === 'object' && v.raw != null) return stripHtml(v.raw);
    return stripHtml(v);
  }
  function rawHtml(rec, key) {
    function asStr(v) {
      if (v == null) return null;
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'object' && v.raw != null) return String(v.raw).trim();
      return null;
    }
    var disp = asStr(rec[key]);
    var rawStr = asStr(rec[key + '_raw']);
    var dispTags = disp && /<[a-z]/i.test(disp);
    var rawTags  = rawStr && /<[a-z]/i.test(rawStr);
    if (dispTags) return disp;
    if (rawTags)  return rawStr;
    return disp || rawStr || '';
  }
  function num(rec, key) {
    var s = raw(rec, key).replace(/[$,]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function bool(rec, key) {
    var v = raw(rec, key).toLowerCase();
    return v === 'yes' || v === 'true';
  }
  function connectionAll(rec, key) {
    var v = rec[key + '_raw'] || rec[key];
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return [v];
    return [];
  }
  function connectionId(rec, key) {
    var c = connectionAll(rec, key);
    return c.length ? (c[0].id || '') : '';
  }
  function connectionLabel(rec, key) {
    var c = connectionAll(rec, key);
    if (c.length) return stripHtml(c[0].identifier || '');
    return stripHtml(rec[key] || '');
  }

  // ── per-SOW pivot ────────────────────────────────────────────

  function extractSows(records) {
    var seen = Object.create(null);
    var list = [];
    for (var i = 0; i < records.length; i++) {
      var conns = connectionAll(records[i], FK.sow);
      for (var c = 0; c < conns.length; c++) {
        var id = conns[c].id;
        if (!id || seen[id]) continue;
        seen[id] = 1;
        list.push({ id: id, name: stripHtml(conns[c].identifier || ('SOW ' + list.length)) });
      }
    }
    return list;
  }

  function extractPackages(records) {
    var seen = Object.create(null);
    var list = [];
    for (var i = 0; i < records.length; i++) {
      var conns = connectionAll(records[i], FK.bidPackage);
      for (var c = 0; c < conns.length; c++) {
        var id = conns[c].id;
        if (!id || seen[id]) continue;
        seen[id] = 1;
        list.push({
          id: id,
          label: stripHtml(conns[c].identifier || ('Package ' + (list.length + 1))),
          name: stripHtml(conns[c].identifier || '')
        });
      }
    }
    return list;
  }

  function groupBySow(records, sowIdsByItem) {
    var buckets = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      // A bid record belongs to a SOW grid when EITHER its own field_2154
      // lists the SOW OR its related SOW line item (field_2404 → view_3921's
      // field_2154) is on the SOW. The line item's membership is
      // authoritative — without it, a record whose bid-side field_2154 has
      // drifted gets dropped from its SOW's matched rows and exiled into the
      // "belong to another SOW" block (naming the very SOW being viewed).
      var sowSet = Object.create(null);
      var conns = connectionAll(rec, FK.sow);
      for (var c = 0; c < conns.length; c++) {
        if (conns[c] && conns[c].id) sowSet[conns[c].id] = true;
      }
      if (sowIdsByItem) {
        var siId = connectionId(rec, FK.relatedSowItem);
        if (siId && sowIdsByItem[siId]) {
          for (var sk in sowIdsByItem[siId]) sowSet[sk] = true;
        }
      }
      for (var sid in sowSet) {
        if (!buckets[sid]) buckets[sid] = [];
        buckets[sid].push(rec);
      }
    }
    return buckets;
  }

  /**
   * Within a SOW bucket, pivot by line-item identity (rows) and bid
   * package (columns). Row identity is the relatedSowItem connection;
   * records without one get their own rec-keyed row.
   */
  function buildRowsForSow(records) {
    var rowMap = Object.create(null);
    var order  = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      // Mirror v1: drop survey-only records (not on any bid AND not
      // connected to a SOW). This keeps row identity (meta.id) identical
      // to v1 so CR buttons dispatched to v1's handlers resolve the row.
      var hasBid = connectionAll(rec, FK.bidPackage).length > 0;
      var hasSow = connectionAll(rec, FK.sow).length > 0;
      if (!hasBid && !hasSow) continue;
      var sowItem = connectionId(rec, FK.relatedSowItem);
      var key = sowItem ? ('sow::' + sowItem) : ('rec::' + rec.id);
      if (!rowMap[key]) { rowMap[key] = { meta: rec, cells: [] }; order.push(key); }
      rowMap[key].cells.push(rec);
    }
    var rows = [];
    for (var j = 0; j < order.length; j++) {
      var bucket = rowMap[order[j]];
      rows.push(buildRow(bucket.meta, bucket.cells));
    }
    rows.sort(function (a, b) {
      return (a.displayLabel || '').localeCompare(b.displayLabel || '');
    });
    return rows;
  }

  function buildRow(meta, cellRecords) {
    var cellsByPackage = Object.create(null);
    for (var i = 0; i < cellRecords.length; i++) {
      var rec = cellRecords[i];
      var pkgs = connectionAll(rec, FK.bidPackage);
      for (var p = 0; p < pkgs.length; p++) {
        var pid = pkgs[p].id;
        if (!pid) continue;
        if (cellsByPackage[pid]) {
          // COLLISION: another bid record on the SAME package already
          // filled this cell — i.e. two bid line items on one bid both
          // map to this SOW item. We used to silently drop the second
          // (the user never saw it). Instead, record it on the kept
          // cell so the UI can flag the duplication. (Can happen via the
          // "create variant" path mis-linking the new bid item.)
          var keep = cellsByPackage[pid];
          if (!keep.dupes) keep.dupes = [];
          keep.dupes.push({
            id:        rec.id,
            productName: raw(rec, FK.productName),
            qty:       num(rec, FK.qty),
            rate:      num(rec, FK.rate),
            labor:     num(rec, FK.labor),
            laborDesc: rawHtml(rec, FK.laborDesc)
          });
          continue;
        }
        cellsByPackage[pid] = {
          id:           rec.id,
          productName:  raw(rec, FK.productName),
          qty:          num(rec, FK.qty),
          rate:         num(rec, FK.rate),
          labor:        num(rec, FK.labor),
          laborDesc:    rawHtml(rec, FK.laborDesc),
          notes:        raw(rec, FK.notes),
          existCabling: bool(rec, FK.bidExistCabling),
          plenum:       bool(rec, FK.plenum),
          exterior:     bool(rec, FK.exterior),
          conduit:      raw(rec, FK.conduit),
          dropLength:   raw(rec, FK.dropLength),
          // Bid-side connection topology (mirror of the SOW side):
          // field_2380 Connected Devices, field_2381 Connected To.
          connDevice:   connectionAll(rec, FK.bidConnDevice),
          connTo:       connectionLabel(rec, FK.bidConnTo),
          connToId:     connectionId(rec, FK.bidConnTo)
        };
      }
    }
    return {
      id:           meta.id,
      sowItem:      connectionId(meta, FK.relatedSowItem),
      parentId:     connectionId(meta, 'field_2464'),
      requireSubBidSow: raw(meta, 'field_2479'),
      displayLabel: raw(meta, FK.displayLabel),
      productName:  raw(meta, FK.productName),
      sortOrder:    num(meta, FK.sortOrder),
      requireSubBid: raw(meta, FK.requireSubBid),
      // A bid-side row (view_3680) that has a SOW connection but ZERO bid
      // cells is "surveyed but not on any bid" → NOT ON BID treatment.
      // The bid RECORD still exists (just unlinked from a package), so we
      // snapshot its bid-side detail to display in the cut-out cell.
      surveyNoBid:  Object.keys(cellsByPackage).length === 0,
      detail: (Object.keys(cellsByPackage).length === 0) ? {
        side:    'BID',
        product: raw(meta, FK.productName),
        qty:     num(meta, FK.qty),
        rate:    num(meta, FK.rate),
        fee:     num(meta, FK.labor),
        desc:    rawHtml(meta, FK.laborDesc)
      } : null,
      noBid:        false,
      offSow:       false,
      mdfIdf:           connectionLabel(meta, FK.mdfIdf),
      mdfIdfId:         connectionId(meta, FK.mdfIdf),
      proposalBucket:   connectionLabel(meta, FK.proposalBucket),
      proposalBucketId: connectionId(meta, FK.proposalBucket),
      // SOW-side values for DIFF comparison — read from the bid record
      // (meta, view_3680), NOT view_3921. Mirrors v1 exactly: the product
      // comparison basis is field_1958 (sowProduct) on the bid record, not
      // the field_1949 connection v2 DISPLAYS in the SOW cell.
      sowProduct:    connectionLabel(meta, FK.sowProduct) || raw(meta, FK.sowProduct),
      sowLaborDesc:  rawHtml(meta, FK.sowLaborDesc),
      sowFee:        num(meta, FK.sowFee),
      // Per-item survey note lives on the bid record (field_2412), v1 parity.
      surveyNotes:   raw(meta, FK.notes),
      cellsByPackage: cellsByPackage
    };
  }

  // ── grouping (L1 = MDF/IDF; no L2 sub-headers) ─────────────
  //
  // L1 by MDF/IDF label only — proposal-bucket sub-headers were removed
  // so each MDF/IDF group is one flat list. Within the list, accessory
  // child rows (field_2464 parent) are woven in DIRECTLY beneath their
  // parent item; everything else keeps sort-order / label order. When no
  // row has an mdfIdf value, returns a single "__all__" group.

  // Order rows so each accessory follows its parent. Top-level rows sort
  // by sortOrder then displayLabel; an accessory whose parent isn't in
  // this group is treated as top-level so it never disappears.
  // Require Sub Bid (field_2479, the SOW line-item flag — NOT field_2478,
  // which is the bid record's flag) explicitly No/false. Mirrors the v2
  // worksheet's isRequireSubBidNoOrFalse: a row with a field_2464 parent +
  // this flag No is a child-only accessory, hidden from the grid (shown only
  // under its parent), regardless of proposal bucket.
  function isRequireSubBidNo(row) {
    var v = row && row.requireSubBidSow;
    if (v === false) return true;
    if (v == null) return false;
    var s = v.toString().replace(/<[^>]*>/g, '').trim().toLowerCase();
    return s === 'no' || s === 'false';
  }

  function weaveAccessories(rows) {
    // field_2464 (parentId) points at the parent SOW LINE ITEM id. Bid-
    // backed rows key on the bid-record id (row.id) with the SOW-item id in
    // row.sowItem, so match the parent by sowItem first, then id.
    var bySow = Object.create(null), byId = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var rr = rows[i];
      if (!rr) continue;
      if (rr.sowItem) bySow[rr.sowItem] = rr;
      if (rr.id) byId[rr.id] = rr;
    }
    function keyOf(r) { return r.sowItem || r.id; }
    function parentOf(r) {
      var pid = r.parentId;
      if (!pid) return null;
      var p = bySow[pid] || byId[pid] || null;
      return (p && p !== r) ? p : null;
    }
    function cmp(a, b) {
      var sa = a.sortOrder || 0, sb = b.sortOrder || 0;
      if (sa !== sb) return sa - sb;
      return (a.displayLabel || '').localeCompare(b.displayLabel || '');
    }
    var childrenByKey = Object.create(null);
    var topLevel = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var p = parentOf(r);
      if (p) {
        var pk = keyOf(p);
        (childrenByKey[pk] = childrenByKey[pk] || []).push(r);
        r.isAccessory = true;   // card.js indents these
        r.parentLabel = (p.sowItemData && p.sowItemData.productName) ||
                        p.productName || p.displayLabel || '';
      } else {
        topLevel.push(r);
      }
    }
    topLevel.sort(cmp);
    for (var k in childrenByKey) childrenByKey[k].sort(cmp);
    var out = [];
    var seen = Object.create(null);
    function emit(row) {
      var rk = keyOf(row);
      if (seen[rk]) return;
      seen[rk] = true;
      out.push(row);
      var kids = childrenByKey[rk];
      if (kids) for (var c = 0; c < kids.length; c++) emit(kids[c]);
    }
    for (var t = 0; t < topLevel.length; t++) emit(topLevel[t]);
    // Safety net: append any row not yet emitted (e.g. a parent cycle).
    for (var m = 0; m < rows.length; m++) {
      if (rows[m] && !seen[keyOf(rows[m])]) out.push(rows[m]);
    }
    return out;
  }

  // No-MDF rows are routed to a synthetic L1 by proposal-bucket text, just
  // like the device worksheet (groups.js): "service" → Project Wide
  // Services, "assumption" → Project Wide Assumptions, else Unassigned.
  function syntheticL1ForBucket(bucketLabel) {
    var lc = String(bucketLabel || '').toLowerCase();
    if (lc.indexOf('service') !== -1)    return 'Project Wide Services';
    if (lc.indexOf('assumption') !== -1) return 'Project Wide Assumptions';
    return 'Unassigned';
  }
  // Sort rank: real MDF/IDF first (alpha), then the synthetic groups last.
  function l1Rank(label) {
    if (label === 'Project Wide Services')    return 1;
    if (label === 'Project Wide Assumptions') return 2;
    if (label === 'Unassigned')               return 3;
    return 0;
  }

  // groupRows builds the L1 (MDF/IDF) tree. `removedRows` (optional) are
  // bucketed by the SAME MDF/IDF key and attached to their location's L1
  // as a default-collapsed "Removed" subgroup — so a removed item shows
  // under the location it was removed from, not in one consolidated pile.
  // A location that has ONLY removed items still gets its L1 (with just
  // the removed subgroup inside).
  function groupRows(rows, removedRows) {
    removedRows = removedRows || [];
    var mdfMap = Object.create(null);
    var removedMap = Object.create(null);
    var mdfOrder = [];
    function keyOf(r) { return r.mdfIdf || syntheticL1ForBucket(r.proposalBucket); }
    function ensure(k) {
      if (!mdfMap[k]) { mdfMap[k] = []; removedMap[k] = []; mdfOrder.push(k); }
    }
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j]; var k = keyOf(r); ensure(k); mdfMap[k].push(r);
    }
    for (var rm = 0; rm < removedRows.length; rm++) {
      var rr = removedRows[rm]; var rk = keyOf(rr); ensure(rk); removedMap[rk].push(rr);
    }
    mdfOrder.sort(function (a, b) {
      var ra = l1Rank(a), rb = l1Rank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    var groups = [];
    for (var gi = 0; gi < mdfOrder.length; gi++) {
      var mdfKey = mdfOrder[gi];
      var mdfRows = mdfMap[mdfKey];
      var rmRows  = removedMap[mdfKey];
      var mdfIdfId = '';
      for (var fi = 0; fi < mdfRows.length; fi++) {
        if (mdfRows[fi].mdfIdfId) { mdfIdfId = mdfRows[fi].mdfIdfId; break; }
      }
      if (!mdfIdfId) {
        for (var fr = 0; fr < rmRows.length; fr++) {
          if (rmRows[fr].mdfIdfId) { mdfIdfId = rmRows[fr].mdfIdfId; break; }
        }
      }
      var subgroups = [];
      if (rmRows.length) {
        subgroups.push({
          key:              mdfKey + '::removed',
          label:            'Removed — no longer on any SOW or bid',
          rows:             rmRows,
          removedItems:     true,
          defaultCollapsed: true
        });
      }
      groups.push({
        key: mdfKey, label: mdfKey, mdfIdfId: mdfIdfId,
        level: 1, rows: weaveAccessories(mdfRows), subgroups: subgroups
      });
    }
    return groups;
  }

  // ── "NO BID" rows from unbid SOW items (view_3921) ──────────
  //
  // Ported from v1's buildNoBidRows. A SOW line item (view_3921) that
  // is connected to a SOW but has no bid-side record at all is a "NOT
  // SURVEYED / not on any bid" row. We synthesize a row for it keyed by
  // SOW so it renders cut-out cells across every bid column with an
  // "+ Add to bid" action. Returns { sowId: [row, ...] }.
  function buildNoBidRows(sowItems) {
    var SFK = ns.CONFIG.sowItemFieldKeys || {};
    var bySow = Object.create(null);
    var list = sowItems || [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      if (!rec || !rec.id) continue;
      var conns = connectionAll(rec, SFK.sow);
      if (!conns.length) continue;
      for (var c = 0; c < conns.length; c++) {
        var sowId = conns[c].id;
        if (!sowId) continue;
        if (!bySow[sowId]) bySow[sowId] = [];
        bySow[sowId].push({
          id:               rec.id,
          sowItem:          rec.id,                 // it IS a SOW item
          parentId:         connectionId(rec, 'field_2464'),
          requireSubBidSow: raw(rec, 'field_2479'),
          displayLabel:     raw(rec, SFK.displayLabel) || connectionLabel(rec, SFK.product),
          productName:      raw(rec, SFK.productName),
          sortOrder:        num(rec, SFK.sortOrder),
          requireSubBid:    raw(rec, FK.requireSubBid),
          mdfIdf:           connectionLabel(rec, SFK.mdfIdf),
          mdfIdfId:         connectionId(rec, SFK.mdfIdf),
          proposalBucket:   connectionLabel(rec, SFK.proposalBucket),
          proposalBucketId: connectionId(rec, SFK.proposalBucket),
          // No bid record at all.
          cellsByPackage:   Object.create(null),
          noBid:            true,
          surveyNoBid:      false,
          offSow:           false,
          // Diff basis (unused for noBid cells, kept for shape parity).
          sowProduct:       connectionLabel(rec, SFK.product) || raw(rec, SFK.productName),
          sowLaborDesc:     rawHtml(rec, SFK.laborDesc),
          sowFee:           num(rec, SFK.fee),
          surveyNotes:      raw(rec, SFK.notes)
        });
      }
    }
    return bySow;
  }

  // Index bid-package records (view_3573) by id → { bidStatus, bidName,
  // pdfUrl, pdfFilename }. Ported from v1's buildPkgInfoMap.
  function buildPkgInfoMap(bidPackages) {
    var map = Object.create(null);
    if (!bidPackages || !bidPackages.length) return map;
    for (var i = 0; i < bidPackages.length; i++) {
      var rec = bidPackages[i];
      if (!rec || !rec.id) continue;
      var info = {};

      var bidStatus = '';
      var bsRaw = rec[FK.bidStatus + '_raw'];
      if (Array.isArray(bsRaw) && bsRaw.length && bsRaw[0].identifier) {
        bidStatus = stripHtml(bsRaw[0].identifier);
      } else if (bsRaw && typeof bsRaw === 'object' && bsRaw.identifier) {
        bidStatus = stripHtml(bsRaw.identifier);
      } else if (typeof bsRaw === 'string') {
        bidStatus = stripHtml(bsRaw);
      }
      if (!bidStatus) bidStatus = stripHtml(rec[FK.bidStatus] || '');
      if (bidStatus) info.bidStatus = bidStatus;

      if (FK.bidName) {
        var bidName = raw(rec, FK.bidName);
        if (bidName) info.bidName = bidName;
      }

      // REL_SOW on the bid package (field_2387). Gates which SOW grids this bid
      // appears on: a bid tied to a sibling SOW must NOT show on other SOWs'
      // grids (v1 parity) — without this, a bid for SOW-A leaks onto SOW-B's
      // grid and dumps all its SOW-A items into "belong to another SOW".
      if (FK.bidSow) {
        var bidSowIds = [];
        var bsConns = connectionAll(rec, FK.bidSow);
        for (var bsi = 0; bsi < bsConns.length; bsi++) {
          if (bsConns[bsi] && bsConns[bsi].id) bidSowIds.push(bsConns[bsi].id);
        }
        info.bidSowIds = bidSowIds;
      }

      var rawPdf = rec[FK.bidPdf + '_raw'] || rec[FK.bidPdf];
      if (rawPdf) {
        if (typeof rawPdf === 'object' && rawPdf.url) {
          info.pdfUrl = rawPdf.url; info.pdfFilename = rawPdf.filename || '';
        } else if (typeof rawPdf === 'string') {
          var m  = rawPdf.match(/href="([^"]+)"/);
          var fn = rawPdf.match(/>([^<]+)<\/a>/);
          if (m) { info.pdfUrl = m[1]; info.pdfFilename = fn ? fn[1] : ''; }
        }
      }

      map[rec.id] = info;
    }
    return map;
  }

  function buildState(records, sowItems, bidPackages) {
    var sows = extractSows(records);
    // Also surface SOWs reachable through the SOW line items (view_3921): a bid
    // record's own field_2154 can be empty while its related line item IS on a
    // SOW (the line item is authoritative — same rule groupBySow uses). Without
    // this, a bid set whose SOW link lives only on the line items renders 0 SOW
    // grids even though the SOW has items to review.
    (function unionSowsFromItems() {
      var _SFK0 = ns.CONFIG.sowItemFieldKeys || {};
      var seen = Object.create(null);
      for (var s = 0; s < sows.length; s++) seen[sows[s].id] = true;
      var items = sowItems || [];
      for (var j = 0; j < items.length; j++) {
        var conns = connectionAll(items[j], _SFK0.sow);
        for (var c = 0; c < conns.length; c++) {
          var id = conns[c] && conns[c].id;
          if (!id || seen[id]) continue;
          seen[id] = true;
          sows.push({ id: id, name: stripHtml(conns[c].identifier || ('SOW ' + sows.length)) });
        }
      }
    })();
    // bid record id → its SOW line item id (field_2404 relatedSowItem). Lets
    // the connected-device / connected-to diff resolve a bid record's
    // connections (field_2380/2381 point at OTHER bid records) to SOW line
    // items, so both sides compare in the same id space — not by mismatched
    // display labels ("…Extended Transmission" vs "…Ex").
    _bidToSow = Object.create(null);
    for (var _bti = 0; _bti < records.length; _bti++) {
      var _btr = records[_bti];
      if (_btr && _btr.id) _bidToSow[_btr.id] = connectionId(_btr, FK.relatedSowItem);
    }
    var sowNameById = Object.create(null);
    for (var sni = 0; sni < sows.length; sni++) sowNameById[sows[sni].id] = sows[sni].name;
    // SOW line item → its OWN SOW membership (field_2154). Built before
    // groupBySow so a matched bid record buckets into the SOW(s) its line
    // item belongs to, even when the bid record's own field_2154 has drifted.
    var _SFK = ns.CONFIG.sowItemFieldKeys || {};
    var sowIdsByItem = Object.create(null);
    var _siList = sowItems || [];
    for (var _q = 0; _q < _siList.length; _q++) {
      var _sq = _siList[_q];
      if (!_sq || !_sq.id) continue;
      var _qc = connectionAll(_sq, _SFK.sow);
      var _qm = Object.create(null);
      for (var _qj = 0; _qj < _qc.length; _qj++) {
        if (_qc[_qj] && _qc[_qj].id) _qm[_qc[_qj].id] = true;
      }
      sowIdsByItem[_sq.id] = _qm;
    }
    var buckets = groupBySow(records, sowIdsByItem);
    var pkgInfo = buildPkgInfoMap(bidPackages);

    // Index SOW items by id for fast per-row lookup. The row carries a
    // `sowItem` id from the bid record's field_2404 (relatedSowItem);
    // we use it to attach the SOW-side product / qty / fee / desc so
    // each row reads as "this SOW line item, compared across these bids".
    var SFK = ns.CONFIG.sowItemFieldKeys || {};
    var sowItemIndex = Object.create(null);
    var sowFullByItem = Object.create(null); // keeps the raw record for expand-panel use
    var sowItemList = sowItems || [];
    for (var si = 0; si < sowItemList.length; si++) {
      var s = sowItemList[si];
      if (!s || !s.id) continue;
      sowFullByItem[s.id] = s;
      // Authoritative SOW membership: the SOW item's own field_2154
      // connections. A bid row can still appear under a SOW via the BID
      // record's connection after the line item was disconnected —
      // comparing against this set flags those "not on this SOW" rows.
      var sowConns = connectionAll(s, SFK.sow);
      var sowIds = Object.create(null);
      for (var sc = 0; sc < sowConns.length; sc++) {
        if (sowConns[sc] && sowConns[sc].id) sowIds[sowConns[sc].id] = true;
      }
      sowItemIndex[s.id] = {
        id:          s.id,
        sowIds:      sowIds,
        // Read the product connection FIRST. On view_3921, field_1958
        // ("stored product name") renders as a concatenation of the
        // line item's product AND its mounting accessories with no
        // separator — so `raw(s, field_1958)` produces unusable
        // garbage like "Pole Mount BracketRound Electrical Box Mount".
        // The connection on field_1949 holds just the single product
        // identifier, which is what we actually want here.
        productName: connectionLabel(s, SFK.product) || raw(s, SFK.productName),
        qty:         num(s, SFK.qty),
        fee:         num(s, SFK.fee),
        installFee:  num(s, SFK.installFee),
        equipmentTotal: num(s, SFK.equipmentTotal),
        laborDesc:   rawHtml(s, SFK.laborDesc),
        displayLabel: raw(s, SFK.displayLabel),
        surveyNotes: raw(s, SFK.notes),
        mdfIdf:      connectionLabel(s, SFK.mdfIdf),
        mdfIdfId:    connectionId(s, SFK.mdfIdf),
        proposalBucket: connectionLabel(s, SFK.proposalBucket),
        // Connection topology for the comparison cells. An NVR/switch has
        // connDevice (field_1957) populated (its cameras); a camera/reader
        // has connTo (field_2197) populated (its NVR) — the cell renders
        // whichever is present, so each device shows the appropriate field.
        connDevice:     connectionAll(s, SFK.connDevice),
        connTo:         connectionLabel(s, SFK.connTo),
        connToId:       connectionId(s, SFK.connTo),
        // Cabling attributes for the comparison cells (cam/reader). Diffed
        // against the bid record's own cabling fields in getMismatches.
        existCabling:   bool(s, SFK.existCabling),
        plenum:         bool(s, SFK.plenum),
        exterior:       bool(s, SFK.exterior),
        conduit:        raw(s, SFK.conduit),
        dropLength:     raw(s, SFK.dropLength)
      };
    }

    // SOW items that aren't on any bid → synthesized "NOT SURVEYED" rows,
    // keyed by SOW. Merged into each SOW grid below.
    var noBidBySow = buildNoBidRows(sowItemList);

    // ── Bid-column "touch" model + global package index (v1 parity) ──
    // A bid column shows on a SOW grid when the bid TOUCHES that SOW —
    // i.e. any of its records' own field_2154 lists the SOW, OR the
    // record's related SOW line item is on the SOW. This lets a bid
    // appear on every SOW it touches, and lets us collect the bid's items
    // that live on OTHER SOWs into a dedicated "Other items" block.
    var allPackages = extractPackages(records);
    var pkgAllRecords = Object.create(null);  // pkgId → [every record on it]
    for (var pai = 0; pai < records.length; pai++) {
      var paPkgs = connectionAll(records[pai], FK.bidPackage);
      for (var pap = 0; pap < paPkgs.length; pap++) {
        var paPid = paPkgs[pap].id;
        if (!paPid) continue;
        (pkgAllRecords[paPid] = pkgAllRecords[paPid] || []).push(records[pai]);
      }
    }
    function recordTouchesSow(rec, sowId) {
      var sc = connectionAll(rec, FK.sow);
      for (var x = 0; x < sc.length; x++) {
        if (sc[x] && sc[x].id === sowId) return true;
      }
      var siId = connectionId(rec, FK.relatedSowItem);
      if (siId && sowItemIndex[siId] && sowItemIndex[siId].sowIds &&
          sowItemIndex[siId].sowIds[sowId]) return true;
      return false;
    }
    function packageTouchesSow(pkgId, sowId) {
      var precs = pkgAllRecords[pkgId] || [];
      for (var t = 0; t < precs.length; t++) {
        if (recordTouchesSow(precs[t], sowId)) return true;
      }
      return false;
    }

    // Shared child-only test — applied to both matched rows and the "other
    // items" rows, AND to the displayRows grouping filter below. Mirrors the
    // device-worksheet rule: a row is a child-only accessory (hidden from the
    // grid, shown nested under its parent) ONLY when it has a field_2464
    // parent AND that parent is loaded here. A No-flag row with NO loaded
    // parent — e.g. a standalone "unassigned" line item — must stay visible.
    //
    // CRITICAL: read BOTH the flag (field_2479) and the parent (field_2464)
    // off the SOW LINE ITEM (sowFullRecord, view_3921) — never off the bid
    // record. A bid record's own field_2464 can point at a parent even when
    // the line item is standalone, so keying off row.parentId (which is the
    // bid record's parent for matched rows) silently dropped standalone
    // No-items (e.g. a Door Position Switch) from the grid.
    function sowSideParentId(row) {
      if (row.sowFullRecord) return connectionId(row.sowFullRecord, 'field_2464') || '';
      return row.parentId || '';   // no SOW record loaded → fall back to bid side
    }
    function sowSideRequireSubBidNo(row) {
      var flag = row.sowFullRecord
        ? raw(row.sowFullRecord, 'field_2479')
        : row.requireSubBidSow;
      if (flag === false) return true;
      if (flag == null) return false;
      return /^(no|false)$/i.test(String(flag).replace(/<[^>]*>/g, '').trim());
    }
    function isChildOnlyAccessory(row) {
      if (!sowSideRequireSubBidNo(row)) return false;
      var pid = sowSideParentId(row);
      return !!(pid && sowItemIndex[pid]);
    }
    function keepRow(row) {
      return !isChildOnlyAccessory(row);
    }

    // ── "Removed" items — no longer on ANY SOW and not on any bid ──
    // When a contractor removes an item from a bid and it's then pulled
    // from the SOW, the survey line item (view_3921) is left with no SOW
    // connection and no bid record. v1 (and v2 until now) drop these
    // entirely, which makes reviewers wonder whether the item was lost or
    // deliberately removed. We surface them in a default-collapsed section
    // atop every SOW grid so the removal reads as intentional.
    var bidItemIds = Object.create(null);   // SOW-item ids referenced by an on-bid record
    for (var bii = 0; bii < records.length; bii++) {
      if (!connectionAll(records[bii], FK.bidPackage).length) continue;
      var bsi = connectionId(records[bii], FK.relatedSowItem);
      if (bsi) bidItemIds[bsi] = true;
    }
    var removedRows = [];
    var removedSeen = Object.create(null);   // dedupe by SOW-item id / rec id

    // Source B (runs FIRST) — leftover view_3680 bid-side records with NO
    // bid package AND no SOW connection. These items WERE on a bid (a bid
    // record still exists for them), so they read as "removed from bid":
    // the bid item is intact, just disconnected. We show the bid item's
    // detail in the SOW column and offer "Reinstate". Running this before
    // Source A means an item that has a leftover bid record always carries
    // the bid snapshot (side='BID') rather than the SOW snapshot.
    for (var obi = 0; obi < records.length; obi++) {
      var obrec = records[obi];
      if (!obrec || !obrec.id) continue;
      if (connectionAll(obrec, FK.bidPackage).length) continue; // still on a bid
      if (connectionAll(obrec, FK.sow).length) continue;        // still on a SOW
      var obsi = connectionId(obrec, FK.relatedSowItem);
      var okey = obsi || ('rec::' + obrec.id);
      if (removedSeen[okey] || (obsi && removedSeen[obsi])) continue;
      removedSeen[okey] = true;
      if (obsi) removedSeen[obsi] = true;
      var obrow = buildRow(obrec, [obrec]);   // empty cells (no package)
      obrow.removed      = true;
      obrow.noBid        = true;
      obrow.surveyNoBid  = false;
      obrow.offSow       = false;
      obrow.hasBidRecord = true;              // bid item exists → "Reinstate"
      var obIdx = obsi ? (sowItemIndex[obsi] || null) : null;
      obrow.sowItemData   = obIdx;
      obrow.sowFullRecord = obsi ? (sowFullByItem[obsi] || null) : null;
      // What it WAS — bid-side snapshot read straight off the leftover
      // view_3680 record (its per-package cell is gone with the package).
      obrow.detail = {
        side:    'BID',
        product: raw(obrec, FK.productName) || obrow.productName,
        qty:     num(obrec, FK.qty),
        fee:     num(obrec, FK.labor),
        desc:    rawHtml(obrec, FK.laborDesc)
      };
      removedRows.push(obrow);
    }

    // Source A — view_3921 survey items off ALL SOWs and not on a bid, with
    // NO leftover bid record (deduped against Source B). These were never
    // surveyed onto a bid, so they read as "not surveyed": no bid item
    // exists → offer "Add to bid". We show the SOW-side snapshot of what
    // the item was.
    for (var rmi = 0; rmi < sowItemList.length; rmi++) {
      var rrec = sowItemList[rmi];
      if (!rrec || !rrec.id) continue;
      if (connectionAll(rrec, SFK.sow).length) continue;   // still on a SOW
      if (bidItemIds[rrec.id]) continue;                   // still on a bid
      if (removedSeen[rrec.id]) continue;                  // already from Source B
      removedSeen[rrec.id] = true;
      var aIdx = sowItemIndex[rrec.id] || null;
      removedRows.push({
        id:               rrec.id,
        sowItem:          rrec.id,
        parentId:         connectionId(rrec, 'field_2464'),
        requireSubBidSow: raw(rrec, 'field_2479'),
        displayLabel:     raw(rrec, SFK.displayLabel) || connectionLabel(rrec, SFK.product),
        productName:      raw(rrec, SFK.productName),
        sortOrder:        num(rrec, SFK.sortOrder),
        requireSubBid:    raw(rrec, FK.requireSubBid),
        mdfIdf:           connectionLabel(rrec, SFK.mdfIdf),
        mdfIdfId:         connectionId(rrec, SFK.mdfIdf),
        proposalBucket:   connectionLabel(rrec, SFK.proposalBucket),
        proposalBucketId: connectionId(rrec, SFK.proposalBucket),
        cellsByPackage:   Object.create(null),
        noBid:            true,    // empty cells → cut-out treatment
        surveyNoBid:      false,
        offSow:           false,
        removed:          true,
        hasBidRecord:     false,   // no bid item → "Add to bid"
        // What the item WAS — SOW-side snapshot (no bid record exists).
        detail: {
          side:    'SOW',
          product: (aIdx && aIdx.productName) || connectionLabel(rrec, SFK.product) || raw(rrec, SFK.productName),
          qty:     aIdx ? aIdx.qty : num(rrec, SFK.qty),
          fee:     aIdx ? aIdx.fee : num(rrec, SFK.fee),
          desc:    aIdx ? aIdx.laborDesc : rawHtml(rrec, SFK.laborDesc)
        },
        sowItemData:      aIdx,
        sowFullRecord:    sowFullByItem[rrec.id]  || null
      });
    }

    if (ns.CONFIG.debug) {
      var _emptySow = 0;
      for (var ds = 0; ds < sowItemList.length; ds++) {
        if (sowItemList[ds] && !connectionAll(sowItemList[ds], SFK.sow).length) _emptySow++;
      }
      try {
        console.log('[scw-br-v2] removed-items scan', {
          sowItems: sowItemList.length,
          sowItemsWithEmptySowConn: _emptySow,
          bidRecords: records.length,
          onBidRefs: Object.keys(bidItemIds).length,
          removedRows: removedRows.length,
          SFK_sow: SFK.sow, FK_sow: FK.sow
        });
      } catch (e) {}
    }

    var sowGrids = [];
    for (var i = 0; i < sows.length; i++) {
      var sow = sows[i];
      var bucket = buckets[sow.id] || [];
      // Columns: every package that TOUCHES this SOW (not just ones with
      // a bucketed record), cloned so per-SOW totals/status don't bleed
      // across grids.
      var packages = [];
      for (var ap = 0; ap < allPackages.length; ap++) {
        if (!packageTouchesSow(allPackages[ap].id, sow.id)) continue;
        // Sibling-SOW gate (v1 parity): a bid whose REL_SOW (field_2387) is set
        // to OTHER SOW(s) and NOT this one is a bid for a different SOW — exclude
        // it so its items don't get dumped into this grid's "belong to another
        // SOW" block. Empty bidSow = unrestricted (shows on every SOW it touches).
        var _pkInfo = pkgInfo[allPackages[ap].id];
        var _bidSowIds = (_pkInfo && _pkInfo.bidSowIds) || [];
        if (_bidSowIds.length && _bidSowIds.indexOf(sow.id) === -1) continue;
        var pc = {};
        for (var pk in allPackages[ap]) {
          if (Object.prototype.hasOwnProperty.call(allPackages[ap], pk)) pc[pk] = allPackages[ap][pk];
        }
        packages.push(pc);
      }
      var rows = buildRowsForSow(bucket);

      // Merge in NO BID rows for this SOW — skip any whose SOW item is
      // already represented by a bid-side (view_3680) row.
      var existingSowItems = Object.create(null);
      for (var ei = 0; ei < rows.length; ei++) {
        if (rows[ei].sowItem) existingSowItems[rows[ei].sowItem] = true;
      }
      var noBidRows = noBidBySow[sow.id] || [];
      for (var nb = 0; nb < noBidRows.length; nb++) {
        if (noBidRows[nb].sowItem && existingSowItems[noBidRows[nb].sowItem]) continue;
        rows.push(noBidRows[nb]);
      }

      // Attach the SOW-item snapshot to each row so card.js can render
      // the leftmost SOW column. Rows whose relatedSowItem points at a
      // record we never loaded fall through with `sowItemData: null`.
      // Also flag `offSow`: the bid record references this SOW, but the
      // line item's OWN field_2154 no longer lists it (on-bid, not on
      // this SOW). noBid rows are on the SOW by definition → offSow stays
      // false.
      for (var r = 0; r < rows.length; r++) {
        var sid = rows[r].sowItem;
        var sidx = sid ? (sowItemIndex[sid] || null) : null;
        rows[r].sowItemData   = sidx;
        rows[r].sowFullRecord = sid ? (sowFullByItem[sid] || null) : null;
        // Group by the SOW LINE ITEM's own MDF/IDF (field_1946) — the value
        // the worksheet edits and the authoritative location — rather than the
        // bid record's copied field_2375 that buildRow read. Clearing/moving
        // MDF in the worksheet now regroups the row here (a no-MDF item drops
        // into the synthetic "Unassigned" L1 instead of being stranded under
        // the bid's stale MDF). Only when the SOW item is loaded; otherwise
        // keep the bid-side value.
        if (sidx) {
          rows[r].mdfIdf   = sidx.mdfIdf || '';
          rows[r].mdfIdfId = sidx.mdfIdfId || '';
          // Synthetic L1 routing (Project Wide Services/Assumptions vs
          // Unassigned) keys off the proposal bucket — also take it from the
          // SOW line item so a no-MDF item lands in the bucket the worksheet
          // shows, not the bid record's copy.
          rows[r].proposalBucket = sidx.proposalBucket || '';
        }
        if (sidx && sidx.sowIds && !sidx.sowIds[sow.id]) rows[r].offSow = true;
      }
      // Drop informational line items the bidder isn't pricing
      // (require-sub-bid = No).
      rows = rows.filter(keepRow);

      // ── "Other items on these bids (not on this SOW)" ──────────
      // Every item on a displayed bid must appear in its column. Items
      // whose line item isn't on this SOW have no matched row, so collect
      // them into a separate bottom block. Skip records already shown as
      // matched rows (by record id).
      var shownRecIds = Object.create(null);
      for (var sri = 0; sri < rows.length; sri++) {
        var scells = rows[sri].cellsByPackage || {};
        for (var scp in scells) {
          if (scells[scp] && scells[scp].id) shownRecIds[scells[scp].id] = true;
        }
      }
      var otherRecs = [], seenOther = Object.create(null);
      for (var oc = 0; oc < packages.length; oc++) {
        var oprecs = pkgAllRecords[packages[oc].id] || [];
        for (var op = 0; op < oprecs.length; op++) {
          var orec = oprecs[op];
          if (shownRecIds[orec.id] || seenOther[orec.id]) continue;
          seenOther[orec.id] = true;
          otherRecs.push(orec);
        }
      }
      // "Other items" split into TWO kinds, treated differently:
      //   • on-another-SOW — the bid item HAS a SOW line item, it just
      //     belongs to a different SOW. Informational (cut-out, shows
      //     which SOW it's on).
      //   • bid-only — added to the bid with NO corresponding SOW item
      //     anywhere. Actionable: the SOW cell offers "+ Add to SOW".
      var builtOther = otherRecs.length ? buildRowsForSow(otherRecs) : [];
      var otherSowRows = [], bidOnlyRows = [];
      for (var orw = 0; orw < builtOther.length; orw++) {
        var orr = builtOther[orw];
        var oid  = orr.sowItem;
        var oIdx = oid ? (sowItemIndex[oid] || null) : null;
        orr.sowItemData   = oIdx;
        orr.sowFullRecord = oid ? (sowFullByItem[oid] || null) : null;
        // keepRow must run AFTER sowFullRecord is attached so its child-only
        // test reads the SOW line item (not the bid record, whose field_2464
        // is often empty). Otherwise a child-only accessory that the matched
        // loop already dropped gets re-collected here and shown as a bogus
        // "On Bid — not on SOW" row instead of nesting under its parent.
        if (!keepRow(orr)) continue;
        // Not on THIS SOW → excluded from SOW totals, still in bid total.
        orr.offSow       = true;
        orr.otherBidItem = true;
        // SOW(s) this item belongs to OTHER than the one being viewed. An item
        // on the current SOW must never be classed "belong to another SOW"
        // (that produced an "on 1229" row inside the 1229 grid) — with the
        // groupBySow fix it's already a matched row, but guard here too.
        var otherSowIds = (oIdx && oIdx.sowIds)
          ? Object.keys(oIdx.sowIds).filter(function (id) { return id !== sow.id; })
          : [];
        if (otherSowIds.length) {
          orr.otherKind = 'other-sow';
          // Names of the OTHER SOW(s) this item belongs to, for display.
          orr.otherSowNames = otherSowIds
            .map(function (id) { return sowNameById[id] || ''; })
            .filter(Boolean);
          otherSowRows.push(orr);
        } else {
          orr.otherKind = 'bid-only';
          orr.needsSow  = true;   // → SOW cell offers "+ Add to SOW"
          bidOnlyRows.push(orr);
        }
      }
      var otherRows = otherSowRows.concat(bidOnlyRows);

      // Rows used for totals/grid include the "other" items; rendering
      // keeps them in dedicated bottom groups so the matched grid is
      // unaffected.
      var allRows = otherRows.length ? rows.concat(otherRows) : rows;

      // ── Column totals + SOW match delta ────────────────────────
      // SOW sub-bid total = Σ SOW-item fee; install = Σ install fee, both
      // excluding offSow rows. Each bid column total = Σ cell labor
      // across ALL rows (matched + other). A bid "matches" within a penny.
      var sowSub = 0, sowInstall = 0;
      for (var sr = 0; sr < allRows.length; sr++) {
        var sdat = allRows[sr].sowItemData;
        if (sdat && !allRows[sr].offSow) {
          sowSub     += sdat.fee || 0;
          sowInstall += sdat.installFee || 0;
        }
      }
      for (var pi = 0; pi < packages.length; pi++) {
        var pkgTotal = 0, onSowCount = 0;
        for (var pr = 0; pr < allRows.length; pr++) {
          var cpkg = allRows[pr].cellsByPackage[packages[pi].id];
          if (cpkg) {
            pkgTotal += cpkg.labor || 0;
            if (!allRows[pr].offSow) onSowCount++;
          }
        }
        packages[pi].subBidTotal   = pkgTotal;
        packages[pi].deltaVsSow    = pkgTotal - sowSub;
        packages[pi].matchesSow    = Math.abs(pkgTotal - sowSub) <= 0.01;
        // A column whose items ALL live on other SOWs has nothing matched
        // here — flag it so the renderer can de-emphasize / auto-collapse.
        packages[pi].onSowItemCount = onSowCount;
        packages[pi].noOnSowItems   = (onSowCount === 0);
        // Identity/status from the bid-package record (view_3573).
        var info = pkgInfo[packages[pi].id] || {};
        packages[pi].bidStatus   = info.bidStatus || '';
        packages[pi].bidName     = info.bidName || '';
        packages[pi].pdfUrl      = info.pdfUrl || '';
        packages[pi].pdfFilename = info.pdfFilename || '';
      }

      // v2 worksheet rule: a SOW item that has a field_2464 parent AND whose
      // Require Sub Bid (field_2479) is No/false is a child-only accessory —
      // shown only under its parent (embedded card), never as its own grid
      // row. Hide only when the parent is loaded here (otherwise it would
      // vanish with nowhere to show), mirroring collectAttachedAccessoryIds.
      var displayRows = [];
      for (var fr = 0; fr < rows.length; fr++) {
        var frow = rows[fr];
        // Same SOW-side child-only rule as keepRow — read parent/flag off the
        // SOW line item, not the bid record, so standalone No-items (e.g. a
        // Door Position Switch with no parent) stay in the grid.
        if (isChildOnlyAccessory(frow)) continue;
        displayRows.push(frow);
      }
      // Bid-only items (on these bids, no SOW item yet) render INSIDE the
      // MDF/IDF group their bid record's field_2375 matches — or a synthetic
      // Unassigned / Project Wide group when they have no location — rather
      // than being pulled out into a separate "On Bid — not on SOW" block.
      // They keep offSow/needsSow so the SOW cell still cuts out and offers
      // "+ Add to SOW"; they just sit in context with the matched rows.
      // Removed rows are bucketed into their MDF/IDF L1 as a collapsed
      // "Removed" subgroup (groupRows handles it) — no longer a single
      // pile pinned to the top.
      var groups = groupRows(
        bidOnlyRows.length ? displayRows.concat(bidOnlyRows) : displayRows,
        removedRows
      );
      // "Belong to another SOW" stays at the BOTTOM.
      if (otherSowRows.length) {
        groups.push({
          key:           '__other_sow_items__',
          label:         'On these bids — belong to another SOW',
          mdfIdfId:      '',
          level:         1,
          rows:          otherSowRows,
          subgroups:     [],
          otherBidItems: true
        });
      }

      sowGrids.push({
        sowId:    sow.id,
        sowName:  sow.name,
        packages: packages,
        sowTotals: { subBid: sowSub, install: sowInstall },
        rows:     allRows,
        groups:   groups
      });
    }
    return { sowGrids: sowGrids, isEmpty: sowGrids.length === 0 };
  }

  // Diff a bid cell against its SOW line item. Ported from v1's
  // getMismatches, restricted to the fields v2 surfaces in cells
  // (product / labor desc / fee). Comparison fields are read off the bid
  // record (see buildRow) so the basis matches v1, not v2's display field.
  function getMismatches(row, cell) {
    if (!row || !row.sowItem || !cell) return null;
    function norm(v) {
      if (v == null) return '';
      return String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
        .toLowerCase().trim();
    }
    // Product comparison: the SOW side renders the product CONNECTION
    // label ("Name - SKU"), the bid side renders the stored product name
    // ("Name") — same product, different string. Strip the trailing
    // " - SKU" so we compare base product names, and don't flag when
    // either side is blank (nothing meaningful to compare).
    function baseProduct(v) {
      var s = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ');
      var i = s.lastIndexOf(' - ');
      if (i > 0) s = s.slice(0, i);
      s = s.replace(/\s+/g, ' ').toLowerCase().trim();
      // Ignore a leading article so "The Admiral Pro" == "Admiral Pro".
      s = s.replace(/^(?:the|a|an)\s+/, '');
      return s;
    }
    var sowProd  = (row.sowItemData && row.sowItemData.productName) || row.sowProduct;
    var spBase   = baseProduct(sowProd);
    var cpBase   = baseProduct(cell.productName);
    var productDiff = (spBase && cpBase) ? (spBase !== cpBase) : false;
    // Connection topology diff. SOW item: field_1957 (connDevice) / field_2197
    // (connTo). Bid record: field_2380 / field_2381. The two sides reference
    // DIFFERENT record sets (SOW items vs bid items) for the same physical
    // devices, so compare by normalized label, not id. Anchor on the SOW side
    // having a value (the reference): a bid that dropped a connection the SOW
    // expects counts as a diff; a row with no SOW-side topology is never flagged.
    // Resolve a connection to the SOW line item it represents, so both sides
    // compare in the same id space. SOW-side connections (field_1957/2197)
    // already point AT SOW line items → use the id verbatim. Bid-side
    // connections (field_2380/2381) point at OTHER bid records → map each
    // through _bidToSow to its SOW line item. A bid record with no SOW
    // mapping (or an unresolved id) contributes nothing.
    function sowIdOf(id, fromBid) {
      if (!id) return '';
      return fromBid ? (_bidToSow[id] || '') : id;
    }
    function connIdSet(arr, fromBid) {
      var set = Object.create(null);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          var sid = sowIdOf(arr[i] && arr[i].id, fromBid);
          if (sid) set[sid] = true;
        }
      }
      return set;
    }
    function sameSet(a, b) {
      var ka = Object.keys(a);
      if (ka.length !== Object.keys(b).length) return false;
      for (var i = 0; i < ka.length; i++) if (!b[ka[i]]) return false;
      return true;
    }
    var sd    = row.sowItemData || {};
    // Connected Devices: compare the FULL set of connected devices, matched by
    // their underlying SOW line item id (label-agnostic). Anchor on the SOW
    // side carrying connections (the reference) so a row with no SOW-side
    // topology is never flagged.
    var sowCDset = connIdSet(sd.connDevice, false);
    var connDeviceDiff = Object.keys(sowCDset).length
      ? !sameSet(sowCDset, connIdSet(cell.connDevice || [], true)) : false;
    // Connected To: single connection, compared by SOW line item id.
    var sowCTid = sowIdOf(sd.connToId, false);
    var connToDiff = sowCTid ? (sowCTid !== sowIdOf(cell.connToId, true)) : false;
    // Word-sequence compare for free text — strips tags/punctuation/case down
    // to the same [a-z0-9] tokens the card's markWordDiff highlights, so a
    // field flags as "different" ONLY when there's an actual word to underline
    // (no more cells tinted with nothing visible). Labor-desc basis is the
    // DISPLAYED SOW desc (field_2020, sowItemData) so the flag + underlines
    // match the SOW column the reviewer sees, not the bid-snapshot field_2019.
    function wseq(v) {
      var w = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ')
        .toLowerCase().match(/[a-z0-9]+/g);
      return w ? w.join(' ') : '';
    }
    // Numeric cabling value (conduit / drop length in feet). Blank / non-numeric
    // → null; an explicit 0 stays 0 (a real "0 ft" spec, shown + comparable).
    function cnum(v) {
      var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
      if (s === '') return null;
      var n = parseFloat(s);
      return isNaN(n) ? null : n;
    }
    var sowDesc = (row.sowItemData && row.sowItemData.laborDesc) || row.sowLaborDesc;
    var bConduit = cnum(cell.conduit), bDrop = cnum(cell.dropLength);
    // Cabling diffs anchor on the BID carrying a value (incl. 0), so a bid that
    // simply didn't capture conduit/drop (blank) doesn't flag every row against
    // a spec that has one. Booleans flag on any true≠false delta.
    var m = {
      product:    productDiff,
      laborDesc:  wseq(sowDesc) !== wseq(cell.laborDesc),
      // Anchor qty on the SOW side carrying a value (mirrors the conn anchors)
      // so a blank-spec line item doesn't flag every bid that priced qty 1.
      qty:        (Number(sd.qty) || 0) > 0
                    ? ((Number(sd.qty) || 0) !== (Number(cell.qty) || 0)) : false,
      fee:        Math.abs((Number(row.sowFee) || 0) - (Number(cell.labor) || 0)) > 0.001,
      conduit:    bConduit != null ? (bConduit !== (cnum(sd.conduit) || 0)) : false,
      dropLength: bDrop != null ? (bDrop !== (cnum(sd.dropLength) || 0)) : false,
      plenum:     !!sd.plenum !== !!cell.plenum,
      exterior:   !!sd.exterior !== !!cell.exterior,
      existing:   !!sd.existCabling !== !!cell.existCabling,
      connDevice: connDeviceDiff,
      connTo:     connToDiff
    };
    m.any = m.product || m.laborDesc || m.qty || m.fee || m.conduit ||
            m.dropLength || m.plenum || m.exterior || m.existing ||
            m.connDevice || m.connTo;
    return m;
  }

  ns.transform = {
    buildState:       buildState,
    groupRows:        groupRows,
    getMismatches:    getMismatches,
    stripHtml:        stripHtml,
    raw:              raw,
    rawHtml:          rawHtml,
    num:              num,
    bool:             bool,
    connectionId:     connectionId,
    connectionLabel:  connectionLabel,
    connectionAll:    connectionAll
  };
})();
/*** END BID REVIEW V2 — TRANSFORM ********************************************/
