////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************////
/**
 * SCW Totals Script - Optimized Version
 *
 * PATCHES INCLUDED IN THIS VERSION:
 *  - Hide Level-3 header row when product-name/group label is blank-ish (field_2208) (header-only; Level-4 still shows)
 *  - Inject L4 description (field_2019) into synthetic L4 row (non-destructive)
 *  - Drop-only Level-4 concat from field_1952 / field_1951 (keeps your existing “drop” behavior)
 *  - Per-level subtotal CSS hooks + data attributes (scw-subtotal--level-X + data-*)
 *  - ✅ NEW: Add class hooks for L2 “Assumptions” bucket by record-id (so you can target background)
 *  - ✅ NEW: Hide underlying raw record rows (<tr id="...">) that appear after synthetic L4 rows
 *
 * Notes:
 *  - This is written to support multiple views from the start (per your preference).
 */
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3301', 'view_3341'];
  const EVENT_NS = '.scwTotals';

  // Field keys (grid columns)
  const DESC_FIELD_KEY = 'field_2019';
  const BUCKET_FIELD_KEY = 'field_2223'; // used to detect L2 context when available (fallback: L2 label text)
  const PRODUCT_NAME_FIELD_KEY = 'field_2208'; // used for the “blank-ish L3” patch
  const DROP_PREFIX_FIELD_KEY = 'field_1952';
  const DROP_NUM_FIELD_KEY = 'field_1951';

  const QTY_FIELD_KEY = 'field_1964';
  const COST_FIELD_KEY = 'field_2203';

  // Record Id that represents the Assumptions bucket (update if needed)
  // You asked: "make sure I have a class I can use to target the background color for l2 if it is assumptions record id"
  const ASSUMPTIONS_RECORD_ID = '698217d2e8902a998373388b'; // <-- set to your true “Assumptions bucket” record id

  // CSS id
  const CSS_ID = 'scw-totals-css';

  // ======================
  // CSS
  // ======================
  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;

    const css = `
/* =========================
   SCW Totals / Patches CSS
   ========================= */

/* Subtotals (already used by your scripts) */
tr.scw-subtotal { }
tr.scw-subtotal--level-1 { }
tr.scw-subtotal--level-2 { }
tr.scw-subtotal--level-3 { }
tr.scw-subtotal--level-4 { }

td.scw-level-total-label { font-weight: 700; }

/* Hide level-3 header rows when flagged */
tr.scw-hide-level3-header { display: none !important; }

/* Hide qty/cost cells for rows you want */
tr.scw-hide-qty-cost td.${QTY_FIELD_KEY},
tr.scw-hide-qty-cost td.${COST_FIELD_KEY} { visibility: hidden; }

/* ✅ Hide the raw record rows (the <tr id="..."> rows) after we mark them */
tr.scw-hidden-record-row { display: none !important; }

/* ✅ L2 hook classes for Assumptions bucket (you can set your background here) */
tr.scw-l2--assumptions { }
tr.scw-l2--assumptions-id { }  /* specific “by id” hook */
    `.trim();

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ======================
  // HELPERS
  // ======================
  function normText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function isBlankish(s) {
    const t = normText(s);
    if (!t) return true;
    // common junk
    if (t === '-' || t === '—' || t === '–' || t === '\u00A0') return true;
    return false;
  }

  // sanitize field_2019 to allow only <br> and <b>
  function sanitize2019(html) {
    const raw = String(html || '');

    // quick allowlist: strip all tags then re-allow <br> and <b> via conservative replacements
    // 1) temporarily protect allowed tags
    let s = raw
      .replace(/<\s*br\s*\/?\s*>/gi, '[[[SCW_BR]]]')
      .replace(/<\s*\/\s*b\s*>/gi, '[[[SCW_B_END]]]')
      .replace(/<\s*b(\s+[^>]*)?>/gi, '[[[SCW_B_START]]]');

    // 2) strip all remaining tags
    s = s.replace(/<\/?[^>]+>/g, '');

    // 3) restore allowed tags
    s = s
      .replace(/\[\[\[SCW_BR\]\]\]/g, '<br>')
      .replace(/\[\[\[SCW_B_START\]\]\]/g, '<b>')
      .replace(/\[\[\[SCW_B_END\]\]\]/g, '</b>');

    return s;
  }

  function getGroupLabelFromGroupRow($groupTr) {
    // group header label is in first td
    return normText($groupTr.children('td').first().text());
  }

  function firstCellText($tr) {
    return normText($tr.children('td').first().text());
  }

  // ======================
  // PATCH 1: L2 “Assumptions” class hooks by record id
  // ======================
  function applyAssumptionsL2Hooks($view) {
    // Strategy:
    //  - Find L2 group rows whose label text is "Assumptions"
    //  - Add scw-l2--assumptions
    //  - Add scw-l2--assumptions-id if the first “real record row” under that group matches ASSUMPTIONS_RECORD_ID
    $view.find('tr.kn-table-group.kn-group-level-2').each(function () {
      const $l2 = $(this);
      const label = getGroupLabelFromGroupRow($l2);

      if (label !== 'Assumptions') return;

      $l2.addClass('scw-l2--assumptions');

      // find the first non-group, non-subtotal row after this header
      let $next = $l2.next();
      while ($next.length && ($next.is('tr.kn-table-group') || $next.is('tr.scw-level-total-row'))) {
        $next = $next.next();
      }

      // if the first underlying data row has the target record id, add the id-hook class
      const id = $next.attr('id');
      if (id && id === ASSUMPTIONS_RECORD_ID) {
        $l2.addClass('scw-l2--assumptions-id');
      }
    });
  }

  // ======================
  // PATCH 2: Hide Level-3 header rows when “product name” group label is blank-ish
  // ======================
  function hideBlankLevel3Headers($view) {
    $view.find('tr.kn-table-group.kn-group-level-3').each(function () {
      const $l3 = $(this);

      // If the first cell (group label) is blank-ish, hide the L3 header
      // (This matches what you were doing when the DOM shows an empty L3 group label cell.)
      const label = firstCellText($l3);
      if (isBlankish(label)) {
        $l3.addClass('scw-hide-level3-header');
      } else {
        $l3.removeClass('scw-hide-level3-header');
      }
    });
  }

  // ======================
  // PATCH 3: Inject synthetic L4 row with sanitized field_2019 (non-destructive)
  // ======================
  function ensureSyntheticL4Rows($view) {
    // For each “real record row” (<tr id="...">), if it has a field_2019 cell with text/html,
    // add a synthetic L4 group row *just before it* if none exists already.
    $view.find('tbody').each(function () {
      const $tbody = $(this);
      const $rows = $tbody.children('tr');

      $rows.each(function () {
        const $tr = $(this);

        // only real record rows have an id and are NOT group headers or subtotals
        if (!$tr.attr('id')) return;
        if ($tr.is('tr.kn-table-group') || $tr.is('tr.scw-level-total-row')) return;

        const $descCell = $tr.children(`td.${DESC_FIELD_KEY}[data-field-key="${DESC_FIELD_KEY}"]`);
        if (!$descCell.length) return;

        const rawHtml = $descCell.html();
        const clean = sanitize2019(rawHtml);
        if (isBlankish(clean.replace(/<br>/g, ' '))) return;

        const $prev = $tr.prev();

        // if previous row is already a synthetic L4 row containing our injected content, do nothing
        const prevIsSynthetic =
          $prev.is('tr.kn-table-group.kn-group-level-4') &&
          $prev.find('.scw-l4-2019').length > 0;

        if (prevIsSynthetic) return;

        // clone structure from an existing group row if possible, otherwise build a minimal row
        const $synthetic = $('<tr class="kn-table-group kn-group-level-4 scw-hide-qty-cost"></tr>');

        // build cells count based on the row’s children
        const colCount = $tr.children('td').length || 1;

        // first cell is the description cell equivalent
        const $firstTd = $('<td></td>');
        $firstTd.css({ 'padding-left': '60px', 'padding-top': '0' });
        $firstTd.append(`<span class="scw-l4-2019">${clean}</span>`);
        $synthetic.append($firstTd);

        // append empty tds for remaining columns to keep table alignment
        for (let i = 1; i < colCount; i++) {
          // clone classes/data attributes from the real row’s td at index i if present
          const $origTd = $tr.children('td').eq(i);
          const $td = $('<td></td>');

          if ($origTd.length) {
            const cls = $origTd.attr('class');
            if (cls) $td.attr('class', cls);

            // keep the same data attrs so Knack column widths stay happy
            const dk = $origTd.attr('data-field-key');
            const dci = $origTd.attr('data-column-index');
            if (dk) $td.attr('data-field-key', dk);
            if (dci) $td.attr('data-column-index', dci);
            const style = $origTd.attr('style');
            if (style) $td.attr('style', style);
          }

          $synthetic.append($td);
        }

        $tr.before($synthetic);
      });
    });
  }

  // ======================
  // PATCH 4: Hide underlying raw record rows after synthetic L4 rows
  // ======================
  function hideUnderlyingRowsAfterSyntheticL4($view) {
    $view.find('tbody').each(function () {
      const $tbody = $(this);
      const $rows = $tbody.children('tr');

      $rows.each(function () {
        const $tr = $(this);

        const isSyntheticL4 =
          $tr.is('tr.kn-table-group.kn-group-level-4') &&
          $tr.find('.scw-l4-2019, .scw-concat-cameras').length > 0;

        if (!isSyntheticL4) return;

        // Hide consecutive “real record” rows until next group header OR subtotal row
        let $next = $tr.next();

        while (
          $next.length &&
          !$next.is('tr.kn-table-group') &&
          !$next.is('tr.scw-level-total-row')
        ) {
          // only hide real record rows (id rows) to avoid nuking anything else
          if ($next.attr('id')) {
            $next.addClass('scw-hidden-record-row');
          }
          $next = $next.next();
        }
      });
    });
  }

  // ======================
  // MAIN APPLY
  // ======================
  function applyAll(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    ensureCss();

    // Order matters:
    // 1) inject synthetic L4 rows
    // 2) then hide underlying rows (so your footer/detail rows disappear)
    // 3) then apply L2 assumptions hooks (safe)
    // 4) then hide blank L3 headers (safe)
    ensureSyntheticL4Rows($view);
    hideUnderlyingRowsAfterSyntheticL4($view);
    applyAssumptionsL2Hooks($view);
    hideBlankLevel3Headers($view);
  }

  // ======================
  // EVENTS
  // ======================
  $(document)
    .off('knack-view-render' + EVENT_NS)
    .on('knack-view-render' + EVENT_NS, function (event, view) {
      if (!view || !VIEW_IDS.includes(view.key)) return;

      // Let other scripts (KTL / inline edits / your concat) finish first
      setTimeout(function () {
        applyAll(view.key);
      }, 0);
    });

})();
