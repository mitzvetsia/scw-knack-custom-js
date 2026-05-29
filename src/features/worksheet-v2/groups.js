/*** WORKSHEET V2 — GROUPS ****************************************************
 *
 * Pure data layer that buckets a flat record list into a two-level
 * group tree (MDF/IDF as L1, proposal bucket as L2). No DOM. The
 * tree gets handed to render.js which produces the matching markup.
 *
 * Matches v1's v3610 grouping conventions:
 *   - L1 = field_1946 (MDF/IDF location). Records with a blank value
 *     fall into a synthetic L1 — "Project Wide Services" /
 *     "Project Wide Assumptions" / "Unassigned" depending on bucket.
 *   - L2 = field_2219 (proposal bucket). Records with a blank bucket
 *     fall into an "Other" L2.
 *   - Sort order within L2: field_2218 ascending (the bucket's
 *     sortOrder), then by label / record id as tiebreakers.
 *   - L1 sort: alphabetical by identifier. Synthetic groups sink to
 *     the bottom (matches v1's syntheticGroupsPosition: 'bottom').
 *
 * The synthetic-bucket → L1 assignment uses bucket identifier text
 * matching ("Services" → "Project Wide Services", "Assumptions" →
 * "Project Wide Assumptions"). v1 used bucket-ID classes; here we
 * match by label so v2 doesn't need to hardcode bucket IDs.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  var FIELD_MDF_IDF = 'field_1946';
  var FIELD_BUCKET  = 'field_2219';
  var FIELD_SORT    = 'field_2218';
  var FIELD_LABEL   = 'field_2365'; // tiebreaker — display label (E-001, etc.)

  // Mounting hardware accessories live on the same SOW Line Items
  // object. A parent line item's field_1958 ("Mounting Hardware") is a
  // multi-connection pointing at its accessory rows; each accessory's
  // field_2464 mirrors that connection back at the parent.
  //
  // Authoritative definition of "attached" for v2's filter: the
  // accessory's record id appears in SOME parent's field_1958_raw.
  // We build that referenced-id set once per buildGroupTree pass and
  // use it both to hide attached accessories AND to surface
  // unreferenced mounting-bucket records as a synthetic "Orphaned
  // Mounting Brackets" L1. Reading the forward link instead of the
  // back-link sidesteps any case where field_2464 hasn't caught up to
  // a recent field_1958 edit.
  var ACCESSORY_PARENT_FIELD     = 'field_2464';
  var ACCESSORY_FORWARD_FIELD    = 'field_1958';
  var MOUNTING_HARDWARE_BUCKET   = '594a94536877675816984cb9';
  var SYNTHETIC_ORPHAN_BRACKETS_LABEL = 'Orphaned Mounting Brackets';

  function bucketIdOf(rec) {
    var raw = rec && rec['field_2219_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  /** "No" or "false" on a record\'s Require-Sub-Bid flag (field_2479).
   *  Brackets are only HIDDEN (attached-under-parent) when this is
   *  true; any other value — Yes, empty, missing — leaves the bracket
   *  visible as its own line item so the user can adjust sub bid /
   *  hours / materials on it directly. */
  var REQUIRE_SUBBID_FIELD = 'field_2479';
  function isRequireSubBidNoOrFalse(rec) {
    var raw = rec && rec[REQUIRE_SUBBID_FIELD + '_raw'];
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    var s = (rec && rec[REQUIRE_SUBBID_FIELD] || '').toString().trim().toLowerCase();
    return s === 'no' || s === 'false' || s === '0';
  }

  function collectAttachedAccessoryIds(records) {
    var recordById = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      if (records[i] && records[i].id) recordById[records[i].id] = records[i];
    }
    var attached = Object.create(null);
    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (!rec || !rec.id) continue;
      // No bucket check — any record (any bucket) is "attached and
      // hidden" when it has a parent AND its Require Sub Bid flag is
      // explicitly No/false. Otherwise it shows as its own line item.
      if (!isRequireSubBidNoOrFalse(rec)) continue;
      var raw = rec[ACCESSORY_PARENT_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var k = 0; k < raw.length; k++) {
        var parentId = raw[k] && raw[k].id;
        if (parentId && recordById[parentId]) {
          attached[rec.id] = true;
          break;
        }
      }
    }
    return attached;
  }

  // Synthetic L1 buckets. Records with no MDF/IDF go into one of
  // these based on the bucket's identifier text.
  var SYNTHETIC_SERVICES_LABEL    = 'Project Wide Services';
  var SYNTHETIC_ASSUMPTIONS_LABEL = 'Project Wide Assumptions';
  var SYNTHETIC_UNASSIGNED_LABEL  = 'Unassigned';

  /** Extract { id, label } from a connection-field _raw array. */
  function readConn(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) {
      return { id: raw[0].id || '', label: raw[0].identifier || '' };
    }
    if (raw && typeof raw === 'object' && raw.identifier) {
      return { id: raw.id || '', label: raw.identifier };
    }
    return { id: '', label: '' };
  }

  function readNumber(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (typeof raw === 'number') return raw;
    // Connection-via-formula fields (e.g. field_2218 — the proposal
    // bucket's sortOrder pulled through the bucket connection) come
    // back as [{id, identifier}]. The identifier holds the actual
    // numeric value; fall back to it before scraping text.
    if (Array.isArray(raw) && raw.length && raw[0]) {
      var ident = raw[0].identifier;
      if (typeof ident === 'number') return ident;
      if (typeof ident === 'string') {
        var ni = parseFloat(ident);
        if (isFinite(ni)) return ni;
      }
    }
    var s = rec[fieldKey];
    if (s == null) return null;
    // Strip HTML tags BEFORE stripping non-digits — otherwise the hex
    // record ids on connection-cell <span> attrs get concatenated with
    // the value and produce nonsense like 697b7a023a31502ec68b33030
    // for an actual sortOrder of 8.
    s = String(s).replace(/<[^>]*>/g, ' ');
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  function readPlain(rec, fieldKey) {
    var v = rec[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  /** Decide which synthetic L1 a no-MDF record belongs to. */
  function syntheticL1ForBucket(bucketLabel) {
    var lc = String(bucketLabel || '').toLowerCase();
    if (lc.indexOf('service') !== -1)    return SYNTHETIC_SERVICES_LABEL;
    if (lc.indexOf('assumption') !== -1) return SYNTHETIC_ASSUMPTIONS_LABEL;
    return SYNTHETIC_UNASSIGNED_LABEL;
  }

  /**
   * Bucket records into the L1 → L2 → records tree.
   *
   * @param {Array<Object>} records      flat list of Backbone attrs hashes
   * @param {Array<Object>} [seedL1Groups] optional list of { id, label }
   *        for MDF/IDF locations that should appear as L1 groups even
   *        when no records are assigned to them. Real groups deduped by
   *        id with whatever the records contribute.
   * @returns {Array<Object>} L1 nodes, each:
   *   { id, label, isSynthetic, sortOrder, recordCount,
   *     l2: [{ id, label, sortOrder, records: [...] }, ...] }
   */
  function buildGroupTree(records, seedL1Groups, opts) {
    opts = opts || {};
    var sortPreset = opts.sortPreset || null;
    // First pass: bucket into L1 → L2 maps
    var l1Map = Object.create(null);

    // Seed empty L1 entries for every known MDF/IDF location, even
    // ones that no SOW line items currently reference. Records below
    // will hit `l1Map[id]` and add their counts/l2 entries to these.
    if (Array.isArray(seedL1Groups)) {
      for (var s = 0; s < seedL1Groups.length; s++) {
        var seed = seedL1Groups[s];
        if (!seed || !seed.id || !seed.label) continue;
        if (l1Map[seed.id]) continue;
        l1Map[seed.id] = {
          id:           seed.id,
          label:        seed.label,
          isSynthetic:  false,
          sortOrder:    Infinity,
          recordCount:  0,
          l2Map:        Object.create(null)
        };
      }
    }

    var attachedIds = collectAttachedAccessoryIds(records);
    // Local recordById lookup for the promoted-bracket parent-inherit
    // logic below — we need to resolve a bracket\'s field_2464 parent
    // to walk to its MDF/IDF.
    var recordByIdLocal = Object.create(null);
    for (var rb = 0; rb < records.length; rb++) {
      if (records[rb] && records[rb].id) recordByIdLocal[records[rb].id] = records[rb];
    }

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var inMountingBucket = bucketIdOf(rec) === MOUNTING_HARDWARE_BUCKET;
      // Attached accessory → hide. Authoritative test: this record's
      // id is referenced by SOME parent's field_1958_raw.
      if (rec.id && attachedIds[rec.id]) continue;

      var l1Conn   = readConn(rec, FIELD_MDF_IDF);
      var l2Conn   = readConn(rec, FIELD_BUCKET);
      var sortOrd  = readNumber(rec, FIELD_SORT);

      var l1Id, l1Label, isSynthetic;
      // For mounting-hardware records that survived the attached-hide
      // gate: split orphans (no loaded parent) from promoted brackets
      // (parent loaded, but Require Sub Bid is non-No so the bracket
      // shows as its own row). Promoted brackets inherit the parent\'s
      // MDF/IDF L1 so they sit alongside the parent in the tree.
      var promotedParent = null;
      if (inMountingBucket) {
        var parRaw = rec[ACCESSORY_PARENT_FIELD + '_raw'];
        if (Array.isArray(parRaw)) {
          for (var pp = 0; pp < parRaw.length; pp++) {
            var pid = parRaw[pp] && parRaw[pp].id;
            if (pid && recordByIdLocal[pid]) { promotedParent = recordByIdLocal[pid]; break; }
          }
        }
      }
      if (inMountingBucket && !promotedParent) {
        // Truly unreferenced mounting-hardware row → orphan synthetic L1.
        l1Label     = SYNTHETIC_ORPHAN_BRACKETS_LABEL;
        l1Id        = '__synthetic__' + l1Label;
        isSynthetic = true;
      } else if (promotedParent) {
        // Promoted bracket: inherit the parent\'s MDF/IDF so it sits
        // adjacent to its parent in the tree. Fall back to the
        // bracket\'s own MDF/IDF if the parent has none.
        var pMdf = readConn(promotedParent, FIELD_MDF_IDF);
        if (pMdf.label) {
          l1Id    = pMdf.id || pMdf.label;
          l1Label = pMdf.label;
        } else if (l1Conn.label) {
          l1Id    = l1Conn.id || l1Conn.label;
          l1Label = l1Conn.label;
        } else {
          l1Label = syntheticL1ForBucket(l2Conn.label);
          l1Id    = '__synthetic__' + l1Label;
        }
        isSynthetic = !pMdf.label && !l1Conn.label;
      } else if (l1Conn.label) {
        l1Id        = l1Conn.id || l1Conn.label;
        l1Label     = l1Conn.label;
        isSynthetic = false;
      } else {
        l1Label     = syntheticL1ForBucket(l2Conn.label);
        l1Id        = '__synthetic__' + l1Label;
        isSynthetic = true;
      }

      var l1 = l1Map[l1Id];
      if (!l1) {
        l1 = {
          id:           l1Id,
          label:        l1Label,
          isSynthetic:  isSynthetic,
          sortOrder:    Infinity,
          recordCount:  0,
          l2Map:        Object.create(null)
        };
        l1Map[l1Id] = l1;
      }
      l1.recordCount++;
      if (sortOrd != null && sortOrd < l1.sortOrder) l1.sortOrder = sortOrd;

      var l2Id    = l2Conn.id || l2Conn.label || '__l2_other';
      var l2Label = l2Conn.label || 'Other';
      var l2 = l1.l2Map[l2Id];
      if (!l2) {
        l2 = {
          id:        l2Id,
          label:     l2Label,
          sortOrder: Infinity,
          records:   []
        };
        l1.l2Map[l2Id] = l2;
      }
      if (sortOrd != null && sortOrd < l2.sortOrder) l2.sortOrder = sortOrd;
      l2.records.push(rec);
    }

    // Second pass: flatten l1Map / l2Map into ordered arrays
    var l1List = [];
    Object.keys(l1Map).forEach(function (k) { l1List.push(l1Map[k]); });

    // L1 sort: real groups alphabetical (numeric-aware), synthetic last
    l1List.sort(function (a, b) {
      if (a.isSynthetic !== b.isSynthetic) return a.isSynthetic ? 1 : -1;
      return String(a.label).localeCompare(String(b.label), undefined, {
        numeric: true, sensitivity: 'base'
      });
    });

    l1List.forEach(function (l1) {
      // Flatten every per-bucket L2 into a single records list so
      // proposal-bucket sub-headers go away — MDF/IDF is the only
      // grouping. The L2 list then has exactly one synthetic entry
      // ("__flat") containing all records, ordered by the active
      // sort preset (or the default rule if none).
      var allRecords = [];
      Object.keys(l1.l2Map).forEach(function (k) {
        var rs = l1.l2Map[k].records || [];
        for (var ri = 0; ri < rs.length; ri++) allRecords.push(rs[ri]);
      });
      var l2List = [{
        id: '__flat',
        label: '',
        sortOrder: 0,
        records: allRecords
      }];
      // Empty L1 (seeded group with no records) — emit an empty
      // placeholder so render.js still walks the L1 header.
      if (!allRecords.length) {
        l2List[0].id = '__empty_l2';
      }

      // L2 sort: by minimum sortOrder seen, then alphabetical fallback
      l2List.sort(function (a, b) {
        var sa = isFinite(a.sortOrder) ? a.sortOrder : Infinity;
        var sb = isFinite(b.sortOrder) ? b.sortOrder : Infinity;
        if (sa !== sb) return sa - sb;
        return String(a.label).localeCompare(String(b.label), undefined, {
          numeric: true, sensitivity: 'base'
        });
      });

      // Sort records within each L2 — matches v1's view_3610 default
      // rowSort: field_2218 (sortOrder, numeric) → field_2240 (drop
      // prefix, text) → field_1951 (drop number, numeric). The same
      // three-key sort device-worksheet.js applies after Knack's own
      // server-side ordering.
      function compareDefault(a, b) {
        var sa = readNumber(a, FIELD_SORT);
        var sb = readNumber(b, FIELD_SORT);
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        if (sa != null && sb == null) return -1;
        if (sa == null && sb != null) return 1;
        var pa = readPlain(a, 'field_2240');
        var pb = readPlain(b, 'field_2240');
        var cmpP = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
        if (cmpP !== 0) return cmpP;
        var na = readNumber(a, 'field_1951');
        var nb = readNumber(b, 'field_1951');
        if (na != null && nb != null && na !== nb) return na - nb;
        if (na != null && nb == null) return -1;
        if (na == null && nb != null) return 1;
        var la = readPlain(a, FIELD_LABEL);
        var lb = readPlain(b, FIELD_LABEL);
        return la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
      }

      function cmpField(a, b, field, type, order) {
        var sign = (order === 'desc') ? -1 : 1;
        if (type === 'number') {
          var av = readNumber(a, field);
          var bv = readNumber(b, field);
          if (av != null && bv != null && av !== bv) return sign * (av - bv);
          if (av != null && bv == null) return -1 * sign;
          if (av == null && bv != null) return 1 * sign;
          return 0;
        }
        var sa = readPlain(a, field);
        var sb = readPlain(b, field);
        return sign * sa.localeCompare(sb, undefined,
          { numeric: true, sensitivity: 'base' });
      }

      // Preset-driven sort with default fallback for ties.
      function compareWithPreset(a, b) {
        if (!sortPreset) return compareDefault(a, b);
        if (sortPreset.rule && sortPreset.rule.length) {
          for (var k = 0; k < sortPreset.rule.length; k++) {
            var r = sortPreset.rule[k];
            var c = cmpField(a, b, r.field, r.type || 'text', r.order || 'asc');
            if (c !== 0) return c;
          }
          return compareDefault(a, b);
        }
        if (sortPreset.field) {
          var cp = cmpField(a, b, sortPreset.field,
                            sortPreset.type || 'text',
                            sortPreset.order || 'asc');
          if (cp !== 0) return cp;
          return compareDefault(a, b);
        }
        return compareDefault(a, b);
      }

      l2List.forEach(function (l2) {
        l2.records.sort(compareWithPreset);
      });

      l1.l2 = l2List;
      delete l1.l2Map;
    });

    return l1List;
  }

  ns.groups = {
    buildGroupTree: buildGroupTree
  };
})();
/*** END WORKSHEET V2 — GROUPS ************************************************/
