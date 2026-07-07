/**
 * ─── Primary Accordion Style ───────────────────────────────────────────
 *
 * Wraps every KTL hide/show section in a unified accordion card so the
 * header and body share one container — eliminating the "small dropdown
 * on top of a big purple bar" problem.
 *
 * DOM STRUCTURE PRODUCED
 *   <div class="scw-ktl-accordion [is-expanded]"
 *        style="--scw-accent:…; --scw-accent-rgb:…">
 *     <div class="scw-ktl-accordion__header" role="button" tabindex="0">
 *       <span class="scw-acc-icon">…</span>
 *       <span class="scw-acc-title">…</span>
 *       <span class="scw-acc-count">…</span>
 *       <span class="scw-acc-chevron">…</span>
 *     </div>
 *     <div class="scw-ktl-accordion__body">
 *       <!-- original .kn-view is moved here -->
 *     </div>
 *   </div>
 *
 * The original .ktlHideShowButton stays in the DOM (KTL is source of
 * truth for toggle state) but is visually hidden.  Clicking our header
 * forwards to buttonEl.click().
 *
 * ────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var DEBUG = false;
  function log() { if (DEBUG) console.debug.apply(console, ['[ktl-accordion]'].concat(Array.prototype.slice.call(arguments))); }

  var EVENT_NS   = '.scwKtlAccordion';
  var STYLE_ID   = 'scw-ktl-accordion-css';
  var ENHANCED   = 'data-scw-ktl-accordion';
  var OPT_OUT    = 'data-scw-no-accordion';
  var BTN_SEL    = '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]';
  var DISABLED_ACCORDION_SCENES = { scene_828: true, scene_833: true, scene_873: true, scene_1149: true };

  // ── KTL-independent ("standalone") accordions ──────────────────────────
  // Views our own code turns into accordions WITHOUT KTL's hide/show. The
  // collapse, state, title and (optional) accent are all ours — no KTL button
  // is required or used. This is how we get off KTL: drop `_hsv` from a view
  // in Knack (so KTL stops PAINTING it — that double-paint is the CLS/LCP
  // cost) and add its id here; our code owns it from then on.
  //
  // PILOT: list the view ids you've converted. Empty = nothing changes (the
  // whole standalone engine stays dormant), so this is safe to ship as-is.
  // The standalone pass also SKIPS any view that still has a live KTL button,
  // so a stray id here can't double-wrap a view KTL is still handling.
  //
  // Entry form: a bare 'view_XXXX' (defaults OPEN), or { view:'view_XXXX',
  // collapsed:true } to start COLLAPSED — use the object form for any view
  // that was `_hsv=1,false` (collapsed-by-default), since dropping `_hsv`
  // removes that signal. Persisted user state still wins over the default.
  var STANDALONE_VIEWS = [
    // 'view_XXXX',                          // ← default-open
    // { view: 'view_YYYY', collapsed: true } // ← default-collapsed
  ];

  // All-scenes cutover switch. While FALSE (pilot mode) only STANDALONE_VIEWS
  // is processed. Flip TRUE once KTL's hide/show is OFF GLOBALLY — then every
  // view carrying the `_hsv` keyword (and no KTL button) auto-becomes one of
  // our accordions, no per-view list needed.
  var ENABLE_KEYWORD_DETECTION = false;
  var HSV_CHECK = 'data-scw-hsv-checked';   // per-view "is this an _hsv view?" memo

  // Scenes where KTL is NOT loaded (you gated it out of the Builder loader for
  // these scene keys). On these scenes our keyword path owns every `_hsv` view
  // automatically — keep the `_hsv` keywords in the views; KTL isn't there to
  // paint them, our code reads them. SAFE before you gate the loader: while KTL
  // is still present its buttons exist, and the keyword path skips any view
  // that has a button, so this stays dormant until KTL really is gone.
  // MUST stay in sync with the loader gate (same scene keys).
  var KTL_FREE_SCENES = ['scene_1085', 'scene_1096', 'scene_1116', 'scene_1140', 'scene_1149', 'scene_1155', 'scene_1311'];

  /** The rendered KTL-free scene element on the page, if any (scopes the
   *  keyword scan to just that scene — no document-wide work elsewhere). */
  function ktlFreeSceneEl() {
    for (var i = 0; i < KTL_FREE_SCENES.length; i++) {
      var el = document.getElementById('kn-' + KTL_FREE_SCENES[i]);
      if (el) return el;
    }
    return null;
  }

  // Views where the record count pill is hidden (set to true to hide).
  // view_3869 (alternative SOWs on the project) always contains the
  // current SOW's own row, which hide-self-row.js hides via display:none.
  // The model-based count still includes it, so the pill reads 1 with zero
  // alternatives and 2 with one — off by one and confusing. hide-self-row.js
  // already hides the Knack entries summary for the same reason; hide the
  // pill too.
  var HIDE_COUNT = { view_3869: true };

  // ── SVG icons ──
  var DEFAULT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '</svg>';

  var CHEVRON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/>' +
    '</svg>';

  // ───────────────────────────────────────────────────
  //  CSS injection (once)
  // ───────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ══════════════════════════════════════════════════
         1) The accordion card container — our wrapper owns
            the visual card (background, border, radius, shadow).
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion {',
      '  --scw-accent: #295f91;',
      '  --scw-accent-rgb: 41, 95, 145;',
      '  background: #fff;',
      '  border: 1px solid rgba(0,0,0,.08);',
      '  border-radius: 14px;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,.06);',
      '  overflow: hidden;',
      '  margin: 10px 0;',
      '  width: 100%;',
      '  max-width: 100%;',
      '}',
      /* When expanded, allow dropdowns (Chosen.js) to overflow */
      '.scw-ktl-accordion.is-expanded {',
      '  overflow: visible;',
      '}',

      /* ══════════════════════════════════════════════════
         2) Neutralize legacy styles ONLY inside our wrapper
            so unenhanced KTL sections are untouched.
         ══════════════════════════════════════════════════ */

      /* Cancel the global :has(.ktlHideShowButton) legacy rule on the
         .kn-view host element itself — this is the source of the
         accent-colored background slab. */
      '.kn-view.scw-ktl-accordion-host,',
      '.kn-view.scw-ktl-accordion-host:has(.ktlHideShowButton) {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  max-width: 100% !important;',
      '  overflow: visible !important;',
      '}',

      /* Cancel legacy slab on ktlBoxWithBorder containers */
      'section.ktlBoxWithBorder.scw-ktl-accordion-host,',
      '.scw-ktl-accordion .ktlBoxWithBorder,',
      '.scw-ktl-accordion section.ktlBoxWithBorder {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',

      /* Also kill inner .kn-view and ktlHideShowSection chrome */
      '.scw-ktl-accordion .kn-view,',
      '.scw-ktl-accordion .kn-view[id^="view_"] {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  max-width: 100% !important;',
      '  overflow: visible !important;',
      '}',

      '.scw-ktl-accordion .ktlHideShowSection {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  border: none !important;',
      '  overflow: visible !important;',
      '}',

      /* Visually hide the original KTL button (accessible) */
      '.scw-ktl-accordion ' + BTN_SEL + ' {',
      '  position: absolute !important;',
      '  width: 1px !important;',
      '  height: 1px !important;',
      '  padding: 0 !important;',
      '  margin: -1px !important;',
      '  overflow: hidden !important;',
      '  clip: rect(0,0,0,0) !important;',
      '  white-space: nowrap !important;',
      '  border: 0 !important;',
      '  background: transparent !important;',
      '  color: inherit !important;',
      '}',

      /* ══════════════════════════════════════════════════
         3) Header row
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion__header {',
      '  position: relative;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  width: 100%;',
      '  min-height: 44px;',
      '  padding: 14px 16px 14px 22px;',
      '  margin: 0;',
      '  background: transparent;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  box-sizing: border-box;',
      '  transition: background 180ms ease;',
      '}',

      /* Left accent bar */
      '.scw-ktl-accordion__header::before {',
      '  content: "";',
      '  position: absolute;',
      '  left: 0;',
      '  top: 0;',
      '  bottom: 0;',
      '  width: 6px;',
      '  background: var(--scw-accent);',
      '  border-radius: 14px 0 0 0;',
      '}',

      /* hover */
      '.scw-ktl-accordion__header:hover {',
      '  background: rgba(var(--scw-accent-rgb), 0.06);',
      '}',

      /* expanded state on the wrapper */
      '.scw-ktl-accordion.is-expanded .scw-ktl-accordion__header {',
      '  background: rgba(var(--scw-accent-rgb), 0.10);',
      '}',
      '.scw-ktl-accordion.is-expanded .scw-ktl-accordion__header:hover {',
      '  background: rgba(var(--scw-accent-rgb), 0.14);',
      '}',

      /* Expanded accent bar — round bottom-left too */
      '.scw-ktl-accordion:not(.is-expanded) .scw-ktl-accordion__header::before {',
      '  border-radius: 14px 0 0 14px;',
      '}',

      /* focus-visible */
      '.scw-ktl-accordion__header:focus-visible {',
      '  outline: 2px solid var(--scw-accent);',
      '  outline-offset: -2px;',
      '}',

      /* ── icon ── */
      '.scw-ktl-accordion__header .scw-acc-icon {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 28px;',
      '  margin-right: 6px;',
      '  color: var(--scw-accent);',
      '  opacity: .75;',
      '}',

      /* ── title ── */
      '.scw-ktl-accordion__header .scw-acc-title {',
      '  flex: 1 1 auto;',
      '  padding: 0 8px 0 0;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  color: #1a1a1a;',
      '  line-height: 1.4;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  text-align: left;',
      '}',

      /* ── count pill ── */
      '.scw-ktl-accordion__header .scw-acc-count {',
      '  flex: 0 0 auto;',
      '  display: inline-block;',
      '  padding: 4px 10px;',
      '  margin-right: 8px;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  border-radius: 999px;',
      '  background: rgba(var(--scw-accent-rgb), 0.12);',
      '  border: 1px solid rgba(var(--scw-accent-rgb), 0.22);',
      '  color: rgb(var(--scw-accent-rgb));',
      '  text-align: center;',
      '}',

      /* ── chevron ── */
      '.scw-ktl-accordion__header .scw-acc-chevron {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 24px;',
      '  color: var(--scw-accent);',
      '  transition: transform 220ms ease;',
      '  transform: rotate(0deg);',
      '}',
      '.scw-ktl-accordion:not(.is-expanded) .scw-acc-chevron {',
      '  transform: rotate(-90deg);',
      '}',

      /* ══════════════════════════════════════════════════
         4) Body — ALWAYS neutral white; accent stays in header only.
            Collapses when closed (via JS in syncState).
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion__body {',
      '  padding: 10px 12px 14px 12px;',
      '  background: #fff !important;',
      '  overflow-x: auto;',
      '}',
      /* Let dropdowns overflow the body when accordion is open */
      '.scw-ktl-accordion.is-expanded > .scw-ktl-accordion__body {',
      '  overflow: visible;',
      '}',

      /* Ensure tables stretch to fill the accordion body */
      '.scw-ktl-accordion__body .kn-table-wrapper {',
      '  width: 100%;',
      '}',
      '.scw-ktl-accordion__body table.kn-table {',
      '  width: 100%;',
      '}',

      /* Legacy accent containers inside the body — targeted instead of
         wildcard * so table striping and other content backgrounds
         are preserved. */
      '.scw-ktl-accordion__body > .kn-view,',
      '.scw-ktl-accordion__body .ktlBoxWithBorder,',
      '.scw-ktl-accordion__body .ktlHideShowSection,',
      '.scw-ktl-accordion__body .view-header {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',

      /* ══════════════════════════════════════════════════
         5) Hide duplicate KTL header and shrink link
         ══════════════════════════════════════════════════ */

      /* Hide the native Knack view-header (duplicate title + raw keyword
         description like _hsv= / _scwmenu= / _hc=) — our own
         .scw-ktl-accordion__header replaces it. Covers BOTH the KTL button
         path and standalone (KTL-off) accordions, and unlike neutralizeHost()'s
         inline style it survives Knack innerHTML re-renders that recreate a
         fresh, un-hidden .view-header. */
      '.scw-ktl-accordion .view-header {',
      '  display: none !important;',
      '}',

      /* Hide shrink link — our chevron replaces it */
      '.scw-ktl-accordion a.ktlShrinkLink {',
      '  display: none !important;',
      '}',
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ───────────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────────
  function viewKeyFromButtonId(id) {
    var m = (id || '').match(/^hideShow_(view_\d+)_button$/);
    return m ? m[1] : null;
  }

  function arrowForViewKey(viewKey) {
    return document.getElementById('hideShow_' + viewKey + '_arrow');
  }

  /** Is the KTL section currently expanded?
   *  Primary: check computed display of the KTL hide/show section.
   *  Fallback: check arrow class.
   */
  function isExpanded(viewKey) {
    // Check the actual KTL section visibility (source of truth)
    var section = document.querySelector('.hideShow_' + viewKey + '.ktlHideShowSection');
    if (section) {
      var disp = getComputedStyle(section).display;
      return disp !== 'none';
    }
    // Fallback to arrow class
    var arrow = arrowForViewKey(viewKey);
    if (!arrow) return true;
    return arrow.classList.contains('ktlDown');
  }

  /** Read the effective background-color from the KTL button. */
  function readAccentColor(btn) {
    var raw = getComputedStyle(btn).backgroundColor;
    if (!raw || raw === 'rgba(0, 0, 0, 0)' || raw === 'transparent') return null;
    return raw;
  }

  /**
   * Parse an rgb(r,g,b) or rgba(r,g,b,a) string into "r, g, b" for use
   * in rgba(var(--scw-accent-rgb), alpha).
   */
  function parseRgb(cssColor) {
    if (!cssColor) return null;
    var m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    return m[1] + ', ' + m[2] + ', ' + m[3];
  }

  /** Extract title text from KTL button, stripping arrow text. */
  function readTitle(btn) {
    var clone = btn.cloneNode(true);
    var arrows = clone.querySelectorAll('.ktlArrow');
    for (var i = 0; i < arrows.length; i++) arrows[i].remove();
    var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return text || 'Section';
  }

  /** Best-effort record count from content container. */
  function computeCount(viewKey) {
    var viewEl = document.getElementById(viewKey);
    if (!viewEl) return null;

    // Knack model — preferred. Returns the true record count for the
    // view regardless of which accordion groups happen to be open. The
    // DOM walks below were undercounting on view_3610 / view_3586
    // because group-collapse hides closed L1/L2 groups via display:none
    // and the worksheet-row filter excluded them.
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var data = v && v.model && v.model.data;
      var models = data && data.models;
      if (models && typeof models.length === 'number' && models.length > 0) {
        return models.length;
      }
    } catch (e) { /* fall through to DOM */ }

    var tbody = viewEl.querySelector('table.kn-table tbody');
    if (tbody) {
      // If device-worksheet has transformed this view, count worksheet
      // rows. Don't filter on display:none here — group-collapse
      // intentionally hides closed-group rows but they still count
      // toward the view's record total.
      var wsRows = tbody.querySelectorAll('tr.scw-ws-row');
      if (wsRows.length) return wsRows.length;

      var rows = tbody.querySelectorAll('tr');
      var real = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i].classList.contains('kn-tr-nodata') &&
            !rows[i].classList.contains('kn-table-group') &&
            !rows[i].classList.contains('kn-table-totals')) {
          real++;
        }
      }
      return real > 0 ? real : null;
    }

    var paging = viewEl.querySelector('.kn-entries-summary');
    if (paging) {
      var m = (paging.textContent || '').match(/of\s+(\d+)/);
      if (m) return parseInt(m[1], 10) || null;
    }

    return null;
  }

  // ───────────────────────────────────────────────────
  //  Build accordion header
  // ───────────────────────────────────────────────────
  function buildHeader(btn, viewKey, titleOverride) {
    var header = document.createElement('div');
    header.className = 'scw-ktl-accordion__header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');
    header.setAttribute('data-view-key', viewKey);

    var iconWrap = document.createElement('span');
    iconWrap.className = 'scw-acc-icon';
    iconWrap.innerHTML = DEFAULT_ICON_SVG;
    header.appendChild(iconWrap);

    var titleWrap = document.createElement('span');
    titleWrap.className = 'scw-acc-title';
    // Standalone (KTL-independent) accordions pass an explicit title since
    // there is no KTL button to read it from.
    titleWrap.textContent = titleOverride || (btn ? readTitle(btn) : 'Section');
    header.appendChild(titleWrap);

    var countWrap = document.createElement('span');
    countWrap.className = 'scw-acc-count';
    countWrap.textContent = '0';
    countWrap.style.visibility = 'hidden';
    header.appendChild(countWrap);

    var chevronWrap = document.createElement('span');
    chevronWrap.className = 'scw-acc-chevron';
    chevronWrap.innerHTML = CHEVRON_SVG;
    header.appendChild(chevronWrap);

    return header;
  }

  function syncState(wrapper, header, viewKey) {
    // Skip expand/collapse sync while applySavedState is active —
    // prevents the MutationObserver from undoing the restored state.
    if (!_restoreActive) {
      var expanded = isExpanded(viewKey);
      wrapper.classList.toggle('is-expanded', expanded);
      header.setAttribute('aria-expanded', String(expanded));

      var bodyEl = wrapper.querySelector('.scw-ktl-accordion__body');
      if (bodyEl) bodyEl.style.display = expanded ? '' : 'none';
    }

    // Count pill (hidden for views listed in HIDE_COUNT)
    var countEl = header.querySelector('.scw-acc-count');
    if (countEl) {
      if (HIDE_COUNT[viewKey]) {
        countEl.style.display = 'none';
      } else {
        var count = computeCount(viewKey);
        if (count !== null) {
          countEl.textContent = count;
          countEl.style.display = '';
          countEl.style.visibility = '';
        } else {
          // Reserve space so buttons stay aligned across accordions
          countEl.textContent = '0';
          countEl.style.display = '';
          countEl.style.visibility = 'hidden';
        }
      }
    }

    // Refresh accent color (may change after hsv override injection)
    var btn = document.getElementById('hideShow_' + viewKey + '_button');
    if (btn) {
      var accent = readAccentColor(btn);
      if (accent) {
        wrapper.style.setProperty('--scw-accent', accent);
        var rgb = parseRgb(accent);
        if (rgb) wrapper.style.setProperty('--scw-accent-rgb', rgb);
      }
    }
  }

  // ───────────────────────────────────────────────────
  //  Header click binding
  // ───────────────────────────────────────────────────

  /**
   * Bind (or re-bind) the accordion header so clicks toggle the given
   * KTL button.  Uses a data attribute to store a mutable reference key
   * and a shared map so re-binding after a view refresh is cheap —
   * we just swap the button reference, no need to replace listeners.
   */
  var _btnRefs = {};   // viewKey → current button element

  // ── Persistent accordion state ──────────────────────────────
  // Accordion state is stored in localStorage so it survives
  // browser close, not just page refreshes.
  // The in-memory _savedCollapsed is still used as a fast-path
  // for the coordinated post-edit restore flow.

  var STORAGE_KEY = 'scw_ktl_accordion_state';
  var _savedCollapsed = null;  // transient snapshot for post-edit flow
  var _restoreActive = false;  // suppress syncState during restore window

  // Migrate from sessionStorage → localStorage (one-time)
  try {
    var legacy = sessionStorage.getItem(STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) { /* ignore */ }

  // Workflow-step accordions on the sales build-proposal page are an
  // exception to the remember-open/closed persistence: on every page load
  // (refresh / navigation) they ALWAYS start collapsed, regardless of how
  // the user left them last session. The user can still open them during a
  // session. This is applied on the page-load restore path only (see
  // loadPersistedState); the post-edit in-memory snapshot path is untouched
  // so an inline edit elsewhere doesn't slam an open step closed.
  var ALWAYS_COLLAPSED_ON_LOAD = { view_2924: true, view_3853: true };

  /** Read persisted state from localStorage. */
  function loadPersistedState() {
    var state = {};
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw) || {};
    } catch (e) { state = {}; }
    // Force the always-collapsed step accordions closed on load even if a
    // prior session persisted them open.
    for (var vk in ALWAYS_COLLAPSED_ON_LOAD) {
      if (ALWAYS_COLLAPSED_ON_LOAD[vk]) state[vk] = true;
    }
    return state;
  }

  /** Write state to localStorage. */
  function persistState(stateMap) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateMap));
    } catch (e) { /* quota / unavailable */ }
  }

  /** Scan current DOM and persist accordion states.
   *  Returns a map of viewKey → true (collapsed) / false (expanded).
   *  Both states are recorded so applySavedState can distinguish
   *  "user explicitly left this open" from "never toggled (no entry)". */
  function persistCurrentState() {
    var stateMap = {};
    var wrappers = document.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < wrappers.length; i++) {
      var hdr = wrappers[i].querySelector('.scw-ktl-accordion__header');
      if (!hdr) continue;
      var vk = hdr.getAttribute('data-view-key');
      if (vk) {
        stateMap[vk] = !wrappers[i].classList.contains('is-expanded');
      }
    }
    persistState(stateMap);
    return stateMap;
  }

  function snapshotState() {
    _savedCollapsed = persistCurrentState();
    log('snapshotState', _savedCollapsed);
  }

  function applySavedState() {
    // Use in-memory snapshot if available (post-edit flow),
    // otherwise fall back to sessionStorage (page refresh).
    var saved = _savedCollapsed || loadPersistedState();
    var isPostEdit = !!_savedCollapsed;   // in-memory snapshot = post-edit
    _savedCollapsed = null;

    if (!saved) return;

    // Block syncState from overriding our state while we apply it
    // (MutationObserver fires enhance→syncState on each DOM change).
    _restoreActive = true;

    var wrappers = document.querySelectorAll('.scw-ktl-accordion');
    var touched = false;
    for (var i = 0; i < wrappers.length; i++) {
      var hdr = wrappers[i].querySelector('.scw-ktl-accordion__header');
      if (!hdr) continue;
      var vk = hdr.getAttribute('data-view-key');
      if (!vk) continue;

      // Only restore views that are EXPLICITLY in the saved map.
      // Views not in the map keep whatever state KTL set as default
      // (respects _hsv=1,false / _hsv=1,true).
      //
      // For the post-edit flow (in-memory snapshot), the snapshot
      // captured the full DOM state including defaults, so every
      // visible accordion has an entry — this guard only matters
      // for the sessionStorage path (page load / navigation) where
      // un-toggled views correctly have no entry.
      if (!(vk in saved)) {
        log('skipped (no saved entry, keeping KTL default)', vk);
        continue;
      }

      var section = document.querySelector('.hideShow_' + vk + '.ktlHideShowSection');
      var arrow = document.getElementById('hideShow_' + vk + '_arrow');

      if (saved[vk]) {
        // This accordion was collapsed — collapse it again
        wrappers[i].classList.remove('is-expanded');
        hdr.setAttribute('aria-expanded', 'false');
        var bodyEl = wrappers[i].querySelector('.scw-ktl-accordion__body');
        if (bodyEl) bodyEl.style.display = 'none';
        if (section) section.style.display = 'none';
        if (arrow) {
          arrow.classList.remove('ktlDown');
          arrow.classList.add('ktlUp');
        }
        log('restored collapsed', vk);
        touched = true;
      } else {
        // This accordion was expanded — force it open.
        // Use explicit 'block' (not '') so KTL's own hidden state
        // doesn't bleed through when the inline style is removed.
        wrappers[i].classList.add('is-expanded');
        hdr.setAttribute('aria-expanded', 'true');
        var bodyOpen = wrappers[i].querySelector('.scw-ktl-accordion__body');
        if (bodyOpen) bodyOpen.style.display = '';
        if (section) section.style.display = 'block';
        if (arrow) {
          arrow.classList.remove('ktlUp');
          arrow.classList.add('ktlDown');
        }
        log('restored expanded', vk);
        touched = true;
      }
    }

    // Keep the guard up long enough for MutationObserver + rAF to settle,
    // but only if we actually changed something.  Shorter guard (300ms)
    // avoids blocking ktl-hide-show-state.js from restoring user prefs
    // stored in localStorage.
    if (touched) {
      setTimeout(function () { _restoreActive = false; }, 300);
    } else {
      _restoreActive = false;
    }
  }

  function bindHeader(wrap, hdr, btnEl, vKey) {
    _btnRefs[vKey] = btnEl;               // always update to latest button

    // Track listeners on the DOM element itself so we correctly re-attach
    // after SPA navigations that destroy and recreate accordion headers.
    if (hdr.getAttribute('data-scw-bound') === '1') return;
    hdr.setAttribute('data-scw-bound', '1');

    function triggerToggle() {
      if (hdr.dataset.scwBusy === '1') return;
      hdr.dataset.scwBusy = '1';
      setTimeout(function () { hdr.dataset.scwBusy = '0'; }, 150);

      var bodyEl = wrap.querySelector('.scw-ktl-accordion__body');
      if (bodyEl) bodyEl.style.display = '';

      _btnRefs[vKey].click();             // always use current reference

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          syncState(wrap, hdr, vKey);
          persistCurrentState();   // persist toggle to sessionStorage
        });
      });
    }

    hdr.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerToggle();
    });
    hdr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        triggerToggle();
      }
    });
  }

  /** Update the button reference for an existing header (after view re-render). */
  function rebindHeader(wrap, hdr, btnEl, vKey) {
    bindHeader(wrap, hdr, btnEl, vKey);
  }

  // ───────────────────────────────────────────────────
  //  Enhancement pass
  // ───────────────────────────────────────────────────
  function enhance() {
    var buttons = document.querySelectorAll(BTN_SEL);

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];

      // Opt-out check
      if (btn.hasAttribute(OPT_OUT)) continue;
      var knView = btn.closest('.kn-view');
      if (knView && knView.hasAttribute(OPT_OUT)) continue;

      // Scene exclusion — skip accordion enhancement on disabled scenes
      var knScene = btn.closest('.kn-scene');
      if (knScene) {
        var sceneId = (knScene.id || '').replace('kn-', '');
        if (DISABLED_ACCORDION_SCENES[sceneId]) continue;
      }

      // Already enhanced?
      if (btn.getAttribute(ENHANCED) === '1') {
        // Sync state for existing wrapper
        var existingWrapper = btn.closest('.scw-ktl-accordion');
        if (existingWrapper) {
          var existingHeader = existingWrapper.querySelector('.scw-ktl-accordion__header');
          if (existingHeader) {
            var vk = existingHeader.getAttribute('data-view-key');
            syncState(existingWrapper, existingHeader, vk);
          }
        }
        continue;
      }

      var viewKey = viewKeyFromButtonId(btn.id);
      if (!viewKey) continue;

      // ── Re-rendered inside existing accordion? ──
      // After an inline-edit refresh, Knack may replace the DOM inside
      // #view_XXXX (innerHTML swap) OR replace the entire element.
      //
      // Case 1: button is still inside an existing wrapper (innerHTML swap).
      // Case 2: button is outside, but an orphaned wrapper with a matching
      //         data-view-key header exists (element replacement).
      //
      // In both cases, re-adopt the button into the existing wrapper
      // instead of creating a duplicate.
      var existingAncestor = btn.closest('.scw-ktl-accordion');
      if (!existingAncestor) {
        var orphanHdr = document.querySelector(
          '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]'
        );
        if (orphanHdr) existingAncestor = orphanHdr.closest('.scw-ktl-accordion');
      }

      if (existingAncestor) {
        btn.setAttribute(ENHANCED, '1');
        var existingHdr = existingAncestor.querySelector('.scw-ktl-accordion__header');
        if (existingHdr) {
          // Move the new view element into the existing wrapper's body
          var existingBody = existingAncestor.querySelector('.scw-ktl-accordion__body');
          var wrapTarget = knView || btn.parentNode;
          if (existingBody && wrapTarget && wrapTarget.parentNode !== existingBody) {
            // Place wrapper right before the new view element so position is preserved
            wrapTarget.parentNode.insertBefore(existingAncestor, wrapTarget);
            existingBody.appendChild(wrapTarget);
          }
          // Neutralize legacy accent on the (possibly new) .kn-view host
          if (knView) {
            knView.classList.add('scw-ktl-accordion-host');
            knView.style.setProperty('background', 'transparent', 'important');
            knView.style.setProperty('background-color', 'transparent', 'important');
            knView.style.setProperty('padding', '0', 'important');
            knView.style.setProperty('border-radius', '0', 'important');
            knView.style.setProperty('box-shadow', 'none', 'important');
            knView.style.setProperty('margin', '0', 'important');
          }
          // Re-bind the header click to the NEW button element
          rebindHeader(existingAncestor, existingHdr, btn, viewKey);
          syncState(existingAncestor, existingHdr, viewKey);
        }
        log('re-adopted (post-refresh)', viewKey);
        continue;
      }

      log('enhancing', viewKey);

      // Mark button as enhanced
      btn.setAttribute(ENHANCED, '1');

      // Read accent color BEFORE any DOM changes (computed style is still
      // accurate while the button is visible).
      var accent = readAccentColor(btn);
      var accentRgb = parseRgb(accent);

      // ── Build the wrapper structure ──
      // Determine the node to wrap — the .kn-view that contains the button.
      var wrapTarget = knView || btn.parentNode;

      // Cancel the legacy accent background on the .kn-view host.
      // KTL injects ID-based rules like #view_3507 { background-color: … !important }
      // which beat any class selector.  Inline !important is the only way to win.
      if (knView) {
        knView.classList.add('scw-ktl-accordion-host');
        knView.style.setProperty('background', 'transparent', 'important');
        knView.style.setProperty('background-color', 'transparent', 'important');
        knView.style.setProperty('padding', '0', 'important');
        knView.style.setProperty('border-radius', '0', 'important');
        knView.style.setProperty('box-shadow', 'none', 'important');
        knView.style.setProperty('margin', '0', 'important');
        // Also neutralize any ancestor .kn-view that matches :has()
        var ancestor = knView.parentElement;
        while (ancestor) {
          if (ancestor.classList && ancestor.classList.contains('kn-view')) {
            ancestor.classList.add('scw-ktl-accordion-host');
            ancestor.style.setProperty('background', 'transparent', 'important');
            ancestor.style.setProperty('background-color', 'transparent', 'important');
          }
          ancestor = ancestor.parentElement;
        }
      }

      // Create our wrapper card
      var wrapper = document.createElement('div');
      wrapper.className = 'scw-ktl-accordion';
      if (accent) wrapper.style.setProperty('--scw-accent', accent);
      if (accentRgb) wrapper.style.setProperty('--scw-accent-rgb', accentRgb);

      // Build header
      var header = buildHeader(btn, viewKey);

      // Create body container
      var body = document.createElement('div');
      body.className = 'scw-ktl-accordion__body';

      // Insert wrapper where the wrapTarget currently sits,
      // then move wrapTarget into the body.
      wrapTarget.parentNode.insertBefore(wrapper, wrapTarget);
      wrapper.appendChild(header);
      wrapper.appendChild(body);
      body.appendChild(wrapTarget);

      // Forward clicks from our header to the KTL button.
      bindHeader(wrapper, header, btn, viewKey);

      // Initial state sync
      syncState(wrapper, header, viewKey);

      // MutationObserver on content for count updates
      (function (wrap, hdr, vKey) {
        var viewEl = document.getElementById(vKey);
        if (!viewEl) return;
        var countRaf = 0;
        var contentObs = new MutationObserver(function () {
          if (countRaf) cancelAnimationFrame(countRaf);
          countRaf = requestAnimationFrame(function () {
            countRaf = 0;
            syncState(wrap, hdr, vKey);
          });
        });
        contentObs.observe(viewEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style']   // catch row display:none toggles (e.g. hide-self-row)
        });
      })(wrapper, header, viewKey);
    }

    // KTL-independent pass — views WE own directly (no KTL button needed).
    // Dormant unless STANDALONE_VIEWS is populated (or keyword detection is on).
    enhanceStandalone();
  }

  // ───────────────────────────────────────────────────
  //  Standalone (KTL-independent) accordions
  // ───────────────────────────────────────────────────

  /** Raw view description from the Knack model — retains `_hsv` / `_hsvcolor`
   *  keywords even after KTL strips them from the rendered DOM. */
  function viewDescription(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var m = v && v.model;
      var d = m && ((m.view && m.view.description) ||
                    (m.attributes && m.attributes.description));
      return d ? String(d) : '';
    } catch (e) { return ''; }
  }

  /** Raw view title from the Knack model. Available as soon as the view
   *  object exists — unlike the rendered `.kn-title`, it isn't subject to the
   *  DOM-render race that left standalone headers stuck on the "Section"
   *  fallback when KTL is gated off. Mirrors viewDescription()'s model paths. */
  function viewTitle(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var m = v && v.model;
      var t = m && ((m.view && m.view.title) ||
                    (m.attributes && m.attributes.title));
      return t ? String(t) : '';
    } catch (e) { return ''; }
  }

  /** Parse KTL's `_hsv` keyword. Returns null when the view is NOT a
   *  hide/show view, else { defaultExpanded } from `_hsv=1,<bool>` (second
   *  param false = collapsed by default). The `=` immediately after `_hsv`
   *  means `_hsvcolor=` never matches here. */
  function hsvKeyword(viewKey) {
    var t = viewDescription(viewKey).replace(/<br\s*\/?>/gi, ' ');
    var m = t.match(/_hsv=([^\s<]+)/i);
    if (!m) return null;
    var second = (m[1].split(',')[1] || '').trim().toLowerCase();
    return { defaultExpanded: second !== 'false' };
  }

  /** Optional per-view accent from `_hsvcolor=#hex`. Named-keyword colors
   *  (e.g. `_hsvcolor=documentation`) are a follow-up — default slate else. */
  function parseHsvColor(viewKey) {
    var m = viewDescription(viewKey).match(/_hsvcolor=(#[0-9a-fA-F]{3,8})/);
    return m ? m[1] : null;
  }

  /** Title for a standalone accordion — the view's own header text, with any
   *  leftover KTL keyword tokens stripped (in case KTL isn't stripping them). */
  function nativeTitle(knView) {
    function clean(s) {
      return (s || '').replace(/_hsv\w*=\S+/gi, '').replace(/\s+/g, ' ').trim();
    }
    // Prefer the Knack model title (populated immediately); fall back to the
    // rendered header only if the model isn't ready yet.
    var fromModel = clean(viewTitle(knView && knView.id));
    if (fromModel) return fromModel;
    var h = knView.querySelector(
      '.view-header .kn-title, .view-header h1, .view-header h2, .view-header h3, ' +
      'h1.kn-title, .kn-title'
    );
    return clean((h && h.textContent) || '') || 'Section';
  }

  /** Neutralize legacy KTL/Knack chrome on the host .kn-view (same treatment
   *  the button path applies) so only our card shows the visual. */
  function neutralizeHost(knView) {
    knView.classList.add('scw-ktl-accordion-host');
    knView.style.setProperty('background', 'transparent', 'important');
    knView.style.setProperty('background-color', 'transparent', 'important');
    knView.style.setProperty('padding', '0', 'important');
    knView.style.setProperty('border-radius', '0', 'important');
    knView.style.setProperty('box-shadow', 'none', 'important');
    knView.style.setProperty('margin', '0', 'important');
    var nativeHdr = knView.querySelector('.view-header');
    if (nativeHdr) nativeHdr.style.display = 'none';   // our header replaces it
  }

  /** Apply open/closed to a standalone wrapper (our body IS the collapse —
   *  it contains the moved .kn-view, so display:none hides the content). */
  function setOpen(wrap, hdr, open) {
    wrap.classList.toggle('is-expanded', !!open);
    if (hdr) hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
    var body = wrap.querySelector('.scw-ktl-accordion__body');
    if (body) body.style.display = open ? '' : 'none';
  }

  function updateStandaloneCount(hdr, viewKey) {
    var el = hdr.querySelector('.scw-acc-count');
    if (!el) return;
    if (HIDE_COUNT[viewKey]) { el.style.display = 'none'; return; }
    var c = computeCount(viewKey);
    if (c !== null) { el.textContent = c; el.style.display = ''; el.style.visibility = ''; }
    else { el.textContent = '0'; el.style.display = ''; el.style.visibility = 'hidden'; }
  }

  function bindStandaloneHeader(wrap, hdr, viewKey) {
    if (hdr.getAttribute('data-scw-bound') === '1') return;
    hdr.setAttribute('data-scw-bound', '1');
    function toggle() {
      setOpen(wrap, hdr, !wrap.classList.contains('is-expanded'));
      persistCurrentState();   // shared persistence — keyed by data-view-key
    }
    hdr.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      toggle();
    });
    hdr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        toggle();
      }
    });
  }

  function buildStandaloneAccordion(knView, viewKey, opts) {
    if (!knView) return;
    // Never take over a view KTL is still handling (defense-in-depth; the
    // callers already skip buttoned views, this guards the race window).
    if (document.getElementById('hideShow_' + viewKey + '_button')) return;
    if (knView.hasAttribute(OPT_OUT)) return;
    var knScene = knView.closest('.kn-scene');
    if (knScene) {
      var sid = (knScene.id || '').replace('kn-', '');
      if (DISABLED_ACCORDION_SCENES[sid]) return;
    }
    // Already wrapped (Knack swapped innerHTML but kept our wrapper) → done.
    if (knView.closest('.scw-ktl-accordion')) { knView.setAttribute(ENHANCED, '1'); return; }

    // Re-adopt: Knack replaced the whole .kn-view element — move the fresh one
    // into the existing wrapper rather than building a duplicate (mirrors the
    // button path's re-adoption).
    var orphanHdr = document.querySelector(
      '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]'
    );
    var orphanWrap = orphanHdr && orphanHdr.closest('.scw-ktl-accordion');
    if (orphanWrap) {
      var ob = orphanWrap.querySelector('.scw-ktl-accordion__body');
      if (ob) {
        knView.parentNode.insertBefore(orphanWrap, knView);
        ob.appendChild(knView);
        neutralizeHost(knView);
        // Self-heal a placeholder title: the first build may have run before
        // the model/header title was available, leaving "Section".
        var ttlEl = orphanHdr.querySelector('.scw-acc-title');
        if (ttlEl && (!ttlEl.textContent || ttlEl.textContent.trim() === 'Section')) {
          var fresh = nativeTitle(knView);
          if (fresh && fresh !== 'Section') ttlEl.textContent = fresh;
        }
        knView.setAttribute(ENHANCED, '1');
        return;
      }
    }

    // Fresh build.
    var title = nativeTitle(knView);
    var accent = parseHsvColor(viewKey);
    var kw = hsvKeyword(viewKey);
    var persisted = loadPersistedState();
    // Default: persisted user state wins; else an explicit per-view default
    // from the config; else the `_hsv` keyword (if still present); else open.
    var open = (viewKey in persisted) ? !persisted[viewKey]
             : (opts && opts.defaultCollapsed != null) ? !opts.defaultCollapsed
             : (kw ? kw.defaultExpanded : true);

    neutralizeHost(knView);
    knView.setAttribute(ENHANCED, '1');

    var wrapper = document.createElement('div');
    wrapper.className = 'scw-ktl-accordion';
    if (accent) {
      wrapper.style.setProperty('--scw-accent', accent);
      var rgb = parseRgb(accent);
      if (rgb) wrapper.style.setProperty('--scw-accent-rgb', rgb);
    }

    var header = buildHeader(null, viewKey, title);
    var body = document.createElement('div');
    body.className = 'scw-ktl-accordion__body';

    knView.parentNode.insertBefore(wrapper, knView);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    body.appendChild(knView);

    setOpen(wrapper, header, open);
    bindStandaloneHeader(wrapper, header, viewKey);

    updateStandaloneCount(header, viewKey);
    (function (hdr, vk) {
      var raf = 0;
      var obs = new MutationObserver(function () {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () { raf = 0; updateStandaloneCount(hdr, vk); });
      });
      var el = document.getElementById(vk);
      if (el) obs.observe(el, { childList: true, subtree: true });
    })(header, viewKey);
  }

  function enhanceStandalone() {
    // (1) Explicit pilot list. Cheap — one getElementById per listed id. Skip
    // any view KTL is still handling (live button) so we never double-wrap.
    for (var i = 0; i < STANDALONE_VIEWS.length; i++) {
      var entry = STANDALONE_VIEWS[i];
      var vk = (typeof entry === 'string') ? entry : (entry && entry.view);
      if (!vk) continue;
      if (document.getElementById('hideShow_' + vk + '_button')) continue;
      var el = document.getElementById(vk);
      if (el) {
        buildStandaloneAccordion(el, vk,
          (entry && typeof entry === 'object') ? { defaultCollapsed: !!entry.collapsed } : null);
      }
    }

    // (2) Keyword-driven. Runs for the all-scenes cutover (global flag) OR,
    // scoped tight, on a designated KTL-free scene. Anywhere else: no scan.
    var root = ENABLE_KEYWORD_DETECTION ? document : ktlFreeSceneEl();
    if (!root) return;
    var views = root.querySelectorAll('.kn-view[id^="view_"]');
    for (var j = 0; j < views.length; j++) {
      var knView = views[j];
      var vkey = knView.id;
      if (!vkey) continue;
      if (document.getElementById('hideShow_' + vkey + '_button')) continue; // KTL owns it
      // Classify once (description read is cheap but memoize anyway).
      var flag = knView.getAttribute(HSV_CHECK);
      if (flag == null) {
        flag = hsvKeyword(vkey) ? '1' : '0';
        knView.setAttribute(HSV_CHECK, flag);
      }
      if (flag === '1') buildStandaloneAccordion(knView, vkey);
    }
  }

  // ───────────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────────
  injectCss();

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(function () {
        enhance();
        applySavedState();
      }, 80);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      setTimeout(function () {
        enhance();
        applySavedState();
      }, 80);
    });

  // Global MutationObserver to catch KTL buttons added outside
  // normal Knack render events (e.g., lazy KTL init).
  var globalRaf = 0;
  var globalObs = new MutationObserver(function () {
    if (globalRaf) cancelAnimationFrame(globalRaf);
    globalRaf = requestAnimationFrame(function () {
      globalRaf = 0;
      enhance();
    });
  });
  globalObs.observe(document.body, { childList: true, subtree: true });

  // Persist collapsed state before page unload (refresh / close)
  window.addEventListener('beforeunload', persistCurrentState);

  $(document).ready(function () {
    setTimeout(function () {
      enhance();
      // Restore collapsed state from sessionStorage after initial build
      applySavedState();
    }, 300);
  });

  // ── Expose API ──
  window.SCW = window.SCW || {};
  window.SCW.ktlAccordion = {
    /** Force re-enhancement pass */
    refresh: enhance,
    /** Snapshot current collapsed/expanded state (call before re-render) */
    saveState: snapshotState,
    /** Apply saved state after re-render (call after enhance/refresh) */
    restoreState: applySavedState,
    /** Toggle debug logging */
    debug: function (on) { DEBUG = !!on; }
  };
})();
