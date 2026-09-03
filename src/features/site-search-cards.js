/*** FEATURE: SITE SEARCH → COMPANY / SITE / PROJECT CARDS ********************
 *
 * view_2604 ("Search Sites by name, client, address", team-calendar scene)
 * returns one dense grid ROW per SITE with every project-level column
 * <br>-stacked. This module rebuilds the results around the real
 * hierarchy:
 *
 *   COMPANY (client) — stated ONCE even when many sites share it
 *     └─ SITE — nickname (→ Site Dashboard), address
 *          ├─ status group: e.g. "Project Greenlit (1)"
 *          │    └─ one-column PROJECT cards — name (→ project dashboard),
 *          │      type, HubSpot Deal + ClickUp Task links
 *          ├─ … more status groups (ordered: in-flight → pipeline → done)
 *          └─ "Service Calls (n)" — stripped-down cards, one per WO
 *             (→ closeout page)
 *
 * Grouping is single-column by design; the status GROUP header carries the
 * status (tinted like the old pill), so cards don't repeat it.
 *
 * ── The correlation trick (why per-project data is reliable) ─────────
 * Every project-level connection value renders as
 *   <span id="<projectRecordId>" data-kn="connection-value">…</span>
 * so a project's status / type / CU id / deal id are matched BY RECORD ID
 * across columns — never by list position. A project missing a value
 * (e.g. no Project Type) simply has no span in that cell.
 *
 * LINK SCHEMAS (portal/team ids are app-level constants):
 *   HubSpot deal:    https://app.hubspot.com/contacts/5417380/record/0-3/<dealId>
 *   ClickUp task:    https://app.clickup.com/t/8530675/<taskId>
 *   HubSpot company: field_1481 already renders a full anchor — reused as-is.
 *
 * The native results table is hidden (CSS on the marked view only); the
 * search form, entries summary and pagination stay live. Every search /
 * page / sort re-fires knack-view-render → idempotent full rebuild.
 ****************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    views: ['view_2604'],
    fields: {
      client:      'field_1258',  // connection → client (span CLASS = client id)
      siteName:    'field_1256',  // plain text
      siteAddress: 'field_1257',  // text with <br> line breaks
      projects:    'field_4',     // connections → project-dashboard links
      serviceCall: 'field_1350',  // connections → closeout WO links
      projectType: 'field_323',   // per-project (span id = project id)
      status:      'field_45',    // per-project (span id = project id)
      hsCompany:   'field_1481',  // renders a full hubspot.com anchor
      cuTask:      'field_1199',  // per-project ClickUp task id
      hsDealId:    'field_1622'   // per-project HubSpot deal id
    },
    // Extra per-SERVICE-CALL columns (id-correlated: the column's spans
    // carry the WO record id, exactly like the project columns). Fill in
    // as the Builder columns land, e.g.
    //   { field: 'field_XXXX', label: 'Status' },
    //   { field: 'field_YYYY', label: 'Scheduled' },
    scMeta: [],
    hubspotDealUrl: 'https://app.hubspot.com/contacts/5417380/record/0-3/',
    clickupUrl:     'https://app.clickup.com/t/8530675/'
  };

  // Session memory for group toggles — keyed siteId|group label, survives
  // re-renders (every search re-fires knack-view-render) but resets on a
  // fresh page load so the defaults reapply.
  var _collapsed = Object.create(null);

  var STYLE_ID = 'scw-site-search-cards-css';
  var NS       = '.scwSiteSearchCards';
  var MARK     = 'data-scw-site-cards';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  // ── Styles ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '[' + MARK + '] .kn-table-wrapper { display: none !important; }',

      // Company block — one per client, however many sites matched.
      '.scw-ssc-co {',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;',
      '  padding: 0; margin: 12px 0; overflow: hidden;',
      '  font: 400 12.5px/1.45 system-ui, -apple-system, sans-serif; color: #334155;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,0.05);',
      '}',
      '.scw-ssc-co-head {',
      '  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
      '  padding: 12px 16px; background: #0f4c75;',
      '  cursor: pointer; user-select: none;',
      '}',
      '.scw-ssc-co-head .scw-ssc-caret { color: rgba(255,255,255,0.75); }',
      '.scw-ssc-co-head.is-collapsed .scw-ssc-caret { transform: rotate(-90deg); }',
      '.scw-ssc-co-body[hidden] { display: none !important; }',
      '.scw-ssc-co-name {',
      '  flex: 1 1 auto; min-width: 160px;',
      '  font: 700 15px/1.3 system-ui, -apple-system, sans-serif; color: #fff;',
      '  overflow-wrap: anywhere;',
      '}',

      // Site section inside a company block.
      '.scw-ssc-site { padding: 12px 16px 14px; }',
      '.scw-ssc-site + .scw-ssc-site { border-top: 1px solid #e2e8f0; }',
      '.scw-ssc-site-head {',
      '  display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;',
      '}',
      '.scw-ssc-site-id { flex: 1 1 auto; min-width: 220px; }',
      '.scw-ssc-site-name {',
      '  font: 700 14px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '  overflow-wrap: anywhere;',
      '}',
      '.scw-ssc-site-name a { color: #0f4c75; text-decoration: none; }',
      '.scw-ssc-site-name a:hover { text-decoration: underline; }',
      '.scw-ssc-site-sub { color: #64748b; margin-top: 1px; overflow-wrap: anywhere; }',
      '.scw-ssc-site-links { flex: 0 0 auto; display: flex; gap: 6px; flex-wrap: wrap; }',

      // Section bands — the KIND-level signposts inside a site: PROJECTS
      // (slate/blue, briefcase) vs SERVICE CALLS (teal, wrench). Heavier
      // than the status-group pills nested beneath, and collapsible.
      '.scw-ssc-sec {',
      '  display: flex; align-items: center; gap: 8px; margin: 14px 0 8px;',
      '  padding: 7px 10px; border-radius: 8px; cursor: pointer; user-select: none;',
      '  font: 700 11.5px/1.2 system-ui, sans-serif; letter-spacing: 0.07em;',
      '  text-transform: uppercase;',
      '}',
      '.scw-ssc-sec .scw-ssc-caret { color: currentColor; opacity: 0.6; }',
      '.scw-ssc-sec.is-collapsed .scw-ssc-caret { transform: rotate(-90deg); }',
      '.scw-ssc-sec-ic { display: inline-flex; }',
      '.scw-ssc-sec-ic svg { width: 13px; height: 13px; }',
      '.scw-ssc-sec-count { font-weight: 600; opacity: 0.75; }',
      '.scw-ssc-sec--proj { background: #eef2f7; color: #0f4c75; border: 1px solid #dbe3ea; }',
      '.scw-ssc-sec--sc { background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; }',
      // Nesting rail under each band so the contents read as belonging to it.
      '.scw-ssc-sec-body {',
      '  padding-left: 12px; border-left: 2px solid #e2e8f0; margin-left: 5px;',
      '}',
      '.scw-ssc-sec-body--sc { border-left-color: #a5f3fc; }',
      '.scw-ssc-sec-body[hidden] { display: none !important; }',
      '.scw-ssc-sec-body .scw-ssc-group:first-child { margin-top: 6px; }',
      '.scw-ssc-sec-body > .scw-ssc-list { margin-top: 6px; }',

      // Status group header — a collapsible toggle, tinted like the old
      // status pill; the cards beneath don't repeat the status.
      '.scw-ssc-group {',
      '  display: flex; align-items: center; gap: 8px; margin: 12px 0 6px;',
      '  cursor: pointer; user-select: none;',
      '}',
      '.scw-ssc-caret {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 14px; height: 14px; flex: 0 0 auto; color: #94a3b8;',
      '  transition: transform 0.15s ease;',
      '}',
      '.scw-ssc-caret svg { width: 12px; height: 12px; }',
      '.scw-ssc-group.is-collapsed .scw-ssc-caret { transform: rotate(-90deg); }',
      '.scw-ssc-group-lbl {',
      '  display: inline-flex; align-items: center; padding: 3px 10px;',
      '  border-radius: 999px; white-space: nowrap;',
      '  font: 600 11px/1.2 system-ui, sans-serif;',
      '  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;',
      '}',
      '.scw-ssc-group-lbl--green { background: #dcfce7; color: #15803d; border-color: #86efac; }',
      '.scw-ssc-group-lbl--blue { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }',
      '.scw-ssc-group-lbl--amber { background: #fef3c7; color: #b45309; border-color: #fcd34d; }',
      '.scw-ssc-group-lbl--red { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }',
      '.scw-ssc-group-rule { flex: 1 1 auto; height: 1px; background: #e2e8f0; }',
      '.scw-ssc-list[hidden] { display: none !important; }',

      // One-column card list.
      '.scw-ssc-list { display: flex; flex-direction: column; gap: 6px; }',
      '.scw-ssc-card {',
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  border-left: 4px solid #295f91; padding: 9px 12px;',
      '  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0;',
      '}',
      '.scw-ssc-card-main { flex: 1 1 260px; min-width: 0; }',
      '.scw-ssc-name {',
      '  font: 700 13px/1.35 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '  overflow-wrap: anywhere;',
      '}',
      '.scw-ssc-name a { color: #0f4c75; text-decoration: none; }',
      '.scw-ssc-name a:hover { text-decoration: underline; }',
      // Muted meta line (project type, SC meta/notes) — clamped to two
      // lines so a long note can never take over the page; the full text
      // rides in the title tooltip.
      '.scw-ssc-type {',
      '  color: #64748b; font-size: 12px; margin-top: 1px;',
      '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;',
      '  overflow: hidden; overflow-wrap: anywhere;',
      '}',
      '.scw-ssc-links { flex: 0 0 auto; display: flex; gap: 6px; flex-wrap: wrap; }',

      // Service-call card — deliberately stripped down.
      '.scw-ssc-card--sc {',
      '  border-left-color: #0e7490; background: #f8fdfe; padding: 7px 12px;',
      '}',
      '.scw-ssc-sc-tag {',
      '  display: inline-flex; align-items: center; padding: 2px 8px;',
      '  border-radius: 999px; font: 600 10.5px/1.2 system-ui, sans-serif;',
      '  background: #cffafe; color: #0e7490; border: 1px solid #a5f3fc;',
      '  white-space: nowrap;',
      '}',

      // Link chips — HubSpot orange, ClickUp purple, neutral otherwise.
      '.scw-ssc-chip {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 10px; border-radius: 6px; text-decoration: none;',
      '  font: 600 11.5px/1.2 system-ui, sans-serif; white-space: nowrap;',
      '  background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;',
      '}',
      '.scw-ssc-chip:hover { text-decoration: none; filter: brightness(0.96); }',
      '.scw-ssc-chip--hs { background: #fff1eb; color: #d3502a; border-color: #fdd4c2; }',
      '.scw-ssc-chip--cu { background: #efecfd; color: #5a48d6; border-color: #d6cffb; }',
      // Chips on the dark company header keep contrast.
      '.scw-ssc-co-head .scw-ssc-chip {',
      '  background: rgba(255,255,255,0.12); color: #e0f2fe;',
      '  border-color: rgba(255,255,255,0.25);',
      '}',
      '.scw-ssc-co-head .scw-ssc-chip--hs { background: #fff1eb; color: #d3502a; border-color: #fdd4c2; }',

      '.scw-ssc-noproj { color: #94a3b8; font-style: italic; margin-top: 8px; }',
      '.scw-ssc-empty { color: #64748b; margin: 10px 2px; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Cell readers ──────────────────────────────────────────────────────
  function cellFor(tr, fk) {
    return tr.querySelector('td.' + fk) ||
           tr.querySelector('td[data-field-key="' + fk + '"]');
  }
  function cellText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cellTextWithBreaks(td) {
    if (!td) return '';
    var html = td.innerHTML
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]*>/g, ' ');
    var el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ')
      .replace(/(\s*,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim();
  }
  function valuesById(td) {
    var map = Object.create(null);
    if (!td) return map;
    var spans = td.querySelectorAll('span[data-kn="connection-value"][id]');
    for (var i = 0; i < spans.length; i++) {
      var id = (spans[i].id || '').trim();
      var t  = (spans[i].textContent || '').trim();
      if (id && t) map[id] = t;
    }
    return map;
  }
  function linksIn(td) {
    var out = [];
    if (!td) return out;
    var as = td.querySelectorAll('a[data-kn="connection-link"]');
    for (var i = 0; i < as.length; i++) {
      var span = as[i].querySelector('span[data-kn="connection-value"]');
      out.push({
        id:    span ? (span.id || span.className || '').trim() : '',
        label: (as[i].textContent || '').trim(),
        href:  as[i].getAttribute('href') || ''
      });
    }
    if (!out.length) {
      var spans = td.querySelectorAll('span[data-kn="connection-value"]');
      for (var j = 0; j < spans.length; j++) {
        var t = (spans[j].textContent || '').trim();
        if (t) out.push({ id: (spans[j].id || '').trim(), label: t, href: '' });
      }
    }
    return out;
  }
  function firstHref(td, hostRe) {
    if (!td) return '';
    var as = td.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var h = as[i].getAttribute('href') || '';
      if (hostRe.test(h)) return h;
    }
    return '';
  }
  function siteDashboardHref(tr) {
    var a = tr.querySelector('td.kn-table-link a[href]');
    return a ? a.getAttribute('href') : '';
  }

  // ── Status grouping ───────────────────────────────────────────────────
  // Tints (locked 2026-09-03): Greenlit = GREEN, Completed = BLUE, survey /
  // waiting states amber, dead states red, everything else (incl. New
  // Lead) neutral slate.
  function statusClass(txt) {
    var t = String(txt || '').toLowerCase();
    if (!t) return '';
    if (/greenlit|active|progress|installing|schedul|sold/.test(t)) return ' scw-ssc-group-lbl--green';
    if (/complet|won|closed|deployed|done/.test(t)) return ' scw-ssc-group-lbl--blue';
    if (/survey|hold|pending|paus|wait/.test(t)) return ' scw-ssc-group-lbl--amber';
    if (/dead|lost|cancel|void|declin/.test(t)) return ' scw-ssc-group-lbl--red';
    return '';
  }
  // Group order (locked 2026-09-03): New Lead ALWAYS first; Site Survey
  // Requested right behind it; Greenlit and Completed always the LAST two
  // (in that order); everything else in between, no-status at the middle's
  // end, alpha within a rank.
  function statusRank(txt) {
    var t = String(txt || '').toLowerCase();
    if (/new lead/.test(t)) return 0;
    if (/survey/.test(t)) return 10;
    if (/lead|quote|propos/.test(t)) return 20;   // other early-pipeline
    if (/greenlit/.test(t)) return 90;
    if (/complet|closed|won|deployed|done/.test(t)) return 95;
    if (!t) return 55;                            // no status — after the middle
    return 50;
  }
  // Default collapse state: New Lead starts closed (it's the noisiest
  // group), everything else — Site Survey Requested, Greenlit, Completed,
  // Service Calls — starts open. Session toggles override per site+group.
  function defaultCollapsed(label) { return /new lead/i.test(String(label || '')); }
  function caretSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 9l6 6 6-6"></path></svg>';
  }
  function briefcaseSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="2" y="7" width="20" height="14" rx="2"></rect>' +
      '<path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>';
  }
  function wrenchSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77' +
      'a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91' +
      'a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>';
  }

  // Section band (PROJECTS / SERVICE CALLS) + its rail-indented body.
  // Collapsible like everything else; both default EXPANDED.
  function sectionBlockHtml(siteId, slug, label, icon, cls, bodyCls, innerHtml, count) {
    var key = siteId + '|sec:' + slug;
    var collapsed = Object.prototype.hasOwnProperty.call(_collapsed, key)
      ? _collapsed[key] : false;
    return '<div class="scw-ssc-sec ' + cls + ' scw-ssc-sec--toggle' +
        (collapsed ? ' is-collapsed' : '') + '" data-scw-ssc-key="' + esc(key) +
        '" role="button" tabindex="0" aria-expanded="' + (!collapsed) + '">' +
        '<span class="scw-ssc-caret">' + caretSvg() + '</span>' +
        '<span class="scw-ssc-sec-ic">' + icon + '</span>' +
        '<span>' + esc(label) + '</span>' +
        '<span class="scw-ssc-sec-count">(' + count + ')</span></div>' +
      '<div class="scw-ssc-sec-body ' + bodyCls + '"' + (collapsed ? ' hidden' : '') +
        '>' + innerHtml + '</div>';
  }

  // ── Row parsing ───────────────────────────────────────────────────────
  function parseRow(tr) {
    var F = CONFIG.fields;
    var clientLinks = linksIn(cellFor(tr, F.client));
    var statusMap = valuesById(cellFor(tr, F.status));
    var typeMap   = valuesById(cellFor(tr, F.projectType));
    var cuMap     = valuesById(cellFor(tr, F.cuTask));
    var dealMap   = valuesById(cellFor(tr, F.hsDealId));

    var projects = linksIn(cellFor(tr, F.projects)).map(function (p) {
      return {
        id:     p.id,
        label:  p.label,
        href:   p.href,
        status: p.id ? (statusMap[p.id] || '') : '',
        type:   p.id ? (typeMap[p.id]   || '') : '',
        cuId:   p.id ? (cuMap[p.id]     || '') : '',
        dealId: p.id ? (dealMap[p.id]   || '') : ''
      };
    });

    // Extra per-SC columns (CONFIG.scMeta) — id-correlated like everything
    // else: each configured column's spans carry the WO record id.
    var scMetaMaps = [];
    for (var m = 0; m < CONFIG.scMeta.length; m++) {
      scMetaMaps.push({
        label: CONFIG.scMeta[m].label || '',
        map:   valuesById(cellFor(tr, CONFIG.scMeta[m].field))
      });
    }
    var svcCalls = linksIn(cellFor(tr, F.serviceCall)).map(function (sc) {
      var meta = [];
      for (var mi = 0; mi < scMetaMaps.length; mi++) {
        var v = sc.id ? (scMetaMaps[mi].map[sc.id] || '') : '';
        if (v) meta.push({ label: scMetaMaps[mi].label, value: v });
      }
      sc.meta = meta;
      return sc;
    });

    return {
      siteId:     tr.id || '',
      clientId:   (clientLinks[0] && clientLinks[0].id) || '',
      clientName: (clientLinks[0] && clientLinks[0].label) ||
                  cellText(cellFor(tr, F.client)),
      hsCoHref:   firstHref(cellFor(tr, F.hsCompany), /hubspot\.com/i),
      siteName:   cellText(cellFor(tr, F.siteName)),
      address:    cellTextWithBreaks(cellFor(tr, F.siteAddress)),
      dashHref:   siteDashboardHref(tr),
      projects:   projects,
      svcCalls:   svcCalls
    };
  }

  // ── Render ────────────────────────────────────────────────────────────
  function projectCardHtml(p) {
    var dealDigits = String(p.dealId || '').replace(/\D+/g, '');
    return '<div class="scw-ssc-card">' +
      '<div class="scw-ssc-card-main">' +
        '<div class="scw-ssc-name">' +
          (p.href
            ? '<a href="' + esc(p.href) + '" title="Open the project dashboard">' +
              esc(p.label) + '</a>'
            : esc(p.label)) +
        '</div>' +
        (p.type ? '<div class="scw-ssc-type">' + esc(p.type) + '</div>' : '') +
      '</div>' +
      ((dealDigits || p.cuId)
        ? '<div class="scw-ssc-links">' +
          (dealDigits
            ? '<a class="scw-ssc-chip scw-ssc-chip--hs" target="_blank" rel="noopener" ' +
              'href="' + esc(CONFIG.hubspotDealUrl + dealDigits) +
              '">HubSpot Deal &#8599;</a>'
            : '') +
          (p.cuId
            ? '<a class="scw-ssc-chip scw-ssc-chip--cu" target="_blank" rel="noopener" ' +
              'href="' + esc(CONFIG.clickupUrl + encodeURIComponent(p.cuId)) +
              '">ClickUp Task &#8599;</a>'
            : '') +
          '</div>'
        : '') +
    '</div>';
  }

  function serviceCallCardHtml(sc) {
    var metaHtml = '';
    if (sc.meta && sc.meta.length) {
      var bits = [], plain = [];
      for (var i = 0; i < sc.meta.length; i++) {
        var lbl = sc.meta[i].label ? sc.meta[i].label + ': ' : '';
        bits.push(esc(lbl) + esc(sc.meta[i].value));
        plain.push(lbl + sc.meta[i].value);
      }
      // Clamped to two lines by CSS — full text in the tooltip.
      metaHtml = '<div class="scw-ssc-type" title="' + esc(plain.join(' · ')) +
        '">' + bits.join(' · ') + '</div>';
    }
    return '<div class="scw-ssc-card scw-ssc-card--sc">' +
      '<span class="scw-ssc-sc-tag">Service Call</span>' +
      '<div class="scw-ssc-card-main"><div class="scw-ssc-name">' +
        (sc.href
          ? '<a href="' + esc(sc.href) + '" title="Open the work order">' +
            esc(sc.label) + '</a>'
          : esc(sc.label)) +
      '</div>' + metaHtml + '</div>' +
    '</div>';
  }

  // Collapsible group: tinted header (caret + label + count + rule) and
  // its card list. Collapse state = session toggle if the user touched
  // this site+group, else the default (New Lead closed, the rest open).
  function groupBlockHtml(siteId, label, cls, cardsHtml, count) {
    var key = siteId + '|' + String(label).toLowerCase();
    var collapsed = Object.prototype.hasOwnProperty.call(_collapsed, key)
      ? _collapsed[key] : defaultCollapsed(label);
    return '<div class="scw-ssc-group scw-ssc-group--toggle' +
        (collapsed ? ' is-collapsed' : '') + '" data-scw-ssc-key="' + esc(key) +
        '" role="button" tabindex="0" aria-expanded="' + (!collapsed) + '">' +
        '<span class="scw-ssc-caret">' + caretSvg() + '</span>' +
        '<span class="scw-ssc-group-lbl' + cls + '">' + esc(label) +
          ' (' + count + ')</span>' +
        '<span class="scw-ssc-group-rule"></span></div>' +
      '<div class="scw-ssc-list"' + (collapsed ? ' hidden' : '') + '>' +
        cardsHtml + '</div>';
  }

  function siteHtml(s) {
    var nameHtml = s.dashHref
      ? '<a href="' + esc(s.dashHref) + '" title="Open the site dashboard">' +
        esc(s.siteName || 'Site') + '</a>'
      : esc(s.siteName || 'Site');
    var html =
      '<div class="scw-ssc-site">' +
        '<div class="scw-ssc-site-head">' +
          '<div class="scw-ssc-site-id">' +
            '<div class="scw-ssc-site-name">' + nameHtml + '</div>' +
            (s.address ? '<div class="scw-ssc-site-sub">' + esc(s.address) + '</div>' : '') +
          '</div>' +
          (s.dashHref
            ? '<div class="scw-ssc-site-links"><a class="scw-ssc-chip" href="' +
              esc(s.dashHref) + '">Site Dashboard</a></div>'
            : '') +
        '</div>';

    if (!s.projects.length && !s.svcCalls.length) {
      return html + '<div class="scw-ssc-noproj">Nothing on this site yet.</div></div>';
    }

    // Status groups — exact status text, ordered in-flight → pipeline →
    // done → other, blank last. Project order within a group is preserved.
    var groups = [], byStatus = Object.create(null);
    for (var i = 0; i < s.projects.length; i++) {
      var st = s.projects[i].status || '';
      if (!byStatus[st]) {
        byStatus[st] = { status: st, items: [] };
        groups.push(byStatus[st]);
      }
      byStatus[st].items.push(s.projects[i]);
    }
    groups.sort(function (a, b) {
      var r = statusRank(a.status) - statusRank(b.status);
      return r !== 0 ? r : String(a.status).localeCompare(String(b.status));
    });

    if (s.projects.length) {
      var projInner = '';
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        var cardsHtml = '';
        for (var pi = 0; pi < grp.items.length; pi++) {
          cardsHtml += projectCardHtml(grp.items[pi]);
        }
        projInner += groupBlockHtml(s.siteId, grp.status || 'No status',
          statusClass(grp.status), cardsHtml, grp.items.length);
      }
      html += sectionBlockHtml(s.siteId, 'projects', 'Projects',
        briefcaseSvg(), 'scw-ssc-sec--proj', 'scw-ssc-sec-body--proj',
        projInner, s.projects.length);
    }

    if (s.svcCalls.length) {
      var scHtml = '<div class="scw-ssc-list">';
      for (var sc = 0; sc < s.svcCalls.length; sc++) {
        scHtml += serviceCallCardHtml(s.svcCalls[sc]);
      }
      scHtml += '</div>';
      html += sectionBlockHtml(s.siteId, 'service-calls', 'Service Calls',
        wrenchSvg(), 'scw-ssc-sec--sc', 'scw-ssc-sec-body--sc',
        scHtml, s.svcCalls.length);
    }

    return html + '</div>';
  }

  // Delegated toggle — click or Enter/Space on a status-group header OR a
  // company header collapses/expands the block that follows it and
  // remembers the choice for this session. Clicks on links inside a
  // header (the HubSpot Company chip) never toggle.
  var TOGGLE_SEL = '.scw-ssc-group--toggle, .scw-ssc-co-head--toggle, ' +
                   '.scw-ssc-sec--toggle';
  function toggleGroup(hdr) {
    var body = hdr.nextElementSibling;
    if (!body || !(body.classList.contains('scw-ssc-list') ||
                   body.classList.contains('scw-ssc-co-body') ||
                   body.classList.contains('scw-ssc-sec-body'))) return;
    var collapsed = !body.hidden;
    body.hidden = collapsed;
    hdr.classList.toggle('is-collapsed', collapsed);
    hdr.setAttribute('aria-expanded', String(!collapsed));
    var key = hdr.getAttribute('data-scw-ssc-key');
    if (key) _collapsed[key] = collapsed;
  }
  if (!document.documentElement.hasAttribute('data-scw-ssc-toggle-bound')) {
    document.documentElement.setAttribute('data-scw-ssc-toggle-bound', '1');
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) return;   // chips navigate
      var hdr = e.target.closest && e.target.closest(TOGGLE_SEL);
      if (hdr) toggleGroup(hdr);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var hdr = e.target.closest && e.target.closest(TOGGLE_SEL);
      if (hdr && !(e.target.closest && e.target.closest('a'))) {
        e.preventDefault();
        toggleGroup(hdr);
      }
    });
  }

  function companyHtml(co) {
    // Collapsible like the status groups — default EXPANDED; the session
    // toggle (keyed on the client) survives search re-renders.
    var key = 'co|' + (co.key || co.clientName || '');
    var collapsed = Object.prototype.hasOwnProperty.call(_collapsed, key)
      ? _collapsed[key] : false;
    var html =
      '<div class="scw-ssc-co">' +
        '<div class="scw-ssc-co-head scw-ssc-co-head--toggle' +
          (collapsed ? ' is-collapsed' : '') + '" data-scw-ssc-key="' + esc(key) +
          '" role="button" tabindex="0" aria-expanded="' + (!collapsed) + '">' +
          '<span class="scw-ssc-caret">' + caretSvg() + '</span>' +
          '<div class="scw-ssc-co-name">' + esc(co.clientName || 'Company') + '</div>' +
          (co.hsCoHref
            ? '<a class="scw-ssc-chip scw-ssc-chip--hs" target="_blank" rel="noopener" ' +
              'href="' + esc(co.hsCoHref) + '">HubSpot Company &#8599;</a>'
            : '') +
        '</div>' +
        '<div class="scw-ssc-co-body"' + (collapsed ? ' hidden' : '') + '>';
    for (var i = 0; i < co.sites.length; i++) html += siteHtml(co.sites[i]);
    return html + '</div></div>';
  }

  // ── Transform ─────────────────────────────────────────────────────────
  function transform(viewEl) {
    var old = viewEl.querySelector('.scw-ssc-mount');
    if (old) old.parentNode.removeChild(old);

    var wrapper = viewEl.querySelector('.kn-table-wrapper');
    var table = wrapper && wrapper.querySelector('table.kn-table');
    if (!table) { viewEl.removeAttribute(MARK); return; }   // no results yet

    // Parse every site row, then fold sites into companies — first-seen
    // order, keyed by client record id (name fallback) so a company with
    // many matched sites renders its header exactly once.
    var companies = [], byClient = Object.create(null);
    var rows = table.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('td.kn-td-nodata')) continue;
      if (!rows[i].id) continue;
      var site = parseRow(rows[i]);
      var key = site.clientId || site.clientName || ('row-' + i);
      if (!byClient[key]) {
        byClient[key] = { key: key, clientName: site.clientName,
                          hsCoHref: site.hsCoHref, sites: [] };
        companies.push(byClient[key]);
      }
      if (!byClient[key].hsCoHref && site.hsCoHref) {
        byClient[key].hsCoHref = site.hsCoHref;
      }
      byClient[key].sites.push(site);
    }

    var html = '';
    for (var c = 0; c < companies.length; c++) html += companyHtml(companies[c]);

    viewEl.setAttribute(MARK, '1');
    var mount = document.createElement('div');
    mount.className = 'scw-ssc-mount';
    mount.innerHTML = companies.length ? html
      : '<div class="scw-ssc-empty">No matching sites.</div>';
    wrapper.parentNode.insertBefore(mount, wrapper);
  }

  function scan() {
    injectStyles();
    for (var i = 0; i < CONFIG.views.length; i++) {
      var el = document.getElementById(CONFIG.views[i]);
      if (!el) continue;
      try { transform(el); }
      catch (e) {
        console.warn('[scw-site-search-cards] transform failed on ' +
          CONFIG.views[i], e);
      }
    }
  }

  $(document).off('knack-view-render.any' + NS)
             .on('knack-view-render.any' + NS, function () { scan(); });
  $(document).off('knack-scene-render.any' + NS)
             .on('knack-scene-render.any' + NS, function () { scan(); });
})();
/*** END FEATURE: SITE SEARCH → COMPANY / SITE / PROJECT CARDS ***************/
