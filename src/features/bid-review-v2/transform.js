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
          id:         rec.id,
          qty:        num(rec, FK.qty),
          rate:       num(rec, FK.rate),
          labor:      num(rec, FK.labor),
          laborDesc:  rawHtml(rec, FK.laborDesc),
          notes:      raw(rec, FK.notes),
          existCabling: bool(rec, FK.bidExistCabling),
          plenum:     bool(rec, FK.plenum),
          exterior:   bool(rec, FK.exterior)
        };
      }
    }
    return {
      id:           meta.id,
      sowItem:      connectionId(meta, FK.relatedSowItem),
      displayLabel: raw(meta, FK.displayLabel),
      productName:  raw(meta, FK.productName),
      sortOrder:    num(meta, FK.sortOrder),
      cellsByPackage: cellsByPackage
    };
  }

  function buildState(records) {
    var sows = extractSows(records);
    var buckets = groupBySow(records);
    var sowGrids = [];
    for (var i = 0; i < sows.length; i++) {
      var sow = sows[i];
      var bucket = buckets[sow.id] || [];
      var packages = extractPackages(bucket);
      sowGrids.push({
        sowId:    sow.id,
        sowName:  sow.name,
        packages: packages,
        rows:     buildRowsForSow(bucket)
      });
    }
    return { sowGrids: sowGrids, isEmpty: sowGrids.length === 0 };
  }

  ns.transform = {
    buildState:       buildState,
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
