/*** MDF/IDF SITE TOOLS — "+ Add MDF/IDF" modal (Make 22.02) + "Merge…" (Make 22.03) ***/
/**
 * Rides the site route (mdf-site-route.js): only a login the route is ON for gets these, on the
 * three pages that carry a site closet grid — Build SOW (worksheet view_3962, grid view_4166),
 * Reconcile Bids (bid-review-v2, grid view_4167), Manage Deployment (worksheet view_4093, grid
 * view_4168). Everyone else keeps the native Knack add forms and has no Merge.
 *
 * "+ Add MDF/IDF" (worksheet toolbar, reconcile toolbar) opens a modal that lists the closets
 * ALREADY at the project's site first ("is it one of these?"), then type / ## / name / notes.
 * The ## is prefilled with the next free IDF number at the site and refused when taken (HEADENDs
 * never carry one). Submit = one POST to MAKE_MDF_IDF_WEBHOOK, action 'create'; Make reads the
 * project's site, re-checks the ##, creates the closet on the project ("created on") AND the site,
 * and answers { ok, id } (409 number-taken, 422 no-site).
 *
 * SURVEY mode (LIVE for every login, 2026-11-12 — not behind the site route): the sub's survey
 * worksheet (view_3505, config `mdfAddModal: 'survey'`) opens the same modal over the request's
 * project's closets (view_3617). The page cannot always tell its project, so 22.02 reads it off the
 * survey request (projectId rides along only when the page knows it). The POST adds surveyRequestId,
 * numberScope 'project' (the ## is
 * checked and numbered on the project, the page shows nothing else), lifecycle 'proposed' and the
 * sub's note as a stamped survey-note entry (surveyNotes → field_2457). Make creates the closet on
 * the request's project + the project's site, links it to the request both ways (field_2435, the
 * request's field_2438). It replaces the native form view_3773, which let the sub pick the project
 * and set no site. A 22.02 without the patch drops surveyNotes (its reply has no
 * surveyNotesSaved): the page appends the note itself through view_3617.
 *
 * "Merge…" (the closet's pencil panel on the worksheets, its gear panel on the reconcile grid):
 * the closet the panel is open on is the KEEPER; the modal lists the site's other closets, the
 * user ticks the duplicates (amber note when the type or ## differ) and confirms twice. One POST
 * to MAKE_MDF_MERGE_WEBHOOK { runId, keeperId, loserIds }. 22.03 (v2, 2026-11-11) runs merges at
 * different sites side by side and holds the SITE while it works (CORE_site "SYS_merge lock"): it
 * answers at once with { ok, started } or refuses with 409 { error: 'busy', keeperId, by, since }
 * when another merge is running at that site (the window says who, into which closet, how long
 * ago, and nothing is sent). The progress window then follows the keeper's "SYS_merge progress"
 * (step 8 = done); an older 22.03 with no reply / no progress falls back to re-reading the site
 * grid until every loser is gone from it or reads merged.
 */
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var CONFIG = {
    fields: {
      type: 'field_1641', num: 'field_2458', name: 'field_1943', display: 'field_1642',
      notes: 'field_1643', lifecycle: 'field_2845', project: 'field_1648'
    },
    pageSlugs: ['build-sow', 'review-bids', 'deploy'],
    mergePollMs: [5000, 12000, 25000, 45000, 75000, 120000],   // background re-reads (after a stalled window is closed)
    progressPollMs: 2000,     // the merge window reads the keeper's progress this often
    gridCheckEvery: 3,        // … and re-reads the site grid every Nth poll (losers merged / gone)
    stallMs: 90000,           // no progress for this long → say so, allow Close
    progressField: '',        // OPS_MDF-IDF "SYS_merge progress"; '' = find it by the run id in the record
    stepsPerLoser: 7,
    createRefreshMs: [1500, 6000],
    surveyProjectField: 'field_2346',   // SURVEY_request REL_project
    surveyPreviewEmails: [],            // non-empty = survey-mode modal only for these logins
    requestTimeoutMs: 40000,
    styleId: 'scw-mdf-site-tools-css'
  };
  var P = 'scw-mst';

  // ── switches ─────────────────────────────────────────────────────────
  function hook(key) {
    var u = (SCW.CONFIG || {})[key];
    return (typeof u === 'string' && /^https:\/\/hook\./.test(u)) ? u : '';
  }
  function routeOn() { return !!(SCW.mdfSiteRoute && SCW.mdfSiteRoute.active()); }
  function siteGrid(key) { return !!(key && SCW.mdfSiteRoute && SCW.mdfSiteRoute.isSiteGrid(key)); }
  /** gridKey = the closet grid the page reads; the tools run only when it is a site grid. */
  function canAdd(gridKey) { return routeOn() && siteGrid(gridKey) && !!hook('MAKE_MDF_IDF_WEBHOOK'); }
  function canMerge(gridKey) { return routeOn() && siteGrid(gridKey) && !!hook('MAKE_MDF_MERGE_WEBHOOK'); }

  // ── the sub's survey page (2026-11-12) ───────────────────────────────
  // "+ Add MDF/IDF" on a worksheet whose config says `mdfAddModal: 'survey'` (view_3505) opens
  // the same modal in SURVEY mode for every login, site route or not: Make 22.02 creates the
  // closet on the request's project + its site, lifecycle proposed, linked to the survey request
  // both ways (field_2435 + the request's field_2438), with the sub's note as a stamped survey
  // note. The Knack form it replaces (view_3773 on new-add-mdfidf) let the sub pick any project
  // and set no site.
  function viewCfgOf(viewKey) {
    var wv2 = SCW.worksheetV2;
    try { return (wv2 && wv2.cfg && typeof wv2.cfg.viewCfg === 'function' && wv2.cfg.viewCfg(viewKey)) || null; }
    catch (e) { return null; }
  }
  function previewOk() {
    var list = CONFIG.surveyPreviewEmails || [];
    if (!list.length) return true;
    var me = email().toLowerCase();
    return list.some(function (e) { return String(e).toLowerCase() === me; });
  }
  function surveyCtx() {
    var me = SCW.mdfEdit && typeof SCW.mdfEdit.surveyContext === 'function' ? SCW.mdfEdit.surveyContext() : null;
    return me && me.id ? me : null;
  }
  /** The view config's closet grid when this worksheet adds closets in survey mode, else ''. */
  function surveyGridOf(viewKey) {
    var vc = viewCfgOf(viewKey);
    return (vc && vc.mdfAddModal === 'survey' && vc.mdfSourceViewKey) || '';
  }
  function canAddSurvey(viewKey) {
    return !!(surveyGridOf(viewKey) && hook('MAKE_MDF_IDF_WEBHOOK') && previewOk() && surveyCtx());
  }
  /** The survey request's project when the page happens to carry it (view_3504's REL_project
   *  field_2346, else a closet on the grid). Informational only: 22.02 reads the project off the
   *  survey request itself, so a survey page that cannot tell still adds closets. */
  function surveyProjectId(requestId, gridKey) {
    var own = Object.prototype.hasOwnProperty;
    var pf = CONFIG.surveyProjectField + '_raw';
    try {
      var views = (window.Knack && Knack.views) || {};
      for (var vk in views) {
        if (!own.call(views, vk)) continue;
        var mdl = views[vk] && views[vk].model;
        if (!mdl) continue;
        var cands = [];
        if (mdl.attributes) cands.push(mdl.attributes);
        var rows = (mdl.data && mdl.data.models) || [];
        for (var i = 0; i < rows.length; i++) cands.push(rows[i] && (rows[i].attributes || rows[i]));
        for (var j = 0; j < cands.length; j++) {
          var a = cands[j];
          if (a && a.id === requestId && Array.isArray(a[pf]) && a[pf][0] && a[pf][0].id) return a[pf][0].id;
        }
      }
    } catch (e) { /* not on a Knack page */ }
    var list = closets(gridKey);
    for (var k = 0; k < list.length; k++) if (list[k].projectId) return list[k].projectId;
    return '';
  }

  // ── helpers ──────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function text(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
    if (typeof v === 'object') return text(v.identifier || v.value || '');
    var d = document.createElement('div');
    d.innerHTML = String(v);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function email() {
    try {
      var a = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      return String((a && a.email) || '');
    } catch (e) { return ''; }
  }
  /** The page's project: the record after the page slug, deepest occurrence first (Knack nests
   *  pages, so the hash can carry several; never take the first match). */
  function projectId() {
    var h = String(window.location.hash || '');
    var best = '';
    for (var i = 0; i < CONFIG.pageSlugs.length; i++) {
      var re = new RegExp('(?:^|/)' + CONFIG.pageSlugs[i] + '/([0-9a-f]{24})', 'g');
      var m;
      while ((m = re.exec(h))) best = m[1];
      if (best) return best;
    }
    var all = h.match(/[0-9a-f]{24}/g);
    return all ? all[all.length - 1] : '';
  }

  /** The closets a site grid holds, as plain objects. */
  function closets(gridKey) {
    var out = [];
    try {
      var v = window.Knack && Knack.views && Knack.views[gridKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      var F = CONFIG.fields;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (!a || !a.id) continue;
        var type = text(a[F.type]).toUpperCase();
        var numRaw = a[F.num + '_raw'];
        var num = (numRaw === '' || numRaw == null) ? text(a[F.num]) : String(numRaw);
        var proj = a[F.project + '_raw'];
        out.push({
          id: a.id,
          type: /HEADEND|MDF/.test(type) ? 'HEADEND' : (type ? 'IDF' : ''),
          number: num,
          name: text(a[F.name]),
          display: text(a[F.display]),
          notes: text(a[F.notes]),
          lifecycle: text(a[F.lifecycle]).toLowerCase(),
          projectId: Array.isArray(proj) && proj[0] ? proj[0].id : ''
        });
      }
    } catch (e) { /* model not loaded */ }
    return out;
  }
  function live(list) { return list.filter(function (c) { return c.lifecycle !== 'merged'; }); }
  function labelOf(c) {
    if (c.display) return c.display;
    var t = c.type || 'MDF/IDF';
    return t + (c.type === 'IDF' && c.number ? ' ' + pad(c.number) : '') + (c.name ? ': ' + c.name : '');
  }
  function pad(n) { var s = String(n); return /^\d$/.test(s) ? '0' + s : s; }
  function usedNumbers(list) {
    var used = {};
    live(list).forEach(function (c) {
      if (c.type === 'IDF' && c.number !== '' && !isNaN(parseFloat(c.number))) used[String(parseFloat(c.number))] = c;
    });
    return used;
  }
  function nextFree(list) {
    var used = usedNumbers(list), max = 0;
    for (var k in used) max = Math.max(max, parseFloat(k));
    return String(max + 1);
  }

  /** Line items on this page that point at each closet (the worksheet's own records). */
  function pageCounts(viewKey) {
    var counts = {};
    try {
      var wv2 = SCW.worksheetV2;
      var recs = (wv2 && wv2.data && typeof wv2.data.readRecords === 'function') ? wv2.data.readRecords(viewKey) : [];
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        ['field_1946_raw', 'field_2818_raw'].forEach(function (k) {
          var v = r[k];
          var id = Array.isArray(v) && v[0] ? v[0].id : '';
          if (id) counts[id] = (counts[id] || 0) + 1;
        });
      }
    } catch (e) { /* not a worksheet page */ }
    return counts;
  }

  // ── refresh ──────────────────────────────────────────────────────────
  function refetchGrid(gridKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[gridKey];
      if (v && v.model && typeof v.model.fetch === 'function') return v.model.fetch();
    } catch (e) { /* not on the page */ }
    return null;
  }
  function refreshHost(viewKey) {
    try {
      var wv2 = SCW.worksheetV2;
      if (wv2 && wv2.cfg && wv2.cfg.viewCfg(viewKey) && wv2.data && typeof wv2.data.refetchAndNotify === 'function') {
        wv2.data.refetchAndNotify(viewKey);
        return;
      }
      var br2 = SCW.bidReviewV2;
      if (br2 && br2.data && typeof br2.data.refetchAll === 'function') br2.data.refetchAll();
    } catch (e) { /* host gone */ }
  }

  // ── POST ─────────────────────────────────────────────────────────────
  /** → Promise<{ status, json }>; a CORS-opaque reply is status 0. */
  function post(url, payload) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CONFIG.requestTimeoutMs) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (t) {
        var json = null;
        try { json = JSON.parse(t); } catch (e) { /* "Accepted" or empty */ }
        return { status: res.status, json: json, text: t };
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      var aborted = err && err.name === 'AbortError';
      return { status: aborted ? -1 : 0, json: null, text: '' };
    });
  }

  // ── UI ───────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CONFIG.styleId)) return;
    var css = [
      '.' + P + '-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 100010;',
      '  display: flex; align-items: flex-start; justify-content: center; padding: 6vh 16px; overflow: auto; }',
      '.' + P + '-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 560px;',
      '  box-shadow: 0 20px 50px rgba(15,23,42,.3); font-size: 14px; color: #0f172a; }',
      '.' + P + '-head { padding: 16px 20px 8px; font-size: 17px; font-weight: 700; }',
      '.' + P + '-sub { padding: 0 20px 10px; color: #475569; line-height: 1.45; }',
      '.' + P + '-body { padding: 4px 20px 8px; }',
      '.' + P + '-sec { margin: 10px 0 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }',
      '.' + P + '-list { max-height: 220px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; }',
      '.' + P + '-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-top: 1px solid #f1f5f9; }',
      '.' + P + '-row:first-child { border-top: 0; }',
      '.' + P + '-row label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; flex: 1; }',
      '.' + P + '-row small { display: block; color: #64748b; }',
      '.' + P + '-row .' + P + '-warn { color: #b45309; }',
      '.' + P + '-here { font-size: 11px; color: #1d4ed8; white-space: nowrap; }',
      '.' + P + '-empty { padding: 10px; color: #64748b; }',
      '.' + P + '-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
      '.' + P + '-fld { display: flex; flex-direction: column; gap: 4px; }',
      '.' + P + '-fld--wide { grid-column: 1 / -1; }',
      '.' + P + '-fld span { font-size: 12px; font-weight: 600; color: #334155; }',
      '.' + P + '-fld input, .' + P + '-fld textarea, .' + P + '-fld select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; font: inherit; }',
      '.' + P + '-fld textarea { min-height: 64px; resize: vertical; }',
      '.' + P + '-chips { display: flex; gap: 6px; }',
      '.' + P + '-chip { border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-weight: 600; }',
      '.' + P + '-chip[aria-pressed="true"] { background: #0f4c75; border-color: #0f4c75; color: #fff; }',
      '.' + P + '-note { margin-top: 8px; color: #b45309; min-height: 1.2em; }',
      '.' + P + '-err { color: #b91c1c; }',
      '.' + P + '-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #f1f5f9; }',
      '.' + P + '-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; }',
      '.' + P + '-btn--go { background: #0f4c75; border-color: #0f4c75; color: #fff; }',
      '.' + P + '-btn--danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }',
      '.' + P + '-btn[disabled] { opacity: .55; cursor: default; }',
      '.' + P + '-btn--merge { margin-right: auto; }',
      '.' + P + '-toast { position: fixed; right: 18px; bottom: 18px; z-index: 100011; max-width: 380px; background: #0f172a; color: #fff;',
      '  padding: 10px 14px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.25); line-height: 1.4; }',
      '.' + P + '-toast--warn { background: #92400e; }',
      '.' + P + '-bar { height: 12px; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin: 10px 0 8px; position: relative; }',
      '.' + P + '-bar__fill { height: 100%; width: 0; background: #0f4c75; border-radius: 999px; transition: width .4s ease; }',
      '.' + P + '-bar.is-waiting .' + P + '-bar__fill { width: 35% !important; position: absolute; left: -35%;',
      '  animation: ' + P + '-slide 1.4s ease-in-out infinite; }',
      '.' + P + '-bar.is-done .' + P + '-bar__fill { background: #15803d; }',
      '@keyframes ' + P + '-slide { 0% { left: -35%; } 100% { left: 100%; } }',
      '.' + P + '-pline { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }',
      '.' + P + '-pstatus { font-weight: 600; }',
      '.' + P + '-ptime { color: #64748b; font-variant-numeric: tabular-nums; }',
      '.' + P + '-pstep { color: #64748b; margin-top: 2px; min-height: 1.2em; }'
    ].join('\n');
    var st = document.createElement('style');
    st.id = CONFIG.styleId;
    st.textContent = css;
    document.head.appendChild(st);
  }

  var _toastTimer = null;
  function toast(msg, warn) {
    injectCss();
    var el = document.querySelector('.' + P + '-toast');
    if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
    el.className = P + '-toast' + (warn ? ' ' + P + '-toast--warn' : '');
    el.textContent = msg;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 7000);
  }

  function shell(title, sub) {
    injectCss();
    closeModal();
    var ov = document.createElement('div');
    ov.className = P + '-overlay';
    ov.innerHTML = '<div class="' + P + '-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="' + P + '-head">' + esc(title) + '</div>' +
      (sub ? '<div class="' + P + '-sub">' + sub + '</div>' : '') +
      '<div class="' + P + '-body"></div>' +
      '<div class="' + P + '-foot"></div></div>';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !ov._busy) closeModal(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    return ov;
  }
  function onKey(e) {
    var ov = document.querySelector('.' + P + '-overlay');
    if (e.key === 'Escape' && ov && !ov._busy) { e.stopPropagation(); closeModal(); }
  }
  function closeModal() {
    var ov = document.querySelector('.' + P + '-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', onKey, true);
  }

  // ── "+ Add MDF/IDF" ──────────────────────────────────────────────────
  /** opts: { viewKey (host), gridKey (the closet grid), mode?: 'survey' }
   *  site mode (the site route): the grid is a SITE grid, ## is checked at the site.
   *  survey mode (the sub's survey page): the grid is the request's project's closets, ## is
   *  checked on the project, the closet is proposed and linked to the survey request. */
  function openAdd(opts) {
    opts = opts || {};
    var survey = opts.mode === 'survey';
    var gridKey = opts.gridKey;
    var site = live(closets(gridKey));
    var ctx = survey ? surveyCtx() : null;
    var pid = survey ? (ctx ? surveyProjectId(ctx.id, gridKey) : '') : projectId();
    var where = survey ? 'on this project' : 'at this site';
    var ov = survey
      ? shell('Add MDF/IDF', 'Add a closet you found on this survey. Check it is not already listed first — ' +
          'SCW reviews every new MDF/IDF.')
      : shell('Add MDF/IDF',
          'MDF/IDFs belong to the <b>site</b>: a new one shows on every project at this site. ' +
          'Check it is not already here first.');
    var body = ov.querySelector('.' + P + '-body');
    var rows = site.slice().sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'HEADEND' ? -1 : 1;
      return (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0) || labelOf(a).localeCompare(labelOf(b));
    }).map(function (c) {
      return '<div class="' + P + '-row"><div>' + esc(labelOf(c)) +
        (!survey && c.projectId && c.projectId !== pid ? '<small>created on another project at this site</small>' : '') +
        (survey && c.lifecycle === 'proposed' ? '<small>added on a survey · SCW has not reviewed it yet</small>' : '') +
        '</div></div>';
    }).join('');
    body.innerHTML =
      '<div class="' + P + '-sec">Already ' + where + ' (' + site.length + ')</div>' +
      '<div class="' + P + '-list">' + (rows || '<div class="' + P + '-empty">None yet.</div>') + '</div>' +
      '<div class="' + P + '-sec">New</div>' +
      '<div class="' + P + '-grid">' +
        '<div class="' + P + '-fld"><span>Type</span><div class="' + P + '-chips">' +
          '<button type="button" class="' + P + '-chip" data-type="HEADEND" aria-pressed="false">HEADEND</button>' +
          '<button type="button" class="' + P + '-chip" data-type="IDF" aria-pressed="true">IDF</button></div></div>' +
        '<label class="' + P + '-fld" data-num-fld><span>IDF ##</span><input type="text" inputmode="numeric" data-in="number" value="' + esc(nextFree(site)) + '"></label>' +
        '<label class="' + P + '-fld ' + P + '-fld--wide"><span>Name</span><input type="text" data-in="name" placeholder="e.g. Warehouse network closet"></label>' +
        (survey
          ? '<label class="' + P + '-fld ' + P + '-fld--wide"><span>Survey notes</span><textarea data-in="notes" placeholder="Where it is, how to get in, what is in it"></textarea></label>'
          : '<label class="' + P + '-fld ' + P + '-fld--wide"><span>Notes</span><textarea data-in="notes" placeholder="Where it is, what is in it"></textarea></label>') +
      '</div>' +
      '<div class="' + P + '-note" aria-live="polite"></div>';
    var foot = ov.querySelector('.' + P + '-foot');
    foot.innerHTML = '<button type="button" class="' + P + '-btn" data-act="cancel">Cancel</button>' +
      '<button type="button" class="' + P + '-btn ' + P + '-btn--go" data-act="add">Add MDF/IDF</button>';
    var note = body.querySelector('.' + P + '-note');
    var numIn = body.querySelector('[data-in="number"]');
    var numFld = body.querySelector('[data-num-fld]');
    var type = 'IDF';

    function check() {
      note.className = P + '-note';
      if (type !== 'IDF') { note.textContent = ''; return true; }
      var v = String(numIn.value || '').trim();
      if (v === '') { note.textContent = 'Blank takes the next free number ' + where + '.'; return true; }
      if (!/^\d+$/.test(v)) { note.textContent = 'The ## is a whole number.'; return false; }
      var taken = usedNumbers(site)[String(parseFloat(v))];
      if (taken) { note.textContent = 'IDF ' + pad(v) + ' already exists ' + where + ' (' + labelOf(taken) + ').'; return false; }
      note.textContent = '';
      return true;
    }
    function fail(msg) {
      ov._busy = false;
      addBtn.disabled = false;
      addBtn.textContent = 'Add MDF/IDF';
      note.className = P + '-note ' + P + '-err';
      note.textContent = msg;
    }
    body.querySelectorAll('.' + P + '-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        type = b.getAttribute('data-type');
        body.querySelectorAll('.' + P + '-chip').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        numFld.style.display = type === 'IDF' ? '' : 'none';
        check();
      });
    });
    numIn.addEventListener('input', check);
    foot.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    var addBtn = foot.querySelector('[data-act="add"]');
    addBtn.addEventListener('click', function () {
      if (!check()) return;
      if (survey && !ctx) { fail('Could not tell which survey this page is. Reload the page and try again.'); return; }
      // The survey page need not know its project: 22.02 reads it off the survey request.
      if (!survey && !pid) { fail('Could not tell which project this page is.'); return; }
      var notesText = String(body.querySelector('[data-in="notes"]').value || '').trim();
      var payload = {
        action: 'create',
        projectId: pid || '',
        type: type,
        number: type === 'IDF' ? String(numIn.value || '').trim() : '',
        name: String(body.querySelector('[data-in="name"]').value || '').trim(),
        notes: survey ? '' : notesText,
        lifecycle: survey ? 'proposed' : 'approved',
        triggeredBy: email(),
        source: survey ? 'survey-modal' : 'modal',
        viewKey: opts.viewKey || ''
      };
      var surveyEntry = '';
      if (survey) {
        surveyEntry = notesText && SCW.mdfEdit && typeof SCW.mdfEdit.composeSurveyEntry === 'function'
          ? SCW.mdfEdit.composeSurveyEntry(notesText, ctx.label) : notesText;
        payload.surveyRequestId = ctx.id;
        payload.surveyRequest = ctx.label || '';
        payload.surveyNotes = surveyEntry;
        payload.numberScope = 'project';
      }
      ov._busy = true;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      post(hook('MAKE_MDF_IDF_WEBHOOK'), payload).then(function (r) {
        var j = r.json;
        if (j && j.ok) {
          closeModal();
          var what = j.type === 'IDF' || type === 'IDF' ? 'IDF ' + pad(j.number || payload.number) : 'HEADEND';
          toast('Added ' + what + (payload.name ? ': ' + payload.name : '') + '. ' +
            (survey ? 'It is on this survey now; SCW reviews it.' : 'It shows on every project at this site.'));
          // An older 22.02 drops surveyNotes; the page adds the note itself then.
          var appendNote = survey && surveyEntry && j.id && j.surveyNotesSaved !== true;
          CONFIG.createRefreshMs.forEach(function (ms, i) {
            setTimeout(function () {
              var p = refetchGrid(gridKey);
              if (i === 0) {
                var after = function () {
                  refreshHost(opts.viewKey);
                  if (appendNote) addSurveyNote(gridKey, j.id, notesText, ctx.label);
                };
                if (p && typeof p.then === 'function') p.then(after, after);
                else after();
              }
            }, ms);
          });
          return;
        }
        if (j && j.ok === false) {
          if (survey && j.error === 'no-site') {
            fail('SCW has to finish setting up this project (it has no Site yet) before an MDF/IDF can be added here. Ask your SCW contact.');
            return;
          }
          fail(j.message || 'Make refused it (' + (j.error || r.status) + ').');
          return;
        }
        if (survey && r.status >= 200 && r.status < 300) {
          // 22.02 answered without its JSON: the run ended before a reply (a scenario without the
          // survey route stops when the page sends no project). Nothing was created.
          fail('Make took the request but did not create the MDF/IDF (22.02 sent no answer). Nothing was added.');
          try { console.warn('[scw-mdf-add] 22.02 replied ' + r.status + ' "' + String(r.text || '').slice(0, 80) +
            '" with no JSON — import the survey version of 22.02 (it looks the project up from the survey request).'); } catch (e) { /* no console */ }
          return;
        }
        if (r.status === 0 || (r.status >= 200 && r.status < 300)) {
          // Delivered, but no answer we can read ("Accepted", a CORS-opaque reply).
          closeModal();
          toast('Sent. The list refreshes when Make has created it.');
          CONFIG.mergePollMs.slice(0, 3).forEach(function (ms) {
            setTimeout(function () { refetchGrid(gridKey); refreshHost(opts.viewKey); }, ms);
          });
          return;
        }
        fail(r.status === -1 ? 'No answer from Make in time. Check the list before trying again.'
                             : 'Make did not take it (HTTP ' + r.status + ').');
      });
    });
    setTimeout(function () { var n = body.querySelector('[data-in="name"]'); if (n) n.focus(); }, 0);
    return ov;
  }
  /** The survey note on a closet 22.02 created without it (an older scenario): the same stamped
   *  append the closet cards use, through the closet grid. */
  function addSurveyNote(gridKey, recordId, textValue, label) {
    if (!(SCW.mdfEdit && typeof SCW.mdfEdit.appendSurveyNote === 'function')) return;
    SCW.mdfEdit.appendSurveyNote({
      viewKey: gridKey, recordId: recordId, text: textValue, survey: label, current: '',
      onDone: function () { refetchGrid(gridKey); },
      onError: function (msg) { toast('The MDF/IDF was added, but its survey note did not save — add it on the closet card. ' + (msg || ''), true); }
    });
  }

  // ── "Merge…" ─────────────────────────────────────────────────────────
  /** opts: { viewKey (host), gridKey (site grid), keeperId, keeperLabel } */
  function openMerge(opts) {
    opts = opts || {};
    var gridKey = opts.gridKey;
    var all = live(closets(gridKey));
    var keeper = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === opts.keeperId) keeper = all[i];
    var keeperLabel = keeper ? labelOf(keeper) : (opts.keeperLabel || 'this MDF/IDF');
    var others = all.filter(function (c) { return c.id !== opts.keeperId; });
    var counts = pageCounts(opts.viewKey);
    var pid = projectId();
    others.sort(function (a, b) {
      var ka = keeper && a.type === keeper.type ? 0 : 1, kb = keeper && b.type === keeper.type ? 0 : 1;
      return ka - kb || labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true });
    });
    var ov = shell('Merge into ' + keeperLabel,
      'Keep <b>' + esc(keeperLabel) + '</b>. Tick the duplicates of it. Everything pointing at them moves here: SOW lines, ' +
      'survey items, install items, bid revision lines, survey requests and photos; their notes are added below this one\'s. ' +
      'They stay as records marked <b>merged</b> and drop out of every list.');
    var body = ov.querySelector('.' + P + '-body');
    function warnFor(c) {
      if (!keeper) return '';
      if (c.type && keeper.type && c.type !== keeper.type) return 'a ' + c.type + ', this is a ' + keeper.type;
      if (c.type === 'IDF' && keeper.type === 'IDF' && c.number && keeper.number &&
          parseFloat(c.number) !== parseFloat(keeper.number)) return 'IDF ' + pad(c.number) + ', this is IDF ' + pad(keeper.number);
      return '';
    }
    body.innerHTML =
      '<div class="' + P + '-sec">Other MDF/IDFs at this site (' + others.length + ')</div>' +
      '<div class="' + P + '-list">' + (others.map(function (c) {
        var w = warnFor(c);
        var here = counts[c.id] ? '<span class="' + P + '-here">' + counts[c.id] + ' item' + (counts[c.id] === 1 ? '' : 's') + ' here</span>' : '';
        return '<div class="' + P + '-row"><label><input type="checkbox" data-id="' + esc(c.id) + '">' +
          '<span>' + esc(labelOf(c)) +
          (c.projectId && c.projectId !== pid ? '<small>created on another project at this site</small>' : '') +
          (c.notes ? '<small>' + esc(c.notes.slice(0, 120)) + (c.notes.length > 120 ? '…' : '') + '</small>' : '') +
          (w ? '<small class="' + P + '-warn">Different: ' + esc(w) + '</small>' : '') +
          '</span></label>' + here + '</div>';
      }).join('') || '<div class="' + P + '-empty">No other MDF/IDFs at this site.</div>') + '</div>' +
      '<div class="' + P + '-note" aria-live="polite"></div>';
    var foot = ov.querySelector('.' + P + '-foot');
    foot.innerHTML = '<button type="button" class="' + P + '-btn" data-act="cancel">Cancel</button>' +
      '<button type="button" class="' + P + '-btn ' + P + '-btn--go" data-act="merge" disabled>Merge</button>';
    var note = body.querySelector('.' + P + '-note');
    var goBtn = foot.querySelector('[data-act="merge"]');
    var armed = false;
    function picked() {
      return Array.prototype.map.call(body.querySelectorAll('input[type="checkbox"]:checked'), function (b) { return b.getAttribute('data-id'); });
    }
    function paint() {
      var n = picked().length;
      armed = false;
      goBtn.className = P + '-btn ' + P + '-btn--go';
      goBtn.disabled = !n;
      goBtn.textContent = n ? 'Merge ' + n + ' into ' + keeperLabel : 'Merge';
      var mixed = picked().some(function (id) {
        for (var k = 0; k < others.length; k++) if (others[k].id === id) return !!warnFor(others[k]);
        return false;
      });
      note.className = P + '-note';
      note.textContent = mixed ? 'Some ticked MDF/IDFs differ from this one. Merge them only if they are the same closet.' : '';
    }
    body.addEventListener('change', paint);
    foot.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    goBtn.addEventListener('click', function () {
      var ids = picked();
      if (!ids.length) return;
      if (!armed) {
        armed = true;
        goBtn.className = P + '-btn ' + P + '-btn--danger';
        goBtn.textContent = 'Yes, merge ' + ids.length + ' (cannot be undone here)';
        return;
      }
      var labels = ids.map(function (id) {
        for (var k = 0; k < others.length; k++) if (others[k].id === id) return labelOf(others[k]);
        return id;
      });
      ov._busy = true;
      goBtn.disabled = true;
      goBtn.textContent = 'Sending…';
      var runId = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      post(hook('MAKE_MDF_MERGE_WEBHOOK'), {
        runId: runId,
        keeperId: opts.keeperId,
        loserIds: ids,
        keeperLabel: keeperLabel,
        loserLabels: labels,
        projectId: pid,
        triggeredBy: email(),
        source: 'modal',
        viewKey: opts.viewKey || ''
      }).then(function (r) {
        var j = r.json;
        var run = { runId: runId, gridKey: gridKey, viewKey: opts.viewKey, keeperId: opts.keeperId,
                    keeperLabel: keeperLabel, loserIds: ids };
        // 22.03 v2 answers once it holds the site: { ok, started } or a refusal.
        if (j && j.ok && j.started) { run.started = true; runProgress(ov, run); return; }
        if (j && j.ok === false) {
          ov._busy = false;
          armed = false;
          paint();
          note.className = P + '-note' + (j.error === 'busy' ? '' : ' ' + P + '-err');
          note.textContent = j.error === 'busy' ? busyText(j, all, opts.keeperId)
            : (j.message || 'Make refused the merge (' + (j.error || r.status) + ').');
          if (j.error === 'keeper-merged') refetchGrid(gridKey);
          return;
        }
        // Delivered with no answer we can read (an older 22.03, "Accepted", a CORS-opaque reply).
        if (r.status === 0 || (r.status >= 200 && r.status < 300)) { runProgress(ov, run); return; }
        ov._busy = false;
        armed = false;
        paint();
        note.className = P + '-note ' + P + '-err';
        note.textContent = r.status === -1 ? 'No answer from Make in time. Check 22.03\'s history before trying again.'
                                           : 'Make did not take it (HTTP ' + r.status + ').';
      });
    });
    return ov;
  }

  /** The refusal when another merge holds this site: which closet, who, how long ago. */
  function busyText(j, list, keeperId) {
    var into = '';
    if (j.keeperId) {
      if (j.keeperId === keeperId) into = ' into this MDF/IDF';
      else for (var i = 0; i < list.length; i++) if (list[i].id === j.keeperId) into = ' into ' + labelOf(list[i]);
    }
    var who = j.by ? ' by ' + j.by : '';
    var since = parseFloat(j.since), ago = '';
    if (!isNaN(since) && since > 0) {
      var min = Math.max(0, Math.round((Date.now() / 1000 - since) / 60));
      ago = min < 1 ? ' less than a minute ago' : ' ' + min + ' minute' + (min === 1 ? '' : 's') + ' ago';
    }
    return 'Another merge is running at this site' + into + (who || ago ? ' (started' + who + ago + ')' : '') +
      '. Nothing was sent. Try again when it finishes.';
  }

  // ── the merge progress window ────────────────────────────────────────
  // 22.03 writes "<runId>|<loser>|<losers>|<step>|<i>|<of>|<text>" onto the KEEPER as it goes
  // (steps 1-5 = SOW lines, survey items, install items, bid revision lines, survey requests,
  // i of the records found; 6 = keeper takes photos / notes; 7 = loser marked merged). The
  // window reads the keeper through the site grid (a view-based GET — the progress field must be
  // a column of the grid) and turns that into one bar. With no progress readable (field not
  // there yet) the bar runs by losers merged, behind a "waiting for Make" stripe.

  /** "<runId>|…" → { loser, losers, step, i, of, text } or null. */
  function parseProgress(v, runId) {
    v = String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
    if (!runId || v.indexOf(runId + '|') !== 0) return null;
    var p = v.split('|');
    if (p.length < 7) return null;
    var n = function (x) { var f = parseFloat(x); return isNaN(f) ? 0 : f; };
    return { loser: n(p[1]), losers: n(p[2]), step: n(p[3]), i: n(p[4]), of: n(p[5]), text: p.slice(6).join('|') };
  }
  /** Overall share done, 0..1. */
  function progressShare(pr, steps) {
    if (!pr || !pr.losers) return 0;
    if (!pr.loser) return 0.02;
    var within = pr.of > 0 ? Math.min(1, pr.i / pr.of) : 1;
    var done = (pr.loser - 1) * steps + (Math.max(1, pr.step) - 1) + within;
    return Math.max(0.02, Math.min(1, done / (pr.losers * steps)));
  }
  /** Done = 22.03 v2's closing marker (step 8, written once every loser is finished), or the
   *  last loser's "marked merged" step (an older 22.03 that writes no closing marker). */
  function progressDone(pr, steps) {
    if (!pr) return false;
    if (pr.step > steps) return true;
    return !!(pr.losers && pr.loser >= pr.losers && pr.step >= steps);
  }
  /** The progress value off a record: the configured field, else any field carrying this run. */
  function progressOf(rec, runId) {
    if (!rec) return null;
    var key = CONFIG.progressField;
    if (key) return parseProgress(rec[key + '_raw'] != null ? rec[key + '_raw'] : rec[key], runId);
    for (var k in rec) {
      if (typeof rec[k] === 'string' && rec[k].indexOf(runId + '|') >= 0) {
        var pr = parseProgress(rec[k], runId);
        if (pr) return pr;
      }
    }
    return null;
  }
  /** One view-based GET of the keeper → Promise<record | null>. */
  function readKeeper(gridKey, keeperId) {
    return new Promise(function (resolve) {
      try {
        if (typeof SCW.knackAjax !== 'function' || typeof SCW.knackRecordUrl !== 'function') { resolve(null); return; }
        SCW.knackAjax({
          url: SCW.knackRecordUrl(gridKey, keeperId),
          type: 'GET',
          success: function (resp) { resolve((resp && resp.record) || resp || null); },
          error: function () { resolve(null); }
        });
      } catch (e) { resolve(null); }
    });
  }

  /** Does the grid's model carry this field? (A view-based read only returns its columns.) */
  function servesField(gridKey, key) {
    try {
      var ms = Knack.views[gridKey].model.data.models || [];
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i].attributes || ms[i];
        if (a && (a.hasOwnProperty(key) || a.hasOwnProperty(key + '_raw'))) return true;
      }
    } catch (e) { /* not loaded */ }
    return false;
  }
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function runProgress(ov, run) {
    var steps = CONFIG.stepsPerLoser;
    var n = run.loserIds.length;
    var t0 = Date.now();
    ov._busy = true;
    var body = ov.querySelector('.' + P + '-body');
    var foot = ov.querySelector('.' + P + '-foot');
    var head = ov.querySelector('.' + P + '-head');
    var sub = ov.querySelector('.' + P + '-sub');
    head.textContent = 'Merging ' + n + ' into ' + run.keeperLabel;
    if (sub) sub.innerHTML = 'Keep this page open. Make is moving everything that points at the merged ' +
      (n === 1 ? 'MDF/IDF' : 'MDF/IDFs') + ' to the one you keep.';
    body.innerHTML =
      '<div class="' + P + '-bar is-waiting" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
        '<div class="' + P + '-bar__fill"></div></div>' +
      '<div class="' + P + '-pline"><span class="' + P + '-pstatus"></span><span class="' + P + '-ptime">0:00</span></div>' +
      '<div class="' + P + '-pstep"></div>' +
      '<div class="' + P + '-note" aria-live="polite"></div>';
    foot.innerHTML = '<button type="button" class="' + P + '-btn" data-act="close" disabled>Working…</button>';
    var bar = body.querySelector('.' + P + '-bar');
    var fill = body.querySelector('.' + P + '-bar__fill');
    var statusEl = body.querySelector('.' + P + '-pstatus');
    var timeEl = body.querySelector('.' + P + '-ptime');
    var stepEl = body.querySelector('.' + P + '-pstep');
    var note = body.querySelector('.' + P + '-note');
    var closeBtn = foot.querySelector('[data-act="close"]');
    var lastSig = '', lastChange = Date.now(), ticks = 0, finished = false, stalled = false, best = 0, sawProgress = false;
    // Without progress, completion shows only on a grid that drops merged closets or serves
    // FLAG_lifecycle; a grid that does neither can never confirm it (say so, don't spin).
    var gridCanTell = servesField(run.gridKey, CONFIG.fields.lifecycle);

    function setShare(x, determinate) {
      best = Math.max(best, x);
      bar.classList.toggle('is-waiting', !determinate);
      fill.style.width = Math.round(best * 100) + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(best * 100)));
    }
    if (run.started) {
      statusEl.textContent = 'Make has started.';
      setShare(0.02, true);
    } else {
      statusEl.textContent = 'Sent to Make. Waiting for it to start…';
    }
    var clockTimer = setInterval(function () {
      if (!ov.isConnected) { clearInterval(clockTimer); return; }
      timeEl.textContent = clock(Date.now() - t0);
    }, 1000);

    function leaveGuard(e) { e.preventDefault(); e.returnValue = 'A merge is still running.'; return e.returnValue; }
    window.addEventListener('beforeunload', leaveGuard);
    function finish(ok, msg) {
      if (finished) return;
      finished = true;
      window.removeEventListener('beforeunload', leaveGuard);
      ov._busy = false;
      if (ok) {
        clearInterval(clockTimer);
        setShare(1, true);
        bar.classList.add('is-done');
        statusEl.textContent = msg;
        stepEl.textContent = '';
        note.textContent = '';
        refreshHost(run.viewKey);
      }
      closeBtn.disabled = false;
      closeBtn.className = P + '-btn ' + P + '-btn--go';
      closeBtn.textContent = 'Close';
    }
    closeBtn.addEventListener('click', function () {
      if (closeBtn.disabled) return;
      var wasStalled = stalled && !finished;
      finished = true;
      clearInterval(clockTimer);
      window.removeEventListener('beforeunload', leaveGuard);
      closeModal();
      if (wasStalled) watchMerge(run.gridKey, run.viewKey, run.loserIds, run.keeperLabel);
    });

    function lost() {
      var byId = {};
      closets(run.gridKey).forEach(function (c) { byId[c.id] = c; });
      return run.loserIds.filter(function (id) { return !byId[id] || byId[id].lifecycle === 'merged'; }).length;
    }
    function doneMsg() { return 'Merged ' + n + ' into ' + run.keeperLabel + ' in ' + clock(Date.now() - t0) + '.'; }
    function tick() {
      if (finished || !ov.isConnected) return;
      ticks++;
      // The grid is the fallback signal only: once Make's progress is readable it is not refetched
      // until the end (one fetch confirms the merged closets are gone).
      var checkGrid = !sawProgress && ticks % CONFIG.gridCheckEvery === 0;
      Promise.all([
        readKeeper(run.gridKey, run.keeperId),
        checkGrid ? Promise.resolve(refetchGrid(run.gridKey)).then(function () { return lost(); }, function () { return lost(); })
                  : Promise.resolve(null)
      ]).then(function (res) {
        if (finished || !ov.isConnected) return;
        var pr = progressOf(res[0], run.runId);
        var merged = res[1];
        if (pr) sawProgress = true;
        var sig = (pr ? [pr.loser, pr.step, pr.i].join('.') : '') + '/' + (merged == null ? '' : merged);
        if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
        if (pr) {
          setShare(progressShare(pr, steps), true);
          statusEl.textContent = pr.step === 0 ? 'Make has started.'
            : pr.text + (pr.of > 1 ? ' · ' + pr.i + ' of ' + pr.of : '');
          stepEl.textContent = pr.losers > 1 && pr.loser && pr.step <= steps ? 'MDF/IDF ' + pr.loser + ' of ' + pr.losers : '';
        } else if (merged) {
          setShare(merged / n, true);
          statusEl.textContent = merged + ' of ' + n + ' merged';
        }
        if (progressDone(pr, steps) || (merged != null && merged >= n)) {
          Promise.resolve(refetchGrid(run.gridKey)).then(function () { finish(true, doneMsg()); },
                                                         function () { finish(true, doneMsg()); });
          return;
        }
        if (!stalled && Date.now() - lastChange > CONFIG.stallMs) {
          stalled = true;
          note.className = P + '-note';
          note.textContent = (sawProgress || run.started)
            ? 'Make has not reported progress for ' + Math.round(CONFIG.stallMs / 1000) + ' seconds. It may still be ' +
              'working, or it stopped: check 22.03\'s history. You can close this; the page keeps checking.'
            : 'No progress from Make' + (gridCanTell ? '' : ', and this page cannot see merged MDF/IDFs either') +
              '. If 22.03\'s history shows the run working, let it finish and reload the page. You can close this.';
          if (!sawProgress && !run.started) {
            try { console.warn('[scw-mdf-merge] no progress readable for run ' + run.runId + ' — ' + run.gridKey +
              ' must serve the keeper\'s "SYS_merge progress" column' + (gridCanTell ? '' : ' (and FLAG_lifecycle field_2845)')); } catch (e) { /* no console */ }
          }
          finish(false);
          finished = false;          // keep polling while the window is open
          ov._busy = true;
        }
        setTimeout(tick, CONFIG.progressPollMs);
      });
    }
    setTimeout(tick, run.started ? 800 : CONFIG.progressPollMs);
  }

  /** Re-read the site grid on a schedule until every loser is gone from it or reads merged. */
  function watchMerge(gridKey, viewKey, loserIds, keeperLabel) {
    var steps = CONFIG.mergePollMs.slice();
    var started = Date.now();
    function remaining() {
      var byId = {};
      closets(gridKey).forEach(function (c) { byId[c.id] = c; });
      return loserIds.filter(function (id) { return byId[id] && byId[id].lifecycle !== 'merged'; });
    }
    function tick() {
      var p = refetchGrid(gridKey);
      var after = function () {
        var left = remaining();
        if (!left.length) {
          refreshHost(viewKey);
          toast('Merged ' + loserIds.length + ' into ' + keeperLabel + '.');
          return;
        }
        if (!steps.length) {
          refreshHost(viewKey);
          toast(left.length + ' of ' + loserIds.length + ' not merged yet after ' + Math.round((Date.now() - started) / 1000) +
                's. Make may still be running; check 22.03\'s history.', true);
          return;
        }
        setTimeout(tick, steps.shift());
      };
      if (p && typeof p.then === 'function') p.then(after, after);
      else after();
    }
    setTimeout(tick, steps.shift());
  }

  SCW.mdfSiteTools = {
    CONFIG: CONFIG,
    canAdd: canAdd,
    canAddSurvey: canAddSurvey,
    surveyGridOf: surveyGridOf,
    surveyProjectId: surveyProjectId,
    canMerge: canMerge,
    openAdd: openAdd,
    openMerge: openMerge,
    closets: closets,
    nextFree: nextFree,
    projectId: projectId,
    _watchMerge: watchMerge,
    _parseProgress: parseProgress,
    _progressShare: progressShare
  };
})();
