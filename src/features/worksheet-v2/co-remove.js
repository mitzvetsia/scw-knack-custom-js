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
      '    150px                 /* remove action (fits "− Slated for removal") */ !important;',
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

  function setRowState(row, rid, viewKey, flagged) {
    var act = row.querySelector('.scw-co-remove-actioncell');
    var check = row.querySelector('.' + CHECK_CLS);
    var card = row.closest ? row.closest('.scw-ws-v2-card') : null;
    if (!act) return;
    if (flagged) {
      delete _sel[rid];
      act.innerHTML = '<span class="' + PILL_CLS + '" ' +
        'title="This install item is slated for removal on this change order">' +
        '− Slated for removal</span>';
      // Disable + hide the bulk checkbox so a flagged item can\'t be re-removed.
      if (check) { check.checked = false; check.disabled = true; check.style.visibility = 'hidden'; }
      if (card) card.classList.add('scw-co-remove-card--flagged');
    } else {
      if (!act.querySelector('.' + BTN_CLS)) {
        act.innerHTML = '<button type="button" class="' + BTN_CLS + '" ' +
          'data-scw-co-remove="' + rid + '" ' +
          'data-scw-co-remove-view="' + viewKey + '" ' +
          'title="Flag this install item for removal on the change order">− Remove</button>';
      }
      if (check) {
        check.disabled = false;
        check.style.visibility = '';
        check.checked = !!_sel[rid];
      }
      if (card) card.classList.remove('scw-co-remove-card--flagged');
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
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var rid  = card.getAttribute('data-scw-ws-v2-record');
      var rec  = byId[rid];
      var row  = card.querySelector('.scw-ws-v2-row');
      if (!row || !rec) continue;
      restructureRow(row, rid, viewKey);
      injectDesc(card, rec, vcfg);   // stack labor description under product (read-only)
      // field_2967 (durable) OR the session-optimistic flag (covers the gap
      // before Make writes field_2967 after a fresh removal).
      setRowState(row, rid, viewKey, isFlagged(rec, vcfg) || !!_flaggedOptimistic[rid]);
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
      '<button type="button" class="scw-co-remove-clear" ' +
        'data-scw-co-remove-clear="' + viewKey + '">Clear</button>';
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

  // ── Removal write (Make webhook) — single + bulk share this ─────────
  function fireRemove(ids, viewKey, ui) {
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

    // Create one Remove line per install item on the CO. Make owns the record
    // creation (CO Action = Remove, Target install item → install id, connect
    // to the CO via field_2154). The install record's `Removed by CO` flip is
    // deferred to signature — this payload does NOT mutate install scope.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeOrderId:  coId,
        installItemIds: ids,        // always an array (1..N) — single & bulk identical
        removal:        true,
        triggeredBy:    getTriggeredBy()
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
        // Optimistic flip to the Flagged state; the refetches below make it
        // durable (and land the Remove lines on the CO worksheet).
        var container = document.getElementById('scw-ws-v2-' + viewKey);
        for (var k = 0; k < ids.length; k++) {
          delete _sel[ids[k]];
          _flaggedOptimistic[ids[k]] = true;   // survive rebuilds until field_2967 lands
          if (!container) continue;
          var card = container.querySelector(
            '.scw-ws-v2-card[data-scw-ws-v2-record="' + ids[k] + '"]');
          var row = card && card.querySelector('.scw-ws-v2-row');
          if (row) setRowState(row, ids[k], viewKey, true);
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
      if (!window.confirm('Flag this install item for removal on the change order?')) return;
      fireRemove([rid], vk, {
        busy: function () {
          btn.disabled = true;
          btn.innerHTML = '<span class="scw-co-remove-spin"></span> Removing…';
        },
        done: function () { /* row flipped to Flagged by fireRemove */ },
        fail: function () { btn.disabled = false; btn.textContent = '− Remove'; }
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
      if (!window.confirm('Flag ' + ids.length + ' selected install item' +
          (ids.length === 1 ? '' : 's') + ' for removal on this change order?')) return;
      var vkB = bulk.getAttribute('data-scw-co-remove-bulk');
      fireRemove(ids, vkB, {
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
