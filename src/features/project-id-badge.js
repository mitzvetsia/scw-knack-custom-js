/*** PROJECT NUMBER BADGE — the HubSpot deal id, front and center ***********
 *
 * The "Project Number" is the project's HubSpot deal id (Project object
 * field_1622 — e.g. 60486704913). It is the number a tech quotes when they
 * call SCW tech support, so it has to be the FIRST thing on every page a
 * sub or tech works from, and the first thing on every document we hand
 * them. One shared component does it everywhere so it reads the same on
 * every surface:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ PROJECT #                          │ [Project name]          │
 *   │ 60486704913  [copy]                │ [Company] · [Site]      │
 *   │ Give this number to SCW tech …     │ SW1163  SW1829CO        │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Two variants: 'sub' (amber "give this number to tech support" line) and
 * 'ops' (quiet caption). A compact pill pins into the top-right corner once
 * the hero scrolls out, so the number stays on screen inside a long
 * worksheet. Documents get the same identity through SCW.projectId.banner()
 * / footer() — inline-styled fragments for the HTML→PDF pipeline.
 *
 * RESOLUTION — authoritative first, derived second, never a guess:
 *   1. field_1622 on any record a view on the scene has loaded (details view
 *      attributes, grid rows) or renders (`.kn-detail.field_1622`,
 *      `td.field_1622`).
 *   2. The deal id is also the PREFIX of every SOW identifier
 *      ("60486704913-SW1163 | name", field_2127 / field_2154 labels), every
 *      survey request id ("62610818596-SR168", field_2345) and the CO
 *      number. The first such token found in the scene's loaded records,
 *      then its rendered text, yields the number — flagged `derived`.
 *   3. Nothing → the badge says "not on this record" (never blank, never a
 *      wrong number).
 *
 * Builder: adding field_1622 as a column/detail on a view each scene loads
 * (view_4122 on the sub CO page, view_3825 on the sub survey page) makes the
 * read authoritative there; the derived path covers them until then.
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    dealField:    'field_1622',   // Project · HubSpot deal id
    projectName:  'field_4',      // Project · name (details views)
    sowProject:   'field_2119',   // SOW · Project (connection) — name through the SOW
    // Identifier fields whose display value is prefixed with the deal id.
    prefixedIdFields: ['field_2127', 'field_2154', 'field_2345', 'field_2123', 'field_2360'],
    // Scenes that get the hero. variant: 'sub' = tech/sub-facing copy.
    scenes: [
      { sceneId: 'scene_1353', variant: 'sub' },   // sub Deployment Dashboard
      { sceneId: 'scene_1374', variant: 'sub' },   // sub Manage Change Order
      { sceneId: 'scene_1140', variant: 'sub' },   // sub survey request / bid page
      { sceneId: 'scene_1311', variant: 'ops' },   // ops Manage Deployment
      { sceneId: 'scene_1362', variant: 'ops' },   // ops CO drafting
      { sceneId: 'scene_1085', variant: 'ops' },   // ops Build SOWs
      { sceneId: 'scene_1116', variant: 'ops' },   // sales Build SOW
      { sceneId: 'scene_1155', variant: 'ops' },   // Reconcile Bids
      { sceneId: 'scene_1096', variant: 'ops' }    // proposal preview
    ],
    // CO scenes: the right half names the change order (header form fields).
    coScenes: { scene_1374: 'view_4121', scene_1362: 'view_4092' },
    coNumberField: 'field_2123',
    coNameField:   'field_2126',
    coStatusField: 'field_2953',
    supportLine:   'Give this number to SCW tech support when you call.',
    opsLine:       'HubSpot deal id · the number techs quote to support',
    docLine:       'Reference this project number when contacting SCW support'
  };

  var HERO_ID   = 'scw-pid-hero';
  var STICKY_ID = 'scw-pid-sticky';
  var STYLE_ID  = 'scw-pid-css';
  var NS        = '.scwProjectId';
  var LOG       = '[scw-project-id]';

  // "60486704913-SW1163", "62610818596-SR168", "60486704913-SW1829CO"
  var PREFIXED_RE = /\b(\d{9,13})-(S[WR]\d{2,6}[A-Za-z]*)\b/;
  var DIGITS_RE   = /^\d{9,13}$/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // ── Resolution ──────────────────────────────────────────────────────────
  function sceneRoot(sceneId) { return document.getElementById('kn-' + sceneId); }

  /** Records loaded by every Knack view whose element sits inside the scene
   *  — details views (one attributes object) and grids (rows). */
  function sceneRecords(sceneId) {
    var out = [];
    var root = sceneRoot(sceneId);
    var views = window.Knack && Knack.views;
    if (!root || !views) return out;
    Object.keys(views).forEach(function (vk) {
      var el = document.getElementById(vk);
      if (!el || !root.contains(el)) return;
      var v = views[vk];
      var m = v && v.model;
      if (!m) return;
      if (m.attributes && typeof m.attributes === 'object') out.push(m.attributes);
      var rows = m.data && m.data.models;
      if (Array.isArray(rows)) {
        for (var i = 0; i < rows.length; i++) {
          var a = rows[i] && (rows[i].attributes || rows[i]);
          if (a) out.push(a);
        }
      }
    });
    return out;
  }

  function digitsOf(v) {
    if (v == null) return '';
    if (Array.isArray(v)) v = v[0] && (v[0].identifier || v[0].id || v[0]);
    if (v && typeof v === 'object') v = v.identifier || '';
    var s = stripHtml(v).replace(/[^\d]/g, '');
    return DIGITS_RE.test(s) ? s : '';
  }

  function prefixOf(v) {
    if (v == null) return '';
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) { var p = prefixOf(v[i]); if (p) return p; }
      return '';
    }
    if (typeof v === 'object') v = v.identifier || v.name || '';
    var m = PREFIXED_RE.exec(stripHtml(v));
    return m ? m[1] : '';
  }

  /** { id, source: 'field'|'derived'|'' } */
  function resolve(sceneId) {
    var recs = sceneRecords(sceneId);
    var root = sceneRoot(sceneId);
    var i, id;
    // 1. authoritative field on a loaded record
    for (i = 0; i < recs.length; i++) {
      id = digitsOf(recs[i][CONFIG.dealField + '_raw']) || digitsOf(recs[i][CONFIG.dealField]);
      if (id) return { id: id, source: 'field' };
    }
    // 1b. authoritative field rendered in the scene
    if (root) {
      var el = root.querySelector('.kn-detail.' + CONFIG.dealField + ' .kn-detail-body, td.' + CONFIG.dealField);
      id = el ? digitsOf(el.textContent) : '';
      if (id) return { id: id, source: 'field' };
    }
    // 2. derived from a prefixed identifier on a loaded record
    for (i = 0; i < recs.length; i++) {
      for (var f = 0; f < CONFIG.prefixedIdFields.length; f++) {
        var fk = CONFIG.prefixedIdFields[f];
        id = prefixOf(recs[i][fk + '_raw']) || prefixOf(recs[i][fk]);
        if (id) return { id: id, source: 'derived' };
      }
    }
    // 2b. derived from any prefixed identifier rendered in the scene
    if (root) {
      var hit = PREFIXED_RE.exec(root.textContent || '');
      if (hit) return { id: hit[1], source: 'derived' };
    }
    return { id: '', source: '' };
  }

  /** Best-effort project name for the right half. */
  function projectName(sceneId) {
    var recs = sceneRecords(sceneId);
    for (var i = 0; i < recs.length; i++) {
      var a = recs[i];
      var n = stripHtml(a[CONFIG.projectName]);
      if (n && !a[CONFIG.sowProject]) return n;
      var p = a[CONFIG.sowProject + '_raw'];
      if (Array.isArray(p) && p[0] && p[0].identifier) return stripHtml(p[0].identifier);
    }
    var root = sceneRoot(sceneId);
    var el = root && root.querySelector('.kn-detail.' + CONFIG.projectName + ' .kn-detail-body');
    return el ? stripHtml(el.textContent) : '';
  }

  /** Distinct SOW / survey identifiers on the scene (the "SW1163" part). */
  function identifierChips(sceneId) {
    var seen = Object.create(null), out = [];
    var recs = sceneRecords(sceneId);
    function take(v) {
      if (v == null) return;
      if (Array.isArray(v)) { v.forEach(take); return; }
      if (typeof v === 'object') v = v.identifier || v.name || '';
      var m = PREFIXED_RE.exec(stripHtml(v));
      if (m && !seen[m[2]]) { seen[m[2]] = 1; out.push(m[2]); }
    }
    for (var i = 0; i < recs.length && out.length < 6; i++) {
      for (var f = 0; f < CONFIG.prefixedIdFields.length; f++) {
        var fk = CONFIG.prefixedIdFields[f];
        take(recs[i][fk + '_raw']); take(recs[i][fk]);
      }
    }
    return out;
  }

  function coContext(sceneId) {
    var vk = CONFIG.coScenes[sceneId];
    if (!vk) return null;
    var viewEl = document.getElementById(vk);
    if (!viewEl) return null;
    function val(fk) {
      var wrap = viewEl.querySelector('#kn-input-' + fk);
      if (!wrap) return '';
      var ctl = wrap.querySelector('select, input, textarea');
      if (ctl && ctl.tagName === 'SELECT') {
        var opt = ctl.options[ctl.selectedIndex];
        return stripHtml(opt ? opt.textContent : ctl.value);
      }
      if (ctl && ctl.value != null && ctl.value !== '') return stripHtml(ctl.value);
      var clone = wrap.cloneNode(true);
      var strip = clone.querySelectorAll('label, p.kn-instructions');
      for (var i = 0; i < strip.length; i++) strip[i].parentNode.removeChild(strip[i]);
      return stripHtml(clone.textContent);
    }
    var root = sceneRoot(sceneId);
    var st = root && root.querySelector('.kn-detail.' + CONFIG.coStatusField + ' .kn-detail-body');
    return {
      number: val(CONFIG.coNumberField).replace(/^.*?(\d+)\s*$/, '$1'),
      name:   val(CONFIG.coNameField),
      status: st ? stripHtml(st.textContent) : ''
    };
  }

  // ── Markup ──────────────────────────────────────────────────────────────
  var COPY_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="20 6 9 17 4 12"></polyline></svg>';
  var PHONE_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 ' +
    '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 ' +
    '0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 ' +
    '2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';

  function copyButton(id, small) {
    if (!id) return '';
    return '<button type="button" class="scw-pid-copy' + (small ? ' scw-pid-copy--sm' : '') + '" ' +
      'data-scw-pid-copy="' + esc(id) + '" aria-label="Copy project number ' + esc(id) + '" ' +
      'title="Copy project number">' + COPY_SVG + '</button>';
  }

  function numberBlock(res, variant) {
    if (!res.id) {
      return '<div class="scw-pid-eyebrow">Project #</div>' +
        '<div class="scw-pid-none">not on this record</div>' +
        '<div class="scw-pid-hint">No HubSpot deal id on this project and no SOW or survey id to read it from.</div>';
    }
    var caption = variant === 'sub'
      ? '<div class="scw-pid-support">' + PHONE_SVG + '<span>' + esc(CONFIG.supportLine) + '</span></div>'
      : '<div class="scw-pid-hint">' + esc(CONFIG.opsLine) +
          (res.source === 'derived' ? ' · read from the SOW number' : '') + '</div>';
    return '<div class="scw-pid-eyebrow">Project #</div>' +
      '<div class="scw-pid-numrow">' +
        '<div class="scw-pid-num">' + esc(res.id) + '</div>' + copyButton(res.id) +
      '</div>' + caption;
  }

  function contextBlock(sceneId) {
    var co = coContext(sceneId);
    var name = projectName(sceneId);
    var chips = identifierChips(sceneId);
    var html = '';
    if (co && (co.number || co.name)) {
      html += '<div class="scw-pid-eyebrow">Change order</div>' +
        '<div class="scw-pid-corow">' +
          (co.number ? '<span class="scw-pid-conum">' + esc(co.number) + '</span>' : '') +
          (co.name ? '<span class="scw-pid-coname">' + esc(co.name) + '</span>' : '') +
          (co.status ? '<span class="scw-pid-status">' + esc(co.status) + '</span>' : '') +
        '</div>' +
        (name ? '<div class="scw-pid-sub">' + esc(name) + '</div>' : '');
    } else {
      if (name) html += '<div class="scw-pid-title">' + esc(name) + '</div>';
      if (chips.length) {
        html += '<div class="scw-pid-chips">' + chips.map(function (c) {
          return '<span class="scw-pid-chip">' + esc(c) + '</span>';
        }).join('') + '</div>';
      }
    }
    return html;
  }

  /** Inline-styled banner for documents (HTML → PDF). `opts.right` = lines
   *  for the right column, e.g. ['SOW SW1163', 'Proposal 20260612-10251'];
   *  `opts.phone` = support phone appended to the reference line. */
  function banner(id, opts) {
    opts = opts || {};
    var right = (opts.right || []).filter(Boolean).map(function (l) {
      return '<div>' + esc(l) + '</div>';
    }).join('');
    var num = id
      ? '<div style="font:800 28px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;' +
          'font-variant-numeric:tabular-nums;color:#0f172a;">' + esc(id) + '</div>'
      : '<div style="font:600 16px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;color:#94a3b8;">not on record</div>';
    return '<div class="scw-pid-banner" style="border-top:3px solid #0f4c75;border-bottom:1px solid #e2e8f0;' +
        'padding:12px 0 10px;margin:0 0 18px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;">' +
        '<div>' +
          '<div style="font:700 10px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;' +
            'color:#64748b;margin-bottom:5px;">Project #</div>' + num +
        '</div>' +
        (right ? '<div style="text-align:right;font:500 12px/1.5 system-ui,sans-serif;color:#475569;">' + right + '</div>' : '') +
      '</div>' +
      '<div style="margin-top:7px;font:500 12px/1.3 system-ui,sans-serif;color:#334155;">' +
        esc(opts.line || CONFIG.docLine) +
        (opts.phone ? ' · <b>' + esc(opts.phone) + '</b>' : '') +
      '</div>' +
    '</div>';
  }

  /** Inline-styled footer line for documents. */
  function footer(id, right) {
    if (!id) return '';
    return '<div class="scw-pid-footer" style="margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;' +
        'display:flex;justify-content:space-between;font:500 10.5px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;color:#64748b;">' +
      '<div><b style="color:#334155;">Project # ' + esc(id) + '</b>' + (right ? ' · ' + esc(right) : '') + '</div>' +
      '<div>SCW Installation Services</div>' +
    '</div>';
  }

  // ── CSS ─────────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + HERO_ID + ' { display: flex; align-items: stretch; gap: 28px; background: #fff;',
      '  border: 2px solid #124e85; border-radius: 12px; padding: 16px 24px; margin: 0 0 18px;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }',
      '#' + HERO_ID + ' .scw-pid-left { display: flex; flex-direction: column; gap: 5px; min-width: 300px; }',
      '#' + HERO_ID + ' .scw-pid-divider { width: 1px; background: #e2e8f0; align-self: stretch; }',
      '#' + HERO_ID + ' .scw-pid-right { display: flex; flex-direction: column; justify-content: center; gap: 6px; min-width: 0; flex: 1 1 auto; }',
      '.scw-pid-eyebrow { font: 700 11px/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #64748b; }',
      '.scw-pid-numrow { display: flex; align-items: center; gap: 12px; }',
      '.scw-pid-num { font: 800 36px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .02em;',
      '  font-variant-numeric: tabular-nums; color: #0f172a; white-space: nowrap; }',
      '.scw-pid-none { font: 600 18px/1.2 system-ui, sans-serif; color: #94a3b8; }',
      '.scw-pid-hint { font: 500 12px/1.3 system-ui, sans-serif; color: #64748b; }',
      '.scw-pid-support { display: flex; align-items: center; gap: 8px; margin-top: 2px;',
      '  font: 600 13.5px/1.3 system-ui, sans-serif; color: #b45309; }',
      '.scw-pid-copy { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;',
      '  border: 1px solid #cbd5e1 !important; border-radius: 8px !important; background: #fff !important; color: #0f4c75 !important;',
      '  padding: 0 !important; cursor: pointer; transition: background 100ms ease, color 100ms ease; }',
      '.scw-pid-copy:hover { background: #eaf2fb !important; border-color: #0f4c75 !important; }',
      '.scw-pid-copy--sm { width: 32px; height: 32px; border-radius: 999px !important; }',
      '.scw-pid-copy--sm svg { width: 15px; height: 15px; }',
      '.scw-pid-copy.is-copied { background: #dcfce7 !important; border-color: #86efac !important; color: #166534 !important; }',
      '.scw-pid-copied { display: inline-flex; align-items: center; gap: 4px; font: 700 11px/1 system-ui, sans-serif; }',
      '.scw-pid-title { font: 700 20px/1.25 system-ui, sans-serif; color: #0f172a; overflow-wrap: anywhere; }',
      '.scw-pid-sub { font: 500 13px/1.3 system-ui, sans-serif; color: #64748b; }',
      '.scw-pid-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }',
      '.scw-pid-chip { font: 700 11px/1.4 system-ui, sans-serif; padding: 3px 9px; border-radius: 999px;',
      '  background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; }',
      '.scw-pid-corow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }',
      '.scw-pid-conum { font: 700 22px/1 system-ui, sans-serif; color: #0f4c75; }',
      '.scw-pid-coname { font: 500 15px/1.3 system-ui, sans-serif; color: #334155; }',
      '.scw-pid-status { font: 700 11px/1.4 system-ui, sans-serif; padding: 3px 10px; border-radius: 999px;',
      '  background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; }',
      // Sticky pill — fixed top-right, shown once the hero scrolls out.
      '#' + STICKY_ID + ' { position: fixed; top: 10px; right: 16px; z-index: 9000; display: none;',
      '  align-items: center; gap: 10px; background: #fff; color: #0f172a; border-radius: 999px;',
      '  padding: 6px 8px 6px 14px; box-shadow: 0 2px 8px rgba(15, 23, 42, .18); border: 1px solid #cbd5e1;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '#' + STICKY_ID + '.is-shown { display: inline-flex; }',
      '#' + STICKY_ID + ' .scw-pid-eyebrow { font-size: 10px; }',
      '#' + STICKY_ID + ' .scw-pid-num { font-size: 17px; }',
      '@media (max-width: 860px) {',
      '  #' + HERO_ID + ' { flex-direction: column; gap: 12px; padding: 14px 16px; }',
      '  #' + HERO_ID + ' .scw-pid-divider { display: none; }',
      '  #' + HERO_ID + ' .scw-pid-left { min-width: 0; }',
      '  .scw-pid-num { font-size: 30px; }',
      '  #' + STICKY_ID + ' { right: 8px; }',
      '}',
      '@media print { #' + STICKY_ID + ' { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Mount ───────────────────────────────────────────────────────────────
  var _sig = {};

  function render(entry) {
    var root = sceneRoot(entry.sceneId);
    if (!root) return;
    injectCss();
    var res  = resolve(entry.sceneId);
    var html = '<div class="scw-pid-left">' + numberBlock(res, entry.variant) + '</div>';
    var ctx  = contextBlock(entry.sceneId);
    if (ctx) html += '<div class="scw-pid-divider"></div><div class="scw-pid-right">' + ctx + '</div>';

    var hero = document.getElementById(HERO_ID);
    if (!hero) {
      hero = document.createElement('section');
      hero.id = HERO_ID;
      hero.setAttribute('aria-label', 'Project number');
    }
    // Always the FIRST thing in the scene — other modules (deploy-page-nav)
    // prepend their own blocks, so re-pin on every pass.
    if (root.firstChild !== hero) root.insertBefore(hero, root.firstChild);
    var sig = entry.variant + '|' + html;
    if (_sig[entry.sceneId] !== sig) {
      _sig[entry.sceneId] = sig;
      hero.innerHTML = html;
      hero.setAttribute('data-scw-pid', res.id || '');
      hero.setAttribute('data-scw-pid-source', res.source || '');
    }
    mountSticky(res.id, hero);
  }

  var _io = null;
  function mountSticky(id, hero) {
    var pill = document.getElementById(STICKY_ID);
    if (!id) { if (pill) pill.classList.remove('is-shown'); return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = STICKY_ID;
      pill.setAttribute('role', 'status');
      document.body.appendChild(pill);
    }
    var inner = '<span class="scw-pid-eyebrow">Project #</span>' +
      '<span class="scw-pid-num">' + esc(id) + '</span>' + copyButton(id, true);
    if (pill.getAttribute('data-scw-pid') !== id) {
      pill.innerHTML = inner;
      pill.setAttribute('data-scw-pid', id);
    }
    if (_io) { try { _io.disconnect(); } catch (e) { /* ignore */ } _io = null; }
    if (typeof IntersectionObserver === 'function') {
      _io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          pill.classList.toggle('is-shown', !entries[i].isIntersecting);
        }
      }, { threshold: 0 });
      _io.observe(hero);
    }
  }

  function hideSticky() {
    var pill = document.getElementById(STICKY_ID);
    if (pill) pill.classList.remove('is-shown');
    if (_io) { try { _io.disconnect(); } catch (e) { /* ignore */ } _io = null; }
  }

  // Copy — clipboard API with a textarea fallback, "Copied" for 1.5s.
  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.scw-pid-copy[data-scw-pid-copy]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var id = btn.getAttribute('data-scw-pid-copy');
    copyText(id).then(function () {
      var prev = btn.innerHTML;
      btn.classList.add('is-copied');
      btn.innerHTML = '<span class="scw-pid-copied">' + CHECK_SVG +
        (btn.classList.contains('scw-pid-copy--sm') ? '' : '<span>Copied</span>') + '</span>';
      setTimeout(function () {
        btn.classList.remove('is-copied');
        btn.innerHTML = prev;
      }, 1500);
    });
  }, true);

  // Re-render on scene render AND as views land (details views populate
  // after the scene event). One debounced observer per mounted scene.
  var _obs = {};
  function watch(entry) {
    var root = sceneRoot(entry.sceneId);
    if (!root || _obs[entry.sceneId]) return;
    if (typeof MutationObserver !== 'function') return;
    var t = null;
    var mo = new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!document.getElementById('kn-' + entry.sceneId)) {
          mo.disconnect(); delete _obs[entry.sceneId]; delete _sig[entry.sceneId]; hideSticky();
          return;
        }
        try { render(entry); } catch (err) { console.warn(LOG, 'render failed', err); }
      }, 250);
    });
    mo.observe(root, { childList: true, subtree: true });
    _obs[entry.sceneId] = mo;
  }

  function onScene(entry) {
    return function () {
      try { render(entry); } catch (err) { console.warn(LOG, 'render failed', err); }
      watch(entry);
      // Another configured scene's observer may still be alive if Knack
      // swapped scenes without unmounting; the pill belongs to this one.
      setTimeout(function () { try { render(entry); } catch (e) { /* ignore */ } }, 600);
    };
  }

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    CONFIG.scenes.forEach(function (entry) {
      SCW.onSceneRender(entry.sceneId, onScene(entry), NS);
    });
  }
  // Any scene change: drop the pill until a configured scene renders again.
  if (window.$ && $(document).on) {
    $(document).off('knack-scene-render.any' + NS)
      .on('knack-scene-render.any' + NS, function (ev, scene) {
        var key = scene && scene.key;
        var mine = CONFIG.scenes.some(function (s) { return s.sceneId === key; });
        if (!mine) hideSticky();
      });
  }

  window.SCW = window.SCW || {};
  SCW.projectId = {
    CONFIG:   CONFIG,
    resolve:  resolve,
    prefixOf: prefixOf,
    banner:   banner,
    footer:   footer,
    refresh:  function (sceneId) {
      CONFIG.scenes.forEach(function (s) { if (!sceneId || s.sceneId === sceneId) render(s); });
    }
  };
})();
/*** END PROJECT NUMBER BADGE **********************************************/
