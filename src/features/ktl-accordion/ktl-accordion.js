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
      '  max-width: 100%;',
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
      '}',

      /* Nuclear: strip ALL background from EVERY element inside the
         body so no accent color can leak through, period. */
      '.scw-ktl-accordion__body * {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',

      /* ══════════════════════════════════════════════════
         5) Hide duplicate KTL header and shrink link
         ══════════════════════════════════════════════════ */

      /* Hide the view-header that contains the KTL button (duplicate title) */
      '.scw-ktl-accordion .view-header:has(.ktlHideShowButton) {',
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

    var tbody = viewEl.querySelector('table.kn-table tbody');
    if (tbody) {
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
  function buildHeader(btn, viewKey) {
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
    titleWrap.textContent = readTitle(btn);
    header.appendChild(titleWrap);

    var countWrap = document.createElement('span');
    countWrap.className = 'scw-acc-count';
    countWrap.style.display = 'none';
    header.appendChild(countWrap);

    var chevronWrap = document.createElement('span');
    chevronWrap.className = 'scw-acc-chevron';
    chevronWrap.innerHTML = CHEVRON_SVG;
    header.appendChild(chevronWrap);

    return header;
  }

  function syncState(wrapper, header, viewKey) {
    var expanded = isExpanded(viewKey);
    wrapper.classList.toggle('is-expanded', expanded);
    header.setAttribute('aria-expanded', String(expanded));

    // Toggle body visibility via JS (not CSS) so the KTL button
    // inside the body stays clickable when we need to expand.
    var bodyEl = wrapper.querySelector('.scw-ktl-accordion__body');
    if (bodyEl) bodyEl.style.display = expanded ? '' : 'none';

    // Count pill
    var countEl = header.querySelector('.scw-acc-count');
    if (countEl) {
      var count = computeCount(viewKey);
      if (count !== null) {
        countEl.textContent = count;
        countEl.style.display = '';
      } else {
        countEl.style.display = 'none';
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

      // Tag the .kn-view host so our CSS can cancel the global
      // :has(.ktlHideShowButton) legacy background rule.
      if (knView) knView.classList.add('scw-ktl-accordion-host');

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
      // Uses a busy lock to prevent rapid double-activation and
      // double-RAF to let KTL finish before we read state.
      (function (wrap, hdr, btnEl, vKey) {
        function triggerToggle() {
          // Busy lock — prevent double-toggle
          if (hdr.dataset.scwBusy === '1') return;
          hdr.dataset.scwBusy = '1';
          setTimeout(function () { hdr.dataset.scwBusy = '0'; }, 150);

          // Ensure body is visible so KTL can process the click
          var bodyEl = wrap.querySelector('.scw-ktl-accordion__body');
          if (bodyEl) bodyEl.style.display = '';

          // Fire KTL toggle exactly once
          btnEl.click();

          // Double-RAF: wait for KTL to finish applying display changes
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              syncState(wrap, hdr, vKey);
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
      })(wrapper, header, btn, viewKey);

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
        contentObs.observe(viewEl, { childList: true, subtree: true });
      })(wrapper, header, viewKey);
    }
  }

  // ───────────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────────
  injectCss();

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 80);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 80);
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

  $(document).ready(function () {
    setTimeout(enhance, 300);
  });

  // ── Expose API ──
  window.SCW = window.SCW || {};
  window.SCW.ktlAccordion = {
    /** Force re-enhancement pass */
    refresh: enhance,
    /** Toggle debug logging */
    debug: function (on) { DEBUG = !!on; }
  };
})();
