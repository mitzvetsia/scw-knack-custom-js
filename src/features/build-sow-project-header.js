/*** BUILD SOW PROJECT HEADER — view_3901 card + survey subcontract ClickUp tasks ****
 *
 * The ops "K2: Build SOWs" page (scene_1085) leads with the native project
 * kn-details view (view_3901): a raw two-column label/value dump (REL_company,
 * PLAYBOOK: …) with the same label-width layout thrash every kn-details view
 * has. We hide that native markup from first paint (CSS) and render one
 * STABLE header card in its place, scraping the values straight out of the
 * (hidden) native DOM — the same approach as survey-request-header.js.
 *
 *   view_3901 → project header card: title · Company › Site · address ·
 *               Branch / AE facts · HubSpot Deal + SCW ClickUp Task chips ·
 *               SURVEY SUBCONTRACT TASKS strip · Playbook flags + notes ·
 *               native Edit link re-rendered as a button.
 *
 *   view_4159 → SURVEY_requests grid for the project (hidden data source —
 *               hide-data-source-views.js). One row per survey request /
 *               round; each carries the subcontract ClickUp task id
 *               (field_2631) and the ASSIGNED TECH GROUP (field_2347). The
 *               header renders one link per row, LED BY THE TECH GROUP so
 *               every subtask link is identified with the subcontracting
 *               tech group it was assigned to. A row with no tech group
 *               renders an amber "Unassigned" label instead of hiding it.
 *
 * view_4159 renders AFTER view_3901 in scene order, so its render re-runs the
 * header transform to pick the task rows up. Model read first, DOM fallback.
 * Idempotent on every render (change-detected rebuild, no flicker).
 ***************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    sceneId:     'scene_1085',
    headerView:  'view_3901',   // project kn-details (the card source)
    surveyView:  'view_4159',   // SURVEY_requests grid (hidden data source)
    // ClickUp task URL base (same workspace as site-search-cards.js). Used
    // only when a row has a task id but neither link field resolves.
    clickupUrl:  'https://app.clickup.com/t/8530675/',
    header: {
      title:      'field_4',     // project name (rendered as <h1> by Knack)
      company:    'field_6',     // REL_company (connection link)
      site:       'field_1259',  // Site (connection link)
      branch:     'field_673',   // Branch (connection, plain)
      ae:         'field_451',   // Account Executive Name
      address:    'field_22',    // Address (multi-line)
      hubspot:    'field_1735',  // Hubspot Deal (link)
      clickup:    'field_2685',  // Clickup Task (link) — the PROJECT task
      multiState: 'field_1751',  // PLAYBOOK: Multi-State (Yes/No)
      multiBldg:  'field_1752',  // PLAYBOOK: Multiple Buildings? (Yes/No)
      playbook:   'field_1802'   // PLAYBOOK: Notes (rich text)
    },
    survey: {
      seq:         'field_2343', // SYS_auto increment (chronological sort)
      reqId:       'field_2345', // REQ_ID (e.g. 62610818596-SR168)
      cuTaskId:    'field_2631', // SYS_CU Task ID (e.g. 86baxqwxr)
      cuBuildLink: 'field_2918', // SYS_build CU task Link (full URL text)
      cuLink:      'field_2632', // SYS_CU Task Link (link field)
      techGroup:   'field_2347', // REL_tech group — the ASSIGNED subcontracting tech group
      status:      'field_2349', // FLAG_survey status
      requested:   'field_2351', // DATE_requested date
      scheduled:   'field_2352', // DATE_scheduled
      occurred:    'field_2353', // DATE_occured
      firstBid:    'field_2955'  // DATE_first bid submitted
    }
  };

  var STYLE_ID = 'scw-bsh-css';
  var EVENT_NS = '.scwBuildSowHeader';
  var CARD_CLS = 'scw-bsh-card';

  // ── helpers ─────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function stripTags(h) {
    return String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  function bodyEl(view, fk) {
    return view.querySelector('.kn-detail.' + fk + ' .kn-detail-body') ||
           view.querySelector('.' + fk + ' .kn-detail-body');
  }
  function txt(view, fk)    { var el = bodyEl(view, fk); return el ? stripTags(el.innerHTML) : ''; }
  function htmlOf(view, fk) { var el = bodyEl(view, fk); return el ? el.innerHTML.trim() : ''; }
  function hrefOf(view, fk) {
    var el = bodyEl(view, fk);
    var a  = el ? el.querySelector('a[href]') : null;
    return a ? (a.getAttribute('href') || '') : '';
  }
  function isYes(s) { return /^yes$/i.test(String(s || '').trim()); }
  function dateOnly(s) {
    // "07/14/2026 7:03pm" → "07/14/2026"; leaves other shapes alone.
    var m = String(s || '').match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
    return m ? m[0] : String(s || '').trim();
  }
  function extIcon() {
    return '<svg class="scw-bsh-ext" viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
  }
  function pinIcon() {
    return '<svg class="scw-bsh-pin" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' +
      '<circle cx="12" cy="10" r="3"/></svg>';
  }
  function groupIcon() {
    // "hard hat / crew" glyph — marks the subcontracting tech group label.
    return '<svg class="scw-bsh-task-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' +
      '<path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }

  // ── survey status → chip modifier ───────────────────────────
  function statusMod(status) {
    var s = String(status || '').toLowerCase();
    if (!s) return 'neutral';
    if (/cancel|void|declin|reject|closed/.test(s))                         return 'void';
    if (/final bid|bid submitted|complete|done|deliver|submitted/.test(s))   return 'done';
    if (/schedul|progress|occur|visit|active|sent|in field|assigned/.test(s)) return 'active';
    if (/pending|request|new|await|validat/.test(s))                         return 'pending';
    return 'neutral';
  }

  // ── view_4159: survey request rows ──────────────────────────
  function displayValue(attrs, fk) {
    if (!attrs || !fk) return '';
    var raw = attrs[fk + '_raw'];
    if (Array.isArray(raw)) {
      var labels = [];
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].identifier) labels.push(stripTags(raw[i].identifier));
      }
      if (labels.length) return labels.join(', ');
    } else if (raw && typeof raw === 'object' && raw.identifier) {
      return stripTags(raw.identifier);
    }
    var v = attrs[fk];
    if (v == null) return '';
    if (typeof v === 'object') return '';
    return stripTags(v);
  }
  function connectionId(attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return String(raw[0].id);
    if (raw && typeof raw === 'object' && raw.id) return String(raw.id);
    return '';
  }
  function firstUrl(s) {
    var m = String(s == null ? '' : s).match(/https?:\/\/[^\s"'<>]+/i);
    return m ? m[0] : '';
  }
  // Link/URL from a model attr — Knack link fields carry {url,label} in
  // _raw; text/formula fields carry the URL string (possibly inside an <a>).
  function linkValue(attrs, fk) {
    if (!attrs || !fk) return '';
    var raw = attrs[fk + '_raw'];
    if (raw && typeof raw === 'object' && raw.url) return firstUrl(raw.url) || String(raw.url);
    if (typeof raw === 'string') { var u = firstUrl(raw); if (u) return u; }
    return firstUrl(attrs[fk]);
  }

  function rowFromAttrs(a) {
    var F = CONFIG.survey;
    return {
      id:          String(a.id || ''),
      seq:         parseInt(displayValue(a, F.seq), 10),
      reqId:       displayValue(a, F.reqId),
      cuTaskId:    displayValue(a, F.cuTaskId),
      cuBuildLink: linkValue(a, F.cuBuildLink),
      cuLink:      linkValue(a, F.cuLink),
      techGroup:   displayValue(a, F.techGroup),
      techGroupId: connectionId(a, F.techGroup),
      status:      displayValue(a, F.status),
      requested:   displayValue(a, F.requested),
      scheduled:   displayValue(a, F.scheduled),
      occurred:    displayValue(a, F.occurred),
      firstBid:    displayValue(a, F.firstBid)
    };
  }
  function readRowsFromModel() {
    try {
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[CONFIG.surveyView] : null;
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models || !models.length) return [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (!a || !a.id) continue;
        out.push(rowFromAttrs(a));
      }
      return out;
    } catch (e) { return []; }
  }
  // DOM fallback — the hidden grid is still rendered, just not painted.
  function cellText(tr, fk) {
    var td = tr.querySelector('td.' + fk);
    return td ? stripTags(td.innerHTML) : '';
  }
  function cellHref(tr, fk) {
    var td = tr.querySelector('td.' + fk);
    if (!td) return '';
    var a = td.querySelector('a[href]');
    if (a) return a.getAttribute('href') || '';
    return firstUrl(td.textContent);
  }
  function cellConn(tr, fk) {
    var td = tr.querySelector('td.' + fk);
    if (!td) return { id: '', label: '' };
    var spans = td.querySelectorAll('span[data-kn="connection-value"]');
    if (!spans.length) return { id: '', label: stripTags(td.innerHTML) };
    var labels = [];
    for (var i = 0; i < spans.length; i++) labels.push(stripTags(spans[i].innerHTML));
    return { id: (spans[0].className || '').trim(), label: labels.join(', ') };
  }
  function readRowsFromDom(viewEl) {
    var F = CONFIG.survey, out = [];
    var trs = viewEl.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i];
      if (/kn-table-group|kn-tr-nodata/.test(tr.className || '')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id)) continue;
      var tg = cellConn(tr, F.techGroup);
      out.push({
        id:          tr.id,
        seq:         parseInt(cellText(tr, F.seq), 10),
        reqId:       cellText(tr, F.reqId),
        cuTaskId:    cellText(tr, F.cuTaskId),
        cuBuildLink: cellHref(tr, F.cuBuildLink),
        cuLink:      cellHref(tr, F.cuLink),
        techGroup:   tg.label,
        techGroupId: tg.id,
        status:      cellText(tr, F.status),
        requested:   cellText(tr, F.requested),
        scheduled:   cellText(tr, F.scheduled),
        occurred:    cellText(tr, F.occurred),
        firstBid:    cellText(tr, F.firstBid)
      });
    }
    return out;
  }
  function surveyViewEl() { return document.getElementById(CONFIG.surveyView); }
  // Has the grid actually rendered (table or "no data" marker present)?
  // Before that, "no rows" means "not loaded yet", not "no survey requests".
  function surveyViewRendered(el) {
    return !!(el && el.querySelector('table, .kn-tr-nodata, .kn-records-nav'));
  }
  function readSurveyRows() {
    var el = surveyViewEl();
    if (!el || !surveyViewRendered(el)) return null;      // not on page / not ready
    var rows = readRowsFromModel();
    if (!rows.length) rows = readRowsFromDom(el);
    // Dedupe (Knack occasionally renders a view twice) + chronological sort.
    var seen = Object.create(null), uniq = [];
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].id || seen[rows[i].id]) continue;
      seen[rows[i].id] = true;
      uniq.push(rows[i]);
    }
    uniq.sort(function (a, b) {
      var sa = isFinite(a.seq) ? a.seq : Infinity, sb = isFinite(b.seq) ? b.seq : Infinity;
      if (sa !== sb) return sa - sb;
      return String(a.reqId).localeCompare(String(b.reqId), undefined, { numeric: true });
    });
    return uniq;
  }
  function surveyHref(r) {
    if (r.cuBuildLink && /^https?:/i.test(r.cuBuildLink)) return r.cuBuildLink;
    if (r.cuLink && /^https?:/i.test(r.cuLink)) return r.cuLink;
    if (r.cuTaskId) return CONFIG.clickupUrl + encodeURIComponent(r.cuTaskId);
    return '';
  }
  // Short REQ label: "62610818596-SR168" → "SR168" (the project id prefix is
  // already in the title); anything else renders as-is.
  function shortReq(reqId) {
    var m = String(reqId || '').match(/(SR[-\s]?\d+)\s*$/i);
    return m ? m[1].replace(/\s+/g, '') : String(reqId || '');
  }

  // ── survey subcontract tasks strip ──────────────────────────
  function buildSurveyTasks() {
    var rows = readSurveyRows();
    if (rows === null) return '';                    // source view absent / not rendered yet
    var items = '';
    for (var i = 0; i < rows.length; i++) {
      var r    = rows[i];
      var href = surveyHref(r);
      var tg   = r.techGroup;
      var mod  = statusMod(r.status);
      var milestones = [];
      if (r.requested) milestones.push({ l: 'Requested',     d: dateOnly(r.requested) });
      if (r.scheduled) milestones.push({ l: 'Scheduled',     d: dateOnly(r.scheduled) });
      if (r.occurred)  milestones.push({ l: 'Completed',     d: dateOnly(r.occurred) });
      if (r.firstBid)  milestones.push({ l: 'Bid delivered', d: dateOnly(r.firstBid) });
      var dates = '';
      for (var m = 0; m < milestones.length; m++) {
        dates += '<span class="scw-bsh-task-date"><b>' + esc(milestones[m].l) + '</b>' +
          esc(milestones[m].d) + '</span>';
      }
      var tag = href ? 'a' : 'div';
      var title = (tg || 'Unassigned') + ' — ' + (r.reqId || 'survey request') +
        (r.cuTaskId ? ' — ClickUp task ' + r.cuTaskId : ' — no ClickUp task yet');
      items += '<' + tag + ' class="scw-bsh-task scw-bsh-task--' + mod +
          (tg ? '' : ' scw-bsh-task--unassigned') + (href ? '' : ' scw-bsh-task--nolink') + '"' +
          (href ? ' href="' + esc(href) + '" target="_blank" rel="noopener"' : '') +
          ' data-scw-bsh-req="' + esc(r.id) + '"' +
          (r.techGroupId ? ' data-scw-bsh-group="' + esc(r.techGroupId) + '"' : '') +
          ' title="' + esc(title) + '">' +
        '<span class="scw-bsh-task-main">' +
          // The tech group LEADS every subtask link — that is the
          // identification the ops user scans for.
          '<span class="scw-bsh-task-group">' + groupIcon() +
            '<span class="scw-bsh-task-group-name">' + esc(tg || 'Unassigned') + '</span>' +
          '</span>' +
          (r.reqId ? '<span class="scw-bsh-task-req" title="' + esc(r.reqId) + '">' +
            esc(shortReq(r.reqId)) + '</span>' : '') +
          (r.status ? '<span class="scw-bsh-task-status scw-bsh-task-status--' + mod + '">' +
            esc(r.status) + '</span>' : '') +
          '<span class="scw-bsh-task-cu">' +
            (href ? '<span class="scw-bsh-task-cu-label">ClickUp</span>' +
                    (r.cuTaskId ? '<span class="scw-bsh-task-cu-id">' + esc(r.cuTaskId) + '</span>' : '') +
                    extIcon()
                  : '<span class="scw-bsh-task-cu-none">No ClickUp task yet</span>') +
          '</span>' +
        '</span>' +
        (dates ? '<span class="scw-bsh-task-dates">' + dates + '</span>' : '') +
      '</' + tag + '>';
    }
    return '<div class="scw-bsh-section scw-bsh-tasks">' +
      '<div class="scw-bsh-eyebrow">Survey subcontract tasks' +
        (rows.length ? '<span class="scw-bsh-count">' + rows.length + '</span>' : '') +
        '<span class="scw-bsh-eyebrow-hint">ClickUp · by assigned tech group</span>' +
      '</div>' +
      (items ? '<div class="scw-bsh-task-list">' + items + '</div>'
             : '<div class="scw-bsh-empty">No survey subcontract tasks on this project yet.</div>') +
    '</div>';
  }

  // ── view_3901: project header card ──────────────────────────
  // Native action / page links (Edit …) live in .kn-details-link and would
  // be hidden with the rest of the native content — re-render as buttons.
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function actionLinks(view) {
    var out = '', seen = Object.create(null);
    var links = view.querySelectorAll(
      '.kn-details-link a[href], .kn-action-link a[href], a.kn-link-page[href], a.kn-link-action[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest && a.closest('.kn-detail') && !a.closest('.kn-details-link')) continue;
      var href = a.getAttribute('href') || '';
      var text = (a.textContent || '').trim();
      if (!href || !text) continue;
      var k = href + '|' + text;
      if (seen[k]) continue;
      seen[k] = true;
      var ext = /^https?:/i.test(href) || a.getAttribute('target') === '_blank';
      out += '<a class="scw-bsh-action" href="' + esc(href) + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(cap(text)) + '</a>';
    }
    return out;
  }
  // Every OTHER detail field on the view (beyond the ones the card lays out
  // explicitly) renders as a generic label/value row, so a field dropped onto
  // view_3901 later still shows up without per-field code.
  function extraDetailRows(view, skip) {
    var out = '';
    var dets = view.querySelectorAll('.kn-detail, .kn-label-none');
    for (var d = 0; d < dets.length; d++) {
      var det = dets[d];
      var fk = '', parts = (det.className || '').split(/\s+/);
      for (var c = 0; c < parts.length; c++) {
        if (/^field_\d+$/.test(parts[c])) { fk = parts[c]; break; }
      }
      if (!fk || skip[fk]) continue;
      var lab = det.querySelector('.kn-detail-label');
      var bod = det.querySelector('.kn-detail-body');
      var label   = lab ? lab.textContent.trim() : '';
      var valHtml = bod ? bod.innerHTML.trim() : '';
      if (!stripTags(valHtml)) continue;
      out += '<div class="scw-bsh-row">' +
        '<div class="scw-bsh-row-label">' + esc(label.replace(/^PLAYBOOK:\s*/i, '')) + '</div>' +
        '<div class="scw-bsh-row-val">' + valHtml + '</div>' +
      '</div>';
    }
    return out;
  }
  // Link-type fields beyond HubSpot / ClickUp (e.g. the Slack project thread)
  // — any OTHER detail field whose whole value is one external URL renders
  // as a chip in the links row, not as a label/value row. Flavored by host
  // so Slack / HubSpot / ClickUp keep their brand tint; anything else is
  // neutral. A URL embedded in prose is NOT a link field — that stays a row.
  function chipFlavor(href) {
    var h = String(href || '').toLowerCase();
    if (h.indexOf('slack.com') !== -1)   return 'slack';
    if (h.indexOf('hubspot.com') !== -1) return 'hs';
    if (h.indexOf('clickup.com') !== -1) return 'cu';
    return '';
  }
  // "LINK_slack thread" / "REL_company" → drop the SCREAMING_ prefix.
  function cleanLabel(s) {
    return String(s || '').replace(/^[A-Z]{2,}_\s*/, '').replace(/\s+/g, ' ').trim();
  }
  function isUrl(s) { return /^https?:\/\//i.test(String(s || '').trim()); }
  function linkChips(view, skip) {
    var out = '', used = Object.create(null);
    var dets = view.querySelectorAll('.kn-detail');
    for (var d = 0; d < dets.length; d++) {
      var det = dets[d];
      var fk = '', parts = (det.className || '').split(/\s+/);
      for (var c = 0; c < parts.length; c++) {
        if (/^field_\d+$/.test(parts[c])) { fk = parts[c]; break; }
      }
      if (!fk || skip[fk]) continue;
      var bod = det.querySelector('.kn-detail-body');
      if (!bod) continue;
      var text  = stripTags(bod.innerHTML);
      var a     = bod.querySelector('a[href^="http"], a[href^="//"]');
      var aText = a ? stripTags(a.innerHTML) : '';
      var href  = a ? (a.getAttribute('href') || '') : firstUrl(text);
      if (!href) continue;
      if (a && text !== aText) continue;                 // link inside prose → row
      if (!a && text !== href) continue;                 // URL inside prose → row
      var lab   = det.querySelector('.kn-detail-label');
      var label = cleanLabel(lab ? lab.textContent : '');
      // Chip text: the link's own text when it has one, else the field label,
      // else the host — never a raw URL.
      var name = (aText && !isUrl(aText)) ? aText : label;
      if (!name || isUrl(name)) {
        var hm = String(href).match(/^(?:https?:)?\/\/(?:www\.)?([^/:?#]+)/i);
        name = hm ? hm[1] : 'Link';
      }
      var flavor = chipFlavor(href);
      used[fk] = true;
      out += '<a class="scw-bsh-chip' + (flavor ? ' scw-bsh-chip--' + flavor : '') +
        '" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(label || name) + '">' +
        esc(name) + extIcon() + '</a>';
    }
    return { html: out, used: used };
  }

  function fact(label, valueHtml) {
    if (!valueHtml) return '';
    return '<div class="scw-bsh-fact"><span class="scw-bsh-fact-label">' + esc(label) +
      '</span><span class="scw-bsh-fact-val">' + valueHtml + '</span></div>';
  }
  function flag(label, value) {
    if (!value) return '';
    var yes = isYes(value);
    return '<span class="scw-bsh-flag' + (yes ? ' scw-bsh-flag--yes' : '') + '">' +
      '<span class="scw-bsh-flag-dot"></span>' + esc(label) + ': ' + esc(value) + '</span>';
  }

  function buildHeader(view) {
    var H = CONFIG.header;
    var title    = txt(view, H.title);
    var company  = txt(view, H.company),  companyHref = hrefOf(view, H.company);
    var site     = txt(view, H.site),     siteHref    = hrefOf(view, H.site);
    var branch   = txt(view, H.branch);
    var ae       = txt(view, H.ae);
    var addrHtml = htmlOf(view, H.address);
    var hubspot  = hrefOf(view, H.hubspot);
    var clickup  = hrefOf(view, H.clickup);
    var multiSt  = txt(view, H.multiState);
    var multiBl  = txt(view, H.multiBldg);
    var notes    = htmlOf(view, H.playbook);
    if (!stripTags(addrHtml)) addrHtml = '';
    if (!stripTags(notes))    notes    = '';

    var skip = Object.create(null);
    for (var k in H) skip[H[k]] = true;
    // Extra link fields (Slack project thread, …) → chips; everything else
    // left on the view → generic rows under Playbook.
    var lc = linkChips(view, skip);
    for (var u in lc.used) skip[u] = true;
    var extra = extraDetailRows(view, skip);

    var crumb = '';
    if (company) {
      crumb += companyHref
        ? '<a class="scw-bsh-crumb-link" href="' + esc(companyHref) + '">' + esc(company) + '</a>'
        : '<span>' + esc(company) + '</span>';
    }
    if (site) {
      if (crumb) crumb += '<span class="scw-bsh-crumb-sep" aria-hidden="true">›</span>';
      crumb += siteHref
        ? '<a class="scw-bsh-crumb-link" href="' + esc(siteHref) + '">' + esc(site) + '</a>'
        : '<span>' + esc(site) + '</span>';
    }

    var links = '';
    if (hubspot) {
      links += '<a class="scw-bsh-chip scw-bsh-chip--hs" href="' + esc(hubspot) +
        '" target="_blank" rel="noopener">HubSpot Deal' + extIcon() + '</a>';
    }
    if (clickup) {
      links += '<a class="scw-bsh-chip scw-bsh-chip--cu" href="' + esc(clickup) +
        '" target="_blank" rel="noopener">SCW ClickUp Task' + extIcon() + '</a>';
    }
    links += lc.html;

    var flags = flag('Multi-state', multiSt) + flag('Multiple buildings', multiBl);
    var playbook = '';
    if (flags || notes || extra) {
      playbook = '<div class="scw-bsh-section scw-bsh-playbook">' +
        '<div class="scw-bsh-eyebrow">Playbook</div>' +
        (flags ? '<div class="scw-bsh-flags">' + flags + '</div>' : '') +
        (notes ? '<details class="scw-bsh-notes" open>' +
                   '<summary class="scw-bsh-notes-toggle">Playbook notes</summary>' +
                   '<div class="scw-bsh-notes-body">' + notes + '</div>' +
                 '</details>' : '') +
        (extra ? '<div class="scw-bsh-rows">' + extra + '</div>' : '') +
      '</div>';
    }

    return '' +
      '<div class="scw-bsh-top">' +
        '<div class="scw-bsh-top-main">' +
          '<div class="scw-bsh-eyebrow scw-bsh-eyebrow--project">Project</div>' +
          '<div class="scw-bsh-title">' + esc(title || 'Project') + '</div>' +
          (crumb ? '<div class="scw-bsh-crumb">' + crumb + '</div>' : '') +
          (addrHtml ? '<div class="scw-bsh-addr">' + pinIcon() + '<span>' + addrHtml + '</span></div>' : '') +
        '</div>' +
        '<div class="scw-bsh-top-side">' +
          (links ? '<div class="scw-bsh-links">' + links + '</div>' : '') +
          '<div class="scw-bsh-facts">' +
            fact('Branch', branch ? esc(branch) : '') +
            fact('Account Executive', ae ? esc(ae) : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      buildSurveyTasks() +
      playbook;
  }

  // ── transform ───────────────────────────────────────────────
  function mountCard(view, innerHtml) {
    if (!innerHtml) return;
    var card = view.querySelector('.' + CARD_CLS);
    if (!card) {
      card = document.createElement('div');
      card.className = CARD_CLS;
      view.insertBefore(card, view.firstChild);
    }
    // Only rebuild when the HTML actually changed (Knack re-renders these
    // views several times on load; identical rebuilds just flicker). Compare
    // a short signature, not the whole markup — keeps the DOM light.
    var sig = hashStr(innerHtml);
    if (card.getAttribute('data-scw-bsh-sig') === sig) return;
    card.setAttribute('data-scw-bsh-sig', sig);
    card.innerHTML = innerHtml;
  }
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  function transformHeader() {
    var els = document.querySelectorAll('#' + CONFIG.headerView);
    for (var i = 0; i < els.length; i++) {
      var view  = els[i];
      var inner = buildHeader(view);
      var acts  = actionLinks(view);
      if (acts) inner = inner.replace('<div class="scw-bsh-top-side">',
        '<div class="scw-bsh-top-side"><div class="scw-bsh-actions">' + acts + '</div>');
      mountCard(view, inner);
    }
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var hv = '#' + CONFIG.headerView;
    var css = [
      // Hide EVERY native child of the header view from first paint — our
      // card is the only thing that shows. Strip the view/column chrome.
      hv + ' > *:not(.' + CARD_CLS + ') { display: none !important; }',
      hv + ' { background: transparent !important; box-shadow: none !important;',
      '  border: none !important; border-radius: 0 !important; padding: 0 !important;',
      '  margin: 0 0 14px !important; overflow: visible !important; }',
      '.view-column:has(> ' + hv + '), .view-group:has(' + hv + ') { border: none !important;',
      '  border-radius: 0 !important; box-shadow: none !important; outline: none !important;',
      '  background: transparent !important; }',

      '.' + CARD_CLS + ' { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.05); padding: 18px 22px 16px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  color: #1f2937; position: relative; }',

      /* top block: identity (left) + links / facts / actions (right) */
      '.scw-bsh-top { display: flex; justify-content: space-between; gap: 18px 28px; flex-wrap: wrap; }',
      '.scw-bsh-top-main { flex: 1 1 380px; min-width: 0; }',
      '.scw-bsh-top-side { flex: 0 1 auto; display: flex; flex-direction: column; align-items: flex-end;',
      '  gap: 10px; max-width: 100%; }',
      '.scw-bsh-eyebrow { display: flex; align-items: center; gap: 8px; font: 700 10.5px/1 system-ui, sans-serif;',
      '  text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; }',
      '.scw-bsh-eyebrow--project { color: #ed8326; margin-bottom: 6px; }',
      '.scw-bsh-eyebrow-hint { font-weight: 600; letter-spacing: .3px; text-transform: none;',
      '  color: #a1aab8; }',
      '.scw-bsh-count { display: inline-flex; align-items: center; justify-content: center;',
      '  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #f1f5f9;',
      '  color: #475569; font: 700 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }',
      '.scw-bsh-title { font-size: 21px; font-weight: 750; letter-spacing: -.01em; color: #0f172a;',
      '  line-height: 1.2; }',
      '.scw-bsh-crumb { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px;',
      '  font-size: 13.5px; font-weight: 600; color: #334155; }',
      '.scw-bsh-crumb-link { color: #1d4ed8; text-decoration: none; }',
      '.scw-bsh-crumb-link:hover { text-decoration: underline; }',
      '.scw-bsh-crumb-sep { color: #cbd5e1; font-weight: 400; }',
      '.scw-bsh-addr { display: flex; align-items: flex-start; gap: 7px; margin-top: 8px;',
      '  font-size: 13px; color: #475569; line-height: 1.4; }',
      '.scw-bsh-addr .scw-bsh-pin { color: #2f5f91; flex: 0 0 auto; margin-top: 1px; }',

      '.scw-bsh-actions { display: flex; gap: 8px; }',
      '.scw-bsh-action { font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none;',
      '  color: #334155; background: #fff; border: 1px solid #cbd5e1; border-radius: 7px;',
      '  padding: 6px 12px; white-space: nowrap; }',
      '.scw-bsh-action:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a;',
      '  text-decoration: none; }',
      '.scw-bsh-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }',
      /* Link chips — HubSpot orange, ClickUp purple (site-search-cards tokens). */
      '.scw-bsh-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;',
      '  border-radius: 6px; text-decoration: none; font: 600 11.5px/1.2 system-ui, sans-serif;',
      '  white-space: nowrap; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }',
      '.scw-bsh-chip:hover { text-decoration: none; filter: brightness(.96); }',
      '.scw-bsh-chip--hs { background: #fff1eb; color: #d3502a; border-color: #fdd4c2; }',
      '.scw-bsh-chip--cu { background: #efecfd; color: #5a48d6; border-color: #d6cffb; }',
      /* Slack aubergine — the project thread link. */
      '.scw-bsh-chip--slack { background: #f6eef7; color: #4a154b; border-color: #e3cfe5; }',
      '.scw-bsh-ext { flex: 0 0 auto; opacity: .8; }',
      '.scw-bsh-facts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px 18px; }',
      '.scw-bsh-fact { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }',
      '.scw-bsh-fact-label { font: 600 10px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .4px; color: #94a3b8; }',
      '.scw-bsh-fact-val { font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; }',

      /* sections */
      '.scw-bsh-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; }',

      /* survey subcontract task links — one per survey request, LED by the
         assigned tech group. */
      '.scw-bsh-task-list { display: flex; flex-direction: column; gap: 6px; margin-top: 9px; }',
      '.scw-bsh-task { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;',
      '  gap: 6px 14px; padding: 8px 12px; border-radius: 8px; text-decoration: none;',
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #295f91;',
      '  color: #1f2937; transition: background .12s, border-color .12s; }',
      'a.scw-bsh-task:hover { background: #eef2f7; border-color: #cbd5e1; border-left-color: #295f91;',
      '  text-decoration: none; }',
      '.scw-bsh-task--done { border-left-color: #047857; }',
      '.scw-bsh-task--active { border-left-color: #1d4ed8; }',
      '.scw-bsh-task--pending { border-left-color: #b45309; }',
      '.scw-bsh-task--void { border-left-color: #94a3b8; opacity: .8; }',
      '.scw-bsh-task--unassigned { border-left-color: #b45309; border-style: dashed; border-left-style: solid; }',
      '.scw-bsh-task--nolink { cursor: default; }',
      '.scw-bsh-task-main { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }',
      '.scw-bsh-task-group { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px;',
      '  font-weight: 700; color: #0f172a; }',
      '.scw-bsh-task-ico { color: #295f91; flex: 0 0 auto; }',
      '.scw-bsh-task--unassigned .scw-bsh-task-group-name { color: #b45309; }',
      '.scw-bsh-task--unassigned .scw-bsh-task-ico { color: #b45309; }',
      '.scw-bsh-task-req { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;',
      '  color: #64748b; background: #fff; border: 1px solid #e2e8f0; padding: 4px 7px; border-radius: 5px; }',
      '.scw-bsh-task-status { font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .4px; padding: 4px 8px; border-radius: 5px; white-space: nowrap; }',
      '.scw-bsh-task-status--pending { background: #fef3c7; color: #b45309; }',
      '.scw-bsh-task-status--active  { background: #dbeafe; color: #1d4ed8; }',
      '.scw-bsh-task-status--done    { background: #d1fae5; color: #047857; }',
      '.scw-bsh-task-status--void    { background: #e2e8f0; color: #475569; }',
      '.scw-bsh-task-status--neutral { background: #f1f5f9; color: #475569; }',
      '.scw-bsh-task-cu { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px;',
      '  border-radius: 6px; background: #efecfd; color: #5a48d6; border: 1px solid #d6cffb;',
      '  font: 600 11px/1.2 system-ui, sans-serif; white-space: nowrap; }',
      '.scw-bsh-task-cu-id { font: 600 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .85; }',
      '.scw-bsh-task-cu-none { color: #94a3b8; font-style: italic; }',
      '.scw-bsh-task--nolink .scw-bsh-task-cu { background: #f1f5f9; border-color: #e2e8f0; color: #64748b; }',
      '.scw-bsh-task-dates { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: #475569;',
      '  margin-left: auto; }',
      '.scw-bsh-task-date b { display: inline-block; margin-right: 5px; font-size: 9.5px; font-weight: 700;',
      '  color: #94a3b8; text-transform: uppercase; letter-spacing: .3px; }',
      '.scw-bsh-empty { margin-top: 8px; font-size: 12.5px; color: #94a3b8; font-style: italic; }',

      /* playbook */
      '.scw-bsh-flags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }',
      '.scw-bsh-flag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px;',
      '  border-radius: 5px; background: #f1f5f9; color: #475569; font: 600 11.5px/1.2 system-ui, sans-serif; }',
      '.scw-bsh-flag-dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; }',
      '.scw-bsh-flag--yes { background: #fff7ed; color: #c2410c; }',
      '.scw-bsh-flag--yes .scw-bsh-flag-dot { background: #ed8326; }',
      '.scw-bsh-notes { margin-top: 10px; }',
      '.scw-bsh-notes-toggle { cursor: pointer; font: 600 12px/1.3 system-ui, sans-serif; color: #334155;',
      '  list-style: none; display: inline-flex; align-items: center; gap: 6px; user-select: none; }',
      '.scw-bsh-notes-toggle::-webkit-details-marker { display: none; }',
      '.scw-bsh-notes-toggle::before { content: ""; width: 0; height: 0; border-left: 5px solid #94a3b8;',
      '  border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform .12s; }',
      '.scw-bsh-notes[open] > .scw-bsh-notes-toggle::before { transform: rotate(90deg); }',
      '.scw-bsh-notes-body { margin-top: 8px; padding: 10px 14px; border-radius: 8px; background: #f8fafc;',
      '  border: 1px solid #f1f5f9; font-size: 13px; color: #334155; line-height: 1.5;',
      '  max-height: 260px; overflow: auto; }',
      '.scw-bsh-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }',
      '.scw-bsh-row { display: grid; grid-template-columns: 150px 1fr; gap: 4px 14px; align-items: start; }',
      '.scw-bsh-row-label { font: 600 11px/1.4 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .3px; color: #94a3b8; padding-top: 1px; }',
      '.scw-bsh-row-val { font-size: 13px; color: #334155; line-height: 1.45; min-width: 0; }',
      '.scw-bsh-row-val a { color: #1d4ed8; }',

      '@media (max-width: 760px) {',
      '  .scw-bsh-top-side { align-items: flex-start; }',
      '  .scw-bsh-links, .scw-bsh-facts { justify-content: flex-start; }',
      '  .scw-bsh-fact { align-items: flex-start; }',
      '  .scw-bsh-task-dates { margin-left: 0; }',
      '  .scw-bsh-row { grid-template-columns: 1fr; }',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── bindings ────────────────────────────────────────────────
  function bind(viewId) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(viewId, transformHeader, EVENT_NS);
    } else {
      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, transformHeader);
    }
  }

  injectStyles();
  bind(CONFIG.headerView);
  // The survey grid renders later in scene order (and re-renders after inline
  // edits / refreshes) — each render re-runs the header so the task strip
  // reflects the rows that just landed.
  bind(CONFIG.surveyView);
  if (document.getElementById(CONFIG.headerView)) setTimeout(transformHeader, 50);

  // Public refresh hook (other features can force a re-scrape).
  window.SCW = window.SCW || {};
  SCW.buildSowHeader = SCW.buildSowHeader || {};
  SCW.buildSowHeader.refresh = transformHeader;
})();
/*** END BUILD SOW PROJECT HEADER ******************************************/
