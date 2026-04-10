/**************************************************************************************************
 * LEGACY / RATKING SEGMENT
 * Goal: Make boundaries between “features” obvious without changing behavior.
 * Note: This file mixes global handlers, per-view hacks, and legacy utilities.
 **************************************************************************************************/

/**************************************************************************************************
 * FEATURE: Modal backdrop click-to-close DISABLE
 * - Page modals: unbinds click on .kn-modal-bg during scene render
 * - “Add new option” modals (.kn-modal.default): prevents close via overlay
 *   click or Escape key. Only the X button (.delete.close-modal) or form
 *   submit can close these modals.
 **************************************************************************************************/
(function modalBackdropClickDisable() {
  // ── Page modals (scene-level) ──────────────────────────────
  $(document).on('knack-scene-render.any', function (event, scene) {
    $('.kn-modal-bg').off('click');
  });

  // ── “Add new option” modals (.kn-modal.default) ────────────
  // Capturing-phase listeners fire before Knack's own handlers,
  // ensuring the event is killed before it can trigger a close.

  // Prevent overlay click from closing modal
  document.addEventListener('click', function (e) {
    if (!e.target.classList.contains('kn-overlay')) return;
    var modal = document.querySelector('.kn-modal.default');
    if (modal && modal.style.display !== 'none') {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  // Prevent Escape key from closing modal
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    var modal = document.querySelector('.kn-modal.default');
    if (modal && modal.style.display !== 'none') {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
})();
/*** END FEATURE: Modal backdrop click-to-close DISABLE ************************************************/
