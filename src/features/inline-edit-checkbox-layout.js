// ============================================================
// Inline-edit checkbox layout improvements
// ============================================================
//
// 1. Fix text indentation: when a checkbox label wraps to multiple
//    lines, subsequent lines align with the start of the text
//    (not under the checkbox itself).
//
// 2. Multi-column: when a checkbox list has more than 20 items
//    the list switches to a two-column grid so it fits on screen.
//    A scrollable max-height is also applied for very long lists.
//
(function () {
  'use strict';

  var STYLE_ID = 'scw-inline-checkbox-layout-css';
  var MULTI_COL_CLASS = 'scw-checkbox-multi-col';
  var ITEM_THRESHOLD = 20;

  // ---- inject CSS (once) ----
  if (!document.getElementById(STYLE_ID)) {
    var css = [
      // --- Fix label indentation ---
      // Make the label a flex row so checkbox stays left and text wraps within its own lane.
      '.kn-popover .conn_inputs label.option.checkbox {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  gap: 4px;',
      '  line-height: 1.4;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox input[type="checkbox"] {',
      '  flex-shrink: 0;',
      '  margin-top: 3px;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox span {',
      '  flex: 1;',
      '  min-width: 0;',
      '}',

      // --- Multi-column grid (applied via JS class) ---
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  display: grid;',
      '  grid-template-columns: 1fr 1fr;',
      '  gap: 2px 20px;',
      '}',
      // Widen the popover so two columns have room
      '.drop.kn-popover:has(.' + MULTI_COL_CLASS + ') {',
      '  max-width: 90vw;',
      '  width: max-content;',
      '}',
      '.drop.kn-popover:has(.' + MULTI_COL_CLASS + ') .drop-content {',
      '  max-width: 90vw;',
      '}',
      // Scrollable container for very long lists
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  max-height: 70vh;',
      '  overflow-y: auto;',
      '}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- observe popover checkbox lists and apply multi-column class ----
  function processPopover(popover) {
    var lists = popover.querySelectorAll('.conn_inputs');
    for (var i = 0; i < lists.length; i++) {
      var items = lists[i].querySelectorAll(':scope > .control');
      if (items.length > ITEM_THRESHOLD) {
        lists[i].classList.add(MULTI_COL_CLASS);
      } else {
        lists[i].classList.remove(MULTI_COL_CLASS);
      }
    }
  }

  // Use MutationObserver to catch popovers as they open
  var observer = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var mutation = mutations[m];

      // Check for class changes (drop-open being added)
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        var el = mutation.target;
        if (el.classList.contains('kn-popover') && el.classList.contains('drop-open')) {
          processPopover(el);
        }
      }

      // Check for newly added popover nodes
      if (mutation.type === 'childList') {
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (node.nodeType === 1) {
            if (node.classList.contains('kn-popover')) {
              processPopover(node);
            }
            var nested = node.querySelectorAll
              ? node.querySelectorAll('.kn-popover')
              : [];
            for (var k = 0; k < nested.length; k++) {
              processPopover(nested[k]);
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
})();
