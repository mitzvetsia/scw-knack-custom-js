/*** BID REVIEW — DATA TRANSFORMATION ***/
/**
 * Pivots a flat array of Knack records (one per package × SOW item)
 * into a normalized matrix state.  Each record becomes a "cell";
 * rows are derived by grouping on the SOW/display-label identity.
 *
 * All derived values (package list, grouping, eligibility counts)
 * are computed here — rendering and actions never re-derive.
 *
 * Reads : SCW.bidReview.CONFIG.fieldKeys, CONFIG.statusValues
 * Writes: SCW.bidReview.buildState(records), .collectEligible()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;
  var FK  = CFG.fieldKeys;
  var SV  = CFG.statusValues;

  // ── tiny helpers ──────────────────────────────────────────────

  /** Return the raw text value from a Knack field (handles objects with .raw). */
  function raw(record, key) {
    var v = record[key];
    if (v == null) return '';
    if (typeof v === 'object' && v.raw != null) return String(v.raw);
    return String(v);
  }

  /** Parse a numeric field — strips $, commas, returns 0 for blanks. */
  function num(record, key) {
    var s = raw(record, key).replace(/[$,]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** Stable identifier for a connection field (Knack stores an array of {id,identifier}). */
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

  // ── extract packages ──────────────────────────────────────────

  /**
   * Deduplicate packages from records.
   * Returns sorted array: [{ id, name }]
   */
  function extractPackages(records) {
    var seen = {};
    var list = [];

    for (var i = 0; i < records.length; i++) {
      var pkgId   = connectionId(records[i], FK.bidPackage);
      var pkgName = connectionLabel(records[i], FK.bidPackageName) ||
                    connectionLabel(records[i], FK.bidPackage);
      if (!pkgId || seen[pkgId]) continue;
      seen[pkgId] = true;
      list.push({ id: pkgId, name: pkgName || 'Package ' + (list.length + 1) });
    }

    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  // ── pivot flat records into rows ──────────────────────────────

  /**
   * Group records by their row identity.
   *
   * Row identity is determined by:
   *   1. relatedSowItem connection ID (if present), OR
   *   2. displayLabel text (fallback for unmatched bid items)
   *
   * Each unique identity becomes one matrix row.
   * Returns: { rowKey: { meta: firstRecord, cells: [records] } }
   */
  function pivotRecords(records) {
    var rowMap   = {};
    var rowOrder = [];

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];

      // Row identity: prefer SOW connection, fall back to label
      var sowId = connectionId(rec, FK.relatedSowItem);
      var label = raw(rec, FK.displayLabel);
      var rowKey = sowId ? 'sow::' + sowId : 'label::' + label;

      if (!rowMap[rowKey]) {
        rowMap[rowKey] = { meta: rec, cells: [] };
        rowOrder.push(rowKey);
      }

      rowMap[rowKey].cells.push(rec);
    }

    return { map: rowMap, order: rowOrder };
  }

  /**
   * Build a normalized row from the pivot bucket.
   */
  function buildRow(rowKey, bucket) {
    var meta = bucket.meta;
    var cellsByPackage = {};

    for (var i = 0; i < bucket.cells.length; i++) {
      var rec   = bucket.cells[i];
      var pkgId = connectionId(rec, FK.bidPackage);
      if (!pkgId) continue;

      if (cellsByPackage[pkgId]) {
        if (CFG.debug) {
          console.warn('[BidReview] Duplicate cell for row=' + rowKey +
                       ' pkg=' + pkgId + ' — keeping first');
        }
        continue;
      }

      cellsByPackage[pkgId] = {
        id:               rec.id,
        qty:              num(rec, FK.qty),
        labor:            num(rec, FK.labor),
        laborDescription: raw(rec, FK.laborDescription),
        notes:            raw(rec, FK.notes),
        status:           raw(rec, FK.status),
      };
    }

    return {
      id:             meta.id,            // first record's id as row identifier
      rowKey:         rowKey,
      displayLabel:   raw(meta, FK.displayLabel),
      sowItem:        connectionId(meta, FK.relatedSowItem),
      rowType:        raw(meta, FK.rowType),
      groupL1:        raw(meta, FK.groupL1),
      groupL2:        raw(meta, FK.groupL2),
      sortOrder:      num(meta, FK.sortOrder),
      cellsByPackage: cellsByPackage,
    };
  }

  // ── grouping ──────────────────────────────────────────────────

  /**
   * Group rows by L1 then L2.
   * Returns: [{ key, label, level, rows, subgroups }]
   */
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
        l2Rows.sort(function (a, b) { return a.sortOrder - b.sortOrder; });

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

  // ── eligibility counts ────────────────────────────────────────

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

  // ── public: collectEligible ───────────────────────────────────

  function collectEligible(pkgId, actionType, state) {
    var ids  = [];
    var rows = state.flatRows;

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
   * Takes a flat array of Knack records (each is one package × item
   * intersection) and pivots them into the matrix state object.
   *
   * @param {object[]} records — raw Knack records from the single view
   * @returns {object} Normalized state:
   *   {
   *     packages, groups, flatRows, eligibility, columnCount, isEmpty
   *   }
   */
  ns.buildState = function buildState(records) {
    var packages = extractPackages(records);
    var pivot    = pivotRecords(records);

    // Build normalized rows in source order
    var flatRows = [];
    for (var i = 0; i < pivot.order.length; i++) {
      var key = pivot.order[i];
      flatRows.push(buildRow(key, pivot.map[key]));
    }

    // Sort by sortOrder
    flatRows.sort(function (a, b) { return a.sortOrder - b.sortOrder; });

    var groups      = groupRows(flatRows);
    var eligibility = computeEligibility(flatRows, packages);

    return {
      packages:    packages,
      groups:      groups,
      flatRows:    flatRows,
      eligibility: eligibility,
      columnCount: packages.length + 2,
      isEmpty:     flatRows.length === 0,
    };
  };

  ns.collectEligible = collectEligible;

})();
