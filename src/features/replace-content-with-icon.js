/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/

// Replace *whatever* is rendered in field_1946 cells with an icon
// Runs on multiple grid views

(function () {
  const VIEW_IDS = [
    "view_3313",
    "view_3332",
    "view_3384",
    "view_3356"


   // ← add the second view id here
  ];

  const FIELD_KEY = "field_1946";

  const ICON_HTML =
    '<i class="fa fa-solid fa-sort" aria-hidden="true" title="Changing Location" style="font-size:30px; vertical-align:middle;"></i>';

  // Inject CSS once (covers all target views)
  function injectCssOnce() {
    const id = "scw-field1946-icon-css";
    if (document.getElementById(id)) return;

    const selectors = VIEW_IDS
      .map(v => `#${v} td.${FIELD_KEY}`)
      .join(", ");

    const css = `
      ${selectors} {
        display: table-cell !important;
        text-align: center;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  VIEW_IDS.forEach((VIEW_ID) => {
    SCW.onViewRender(VIEW_ID, function () {
      injectCssOnce();

      const $view = $("#" + VIEW_ID);
      if (!$view.length) return;

      $view.find(`table.kn-table tbody td.${FIELD_KEY}`).each(function () {
        const $cell = $(this);

        // idempotent
        if ($cell.data("scwReplacedWithIcon")) return;

        $cell.empty().append(ICON_HTML);
        $cell.data("scwReplacedWithIcon", true);
      });
    }, 'replace-content-with-icon');
  });
})();

/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/

