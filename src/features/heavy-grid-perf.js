/*************  Heavy-grid rendering perf — CSS containment + content-visibility  *************/
(function () {
  'use strict';

  // Views known to render hundreds of rows on scene load.  group-collapse
  // hides closed L1 groups via display:none (zero layout cost), but the
  // initial paint and any tall open group still go through full layout.
  // CSS containment isolates each grid's layout work from the rest of the
  // page; content-visibility lets the browser skip layout/paint for rows
  // that aren't in the viewport.
  var VIEWS = ['view_3586', 'view_3610'];

  var STYLE_ID = 'scw-heavy-grid-perf-css';
  if (document.getElementById(STYLE_ID)) return;

  var rules = VIEWS.map(function (vid) {
    return [
      '#' + vid + ' .kn-table-wrapper,',
      '#' + vid + ' .kn-table {',
      '  contain: layout style;',
      '}',
      '#' + vid + ' tbody tr:not(.kn-table-group):not(.kn-table-totals) {',
      '  content-visibility: auto;',
      '  contain-intrinsic-size: auto 36px;',
      '}'
    ].join('\n');
  }).join('\n\n');

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = rules;
  document.head.appendChild(style);
})();
/*************  Heavy-grid rendering perf  *************/
