/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
(function () {
  // ============================================================
  // SCW / Knack: Row-based cell locks (multi-view, multi-rule)
  // - Locks target cells on specific rows based on a detect field value
  // - Prevents inline edit by killing events in CAPTURE phase
  // - Adds per-rule message tooltip + optional “Locked” badge
  // - Avoids rewriting cell HTML (safe for REL/connection fields like field_1957)
  // ============================================================

  const EVENT_NS = ".scwRowLocks";

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEWS = [
    {
      viewId: "view_3332",
      rules: [
        {
          detectFieldKey: "field_2230",      // qty limit boolean
          when: "yes",
          lockFieldKeys: ["field_1964"],     // lock qty
          message: "Qty locked (must be 1)"
        },
        {
          detectFieldKey: "field_2231",      // <-- was field_2232; field_2231 exists in your DOM
          when: "no",
          lockFieldKeys: ["field_1957"],     // lock map connections field
          message: "This field is locked until map connections = Yes"
        }
      ]
    },
    {
      viewId: "view_3456",
      rules: [
        {
          detectFieldKey: "field_2230",
          when: "yes",
          lockFieldKeys: ["field_1964"],
          message: "Qty locked (must be 1)"
        },
        {
          detectFieldKey: "field_2231",
          when: "no",
          lockFieldKeys: ["field_1957"],
          message: "This field is locked until map connections = Yes"
        }
      ]
    }
  ];

  // ============================================================
  // INTERNALS
  // ============================================================
  const LOCK_ATTR = "data-scw-locked";
  const LOCK_MSG_ATTR = "data-scw-locked-msg";
  const LOCK_CLASS = "scw-cell-locked";
  const ROW_CLASS = "scw-row-has-locks";

  function normText(s) {
    return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function readCellValue($cell) {
    return normText($cell.text());
  }

  function matchesWhen(cellVal, when) {
    if (typeof when === "function") return !!when(cellVal);
    if (when === true) return cellVal === "yes" || cellVal === "true" || cellVal === "1";
    if (when === false) return cellVal === "no" || cellVal === "false" || cellVal === "0" || cellVal === "";
    return cellVal === normText(String(when));
  }

  // Safer lock: do NOT replace the cell HTML (important for REL/connection fields)
  function lockTd($td, msg) {
    if (!$td || !$td.length) return;
    if ($td.attr(LOCK_ATTR) === "1") return;

    const m = (msg || "N/A").trim();

    $td
      .attr(LOCK_ATTR, "1")
      .attr(LOCK_MSG_ATTR, m)
      .addClass(LOCK_CLASS)
      .attr("title", m);

    // Remove common Knack/KTL inline-edit hooks
    $td.removeClass("cell-edit ktlInlineEditableCellsStyle");
    $td.find(".cell-edit, .ktlInlineEditableCellsStyle").removeClass("cell-edit ktlInlineEditableCellsStyle");

    // Belt-and-suspenders: if KTL uses pointer events, kill them in locked cells
    // (We also have capture-blocker below.)
  }

  function applyLocksForView(viewCfg) {
    const { viewId, rules } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    const $tbody = $view.find("table.kn-table-table tbody");
    if (!$tbody.length) return;

    $tbody.find("tr").each(function () {
      const $tr = $(this);

      // Skip group/header rows
      if ($tr.hasClass("kn-table-group") || $tr.hasClass("kn-table-group-container")) return;

      let rowLocked = false;

      rules.forEach((rule) => {
        const $detect = $tr.find(`td.${rule.detectFieldKey}`);
        if (!$detect.length) return;

        const cellVal = readCellValue($detect);
        if (!matchesWhen(cellVal, rule.when)) return;

        (rule.lockFieldKeys || []).forEach((fk) => {
          const $td = $tr.find(`td.${fk}`);
          if ($td.length) {
            lockTd($td, rule.message);
            rowLocked = true;
          }
        });
      });

      if (rowLocked) $tr.addClass(ROW_CLASS);
    });
  }

  function applyWithRetries(viewCfg, tries = 12) {
    let i = 0;
    (function tick() {
      i++;
      applyLocksForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Capture-phase event killer: blocks Knack’s delegated inline-edit before it runs
  function installCaptureBlockerOnce() {
    if (window.__scwRowLocksCaptureInstalled) return;
    window.__scwRowLocksCaptureInstalled = true;

    const kill = (e) => {
      const td = e.target.closest && e.target.closest(`td[${LOCK_ATTR}="1"]`);
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return false;
    };

    ["mousedown", "mouseup", "click", "dblclick", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // MutationObserver per view: if KTL/Knack re-renders tbody, re-apply locks
  function installObserver(viewCfg) {
    const { viewId } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    if ($view.data("scwRowLocksObserver")) return;
    $view.data("scwRowLocksObserver", true);

    const el = $view.find("table.kn-table-table tbody").get(0);
    if (!el) return;

    const obs = new MutationObserver(() => applyLocksForView(viewCfg));
    obs.observe(el, { childList: true, subtree: true });
  }

  function bindTriggers(viewCfg) {
    const { viewId, rules } = viewCfg;

    const triggers = new Set();
    rules.forEach((r) => (r.triggerFieldKeys || []).forEach((k) => triggers.add(k)));
    if (triggers.size === 0) triggers.add("*");

    $(document)
      .off(`click${EVENT_NS}`, `#${viewId} td`)
      .on(`click${EVENT_NS}`, `#${viewId} td`, function () {
        const $td = $(this);
        const cls = ($td.attr("class") || "").split(/\s+/);

        const triggered = triggers.has("*") || cls.some((c) => triggers.has(c));
        if (!triggered) return;

        setTimeout(() => applyLocksForView(viewCfg), 50);
        setTimeout(() => applyLocksForView(viewCfg), 300);
      });
  }

  function injectLockCssOnce() {
    const id = "scw-row-locks-css";
    if (document.getElementById(id)) return;

    const css = `
      /* Locked look + no interaction */
      td.${LOCK_CLASS} {
        position: relative;
        cursor: not-allowed !important;
      }
      td.${LOCK_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Hide any KTL inline-edit hover affordance inside locked cells */
      td.${LOCK_CLASS} .ktlInlineEditableCellsStyle,
      td.${LOCK_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* Optional: add a small badge */
      td.${LOCK_CLASS}::after{
        content: "N/A";
        position: absolute;
        top: 2px;
        right: 4px;
        font-size: 10px;
        opacity: .7;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,.06);
      }

      td.scw-cell-locked {
        background-color: slategray;
      }

      /* Hide only the Knack-rendered value */
      td.field_1964.scw-cell-locked span[class^="col-"] {
         visibility: hidden;
      }


      /* Tooltip bubble using per-cell message */
      td.${LOCK_CLASS}:hover::before{
        content: attr(${LOCK_MSG_ATTR});
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 6px;
        max-width: 260px;
        white-space: normal;
        font-size: 12px;
        line-height: 1.2;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
        background: #fff;
        color: #111;
        z-index: 999999;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // INIT
  // ============================================================
  injectLockCssOnce();
  installCaptureBlockerOnce();

  VIEWS.forEach((viewCfg) => {
    const viewId = viewCfg.viewId;

    $(document)
      .off(`knack-view-render.${viewId}${EVENT_NS}`)
      .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
        bindTriggers(viewCfg);
      });
  });
})();

/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
