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
    }

    /* KTL hide/show button — no own radius (section handles it) */
    .ktlHideShowButton {
      font-size: 14px !important;
      border-radius: 0 !important;
    }

    /* Menu buttons */
    div.control:not(.has-addons) a.kn-link.kn-link-page.kn-button {
      background-color: rgba(237,131,38,.9);
      color: white;
      font-weight: 600;
      padding: 10px;
      width: 20% !important;
    }
    .control:not(.has-addons) {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 50px;
      width: 100% !important;
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
