/*** FEATURE: SITE SEARCH → PROJECT CARDS *************************************
 *
 * view_2604 ("Search Sites by name, client, address", team-calendar scene)
 * returns one dense grid ROW per SITE, with every project-level column
 * (name / type / status / CU task / HS deal) holding a <br>-stacked list
 * of connection values. Unreadable. This module rebuilds each result row
 * as a SITE BLOCK — site nickname, client, address, Site Dashboard link,
 * HubSpot Company chip, service-call chips — containing one CARD PER
 * PROJECT with its status pill, project type, and HubSpot Deal + ClickUp
 * Task links.
 *
 * ── The correlation trick (why this is reliable) ──────────────────────
 * Every project-level connection value renders as
 *   <span id="<projectRecordId>" data-kn="connection-value">…</span>
 * so a project's status / type / CU id / deal id are matched BY RECORD ID
 * across columns — never by list position. A project missing a value
 * (e.g. no Project Type) simply has no span in that cell; index-pairing
 * would misalign there, id-keying can't.
 *
 * LINK SCHEMAS (portal/team ids are app-level constants):
 *   HubSpot deal:    https://app.hubspot.com/contacts/5417380/record/0-3/<dealId>
 *   ClickUp task:    https://app.clickup.com/t/8530675/<taskId>
 *   HubSpot company: field_1481 already renders a full anchor — reused as-is.
 *
 * The native results table is hidden (CSS on the marked view only); the
 * search form, entries summary and pagination stay fully functional. Each
 * search / page / sort re-fires knack-view-render → full rescan
 * (idempotent: the old mount is dropped and rebuilt).
 ****************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    views: ['view_2604'],
    fields: {
      client:      'field_1258',  // connection → client
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
    hubspotDealUrl: 'https://app.hubspot.com/contacts/5417380/record/0-3/',
    clickupUrl:     'https://app.clickup.com/t/8530675/'
  };

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

      // Site block — one per result row.
      '.scw-ssc-site {',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;',
      '  padding: 14px 16px; margin: 10px 0;',
      '  font: 400 12.5px/1.45 system-ui, -apple-system, sans-serif; color: #334155;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,0.05);',
      '}',
      '.scw-ssc-site-head {',
      '  display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;',
      '}',
      '.scw-ssc-site-id { flex: 1 1 auto; min-width: 220px; }',
      '.scw-ssc-site-name {',
      '  font: 700 16px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '  overflow-wrap: anywhere;',
      '}',
      '.scw-ssc-site-name a { color: #0f4c75; text-decoration: none; }',
      '.scw-ssc-site-name a:hover { text-decoration: underline; }',
      '.scw-ssc-site-sub { color: #64748b; margin-top: 2px; overflow-wrap: anywhere; }',
      '.scw-ssc-site-links {',
      '  flex: 0 0 auto; display: flex; gap: 6px; flex-wrap: wrap;',
      '  align-items: center;',
      '}',

      // Project cards grid inside the site block.
      '.scw-ssc-grid {',
      '  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));',
      '  gap: 10px; margin-top: 12px;',
      '}',
      '.scw-ssc-card {',
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  border-left: 4px solid #295f91; padding: 10px 12px;',
      '  display: flex; flex-direction: column; gap: 7px; min-width: 0;',
      '}',
      '.scw-ssc-top { display: flex; align-items: flex-start; gap: 8px; }',
      '.scw-ssc-name {',
      '  font: 700 13px/1.35 system-ui, -apple-system, sans-serif; color: #0f172a;',
      '  overflow-wrap: anywhere; flex: 1 1 auto; min-width: 0;',
      '}',
      '.scw-ssc-name a { color: #0f4c75; text-decoration: none; }',
      '.scw-ssc-name a:hover { text-decoration: underline; }',
      '.scw-ssc-type { color: #64748b; font-size: 12px; }',

      // Status pill — keyword-tinted.
      '.scw-ssc-status {',
      '  flex: 0 0 auto; display: inline-flex; align-items: center;',
      '  padding: 3px 10px; border-radius: 999px; white-space: nowrap;',
      '  font: 600 11px/1.2 system-ui, sans-serif;',
      '  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;',
      '}',
      '.scw-ssc-status--good { background: #dcfce7; color: #15803d; border-color: #86efac; }',
      '.scw-ssc-status--active { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }',
      '.scw-ssc-status--hold { background: #fef3c7; color: #b45309; border-color: #fcd34d; }',
      '.scw-ssc-status--dead { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }',

      // Link chips — HubSpot orange, ClickUp purple, neutral for the rest.
      '.scw-ssc-links { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; }',
      '.scw-ssc-chip {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 10px; border-radius: 6px; text-decoration: none;',
      '  font: 600 11.5px/1.2 system-ui, sans-serif; white-space: nowrap;',
      '  background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;',
      '}',
      '.scw-ssc-chip:hover { text-decoration: none; filter: brightness(0.96); }',
      '.scw-ssc-chip--hs { background: #fff1eb; color: #d3502a; border-color: #fdd4c2; }',
      '.scw-ssc-chip--cu { background: #efecfd; color: #5a48d6; border-color: #d6cffb; }',

      '.scw-ssc-noproj { color: #94a3b8; font-style: italic; margin-top: 10px; }',
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
    return (td.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Text with <br> line breaks flattened to ", " (site address).
  function cellTextWithBreaks(td) {
    if (!td) return '';
    var html = td.innerHTML
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]*>/g, ' ');
    var el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ')
      .replace(/(\s*,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim();
  }
  // Per-project values keyed by the connection span's record id.
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
  // Connection LINKS: [{ id, label, href }] (projects, service calls).
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
    // Values rendered without links (permission-hidden pages) still count.
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

  function statusClass(txt) {
    var t = String(txt || '').toLowerCase();
    if (!t) return '';
    if (/complet|won|closed|deployed|done/.test(t)) return ' scw-ssc-status--good';
    if (/greenlit|active|progress|install|schedul|sold|deploy/.test(t)) return ' scw-ssc-status--active';
    if (/hold|pending|paus|wait/.test(t)) return ' scw-ssc-status--hold';
    if (/dead|lost|cancel|void|declin/.test(t)) return ' scw-ssc-status--dead';
    return '';
  }

  // ── Build one site block from a result row ────────────────────────────
  function buildSiteBlock(tr) {
    var F = CONFIG.fields;
    var siteName = cellText(cellFor(tr, F.siteName));
    var client   = cellText(cellFor(tr, F.client));
    var address  = cellTextWithBreaks(cellFor(tr, F.siteAddress));
    var dashHref = siteDashboardHref(tr);
    var hsCoHref = firstHref(cellFor(tr, F.hsCompany), /hubspot\.com/i);

    var projects  = linksIn(cellFor(tr, F.projects));
    var statusMap = valuesById(cellFor(tr, F.status));
    var typeMap   = valuesById(cellFor(tr, F.projectType));
    var cuMap     = valuesById(cellFor(tr, F.cuTask));
    var dealMap   = valuesById(cellFor(tr, F.hsDealId));
    var svcCalls  = linksIn(cellFor(tr, F.serviceCall));

    var nameHtml = dashHref
      ? '<a href="' + esc(dashHref) + '" title="Open the site dashboard">' +
        esc(siteName || client || 'Site') + '</a>'
      : esc(siteName || client || 'Site');
    var subBits = [];
    if (client && client !== siteName) subBits.push(esc(client));
    if (address) subBits.push(esc(address));

    var headLinks = '';
    if (dashHref) {
      headLinks += '<a class="scw-ssc-chip" href="' + esc(dashHref) +
        '">Site Dashboard</a>';
    }
    if (hsCoHref) {
      headLinks += '<a class="scw-ssc-chip scw-ssc-chip--hs" target="_blank" ' +
        'rel="noopener" href="' + esc(hsCoHref) + '">HubSpot Company &#8599;</a>';
    }
    for (var s = 0; s < svcCalls.length; s++) {
      var sc = svcCalls[s];
      headLinks += sc.href
        ? '<a class="scw-ssc-chip" href="' + esc(sc.href) +
          '" title="Service call work order">SC ' + esc(sc.label) + '</a>'
        : '<span class="scw-ssc-chip">SC ' + esc(sc.label) + '</span>';
    }

    var html =
      '<div class="scw-ssc-site">' +
        '<div class="scw-ssc-site-head">' +
          '<div class="scw-ssc-site-id">' +
            '<div class="scw-ssc-site-name">' + nameHtml + '</div>' +
            (subBits.length
              ? '<div class="scw-ssc-site-sub">' + subBits.join(' · ') + '</div>'
              : '') +
          '</div>' +
          (headLinks ? '<div class="scw-ssc-site-links">' + headLinks + '</div>' : '') +
        '</div>';

    if (!projects.length) {
      return html + '<div class="scw-ssc-noproj">No projects on this site.</div></div>';
    }

    html += '<div class="scw-ssc-grid">';
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var status = p.id ? (statusMap[p.id] || '') : '';
      var type   = p.id ? (typeMap[p.id]   || '') : '';
      var cuId   = p.id ? (cuMap[p.id]     || '') : '';
      var dealId = p.id ? (dealMap[p.id]   || '') : '';
      var dealDigits = dealId.replace(/\D+/g, '');

      html +=
        '<div class="scw-ssc-card">' +
          '<div class="scw-ssc-top">' +
            '<div class="scw-ssc-name">' +
              (p.href
                ? '<a href="' + esc(p.href) + '" title="Open the project dashboard">' +
                  esc(p.label) + '</a>'
                : esc(p.label)) +
            '</div>' +
            (status
              ? '<span class="scw-ssc-status' + statusClass(status) + '">' +
                esc(status) + '</span>'
              : '') +
          '</div>' +
          (type ? '<div class="scw-ssc-type">' + esc(type) + '</div>' : '') +
          ((dealDigits || cuId)
            ? '<div class="scw-ssc-links">' +
              (dealDigits
                ? '<a class="scw-ssc-chip scw-ssc-chip--hs" target="_blank" rel="noopener" ' +
                  'href="' + esc(CONFIG.hubspotDealUrl + dealDigits) +
                  '">HubSpot Deal &#8599;</a>'
                : '') +
              (cuId
                ? '<a class="scw-ssc-chip scw-ssc-chip--cu" target="_blank" rel="noopener" ' +
                  'href="' + esc(CONFIG.clickupUrl + encodeURIComponent(cuId)) +
                  '">ClickUp Task &#8599;</a>'
                : '') +
              '</div>'
            : '') +
        '</div>';
    }
    return html + '</div></div>';
  }

  // ── Transform ─────────────────────────────────────────────────────────
  function transform(viewEl) {
    var old = viewEl.querySelector('.scw-ssc-mount');
    if (old) old.parentNode.removeChild(old);

    var wrapper = viewEl.querySelector('.kn-table-wrapper');
    var table = wrapper && wrapper.querySelector('table.kn-table');
    if (!table) { viewEl.removeAttribute(MARK); return; }   // no results yet

    var rows = table.querySelectorAll('tbody tr');
    var html = '';
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('td.kn-td-nodata')) continue;
      if (!rows[i].id) continue;                      // grouping/summary rows
      html += buildSiteBlock(rows[i]);
      count++;
    }

    viewEl.setAttribute(MARK, '1');
    var mount = document.createElement('div');
    mount.className = 'scw-ssc-mount';
    mount.innerHTML = count ? html
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

  // Search submits, pagination and sorts all re-fire knack-view-render for
  // the search view; a scene-level rescan covers first paint. Idempotent —
  // the previous mount is replaced wholesale.
  $(document).off('knack-view-render.any' + NS)
             .on('knack-view-render.any' + NS, function () { scan(); });
  $(document).off('knack-scene-render.any' + NS)
             .on('knack-scene-render.any' + NS, function () { scan(); });
})();
/*** END FEATURE: SITE SEARCH → PROJECT CARDS ********************************/
