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
 *
 * Mounting is delegated to SCW.toolbar. The button is placed inside
 * the expand-all bulk-toggle cluster when present so [Expand all]
 * [Summary only] [Show] read as one segmented control; fallback is
 * a standalone span before .scw-tb-spring.
 */
(function () {
  'use strict';

  var TARGET_VIEWS = ['view_3610', 'view_3505', 'view_3915', 'view_4056'];

  var STYLE_ID = 'scw-ws-photo-toggle-css';
  var HOST_CLS = 'scw-ws-photo-toggle';
  var BTN_CLS  = 'scw-ws-photo-toggle__btn';
  var SHOW_CLS = 'scw-ws-show-all-photos';

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

  // Resolve the live viewEl fresh on every click. Knack can replace
  // the view container on some re-render paths and a closure-captured
  // reference would point at a detached element — toggling its class
  // there has no visible effect, which is the user-reported symptom
  // ("clicking Show does nothing").
  function liveView(viewId) {
    return document.getElementById(viewId);
  }

  function updateBtnLabel(btn, viewId) {
    var viewEl = liveView(viewId);
    var on = !!(viewEl && viewEl.classList.contains(SHOW_CLS));
    btn.textContent = on ? 'Hide photos' : 'Show photos';
    btn.title = on ? 'Hide all photo strips' : 'Show all photo strips';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function buildBtn(viewId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kn-button is-small ' + BTN_CLS + ' ' + HOST_CLS;
    btn.style.marginRight = '6px';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var el = liveView(viewId);
      if (!el) return;
      var turningOn = !el.classList.contains(SHOW_CLS);
      el.classList.toggle(SHOW_CLS);

      // Expand all L1 (MDF/IDF) groups when revealing photos —
      // otherwise the reveal happens inside collapsed accordions and
      // the user sees no visible change. Hides leave the groups in
      // whatever state the user had them; the manual collapses are
      // theirs to make.
      if (turningOn && window.SCW && SCW.worksheetExpand &&
          typeof SCW.worksheetExpand.applyMode === 'function') {
        SCW.worksheetExpand.applyMode(el, 'expand');
        // The expand-all toggle's "Expand all"/"Collapse all" label
        // needs to flip to "Collapse all" since groups are now open.
        var nav = el.querySelector('.kn-records-nav');
        var toggleBtn = nav && nav.querySelector('.scw-ws-bulk-toggle button');
        if (toggleBtn) {
          toggleBtn.textContent = 'Collapse all';
          toggleBtn.setAttribute('aria-pressed', 'true');
        }
      }

      updateBtnLabel(btn, viewId);
    });
    updateBtnLabel(btn, viewId);
    return btn;
  }

  // ── Toolbar registration ────────────────────────────────
  injectStyles();
  TARGET_VIEWS.forEach(function (viewId) {
    SCW.toolbar.register({
      id:    'photo-toggle-' + viewId,
      slot:  SCW.toolbar.SLOTS.mode,
      viewMatch: function (viewEl) { return viewEl.id === viewId; },
      mount: function (viewEl, nav) {
        var bulkToggle = nav.querySelector('.scw-ws-bulk-toggle');
        var existing   = nav.querySelector('.' + BTN_CLS);

        // Migration: button exists but is not yet inside the bulk-toggle
        // cluster (e.g. mounted before expand-all built its host).
        // Move it in so all three mode controls read as one cluster.
        if (existing && bulkToggle && existing.parentNode !== bulkToggle) {
          bulkToggle.appendChild(existing);
          var oldHost = nav.querySelector(
            '.' + HOST_CLS + ':not(.' + BTN_CLS + ')'
          );
          if (oldHost && !oldHost.children.length) {
            oldHost.parentNode.removeChild(oldHost);
          }
          updateBtnLabel(existing, viewId);
          return;
        }

        // Already in the right place — refresh the label and bail.
        if (existing) {
          updateBtnLabel(existing, viewId);
          return;
        }

        // First-time mount. Prefer the bulk-toggle cluster; fall back
        // to a standalone host if it doesn't exist yet (the migration
        // branch above will move it on a later tick).
        var btn = buildBtn(viewId);
        if (bulkToggle) {
          bulkToggle.appendChild(btn);
        } else {
          var host = document.createElement('span');
          host.className = HOST_CLS;
          host.style.cssText = 'display:inline-flex;align-items:center;margin-right:10px;';
          host.appendChild(btn);
          nav.appendChild(host);
        }
      }
    });
  });
})();
/*** END DEVICE WORKSHEET — SHOW/HIDE ALL PHOTOS ***/
