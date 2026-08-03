/***************************** CONNECTED TO (field_2197) READ-ONLY LOCKDOWN *****************************/
/*
 * Known Issue #12 step 1: Connected To (field_2197, the cam/reader → NVR/switch
 * back-pointer) is DERIVED + READ-ONLY app-wide. The single editable side is
 * the parent's Connected Devices picker (field_1957); the mirror-connection-sync
 * cascade is the ONLY writer of field_2197.
 *
 * The custom surfaces (worksheet-v2 cards/bulk, v1 device-worksheet) render it
 * read-only via their own configs. This module locks the Knack-NATIVE surfaces:
 *
 *   1. Grid inline edit — any table cell `td.field_2197.cell-edit` on any view.
 *      CSS pointer-events kill + a capture-phase event blocker so Knack's
 *      delegated inline-edit handler never fires.
 *   2. Knack edit/create forms — `#kn-input-field_2197` (Chosen connection
 *      dropdown) is locked per the repo locked-field convention: fully
 *      readable, no graying, all input chrome stripped so it reads as plain
 *      text, plus a muted hint pointing at the real edit surface.
 *
 * Scope: SOW Line Item pair only. The survey pair (field_2380 ↔ field_2381)
 * is deliberately NOT locked in this pass.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-connected-to-readonly-css';
  var FIELD    = 'field_2197';
  var NS       = '.scwConnToRo';

  // ── 1. CSS: grid cells + form inputs ──────────────────────────────
  function injectCssOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Grid inline edit: value stays fully readable, editor never opens. */
      'td.' + FIELD + '.cell-edit {',
      '  pointer-events: none !important;',
      '  cursor: default !important;',
      '}',
      'td.' + FIELD + '.cell-edit .cell-editable,',
      'td.' + FIELD + '.cell-edit .cell-edit-icon {',
      '  display: none !important;',
      '}',

      /* Knack edit/create forms: strip ALL input chrome so the connection',
         reads as plain text (repo locked-field convention — no graying). */
      '#kn-input-' + FIELD + ' { pointer-events: none !important; }',
      '#kn-input-' + FIELD + ' .chzn-container .chzn-single,',
      '#kn-input-' + FIELD + ' .chzn-container .chzn-choices,',
      '#kn-input-' + FIELD + ' select,',
      '#kn-input-' + FIELD + ' input {',
      '  background: transparent !important;',
      '  border-color: transparent !important;',
      '  box-shadow: none !important;',
      '  -webkit-appearance: none !important;',
      '  appearance: none !important;',
      '  color: #363636 !important;',
      '}',
      /* Hide the Chosen dropdown arrow + the multi-select remove "x". */
      '#kn-input-' + FIELD + ' .chzn-container .chzn-single div,',
      '#kn-input-' + FIELD + ' .chzn-container .search-choice-close {',
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
  // delegated inline-edit handler can never run for this field.
  function installCaptureBlockerOnce() {
    if (window.__scwConnToRoCapture) return;
    window.__scwConnToRoCapture = true;
    var kill = function (e) {
      var td = e.target && e.target.closest &&
               e.target.closest('td.' + FIELD + '.cell-edit');
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
    var inputs = document.querySelectorAll('#kn-input-' + FIELD);
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.querySelector('.scw-conn-to-ro-hint')) continue;
      var hint = document.createElement('div');
      hint.className = 'scw-conn-to-ro-hint';
      hint.textContent = 'Set automatically from the parent device’s Connected Devices — edit it there.';
      el.appendChild(hint);
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
