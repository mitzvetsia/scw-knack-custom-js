// src/features/jotform-embed-sow-photos.js
// ---------------------------------------------------------------------------
// Embeds a JotForm "Bulk Add Photos" form in a modal overlay, pre-populating
// a hidden JotForm field with the current Scope-of-Work record ID.
//
// Hooks into view_3482 (SOW details menu) and intercepts the existing
// "Bulk Add Photos" link (kn-link-3) so it opens an in-page modal instead
// of a plain popup window.
// ---------------------------------------------------------------------------
(function jotformEmbedSowPhotos() {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  var JOTFORM_FORM_ID   = '260564849468170';
  var JOTFORM_FIELD_NAME = 'sowID';
  var MENU_VIEW_ID       = 'view_3482';
  var LINK_SELECTOR      = '.kn-link-3';         // "Bulk Add Photos" link
  var MODAL_ID           = 'scw-jotform-modal';
  var STYLE_ID           = 'scw-jotform-modal-css';

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Extract the SOW record ID from the current URL hash.
   *  Pattern: …/scope-of-work-details/{recordId}/…               */
  function getSowRecordId() {
    var hash = window.location.hash || '';
    var match = hash.match(/scope-of-work-details\/([a-f0-9]{24})/);
    return match ? match[1] : '';
  }

  /** Build the JotForm iframe URL with optional pre-population. */
  function buildJotformUrl(recordId) {
    var base = 'https://form.jotform.com/' + JOTFORM_FORM_ID;
    if (recordId) {
      base += '?' + encodeURIComponent(JOTFORM_FIELD_NAME) + '=' + encodeURIComponent(recordId);
    }
    return base;
  }

  // ── CSS (injected once) ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + MODAL_ID + ' {',
      '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      '  z-index: 10000; display: flex; align-items: center; justify-content: center;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-backdrop {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  background: rgba(0,0,0,0.55);',
      '}',
      '#' + MODAL_ID + ' .scw-jf-dialog {',
      '  position: relative; width: 90%; max-width: 800px; height: 85vh;',
      '  background: #fff; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 12px 16px; border-bottom: 1px solid #e0e0e0; background: #fafafa;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-header h3 {',
      '  margin: 0; font-size: 16px; font-weight: 600; color: #333;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-close {',
      '  background: none; border: none; font-size: 22px; cursor: pointer;',
      '  color: #666; padding: 0 4px; line-height: 1;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-close:hover { color: #000; }',
      '#' + MODAL_ID + ' .scw-jf-body {',
      '  flex: 1; overflow: hidden;',
      '}',
      '#' + MODAL_ID + ' .scw-jf-body iframe {',
      '  width: 100%; height: 100%; border: none;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Modal lifecycle ──────────────────────────────────────────────────────
  function openModal(jotformUrl) {
    // Prevent duplicates
    closeModal();
    injectStyles();

    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = [
      '<div class="scw-jf-backdrop"></div>',
      '<div class="scw-jf-dialog">',
      '  <div class="scw-jf-header">',
      '    <h3>Bulk Add Photos</h3>',
      '    <button class="scw-jf-close" title="Close">&times;</button>',
      '  </div>',
      '  <div class="scw-jf-body">',
      '    <iframe src="' + jotformUrl + '" allowfullscreen></iframe>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('.scw-jf-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.scw-jf-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onEscKey);
  }

  function closeModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    document.removeEventListener('keydown', onEscKey);
  }

  function onEscKey(e) {
    if (e.key === 'Escape' || e.keyCode === 27) closeModal();
  }

  // ── Event binding ────────────────────────────────────────────────────────
  SCW.onViewRender(MENU_VIEW_ID, function (event, view) {
    var $link = $('#' + MENU_VIEW_ID).find(LINK_SELECTOR);
    if (!$link.length) return;

    // Replace the inline javascript: href with a safe no-op
    $link.attr('href', '#');

    $link.off('click.scwJotform').on('click.scwJotform', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var recordId  = getSowRecordId();
      var jotformUrl = buildJotformUrl(recordId);

      openModal(jotformUrl);
    });
  }, 'jotformEmbed');
})();
