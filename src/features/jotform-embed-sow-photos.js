// src/features/jotform-embed-sow-photos.js
// ---------------------------------------------------------------------------
// Embeds JotForm "Bulk Add Photos" forms in a modal overlay, pre-populating
// a hidden JotForm field with the current record ID.
//
// Configurable for multiple views — each entry in FORM_CONFIGS defines
// the target view, JotForm form, hidden field name, and URL-hash pattern
// used to extract the record ID.
// ---------------------------------------------------------------------------
(function jotformEmbedSowPhotos() {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  var MODAL_ID  = 'scw-jotform-modal';
  var STYLE_ID  = 'scw-jotform-modal-css';

  var FORM_CONFIGS = [
    {
      menuViewId:    'view_3482',
      linkText:      'Bulk Add Photos',
      jotformId:     '260564849468170',
      fieldName:     'sowID',
      hashPattern:   /scope-of-work-details\/([a-f0-9]{24})/
    },
    {
      menuViewId:    'view_3532',
      linkText:      'Bulk Add Photos',
      jotformId:     '92274209022147',
      fieldName:     'surveyID',
      hashPattern:   /site-survey-request-details\/([a-f0-9]{24})/
    }
  ];

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Extract a record ID from the current URL hash using the given pattern. */
  function getRecordId(hashPattern) {
    var hash = window.location.hash || '';
    var match = hash.match(hashPattern);
    return match ? match[1] : '';
  }

  /** Build the JotForm iframe URL with optional pre-population. */
  function buildJotformUrl(jotformId, fieldName, recordId) {
    var base = 'https://form.jotform.com/' + jotformId;
    if (recordId) {
      base += '?' + encodeURIComponent(fieldName) + '=' + encodeURIComponent(recordId);
    }
    return base;
  }

  // ── CSS (injected once) ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var M = '#' + MODAL_ID;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      M + ' {',
      '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      '  z-index: 10000; display: flex; align-items: center; justify-content: center;',
      '}',
      M + ' .scw-jf-backdrop {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  background: rgba(0,0,0,0.55);',
      '}',
      M + ' .scw-jf-dialog {',
      '  position: relative; width: 90%; max-width: 800px; height: 85vh;',
      '  background: #fff; border-radius: 6px; box-shadow: 0 4px 24px rgba(0,0,0,0.25);',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '}',
      M + ' .scw-jf-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 10px 16px; background: #07467c;',
      '}',
      M + ' .scw-jf-header h3 {',
      '  margin: 0; font-size: 15px; font-weight: 600; color: #fff;',
      '}',
      M + ' .scw-jf-close {',
      '  background: none; border: none; font-size: 20px; cursor: pointer;',
      '  color: rgba(255,255,255,0.8); padding: 0 4px; line-height: 1;',
      '}',
      M + ' .scw-jf-close:hover { color: #fff; }',
      M + ' .scw-jf-body {',
      '  flex: 1; overflow: hidden; position: relative;',
      '}',
      // Loading spinner — sits behind the iframe, visible until form loads
      M + ' .scw-jf-loader {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
      '  background: #fff; color: #07467c;',
      '}',
      M + ' .scw-jf-spinner {',
      '  width: 36px; height: 36px; border: 3px solid #e0e0e0;',
      '  border-top-color: #07467c; border-radius: 50%;',
      '  animation: scwJfSpin .8s linear infinite;',
      '}',
      M + ' .scw-jf-loader span {',
      '  margin-top: 12px; font-size: 13px; color: #666;',
      '}',
      '@keyframes scwJfSpin { to { transform: rotate(360deg); } }',
      M + ' .scw-jf-body iframe {',
      '  position: relative; z-index: 1;',
      '  width: 100%; height: 100%; border: none;',
      '  opacity: 0; transition: opacity .25s ease;',
      '}',
      M + ' .scw-jf-body iframe.scw-jf-loaded {',
      '  opacity: 1;',
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
      '    <div class="scw-jf-loader"><div class="scw-jf-spinner"></div><span>Loading form&hellip;</span></div>',
      '    <iframe src="' + jotformUrl + '" allowfullscreen></iframe>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(modal);

    // Hide loader once the iframe content is ready
    var iframe = modal.querySelector('iframe');
    iframe.addEventListener('load', function () {
      iframe.classList.add('scw-jf-loaded');
    });

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
  FORM_CONFIGS.forEach(function (cfg) {
    SCW.onViewRender(cfg.menuViewId, function (event, view) {
      // Find the menu link by its visible text instead of positional class
      var $link = $('#' + cfg.menuViewId).find('a.kn-link').filter(function () {
        return $(this).text().trim() === cfg.linkText;
      });
      if (!$link.length) return;

      // Replace the inline javascript: href with a safe no-op
      $link.attr('href', '#');

      $link.off('click.scwJotform').on('click.scwJotform', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var recordId   = getRecordId(cfg.hashPattern);
        var jotformUrl = buildJotformUrl(cfg.jotformId, cfg.fieldName, recordId);

        openModal(jotformUrl);
      });
    }, 'jotformEmbed.' + cfg.menuViewId);
  });
})();
