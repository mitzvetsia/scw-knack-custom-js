/**
 * Exception Grid Handler
 *
 * - 0 records  → hide entire view group (title + table + whitespace)
 * - ≥1 record → highlight header as WARNING (dark red background, white text, icon)
 *
 * Notes:
 * - Uses data.total_records when available
 * - Falls back to DOM check (kn-tr-nodata) when total_records is missing
 * - KTL-friendly: styles the hide/show button (#hideShow_<viewId>_button)
 */

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364']; // add more views as needed
  const EVENT_NS = '.scwExceptionGrid';

  // WARNING header style
  const WARNING_BG = '#7a0f16'; // dark red
  const WARNING_ICON_HTML =
    '<span class="scw-warning-icon fa fa-exclamation-triangle" ' +
    'style="margin-right:8px;"></span>';

  // ======================
  // HELPERS
  // ======================
  function removeEntireBlock($view) {
    // Removes title + table + spacing (preferred in Knack layouts)
    const $group = $view.closest('.view-group');
    ($group.length ? $group : $view).remove();
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    // If the "No data" row exists, treat as empty
    if ($rows.filter('.kn-tr-nodata').length) return false;
    return true;
  }

  function styleWarningHeader(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // KTL hide/show button is the visible header bar in your DOM
    const $btn = $('#hideShow_' + viewId + '_button');

    if ($btn.length) {
      $btn.css({
        background: WARNING_BG,
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '4px',
        display: 'inline-flex',
        alignItems: 'center'
        // Optional full-width bar:
        // width: '100%'
      });

      // Prevent duplicate icon on re-render
      if ($btn.find('.scw-warning-icon').length === 0) {
        $btn.prepend(WARNING_ICON_HTML);
      }

      return;
    }

    // Fallback (non-KTL header)
    const $title = $view.find('.view-header .kn-title');
    if ($title.length) {
      $title.css({
        background: WARNING_BG,
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '4px'
      });

      if ($title.find('.scw-warning-icon').length === 0) {
        $title.prepend(WARNING_ICON_HTML);
      }
    }
  }

  function handleView(view, data) {
    const viewId = view.key;
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // Preferred: Knack-provided record count
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
