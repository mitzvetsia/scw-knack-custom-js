/*** Percent Field Format — global % field handling ***/
(function () {
  'use strict';

  var NS = '.scwPctFmt';
  var APPLIED_ATTR = 'data-scw-pct';
  var SUBMIT_BOUND = 'data-scw-pct-submit';

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — field IDs that are percent fields (Knack stores decimal)
  // ══════════════════════════════════════════════════════════════

  var PERCENT_FIELDS = [
    'field_2276',
    'field_2261'
  ];

  var PCT_SET = {};
  for (var i = 0; i < PERCENT_FIELDS.length; i++) {
    PCT_SET[PERCENT_FIELDS[i]] = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  CONVERSION HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Knack raw (0.05) → display whole number ("5"). */
  function knackToDisplay(raw) {
    var s = String(raw).replace(/[%\s]/g, '');
    var num = parseFloat(s);
    if (isNaN(num)) return raw;
    return String(Math.round(num * 100 * 10000) / 10000);
  }

  // ══════════════════════════════════════════════════════════════
  //  STRATEGY
  // ══════════════════════════════════════════════════════════════
  //
  // Knack reads the DOM input value on form submit (not its model).
  // So we must keep the input value as something Knack accepts as
  // a valid number, and swap to the decimal right before submit.
  //
  //   On load:   Knack raw 0.05 → display "5" in input
  //   Editing:   user types "5" (plain number, no conversion)
  //   On submit: capture-phase handler converts "5" → "0.05",
  //              Knack reads "0.05", saves it as 5%
  //   After re-render: 0.05 → display "5" again

  function convertFormPctInputs(form) {
    for (var j = 0; j < PERCENT_FIELDS.length; j++) {
      var inp = form.querySelector('#' + PERCENT_FIELDS[j]);
      if (!inp) continue;
      var num = parseFloat(String(inp.value).replace(/[%\s]/g, ''));
      if (!isNaN(num)) {
        inp.value = String(num / 100);
      }
    }
  }

  function enhanceInput(input) {
    if (input.getAttribute(APPLIED_ATTR)) return;
    // Only enhance form inputs — skip inline grid edits (inside table cells)
    if (input.closest && input.closest('.kn-table-table')) return;
    input.setAttribute(APPLIED_ATTR, '1');

    // Convert Knack's raw decimal to whole number for display
    input.value = knackToDisplay(input.value);
  }

  // Global capture-phase click interceptor on submit buttons.
  // Fires before Knack's jQuery click handler reads the input values.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.kn-submit button[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    // Only convert if this form has percent inputs
    var hasPct = false;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      if (form.querySelector('#' + PERCENT_FIELDS[i])) { hasPct = true; break; }
    }
    if (hasPct) convertFormPctInputs(form);
  }, true);  // capture phase

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
   *  where the button click bypasses the normal submit flow. */
  function prepareForSubmit(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (!inp) continue;
      if (inp._scwPctConverted) continue;
      inp._scwPctConverted = true;
      var num = parseFloat(String(inp.value).replace(/[%\s]/g, ''));
      if (!isNaN(num)) {
        inp.value = String(num / 100);
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
