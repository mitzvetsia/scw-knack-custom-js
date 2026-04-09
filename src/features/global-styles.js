/******************  Global Style Overrides  ***************/
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

    /* ─── Modern Accordion: view wrapper ─── */
    section.ktlBoxWithBorder {
      border-radius: 14px !important;
      overflow: hidden !important;
      margin: 8px 10px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
      transition: box-shadow 200ms ease;
    }
    section.ktlBoxWithBorder:hover {
      box-shadow: 0 2px 6px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.08);
    }

    /* ─── Modern Accordion: header button ─── */
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] {
      position: relative;
      display: flex !important;
      align-items: center;
      width: 100%;
      font-weight: 600;
      font-size: 14px !important;
      color: #fff;
      background-color: ${KTL_DEFAULT_COLOR};
      border-radius: 0 !important;
      padding: 10px 40px 10px 14px !important;
      border: 0 !important;
      box-sizing: border-box;
      transition: background-color 180ms ease, filter 180ms ease;
      cursor: pointer;
    }
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]:hover {
      filter: brightness(1.08);
    }

    /* ─── Modern Accordion: chevron arrow ─── */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"] {
      position: absolute;
      right: 14px;
      top: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.1em;
      height: 1.1em;
      transform-origin: 50% 50%;
      transition: transform 220ms ease;
    }
    /* Collapsed state (.ktlUp = content hidden) — chevron points right */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlUp {
      transform: translateY(-50%) rotate(-90deg);
    }
    /* Expanded state (.ktlDown = content visible) — chevron points down */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlDown {
      transform: translateY(-50%) rotate(0deg);
    }

    /* ─── Modern Accordion: branded view wrapper ─── */
    .kn-view:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
      margin-bottom: 2px !important;
      background-color: ${KTL_DEFAULT_COLOR};
      max-width: 100%;
      padding: 5px 5px 10px 5px !important;
      border-radius: 14px !important;
      transition: background-color 180ms ease;
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
      background-color: rgba(237,131,38, 1) !important;
      color: white !important;
      font-weight: 600 !important;
      padding: 10px !important;
      width: 33% !important;
    }
    .kn-menu .control:not(.has-addons) {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 50px;
      width: 100% !important;
    }

    /* Hide KTL bulk-ops controls on scene 1140 */
    #kn-scene_1140 .ktlAddonsDiv {
      display: none !important;
    }

    /* ─── Instructions callout ─── */
    .kn-instructions {
      position: relative;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 4px solid #3b82f6;
      border-radius: 6px;
      padding: 10px 14px 10px 36px;
      margin: 6px 0 2px;
      font-size: 13px;
      line-height: 1.45;
      color: #1e3a5f !important;
    }
    .kn-instructions::before {
      content: '\\2139';
      position: absolute;
      left: 11px;
      top: 9px;
      font-size: 15px;
      font-weight: 700;
      color: #3b82f6;
      line-height: 1;
    }
    .kn-instructions p {
      margin: 0 0 4px;
    }
    .kn-instructions p:last-child {
      margin-bottom: 0;
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
