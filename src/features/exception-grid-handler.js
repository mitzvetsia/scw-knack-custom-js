/**
 * Exception Grid Handler
 *
 * - 0 records  → hide entire view group
 * - ≥1 record → highlight header as warning
 */

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwExceptionGrid';

  const HEADER_BG = '#950606'; // dark red
  const ICON_HTML =
    '<span class="scw-warning-icon fa fa-exclamation-triangle" ' +
    'style="margin-right:8px;"></span>';

  // ======================
  // HELPERS
  // ======================
  function removeEntireBlock($view) {
    // Removes title + table + spacing
    const $group = $view.closest('.view-group');
    ($group.length ? $group : $view).remove();
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    return $rows.filter('.kn-tr-nodata').length === 0;
  }

  function styleWarningHeader(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    const $header = $view.find('.view-header');
    if ($header.length) {
      $header.css({
        background: HEADER_BG,
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '4px'
      });
    }

    // Inject icon into the actual clickable KTL button
    const $btn = $('#hideShow_' + viewId + '_button');
    if ($btn.length && !$btn.find('.scw-warning-icon').length) {
      $btn.prepend(ICON_HTML);
      return;
    }

    // Fallback: title element
    const $title = $view.find('.view-header .kn-title');
    if ($title.length && !$title.find('.scw-warning-icon').length) {
      $title.prepend(ICON_HTML);
    }
  }

  // ======================
  // MAIN HANDLER
  // ======================
  function handleView(view, data) {
    const viewId = view.key;
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // Preferred: Knack record count
    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) {
        removeEntireBlock($view);
      } else {
        styleWarningHeader(viewId);
      }
      return;
    }

    // Fallback: DOM inspection
    if (gridHasRealRows($view)) {
      styleWarningHeader(viewId);
    } else {
      removeEntireBlock($view);
    }
  }

  // ======================
  // EVENT
  // ======================
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      if (!view || !VIEW_IDS.includes(view.key)) return;
      handleView(view, data);
    });
})();
