/*** SALES CHANGE REQUEST — CHANGE DETECTION ***/
/**
 * Baseline snapshot of record state on view render, automatic
 * change-request creation on knack-cell-update, and add-mode
 * detection (field_2706 + field_2586).
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h, .persist, .refresh
 * Writes: SCW.salesCR.buildBaseline, .onCellUpdate, .checkAddMode, .detectAddRecords
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var TF  = CFG.trackedFields;

  // ═══════════════════════════════════════════════════════════
  //  BASELINE SNAPSHOT
  // ═══════════════════════════════════════════════════════════

  /** Try to get the records array from a Knack view model. */
  function getModelRecords(viewKey) {
    try {
      var vm = Knack.models[viewKey];
      if (!vm) return null;
      // Backbone collection
      if (vm.data && vm.data.models) {
        var out = [];
        for (var i = 0; i < vm.data.models.length; i++) {
          out.push(vm.data.models[i].attributes || vm.data.models[i]);
        }
        return out;
      }
      // Plain array
      if (vm.data && Array.isArray(vm.data)) return vm.data;
      // toJSON
      if (vm.data && typeof vm.data.toJSON === 'function') return vm.data.toJSON();
    } catch (e) {}
    return null;
  }

  /** Fallback: scrape field values from the DOM table (before transform). */
  function scrapeBaselineFromDOM() {
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return null;

    var records = [];
    $view.find('tbody tr[id]').each(function () {
      var $tr = $(this);
      var id = $tr.attr('id');
      if (!id || id.indexOf('kn-') === 0) return;

      var rec = { id: id };
      for (var f = 0; f < TF.length; f++) {
        var fk = TF[f].key;
        var $td = $tr.find('td.' + fk + ', td[data-field-key="' + fk + '"]');
        if ($td.length) {
          rec[fk] = H.stripHtml($td.text());
        }
      }
      // Identity fields
      var $labelTd = $tr.find('td.' + CFG.labelField + ', td[data-field-key="' + CFG.labelField + '"]');
      rec[CFG.labelField] = $labelTd.length ? H.stripHtml($labelTd.text()) : '';
      var $prodTd = $tr.find('td.' + CFG.productField + ', td[data-field-key="' + CFG.productField + '"]');
      rec[CFG.productField] = $prodTd.length ? H.stripHtml($prodTd.text()) : '';
      var $countTd = $tr.find('td.' + CFG.addCountField + ', td[data-field-key="' + CFG.addCountField + '"]');
      rec[CFG.addCountField] = $countTd.length ? H.stripHtml($countTd.text()) : '0';

      records.push(rec);
    });

    return records.length ? records : null;
  }

  function buildBaseline() {
    var baseline = S.baseline();
    var pending  = S.pending();

    // Try Knack model first, fall back to DOM scraping
    var records = getModelRecords(CFG.worksheetView) || scrapeBaselineFromDOM();
    if (!records || !records.length) {
      if (CFG.debug) console.warn('[SalesCR] buildBaseline: no records found');
      return;
    }

    for (var i = 0; i < records.length; i++) {
      var attrs = records[i];
      var id = attrs.id;
      if (!id) continue;
      if (pending[id]) continue;
      if (baseline[id]) continue;

      var snap = {};
      for (var f = 0; f < TF.length; f++) {
        var fk = TF[f].key;
        var raw = attrs[fk + '_raw'] != null ? attrs[fk + '_raw'] : attrs[fk];
        snap[fk] = H.normVal(TF[f], raw);
        if (TF[f].type === 'connection') {
          snap[fk + '_ids'] = H.extractIds(raw);
        }
      }
      snap._label      = H.readableVal(attrs[CFG.labelField + '_raw']   || attrs[CFG.labelField]   || '');
      snap._product    = H.readableVal(attrs[CFG.productField + '_raw'] || attrs[CFG.productField] || '');
      snap._addCount   = attrs[CFG.addCountField] || 0;
      // Metadata for Make routing (bucket + labor hours)
      var bucketRaw    = attrs[CFG.bucketField + '_raw'] || attrs[CFG.bucketField];
      snap._bucketId   = H.extractIds(bucketRaw)[0] || '';
      snap._bucketName = H.readableVal(bucketRaw);
      var lhRaw        = attrs[CFG.laborHoursField + '_raw'] != null ? attrs[CFG.laborHoursField + '_raw'] : attrs[CFG.laborHoursField];
      snap._laborHours = typeof lhRaw === 'number' ? lhRaw : parseFloat(String(lhRaw || '0').replace(/[^0-9.\-]/g, '')) || 0;

      baseline[id] = snap;
    }

    if (CFG.debug) SCW.debug('[SalesCR] Baseline:', Object.keys(baseline).length, 'records');
  }

  // ═══════════════════════════════════════════════════════════
  //  CELL UPDATE → AUTO-CREATE CR
  // ═══════════════════════════════════════════════════════════

  function onCellUpdate(event, view, record) {
    if (!record || !record.id) return;
    var id = record.id;

    if (CFG.debug) SCW.debug('[SalesCR] Cell update on', id);

    var baseline = S.baseline();
    var pending  = S.pending();
    var base     = baseline[id];

    // No baseline yet — snapshot the CURRENT (post-edit) state.
    // We'll miss the diff for this first edit, but subsequent edits
    // on this record will diff correctly.
    if (!base) {
      base = {};
      for (var f = 0; f < TF.length; f++) {
        var fk = TF[f].key;
        var raw = record[fk + '_raw'] != null ? record[fk + '_raw'] : record[fk];
        base[fk] = H.normVal(TF[f], raw);
        if (TF[f].type === 'connection') {
          base[fk + '_ids'] = H.extractIds(raw);
        }
      }
      base._label      = H.readableVal(record[CFG.labelField + '_raw']   || record[CFG.labelField]   || '');
      base._product    = H.readableVal(record[CFG.productField + '_raw'] || record[CFG.productField] || '');
      base._addCount   = record[CFG.addCountField] || 0;
      var lbRaw        = record[CFG.bucketField + '_raw'] || record[CFG.bucketField];
      base._bucketId   = H.extractIds(lbRaw)[0] || '';
      base._bucketName = H.readableVal(lbRaw);
      var lhRaw2       = record[CFG.laborHoursField + '_raw'] != null ? record[CFG.laborHoursField + '_raw'] : record[CFG.laborHoursField];
      base._laborHours = typeof lhRaw2 === 'number' ? lhRaw2 : parseFloat(String(lhRaw2 || '0').replace(/[^0-9.\-]/g, '')) || 0;
      baseline[id] = base;
      if (CFG.debug) SCW.debug('[SalesCR] Late baseline for', id, '— first edit not captured');
      return;
    }

    // Don't auto-update remove CRs (user explicitly chose removal)
    var existing = pending[id];
    if (existing && existing.action === 'remove') return;

    // Diff tracked fields against baseline; capture IDs for connection fields
    var changes = {};
    var newIds  = {};   // fk → [ids] for connection fields that changed
    var hasChanges = false;
    for (var f = 0; f < TF.length; f++) {
      var def = TF[f];
      var fk  = def.key;
      var raw = record[fk + '_raw'] != null ? record[fk + '_raw'] : record[fk];
      var newVal = H.normVal(def, raw);
      if (CFG.debug && fk === 'field_1953') {
        SCW.debug('[SalesCR] field_1953 diff:', JSON.stringify({
          raw_exists: record[fk + '_raw'] != null,
          raw_val: record[fk + '_raw'],
          plain_val: record[fk],
          newVal: newVal,
          baseVal: base[fk],
          match: String(newVal) === String(base[fk])
        }));
      }
      if (String(newVal) !== String(base[fk])) {
        changes[fk] = newVal;
        if (def.type === 'connection') {
          newIds[fk] = H.extractIds(raw);
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      if (CFG.debug) SCW.debug('[SalesCR] No tracked-field changes for', id);
      return;
    }

    // A row is an "add" CR ONLY when it has NO associated survey items
    // (count === 0) — i.e., it was created during the revision phase.
    // Rows that came in from the site survey (count > 0) are revisions.
    // See detectAddRecords() for the matching baseline-pass rule.
    var addCount = parseFloat(base._addCount);
    var isAdd = S.isAddMode() && !isNaN(addCount) && addCount === 0;

    if (existing) {
      // Update existing CR — merge new changes, keep original "current"
      for (var rk in changes) {
        existing.requested[rk] = changes[rk];
        if (existing.current[rk] == null) existing.current[rk] = base[rk];
      }
      for (var ik in newIds) {
        existing.requested[ik + '_ids'] = newIds[ik];
        if (existing.current[ik + '_ids'] == null && base[ik + '_ids']) {
          existing.current[ik + '_ids'] = base[ik + '_ids'];
        }
      }
      if (CFG.debug) SCW.debug('[SalesCR] Updated existing CR for', id, ':', changes);
    } else {
      // New CR — copy values AND IDs for connection fields
      var current = {};
      var requested = {};
      for (var ck in changes) {
        current[ck] = base[ck];
        requested[ck] = changes[ck];
      }
      for (var nk in newIds) {
        requested[nk + '_ids'] = newIds[nk];
        if (base[nk + '_ids']) current[nk + '_ids'] = base[nk + '_ids'];
      }

      pending[id] = {
        rowId:        id,
        displayLabel: base._label || '',
        productName:  base._product || '',
        bucketId:     base._bucketId || '',
        bucketName:   base._bucketName || '',
        laborHours:   base._laborHours || 0,
        action:       isAdd ? 'add' : 'revise',
        current:      current,
        requested:    requested,
        changeNotes:  '',
      };
      if (CFG.debug) SCW.debug('[SalesCR] Created new CR for', id, ':', changes);
    }

    ns.persist();
    if (ns.refresh) ns.refresh();
  }

  // ═══════════════════════════════════════════════════════════
  //  ADD-MODE DETECTION
  // ═══════════════════════════════════════════════════════════

  function readAddModeFlagFrom(viewId) {
    // Model first (same fix as init.js readAddModeFlag) \u2014 the details
    // view's DOM can lag or omit the field while the model has it.
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var attrs = v && v.model && v.model.attributes;
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, CFG.addModeField)) {
        var raw = attrs[CFG.addModeField];
        if (raw != null && String(raw).length) {
          return H.stripHtml(String(raw)).replace(/\u00a0/g, ' ').trim();
        }
      }
    } catch (e) { /* fall through to DOM */ }
    var $pv = $('#' + viewId);
    if (!$pv.length) return '';
    var $cell = $pv.find('[data-field-key="' + CFG.addModeField + '"]');
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField + ' .kn-detail-body');
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField);
    return H.stripHtml($cell.text()).replace(/\u00a0/g, ' ').trim();
  }

  function checkAddMode() {
    var views = CFG.addModeViews || [CFG.proposalView];
    var active = false;
    var observed = '';
    for (var i = 0; i < views.length; i++) {
      var val = readAddModeFlagFrom(views[i]);
      if (val) observed = val;
      if (/^yes$/i.test(val)) { active = true; break; }
    }
    // Final fallback: the API read init.js performed against the SOW
    // record (scenes where no addMode view renders at all).
    if (!active && ns._apiAddModeVal && /^yes$/i.test(ns._apiAddModeVal)) {
      active = true;
      observed = ns._apiAddModeVal;
    }
    S.setAddMode(active);
    if (CFG.debug) SCW.debug('[SalesCR] Add mode:', S.isAddMode(), '(' + observed + ')');
  }

  function detectAddRecords() {
    // INTENTIONALLY DISABLED — previously auto-promoted any baseline
    // record with field_2586 = 0 ("no associated survey items") to a
    // pending "add" CR. The assumption was that such rows could only
    // come from the Sales worksheet during revision mode, but that's
    // not true: rows added from the Build SOW page (or anywhere else)
    // with no survey association look identical, so the auto-detect
    // pulled in records the Sales user never touched — producing
    // false-positive ADD cards on the bid comparison grid.
    //
    // Pending ADDs are now created only through user-driven paths:
    //   * Explicit modal — modals.js handler for the "Add Line Item"
    //     button (action = 'add')
    //   * Inline edit on view_3586 — onCellUpdate via the ajaxComplete
    //     intercept, gated on view_3586 in the URL AND
    //     addModeField = "Yes"
    //
    // If we need an auto-detect heuristic again, it should be based
    // on a frozen "pre-revision baseline" snapshot taken at the
    // moment revision mode first activates — comparing current
    // record IDs against that set — not on a fragile field_2586 = 0
    // shortcut. See notes in change-detection.js history.
    return;
  }

  // ── Public API ──
  ns.buildBaseline    = buildBaseline;
  ns.onCellUpdate     = onCellUpdate;
  ns.checkAddMode     = checkAddMode;
  ns.detectAddRecords = detectAddRecords;

})();
