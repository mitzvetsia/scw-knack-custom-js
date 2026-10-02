/*** PROJECT HEADER NAVIGATION — the project menu as workflow tabs ***********
 *
 * Knack's project menu (view_44: Dashboard · K2: Build SOWs · K2: Reconcile
 * Bids · K2: Manage Deployment · the K1 legacy pages) rendered as a row of
 * teal pills between the Project # hero and the project header card — a
 * third stacked thing with its own look, and both cards around it repeated
 * the project name. This module folds it into ONE card:
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ PROJECT #            │ Surveillance System Installation           │
 *   │ 60524852230 [copy]   │ Company › Site · address   status · AE · … │
 *   ├────────────────────────────────────────────────────────────────────┤
 *   │ ⌂ Dashboard │ ① Build SOWs  ② Reconcile Bids  ③ Manage Deployment  More ▾│
 *   └────────────────────────────────────────────────────────────────────┘
 *
 *   - The hero (project-id-badge.js) is the card. Its right half ADOPTS the
 *     project header card's top block (build-sow-project-header.js
 *     `.scw-bsh-top`: title, crumb, address, Edit, ClickUp, status, AE), so
 *     the name is said once; the "- <deal id>" suffix comes off the title
 *     because the number has its own place. The rest of that card (survey
 *     tasks, playbook) stays where it was.
 *   - The card's bottom edge is the tab strip. The menu's REAL anchors move
 *     into it (Knack routing + active classes keep working; a Builder rename
 *     flows through), "K2:" / "K1:" prefixes come off the labels, the three
 *     workflow stages get step numbers in workflow order, Dashboard sits
 *     apart behind a hairline, and everything else collapses under "More".
 *     Current = navy text + 3px navy underline + filled step number.
 *   - On a scene with no hero (legacy pages) the strip renders in its own
 *     slim card where the menu was.
 *   - Scrolled past the card, a 48px bar pins to the top: Project # chip,
 *     project name, cloned tabs. It replaces the badge's standalone pill.
 *
 * view_44 stays in the DOM, hidden — it is the source of truth and Knack
 * rebuilds it on navigation; a rebuild is detected and the fresh anchors
 * re-adopted. Supersedes nav-knack2-highlight.js (removed from the build).
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    navView:   'view_44',
    home:      /^(k[12]:\s*)?dashboard$/i,
    stages: [
      { match: /^(k[12]:\s*)?build sows?$/i,       step: 1 },
      { match: /^(k[12]:\s*)?reconcile bids?$/i,   step: 2 },
      { match: /^(k[12]:\s*)?manage deployment$/i, step: 3 }
    ],
    prefixRe:  /^k[12]:\s*/i,          // stripped from every label
    moreLabel: 'More',
    moreHead:  'Legacy pages'
  };

  var STRIP_ID  = 'scw-phn-tabs';
  var CARD_ID   = 'scw-phn-card';
  var BAR_ID    = 'scw-phn-bar';
  var STYLE_ID  = 'scw-phn-css';
  var NS        = '.scwProjectHeaderNav';
  var HIDE_CLS  = 'scw-phn-source';
  var _busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function norm(s) { return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  // The label span, never our own step badge / home icon spans.
  function labelSpan(a) { return a.querySelector('span:not(.scw-phn-step):not(.scw-phn-home-ic)') || a; }
  function labelOf(a) { return norm(labelSpan(a).textContent); }

  var HOME_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>' +
    '<polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
  var CHEV_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  var COPY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

  // ── CSS ─────────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // The menu view stays as the data source, out of sight.
      '#' + CONFIG.navView + '.' + HIDE_CLS + ' { display: none !important; }',
      // Hero as the card: body row + tab strip footer.
      '#scw-pid-hero.scw-pid--nav { padding: 0 !important; overflow: hidden; }',
      '#scw-pid-hero.scw-pid--nav > .scw-pid-body { padding: 16px 24px 14px; }',
      '#scw-pid-hero.scw-pid--nav > .scw-pid-foot { border-top: 1px solid #e2e8f0; background: #f8fafc; }',
      // Adopted project header block: the hero's own right half steps aside.
      '#scw-pid-hero.scw-pid--adopted .scw-pid-own .scw-pid-right { display: none; }',
      '#scw-pid-hero.scw-pid--adopted .scw-pid-adopt { flex: 1 1 auto; min-width: 0; }',
      '#scw-pid-hero .scw-pid-adopt:empty { display: none; }',
      '#scw-pid-hero .scw-pid-adopt .scw-bsh-eyebrow--project { display: none; }',
      '#scw-pid-hero .scw-pid-adopt .scw-bsh-top { padding: 0; margin: 0; border: 0; }',
      '.scw-bsh-card.scw-bsh-card--hollow { display: none !important; }',
      // Standalone card (scenes without the hero).
      '#' + CARD_ID + ' { background: #fff; border: 1px solid #dbe4ee; border-radius: 12px; overflow: hidden; margin: 0 0 16px; }',
      // ── The strip ──
      '#' + STRIP_ID + ' { display: flex; align-items: stretch; flex-wrap: wrap; padding: 0 12px; min-height: 46px;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '#' + STRIP_ID + ' .scw-phn-sep { width: 1px; background: #e2e8f0; margin: 12px 4px; }',
      '#' + STRIP_ID + ' .scw-phn-spacer { flex: 1 1 auto; }',
      '#' + STRIP_ID + ' .scw-phn-stages, #' + STRIP_ID + ' .scw-phn-home { display: flex; align-items: stretch; }',
      // Knack anchors carry button chrome (kn-button / is-primary) — flatten it.
      '#' + STRIP_ID + ' a.kn-link, #' + BAR_ID + ' a.scw-phn-clone {',
      '  display: inline-flex !important; align-items: center !important; gap: 9px !important;',
      '  height: 46px !important; padding: 0 14px !important; margin: 0 !important;',
      '  background: transparent !important; border: 0 !important; border-bottom: 3px solid transparent !important;',
      '  border-radius: 0 !important; box-shadow: none !important; text-decoration: none !important;',
      '  font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif !important; color: #475569 !important;',
      '  white-space: nowrap; cursor: pointer; }',
      '#' + STRIP_ID + ' a.kn-link span, #' + BAR_ID + ' a.scw-phn-clone span { color: inherit !important; font: inherit !important; }',
      '#' + STRIP_ID + ' a.kn-link:hover, #' + BAR_ID + ' a.scw-phn-clone:hover {',
      '  color: #0f172a !important; background: #fff !important; border-bottom-color: #cbd5e1 !important; }',
      '#' + STRIP_ID + ' a.kn-link.is-current, #' + BAR_ID + ' a.scw-phn-clone.is-current {',
      '  color: #0f4c75 !important; font-weight: 700 !important; background: #fff !important; border-bottom-color: #0f4c75 !important; }',
      '.scw-phn-step { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #94a3b8; color: #64748b !important;',
      '  font: 700 11px/1 system-ui, sans-serif !important; display: inline-flex; align-items: center; justify-content: center; flex: none; }',
      'a:hover > .scw-phn-step { border-color: #64748b; color: #334155 !important; }',
      'a.is-current > .scw-phn-step { background: #0f4c75; border-color: #0f4c75; color: #fff !important; }',
      '.scw-phn-home-ic { display: inline-flex; color: inherit; }',
      // More ▾ + panel
      '.scw-phn-more { position: relative; display: flex; align-items: stretch; }',
      '.scw-phn-more-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; height: 46px; background: none; border: 0;',
      '  border-bottom: 3px solid transparent; font: 600 12.5px/1 system-ui, sans-serif; color: #64748b; cursor: pointer; }',
      '.scw-phn-more-btn:hover, .scw-phn-more.is-open .scw-phn-more-btn { color: #0f172a; background: #fff; border-bottom-color: #cbd5e1; }',
      '.scw-phn-more.is-open .scw-phn-more-btn svg { transform: rotate(180deg); }',
      '.scw-phn-more.has-current .scw-phn-more-btn { color: #0f4c75; border-bottom-color: #0f4c75; font-weight: 700; }',
      '.scw-phn-panel { display: none; position: absolute; right: 0; top: calc(100% + 6px); z-index: 1150; min-width: 240px;',
      '  background: #fff; border: 1px solid #dbe4ee; border-radius: 10px; box-shadow: 0 10px 28px rgba(15,23,42,.14); padding: 8px; }',
      '.scw-phn-more.is-open .scw-phn-panel { display: flex; flex-direction: column; gap: 2px; }',
      '.scw-phn-panel-head { font: 700 10px/1 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; padding: 6px 10px 6px; }',
      '.scw-phn-panel a.kn-link { display: block !important; height: auto !important; padding: 8px 10px !important; border-radius: 7px !important;',
      '  border: 0 !important; background: transparent !important; box-shadow: none !important; text-decoration: none !important;',
      '  font: 500 13px/1.3 system-ui, sans-serif !important; color: #334155 !important; white-space: normal; }',
      '.scw-phn-panel a.kn-link span { color: inherit !important; font: inherit !important; }',
      '.scw-phn-panel a.kn-link:hover { background: #f1f5f9 !important; }',
      '.scw-phn-panel a.kn-link.is-current { background: #e0ecf7 !important; color: #0f4c75 !important; font-weight: 700 !important; }',
      // ── Sticky bar ──
      '#' + BAR_ID + ' { position: fixed; top: 0; left: 0; right: 0; z-index: 9000; height: 48px; display: none; align-items: stretch;',
      '  gap: 14px; padding: 0 24px; background: #fff; border-bottom: 1px solid #dbe4ee; box-shadow: 0 2px 8px rgba(15,23,42,.08);',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '#' + BAR_ID + '.is-shown { display: flex; }',
      '#' + BAR_ID + ' .scw-phn-bar-pid { display: flex; align-items: center; gap: 8px; padding-right: 14px; border-right: 1px solid #e2e8f0; }',
      '#' + BAR_ID + ' .scw-phn-bar-eyebrow { font: 700 10px/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #64748b; }',
      '#' + BAR_ID + ' .scw-phn-bar-num { font: 800 16px/1 system-ui, sans-serif; letter-spacing: .02em; font-variant-numeric: tabular-nums; color: #0f172a; }',
      '#' + BAR_ID + ' .scw-phn-bar-title { display: inline-flex; align-items: center; font: 600 13px/1.2 system-ui, sans-serif; color: #334155;',
      '  max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '#' + BAR_ID + ' .scw-phn-bar-tabs { display: flex; align-items: stretch; margin-left: auto; }',
      '#' + BAR_ID + ' a.scw-phn-clone { height: 48px !important; padding: 0 12px !important; }',
      '#' + BAR_ID + ' .scw-phn-step { width: 18px; height: 18px; font-size: 10px !important; }',
      '@media (max-width: 900px) {',
      '  #' + BAR_ID + ' .scw-phn-bar-title { display: none; }',
      '  #' + STRIP_ID + ' a.kn-link { padding: 0 10px !important; }',
      '}',
      '@media print { #' + BAR_ID + ' { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Classification ──────────────────────────────────────────────────────
  function stageOf(a) {
    var l = labelOf(a);
    for (var i = 0; i < CONFIG.stages.length; i++) if (CONFIG.stages[i].match.test(l)) return CONFIG.stages[i];
    return null;
  }
  function isHome(a) { return CONFIG.home.test(labelOf(a)); }

  function cleanLabel(a) {
    var span = labelSpan(a);
    var t = norm(span.textContent);
    var clean = t.replace(CONFIG.prefixRe, '');
    if (clean !== t) span.textContent = clean;
  }

  function hashPath(href) {
    var i = String(href || '').indexOf('#');
    return i === -1 ? '' : href.slice(i + 1).replace(/^\/+|\/+$/g, '');
  }
  /** Current page = Knack's own active class, else the anchor whose hash
   *  path is the LONGEST prefix of the location hash (child pages of a
   *  stage still light that stage). */
  function markCurrent(anchors) {
    var here = (window.location.hash || '').replace(/^#/, '').replace(/\?.*$/, '').replace(/^\/+|\/+$/g, '');
    var best = null, bestLen = -1;
    anchors.forEach(function (a) {
      a.classList.remove('is-current'); a.removeAttribute('aria-current');
      var hp = hashPath(a.getAttribute('href'));
      var active = a.classList.contains('is-active') ||
        (a.parentElement && a.parentElement.tagName === 'LI' && a.parentElement.classList.contains('is-active'));
      if (active && bestLen < 1e9) { best = a; bestLen = 1e9; return; }
      if (hp && here && (here === hp || here.indexOf(hp + '/') === 0) && hp.length > bestLen) { best = a; bestLen = hp.length; }
    });
    if (best) { best.classList.add('is-current'); best.setAttribute('aria-current', 'page'); }
    return best;
  }

  // ── The strip ───────────────────────────────────────────────────────────
  function ensureStrip() {
    var strip = document.getElementById(STRIP_ID);
    if (strip) return strip;
    strip = document.createElement('nav');
    strip.id = STRIP_ID;
    strip.setAttribute('aria-label', 'Project pages');
    strip.innerHTML =
      '<div class="scw-phn-home"></div>' +
      '<div class="scw-phn-sep" hidden></div>' +
      '<div class="scw-phn-stages"></div>' +
      '<div class="scw-phn-spacer"></div>' +
      '<div class="scw-phn-more" hidden>' +
        '<button type="button" class="scw-phn-more-btn" aria-haspopup="true" aria-expanded="false">' +
          '<span>' + esc(CONFIG.moreLabel) + '</span>' + CHEV_SVG + '</button>' +
        '<div class="scw-phn-panel"><div class="scw-phn-panel-head">' + esc(CONFIG.moreHead) + '</div></div>' +
      '</div>';
    strip.querySelector('.scw-phn-more-btn').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var more = strip.querySelector('.scw-phn-more');
      var open = more.classList.toggle('is-open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return strip;
  }

  function decorate(a, stage) {
    cleanLabel(a);
    var span = labelSpan(a);
    if (stage) {
      var step = a.querySelector('.scw-phn-step');
      if (!step) {
        step = document.createElement('span');
        step.className = 'scw-phn-step';
        a.insertBefore(step, span === a ? a.firstChild : span);
      }
      step.textContent = String(stage.step);
    } else if (isHome(a) && !a.querySelector('.scw-phn-home-ic')) {
      var ic = document.createElement('span');
      ic.className = 'scw-phn-home-ic';
      ic.innerHTML = HOME_SVG;
      a.insertBefore(ic, span === a ? a.firstChild : span);
    }
  }

  /** Move the menu's anchors into the strip. Fresh anchors inside the view
   *  mean Knack rebuilt the menu: the ones we hold are stale and go. */
  function adoptAnchors(nav, strip) {
    var fresh = Array.prototype.slice.call(nav.querySelectorAll('a.kn-link'));
    var held  = Array.prototype.slice.call(strip.querySelectorAll('a.kn-link'));
    if (!fresh.length && !held.length) return [];
    _busy = true;
    try {
      if (fresh.length) {
        held.forEach(function (a) { if (a.parentNode) a.parentNode.removeChild(a); });
        held = [];
      }
      var all = fresh.length ? fresh : held;
      var home = strip.querySelector('.scw-phn-home');
      var stages = strip.querySelector('.scw-phn-stages');
      var more = strip.querySelector('.scw-phn-more');
      var panel = more.querySelector('.scw-phn-panel');
      var ordered = { home: [], stages: [], more: [] };
      all.forEach(function (a) {
        if (!labelOf(a)) return;   // not rendered yet
        var st = stageOf(a);
        if (st) ordered.stages.push({ a: a, step: st.step, st: st });
        else if (isHome(a)) ordered.home.push(a);
        else ordered.more.push(a);
      });
      ordered.stages.sort(function (x, y) { return x.step - y.step; });
      if (fresh.length) {
        ordered.home.forEach(function (a) { decorate(a, null); home.appendChild(a); });
        ordered.stages.forEach(function (x) { decorate(x.a, x.st); stages.appendChild(x.a); });
        ordered.more.forEach(function (a) { decorate(a, null); panel.appendChild(a); });
      }
      strip.querySelector('.scw-phn-sep').hidden = !(ordered.home.length && ordered.stages.length);
      more.hidden = !ordered.more.length;
      return all;
    } finally {
      setTimeout(function () { _busy = false; }, 0);
    }
  }

  // ── Mount: inside the hero when there is one, else a slim card ─────────
  function mountStrip(strip, nav) {
    var hero = document.getElementById('scw-pid-hero');
    var card = document.getElementById(CARD_ID);
    if (hero) {
      var foot = hero.querySelector('.scw-pid-foot');
      if (!foot) {
        foot = document.createElement('div');
        foot.className = 'scw-pid-foot';
        hero.appendChild(foot);
      }
      if (strip.parentNode !== foot) foot.appendChild(strip);
      hero.classList.add('scw-pid--nav');
      if (card && card.parentNode) card.parentNode.removeChild(card);
      return;
    }
    if (!card) {
      card = document.createElement('div');
      card.id = CARD_ID;
    }
    if (strip.parentNode !== card) card.appendChild(strip);
    if (card.parentNode !== nav.parentNode || card.nextSibling !== nav) {
      nav.parentNode.insertBefore(card, nav);
    }
  }

  // ── Adopt the project header card's top block into the hero ────────────
  function adoptHeaderTop() {
    var hero = document.getElementById('scw-pid-hero');
    if (!hero) return;
    var slot = hero.querySelector('.scw-pid-adopt');
    if (!slot) return;
    var card = document.querySelector('.scw-bsh-card');
    var top = card ? card.querySelector(':scope > .scw-bsh-top') : null;
    if (top) {
      // A rebuilt card carries a fresh top: swap it in for the one we hold.
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      slot.appendChild(top);
    }
    var held = slot.querySelector('.scw-bsh-top');
    hero.classList.toggle('scw-pid--adopted', !!held);
    if (held) {
      var title = held.querySelector('.scw-bsh-title');
      if (title) {
        var t = norm(title.textContent);
        var clean = t.replace(/\s*[-–—]\s*\d{9,13}\s*$/, '');
        if (clean && clean !== t) title.textContent = clean;
      }
    }
    if (card) {
      // Nothing left in the card (no survey tasks, no playbook) → fold it.
      var rest = card.querySelector(':scope > :not(.scw-bsh-top)');
      card.classList.toggle('scw-bsh-card--hollow', !rest && !card.querySelector(':scope > .scw-bsh-top'));
    }
  }

  // ── Sticky bar ──────────────────────────────────────────────────────────
  var _io = null;
  function mountBar(anchors, current) {
    var hero = document.getElementById('scw-pid-hero');
    var strip = document.getElementById(STRIP_ID);
    var bar = document.getElementById(BAR_ID);
    if (!strip || !anchors.length) { if (bar) bar.classList.remove('is-shown'); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.setAttribute('role', 'navigation');
      bar.setAttribute('aria-label', 'Project pages (pinned)');
      document.body.appendChild(bar);
    }
    var pid = hero ? (hero.getAttribute('data-scw-pid') || '') : '';
    var titleEl = document.querySelector('#scw-pid-hero .scw-bsh-title, #scw-pid-hero .scw-pid-title');
    var title = titleEl ? norm(titleEl.textContent) : '';
    var html = '';
    if (pid) {
      html += '<div class="scw-phn-bar-pid"><span class="scw-phn-bar-eyebrow">Project #</span>' +
        '<span class="scw-phn-bar-num">' + esc(pid) + '</span>' +
        '<button type="button" class="scw-pid-copy scw-pid-copy--sm" data-scw-pid-copy="' + esc(pid) + '" ' +
        'aria-label="Copy project number ' + esc(pid) + '" title="Copy project number">' + COPY_SVG + '</button></div>';
    }
    if (title) html += '<span class="scw-phn-bar-title" title="' + esc(title) + '">' + esc(title) + '</span>';
    html += '<div class="scw-phn-bar-tabs">';
    anchors.forEach(function (a) {
      if (a.closest('.scw-phn-panel')) return;   // legacy pages stay behind More
      var st = stageOf(a);
      html += '<a class="scw-phn-clone' + (a === current ? ' is-current' : '') + '" href="' + esc(a.getAttribute('href') || '#') + '">' +
        (st ? '<span class="scw-phn-step">' + st.step + '</span>' : '') +
        '<span>' + esc(labelOf(a)) + '</span></a>';
    });
    html += '</div>';
    if (bar.getAttribute('data-scw-sig') !== html) {
      bar.setAttribute('data-scw-sig', html);
      bar.innerHTML = html;
    }
    if (_io) { try { _io.disconnect(); } catch (e) { /* ignore */ } _io = null; }
    var watched = hero || strip;
    if (typeof IntersectionObserver === 'function') {
      _io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) bar.classList.toggle('is-shown', !entries[i].isIntersecting);
      }, { threshold: 0 });
      _io.observe(watched);
    }
  }
  function hideBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) bar.classList.remove('is-shown');
    if (_io) { try { _io.disconnect(); } catch (e) { /* ignore */ } _io = null; }
  }

  // ── Run ─────────────────────────────────────────────────────────────────
  function run() {
    var nav = document.getElementById(CONFIG.navView);
    if (!nav) { hideBar(); return; }
    injectCss();
    // The badge's own pill is replaced by the bar.
    if (window.SCW && SCW.projectId && SCW.projectId.CONFIG) SCW.projectId.CONFIG.stickyPill = false;
    var strip = ensureStrip();
    var anchors = adoptAnchors(nav, strip);
    if (!anchors.length) return;
    nav.classList.add(HIDE_CLS);
    mountStrip(strip, nav);
    adoptHeaderTop();
    var current = markCurrent(anchors);
    var more = strip.querySelector('.scw-phn-more');
    more.classList.toggle('has-current', !!(current && current.closest('.scw-phn-panel')));
    mountBar(anchors, current);
    watch(nav);
  }

  // Knack rebuilds the menu on navigation (new anchors inside the view) and
  // the header card rebuilds when its data changes: re-adopt on either.
  var _t = null;
  function soon(ms) { clearTimeout(_t); _t = setTimeout(function () { try { run(); } catch (e) { console.warn('[scw-project-header-nav]', e); } }, ms == null ? 50 : ms); }
  function watch(nav) {
    if (!nav.__scwPhnObs && typeof MutationObserver === 'function') {
      var obs = new MutationObserver(function () { if (!_busy) soon(50); });
      obs.observe(nav, { childList: true, subtree: true });
      nav.__scwPhnObs = obs;
    }
    var card = document.querySelector('.scw-bsh-card');
    if (card && !card.__scwPhnObs && typeof MutationObserver === 'function') {
      var obs2 = new MutationObserver(function () { soon(50); });
      obs2.observe(card, { childList: true });
      card.__scwPhnObs = obs2;
    }
  }

  // Close "More" on an outside click (bound once).
  document.addEventListener('click', function (e) {
    var more = document.querySelector('#' + STRIP_ID + ' .scw-phn-more.is-open');
    if (more && !more.contains(e.target)) {
      more.classList.remove('is-open');
      var b = more.querySelector('.scw-phn-more-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    }
  });

  injectCss();
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CONFIG.navView, function () { soon(50); }, NS);
  }
  if (window.$ && $(document).on) {
    $(document).off('knack-scene-render.any' + NS).on('knack-scene-render.any' + NS, function () { soon(100); });
    $(document).off('hashchange' + NS);
  }
  window.addEventListener('hashchange', function () { soon(0); });
  setTimeout(function () { soon(200); }, 0);

  window.SCW = window.SCW || {};
  SCW.projectHeaderNav = { CONFIG: CONFIG, refresh: function () { soon(0); } };
})();
/*** END PROJECT HEADER NAVIGATION *******************************************/
