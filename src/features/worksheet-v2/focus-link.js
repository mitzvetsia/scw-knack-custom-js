/*** WORKSHEET V2 — FOCUS LINK (?scwItem=<recordId>) *************************
 *
 * Deep link to ONE line-item card on any v2 worksheet page. External
 * surfaces (the QA-fail ClickUp comment, emails, chat) link with
 * `?scwItem=<24-hex line record id>` in the URL SEARCH — BEFORE the #hash,
 * e.g.:
 *
 *   https://…/installationservices?scwItem=6aa01624…#subcontractor-portal/…
 *
 * Knack's hash router ignores location.search entirely, so the param rides
 * through login redirects and scene navigation untouched. When a v2
 * worksheet renders the card for that record: open its MDF/IDF group,
 * expand the card's detail panel, scroll it to center, and pulse a red
 * highlight ring (the QA-fail vocabulary — this link's primary sender).
 *
 * Retries until the card exists (cards render late, and the target scene
 * may be a click away when the app lands on a menu page first), then runs
 * exactly once per page load.
 ****************************************************************************/
(function () {
  'use strict';

  var m = (window.location.search || '').match(/[?&]scwItem=([a-f0-9]{24})/i);
  if (!m) return;
  var recId = m[1];

  var done = false;
  var tries = 0;
  var MAX_TRIES = 60;   // 60 × 500ms ≈ 30s of patience, then give up quietly

  var CSS_ID = 'scw-ws-v2-focus-link-css';
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent =
      '.scw-ws-v2-card--focus { outline: 3px solid #dc2626 !important;' +
      '  outline-offset: 2px; border-radius: 8px;' +
      '  transition: outline-color 1.4s ease; }' +
      '.scw-ws-v2-card--focus.scw-ws-v2-card--focus-fade {' +
      '  outline-color: transparent !important; }';
    document.head.appendChild(s);
  }

  function attempt() {
    if (done) return;
    tries++;
    var card = document.querySelector(
      '.scw-ws-v2-card[data-scw-ws-v2-record="' + recId + '"]');
    if (!card) {
      if (tries < MAX_TRIES) setTimeout(attempt, 500);
      return;
    }
    done = true;
    injectCss();

    // Open the containing MDF/IDF group if collapsed.
    var l1 = card.closest('.scw-ws-v2-l1');
    if (l1 && !l1.classList.contains('scw-ws-v2-l1--open')) {
      var tg = l1.querySelector('[data-scw-ws-v2-l1-toggle]');
      if (tg) tg.click();
    }
    // Expand the card's detail panel (idempotent — skip if already open).
    if (!card.classList.contains('scw-ws-v2-card--open')) {
      var exp = card.querySelector('[data-scw-ws-v2-expand="' + recId + '"]');
      if (exp) exp.click();
    }

    // Give the group/card expansion a beat to lay out, then center + pulse.
    setTimeout(function () {
      try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (e) { card.scrollIntoView(); }
      card.classList.add('scw-ws-v2-card--focus');
      setTimeout(function () {
        card.classList.add('scw-ws-v2-card--focus-fade');
      }, 2800);
      setTimeout(function () {
        card.classList.remove('scw-ws-v2-card--focus', 'scw-ws-v2-card--focus-fade');
      }, 4600);
    }, 300);
  }

  // Scene renders (including late navigation to the worksheet page) retry
  // the find; the boot timer covers the already-rendered case.
  $(document)
    .off('knack-scene-render.any.scwWsV2Focus')
    .on('knack-scene-render.any.scwWsV2Focus', function () {
      setTimeout(attempt, 400);
    });
  setTimeout(attempt, 800);
})();
/*** END WORKSHEET V2 — FOCUS LINK *******************************************/
