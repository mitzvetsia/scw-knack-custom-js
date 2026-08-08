/***************************** CONNECTED TO (field_2197 / field_2821) READ-ONLY LOCKDOWN *****************************/
/*
 * Known Issue #12 step 1: the child→parent "Connected To" back-pointers are
 * DERIVED + READ-ONLY app-wide. The single editable side is the parent's
 * Connected Devices picker; the mirror-connection-sync cascade is the ONLY
 * writer of the back-pointer.
 *
 *   - field_2197 (SOW Line Item)      ← derived from parent's field_1957
 *   - field_2821 (Install Line Item)  ← derived from parent's field_2820
 *
 * The custom surfaces (worksheet-v2 cards/bulk, v1 device-worksheet) render
 * them read-only via their own configs. This module locks the Knack-NATIVE
 * surfaces:
 *
 *   1. Grid inline edit — any table cell `td.field_XXXX.cell-edit` on any view.
 *      CSS pointer-events kill + a capture-phase event blocker so Knack's
 *      delegated inline-edit handler never fires.
 *   2. Knack edit/create forms — `#kn-input-field_XXXX` (Chosen connection
 *      dropdown) is locked per the repo locked-field convention: fully
 *      readable, no graying, all input chrome stripped so it reads as plain
 *      text, plus a muted hint pointing at the real edit surface.
 *
 * Scope: SOW + install pairs only. The survey pair (field_2380 ↔ field_2381)
 * is deliberately NOT locked.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-connected-to-readonly-css';
  var FIELDS   = ['field_2197', 'field_2821'];
  var NS       = '.scwConnToRo';

  function sel(fn) { return FIELDS.map(fn).join(',\n'); }

  // ── 1. CSS: grid cells + form inputs ──────────────────────────────
  function injectCssOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Grid inline edit: value stays fully readable, editor never opens. */
      sel(function (f) { return 'td.' + f + '.cell-edit'; }) + ' {',
      '  pointer-events: none !important;',
      '  cursor: default !important;',
      '}',
      sel(function (f) {
        return 'td.' + f + '.cell-edit .cell-editable,\n' +
               'td.' + f + '.cell-edit .cell-edit-icon';
      }) + ' {',
      '  display: none !important;',
      '}',

      /* Knack edit/create forms: strip ALL input chrome so the connection
         reads as plain text (repo locked-field convention — no graying). */
      sel(function (f) { return '#kn-input-' + f; }) + ' { pointer-events: none !important; }',
      sel(function (f) {
        return '#kn-input-' + f + ' .chzn-container .chzn-single,\n' +
               '#kn-input-' + f + ' .chzn-container .chzn-choices,\n' +
               '#kn-input-' + f + ' select,\n' +
               '#kn-input-' + f + ' input';
      }) + ' {',
      '  background: transparent !important;',
      '  border-color: transparent !important;',
      '  box-shadow: none !important;',
      '  -webkit-appearance: none !important;',
      '  appearance: none !important;',
      '  color: #363636 !important;',
      '}',
      /* Hide the Chosen dropdown arrow + the multi-select remove "x". */
      sel(function (f) {
        return '#kn-input-' + f + ' .chzn-container .chzn-single div,\n' +
               '#kn-input-' + f + ' .chzn-container .search-choice-close';
      }) + ' {',
      '  display: none !important;',
      '}',

      /* Muted hint under the locked form input. */
      '.scw-conn-to-ro-hint {',
      '  font-size: 12px;',
      '  color: #6b7280;',
      '  margin-top: 2px;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── 2. Capture-phase blocker: belt-and-braces for the grid cells ──
  // pointer-events:none already stops clicks, but KTL / other features can
  // re-enable pointer events on descendants — block at capture so Knack's
  // delegated inline-edit handler can never run for these fields.
  function installCaptureBlockerOnce() {
    if (window.__scwConnToRoCapture) return;
    window.__scwConnToRoCapture = true;
    var tdSel = FIELDS.map(function (f) { return 'td.' + f + '.cell-edit'; }).join(', ');
    var kill = function (e) {
      var td = e.target && e.target.closest && e.target.closest(tdSel);
      if (!td) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      return false;
    };
    ['mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'keydown']
      .forEach(function (evt) { document.addEventListener(evt, kill, true); });
  }

  // ── 3. Form hint: tell the user where the field IS editable ───────
  function addFormHints() {
    for (var f = 0; f < FIELDS.length; f++) {
      var inputs = document.querySelectorAll('#kn-input-' + FIELDS[f]);
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (el.querySelector('.scw-conn-to-ro-hint')) continue;
        var hint = document.createElement('div');
        hint.className = 'scw-conn-to-ro-hint';
        hint.textContent = 'Set automatically from the parent device’s Connected Devices — edit it there.';
        el.appendChild(hint);
      }
    }
  }

  injectCssOnce();
  installCaptureBlockerOnce();

  $(document)
    .off('knack-view-render.any' + NS)
    .on('knack-view-render.any' + NS, function () {
      addFormHints();
    });
})();
