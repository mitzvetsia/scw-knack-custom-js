/*************  Global Style Overrides  **********************/
(function () {
  'use strict';

  const id = 'scw-global-styles-css';
  if (document.getElementById(id)) return;

  const css = `
    /* H2 headings */
    h2 {
      font-weight: 800 !important;
      color: #07467c !important;
      font-size: 24px !important;
      margin-bottom: 20px !important
    }

    /* KTL hide/show (shrink) button */
    a.ktlShrinkLink {
      font-size: 14px !important;
    }

    /* KTL view wrapper — rounded corners, clip button to shape */
    section.ktlBoxWithBorder {
      border-radius: 20px !important;
      overflow: hidden !important;
      margin-bottom: 1px !important;
      border: none !important;
      padding: 0 !important;
    }

    /* KTL hide/show button — full-width bar with branding */
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] {
      width: 800px;
      font-weight: 600;
      font-size: 14px !important;
      color: #fff;
      background-color: #295f91;
      border-radius: 0 !important;
      Margin-bottom: -20px !important
    }

    /* Views containing KTL hide/show — branded wrapper */
    .kn-view:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
      margin-bottom: 1px !important;
      background-color: #295f91;
      max-width: 100%;
      border-radius: 20px !important;
    }

    /* Menu buttons */
    div.control:not(.has-addons) a.kn-link.kn-link-page.kn-button {
      background-color: rgba(237,131,38,.9);
      color: white;
      font-weight: 600;
      padding: 10px;
      width: 20% !important;
      display: flex;
      justify-content: flex-end;
    }


  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
