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
    if (str == null || str === '') return '';
    return String(str).replace(/<[^>]*>/g, '').trim();
  }

  function raw(record, key) {
    var v = record[key];
    if (v == null) return '';
    if (typeof v === 'object' && v.raw != null) return stripHtml(v.raw);
    return stripHtml(v);
  }

  /** Same as raw() but preserves the original HTML markup. Use for
   *  rich-text fields where bold / line breaks should render through.
   *  Knack inconsistently stores the HTML version: sometimes under
   *  record[key] (the display value), sometimes under <key>_raw,
   *  depending on the field type. Pick whichever side actually
   *  contains HTML tags; if neither does, fall back to whichever is
   *  defined. */
  function rawHtml(record, key) {
    function asStr(v) {
      if (v == null) return null;
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'object' && v.raw != null) return String(v.raw).trim();
      return null;
    }
    var dispStr = asStr(record[key]);
    var rawStr  = asStr(record[key + '_raw']);
    var dispHasTags = dispStr && /<[a-z]/i.test(dispStr);
    var rawHasTags  = rawStr  && /<[a-z]/i.test(rawStr);
    if (dispHasTags) return dispStr;
    if (rawHasTags)  return rawStr;
    return dispStr || rawStr || '';
  }

  function num(record, key) {
    var s = raw(record, key).replace(/[$,]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** Convert Yes/No string to true/false boolean. */
  function bool(record, key) {
    var v = raw(record, key).toLowerCase();
    return v === 'yes' || v === 'true';
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
        list.push({ id: id, name: String(conns[c].identifier || ('SOW ' + list.length)) });
      }
    }

    list.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
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
        list.push({ id: pkgId, name: String(pkgName || ('Package ' + (list.length + 1))) });
      }
    }

    list.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
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
      SCW.debug('[BidReview] SOW field debug:', {
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
      var hasBid    = connectionAll(rec, FK.bidPackage).length > 0;
      var hasSow    = connectionAll(rec, FK.sow).length > 0;

      // Skip records that are not on any bid AND not connected to a SOW —
      // these are survey-only items that were deliberately removed.
      // (A stale relatedSowItem connection doesn't count; the SOW scope
      // connection field_2154 is the authoritative check.)
      if (!hasBid && !hasSow) continue;

      var rowKey    = sowItemId ? 'sow::' + sowItemId : 'rec::' + rec.id;

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
    if (CFG.debug && bucket.cells.length) {
      var _dbg1946 = meta[FK.sowMdfIdf];
      var _dbg1946r = meta[FK.sowMdfIdf + '_raw'];
      var _dbg2375 = meta[FK.mdfIdf];
      var _dbg2375r = meta[FK.mdfIdf + '_raw'];
      SCW.debug('[BidReview] buildRow field_1946:', _dbg1946, '_raw:', _dbg1946r,
        '| field_2375:', _dbg2375, '_raw:', _dbg2375r,
        '| label:', stripHtml(meta[FK.displayLabel] || ''));
    }
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
          laborDesc:       rawHtml(rec, FK.laborDesc),
          productName:     raw(rec, FK.productName),
          notes:           raw(rec, FK.notes),
          bidExistCabling: raw(rec, FK.bidExistCabling),
          bidPlenum:       raw(rec, FK.plenum),
          bidExterior:     raw(rec, FK.exterior),
          bidDropLength:   raw(rec, FK.dropLength),
          bidConduit:      raw(rec, FK.conduit),
          bidConnDevice:   connectionLabelsAll(rec, FK.bidConnDevice),
          bidConnDeviceIds: connectionIdsAll(rec, FK.bidConnDevice),
          bidConnTo:       connectionLabelsAll(rec, FK.bidConnTo),
          bidConnToIds:    connectionIdsAll(rec, FK.bidConnTo),
          bidMapConn:      raw(rec, FK.bidMapConn),
          requireSubBid:   raw(rec, FK.requireSubBid),
          // Payload-only fields
          field2627:       connectionId(rec, FK.field2627),
          sku:             raw(rec, FK.sku),
          price:           num(rec, FK.price),
          productDesc:     raw(rec, FK.productDesc),
          dropPrefix:      connectionId(rec, FK.dropPrefix),
          dropNumber:      raw(rec, FK.dropNumber),
          limitQtyOne:     bool(rec, FK.limitQtyOne),
          mapConnections:  bool(rec, FK.bidMapConn),
          bidMdfIdf:        connectionLabel(rec, FK.mdfIdf),
          bidMdfIdfIds:    connectionIdsAll(rec, FK.mdfIdf),
          proposalBucketId: connectionId(rec, FK.proposalBucket),
          mdfIdfId:        connectionId(rec, FK.mdfIdf),
          // Full raw view_3680 record (every field) for downstream payloads
          _rawRecord:      rec,
        };
      }
    }

    // A row from view_3680 with no bid-package cells means the item
    // was surveyed but never assigned to a bid package.
    var surveyNoBid = Object.keys(cellsByPackage).length === 0;

    return {
      id:              meta.id,
      rowKey:          rowKey,
      displayLabel:    raw(meta, FK.displayLabel),
      productName:     raw(meta, FK.productName),
      sowItem:         connectionId(meta, FK.relatedSowItem),
      proposalBucket:  connectionLabel(meta, FK.proposalBucket),
      proposalBucketId: connectionId(meta, FK.proposalBucket),
      mdfIdf:          connectionLabel(meta, FK.mdfIdf),
      mdfIdfIds:       connectionIdsAll(meta, FK.mdfIdf),
      sortOrder:       num(meta, FK.sortOrder),
      // SOW detail fields (from first record in the row)
      sowQty:          num(meta, FK.sowQty),
      sowFee:          num(meta, FK.sowFee),
      sowInstallFee:   num(meta, FK.sowInstallFee),
      sowEquipmentTotal: num(meta, FK.sowEquipmentTotal),
      sowProduct:      connectionLabel(meta, FK.sowProduct) || raw(meta, FK.sowProduct),
      sowLaborDesc:    rawHtml(meta, FK.sowLaborDesc),
      sowExistCabling: raw(meta, FK.sowExistCabling),
      sowPlenum:       raw(meta, FK.sowPlenum),
      sowExterior:     raw(meta, FK.sowExterior),
      sowDropLength:   raw(meta, FK.sowDropLength),
      sowConduit:      raw(meta, FK.sowConduit),
      sowConnDevice:   connectionLabelsAll(meta, FK.sowConnDevice),
      sowConnDeviceIds: connectionIdsAll(meta, FK.sowConnDevice),
      sowMapConn:      raw(meta, FK.sowMapConn),
      sowMdfIdf:       connectionLabel(meta, FK.sowMdfIdf) || raw(meta, FK.sowMdfIdf),
      bidMapConn:      raw(meta, FK.bidMapConn),
      cellsByPackage:  cellsByPackage,
      surveyNoBid:     surveyNoBid,
      // Survey notes (field_2412) — pulled from the bid-side record so
      // we can surface them in the bid cell when surveyNoBid is true.
      // Normally these are rendered per-bid-cell from cell.notes; this
      // row-level copy gives the "not on bid" path something to show.
      surveyNotes:     raw(meta, FK.notes) || '',
      // Full raw view_3680 record (meta) for downstream payloads
      _rawRecord:      meta,
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
      // First non-empty mdfIdfId we see for this label — used by the
      // L1 group header's expandable detail panel to look up the
      // matching MDF/IDF record (photos, survey notes, SCW notes).
      var mdfIdfId = '';
      for (var fi = 0; fi < mdfRows.length; fi++) {
        var ids = mdfRows[fi].mdfIdfIds;
        if (ids && ids.length && ids[0]) { mdfIdfId = ids[0]; break; }
      }

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
          mdfIdfId:  mdfIdfId,
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
          mdfIdfId:  mdfIdfId,
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

  // ── build "NO BID" rows from unbid SOW items (view_3921) ────

  /**
   * Convert SOW item records (from view_3921) into NO BID rows.
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
          mdfIdfIds:       connectionIdsAll(rec, SFK.mdfIdf),
          sortOrder:       num(rec, SFK.sortOrder),
          // SOW detail — populated from the SOW item record itself
          sowQty:          num(rec, SFK.qty),
          sowFee:          num(rec, SFK.fee),
          sowInstallFee:   num(rec, SFK.installFee),
          sowEquipmentTotal: num(rec, SFK.equipmentTotal),
          sowProduct:      connectionLabel(rec, SFK.product) || raw(rec, SFK.productName),
          sowLaborDesc:    rawHtml(rec, SFK.laborDesc),
          sowExistCabling: raw(rec, SFK.existCabling),
          sowPlenum:       raw(rec, SFK.plenum),
          sowExterior:     raw(rec, SFK.exterior),
          sowDropLength:   raw(rec, SFK.dropLength),
          sowConduit:      raw(rec, SFK.conduit),
          sowConnDevice:   connectionLabelsAll(rec, SFK.connDevice),
          sowConnDeviceIds: connectionIdsAll(rec, SFK.connDevice),
          sowMapConn:      raw(rec, SFK.mapConn),
          sowMdfIdf:       connectionLabel(rec, SFK.mdfIdf),
          // Survey notes (same field key as bid-side). Lets the "not
          // on bid" cell render the notes the user needs to see.
          surveyNotes:     raw(rec, SFK.notes) || '',
          // No bid data at all
          cellsByPackage:  {},
          noBid:           true,
          // Full raw view_3921 record (every field) for downstream payloads
          _rawRecord:      rec,
        });
      }
    }

    return bySow;
  }

  // ── public entry point ────────────────────────────────────────

  // ── scrape change request records from view_3818 DOM ──────────

  /**
   * Scrape view_3818 (change request grid) from the DOM.
   * Returns a map: bidPackageId → { pendingCount, linkUrl }
   *
   * Each row has:
   *  - A bid-package connection cell (span[data-kn="connection-value"])
   *  - field_2699 (pending change request count)
   *  - A Knack action-link column (<a> tag with the CR detail URL)
   */
  function scrapeCrView() {
    var map = {};
    var viewKey = CFG.changeRequestViewKey;
    if (!viewKey) return map;

    var $view = $('#' + viewKey);
    if (!$view.length) return map;

    var $rows = $view.find('table.kn-table-table tbody tr');
    $rows.each(function () {
      var $tr = $(this);
      if ($tr.hasClass('kn-table-group')) return;

      // Bid-package connection is field_2689 (not field_2415)
      var pkgId = '';
      var $pkgCell = $tr.find('td.' + FK.crBidPackage);
      if ($pkgCell.length) {
        var $connSpan = $pkgCell.find('span[data-kn="connection-value"]');
        if ($connSpan.length) pkgId = ($connSpan.attr('class') || '').trim();
      }
      if (!pkgId) return;

      // Read pending count from field_2699
      var $countCell = $tr.find('td.' + FK.crPendingCount);
      var countText = $countCell.length ? $countCell.text().trim() : '0';
      var count = parseInt(countText, 10) || 0;

      // The detail link is in the kn-table-link cell (eye icon column)
      var linkUrl = '';
      $tr.find('td.kn-table-link a[href]').each(function () {
        var href = $(this).attr('href') || '';
        if (href.indexOf('#') !== -1 && !linkUrl) linkUrl = href;
      });

      if (count > 0 && linkUrl) {
        map[pkgId] = { pendingCount: count, linkUrl: linkUrl };
      }
    });

    if (CFG.debug) {
      SCW.debug('[BidReview] CR view scrape:', Object.keys(map).length, 'packages with pending CRs', map);
    }
    return map;
  }

  ns.scrapeCrView = scrapeCrView;

  // ── extract PDF URLs from bid package records ──────────────────

  function buildPkgInfoMap(bidPackages) {
    var map = {};
    if (!bidPackages || !bidPackages.length) return map;
    for (var i = 0; i < bidPackages.length; i++) {
      var rec = bidPackages[i];
      var id = rec.id;
      if (!id) continue;

      var info = {};

      // Survey connection (field_2386)
      var surveyId = connectionId(rec, FK.bidSurvey);
      if (surveyId) info.surveyId = surveyId;

      // SOW connection (field_2387) — used to gate bid columns to the
      // matching SOW grid. Empty when the bid isn't associated with a
      // specific SOW yet (those should appear on every SOW grid).
      var bidSowId = connectionId(rec, FK.bidSow);
      if (bidSowId) info.bidSowId = bidSowId;

      // Bid status (field_2550) — try multiple strategies
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

      // Bid friendly name (field_2636) — shown under the bid column title,
      // mirroring the SOW friendly name under the SOW grid title.
      if (FK.bidName) {
        var bidName = raw(rec, FK.bidName);
        if (bidName) info.bidName = bidName;
      }
      if (CFG.debug) {
        SCW.debug('[BidReview] Pkg', id, 'field_2550:', rec[FK.bidStatus], '_raw:', rec[FK.bidStatus + '_raw'], '→ status:', bidStatus);
      }

      // File fields: try _raw (object with url) then fall back to HTML parsing
      var rawPdf = rec[FK.bidPdf + '_raw'] || rec[FK.bidPdf];
      if (rawPdf) {
        if (typeof rawPdf === 'object' && rawPdf.url) {
          info.url = rawPdf.url; info.filename = rawPdf.filename || '';
        } else if (typeof rawPdf === 'string') {
          var m = rawPdf.match(/href="([^"]+)"/);
          var fn = rawPdf.match(/>([^<]+)<\/a>/);
          if (m) { info.url = m[1]; info.filename = fn ? fn[1] : ''; }
        }
      }

      map[id] = info;
    }
    return map;
  }

  /**
   * buildState(records, sowItems, bidPackages) → state
   *
   * @param {Array} records     — bid records from view_3680
   * @param {Array} sowItems    — unbid SOW items from view_3921
   * @param {Array} bidPackages — bid package records from view_3573
   * Returns:
   *   {
   *     sowGrids: [{ sowId, sowName, packages, rows, groups, eligibility, columnCount }],
   *     allPackages: [{id, name}],
   *     isEmpty: boolean
   *   }
   */
  ns.buildState = function buildState(records, sowItems, bidPackages) {
    var sows       = extractSows(records);
    var allPkgs    = extractPackages(records);
    var pkgInfoMap = buildPkgInfoMap(bidPackages || []);
    var crMap      = scrapeCrView();

    // Attach PDF, survey, status, SOW, and CR info to each package
    for (var pi = 0; pi < allPkgs.length; pi++) {
      var crInfo = crMap[allPkgs[pi].id];
      if (crInfo) {
        allPkgs[pi].crPendingCount = crInfo.pendingCount;
        allPkgs[pi].crLinkUrl      = crInfo.linkUrl;
      }
      var info = pkgInfoMap[allPkgs[pi].id];
      if (info) {
        if (info.url) { allPkgs[pi].pdfUrl = info.url; allPkgs[pi].pdfFilename = info.filename; }
        if (info.surveyId) allPkgs[pi].surveyId = info.surveyId;
        if (info.bidStatus) allPkgs[pi].bidStatus = info.bidStatus;
        if (info.bidSowId) allPkgs[pi].bidSowId = info.bidSowId;
        if (info.bidName) allPkgs[pi].bidName = info.bidName;
      }
    }

    // Build SOW item lookup: sowItemId → { mdfIdf label from field_1946 }
    var SFK = CFG.sowItemFieldKeys;
    var sowItemLookup = {};
    if (sowItems && sowItems.length) {
      for (var si2 = 0; si2 < sowItems.length; si2++) {
        var siRec = sowItems[si2];
        if (!siRec.id) continue;
        // The SOW item's own field_2154 connections are the authoritative
        // record of which SOWs this line item belongs to. A row can still
        // appear under a SOW grid via the BID record's field_2154 even
        // after the line item was disconnected — comparing against this
        // set lets us flag those "no longer on this SOW" rows.
        var siSowConns = connectionAll(siRec, SFK.sow);
        var siSowIds = {};
        for (var ss = 0; ss < siSowConns.length; ss++) {
          if (siSowConns[ss] && siSowConns[ss].id) siSowIds[siSowConns[ss].id] = true;
        }
        sowItemLookup[siRec.id] = {
          sowIds:          siSowIds,
          // The SOW/survey line item's own label (field_1950) — used to
          // name items in the Update SOW / Create new SOW modals so they
          // don't fall back to the raw record id when the bid-side label
          // (field_2365) is empty (items on the SOW but not on this bid).
          label:           raw(siRec, SFK.displayLabel) ||
                           connectionLabel(siRec, SFK.product) ||
                           raw(siRec, SFK.productName),
          mdfIdf:          connectionLabel(siRec, SFK.mdfIdf),
          installFee:      num(siRec, SFK.installFee),
          equipmentTotal:  num(siRec, SFK.equipmentTotal),
          laborDesc:       rawHtml(siRec, SFK.laborDesc),
          qty:             num(siRec, SFK.qty),
          fee:             num(siRec, SFK.fee),
          existCabling:    raw(siRec, SFK.existCabling),
          plenum:           raw(siRec, SFK.plenum),
          exterior:        raw(siRec, SFK.exterior),
          dropLength:      raw(siRec, SFK.dropLength),
          conduit:         raw(siRec, SFK.conduit),
          connDevice:      connectionLabelsAll(siRec, SFK.connDevice),
          connDeviceIds:   connectionIdsAll(siRec, SFK.connDevice),
          mapConn:         raw(siRec, SFK.mapConn),
        };
      }
      if (CFG.debug) {
        SCW.debug('[BidReview] SOW item lookup built:', Object.keys(sowItemLookup).length, 'items');
      }
    }

    // Global index: bid package id → every bid record on that package
    // (across the whole dataset). Used to make a bid COLUMN show all of
    // its items wherever it appears, even ones whose line item lives on
    // another SOW (those render in an "Other items on this bid" block).
    var pkgAllRecords = {};
    for (var pari = 0; pari < records.length; pari++) {
      var parPkgs = connectionAll(records[pari], FK.bidPackage);
      for (var parp = 0; parp < parPkgs.length; parp++) {
        var parPid = parPkgs[parp].id;
        if (!parPid) continue;
        (pkgAllRecords[parPid] = pkgAllRecords[parPid] || []).push(records[pari]);
      }
    }

    // Does a bid record "touch" a SOW? True if its own field_2154 lists
    // the SOW, OR its related SOW line item (field_2404) is connected to
    // it. A bid column shows on a SOW grid when any of its records touch.
    function recordTouchesSow(rec, sowId) {
      var sc = connectionAll(rec, FK.sow);
      for (var x = 0; x < sc.length; x++) {
        if (sc[x] && sc[x].id === sowId) return true;
      }
      var siId = connectionId(rec, FK.relatedSowItem);
      if (siId && sowItemLookup[siId] && sowItemLookup[siId].sowIds &&
          sowItemLookup[siId].sowIds[sowId]) return true;
      return false;
    }
    function packageTouchesSow(pkgId, sowId) {
      var precs = pkgAllRecords[pkgId] || [];
      for (var t = 0; t < precs.length; t++) {
        if (recordTouchesSow(precs[t], sowId)) return true;
      }
      return false;
    }

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

    // Build NO BID rows from view_3921 SOW items
    var noBidBySow = buildNoBidRows(sowItems || []);

    if (CFG.debug && Object.keys(noBidBySow).length) {
      var noBidTotal = 0;
      var noBidSowIds = Object.keys(noBidBySow);
      for (var nk = 0; nk < noBidSowIds.length; nk++) {
        noBidTotal += noBidBySow[noBidSowIds[nk]].length;
      }
      SCW.debug('[BidReview] NO BID rows:', noBidTotal, 'across', noBidSowIds.length, 'SOWs');
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

      // Merge in NO BID rows for this SOW — skip any whose SOW item
      // already appears in a view_3680 row (e.g. surveyNoBid rows)
      var existingSowItems = {};
      for (var ei = 0; ei < rows.length; ei++) {
        if (rows[ei].sowItem) existingSowItems[rows[ei].sowItem] = true;
      }
      var noBidRows = noBidBySow[sow.id] || [];
      for (var nb = 0; nb < noBidRows.length; nb++) {
        if (noBidRows[nb].sowItem && existingSowItems[noBidRows[nb].sowItem]) {
          if (CFG.debug) {
            SCW.debug('[BidReview] Skipping noBid row — already in view_3680:',
                        noBidRows[nb].sowItem, noBidRows[nb].displayLabel);
          }
          continue;
        }
        rows.push(noBidRows[nb]);
      }

      // Merge SOW MDF/IDF (field_1946) and totals into rows from the SOW item lookup.
      // view_3680 (bid records) does NOT project field_2028/field_2269 — those
      // live on the SOW item record (view_3921). Pull them across via the
      // relatedSowItem connection so matched rows get totals too.
      for (var mi2 = 0; mi2 < rows.length; mi2++) {
        var r2 = rows[mi2];
        if (r2.sowItem && sowItemLookup[r2.sowItem]) {
          var siData = sowItemLookup[r2.sowItem];
          // The row is here because the bid record still points at this
          // SOW, but the line item itself was disconnected — flag it so
          // the grid can call it out instead of showing a misleading
          // blank/normal SOW row.
          r2.offSow = !siData.sowIds[sow.id];
          // Fall back to the SOW item's own label when the bid-side
          // label is missing (item on the SOW but not on this bid).
          r2.sowItemLabel = siData.label || '';
          if (siData.mdfIdf && !r2.sowMdfIdf) {
            r2.sowMdfIdf = siData.mdfIdf;
          }
          // Always prefer the SOW item record\'s editable fields over the
          // bid record\'s projected display copies — view_3680\'s connection
          // projections don\'t track edits made to the connected SOW item
          // until view_3680 itself re-fetches, so the displayed row would
          // otherwise stay stale after an inline panel edit.
          r2.sowInstallFee    = siData.installFee;
          r2.sowEquipmentTotal = siData.equipmentTotal;
          r2.sowLaborDesc     = siData.laborDesc;
          r2.sowQty           = siData.qty;
          r2.sowFee           = siData.fee;
          r2.sowExistCabling  = siData.existCabling;
          r2.sowPlenum        = siData.plenum;
          r2.sowExterior      = siData.exterior;
          r2.sowDropLength    = siData.dropLength;
          r2.sowConduit       = siData.conduit;
          r2.sowConnDevice    = siData.connDevice;
          r2.sowConnDeviceIds = siData.connDeviceIds;
          r2.sowMapConn       = siData.mapConn;
        }
      }

      // Columns: a bid renders as a column on this SOW grid when the bid
      // TOUCHES this SOW (any of its records' line items / own field_2154
      // connect here) — so every SOW a bid touches shows that bid. Build
      // from allPkgs (already carries CR / PDF / status / bidSow info) so
      // a touching bid with no records bucketed into this SOW still shows.
      var pkgs = [];
      for (var api = 0; api < allPkgs.length; api++) {
        if (!packageTouchesSow(allPkgs[api].id, sow.id)) continue;
        var pc = {};
        for (var pk in allPkgs[api]) {
          if (Object.prototype.hasOwnProperty.call(allPkgs[api], pk)) pc[pk] = allPkgs[api][pk];
        }
        pkgs.push(pc);
      }

      // ── "Other items on this bid" — completeness ──────────────
      // Every item on a displayed bid must appear in its column. Items
      // whose line item isn't on this SOW have no matched row, so collect
      // them into a separate bottom block. Track which bid records are
      // already shown as matched rows (by record id) to avoid dupes.
      var shownRecIds = {};
      for (var sri = 0; sri < rows.length; sri++) {
        var scells = rows[sri].cellsByPackage || {};
        for (var scp in scells) {
          if (scells[scp] && scells[scp].id) shownRecIds[scells[scp].id] = true;
        }
      }
      var otherRecs = [], seenOther = {};
      for (var oc = 0; oc < pkgs.length; oc++) {
        var oprecs = pkgAllRecords[pkgs[oc].id] || [];
        for (var op = 0; op < oprecs.length; op++) {
          var orec = oprecs[op];
          if (shownRecIds[orec.id] || seenOther[orec.id]) continue;
          seenOther[orec.id] = true;
          otherRecs.push(orec);
        }
      }
      var otherRows = otherRecs.length ? buildRowsForSow(otherRecs) : [];
      for (var orw = 0; orw < otherRows.length; orw++) {
        var orr = otherRows[orw];
        if (orr.sowItem && sowItemLookup[orr.sowItem]) {
          orr.sowItemLabel = sowItemLookup[orr.sowItem].label || '';
        }
        // Not on this SOW — reuse the offSow treatment (cut-out SOW cell,
        // excluded from SOW totals, still counted in the bid column total).
        orr.offSow = true;
        orr.otherBidItem = true;
      }

      // Per-package on-SOW count: a column with ZERO matched on-SOW items
      // (all of its items live on other SOWs) collapses by default.
      for (var pcnt = 0; pcnt < pkgs.length; pcnt++) {
        var onSow = 0;
        for (var mr = 0; mr < rows.length; mr++) {
          if (rows[mr].cellsByPackage && rows[mr].cellsByPackage[pkgs[pcnt].id]) onSow++;
        }
        pkgs[pcnt].onSowItemCount = onSow;
        pkgs[pcnt].noOnSowItems   = (onSow === 0);
      }

      // Matched rows render in their MDF/IDF groups; "other" items go in a
      // dedicated bottom group so the matched grid stays as-is.
      var groups  = groupRows(rows);
      if (otherRows.length) {
        groups.push({
          key:       '__other_bid_items__',
          label:     'Other items on these bids (not on this SOW)',
          mdfIdfId:  '',
          level:     1,
          rows:      otherRows,
          subgroups: [],
          otherBidItems: true,
        });
      }

      // sowGrid.rows includes the other items so bid column totals count
      // them (header-total logic skips offSow rows for the SOW total).
      var allRows = otherRows.length ? rows.concat(otherRows) : rows;
      var elig    = computeEligibility(rows, pkgs);

      sowGrids.push({
        sowId:       sow.id,
        sowName:     stripHtml(sow.name),
        packages:    pkgs,
        rows:        allRows,
        groups:      groups,
        eligibility: elig,
        // Full table column count INCLUDING the Sub-Bid-Revisions
        // column (label + photos + SOW + N packages + CR). render.js
        // decrements this by 1 when it strips the CR column from the
        // DOM, so the group / subgroup header colspans end up matching
        // the actual visible column count in both cases.
        columnCount: pkgs.length + 4,
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
        columnCount: fallbackPkgs.length + 3,
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
