/*** DEPLOY PAGE NAV + CHANGE-ORDER RELOCATION (scene_1311) *******************
 *
 * Two structural fixes for the manage-deployment page, which reads as nine
 * co-equal accordion bars with no hierarchy:
 *
 *   1. STICKY SIGNPOST BAR — a compact pill nav pinned to the top of the
 *      scene: one pill per (visible) accordion section, plus "Install Items"
 *      (the v2 worksheet) and "Change Orders". Pills show the section's
 *      count badge and smooth-scroll to it on click (auto-expanding a
 *      collapsed accordion so the user never lands on a closed bar).
 *
 *   2. CHANGE ORDERS ← WORKSHEET — the Change Orders grid + "Create Change
 *      Order" CTA used to sit at the very bottom of the page, ~2000px from
 *      the install worksheet whose "Removed by CO" rows they explain. Both
 *      views are MOVED into a strip directly ABOVE the worksheet mount.
 *      Knack re-renders views in place by element id, so a relocated view
 *      keeps working; a scene re-render rebuilds everything and the
 *      debounced pass re-applies the move.
 *
 * View-id resilience: the CO grid and CTA are found by TITLE ("Change
 * Orders" grid header / a link whose text is "Create Change Order"), not
 * hardcoded view ids — Builder reshuffles won't silently break the move
 * (worst case: nothing matches and the page keeps its native order).
 ****************************************************************************/
