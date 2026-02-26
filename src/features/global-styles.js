/****************  Global Style Overrides  ***************/
(function () {
  'use strict';

  /* ── KTL hide/show button color palette ── */
  const KTL_DEFAULT_COLOR = '#295f91';

  /* Per-view colour overrides are now driven by the _hsvcolor= keyword
     in each view's description.  See extract-hsv-color.js.              */

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

    /* Pull section-header H2s tight against the ktlHideShowButton that follows */
    .kn-rich_text:has(+ .kn-view .ktlHideShowButton) h2 {
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
      width: 100%;
      font-weight: 600;
      font-size: 14px !important;
      color: #fff;
      background-color: ${KTL_DEFAULT_COLOR};
      border-radius: 0 !important;
      padding: 5px 0px 0px 8px !important;
    }

    /* Views containing KTL hide/show — branded wrapper */
    .kn-view:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
      margin-bottom: 2px !important;
      background-color: ${KTL_DEFAULT_COLOR};
      max-width: 100%;
      padding: 5px 5px 10px 5px !important;
      border-radius: 20px !important;
    }

    /* Per-view color overrides now applied dynamically by extract-hsv-color.js */

    /* Submit buttons — only inside KTL hide/show views */
    .kn-view:has(.ktlHideShowButton) input[type=submit],
    .kn-view:has(.ktlHideShowButton) .kn-submit button.kn-button.is-primary {
      font-size: 14px !important;
      width: 80% !important;
      display: block !important;
      margin-left: auto !important;
      margin-right: auto !important;
      background-color: rgba(237,131,38,.9) !important;
    }


    /* Menu buttons */
    .kn-menu div.control:not(.has-addons) a.kn-link.kn-button {
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
