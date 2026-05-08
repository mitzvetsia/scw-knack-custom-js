/*** DEVICE WORKSHEET — EXPAND/COLLAPSE ALL ***/
/**
 * Adds two buttons above any view that hosts device-worksheet cards:
 *   • Expand all   → opens every card's detail panel
 *   • Summary only → closes every card's detail (only the summary row stays)
 *
 * Implementation: triggers the existing per-card toggle by clicking the
 * .scw-ws-toggle-zone on each .scw-ws-row whose current state doesn't
 * match the target. That reuses device-worksheet's toggleDetail logic,
 * including its photo-row coordination, instead of duplicating it.
 */
(function () {
  'use strict';

  var BTN_HOST_CLS = 'scw-ws-bulk-toggle';
  var BOUND_ATTR  = 'data-scw-bulk-toggle-bound';

  function setAll(viewEl, wantOpen) {
    var rows = viewEl.querySelectorAll('tr.scw-ws-row');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var detail = tr.querySelector('.scw-ws-detail');
      if (!detail) continue;
      var isOpen = detail.classList.contains('scw-ws-open');
      if (isOpen === wantOpen) continue;
      var zone = tr.querySelector('.scw-ws-toggle-zone');
      if (zone) zone.click();
    }
  }

  function buildBtn(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kn-button is-small';
    b.textContent = label;
    b.style.marginRight = '6px';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      onClick();
    });
    return b;
  }

  function mount(viewEl) {
    if (!viewEl) return;
    if (viewEl.hasAttribute(BOUND_ATTR)) return;
    if (!viewEl.querySelector('tr.scw-ws-row')) return;

    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return;

    // Don't double-inject if a previous render left our host behind.
    var existing = nav.querySelector('.' + BTN_HOST_CLS);
    if (existing) existing.remove();

    var host = document.createElement('div');
    host.className = BTN_HOST_CLS;
    host.style.cssText = 'display:inline-flex;gap:0;margin-right:10px;';

    host.appendChild(buildBtn('Expand all', function () {
      setAll(viewEl, true);
    }));
    host.appendChild(buildBtn('Summary only', function () {
      setAll(viewEl, false);
    }));

    // Insert at the top of kn-records-nav so the buttons sit alongside
    // the existing per-page / filter controls.
    nav.insertBefore(host, nav.firstChild);

    viewEl.setAttribute(BOUND_ATTR, '1');
  }

  function scan() {
    var views = document.querySelectorAll('[id^="view_"]');
    for (var i = 0; i < views.length; i++) mount(views[i]);
  }

  // Run once on each scene render and on any view render — device-worksheet
  // builds wsTrs after its own knack-view-render handler, so we wait one
  // tick to let that pass complete before scanning.
  $(document).on('knack-view-render.any', function () {
    setTimeout(scan, 50);
  });
  $(document).on('knack-scene-render.any', function () {
    setTimeout(scan, 50);
  });
})();
/*** END DEVICE WORKSHEET — EXPAND/COLLAPSE ALL ***/
