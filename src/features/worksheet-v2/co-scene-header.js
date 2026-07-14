/*** CHANGE ORDER SCENE — guidance header / action bar *********************
 *
 * The CO drafting scene (scene_1362) hosts THREE ways to build the change
 * order, two of which were buried far down the page with no signposting:
 *   1. Add a net-new item        → the custom add modal (co-add-item-form.js)
 *   2. Adopt previously-quoted   → view_4088 panel (bottom of the page)
 *   3. Flag installs for removal → view_4086 panel (mid-page)
 *
 * This module injects a compact action bar above the CO worksheet
 * (#scw-ws-v2-view_4079) that names the three actions: the first opens the
 * add modal, the other two smooth-scroll to their panel and flash it. So a
 * user landing on the page sees what they can do without scrolling blind.
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var CO_VIEW     = 'view_4079';
  var ADOPT_VIEW  = 'view_4088';
  var REMOVE_VIEW = 'view_4086';
  var BAR_ID      = 'scw-co-actionbar';
  var STYLE_ID    = 'scw-co-actionbar-css';
  var EVENT_NS    = '.scwCoActionBar';

  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';
  var DOWN_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BAR_ID + '{display:flex;align-items:center;flex-wrap:wrap;gap:10px;',
      'margin:0 0 14px 0;padding:12px 16px;background:#f8fafc;',
      'border:1px solid #e2e8f0;border-radius:10px;}',
      '#' + BAR_ID + ' .scw-co-ab-copy{flex:1 1 260px;min-width:220px;}',
      '#' + BAR_ID + ' .scw-co-ab-title{font:700 13px/1.3 system-ui,-apple-system,sans-serif;color:#0f4c75;}',
      '#' + BAR_ID + ' .scw-co-ab-sub{font:400 12px/1.4 system-ui,sans-serif;color:#64748b;margin-top:2px;}',
      '#' + BAR_ID + ' .scw-co-ab-btns{display:flex;flex-wrap:wrap;gap:8px;}',
      '#' + BAR_ID + ' button{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;',
      'border-radius:7px;font:600 12.5px/1 system-ui,-apple-system,sans-serif;cursor:pointer;',
      'transition:background .12s;}',
      '#' + BAR_ID + ' .scw-co-ab-pri{color:#fff;background:#0f4c75;border:1px solid #0a3a63;}',
      '#' + BAR_ID + ' .scw-co-ab-pri:hover{background:#0a3a63;}',
      '#' + BAR_ID + ' .scw-co-ab-sec{color:#0f4c75;background:#fff;border:1px solid #c7d4e0;}',
      '#' + BAR_ID + ' .scw-co-ab-sec:hover{background:#f1f5f9;}',
      // Jump-target flash — a brief ring around the panel the user was sent to.
      '.scw-co-ab-flash{outline:3px solid #60a5fa !important;outline-offset:3px;',
      'border-radius:8px;transition:outline-color .4s ease;}',
      '.scw-co-ab-flash.is-fading{outline-color:transparent !important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function jumpTo(viewKey) {
    var el = document.getElementById('scw-ws-v2-' + viewKey) ||
             document.getElementById(viewKey);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('scw-co-ab-flash');
    setTimeout(function () { el.classList.add('is-fading'); }, 900);
    setTimeout(function () {
      el.classList.remove('scw-co-ab-flash', 'is-fading');
    }, 1800);
  }

  function mount() {
    var panel = document.getElementById('scw-ws-v2-' + CO_VIEW);
    if (!panel || document.getElementById(BAR_ID)) return;
    injectCss();

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML =
      '<div class="scw-co-ab-copy">' +
        '<div class="scw-co-ab-title">Draft this change order</div>' +
        '<div class="scw-co-ab-sub">Add new items, pull in previously quoted ' +
          'items, or flag installed items for removal. Everything drafts here ' +
          'before pricing and issue.</div>' +
      '</div>' +
      '<div class="scw-co-ab-btns">' +
        '<button type="button" data-co-ab="add" class="scw-co-ab-pri">' + PLUS_SVG +
          '<span>Add new item</span></button>' +
        '<button type="button" data-co-ab="adopt" class="scw-co-ab-sec">' + DOWN_SVG +
          '<span>Adopt quoted items</span></button>' +
        '<button type="button" data-co-ab="remove" class="scw-co-ab-sec">' + DOWN_SVG +
          '<span>Remove installed items</span></button>' +
      '</div>';
    panel.parentNode.insertBefore(bar, panel);

    bar.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-co-ab]');
      if (!btn) return;
      var act = btn.getAttribute('data-co-ab');
      if (act === 'add') {
        if (ns.coAddForm && typeof ns.coAddForm.open === 'function') {
          ns.coAddForm.open({ viewKey: CO_VIEW });
        }
      } else if (act === 'adopt') {
        jumpTo(ADOPT_VIEW);
      } else if (act === 'remove') {
        jumpTo(REMOVE_VIEW);
      }
    });
  }

  function mountSoon() {
    setTimeout(mount, 200);
    setTimeout(mount, 800);   // catch a late v2 panel build
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CO_VIEW, mountSoon, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, mountSoon);
})();
/*** END: CO scene action bar **********************************************/
