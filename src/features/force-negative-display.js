// ============================================================
// Force specific fields to always display as negative numbers
// Targets: field_2301, field_2290
// ============================================================
(function () {
  var FIELDS = ['field_2301', 'field_2290','field_2267','field_2303','field_2261'];

  function processCell($el) {
    if ($el.data('scwNeg')) return;
    var raw = $el.text().replace(/[^0-9.\-]/g, '');
    var num = parseFloat(raw);
    if (!isFinite(num) || num === 0) return;
    var abs = Math.abs(num);
    var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $el.html('<span class="scw-force-neg">-$' + formatted + '</span>');
    $el.data('scwNeg', true);
  }

  function forceNegative() {
    FIELDS.forEach(function (fieldClass) {
      // Table cells
      $('td.' + fieldClass).each(function () { processCell($(this)); });
      // Detail views
      $('.kn-detail.' + fieldClass + ' .kn-detail-body').each(function () { processCell($(this)); });
    });
  }

  $(document).on('knack-scene-render.any', forceNegative);
  $(document).on('knack-view-render.any', forceNegative);
  $(document).on('knack-records-render.any', forceNegative);
})();
