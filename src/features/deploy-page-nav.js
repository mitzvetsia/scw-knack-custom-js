/*** DEPLOY PAGE NAV + CHANGE-ORDER RELOCATION (scene_1311 + scene_1353) *****
 *
 * Two structural fixes for the manage-deployment pages — the internal ops
 * scene (scene_1311) AND the subcontractor deployment dashboard
 * (scene_1353), which read as nine co-equal accordion bars with no
 * hierarchy:
 *
 *   1. STAGE TILES (docs/deploy-page-redesign.md, Phase I) — a four-tile
 *      status strip above the sections: Paperwork & billing, Project setup,
 *      Installation (the v2 worksheet, always "current"), Closeout. Each
 *      tile reads the rollup its section already renders (acceptance tally,
 *      questionnaire status, closeout docs, worksheet warn chips + photo
 *      slots) and smooth-scrolls to the section on click (auto-expanding a
 *      collapsed accordion). Sections that aren't a stage (Other Files,
 *      Additional Photos, Project Notes, Change Orders) sit in an "Also on
 *      this project" chip row beneath the tiles until the drawers land.
 *
 *   2. CHANGE ORDERS ← WORKSHEET — the Change Orders grid + "Create Change
 *      Order" CTA used to sit at the very bottom of the page, ~2000px from
 *      the install worksheet whose "Removed by CO" rows they explain. Both
 *      views are MOVED into a strip directly ABOVE the worksheet mount.
 *      Knack re-renders views in place by element id, so a relocated view
 *      keeps working; a scene re-render rebuilds everything and the
 *      debounced pass re-applies the move.
 *
 * View-id resilience: the CO grid and CTA are found by TITLE ("Change
 * Orders" grid header / a link whose text is "Create Change Order"), not
 * hardcoded view ids — Builder reshuffles won't silently break the move
 * (worst case: nothing matches and the page keeps its native order). That
 * also makes the sub scene nearly free: only the scene id, the worksheet
 * mount id, and the questionnaire view key differ per deployment.
 ****************************************************************************/
