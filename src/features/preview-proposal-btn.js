/*** FEATURE: Preview Proposal Button → view_3814 header ***/
(function () {
  'use strict';

  var SOURCE_VIEW = 'view_3491';
  var TARGET_VIEW = 'view_3814';
  var BTN_MARKER  = 'scw-preview-proposal-btn';
  var EVENT_NS    = '.scwPreviewProposal';
  var BTN_LABEL   = 'Preview Proposal';

  var _href = '';

  function scrapeHref() {
    var el = document.getElementById(SOURCE_VIEW);
    if (!el) return '';
    var link = el.querySelector('a.kn-link-page') || el.querySelector('a[href*="proposal"]');
    return link ? (link.getAttribute('href') || '') : '';
  }

  function injectOrUpdate() {
    if (!_href) return;

    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return;

    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return;
    var header = accordion.querySelector('.scw-ktl-accordion__header');
    if (!header) return;

    var existing = header.querySelector('.' + BTN_MARKER);
    if (existing) {
      existing.setAttribute('data-link-href', _href);
      return;
    }

    var existingBtns = header.querySelectorAll('.scw-acc-action-btn');
    for (var i = 0; i < existingBtns.length; i++) {
      if ((existingBtns[i].textContent || '').trim() === BTN_LABEL) {
        existingBtns[i].classList.add(BTN_MARKER);
        existingBtns[i].setAttribute('data-link-href', _href);
        existingBtns[i].addEventListener('click', clickHandler);
        return;
      }
    }

    var actions = header.querySelector('.scw-acc-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'scw-acc-actions';
      var chevron = header.querySelector('.scw-acc-chevron');
      if (chevron) {
        header.insertBefore(actions, chevron);
      } else {
        header.appendChild(actions);
      }
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn ' + BTN_MARKER;
    btn.setAttribute('data-link-href', _href);
    btn.textContent = BTN_LABEL;
    btn.addEventListener('click', clickHandler);
    actions.appendChild(btn);
  }

  function clickHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var href = this.getAttribute('data-link-href');
    if (href) window.location.hash = href;
  }

  function tryInject() {
    _href = scrapeHref();
    injectOrUpdate();
  }

  $(document)
    .off('knack-view-render.' + SOURCE_VIEW + EVENT_NS)
    .on('knack-view-render.' + SOURCE_VIEW + EVENT_NS, function () {
      _href = scrapeHref();
      setTimeout(injectOrUpdate, 300);
    });

  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
      setTimeout(tryInject, 500);
    });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      _href = '';
      setTimeout(tryInject, 2000);
    });
})();
