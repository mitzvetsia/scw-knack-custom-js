/*** CO SWAP PAIRS — link the Add/Remove halves of a product swap ***********
 *
 * A product swap (co-remove.js fireSwapBatch) drafts TWO lines on the CO
 * that share one "Target install item" (field_2966): the Add carrying the
 * replacement product and the Remove crediting the current one. On the CO
 * worksheets (internal view_4079 + sub portal view_4112) that pairing is
 * invisible — the lines just read as separate NEW / REMOVE rows.
 *
 * This module groups live CO lines by their field_2966 target; a target
 * with BOTH a Remove-action line (field_2965) and a non-Remove line is a
 * swap pair. Each half gets an indigo "⇄ SWAP" chip in the label cell whose
 * tooltip names its counterpart, and hovering either card highlights both,
 * so the pair reads as one unit in a long worksheet. Accessory pairs light
 * up the same way (each accessory Add/Remove targets its own install id).
 *
 * DORMANT until field_2966 is exposed as a column on the CO worksheet view
 * — the same one-click Builder dependency that gives co-remove durable
 * draft-state detection (coTargetCounts). A once-per-view console note
 * says so when lines exist but the field doesn't.
 *
 * Idempotent: every pass clears its own chips/attributes first. Re-applied
 * on view renders and worksheet data notifies (same hooks as the review
 * diff).
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var VIEWS        = ['view_4079', 'view_4112'];
  var TARGET_FIELD = 'field_2966';   // CO_REL_target install item
  var ACTION_FIELD = 'field_2965';   // CO_FLAG_action (Add / Remove)
  var STYLE_ID     = 'scw-co-swap-pairs-css';
  var EVENT_NS     = '.scwCoSwapPairs';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Same flag family as REMOVE / NEW / CHANGED (label-cell chips).
      '.scw-ws-v2-co-flag--swap{display:block;width:-moz-fit-content;width:fit-content;',
      'margin:0 0 3px 0;font:700 8.5px/1 system-ui,-apple-system,sans-serif;',
      'letter-spacing:.06em;padding:2px 6px;border-radius:4px;',
      'color:#3730a3;background:#e0e7ff;white-space:nowrap;cursor:help;}',
      // Both halves light up when either is hovered.
      '.scw-ws-v2-card--swap-hot{',
      'box-shadow:inset 0 0 0 2px #6366f1 !important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function txt(rec, key) {
    var v = rec && rec[key];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }
  function targetIdOf(rec) {
    var raw = rec && rec[TARGET_FIELD + '_raw'];
    var one = Array.isArray(raw) ? raw[0] : raw;
    return (one && one.id) || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  // Counterpart name for the tooltip — product text, else the drop label
  // (both CO worksheets render the SOW line-item object: field_1949 product,
  // field_1950 drop label).
  function lineName(rec) {
    return txt(rec, 'field_1949') || txt(rec, 'field_1950') || 'the paired line';
  }

  function clearPass(panel) {
    var chips = panel.querySelectorAll('.scw-ws-v2-co-flag--swap');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].parentNode) chips[i].parentNode.removeChild(chips[i]);
    }
    var marked = panel.querySelectorAll('[data-scw-swap-pair]');
    for (var j = 0; j < marked.length; j++) {
      marked[j].removeAttribute('data-scw-swap-pair');
      marked[j].classList.remove('scw-ws-v2-card--swap-hot');
    }
  }

  function badge(panel, rec, title) {
    var card = panel.querySelector(
      '.scw-ws-v2-card[data-scw-ws-v2-record="' + rec.id + '"]');
    if (!card) return;
    card.setAttribute('data-scw-swap-pair', targetIdOf(rec));
    var cell = card.querySelector('.scw-ws-v2-row .scw-ws-v2-cell--label');
    if (!cell) return;
    var chip = document.createElement('span');
    chip.className = 'scw-ws-v2-co-flag scw-ws-v2-co-flag--swap';
    chip.textContent = '⇄ SWAP';
    chip.title = title;
    cell.insertBefore(chip, cell.firstChild);
  }

  var _dormantLogged = {};

  function apply(viewKey) {
    var panel = document.getElementById('scw-ws-v2-' + viewKey);
    if (!panel) return;
    clearPass(panel);

    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    if (!recs.length) return;

    var sawField = false;
    var byTarget = Object.create(null);
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (!rec || !rec.id) continue;
      if ((TARGET_FIELD in rec) || ((TARGET_FIELD + '_raw') in rec)) sawField = true;
      var tid = targetIdOf(rec);
      if (!tid) continue;
      var g = byTarget[tid] || (byTarget[tid] = { rem: [], add: [] });
      g[/remove/i.test(txt(rec, ACTION_FIELD)) ? 'rem' : 'add'].push(rec);
    }

    if (!sawField) {
      if (!_dormantLogged[viewKey]) {
        _dormantLogged[viewKey] = true;
        console.log('[scw-co-swap-pairs] dormant on ' + viewKey + ' — expose ' +
          TARGET_FIELD + ' (Target install item) as a column on the view to ' +
          'link swap pairs (also unlocks durable draft-state on the removal panel).');
      }
      return;
    }
    injectCss();

    for (var tid2 in byTarget) {
      var grp = byTarget[tid2];
      // A pair needs both halves. A lone targeted Remove is a plain removal;
      // a lone targeted Add is a half-drafted swap (recovery state) — badge
      // neither, their own flags already describe them.
      if (!grp.rem.length || !grp.add.length) continue;
      var addName = lineName(grp.add[0]);
      var remName = lineName(grp.rem[0]);
      for (var r = 0; r < grp.rem.length; r++) {
        badge(panel, grp.rem[r],
          'Product-swap pair — the CREDIT half. Replaced by “' + addName +
          '” on this CO; the product change applies in place at signature ' +
          '(the install item keeps its photos, QA and history).');
      }
      for (var a = 0; a < grp.add.length; a++) {
        badge(panel, grp.add[a],
          'Product-swap pair — the REPLACEMENT half. Replaces “' + remName +
          '” (its credit line is on this CO); applies in place at signature ' +
          '(the install item keeps its photos, QA and history).');
      }
    }
  }

  // Hover: light both halves of the pair. Delegated — survives rebuilds.
  function pairCardsOf(el) {
    var card = el && el.closest && el.closest('.scw-ws-v2-card[data-scw-swap-pair]');
    if (!card) return null;
    var panel = card.closest('.scw-ws-v2');
    if (!panel) return null;
    return panel.querySelectorAll(
      '.scw-ws-v2-card[data-scw-swap-pair="' +
      esc(card.getAttribute('data-scw-swap-pair')) + '"]');
  }
  document.addEventListener('mouseover', function (e) {
    var cards = pairCardsOf(e.target);
    if (!cards) return;
    for (var i = 0; i < cards.length; i++) cards[i].classList.add('scw-ws-v2-card--swap-hot');
  });
  document.addEventListener('mouseout', function (e) {
    var cards = pairCardsOf(e.target);
    if (!cards) return;
    for (var i = 0; i < cards.length; i++) cards[i].classList.remove('scw-ws-v2-card--swap-hot');
  });

  // ── Wiring — per view: debounced re-apply on renders + data notifies ──
  VIEWS.forEach(function (vk) {
    var timer = null;
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { apply(vk); }, 200);
    }
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(vk, schedule, EVENT_NS);
    }
    // POST-RENDER hook (see co-remove.js): decorate only once the panel
    // DOM is final — a notify-time apply could land on the old cards when
    // the rebuild was deferred, and the rebuild then wiped the chips.
    if (ns.data && typeof ns.data.subscribeRendered === 'function') {
      ns.data.subscribeRendered(vk, function () {
        try { apply(vk); } catch (e) { schedule(); }
      });
    } else if (ns.data && typeof ns.data.subscribe === 'function') {
      ns.data.subscribe(vk, schedule);
    }
  });
})();
/*** END: CO swap pairs *****************************************************/
