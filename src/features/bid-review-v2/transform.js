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
      mdfIdf:           connectionLabel(meta, FK.mdfIdf),
      mdfIdfId:         connectionId(meta, FK.mdfIdf),
      proposalBucket:   connectionLabel(meta, FK.proposalBucket),
      proposalBucketId: connectionId(meta, FK.proposalBucket),
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

  function buildState(records, sowItems) {
    var sows = extractSows(records);
    var buckets = groupBySow(records);

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
      sowItemIndex[s.id] = {
        id:          s.id,
        productName: raw(s, SFK.productName) || connectionLabel(s, SFK.product),
        qty:         num(s, SFK.qty),
        fee:         num(s, SFK.fee),
        installFee:  num(s, SFK.installFee),
        laborDesc:   rawHtml(s, SFK.laborDesc),
        displayLabel: raw(s, SFK.displayLabel),
        mdfIdf:      connectionLabel(s, SFK.mdfIdf),
        proposalBucket: connectionLabel(s, SFK.proposalBucket)
      };
    }

    var sowGrids = [];
    for (var i = 0; i < sows.length; i++) {
      var sow = sows[i];
      var bucket = buckets[sow.id] || [];
      var packages = extractPackages(bucket);
      var rows = buildRowsForSow(bucket);
      // Attach the SOW-item snapshot to each row so card.js can render
      // the leftmost SOW column. Rows whose relatedSowItem points at a
      // record we never loaded fall through with `sowItemData: null`.
      for (var r = 0; r < rows.length; r++) {
        var sid = rows[r].sowItem;
        rows[r].sowItemData   = sid ? (sowItemIndex[sid]   || null) : null;
        rows[r].sowFullRecord = sid ? (sowFullByItem[sid] || null) : null;
      }
      sowGrids.push({
        sowId:    sow.id,
        sowName:  sow.name,
        packages: packages,
        rows:     rows,
        groups:   groupRows(rows)
      });
    }
    return { sowGrids: sowGrids, isEmpty: sowGrids.length === 0 };
  }

  ns.transform = {
    buildState:       buildState,
    groupRows:        groupRows,
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
