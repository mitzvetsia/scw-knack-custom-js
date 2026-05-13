/*** DEVICE WORKSHEET — SHOW/HIDE ALL PHOTOS ***/
/**
 * Adds a toolbar button on configured worksheet views that toggles
 * visibility of every row's photo strip in one click. By default the
 * strip is hidden when the card is collapsed (saves vertical space);
 * this lets the user blow them all open at once to scan photos
 * without expanding cards individually.
 *
 * The button only acts on rows whose photo strip actually contains
 * uploaded images (data-photo-has-image="true"). Rows with just
 * "Required" placeholders or "+ Add" buttons stay hidden — they're
 * not useful to surface in bulk.
 *
 * Visibility override is done via a class on the view + a CSS :has()
 * rule, so device-worksheet's own collapse logic doesn't fight us:
 * when the user toggles a card open/closed device-worksheet still
 * manages the per-card .scw-ws-photo-hidden class, but the view-
 * level override wins for real-photo rows while the toggle is on.
 *
 * Configured for view_3610 (SOW Line Items comparison) — add other
 * view IDs to TARGET_VIEWS to enable elsewhere.
 */
(function () {
  'use strict';

  var TARGET_VIEWS = ['view_3610'];

  var STYLE_ID       = 'scw-ws-photo-toggle-css';
  var HOST_CLS       = 'scw-ws-photo-toggle';
  var BTN_CLS        = 'scw-ws-photo-toggle__btn';
  var SHOW_CLS       = 'scw-ws-show-all-photos';
  var OBS_KEY        = '__scwPhotoToggleObs';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var rules = TARGET_VIEWS.map(function (viewId) {
      // Only override the hide for wrappers that actually contain an
      // uploaded image — placeholders / "+ Add" don't need bulk reveal.
      return '#' + viewId + '.' + SHOW_CLS + ' ' +
             '.scw-ws-photo-wrap.scw-ws-photo-hidden' +
             ':has(.scw-inline-photo-card[data-photo-has-image="true"]) ' +
             '{ display: block !important; }';
    });
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
  }

  // Returns the number of worksheet rows on this view that have at
  // least one uploaded photo. The button hides itself when this is 0
  // so we don't clutter the toolbar on views/scenes with no photos.
  function countRowsWithPhotos(viewEl) {
    var cards = viewEl.querySelectorAll(
      '.scw-ws-photo-wrap .scw-inline-photo-card[data-photo-has-image="true"]'
    );
    return cards.length;
  }

  function updateBtnLabel(btn, viewEl) {
    var on = viewEl.classList.contains(SHOW_CLS);
    // Short labels per request — single word matches the Expand/
    // Collapse and Summary toggle widths in the same cluster.
    btn.textContent = on ? 'Hide' : 'Show';
    btn.title = on ? 'Hide all photo strips' : 'Show all photo strips';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function buildBtn(viewEl) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kn-button is-small ' + BTN_CLS;
    btn.style.marginRight = '6px';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      viewEl.classList.toggle(SHOW_CLS);
      updateBtnLabel(btn, viewEl);
    });
    updateBtnLabel(btn, viewEl);
    return btn;
  }

  // Idempotent mount. Returns true when the button is present after
  // the call; false when prerequisites aren't ready (no nav yet, or
  // no photos to bulk-toggle so the button intentionally stays off).
  function mount(viewEl) {
    if (!viewEl) return false;
    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return false;

    // Look up an existing button. It may live inside the expand-all
    // bulk-toggle host (preferred placement) OR inside our own host
    // span (fallback). Either way, find it via the button class so
    // both placements are detected.
    var existingBtn = nav.querySelector('.' + BTN_CLS);

    // No real photos anywhere on the view → remove any stale button
    // (rows may have been deleted since last mount) and bail.
    if (!countRowsWithPhotos(viewEl)) {
      if (existingBtn) {
        // Pull the button (and its standalone-host wrapper if any).
        var hostWrap = existingBtn.closest('.' + HOST_CLS + ':not(.' + BTN_CLS + ')');
        var toRemove = hostWrap || existingBtn;
        toRemove.parentNode.removeChild(toRemove);
      }
      return false;
    }

    var bulkToggle = nav.querySelector('.scw-ws-bulk-toggle');

    // Migration: if a previously-mounted button is sitting in a
    // standalone host but the expand-all bulk-toggle has since
    // appeared, move the button INTO the bulk-toggle cluster. Keeps
    // the [Expand all] [Summary only] [Show] grouping consistent
    // even when expand-all mounts AFTER photo-toggle's first scan.
    if (existingBtn && bulkToggle && existingBtn.parentNode !== bulkToggle) {
      bulkToggle.appendChild(existingBtn);
      existingBtn.classList.add(HOST_CLS);
      // Drop the now-empty standalone host wrapper.
      var oldHost = nav.querySelector(
        '.' + HOST_CLS + ':not(.' + BTN_CLS + ')'
      );
      if (oldHost && !oldHost.children.length) {
        oldHost.parentNode.removeChild(oldHost);
      }
      updateBtnLabel(existingBtn, viewEl);
      return true;
    }

    // Already mounted in the right place — refresh the label and bail.
    if (existingBtn) {
      updateBtnLabel(existingBtn, viewEl);
      return true;
    }

    // First-time mount. Prefer placement inside the bulk-toggle so
    // all three mode toggles read as one cluster. Fall back to a
    // standalone host if bulk-toggle isn't present yet — the migration
    // branch above will move it on a later tick.
    var btn = buildBtn(viewEl);
    if (bulkToggle) {
      btn.classList.add(HOST_CLS);
      bulkToggle.appendChild(btn);
    } else {
      var host = document.createElement('span');
      host.className = HOST_CLS;
      host.style.cssText = 'display:inline-flex;align-items:center;margin-right:10px;';
      host.appendChild(btn);
      nav.insertBefore(host, nav.firstChild);
    }
    return true;
  }

  function attachObserver(viewEl) {
    if (viewEl[OBS_KEY]) return;
    mount(viewEl);

    var debounce = null;
    var obs = new MutationObserver(function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(function () { mount(viewEl); }, 100);
    });
    obs.observe(viewEl, { childList: true, subtree: true });
    viewEl[OBS_KEY] = obs;
  }

  function runScan() {
    injectStyles();
    for (var i = 0; i < TARGET_VIEWS.length; i++) {
      var el = document.getElementById(TARGET_VIEWS[i]);
      if (el) attachObserver(el);
    }
  }

  $(document).on('knack-view-render.any', runScan);
  $(document).on('knack-scene-render.any', runScan);
  document.addEventListener('scw-worksheet-ready', runScan);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runScan);
  } else {
    runScan();
  }
})();
/*** END DEVICE WORKSHEET — SHOW/HIDE ALL PHOTOS ***/
