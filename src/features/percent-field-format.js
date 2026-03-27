/*** Percent Field Format — global % field handling ***/
(function () {
  'use strict';

  var NS = '.scwPctFmt';
  var APPLIED_ATTR = 'data-scw-pct';

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — field IDs that are percent fields (Knack stores decimal)
  // ══════════════════════════════════════════════════════════════

  var PERCENT_FIELDS = [
    'field_2276',
    'field_2261'
  ];

  // Build a lookup set for fast checks
  var PCT_SET = {};
  for (var i = 0; i < PERCENT_FIELDS.length; i++) {
    PCT_SET[PERCENT_FIELDS[i]] = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  CONVERSION HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Knack raw (0.20) → display ("20%"). Skips if already has %. */
  function knackToDisplay(raw) {
    var s = String(raw);
    if (s.indexOf('%') !== -1) return s;
    var num = parseFloat(s.replace(/[,%\s]/g, ''));
    if (isNaN(num)) return raw;
    return Math.round(num * 100 * 10000) / 10000 + '%';
  }

  /** Strip display chrome for editing ("20%" → "20"). */
  function stripForEdit(displayed) {
    return String(displayed).replace(/[%\s]/g, '');
  }

  /** User-entered value → Knack raw (20 → "0.2"). */
  function userToKnack(userVal) {
    var num = parseFloat(String(userVal).replace(/[%\s]/g, ''));
    if (isNaN(num)) return userVal;
    return String(num / 100);
  }

  // ══════════════════════════════════════════════════════════════
  //  ENHANCE — find & format percent inputs on the page
  // ══════════════════════════════════════════════════════════════

  function enhanceInput(input) {
    if (input.getAttribute(APPLIED_ATTR)) return;
    input.setAttribute(APPLIED_ATTR, '1');

    // Convert Knack's raw value to display on load
    input.value = knackToDisplay(input.value);

    // On focus: strip % so user sees plain number
    $(input).off('focus' + NS).on('focus' + NS, function () {
      input.value = stripForEdit(input.value);
      input.select();
    });

    // On blur: re-add % (no conversion — still user value)
    // Skip during submit (flag set by prepareForSubmit or native submit hook)
    $(input).off('blur' + NS).on('blur' + NS, function () {
      if (input._scwSubmitting) { input._scwSubmitting = false; return; }
      var num = parseFloat(stripForEdit(input.value));
      if (!isNaN(num)) input.value = num + '%';
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

  /** Convert percent inputs to Knack values before form submit.
   *  Guards against double conversion via _scwPctConverted flag. */
  function prepareForSubmit(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (!inp) continue;
      if (inp._scwPctConverted) continue;  // already converted this cycle
      inp._scwSubmitting = true;
      inp._scwPctConverted = true;
      inp.value = userToKnack(inp.value);
      $(inp).trigger('change');
    }
  }

  /** Re-scan and format after a view re-renders (Knack resets to raw values). */
  function reformatAfterRender(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (inp) {
        // Remove applied attr so enhanceInput re-runs on the fresh DOM
        inp.removeAttribute(APPLIED_ATTR);
        enhanceInput(inp);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT — scan on every scene render
  // ══════════════════════════════════════════════════════════════

  function init() {
    // Intercept ALL form submits (capture phase — fires before Knack's handlers).
    // Converts percent inputs from user value (20) to Knack decimal (0.2).
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      prepareForSubmit(form);
      // Clear the converted flag after Knack processes the submit
      setTimeout(function () {
        for (var i = 0; i < PERCENT_FIELDS.length; i++) {
          var inp = form.querySelector('#' + PERCENT_FIELDS[i]);
          if (inp) inp._scwPctConverted = false;
        }
      }, 100);
    }, true);  // capture phase

    // Scan on any scene render
    $(document).on('knack-scene-render.any' + NS, function () {
      setTimeout(scan, 200);
    });

    // Also scan now in case scenes are already rendered
    scan();
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API — expose on SCW for other modules to use
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
