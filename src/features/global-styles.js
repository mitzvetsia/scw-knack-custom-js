/*************  Global Style Overrides  **************************/
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
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