(function () {
  'use strict';

  // One entry per deployment page. Only one scene renders at a time, so the
  // injected element ids (nav / strip / bands) stay shared — they live
  // inside the scene container and die with it on navigation.
  var SCENES = [
    { sceneId: 'scene_1311',                 // internal ops deploy page
      worksheetMount: 'scw-ws-v2-view_4093',
      questionnaireView: 'view_4015',
      // DOC_files grids whose models the Setup drawer reads for the BLANK
      // generated PDFs the sub prints and gets completed on site: the
      // "Other Files" gallery (the generator files them there, typed
      // "… (not completed)") first, then the closeout save grid (kickoff
      // deck). Completed uploads are Closeout's business, not Setup's.
      docsViews: ['view_3942', 'view_3941'] },
    { sceneId: 'scene_1353',                 // subcontractor deployment dashboard
      worksheetMount: 'scw-ws-v2-view_4056',
      questionnaireView: 'view_4053',
      docsViews: ['view_4063', 'view_4068'] }
  ];
  // DOC_files columns on the docs views.
  var DOC_F = { type: 'field_2877', file: 'field_68', notes: 'field_588' };
  // The documents generated at setup, in display order, matched on the
  // CONFIG_file type name. The approval forms match ONLY their blank
  // "(not completed)" incarnation — the completed upload has the same base
  // name and belongs to Closeout.
  var SETUP_DOCS = [
    { match: /scope of work/i,                                 label: 'Scope of Work PDF' },
    { match: /location approval.*not completed/i,             label: 'Location Approval Form (blank)' },
    { match: /view approval.*not completed/i,                  label: 'View Approval Form (blank)' },
    { match: /kickoff/i,                                       label: 'Kickoff Deck' }
  ];

  var NAV_ID    = 'scw-deploy-nav';
  var STRIP_ID  = 'scw-deploy-co-strip';
  var STYLE_ID  = 'scw-deploy-nav-css';
  var EVENT_NS  = '.scwDeployNav';

  // Accordion sections excluded from the nav — the staging/data-source
  // sections slated for hiding ("MICAH'S SHIT" block), plus the (hidden)
  // worksheet source accordion, which the "Install Items" pill covers.
  // Matched on title.
  var EXCLUDE_TITLES = [
    /\(hide\)/i, /^DOC_/i, /^INSTALL_system setup/i, /^SOW_proposed/i,
    /^PHOTOS$/i, /^what we.?re installing/i,
    // Folded into the worksheet (mdf-notes.js) / staging grids: not sections.
    /^manage mdfs?/i, /^all associated sows?/i, /^CORE_/i, /^INSTALL_acceptances/i
  ];

  // ── Lifecycle organization (Part 3) ───────────────────────────────────
  // Renames + one-line subtitles for the opaque section titles. Matched on
  // the ORIGINAL Builder title (stashed in data-scw-orig-title on first
  // touch so heartbeat passes stay idempotent).
  var SECTIONS = [
    { match: /^system setup questionnaire/i,
      sub: "Client's configuration preferences, captured at project start." },
    { match: /^acceptance$/i, rename: 'Agreements & Invoices',
      sub: 'Issued paperwork per SOW / proposal — agreement + invoice status.',
      // The sub's card shows the bid the SOW is priced from and its
      // signature status — no invoices, no Xero links (acceptance-card.js
      // sub variant), so the ops title would promise things it omits.
      bySceneId: {
        scene_1353: { rename: 'Bid Basis & Agreement',
          sub: 'The bid this scope is priced from, and its signature status.' }
      } },
    { match: /^closeout$/i, rename: 'Closeout Deliverables',
      sub: 'Documents required before closeout + Certificate of Completion.' },
    // "Also on this project" rows: icon + name in the list (the sub only
    // shows in the drawer head — the list stays one tight column).
    { match: /^other files$/i, rename: 'Files', icon: 'clip',
      sub: 'SOW PDFs, approval forms' },
    { match: /^additional photos$/i, rename: 'Context photos', icon: 'image',
      sub: 'rooms, racks, not tied to an item' },
    { match: /^project notes$/i, rename: 'Project notes', icon: 'note',
      sub: 'pinned + pushed to ClickUp / Slack' },
    { match: /^change orders?$/i, rename: 'Change orders', icon: 'refresh',
      sub: 'adds and removes against the scope' }
  ];
  // Row icons for the "Also on this project" list (feather-style, 15px).
  var ICONS = {
    clip:    '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
    image:   '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    note:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    refresh: '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
    folder:  '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'
  };
  function iconSvg(key) {
    var body = ICONS[key] || ICONS.folder;
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  // (Band dividers retired 2026-09-18: the stage tiles + drawers replaced
  // them — see docs/deploy-page-redesign.md.)

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    // Per-scene selector unions (worksheet mount ids / scene containers).
    var mountSel = SCENES.map(function (s) { return '#' + s.worksheetMount; }).join(', ');
    var stripSceneSel = SCENES.map(function (s) {
      return '#kn-' + s.sceneId + ' > #' + STRIP_ID;
    }).join(', ');
    var css = [
      /* Status strip container: tiles + "also on this project" chips. */
      '#' + NAV_ID + ' {',
      '  width: 100%; max-width: 100%; box-sizing: border-box;',
      '  grid-column: 1 / -1; flex: 1 1 100%;',
      '  display: flex; flex-direction: column; gap: 10px;',
      '  margin: 8px 0 12px;',
      '}',
      '#' + NAV_ID + '-label {',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0.07em;',
      '  text-transform: uppercase; color: #64748b; margin: 0 4px 0 2px;',
      '}',
      '.scw-deploy-tiles {',
      '  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;',
      '}',
      '.scw-deploy-tile {',
      '  text-align: left; background: #fff; border: 1px solid #e2e8f0;',
      '  border-radius: 12px; padding: 12px 16px; min-height: 104px;',
      '  box-sizing: border-box; display: flex; flex-direction: column; gap: 6px;',
      '  cursor: pointer; font: 13px/1.4 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.scw-deploy-tile:hover { border-color: #b6c9db; }',
      '.scw-deploy-tile--current {',
      '  background: #163C6E; border-color: #163C6E; color: #fff;',
      '}',
      '.scw-deploy-tile__top {',
      '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
      '}',
      '.scw-deploy-tile__eyebrow {',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0.1em;',
      '  text-transform: uppercase; color: #64748b;',
      '}',
      '.scw-deploy-tile--current .scw-deploy-tile__eyebrow { color: rgba(255,255,255,0.75); }',
      '.scw-deploy-tile__state {',
      '  padding: 2px 8px; border-radius: 999px; white-space: nowrap;',
      '  font: 700 11px/1.2 system-ui, sans-serif; border: 1px solid transparent;',
      '}',
      '.scw-deploy-tile__state--ok      { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      '.scw-deploy-tile__state--warn    { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-deploy-tile__state--muted   { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }',
      '.scw-deploy-tile__state--current { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.35); color: #fff; }',
      '.scw-deploy-tile__head { font-size: 15px; font-weight: 600; }',
      '.scw-deploy-tile__fact { font-size: 12px; color: #475569; }',
      '.scw-deploy-tile__fact--warn { color: #92400e; }',
      '.scw-deploy-tile--current .scw-deploy-tile__fact { color: rgba(255,255,255,0.85); }',
      '.scw-deploy-tile__link { margin-top: auto; font-size: 12px; font-weight: 600; color: #0f4c81; }',
      '.scw-deploy-tile--current .scw-deploy-tile__link { color: rgba(255,255,255,0.85); }',
      /* One progress bar per owner (Sub submits, SCW reviews). */
      '.scw-deploy-bars {',
      '  display: grid; grid-template-columns: 30px minmax(0, 1fr) auto;',
      '  gap: 5px 8px; align-items: center; margin-top: 2px;',
      '  font: 11px/1.2 system-ui, sans-serif; color: rgba(255,255,255,0.88);',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.scw-deploy-bars b { font-weight: 700; }',
      '.scw-deploy-bar {',
      '  display: flex; height: 6px; border-radius: 999px; overflow: hidden;',
      '  background: rgba(255,255,255,0.18);',
      '}',
      '.scw-deploy-bar > span { display: block; height: 100%; }',
      /* Row 2: maps slot + "Also on this project". With no maps (slot
         empty) the list runs horizontally; with maps it becomes the
         right-hand column of the strip card. */
      '.scw-deploy-row2 { display: flex; gap: 12px; align-items: stretch; }',
      '.scw-deploy-maps-slot:empty { display: none; }',
      '.scw-deploy-maps-slot { flex: 1 1 auto; min-width: 0; }',
      '.scw-deploy-also {',
      '  display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: 1 1 auto;',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px;',
      '}',
      '.scw-deploy-row2.has-maps .scw-deploy-also {',
      '  flex: 0 0 360px; flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 2px;',
      '  min-width: 0; align-self: flex-start;',
      '}',
      '.scw-deploy-row2.has-maps .scw-deploy-also__row { width: 100%; min-width: 0; box-sizing: border-box; }',
      '.scw-deploy-also #' + NAV_ID + '-label { flex: 0 0 100%; margin-bottom: 4px; }',
      '.scw-deploy-row2:not(.has-maps) .scw-deploy-also #' + NAV_ID + '-label { flex: none; margin: 0 6px 0 2px; }',
      /* One tight column: icon · name · count · chevron, every row on the
         same axis (the label takes the slack, count + chevron hang right). */
      '.scw-deploy-also__row {',
      '  display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer;',
      '  padding: 7px 8px; border-radius: 8px; border: 1px solid transparent; background: #fff;',
      '  font: 12.5px/1.3 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.scw-deploy-also__row:hover { background: #f8fafc; border-color: #dbe4ee; }',
      '.scw-deploy-also__icon { display: inline-flex; flex: none; color: #475569; }',
      '.scw-deploy-also__row:hover .scw-deploy-also__icon { color: #163C6E; }',
      '.scw-deploy-also__label { font-weight: 600; white-space: nowrap; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }',
      '.scw-deploy-row2:not(.has-maps) .scw-deploy-also__label { flex: none; }',
      '.scw-deploy-also__row .scw-deploy-nav-count {',
      '  flex: none; min-width: 22px; box-sizing: border-box; text-align: center;',
      '  background: #eaf1f7; color: #163C6E; padding: 1px 8px; font-size: 11px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.scw-deploy-also__chev { color: #94a3b8; flex: none; width: 10px; text-align: right; }',
      '.scw-deploy-tile__link, .scw-deploy-tile__action {',
      '  font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; text-align: left;',
      '}',
      '.scw-deploy-tile__link { background: none; border: 0; padding: 0; color: #0f4c81; }',
      '.scw-deploy-tile__actions { margin-top: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; position: relative; }',
      '.scw-deploy-tile__actions #scw-regen-docs-panel { top: calc(100% + 8px); left: 0; z-index: 1100; }',
      '.scw-deploy-tile__action {',
      '  padding: 5px 11px; border-radius: 7px; border: 1px solid #163C6E;',
      '  background: #163C6E; color: #fff;',
      '}',
      '.scw-deploy-tile__action:hover { background: #1d4d8c; }',
      /* ── Parked sections + drawer ──
         Every non-worksheet accordion is hidden in place (parked) and shown
         inside the drawer when its tile / chip is clicked. Knack re-renders
         views by element id, so a moved section keeps working. */
      '.scw-ktl-accordion.scw-deploy-parked { display: none !important; }',
      '.scw-deploy-band { display: none !important; }',
      '#scw-deploy-drawer { position: fixed; inset: 0; z-index: 1200; }',
      '#scw-deploy-drawer[hidden] { display: none; }',
      '#scw-deploy-drawer .scw-deploy-drawer__scrim {',
      '  position: absolute; inset: 0; background: rgba(15,23,42,0.28);',
      '}',
      /* Sections were laid out for the full page width (the acceptance card
         has four money columns), so the drawer is wide: most of the viewport
         on a laptop, capped on a big monitor. */
      '#scw-deploy-drawer .scw-deploy-drawer__panel {',
      '  position: absolute; top: 0; right: 0; bottom: 0; width: 1100px; max-width: 94vw;',
      '  box-sizing: border-box; background: #fff; border-left: 1px solid #e2e8f0;',
      '  box-shadow: -12px 0 32px rgba(15,23,42,0.18); outline: none;',
      '  display: flex; flex-direction: column; font: 13px/1.4 system-ui, sans-serif; color: #0f172a;',
      '  transform: translateX(0); transition: transform 160ms ease-out;',
      '}',
      '#scw-deploy-drawer.scw-deploy-drawer--closing .scw-deploy-drawer__panel { transform: translateX(100%); }',
      '#scw-deploy-drawer.scw-deploy-drawer--opening .scw-deploy-drawer__panel { transform: translateX(100%); transition: none; }',
      '#scw-deploy-drawer .scw-deploy-drawer__close:focus { outline: none; }',
      '#scw-deploy-drawer .scw-deploy-drawer__close:focus-visible { outline: 2px solid #163C6E; outline-offset: 2px; }',
      '@media (prefers-reduced-motion: reduce) { #scw-deploy-drawer .scw-deploy-drawer__panel { transition: none; } }',
      '#scw-deploy-drawer .scw-deploy-drawer__head {',
      '  display: flex; align-items: flex-start; gap: 12px; padding: 18px 22px 14px;',
      '  border-bottom: 1px solid #e2e8f0;',
      '}',
      '#scw-deploy-drawer .scw-deploy-drawer__eyebrow {',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0.1em;',
      '  text-transform: uppercase; color: #64748b; margin-bottom: 4px;',
      '}',
      '#scw-deploy-drawer .scw-deploy-drawer__title { margin: 0; font: 700 18px/1.2 system-ui, sans-serif; }',
      '#scw-deploy-drawer .scw-deploy-drawer__sub { font-size: 12.5px; color: #475569; margin-top: 3px; }',
      '#scw-deploy-drawer .scw-deploy-drawer__close {',
      '  margin-left: auto; width: 36px; height: 36px; border-radius: 8px; flex: none;',
      '  border: 1px solid #dbe4ee; background: #fff; color: #334155; cursor: pointer;',
      '  font: 600 18px/1 system-ui, sans-serif;',
      '}',
      '#scw-deploy-drawer .scw-deploy-drawer__body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 22px 24px; }',
      /* The parked section, once inside the drawer: shown, its own bar hidden
         (the drawer head is the title), its body forced open. */
      '.scw-ktl-accordion.scw-deploy-in-drawer {',
      '  display: block !important; box-shadow: none !important; border: 0 !important; margin: 0 !important;',
      '}',
      '.scw-ktl-accordion.scw-deploy-in-drawer > .scw-ktl-accordion__header { display: none !important; }',
      '.scw-ktl-accordion.scw-deploy-in-drawer > .scw-ktl-accordion__body { display: block !important; }',
      /* The acceptance card sizes its money grid by VIEWPORT width; in the
         1100px drawer the viewport is wide but the container is not, so its
         four-column desk layout overlaps. Force the card\'s own "under 1200px"
         band layout (paperwork tiles on a band beneath the identity) here,
         and its stacked layout when the drawer itself is narrow. */
      '.scw-deploy-in-drawer .scw-acpt-row, .scw-deploy-in-drawer .scw-acpt-colhead, .scw-deploy-in-drawer .scw-acpt-foot {',
      '  grid-template-columns: minmax(0, 1fr) var(--acpt-equip) calc(var(--acpt-num) + var(--acpt-lbl) + 7px) !important;',
      '  grid-template-areas: "id equip labor" "docs docs docs" !important;',
      '}',
      '.scw-deploy-in-drawer .scw-acpt-docs > .scw-acpt-actions { border-top: 1px dashed #eef2f7; padding-top: 12px; }',
      '@media (max-width: 860px) {',
      '  .scw-deploy-in-drawer .scw-acpt-row, .scw-deploy-in-drawer .scw-acpt-colhead, .scw-deploy-in-drawer .scw-acpt-foot {',
      '    grid-template-columns: minmax(0, 1fr) !important;',
      '    grid-template-areas: "id" "equip" "labor" "docs" !important;',
      '  }',
      '}',
      /* Setup drawer prelude: the generated documents */
      '.scw-deploy-drawer__prelude { margin: 12px 0 18px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; }',
      '.scw-deploy-docs__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.scw-deploy-docs__title { font: 700 13px/1.2 system-ui, sans-serif; }',
      '.scw-deploy-docs__sub { font-size: 12px; color: #475569; }',
      '.scw-deploy-docs__actions { margin: 0 0 0 auto; }',
      '.scw-deploy-docs__list { display: flex; flex-direction: column; }',
      '.scw-deploy-docs__row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid #eef2f7; font-size: 13px; }',
      '.scw-deploy-docs__type { font-weight: 600; flex: 0 0 200px; }',
      '.scw-deploy-docs__state { color: #475569; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-deploy-docs__row.is-missing .scw-deploy-docs__state { color: #92400e; }',
      '.scw-deploy-docs__open { font-weight: 600; text-decoration: none; color: #0f4c81; flex: none; }',
      '.scw-deploy-docs__empty { font-size: 12.5px; color: #64748b; padding: 6px 0; }',
      /* Worksheet toolbar "+ Change Order" proxy (mirrors the Builder menu link). */
      'a#scw-deploy-co-toolbar-cta { text-decoration: none !important; }',
      '.scw-deploy-nav-item {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px; border-radius: 999px;',
      '  border: 1px solid #dbe4ee; background: #f8fafc; color: #0f4c81;',
      '  font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer;',
      '  white-space: nowrap;',
      '}',
      '.scw-deploy-nav-item:hover { background: #eaf1f7; border-color: #b6c9db; }',
      '.scw-deploy-nav-count {',
      '  background: #0f4c81; color: #fff; border-radius: 999px;',
      '  padding: 1px 7px; font-size: 10.5px; font-weight: 700;',
      '}',
      /* Attention dot — the section needs someone (e.g. unsigned acceptances) */
      '.scw-deploy-nav-dot {',
      '  width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;',
      '  flex: none;',
      '}',
      /* ── Reference tier — Other Files / Additional Photos demoted to a
         quieter visual weight so the page reads paperwork → work → reference. */
      '.scw-ktl-accordion.scw-acc-tier-ref {',
      '  box-shadow: none !important;',
      '  border-color: #e2e8f0 !important;',
      '  margin: 6px 0 !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-ktl-accordion__header {',
      '  background: #f8fafc !important;',
      '  padding-top: 8px !important; padding-bottom: 8px !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-acc-title {',
      '  color: #64748b !important; font-size: 13px !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-acc-icon { color: #94a3b8 !important; }',
      /* ── Lifecycle band dividers — signposts, not more boxes. Scene-level
         instances need the same layout-column escape as the CO strip. */
      '.scw-deploy-band {',
      '  width: 100% !important; max-width: 100% !important;',
      '  grid-column: 1 / -1 !important; flex: 1 1 100% !important;',
      '  box-sizing: border-box;',
      '  display: flex; align-items: center; gap: 10px;',
      '  margin: 22px 0 8px; padding: 0 2px;',
      '}',
      '.scw-deploy-band > span {',
      '  font: 700 11px/1 system-ui, sans-serif; letter-spacing: 0.1em;',
      '  text-transform: uppercase; color: #94a3b8; flex: none;',
      '}',
      '.scw-deploy-band::after {',
      '  content: ""; flex: 1; height: 1px; background: #e2e8f0;',
      '}',
      /* One-line section subtitle, inline after the accordion title */
      '.scw-deploy-acc-sub {',
      '  font-weight: 400; font-size: 12px; color: #64748b; margin-left: 8px;',
      '}',
      /* Phase rollup pill (questionnaire status / closeout docs) — same
         look as the acceptance "N awaiting signature" pill. */
      '.scw-deploy-rollup {',
      '  display: inline-flex; align-items: center;',
      '  margin-left: auto; margin-right: 8px; padding: 3px 10px;',
      '  border-radius: 999px; font: 700 11px/1.2 system-ui, sans-serif;',
      '  border: 1px solid transparent; white-space: nowrap;',
      '  max-width: 45%; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.scw-deploy-rollup--warn { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-deploy-rollup--ok   { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      /* Scroll targets clear the sticky bar */
      '.scw-ktl-accordion, ' + mountSel + ', #' + STRIP_ID + ' {',
      '  scroll-margin-top: 58px;',
      '}',
      /* CO strip — sits directly ABOVE the worksheet it explains. It is
         injected as a direct child of the scene\'s group-layout-wrapper,
         which sizes its children as layout columns — force full width
         under either grid or flex layout, and un-column the relocated
         views inside it. */
      stripSceneSel + ', #' + STRIP_ID + ' {',
      '  width: 100% !important; max-width: 100% !important;',
      '  grid-column: 1 / -1 !important; flex: 1 1 100% !important;',
      /* No extra top margin — the band divider provides the gap, so the
         header→section spacing matches every other band. */
      '  margin: 0 0 10px;',
      '}',
      '#' + STRIP_ID + ' .kn-view {',
      '  width: 100% !important; max-width: 100% !important; float: none !important;',
      '}',
      /* ── Section action bar — THE consistent home for "buttons that
         pertain to a view": a slim right-aligned row at the TOP of the
         section\'s body (headers stay clean — status pills only). */
      '.scw-acc-actionbar {',
      '  display: flex; align-items: center; justify-content: flex-end;',
      '  gap: 8px; padding: 10px 12px 14px;',
      '}',
      '.scw-acc-actionbar a.kn-button {',
      '  display: inline-flex; align-items: center;',
      '  padding: 6px 14px !important; border-radius: 8px !important;',
      '  background: #163C6E !important; border: 1px solid #163C6E !important;',
      '  color: #fff !important; font: 600 12.5px/1.2 system-ui, sans-serif !important;',
      '  text-decoration: none !important; white-space: nowrap; flex: none;',
      '}',
      '.scw-acc-actionbar a.kn-button:hover {',
      '  background: #1d4d8c !important; border-color: #1d4d8c !important;',
      '}',
      '.scw-acc-actionbar a.kn-button span { color: #fff !important; }',
      /* When the CO grid sits inside its accordion, the accordion bar is
         the title — hide the grid\'s own duplicate header. */
      '#' + STRIP_ID + ' .scw-ktl-accordion .kn-view .view-header h2.kn-title { display: none; }',
      '#' + STRIP_ID + ' .kn-view { margin-bottom: 8px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** The deployment scene currently rendered, if any: {cfg, el}. */
  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      var el = document.getElementById('kn-' + SCENES[i].sceneId);
      if (el) return { cfg: SCENES[i], el: el };
    }
    return null;
  }

  function txt(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  // ── Part 2: relocate Change Orders under the worksheet ────────────────
  function findCoGridView(scene) {
    var views = scene.querySelectorAll('.kn-view');
    for (var i = 0; i < views.length; i++) {
      var title = txt(views[i].querySelector('.view-header h2.kn-title'));
      if (/^change orders?$/i.test(title)) return views[i];
    }
    return null;
  }
  // Any view whose (menu) link matches — used for the proxy-CTA sources
  // ("Create Change Order" on view_4081 / view_4110, "Add Project Note"
  // on view_4133 — whichever the scene carries).
  function findMenuLinkView(scene, re) {
    var anchors = scene.querySelectorAll('.kn-view a');
    for (var i = 0; i < anchors.length; i++) {
      if (re.test(txt(anchors[i]))) {
        return anchors[i].closest('.kn-view');
      }
    }
    return null;
  }

  function moveChangeOrders(scene, cfg) {
    var anchor = document.getElementById(cfg.worksheetMount);
    if (!anchor || !anchor.parentNode) return;

    // Bare positioning container — the CO grid's own accordion bar is the
    // section title, and the CTA lives in that bar's action slot.
    var strip = document.getElementById(STRIP_ID);
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
    }
    // Keep the strip pinned directly BEFORE the worksheet mount — the CO
    // records explain the worksheet's Removed-by-CO rows, and with 15+
    // expanded cards "after the worksheet" reads as the bottom of the page.
    if (strip.nextElementSibling !== anchor) {
      anchor.parentNode.insertBefore(strip, anchor);
    }

    // Installation section order: Project Notes → Change Orders → worksheet.
    // The notes accordion moves in as a whole wrapper — the view stays
    // inside its body, so ktl-accordion's orphan adoption never fires.
    // (The sub scene has no Project Notes section yet — findAcc no-ops.)
    var notes = findAcc(scene, /^project notes$/i);
    if (notes && !strip.contains(notes)) {
      strip.insertBefore(notes, strip.firstChild);
    }

    // contains(), not parentNode — once ktl-accordion wraps the moved grid,
    // its parent is the accordion body INSIDE the strip; a parentNode check
    // would rip the view back out of its wrapper every heartbeat.
    var grid = findCoGridView(scene);
    if (grid && !strip.contains(grid)) strip.appendChild(grid);
  }

  // ── Part 3: lifecycle organization — rename, subtitle, reorder, band ──
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }
  function origTitle(acc) {
    return acc.getAttribute('data-scw-orig-title') ||
           txt(acc.querySelector('.scw-acc-title'));
  }
  function findAcc(scene, re) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      if (re.test(origTitle(accs[i]))) return accs[i];
    }
    return null;
  }

  function applyNames(scene) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var acc = accs[i], ot = origTitle(acc), sec = null;
      for (var s = 0; s < SECTIONS.length; s++) {
        if (SECTIONS[s].match.test(ot)) { sec = SECTIONS[s]; break; }
      }
      if (!sec) continue;
      if (!acc.hasAttribute('data-scw-orig-title')) {
        acc.setAttribute('data-scw-orig-title', ot);
      }
      // Per-scene override: the same Builder section can mean different
      // things to ops and to a subcontractor (see the acceptance entry).
      var ov = sec.bySceneId &&
        sec.bySceneId[String(scene.id || '').replace(/^kn-/, '')];
      if (ov) sec = { match: sec.match, rename: ov.rename || sec.rename,
                      sub: ov.sub || sec.sub, icon: sec.icon };
      var name = sec.rename || ot;
      acc.setAttribute('data-scw-nav-label', name);
      if (sec.sub) acc.setAttribute('data-scw-nav-sub', sec.sub);
      if (sec.icon) acc.setAttribute('data-scw-nav-icon', sec.icon);
      var titleEl = acc.querySelector('.scw-acc-title');
      if (!titleEl) continue;
      var want = esc(name) +
        (sec.sub ? '<span class="scw-deploy-acc-sub">' + esc(sec.sub) + '</span>' : '');
      if (titleEl.innerHTML !== want) titleEl.innerHTML = want;
    }
  }

  // Physical order (flipped 2026-08-21): the acceptance paperwork —
  // agreement + invoice, the moment the project became real — reads
  // BEFORE the setup questionnaire, matching the project lifecycle
  // (paperwork exists before setup preferences are captured). One move;
  // everything else already sits above the worksheet.
  function reorderSections(scene) {
    var q = findAcc(scene, /^system setup questionnaire/i);
    var a = findAcc(scene, /^acceptance$/i);
    if (!q || !a || !q.parentNode) return;
    if (q.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) {
      q.parentNode.insertBefore(a, q);
    }
  }

  // ── Part 6: section action bars — one consistent home for the buttons
  // that pertain to a view: a slim right-aligned row at the top of the
  // section's BODY (headers stay clean). The closeout toolbar already
  // follows this pattern natively (its module mounts it under the view
  // header inside the accordion body).
  // Proxy CTA in an action bar at the top of an accordion's body, mirroring
  // the live href/label of a Knack menu link elsewhere on the scene. The
  // source view is hidden in place by the caller — moving a Knack view
  // element into a rebuildable header/bar risks losing it to re-renders.
  function mountProxyCta(acc, ctaView, barId, btnId) {
    var body = acc && acc.querySelector('.scw-ktl-accordion__body');
    var src = ctaView &&
      (ctaView.querySelector('a.kn-link') || ctaView.querySelector('a[href]'));
    if (!body || !src) return;
    var bar = document.getElementById(barId);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = barId;
      bar.className = 'scw-acc-actionbar';
    }
    if (bar.parentNode !== body || body.firstElementChild !== bar) {
      body.insertBefore(bar, body.firstChild);
    }
    var btn = document.getElementById(btnId);
    if (!btn) {
      btn = document.createElement('a');
      btn.id = btnId;
      btn.className = 'kn-button';
    }
    if (btn.parentNode !== bar) bar.appendChild(btn);
    if (btn.getAttribute('href') !== src.getAttribute('href')) {
      btn.setAttribute('href', src.getAttribute('href'));
    }
    var label = txt(src);
    if (label && btn.textContent !== label) {
      btn.innerHTML = '<span>' + esc(label) + '</span>';
    }
    ctaView.style.setProperty('display', 'none', 'important');
  }

  function placeViewActions(scene) {
    // Change Orders ← "Create Change Order" (view_4081 on ops, view_4110 on
    // the sub scene — matched by link text either way). The strip can hold
    // TWO accordions, so match by title, not first-in-strip.
    mountProxyCta(
      findAcc(scene, /^change orders?$/i),
      findMenuLinkView(scene, /create change order/i),
      'scw-deploy-co-actionbar', 'scw-deploy-co-cta');
    // Project Notes ← "Add Project Note" (view_4133; ops scene only today).
    mountProxyCta(
      findAcc(scene, /^project notes$/i),
      findMenuLinkView(scene, /add project note/i),
      'scw-deploy-notes-actionbar', 'scw-deploy-notes-cta');
    // Files ← "Add File" / "Upload File": a Builder menu link to a child
    // page holding a DOC_files "add connected record" form (file, file
    // type, notes) connected to the PROJECT. Files uploaded from this page
    // attach to the project, never to a SOW or the closeout. The same
    // href feeds the site-maps strip's upload button (addFileHref below).
    mountProxyCta(
      findAcc(scene, /^other files$/i),
      findMenuLinkView(scene, /^\s*(add|upload)\s+(a\s+)?files?\s*$/i),
      'scw-deploy-files-actionbar', 'scw-deploy-files-cta');
  }
  function addFileHref(scene) {
    var v = findMenuLinkView(scene, /^\s*(add|upload)\s+(a\s+)?files?\s*$/i);
    var a = v && (v.querySelector('a.kn-link') || v.querySelector('a[href]'));
    return a ? a.getAttribute('href') : '';
  }

  // ── Part 5: phase rollups — questionnaire status + closeout docs ──────
  function upsertRollup(acc, text, warn) {
    var head = acc.querySelector('.scw-ktl-accordion__header');
    if (!head) return;
    var roll = head.querySelector('.scw-deploy-rollup');
    if (!text) {
      if (roll && roll.parentNode) roll.parentNode.removeChild(roll);
      acc.removeAttribute('data-scw-attention');
      return;
    }
    if (!roll) {
      roll = document.createElement('span');
      var countEl = head.querySelector('.scw-acc-count');
      if (countEl) head.insertBefore(roll, countEl);
      else head.appendChild(roll);
    }
    roll.className = 'scw-deploy-rollup scw-deploy-rollup--' + (warn ? 'warn' : 'ok');
    if (roll.textContent !== text) roll.textContent = text;
    if (warn) acc.setAttribute('data-scw-attention', '');
    else acc.removeAttribute('data-scw-attention');
  }

  // Questionnaire STATUS (field_1772) — may not be a column on the
  // questionnaire grid, so scan every loaded model for it (same trick as
  // the deploy audit). cfg.questionnaireView marks "a record exists".
  function questionnaireStatus(cfg) {
    try {
      var views = (typeof Knack !== 'undefined' && Knack.views) || {};
      var sawRecord = false;
      for (var vid in views) {
        var v = views[vid];
        var models = v && v.model && v.model.data && v.model.data.models;
        if (vid === cfg.questionnaireView && models && models.length) sawRecord = true;
        if (!models) continue;
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && models[i].attributes;
          if (!a || a.field_1772 == null) continue;
          var s = String(a.field_1772).replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ').trim();
          if (!s || s.indexOf('[object') === 0) continue;
          return { text: s, warn: /pending|await|not started|in progress|draft|sent/i.test(s) };
        }
      }
      if (sawRecord) return null;              // record exists, status unknown
      return { text: 'Not started', warn: true };
    } catch (e) { return null; }
  }

  function applyRollups(scene, cfg) {
    var q = findAcc(scene, /^system setup questionnaire/i);
    if (q) {
      var st = questionnaireStatus(cfg);
      upsertRollup(q, st && st.text, !!(st && st.warn));
    }
    // Closeout — read the deliverable cards' state classes (three-tier
    // model from closeout-deliverables.js): a required doc is DONE only
    // when its file is in AND QA passed.
    var c = findAcc(scene, /^closeout$/i);
    if (c) {
      var total = c.querySelectorAll('.scw-cd-doc').length;
      if (total) {
        var missing   = c.querySelectorAll('.scw-cd-doc.is-no-file:not(.is-optional)').length;
        var qaFail    = c.querySelectorAll('.scw-cd-doc.is-qa-fail').length;
        var qaPending = c.querySelectorAll('.scw-cd-doc.is-qa-pending').length;
        var parts = [];
        if (missing)   parts.push(missing + ' missing');
        if (qaFail)    parts.push(qaFail + ' QA failed');
        if (qaPending) parts.push(qaPending + ' QA pending');
        upsertRollup(c,
          parts.length ? parts.join(' · ') : 'all required docs QA passed',
          parts.length > 0);
      }
    }
  }

  // ── Part 1: sticky signpost bar ───────────────────────────────────────
  function excluded(title) {
    for (var i = 0; i < EXCLUDE_TITLES.length; i++) {
      if (EXCLUDE_TITLES[i].test(title)) return true;
    }
    return false;
  }

  function collectTargets(scene, cfg) {
    var out = [];
    // Accordion sections, document order. Skip hidden ones (e.g. the
    // Manage MDFs/IDFs section mdf-notes.js folded into the worksheet).
    // A section hosted in the drawer lives OUTSIDE the scene element; its
    // home placeholder stands in for it here so the target set (and so the
    // tiles) is identical whether a drawer is open, closing or closed.
    var nodes = scene.querySelectorAll('.scw-ktl-accordion, .scw-deploy-home');
    for (var i = 0; i < nodes.length; i++) {
      var acc = nodes[i];
      if (acc.classList.contains('scw-deploy-home')) {
        acc = acc.__scwAcc;
        if (!acc || scene.contains(acc)) continue;   // at home: counted as itself
      }
      // Parked / drawer-hosted sections are ours and count as visible;
      // anything else hidden (e.g. the MDF section folded into the
      // worksheet) is skipped.
      var parked = acc.classList.contains('scw-deploy-parked') ||
                   acc.classList.contains('scw-deploy-in-drawer');
      if (!parked && (acc.style.display === 'none' || !acc.offsetParent)) continue;
      // Exclude on the ORIGINAL title (renames don't dodge exclusion);
      // label with the renamed name, sans subtitle. Strip accordions
      // (Project Notes, Change Orders) are real sections — they get their
      // own pills in document order like everything else.
      var ot = origTitle(acc);
      var title = acc.getAttribute('data-scw-nav-label') ||
                  txt(acc.querySelector('.scw-acc-title'));
      if (!title || excluded(ot || title)) continue;
      var cEl = acc.querySelector('.scw-acc-count');
      out.push({
        label: title,
        count: (cEl && cEl.style.visibility !== 'hidden') ? txt(cEl) : '',
        el:    acc,
        kind:  'accordion',
        warn:  acc.hasAttribute('data-scw-attention')
      });
    }
    // Pre-adoption fallback: the CO grid moved into the strip but
    // ktl-accordion hasn't wrapped it yet — keep the section reachable.
    var strip = document.getElementById(STRIP_ID);
    if (strip && strip.querySelector(':scope > .kn-view')) {
      var rows = strip.querySelectorAll(':scope > .kn-view tbody tr[id]').length;
      out.push({ label: 'Change Orders', count: rows ? String(rows) : '', el: strip, kind: 'co' });
    }
    // Install worksheet.
    var ws = document.getElementById(cfg.worksheetMount);
    if (ws) {
      var m = txt(ws.querySelector('.scw-ws-v2-count')).match(/\d+/);
      out.push({ label: 'Install Items', count: m ? m[0] : '', el: ws, kind: 'worksheet' });
    }
    return out;
  }

  function scrollToTarget(t) {
    // Collapsed accordion → expand first so the user never lands on a
    // closed bar (our header forwards to the toggle).
    if (t.kind === 'accordion' && !t.el.classList.contains('is-expanded')) {
      var head = t.el.querySelector('.scw-ktl-accordion__header');
      if (head) head.click();
    }
    try { t.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { t.el.scrollIntoView(); }
  }

  function buildNav(scene, cfg) {
    var targets = collectTargets(scene, cfg);
    if (targets.length < 2) return;

    // Anchor the bar INTO the page flow, directly above the first section it
    // indexes (not at the very top of the scene, where it floats detached
    // above the page menu + title). position:sticky keeps it pinned once the
    // user scrolls past it.
    var firstAcc = null;
    for (var fa = 0; fa < targets.length; fa++) {
      if (targets[fa].kind === 'accordion') { firstAcc = targets[fa].el; break; }
    }
    // Anchor directly before the accordion ELEMENT, not its .view-group —
    // the group can also contain the project-details header, which should
    // stay above the nav. Step back over any band divider so the nav sits
    // above the first signpost (and the two inserts don't fight).
    var anchorEl = firstAcc || scene.firstChild;
    while (anchorEl && anchorEl.previousElementSibling &&
           anchorEl.previousElementSibling.classList &&
           anchorEl.previousElementSibling.classList.contains('scw-deploy-band')) {
      anchorEl = anchorEl.previousElementSibling;
    }

    var nav = document.getElementById(NAV_ID);
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = NAV_ID;
      nav.setAttribute('aria-label', 'Page sections');
    }
    if (anchorEl && nav.nextElementSibling !== anchorEl && anchorEl.parentNode) {
      anchorEl.parentNode.insertBefore(nav, anchorEl);
    } else if (!nav.parentNode) {
      scene.insertBefore(nav, scene.firstChild);
    }

    // Resolve the four stages against the collected targets; whatever is
    // left over becomes the "Also on this project" chip row.
    var stages = [], used = {};
    for (var s = 0; s < STAGES.length; s++) {
      var st = STAGES[s], hit = null;
      for (var t = 0; t < targets.length; t++) {
        if (used[t]) continue;
        var tg = targets[t];
        if (st.worksheet ? tg.kind === 'worksheet'
                         : (tg.kind === 'accordion' && st.match.test(origTitle(tg.el)))) {
          hit = tg; used[t] = true; break;
        }
      }
      if (hit) stages.push(tileModel(st, hit, cfg));
    }
    var also = [];
    for (var a = 0; a < targets.length; a++) if (!used[a]) also.push(targets[a]);

    // Document generation is a Setup fact: read the closeout doc cards
    // (a card with a file = generated or uploaded) onto the Setup tile.
    var setupM = null, closeM = null;
    for (var q = 0; q < stages.length; q++) {
      if (stages[q].stage.id === 'setup') setupM = stages[q];
      if (stages[q].stage.id === 'close') closeM = stages[q];
    }
    if (setupM && closeM) {
      var docsAll  = closeM.target.el.querySelectorAll('.scw-cd-doc').length;
      var docsWith = closeM.target.el.querySelectorAll('.scw-cd-doc:not(.is-no-file)').length;
      setupM.docsGenerated = docsWith > 0;
      var docFact = docsAll
        ? (docsWith ? docsWith + ' of ' + docsAll + ' docs generated' : 'Docs not generated yet')
        : '';
      if (docFact) setupM.fact = setupM.fact ? setupM.fact + ' · ' + docFact : docFact;
      if (!setupM.docsGenerated && docsAll) {
        setupM.factWarn = true;
        if (setupM.stateCls !== 'warn') { setupM.stateCls = 'warn'; setupM.stateText = 'Waiting'; }
      }
      setupM.sig += ',docs:' + docsWith + '/' + docsAll;
    }

    // Rebuild only when the signature changed — keeps the heartbeat
    // rebuild from thrashing the DOM (and hover states) every pass — and
    // never while a drawer is open: the moved section's count/rollup
    // flickers as ktl re-measures it, and a rebuild would blank the tiles
    // behind the scrim.
    var sig = stages.map(function (m) { return m.sig; }).join('|') + '||' +
      also.map(function (t) { return t.label + ':' + t.count + (t.warn ? '!' : ''); }).join('|');
    if (nav.getAttribute('data-scw-sig') === sig) return;
    if (_drawerAcc || _drawerBusy) return;
    nav.setAttribute('data-scw-sig', sig);

    // Patch in place: keep the tile elements (no blank frame, hover state
    // survives) and only swap the innerHTML of tiles whose content changed.
    var tiles = nav.querySelector('.scw-deploy-tiles');
    var fresh = !tiles;
    if (fresh) {
      nav.innerHTML = '';
      tiles = document.createElement('div');
      tiles.className = 'scw-deploy-tiles';
    }
    var closeoutModel = null;
    for (var cm = 0; cm < stages.length; cm++) if (stages[cm].stage.id === 'close') closeoutModel = stages[cm];
    var keep = {};
    for (var m = 0; m < stages.length; m++) {
      (function (model) {
        keep[model.stage.id] = true;
        var tile = tiles.querySelector('.scw-deploy-tile[data-scw-tile="' + model.stage.id + '"]');
        var isNew = !tile;
        if (isNew) {
          tile = document.createElement('div');
          tile.setAttribute('data-scw-tile', model.stage.id);
        }
        tile.className = 'scw-deploy-tile' + (model.current ? ' scw-deploy-tile--current' : '');
        var actions = '';
        if (model.stage.id === 'setup' && closeoutModel) {
          // Document generation is a SETUP step (docs/deploy-page-redesign.md):
          // the button opens the Closeout drawer and presses the existing
          // Regenerate Docs button there, so the picker/webhook are unchanged.
          actions = model.docsGenerated
            ? '<button type="button" class="scw-deploy-tile__link" data-scw-tile-docs="1">Regenerate documents…</button>'
            : '<button type="button" class="scw-deploy-tile__action" data-scw-tile-docs="1">Generate documents…</button>';
        }
        var html =
          '<span class="scw-deploy-tile__top">' +
            '<span class="scw-deploy-tile__eyebrow">' + model.stage.n + ' · ' + esc(model.stage.label) + '</span>' +
            '<span class="scw-deploy-tile__state scw-deploy-tile__state--' + model.stateCls + '">' + esc(model.stateText) + '</span>' +
          '</span>' +
          '<span class="scw-deploy-tile__head">' + esc(model.head) + '</span>' +
          (model.bars || '') +
          (model.fact ? '<span class="scw-deploy-tile__fact' + (model.factWarn ? ' scw-deploy-tile__fact--warn' : '') + '">' + esc(model.fact) + '</span>' : '') +
          '<span class="scw-deploy-tile__actions">' +
            '<button type="button" class="scw-deploy-tile__link" data-scw-tile-open="1" aria-label="' + esc(model.stage.label + ': ' + model.stateText) + '">' + esc(model.link) + '</button>' +
            actions +
          '</span>';
        if (tile.innerHTML !== html) tile.innerHTML = html;
        // The click handler reads the latest model through this box, so
        // a patched tile never keeps a stale target.
        tile.__scwModel = model;
        tile.__scwCloseout = closeoutModel;
        if (isNew) {
          tile.addEventListener('click', function (e) {
            var mdl = tile.__scwModel, closeM = tile.__scwCloseout;
            // Clicks inside the hosted document picker are the picker's own.
            if (e.target.closest && e.target.closest('#scw-regen-docs-panel')) return;
            var docsBtn = e.target.closest && e.target.closest('[data-scw-tile-docs]');
            if (docsBtn) {
              e.stopPropagation();
              if (closeM) openDocsGenerator(closeM.target, docsBtn.parentNode, docsBtn);
              return;
            }
            if (mdl.target.kind === 'worksheet') scrollToTarget(mdl.target);
            else openDrawer(mdl.target);
          });
          tiles.appendChild(tile);
        }
      })(stages[m]);
    }
    // Drop tiles whose stage vanished (a section hidden by another module).
    var old = tiles.querySelectorAll('.scw-deploy-tile');
    for (var o = 0; o < old.length; o++) {
      if (!keep[old[o].getAttribute('data-scw-tile')]) tiles.removeChild(old[o]);
    }
    if (fresh) nav.appendChild(tiles);

    // Row 2: [ site maps slot | "Also on this project" list ]. The slot is
    // owned by site-maps-strip.js and survives rebuilds; only the list is
    // re-rendered here.
    var row2 = nav.querySelector('.scw-deploy-row2');
    if (!row2) {
      row2 = document.createElement('div');
      row2.className = 'scw-deploy-row2';
      row2.innerHTML = '<div class="scw-deploy-maps-slot"></div>';
      nav.appendChild(row2);
    }
    // The list is only rebuilt when ITS rows changed — a tile-only change
    // must not blink the list.
    var alsoSig = also.map(function (t) { return t.label + ':' + t.count + (t.warn ? '!' : ''); }).join('|');
    var oldAlso = row2.querySelector('.scw-deploy-also');
    if (oldAlso && oldAlso.getAttribute('data-scw-sig') === alsoSig && also.length) {
      // Same rows: refresh the click targets only (elements may have moved).
      var rowsEl = oldAlso.querySelectorAll('.scw-deploy-also__row');
      for (var r = 0; r < rowsEl.length && r < also.length; r++) rowsEl[r].__scwTarget = also[r];
      return;
    }
    if (oldAlso) row2.removeChild(oldAlso);
    if (also.length) {
      var list = document.createElement('div');
      list.className = 'scw-deploy-also';
      list.setAttribute('data-scw-sig', alsoSig);
      list.innerHTML = '<span id="' + NAV_ID + '-label">Also on this project</span>';
      for (var i = 0; i < also.length; i++) {
        (function (t) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'scw-deploy-also__row';
          btn.innerHTML =
            '<span class="scw-deploy-also__icon">' + iconSvg(t.el.getAttribute('data-scw-nav-icon')) + '</span>' +
            '<span class="scw-deploy-also__label">' + esc(t.label) + '</span>' +
            (t.warn ? '<span class="scw-deploy-nav-dot" title="Needs attention"></span>' : '') +
            (t.count ? '<span class="scw-deploy-nav-count">' + esc(t.count) + '</span>' : '') +
            '<span class="scw-deploy-also__chev">›</span>';
          btn.__scwTarget = t;
          btn.addEventListener('click', function () { openDrawer(btn.__scwTarget); });
          list.appendChild(btn);
        })(also[i]);
      }
      row2.appendChild(list);
    }
  }

  // ── Parked sections + drawer ──────────────────────────────────────────
  // The page shows tiles + worksheet; every other section is hidden in
  // place ("parked") and shown inside a right-side drawer on demand. The
  // accordion ELEMENT moves (Knack re-renders views by id, so it keeps
  // working), and a placeholder marks its home so it can move back.
  var DRAWER_ID = 'scw-deploy-drawer';
  var _drawerAcc = null;
  var _drawerBusy = false;   // closing: section still on its way home

  function parkSections(scene, cfg) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var acc = accs[i];
      if (acc.classList.contains('scw-deploy-in-drawer')) continue;
      if (acc.classList.contains('scw-deploy-parked')) continue;
      if (acc.style.display === 'none') continue;          // hidden by another module
      if (excluded(origTitle(acc))) continue;              // staging / worksheet source
      var mount = document.getElementById(cfg.worksheetMount);
      if (mount && (acc.contains(mount) || mount.contains(acc))) continue;
      acc.classList.add('scw-deploy-parked');
    }
  }

  function ensureDrawer() {
    var d = document.getElementById(DRAWER_ID);
    if (d) return d;
    d = document.createElement('div');
    d.id = DRAWER_ID;
    d.hidden = true;
    d.innerHTML =
      '<div class="scw-deploy-drawer__scrim"></div>' +
      '<aside class="scw-deploy-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="' + DRAWER_ID + '-title">' +
        '<div class="scw-deploy-drawer__head">' +
          '<div><div class="scw-deploy-drawer__eyebrow"></div>' +
            '<h2 class="scw-deploy-drawer__title" id="' + DRAWER_ID + '-title"></h2>' +
            '<div class="scw-deploy-drawer__sub"></div></div>' +
          '<button type="button" class="scw-deploy-drawer__close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="scw-deploy-drawer__body"></div>' +
      '</aside>';
    document.body.appendChild(d);
    d.querySelector('.scw-deploy-drawer__scrim').addEventListener('click', closeDrawer);
    d.querySelector('.scw-deploy-drawer__close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !d.hidden) closeDrawer();
    });
    // Any Knack navigation (a page link inside the drawer, e.g. the
    // questionnaire page, or a modal) changes the hash: close the drawer so
    // it never sits over the next page.
    window.addEventListener('hashchange', function () {
      if (!d.hidden) closeDrawer();
    });
    return d;
  }

  function stageFor(acc) {
    var ot = origTitle(acc);
    for (var s = 0; s < STAGES.length; s++) {
      if (STAGES[s].match && STAGES[s].match.test(ot)) return STAGES[s];
    }
    return null;
  }
  function stageLabelFor(acc) {
    var st = stageFor(acc);
    return st ? st.n + ' · ' + st.label : 'Also on this project';
  }

  // ── Setup drawer: the generated documents, listed from the DOC model ──
  function modelRecords(viewId) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  function plainText(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  function setupDocs(cfg) {
    var out = [], seen = {}, anyRecords = false;
    var views = cfg.docsViews || [];
    for (var v = 0; v < views.length; v++) {
      var recs = modelRecords(views[v]);
      if (recs.length) anyRecords = true;
      for (var i = 0; i < recs.length; i++) {
        var rec = recs[i];
        if (!rec || !rec.id || seen[rec.id]) continue;
        var typeRaw = rec[DOC_F.type + '_raw'];
        var type = Array.isArray(typeRaw) ? (typeRaw[0] && typeRaw[0].identifier) || '' : plainText(rec[DOC_F.type]);
        var kind = null;
        for (var k = 0; k < SETUP_DOCS.length; k++) if (SETUP_DOCS[k].match.test(type)) { kind = SETUP_DOCS[k]; break; }
        if (!kind) continue;
        var fileRaw = rec[DOC_F.file + '_raw'];
        var url = fileRaw && typeof fileRaw === 'object' ? (fileRaw.url || '') : '';
        var name = fileRaw && typeof fileRaw === 'object' ? (fileRaw.filename || '') : '';
        if (!url) {   // formatted value may still carry an <a href>
          var m = String(rec[DOC_F.file] || '').match(/href="([^"]+)"/);
          if (m) { url = m[1]; name = name || plainText(rec[DOC_F.file]); }
        }
        if (!url) continue;                     // a typed record with no file isn't a generated PDF
        seen[rec.id] = true;
        out.push({ kind: kind, type: kind.label, url: url, name: name,
                   note: plainText(rec[DOC_F.notes]), order: SETUP_DOCS.indexOf(kind) });
      }
    }
    out.sort(function (a, b) { return a.order - b.order; });
    out.anyRecords = anyRecords;
    return out;
  }
  function buildSetupPrelude(cfg) {
    var docs = setupDocs(cfg);
    var box = document.createElement('div');
    box.className = 'scw-deploy-drawer__prelude';
    var rows = '';
    if (!docs.length && !docs.anyRecords) {
      rows = '<div class="scw-deploy-docs__empty">Documents haven\'t loaded yet, or none have been generated for this project.</div>';
    } else {
      for (var i = 0; i < SETUP_DOCS.length; i++) {
        var kind = SETUP_DOCS[i], found = false;
        for (var d = 0; d < docs.length; d++) {
          if (docs[d].kind !== kind) continue;
          found = true;
          var doc = docs[d];
          rows += '<div class="scw-deploy-docs__row">' +
            '<span class="scw-deploy-docs__type">' + esc(doc.type) + '</span>' +
            '<span class="scw-deploy-docs__state">Ready to print' + (doc.name ? ' · ' + esc(doc.name) : '') + (doc.note ? ' · ' + esc(doc.note) : '') + '</span>' +
            '<a class="scw-deploy-docs__open" href="' + esc(doc.url) + '" target="_blank" rel="noopener">Open ›</a>' +
          '</div>';
        }
        if (!found) {
          rows += '<div class="scw-deploy-docs__row is-missing">' +
            '<span class="scw-deploy-docs__type">' + esc(kind.label) + '</span>' +
            '<span class="scw-deploy-docs__state">Not generated</span></div>';
        }
      }
    }
    box.innerHTML =
      '<div class="scw-deploy-docs__head">' +
        '<span class="scw-deploy-docs__title">Documents for the sub</span>' +
        '<span class="scw-deploy-docs__sub">Blank PDFs generated after the client kickoff, for the sub to print and get completed on site. Completed copies come back under Closeout.</span>' +
        '<span class="scw-deploy-tile__actions scw-deploy-docs__actions">' +
          '<button type="button" class="scw-deploy-tile__action" data-scw-drawer-docs="1">Generate documents…</button>' +
        '</span>' +
      '</div>' +
      '<div class="scw-deploy-docs__list">' + rows + '</div>';
    box.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#scw-regen-docs-panel')) return;
      var b = e.target.closest && e.target.closest('[data-scw-drawer-docs]');
      if (!b) return;
      e.stopPropagation();
      var api = window.SCW && SCW.regenDocs;
      if (api && typeof api.openPicker === 'function') api.openPicker(b.parentNode, b);
    });
    return box;
  }

  function openDrawer(target) {
    var acc = target && target.el;
    if (!acc || !acc.classList || !acc.classList.contains('scw-ktl-accordion')) {
      if (target) scrollToTarget(target);
      return;
    }
    var d = ensureDrawer();
    if (_drawerAcc && _drawerAcc !== acc) returnHome(_drawerAcc);
    if (!acc.__scwHome) {
      var home = document.createElement('span');
      home.className = 'scw-deploy-home';
      home.hidden = true;
      acc.parentNode.insertBefore(home, acc);
      acc.__scwHome = home;
      home.__scwAcc = acc;
    }
    acc.classList.remove('scw-deploy-parked');
    acc.classList.add('scw-deploy-in-drawer');
    var body = d.querySelector('.scw-deploy-drawer__body');
    var stalePrelude = body.querySelector('.scw-deploy-drawer__prelude');
    if (stalePrelude) body.removeChild(stalePrelude);
    // The Setup drawer leads with the generated documents (the questionnaire
    // section follows); the tile alone would otherwise just re-link them.
    var st = stageFor(acc), active = activeScene();
    if (st && st.id === 'setup' && active && active.cfg.docsViews) {
      body.appendChild(buildSetupPrelude(active.cfg));
    }
    body.appendChild(acc);
    if (!acc.classList.contains('is-expanded')) {
      var head = acc.querySelector('.scw-ktl-accordion__header');
      if (head) head.click();                 // ktl-accordion's own toggle (persists state)
      if (!acc.classList.contains('is-expanded')) {
        acc.classList.add('is-expanded');     // belt and braces if nothing was bound
        var body = acc.querySelector('.scw-ktl-accordion__body');
        if (body) body.style.display = '';
      }
    }
    var label = acc.getAttribute('data-scw-nav-label') || txt(acc.querySelector('.scw-acc-title'));
    var sub = txt(acc.querySelector('.scw-deploy-acc-sub'));
    if (sub && label.indexOf(sub) >= 0) label = label.replace(sub, '').trim();
    d.querySelector('.scw-deploy-drawer__eyebrow').textContent = stageLabelFor(acc);
    d.querySelector('.scw-deploy-drawer__title').textContent = label;
    d.querySelector('.scw-deploy-drawer__sub').textContent = sub;
    // Slide in: start off-screen (no transition), then let the transition run.
    d.classList.remove('scw-deploy-drawer--closing');
    d.classList.add('scw-deploy-drawer--opening');
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    _drawerAcc = acc;
    var panel = d.querySelector('.scw-deploy-drawer__panel');
    void panel.offsetWidth;                       // commit the off-screen frame
    d.classList.remove('scw-deploy-drawer--opening');
    // Keyboard users land inside the dialog; no visible ring unless they tab.
    panel.setAttribute('tabindex', '-1');
    try { panel.focus({ preventScroll: true }); } catch (e) { /* focus is a courtesy */ }
  }

  function returnHome(acc) {
    var home = acc.__scwHome;
    acc.classList.remove('scw-deploy-in-drawer');
    acc.classList.add('scw-deploy-parked');
    if (home && home.parentNode) home.parentNode.insertBefore(acc, home.nextSibling);
    else if (acc.parentNode) acc.parentNode.removeChild(acc);   // scene is gone
  }

  function closeDrawer() {
    var d = document.getElementById(DRAWER_ID);
    var acc = _drawerAcc;
    _drawerAcc = null;
    document.body.style.overflow = '';
    if (!d || d.hidden) { if (acc) returnHome(acc); return; }
    // Slide out first, then do the (reflow-heavy) move back home after the
    // panel is gone, so the close never feels laggy. The nav stays frozen
    // until the section is home (a pass in between would see it moving).
    _drawerBusy = true;
    d.classList.add('scw-deploy-drawer--closing');
    setTimeout(function () {
      d.hidden = true;
      d.classList.remove('scw-deploy-drawer--closing');
      if (acc) returnHome(acc);
      _drawerBusy = false;
      scheduleApply(0);
    }, 170);
  }

  /** Scene re-rendered underneath an open drawer: its section is stale. */
  function dropStaleDrawer() {
    if (!_drawerAcc) return;
    var homeGone = !(_drawerAcc.__scwHome && document.contains(_drawerAcc.__scwHome));
    var drawerGone = !document.getElementById(DRAWER_ID);
    if (homeGone || drawerGone) closeDrawer();
  }

  /** Setup tile → open just the document picker, hosted under the tile's
   *  button (regenerate-closeout-docs.js openPicker). The webhook, the
   *  checklist of documents and the refresh are all that module's. Falls
   *  back to opening the Closeout drawer and pressing its button when the
   *  API isn't there. */
  function openDocsGenerator(closeoutTarget, host, stateBtn) {
    var api = window.SCW && SCW.regenDocs;
    if (api && typeof api.openPicker === 'function' && host && api.openPicker(host, stateBtn)) return;
    openDrawer(closeoutTarget);
    setTimeout(function () {
      var btn = document.getElementById('scw-regen-docs-btn');
      if (btn) btn.click();
    }, 60);
  }

  // ── "+ Change Order" in the worksheet toolbar ─────────────────────────
  // Mirrors the Builder menu link (same proxy idea as mountProxyCta) into
  // the v2 toolbar's CTA group, before "+ Add Photos". The toolbar is
  // rebuilt on every worksheet render, so the heartbeat re-mounts it.
  function mountToolbarCoCta(scene, cfg) {
    var mount = document.getElementById(cfg.worksheetMount);
    var group = mount && mount.querySelector('.scw-ws-v2-toolbar-group--cta');
    var srcView = findMenuLinkView(scene, /create change order/i);
    var src = srcView && (srcView.querySelector('a.kn-link') || srcView.querySelector('a[href]'));
    if (!group || !src) return;
    var btn = document.getElementById('scw-deploy-co-toolbar-cta');
    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'scw-deploy-co-toolbar-cta';
      btn.className = 'scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta';
    }
    if (btn.parentNode !== group) group.insertBefore(btn, group.firstChild);
    if (btn.getAttribute('href') !== src.getAttribute('href')) btn.setAttribute('href', src.getAttribute('href'));
    if (btn.textContent !== '+ Change Order') btn.textContent = '+ Change Order';
  }

  // ── Stage tiles ───────────────────────────────────────────────────────
  // Matched on the ORIGINAL Builder title (like SECTIONS); the worksheet
  // stage keys on the target kind. Order = page order = lifecycle order.
  var STAGES = [
    { id: 'paper',   n: 1, match: /^acceptance$/i,                label: 'Paperwork & billing', link: 'Open agreements ›' },
    { id: 'setup',   n: 2, match: /^system setup questionnaire/i, label: 'Project setup',       link: 'Open setup ›' },
    { id: 'install', n: 3, worksheet: true,                       label: 'Installation',        link: 'Install items below ↓' },
    { id: 'close',   n: 4, match: /^closeout$/i,                  label: 'Closeout',            link: 'Open deliverables ›' }
  ];

  function num(s) { var m = String(s || '').match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /** The rollup pill a section already renders in its accordion header
   *  (acceptance tally, questionnaire status, closeout docs). */
  /** Knack status values arrive SHOUTING ("PENDING TECH SUPPORT SIGNOFF");
   *  a tile reads them in sentence case. Mixed-case text is left alone. */
  function sentenceCase(s) {
    s = String(s || '');
    if (s.length < 4 || s !== s.toUpperCase()) return s;
    var lower = s.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  function readRollup(acc) {
    var head = acc.querySelector('.scw-ktl-accordion__header');
    var pill = head && head.querySelector('.scw-acpt-rollup, .scw-deploy-rollup');
    var text = pill ? sentenceCase(txt(pill)) : '';
    var warn = pill
      ? /--warn/.test(pill.className)
      : acc.hasAttribute('data-scw-attention');
    return { text: text, warn: warn, known: !!pill };
  }

  /** Photo QA tallies straight off the rendered worksheet cards — the same
   *  slots/chits the strips show, so the bars can't disagree with them. */
  function photoStats(ws) {
    var req = ws.querySelectorAll('.scw-ws-v2-photo-card--required').length;
    var missing = ws.querySelectorAll('.scw-ws-v2-photo-card--required.scw-ws-v2-photo-card--missing').length;
    return {
      required: req,
      missing:  missing,
      inCount:  Math.max(0, req - missing),
      pending:  ws.querySelectorAll('.scw-ws-v2-photo-qa-chit.is-pending').length,
      failed:   ws.querySelectorAll('.scw-ws-v2-photo-qa-chit.is-fail').length,
      passed:   ws.querySelectorAll('.scw-ws-v2-photo-qa-chit.is-done, .scw-ws-v2-photo-qa-chit.is-half-pass').length
    };
  }
  function bannerChip(ws, type) {
    var el = ws.querySelector('.scw-ws-v2-banner [data-scw-ws-v2-warn-chip="' + type + '"] .scw-ws-v2-warn-chip-n');
    return el ? num(txt(el)) : 0;
  }
  function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

  function tileModel(stage, target, cfg) {
    var model = { stage: stage, target: target, link: stage.link,
                  stateCls: 'muted', stateText: 'Open', head: '', fact: '', factWarn: false, current: false };
    var count = num(target.count);

    if (stage.worksheet) {
      var ws = target.el;
      var ps = photoStats(ws);
      var recs = num(txt(ws.querySelector('.scw-ws-v2-count')));
      var missingItems = bannerChip(ws, 'photos');
      var disconnected = bannerChip(ws, 'disconnected');
      model.current = true;
      model.stateCls = 'current';
      model.stateText = 'In progress';
      model.head = plural(recs, 'item', 'items') +
        (ps.required ? ' · ' + ps.required + ' required photos' : '');
      if (ps.required) {
        var subFail = pct(ps.failed, ps.required);
        model.bars =
          '<span class="scw-deploy-bars">' +
            '<b>Sub</b>' +
            '<span class="scw-deploy-bar">' +
              '<span style="width:' + pct(ps.inCount - ps.failed, ps.required) + '%;background:#93c5fd"></span>' +
              '<span style="width:' + subFail + '%;background:#e11d48"></span>' +
            '</span>' +
            '<span>' + ps.inCount + ' of ' + ps.required + ' in · ' + ps.missing + ' missing' +
              (ps.failed ? ' · ' + ps.failed + ' failed' : '') + '</span>' +
            '<b>SCW</b>' +
            '<span class="scw-deploy-bar">' +
              '<span style="width:' + pct(ps.passed, ps.inCount) + '%;background:#22c55e"></span>' +
              '<span style="width:' + pct(ps.failed, ps.inCount) + '%;background:#e11d48"></span>' +
            '</span>' +
            '<span>' + (ps.passed + ps.failed) + ' of ' + ps.inCount + ' reviewed · ' + ps.pending + ' waiting</span>' +
          '</span>';
      }
      var facts = [];
      if (missingItems) facts.push(missingItems + ' items missing photos');
      if (disconnected) facts.push(disconnected + ' disconnected');
      model.fact = facts.join(' · ');
      model.sig = [recs, ps.required, ps.missing, ps.pending, ps.failed, ps.passed, missingItems, disconnected].join(',');
      return model;
    }

    var roll = readRollup(target.el);
    if (stage.id === 'paper') {
      model.head = count ? plural(count, 'agreement', 'agreements') : 'No agreements yet';
      model.fact = roll.text;
      model.factWarn = roll.warn;
      model.stateCls = roll.known ? (roll.warn ? 'warn' : 'ok') : 'muted';
      model.stateText = roll.known ? (roll.warn ? 'Waiting' : 'Done') : 'Open';
    } else if (stage.id === 'setup') {
      model.head = count ? 'Questionnaire captured' : 'No questionnaire yet';
      model.fact = roll.text;
      model.factWarn = roll.warn;
      model.stateCls = roll.known ? (roll.warn ? 'warn' : 'ok') : 'muted';
      model.stateText = roll.known ? (roll.warn ? 'Waiting' : 'Done') : 'Open';
    } else if (stage.id === 'close') {
      var docs = target.el.querySelectorAll('.scw-cd-doc').length;
      var noFile = target.el.querySelectorAll('.scw-cd-doc.is-no-file:not(.is-optional)').length;
      model.head = docs ? (docs - noFile) + ' of ' + docs + ' deliverables in' : 'Closeout';
      model.fact = roll.text;
      model.factWarn = roll.warn;
      var missingPart = roll.text.split('·')[0].trim();
      model.stateCls = roll.known ? (roll.warn ? 'warn' : 'ok') : 'muted';
      model.stateText = roll.known
        ? (roll.warn ? (/missing/.test(missingPart) ? missingPart : 'Waiting') : 'Done')
        : 'Open';
    }
    model.sig = [stage.id, count, model.head, model.fact, model.stateText].join(',');
    return model;
  }

  // ── Part 4: demote reference sections to a quieter tier ───────────────
  var REF_TITLES = [/^other files$/i, /^additional photos$/i];
  function applyReferenceTier(scene) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var title = txt(accs[i].querySelector('.scw-acc-title'));
      var isRef = false;
      for (var r = 0; r < REF_TITLES.length; r++) {
        if (REF_TITLES[r].test(title)) { isRef = true; break; }
      }
      accs[i].classList.toggle('scw-acc-tier-ref', isRef);
    }
  }

  // ── Orchestration ─────────────────────────────────────────────────────
  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var active = activeScene();
      if (!active) return;
      var scene = active.el, cfg = active.cfg;
      injectStyles();
      try { dropStaleDrawer(); } catch (e) { /* drawer is optional chrome */ }
      try { moveChangeOrders(scene, cfg); } catch (e) { /* keep native order */ }
      try { applyNames(scene); } catch (e) { /* labels are cosmetic */ }
      try { reorderSections(scene); } catch (e) { /* keep native order */ }
      try { applyReferenceTier(scene); } catch (e) { /* cosmetic only */ }
      try { applyRollups(scene, cfg); } catch (e) { /* rollups are optional */ }
      try { placeViewActions(scene); } catch (e) { /* actions stay put */ }
      try { parkSections(scene, cfg); } catch (e) { /* sections stay visible */ }
      try { buildNav(scene, cfg); } catch (e) { /* nav is optional chrome */ }
      try { mountToolbarCoCta(scene, cfg); } catch (e) { /* CTA stays in its section */ }
    }, delay == null ? 250 : delay);
  }

  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () {
      scheduleApply(150);
    });
  }

  // Small public API: other modules (pinned-notes.js "All notes ›") open a
  // parked section's drawer by its ORIGINAL Builder title. Returns true
  // when a section matched.
  window.SCW = window.SCW || {};
  window.SCW.deployNav = {
    openSection: function (re) {
      var active = activeScene();
      var acc = active && findAcc(active.el, re);
      if (!acc) return false;
      openDrawer({ el: acc, kind: 'accordion' });
      return true;
    },
    closeDrawer: closeDrawer,
    // href of the scene's "Add File" menu link (project-attached upload
    // form), '' until the Builder link exists.
    addFileHref: function () {
      var active = activeScene();
      return active ? addFileHref(active.el) : '';
    }
  };
  $(document).on('knack-view-render.any' + EVENT_NS, function () {
    if (activeScene()) scheduleApply(250);
  });
  // Heartbeat — counts drift as grids refetch; the sig check makes a
  // no-change pass nearly free.
  setInterval(function () { if (activeScene()) scheduleApply(0); }, 3000);
})();
/*** END DEPLOY PAGE NAV + CHANGE-ORDER RELOCATION ****************************/
