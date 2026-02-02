/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364']; // add more view IDs as needed
  const EVENT_NS = '.scwExceptionGrid';

  // If you want this scoped to scenes, add scene IDs here; otherwise leave empty for global
  // Example: const SCENE_IDS = ['scene_1085'];
  const SCENE_IDS = []; // optional

  // Theme
  const WARNING_BG = '#7a0f16'; // dark red
  const WARNING_FG = '#ffffff';

  // ======================
  // CSS (ONCE)
  // ======================
  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const sceneScopes = (SCENE_IDS || []).map((s) => `#kn-${s}`).join(', ');
    const S = sceneScopes ? `${sceneScopes} ` : ''; // include trailing space when scoped

    const css = `
      /* When a view is flagged as an exception, style the KTL header button as a full-width bar */
      ${S}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]{
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        background-color: ${WARNING_BG} !important;
        color: ${WARNING_FG} !important;
        padding: 10px 14px !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
      }

      /* Ensure all nested text inherits white */
      ${S}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] *{
        color: ${WARNING_FG} !important;
      }

      /* Icon spacing */
      ${S}.scw-exception-grid-active .scw-exception-icon{
        display: inline-flex !important;
        align-items: center !important;
        margin-right: 10px !important;
        font-size: 1.05em !important;
        line-height: 1 !important;
      }

      /* Optional: slightly brighten on hover so it's clearly interactive */
      ${S}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]:hover{
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
    // Prefer removing the view-group wrapper (kills whitespace + column wrapper)
    const $group = $view.closest('.view-group');
    ($group.length ? $group : $view).remove();
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    // "No data" case
    if ($rows.filter('.kn-tr-nodata').length) return false;
    return true;
  }

  function markAsException(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // Add a class to the view so CSS can target within it
    $view.addClass('scw-exception-grid-active');

    // Add icon to the KTL button text (this is the clickable header)
    const $btn = $('#hideShow_' + viewId + '_button');
    if ($btn.length && !$btn.find('.scw-exception-icon').length) {
      $btn.prepend(
        '<span class="scw-exception-icon" aria-hidden="true">⚠️</span>'
      );
    }
  }

  function handleView(view, data) {
    const viewId = view.key;
    const $view = $('#' + viewId);
    if (!$view.length) return;

    // Preferred: use Knack-provided record count if present
    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) {
        removeEntireBlock($view);
      } else {
        markAsException(viewId);
      }
      return;
    }

    // Fallback: inspect DOM
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
