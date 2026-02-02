/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364']; // add more view IDs as needed
  const EVENT_NS = '.scwExceptionGrid';

  // Theme
  const WARNING_BG = '#7a0f16'; // dark red
  const WARNING_FG = '#ffffff';

  // ======================
  // CSS (ONCE)
  // ======================
  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = `
      /* === Card/background wrapper (your exact working pattern, but scoped to active exception views) === */
      .kn-view.scw-exception-grid-active:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
        margin-bottom: 2px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;
        border-radius: 20px !important;
        overflow: hidden !important;  /* helps the rounded corners read correctly */
      }

      /* Optional but often necessary so the background is actually visible around inner content */
      .kn-view.scw-exception-grid-active:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) > * {
        border-radius: inherit;
      }

      /* === KTL button/header bar === */
      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]{
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        background-color: rgba(0,0,0,0.18) !important; /* subtle contrast on top of red card */
        color: ${WARNING_FG} !important;
        padding: 10px 14px !important;
        box-sizing: border-box !important;
      }

      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] *{
        color: ${WARNING_FG} !important;
      }

      .kn-view.scw-exception-grid-active .scw-exception-icon{
        display: inline-flex !important;
        align-items: center !important;
        margin-right: 10px !important;
        line-height: 1 !important;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // HELPERS
  // ======================
  function removeEntireBlock($view) {
    const $group = $view.closest('.view-group');
    ($group.length ? $group : $view).remove();
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    if ($rows.filter('.kn-tr-nodata').length) return false;
    return true;
  }

  function markAsException(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    $view.addClass('scw-exception-grid-active');

    const $btn = $('#hideShow_' + viewId + '_button');
    if ($btn.length && !$btn.find('.scw-exception-icon').length) {
      $btn.prepend('<span class="scw-exception-icon" aria-hidden="true">⚠️</span>');
    }
  }

  function handleView(view, data) {
    const viewId = view.key;
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // Preferred: count from Knack
    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) {
        removeEntireBlock($view);
      } else {
        markAsException(viewId);
      }
      return;
    }

    // Fallback: DOM
    if (gridHasRealRows($view)) {
      markAsException(viewId);
    } else {
      removeEntireBlock($view);
    }
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      if (!view || !VIEW_IDS.includes(view.key)) return;
      handleView(view, data);
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
