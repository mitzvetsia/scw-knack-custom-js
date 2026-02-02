/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const PRIMARY_VIEW_ID = 'view_3364'; // exception grid
  const FOLLOW_VIEW_ID  = 'view_3359'; // the view below that needs radius tweak

  const EVENT_NS = '.scwExceptionGrid';
  const WARNING_BG = '#7a0f16'; // dark red
  const WARNING_FG = '#ffffff';
  const RADIUS = 20;            // px

  // ======================
  // CSS (ONCE)
  // ======================
  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = `
      /* PRIMARY view "card" (top corners only) */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active:has(.ktlHideShowButton[id^="hideShow_${PRIMARY_VIEW_ID}_"][id$="_button"]),
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
        margin-bottom: 2px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        overflow: hidden !important;
      }

      /* PRIMARY KTL button as the red bar */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_${PRIMARY_VIEW_ID}_"][id$="_button"],
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]{
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

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_${PRIMARY_VIEW_ID}_"][id$="_button"] *,
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] *{
        color: ${WARNING_FG} !important;
      }

      /* PRIMARY icon via CSS so KTL can't wipe it */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_${PRIMARY_VIEW_ID}_"][id$="_button"]::before,
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]::before{
        content: "⚠️";
        display: inline-block;
        margin-right: 12px;
        line-height: 1;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_${PRIMARY_VIEW_ID}_"][id$="_button"]:hover,
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]:hover{
        filter: brightness(1.06);
      }

      /* ======================
         FOLLOW view tweak (only when PRIMARY is visible/active)
         ====================== */
      #${FOLLOW_VIEW_ID}.scw-exception-follow-rounded {
        /* square off the TOP corners so it visually "connects" below the red header */
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
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
  function toggleFollowView(active) {
    const $follow = $('#' + FOLLOW_VIEW_ID);
    if (!$follow.length) return;
    $follow.toggleClass('scw-exception-follow-rounded', !!active);
  }

  function removeOnlyPrimaryView() {
    // IMPORTANT: remove ONLY the primary view, not .view-group (prevents nuking siblings)
    $('#' + PRIMARY_VIEW_ID).remove();
    toggleFollowView(false);
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    if ($rows.filter('.kn-tr-nodata').length) return false;
    return true;
  }

  function markPrimaryAsException() {
    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;

    $primary.addClass('scw-exception-grid-active');
    toggleFollowView(true);
  }

  function handlePrimary(view, data) {
    if (!view || view.key !== PRIMARY_VIEW_ID) return;

    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;

    // Preferred: Knack record count
    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeOnlyPrimaryView();
      else markPrimaryAsException();
      return;
    }

    // Fallback: DOM
    if (gridHasRealRows($primary)) markPrimaryAsException();
    else removeOnlyPrimaryView();
  }

  // If follow renders later, we still want the class applied if primary is active
  function syncFollowIfNeeded() {
    const primaryActive = $('#' + PRIMARY_VIEW_ID).hasClass('scw-exception-grid-active');
    toggleFollowView(primaryActive);
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      // Primary logic
      if (view && view.key === PRIMARY_VIEW_ID) {
        handlePrimary(view, data);
        return;
      }

      // If follow view renders after primary, ensure it picks up the class
      if (view && view.key === FOLLOW_VIEW_ID) {
        syncFollowIfNeeded();
      }
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
