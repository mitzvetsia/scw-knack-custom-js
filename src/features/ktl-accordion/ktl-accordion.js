/**
 * ─── Primary Accordion Style ───────────────────────────────────────────
 *
 * Layers a polished accordion header on top of every KTL hide/show
 * (expand/collapse) button across the entire Knack app.
 *
 * WHAT IT DOES
 *   • Wraps each .ktlHideShowButton in a .scw-ktl-accordion-header div
 *     with: left accent bar, optional icon, title, optional count pill,
 *     and a rotating chevron.
 *   • Expanded state gets a tinted background + stronger shadow;
 *     collapsed state is neutral.
 *   • All colours auto-inherit from each button's computed background
 *     (including per-view _hsvcolor overrides from extract-hsv-color.js).
 *
 * HOW IT DETECTS KTL BLOCKS
 *   Selector: .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]
 *   Skips elements marked with [data-scw-no-accordion] or already
 *   enhanced with [data-scw-ktl-accordion="1"].
 *
 * HOW IT DETERMINES THE CONTENT CONTAINER
 *   1. Extracts the view key from the button id (hideShow_view_NNN_button).
 *   2. Looks for a sibling/descendant element whose visibility KTL
 *      toggles — the first element inside the same .kn-view whose
 *      display changes on toggle.  Heuristic: the wrapper .kn-view
 *      itself (KTL hides its children), or the nearest
 *      section.ktlBoxWithBorder's content after the button.
 *
 * HOW TO DISABLE ON A SPECIFIC BUTTON
 *   Add  data-scw-no-accordion  attribute to the .ktlHideShowButton
 *   element (or its parent .kn-view).
 *
 * ────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var DEBUG = false;
  function log() { if (DEBUG) console.debug.apply(console, ['[ktl-accordion]'].concat(Array.prototype.slice.call(arguments))); }

  var EVENT_NS   = '.scwKtlAccordion';
  var STYLE_ID   = 'scw-ktl-accordion-css';
  var ENHANCED    = 'data-scw-ktl-accordion';
  var OPT_OUT    = 'data-scw-no-accordion';
  var BTN_SEL    = '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]';

  // ── Default icon (small folder) — SVG data-URI so it works everywhere ──
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
      /* ── header wrapper ── */
      '.scw-ktl-accordion-header {',
      '  --scw-accent: #295f91;',
      '  position: relative;',
      '  display: flex;',
      '  align-items: center;',
      '  width: 100%;',
      '  min-height: 38px;',
      '  padding: 0;',
      '  margin: 0;',
      '  background: #f8f9fa;',
      '  border: 1px solid rgba(0,0,0,.08);',
      '  border-left: 5px solid var(--scw-accent);',
      '  border-radius: 6px;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  box-sizing: border-box;',
      '  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;',
      '  overflow: hidden;',
      '}',

      /* hover */
      '.scw-ktl-accordion-header:hover {',
      '  background: #f0f2f5;',
      '  border-color: rgba(0,0,0,.13);',
      '}',

      /* expanded state */
      '.scw-ktl-accordion-header.scw-expanded {',
      '  background: color-mix(in srgb, var(--scw-accent) 6%, #ffffff);',
      '  border-color: color-mix(in srgb, var(--scw-accent) 20%, transparent);',
      '  box-shadow: 0 1px 4px color-mix(in srgb, var(--scw-accent) 12%, transparent);',
      '}',
      '.scw-ktl-accordion-header.scw-expanded:hover {',
      '  background: color-mix(in srgb, var(--scw-accent) 10%, #ffffff);',
      '}',

      /* ── icon area ── */
      '.scw-ktl-accordion-header .scw-acc-icon {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 32px;',
      '  height: 100%;',
      '  margin-left: 8px;',
      '  color: var(--scw-accent);',
      '  opacity: .7;',
      '}',

      /* ── title ── */
      '.scw-ktl-accordion-header .scw-acc-title {',
      '  flex: 1 1 auto;',
      '  padding: 8px 6px;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: #1a1a1a;',
      '  line-height: 1.35;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',

      /* ── count pill ── */
      '.scw-ktl-accordion-header .scw-acc-count {',
      '  flex: 0 0 auto;',
      '  display: inline-block;',
      '  padding: 1px 8px;',
      '  margin-right: 4px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.55;',
      '  border-radius: 10px;',
      '  background: color-mix(in srgb, var(--scw-accent) 14%, transparent);',
      '  color: var(--scw-accent);',
      '}',

      /* ── chevron ── */
      '.scw-ktl-accordion-header .scw-acc-chevron {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 30px;',
      '  margin-right: 4px;',
      '  color: var(--scw-accent);',
      '  transition: transform 220ms ease;',
      '  transform: rotate(0deg);',
      '}',
      '.scw-ktl-accordion-header:not(.scw-expanded) .scw-acc-chevron {',
      '  transform: rotate(-90deg);',
      '}',

      /* ── hide the original KTL button when enhanced ── */
      '.scw-ktl-accordion-enhanced ' + BTN_SEL + ' {',
      '  position: absolute !important;',
      '  width: 1px !important;',
      '  height: 1px !important;',
      '  padding: 0 !important;',
      '  margin: -1px !important;',
      '  overflow: hidden !important;',
      '  clip: rect(0,0,0,0) !important;',
      '  white-space: nowrap !important;',
      '  border: 0 !important;',
      '}',

      /* keep the kn-view wrapper neutral when enhanced —
         override the global-styles branded background */
      '.scw-ktl-accordion-enhanced.kn-view {',
      '  background-color: transparent !important;',
      '  border-radius: 0 !important;',
      '  padding: 0 !important;',
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

  /** Is the KTL section currently expanded? */
  function isExpanded(viewKey) {
    var arrow = arrowForViewKey(viewKey);
    if (!arrow) return true; // default to expanded if indeterminate
    return arrow.classList.contains('ktlDown');
  }

  /** Read the effective background-color from the KTL button. */
  function readAccentColor(btn) {
    var raw = getComputedStyle(btn).backgroundColor;
    // Transparent / white / near-white → fall back
    if (!raw || raw === 'rgba(0, 0, 0, 0)' || raw === 'transparent') return null;
    return raw;
  }

  /** Extract title text from KTL button, stripping arrow text. */
  function readTitle(btn) {
    var clone = btn.cloneNode(true);
    // Remove arrow spans
    var arrows = clone.querySelectorAll('.ktlArrow');
    for (var i = 0; i < arrows.length; i++) arrows[i].remove();
    var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return text || 'Section';
  }

  /** Best-effort record count from content container. */
  function computeCount(viewKey) {
    var viewEl = document.getElementById(viewKey);
    if (!viewEl) return null;

    // Strategy 1: count tbody rows (Knack grid)
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

    // Strategy 2: parse "Showing X-Y of Z" text
    var paging = viewEl.querySelector('.kn-entries-summary');
    if (paging) {
      var m = (paging.textContent || '').match(/of\s+(\d+)/);
      if (m) return parseInt(m[1], 10) || null;
    }

    return null;
  }

  // ───────────────────────────────────────────────────
  //  Build / update accordion header
  // ───────────────────────────────────────────────────
  function buildHeader(btn, viewKey) {
    var header = document.createElement('div');
    header.className = 'scw-ktl-accordion-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');
    header.setAttribute('data-view-key', viewKey);

    // Icon
    var iconWrap = document.createElement('span');
    iconWrap.className = 'scw-acc-icon';
    iconWrap.innerHTML = DEFAULT_ICON_SVG;
    header.appendChild(iconWrap);

    // Title
    var titleWrap = document.createElement('span');
    titleWrap.className = 'scw-acc-title';
    titleWrap.textContent = readTitle(btn);
    header.appendChild(titleWrap);

    // Count pill (placeholder — updated by syncState)
    var countWrap = document.createElement('span');
    countWrap.className = 'scw-acc-count';
    countWrap.style.display = 'none';
    header.appendChild(countWrap);

    // Chevron
    var chevronWrap = document.createElement('span');
    chevronWrap.className = 'scw-acc-chevron';
    chevronWrap.innerHTML = CHEVRON_SVG;
    header.appendChild(chevronWrap);

    return header;
  }

  function syncState(header, viewKey) {
    var expanded = isExpanded(viewKey);
    header.classList.toggle('scw-expanded', expanded);
    header.setAttribute('aria-expanded', String(expanded));

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
      if (accent) header.style.setProperty('--scw-accent', accent);
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
        // Just sync state for existing header
        var existingHeader = btn.parentElement &&
          btn.parentElement.querySelector('.scw-ktl-accordion-header[data-view-key]');
        if (existingHeader) {
          var vk = existingHeader.getAttribute('data-view-key');
          syncState(existingHeader, vk);
        }
        continue;
      }

      var viewKey = viewKeyFromButtonId(btn.id);
      if (!viewKey) continue;

      log('enhancing', viewKey);

      // Mark enhanced
      btn.setAttribute(ENHANCED, '1');
      if (knView) knView.classList.add('scw-ktl-accordion-enhanced');

      // Read accent before we visually hide the button
      var accent = readAccentColor(btn);

      // Build header
      var header = buildHeader(btn, viewKey);
      if (accent) header.style.setProperty('--scw-accent', accent);

      // Insert header before the button
      btn.parentNode.insertBefore(header, btn);

      // Forward clicks from our header to the KTL button
      (function (hdr, btnEl, vKey) {
        hdr.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          btnEl.click();
          // Sync after KTL processes the click
          setTimeout(function () { syncState(hdr, vKey); }, 60);
        });
        hdr.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btnEl.click();
            setTimeout(function () { syncState(hdr, vKey); }, 60);
          }
        });
      })(header, btn, viewKey);

      // Initial state sync
      syncState(header, viewKey);

      // MutationObserver on content for count updates
      (function (hdr, vKey) {
        var viewEl = document.getElementById(vKey);
        if (!viewEl) return;
        var countRaf = 0;
        var contentObs = new MutationObserver(function () {
          if (countRaf) cancelAnimationFrame(countRaf);
          countRaf = requestAnimationFrame(function () {
            countRaf = 0;
            syncState(hdr, vKey);
          });
        });
        contentObs.observe(viewEl, { childList: true, subtree: true });
      })(header, viewKey);
    }
  }

  // ───────────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────────
  injectCss();

  // Run enhancement after Knack events
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      // Slight delay to let KTL inject its buttons first
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

  // Initial pass
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
