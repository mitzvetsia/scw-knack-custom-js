// ============================================================
// Force specific fields to always display as negative numbers
// Targets: field_2601, field_2290
// ============================================================
(function () {
  var FIELDS = ['field_2601', 'field_2290'];

  function forceNegative() {
    FIELDS.forEach(function (fieldClass) {
      // Table cells
      $('td.' + fieldClass).each(function () {
        var $cell = $(this);
        if ($cell.data('scwNeg')) return;
        var raw = $cell.text().replace(/[^0-9.\-]/g, '');
        var num = parseFloat(raw);
        if (!isFinite(num) || num === 0) return;
        var abs = Math.abs(num);
        var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        $cell.html('<span class="scw-force-neg">-$' + formatted + '</span>');
        $cell.data('scwNeg', true);
      });

      // Detail views
      $('.kn-detail.' + fieldClass + ' .kn-detail-body').each(function () {
        var $el = $(this);
        if ($el.data('scwNeg')) return;
        var raw = $el.text().replace(/[^0-9.\-]/g, '');
        var num = parseFloat(raw);
        if (!isFinite(num) || num === 0) return;
        var abs = Math.abs(num);
        var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        $el.html('<span class="scw-force-neg">-$' + formatted + '</span>');
        $el.data('scwNeg', true);
      });
    });
  }

  $(document).on('knack-scene-render.any', forceNegative);
  $(document).on('knack-view-render.any', forceNegative);
})();
