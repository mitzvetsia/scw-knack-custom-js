/*************  Global Style Overrides  **************************/
(function () {
  'use strict';

  const id = 'scw-global-styles-css';
  if (document.getElementById(id)) return;

  const css = `
    /* H2 headings */
    h2 {
      font-weight: 800;
      color: #07467c;
      font-size: 24px;
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
