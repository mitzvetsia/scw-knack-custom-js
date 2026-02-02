(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwExceptionHeader';

  // SCW-ish dark blue (tweak if you want)
  const HEADER_BG = '#0b3a5a';

  function styleHeader(viewId) {
    const $view   = $('#' + viewId);
    const $header = $view.find('.view-header');

    if (!$header.length) return;

    // Style header
    $header.css({
      background: HEADER_BG,
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '4px'
    });

    // Title element
    const $title = $header.find('.kn-title');

    // Prevent double-icon injection
    if ($title.find('.scw-warning-icon').length === 0) {
      $title.prepend(
        '<span class="scw-warning-icon" style="margin-right:8px;">⚠️</span>'
      );
    }
  }

  // ======================
  // EVENT
  // ======================
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      if (!view || !VIEW_IDS.includes(view.key)) return;

      // If there ARE records, flag it visually
      if (data && typeof data.total_records === 'number' && data.total_records > 0) {
        styleHeader(view.key);
      }
    });
})();
