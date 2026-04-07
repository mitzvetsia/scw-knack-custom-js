/*** BID REVIEW — DATA TRANSFORMATION ***/
/**
 * Converts raw Knack row/cell records into a normalized in-memory
 * state object.  All derived values (package list, grouping, eligibility
 * counts) are computed here — rendering and actions never re-derive.
 *
 * Reads : SCW.bidReview.CONFIG.fieldKeys, CONFIG.statusValues
 * Writes: SCW.bidReview.buildState(rawRows, rawCells) → state
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
   * Deduplicate packages from cell records.
   * Returns sorted array: [{ id, name }]
   */
  function extractPackages(cells) {
    var seen = {};
    var list = [];

    for (var i = 0; i < cells.length; i++) {
      var pkgId   = connectionId(cells[i], FK.bidPackage);
      var pkgName = connectionLabel(cells[i], FK.bidPackageName) ||
                    connectionLabel(cells[i], FK.bidPackage);
      if (!pkgId || seen[pkgId]) continue;
      seen[pkgId] = true;
      list.push({ id: pkgId, name: pkgName || 'Package ' + (list.length + 1) });
    }

    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  // ── build cell map ────────────────────────────────────────────

  /**
   * Index cells by (reviewRowId, packageId).
   * Warns on duplicates and keeps the first occurrence.
   * Returns: { rowId: { pkgId: cellData } }
   */
  function indexCells(cells) {
    var map = {};

    for (var i = 0; i < cells.length; i++) {
      var rec   = cells[i];
      var rowId = connectionId(rec, FK.cellReviewRow);
      var pkgId = connectionId(rec, FK.bidPackage);
      if (!rowId || !pkgId) continue;

      if (!map[rowId]) map[rowId] = {};

      if (map[rowId][pkgId]) {
        if (CFG.debug) {
          console.warn('[BidReview] Duplicate cell for row=' + rowId +
                       ' pkg=' + pkgId + ' — keeping first');
        }
        continue;
      }

      map[rowId][pkgId] = {
        id:               rec.id,
        qty:              num(rec, FK.qty),
        labor:            num(rec, FK.labor),
        laborDescription: raw(rec, FK.laborDescription),
        notes:            raw(rec, FK.notes),
        status:           raw(rec, FK.status),
      };
    }

    return map;
  }

  // ── build rows ────────────────────────────────────────────────

  /**
   * Normalize a raw Knack row record into a flat row object.
   */
  function normalizeRow(rec, cellMap) {
    var id = rec.id;
    return {
      id:           id,
      displayLabel: raw(rec, FK.displayLabel),
      sowItem:      connectionId(rec, FK.relatedSowItem),
      rowType:      raw(rec, FK.rowType),
      groupL1:      raw(rec, FK.groupL1),
      groupL2:      raw(rec, FK.groupL2),
      sortOrder:    num(rec, FK.sortOrder),
      cellsByPackage: cellMap[id] || {},
    };
  }

  // ── grouping ──────────────────────────────────────────────────

  /**
   * Group rows by L1 then L2.
   * Returns: [{ key, label, level, rows: [row] | subgroups: [{ key, label, level, rows }] }]
   *
   * If no grouping fields are populated the result is a single
   * flat group containing all rows.
   */
  function groupRows(rows) {
    var hasAnyGroup = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].groupL1) { hasAnyGroup = true; break; }
    }

    if (!hasAnyGroup) {
      return [{ key: '__all__', label: '', level: 0, rows: rows, subgroups: [] }];
    }

    // Bucket by L1
    var l1Map   = {};
    var l1Order = [];

    for (var j = 0; j < rows.length; j++) {
      var r   = rows[j];
      var l1  = r.groupL1 || 'Ungrouped';

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

    // Build output
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
        rows:      [],          // L1 groups hold subgroups, not direct rows
        subgroups: subgroups,
      });
    }

    return groups;
  }

  // ── eligibility counts (precomputed) ──────────────────────────

  /**
   * For each package, count how many rows are adoptable, creatable,
   * or eligible for the combined action.
   *
   * Returns: { pkgId: { adoptable, creatable, total } }
   */
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

  /**
   * Return array of row IDs eligible for a package-level action.
   * Used by the action system to build payloads.
   *
   * @param {string} pkgId
   * @param {string} actionType  – 'package_adopt_all' | 'package_create_missing' | 'package_adopt_create'
   * @param {object} state       – the normalized state from buildState
   * @returns {string[]}
   */
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
   * buildState(rawRows, rawCells) → state
   *
   * @param {object[]} rawRows  – Knack records from the rows view
   * @param {object[]} rawCells – Knack records from the cells view
   * @returns {object} Normalized state consumed by render + actions:
   *   {
   *     packages:    [{ id, name }],
   *     groups:      [{ key, label, level, rows|subgroups }],
   *     flatRows:    [row],                       // ungrouped for iteration
   *     eligibility: { pkgId: { adoptable, creatable, total } },
   *     columnCount: number,                      // packages.length + 2 (SOW + actions)
   *     isEmpty:     boolean,
   *   }
   */
  ns.buildState = function buildState(rawRows, rawCells) {
    var packages = extractPackages(rawCells);
    var cellMap  = indexCells(rawCells);

    // Normalize rows
    var flatRows = [];
    for (var i = 0; i < rawRows.length; i++) {
      flatRows.push(normalizeRow(rawRows[i], cellMap));
    }

    // Sort by sortOrder globally before grouping
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
