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

  /** Strip HTML tags from a string — Knack wraps connection values in <span>. */
  function stripHtml(str) {
    if (!str) return '';
    return String(str).replace(/<[^>]*>/g, '').trim();
  }

  function raw(record, key) {
    var v = record[key];
    if (v == null) return '';
    if (typeof v === 'object' && v.raw != null) return stripHtml(v.raw);
    return stripHtml(v);
  }

  function num(record, key) {
    var s = raw(record, key).replace(/[$,]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** Return first connection ID. */
  function connectionId(record, key) {
    var v = record[key + '_raw'] || record[key];
    if (!v) return '';
    if (Array.isArray(v) && v.length) return v[0].id || '';
    if (typeof v === 'object' && v.id) return v.id;
    return '';
  }

  function connectionLabel(record, key) {
    var v = record[key + '_raw'] || record[key];
    if (!v) return '';
    if (Array.isArray(v) && v.length) return stripHtml(v[0].identifier || '');
    if (typeof v === 'object' && v.identifier) return stripHtml(v.identifier);
    // Fallback: the rendered value may be HTML
    return stripHtml(record[key] || '');
  }

  /** Return ALL connections as [{id, identifier}]. Handles 1 or many. */
  function connectionAll(record, key) {
    // Try the _raw variant first (Knack often stores connection data there)
    var v = record[key + '_raw'];
    if (!v) v = record[key];
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

    // Debug: log the SOW field shape from the first record
    if (CFG.debug && records.length) {
      var sample = records[0];
      console.log('[BidReview] SOW field debug:', {
        key: FK.sow,
        value: sample[FK.sow],
        raw: sample[FK.sow + '_raw'],
        type: typeof sample[FK.sow],
        allKeys: Object.keys(sample).filter(function (k) { return k.indexOf('2154') !== -1; }),
      });
    }

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
        id:              rec.id,
        labor:           num(rec, FK.labor),
        laborDesc:       raw(rec, FK.laborDesc),
        productName:     raw(rec, FK.productName),
        notes:           raw(rec, FK.notes),
        bidExistCabling: raw(rec, FK.bidExistCabling),
      };
    }

    return {
      id:              meta.id,
      rowKey:          rowKey,
      displayLabel:    raw(meta, FK.displayLabel),
      productName:     raw(meta, FK.productName),
      sowItem:         connectionId(meta, FK.relatedSowItem),
      groupL1:         connectionLabel(meta, FK.proposalBucket),
      groupL2:         connectionLabel(meta, FK.mdfIdf),
      // SOW detail fields (from first record in the row)
      sowFee:          num(meta, FK.sowFee),
      sowProduct:      connectionLabel(meta, FK.sowProduct) || raw(meta, FK.sowProduct),
      sowLaborDesc:    raw(meta, FK.sowLaborDesc),
      sowExistCabling: raw(meta, FK.sowExistCabling),
      cellsByPackage:  cellsByPackage,
    };
  }

  // ── grouping (L1/L2) ─────────────────────────────────────────

  /**
   * Group rows by mdfIdf (field_2375) only — single level of collapsible groups.
   */
  function groupRows(rows) {
    var hasAnyGroup = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].groupL2) { hasAnyGroup = true; break; }
    }

    if (!hasAnyGroup) {
      return [{ key: '__all__', label: '', level: 0, rows: rows, subgroups: [] }];
    }

    var grpMap   = {};
    var grpOrder = [];

    for (var j = 0; j < rows.length; j++) {
      var r   = rows[j];
      var grp = r.groupL2 || 'Ungrouped';

      if (!grpMap[grp]) {
        grpMap[grp] = [];
        grpOrder.push(grp);
      }
      grpMap[grp].push(r);
    }

    var groups = [];
    for (var gi = 0; gi < grpOrder.length; gi++) {
      var key     = grpOrder[gi];
      var grpRows = grpMap[key];
      grpRows.sort(function (a, b) {
        return (a.displayLabel || '').localeCompare(b.displayLabel || '');
      });

      groups.push({
        key:       key,
        label:     key,
        level:     1,
        rows:      grpRows,
        subgroups: [],
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

    // Distribute no-SOW records into SOW grids that share the same bid package.
    var noSowRecs = sowBuckets['__no_sow__'] || [];
    if (noSowRecs.length && sows.length) {
      // Build a map: pkgId → [sowIds that contain that pkg]
      var pkgToSows = {};
      for (var si = 0; si < sows.length; si++) {
        var sowRecs = sowBuckets[sows[si].id] || [];
        for (var ri = 0; ri < sowRecs.length; ri++) {
          var pid = connectionId(sowRecs[ri], FK.bidPackage);
          if (!pid) continue;
          if (!pkgToSows[pid]) pkgToSows[pid] = {};
          pkgToSows[pid][sows[si].id] = true;
        }
      }

      for (var ni = 0; ni < noSowRecs.length; ni++) {
        var rec   = noSowRecs[ni];
        var recPkg = connectionId(rec, FK.bidPackage);
        var placed = false;

        if (recPkg && pkgToSows[recPkg]) {
          var targetSows = Object.keys(pkgToSows[recPkg]);
          for (var ti = 0; ti < targetSows.length; ti++) {
            if (!sowBuckets[targetSows[ti]]) sowBuckets[targetSows[ti]] = [];
            sowBuckets[targetSows[ti]].push(rec);
            placed = true;
          }
        }

        // If the record couldn't be placed in any SOW grid, put it in the first one
        if (!placed && sows.length) {
          var fallbackId = sows[0].id;
          if (!sowBuckets[fallbackId]) sowBuckets[fallbackId] = [];
          sowBuckets[fallbackId].push(rec);
        }
      }
    }
    delete sowBuckets['__no_sow__'];

    var sowGrids = [];

    for (var i = 0; i < sows.length; i++) {
      var sow     = sows[i];
      var recs    = sowBuckets[sow.id] || [];
      var rows    = buildRowsForSow(recs);
      var pkgs    = extractPackages(recs);
      var groups  = groupRows(rows);
      var elig    = computeEligibility(rows, pkgs);

      sowGrids.push({
        sowId:       sow.id,
        sowName:     stripHtml(sow.name),
        packages:    pkgs,
        rows:        rows,
        groups:      groups,
        eligibility: elig,
        columnCount: pkgs.length + 3,
      });
    }

    // Edge case: ALL records lack SOW — show a single unnamed grid
    if (!sows.length && noSowRecs.length) {
      var fallbackRows = buildRowsForSow(noSowRecs);
      var fallbackPkgs = extractPackages(noSowRecs);
      sowGrids.push({
        sowId:       '__no_sow__',
        sowName:     'Unassigned Items',
        packages:    fallbackPkgs,
        rows:        fallbackRows,
        groups:      groupRows(fallbackRows),
        eligibility: computeEligibility(fallbackRows, fallbackPkgs),
        columnCount: fallbackPkgs.length + 2,
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
