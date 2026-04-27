/*** FEATURE: Connected-device count below the field_1957 form input *********
 *
 * On any form/details view that renders the field_1957 (Connected Devices)
 * connection input, drop a small "N connected" line directly below the
 * input. The count reads the number of selected <option>s from the Knack
 * form's underlying <select> and re-counts on every change so it stays
 * live as the user picks/unpicks devices.
 *
 * Scope:
 *   View-agnostic — we hook the wrapper by `kn-input-field_1957` (Knack's
 *   stable id-pattern for connection inputs) so this works on the line-
 *   item details/edit form regardless of which view_NNNN hosts it.
 *
 * Why a separate module:
 *   The connection-picker IIFE replaces Knack's table-cell popover. This
 *   is a strict additive read-out for the existing Knack form widget —
 *   no click interception, no save flow. Keeping them split keeps each
 *   file's responsibility narrow.
 ********************************************************************************/
(function () {
  'use strict';

  var TARGET_FIELD = 'field_1957';
  var COUNT_CLASS  = 'scw-conn-count';
  var STYLE_ID     = 'scw-conn-count-css';
  var BOUND_FLAG   = 'scwConnCountBound';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.' + COUNT_CLASS + ' {',
      '  font: 600 12px/1.3 system-ui, -apple-system, sans-serif;',
      '  color: #4b5563;',
      '  letter-spacing: 0.02em;',
      '  margin-top: 6px;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Read the selected-option count from the wrapper's <select>. */
  function countSelected(wrap) {
    var $select = $(wrap).find('select[name="' + TARGET_FIELD + '"]').first();
    if (!$select.length) return 0;
    return $select.find('option:selected').length;
  }

  /** Find or create the count badge inside `wrap` and refresh its text. */
  function refresh(wrap) {
    var el = wrap.querySelector('.' + COUNT_CLASS);
    if (!el) {
      el = document.createElement('div');
      el.className = COUNT_CLASS;
      wrap.appendChild(el);
    }
    var n = countSelected(wrap);
    el.textContent = n + ' connected';
  }

  /** Walk every kn-input-field_1957 wrapper currently in the DOM and
   *  ensure each has a count + a change-listener installed. Knack's
   *  kn-input id is repeated per view, not unique, so we use the
   *  attribute-selector form to catch every wrapper on the scene. */
  function scan() {
    injectStyles();
    var wraps = document.querySelectorAll('[id="kn-input-' + TARGET_FIELD + '"]');
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      refresh(wrap);
      if (wrap[BOUND_FLAG]) continue;
      wrap[BOUND_FLAG] = true;
      var $select = $(wrap).find('select[name="' + TARGET_FIELD + '"]').first();
      // chosen.js fires `change` on the underlying <select> after every
      // pick/remove. That's also what Knack's form-state syncs on, so we
      // get a free, accurate update for every UI interaction.
      $select.on('change.scwConnCount', function () {
        // `this` is the changed <select>; walk up to its kn-input wrapper.
        var w = this.closest('[id="kn-input-' + TARGET_FIELD + '"]');
        if (w) refresh(w);
      });
    }
  }

  // Re-scan on every scene render — covers the initial paint plus any
  // form view that mounts later in the lifecycle (modal forms, etc).
  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender('any', function () { setTimeout(scan, 50); }, 'scwConnCount');
  } else {
    $(document)
      .off('knack-scene-render.any.scwConnCount')
      .on('knack-scene-render.any.scwConnCount', function () { setTimeout(scan, 50); });
  }

  // First-paint attempt for the case where the form is already in the
  // DOM by the time this IIFE runs.
  setTimeout(scan, 150);
})();
