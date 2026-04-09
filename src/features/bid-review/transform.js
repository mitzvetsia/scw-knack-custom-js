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

  /** Return ALL connection labels joined with ", ". */
  function connectionLabelsAll(record, key) {
    var conns = connectionAll(record, key);
    if (!conns.length) return stripHtml(record[key] || '');
    var labels = [];
    for (var i = 0; i < conns.length; i++) {
      var lbl = stripHtml(conns[i].identifier || '');
      if (lbl) labels.push(lbl);
    }
    return labels.join(', ');
  }

  /** Return ALL connection IDs as a flat array of strings. */
  function connectionIdsAll(record, key) {
    var conns = connectionAll(record, key);
    var ids = [];
    for (var i = 0; i < conns.length; i++) {
      if (conns[i].id) ids.push(conns[i].id);
    }
    return ids;
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
      var conns = connectionAll(records[i], FK.bidPackage);
      for (var c = 0; c < conns.length; c++) {
        var pkgId   = conns[c].id;
        var pkgName = stripHtml(conns[c].identifier || '');
        if (!pkgId || seen[pkgId]) continue;
        seen[pkgId] = true;
        list.push({ id: pkgId, name: pkgName || 'Package ' + (list.length + 1) });
      }
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
      var rec     = bucket.cells[i];
      var pkgConns = connectionAll(rec, FK.bidPackage);

      for (var pi = 0; pi < pkgConns.length; pi++) {
        var pkgId = pkgConns[pi].id;
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
          rate:            num(rec, FK.rate),
          qty:             num(rec, FK.qty),
          laborDesc:       raw(rec, FK.laborDesc),
          productName:     raw(rec, FK.productName),
          notes:           raw(rec, FK.notes),
          bidExistCabling: raw(rec, FK.bidExistCabling),
          bidConnDevice:   connectionLabelsAll(rec, FK.bidConnDevice),
          bidConnDeviceIds: connectionIdsAll(rec, FK.bidConnDevice),
          bidMapConn:      raw(rec, FK.bidMapConn),
          // Payload-only fields
          field2627:       connectionId(rec, FK.field2627),
          field2367:       raw(rec, FK.field2367),
          field2368:       raw(rec, FK.field2368),
          field2371:       raw(rec, FK.field2371),
          sku:             raw(rec, FK.sku),
          price:           num(rec, FK.price),
        };
      }
    }

    return {
      id:              meta.id,
      rowKey:          rowKey,
      displayLabel:    raw(meta, FK.displayLabel),
      productName:     raw(meta, FK.productName),
      sowItem:         connectionId(meta, FK.relatedSowItem),
      proposalBucket:  connectionLabel(meta, FK.proposalBucket),
      proposalBucketId: connectionId(meta, FK.proposalBucket),
      mdfIdf:          connectionLabel(meta, FK.mdfIdf),
      sortOrder:       num(meta, FK.sortOrder),
      // SOW detail fields (from first record in the row)
      sowQty:          num(meta, FK.sowQty),
      sowFee:          num(meta, FK.sowFee),
      sowProduct:      connectionLabel(meta, FK.sowProduct) || raw(meta, FK.sowProduct),
      sowLaborDesc:    raw(meta, FK.sowLaborDesc),
      sowExistCabling: raw(meta, FK.sowExistCabling),
      sowConnDevice:   connectionLabelsAll(meta, FK.sowConnDevice),
      sowConnDeviceIds: connectionIdsAll(meta, FK.sowConnDevice),
      sowMapConn:      raw(meta, FK.sowMapConn),
      cellsByPackage:  cellsByPackage,
    };
  }

  // ── grouping (L1/L2) ─────────────────────────────────────────

  /**
   * Group rows by mdfIdf (field_2375, primary accordion) then by
   * proposalBucket (field_2366, sub-group within each accordion).
   * Sub-groups are sorted by sortOrder (field_2218).
   */
  function groupRows(rows) {
    var hasMdfIdf = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].mdfIdf) { hasMdfIdf = true; break; }
    }

    if (!hasMdfIdf) {
      return [{ key: '__all__', label: '', level: 0, rows: rows, subgroups: [] }];
    }

    // Primary grouping: mdfIdf
    var mdfMap   = {};
    var mdfOrder = [];

    for (var j = 0; j < rows.length; j++) {
      var r   = rows[j];
      var mdf = r.mdfIdf || 'Unassigned';

      if (!mdfMap[mdf]) {
        mdfMap[mdf] = [];
        mdfOrder.push(mdf);
      }
      mdfMap[mdf].push(r);
    }

    // Sort alphabetically, with 'Unassigned' always last
    mdfOrder.sort(function (a, b) {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });

    var groups = [];
    for (var gi = 0; gi < mdfOrder.length; gi++) {
      var mdfKey  = mdfOrder[gi];
      var mdfRows = mdfMap[mdfKey];

      // Sub-grouping within this mdfIdf: proposalBucket
      var hasBucket = false;
      for (var bi = 0; bi < mdfRows.length; bi++) {
        if (mdfRows[bi].proposalBucket) { hasBucket = true; break; }
      }

      var subgroups = [];
      if (hasBucket) {
        var bucketMap   = {};
        var bucketOrder = [];

        for (var ri = 0; ri < mdfRows.length; ri++) {
          var row    = mdfRows[ri];
          var bucket = row.proposalBucket || 'Other';

          if (!bucketMap[bucket]) {
            bucketMap[bucket] = { rows: [], minSort: row.sortOrder };
            bucketOrder.push(bucket);
          }
          bucketMap[bucket].rows.push(row);
          if (row.sortOrder < bucketMap[bucket].minSort) {
            bucketMap[bucket].minSort = row.sortOrder;
          }
        }

        // Sort sub-groups by sortOrder (field_2218)
        bucketOrder.sort(function (a, b) {
          return bucketMap[a].minSort - bucketMap[b].minSort;
        });

        for (var si = 0; si < bucketOrder.length; si++) {
          var bKey  = bucketOrder[si];
          var bRows = bucketMap[bKey].rows;
          bRows.sort(function (a, b) {
            return (a.displayLabel || '').localeCompare(b.displayLabel || '');
          });

          subgroups.push({
            key:   mdfKey + '::' + bKey,
            label: bKey,
            level: 2,
            rows:  bRows,
          });
        }

        groups.push({
          key:       mdfKey,
          label:     mdfKey,
          level:     1,
          rows:      [],
          subgroups: subgroups,
        });
      } else {
        mdfRows.sort(function (a, b) {
          return (a.displayLabel || '').localeCompare(b.displayLabel || '');
        });

        groups.push({
          key:       mdfKey,
          label:     mdfKey,
          level:     1,
          rows:      mdfRows,
          subgroups: [],
        });
      }
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

  // ── build "NO BID" rows from unbid SOW items (view_3728) ────

  /**
   * Convert SOW item records (from view_3728) into NO BID rows.
   * These use DIFFERENT field keys than bid records.
   * Returns rows keyed by SOW id: { sowId: [row, ...] }
   */
  function buildNoBidRows(sowItems) {
    var SFK = CFG.sowItemFieldKeys;
    var bySow = {};

    for (var i = 0; i < sowItems.length; i++) {
      var rec = sowItems[i];
      var conns = connectionAll(rec, SFK.sow);

      if (!conns.length) continue;

      for (var c = 0; c < conns.length; c++) {
        var sowId = conns[c].id;
        if (!sowId) continue;
        if (!bySow[sowId]) bySow[sowId] = [];

        bySow[sowId].push({
          id:              rec.id,
          rowKey:          'nobid::' + rec.id,
          displayLabel:    raw(rec, SFK.displayLabel) || connectionLabel(rec, SFK.product),
          productName:     raw(rec, SFK.productName),
          sowItem:         rec.id,   // it IS a SOW item
          proposalBucket:  connectionLabel(rec, SFK.proposalBucket),
          proposalBucketId: connectionId(rec, SFK.proposalBucket),
          mdfIdf:          connectionLabel(rec, SFK.mdfIdf),
          sortOrder:       num(rec, SFK.sortOrder),
          // SOW detail — populated from the SOW item record itself
          sowQty:          num(rec, SFK.qty),
          sowFee:          num(rec, SFK.fee),
          sowProduct:      connectionLabel(rec, SFK.product) || raw(rec, SFK.productName),
          sowLaborDesc:    raw(rec, SFK.laborDesc),
          sowExistCabling: raw(rec, SFK.existCabling),
          sowConnDevice:   connectionLabelsAll(rec, SFK.connDevice),
          sowConnDeviceIds: connectionIdsAll(rec, SFK.connDevice),
          sowMapConn:      raw(rec, SFK.mapConn),
          // No bid data at all
          cellsByPackage:  {},
          noBid:           true,
        });
      }
    }

    return bySow;
  }

  // ── public entry point ────────────────────────────────────────

  /**
   * buildState(records, sowItems) → state
   *
   * @param {Array} records  — bid records from view_3680
   * @param {Array} sowItems — unbid SOW items from view_3728
   * Returns:
   *   {
   *     sowGrids: [{ sowId, sowName, packages, rows, groups, eligibility, columnCount }],
   *     allPackages: [{id, name}],
   *     isEmpty: boolean
   *   }
   */
  ns.buildState = function buildState(records, sowItems) {
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
          var pids = connectionAll(sowRecs[ri], FK.bidPackage);
          for (var pk = 0; pk < pids.length; pk++) {
            var pid = pids[pk].id;
            if (!pid) continue;
            if (!pkgToSows[pid]) pkgToSows[pid] = {};
            pkgToSows[pid][sows[si].id] = true;
          }
        }
      }

      for (var ni = 0; ni < noSowRecs.length; ni++) {
        var rec     = noSowRecs[ni];
        var recPkgs = connectionAll(rec, FK.bidPackage);
        var placed  = false;

        for (var rp = 0; rp < recPkgs.length; rp++) {
          var recPkg = recPkgs[rp].id;
          if (recPkg && pkgToSows[recPkg]) {
            var targetSows = Object.keys(pkgToSows[recPkg]);
            for (var ti = 0; ti < targetSows.length; ti++) {
              if (!sowBuckets[targetSows[ti]]) sowBuckets[targetSows[ti]] = [];
              sowBuckets[targetSows[ti]].push(rec);
              placed = true;
            }
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

    // Build NO BID rows from view_3728 SOW items
    var noBidBySow = buildNoBidRows(sowItems || []);

    if (CFG.debug && Object.keys(noBidBySow).length) {
      var noBidTotal = 0;
      var noBidSowIds = Object.keys(noBidBySow);
      for (var nk = 0; nk < noBidSowIds.length; nk++) {
        noBidTotal += noBidBySow[noBidSowIds[nk]].length;
      }
      console.log('[BidReview] NO BID rows:', noBidTotal, 'across', noBidSowIds.length, 'SOWs');
    }

    // Ensure SOW list includes any SOWs that only appear in the unbid items
    var sowSeen = {};
    for (var sk = 0; sk < sows.length; sk++) { sowSeen[sows[sk].id] = true; }
    var noBidKeys = Object.keys(noBidBySow);
    for (var nbi = 0; nbi < noBidKeys.length; nbi++) {
      var nbSowId = noBidKeys[nbi];
      if (!sowSeen[nbSowId]) {
        // Derive SOW name from the first NO BID row's SOW connection
        var nbSample = noBidBySow[nbSowId][0];
        var SFK = CFG.sowItemFieldKeys;
        var nbConns = connectionAll({ id: nbSample.id }, SFK.sow);
        // Fallback: use the SOW item records to find the name
        var nbName = 'SOW ' + (sows.length + 1);
        var nbRawItems = (sowItems || []);
        for (var nri = 0; nri < nbRawItems.length; nri++) {
          var nrConns = connectionAll(nbRawItems[nri], SFK.sow);
          for (var nrc = 0; nrc < nrConns.length; nrc++) {
            if (nrConns[nrc].id === nbSowId) {
              nbName = stripHtml(nrConns[nrc].identifier || nbName);
              break;
            }
          }
        }
        sows.push({ id: nbSowId, name: nbName });
        sowSeen[nbSowId] = true;
      }
    }

    var sowGrids = [];

    for (var i = 0; i < sows.length; i++) {
      var sow     = sows[i];
      var recs    = sowBuckets[sow.id] || [];
      var rows    = buildRowsForSow(recs);

      // Merge in NO BID rows for this SOW
      var noBidRows = noBidBySow[sow.id] || [];
      for (var nb = 0; nb < noBidRows.length; nb++) {
        rows.push(noBidRows[nb]);
      }

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
