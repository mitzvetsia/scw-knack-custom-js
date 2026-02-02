/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwExceptionGrid';

  const WARNING_BG = '#7a0f16'; // dark red
  const WARNING_FG = '#ffffff';

  // ======================
  // CSS (ONCE)
  // ======================
  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = `
      /* Card background (your working pattern) */
      .kn-view.scw-exception-grid-active:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
        margin-bottom: 2px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;
        border-radius: 20px !important;
        overflow: hidden !important;
      }

      /* Make the KTL button itself the red pill/bar */
      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]{
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;

        width: 100% !important;
        background-color: ${WARNING_BG} !important;
        color: ${WARNING_FG} !important;

        padding: 12px 18px !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
      }

      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] *{
        color: ${WARNING_FG} !important;
      }

      /* ✅ Icon injected via CSS so KTL can’t wipe it */
      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]::before{
        content: "⚠️";
        display: inline-block;
        margin-right: 12px;
        line-height: 1;
      }

      .kn-view.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]:hover{
        filter: brightness(1.06);
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
    if ($view.length) $view.addClass('scw-exception-grid-active');
  }

  function handleView(view, data) {
    const viewId = view.key;
    const $view = $('#' + viewId);
    if (!$view.length) return;

    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeEntireBlock($view);
      else markAsException(viewId);
      return;
    }

    // Fallback DOM logic
    if (gridHasRealRows($view)) markAsException(viewId);
    else removeEntireBlock($view);
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
