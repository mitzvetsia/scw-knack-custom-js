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

  function groupBySow(records) {
    var buckets = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var conns = connectionAll(rec, FK.sow);
      if (!conns.length) continue;
      for (var c = 0; c < conns.length; c++) {
        var sowId = conns[c].id;
        if (!sowId) continue;
        if (!buckets[sowId]) buckets[sowId] = [];
        buckets[sowId].push(rec);
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
        if (!pid || cellsByPackage[pid]) continue;
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
          exterior:     bool(rec, FK.exterior)
        };
      }
    }
    return {
      id:           meta.id,
      sowItem:      connectionId(meta, FK.relatedSowItem),
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
      cellsByPackage: cellsByPackage
    };
  }

  // ── grouping (L1 = MDF/IDF, L2 = proposal bucket) ──────────
  //
  // Copy-pruned from v1's groupRows(). When no row has an mdfIdf value,
  // returns a single "__all__" group so the renderer can stay uniform.
  // Otherwise: L1 by MDF/IDF label, then L2 by proposalBucket if any
  // row in the L1 has one. "Unassigned" L1 always sorts last.

  function groupRows(rows) {
    var hasMdf = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].mdfIdf) { hasMdf = true; break; }
    }
    if (!hasMdf) {
      return [{ key: '__all__', label: '', level: 0, rows: rows, subgroups: [] }];
    }

    var mdfMap = Object.create(null);
    var mdfOrder = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var mdf = r.mdfIdf || 'Unassigned';
      if (!mdfMap[mdf]) { mdfMap[mdf] = []; mdfOrder.push(mdf); }
      mdfMap[mdf].push(r);
    }
    mdfOrder.sort(function (a, b) {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });

    var groups = [];
    for (var gi = 0; gi < mdfOrder.length; gi++) {
      var mdfKey = mdfOrder[gi];
      var mdfRows = mdfMap[mdfKey];
      var mdfIdfId = '';
      for (var fi = 0; fi < mdfRows.length; fi++) {
        if (mdfRows[fi].mdfIdfId) { mdfIdfId = mdfRows[fi].mdfIdfId; break; }
      }

      var hasBucket = false;
      for (var bi = 0; bi < mdfRows.length; bi++) {
        if (mdfRows[bi].proposalBucket) { hasBucket = true; break; }
      }

      if (hasBucket) {
        var bucketMap = Object.create(null);
        var bucketOrder = [];
        for (var ri = 0; ri < mdfRows.length; ri++) {
          var row = mdfRows[ri];
          var bkt = row.proposalBucket || 'Other';
          if (!bucketMap[bkt]) {
            bucketMap[bkt] = { rows: [], minSort: row.sortOrder };
            bucketOrder.push(bkt);
          }
          bucketMap[bkt].rows.push(row);
          if (row.sortOrder < bucketMap[bkt].minSort) {
            bucketMap[bkt].minSort = row.sortOrder;
          }
        }
        bucketOrder.sort(function (a, b) {
          return bucketMap[a].minSort - bucketMap[b].minSort;
        });
        var subs = [];
        for (var si = 0; si < bucketOrder.length; si++) {
          var bKey = bucketOrder[si];
          var bRows = bucketMap[bKey].rows.slice().sort(function (a, b) {
            return (a.displayLabel || '').localeCompare(b.displayLabel || '');
          });
          subs.push({ key: mdfKey + '::' + bKey, label: bKey, level: 2, rows: bRows });
        }
        groups.push({
          key: mdfKey, label: mdfKey, mdfIdfId: mdfIdfId,
          level: 1, rows: [], subgroups: subs
        });
      } else {
        var flat = mdfRows.slice().sort(function (a, b) {
          return (a.displayLabel || '').localeCompare(b.displayLabel || '');
        });
        groups.push({
          key: mdfKey, label: mdfKey, mdfIdfId: mdfIdfId,
          level: 1, rows: flat, subgroups: []
        });
      }
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
          sowFee:           num(rec, SFK.fee)
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
    var sowNameById = Object.create(null);
    for (var sni = 0; sni < sows.length; sni++) sowNameById[sows[sni].id] = sows[sni].name;
    var buckets = groupBySow(records);
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
        mdfIdf:      connectionLabel(s, SFK.mdfIdf),
        proposalBucket: connectionLabel(s, SFK.proposalBucket)
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

    // Shared require-sub-bid drop test — applied to both matched rows and
    // the "other items" rows so informational (No) items never appear.
    function keepRow(row) {
      var sowFlag = row.sowFullRecord ? raw(row.sowFullRecord, FK.requireSubBid) : '';
      var flag = sowFlag || row.requireSubBid || '';
      return !/^no$/i.test(String(flag).trim());
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

    // Source A — view_3921 survey items off ALL SOWs and not on a bid.
    for (var rmi = 0; rmi < sowItemList.length; rmi++) {
      var rrec = sowItemList[rmi];
      if (!rrec || !rrec.id) continue;
      if (connectionAll(rrec, SFK.sow).length) continue;   // still on a SOW
      if (bidItemIds[rrec.id]) continue;                   // still on a bid
      removedSeen[rrec.id] = true;
      var aIdx = sowItemIndex[rrec.id] || null;
      removedRows.push({
        id:               rrec.id,
        sowItem:          rrec.id,
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
        // What the item WAS — SOW-side snapshot (the bid record is gone).
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

    // Source B — leftover view_3680 bid-side records with NO bid package
    // AND no SOW connection (buildRowsForSow drops these). Their related
    // SOW line item dedupes against Source A.
    for (var obi = 0; obi < records.length; obi++) {
      var obrec = records[obi];
      if (!obrec || !obrec.id) continue;
      if (connectionAll(obrec, FK.bidPackage).length) continue; // still on a bid
      if (connectionAll(obrec, FK.sow).length) continue;        // still on a SOW
      var obsi = connectionId(obrec, FK.relatedSowItem);
      var okey = obsi || ('rec::' + obrec.id);
      if (removedSeen[okey] || (obsi && removedSeen[obsi])) continue;
      removedSeen[okey] = true;
      var obrow = buildRow(obrec, [obrec]);   // empty cells (no package)
      obrow.removed     = true;
      obrow.noBid       = true;
      obrow.surveyNoBid = false;
      obrow.offSow      = false;
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
        if (!keepRow(orr)) continue;
        var oid  = orr.sowItem;
        var oIdx = oid ? (sowItemIndex[oid] || null) : null;
        orr.sowItemData   = oIdx;
        orr.sowFullRecord = oid ? (sowFullByItem[oid] || null) : null;
        // Not on THIS SOW → excluded from SOW totals, still in bid total.
        orr.offSow       = true;
        orr.otherBidItem = true;
        var onSomeSow = !!(oIdx && oIdx.sowIds && Object.keys(oIdx.sowIds).length);
        if (onSomeSow) {
          orr.otherKind = 'other-sow';
          // Names of the OTHER SOW(s) this item belongs to, for display.
          orr.otherSowNames = Object.keys(oIdx.sowIds)
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

      var groups = groupRows(rows);
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
      if (bidOnlyRows.length) {
        groups.push({
          key:           '__bid_only_items__',
          label:         'Added to these bids — no SOW item yet',
          mdfIdfId:      '',
          level:         1,
          rows:          bidOnlyRows,
          subgroups:     [],
          bidOnlyItems:  true
        });
      }
      // Removed items pinned to the TOP, default-collapsed. Same set on
      // every SOW grid (they belong to no SOW). Not added to allRows, so
      // they never touch SOW or bid-column totals.
      if (removedRows.length) {
        groups.unshift({
          key:             '__removed_items__',
          label:           'Removed — no longer on any SOW or bid',
          mdfIdfId:        '',
          level:           1,
          rows:            removedRows,
          subgroups:       [],
          removedItems:    true,
          defaultCollapsed: true
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
      return s.replace(/\s+/g, ' ').toLowerCase().trim();
    }
    var sowProd  = (row.sowItemData && row.sowItemData.productName) || row.sowProduct;
    var spBase   = baseProduct(sowProd);
    var cpBase   = baseProduct(cell.productName);
    var productDiff = (spBase && cpBase) ? (spBase !== cpBase) : false;
    var m = {
      product:   productDiff,
      laborDesc: norm(row.sowLaborDesc) !== norm(cell.laborDesc),
      fee:       Math.abs((Number(row.sowFee) || 0) - (Number(cell.labor) || 0)) > 0.001
    };
    m.any = m.product || m.laborDesc || m.fee;
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
