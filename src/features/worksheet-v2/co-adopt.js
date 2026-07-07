/*** WORKSHEET V2 — CHANGE ORDER: adopt previously-quoted line items *********
 *
 * Runs on the CO drafting scene's READ-ONLY "Previously Quoted Items" panel
 * (the view_4088 deployment in config.js, flagged `adopt`). Design decision
 * 2026-07-07: adoptable items are shown in the full device-worksheet card
 * style — same grouping, money columns, warnings the team already knows —
 * NOT a modal picker. Each card gets one live control:
 *
 *   "+ Add to Change Order"  → connects the line item to the CO by unioning
 *   its multi-SOW connection (field_2154) with the CO's SOW record id. The
 *   write happens in Make (MAKE_CO_ADOPT_ITEMS_WEBHOOK — the same scenario
 *   shape as import-unique-items: receivingRecordId + uniqueItemIds), so the
 *   client never mutates records directly. Cards whose field_2154 already
 *   contains this CO render a green "Added" pill instead of the button.
 *
 * The panel's readOnly lockdown is three layers: styles.js kills the mouse
 * path on every edit affordance, init.js skips the toolbar/sort/bulk mounts,
 * and this module hard-disables inputs after each render so keyboard
 * tab-and-type can't commit an edit either.
 *
 * ⚠️ Adopted items are SHARED records (they stay connected to their original
 * quote SOW — that's the point of the multi-connection). Removing one from
 * the CO must be a field_2154 DISCONNECT, never a record delete. The CO
 * worksheet's kebab-delete story for adopted items is a follow-up; until
 * then view_4079 renders them like any other CO line.
 ******************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var SOW_FIELD    = 'field_2154';
  var BTN_CLS      = 'scw-co-adopt-btn';
  var PILL_CLS     = 'scw-co-adopt-added';
  var STYLE_ID     = 'scw-ws-v2-co-adopt-css';
  var LOG_PREFIX   = '[scw-co-adopt]';

  // The CO worksheet on the same scene — refetched after an adoption so the
  // new line appears there without a reload.
  var CO_VIEW_DEFAULT = 'view_4079';

  // ── Config ────────────────────────────────────────────────────────────
  function adoptViews() {
    var out = [];
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v && v.enabled !== false && v.adopt) out.push(v);
    }
    return out;
  }

  // ── CO SOW id ─────────────────────────────────────────────────────────
  // The CO drafting page is a drill-in child page whose OWN record is the
  // CO's SOW — its id is the LAST 24-hex segment of the hash. Don't reuse
  // toolbar.js getSowIdFromHash(): its base-path patterns match the PARENT
  // route prefix (e.g. …/deploy/<sowId>/…), which would return the base
  // SOW instead of the CO.
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' &&
               typeof Knack.getUserAttributes === 'function')
        ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }

  // ── Styles ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Anchor for the absolutely-positioned control (top-right — the slot
      // the hidden kebab menu occupies on editable panels).
      '.scw-ws-v2--readonly .scw-ws-v2-card { position: relative; }',

      '.' + BTN_CLS + ' {',
      '  position: absolute; top: 6px; right: 8px; z-index: 3;',
      '  display: inline-flex; align-items: center; gap: 5px;',
      '  padding: 4px 10px;',
      '  background: #0f4c75; color: #fff;',
      '  border: none; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: 0.01em;',
      '  cursor: pointer;',
      '  transition: background 0.15s ease;',
      '}',
      '.' + BTN_CLS + ':hover { background: #07467c; }',
      '.' + BTN_CLS + '[disabled] { opacity: 0.6; cursor: default; }',
      '.' + BTN_CLS + ' .scw-co-adopt-spin {',
      '  width: 11px; height: 11px; flex: 0 0 auto;',
      '  border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;',
      '  border-radius: 50%;',
      '  animation: scwCoAdoptSpin 0.8s linear infinite;',
      '}',
      '@keyframes scwCoAdoptSpin { to { transform: rotate(360deg); } }',

      // Green "already on this CO" state — same slot, non-interactive.
      '.' + PILL_CLS + ' {',
      '  position: absolute; top: 6px; right: 8px; z-index: 3;',
      '  display: inline-flex; align-items: center; gap: 5px;',
      '  padding: 4px 10px;',
      '  background: #ecfdf5; color: #047857;',
      '  border: 1px solid #a7f3d0; border-radius: 5px;',
      '  font: 600 11px/1.3 system-ui, -apple-system, sans-serif;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Decorate a rendered panel ─────────────────────────────────────────
  function recordIndex(viewKey) {
    var byId = {};
    var recs = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i] && recs[i].id) byId[recs[i].id] = recs[i];
    }
    return byId;
  }

  function isOnCo(rec, coId) {
    if (!rec || !coId) return false;
    var raw = rec[SOW_FIELD + '_raw'];
    if (!Array.isArray(raw)) return false;
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].id === coId) return true;
    }
    return false;
  }

  function setControl(card, rec, coId, vcfg) {
    var btn  = card.querySelector('.' + BTN_CLS);
    var pill = card.querySelector('.' + PILL_CLS);
    if (isOnCo(rec, coId)) {
      if (btn) btn.parentNode.removeChild(btn);
      if (!pill) {
        pill = document.createElement('span');
        pill.className = PILL_CLS;
        pill.innerHTML = '✓ Added to this Change Order';
        card.appendChild(pill);
      }
      return;
    }
    if (pill) pill.parentNode.removeChild(pill);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BTN_CLS;
      btn.setAttribute('data-scw-co-adopt', rec ? rec.id : '');
      btn.setAttribute('data-scw-co-adopt-view', vcfg.sourceViewKey);
      btn.title = 'Connect this quoted line item to the change order';
      btn.textContent = '+ ' + ((vcfg.adopt && vcfg.adopt.label) || 'Add to Change Order');
      card.appendChild(btn);
    }
  }

  function decorate(vcfg) {
    var viewKey = vcfg.sourceViewKey;
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    injectStyles();

    var coId = getCoSowId();
    if (!coId) {
      console.warn(LOG_PREFIX, 'could not resolve the CO SOW id from the hash —',
        'adopt buttons suppressed this render');
    }

    var byId = recordIndex(viewKey);
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var rid  = card.getAttribute('data-scw-ws-v2-record');
      var rec  = byId[rid];
      if (coId && rec) setControl(card, rec, coId, vcfg);
    }

    // Keyboard belt for the readOnly lockdown: pointer-events CSS blocks
    // the mouse, this blocks tab-focus + type + blur-commit.
    if (vcfg.readOnly) {
      var inputs = container.querySelectorAll(
        '.scw-ws-v2-card input, .scw-ws-v2-card textarea, .scw-ws-v2-card select');
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = true;
    }
  }

  function decorateSoon(vcfg) {
    // Defer past the current notify chain so we always run AFTER
    // render.js has (re)built the cards, regardless of subscriber order.
    setTimeout(function () { decorate(vcfg); }, 0);
  }

  // ── Adoption write (Make webhook) ─────────────────────────────────────
  function fireAdopt(btn, recordId, viewKey) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ADOPT_ITEMS_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('The change-order adopt webhook is not configured.');
      return;
    }
    var coId = getCoSowId();
    if (!coId) {
      alert('Could not determine the change order record id from the URL.');
      return;
    }
    var rec = recordIndex(viewKey)[recordId];
    var sourceSowIds = [];
    if (rec && Array.isArray(rec[SOW_FIELD + '_raw'])) {
      for (var i = 0; i < rec[SOW_FIELD + '_raw'].length; i++) {
        var r = rec[SOW_FIELD + '_raw'][i];
        if (r && r.id) sourceSowIds.push(r.id);
      }
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="scw-co-adopt-spin"></span> Adding…';

    // Same payload contract as import-unique-items' fireBulkWebhook —
    // "connect uniqueItemIds to receivingRecordId" — plus a changeOrder
    // marker so the Make scenario can branch if CO handling ever diverges.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receivingRecordId:       coId,
        sourceRecordId:          null,
        sourceRecordIds:         sourceSowIds,
        uniqueItemIds:           [recordId],
        deleteSourceIds:         [],
        deleteSourceAfterImport: false,
        bulk:                    false,
        changeOrder:             true,
        triggeredBy:             getTriggeredBy()
      })
    }).then(function (resp) {
      return resp.json().catch(function () { return null; });
    }).then(function (data) {
      if (data && data.success) {
        // Optimistic flip to the Added pill; the refetches below make it
        // durable (and land the new line on the CO worksheet).
        var card = btn.closest('.scw-ws-v2-card');
        if (card) {
          btn.parentNode.removeChild(btn);
          var pill = document.createElement('span');
          pill.className = PILL_CLS;
          pill.innerHTML = '✓ Added to this Change Order';
          card.appendChild(pill);
        }
        refetchAfterAdopt(viewKey);
        return;
      }
      btn.disabled = false;
      btn.textContent = '+ Add to Change Order';
      alert((data && (data.error || data.message)) || 'Failed to add the item to the change order.');
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '+ Add to Change Order';
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  // Staggered refetches (same cadence as bulk.js handleDuplicate) — Make's
  // writes land asynchronously after the webhook responds.
  function refetchAfterAdopt(adoptViewKey) {
    function refetch() {
      [CO_VIEW_DEFAULT, adoptViewKey].forEach(function (vk) {
        var v = window.Knack && Knack.views && Knack.views[vk];
        if (v && v.model && typeof v.model.fetch === 'function') {
          try { v.model.fetch(); } catch (e) { /* next tick catches it */ }
        }
      });
    }
    refetch();
    setTimeout(refetch, 3000);
    setTimeout(refetch, 8000);
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  var views = adoptViews();
  if (!views.length) return;

  views.forEach(function (vcfg) {
    // Primary: re-decorate on every data notify for the panel.
    if (ns.data && typeof ns.data.subscribe === 'function') {
      ns.data.subscribe(vcfg.sourceViewKey, function () { decorateSoon(vcfg); });
    }
    // Fallback: view re-renders that reach the DOM without a notify
    // (deferred flushes, native refetches).
    $(document).on('knack-view-render.' + vcfg.sourceViewKey + '.scwCoAdopt',
      function () { decorateSoon(vcfg); });
  });

  // One delegated click handler for every adopt button.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest &&
      e.target.closest('.' + BTN_CLS + '[data-scw-co-adopt]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    fireAdopt(btn,
      btn.getAttribute('data-scw-co-adopt'),
      btn.getAttribute('data-scw-co-adopt-view'));
  }, true);
})();
/*** END WORKSHEET V2 — CHANGE ORDER: adopt previously-quoted line items *****/
