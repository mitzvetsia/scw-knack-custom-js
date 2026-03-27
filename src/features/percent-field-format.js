/*** Percent Field Format — global % field handling ***/
(function () {
  'use strict';

  var NS = '.scwPctFmt';
  var APPLIED_ATTR = 'data-scw-pct';

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — field IDs that are percent fields (Knack stores decimal)
  // ══════════════════════════════════════════════════════════════

  var PERCENT_FIELDS = [
    'field_2276'
  ];

  var PCT_SET = {};
  for (var i = 0; i < PERCENT_FIELDS.length; i++) {
    PCT_SET[PERCENT_FIELDS[i]] = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  CONVERSION HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Knack raw (0.20) → display whole number ("20"). Skips if already formatted. */
  function knackToDisplay(raw) {
    var s = String(raw);
    if (s.indexOf('%') !== -1) return s.replace(/[%\s]/g, '');
    var num = parseFloat(s.replace(/[,%\s]/g, ''));
    if (isNaN(num)) return raw;
    return String(Math.round(num * 100 * 10000) / 10000);
  }

  /** Strip display chrome for editing ("20%" → "20"). */
  function stripForEdit(displayed) {
    return String(displayed).replace(/[%\s]/g, '');
  }

  // ══════════════════════════════════════════════════════════════
  //  STRATEGY
  // ══════════════════════════════════════════════════════════════
  //
  // Knack reads form values from its INTERNAL MODEL, not the DOM.
  // The `change` event syncs DOM → model. So:
  //
  //   On load:  Knack raw 0.20 → display "20"
  //   On focus: show "20" for editing
  //   On blur:  1) set value to 0.20 (decimal)
  //             2) trigger change → syncs Knack model to 0.20
  //             3) set value to "20" (valid number — no % suffix)
  //   On submit: Knack validates input as numeric, reads model for save.

  function enhanceInput(input) {
    if (input.getAttribute(APPLIED_ATTR)) return;
    // Only enhance form inputs — skip inline grid edits (inside table cells)
    if (input.closest && input.closest('.kn-table-table')) return;
    input.setAttribute(APPLIED_ATTR, '1');

    // Convert Knack's raw value to display on load
    input.value = knackToDisplay(input.value);

    // On focus: strip % so user sees plain number
    $(input).off('focus' + NS).on('focus' + NS, function () {
      input.value = stripForEdit(input.value);
      input.select();
    });

    // On blur: sync Knack model with decimal, then show whole number
    $(input).off('blur' + NS).on('blur' + NS, function () {
      if (input._scwSubmitting) { input._scwSubmitting = false; return; }
      var num = parseFloat(stripForEdit(input.value));
      if (isNaN(num)) return;
      var knackVal = num / 100;
      // 1) Set decimal value and sync Knack's internal model
      input.value = knackVal;
      $(input).trigger('change');
      // 2) Show whole number (no % suffix — avoids Knack numeric validation rejection)
      input.value = num;
    });
  }

  /** Scan the page (or a container) for percent field inputs and enhance them. */
  function scan(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (inp) enhanceInput(inp);
    }
  }

  /** Convert percent inputs to Knack values before submit.
   *  Only needed for programmatic submits (e.g. inline-form-recompose)
   *  where the button click bypasses the normal blur → change flow. */
  function prepareForSubmit(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (!inp) continue;
      if (inp._scwPctConverted) continue;
      inp._scwSubmitting = true;
      inp._scwPctConverted = true;
      var num = parseFloat(stripForEdit(inp.value));
      if (!isNaN(num)) {
        inp.value = String(num / 100);
        $(inp).trigger('change');
      }
      // Clear flag after a tick
      (function (el) {
        setTimeout(function () { el._scwPctConverted = false; }, 100);
      })(inp);
    }
  }

  /** Re-scan and format after a view re-renders (Knack resets to raw values). */
  function reformatAfterRender(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (inp) {
        inp.removeAttribute(APPLIED_ATTR);
        enhanceInput(inp);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    // Scan on any scene render
    $(document).on('knack-scene-render.any' + NS, function () {
      setTimeout(scan, 200);
    });

    // Also scan now in case scenes are already rendered
    scan();
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.SCW = window.SCW || {};
  SCW.pctFormat = {
    isPercentField: function (fieldId) { return !!PCT_SET[fieldId]; },
    prepareForSubmit: prepareForSubmit,
    reformatAfterRender: reformatAfterRender,
    scan: scan
  };

  if (window.SCW && SCW.onSceneRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
