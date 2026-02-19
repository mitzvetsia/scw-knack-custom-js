/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  const VIEW_PAIRS = [
    { primary: 'view_3364', follow: 'view_3359' },
    { primary: 'view_3466', follow: 'view_3467' },
  ];

  const EVENT_NS = '.scwExceptionGrid';
  const WARNING_BG = '#7a0f16';
  const WARNING_FG = '#ffffff';
  const RADIUS = 20;

  /* ── look-ups keyed by view id ── */
  const pairByPrimary = {};
  const pairByFollow  = {};
  VIEW_PAIRS.forEach(function (p) {
    pairByPrimary[p.primary] = p;
    pairByFollow[p.follow]   = p;
  });

  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = VIEW_PAIRS.map(function (p) {
      return `
      #${p.primary}.scw-exception-grid-active:has(.ktlHideShowButton){
        margin-bottom: 0px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        overflow: hidden !important;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton{
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
	font-size: 12px !important;
	font-weight: 400 !important;

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

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton *{
        color: ${WARNING_FG} !important;
      }

      /* LEFT icon – centered */
      #${p.primary}.scw-exception-grid-active .ktlHideShowButton::before{
        content: "\u26A0\uFE0F";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        transform: translateY(-.02em);
        margin-right: 12px;
      }

      /* RIGHT icon – positioned */
      #${p.primary}.scw-exception-grid-active .ktlHideShowButton::after{
        content: "\u26A0\uFE0F";
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

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton .ktlArrow{
        position: absolute;
        right: 12px;
        top: 0;
        bottom: 0;
        margin: auto 0;
        height: 1em;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton:hover{
        filter: brightness(1.06);
      }

      #${p.follow}.scw-exception-follow-connected{
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }`;
    }).join('\n');

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function removeOnlyPrimaryView(pair) {
    $('#' + pair.primary).remove();
    syncFollowView(pair, false);
  }

  function syncFollowView(pair, active) {
    const $follow = $('#' + pair.follow);
    if (!$follow.length) return;
    $follow.toggleClass('scw-exception-follow-connected', !!active);
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    return !$rows.filter('.kn-tr-nodata').length;
  }

  function markPrimaryActive(pair) {
    const $primary = $('#' + pair.primary);
    if (!$primary.length) return;
    $primary.addClass('scw-exception-grid-active');
    syncFollowView(pair, true);
  }

  function handlePrimary(view, data) {
    if (!view) return;
    const pair = pairByPrimary[view.key];
    if (!pair) return;

    const $primary = $('#' + pair.primary);
    if (!$primary.length) return;

    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeOnlyPrimaryView(pair);
      else markPrimaryActive(pair);
      return;
    }

    if (gridHasRealRows($primary)) markPrimaryActive(pair);
    else removeOnlyPrimaryView(pair);
  }

  function syncIfFollowRendersLater(view) {
    if (!view) return;
    const pair = pairByFollow[view.key];
    if (!pair) return;
    const active = $('#' + pair.primary).hasClass('scw-exception-grid-active');
    syncFollowView(pair, active);
  }

  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      handlePrimary(view, data);
      syncIfFollowRendersLater(view);
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
