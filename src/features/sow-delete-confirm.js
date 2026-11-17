/*** SOW DELETE CONFIRM — "are you sure?" before a scope of work is deleted ***/
/**
 * ClickUp 86bd3yf2p (Jon Carter, 2026-11): "it's too easy to delete a scope of work
 * unintentionally … if the page jumps and someone clicks on delete erroneously, the SOW
 * is done for."
 *
 * Why there was no prompt: delete-intercept.js answers Knack's own "Are you sure you want
 * to delete this?" for the user (line-item deletes are one click by design), and the SOW
 * list's Delete — the card button sow-grid-cards.js builds on BUILD SOW (view_3325), and
 * the trashcan in that grid's Table view — is the same native Knack delete link. One
 * click, the SOW header is gone, no undo.
 *
 * What this does: a capture-phase click on a.kn-link-delete inside a configured SOW grid
 * is stopped before Knack sees it, and a window names the SOW (number, name, project
 * total) and what the page knows is attached to it (survey requested, bids, published
 * proposals, line items and how many are on no other SOW). Only "Yes, delete SOW n"
 * re-fires the click on the row's CURRENT link (the grid may have re-rendered meanwhile)
 * with a one-shot pass, and Knack deletes as before.
 *
 * Against the slip that prompted the task: the delete button is dead for `armMs` after
 * the window opens (a double-click lands on nothing), focus starts on "Keep it" (Enter
 * keeps), Esc and a click outside keep. A SOW with a survey, bids or a published
 * proposal also needs its "I understand" box ticked.
 *
 * Add a grid by adding a `views` entry. Nothing here deletes anything itself.
 */
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var STYLE_ID = 'scw-sow-delete-confirm-css';

  var CONFIG = {
    views: {
      // BUILD SOW (Projects → Project Dashboard → BUILD SOW): "Scopes of Work"
      view_3325: { proposalsView: 'view_3885', itemsView: 'view_3962' },
      // RECONCILE BIDS (Projects → Project Dashboard → RECONCILE BIDS): "Scopes of Work"
      // — a hidden data source there; listed so its Delete link can never be one click.
      view_3918: { proposalsView: '', itemsView: 'view_3921' }
    },
    fields: {
      id:       'field_2122',   // ID ("60486704913-SW1589")
      name:     'field_2126',   // NAME
      survey:   'field_2706',   // FLAG_survey requested
      released: 'field_2725',   // FLAG_released to sales
      bids:     'field_2737',   // SYS_count of associated bids
      total:    'field_2200'    // Project Total
    },
    proposalSow:  'field_2666', // published proposal → its SOW
    proposalName: 'field_2665',
    itemSow:      'field_2154', // SOW line item → its SOWs
    armMs: 700,
    passMs: 1500
  };

  var _pass = null;     // { viewKey, id, until } — the one click the window lets through
  var _open = null;     // the open window's close(), so a second click never stacks two

  // ── reads ───────────────────────────────────────────────────
  function modelsOf(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      return (v && v.model && v.model.data && v.model.data.models) || [];
    } catch (e) { return []; }
  }
  function attrsOf(m) { return (m && (m.attributes || m)) || {}; }
  function viewOnPage(viewKey) {
    return !!(viewKey && window.Knack && Knack.views && Knack.views[viewKey] && Knack.views[viewKey].model);
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function rowAttrs(viewKey, id) {
    var models = modelsOf(viewKey);
    for (var i = 0; i < models.length; i++) {
      if ((models[i].id || attrsOf(models[i]).id) === id) return attrsOf(models[i]);
    }
    return null;
  }
  /** Display text of a field: the model first, the grid cell when the model is not there. */
  function text(attrs, tr, fk) {
    if (attrs) {
      var raw = attrs[fk + '_raw'];
      if (raw != null && typeof raw !== 'object') return plain(raw);
      if (attrs[fk] != null && typeof attrs[fk] !== 'object') return plain(attrs[fk]);
    }
    var td = tr && tr.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
    return td ? plain(td.textContent) : '';
  }
  function isYes(attrs, tr, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (typeof raw === 'boolean') return raw;
    var s = text(attrs, tr, fk).toLowerCase();
    return s === 'yes' || s === 'true';
  }
  function connIds(attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (!raw) return [];
    if (!Array.isArray(raw)) raw = [raw];
    var out = [];
    for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id);
    return out;
  }
  function money(attrs, tr, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    var n = typeof raw === 'number' ? raw : parseFloat(text(attrs, tr, fk).replace(/[$,\s]/g, ''));
    if (isNaN(n)) return '';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /** "60486704913-SW1589" → "1589"; "…-SW1855CO" → "1855CO"; no SW token → ''. */
  function sowNumber(idText) {
    var m = /SW-?\s*(\d+\s*(?:CO)?)(?![A-Za-z0-9])/i.exec(idText || '');
    return m ? m[1].replace(/\s+/g, '').toUpperCase() : '';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /** Everything the page can say about the SOW in the row. */
  function facts(viewKey, sowId, tr) {
    var cfg = CONFIG.views[viewKey] || {};
    var F = CONFIG.fields;
    var attrs = rowAttrs(viewKey, sowId);
    var idText = text(attrs, tr, F.id);
    var num = sowNumber(idText);
    var out = {
      sowId: sowId,
      label: num ? 'SOW ' + num : (idText ? 'SOW ' + idText : 'this SOW'),
      name: text(attrs, tr, F.name),
      total: money(attrs, tr, F.total),
      survey: isYes(attrs, tr, F.survey),
      released: isYes(attrs, tr, F.released),
      bids: parseInt(text(attrs, tr, F.bids), 10) || 0,
      proposals: [],
      items: null,          // null = the page has no line-item grid to count from
      itemsOnlyHere: 0
    };
    if (viewOnPage(cfg.proposalsView)) {
      var props = modelsOf(cfg.proposalsView);
      for (var i = 0; i < props.length; i++) {
        var pa = attrsOf(props[i]);
        if (connIds(pa, CONFIG.proposalSow).indexOf(sowId) >= 0) out.proposals.push(plain(pa[CONFIG.proposalName]) || 'a proposal');
      }
    }
    if (viewOnPage(cfg.itemsView)) {
      var items = modelsOf(cfg.itemsView);
      out.items = 0;
      for (var j = 0; j < items.length; j++) {
        var ids = connIds(attrsOf(items[j]), CONFIG.itemSow);
        if (ids.indexOf(sowId) < 0) continue;
        out.items++;
        if (ids.length === 1) out.itemsOnlyHere++;
      }
    }
    out.heavy = out.survey || out.bids > 0 || out.proposals.length > 0;
    return out;
  }

  // ── the window ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-sdc-overlay { position: fixed; inset: 0; z-index: 100020; background: rgba(15,23,42,.55);',
      '  display: flex; align-items: center; justify-content: center; padding: 16px;',
      '  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '.scw-sdc { background: #fff; border-radius: 10px; border-top: 5px solid #b91c1c; width: 100%; max-width: 480px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,.35); padding: 20px 22px 18px; color: #1e293b; text-align: left; }',
      '.scw-sdc__title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }',
      '.scw-sdc__sow { border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 10px 12px; margin-bottom: 12px; }',
      '.scw-sdc__sow-num { font-size: 12px; font-weight: 700; letter-spacing: .3px; color: #64748b; text-transform: uppercase; }',
      '.scw-sdc__sow-name { font-size: 15px; font-weight: 700; color: #0f172a; overflow-wrap: anywhere; }',
      '.scw-sdc__sow-total { font-size: 12.5px; color: #475569; margin-top: 2px; font-variant-numeric: tabular-nums; }',
      '.scw-sdc__facts { margin: 0 0 12px; padding: 0; list-style: none; }',
      '.scw-sdc__facts li { padding: 3px 0 3px 18px; position: relative; color: #334155; }',
      '.scw-sdc__facts li::before { content: ""; position: absolute; left: 4px; top: 10px; width: 6px; height: 6px;',
      '  border-radius: 50%; background: #94a3b8; }',
      '.scw-sdc__facts li.is-risk { color: #991b1b; font-weight: 600; }',
      '.scw-sdc__facts li.is-risk::before { background: #b91c1c; }',
      '.scw-sdc__undo { color: #475569; margin: 0 0 14px; }',
      '.scw-sdc__ack { display: flex; align-items: flex-start; gap: 8px; border: 1px solid #fecaca; background: #fef2f2;',
      '  border-radius: 8px; padding: 9px 11px; margin: 0 0 14px; color: #7f1d1d; font-weight: 600; cursor: pointer; }',
      '.scw-sdc__ack input { margin: 2px 0 0; flex: none; }',
      '.scw-sdc__msg { color: #b45309; font-weight: 600; margin: 0 0 12px; }',
      '.scw-sdc__btns { display: flex; justify-content: flex-end; gap: 8px; }',
      '.scw-sdc__btn { appearance: none; cursor: pointer; padding: 9px 16px; border-radius: 6px;',
      '  font: 600 13px/1.2 system-ui, sans-serif; border: 1px solid #cbd5e1; background: #fff; color: #334155; }',
      '.scw-sdc__btn:hover { background: #f1f5f9; }',
      '.scw-sdc__btn:focus-visible { outline: 2px solid #2f5f91; outline-offset: 2px; }',
      '.scw-sdc__btn--delete { background: #b91c1c; border-color: #991b1b; color: #fff; }',
      '.scw-sdc__btn--delete:hover { background: #991b1b; }',
      '.scw-sdc__btn--delete[disabled] { background: #fca5a5; border-color: #fca5a5; cursor: not-allowed; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function factsHtml(f) {
    var li = [];
    if (f.survey) li.push('<li class="is-risk">A survey has been requested on this SOW.</li>');
    if (f.bids > 0) li.push('<li class="is-risk">' + plural(f.bids, 'bid is', 'bids are') + ' tied to it.</li>');
    if (f.proposals.length) {
      li.push('<li class="is-risk">' + (f.proposals.length === 1
        ? 'It has a published proposal: ' + esc(f.proposals[0]) + '.'
        : 'It has ' + f.proposals.length + ' published proposals.') + '</li>');
    }
    if (f.released) li.push('<li>It is released to sales.</li>');
    if (f.items != null) {
      if (!f.items) li.push('<li>No line items are on this SOW.</li>');
      else {
        var tail = '';
        if (f.itemsOnlyHere === f.items) {
          tail = f.items === 1 ? ' It is on no other SOW and will be left with no SOW.'
                               : ' None of them is on another SOW; they will be left with no SOW.';
        } else if (f.itemsOnlyHere > 0) {
          tail = ' ' + f.itemsOnlyHere + (f.itemsOnlyHere === 1 ? ' is' : ' are') + ' on no other SOW and will be left with no SOW.';
        } else {
          tail = f.items === 1 ? ' It stays on its other SOW.' : ' All of them stay on another SOW.';
        }
        li.push('<li>' + plural(f.items, 'line item is', 'line items are') + ' on this SOW.' + tail + '</li>');
      }
    }
    return li.length ? '<ul class="scw-sdc__facts">' + li.join('') + '</ul>' : '';
  }

  function findLink(viewKey, sowId) {
    var view = document.getElementById(viewKey);
    if (!view) return null;
    var rows = view.querySelectorAll('tr[id]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === sowId) {
        var a = rows[i].querySelector('a.kn-link-delete');
        if (a) return a;
      }
    }
    return null;
  }

  function open(viewKey, sowId) {
    if (_open) _open();
    injectStyles();
    var view = document.getElementById(viewKey);
    var tr = null;
    if (view) {
      var rows = view.querySelectorAll('tr[id]');
      for (var r = 0; r < rows.length; r++) if (rows[r].id === sowId) { tr = rows[r]; break; }
    }
    var f = facts(viewKey, sowId, tr);

    var ov = document.createElement('div');
    ov.className = 'scw-sdc-overlay';
    ov.innerHTML =
      '<div class="scw-sdc" role="alertdialog" aria-modal="true" aria-labelledby="scw-sdc-title">' +
        '<h2 class="scw-sdc__title" id="scw-sdc-title">Delete this scope of work?</h2>' +
        '<div class="scw-sdc__sow">' +
          '<div class="scw-sdc__sow-num">' + esc(f.label) + '</div>' +
          (f.name ? '<div class="scw-sdc__sow-name">' + esc(f.name) + '</div>' : '') +
          (f.total ? '<div class="scw-sdc__sow-total">Project total ' + esc(f.total) + '</div>' : '') +
        '</div>' +
        factsHtml(f) +
        '<p class="scw-sdc__undo">Deleting a scope of work cannot be undone.</p>' +
        (f.heavy
          ? '<label class="scw-sdc__ack"><input type="checkbox" data-scw-sdc-ack>' +
              '<span>I understand what is attached to ' + esc(f.label) + ' and want to delete it anyway.</span></label>'
          : '') +
        '<p class="scw-sdc__msg" data-scw-sdc-msg hidden></p>' +
        '<div class="scw-sdc__btns">' +
          '<button type="button" class="scw-sdc__btn" data-scw-sdc-keep>Keep it</button>' +
          '<button type="button" class="scw-sdc__btn scw-sdc__btn--delete" data-scw-sdc-delete disabled>Yes, delete ' +
            esc(f.label) + '</button>' +
        '</div>' +
      '</div>';

    var keep = ov.querySelector('[data-scw-sdc-keep]');
    var del  = ov.querySelector('[data-scw-sdc-delete]');
    var ack  = ov.querySelector('[data-scw-sdc-ack]');
    var msg  = ov.querySelector('[data-scw-sdc-msg]');
    var armed = false;
    var prevFocus = document.activeElement;

    function sync() { del.disabled = !(armed && (!ack || ack.checked)); }
    var armTimer = setTimeout(function () { armed = true; sync(); }, CONFIG.armMs);

    function close() {
      clearTimeout(armTimer);
      document.removeEventListener('keydown', onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (_open === close) _open = null;
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch (e) { /* gone */ }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      // keep Tab inside the window
      var foc = [];
      if (ack) foc.push(ack);
      foc.push(keep);
      if (!del.disabled) foc.push(del);
      var at = foc.indexOf(document.activeElement);
      var next = e.shiftKey ? (at <= 0 ? foc.length - 1 : at - 1) : (at < 0 || at === foc.length - 1 ? 0 : at + 1);
      e.preventDefault();
      foc[next].focus();
    }

    keep.addEventListener('click', close);
    if (ack) ack.addEventListener('change', sync);
    ov.addEventListener('click', function (e) {
      // A click outside keeps the SOW — but not while the window is still arming: the second
      // half of a double-click must leave it on screen.
      if (e.target === ov && armed) close();
    });
    del.addEventListener('click', function () {
      if (del.disabled) return;
      var link = findLink(viewKey, sowId);
      if (!link) {
        msg.textContent = 'This SOW is no longer in the list. Nothing was deleted — close this and reload the page.';
        msg.hidden = false;
        del.disabled = true;
        armed = false;
        return;
      }
      close();
      _pass = { viewKey: viewKey, id: sowId, until: Date.now() + CONFIG.passMs };
      try { console.info('[scw-sow-delete] ' + f.label + ' (' + sowId + ') — delete confirmed in ' + viewKey); } catch (e) { /* console absent */ }
      link.click();
    });

    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    _open = close;
    try { keep.focus(); } catch (e) { /* not focusable */ }
    return ov;
  }

  // ── the intercept ───────────────────────────────────────────
  // Capture phase on document: runs before Knack's delegated handler on the view element.
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a.kn-link-delete') : null;
    if (!link) return;
    var view = link.closest('.kn-view');
    var viewKey = view && view.id;
    if (!viewKey || !CONFIG.views[viewKey]) return;
    var tr = link.closest('tr[id]');
    var sowId = tr && tr.id;
    if (!sowId || !/^[a-f0-9]{24}$/i.test(sowId)) return;

    if (_pass && _pass.viewKey === viewKey && _pass.id === sowId && Date.now() < _pass.until) {
      _pass = null;                       // the confirmed click: Knack takes it from here
      return;
    }
    _pass = null;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    open(viewKey, sowId);
  }, true);

  SCW.sowDeleteConfirm = {
    CONFIG: CONFIG,
    open: open,
    _facts: facts,
    _sowNumber: sowNumber
  };
})();
/*** END SOW DELETE CONFIRM ***/
