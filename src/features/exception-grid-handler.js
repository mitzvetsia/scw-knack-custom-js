/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const PRIMARY_VIEW_ID = 'view_3364';
  const FOLLOW_VIEW_ID  = 'view_3359';

  const EVENT_NS = '.scwExceptionGrid';
  const WARNING_BG = '#7a0f16';
  const WARNING_FG = '#ffffff';
  const RADIUS = 20;

  // ======================
  // CSS (ONCE)
  // ======================
  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = `
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active:has(.ktlHideShowButton){
        margin-bottom: 2px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        overflow: hidden !important;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton{
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;

        width: 100% !important;
        background-color: ${WARNING_BG} !important;
        color: ${WARNING_FG} !important;

        padding: 12px 56px 12px 18px !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: 0 !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton *{
        color: ${WARNING_FG} !important;
      }

      /* LEFT icon – centered (FIX) */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton::before{
        content: "⚠️";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        transform: translateY(-.02em);
        margin-right: 12px;
      }

      /* RIGHT icon – centered + positioned (FIX) */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton::after{
        content: "⚠️";
        position: absolute;
        right: 32px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        pointer-events: none;
      }

      /* Arrow pinned right */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton .ktlArrow{
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%) rotate(-90deg);
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton:hover{
        filter: brightness(1.06);
      }

      /* FOLLOW view continuity */
      #${FOLLOW_VIEW_ID}.scw-exception-follow-connected{
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
  function removeOnlyPrimaryView() {
    $('#' + PRIMARY_VIEW_ID).remove();
    syncFollowView(false);
  }

  function syncFollowView(active) {
    const $follow = $('#' + FOLLOW_VIEW_ID);
    if (!$follow.length) return;
    $follow.toggleClass('scw-exception-follow-connected', !!active);
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    return !$rows.filter('.kn-tr-nodata').length;
  }

  function markPrimaryActive() {
    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;
    $primary.addClass('scw-exception-grid-active');
    syncFollowView(true);
  }

  function handlePrimary(view, data) {
    if (!view || view.key !== PRIMARY_VIEW_ID) return;

    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;

    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeOnlyPrimaryView();
      else markPrimaryActive();
      return;
    }

    if (gridHasRealRows($primary)) markPrimaryActive();
    else removeOnlyPrimaryView();
  }

  function syncIfFollowRendersLater(view) {
    if (!view || view.key !== FOLLOW_VIEW_ID) return;
    const active = $('#' + PRIMARY_VIEW_ID).hasClass('scw-exception-grid-active');
    syncFollowView(active);
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      handlePrimary(view, data);
      syncIfFollowRendersLater(view);
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
