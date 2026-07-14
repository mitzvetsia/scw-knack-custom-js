/*** WORKSHEET V2 — BULK EDIT *************************************************
 *
 * Per-row + per-L1 + worksheet-wide selection, a floating toolbar that
 * appears when ≥1 row is selected, and an "Edit selected" modal that
 * lets the user write one or more fields to every selected record in
 * a single action.
 *
 * Architecture:
 *   - selectedIds   : Set of currently-selected record ids.
 *   - data-scw-ws-v2-select        on each card
 *   - data-scw-ws-v2-l1-select     on each L1 head
 *   - delegated change listener flips state + UI on / off
 *   - field registry by bucket category (cam / default / services /
 *     assumptions) maps to {fieldKey, label, kind} entries used to
 *     build the bulk-edit modal. Modal shows the intersection of
 *     applicable fields across all selected records' buckets, with
 *     a per-field "Apply" checkbox so untouched fields aren't written.
 *   - Connection fields reuse ns.picker in pickOnly mode — captures
 *     the chosen ids once, then the queue writes them to every
 *     selected record.
 *   - Writes run through a concurrency-capped queue (max 4) with
 *     retry-and-backoff for 429/5xx, mirroring the canonical pattern
 *     from mirror-connection-sync.js + bid-review/init.js so a 30-
 *     row bulk write doesn't lose records to Knack's rate limit.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  // ── Module-level view key (set in mount()) ────────────────────
  var _sourceViewKey = '';

  // ── Selection state ───────────────────────────────────────────
  var selectedIds = Object.create(null); // { recordId: true }
  function selSize() { var n = 0; for (var k in selectedIds) n++; return n; }
  function selList() { var a = []; for (var k in selectedIds) a.push(k); return a; }
  function isSelected(id) { return !!selectedIds[id]; }
  function setSelected(id, on) {
    if (on) selectedIds[id] = true;
    else delete selectedIds[id];
  }
  function clearAll() { selectedIds = Object.create(null); }
  // Drop specific ids from the selection. Used after a delete so ONLY the
  // deleted rows leave the selection — bulk "remove accessories" deletes child
  // accessory records that were never selected, so the selected PARENTS must
  // stay checked (the user can chain another action on the same rows).
  function deselect(ids) {
    if (!ids) return;
    for (var i = 0; i < ids.length; i++) delete selectedIds[ids[i]];
  }

  // ── Field registry by bucket category ────────────────────────
  // kind: 'text' | 'number' | 'bool' | 'conn-single' | 'conn-multi'
  // For conn fields, candSource describes where to source candidates:
  //   - 'mdf' uses CONFIG.mdfSourceViewKey + mdfLabelField
  //   - 'devices' uses Knack.views[sourceViewKey] records (NVRs etc.)
  //   - 'sows'    uses Knack.views.view_3325 records
  //   - 'mh'      uses SCW.productMap (mounting hardware bucket)
  var FIELDS = {
    cam: [
      { key: 'field_1949', label: 'Product',           kind: 'conn-single', candSource: 'products' },
      { key: 'field_2020', label: 'Labor description', kind: 'text' },
      { key: 'field_2240', label: 'Drop prefix',       kind: 'conn-single', candSource: 'dropPrefix' },
      { key: 'field_2150', label: 'Sub Bid',           kind: 'number' },
      { key: 'field_1973', label: '+Hrs',              kind: 'number' },
      { key: 'field_1974', label: '+Mat',              kind: 'number' },
      { key: 'field_2461', label: 'Existing cabling',  kind: 'bool' },
      { key: 'field_1984', label: 'Exterior',          kind: 'bool' },
      { key: 'field_1983', label: 'Plenum',            kind: 'bool' },
      { key: 'field_1951', label: 'Drop number',       kind: 'number' },
      { key: 'field_1965', label: 'Drop length',       kind: 'number' },
      { key: 'field_2035', label: 'Conduit',           kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',               kind: 'conn-multi',  candSource: 'sows' },
      { key: 'field_2197', label: 'Connected Device',  kind: 'conn-single', candSource: 'devices' }
    ],
    'default': [
      { key: 'field_1949', label: 'Product',           kind: 'conn-single', candSource: 'products' },
      { key: 'field_2020', label: 'Labor description', kind: 'text' },
      { key: 'field_1964', label: 'Qty',               kind: 'number' },
      { key: 'field_2150', label: 'Sub Bid',           kind: 'number' },
      { key: 'field_1973', label: '+Hrs',              kind: 'number' },
      { key: 'field_1974', label: '+Mat',              kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',               kind: 'conn-multi',  candSource: 'sows' },
      { key: 'field_1957', label: 'Connected Devices', kind: 'conn-multi',  candSource: 'devices' }
    ],
    services: [
      { key: 'field_2020', label: 'Service description', kind: 'text' },
      { key: 'field_1964', label: 'Qty',                 kind: 'number' },
      { key: 'field_2150', label: 'Sub Bid',             kind: 'number' },
      { key: 'field_1973', label: '+Hrs',                kind: 'number' },
      { key: 'field_1974', label: '+Mat',                kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',           kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',           kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',                 kind: 'conn-multi',  candSource: 'sows' }
    ],
    assumptions: [
      { key: 'field_2020', label: 'Assumption text', kind: 'text' },
      { key: 'field_1953', label: 'SCW Notes',       kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',       kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2154', label: 'SOW',             kind: 'conn-multi',  candSource: 'sows' }
    ]
  };

  // ── Sales-deployment field registry ─────────────────────────
  // Sales views (moneyMode:'sales') swap out the build-SOW money
  // columns (Sub Bid / +Hrs / +Mat) for a read-only Total; hide SOW
  // and Plenum; and add Custom Disc % (field_2261). This parallel
  // registry is used instead of FIELDS when the source view is sales.
  var SALES_FIELDS = {
    cam: [
      { key: 'field_1949', label: 'Product',           kind: 'conn-single', candSource: 'products' },
      { key: 'field_2240', label: 'Drop prefix',       kind: 'conn-single', candSource: 'dropPrefix' },
      { key: 'field_1951', label: 'Label #',           kind: 'number' },
      { key: 'field_2261', label: 'Custom Disc %',     kind: 'number' },
      { key: 'field_2461', label: 'Existing cabling',  kind: 'bool' },
      { key: 'field_1984', label: 'Exterior',          kind: 'bool' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_2197', label: 'Connected Device',  kind: 'conn-single', candSource: 'devices' }
    ],
    'default': [
      { key: 'field_1949', label: 'Product',           kind: 'conn-single', candSource: 'products' },
      { key: 'field_1964', label: 'Qty',               kind: 'number' },
      { key: 'field_2261', label: 'Custom Disc %',     kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',         kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',         kind: 'conn-single', candSource: 'mdf' },
      { key: 'field_1957', label: 'Connected Devices', kind: 'conn-multi',  candSource: 'devices' }
    ],
    services: [
      { key: 'field_1964', label: 'Qty',                 kind: 'number' },
      { key: 'field_2261', label: 'Custom Disc %',       kind: 'number' },
      { key: 'field_1953', label: 'SCW Notes',           kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',           kind: 'conn-single', candSource: 'mdf' }
    ],
    assumptions: [
      { key: 'field_2020', label: 'Assumption text', kind: 'text' },
      { key: 'field_1953', label: 'SCW Notes',       kind: 'text' },
      { key: 'field_1946', label: 'MDF / IDF',       kind: 'conn-single', candSource: 'mdf' }
    ]
  };

  // ── Config-driven field registry ─────────────────────────────
  // A deployment can declare its bulk-editable fields in config via a
  // per-bucket `bulkFields` block of LOGICAL-name specs, e.g.
  //   bulkFields: { cam: [{ f:'laborDesc', kind:'text', label:'Labor desc' },
  //                       { f:'qty', kind:'number', gateNo:'qtyOne' }, … ] }
  // configRegistry resolves each logical name → field key via cfg.fields(),
  // so the editable-field list lives in ONE place (config) instead of a
  // hardcoded registry per object. The result is then intersected with what's
  // actually on the selected rows (intersectVisibleFields) so a field only
  // appears when EVERY selected row's bucket exposes it. The survey view
  // (view_3505) uses this; SOW/sales still use the legacy FIELDS/SALES_FIELDS
  // registries below until they're migrated (CLAUDE.md #15).
  var _regCache = Object.create(null);
  function configRegistry(sourceViewKey) {
    if (sourceViewKey in _regCache) return _regCache[sourceViewKey];
    var vc  = (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(sourceViewKey) : null;
    var reg = null;
    if (vc && vc.bulkFields) {
      var F = (ns.cfg && ns.cfg.fields(sourceViewKey)) || {};
      reg = {};
      Object.keys(vc.bulkFields).forEach(function (cat) {
        reg[cat] = (vc.bulkFields[cat] || []).map(function (spec) {
          return {
            key:        F[spec.f] || spec.f,         // logical → field key
            label:      spec.label || spec.f,
            kind:       spec.kind || 'text',
            candSource: spec.candSource,
            options:    spec.options,                // for kind:'select'
            // Hide on a row when this (resolved) gate field is Yes — e.g. Qty
            // hidden when "limit to quantity one" (qtyOne) is Yes.
            gateNoKey:  spec.gateNo ? (F[spec.gateNo] || spec.gateNo) : null
          };
        });
      });
    }
    _regCache[sourceViewKey] = reg;
    return reg;
  }

  /** Active field registry for a view: config `bulkFields` if present, else
   *  the legacy sales / SOW registries. */
  function fieldSetFor(sourceViewKey) {
    var cfgReg = configRegistry(sourceViewKey);
    if (cfgReg) return cfgReg;
    if (isSalesView(sourceViewKey)) return SALES_FIELDS;
    return FIELDS;
  }

  /** True when every selected record shares the same proposal bucket. */
  function allSameBucket(ids, sourceViewKey) {
    if (!ns.card || typeof ns.card.bucketIdOf !== 'function') return true;
    var idx = attrsIndex(sourceViewKey);
    var first = null;
    for (var i = 0; i < ids.length; i++) {
      var a = idx[ids[i]];
      if (!a) continue;
      var b = ns.card.bucketIdOf(a, sourceViewKey);
      if (first === null) { first = b; continue; }
      if (b !== first) return false;
    }
    return true;
  }

  function isSalesView(sourceViewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey);
      return !!(vc && vc.moneyMode === 'sales');
    } catch (e) { return false; }
  }

  function intersectFields(categories, fieldSet) {
    fieldSet = fieldSet || FIELDS;
    if (!categories.length) return [];
    var seed = fieldSet[categories[0]] || [];
    var result = [];
    for (var i = 0; i < seed.length; i++) {
      var f = seed[i];
      var keepAll = true;
      for (var c = 1; c < categories.length; c++) {
        var list = fieldSet[categories[c]] || [];
        var found = false;
        for (var j = 0; j < list.length; j++) {
          if (list[j].key === f.key) { found = true; break; }
        }
        if (!found) { keepAll = false; break; }
      }
      if (keepAll) result.push(f);
    }
    return result;
  }

  function recordCategories(ids, sourceViewKey) {
    var idx = attrsIndex(sourceViewKey);
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var attrs = idx[ids[i]];
      if (!attrs) continue;
      var cat = ns.card && ns.card.bucketCategoryOf
        ? ns.card.bucketCategoryOf(attrs, sourceViewKey)
        : 'default';
      seen[cat] = true;
    }
    var out = [];
    for (var k in seen) out.push(k);
    return out;
  }

  // Qty is editable only when the line item allows MORE than quantity 1 —
  // i.e. field_2230 ("single qty") is NOT yes. Mirrors card.js isQtyLocked /
  // qtyCell so the bulk panel matches what the worksheet card shows per row.
  function qtyAllowsMulti(attrs) {
    var raw = attrs && attrs['field_2230_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    var s = (attrs && attrs['field_2230'] || '').toString().trim().toLowerCase();
    return !(s === 'yes' || s === 'true' || s === '1');
  }

  // Per-row bulk-editable fields: the row's bucket field list, filtered by the
  // SAME conditional visibility rules the worksheet card applies, so the bulk
  // panel only offers a field where that row actually exposes it:
  //   • Qty (field_1964)        — only when the row allows qty > 1.
  //   • Connected Devices (1957) — only when the row maps connections (NVR/switch).
  // Cabling (existing/exterior/plenum/drop/conduit) + Connected Device (2197)
  // live in the cam set, so they naturally appear for cam/reader rows only.
  function visibleBulkFieldsFor(attrs, fieldSet, sourceViewKey) {
    var cat = (ns.card && ns.card.bucketCategoryOf)
      ? ns.card.bucketCategoryOf(attrs, sourceViewKey) : 'default';
    // Fall back to the base FIELDS set (then 'default') if this fieldSet has no
    // entry for the category — e.g. SALES_FIELDS has no 'assumptions', which
    // would otherwise leave the row with ZERO editable fields ("no options").
    var base = fieldSet[cat] || fieldSet['default'] || FIELDS[cat] || FIELDS['default'] || [];
    var out = [];
    for (var i = 0; i < base.length; i++) {
      var f = base[i];
      // Legacy SOW conditional gates (hardcoded keys).
      if (f.key === 'field_1964' && !qtyAllowsMulti(attrs)) continue;
      if (f.key === 'field_1957' && !isMapConnectionsRow(attrs)) continue;
      // Config-declared gate: hide when the gate field is Yes (e.g. Qty hidden
      // when "limit to quantity one" is Yes on a survey row).
      if (f.gateNoKey && isYes(attrs, f.gateNoKey)) continue;
      out.push(f);
    }
    return out;
  }

  /** True when a record's field reads Yes/true (for config gates). */
  function isYes(attrs, fieldKey) {
    var raw = attrs && attrs[fieldKey + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (attrs && attrs[fieldKey] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  // INTERSECTION of every selected row's visible bulk fields — only offer a
  // field that EVERY selected line item actually exposes (so a mixed selection
  // narrows to the common editable set). Unlike the old intersectFields (which
  // intersected static bucket lists), this intersects each row's per-row
  // VISIBLE set, so the conditional rules (qty only when >1 allowed, Connected
  // Devices only when the row maps connections) are honored: a field that's
  // conditionally hidden on one selected row drops from the bulk list too.
  // Order seeds from the first resolved row.
  function intersectVisibleFields(ids, sourceViewKey, fieldSet) {
    var idx = attrsIndex(sourceViewKey);
    var rowSets = [];
    for (var i = 0; i < ids.length; i++) {
      var attrs = idx[ids[i]];
      if (!attrs) continue;
      var vis = visibleBulkFieldsFor(attrs, fieldSet, sourceViewKey);
      var keys = Object.create(null);
      for (var j = 0; j < vis.length; j++) keys[vis[j].key] = true;
      rowSets.push({ fields: vis, keys: keys });
    }
    if (!rowSets.length) return [];
    var seed = rowSets[0].fields, out = [];
    for (var s = 0; s < seed.length; s++) {
      var f = seed[s], inAll = true;
      for (var r = 1; r < rowSets.length; r++) {
        if (!rowSets[r].keys[f.key]) { inAll = false; break; }
      }
      if (inAll) out.push(f);
    }
    return out;
  }

  // recordId → { fieldKey: true } of its visible bulk fields. Save uses this to
  // only write a field to the rows that expose it (a cabling value isn't pushed
  // to a non-cam row that happened to be in the same selection).
  function rowVisibleMap(ids, sourceViewKey, fieldSet) {
    var idx = attrsIndex(sourceViewKey);
    var map = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      var attrs = idx[ids[i]];
      if (!attrs) continue;
      var set = Object.create(null);
      var vis = visibleBulkFieldsFor(attrs, fieldSet, sourceViewKey);
      for (var j = 0; j < vis.length; j++) set[vis[j].key] = true;
      map[ids[i]] = set;
    }
    return map;
  }

  // ── Lock + delete-block helpers (shared with the per-card rules) ──
  // When ANY selected row is a LOCKED sales row (card.js isCrLocked: sales
  // deployment + survey-associated), the bulk-edit modal is restricted to the
  // same whitelist the per-card lock keeps editable — Product, SCW Notes,
  // Custom Disc %. field_2261 isn't in the per-bucket FIELDS registry (it's a
  // sales-only field), so the locked set is defined explicitly here.
  var LOCKED_BULK_FIELDS = [
    { key: 'field_1949', label: 'Product',       kind: 'conn-single', candSource: 'products' },
    { key: 'field_1953', label: 'SCW Notes',     kind: 'text' },
    { key: 'field_2261', label: 'Custom Disc %', kind: 'number' }
  ];

  // Fields that are READ-ONLY in a given source-view context, so they must not
  // appear as bulk-edit options even though they live in the field registry.
  // (Empty since 2026-07: SCW Notes on view_3921 was unlocked — the bid-review
  // comparison grid is fully editable. Keep the map for future per-view locks.)
  var READONLY_FIELDS_BY_VIEW = {};

  /** Build an id→attributes index from the source view's loaded records.
   *  Uses ns.data.readRecords (the .models read path that render.js draws
   *  from) rather than Backbone Collection.get(), which on Knack's model
   *  can return nothing even when .models is fully populated — that was
   *  making the bulk-edit modal think a selected record had no bucket and
   *  therefore "no fields in common" even with a single row selected.
   *
   *  DOM FALLBACK: the model read ALSO comes back empty intermittently —
   *  mid-refetch, a failed/429 model.fetch, an over-filtered collection,
   *  or a stale source view key — which silently blanked the modal ("no
   *  shared fields") until a hard refresh. Every rendered v2 card carries
   *  its bucket id (data-scw-ws-v2-bucket) + lock state (--locked class),
   *  which is exactly what recordCategories / isCrLocked / isDeleteBlocked
   *  need. So synthesize attrs from the cards for any id the model didn't
   *  supply. Queried document-wide so a wrong _sourceViewKey can't defeat
   *  it. Full model attrs always win; DOM only fills gaps. */
  function attrsIndex(sourceViewKey) {
    var idx = Object.create(null);
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(sourceViewKey) : [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i] && recs[i].id) idx[recs[i].id] = recs[i];
    }
    try {
      // Store the synthesized bucket under THIS view's bucket field key so
      // ns.card.bucketIdOf(attrs, sourceViewKey) resolves it (survey =
      // field_2366, SOW = field_2219).
      var bucketKey = 'field_2219';
      try {
        var _f = ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(sourceViewKey);
        if (_f && _f.bucket) bucketKey = _f.bucket;
      } catch (eB) { /* default field_2219 */ }
      var cards = document.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
      for (var c = 0; c < cards.length; c++) {
        var card = cards[c];
        var rid  = card.getAttribute('data-scw-ws-v2-record');
        if (!rid || idx[rid]) continue;   // model attrs (richer) win
        var bucketId = card.getAttribute('data-scw-ws-v2-bucket') || '';
        var dom = {
          id:             rid,
          // --locked ⇔ survey-associated (field_2586 >= 1); enough for
          // isCrLocked / isDeleteBlocked which only test "> 0".
          field_2586:     card.classList.contains('scw-ws-v2-card--locked') ? 1 : 0,
          _scwDomFallback: true
        };
        dom[bucketKey + '_raw'] = bucketId ? [{ id: bucketId }] : [];
        idx[rid] = dom;
      }
    } catch (e) { /* best effort */ }

    // Bid-comparison grid fallback: that grid (bid-review-v2) renders its OWN
    // rows (.scw-bid-review-v2__row[data-sow-item-id]) and has NO worksheet
    // cards, so the card fallback above finds nothing — and view_3921's model
    // read often comes back empty on that scene, which left the modal with zero
    // resolved attrs ("no fields editable across all selected rows" no matter
    // what). Synthesize attrs from the bid rows, inferring the bucket from the
    // SOW cell (cam-only cabling chips → cam; assumption class → assumptions)
    // so cabling/qty/connection visibility still resolves correctly.
    try {
      var CAM = (ns.card && ns.card.CAM_READER_BUCKET) || '';
      var ASSUM = (ns.card && ns.card.ASSUMPTIONS_BUCKET) || '';
      var brRows = document.querySelectorAll('.scw-bid-review-v2__row[data-sow-item-id]');
      for (var b = 0; b < brRows.length; b++) {
        var rid2 = brRows[b].getAttribute('data-sow-item-id');
        if (!rid2 || idx[rid2]) continue;   // model attrs (richer) win
        var sowCell = brRows[b].querySelector('.scw-bid-review-v2__sow-cell');
        var bId = '';
        if (sowCell) {
          if (sowCell.classList.contains('scw-bid-review-v2__sow-cell--assumption')) {
            bId = ASSUM;
          } else {
            // Cam/reader = a CHILD device: it has a drop length and/or is
            // "Connected to" a single parent. NVRs/switches are PARENTS
            // ("Connected devices: …") and can also carry an Exterior/Existing
            // chip, so those chips are NOT reliable cam signals — only the
            // drop + child-connection are.
            var hasDrop = !!sowCell.querySelector('[data-scw-sow-field="dropLength"]');
            var connTo = false;
            var conns = sowCell.querySelectorAll('.scw-bid-review-v2__cell-conn[title]');
            for (var k = 0; k < conns.length; k++) {
              if (/^connected to:/i.test((conns[k].getAttribute('title') || '').trim())) {
                connTo = true; break;
              }
            }
            if (hasDrop || connTo) bId = CAM;
          }
        }
        idx[rid2] = {
          id:             rid2,
          field_2219_raw: bId ? [{ id: bId }] : [],
          field_2586:     0,
          _scwDomFallback: true
        };
      }
    } catch (e) { /* best effort */ }
    return idx;
  }

  /** Look up a selected record's attributes from the source view model. */
  function attrsOf(id, sourceViewKey) {
    return attrsIndex(sourceViewKey)[id] || null;
  }

  /** True if ANY selected id is a locked sales row. */
  function selectionHasLocked(ids, sourceViewKey) {
    if (!(ns.card && typeof ns.card.isCrLocked === 'function')) return false;
    for (var i = 0; i < ids.length; i++) {
      var a = attrsOf(ids[i], sourceViewKey);
      if (a && ns.card.isCrLocked(a, sourceViewKey)) return true;
    }
    return false;
  }

  /** Split ids into { deletable, blocked } using the same survey-link delete
   *  block the per-row trash uses (card.js isDeleteBlocked). */
  function partitionDeletable(ids, sourceViewKey) {
    var deletable = [], blocked = [];
    var canCheck = ns.card && typeof ns.card.isDeleteBlocked === 'function';
    for (var i = 0; i < ids.length; i++) {
      var a = canCheck ? attrsOf(ids[i], sourceViewKey) : null;
      if (a && ns.card.isDeleteBlocked(a, sourceViewKey)) blocked.push(ids[i]);
      else deletable.push(ids[i]);
    }
    return { deletable: deletable, blocked: blocked };
  }

  // ── Toolbar ──────────────────────────────────────────────────
  // ── Duplicate selected (bid/survey) — POST record ids to Make ──
  var DUPLICATE_WEBHOOK = 'https://hook.us1.make.com/sfdf6ruwhb6nrfsy0ynkqauyjsva62ce';
  function viewAllowsDuplicate(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.bulkDuplicate);
    } catch (e) { return false; }
  }
  function bulkTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }
  function handleDuplicate(ids, viewKey) {
    if (!ids || !ids.length) return;
    if (!window.confirm('Duplicate ' + ids.length + ' selected item' +
        (ids.length === 1 ? '' : 's') + '?')) return;
    var dup = toolbar && toolbar.querySelector('.scw-ws-v2-bulk-duplicate');
    if (toolbar) toolbar.classList.add('scw-ws-v2-bulk-toolbar--saving');
    if (dup) dup.disabled = true;
    function refetch() {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    }
    $.ajax({
      url: DUPLICATE_WEBHOOK, type: 'POST', contentType: 'application/json',
      data: JSON.stringify({ recordIds: ids, viewId: viewKey, triggeredBy: bulkTriggeredBy() }),
      crossDomain: true, timeout: 120000
    }).always(function () {
      if (toolbar) toolbar.classList.remove('scw-ws-v2-bulk-toolbar--saving');
      // Keep the selection after a bulk op so the user can chain actions on the
      // same rows — only the explicit Clear button (or a delete, whose rows are
      // gone) clears it. syncDomFromState re-checks the still-selected rows.
      syncDomFromState(); refreshToolbar();
      // Refetch so the new duplicates appear (staggered for Make-write lag).
      refetch();
      setTimeout(refetch, 3000);
      setTimeout(refetch, 8000);
    });
  }

  var toolbar; // DOM element, lazily created
  function ensureToolbar(sourceViewKey) {
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.className = 'scw-ws-v2-bulk-toolbar';
    // Order: Edit · Add accessories · Remove accessories · Delete · Clear.
    // Standardized sentence-case labels; all share the v2-preview purple
    // except Delete (pale red) and Clear (ghost purple).
    toolbar.innerHTML =
      '<span class="scw-ws-v2-bulk-count">0 selected</span>' +
      '<button type="button" class="scw-ws-v2-bulk-edit" disabled>Edit selected</button>' +
      '<button type="button" class="scw-ws-v2-bulk-duplicate" disabled>' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
        '</svg>' +
        '<span class="scw-ws-v2-bulk-duplicate-label">Duplicate</span>' +
      '</button>' +
      '<button type="button" class="scw-ws-v2-bulk-add-acc" disabled>Add accessories</button>' +
      '<button type="button" class="scw-ws-v2-bulk-remove-acc" disabled>' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"></polyline>' +
          '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
          '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>' +
        '</svg>' +
        '<span class="scw-ws-v2-bulk-remove-acc-label">Remove accessories</span>' +
      '</button>' +
      '<button type="button" class="scw-ws-v2-bulk-delete" disabled>' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
          'stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"></polyline>' +
          '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
          '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
          '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>' +
        '</svg>' +
        '<span class="scw-ws-v2-bulk-delete-label">Delete</span>' +
      '</button>' +
      '<button type="button" class="scw-ws-v2-bulk-clear">Clear</button>';
    document.body.appendChild(toolbar);

    // NOTE: handlers must read the LIVE _sourceViewKey (set on every
    // mount), not the closure param — the toolbar is a body-level
    // singleton that survives Knack's SPA scene swaps, so the key it
    // was created with goes stale the moment the user navigates to a
    // page whose v2 mount uses a different source view. A stale key
    // makes every record lookup miss (wrong view's model) — bulk edit
    // sees "no fields in common" and the accessory modal loses its
    // compatibility filter.
    toolbar.querySelector('.scw-ws-v2-bulk-add-acc').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      // Reuse the toolbar module's add-accessory modal (it reads the live
      // selection itself). Lives there so we don't duplicate the
      // compatibility-filter + webhook logic.
      if (ns.toolbar && typeof ns.toolbar.openAddAccessories === 'function') {
        ns.toolbar.openAddAccessories(_sourceViewKey || sourceViewKey);
      }
    });
    toolbar.querySelector('.scw-ws-v2-bulk-clear').addEventListener('click', function () {
      clearAll();
      syncDomFromState();
      refreshToolbar();
    });
    toolbar.querySelector('.scw-ws-v2-bulk-remove-acc').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      openRemoveAccessoriesConfirm(ids, _sourceViewKey || sourceViewKey);
    });
    toolbar.querySelector('.scw-ws-v2-bulk-edit').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      openBulkModal(ids, _sourceViewKey || sourceViewKey);
    });
    var dupBtn = toolbar.querySelector('.scw-ws-v2-bulk-duplicate');
    if (dupBtn) dupBtn.addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      handleDuplicate(ids, _sourceViewKey || sourceViewKey);
    });
    toolbar.querySelector('.scw-ws-v2-bulk-delete').addEventListener('click', function () {
      var ids = selList();
      if (!ids.length) return;
      openBulkDeleteConfirm(ids, _sourceViewKey || sourceViewKey);
    });
    return toolbar;
  }

  /** Does the active view's object lack an accessory relationship? (config
   *  noAccessories — survey). Hides the bulk Add/Remove accessories buttons. */
  function viewHasNoAccessories(sourceViewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey);
      return !!(vc && vc.noAccessories);
    } catch (e) { return false; }
  }

  function refreshToolbar() {
    if (!toolbar) return;
    var n = selSize();
    var noAcc = viewHasNoAccessories(_sourceViewKey);
    toolbar.classList.toggle('scw-ws-v2-bulk-toolbar--active', n > 0);
    toolbar.querySelector('.scw-ws-v2-bulk-count').textContent = n + ' selected';
    toolbar.querySelector('.scw-ws-v2-bulk-edit').disabled   = (n === 0);
    var dupBtn = toolbar.querySelector('.scw-ws-v2-bulk-duplicate');
    if (dupBtn) {
      // Shown only on views that opt in (config bulkDuplicate — bid/survey).
      if (viewAllowsDuplicate(_sourceViewKey)) dupBtn.style.removeProperty('display');
      else dupBtn.style.setProperty('display', 'none', 'important');
      dupBtn.disabled = (n === 0);
    }
    var addAccBtn = toolbar.querySelector('.scw-ws-v2-bulk-add-acc');
    if (addAccBtn) {
      // Use setProperty w/ !important — the toolbar's CSS sets the buttons'
      // display with !important, which would otherwise beat a plain inline
      // display:none and leave the button visible on noAccessories views.
      if (noAcc) addAccBtn.style.setProperty('display', 'none', 'important');
      else       addAccBtn.style.removeProperty('display');
      addAccBtn.disabled = (n === 0);
    }
    var delBtn = toolbar.querySelector('.scw-ws-v2-bulk-delete');
    var delLabel = delBtn.querySelector('.scw-ws-v2-bulk-delete-label');
    if (n === 0) {
      delBtn.disabled = true;
      delBtn.title = '';
      if (delLabel) delLabel.textContent = 'Delete';
    } else {
      var part = partitionDeletable(selList(), _sourceViewKey);
      var nDel = part.deletable.length;
      delBtn.disabled = (nDel === 0);
      delBtn.title = nDel === 0
        ? 'All selected items are linked to survey line items and cannot be deleted here'
        : '';
      if (delLabel) delLabel.textContent = nDel > 0 ? ('Delete (' + nDel + ')') : 'Delete';
    }
    var raBtn = toolbar.querySelector('.scw-ws-v2-bulk-remove-acc');
    if (raBtn) {
      if (noAcc) raBtn.style.setProperty('display', 'none', 'important');
      else       raBtn.style.removeProperty('display');
      raBtn.disabled = (n === 0);
    }
  }

  // ── DOM sync (when re-renders happen) ────────────────────────
  function syncDomFromState() {
    var boxes = document.querySelectorAll('[data-scw-ws-v2-select]');
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute('data-scw-ws-v2-select');
      boxes[i].checked = isSelected(id);
      // Checkboxes live inside a card on the worksheet page, but in a
      // plain grid cell on the bid-review comparison grid — guard the
      // card lookup so the latter doesn't throw.
      var selCard = boxes[i].closest('.scw-ws-v2-card');
      if (selCard) selCard.classList.toggle('scw-ws-v2-card--selected', isSelected(id));
    }
    // L1 select-all reflects child state.
    var heads = document.querySelectorAll('[data-scw-ws-v2-l1-select]');
    for (var h = 0; h < heads.length; h++) {
      var l1 = heads[h].closest('.scw-ws-v2-l1');
      if (!l1) continue;
      var childBoxes = l1.querySelectorAll('[data-scw-ws-v2-select]');
      var all = childBoxes.length > 0;
      var any = false;
      for (var c = 0; c < childBoxes.length; c++) {
        if (childBoxes[c].checked) any = true;
        else all = false;
      }
      heads[h].checked = all;
      heads[h].indeterminate = any && !all;
    }
  }

  // ── Delegated handlers ───────────────────────────────────────
  // Last clicked row checkbox id — anchor for shift-click range select.
  var lastAnchorId = null;

  function rowCheckboxesInDocOrder() {
    return document.querySelectorAll('[data-scw-ws-v2-select]');
  }

  function applyRange(anchorId, targetId, on) {
    var boxes = rowCheckboxesInDocOrder();
    var ai = -1, ti = -1;
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute('data-scw-ws-v2-select');
      if (id === anchorId) ai = i;
      if (id === targetId) ti = i;
    }
    if (ai === -1 || ti === -1) return;
    var lo = Math.min(ai, ti), hi = Math.max(ai, ti);
    for (var j = lo; j <= hi; j++) {
      var rid = boxes[j].getAttribute('data-scw-ws-v2-select');
      setSelected(rid, on);
    }
  }

  function wireGlobalDelegates(sourceViewKey) {
    if (document.documentElement.hasAttribute('data-scw-ws-v2-bulk-bound')) return;
    document.documentElement.setAttribute('data-scw-ws-v2-bulk-bound', '1');

    // Capture shift-state at mousedown — by the time `change` fires the
    // modifier keys aren\'t on the event. We hijack the click on the row
    // checkbox if shift is held, run a range-select, and prevent the
    // default toggle (which would only flip the clicked box).
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute) return;
      if (!t.hasAttribute('data-scw-ws-v2-select')) return;

      // Stop the click bubbling to the card\'s expand handler.
      e.stopPropagation();

      if (e.shiftKey && lastAnchorId) {
        // Range mode: the box\'s checked state already flipped via the
        // browser default; use the new state as the "on/off" for the
        // whole range. Then refresh DOM.
        var targetId = t.getAttribute('data-scw-ws-v2-select');
        applyRange(lastAnchorId, targetId, !!t.checked);
        syncDomFromState();
        refreshToolbar();
        // Anchor stays put so consecutive shift-clicks extend from the
        // original origin — matches Gmail / Finder behavior.
        return;
      }

      // Plain click — let the change handler do the state update; just
      // remember this id as the new anchor.
      lastAnchorId = t.getAttribute('data-scw-ws-v2-select');
    }, true);

    // Row checkbox toggles individual selection (non-shift path).
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.hasAttribute && t.hasAttribute('data-scw-ws-v2-select')) {
        // Shift-click was handled in the click listener above; here we
        // only catch the plain toggle. If shift was held, the click
        // handler already updated state.
        var id = t.getAttribute('data-scw-ws-v2-select');
        setSelected(id, !!t.checked);
        syncDomFromState();
        refreshToolbar();
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-scw-ws-v2-l1-select')) {
        var l1id   = t.getAttribute('data-scw-ws-v2-l1-select');
        var l1     = document.querySelector('[data-scw-ws-v2-l1="' + l1id + '"]');
        var boxes  = l1 ? l1.querySelectorAll('[data-scw-ws-v2-select]') : [];
        for (var i = 0; i < boxes.length; i++) {
          var rid = boxes[i].getAttribute('data-scw-ws-v2-select');
          setSelected(rid, !!t.checked);
        }
        syncDomFromState();
        refreshToolbar();
      }
    });
  }

  // ── Save queue: concurrency-capped + retry + backoff ─────────
  var MAX_CONCURRENT = 4;
  var BASE_BACKOFF   = 500; // ms
  var MAX_ATTEMPTS   = 4;

  function isRetryable(xhr) {
    if (!xhr) return true;
    var s = xhr.status;
    return s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599);
  }
  function doPutWithRetry(viewKey, recordId, body, attempt) {
    attempt = attempt || 1;
    var d = $.Deferred();
    try {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recordId),
        type: 'PUT',
        data: JSON.stringify(body),
        success: function (resp) {
          d.resolve({ ok: true, recordId: recordId, status: 200, resp: resp });
        },
        error: function (xhr) {
          if (attempt < MAX_ATTEMPTS && isRetryable(xhr)) {
            var wait = BASE_BACKOFF * Math.pow(2, attempt - 1) + Math.random() * 250;
            setTimeout(function () {
              doPutWithRetry(viewKey, recordId, body, attempt + 1)
                .then(function (r) { d.resolve(r); });
            }, wait);
          } else {
            d.resolve({ ok: false, recordId: recordId, status: xhr && xhr.status });
          }
        }
      });
    } catch (e) {
      d.resolve({ ok: false, recordId: recordId, status: -1 });
    }
    return d.promise();
  }

  /** CANONICAL front-end record delete (NO Make webhook). View-scoped REST
   *  DELETE via SCW.knackAjax + SCW.knackRecordUrl — the user's session token
   *  authorizes it and it's CORS-safe, so it works for any record on a view
   *  with Delete enabled (the same proven path the per-row line-item delete +
   *  v1 bid-review use). Retried on transient errors (429 / 5xx / 408 /
   *  network-0); settle-shaped so a partial failure never rejects the batch.
   *  This is THE deletion primitive — replaces doDeleteWithRetry (Make). */
  function deleteRecordFE(viewKey, recordId, attempt) {
    attempt = attempt || 1;
    var d = $.Deferred();
    if (!viewKey || !(window.SCW && typeof SCW.knackAjax === 'function' &&
        typeof SCW.knackRecordUrl === 'function')) {
      d.resolve({ ok: false, recordId: recordId, status: -1 });
      return d.promise();
    }
    try {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recordId),
        type: 'DELETE',
        success: function () { d.resolve({ ok: true, recordId: recordId, status: 200 }); },
        error: function (xhr) {
          if (attempt < MAX_ATTEMPTS && isRetryable(xhr)) {
            var wait = BASE_BACKOFF * Math.pow(2, attempt - 1) + Math.random() * 250;
            setTimeout(function () {
              deleteRecordFE(viewKey, recordId, attempt + 1).then(function (r) { d.resolve(r); });
            }, wait);
          } else {
            d.resolve({ ok: false, recordId: recordId, status: xhr && xhr.status });
          }
        }
      });
    } catch (e) {
      d.resolve({ ok: false, recordId: recordId, status: -1 });
    }
    return d.promise();
  }

  /** Generic concurrency-capped job runner — takes a list of work
   *  items and an async fn(item) → promise<result>. Same in-flight
   *  cap as runQueue. */
  function runJobQueue(items, fn, onProgress) {
    var results = [];
    var i = 0, inflight = 0, total = items.length;
    var d = $.Deferred();
    function pump() {
      while (inflight < MAX_CONCURRENT && i < total) {
        var item = items[i++];
        inflight++;
        fn(item).then(function (r) {
          inflight--;
          results.push(r);
          if (typeof onProgress === 'function') onProgress(results.length, total);
          if (results.length === total) d.resolve(results);
          else pump();
        });
      }
    }
    if (!total) d.resolve(results);
    else pump();
    return d.promise();
  }

  /** Collect the accessory line-item ids attached (via field_2464
   *  back-mirror) to any of the given parent ids. Walks the source
   *  view\'s model — accessories are hidden from the v2 tree but
   *  still present in Knack\'s records. */
  function collectAccessoryIds(parentIds, sourceViewKey) {
    var parentSet = Object.create(null);
    for (var p = 0; p < parentIds.length; p++) parentSet[parentIds[p]] = true;

    var v = window.Knack && Knack.views && Knack.views[sourceViewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var accIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < models.length; i++) {
      var r = models[i] && models[i].attributes;
      if (!r || !r.id) continue;
      // Skip parents themselves — we delete them separately.
      if (parentSet[r.id]) continue;
      var raw = r.field_2464_raw;
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && parentSet[raw[j].id]) {
          if (!seen[r.id]) { seen[r.id] = true; accIds.push(r.id); }
          break;
        }
      }
    }
    return accIds;
  }

  /** Map each given parent id → its accessory line-item ids (field_2464
   *  back-mirror), read from the source view\'s model. Like collectAccessoryIds
   *  but keyed per-parent, so each accessory can be matched to ITS parent\'s
   *  resulting value (needed for "accessory SOW must equal parent SOW" when
   *  parents end up with different values, e.g. add-mode unions). */
  function accessoriesByParent(parentIds, sourceViewKey) {
    var parentSet = Object.create(null);
    for (var p = 0; p < parentIds.length; p++) parentSet[parentIds[p]] = true;
    var map = Object.create(null);
    var v = window.Knack && Knack.views && Knack.views[sourceViewKey];
    var models = (v && v.model && v.model.data && v.model.data.models) || [];
    for (var i = 0; i < models.length; i++) {
      var r = models[i] && models[i].attributes;
      if (!r || !r.id || parentSet[r.id]) continue;
      var raw = r.field_2464_raw;
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        var pid = raw[j] && raw[j].id;
        if (pid && parentSet[pid]) { (map[pid] = map[pid] || []).push(r.id); break; }
      }
    }
    return map;
  }

  /** Fire the Connected Devices (field_1957) → Connected To (field_2197)
   *  reciprocal cascade for every bulk job that wrote field_1957. The bulk
   *  save PUTs directly (SCW.knackAjax), which — unlike Knack\'s inline edit —
   *  does NOT fire knack-cell-update, so mirror-connection-sync never runs.
   *  We replicate the v2 picker\'s contract (worksheet-v2/picker.js): patch
   *  the local model, then dispatch knack-cell-update.<view> with the
   *  AUTHORITATIVE chosen ids as the 5th arg so the cascade can\'t mis-read a
   *  racing refetch. Skipped for records whose PUT failed (the field_1957
   *  write didn\'t land — cascading it would write reciprocals for a value
   *  that isn\'t there). */
  function fireConnectedDevicesCascades(jobList, failedRecSet) {
    var TRIGGER = 'field_1957';
    for (var i = 0; i < jobList.length; i++) {
      var job = jobList[i];
      if (!job || !job.body || !(TRIGGER in job.body)) continue;
      if (failedRecSet && failedRecSet[job.recordId]) continue;
      try {
        var idsVal = job.body[TRIGGER];
        var arr = Array.isArray(idsVal) ? idsVal : (idsVal ? [idsVal] : []);
        var rawObjs = arr.map(function (v) {
          return (v && typeof v === 'object') ? v : { id: v };
        });
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(job.viewKey, job.recordId, {}, TRIGGER, rawObjs);
        }
        var view = window.Knack && Knack.views && Knack.views[job.viewKey];
        if (view && view.model && view.model.data) {
          var rec = (typeof view.model.data.get === 'function')
            ? view.model.data.get(job.recordId) : null;
          if (rec) {
            $(document).trigger('knack-cell-update.' + job.viewKey,
              [view, rec.attributes || rec, TRIGGER, arr]);
          }
        }
      } catch (e) {
        console.warn('[scw-ws-v2-bulk] connected-devices cascade trigger failed', e);
      }
    }
  }

  /** Standalone "are you sure" modal for the toolbar Delete button.
   *  Surfaces the parent + accessory counts so users see the
   *  cascade scope before confirming. */
  /** Small informational modal (title + message + Close), no destructive
   *  CTA. Used when a bulk action has nothing valid to act on. */
  function openBulkInfoModal(title, msg) {
    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">' + escapeHtml(title) + '</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' + escapeHtml(msg) + '</div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var close = function () { overlay.parentNode && overlay.parentNode.removeChild(overlay); };
    overlay.querySelector('.scw-ws-v2-bulk-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function openBulkDeleteConfirm(parentIds, sourceViewKey) {
    // Never delete a record whose delete is blocked (survey-linked, on the
    // surfaces where the block applies). Drop those from the batch up front.
    var part = partitionDeletable(parentIds, sourceViewKey);
    var blockedCount = part.blocked.length;
    parentIds = part.deletable;

    // Everything selected is non-deletable → informational modal, no CTA.
    if (!parentIds.length) {
      openBulkInfoModal('Can’t delete these line items',
        (blockedCount === 1 ? 'This line item is' : 'These ' + blockedCount + ' line items are') +
        ' linked to survey line items, so they can only be removed from the survey — not here.');
      return;
    }

    var accIds = collectAccessoryIds(parentIds, sourceViewKey);
    var subline = accIds.length
      ? 'Also deletes ' + accIds.length + ' attached accessor' +
        (accIds.length === 1 ? 'y' : 'ies') + ' (mounting hardware, etc.).'
      : 'These line items have no attached accessories.';
    if (blockedCount) {
      subline += ' ' + blockedCount + ' survey-linked item' +
        (blockedCount === 1 ? '' : 's') + ' will be skipped.';
    }

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Delete ' + parentIds.length +
            ' line item' + (parentIds.length === 1 ? '' : 's') + '?</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' + escapeHtml(subline) +
            ' This cannot be undone.</div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-status"></div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete">' +
            'Delete ' + (parentIds.length + accIds.length) + ' record' +
            ((parentIds.length + accIds.length) === 1 ? '' : 's') +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var status    = overlay.querySelector('.scw-ws-v2-bulk-modal-status');
    var cancelBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-cancel');
    var confirmBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-confirm-delete');

    function close() { overlay.parentNode && overlay.parentNode.removeChild(overlay); }
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    confirmBtn.addEventListener('click', function () {
      runBulkDelete(parentIds, accIds, sourceViewKey, overlay, status,
        confirmBtn, cancelBtn, close);
    });
  }

  /** Display label for an accessory record — prefer the product
   *  connection (field_1949) identifier, then the drop label, then a
   *  generic fallback. */
  function accessoryName(rec) {
    var raw = rec && rec.field_1949_raw;
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].identifier) {
      return String(raw[0].identifier).replace(/<[^>]*>/g, '').trim() || 'Accessory';
    }
    var v = rec && rec.field_1949;
    if (v != null && String(v).replace(/<[^>]*>/g, '').trim() !== '') {
      return String(v).replace(/<[^>]*>/g, '').trim();
    }
    var drop = rec && rec.field_1950;
    if (drop != null && String(drop).replace(/<[^>]*>/g, '').trim() !== '') {
      return String(drop).replace(/<[^>]*>/g, '').trim();
    }
    return 'Accessory';
  }

  /** Like collectAccessoryIds, but grouped by accessory product name →
   *  [{ name, ids: [...] }, ...] sorted by name. Lets the remove modal
   *  offer "delete THIS type across all selected parents". */
  function collectAccessoriesGrouped(parentIds, sourceViewKey) {
    var parentSet = Object.create(null);
    for (var p = 0; p < parentIds.length; p++) parentSet[parentIds[p]] = true;

    var v = window.Knack && Knack.views && Knack.views[sourceViewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var groups = Object.create(null);
    var order  = [];
    var seen   = Object.create(null);
    for (var i = 0; i < models.length; i++) {
      var r = models[i] && models[i].attributes;
      if (!r || !r.id || parentSet[r.id]) continue;
      var raw = r.field_2464_raw;
      if (!Array.isArray(raw)) continue;
      var isChild = false;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && parentSet[raw[j].id]) { isChild = true; break; }
      }
      if (!isChild || seen[r.id]) continue;
      seen[r.id] = true;
      var name = accessoryName(r);
      var key  = name.toLowerCase();
      if (!groups[key]) { groups[key] = { name: name, ids: [] }; order.push(key); }
      groups[key].ids.push(r.id);
    }
    var out = order.map(function (k) { return groups[k]; });
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  /** Bulk REMOVE accessories — lets the user pick WHICH accessory types to
   *  delete across the selected parent rows (grouped by product name, one
   *  checkbox per type), leaving the parents intact. Symmetric with the
   *  bulk "+ Add accessories" action. Reuses the capped/retry delete queue. */
  function openRemoveAccessoriesConfirm(parentIds, sourceViewKey) {
    var groups = collectAccessoriesGrouped(parentIds, sourceViewKey);
    var accIds = [];
    for (var gi = 0; gi < groups.length; gi++) accIds = accIds.concat(groups[gi].ids);

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';

    if (!accIds.length) {
      // Nothing to remove — short informational modal, no destructive CTA.
      overlay.innerHTML =
        '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
          '<div class="scw-ws-v2-bulk-modal-head">' +
            '<div class="scw-ws-v2-bulk-modal-title">No accessories to remove</div>' +
            '<div class="scw-ws-v2-bulk-modal-sub">The ' + parentIds.length +
              ' selected line item' + (parentIds.length === 1 ? '' : 's') +
              ' have no attached accessories (mounting hardware, etc.).</div>' +
          '</div>' +
          '<div class="scw-ws-v2-bulk-modal-actions">' +
            '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Close</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      var closeInfo = function () { overlay.parentNode && overlay.parentNode.removeChild(overlay); };
      overlay.querySelector('.scw-ws-v2-bulk-modal-cancel').addEventListener('click', closeInfo);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeInfo(); });
      return;
    }

    var rowsHtml = groups.map(function (g, idx) {
      return '<label class="scw-ws-v2-bulk-acc-row">' +
        '<input type="checkbox" class="scw-ws-v2-bulk-acc-cb" data-acc-idx="' + idx + '">' +
        '<span class="scw-ws-v2-bulk-acc-name">' + escapeHtml(g.name) + '</span>' +
        '<span class="scw-ws-v2-bulk-acc-count">× ' + g.ids.length + '</span>' +
      '</label>';
    }).join('');

    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Remove accessories</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">Select the accessory types to delete from the ' +
            parentIds.length + ' selected line item' + (parentIds.length === 1 ? '' : 's') +
            '. The line item' + (parentIds.length === 1 ? '' : 's') +
            ' themselves are kept. This cannot be undone.</div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-acc-list">' + rowsHtml + '</div>' +
        '<div class="scw-ws-v2-bulk-modal-status"></div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete" disabled>' +
            'Remove 0 accessories</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var status    = overlay.querySelector('.scw-ws-v2-bulk-modal-status');
    var cancelBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-cancel');
    var confirmBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-confirm-delete');
    var cbs = overlay.querySelectorAll('.scw-ws-v2-bulk-acc-cb');

    function close() { overlay.parentNode && overlay.parentNode.removeChild(overlay); }
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    // Recompute the chosen accessory ids + button label as types toggle.
    function chosenIds() {
      var ids = [];
      for (var i = 0; i < cbs.length; i++) {
        if (cbs[i].checked) {
          var g = groups[parseInt(cbs[i].getAttribute('data-acc-idx'), 10)];
          if (g) ids = ids.concat(g.ids);
        }
      }
      return ids;
    }
    function refresh() {
      var n = chosenIds().length;
      confirmBtn.disabled = (n === 0);
      confirmBtn.textContent = 'Remove ' + n + ' accessor' + (n === 1 ? 'y' : 'ies');
    }
    for (var ci = 0; ci < cbs.length; ci++) {
      cbs[ci].addEventListener('change', refresh);
    }

    confirmBtn.addEventListener('click', function () {
      var ids = chosenIds();
      if (!ids.length) return;
      // Reuse runBulkDelete with NO parents — accessories only.
      runBulkDelete([], ids, sourceViewKey, overlay, status,
        confirmBtn, cancelBtn, close);
    });
  }

  /** Bulk delete — accessories first, then parents. Front-end only: each
   *  record is removed with the view-scoped REST DELETE (deleteRecordFE),
   *  capped at MAX_CONCURRENT in flight with retry-on-transient-error. No
   *  Make webhook. */
  function runBulkDelete(parentIds, accIds, sourceViewKey, overlay, status, confirmBtn, cancelBtn, close) {
    var totalN  = parentIds.length + accIds.length;

    confirmBtn.disabled = true;
    cancelBtn.disabled  = true;
    overlay.classList.add('scw-ws-v2-bulk-overlay--saving');
    status.innerHTML =
      '<div class="scw-ws-v2-bulk-progress">' +
        '<div class="scw-ws-v2-bulk-progress-bar" style="width:0%"></div>' +
      '</div>' +
      '<div class="scw-ws-v2-bulk-progress-text">' +
        '<span class="scw-ws-v2-bulk-spinner"></span>' +
        '<span class="scw-ws-v2-bulk-progress-label">Deleting 0 of ' + totalN + '…</span>' +
      '</div>';
    var bar   = status.querySelector('.scw-ws-v2-bulk-progress-bar');
    var label = status.querySelector('.scw-ws-v2-bulk-progress-label');

    // Accessories first so the parent\'s connections don\'t go stale
    // mid-cascade.
    var jobs = accIds.concat(parentIds);
    runJobQueue(jobs, function (id) {
      return deleteRecordFE(sourceViewKey, id);
    }, function (done, total) {
      var pct = Math.round((done / total) * 100);
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = 'Deleting ' + done + ' of ' + total + '… (' + pct + '%)';
    }).then(function (results) {
      var ok = 0, fail = 0, deleted = [];
      for (var r = 0; r < results.length; r++) {
        if (results[r].ok) { ok++; if (results[r].recordId) deleted.push(results[r].recordId); }
        else fail++;
      }
      overlay.classList.remove('scw-ws-v2-bulk-overlay--saving');
      if (fail === 0) {
        status.innerHTML = '<div class="scw-ws-v2-bulk-success">' +
          '<span class="scw-ws-v2-bulk-success-check">&#10003;</span>' +
          'Deleted ' + ok + ' records. Refreshing…</div>';
        setTimeout(function () {
          close();
          // Deselect ONLY the rows we deleted. For a bulk delete that's the
          // selected parents (selection empties, as before); for "remove
          // accessories" only the child accessories were deleted, so the
          // selected parents stay checked.
          deselect(deleted);
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(sourceViewKey);
          }
          syncDomFromState();
          refreshToolbar();
        }, 1200);
      } else {
        status.innerHTML = '<div class="scw-ws-v2-bulk-fail">' +
          'Deleted ' + ok + ', failed ' + fail + '. Try again or close.</div>';
        confirmBtn.disabled = false;
        cancelBtn.disabled  = false;
      }
    });
  }

  function runQueue(jobs, onProgress) {
    // jobs: [{viewKey, recordId, body}, ...]
    var results = [];
    var i = 0, inflight = 0, total = jobs.length;
    var d = $.Deferred();
    function pump() {
      while (inflight < MAX_CONCURRENT && i < total) {
        var job = jobs[i++];
        inflight++;
        doPutWithRetry(job.viewKey, job.recordId, job.body).then(function (r) {
          inflight--;
          results.push(r);
          if (typeof onProgress === 'function') onProgress(results.length, total);
          if (results.length === total) d.resolve(results);
          else pump();
        });
      }
    }
    if (!total) d.resolve(results);
    else pump();
    return d.promise();
  }

  // ── Bulk-edit modal ──────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
  }
  function isMapConnectionsRow(rec) {
    var raw = rec && rec['field_2231_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec['field_2231'] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  function getSourceCandidatesForConn(field, sourceViewKey, selectedIds) {
    // Returns: { candidates: [...], groupBy: fn|null, itemLabel: fn|null }
    // - mdf:     MDF/IDF locations from CONFIG.mdfSourceViewKey
    // - sows:    Scopes of Work from view_3325 (field_2122 = SW-#### id, field_2126 = name)
    // - devices: NVR/headend rows from the worksheet source view,
    //            filtered to records with field_2231 (Map Connections) = Yes,
    //            grouped by MDF/IDF (field_1946_raw[0])
    function fromViewAttrs(vk) {
      var v = Knack.views[vk];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var list = [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (a && a.id) list.push(a);
      }
      return list;
    }
    // First view in the list that yields records — lets connection
    // candidates source from the build-SOW-scene view OR its bid-review
    // equivalent, whichever is on the page.
    function fromFirstView(vks) {
      for (var i = 0; i < vks.length; i++) {
        var a = fromViewAttrs(vks[i]);
        if (a && a.length) return a;
      }
      return [];
    }

    if (field.candSource === 'mdf') {
      var cfgViews = (ns.CONFIG && ns.CONFIG.views) || [];
      var labelField = 'field_1642';
      var mdfViewKey = '';
      for (var v = 0; v < cfgViews.length; v++) {
        if (cfgViews[v].sourceViewKey === sourceViewKey) {
          mdfViewKey = cfgViews[v].mdfSourceViewKey;
          labelField = cfgViews[v].mdfLabelField || 'field_1642';
          break;
        }
      }
      var mdfAttrs = fromFirstView([mdfViewKey, 'view_3822']);
      var mdfCands = mdfAttrs.map(function (a) {
        return { id: a.id, identifier: stripHtml(a[labelField] || a.identifier) };
      }).filter(function (c) { return c.identifier; });
      return { candidates: mdfCands, groupBy: null, itemLabel: null };
    }

    if (field.candSource === 'sows') {
      var sowAttrs = fromFirstView(['view_3325', 'view_3918']);
      var sowCands = [];
      for (var s = 0; s < sowAttrs.length; s++) {
        var a = sowAttrs[s];
        var sowId   = stripHtml(a.field_2122);
        var sowName = stripHtml(a.field_2126);
        if (!sowId && !sowName) continue;
        sowCands.push({ id: a.id, sowId: sowId, name: sowName,
                        identifier: sowId || sowName });
      }
      sowCands.sort(function (a, b) {
        return String(a.sowId).localeCompare(String(b.sowId), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return {
        candidates: sowCands,
        groupBy:    null,
        itemLabel:  function (r) {
          if (r.sowId && r.name) return r.sowId + ' · ' + r.name;
          return r.sowId || r.name || r.id;
        }
      };
    }

    if (field.candSource === 'devices') {
      var devAttrs = fromViewAttrs(sourceViewKey);
      var devCands = [];
      for (var d = 0; d < devAttrs.length; d++) {
        var r = devAttrs[d];
        if (!isMapConnectionsRow(r)) continue;
        devCands.push(r);
      }
      return {
        candidates: devCands,
        groupBy: function (r) {
          var raw = r.field_1946_raw;
          if (Array.isArray(raw) && raw.length && raw[0]) {
            return { id: raw[0].id, label: raw[0].identifier || '' };
          }
          return { id: '__unknown', label: 'Unassigned' };
        },
        itemLabel: function (r) {
          var lbl  = stripHtml(r.field_1950);
          var prod = stripHtml(r.field_1949);
          if (lbl && prod) return lbl + ' · ' + prod;
          return lbl || prod || r.id;
        }
      };
    }

    if (field.candSource === 'products') {
      // Same source as the per-row product picker — window.SCW.productMap
      // (id → {name, buckets[]}), populated by the Builder snippet on
      // app boot. Filter to products allowed for EVERY selected record\'s
      // bucket so a bulk write can\'t land an invalid product on some
      // rows. Products with no buckets list are universal (included
      // regardless) — matches per-row picker behavior.
      var pmap = (window.SCW && window.SCW.productMap) || {};
      var v = window.Knack && Knack.views && Knack.views[sourceViewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      var bucketsInSelection = Object.create(null);
      var sel = Object.create(null);
      var i;
      for (i = 0; i < (selectedIds || []).length; i++) sel[selectedIds[i]] = true;
      for (i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (!a || !sel[a.id]) continue;
        var raw = a.field_2219_raw;
        var bid = (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) || '';
        if (bid) bucketsInSelection[bid] = true;
      }
      var prodCands = [];
      for (var pid in pmap) {
        if (!Object.prototype.hasOwnProperty.call(pmap, pid)) continue;
        var p = pmap[pid];
        if (!p) continue;
        // Universal product (no buckets list) → always include.
        if (Array.isArray(p.buckets) && p.buckets.length > 0) {
          // Must allow EVERY bucket in the selection.
          var ok = true;
          for (var bk in bucketsInSelection) {
            if (p.buckets.indexOf(bk) === -1) { ok = false; break; }
          }
          if (!ok) continue;
        }
        prodCands.push({ id: pid, identifier: p.name || '(unnamed)' });
      }
      // Fallback for scenes without the SCW.productMap Builder snippet (e.g.
      // the bid comparison grid, scene_1155 — Known Issue #17). Without it the
      // bulk product field had zero candidates and read as "broken". Scrape the
      // distinct products in use on the loaded records so the field still
      // offers a usable (in-use only) list. bmap = SCW.productBucketMap is the
      // proven bucket filter; require a candidate valid for EVERY bucket in the
      // selection, same rule as the productMap path above.
      var pmapEmpty = true;
      for (var _pk in pmap) { if (Object.prototype.hasOwnProperty.call(pmap, _pk)) { pmapEmpty = false; break; } }
      if (pmapEmpty) {
        // Derive product → { name, set-of-buckets } straight from the loaded
        // rows (each row pairs a product with its own bucket) so we can filter
        // by category with no external Builder map and guaranteed id
        // alignment. A candidate must be valid for EVERY bucket in the
        // selection (same rule as the productMap path above).
        var fconn = ['field_1949', 'field_2627'];
        var prodBuckets = Object.create(null);
        for (i = 0; i < models.length; i++) {
          var ma = models[i] && models[i].attributes;
          if (!ma) continue;
          var mraw = ma.field_2219_raw;
          var mbid = (Array.isArray(mraw) && mraw.length && mraw[0] && mraw[0].id) || '';
          for (var fc = 0; fc < fconn.length; fc++) {
            var fraw = ma[fconn[fc] + '_raw'];
            if (!Array.isArray(fraw)) continue;
            for (var fj = 0; fj < fraw.length; fj++) {
              var fv = fraw[fj];
              if (!fv || !fv.id) continue;
              var pb = prodBuckets[fv.id] ||
                (prodBuckets[fv.id] = { name: '', buckets: Object.create(null) });
              if (mbid) pb.buckets[mbid] = true;
              if (!pb.name && fv.identifier != null) {
                pb.name = String(fv.identifier).replace(/<[^>]*>/g, '').trim();
              }
            }
          }
        }
        for (var pk2 in prodBuckets) {
          if (!Object.prototype.hasOwnProperty.call(prodBuckets, pk2)) continue;
          var e2 = prodBuckets[pk2];
          // Must cover EVERY bucket in the selection (skip products whose
          // observed bucket set misses any selected bucket). Products with no
          // observed bucket stay (universal / fail-open).
          var okAll = true, sawAny = false;
          for (var bk2 in e2.buckets) sawAny = true;
          if (sawAny) {
            for (var selBk in bucketsInSelection) {
              if (!e2.buckets[selBk]) { okAll = false; break; }
            }
          }
          if (!okAll) continue;
          prodCands.push({ id: pk2, identifier: e2.name || pk2 });
        }
      }
      prodCands.sort(function (a, b) {
        return String(a.identifier).localeCompare(String(b.identifier), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return { candidates: prodCands, groupBy: null, itemLabel: null };
    }

    if (field.candSource === 'survey-bids') {
      // Bids from the BIDs grid (view_3507, label field_2414). Prefer the
      // in-use connection identifier from the survey line items so labels
      // read identically to the worksheet (e.g. "1" / "93").
      var bidAttrs = fromFirstView(['view_3507']);
      var inUseBid = Object.create(null);
      var sv2 = window.Knack && Knack.views && Knack.views[sourceViewKey];
      var sm2 = (sv2 && sv2.model && sv2.model.data && sv2.model.data.models) || [];
      for (var bi = 0; bi < sm2.length; bi++) {
        var braw = sm2[bi].attributes && sm2[bi].attributes.field_2415_raw;
        if (!Array.isArray(braw)) continue;
        for (var bj = 0; bj < braw.length; bj++) {
          var bv = braw[bj];
          if (bv && bv.id && bv.identifier != null) inUseBid[bv.id] = String(bv.identifier);
        }
      }
      var bidCands = bidAttrs.map(function (a) {
        var base = inUseBid[a.id] || stripHtml(a.field_2414) || stripHtml(a.identifier) || a.id;
        // Append the friendly bid name (field_2636) so the option reads
        // "141 — White Storage Shelf…" instead of the bare number.
        var fn = stripHtml(a.field_2636);
        var label = (fn && String(base).indexOf(fn) === -1) ? (base + ' — ' + fn) : base;
        return { id: a.id, identifier: label };
      }).filter(function (c) { return c.identifier; });
      bidCands.sort(function (a, b) {
        return String(a.identifier).localeCompare(String(b.identifier), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return { candidates: bidCands, groupBy: null, itemLabel: null };
    }

    if (field.candSource === 'dropPrefix') {
      // Key-free catalog read (hidden view per scene), legacy snippet
      // global as fallback — see _catalog-views.js (Known Issue #17).
      // Each entry: { id: <24-hex>, identifier: '<label>' }.
      var raw = (window.SCW && SCW.catalog && SCW.catalog.dropPrefixes()) ||
                (window.SCW && window.SCW.dropPrefixOptions) || [];
      var cands = [];
      for (var dp = 0; dp < raw.length; dp++) {
        var rec = raw[dp];
        if (rec && rec.id && rec.identifier) cands.push(rec);
      }
      return { candidates: cands, groupBy: null, itemLabel: null };
    }

    return { candidates: [], groupBy: null, itemLabel: null };
  }

  /** One-shot note prompt (textarea). cb(noteText) on save, cb(null) on cancel. */
  function promptNote(count, cb) {
    var ov = document.createElement('div');
    ov.className = 'scw-ws-v2-bulk-overlay';
    ov.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Survey note required</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">You’re removing ' + count +
            ' item' + (count === 1 ? '' : 's') + ' from the bid. Capture a survey note ' +
            'explaining why — it’ll be saved on each item (existing notes are kept).</div>' +
        '</div>' +
        '<div style="padding:0 18px 6px;">' +
          '<textarea class="scw-ws-v2-bulk-note" rows="3" placeholder="e.g. Item not needed per customer; duplicate of E-014; etc." ' +
            'style="width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;"></textarea>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete" disabled>Save with note</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    var ta  = ov.querySelector('.scw-ws-v2-bulk-note');
    var okB = ov.querySelector('.scw-ws-v2-bulk-modal-confirm-delete');
    var caB = ov.querySelector('.scw-ws-v2-bulk-modal-cancel');
    function close() { ov.parentNode && ov.parentNode.removeChild(ov); }
    ta.addEventListener('input', function () { okB.disabled = !ta.value.trim(); });
    caB.addEventListener('click', function () { close(); cb(null); });
    okB.addEventListener('click', function () {
      var v = ta.value.trim(); if (!v) return; close(); cb(v);
    });
    ov.addEventListener('click', function (e) { if (e.target === ov) { close(); cb(null); } });
    setTimeout(function () { ta.focus(); }, 30);
  }

  /** Config-driven clear-note gate: if the view declares `clearNote:{conn,note}`
   *  (logical names) and this bulk batch CLEARS that connection on ≥1 row,
   *  prompt ONCE and write the note into every clearing row's PUT (preserving
   *  existing notes). The note in the body makes survey-bid-validate's bid-gate
   *  skip these PUTs, so there's no second prompt and no loop. cb(true) to
   *  proceed, cb(false) if the user cancels. */
  function maybePromptClearNote(jobs, sourceViewKey, cb) {
    var vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(sourceViewKey) : null;
    var spec = vc && vc.clearNote;
    if (!spec) return cb(true);
    var F = (ns.cfg && ns.cfg.fields(sourceViewKey)) || {};
    var connKey = F[spec.conn] || spec.conn;
    var noteKey = F[spec.note] || spec.note;
    var clearing = jobs.filter(function (j) {
      if (!j.body || !(connKey in j.body)) return false;
      var v = j.body[connKey];
      return Array.isArray(v) ? (v.length === 0) : (!v || v === '');
    });
    if (!clearing.length) return cb(true);
    promptNote(clearing.length, function (note) {
      if (note == null) return cb(false);   // cancelled
      var idx = attrsIndex(sourceViewKey);
      clearing.forEach(function (j) {
        var a = idx[j.recordId];
        var existingRaw = a ? a[noteKey] : '';
        var existing = (existingRaw != null) ? String(existingRaw).replace(/<[^>]*>/g, '').trim() : '';
        // Preserve an existing note (re-write its raw value so the PUT still
        // carries the field and bypasses the gate); else write the new note.
        j.body[noteKey] = existing ? existingRaw : note;
      });
      cb(true);
    });
  }

  /** Config-driven $0/blank confirm (confirmZero) for the bulk path: if this
   *  batch sets the configured field to $0 or blank on ≥1 row, confirm ONCE.
   *  cb(true) to proceed, cb(false) to abort. */
  function maybeConfirmZero(jobs, sourceViewKey, cb) {
    var vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(sourceViewKey) : null;
    var spec = vc && vc.confirmZero;
    if (!spec || !ns.confirmModal || !ns.isZeroBlank) return cb(true);
    var F = (ns.cfg && ns.cfg.fields(sourceViewKey)) || {};
    var key = F[spec.field] || spec.field;
    var hit = jobs.some(function (j) {
      return j.body && (key in j.body) && ns.isZeroBlank(j.body[key]);
    });
    if (!hit) return cb(true);
    ns.confirmModal({
      title: spec.title, body: spec.body,
      okLabel: 'Yes, continue', cancelLabel: 'Cancel'
    }).then(function (ok) { cb(!!ok); });
  }

  // Styles for the questionnaire section folded into the bulk modal. The field
  // controls themselves carry deliverables (.scw-deliverables-*) classes whose
  // CSS is already injected on this scene; this only adds the section header +
  // apply-row layout.
  var _qStyleInjected = false;
  function injectQStyles() {
    if (_qStyleInjected || document.getElementById('scw-ws-v2-bulk-q-css')) { _qStyleInjected = true; return; }
    _qStyleInjected = true;
    var css =
      '.scw-ws-v2-bulk-section{font:700 11px system-ui,sans-serif;text-transform:uppercase;' +
        'letter-spacing:.05em;color:#0f4c75;margin:16px 0 8px;padding-bottom:5px;border-bottom:1px solid #e2e8f0;}' +
      '.scw-ws-v2-bulk-section:first-child{margin-top:0;}' +
      '.scw-ws-v2-bulk-qrow{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;}' +
      '.scw-ws-v2-bulk-qapply{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;width:56px;' +
        'padding-top:20px;font:600 11px system-ui,sans-serif;color:#475569;cursor:pointer;}' +
      '.scw-ws-v2-bulk-qcontrol{flex:1 1 auto;min-width:0;}';
    var s = document.createElement('style');
    s.id = 'scw-ws-v2-bulk-q-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Short display label for a selected record — drop label, then product
   *  name, then product connection identifier; DOM card text as a fallback;
   *  last-5 of the id if nothing resolves. */
  function recordLabel(id, idx, F) {
    function clean(v) { return v == null ? '' : String(v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
    var a = idx[id];
    if (a) {
      var l = clean(a[F.displayLabel || 'field_2365']) || clean(a[F.productName || 'field_2379']);
      if (!l) {
        var pr = a[(F.product || 'field_1949') + '_raw'];
        if (Array.isArray(pr) && pr[0]) l = clean(pr[0].identifier);
      }
      if (l) return l;
    }
    try {
      var card = document.querySelector('.scw-ws-v2-card[data-scw-ws-v2-record="' + id + '"]');
      if (card) {
        var le = card.querySelector('.scw-ws-v2-cell--label');
        var t = le ? clean(le.textContent) : '';
        if (!t) { var pe = card.querySelector('.scw-ws-v2-product-name'); t = pe ? clean(pe.textContent) : ''; }
        if (t) return t;
      }
    } catch (e) {}
    return '…' + String(id).slice(-5);
  }

  /** Chip strip of the selected rows for the modal head. Caps at MAX chips
   *  (+"N more") so a huge selection can't blow up the DOM, and the strip is a
   *  fixed-height scroll region (CSS) so it never crowds out the fields. */
  function selectedRowsHtml(ids, sourceViewKey) {
    var MAX = 40;
    var idx = attrsIndex(sourceViewKey);
    var F = (ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(sourceViewKey)) || {};
    var chips = '';
    var shown = Math.min(ids.length, MAX);
    for (var i = 0; i < shown; i++) {
      chips += '<span class="scw-ws-v2-bulk-chip">' + escapeHtml(recordLabel(ids[i], idx, F)) + '</span>';
    }
    if (ids.length > MAX) {
      chips += '<span class="scw-ws-v2-bulk-chip scw-ws-v2-bulk-chip--more">+' +
        (ids.length - MAX) + ' more</span>';
    }
    return '<div class="scw-ws-v2-bulk-selected-chips">' + chips + '</div>';
  }

  function openBulkModal(ids, sourceViewKey) {
    // If any selected row is locked (survey-associated sales item), only the
    // lock whitelist (Product / SCW Notes / Custom Disc %) is bulk-editable —
    // mirroring the per-card lock so we never bulk-write a locked field.
    var locked = selectionHasLocked(ids, sourceViewKey);
    var categories = recordCategories(ids, sourceViewKey);
    var sales = isSalesView(sourceViewKey);
    var fieldSet = fieldSetFor(sourceViewKey);
    var fields = locked ? LOCKED_BULK_FIELDS.slice() : intersectVisibleFields(ids, sourceViewKey, fieldSet);
    // Per-row visible-field map for save-time gating (null when locked → the
    // whitelist applies to every selected row uniformly).
    var rowVisible = locked ? null : rowVisibleMap(ids, sourceViewKey, fieldSet);
    // Diagnostic: if a selection yields no categories the modal will read
    // "no shared fields". Log exactly why (selection size, how many ids
    // resolved, the view key + record counts) so the intermittent blank
    // is traceable instead of a mystery.
    if (!categories.length || !fields.length) {
      var _idx = attrsIndex(sourceViewKey);
      var _resolved = 0; for (var _i = 0; _i < ids.length; _i++) if (_idx[ids[_i]]) _resolved++;
      console.warn('[scw-ws-v2] bulk: no shared fields', {
        selected: ids.length, resolvedAttrs: _resolved,
        sourceViewKey: sourceViewKey, _sourceViewKey: _sourceViewKey,
        categories: categories, locked: locked, sales: sales,
        modelRecords: (ns.data && ns.data.readRecords ? ns.data.readRecords(sourceViewKey).length : 'n/a'),
        domCards: document.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]').length
      });
    }
    // Product candidates vary by proposal bucket — don't offer Product
    // when the selection spans multiple buckets.
    var mixedBuckets = !allSameBucket(ids, sourceViewKey);
    if (mixedBuckets && !locked) {
      fields = fields.filter(function (f) { return f.key !== 'field_1949'; });
    }
    // Drop fields that are read-only in this view's context (e.g. SCW Notes on
    // the bid-review comparison grid). Applies even to the locked whitelist.
    var roSet = READONLY_FIELDS_BY_VIEW[sourceViewKey];
    if (roSet) {
      fields = fields.filter(function (f) { return !roSet[f.key]; });
    }
    var subHtml = locked
      ? 'Some selected rows are locked — only <b>Product</b>, <b>SCW Notes</b> &amp; <b>Custom Disc %</b> can be bulk-edited.'
      : (categories.length === 1
          ? 'All rows in <b>' + escapeHtml(categories[0]) + '</b> category'
          : 'Mixed buckets — showing fields common to all');

    // ── Questionnaire (deliverables) fold-in ──────────────────────────
    // When the view declares a `questionnaire` config and the deliverables
    // API is ready, compute the schema questions COMMON to every selected
    // record (intersected by key) so we can offer them in a dedicated
    // "System Questionnaire" section that writes the JSON answer blob.
    var _vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(sourceViewKey) : null;
    var qCfg = _vc && _vc.questionnaire;
    var DLV = window.SCW && window.SCW.deliverables;
    var qDefs = [];
    if (qCfg && DLV && DLV.ready && DLV.ready()) {
      var _bySchema = DLV.schemaFieldsById();
      var _idx = attrsIndex(sourceViewKey);
      var _lists = [];
      for (var _qi = 0; _qi < ids.length; _qi++) {
        var _rec = _idx[ids[_qi]];
        if (!_rec) continue;
        var _sid = DLV.schemaIdOf(_rec);
        var _fl = _sid ? _bySchema[_sid] : null;
        if (_fl && _fl.length) _lists.push(_fl);
      }
      if (_lists.length) {
        qDefs = _lists[0].filter(function (def) {
          return _lists.every(function (list) {
            return list.some(function (d) { return d.key === def.key; });
          });
        });
      }
    }
    var hasQ = qDefs.length > 0;

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-bulk-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-bulk-modal" role="dialog" aria-modal="true">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title">Edit ' + ids.length + ' selected</div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' + subHtml + '</div>' +
          selectedRowsHtml(ids, sourceViewKey) +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-body"></div>' +
        '<div class="scw-ws-v2-bulk-modal-status"></div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-bulk-modal-save">Apply to ' + ids.length + ' rows</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body   = overlay.querySelector('.scw-ws-v2-bulk-modal-body');
    var status = overlay.querySelector('.scw-ws-v2-bulk-modal-status');
    var saveBtn   = overlay.querySelector('.scw-ws-v2-bulk-modal-save');
    var cancelBtn = overlay.querySelector('.scw-ws-v2-bulk-modal-cancel');

    if (!fields.length && !hasQ) {
      body.innerHTML = '<div class="scw-ws-v2-bulk-empty">No fields are editable across all selected rows.</div>';
      saveBtn.disabled = true;
    }

    // Track per-field state: { apply: bool, value: any }
    var rowState = {};

    fields.forEach(function (f) {
      rowState[f.key] = { apply: false, value: null, mode: 'replace' };
      var row = document.createElement('div');
      row.className = 'scw-ws-v2-bulk-row';
      row.setAttribute('data-scw-ws-v2-bulk-field', f.key);
      row.innerHTML =
        '<label class="scw-ws-v2-bulk-row-apply">' +
          '<input type="checkbox" data-scw-ws-v2-bulk-apply>' +
          '<span class="scw-ws-v2-bulk-row-label">' + escapeHtml(f.label) + '</span>' +
        '</label>' +
        '<div class="scw-ws-v2-bulk-row-value"></div>';
      body.appendChild(row);

      var applyCb = row.querySelector('[data-scw-ws-v2-bulk-apply]');
      var slot    = row.querySelector('.scw-ws-v2-bulk-row-value');

      // Build the appropriate input for this field kind.
      if (f.kind === 'text') {
        slot.innerHTML = '<input type="text" class="scw-ws-v2-bulk-input" placeholder="New value">';
        slot.querySelector('input').addEventListener('input', function (e) {
          rowState[f.key].value = e.target.value;
          rowState[f.key].apply = true;
          applyCb.checked = true;
        });
      } else if (f.kind === 'number') {
        slot.innerHTML = '<input type="number" step="any" class="scw-ws-v2-bulk-input" placeholder="New value">';
        slot.querySelector('input').addEventListener('input', function (e) {
          rowState[f.key].value = e.target.value;
          rowState[f.key].apply = true;
          applyCb.checked = true;
        });
      } else if (f.kind === 'bool') {
        slot.innerHTML =
          '<select class="scw-ws-v2-bulk-input">' +
            '<option value="">(no change)</option>' +
            '<option value="Yes">Yes</option>' +
            '<option value="No">No</option>' +
          '</select>';
        slot.querySelector('select').addEventListener('change', function (e) {
          if (!e.target.value) {
            rowState[f.key].apply = false;
            applyCb.checked = false;
          } else {
            rowState[f.key].value = e.target.value;
            rowState[f.key].apply = true;
            applyCb.checked = true;
          }
        });
      } else if (f.kind === 'select') {
        // Single-select from a fixed option list (e.g. Mounting Height chips).
        var optsHtml = '<option value="">(no change)</option>';
        var optList = f.options || [];
        for (var oi = 0; oi < optList.length; oi++) {
          optsHtml += '<option value="' + escapeHtml(optList[oi]) + '">' +
            escapeHtml(optList[oi]) + '</option>';
        }
        slot.innerHTML = '<select class="scw-ws-v2-bulk-input">' + optsHtml + '</select>';
        slot.querySelector('select').addEventListener('change', function (e) {
          if (!e.target.value) {
            rowState[f.key].apply = false;
            applyCb.checked = false;
          } else {
            rowState[f.key].value = e.target.value;
            rowState[f.key].apply = true;
            applyCb.checked = true;
          }
        });
      } else if (f.kind === 'conn-single' || f.kind === 'conn-multi') {
        slot.innerHTML =
          '<button type="button" class="scw-ws-v2-bulk-conn-btn">' +
            '<span class="scw-ws-v2-bulk-conn-val">(choose)</span>' +
            '<span class="scw-ws-v2-bulk-conn-edit">pick</span>' +
          '</button>' +
          // Multi-connection fields (SOW, Connected Devices) can ADD the picked
          // records to each row's existing selection instead of replacing it.
          (f.kind === 'conn-multi'
            ? '<label class="scw-ws-v2-bulk-conn-mode" title="Add the picked ' +
                'records to each row\'s existing selection instead of replacing it.">' +
                '<input type="checkbox" class="scw-ws-v2-bulk-conn-add">' +
                '<span>Add to existing (don\'t replace)</span>' +
              '</label>'
            : '');
        var addToggle = slot.querySelector('.scw-ws-v2-bulk-conn-add');
        if (addToggle) {
          addToggle.addEventListener('change', function (e) {
            rowState[f.key].mode = e.target.checked ? 'add' : 'replace';
          });
        }
        slot.querySelector('button').addEventListener('click', function () {
          var resolved = getSourceCandidatesForConn(f, sourceViewKey, ids);
          var cands = resolved.candidates;
          // "Add to existing" mode only ADDS the picked records to each row's
          // current selection — clearing is meaningless there, so suppress the
          // picker's "Clear all selections" row and treat an empty pick as "no
          // change" rather than a no-op clear (the illogical UX we're fixing).
          var addMode = (f.kind === 'conn-multi' && rowState[f.key].mode === 'add');
          if (!ns.picker || typeof ns.picker.open !== 'function') {
            status.textContent = 'Picker not available.';
            return;
          }
          if (!cands.length) {
            status.textContent = 'No candidates available for ' + f.label + '.';
            return;
          }
          // Pre-select if EVERY selected record currently holds the
          // same value on this field — that way the picker opens on
          // the existing choice instead of a blank slate. Mixed
          // selections (different values across records) get no
          // pre-select, since there\'s no single answer to surface.
          var preselect = [];
          try {
            var sourceView = window.Knack && Knack.views &&
                             Knack.views[sourceViewKey];
            var models = (sourceView && sourceView.model && sourceView.model.data &&
                          sourceView.model.data.models) || [];
            var byId = Object.create(null);
            for (var mi = 0; mi < models.length; mi++) {
              var a = models[mi] && models[mi].attributes;
              if (a && a.id) byId[a.id] = a;
            }
            var seen = null;       // serialized form of the first record\'s value
            var allSame = true;
            for (var ii = 0; ii < ids.length && allSame; ii++) {
              var attrs = byId[ids[ii]];
              if (!attrs) { allSame = false; break; }
              var raw = attrs[f.key + '_raw'];
              var arr = [];
              if (Array.isArray(raw)) {
                for (var ri = 0; ri < raw.length; ri++) {
                  if (raw[ri] && raw[ri].id) arr.push(raw[ri].id);
                }
              } else if (raw && raw.id) {
                arr.push(raw.id);
              }
              arr.sort();
              var key = arr.join('|');
              if (seen === null) seen = key;
              else if (seen !== key) allSame = false;
              if (allSame && ii === 0) preselect = arr.slice();
            }
            if (!allSame) preselect = [];
          } catch (e) { preselect = []; }

          ns.picker.open({
            sourceViewKey: sourceViewKey,
            recordId:      ids[0], // not used in pickOnly mode
            fieldKey:      f.key,
            label:         f.label,
            selectedIds:   preselect,
            candidates:    cands,
            groupBy:       resolved.groupBy || undefined,
            multi:         f.kind === 'conn-multi',
            pickOnly:      true,
            allowClear:    !addMode,
            itemLabel:     resolved.itemLabel || function (r) { return r.identifier || r.id; },
            onChoose: function (chosenIds) {
              // Empty pick in "Add to existing" mode = nothing to add → don't
              // mark the field for apply (avoids a confusing no-op save).
              if (addMode && !chosenIds.length) {
                rowState[f.key].apply = false;
                applyCb.checked = false;
                slot.querySelector('.scw-ws-v2-bulk-conn-val').textContent = '(none added)';
                return;
              }
              rowState[f.key].value = f.kind === 'conn-multi'
                ? chosenIds
                : (chosenIds[0] || '');
              rowState[f.key].apply = true;
              applyCb.checked = true;
              var lbl;
              if (!chosenIds.length) lbl = '(clear)';
              else if (f.kind === 'conn-single') {
                var match = null;
                for (var ci = 0; ci < cands.length; ci++) {
                  if (cands[ci].id === chosenIds[0]) { match = cands[ci]; break; }
                }
                lbl = match
                  ? (resolved.itemLabel ? resolved.itemLabel(match) : match.identifier)
                  : chosenIds[0];
              } else {
                lbl = chosenIds.length + ' selected';
              }
              slot.querySelector('.scw-ws-v2-bulk-conn-val').textContent = lbl;
            }
          });
        });
      }

      applyCb.addEventListener('change', function (e) {
        rowState[f.key].apply = !!e.target.checked;
      });
    });

    // ── Build the "System Questionnaire" section (writes the JSON blob) ──
    // qWrap stays null when there's no questionnaire. When present we also
    // label the regular fields with a "Line item" header so it's clear what
    // each section edits.
    var qWrap = null, qByKey = Object.create(null);
    function collectQ() {
      var out = [];
      if (!qWrap) return out;
      var rows = qWrap.querySelectorAll('[data-q-key]');
      for (var i = 0; i < rows.length; i++) {
        var cb = rows[i].querySelector('[data-scw-ws-v2-bulk-apply]');
        if (!cb || !cb.checked) continue;
        var key = rows[i].getAttribute('data-q-key');
        var def = qByKey[key]; if (!def) continue;
        out.push({ key: key, value: readQVal(rows[i], def) });
      }
      return out;
    }
    function readQVal(row, def) {
      var pfx = DLV.classPrefix;
      if (def.type === 'multiselect') {
        var chips = row.querySelector('.' + pfx + '-chips');
        return chips ? Array.prototype.slice.call(chips.querySelectorAll('.is-on'))
          .map(function (b) { return b.getAttribute('data-val'); }) : [];
      }
      var el = row.querySelector('.' + pfx + '-input');
      return el ? el.value : '';
    }
    if (hasQ) {
      injectQStyles();
      var pfx = DLV.classPrefix;
      // Label the line-item fields section (only when a questionnaire follows).
      if (fields.length) {
        var liHdr = document.createElement('div');
        liHdr.className = 'scw-ws-v2-bulk-section';
        liHdr.textContent = 'Line item';
        body.insertBefore(liHdr, body.firstChild);
      }
      var qHdr = document.createElement('div');
      qHdr.className = 'scw-ws-v2-bulk-section';
      qHdr.textContent = 'System Questionnaire';
      body.appendChild(qHdr);
      qWrap = document.createElement('div');
      qWrap.className = 'scw-ws-v2-bulk-qsection';
      qDefs.forEach(function (def) {
        qByKey[def.key] = def;
        var row = document.createElement('div');
        row.className = 'scw-ws-v2-bulk-qrow';
        row.setAttribute('data-q-key', def.key);
        row.innerHTML =
          '<label class="scw-ws-v2-bulk-qapply"><input type="checkbox" data-scw-ws-v2-bulk-apply><span>Apply</span></label>' +
          '<div class="scw-ws-v2-bulk-qcontrol">' +
            DLV.renderField(def, def.type === 'multiselect' ? [] : '') +
          '</div>';
        qWrap.appendChild(row);
      });
      body.appendChild(qWrap);
      // Renders use deliverables markup; wire chip toggle + auto-tick Apply.
      function tickRow(row) { if (!row) return; var cb = row.querySelector('[data-scw-ws-v2-bulk-apply]'); if (cb) cb.checked = true; }
      qWrap.addEventListener('click', function (e) {
        var chip = e.target.closest('.' + pfx + '-chip');
        if (!chip) return;
        var on = chip.classList.toggle('is-on'); chip.setAttribute('aria-pressed', on);
        tickRow(chip.closest('[data-q-key]'));
      });
      qWrap.addEventListener('change', function (e) {
        if (e.target.matches && e.target.matches('select.' + pfx + '-input')) tickRow(e.target.closest('[data-q-key]'));
      });
      qWrap.addEventListener('input', function (e) {
        if (e.target.matches && e.target.matches('input.' + pfx + '-input, textarea.' + pfx + '-input')) tickRow(e.target.closest('[data-q-key]'));
      });
    }

    function close() {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
    }
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    saveBtn.addEventListener('click', function () {
      // Group applied fields by writeViewKey. All fields write through
      // the source view (view_3962) post-cutover — v1's view_3610 is
      // off the page, so any writeViewKey override would 404. Kept as
      // a generic group-by route in case a future field needs a custom
      // routing target.
      var fieldByKey = Object.create(null);
      for (var fi = 0; fi < fields.length; fi++) fieldByKey[fields[fi].key] = fields[fi];
      var appliedKeys = Object.keys(rowState).filter(function (k) { return rowState[k].apply; });
      var qApplied = collectQ();   // [] when no questionnaire section
      if (!appliedKeys.length && !qApplied.length) {
        status.textContent = 'Tick at least one field to apply.';
        return;
      }

      // Read a record's CURRENT connection ids for a field from the loaded
      // model — used to UNION rather than overwrite in "add to existing" mode.
      function currentConnIds(recordId, fieldKey) {
        try {
          var sv = window.Knack && Knack.views && Knack.views[sourceViewKey];
          var models = (sv && sv.model && sv.model.data && sv.model.data.models) || [];
          for (var i = 0; i < models.length; i++) {
            var a = models[i] && models[i].attributes;
            if (!a || a.id !== recordId) continue;
            var raw = a[fieldKey + '_raw'];
            var out = [];
            if (Array.isArray(raw)) {
              for (var r = 0; r < raw.length; r++) if (raw[r] && raw[r].id) out.push(raw[r].id);
            } else if (raw && raw.id) { out.push(raw.id); }
            return out;
          }
        } catch (e) { /* fall through */ }
        return [];
      }

      // Build a body PER (record, route). Override fields share one value
      // across rows; a conn-multi field in "add" mode is per-record — its
      // value is the union of the picked ids with THAT row's existing
      // selection, so nothing already connected is dropped.
      var jobsByKey = Object.create(null);
      ids.forEach(function (rid) {
        appliedKeys.forEach(function (k) {
          // Only write a field to rows that actually expose it (qty to multi-qty
          // rows, cabling to cam rows, Connected Devices to mapping rows, …).
          if (rowVisible && rowVisible[rid] && !rowVisible[rid][k]) return;
          var f = fieldByKey[k];
          var route = (f && f.writeViewKey) || sourceViewKey;
          var val = rowState[k].value;
          if (f && f.kind === 'conn-multi' && rowState[k].mode === 'add') {
            var chosen = Array.isArray(val) ? val : (val ? [val] : []);
            var merged = currentConnIds(rid, k).slice();
            for (var c = 0; c < chosen.length; c++) {
              if (merged.indexOf(chosen[c]) === -1) merged.push(chosen[c]);
            }
            val = merged;
          }
          var jobKey = route + '|' + rid;
          if (!jobsByKey[jobKey]) jobsByKey[jobKey] = { viewKey: route, recordId: rid, body: {} };
          jobsByKey[jobKey].body[k] = val;
        });
      });

      // Accessory SOW must ALWAYS match its parent's SOW. When the bulk edit
      // touches the SOW field (field_2154), propagate each parent's RESULTING
      // SOW value down to its accessory children (field_2464 back-mirror) so
      // they don't get left behind on the old SOW. Uses the parent's final
      // value (post replace/add), and overrides any value the accessory may
      // have gotten from being selected directly — the match invariant wins.
      var SOW_FIELD = 'field_2154';
      if (appliedKeys.indexOf(SOW_FIELD) !== -1) {
        var accMap = accessoriesByParent(ids, sourceViewKey);
        ids.forEach(function (rid) {
          var parentJob = jobsByKey[sourceViewKey + '|' + rid];
          if (!parentJob || !(SOW_FIELD in parentJob.body)) return;
          var parentVal = parentJob.body[SOW_FIELD];
          (accMap[rid] || []).forEach(function (accId) {
            var jk = sourceViewKey + '|' + accId;
            if (!jobsByKey[jk]) jobsByKey[jk] = { viewKey: sourceViewKey, recordId: accId, body: {} };
            jobsByKey[jk].body[SOW_FIELD] = parentVal;
          });
        });
      }

      // Questionnaire answers: merge the applied common fields into each
      // selected record's JSON blob and ride it in that record's PUT (same
      // job, so one PUT per record). Reads the current blob off the model.
      if (qApplied.length && DLV) {
        var vfield = DLV.valueField;
        var qIdx = attrsIndex(sourceViewKey);
        ids.forEach(function (rid) {
          var rec = qIdx[rid]; if (!rec) return;
          var blob = DLV.readValues(rec) || {};
          for (var qa = 0; qa < qApplied.length; qa++) blob[qApplied[qa].key] = qApplied[qa].value;
          var jk = sourceViewKey + '|' + rid;
          if (!jobsByKey[jk]) jobsByKey[jk] = { viewKey: sourceViewKey, recordId: rid, body: {} };
          jobsByKey[jk].body[vfield] = JSON.stringify(blob);
        });
      }

      var jobs = Object.keys(jobsByKey).map(function (jobKey) { return jobsByKey[jobKey]; });

      // Clear-note gate (config clearNote): if this batch clears the configured
      // connection (e.g. Bid), prompt ONCE and write the note into every
      // clearing row's PUT before firing. Cancel = abort the whole save.
      maybePromptClearNote(jobs, sourceViewKey, function (p1) {
        if (!p1) { status.textContent = ''; return; }
        maybeConfirmZero(jobs, sourceViewKey, function (p2) {
          if (!p2) { status.textContent = ''; return; }
          runJobs();
        });
      });

      function runJobs() {
      saveBtn.disabled   = true;
      cancelBtn.disabled = true;
      overlay.classList.add('scw-ws-v2-bulk-overlay--saving');
      status.innerHTML =
        '<div class="scw-ws-v2-bulk-progress">' +
          '<div class="scw-ws-v2-bulk-progress-bar" style="width:0%"></div>' +
        '</div>' +
        '<div class="scw-ws-v2-bulk-progress-text">' +
          '<span class="scw-ws-v2-bulk-spinner"></span>' +
          '<span class="scw-ws-v2-bulk-progress-label">Saving 0 of ' + jobs.length + '…</span>' +
        '</div>';
      var bar   = status.querySelector('.scw-ws-v2-bulk-progress-bar');
      var label = status.querySelector('.scw-ws-v2-bulk-progress-label');

      runQueue(jobs, function (done, total) {
        var pct = Math.round((done / total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (label) label.textContent = 'Saving ' + done + ' of ' + total + '… (' + pct + '%)';
      }).then(function (results) {
        var ok = 0, fail = 0, failedRec = Object.create(null);
        for (var r = 0; r < results.length; r++) {
          if (results[r].ok) ok++;
          else { fail++; if (results[r].recordId) failedRec[results[r].recordId] = true; }
        }
        // Run the reciprocal cascade for any Connected Devices (field_1957)
        // writes that landed — bulk PUTs don't fire knack-cell-update, so
        // without this the field_2197 back-pointers drift on bulk edits.
        try { fireConnectedDevicesCascades(jobs, failedRec); }
        catch (e) { console.warn('[scw-ws-v2-bulk] cascade dispatch threw', e); }
        overlay.classList.remove('scw-ws-v2-bulk-overlay--saving');
        if (fail === 0) {
          status.innerHTML =
            '<div class="scw-ws-v2-bulk-success">' +
              '<span class="scw-ws-v2-bulk-success-check">&#10003;</span>' +
              'Saved ' + ok + ' rows. Refreshing…' +
            '</div>';
          setTimeout(function () {
            close();
            // Keep the checkbox selection after a bulk edit so the user can run
            // another bulk action on the same rows — only the explicit Clear
            // button clears it. The refetch → rebuild → mount() re-applies the
            // selection to the new DOM via syncDomFromState.
            try {
              if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
                ns.data.refetchAndNotify(sourceViewKey);
              } else {
                var v = Knack.views[sourceViewKey];
                if (v && v.model && typeof v.model.fetch === 'function') {
                  v.model.fetch();
                }
              }
            } catch (e) { /* ignore */ }
            syncDomFromState();
            refreshToolbar();
          }, 900);
        } else {
          status.innerHTML =
            '<div class="scw-ws-v2-bulk-fail">' +
              'Saved ' + ok + ', failed ' + fail +
              '. Try again or close — Knack may have rate-limited.' +
            '</div>';
          saveBtn.disabled   = false;
          cancelBtn.disabled = false;
        }
      });
      } // end runJobs
    });
  }

  // ── Public entry point ───────────────────────────────────────
  function mount(sourceViewKey) {
    _sourceViewKey = sourceViewKey;
    ensureToolbar(sourceViewKey);
    wireGlobalDelegates(sourceViewKey);
    // After each re-render, sync visible boxes to current state.
    syncDomFromState();
    refreshToolbar();
  }

  /** Concurrency-capped + retry/backoff FRONT-END delete queue, exposed so the
   *  per-row trash + accessory-chip × handlers in init.js converge onto the
   *  same proven path instead of hand-rolling fire-and-forget fetches (which
   *  silently lose writes to Knack's ~10 req/s 429s — backlog #1).
   *  viewKey: the view to DELETE through; ids: record ids. Resolves to an array
   *  of settle-shaped results ({ ok, recordId, status }); a failure never
   *  rejects the batch. No Make webhook — view-scoped REST DELETE only. */
  function queuedDeleteFE(viewKey, ids, onProgress) {
    if (!ids || !ids.length) {
      var d = $.Deferred(); d.resolve([]); return d.promise();
    }
    return runJobQueue(ids, function (id) {
      return deleteRecordFE(viewKey, id);
    }, onProgress);
  }

  ns.bulk = {
    mount:            mount,
    syncDomFromState: syncDomFromState,
    refreshToolbar:   refreshToolbar,
    // FE-only delete primitives — callers must pass the view to DELETE through.
    deleteRecordFE:   deleteRecordFE,
    queuedDeleteFE:   queuedDeleteFE
  };
})();
/*** END WORKSHEET V2 — BULK EDIT *********************************************/
