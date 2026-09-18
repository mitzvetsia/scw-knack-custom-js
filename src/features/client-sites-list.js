/*** FEATURE: client Sites list (view_3102) **********************************
 *
 * Client-facing replacement for the raw Sites grid on the client-login
 * scene. Each row renders as a clickable tile — site name, address, and a
 * "View site" affordance — laid out as a responsive card grid. The whole
 * card is the row's native site-details2 link, read straight off the
 * row's link column (Knack owns the slug).
 *
 * The native records-nav (keyword search / pagination / filters) stays
 * VISIBLE and functional — a search re-renders the view and the cards
 * rebuild from the filtered rows. Only the table itself is hidden, and
 * only once cards actually rendered, so Knack's empty state still shows
 * when a search matches nothing... actually: zero rows → cards come down
 * and the native (empty) table area returns, which is exactly Knack's
 * "no records" presentation.
 *
 * Same SPA-navigation safety nets as client-questionnaire-list.js — the
 * portal's Vue-rendered pages can miss the legacy render events or wipe
 * injected DOM on in-app navigation (raw grid until refresh without this).
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_3102';
  var STYLE_ID = 'scw-cs-css';
  var WRAP_CLS = 'scw-cs-cards';
  var ON_CLS   = 'scw-cs-on';
  var EVENT_NS = '.scwClientSites';

  var F = {
    name:    'field_1256',   // Site Name (text)
    address: 'field_1257'    // Site Address (multi-line)
  };

  var BUILDING_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="2" width="16" height="20" rx="2"></rect>' +
    '<path d="M9 22v-4h6v4"></path><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01M12 6h.01M12 10h.01M12 14h.01"></path></svg>';
  var PIN_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>' +
    '<circle cx="12" cy="10" r="3"></circle></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + VIEW + '.' + ON_CLS + ' .kn-table-wrapper{display:none !important;}' +
      '#' + VIEW + ' .' + WRAP_CLS + '{display:grid;gap:14px;margin:6px 0 10px;' +
        'grid-template-columns:repeat(auto-fill,minmax(280px,1fr));' +
        'font-family:system-ui,-apple-system,sans-serif;}' +
      '#' + VIEW + ' .scw-cs-card{display:flex;flex-direction:column;gap:8px;' +
        'background:#fff;border:1px solid #dbe4ee;border-radius:12px;' +
        'box-shadow:0 2px 8px rgba(15,23,42,.05);padding:16px 18px;' +
        'text-decoration:none !important;color:inherit;' +
        'transition:box-shadow .14s,border-color .14s,transform .14s;}' +
      '#' + VIEW + ' .scw-cs-card:hover{border-color:#0f4c75;' +
        'box-shadow:0 6px 18px rgba(15,23,42,.12);transform:translateY(-1px);}' +
      '#' + VIEW + ' .scw-cs-name{display:flex;align-items:flex-start;gap:9px;' +
        'font:700 15px/1.35 system-ui,sans-serif;color:#0f172a;}' +
      '#' + VIEW + ' .scw-cs-name svg{color:#0f4c75;flex:none;margin-top:1px;}' +
      '#' + VIEW + ' .scw-cs-addr{display:flex;gap:7px;align-items:flex-start;' +
        'font:400 13px/1.55 system-ui,sans-serif;color:#64748b;margin:0 0 2px 26px;}' +
      '#' + VIEW + ' .scw-cs-addr svg{flex:none;margin-top:3px;color:#94a3b8;}' +
      '#' + VIEW + ' .scw-cs-go{margin:auto 0 0 26px;' +
        'font:600 12.5px/1 system-ui,sans-serif;color:#0f4c75;}' +
      '#' + VIEW + ' .scw-cs-card:hover .scw-cs-go{text-decoration:underline;}' +
      '@media (max-width:640px){' +
        '#' + VIEW + ' .' + WRAP_CLS + '{grid-template-columns:1fr;}' +
      '}';
    document.head.appendChild(s);
  }

  function esc(sv) {
    return String(sv == null ? '' : sv).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function cellText(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    return td ? (td.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function cellLines(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return [];
    var span = td.querySelector('span[class^="col-"]') || td;
    var parts = (span.innerHTML || '').split(/<br\s*\/?>/i);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function transform() {
    var view = document.getElementById(VIEW);
    if (!view) return;
    injectStyles();

    var old = view.querySelector('.' + WRAP_CLS);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    view.classList.remove(ON_CLS);

    var rows = view.querySelectorAll('tbody tr[id]');
    if (!rows.length) return;   // native empty state stays visible

    var wrap = document.createElement('div');
    wrap.className = WRAP_CLS;
    var built = 0;

    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (!/^[0-9a-f]{24}$/i.test(tr.id)) continue;
      var linkEl = tr.querySelector('td.kn-table-link a[href]');
      var href   = linkEl ? linkEl.getAttribute('href') : '';
      var name   = cellText(tr, F.name) || 'Site';
      var lines  = cellLines(tr, F.address);

      var card = document.createElement(href ? 'a' : 'div');
      card.className = 'scw-cs-card';
      if (href) card.setAttribute('href', href);
      card.setAttribute('data-scw-cs-record', tr.id);
      card.innerHTML =
        '<div class="scw-cs-name">' + BUILDING_SVG + '<span>' + esc(name) + '</span></div>' +
        (lines.length
          ? '<div class="scw-cs-addr">' + PIN_SVG + '<span>' +
              lines.map(esc).join('<br>') + '</span></div>'
          : '') +
        '<div class="scw-cs-go">View site &rarr;</div>';
      wrap.appendChild(card);
      built++;
    }

    if (!built) return;
    // After the records-nav (search stays usable above the cards).
    var nav = view.querySelector('.kn-records-nav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(wrap, nav.nextSibling);
    else {
      var header = view.querySelector('.view-header');
      if (header && header.parentNode) header.parentNode.insertBefore(wrap, header.nextSibling);
      else view.insertBefore(wrap, view.firstChild);
    }
    view.classList.add(ON_CLS);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(transform, 30); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(transform, 120); });

  // ── SPA-navigation resilience (same nets as client-questionnaire-list) ─
  function needsRun() {
    var view = document.getElementById(VIEW);
    if (!view) return false;
    if (view.querySelector('.' + WRAP_CLS)) return false;
    return !!view.querySelector('tbody tr[id]');
  }
  var _sweepTimers = [];
  function sweep() {
    for (var i = 0; i < _sweepTimers.length; i++) clearTimeout(_sweepTimers[i]);
    _sweepTimers = [];
    var delays = [200, 600, 1500, 3000];
    for (var d = 0; d < delays.length; d++) {
      _sweepTimers.push(setTimeout(function () {
        if (needsRun()) transform();
      }, delays[d]));
    }
  }
  window.addEventListener('hashchange', sweep);
  sweep();
  var _obsT = 0;
  try {
    new MutationObserver(function () {
      if (_obsT) return;
      _obsT = setTimeout(function () {
        _obsT = 0;
        if (needsRun()) transform();
      }, 180);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (eObs) { /* no MutationObserver — the sweeps still cover it */ }
})();
/*** END FEATURE: client Sites list ******************************************/
