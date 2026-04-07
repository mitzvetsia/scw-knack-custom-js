/*** BID REVIEW — DATA TRANSFORMATION ***/
/**
 * Groups records by SOW (field_2154), then within each SOW pivots
 * by bid package (columns) and line items (rows).
 *
 * A record with TWO SOW connections appears in both SOW grids.
 *
 * Reads : SCW.bidReview.CONFIG.fieldKeys
 * Writes: SCW.bidReview.buildState(records), .collectEligible()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;
  var FK  = CFG.fieldKeys;

  // ── tiny helpers ──────────────────────────────────────────────

  function raw(record, key) {
    var v = record[key];
    if (v == null) return '';
    if (typeof v === 'object' && v.raw != null) return String(v.raw);
    return String(v);
  }

  function num(record, key) {
    var s = raw(record, key).replace(/[$,]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** Return first connection ID. */
  function connectionId(record, key) {
    var v = record[key];
    if (!v) return '';
    if (Array.isArray(v) && v.length) return v[0].id || '';
    if (typeof v === 'object' && v.id) return v.id;
    return String(v);
  }

  function connectionLabel(record, key) {
    var v = record[key];
    if (!v) return '';
    if (Array.isArray(v) && v.length) return v[0].identifier || '';
    if (typeof v === 'object' && v.identifier) return v.identifier;
    return String(v);
  }

  /** Return ALL connections as [{id, identifier}]. Handles 1 or many. */
  function connectionAll(record, key) {
    var v = record[key];
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object' && v.id) return [v];
    return [];
  }

  // ── extract unique SOW items ──────────────────────────────────

  function extractSows(records) {
    var seen = {};
    var list = [];

    for (var i = 0; i < records.length; i++) {
      var conns = connectionAll(records[i], FK.sow);
      for (var c = 0; c < conns.length; c++) {
        var id = conns[c].id;
        if (!id || seen[id]) continue;
        seen[id] = true;
        list.push({ id: id, name: conns[c].identifier || 'SOW ' + list.length });
      }
    }

    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  // ── extract unique packages ───────────────────────────────────

  function extractPackages(records) {
    var seen = {};
    var list = [];

    for (var i = 0; i < records.length; i++) {
      var pkgId   = connectionId(records[i], FK.bidPackage);
      var pkgName = connectionLabel(records[i], FK.bidPackage);
      if (!pkgId || seen[pkgId]) continue;
      seen[pkgId] = true;
      list.push({ id: pkgId, name: pkgName || 'Package ' + (list.length + 1) });
    }

    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  // ── group records by SOW ──────────────────────────────────────

  /**
   * Splits records into buckets keyed by SOW id.
   * Records with 2+ SOW connections are duplicated into each bucket.
   * Returns { sowId: [records] }
   */
  function groupBySow(records) {
    var buckets = {};

    for (var i = 0; i < records.length; i++) {
      var rec   = records[i];
      var conns = connectionAll(rec, FK.sow);

      if (conns.length === 0) {
        // No SOW — put in a catch-all bucket
        var noSow = '__no_sow__';
        if (!buckets[noSow]) buckets[noSow] = [];
        buckets[noSow].push(rec);
        continue;
      }

      for (var c = 0; c < conns.length; c++) {
        var sowId = conns[c].id;
        if (!sowId) continue;
        if (!buckets[sowId]) buckets[sowId] = [];
        buckets[sowId].push(rec);
      }
    }

    return buckets;
  }

  // ── build rows within a SOW bucket ────────────────────────────

  /**
   * Within a SOW bucket, pivot by line item identity (rows) and
   * bid package (columns).
   *
   * Row identity = relatedSowItem connection || displayLabel fallback.
   */
  function buildRowsForSow(records) {
    var rowMap   = {};
    var rowOrder = [];

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];

      var sowItemId = connectionId(rec, FK.relatedSowItem);
      var label     = raw(rec, FK.displayLabel);
      var rowKey    = sowItemId ? 'sow::' + sowItemId : 'label::' + label;

      if (!rowMap[rowKey]) {
        rowMap[rowKey] = { meta: rec, cells: [] };
        rowOrder.push(rowKey);
      }
      rowMap[rowKey].cells.push(rec);
    }

    var rows = [];
    for (var j = 0; j < rowOrder.length; j++) {
      var key    = rowOrder[j];
      var bucket = rowMap[key];
      rows.push(buildRow(key, bucket));
    }

    rows.sort(function (a, b) {
      return (a.displayLabel || '').localeCompare(b.displayLabel || '');
    });

    return rows;
  }

  function buildRow(rowKey, bucket) {
    var meta = bucket.meta;
    var cellsByPackage = {};

    for (var i = 0; i < bucket.cells.length; i++) {
      var rec   = bucket.cells[i];
      var pkgId = connectionId(rec, FK.bidPackage);
      if (!pkgId) continue;

      if (cellsByPackage[pkgId]) {
        if (CFG.debug) {
          console.warn('[BidReview] Duplicate cell row=' + rowKey +
                       ' pkg=' + pkgId + ' — keeping first');
        }
        continue;
      }

      cellsByPackage[pkgId] = {
        id:          rec.id,
        labor:       num(rec, FK.labor),
        productName: raw(rec, FK.productName),
        notes:       raw(rec, FK.notes),
      };
    }

    return {
      id:             meta.id,
      rowKey:         rowKey,
      displayLabel:   raw(meta, FK.displayLabel),
      productName:    raw(meta, FK.productName),
      sowItem:        connectionId(meta, FK.relatedSowItem),
      groupL1:        connectionLabel(meta, FK.proposalBucket),
      groupL2:        connectionLabel(meta, FK.mdfIdf),
      cellsByPackage: cellsByPackage,
    };
  }

  // ── grouping (L1/L2) ─────────────────────────────────────────

  function groupRows(rows) {
    var hasAnyGroup = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].groupL1) { hasAnyGroup = true; break; }
    }

    if (!hasAnyGroup) {
      return [{ key: '__all__', label: '', level: 0, rows: rows, subgroups: [] }];
    }

    var l1Map   = {};
    var l1Order = [];

    for (var j = 0; j < rows.length; j++) {
      var r  = rows[j];
      var l1 = r.groupL1 || 'Ungrouped';

      if (!l1Map[l1]) {
        l1Map[l1] = { l2Map: {}, l2Order: [] };
        l1Order.push(l1);
      }

      var l2 = r.groupL2 || '';
      if (!l1Map[l1].l2Map[l2]) {
        l1Map[l1].l2Map[l2] = [];
        l1Map[l1].l2Order.push(l2);
      }
      l1Map[l1].l2Map[l2].push(r);
    }

    var groups = [];
    for (var gi = 0; gi < l1Order.length; gi++) {
      var l1Key  = l1Order[gi];
      var bucket = l1Map[l1Key];

      var subgroups = [];
      for (var si = 0; si < bucket.l2Order.length; si++) {
        var l2Key  = bucket.l2Order[si];
        var l2Rows = bucket.l2Map[l2Key];
        l2Rows.sort(function (a, b) {
          return (a.displayLabel || '').localeCompare(b.displayLabel || '');
        });

        subgroups.push({
          key:   l1Key + '::' + l2Key,
          label: l2Key,
          level: 2,
          rows:  l2Rows,
        });
      }

      groups.push({
        key:       l1Key,
        label:     l1Key,
        level:     1,
        rows:      [],
        subgroups: subgroups,
      });
    }

    return groups;
  }

  // ── eligibility counts per package within a SOW grid ──────────

  function computeEligibility(rows, packages) {
    var result = {};

    for (var p = 0; p < packages.length; p++) {
      result[packages[p].id] = { adoptable: 0, creatable: 0, total: 0 };
    }

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var pi = 0; pi < packages.length; pi++) {
        var pkgId = packages[pi].id;
        if (!row.cellsByPackage[pkgId]) continue;

        result[pkgId].total++;
        if (row.sowItem) {
          result[pkgId].adoptable++;
        } else {
          result[pkgId].creatable++;
        }
      }
    }

    return result;
  }

  // ── collect eligible row IDs for a package action ─────────────

  function collectEligible(pkgId, actionType, sowGrid) {
    var ids  = [];
    var rows = sowGrid.rows;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.cellsByPackage[pkgId]) continue;

      switch (actionType) {
        case 'package_adopt_all':
          if (row.sowItem) ids.push(row.id);
          break;
        case 'package_create_missing':
          if (!row.sowItem) ids.push(row.id);
          break;
        case 'package_adopt_create':
          ids.push(row.id);
          break;
      }
    }

    return ids;
  }

  // ── public entry point ────────────────────────────────────────

  /**
   * buildState(records) → state
   *
   * Returns:
   *   {
   *     sowGrids: [{ sowId, sowName, packages, rows, groups, eligibility, columnCount }],
   *     allPackages: [{id, name}],
   *     isEmpty: boolean
   *   }
   */
  ns.buildState = function buildState(records) {
    var sows       = extractSows(records);
    var allPkgs    = extractPackages(records);
    var sowBuckets = groupBySow(records);

    var sowGrids = [];

    for (var i = 0; i < sows.length; i++) {
      var sow     = sows[i];
      var recs    = sowBuckets[sow.id] || [];
      var rows    = buildRowsForSow(recs);
      var pkgs    = extractPackages(recs);   // packages present in this SOW
      var groups  = groupRows(rows);
      var elig    = computeEligibility(rows, pkgs);

      sowGrids.push({
        sowId:       sow.id,
        sowName:     sow.name,
        packages:    pkgs,
        rows:        rows,
        groups:      groups,
        eligibility: elig,
        columnCount: pkgs.length + 2,  // SOW label col + pkg cols + actions col
      });
    }

    // Handle records with no SOW
    var noSowRecs = sowBuckets['__no_sow__'];
    if (noSowRecs && noSowRecs.length) {
      var noSowRows = buildRowsForSow(noSowRecs);
      var noSowPkgs = extractPackages(noSowRecs);
      sowGrids.push({
        sowId:       '__no_sow__',
        sowName:     'No SOW Assigned',
        packages:    noSowPkgs,
        rows:        noSowRows,
        groups:      groupRows(noSowRows),
        eligibility: computeEligibility(noSowRows, noSowPkgs),
        columnCount: noSowPkgs.length + 2,
      });
    }

    return {
      sowGrids:    sowGrids,
      allPackages: allPkgs,
      isEmpty:     sowGrids.length === 0,
    };
  };

  ns.collectEligible = collectEligible;

})();