(function () {
  'use strict';

  var SCENE_ID  = 'scene_1311';
  var NAV_ID    = 'scw-deploy-nav';
  var STRIP_ID  = 'scw-deploy-co-strip';
  var STYLE_ID  = 'scw-deploy-nav-css';
  var EVENT_NS  = '.scwDeployNav';
  var WORKSHEET_MOUNT = 'scw-ws-v2-view_4093';

  // Accordion sections excluded from the nav — the staging/data-source
  // sections slated for hiding ("MICAH'S SHIT" block), plus the (hidden)
  // worksheet source accordion, which the "Install Items" pill covers.
  // Matched on title.
  var EXCLUDE_TITLES = [
    /\(hide\)/i, /^DOC_/i, /^INSTALL_system setup/i, /^SOW_proposed/i,
    /^PHOTOS$/i, /^what we.?re installing/i
  ];

  // ── Lifecycle organization (Part 3) ───────────────────────────────────
  // Renames + one-line subtitles for the opaque section titles. Matched on
  // the ORIGINAL Builder title (stashed in data-scw-orig-title on first
  // touch so heartbeat passes stay idempotent).
  var SECTIONS = [
    { match: /^system setup questionnaire/i,
      sub: "Client's configuration preferences, captured at project start." },
    { match: /^acceptance$/i, rename: 'Agreements & Invoices',
      sub: 'Issued paperwork per SOW / proposal — agreement + invoice status.' },
    { match: /^closeout$/i, rename: 'Closeout Deliverables',
      sub: 'Documents required before closeout + Certificate of Completion.' }
  ];
  // Band dividers — thin uppercase signposts splitting the page into
  // lifecycle phases. Everything stays ABOVE the worksheet; Installation
  // (CO strip + worksheet) is always last.
  var BANDS = [
    { id: 'setup',   label: 'Project Setup',       find: /^system setup questionnaire/i },
    { id: 'paper',   label: 'Paperwork & Billing', find: /^acceptance$/i },
    { id: 'close',   label: 'Closeout',            find: /^closeout$/i },
    { id: 'ref',     label: 'Reference',           find: /^other files$/i },
    { id: 'install', label: 'Installation',        strip: true }
  ];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + NAV_ID + ' {',
      '  position: sticky; top: 0; z-index: 900;',
      '  width: 100%; max-width: 100%; box-sizing: border-box;',
      '  grid-column: 1 / -1; flex: 1 1 100%;',
      '  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;',
      '  background: rgba(255,255,255,0.97);',
      '  border: 1px solid #e2e8f0; border-radius: 10px;',
      '  box-shadow: 0 2px 10px rgba(15,23,42,0.07);',
      '  padding: 8px 10px; margin: 8px 0 12px;',
      '}',
      '#' + NAV_ID + '-label {',
      '  font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: 0.07em;',
      '  text-transform: uppercase; color: #94a3b8; margin: 0 4px 0 2px;',
      '}',
      '.scw-deploy-nav-item {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px; border-radius: 999px;',
      '  border: 1px solid #dbe4ee; background: #f8fafc; color: #0f4c81;',
      '  font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer;',
      '  white-space: nowrap;',
      '}',
      '.scw-deploy-nav-item:hover { background: #eaf1f7; border-color: #b6c9db; }',
      '.scw-deploy-nav-count {',
      '  background: #0f4c81; color: #fff; border-radius: 999px;',
      '  padding: 1px 7px; font-size: 10.5px; font-weight: 700;',
      '}',
      /* Attention dot — the section needs someone (e.g. unsigned acceptances) */
      '.scw-deploy-nav-dot {',
      '  width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;',
      '  flex: none;',
      '}',
      /* ── Reference tier — Other Files / Additional Photos demoted to a
         quieter visual weight so the page reads paperwork → work → reference. */
      '.scw-ktl-accordion.scw-acc-tier-ref {',
      '  box-shadow: none !important;',
      '  border-color: #e2e8f0 !important;',
      '  margin: 6px 0 !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-ktl-accordion__header {',
      '  background: #f8fafc !important;',
      '  padding-top: 8px !important; padding-bottom: 8px !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-acc-title {',
      '  color: #64748b !important; font-size: 13px !important;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-ref .scw-acc-icon { color: #94a3b8 !important; }',
      /* ── Lifecycle band dividers — signposts, not more boxes. Scene-level
         instances need the same layout-column escape as the CO strip. */
      '.scw-deploy-band {',
      '  width: 100% !important; max-width: 100% !important;',
      '  grid-column: 1 / -1 !important; flex: 1 1 100% !important;',
      '  box-sizing: border-box;',
      '  display: flex; align-items: center; gap: 10px;',
      '  margin: 22px 0 8px; padding: 0 2px;',
      '}',
      '.scw-deploy-band > span {',
      '  font: 700 11px/1 system-ui, sans-serif; letter-spacing: 0.1em;',
      '  text-transform: uppercase; color: #94a3b8; flex: none;',
      '}',
      '.scw-deploy-band::after {',
      '  content: ""; flex: 1; height: 1px; background: #e2e8f0;',
      '}',
      /* One-line section subtitle, inline after the accordion title */
      '.scw-deploy-acc-sub {',
      '  font-weight: 400; font-size: 12px; color: #64748b; margin-left: 8px;',
      '}',
      /* Phase rollup pill (questionnaire status / closeout docs) — same
         look as the acceptance "N awaiting signature" pill. */
      '.scw-deploy-rollup {',
      '  display: inline-flex; align-items: center;',
      '  margin-left: auto; margin-right: 8px; padding: 3px 10px;',
      '  border-radius: 999px; font: 700 11px/1.2 system-ui, sans-serif;',
      '  border: 1px solid transparent; white-space: nowrap;',
      '  max-width: 45%; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.scw-deploy-rollup--warn { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-deploy-rollup--ok   { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      /* Scroll targets clear the sticky bar */
      '.scw-ktl-accordion, #' + WORKSHEET_MOUNT + ', #' + STRIP_ID + ' {',
      '  scroll-margin-top: 58px;',
      '}',
      /* CO strip — sits directly ABOVE the worksheet it explains. It is
         injected as a direct child of the scene\'s group-layout-wrapper,
         which sizes its children as layout columns — force full width
         under either grid or flex layout, and un-column the relocated
         views inside it. */
      '#kn-' + SCENE_ID + ' > #' + STRIP_ID + ', #' + STRIP_ID + ' {',
      '  width: 100% !important; max-width: 100% !important;',
      '  grid-column: 1 / -1 !important; flex: 1 1 100% !important;',
      '  margin: 14px 0 10px;',
      '}',
      '#' + STRIP_ID + ' .kn-view {',
      '  width: 100% !important; max-width: 100% !important; float: none !important;',
      '}',
      /* ── Section action bar — THE consistent home for "buttons that
         pertain to a view": a slim right-aligned row at the TOP of the
         section\'s body (headers stay clean — status pills only). */
      '.scw-acc-actionbar {',
      '  display: flex; align-items: center; justify-content: flex-end;',
      '  gap: 8px; padding: 10px 12px 0;',
      '}',
      '.scw-acc-actionbar a.kn-button {',
      '  display: inline-flex; align-items: center;',
      '  padding: 6px 14px !important; border-radius: 8px !important;',
      '  background: #163C6E !important; border: 1px solid #163C6E !important;',
      '  color: #fff !important; font: 600 12.5px/1.2 system-ui, sans-serif !important;',
      '  text-decoration: none !important; white-space: nowrap; flex: none;',
      '}',
      '.scw-acc-actionbar a.kn-button:hover {',
      '  background: #1d4d8c !important; border-color: #1d4d8c !important;',
      '}',
      '.scw-acc-actionbar a.kn-button span { color: #fff !important; }',
      /* When the CO grid sits inside its accordion, the accordion bar is
         the title — hide the grid\'s own duplicate header. */
      '#' + STRIP_ID + ' .scw-ktl-accordion .kn-view .view-header h2.kn-title { display: none; }',
      '#' + STRIP_ID + ' .kn-view { margin-bottom: 8px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function sceneEl() {
    return document.getElementById('kn-' + SCENE_ID);
  }

  function txt(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  // ── Part 2: relocate Change Orders under the worksheet ────────────────
  function findCoGridView(scene) {
    var views = scene.querySelectorAll('.kn-view');
    for (var i = 0; i < views.length; i++) {
      var title = txt(views[i].querySelector('.view-header h2.kn-title'));
      if (/^change orders?$/i.test(title)) return views[i];
    }
    return null;
  }
  function findCoCtaView(scene) {
    var anchors = scene.querySelectorAll('.kn-view a');
    for (var i = 0; i < anchors.length; i++) {
      if (/create change order/i.test(txt(anchors[i]))) {
        return anchors[i].closest('.kn-view');
      }
    }
    return null;
  }

  function moveChangeOrders(scene) {
    var anchor = document.getElementById(WORKSHEET_MOUNT);
    if (!anchor || !anchor.parentNode) return;

    // Bare positioning container — the CO grid's own accordion bar is the
    // section title, and the CTA lives in that bar's action slot.
    var strip = document.getElementById(STRIP_ID);
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
    }
    // Keep the strip pinned directly BEFORE the worksheet mount — the CO
    // records explain the worksheet's Removed-by-CO rows, and with 15+
    // expanded cards "after the worksheet" reads as the bottom of the page.
    if (strip.nextElementSibling !== anchor) {
      anchor.parentNode.insertBefore(strip, anchor);
    }

    var grid = findCoGridView(scene);
    if (grid && grid.parentNode !== strip) strip.appendChild(grid);
  }

  // ── Part 3: lifecycle organization — rename, subtitle, reorder, band ──
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }
  function origTitle(acc) {
    return acc.getAttribute('data-scw-orig-title') ||
           txt(acc.querySelector('.scw-acc-title'));
  }
  function findAcc(scene, re) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      if (re.test(origTitle(accs[i]))) return accs[i];
    }
    return null;
  }

  function applyNames(scene) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var acc = accs[i], ot = origTitle(acc), sec = null;
      for (var s = 0; s < SECTIONS.length; s++) {
        if (SECTIONS[s].match.test(ot)) { sec = SECTIONS[s]; break; }
      }
      if (!sec) continue;
      if (!acc.hasAttribute('data-scw-orig-title')) {
        acc.setAttribute('data-scw-orig-title', ot);
      }
      var name = sec.rename || ot;
      acc.setAttribute('data-scw-nav-label', name);
      var titleEl = acc.querySelector('.scw-acc-title');
      if (!titleEl) continue;
      var want = esc(name) +
        (sec.sub ? '<span class="scw-deploy-acc-sub">' + esc(sec.sub) + '</span>' : '');
      if (titleEl.innerHTML !== want) titleEl.innerHTML = want;
    }
  }

  // Physical order: the questionnaire (project SETUP) reads before the
  // acceptance paperwork it precedes in real life. One move; everything
  // else already sits above the worksheet.
  function reorderSections(scene) {
    var q = findAcc(scene, /^system setup questionnaire/i);
    var a = findAcc(scene, /^acceptance$/i);
    if (!q || !a || !a.parentNode) return;
    if (a.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING) {
      a.parentNode.insertBefore(q, a);
    }
  }

  function applyBands(scene) {
    for (var i = 0; i < BANDS.length; i++) {
      var b = BANDS[i], target = null;
      if (b.strip) {
        target = document.getElementById(STRIP_ID) ||
                 document.getElementById(WORKSHEET_MOUNT);
      } else {
        var acc = findAcc(scene, b.find);
        if (acc && acc.style.display !== 'none' && acc.offsetParent) target = acc;
      }
      var el = document.getElementById('scw-deploy-band-' + b.id);
      if (!target || !target.parentNode) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.id = 'scw-deploy-band-' + b.id;
        el.className = 'scw-deploy-band';
        el.innerHTML = '<span>' + esc(b.label) + '</span>';
      }
      if (el.nextElementSibling !== target) {
        target.parentNode.insertBefore(el, target);
      }
    }
  }

  // ── Part 6: section action bars — one consistent home for the buttons
  // that pertain to a view: a slim right-aligned row at the top of the
  // section's BODY (headers stay clean). The closeout toolbar already
  // follows this pattern natively (its module mounts it under the view
  // header inside the accordion body).
  function placeViewActions(scene) {
    // Change Orders: compact proxy button in an action bar at the top of
    // the CO accordion's body, mirroring the live href/label of the
    // view_4081 menu link (the view itself is hidden in place — moving a
    // Knack view element around risks losing it to re-renders).
    var strip = document.getElementById(STRIP_ID);
    var coAcc = (strip && strip.querySelector('.scw-ktl-accordion')) ||
                findAcc(scene, /^change orders?$/i);
    var body = coAcc && coAcc.querySelector('.scw-ktl-accordion__body');
    var ctaView = findCoCtaView(scene);
    var src = ctaView && ctaView.querySelector('a.kn-link');
    if (body && src) {
      var bar = document.getElementById('scw-deploy-co-actionbar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'scw-deploy-co-actionbar';
        bar.className = 'scw-acc-actionbar';
      }
      if (bar.parentNode !== body || body.firstElementChild !== bar) {
        body.insertBefore(bar, body.firstChild);
      }
      var btn = document.getElementById('scw-deploy-co-cta');
      if (!btn) {
        btn = document.createElement('a');
        btn.id = 'scw-deploy-co-cta';
        btn.className = 'kn-button';
      }
      if (btn.parentNode !== bar) bar.appendChild(btn);
      if (btn.getAttribute('href') !== src.getAttribute('href')) {
        btn.setAttribute('href', src.getAttribute('href'));
      }
      var label = txt(src) || 'Create Change Order';
      if (btn.textContent !== label) {
        btn.innerHTML = '<span>' + esc(label) + '</span>';
      }
      ctaView.style.setProperty('display', 'none', 'important');
    }
  }

  // ── Part 5: phase rollups — questionnaire status + closeout docs ──────
  function upsertRollup(acc, text, warn) {
    var head = acc.querySelector('.scw-ktl-accordion__header');
    if (!head) return;
    var roll = head.querySelector('.scw-deploy-rollup');
    if (!text) {
      if (roll && roll.parentNode) roll.parentNode.removeChild(roll);
      acc.removeAttribute('data-scw-attention');
      return;
    }
    if (!roll) {
      roll = document.createElement('span');
      var countEl = head.querySelector('.scw-acc-count');
      if (countEl) head.insertBefore(roll, countEl);
      else head.appendChild(roll);
    }
    roll.className = 'scw-deploy-rollup scw-deploy-rollup--' + (warn ? 'warn' : 'ok');
    if (roll.textContent !== text) roll.textContent = text;
    if (warn) acc.setAttribute('data-scw-attention', '');
    else acc.removeAttribute('data-scw-attention');
  }

  // Questionnaire STATUS (field_1772) — may not be a column on view_4015,
  // so scan every loaded model for it (same trick as the deploy audit).
  function questionnaireStatus() {
    try {
      var views = (typeof Knack !== 'undefined' && Knack.views) || {};
      var sawRecord = false;
      for (var vid in views) {
        var v = views[vid];
        var models = v && v.model && v.model.data && v.model.data.models;
        if (vid === 'view_4015' && models && models.length) sawRecord = true;
        if (!models) continue;
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && models[i].attributes;
          if (!a || a.field_1772 == null) continue;
          var s = String(a.field_1772).replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ').trim();
          if (!s || s.indexOf('[object') === 0) continue;
          return { text: s, warn: /pending|await|not started|in progress|draft|sent/i.test(s) };
        }
      }
      if (sawRecord) return null;              // record exists, status unknown
      return { text: 'Not started', warn: true };
    } catch (e) { return null; }
  }

  function applyRollups(scene) {
    var q = findAcc(scene, /^system setup questionnaire/i);
    if (q) {
      var st = questionnaireStatus();
      upsertRollup(q, st && st.text, !!(st && st.warn));
    }
    // Closeout — read the deliverable cards' state classes (three-tier
    // model from closeout-deliverables.js): a required doc is DONE only
    // when its file is in AND QA passed.
    var c = findAcc(scene, /^closeout$/i);
    if (c) {
      var total = c.querySelectorAll('.scw-cd-doc').length;
      if (total) {
        var missing   = c.querySelectorAll('.scw-cd-doc.is-no-file:not(.is-optional)').length;
        var qaFail    = c.querySelectorAll('.scw-cd-doc.is-qa-fail').length;
        var qaPending = c.querySelectorAll('.scw-cd-doc.is-qa-pending').length;
        var parts = [];
        if (missing)   parts.push(missing + ' missing');
        if (qaFail)    parts.push(qaFail + ' QA failed');
        if (qaPending) parts.push(qaPending + ' QA pending');
        upsertRollup(c,
          parts.length ? parts.join(' · ') : 'all required docs QA passed',
          parts.length > 0);
      }
    }
  }

  // ── Part 1: sticky signpost bar ───────────────────────────────────────
  function excluded(title) {
    for (var i = 0; i < EXCLUDE_TITLES.length; i++) {
      if (EXCLUDE_TITLES[i].test(title)) return true;
    }
    return false;
  }

  function collectTargets(scene) {
    var out = [];
    // Accordion sections, document order. Skip hidden ones (e.g. the
    // Manage MDFs/IDFs section mdf-notes.js folded into the worksheet).
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var acc = accs[i];
      if (acc.style.display === 'none' || !acc.offsetParent) continue;
      // Inside the CO strip? Its section pill is the strip itself.
      if (acc.closest('#' + STRIP_ID)) continue;
      // Exclude on the ORIGINAL title (renames don't dodge exclusion);
      // label with the renamed name, sans subtitle.
      var ot = origTitle(acc);
      var title = acc.getAttribute('data-scw-nav-label') ||
                  txt(acc.querySelector('.scw-acc-title'));
      if (!title || excluded(ot || title)) continue;
      out.push({
        label: title,
        count: txt(acc.querySelector('.scw-acc-count')),
        el:    acc,
        kind:  'accordion',
        warn:  acc.hasAttribute('data-scw-attention')
      });
    }
    // Change Orders strip (post-move, sits above the worksheet) — count =
    // grid data rows.
    var strip = document.getElementById(STRIP_ID);
    if (strip && strip.querySelector('.kn-view')) {
      var rows = strip.querySelectorAll('tbody tr[id]').length;
      out.push({ label: 'Change Orders', count: rows ? String(rows) : '', el: strip, kind: 'co' });
    }
    // Install worksheet.
    var ws = document.getElementById(WORKSHEET_MOUNT);
    if (ws) {
      var m = txt(ws.querySelector('.scw-ws-v2-count')).match(/\d+/);
      out.push({ label: 'Install Items', count: m ? m[0] : '', el: ws, kind: 'worksheet' });
    }
    return out;
  }

  function scrollToTarget(t) {
    // Collapsed accordion → expand first so the user never lands on a
    // closed bar (our header forwards to the toggle).
    if (t.kind === 'accordion' && !t.el.classList.contains('is-expanded')) {
      var head = t.el.querySelector('.scw-ktl-accordion__header');
      if (head) head.click();
    }
    try { t.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { t.el.scrollIntoView(); }
  }

  function buildNav(scene) {
    var targets = collectTargets(scene);
    if (targets.length < 2) return;

    // Anchor the bar INTO the page flow, directly above the first section it
    // indexes (not at the very top of the scene, where it floats detached
    // above the page menu + title). position:sticky keeps it pinned once the
    // user scrolls past it.
    var firstAcc = null;
    for (var fa = 0; fa < targets.length; fa++) {
      if (targets[fa].kind === 'accordion') { firstAcc = targets[fa].el; break; }
    }
    // Anchor directly before the accordion ELEMENT, not its .view-group —
    // the group can also contain the project-details header, which should
    // stay above the nav. Step back over any band divider so the nav sits
    // above the first signpost (and the two inserts don't fight).
    var anchorEl = firstAcc || scene.firstChild;
    while (anchorEl && anchorEl.previousElementSibling &&
           anchorEl.previousElementSibling.classList &&
           anchorEl.previousElementSibling.classList.contains('scw-deploy-band')) {
      anchorEl = anchorEl.previousElementSibling;
    }

    var nav = document.getElementById(NAV_ID);
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = NAV_ID;
      nav.setAttribute('aria-label', 'Page sections');
    }
    if (anchorEl && nav.nextElementSibling !== anchorEl && anchorEl.parentNode) {
      anchorEl.parentNode.insertBefore(nav, anchorEl);
    } else if (!nav.parentNode) {
      scene.insertBefore(nav, scene.firstChild);
    }

    // Rebuild pills only when the signature changed — keeps the heartbeat
    // rebuild from thrashing the DOM (and hover states) every pass.
    var sig = targets.map(function (t) {
      return t.label + ':' + t.count + (t.warn ? '!' : '');
    }).join('|');
    if (nav.getAttribute('data-scw-sig') === sig) return;
    nav.setAttribute('data-scw-sig', sig);

    nav.innerHTML = '<span id="' + NAV_ID + '-label">On this page</span>';
    for (var i = 0; i < targets.length; i++) {
      (function (t) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-deploy-nav-item';
        btn.innerHTML =
          (t.warn ? '<span class="scw-deploy-nav-dot" title="Needs attention"></span>' : '') +
          '<span>' + t.label.replace(/[&<>]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
          }) + '</span>' + (t.count ? '<span class="scw-deploy-nav-count">' + t.count + '</span>' : '');
        btn.addEventListener('click', function () { scrollToTarget(t); });
        nav.appendChild(btn);
      })(targets[i]);
    }
  }

  // ── Part 4: demote reference sections to a quieter tier ───────────────
  var REF_TITLES = [/^other files$/i, /^additional photos$/i];
  function applyReferenceTier(scene) {
    var accs = scene.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accs.length; i++) {
      var title = txt(accs[i].querySelector('.scw-acc-title'));
      var isRef = false;
      for (var r = 0; r < REF_TITLES.length; r++) {
        if (REF_TITLES[r].test(title)) { isRef = true; break; }
      }
      accs[i].classList.toggle('scw-acc-tier-ref', isRef);
    }
  }

  // ── Orchestration ─────────────────────────────────────────────────────
  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var scene = sceneEl();
      if (!scene) return;
      injectStyles();
      try { moveChangeOrders(scene); } catch (e) { /* keep native order */ }
      try { applyNames(scene); } catch (e) { /* labels are cosmetic */ }
      try { reorderSections(scene); } catch (e) { /* keep native order */ }
      try { applyBands(scene); } catch (e) { /* signposts are cosmetic */ }
      try { applyReferenceTier(scene); } catch (e) { /* cosmetic only */ }
      try { applyRollups(scene); } catch (e) { /* rollups are optional */ }
      try { placeViewActions(scene); } catch (e) { /* actions stay put */ }
      try { buildNav(scene); } catch (e) { /* nav is optional chrome */ }
    }, delay == null ? 250 : delay);
  }

  $(document).on('knack-scene-render.' + SCENE_ID + EVENT_NS, function () {
    scheduleApply(150);
  });
  $(document).on('knack-view-render.any' + EVENT_NS, function () {
    if (sceneEl()) scheduleApply(250);
  });
  // Heartbeat — counts drift as grids refetch; the sig check makes a
  // no-change pass nearly free.
  setInterval(function () { if (sceneEl()) scheduleApply(0); }, 3000);
})();
/*** END DEPLOY PAGE NAV + CHANGE-ORDER RELOCATION ****************************/
