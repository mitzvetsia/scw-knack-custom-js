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

  function buildBaseline() {
    try {
      var viewModel = Knack.models[CFG.worksheetView];
      if (!viewModel || !viewModel.data) return;

      var recs = viewModel.data.models || viewModel.data;
      if (!recs || !recs.length) return;

      var baseline = S.baseline();
      var pending  = S.pending();

      for (var i = 0; i < recs.length; i++) {
        var attrs = recs[i].attributes || recs[i];
        var id = attrs.id;
        if (!id) continue;
        // Don't overwrite baseline for records with pending CRs
        if (pending[id]) continue;

        var snap = {};
        for (var f = 0; f < TF.length; f++) {
          var fk = TF[f].key;
          var raw = attrs[fk + '_raw'] != null ? attrs[fk + '_raw'] : attrs[fk];
          snap[fk] = H.normVal(TF[f], raw);
        }
        snap._label    = H.stripHtml(attrs[CFG.labelField + '_raw']   || attrs[CFG.labelField]   || '');
        snap._product  = H.stripHtml(attrs[CFG.productField + '_raw'] || attrs[CFG.productField] || '');
        snap._addCount = attrs[CFG.addCountField] || 0;

        baseline[id] = snap;
      }

      if (CFG.debug) console.log('[SalesCR] Baseline:', Object.keys(baseline).length, 'records');
    } catch (e) {
      if (CFG.debug) console.warn('[SalesCR] buildBaseline error:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CELL UPDATE → AUTO-CREATE CR
  // ═══════════════════════════════════════════════════════════

  function onCellUpdate(event, view, record) {
    if (!record || !record.id) return;
    var id = record.id;

    var baseline = S.baseline();
    var pending  = S.pending();
    var base     = baseline[id];

    // No baseline yet — snapshot now (miss this first edit's "before")
    if (!base) {
      base = {};
      for (var f = 0; f < TF.length; f++) {
        var fk = TF[f].key;
        var raw = record[fk + '_raw'] != null ? record[fk + '_raw'] : record[fk];
        base[fk] = H.normVal(TF[f], raw);
      }
      base._label    = H.stripHtml(record[CFG.labelField + '_raw']   || record[CFG.labelField]   || '');
      base._product  = H.stripHtml(record[CFG.productField + '_raw'] || record[CFG.productField] || '');
      base._addCount = record[CFG.addCountField] || 0;
      baseline[id] = base;
      if (CFG.debug) console.log('[SalesCR] Late baseline for', id);
      return;
    }

    // Don't auto-update remove or note CRs
    var existing = pending[id];
    if (existing && (existing.action === 'remove' || existing.action === 'note')) return;

    // Diff tracked fields against baseline
    var changes = {};
    var hasChanges = false;
    for (var f = 0; f < TF.length; f++) {
      var fk = TF[f].key;
      var raw = record[fk + '_raw'] != null ? record[fk + '_raw'] : record[fk];
      var newVal = H.normVal(TF[f], raw);
      if (String(newVal) !== String(base[fk])) {
        changes[fk] = newVal;
        hasChanges = true;
      }
    }

    if (!hasChanges) return;

    var isAdd = S.isAddMode() && parseFloat(base._addCount) !== 0;

    if (existing) {
      // Update existing CR — merge new changes, keep original "current"
      for (var rk in changes) {
        existing.requested[rk] = changes[rk];
        if (existing.current[rk] == null) existing.current[rk] = base[rk];
      }
    } else {
      // New CR
      var current = {};
      for (var ck in changes) current[ck] = base[ck];

      pending[id] = {
        rowId:        id,
        displayLabel: base._label || '',
        productName:  base._product || '',
        action:       isAdd ? 'add' : 'revise',
        current:      current,
        requested:    changes,
        changeNotes:  '',
      };
    }

    ns.persist();
    if (ns.refresh) ns.refresh();
    if (CFG.debug) console.log('[SalesCR] Auto CR for', id, ':', changes);
  }

  // ═══════════════════════════════════════════════════════════
  //  ADD-MODE DETECTION
  // ═══════════════════════════════════════════════════════════

  function checkAddMode() {
    var $pv = $('#' + CFG.proposalView);
    if (!$pv.length) { S.setAddMode(false); return; }

    // Try data-field-key attribute first, then class-based selector
    var $cell = $pv.find('[data-field-key="' + CFG.addModeField + '"]');
    if (!$cell.length) $cell = $pv.find('.field_' + CFG.addModeField.replace('field_', ''));
    if (!$cell.length) $cell = $pv.find('.' + CFG.addModeField);

    var val = H.stripHtml($cell.text());
    S.setAddMode(/^yes$/i.test(val));

    if (CFG.debug) console.log('[SalesCR] Add mode:', S.isAddMode(), '(' + val + ')');
  }

  /** Auto-create "add" CRs for records with field_2586 != 0 when in add mode. */
  function detectAddRecords() {
    if (!S.isAddMode()) return;

    var baseline = S.baseline();
    var pending  = S.pending();
    var keys     = Object.keys(baseline);
    var added    = 0;

    for (var i = 0; i < keys.length; i++) {
      var id   = keys[i];
      var base = baseline[id];
      if (!base) continue;
      if (pending[id]) continue;

      var count = parseFloat(base._addCount);
      if (count === 0 || isNaN(count)) continue;

      pending[id] = {
        rowId:        id,
        displayLabel: base._label || '',
        productName:  base._product || '',
        action:       'add',
        current:      {},
        requested:    {},
        changeNotes:  '',
      };
      added++;
    }

    if (added) {
      ns.persist();
      if (CFG.debug) console.log('[SalesCR] Auto-detected', added, 'add records');
    }
  }

  // ── Public API ──
  ns.buildBaseline    = buildBaseline;
  ns.onCellUpdate     = onCellUpdate;
  ns.checkAddMode     = checkAddMode;
  ns.detectAddRecords = detectAddRecords;

})();
