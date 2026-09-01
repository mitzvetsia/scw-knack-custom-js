/*** WORKSHEET V2 — CHANGE ORDER: remove active install line items **********
 *
 * Runs on the CO drafting scene's READ-ONLY "Install Line Items" panel (the
 * view_4086 deployment in config.js, flagged `remove`). Sibling of
 * co-adopt.js: the project's ACTIVE install line items are shown in the
 * familiar device-worksheet card style — same grouping + warnings the team
 * knows — each with a "− Remove" control (+ multi-select bulk).
 *
 *   [☐] chevron · label · product · flags · notes · warn · [− Remove]
 *
 * Removal is NOT a delete. Flagging an install item creates a Remove LINE on
 * the change order — a SOW Line Item with CO Action = Remove and a
 * "Target install item" connection pointing at the install record — connected
 * to the CO via field_2154. The install record's own `Removed by CO` flip
 * happens at SIGNATURE (Make), never client-side: per docs/change-orders.md,
 * "nothing mutates install scope until signature."
 *
 * ACCESSORIES (2026-09-01): each row shows its accessory children as chips
 * under the product name (child-side truth: install field_2853 back-
 * pointers — requires view_4086 to LOAD the accessory records + that
 * column). A REMOVE asks whether the accessories ride along (checkbox in
 * the confirm, default CHECKED — uncheck to leave the mount installed for
 * a future device). A SWAP always includes them on its remove side (no
 * choice): the replacement may need different mounting, and the paired Add
 * side re-covers it.
 *
 * SWAP (added 2026-09-01; picker-first + bulk 2026-09-01): the PRODUCT-swap
 * gesture — at this stage a swap changes the product ONLY; every other field
 * carries over verbatim and the button renders only on rows that carry a
 * product (services/assumptions have nothing to swap). "⇄ Swap Product"
 * opens the bucket-filtered product picker FIRST (pickOnly — the same
 * catalog the CO add-item modal uses), confirms, then drafts a LINKED
 * Remove + Add pair per item through the two EXISTING scenarios (no
 * dedicated swap hook): the ADD hook gets the normal add payload with the
 * install item's config cloned in, `productIds` = the REPLACEMENT product
 * the user picked (the Add line is born with it — no post-edit step),
 * `swapFromProductId/Name` = the credited current product, plus
 * `swap: true` + `targetInstallItemId` (which the scenario maps to
 * field_2966 on the created line); then the REMOVE hook fires exactly as
 * a plain removal (its scenario already targets field_2966). Add first,
 * remove second — a lone target-linked Add is apply-safe; a lone Remove is
 * not. BULK: the floating toolbar's "⇄ Swap Product" applies ONE picked
 * replacement across every selected swappable row (they must share one
 * product category, since the picker filters by bucket) — Adds fire
 * sequentially, then a single Remove call covers every successfully-added
 * device; an item whose Add failed is left out of the Remove entirely, so
 * it stays live and untouched. Accessory children (install field_2853)
 * ride as their OWN pairs so the CO shows the mounting being
 * credited/re-added: the add payload's `swapAccessories` array carries
 * {productId, targetInstallItemId, qty} per accessory (created as
 * field_2464 children of the device Add, each targeting its own install
 * record), and their install ids join the remove call's installItemIds.
 * At signature the apply scenario treats a target-linked Add as an
 * IN-PLACE update of the install record's PRODUCT, so photos / QA /
 * history keep their identity — the fix for "remove+add severs the
 * item's history".
 *
 * The write runs in Make (MAKE_CO_REMOVE_ITEMS_WEBHOOK) so the client never
 * creates/mutates records directly.
 *
 * ⚠️ SHIP STATE (2026-07-07): the panel UI is live, but the write path is
 * gated on Builder fields that don't exist yet (SOW Line Item `CO Action` +
 * `Target install item`; install object `Removed by CO`) AND a Make scenario.
 * Until MAKE_CO_REMOVE_ITEMS_WEBHOOK is a real URL, "− Remove" reports "not
 * configured" (same graceful stub adoption shipped with). Once the target
 * field exists, set config `remove.targetField` so already-flagged items can
 * be detected across reloads instead of flipping optimistically.
 *
 * The readOnly lockdown mirrors co-adopt.js: styles.js flattens inputs +
 * kills the mouse path, init.js skips toolbar/sort/bulk mounts, and this
 * module hard-disables inputs after each render (keyboard belt).
 ******************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var STYLE_ID   = 'scw-ws-v2-co-remove-css';
  var BTN_CLS    = 'scw-co-remove-btn';
  var PILL_CLS   = 'scw-co-remove-flagged';
  var CHECK_CLS  = 'scw-co-remove-check';
  var BULK_CLS   = 'scw-co-remove-bulk';
  var LOG_PREFIX = '[scw-co-remove]';

  // The CO worksheet on the same scene — refetched after a removal so the new
  // Remove line appears there without a reload. Per-deployment override via
  // the config entry's `coViewKey` (sub scene_1374 panels point at view_4112);
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

  // Multi-select state: install record id → true. Survives re-renders.
  var _sel = {};
  function selCount() { return Object.keys(_sel).length; }

  // Session-optimistic "already flagged for removal" set: install record id →
  // true. field_2967 (Removed by CO) is what durably marks an item as slated
  // for removal, but Make writes it a beat after the webhook returns — so a
  // worksheet rebuild in that gap would read field_2967 still-blank and revert
  // the just-removed item to a live "− Remove" button (the double-remove
  // window). decorate() ORs this set with isFlagged() so the red flagged state
  // sticks from the moment of removal. Cleared only on full reload; once
  // field_2967 lands it's redundant. (A future Restore-via-CO flow would need
  // to clear an id here; not built yet — self-heals on reload.)
  var _flaggedOptimistic = {};

  // Same idea for freshly-drafted SWAP pairs (fireSwapBatch): install id → true
  // from the moment the swap webhook ACKs, so the row reads "⇄ Swap drafted"
  // through the Make-write gap. Durable cross-reload detection comes from
  // coTargetCounts (2+ CO lines targeting the id) once field_2966 is a
  // column on the CO worksheet view.
  var _swappedOptimistic = {};

  // ── Config ────────────────────────────────────────────────────────────
  function removeViews() {
    var out = [];
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v && v.enabled !== false && v.remove) out.push(v);
    }
    return out;
  }

  // ── CO SOW id ─────────────────────────────────────────────────────────
  // The CO drafting page is a drill-in child page whose OWN record is the
  // CO's SOW — its id is the LAST 24-hex segment of the hash. (Same rule as
  // co-adopt.js — don't reuse toolbar.js getSowIdFromHash, which returns the
  // PARENT route prefix.)
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
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
      // 8-track grid for restructured removal rows + their column header:
      // check · chevron · label · product · flags · notes · warn · action.
      // The install base is a 7-track grid (styles.js moneyMode:install); we
      // prepend the checkbox and append the action, so shift +1 and add a
      // trailing action track. Higher specificity (0,4,0 w/ the attribute) +
      // later load beats the stock 7-track !important rule.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--cam[data-scw-co-remove-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--default[data-scw-co-remove-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--services[data-scw-co-remove-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--assumptions[data-scw-co-remove-row],',
      '.scw-ws-v2--readonly .scw-ws-v2-col-header[data-scw-co-remove-hdr] {',
      '  grid-template-columns:',
      '    24px                  /* select checkbox */',
      '    20px                  /* chevron */',
      '    64px                  /* label / drop */',
      '    minmax(220px, 3fr)    /* product + stacked description */',
      '    minmax(0px, auto)     /* flag chits (RO, only-if-true) */',
      '    minmax(0px, 1.2fr)    /* SCW Notes (read-only here) */',
      '    28px                  /* warning */',
      '    215px                 /* actions ("− Remove ⇄ Swap Product" / pills) */ !important;',
      '}',

      // Non-cam install rows hide the (blank) label + flag cells and pin the
      // read-only description / notes / warn to fixed tracks. Re-pin those
      // stock spans +1 for the checkbox column and land the action at the end.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--services[data-scw-co-remove-row] > .scw-ws-v2-cell--install-descro,',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--assumptions[data-scw-co-remove-row] > .scw-ws-v2-cell--install-descro {',
      '  grid-column: 3 / 6 !important;',
      '}',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--services[data-scw-co-remove-row] > .scw-ws-v2-cell--install-scwnotes,',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--assumptions[data-scw-co-remove-row] > .scw-ws-v2-cell--install-scwnotes {',
      '  grid-column: 6 / 7 !important;',
      '}',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--services[data-scw-co-remove-row] > .scw-ws-v2-cell--warn,',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--assumptions[data-scw-co-remove-row] > .scw-ws-v2-cell--warn {',
      '  grid-column: 7 / 8 !important;',
      '}',

      // Non-cam PRODUCT rows: the global styles.js rule hides their blank
      // label cell and pins the product to "grid-column: 2 / span 2"
      // (chevron=1 · label=2 · product=3 on the stock grids). Our prepended
      // checkbox shifts every track +1, so that pin lands the product in the
      // 20px chevron + 64px label tracks — clipped to ~84px with everything
      // after it flowing one track early. Re-pin +1 (label 3 + product 4) so
      // the product absorbs the label slot in THIS grid; the remaining cells
      // auto-flow into tracks 5-8. Cam rows keep their label cell and flow
      // correctly, which is why cam-heavy COs never showed the break.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-row--default[data-scw-co-remove-row] > .scw-ws-v2-cell--product {',
      '  grid-column: 3 / 5 !important;',
      '}',

      // ── Read-only design parity with the adoption panel ─────────────────
      // The shared .scw-ws-v2--readonly rules flatten input bg/border, but the
      // install card's SCW Notes is a full-column textarea (the ONE editable
      // field on the deploy card) that still READS as a data-entry box: an
      // empty one reserves a fixed 2-row area, so the panel looks fillable.
      // Present it as plain wrapped read-only text like the adoption panel —
      // natural height (empty collapses to nothing), no resize, muted color.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-input--textarea,',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-cell--install-scwnotes .scw-ws-v2-input--textarea {',
      '  height: auto !important;',
      '  min-height: 0 !important;',
      '  field-sizing: content !important;',
      '  resize: none !important;',
      '  padding: 0 !important;',
      '  color: #475569 !important;',
      '  cursor: default !important;',
      '}',
      // The Notes cell no longer needs to stretch to fill the row height now
      // that its textarea reads as text — keep it top-aligned like the others.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-cell--install-scwnotes {',
      '  align-self: center !important;',
      '}',

      // ── Product + stacked labor description (parity with the adopt panel) ──
      // The install card renders the labor description in the DETAIL panel, not
      // the row. co-remove reads it off the record and stacks it beneath the
      // product name here so the removal grid reads like the "available to add"
      // grid: bold product on top, muted read-only description below. Both are
      // plain text — no input-box chrome.
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-cell--product {',
      '  display: flex !important; flex-direction: column; align-items: flex-start;',
      '  gap: 3px; align-self: center; background: transparent !important;',
      '  border: none !important; box-shadow: none !important; padding: 0 !important;',
      '}',
      '.scw-ws-v2--readonly .scw-ws-v2-card--install .scw-ws-v2-cell--product .scw-ws-v2-product-name {',
      '  font-weight: 700; color: #0f172a;',
      '}',
      '.scw-co-remove-desc {',
      '  font: 400 11px/1.45 system-ui, -apple-system, sans-serif;',
      '  color: #64748b; white-space: normal; overflow-wrap: anywhere;',
      '}',

      // Accessory summary — visible on the ROW (no expand needed) so ops can
      // see exactly what mounting rides a remove/swap. Neutral slate chips;
      // the rose/indigo palettes stay reserved for the actions.
      '.scw-co-remove-accs {',
      '  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;',
      '  font: 500 10.5px/1.3 system-ui, -apple-system, sans-serif;',
      '  color: #64748b;',
      '}',
      '.scw-co-remove-accs-lbl { font-weight: 600; color: #94a3b8; }',
      '.scw-co-remove-acc-chip {',
      '  display: inline-flex; align-items: center; padding: 1px 7px;',
      '  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 999px;',
      '  color: #475569; white-space: nowrap;',
      '}',

      // Accessory-inclusion choice inside the remove confirm modal.
      '.scw-co-remove-accopt {',
      '  display: flex; align-items: flex-start; gap: 8px; cursor: pointer;',
      '  margin-top: 12px; text-align: left;',
      '}',
      '.scw-co-remove-accopt input {',
      '  width: 14px; height: 14px; margin: 2px 0 0; flex: 0 0 auto;',
      '  accent-color: #be123c; cursor: pointer;',
      '}',
      '.scw-co-remove-accopt-note {',
      '  display: block; margin: 6px 0 0 22px; font-size: 11px;',
      '  color: #64748b; text-align: left;',
      '}',

      // Checkbox column
      '.scw-co-remove-checkcell {',
      '  display: flex; align-items: center; justify-content: center;',
      '  align-self: center; cursor: pointer;',
      '}',
      '.' + CHECK_CLS + ' {',
      '  width: 14px; height: 14px; cursor: pointer; margin: 0;',
      '  accent-color: #be123c;',
      '}',

      // Inline action column (rightmost). Destructive palette (rose), per the
      // repo convention that removes/negatives read red — distinct from the
      // adopt panel's blue "+ Add Item".
      '.scw-co-remove-actioncell {',
      '  display: flex; align-items: center; justify-content: flex-end;',
      '  align-self: center;',
      '}',
      '.' + BTN_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #fff; color: #be123c;',
      '  border: 1px solid #fca5a5; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer;',
      '  transition: background 0.15s ease, color 0.15s ease;',
      '}',
      '.' + BTN_CLS + ':hover { background: #be123c; color: #fff; border-color: #be123c; }',
      '.' + BTN_CLS + '[disabled] { opacity: 0.6; cursor: default; }',
      '.scw-co-remove-spin {',
      '  width: 11px; height: 11px; flex: 0 0 auto;',
      '  border: 2px solid rgba(190,18,60,0.3); border-top-color: #be123c;',
      '  border-radius: 50%;',
      '  animation: scwCoRemoveSpin 0.8s linear infinite;',
      '}',
      '@keyframes scwCoRemoveSpin { to { transform: rotate(360deg); } }',

      // Rose "slated for removal" state — same slot, non-interactive.
      '.' + PILL_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #fff1f2; color: #be123c;',
      '  border: 1px solid #fecdd3; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '}',

      // ── Swap (model change) — indigo, distinct from the rose remove ────
      '.scw-co-remove-actioncell { gap: 4px; }',
      '.scw-co-swap-btn {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #fff; color: #4338ca;',
      '  border: 1px solid #c7d2fe; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer;',
      '  transition: background 0.15s ease, color 0.15s ease;',
      '}',
      '.scw-co-swap-btn:hover { background: #4338ca; color: #fff; border-color: #4338ca; }',
      '.scw-co-swap-btn[disabled] { opacity: 0.6; cursor: default; }',
      '.scw-co-swap-flagged {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 9px; white-space: nowrap;',
      '  background: #eef2ff; color: #4338ca;',
      '  border: 1px solid #c7d2fe; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      // Whole-card indigo state for a drafted swap — the item stays visible
      // (it isn\'t leaving install scope; only its model is changing).
      '.scw-ws-v2-card.scw-co-swap-card--drafted {',
      '  background: #f5f6ff !important;',
      '  border-color: #c7d2fe !important;',
      '  box-shadow: inset 4px 0 0 #6366f1 !important;',
      '}',

      // Whole-card red state for an item slated for removal on THIS CO — kept
      // in the grid (not hidden) so ops can see what will be dropped, but the
      // Remove control + bulk checkbox are disabled so it can\'t be re-removed.
      '.scw-ws-v2-card.scw-co-remove-card--flagged {',
      '  background: #fff5f6 !important;',
      '  border-color: #fecdd3 !important;',
      '  box-shadow: inset 4px 0 0 #e11d48 !important;',   // red left rail
      '}',
      '.scw-ws-v2-card.scw-co-remove-card--flagged .scw-ws-v2-product-name {',
      '  color: #9f1239;',
      '}',

      // Collapsible banner (mirrors co-adopt.js): make the whole panel header
      // a toggle. Caret sits before the title; collapsing hides the body.
      '.scw-ws-v2-banner.scw-co-remove-collapsible {',
      '  cursor: pointer; user-select: none;',
      '}',
      '.scw-co-remove-caret {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 16px; height: 16px; margin-right: 6px; flex: 0 0 auto;',
      '  color: currentColor; transition: transform 0.15s ease;',
      '}',
      '.scw-co-remove-caret svg { width: 12px; height: 12px; }',
      '.scw-ws-v2--co-remove-collapsed .scw-co-remove-caret { transform: rotate(-90deg); }',
      // Collapsed = ONLY the banner shows (search/filter strips are siblings
      // of the body, so hide every panel child except the banner).
      '.scw-ws-v2--co-remove-collapsed > *:not(.scw-ws-v2-banner) { display: none !important; }',

      // Bulk toolbar — reuses bulk.js's floating bottom-center classes for UI
      // continuity. Rose action + ghost Clear (destructive palette).
      '.scw-co-remove-toolbar .' + BULK_CLS + ' {',
      '  background: #be123c !important; border-color: #be123c !important;',
      '}',
      '.scw-co-remove-toolbar .' + BULK_CLS + ':hover { background: #9f1239 !important; }',
      '.scw-co-remove-toolbar .scw-co-remove-clear {',
      '  background: transparent !important;',
      '  border: 1px solid #be123c !important;',
      '  color: #fda4af !important;',
      '}',
      '.scw-co-remove-toolbar .scw-co-remove-clear:hover {',
      '  background: rgba(190, 18, 60, 0.35) !important;',
      '}',
      // Bulk swap — indigo, matching the row button's palette.
      '.scw-co-remove-toolbar .scw-co-swap-bulk {',
      '  background: #4f46e5 !important; border-color: #4f46e5 !important;',
      '}',
      '.scw-co-remove-toolbar .scw-co-swap-bulk:hover:not([disabled]) {',
      '  background: #4338ca !important;',
      '}',
      '.scw-co-remove-toolbar .scw-co-swap-bulk[disabled] {',
      '  opacity: 0.55; cursor: default;',
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

  // Durable draft-state detection off the CO worksheet's own lines: install
  // id → how many CO lines target it via field_2966. ONE targeting line =
  // a plain Remove drafted; TWO+ = a swap pair (the Remove + the cloned
  // Add). Requires field_2966 exposed as a column on the CO view — until
  // Builder adds it this returns null ("unknown") and the session-optimistic
  // sets carry the state alone.
  var TARGET_FIELD = 'field_2966';
  function coTargetCounts(viewKey) {
    var counts = Object.create(null);
    var sawField = false;
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(coViewFor(viewKey)) : [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r) continue;
      if ((TARGET_FIELD in r) || ((TARGET_FIELD + '_raw') in r)) sawField = true;
      var raw = r[TARGET_FIELD + '_raw'];
      var id = Array.isArray(raw) ? (raw[0] && raw[0].id) : (raw && raw.id);
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
    return sawField ? counts : null;
  }

  // Accessory children of an install item — install-object parent pointer is
  // field_2853 (the field_2464 analogue; see bulk.js accParentKeyFor).
  var INSTALL_ACC_PARENT = 'field_2853';
  function accessoryChildren(viewKey, rid) {
    var out = [];
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    for (var i = 0; i < recs.length; i++) {
      var raw = recs[i] && recs[i][INSTALL_ACC_PARENT + '_raw'];
      var pid = Array.isArray(raw) ? (raw[0] && raw[0].id) : (raw && raw.id);
      if (pid === rid) out.push(recs[i]);
    }
    return out;
  }

  // ── TEMPORARY DIAGNOSTIC ─────────────────────────────────────────────
  // The removal cards render through the shared install card path (same as the
  // deploy page view_4093). Cards can only show fields the VIEW loads as
  // columns — so if view_4086 is set up with a narrower column set, fields
  // (Exterior / Existing / Plenum, and critically the bucket field that drives
  // cam classification) come back undefined and render blank. This logs, once
  // per page load, exactly which expected install fields view_4086 did NOT
  // load, so the Builder view can be brought to parity. Remove once view_4086
  // mirrors view_4093's columns.
  var DIAG = true;
  var _diagDone = {};
  function diagnoseMissingFields(viewKey) {
    if (!DIAG || _diagDone[viewKey]) return;
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    if (!recs.length) return;   // no data yet — try again next render
    _diagDone[viewKey] = true;

    // Union of every key present across the loaded records = the view's
    // column set (Knack view models carry only the exposed columns).
    var present = {};
    for (var i = 0; i < recs.length; i++) {
      for (var k in recs[i]) present[k] = true;
    }

    var F = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? ns.cfg.fields(viewKey) : {};
    var missing = [];
    var seen = {};
    for (var logical in F) {
      var fk = F[logical];
      if (!fk || seen[fk]) continue;
      seen[fk] = true;
      if (!present[fk] && !present[fk + '_raw']) {
        missing.push(fk + '  (' + logical + ')');
      }
    }

    if (missing.length) {
      console.warn('[scw-co-remove] ' + viewKey + ' is missing ' + missing.length +
        ' column(s) the install card reads — add these to ' + viewKey +
        ' to match view_4093 (removal cards render blank for them):\n  ' +
        missing.join('\n  '));
    } else {
      console.log('[scw-co-remove] ' + viewKey +
        ' exposes every expected install field. ✓');
    }
  }

  // Whether an install item is ALREADY removed by a change order. Reads the
  // install record's `Removed by Change Order` (field_2967, remove.removedByField)
  // — the one removal signal that lives ON the install record. It flips at
  // SIGNATURE, so an item freshly flagged on the CURRENT unsigned CO won't read
  // as removed here yet; the optimistic post-fire flip carries that within the
  // session (durable draft-time detection needs the field_2966 reciprocal
  // exposed on view_4086 — see docs/change-orders.md #7). view_4086 SHOULD also
  // filter these out server-side ("Removed by CO is blank"); this is the belt.
  function isFlagged(rec, vcfg) {
    var rb = vcfg && vcfg.remove && vcfg.remove.removedByField;
    if (!rb || !rec) return false;
    var raw = rec[rb + '_raw'];
    // Permissive: a single-connection value or a yes/no both read as removed.
    if (Array.isArray(raw)) return raw.length > 0;
    return !!(raw && (raw.id || raw === true || raw === 'Yes'));
  }

  // Stack the labor description beneath the product name (read-only) so the
  // removal grid reads like the adopt panel. The install card keeps the labor
  // description in the DETAIL panel for cam/default rows, so we read it off the
  // record and inject it here. Services/assumptions rows already show their
  // text in the product slot (installDescRO) — skip those (no product-name el).
  function injectDesc(card, rec, vcfg) {
    var prodCell = card.querySelector('.scw-ws-v2-cell--product');
    if (!prodCell) return;
    var nameEl = prodCell.querySelector('.scw-ws-v2-product-name');
    if (!nameEl) return;                                   // services/assumptions
    if (prodCell.querySelector('.scw-co-remove-desc')) return;   // already injected
    var F = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? ns.cfg.fields(vcfg.sourceViewKey) : {};
    var lk = (F && F.laborDesc) || 'field_2809';
    var txt = '';
    try {
      var v = rec[lk];
      txt = v == null ? '' : String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { /* ignore */ }
    if (!txt) return;
    var d = document.createElement('div');
    d.className = 'scw-co-remove-desc';
    d.textContent = txt;
    prodCell.appendChild(d);
  }

  // Accessory summary chips under the product name — the removal panel's
  // rows must show what mounting rides a remove/swap WITHOUT expanding the
  // card (the detail panel's read-only Mounting Hardware block only shows
  // once expanded). Reads the same child-side truth as everything else:
  // records whose parent back-pointer (install field_2853) names this row.
  // ⚠ Renders only what view_4086 actually loads — if the Builder view
  // filters accessory records out (or lacks the field_2853 column), there
  // is nothing to scan; diagnoseMissingFields calls that out in console.
  function injectAccessorySummary(card, rid, viewKey) {
    var prodCell = card.querySelector('.scw-ws-v2-cell--product');
    if (!prodCell) return;
    if (!prodCell.querySelector('.scw-ws-v2-product-name')) return;  // prose rows
    var Fv = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? (ns.cfg.fields(viewKey) || {}) : {};
    var accs = accessoryChildren(viewKey, rid);
    var existing = prodCell.querySelector('.scw-co-remove-accs');
    if (!accs.length) {
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }
    var chips = '';
    for (var i = 0; i < accs.length; i++) {
      var aRec = accs[i];
      if (!aRec || !aRec.id) continue;
      var lbl = readTxt(aRec, Fv.productName) ||
                readConn(aRec, Fv.product).label || '(accessory)';
      var q = parseFloat(readTxt(aRec, Fv.qty));
      if (isFinite(q) && q > 1) lbl += ' ×' + q;
      chips += '<span class="scw-co-remove-acc-chip" title="' + escHtml(lbl) +
        '">' + escHtml(lbl) + '</span>';
    }
    if (!chips) { if (existing) existing.parentNode.removeChild(existing); return; }
    var d = existing || document.createElement('div');
    d.className = 'scw-co-remove-accs';
    d.innerHTML = '<span class="scw-co-remove-accs-lbl">Accessories:</span>' + chips;
    if (!existing) prodCell.appendChild(d);
  }

  // ── Row restructure + control state ──────────────────────────────────
  // One-time per row: prepend the checkbox cell, append the action cell. The
  // trash cell is display:none'd by the readOnly lockdown, so the visible cell
  // count matches the 8-track grid above.
  function restructureRow(row, rid, viewKey) {
    if (row.hasAttribute('data-scw-co-remove-row')) return;

    var check = document.createElement('label');
    check.className = 'scw-co-remove-checkcell';
    check.innerHTML = '<input type="checkbox" class="' + CHECK_CLS + '" ' +
      'data-scw-co-remove-check="' + rid + '" ' +
      'data-scw-co-remove-view="' + viewKey + '" ' +
      'aria-label="Select for bulk removal">';
    check.addEventListener('click', function (e) { e.stopPropagation(); });
    row.insertBefore(check, row.firstChild);

    var act = document.createElement('span');
    act.className = 'scw-co-remove-actioncell';
    row.appendChild(act);

    row.setAttribute('data-scw-co-remove-row', '1');
  }

  // Column header: prepend an empty checkbox slot. The install header's
  // trailing (trash) slot shifts to the action column under the 8-track grid.
  function restructureHeaders(container) {
    var hdrs = container.querySelectorAll('.scw-ws-v2-col-header:not([data-scw-co-remove-hdr])');
    for (var i = 0; i < hdrs.length; i++) {
      var hdr = hdrs[i];
      hdr.setAttribute('data-scw-co-remove-hdr', '1');
      var lead = document.createElement('span');
      hdr.insertBefore(lead, hdr.firstChild);
    }
  }

  // state: 'live' (action buttons) | 'removed' (rose pill) |
  //        'swapped' (indigo pill — a linked Remove+Add pair is drafted).
  // canSwap: swaps are PRODUCT swaps at this stage — the button renders only
  // on rows that carry a product (services/assumptions have nothing to swap).
  function setRowState(row, rid, viewKey, state, canSwap) {
    var act = row.querySelector('.scw-co-remove-actioncell');
    var check = row.querySelector('.' + CHECK_CLS);
    var card = row.closest ? row.closest('.scw-ws-v2-card') : null;
    if (!act) return;
    function lockCheck() {
      if (check) { check.checked = false; check.disabled = true; check.style.visibility = 'hidden'; }
    }
    if (state === 'removed') {
      delete _sel[rid];
      act.innerHTML = '<span class="' + PILL_CLS + '" ' +
        'title="This install item is slated for removal on this change order">' +
        '− Slated for removal</span>';
      lockCheck();
      if (card) {
        card.classList.add('scw-co-remove-card--flagged');
        card.classList.remove('scw-co-swap-card--drafted');
      }
    } else if (state === 'swapped') {
      delete _sel[rid];
      act.innerHTML = '<span class="scw-co-swap-flagged" ' +
        'title="A product-swap pair for this item is drafted on this ' +
        'change order — the new CO line carries the replacement product">' +
        '⇄ Product swap drafted</span>';
      lockCheck();
      if (card) {
        card.classList.add('scw-co-swap-card--drafted');
        card.classList.remove('scw-co-remove-card--flagged');
      }
    } else {
      var haveRemove = !!act.querySelector('.' + BTN_CLS);
      var haveSwap   = !!act.querySelector('.scw-co-swap-btn');
      if (!haveRemove || haveSwap !== !!canSwap) {
        // Destructive action first, per the repo button-ordering convention.
        act.innerHTML = '<button type="button" class="' + BTN_CLS + '" ' +
          'data-scw-co-remove="' + rid + '" ' +
          'data-scw-co-remove-view="' + viewKey + '" ' +
          'title="Flag this install item for removal on the change order">− Remove</button>' +
          (canSwap
            ? '<button type="button" class="scw-co-swap-btn" ' +
              'data-scw-co-swap="' + rid + '" ' +
              'data-scw-co-remove-view="' + viewKey + '" ' +
              'title="Swap the product on this install item — pick the replacement, then ' +
              'a linked Remove + Add pair is drafted; everything else carries over and ' +
              'the item keeps its photos, QA and history (applies in place at ' +
              'signature)">⇄ Swap Product</button>'
            : '');
      }
      if (check) {
        check.disabled = false;
        check.style.visibility = '';
        check.checked = !!_sel[rid];
      }
      if (card) {
        card.classList.remove('scw-co-remove-card--flagged');
        card.classList.remove('scw-co-swap-card--drafted');
      }
    }
  }

  // ── Collapsible panel banner ────────────────────────────────────────
  function caretSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M6 9l6 6 6-6"></path></svg>';
  }
  var COLLAPSE_KEY = 'scwCoRemoveCollapsed:';
  function isCollapsed(viewKey) {
    // Default COLLAPSED (no stored preference) so the CO Line Items worksheet
    // is the focus on load — this source panel expands only when the user
    // wants to remove items. Once toggled, the stored choice wins.
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
    // Caret + markers only; the click is DELEGATED (below) so it survives any
    // banner rebuild. Idempotent via the caret guard.
    if (!banner.querySelector('.scw-co-remove-caret')) {
      banner.classList.add('scw-co-remove-collapsible');
      banner.setAttribute('role', 'button');
      banner.setAttribute('tabindex', '0');
      var caret = document.createElement('span');
      caret.className = 'scw-co-remove-caret';
      caret.innerHTML = caretSvg();
      banner.insertBefore(caret, banner.firstChild);
    }
    panel.classList.toggle('scw-ws-v2--co-remove-collapsed', isCollapsed(viewKey));
  }

  // Delegated collapse toggle — survives any banner rebuild.
  function toggleCollapseFromEvent(e) {
    var banner = e.target && e.target.closest &&
      e.target.closest('.scw-ws-v2-banner.scw-co-remove-collapsible');
    if (!banner) return;
    var panel = banner.closest('.scw-ws-v2');
    if (!panel || !panel.id) return;
    var viewKey = panel.id.replace(/^scw-ws-v2-/, '');
    var collapsed = panel.classList.toggle('scw-ws-v2--co-remove-collapsed');
    setCollapsed(viewKey, collapsed);
  }
  document.addEventListener('click', toggleCollapseFromEvent);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target &&
        e.target.classList && e.target.classList.contains('scw-co-remove-collapsible')) {
      e.preventDefault();
      toggleCollapseFromEvent(e);
    }
  });

  var _anySwappable = false;
  var _noSwapWarned = {};

  function decorate(vcfg) {
    var viewKey = vcfg.sourceViewKey;
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    injectStyles();
    ensureCollapsible(viewKey);

    var coId = getCoSowId();
    if (!coId) {
      console.warn(LOG_PREFIX, 'could not resolve the CO SOW id from the hash —',
        'removal controls suppressed this render');
      return;
    }

    diagnoseMissingFields(viewKey);   // TEMP: log columns view_4086 didn't load

    restructureHeaders(container);

    var byId = recordIndex(viewKey);
    var Fv = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? (ns.cfg.fields(viewKey) || {}) : {};
    // CO-line target counts (durable draft-state): 2+ lines targeting an
    // install id = swap pair, 1 = plain remove. null until field_2966 is a
    // column on the CO view — then optimistic sets + field_2967 carry it.
    var tc = coTargetCounts(viewKey);
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var rid  = card.getAttribute('data-scw-ws-v2-record');
      var rec  = byId[rid];
      var row  = card.querySelector('.scw-ws-v2-row');
      if (!row || !rec) continue;
      restructureRow(row, rid, viewKey);
      injectDesc(card, rec, vcfg);   // stack labor description under product (read-only)
      injectAccessorySummary(card, rid, viewKey);   // accessory chips on the row
      var state = 'live';
      if (_swappedOptimistic[rid] || (tc && tc[rid] >= 2)) {
        state = 'swapped';
      } else if (isFlagged(rec, vcfg) || _flaggedOptimistic[rid] ||
                 (tc && tc[rid] === 1)) {
        // field_2967 (durable, flips at signature) OR the session-optimistic
        // flag OR exactly one targeting CO line (a drafted Remove).
        state = 'removed';
      }
      // Product-only swaps: no product CONNECTION on the record (services /
      // assumptions) → nothing to swap, no button. Keyed off the _raw id —
      // the exact thing fireSwapBatch's payload needs.
      var canSwap = !!readConn(rec, Fv.product).id;
      if (canSwap) _anySwappable = true;
      setRowState(row, rid, viewKey, state, canSwap);
    }
    // Every row unswappable while rows exist = the product field isn't
    // readable here (column missing on the view, or a stale bundle without
    // the field map) — say so once, actionably.
    if (!_anySwappable && cards.length && !_noSwapWarned[viewKey]) {
      _noSwapWarned[viewKey] = true;
      console.warn(LOG_PREFIX, 'no rows are swappable on', viewKey,
        '— product field', (Fv.product || '(unmapped)'),
        'returned no connection id for any record. Check that the product',
        'column is on the view and the pinned bundle is current.');
    }

    // Keyboard belt for the readOnly lockdown (our own checkboxes stay live).
    if (vcfg.readOnly) {
      var inputs = container.querySelectorAll(
        '.scw-ws-v2-card input:not(.' + CHECK_CLS + '), ' +
        '.scw-ws-v2-card textarea, .scw-ws-v2-card select');
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = true;
    }

    updateBulkToolbar(viewKey);
  }

  function decorateSoon(vcfg) {
    setTimeout(function () { decorate(vcfg); }, 0);
  }

  // ── Bulk toolbar (floating, bottom-center) ──────────────────────────
  var _toolbar = null;
  function ensureBulkToolbar(viewKey) {
    if (_toolbar) return _toolbar;
    _toolbar = document.createElement('div');
    _toolbar.className = 'scw-ws-v2-bulk-toolbar scw-co-remove-toolbar';
    _toolbar.innerHTML =
      '<span class="scw-ws-v2-bulk-count">0 selected</span>' +
      '<button type="button" class="' + BULK_CLS + '" ' +
        'data-scw-co-remove-bulk="' + viewKey + '">Remove from Change Order</button>' +
      '<button type="button" class="scw-co-swap-bulk" ' +
        'data-scw-co-swap-bulk="' + viewKey + '">⇄ Swap Product</button>' +
      '<button type="button" class="scw-co-remove-clear" ' +
        'data-scw-co-remove-clear="' + viewKey + '">Clear</button>';
    document.body.appendChild(_toolbar);
    return _toolbar;
  }

  // Ids in the current selection that carry a product connection (the only
  // rows a product swap applies to — services/assumptions can't swap).
  function swappableSelection(viewKey) {
    var byId = recordIndex(viewKey);
    var Fv = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? (ns.cfg.fields(viewKey) || {}) : {};
    var out = [];
    for (var rid in _sel) {
      if (!Object.prototype.hasOwnProperty.call(_sel, rid)) continue;
      var rec = byId[rid];
      if (rec && readConn(rec, Fv.product).id) out.push(rid);
    }
    return out;
  }

  function updateBulkToolbar(viewKey) {
    var n = selCount();
    var bar = ensureBulkToolbar(viewKey);
    var count = bar.querySelector('.scw-ws-v2-bulk-count');
    if (count) count.textContent = n + ' selected';
    // Swap applies to the swappable subset — show its count when it differs
    // from the selection, disable at 0. Skipped while a batch is drafting so
    // a mid-batch re-render can't clobber the progress label.
    var sw = bar.querySelector('.scw-co-swap-bulk');
    if (sw && !sw.hasAttribute('data-scw-co-swap-busy')) {
      var swN = n ? swappableSelection(viewKey).length : 0;
      sw.disabled = !swN;
      sw.textContent = (swN && swN !== n)
        ? '⇄ Swap Product (' + swN + ')'
        : '⇄ Swap Product';
      sw.title = swN
        ? 'Swap the product on the selected item' + (swN === 1 ? '' : 's') +
          ' — pick one replacement; each gets a linked Remove + Add pair'
        : 'None of the selected rows has a product to swap';
    }
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

  // ── Removal write (Make webhook) — single + bulk share this ─────────
  // ids    = the ACTED-ON install items (devices / top-level rows) only.
  // accMap = deviceId → [accessory install ids] approved to ride along
  //          (null/empty when the confirm checkbox was unchecked or the
  //          devices have no accessories). Accessories are NEVER mixed into
  //          installItemIds — the payload keeps the parent relationship so
  //          Make can create each accessory's Remove line with its proper
  //          parent connection (see the contract comment in src/config.js).
  function fireRemove(ids, viewKey, ui, accMap) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_REMOVE_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('The change-order removal webhook is not configured yet.\n\n' +
        'This needs the Make scenario + the Builder fields (CO Action, Target ' +
        'install item, Removed by CO), then set MAKE_CO_REMOVE_ITEMS_WEBHOOK.');
      return;
    }
    var coId = getCoSowId();
    if (!coId) {
      alert('Could not determine the change order record id from the URL.');
      return;
    }

    ui.busy();

    // Structured payload: `items` pairs each device with ITS approved
    // accessories (nested-iterator pattern — no Make-side searches);
    // `accessoryInstallItemIds` is the same set flattened (search-and-filter
    // pattern for scenarios that loop a device's accessories from Knack).
    var items = [], accFlat = [];
    for (var bi = 0; bi < ids.length; bi++) {
      var aIds = (accMap && accMap[ids[bi]]) || [];
      items.push({ id: ids[bi], accessoryIds: aIds.slice() });
      accFlat.push.apply(accFlat, aIds);
    }
    var allIds = ids.concat(accFlat);   // optimistic-flip set (below)

    // Create one Remove line per install item on the CO. Make owns the record
    // creation (CO Action = Remove, Target install item → install id, connect
    // to the CO via field_2154). The install record's `Removed by CO` flip is
    // deferred to signature — this payload does NOT mutate install scope.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeOrderId:           coId,
        installItemIds:          ids,      // acted-on devices ONLY (1..N)
        accessoryInstallItemIds: accFlat,  // approved riders, flat
        items:                   items,    // [{ id, accessoryIds: [...] }]
        removal:                 true,
        triggeredBy:             getTriggeredBy()
      })
    }).then(function (resp) {
      // Make's Webhook Response module is inconsistent — depending on how the
      // scenario is set up it returns an empty body, the default "Accepted"
      // text, or JSON in a shape other than {success:true}. Keying success on
      // the body alone fired a false "failed to remove" toast even when the
      // scenario completed fine. Key on the HTTP status (2xx) instead, and only
      // treat it as a failure when the body EXPLICITLY says so.
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
        // Optimistic flip to the Flagged state (devices + included
        // accessories); the refetches below make it durable (and land the
        // Remove lines on the CO worksheet).
        var container = document.getElementById('scw-ws-v2-' + viewKey);
        for (var k = 0; k < allIds.length; k++) {
          delete _sel[allIds[k]];
          _flaggedOptimistic[allIds[k]] = true;   // survive rebuilds until field_2967 lands
          if (!container) continue;
          var card = container.querySelector(
            '.scw-ws-v2-card[data-scw-ws-v2-record="' + allIds[k] + '"]');
          var row = card && card.querySelector('.scw-ws-v2-row');
          if (row) setRowState(row, allIds[k], viewKey, 'removed');
        }
        updateBulkToolbar(viewKey);
        // Repatch the install grid — the refetch repopulates field_2967 so the
        // just-removed item(s) render in the red "slated for removal" state
        // (and the new Remove line lands on the CO worksheet).
        refetchAfterRemove(viewKey);
        ui.done();
        return;
      }
      ui.fail();
      alert((data && (data.error || data.message)) ||
        'Failed to flag the item' + (ids.length > 1 ? 's' : '') + ' for removal.');
    }).catch(function (err) {
      ui.fail();
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // ── Remove confirm (single + bulk) — with the accessory choice ────────
  // A device's accessory children DEFAULT to riding the removal (checkbox,
  // checked — removing a camera usually removes its mount), but ops can
  // uncheck to leave them installed (e.g. the mount stays for a future
  // device). SWAP has no such choice by design: accessories ALWAYS ride the
  // swap's remove side (fireSwapBatch) — the replacement may need different
  // mounting and the paired Add side re-covers it.
  function confirmRemove(ids, viewKey, ui) {
    // Per-device accessory map — the payload keeps each accessory under ITS
    // parent so Make can preserve the relationship on the created lines.
    var accMap = {}, accIds = [], seen = {};
    for (var i = 0; i < ids.length; i++) {
      var kids = accessoryChildren(viewKey, ids[i]);
      for (var k = 0; k < kids.length; k++) {
        var aid = kids[k] && kids[k].id;
        if (aid && !seen[aid] && ids.indexOf(aid) === -1) {
          seen[aid] = 1; accIds.push(aid);
          (accMap[ids[i]] || (accMap[ids[i]] = [])).push(aid);
        }
      }
    }
    var n = ids.length;
    var one = n === 1;
    if (!accIds.length ||
        !(ns.confirmModal && typeof ns.confirmModal === 'function')) {
      // No accessories involved (or no modal to host the choice — then
      // accessories ride along by default, stated in the prompt).
      var msg = 'Flag ' + (one ? 'this install item' : n + ' selected install items') +
        ' for removal on the change order?' +
        (accIds.length
          ? '\n\n(' + (one ? 'Its ' : 'Their ') + accIds.length +
            ' associated accessor' + (accIds.length === 1 ? 'y is' : 'ies are') +
            ' included.)'
          : '');
      if (!window.confirm(msg)) return;
      fireRemove(ids, viewKey, ui, accMap);
      return;
    }
    var includeAccs = true;   // default: the mounting goes with the device
    var accWord = 'accessor' + (accIds.length === 1 ? 'y' : 'ies');
    var body =
      'This drafts a <b>Remove</b> line on the change order for each item — ' +
      'nothing leaves install scope until the CO is signed.' +
      '<label class="scw-co-remove-accopt">' +
        '<input type="checkbox" id="scw-co-remove-incacc" checked>' +
        '<span>Also remove ' + (one ? 'its' : 'their') + ' <b>' +
          accIds.length + ' associated ' + accWord + '</b> ' +
          '(the mounting hardware is credited on the CO too)</span>' +
      '</label>' +
      '<span class="scw-co-remove-accopt-note">Uncheck to leave the ' +
        accWord + ' installed — e.g. when the mount stays in place for a ' +
        'future device.</span>';
    ns.confirmModal({
      title: one ? 'Flag this install item for removal?'
                 : 'Flag ' + n + ' install items for removal?',
      body: body,
      okLabel: 'Flag for removal',
      cancelLabel: 'Cancel'
    }).then(function (ok) {
      if (!ok) return;
      fireRemove(ids, viewKey, ui, includeAccs ? accMap : null);
    });
    // The overlay is in the DOM the moment confirmModal returns — track the
    // checkbox live so the state is known before the modal tears down.
    var cb = document.getElementById('scw-co-remove-incacc');
    if (cb) cb.addEventListener('change', function () { includeAccs = cb.checked; });
  }

  // ── Swap write — drafts the pair through the two EXISTING scenarios ────
  // No dedicated swap scenario: the gesture fires the ADD hook
  // (MAKE_CO_ADD_ITEMS_WEBHOOK) with the install item's config cloned into
  // the normal add payload + `swap: true` + `targetInstallItemId`, then the
  // REMOVE hook (MAKE_CO_REMOVE_ITEMS_WEBHOOK) exactly as a plain removal.
  // Make-side deltas: the ADD scenario maps targetInstallItemId →
  // field_2966 on the created line (and must skip any default-accessory
  // auto-adds when swap=true); the REMOVE scenario needs no change.
  //
  // ORDER MATTERS — ADD first, REMOVE second: a lone target-linked Add is
  // apply-safe (product PUT + a missing credit line, pricing-only gap),
  // while a lone Remove would actually REMOVE the install item at
  // signature. Never risk the second.
  function readConn(rec, fk) {
    var raw = fk ? rec[fk + '_raw'] : null;
    var one = Array.isArray(raw) ? raw[0] : raw;
    return {
      id:    (one && one.id) || '',
      label: one ? String(one.identifier || '').replace(/<[^>]*>/g, '').trim() : ''
    };
  }
  function readTxt(rec, fk) {
    var v = fk ? rec[fk] : null;
    return v == null ? ''
      : String(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ').trim();
  }
  function readYes(rec, fk) {
    return /^(yes|true)$/i.test(readTxt(rec, fk));
  }

  function postHook(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      // Status-keyed success (same read as fireRemove) — Make's ack body
      // shape varies; only an explicit {success:false}/{error} is a failure.
      var ok = resp.ok;
      return resp.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        var explicitFail = !!(body && (body.success === false || body.error));
        return { ok: ok && !explicitFail, data: body };
      });
    });
  }

  // Bucket-filtered replacement-product candidates — same sources + rules as
  // the CO add-item modal (SCW.productMap names, SCW.productBucketMap /
  // productMap.buckets membership; no bucket data anywhere = universal). Falls
  // back to the products in use on THIS view when the catalog snippet is
  // absent (Known Issue #17) so the picker still opens.
  function swapProductCandidates(bucketId, viewKey, Fv) {
    var pmap = (window.SCW && SCW.productMap) || {};
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    function allowed(pid, p) {
      if (!bucketId) return true;
      var known = false, hit = false;
      if (p && Array.isArray(p.buckets) && p.buckets.length) {
        known = true; if (p.buckets.indexOf(bucketId) !== -1) hit = true;
      }
      if (!hit && bmap && bmap[pid] && bmap[pid].length) {
        known = true; if (bmap[pid].indexOf(bucketId) !== -1) hit = true;
      }
      return known ? hit : true;
    }
    var out = [], id, p;
    for (id in pmap) {
      if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
      p = pmap[id];
      if (p && allowed(id, p)) {
        out.push({ id: id, name: p.name || '(unnamed)', sub: p.sku || '' });
      }
    }
    if (!out.length) {
      var seen = Object.create(null);
      var recs = (ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(viewKey) : [];
      for (var i = 0; i < recs.length; i++) {
        var c = readConn(recs[i] || {}, Fv.product);
        if (c.id && !seen[c.id]) {
          seen[c.id] = 1;
          out.push({ id: c.id, name: c.label || c.id });
        }
      }
      if (out.length) {
        console.warn(LOG_PREFIX, 'SCW.productMap unavailable — swap picker ' +
          'shows in-use products only (' + out.length + ').');
      }
    }
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  // ── Swap gesture: pick the replacement → confirm → draft the pairs ────
  // Shared by the single-row button (rids = [rid]) and the bulk toolbar.
  function openSwapPicker(rids, viewKey, ui) {
    if (!ns.picker || typeof ns.picker.open !== 'function') {
      alert('The record picker module is not loaded — cannot open the product list.');
      return;
    }
    var byId = recordIndex(viewKey);
    var Fv = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? (ns.cfg.fields(viewKey) || {}) : {};
    var jobs = [], skippedNoProduct = 0;
    for (var i = 0; i < rids.length; i++) {
      var rec = byId[rids[i]];
      var prod = rec ? readConn(rec, Fv.product) : { id: '' };
      if (!rec || !prod.id) { skippedNoProduct++; continue; }   // services/assumptions
      jobs.push({ rid: rids[i], rec: rec, product: prod,
                  bucket: readConn(rec, Fv.bucket) });
    }
    if (!jobs.length) {
      alert('None of the selected items has a product to swap — services and ' +
        'assumption rows can only be removed.');
      return;
    }
    // ONE replacement serves the whole batch, and the picker filters by
    // bucket — so a bulk swap must stay within one product category.
    var buckets = {};
    for (var b = 0; b < jobs.length; b++) {
      if (jobs[b].bucket.id) buckets[jobs[b].bucket.id] = jobs[b].bucket.label;
    }
    var bucketIds = Object.keys(buckets);
    if (bucketIds.length > 1) {
      var names = bucketIds.map(function (k) { return buckets[k] || k; });
      alert('The selected items span more than one product category (' +
        names.join(', ') + ') — one replacement product can’t fit them ' +
        'all.\n\nSwap one category at a time.');
      return;
    }
    var bucketId = bucketIds[0] || '';

    function openIt() {
      var candidates = swapProductCandidates(bucketId, viewKey, Fv);
      if (!candidates.length) {
        alert('The product catalog hasn’t loaded yet, so there are no ' +
          'products to choose from. Refresh the page and try again.');
        return;
      }
      ns.picker.open({
        sourceViewKey: viewKey,
        putViewKey:    viewKey,
        recordId:      jobs[0].rid,
        fieldKey:      'scwswap',      // pickOnly — never written anywhere
        label:         jobs.length === 1
          ? 'Replacement product · now ' + (jobs[0].product.label || '—')
          : 'Replacement product · ' + jobs.length + ' items',
        selectedIds:   [],
        candidates:    candidates,
        itemLabel:     function (c) { return c.name || c.id; },
        multi:         false,
        allowClear:    false,
        pickOnly:      true,
        onChoose:      function (ids) {
          if (!ids || !ids.length) return;
          var pid = ids[0], pname = pid;
          for (var c = 0; c < candidates.length; c++) {
            if (candidates[c].id === pid) { pname = candidates[c].name; break; }
          }
          confirmSwap(jobs, viewKey, { id: pid, name: pname },
            skippedNoProduct, ui);
        }
      });
    }

    // Wait briefly for the product catalog (same race the worksheet's product
    // picker handles) so a cold click doesn't open an empty list.
    if (window.SCW && SCW.productMap && Object.keys(SCW.productMap).length) {
      openIt();
    } else if (window.SCW && SCW.productMapReady &&
               typeof SCW.productMapReady.then === 'function') {
      var opened = false;
      var openOnce = function () { if (!opened) { opened = true; openIt(); } };
      var t = setTimeout(openOnce, 1500);
      SCW.productMapReady.then(
        function () { clearTimeout(t); openOnce(); },
        function () { clearTimeout(t); openOnce(); });
    } else {
      openIt();
    }
  }

  function confirmSwap(jobs, viewKey, replacement, skippedNoProduct, ui) {
    // Swapping an item to the product it already has is a no-op pair —
    // drop those instead of drafting noise on the CO.
    var run = [], alreadyN = 0;
    for (var i = 0; i < jobs.length; i++) {
      if (jobs[i].product.id === replacement.id) alreadyN++;
      else run.push(jobs[i]);
    }
    if (!run.length) {
      alert(jobs.length === 1
        ? 'That is already this item’s product — pick a different replacement.'
        : 'Every selected item already has that product — nothing to swap.');
      return;
    }
    var accTotal = 0;
    for (var a = 0; a < run.length; a++) {
      accTotal += accessoryChildren(viewKey, run[a].rid).length;
    }
    var single = run.length === 1;
    var body =
      'This swaps the <b>product only</b> — ' +
      (single ? 'the item stays' : 'each item stays') +
      ' installed at the same drop with its photos, QA and install history, ' +
      'and everything else (location, cabling, config) carries over unchanged.' +
      '<br><br>It drafts a linked pair on the change order' +
      (single ? '' : ' for each item') + ': a <b>Remove</b> (credit for ' +
      (single
        ? '<b>' + escHtml(run[0].product.label || 'the current product') + '</b>'
        : 'its current product') +
      ') and an <b>Add</b> for <b>' + escHtml(replacement.name) + '</b>.' +
      (accTotal
        ? '<br><br>' + (single ? 'Its ' : 'Their ') + accTotal + ' accessor' +
          (accTotal === 1 ? 'y comes' : 'ies come') +
          ' along as paired lines too, so the CO shows the mounting being ' +
          'credited and re-added — if the replacement needs a different ' +
          'mount, swap that product on its CO line (the mismatch warning ' +
          'will flag it).'
        : '') +
      ((alreadyN || skippedNoProduct)
        ? '<br><br><i>' +
          (alreadyN
            ? alreadyN + ' selected item' + (alreadyN === 1 ? ' already has' : 's already have') +
              ' this product — skipped. '
            : '') +
          (skippedNoProduct
            ? skippedNoProduct + ' selected row' + (skippedNoProduct === 1 ? ' has' : 's have') +
              ' no product (services/assumptions) — skipped.'
            : '') +
          '</i>'
        : '') +
      '<br><br>On signature the product change applies <b>in place</b> to ' +
      'the existing install record' + (single ? '' : 's') + '.';
    var title = single
      ? 'Swap the product on this install item?'
      : 'Draft product swaps for ' + run.length + ' install items?';
    var go = function () { fireSwapBatch(run, viewKey, replacement, ui); };
    if (ns.confirmModal && typeof ns.confirmModal === 'function') {
      ns.confirmModal({
        title: title,
        body: body,
        okLabel: single ? 'Draft product swap' : 'Draft ' + run.length + ' product swaps',
        cancelLabel: 'Cancel'
      }).then(function (ok) { if (ok) go(); });
    } else if (window.confirm(title + ' This drafts a linked Remove + Add ' +
        'pair per item on the change order, with ' + replacement.name +
        ' on the Add line' + (single ? '' : 's') + '.')) {
      go();
    }
  }

  // jobs: [{rid, rec, product}] — already swappable and not-already-the-
  // replacement. Fires ONE add per item (sequential — keeps the created CO
  // lines in selection order and Make's queue happy), then ONE remove call
  // covering every successfully-added device + its accessories. ADD first,
  // REMOVE second (a lone target-linked Add is apply-safe; a lone Remove is
  // not) — and an item whose Add failed is left OUT of the remove entirely,
  // so it stays live and untouched (still selected, retryable).
  function fireSwapBatch(jobs, viewKey, replacement, ui) {
    var addUrl = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ADD_ITEMS_WEBHOOK) || '';
    var remUrl = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_REMOVE_ITEMS_WEBHOOK) || '';
    if (!addUrl || /PLACEHOLDER/.test(addUrl) || !remUrl || /PLACEHOLDER/.test(remUrl)) {
      alert('The change-order add/remove webhooks are not both configured — the swap needs both.');
      return;
    }
    var coId = getCoSowId();
    if (!coId) {
      alert('Could not determine the change order record id from the URL.');
      return;
    }
    var Fv = (ns.cfg && typeof ns.cfg.fields === 'function')
      ? (ns.cfg.fields(viewKey) || {}) : {};

    // Build every payload up front — records can re-render mid-batch.
    var work = [];
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      var rec = job.rec;
      // Accessory children ride the swap as their OWN pairs, so the CO shows
      // exactly what mounting is being credited and re-added (and the sub
      // can price it). Each entry carries the accessory's PRODUCT (what its
      // Add line is created with — accessories keep their CURRENT product;
      // only the device gets the replacement) and its own INSTALL record id
      // (what the created line's field_2966 must target). Their Remove lines
      // join the device's in the single remove-hook call below.
      var accs = accessoryChildren(viewKey, job.rid);
      var swapAccessories = [], accInstallIds = [];
      for (var ai = 0; ai < accs.length; ai++) {
        var aRec = accs[ai];
        var aProd = readConn(aRec, Fv.product);
        if (!aRec || !aRec.id || !aProd.id) continue;   // no product → nothing to pair
        accInstallIds.push(aRec.id);
        swapAccessories.push({
          productId:           aProd.id,
          productName:         aProd.label,
          targetInstallItemId: aRec.id,
          qty:                 readTxt(aRec, Fv.qty) || '1'
        });
      }
      var bucket = readConn(rec, Fv.bucket);
      var mdf    = readConn(rec, Fv.mdfIdf);
      var prefix = readConn(rec, Fv.dropPrefix);
      // The ADD scenario's normal payload (co-add-item-form.js shape) with
      // the install item's values cloned in, plus the swap extras.
      // accessoryIds stays [] on purpose — the scenario's normal accessory
      // path can't target field_2966, so swap accessories go through
      // `swapAccessories` (see the contract comment in src/config.js).
      work.push({
        rid: job.rid,
        accInstallIds: accInstallIds,
        payload: {
          coSowId:         coId,
          bucketId:        bucket.id,
          bucketName:      bucket.label,
          // The REPLACEMENT the user picked — the Add line is born with it.
          productIds:      [replacement.id],
          accessoryIds:    [],
          mdfIds:          mdf.id ? [mdf.id] : [],
          qty:             readTxt(rec, Fv.qty) || '1',
          prefixId:        prefix.id,
          prefix:          prefix.label,
          startNumber:     readTxt(rec, Fv.dropNumber),
          existingCabling: readYes(rec, Fv.existCabling),
          exterior:        readYes(rec, Fv.exterior),
          plenum:          readYes(rec, Fv.plenum),
          serviceCost:     '',
          description:     readTxt(rec, Fv.laborDesc),
          notes:           readTxt(rec, Fv.scwNotes),
          triggeredBy:     getTriggeredBy(),
          origin:          'ops',
          originPage:      viewKey,
          originView:      viewKey,
          originScene:     (typeof Knack !== 'undefined' && Knack.router &&
                            Knack.router.current_scene_key) || '',
          // ── Swap extras — the add scenario maps these:
          swap:                true,
          targetInstallItemId: job.rid,   // → field_2966 on the created Add line
          // The credited (current) product — informational context for the
          // scenario / notifications; the credit itself is the Remove line.
          swapFromProductId:   job.product.id,
          swapFromProductName: job.product.label,
          swapAccessories:     swapAccessories,
          // Extra config the form never collects, included so the scenario
          // can clone it too if mapped (additive keys — unmapped is harmless).
          dropLength:          readTxt(rec, Fv.dropLength),
          conduit:             readTxt(rec, Fv.conduit)
        }
      });
    }

    ui.busy();
    var okWork = [], failN = 0;
    var chain = Promise.resolve();
    work.forEach(function (w, idx) {
      chain = chain.then(function () {
        if (typeof ui.progress === 'function') ui.progress(idx + 1, work.length);
        return postHook(addUrl, w.payload).then(function (r) {
          if (r.ok) okWork.push(w); else failN++;
        }, function () { failN++; });   // one item's error must not stop the batch
      });
    });
    chain.then(function () {
      if (!okWork.length) {
        ui.fail();
        alert('Failed to draft the swap’s Add line' +
          (work.length > 1 ? 's' : '') + ' — nothing was created or removed.');
        return null;
      }
      // Adds landed → the credit lines, one call for the whole batch. Same
      // structured shape as a plain removal — devices in installItemIds,
      // each device's accessories under it in `items` (and flattened in
      // accessoryInstallItemIds) so the scenario keeps the parent
      // relationship on the accessory Remove lines — plus the swap flag
      // (informational; the pairing lives on the field_2966 targets).
      var remIds = [], remItems = [], remAccFlat = [];
      for (var k = 0; k < okWork.length; k++) {
        remIds.push(okWork[k].rid);
        remItems.push({ id: okWork[k].rid,
                        accessoryIds: okWork[k].accInstallIds.slice() });
        remAccFlat.push.apply(remAccFlat, okWork[k].accInstallIds);
      }
      return postHook(remUrl, {
        changeOrderId:           coId,
        installItemIds:          remIds,
        accessoryInstallItemIds: remAccFlat,
        items:                   remItems,
        removal:                 true,
        swap:                    true,
        triggeredBy:             getTriggeredBy()
      }).then(function (remR) {
        if (!remR.ok) {
          ui.fail();
          alert('The swap’s Add (charge) line' +
            (okWork.length > 1 ? 's were' : ' was') + ' drafted, but the ' +
            'Remove (credit) call failed.\n\nSelect the affected item' +
            (okWork.length > 1 ? 's' : '') + ' and use “Remove from ' +
            'Change Order” to complete the pair' +
            (okWork.length > 1 ? 's' : '') + ' — do NOT Swap again (that ' +
            'would draft duplicate Add lines).');
          return null;
        }
        var container = document.getElementById('scw-ws-v2-' + viewKey);
        for (var m = 0; m < okWork.length; m++) {
          var rid = okWork[m].rid;
          delete _sel[rid];
          _swappedOptimistic[rid] = true;   // survives rebuilds this session
          var card = container && container.querySelector(
            '.scw-ws-v2-card[data-scw-ws-v2-record="' + rid + '"]');
          var row = card && card.querySelector('.scw-ws-v2-row');
          if (row) setRowState(row, rid, viewKey, 'swapped');
        }
        updateBulkToolbar(viewKey);
        refetchAfterRemove(viewKey);   // lands the pairs on the CO worksheet
        ui.done();
        if (failN) {
          alert(failN + ' of ' + work.length + ' swap' +
            (work.length === 1 ? '' : 's') + ' failed to draft and ' +
            (failN === 1 ? 'was' : 'were') + ' left untouched — ' +
            (failN === 1 ? 'it stays' : 'they stay') + ' selected; try again.');
        }
        return true;
      });
    }).catch(function (err) {
      ui.fail();
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // Staggered refetches — Make's writes land asynchronously after the response.
  function refetchAfterRemove(removeViewKey) {
    function refetch() {
      [coViewFor(removeViewKey), removeViewKey].forEach(function (vk) {
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
  var views = removeViews();
  if (!views.length) return;

  views.forEach(function (vcfg) {
    if (ns.data && typeof ns.data.subscribe === 'function') {
      ns.data.subscribe(vcfg.sourceViewKey, function () { decorateSoon(vcfg); });
    }
    $(document).on('knack-view-render.' + vcfg.sourceViewKey + '.scwCoRemove',
      function () { decorateSoon(vcfg); });
  });

  // Selection tracking — delegated so re-rendered checkboxes keep working.
  document.addEventListener('change', function (e) {
    var box = e.target;
    if (!box || !box.classList || !box.classList.contains(CHECK_CLS)) return;
    var rid = box.getAttribute('data-scw-co-remove-check');
    var vk  = box.getAttribute('data-scw-co-remove-view');
    if (!rid) return;
    if (box.checked) _sel[rid] = true; else delete _sel[rid];
    updateBulkToolbar(vk);
  }, true);

  document.addEventListener('click', function (e) {
    // Single-row "− Remove".
    var btn = e.target && e.target.closest &&
      e.target.closest('.' + BTN_CLS + '[data-scw-co-remove]');
    if (btn && !btn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var rid = btn.getAttribute('data-scw-co-remove');
      var vk  = btn.getAttribute('data-scw-co-remove-view');
      confirmRemove([rid], vk, {
        busy: function () {
          btn.disabled = true;
          btn.innerHTML = '<span class="scw-co-remove-spin"></span> Removing…';
        },
        done: function () { /* row flipped to Flagged by fireRemove */ },
        fail: function () { btn.disabled = false; btn.textContent = '− Remove'; }
      });
      return;
    }
    // Single-row "⇄ Swap" — pick the replacement product, confirm, then the
    // linked Remove + Add pair is drafted with the replacement on the Add.
    var swapBtn = e.target && e.target.closest &&
      e.target.closest('.scw-co-swap-btn[data-scw-co-swap]');
    if (swapBtn && !swapBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var srid = swapBtn.getAttribute('data-scw-co-swap');
      var svk  = swapBtn.getAttribute('data-scw-co-remove-view');
      openSwapPicker([srid], svk, {
        busy: function () {
          swapBtn.disabled = true;
          swapBtn.innerHTML = '<span class="scw-co-remove-spin"></span> Drafting…';
        },
        done: function () { /* row flipped to Product swap drafted */ },
        fail: function () { swapBtn.disabled = false; swapBtn.textContent = '⇄ Swap Product'; }
      });
      return;
    }
    // Bulk "Remove from Change Order" in the floating toolbar.
    var bulk = e.target && e.target.closest &&
      e.target.closest('.' + BULK_CLS + '[data-scw-co-remove-bulk]');
    if (bulk && !bulk.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var ids = Object.keys(_sel);
      if (!ids.length) return;
      var vkB = bulk.getAttribute('data-scw-co-remove-bulk');
      confirmRemove(ids, vkB, {
        busy: function () {
          bulk.disabled = true;
          bulk.innerHTML = '<span class="scw-co-remove-spin"></span> Removing…';
        },
        done: function () {
          bulk.disabled = false;
          bulk.textContent = 'Remove from Change Order';
          updateBulkToolbar(vkB);
        },
        fail: function () {
          bulk.disabled = false;
          bulk.textContent = 'Remove from Change Order';
          updateBulkToolbar(vkB);
        }
      });
      return;
    }
    // Bulk "⇄ Swap Product" — one picked replacement across the selection.
    var bulkSwap = e.target && e.target.closest &&
      e.target.closest('.scw-co-swap-bulk[data-scw-co-swap-bulk]');
    if (bulkSwap && !bulkSwap.disabled) {
      e.preventDefault();
      e.stopPropagation();
      var vkS  = bulkSwap.getAttribute('data-scw-co-swap-bulk');
      var idsS = Object.keys(_sel);
      if (!idsS.length) return;
      openSwapPicker(idsS, vkS, {
        busy: function () {
          bulkSwap.disabled = true;
          bulkSwap.setAttribute('data-scw-co-swap-busy', '1');
          bulkSwap.innerHTML = '<span class="scw-co-remove-spin"></span> Drafting…';
        },
        progress: function (done, total) {
          bulkSwap.innerHTML = '<span class="scw-co-remove-spin"></span> ' +
            'Drafting ' + done + ' / ' + total + '…';
        },
        done: function () {
          bulkSwap.disabled = false;
          bulkSwap.removeAttribute('data-scw-co-swap-busy');
          bulkSwap.textContent = '⇄ Swap Product';
          updateBulkToolbar(vkS);
        },
        fail: function () {
          bulkSwap.disabled = false;
          bulkSwap.removeAttribute('data-scw-co-swap-busy');
          bulkSwap.textContent = '⇄ Swap Product';
          updateBulkToolbar(vkS);
        }
      });
      return;
    }
    // Clear selection.
    var clr = e.target && e.target.closest &&
      e.target.closest('.scw-co-remove-clear[data-scw-co-remove-clear]');
    if (clr) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection(clr.getAttribute('data-scw-co-remove-clear'));
    }
  }, true);
})();
/*** END WORKSHEET V2 — CHANGE ORDER: remove active install line items *******/
