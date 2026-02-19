/*************  Global Style Overrides  *******************/
(function () {
  'use strict';

  const id = 'scw-global-styles-css';
  if (document.getElementById(id)) return;

  const css = `

    /* H1 headings */
    h1:not(.kn-title) {
      color: #07467c;
      font-weight: 800;
      margin-bottom: 0.5em;
      margin-top: 55px;
      font-size: 28px !important;
      opacity: .8;
      overflow: visible !important;
    }

    /* H2 headings */
    h2:not(.kn-title) {
      font-weight: 800 !important;
      color: #07467c !important;
      font-size: 20px !important;
      margin-top: 30px !important;
    }

    /* Reset H2 overrides inside detail-view values (Client, Project, Site etc.) */
    .kn-detail-body h2 {
      font-weight: normal !important;
      color: inherit !important;
      font-size: inherit !important;
      margin-top: 0 !important;
    }

    /* Prevent scrollbar from h2 negative margin */
    .kn-detail-body:has(h2) {
      overflow: hidden !important;
    }

    /* Pull rich-text heading closer to following hide/show section */
    .kn-rich_text:has(+ .kn-view .ktlHideShowSection) {
      margin-bottom: -15px !important;
    }

    /* KTL hide/show (shrink) button */
    a.ktlShrinkLink {
      font-size: 14px !important;
    }

    /* KTL view wrapper — rounded corners, clip button to shape */
    section.ktlBoxWithBorder {
      border-radius: 20px !important;
      overflow: hidden !important;
      margin: 10px !important;
    }

    /* KTL hide/show button — full-width bar with branding */
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] {
      width: 800px;
      font-weight: 600;
      font-size: 14px !important;
      color: #fff;
      background-color: #295f91;
      border-radius: 0 !important;
      padding: 5px 0px 0px 8px !important;
    }

    /* Views containing KTL hide/show — branded wrapper */
    .kn-view:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
      margin-bottom: 2px !important;
      background-color: #295f91;
      max-width: 100%;
      padding: 5px 5px 10px 5px !important;
      border-radius: 20px !important;
    }

    /* Menu buttons */
    .kn-menu div.control:not(.has-addons) a.kn-link.kn-link-page.kn-button {
      background-color: rgba(237,131,38, 1);
      color: white;
      font-weight: 600;
      padding: 10px;
      width: 33% !important;
    }
    .kn-menu .control:not(.has-addons) {
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
