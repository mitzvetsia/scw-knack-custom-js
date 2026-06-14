/*** SITE SURVEY REPORT — PHOTO LIGHTBOX (view_3997) **************************
 * Adds the same click-to-open photo viewer the v2 device worksheet uses to the
 * read-only Site Survey Report photo strips.
 *
 * The report's photos render as inline-photo-row cards
 * (`.scw-inline-photo-card` → inner `img.scw-inline-photo-img`) on view_3997,
 * but device-worksheet.js disables their click-to-edit there
 * (`pointer-events:none`) because the report is read-only — so today clicking a
 * thumbnail does nothing. This re-enables clicks on those cards and routes them
 * to SCW.worksheetV2.photos.openLightbox (fullscreen stage + prev/next + a
 * thumbnail strip + "Open ↗" full size), exactly like the v2 worksheet.
 *
 * Read-only on purpose: editHref is omitted, so the viewer shows no "Edit"
 * deep-link (the lightbox hides it when editHref is empty). The edit-page
 * navigation inline-photo-row would otherwise fire is always suppressed here.
 *
 * NOTE: view_3596 is the deprecated report view and is intentionally NOT
 * targeted.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW_ID   = 'view_3997';
  var CARD_SEL  = '.scw-inline-photo-card';
  var STRIP_SEL = '.scw-inline-photo-strip';
  var IMG_SEL   = 'img.scw-inline-photo-img';
  var STYLE_ID  = 'scw-survey-report-photo-lightbox-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    // Re-enable clicks on the report's photo cards (device-worksheet.js sets
    // pointer-events:none on #view_3997 .…-photo-wrap .scw-inline-photo-card to
    // kill the edit nav) so the click reaches the viewer handler below. Scoped
    // to the photo cards only — the read-only detail links stay disabled.
    var css =
      '#' + VIEW_ID + ' ' + CARD_SEL + ',' +
      '#' + VIEW_ID + ' ' + CARD_SEL + ' ' + IMG_SEL + ' {' +
        'pointer-events: auto !important;' +
        'cursor: zoom-in !important;' +
      '}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getLightbox() {
    return (window.SCW && SCW.worksheetV2 && SCW.worksheetV2.photos &&
            typeof SCW.worksheetV2.photos.openLightbox === 'function')
      ? SCW.worksheetV2.photos.openLightbox
      : null;
  }

  // Capture phase: run BEFORE inline-photo-row's bubble-phase edit-nav handler
  // so we can suppress the navigation and open the viewer instead.
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var card = e.target.closest(CARD_SEL);
    if (!card || !card.closest('#' + VIEW_ID)) return;

    var img = card.querySelector(IMG_SEL);
    var url = img && img.src;
    if (!url) return;            // empty / "+ Add" card → leave default alone

    var strip = card.closest(STRIP_SEL);
    if (!strip) return;

    // Read-only report: never navigate to the edit page, whether or not the
    // viewer is available.
    e.preventDefault();
    e.stopPropagation();

    var openLightbox = getLightbox();
    if (!openLightbox) return;

    var cards = strip.querySelectorAll(CARD_SEL);
    var items = [], clickedIdx = 0;
    for (var i = 0; i < cards.length; i++) {
      var im = cards[i].querySelector(IMG_SEL);
      var u  = im && im.src;
      if (!u) continue;          // skip empty/placeholder cards in the viewer
      if (cards[i] === card) clickedIdx = items.length;
      var required = cards[i].getAttribute('data-photo-required') === 'true';
      items.push({
        url:      u,
        id:       cards[i].getAttribute('data-photo-id')   || '',
        type:     cards[i].getAttribute('data-photo-type') || '',
        req:      required ? 'done' : '',
        editHref: ''             // read-only report — no edit deep-link
      });
    }
    if (!items.length) return;
    openLightbox(items, clickedIdx);
  }, true);

  injectStyles();
})();
/*** END SITE SURVEY REPORT — PHOTO LIGHTBOX ********************************/
