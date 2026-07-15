/*** WORKSHEET V2 — CHANGE ORDER: adopt previously-quoted line items *********
 *
 * Runs on the CO drafting scene's READ-ONLY "Previously Quoted Items" panel
 * (the view_4088 deployment in config.js, flagged `adopt`). Design decision
 * 2026-07-07: adoptable items are shown in the full device-worksheet card
 * style — same grouping, money columns, warnings the team already knows —
 * NOT a modal picker.
 *
 * Layout pass (user feedback 2026-07-07): the panel restructures each
 * summary row so the controls sit INLINE with the other columns instead of
 * floating over the card —
 *
 *   [☐] chevron · label · product (desc stacked BENEATH) · qty · money ·
 *   sow · warn · [+ Add Item]
 *
 * - the labor description moves underneath the product to free width
 * - a checkbox column (far left) drives MULTI-SELECT; an "Add N selected"
 *   button appears in the panel banner for bulk adoption
 * - "+ Add Item" (far right) adopts a single row; already-adopted rows
 *   show a green "✓ Added" pill in the same slot
 *
 * Adoption connects the line item to the CO by unioning its multi-SOW
 * connection (field_2154) with the CO's SOW record id. The write happens
 * in Make (MAKE_CO_ADOPT_ITEMS_WEBHOOK — same scenario shape as
 * import-unique-items: receivingRecordId + uniqueItemIds), so the client
 * never mutates records directly.
 *
 * The panel's readOnly lockdown is three layers: styles.js flattens every
 * input to plain text + kills the mouse path, init.js skips the
 * toolbar/sort/bulk mounts, and this module hard-disables inputs after
 * each render so keyboard tab-and-type can't commit either. (Builder-side
 * inline editing on view_4088 should ALSO be off — belt and suspenders.)
 *
 * ⚠️ Adopted items are SHARED records (they stay connected to their original
 * quote SOW — that's the point of the multi-connection). Removing one from
 * the CO must be a field_2154 DISCONNECT, never a record delete. The CO
 * worksheet's delete story for adopted items is a follow-up; card.js's
 * DELETE_BLOCK guard covers view-side deletes meanwhile.
 ******************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var SOW_FIELD  = 'field_2154';
  var STYLE_ID   = 'scw-ws-v2-co-adopt-css';
  var BTN_CLS    = 'scw-co-adopt-btn';
  var PILL_CLS   = 'scw-co-adopt-added';
  var CHECK_CLS  = 'scw-co-adopt-check';
  var BULK_CLS   = 'scw-co-adopt-bulk';
  var LOG_PREFIX = '[scw-co-adopt]';

  // The CO worksheet on the same scene — refetched after an adoption so the
  // new line appears there without a reload. Per-deployment override via the
  // config entry's `coViewKey` (sub scene_1374 panels point at view_4112);
  // no override = the internal CO drafting scene.
  var CO_VIEW_DEFAULT = 'view_4079';
  function coViewFor(viewKey) {
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      if (views[i] && views[i].sourceViewKey === viewKey) {
        return views[i].coViewKey || CO_VIEW_DEFAULT;
      }
    }
    return CO_VIEW_DEFAULT;
  }

  // Multi-select state: record id → true. Survives re-renders (decorate
  // re-checks the boxes); cleared per-id once a record is adopted.
  var _sel = {};
  function selCount() { return Object.keys(_sel).length; }

  // ── Config ────────────────────────────────────────────────────────────
  function adoptViews() {
    var out = [];
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v && v.enabled !== false && v.adopt) out.push(v);
    }
    return out;
  }

  // ── CO SOW id ─────────────────────────────────────────────────────────
  // The CO drafting page is a drill-in child page whose OWN record is the
  // CO's SOW — its id is the LAST 24-hex segment of the hash. Don't reuse
  // toolbar.js getSowIdFromHash(): its base-path patterns match the PARENT
  // route prefix (e.g. …/deploy/<sowId>/…), which would return the base
  // SOW instead of the CO.
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' &&
               typeof Knack.getUserAttributes === 'function')
        ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }

  // ── Styles ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // 12-track grid for restructured adopt rows + their column header:
      // check · chevron · label · product/desc (stacked) · qty · subBid ·
      // +Hrs · +Mat · fee · sow · warn · action. Applied only to rows this
      // module has restructured (attribute guard) so an unexpected row
      // shape degrades to the stock template instead of misaligning.
      '.scw-ws-v2--readonly .scw-ws-v2-row[data-scw-co-adopt-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-col-header[data-scw-co-adopt-hdr] {',
      '  grid-template-columns:',
      '    24px                  /* select checkbox */',
      '    20px                  /* chevron */',
      '    88px                  /* label / drop */',
      '    minmax(220px, 3fr)    /* product + stacked description */',
      '    72px                  /* qty / chips */',
      '    78px                  /* subBid */',
      '    64px                  /* +Hrs */',
      '    64px                  /* +Mat */',
      '    72px                  /* fee */',
      '    72px                  /* sow */',
      '    28px                  /* warning */',
      '    96px                  /* adopt action */ !important;',
      '}',

      // Checkbox column
      '.scw-co-adopt-checkcell {',
      '  display: flex; align-items: center; justify-content: center;',
      '  align-self: center; cursor: pointer;',
      '}',
      '.' + CHECK_CLS + ' {',
      '  width: 14px; height: 14px; cursor: pointer; margin: 0;',
      '}',

      // Description stacked beneath the product — compact caption styling.
      // The transform/spacing resets also shield the desc from the tag
      // cell's chip styling on services rows (uppercase/letter-spacing).
      '.scw-co-adopt-stacked-desc { margin-top: 3px; }',
      '.scw-co-adopt-stacked-desc textarea {',
      '  font: 400 11px/1.35 system-ui, -apple-system, sans-serif !important;',
      '  color: #64748b !important;',
      '  text-transform: none !important; letter-spacing: normal !important;',
      '  min-height: 0 !important; height: auto !important;',
      '  max-height: 4.2em !important; overflow: hidden !important;',
      '  padding: 0 !important; width: 100% !important;',
      '}',
      // Hide fully-empty stacked descriptions so default rows without a
      // labor description don\'t reserve dead space under the product.
      '.scw-co-adopt-stacked-desc[data-scw-co-adopt-empty] { display: none !important; }',

      // Services rows: the "Service" label should READ AS THE PRODUCT (design
      // request 2026-07-07) — not a centered purple chip. Unbox the tag and
      // restyle the word to match a product name: left-aligned, normal case,
      // dark product weight. The stacked desc keeps its own caption reset.
      '.scw-ws-v2--readonly .scw-ws-v2-row[data-scw-co-adopt-row] > .scw-co-adopt-tagstack {',
      '  background: transparent !important;',
      '  border: none !important;',
      '  padding: 0 !important;',
      '  display: flex !important; flex-direction: column !important;',
      '  align-items: stretch !important;',
      '  text-align: left !important;',
      '  text-transform: none !important;',
      '  letter-spacing: normal !important;',
      '  color: #0f172a !important;',
      '  font: 600 13px/1.3 system-ui, -apple-system, sans-serif !important;',
      '}',

      // Non-cam product/tag placement — re-pin for the checkbox-shifted
      // template. The stock rule (styles.js) spans the product/Service tag
      // over `grid-column: 2 / span 2` — correct for the un-shifted grid
      // (label col 2 + product col 3) but WRONG here: our leading checkbox
      // pushes chevron→2, label→3, product→4, so 2/span 2 lands the product
      // on the chevron+label region (collides with the chevron) and shoves
      // qty/subBid/+Hrs/… one track left. Re-pin to cols 3-4 (label +
      // product) so the desc-stacked product absorbs the empty label slot
      // and every money cell after it flows back into its own track.
      // Higher specificity (0,4,0 with the attribute) + later load beats the
      // stock 0,2,0 !important rule.
      '.scw-ws-v2--readonly .scw-ws-v2-row--default[data-scw-co-adopt-row] > .scw-ws-v2-cell--product,',
      '.scw-ws-v2--readonly .scw-ws-v2-row--services[data-scw-co-adopt-row] > .scw-ws-v2-cell--tag {',
      '  grid-column: 3 / span 2 !important;',
      '}',
      // Promoted-accessory rows keep their attached-to chip in the label
      // slot (col 3), so the product must NOT absorb it — flow it naturally
      // into the product track (col 4). Mirrors the stock :has() reset.
      '.scw-ws-v2--readonly .scw-ws-v2-row--default[data-scw-co-adopt-row]:has(.scw-ws-v2-cell--attached) > .scw-ws-v2-cell--product,',
      '.scw-ws-v2--readonly .scw-ws-v2-row--services[data-scw-co-adopt-row]:has(.scw-ws-v2-cell--attached) > .scw-ws-v2-cell--tag {',
      '  grid-column: auto !important;',
      '}',

      // Assumptions rows keep the desc as a DIRECT child (see
      // restructureRow) — re-pin the stock 3/10 span to the new
      // checkbox-shifted template: cols 4 (product track) through 9
      // (fee), SOW stays at 10. Loaded after styles.js, so this later
      // equal-importance rule wins.
      '.scw-ws-v2--readonly .scw-ws-v2-row--assumptions[data-scw-co-adopt-row] > .scw-ws-v2-cell--labor-desc {',
      '  grid-column: 4 / 10 !important;',
      '}',

      // ── Labor-only variant (sub CO page, view_4118) ─────────────────────
      // The labor cards render NO +Hrs/+Mat/Fee cells (card.js laborOnly),
      // so the adopt grid closes those tracks up: check · chevron · label ·
      // product/desc · qty · subBid · sow · warn · action. Doubled class /
      // extra ancestor keeps these above the base adopt rules (0,4,0).
      '.scw-ws-v2--readonly .scw-ws-v2-card--labor .scw-ws-v2-row[data-scw-co-adopt-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-col-header.scw-ws-v2-col-header--labor[data-scw-co-adopt-hdr] {',
      '  grid-template-columns:',
      '    24px                  /* select checkbox */',
      '    20px                  /* chevron */',
      '    88px                  /* label / drop */',
      '    minmax(220px, 3fr)    /* product + stacked description */',
      '    72px                  /* qty / chips */',
      '    88px                  /* subBid */',
      '    72px                  /* sow */',
      '    28px                  /* warning */',
      '    96px                  /* adopt action */ !important;',
      '}',
      // Labor assumptions re-pin: desc spans product → subBid (4/7); sow
      // keeps track 7, warn 8, action 9.
      '.scw-ws-v2--readonly .scw-ws-v2-card--labor .scw-ws-v2-row--assumptions[data-scw-co-adopt-row] > .scw-ws-v2-cell--labor-desc {',
      '  grid-column: 4 / 7 !important;',
      '}',

      // Empty money cells (no Sub Bid / +Hrs / +Mat value): the borderless
      // read-only input is invisible, which left orphan "$" glyphs and a
      // strange dead zone. Hide the glyph/input/total and show a faint
      // dash so the column reads as deliberately empty.
      '.scw-ws-v2--readonly [data-scw-co-adopt-row] .scw-ws-v2-cell--stack[data-scw-co-adopt-empty] .scw-ws-v2-currency-glyph,',
      '.scw-ws-v2--readonly [data-scw-co-adopt-row] .scw-ws-v2-cell--stack[data-scw-co-adopt-empty] input,',
      '.scw-ws-v2--readonly [data-scw-co-adopt-row] .scw-ws-v2-cell--stack[data-scw-co-adopt-empty] .scw-ws-v2-stack-total {',
      '  display: none !important;',
      '}',
      '.scw-ws-v2--readonly [data-scw-co-adopt-row] .scw-ws-v2-cell--stack[data-scw-co-adopt-empty]::after {',
      '  content: \'—\';',
      '  display: block; text-align: center;',
      '  color: #cbd5e1; font-size: 11px;',
      '}',

      // Inline action column (rightmost)
      '.scw-co-adopt-actioncell {',
      '  display: flex; align-items: center; justify-content: flex-end;',
      '  align-self: center;',
      '}',
      '.' + BTN_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #0f4c75; color: #fff;',
      '  border: none; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer;',
      '  transition: background 0.15s ease;',
      '}',
      '.' + BTN_CLS + ':hover { background: #07467c; }',
      '.' + BTN_CLS + '[disabled] { opacity: 0.6; cursor: default; }',
      '.scw-co-adopt-spin {',
      '  width: 11px; height: 11px; flex: 0 0 auto;',
      '  border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;',
      '  border-radius: 50%;',
      '  animation: scwCoAdoptSpin 0.8s linear infinite;',
      '}',
      '@keyframes scwCoAdoptSpin { to { transform: rotate(360deg); } }',

      // Green "already on this CO" state — same slot, non-interactive.
      '.' + PILL_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #ecfdf5; color: #047857;',
      '  border: 1px solid #a7f3d0; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '}',

      // Detail panel: Prefix (field_2240) + Drop # (field_1951) aren\'t
      // editable here, so they\'re pure noise — hide their whole
      // detail-field wrapper. Scoped to the read-only panel so the live
      // worksheets keep them. :has() lets us key off the inner control\'s
      // field attribute (the wrapper carries no field key of its own).
      '.scw-ws-v2--readonly .scw-ws-v2-detail-field:has([data-scw-ws-v2-conn="field_2240"]),',
      '.scw-ws-v2--readonly .scw-ws-v2-detail-field:has([data-scw-ws-v2-field="field_1951"]) {',
      '  display: none !important;',
      '}',

      // Collapsible banner: make the whole panel header a toggle. The
      // caret sits before the title; collapsing hides the body.
      '.scw-ws-v2-banner.scw-co-adopt-collapsible {',
      '  cursor: pointer; user-select: none;',
      '}',
      '.scw-co-adopt-caret {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 16px; height: 16px; margin-right: 6px; flex: 0 0 auto;',
      '  color: currentColor; transition: transform 0.15s ease;',
      '}',
      '.scw-co-adopt-caret svg { width: 12px; height: 12px; }',
      '.scw-ws-v2--co-collapsed .scw-co-adopt-caret { transform: rotate(-90deg); }',
      // Collapsed = ONLY the banner shows. The search bar + SOW filter pills
      // mount as siblings of the body (direct children of the panel), so hide
      // every panel child except the banner — not just the card body.
      '.scw-ws-v2--co-collapsed > *:not(.scw-ws-v2-banner) { display: none !important; }',

      // Bulk toolbar — reuses bulk.js's floating bottom-center classes
      // (.scw-ws-v2-bulk-toolbar / --active) for UI continuity with the
      // worksheet's bulk-edit options. Only the Clear button needs its
      // own ghost styling here.
      '.scw-co-adopt-toolbar .scw-co-adopt-clear {',
      '  background: transparent !important;',
      '  border: 1px solid #6b21a8 !important;',
      '  color: #d8b4fe !important;',
      '}',
      '.scw-co-adopt-toolbar .scw-co-adopt-clear:hover {',
      '  background: rgba(107, 33, 168, 0.35) !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Data helpers ──────────────────────────────────────────────────────
  function recordIndex(viewKey) {
    var byId = {};
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i] && recs[i].id) byId[recs[i].id] = recs[i];
    }
    return byId;
  }

  function isOnCo(rec, coId) {
    if (!rec || !coId) return false;
    var raw = rec[SOW_FIELD + '_raw'];
    if (!Array.isArray(raw)) return false;
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id === coId) return true;
    }
    return false;
  }

  // ── Row restructure + control state ──────────────────────────────────
  // One-time per row: prepend the checkbox cell, move the description cell
  // INSIDE the product cell (stacked beneath), append the action cell.
  // The trash cell is display:none'd by styles.js, so the visible cell
  // count matches the 12-track grid above.
  function restructureRow(row, rid, viewKey) {
    if (row.hasAttribute('data-scw-co-adopt-row')) return;

    // Variant-aware description stacking:
    //  - default/cam rows: move the desc cell INSIDE the (real) product
    //    cell so they share the wide track.
    //  - services rows: same move into the "Service" tag cell, plus a
    //    class that unboxes the tag chip (otherwise the desc inherits
    //    purple/uppercase chip styling).
    //  - assumptions rows: DON'T move. Their product cell is a hidden
    //    blank (stock CSS display:none) — moving the desc there made the
    //    text vanish and the surviving cells auto-flow into the wrong
    //    tracks. The desc stays a direct child; injectStyles re-pins its
    //    stock span (3/10) to the checkbox-shifted template (4/10).
    if (!row.classList.contains('scw-ws-v2-row--assumptions')) {
      var prod = row.querySelector('.scw-ws-v2-cell--product, .scw-ws-v2-cell--tag');
      var desc = row.querySelector('.scw-ws-v2-cell--labor-desc');
      if (prod && desc) {
        desc.classList.add('scw-co-adopt-stacked-desc');
        prod.appendChild(desc);
        if (prod.classList.contains('scw-ws-v2-cell--tag')) {
          prod.classList.add('scw-co-adopt-tagstack');
        }
      }
    }

    var check = document.createElement('label');
    check.className = 'scw-co-adopt-checkcell';
    check.innerHTML = '<input type="checkbox" class="' + CHECK_CLS + '" ' +
      'data-scw-co-adopt-check="' + rid + '" ' +
      'data-scw-co-adopt-view="' + viewKey + '" ' +
      'aria-label="Select for bulk add to change order">';
    // Checkbox clicks must not toggle the card's expand behavior.
    check.addEventListener('click', function (e) { e.stopPropagation(); });
    row.insertBefore(check, row.firstChild);

    var act = document.createElement('span');
    act.className = 'scw-co-adopt-actioncell';
    row.appendChild(act);

    // Only claim the 12-track template once the row actually has the
    // adopt cells — see the CSS comment.
    row.setAttribute('data-scw-co-adopt-row', '1');
  }

  // Column header: prepend an empty checkbox slot, drop the Description
  // header (the cell now stacks under Product), relabel Product. The
  // empty trash slot at the end doubles as the action column header.
  function restructureHeaders(container) {
    var hdrs = container.querySelectorAll('.scw-ws-v2-col-header:not([data-scw-co-adopt-hdr])');
    for (var i = 0; i < hdrs.length; i++) {
      var hdr = hdrs[i];
      hdr.setAttribute('data-scw-co-adopt-hdr', '1');
      var spans = hdr.querySelectorAll('span');
      for (var j = 0; j < spans.length; j++) {
        var t = (spans[j].textContent || '').trim();
        if (t === 'Description') { hdr.removeChild(spans[j]); }
        else if (t === 'Product') { spans[j].textContent = 'Product / Description'; }
      }
      var lead = document.createElement('span');
      hdr.insertBefore(lead, hdr.firstChild);
    }
  }

  function setRowState(row, rid, viewKey, adopted) {
    var act = row.querySelector('.scw-co-adopt-actioncell');
    var check = row.querySelector('.' + CHECK_CLS);
    if (!act) return;
    if (adopted) {
      delete _sel[rid];
      act.innerHTML = '<span class="' + PILL_CLS + '">✓ Added</span>';
      if (check) { check.checked = false; check.style.visibility = 'hidden'; }
    } else {
      if (!act.querySelector('.' + BTN_CLS)) {
        act.innerHTML = '<button type="button" class="' + BTN_CLS + '" ' +
          'data-scw-co-adopt="' + rid + '" ' +
          'data-scw-co-adopt-view="' + viewKey + '" ' +
          'title="Add this quoted line item to the change order">+ Add Item</button>';
      }
      if (check) {
        check.style.visibility = '';
        check.checked = !!_sel[rid];
      }
    }
  }

  // Tag empty money stacks + empty stacked descriptions so the CSS can
  // swap invisible inputs / orphan "$" glyphs for a faint dash (or hide
  // the dead space entirely). Values are read-only here, so a per-render
  // classification stays accurate.
  function markEmptyCells(row) {
    var stacks = row.querySelectorAll('.scw-ws-v2-cell--stack');
    for (var i = 0; i < stacks.length; i++) {
      var input = stacks[i].querySelector('input');
      var val = input ? String(input.value || '').trim() : '';
      if (!input || val === '' ) {
        stacks[i].setAttribute('data-scw-co-adopt-empty', '1');
      } else {
        stacks[i].removeAttribute('data-scw-co-adopt-empty');
      }
    }
    var desc = row.querySelector('.scw-co-adopt-stacked-desc');
    if (desc) {
      var ta = desc.querySelector('textarea');
      if (ta && String(ta.value || '').trim() === '') {
        desc.setAttribute('data-scw-co-adopt-empty', '1');
      } else {
        desc.removeAttribute('data-scw-co-adopt-empty');
      }
    }
  }

  // ── Collapsible panel banner ────────────────────────────────────────
  function caretSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M6 9l6 6 6-6"></path></svg>';
  }
  var COLLAPSE_KEY = 'scwCoAdoptCollapsed:';
  function isCollapsed(viewKey) {
    // Default COLLAPSED (no stored preference) so the CO Line Items worksheet
    // is the focus on load — this source panel expands only when the user
    // wants to add items. Once toggled, the stored choice wins.
    try {
      var v = localStorage.getItem(COLLAPSE_KEY + viewKey);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  }
  function setCollapsed(viewKey, val) {
    try { localStorage.setItem(COLLAPSE_KEY + viewKey, val ? '1' : '0'); }
    catch (e) { /* private mode — non-persistent is fine */ }
  }
  function ensureCollapsible(viewKey) {
    var panel = document.getElementById('scw-ws-v2-' + viewKey);
    if (!panel) return;
    var banner = panel.querySelector('.scw-ws-v2-banner');
    if (!banner) return;
    // Caret + affordance markers only. The click is handled by a DELEGATED
    // listener (below) rather than bound here — an element-bound handler is
    // silently lost if the banner is ever rebuilt/replaced, which reads as
    // "the collapse stopped working". Idempotent via the caret guard.
    if (!banner.querySelector('.scw-co-adopt-caret')) {
      banner.classList.add('scw-co-adopt-collapsible');
      banner.setAttribute('role', 'button');
      banner.setAttribute('tabindex', '0');
      var caret = document.createElement('span');
      caret.className = 'scw-co-adopt-caret';
      caret.innerHTML = caretSvg();
      banner.insertBefore(caret, banner.firstChild);
    }
    // Re-apply the persisted state on every render (the panel body is
    // rebuilt underneath us; the collapsed class rides on the panel root).
    panel.classList.toggle('scw-ws-v2--co-collapsed', isCollapsed(viewKey));
  }

  // Delegated collapse toggle — survives any banner rebuild. Clicking anywhere
  // on the adopt panel's banner toggles its collapsed state (persisted).
  function toggleCollapseFromEvent(e) {
    var banner = e.target && e.target.closest &&
      e.target.closest('.scw-ws-v2-banner.scw-co-adopt-collapsible');
    if (!banner) return;
    var panel = banner.closest('.scw-ws-v2');
    if (!panel || !panel.id) return;
    var viewKey = panel.id.replace(/^scw-ws-v2-/, '');
    var collapsed = panel.classList.toggle('scw-ws-v2--co-collapsed');
    setCollapsed(viewKey, collapsed);
  }
  document.addEventListener('click', toggleCollapseFromEvent);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target &&
        e.target.classList && e.target.classList.contains('scw-co-adopt-collapsible')) {
      e.preventDefault();
      toggleCollapseFromEvent(e);
    }
  });

  function decorate(vcfg) {
    var viewKey = vcfg.sourceViewKey;
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    injectStyles();
    ensureCollapsible(viewKey);

    var coId = getCoSowId();
    if (!coId) {
      console.warn(LOG_PREFIX, 'could not resolve the CO SOW id from the hash —',
        'adopt controls suppressed this render');
      return;
    }

    restructureHeaders(container);

    var byId = recordIndex(viewKey);
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var rid  = card.getAttribute('data-scw-ws-v2-record');
      var rec  = byId[rid];
      var row  = card.querySelector('.scw-ws-v2-row');
      if (!row || !rec) continue;
      restructureRow(row, rid, viewKey);
      setRowState(row, rid, viewKey, isOnCo(rec, coId));
      markEmptyCells(row);
    }

    // Keyboard belt for the readOnly lockdown: pointer-events CSS blocks
    // the mouse, this blocks tab-focus + type + blur-commit. Our own
    // checkboxes stay live.
    if (vcfg.readOnly) {
      var inputs = container.querySelectorAll(
        '.scw-ws-v2-card input:not(.' + CHECK_CLS + '), ' +
        '.scw-ws-v2-card textarea, .scw-ws-v2-card select');
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = true;
    }

    updateBulkToolbar(viewKey);
  }

  function decorateSoon(vcfg) {
    // Defer past the current notify chain so we always run AFTER
    // render.js has (re)built the cards, regardless of subscriber order.
    setTimeout(function () { decorate(vcfg); }, 0);
  }

  // ── Bulk toolbar (floating, bottom-center) ──────────────────────────
  // Same placement + look as the worksheet's bulk-edit toolbar (bulk.js)
  // for UI continuity: dark pill, count on the left, purple actions.
  // Slides in while ≥1 row is selected. Note: on the CO scene the CO
  // worksheet's own bulk toolbar shares this spot — the two can't show
  // together unless the user holds selections in BOTH panels at once.
  var _toolbar = null;
  function ensureBulkToolbar(viewKey) {
    if (_toolbar) return _toolbar;
    _toolbar = document.createElement('div');
    _toolbar.className = 'scw-ws-v2-bulk-toolbar scw-co-adopt-toolbar';
    _toolbar.innerHTML =
      '<span class="scw-ws-v2-bulk-count">0 selected</span>' +
      '<button type="button" class="' + BULK_CLS + '" ' +
        'data-scw-co-adopt-bulk="' + viewKey + '">Add to Change Order</button>' +
      '<button type="button" class="scw-co-adopt-clear" ' +
        'data-scw-co-adopt-clear="' + viewKey + '">Clear</button>';
    document.body.appendChild(_toolbar);
    return _toolbar;
  }

  function updateBulkToolbar(viewKey) {
    var n = selCount();
    var bar = ensureBulkToolbar(viewKey);
    var count = bar.querySelector('.scw-ws-v2-bulk-count');
    if (count) count.textContent = n + ' selected';
    bar.classList.toggle('scw-ws-v2-bulk-toolbar--active', n > 0);
  }

  function clearSelection(viewKey) {
    _sel = {};
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (container) {
      var boxes = container.querySelectorAll('.' + CHECK_CLS + ':checked');
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
    }
    updateBulkToolbar(viewKey);
  }

  // ── Adoption write (Make webhook) — single + bulk share this ─────────
  function fireAdopt(ids, viewKey, ui) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ADOPT_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('The change-order adopt webhook is not configured.');
      return;
    }
    var coId = getCoSowId();
    if (!coId) {
      alert('Could not determine the change order record id from the URL.');
      return;
    }
    var byId = recordIndex(viewKey);
    var sourceSowIds = {}, i, r;
    for (i = 0; i < ids.length; i++) {
      var rec = byId[ids[i]];
      var raw = rec && rec[SOW_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (r = 0; r < raw.length; r++) {
        if (raw[r] && raw[r].id) sourceSowIds[raw[r].id] = true;
      }
    }

    ui.busy();

    // Same payload contract as import-unique-items' fireBulkWebhook —
    // "connect uniqueItemIds to receivingRecordId" — plus a changeOrder
    // marker so the Make scenario can branch if CO handling ever diverges.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receivingRecordId:       coId,
        sourceRecordId:          null,
        sourceRecordIds:         Object.keys(sourceSowIds),
        uniqueItemIds:           ids,
        deleteSourceIds:         [],
        deleteSourceAfterImport: false,
        bulk:                    ids.length > 1,
        changeOrder:             true,
        triggeredBy:             getTriggeredBy()
      })
    }).then(function (resp) {
      // Key success on the HTTP status (2xx), not the body shape — Make's
      // Webhook Response can return an empty body / "Accepted" text / arbitrary
      // JSON, which made the old {success:true} gate throw a false failure.
      // Only treat as a failure when the body EXPLICITLY says so. (Mirrors the
      // co-remove.js fireRemove fix.)
      var ok = resp.ok;
      return resp.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        return { ok: ok, data: body };
      });
    }).then(function (r) {
      var data = r.data;
      var explicitFail = !!(data && (data.success === false || data.error));
      if (r.ok && !explicitFail) {
        // Optimistic flip to the Added state; the refetches below make it
        // durable (and land the new lines on the CO worksheet).
        var container = document.getElementById('scw-ws-v2-' + viewKey);
        for (var k = 0; k < ids.length; k++) {
          delete _sel[ids[k]];
          if (!container) continue;
          var card = container.querySelector(
            '.scw-ws-v2-card[data-scw-ws-v2-record="' + ids[k] + '"]');
          var row = card && card.querySelector('.scw-ws-v2-row');
          if (row) setRowState(row, ids[k], viewKey, true);
        }
        updateBulkToolbar(viewKey);
        refetchAfterAdopt(viewKey);
        ui.done();
        return;
      }
      ui.fail();
      alert((data && (data.error || data.message)) ||
        'Failed to add the item' + (ids.length > 1 ? 's' : '') + ' to the change order.');
    }).catch(function (err) {
      ui.fail();
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // Staggered refetches (same cadence as bulk.js handleDuplicate) — Make's
  // writes land asynchronously after the webhook responds.
  function refetchAfterAdopt(adoptViewKey) {
    function refetch() {
      [coViewFor(adoptViewKey), adoptViewKey].forEach(function (vk) {
        var v = window.Knack && Knack.views && Knack.views[vk];
        if (v && v.model && typeof v.model.fetch === 'function') {
          try { v.model.fetch(); } catch (e) { /* next tick catches it */ }
        }
      });
    }
    refetch();
    setTimeout(refetch, 3000);
    setTimeout(refetch, 8000);
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  var views = adoptViews();
  if (!views.length) return;

  views.forEach(function (vcfg) {
    // Primary: re-decorate on every data notify for the panel.
    if (ns.data && typeof ns.data.subscribe === 'function') {
      ns.data.subscribe(vcfg.sourceViewKey, function () { decorateSoon(vcfg); });
    }
    // Fallback: view re-renders that reach the DOM without a notify
    // (deferred flushes, native refetches).
    $(document).on('knack-view-render.' + vcfg.sourceViewKey + '.scwCoAdopt',
      function () { decorateSoon(vcfg); });
  });

  // Selection tracking — delegated so re-rendered checkboxes keep working.
  document.addEventListener('change', function (e) {
    var box = e.target;
    if (!box || !box.classList || !box.classList.contains(CHECK_CLS)) return;
    var rid = box.getAttribute('data-scw-co-adopt-check');
    var vk  = box.getAttribute('data-scw-co-adopt-view');
    if (!rid) return;
    if (box.checked) _sel[rid] = true; else delete _sel[rid];
    updateBulkToolbar(vk);
  }, true);

  // Single-row "+ Add Item".
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest &&
      e.target.closest('.' + BTN_CLS + '[data-scw-co-adopt]');
    if (btn && !btn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var rid = btn.getAttribute('data-scw-co-adopt');
      var vk  = btn.getAttribute('data-scw-co-adopt-view');
      fireAdopt([rid], vk, {
        busy: function () {
          btn.disabled = true;
          btn.innerHTML = '<span class="scw-co-adopt-spin"></span> Adding…';
        },
        done: function () { /* row flipped to Added by fireAdopt */ },
        fail: function () { btn.disabled = false; btn.textContent = '+ Add Item'; }
      });
      return;
    }
    // Bulk "Add to Change Order" in the floating toolbar.
    var bulk = e.target && e.target.closest &&
      e.target.closest('.' + BULK_CLS + '[data-scw-co-adopt-bulk]');
    if (bulk && !bulk.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var ids = Object.keys(_sel);
      if (!ids.length) return;
      if (!window.confirm('Add ' + ids.length + ' selected item' +
          (ids.length === 1 ? '' : 's') + ' to this change order?')) return;
      var vkB = bulk.getAttribute('data-scw-co-adopt-bulk');
      fireAdopt(ids, vkB, {
        busy: function () {
          bulk.disabled = true;
          bulk.innerHTML = '<span class="scw-co-adopt-spin"></span> Adding…';
        },
        done: function () {
          bulk.disabled = false;
          bulk.textContent = 'Add to Change Order';
          updateBulkToolbar(vkB);
        },
        fail: function () {
          bulk.disabled = false;
          bulk.textContent = 'Add to Change Order';
          updateBulkToolbar(vkB);
        }
      });
      return;
    }
    // Clear selection.
    var clr = e.target && e.target.closest &&
      e.target.closest('.scw-co-adopt-clear[data-scw-co-adopt-clear]');
    if (clr) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection(clr.getAttribute('data-scw-co-adopt-clear'));
    }
  }, true);
})();
/*** END WORKSHEET V2 — CHANGE ORDER: adopt previously-quoted line items *****/
