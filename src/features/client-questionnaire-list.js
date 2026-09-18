/*** FEATURE: client System Setup Questionnaire list (view_4145/4146) ********
 *
 * Client-facing replacement for the raw questionnaire grids on the client
 * portal. Each row renders as a card — site name, installation project,
 * address — with ONE prominent "Complete Your Questionnaire" CTA.
 *
 * Deployments (same columns on both):
 *   view_4145 — the client-login landing list
 *   view_4146 — the same list embedded on the site-details2 child page
 *               (its native link hrefs are nested under site-details2/…;
 *               the slug-substring match below picks them up unchanged)
 *
 * The CTA target is DYNAMIC per row:
 *   • SOW_published proposal (field_2936) populated →
 *       …install-system-setup-questionnairre-details/<id>/
 *   • else Quote (field_1768) populated →
 *       …edit-system-setup-questionnaire/<id>/
 *   • neither → no button (nothing sensible to open).
 *
 * The native table stays in the DOM as the data source (hidden via a class
 * only once cards actually rendered, so Knack's own empty state still shows
 * when there are no rows). The hrefs are read from the row's two native
 * link columns when present — Knack owns those slugs — with the literal
 * paths above as fallback. The view description (which leaks the "_oln="
 * keyword text to clients) is hidden whenever the cards are live.
 *
 * SPA-navigation safety nets: the portal's Vue-rendered pages can miss the
 * legacy knack-*-render events or wipe injected DOM on in-app navigation
 * (raw grid until refresh without this) — a hashchange retry sweep plus a
 * debounced body observer re-run the transform whenever a target view has
 * rows but no cards.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEWS    = ['view_4145', 'view_4146'];
  var STYLE_ID = 'scw-cq-css';
  var WRAP_CLS = 'scw-cq-cards';
  var ON_CLS   = 'scw-cq-on';
  var EVENT_NS = '.scwClientQuest';

  var F = {
    publishedProposal: 'field_2936',   // SOW_published proposal (connection)
    quote:             'field_1768',   // Quote (connection)
    site:              'field_1771',   // Site (connection)
    address:           'field_22',     // Address (connection, multi-line)
    project:           'field_1770'    // Installation Project (connection)
  };
  // Fallback hash paths (used only when the native link cells are absent).
  var LINK_PROPOSAL = '#client-login/install-system-setup-questionnairre-details/{id}/';
  var LINK_QUOTE    = '#client-login/edit-system-setup-questionnaire/{id}/';
  // Substrings that identify which native link column is which (matches the
  // nested site-details2/… variants on view_4146 too).
  var SLUG_PROPOSAL = 'install-system-setup-questionnairre-details';
  var SLUG_QUOTE    = 'edit-system-setup-questionnaire';

  var CLIP_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="8" y="2" width="8" height="4" rx="1"></rect>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>' +
    '<path d="M9 12h6"></path><path d="M9 16h4"></path></svg>';
  var PIN_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>' +
    '<circle cx="12" cy="10" r="3"></circle></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = '';
    for (var i = 0; i < VIEWS.length; i++) {
      var V = '#' + VIEWS[i];
      css +=
        // Cards live; native grid + keyword-leaking description hidden.
        V + '.' + ON_CLS + ' .kn-table-wrapper,' +
        V + '.' + ON_CLS + ' .kn-records-nav,' +
        V + '.' + ON_CLS + ' .kn-description{display:none !important;}' +
        V + ' .' + WRAP_CLS + '{display:grid;gap:14px;max-width:760px;' +
          'margin:6px 0 10px;font-family:system-ui,-apple-system,sans-serif;}' +
        V + ' .scw-cq-card{position:relative;background:#fff;' +
          'border:1px solid #dbe4ee;border-left:4px solid #0f4c75;border-radius:12px;' +
          'box-shadow:0 2px 10px rgba(15,23,42,.06);padding:18px 20px;}' +
        V + ' .scw-cq-badge{position:absolute;top:14px;right:16px;' +
          'font:700 10.5px/1.2 system-ui,sans-serif;letter-spacing:.05em;' +
          'text-transform:uppercase;color:#b45309;background:#fffbeb;' +
          'border:1px solid #fde68a;border-radius:999px;padding:4px 10px;}' +
        V + ' .scw-cq-site{display:flex;align-items:center;gap:9px;' +
          'font:700 17px/1.3 system-ui,sans-serif;color:#0f172a;margin:0 90px 4px 0;}' +
        V + ' .scw-cq-site svg{color:#0f4c75;flex:none;}' +
        V + ' .scw-cq-project{font:600 13px/1.4 system-ui,sans-serif;' +
          'color:#475569;margin:0 0 10px;}' +
        V + ' .scw-cq-addr{display:flex;gap:7px;align-items:flex-start;' +
          'font:400 13px/1.55 system-ui,sans-serif;color:#64748b;margin:0 0 16px;}' +
        V + ' .scw-cq-addr svg{flex:none;margin-top:3px;color:#94a3b8;}' +
        V + ' .scw-cq-cta{display:inline-flex;align-items:center;gap:9px;' +
          'padding:12px 22px;font:600 14px/1 system-ui,sans-serif;color:#fff !important;' +
          'background:#0f4c75;border:1px solid #0a3a63;border-radius:8px;' +
          'text-decoration:none !important;transition:background .12s;cursor:pointer;}' +
        V + ' .scw-cq-cta:hover{background:#0a3a63;color:#fff;}' +
        V + ' .scw-cq-cta-arrow{font-size:15px;line-height:1;}' +
        '@media (max-width:640px){' +
          V + ' .scw-cq-card{padding:16px;}' +
          V + ' .scw-cq-cta{display:flex;justify-content:center;width:100%;}' +
          V + ' .scw-cq-badge{position:static;display:inline-block;margin:0 0 8px;}' +
        '}';
    }
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function cellHasConnection(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return false;
    var span = td.querySelector('span[data-kn="connection-value"]');
    return !!(span && (span.textContent || '').trim());
  }
  function cellText(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    return ((span || td).textContent || '').replace(/\s+/g, ' ').trim();
  }
  // Address keeps its <br> line breaks — return sanitized text lines.
  function cellLines(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    if (!td) return [];
    var span = td.querySelector('span[data-kn="connection-value"]') || td;
    var html = span.innerHTML || '';
    var parts = html.split(/<br\s*\/?>/i);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }
  function esc(sv) {
    return String(sv == null ? '' : sv).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  /** The native link columns carry the authoritative hrefs — find the one
   *  whose path contains `slug`. Falls back to the literal template. */
  function nativeHref(tr, slug, fallbackTpl, id) {
    var links = tr.querySelectorAll('td.kn-table-link a[href]');
    for (var i = 0; i < links.length; i++) {
      var h = links[i].getAttribute('href') || '';
      if (h.indexOf(slug) !== -1) return h;
    }
    return fallbackTpl.replace('{id}', id);
  }

  function transform(viewKey) {
    var view = document.getElementById(viewKey);
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

      // Dynamic CTA: published proposal wins, else quote, else no button.
      var href = '';
      if (cellHasConnection(tr, F.publishedProposal)) {
        href = nativeHref(tr, SLUG_PROPOSAL, LINK_PROPOSAL, tr.id);
      } else if (cellHasConnection(tr, F.quote)) {
        href = nativeHref(tr, SLUG_QUOTE, LINK_QUOTE, tr.id);
      }

      var site    = cellText(tr, F.site) || 'Your Installation';
      var project = cellText(tr, F.project);
      var lines   = cellLines(tr, F.address);

      var html =
        '<span class="scw-cq-badge">Action needed</span>' +
        '<div class="scw-cq-site">' + CLIP_SVG + '<span>' + esc(site) + '</span></div>' +
        (project ? '<div class="scw-cq-project">' + esc(project) + '</div>' : '') +
        (lines.length
          ? '<div class="scw-cq-addr">' + PIN_SVG + '<span>' +
              lines.map(esc).join('<br>') + '</span></div>'
          : '') +
        (href
          ? '<a class="scw-cq-cta" href="' + esc(href) + '">' +
              '<span>Complete Your Questionnaire</span>' +
              '<span class="scw-cq-cta-arrow">&rarr;</span></a>'
          : '');

      var card = document.createElement('div');
      card.className = 'scw-cq-card';
      card.setAttribute('data-scw-cq-record', tr.id);
      card.innerHTML = html;
      wrap.appendChild(card);
      built++;
    }

    if (!built) return;
    var header = view.querySelector('.view-header');
    if (header && header.parentNode) header.parentNode.insertBefore(wrap, header.nextSibling);
    else view.insertBefore(wrap, view.firstChild);
    view.classList.add(ON_CLS);
  }

  function transformAll() {
    for (var i = 0; i < VIEWS.length; i++) transform(VIEWS[i]);
  }

  VIEWS.forEach(function (viewKey) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(viewKey, function () {
        setTimeout(function () { transform(viewKey); }, 30);
      }, EVENT_NS);
    }
  });
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(transformAll, 120); });

  // ── SPA-navigation resilience ─────────────────────────────────────────
  // (See header note.) Both nets are no-ops when the cards are already
  // live — needsRun() false, so our own insert can't loop the observer.
  function needsRun(viewKey) {
    var view = document.getElementById(viewKey);
    if (!view) return false;
    if (view.querySelector('.' + WRAP_CLS)) return false;
    return !!view.querySelector('tbody tr[id]');
  }
  function runNeeded() {
    for (var i = 0; i < VIEWS.length; i++) {
      if (needsRun(VIEWS[i])) transform(VIEWS[i]);
    }
  }
  var _sweepTimers = [];
  function sweep() {
    for (var i = 0; i < _sweepTimers.length; i++) clearTimeout(_sweepTimers[i]);
    _sweepTimers = [];
    var delays = [200, 600, 1500, 3000];
    for (var d = 0; d < delays.length; d++) {
      _sweepTimers.push(setTimeout(runNeeded, delays[d]));
    }
  }
  window.addEventListener('hashchange', sweep);
  sweep();   // cover the initial load racing the bundle download too
  var _obsT = 0;
  try {
    new MutationObserver(function () {
      if (_obsT) return;
      _obsT = setTimeout(function () {
        _obsT = 0;
        runNeeded();
      }, 180);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (eObs) { /* no MutationObserver — the sweeps still cover it */ }
})();
/*** END FEATURE: client System Setup Questionnaire list *********************/
