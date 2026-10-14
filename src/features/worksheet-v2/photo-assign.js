/*** WORKSHEET V2 — BULK PHOTO ASSIGN (the v2 "Add Photos" modal) *************
 *
 * PREVIEW — gated to CONFIG.ALLOWED_EMAILS. The listed users get a second,
 * amber "+ Add Photos (v2)" button beside the worksheet toolbar's existing
 * "+ Add Photos"; everyone else sees nothing. The v1 button and modal
 * (bulk-upload.js) are untouched.
 *
 * WHAT IT DOES. Files → Assign → Send. Every queued photo is aimed at ONE
 * device on this worksheet, and at either an OPEN SLOT on that device (an
 * existing DOC_photos record with a type and no image — the "required"
 * placeholders) or a NEW photo (with or without a type). Two modes:
 *
 *   assign — one photo per device (20 shots → 18 cameras). Targets are
 *            pre-filled from the file names (E-001 / e1 / RA-E-02 match the
 *            device's drop label — the same rule Make applied blind; here
 *            the match is VISIBLE and correctable before anything is sent).
 *            "Assign in order" pairs the files, name-sorted, with devices
 *            picked in the canonical MDF/IDF order. A per-row slot menu
 *            fills a required slot or classifies a new photo; a "for all
 *            rows" helper applies one rule to the batch.
 *   copy   — ONE photo to several devices, with ONE rule: fill the "<type>"
 *            slot where the device has one open, otherwise add the photo as
 *            a new "<type>" photo (or: add as a plain new photo everywhere).
 *            The file is uploaded ONCE; every device gets a reference.
 *
 * HOW IT WRITES — no API key in the browser (Known Issue #17 pattern):
 *   1. The binary goes STRAIGHT to Knack's asset store with the user's own
 *      session token (SCW.photoEditPanel.util.uploadImage — the same call
 *      the single-photo modal makes). One asset per unique file.
 *   2. A FILL writes the asset id onto the slot record through the scene's
 *      DOC_photos save view (photo-edit-panel.js SAVE_VIEWS — view-based
 *      PUT, session token). Exactly the single-photo modal's upload pane,
 *      N times. A best-effort second PUT stamps FLAG_complete = Yes and a
 *      history line; its failure never fails the fill.
 *   3. A CREATE posts a small MANIFEST (asset id + target + type + scope,
 *      no file bytes) to SCW.CONFIG.MAKE_PHOTO_ASSIGN_WEBHOOK, where Make
 *      creates the DOC_photos record and connects it — the contract is in
 *      src/config.js. While that URL is blank the Send button refuses
 *      batches that need it and says so; fills work without Make.
 *
 * Not carried over from v1 (deliberately, for now): the IndexedDB queue /
 * resume banner. A closed modal drops its queue.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  var ns = window.SCW.worksheetV2 = window.SCW.worksheetV2 || {};

  var CONFIG = {
    // Preview gate. Empty list = everyone.
    ALLOWED_EMAILS: ['micah.shearer@getscw.com'],
    BUTTON_LABEL:   '+ Add Photos (v2)',
    BUTTON_TITLE:   'Bulk photo assign (v2) — preview: only you see this button',
    WEBHOOK_KEY:    'MAKE_PHOTO_ASSIGN_WEBHOOK',
    // Slot writes are view-based PUTs against Knack (~10 req/s): cap them.
    WRITES_IN_FLIGHT: 3,
    // Make creates the records on its own schedule after the ack; refetch
    // the worksheet once more this long after a batch that sent any.
    MAKE_REFRESH_DELAY_MS: 9000,
    PHOTO_FIELDS: {
      img:       'field_771',
      type:      'field_2445',
      required:  'field_2446',
      completed: 'field_2447',
      history:   'field_2865'
    }
  };

  var STYLE_ID = 'scw-photo-assign-css';
  var ROOT_ID  = 'scw-photo-assign';
  var _state = null;
  var _subscribed = Object.create(null);

  // ── utils ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
  function uuid() {
    var c = window.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function userAttrs() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes && Knack.getUserAttributes();
      return u || null;
    } catch (e) { return null; }
  }
  function userEmail() {
    var u = userAttrs();
    return u && u.email ? String(u.email).trim().toLowerCase() : '';
  }
  function userName() {
    var u = userAttrs();
    if (!u) return '';
    if (typeof u.name === 'string') return u.name;
    if (u.name && (u.name.first || u.name.last)) return [u.name.first, u.name.last].filter(Boolean).join(' ');
    return u.email || '';
  }
  function triggeredBy() {
    var u = userAttrs() || {};
    return { id: u.id || '', name: userName(), email: u.email || '' };
  }
  function isAllowed() {
    if (!CONFIG.ALLOWED_EMAILS.length) return true;
    var email = userEmail();
    if (!email) return false;
    for (var i = 0; i < CONFIG.ALLOWED_EMAILS.length; i++) {
      if (String(CONFIG.ALLOWED_EMAILS[i]).toLowerCase() === email) return true;
    }
    return false;
  }
  function webhookUrl() {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[CONFIG.WEBHOOK_KEY]) || '';
    return (!url || /PLACEHOLDER/.test(url)) ? '' : String(url);
  }
  function pepUtil() {
    var p = window.SCW && SCW.photoEditPanel;
    return (p && p.util) ? p.util : null;
  }
  function saveViewFor(viewKey) {
    var p = window.SCW && SCW.photoEditPanel;
    return (p && p.SAVE_VIEWS && p.SAVE_VIEWS[viewKey]) || '';
  }
  function viewCfg(viewKey) {
    try { return (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(viewKey) : null; }
    catch (e) { return null; }
  }
  function fieldsFor(viewKey) {
    try { return (ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey)) || {}; }
    catch (e) { return {}; }
  }

  // ── Route → target kind + parent scope (what Make connects a NEW photo to)
  function hashStr() { return window.location.hash || ''; }
  /** The line-item object this worksheet renders, as the bulk-upload
   *  linkField names it — the same routing photos.js uses for the v1
   *  "+ Add photo" pill (survey / deploy / sub-deploy / SOW). */
  function targetKind() {
    var h = hashStr();
    if (/site-survey-request-details\/[a-f0-9]{24}/.test(h)) return 'surveyLineItemID';
    if (/(^|\/|#)deploy\/[a-f0-9]{24}/.test(h) || /deployment-dashboard\/[a-f0-9]{24}/.test(h)) {
      return 'installLineItemID';
    }
    return 'sowLineItemID';
  }
  /** { linkField, recordId } — the parent the v1 modal would ship for this
   *  scene (projectID / sowID / surveyID / deploymentID), resolved from the
   *  same bulk-upload VIEWS entry the toolbar's "+ Add Photos" uses. Null
   *  when the route carries no record id. */
  function resolveScope(viewKey) {
    var bu = window.SCW && SCW.bulkUpload;
    var views = (bu && bu.config && bu.config.VIEWS) || [];
    var vc = viewCfg(viewKey);
    var menuViewId = (vc && vc.photoUploadView) || 'view_3482';
    var entry = null;
    for (var i = 0; i < views.length; i++) {
      if (views[i] && views[i].menuViewId === menuViewId) { entry = views[i]; break; }
    }
    var hash = hashStr();
    var contexts = null;
    var targets = (entry && entry.injectTargets) || [];
    for (var t = 0; t < targets.length; t++) {
      if (targets[t] && targets[t].contexts && targets[t].contexts.length) { contexts = targets[t].contexts; break; }
    }
    if (!contexts) {
      contexts = [{
        linkField:   (entry && entry.linkField) || 'sowID',
        hashPattern: (entry && entry.hashPattern) || /(?:scope-of-work-details|build-sow)\/([a-f0-9]{24})/
      }];
    }
    for (var c = 0; c < contexts.length; c++) {
      var m = hash.match(contexts[c].hashPattern);
      if (m && m[1]) return { linkField: contexts[c].linkField, recordId: m[1] };
    }
    var live = hash.replace(/^#/, '').split('?')[0].replace(/\/+$/, '');
    var lm = live.match(/(^|\/)([a-f0-9]{24})$/);
    if (lm) return { linkField: (entry && entry.linkField) || 'sowID', recordId: lm[2] };
    return null;
  }

  // ── Devices on this worksheet ─────────────────────────────────────
  function readText(rec, key) {
    if (!rec || !key) return '';
    var v = rec[key];
    if (v == null || v === '') {
      var raw = rec[key + '_raw'];
      if (Array.isArray(raw)) {
        v = raw.map(function (r) { return r && (r.identifier || r.name) || ''; }).join(', ');
      } else if (raw && typeof raw === 'object') {
        v = raw.identifier || raw.name || '';
      } else if (raw != null) {
        v = raw;
      }
    }
    var s = stripHtml(v);
    return /^[a-f0-9]{24}$/i.test(s) ? '' : s;
  }
  function dropLabelOf(rec, F) { return readText(rec, F.displayLabel || 'field_1950'); }
  function productOf(rec, F) {
    return readText(rec, F.productName || '') || readText(rec, F.product || 'field_1949');
  }
  function labelOf(rec, viewKey) {
    var F = fieldsFor(viewKey);
    var d = dropLabelOf(rec, F), p = productOf(rec, F);
    if (d && p) return d + ' · ' + p;
    return d || p || rec.id || '';
  }
  /** Photos attach to hardware: services, assumptions, licenses and
   *  accessories (a mount rides its parent's strip) are never targets. */
  function isPhotoTarget(rec, viewKey) {
    if (!rec || !rec.id) return false;
    var card = ns.card;
    if (card && typeof card.bucketCategoryOf === 'function') {
      var cat = card.bucketCategoryOf(rec, viewKey);
      if (cat === 'services' || cat === 'assumptions') return false;
    }
    if (card && typeof card.isLicenseBucket === 'function' && card.isLicenseBucket(rec, viewKey)) return false;
    var F = fieldsFor(viewKey);
    var pr = rec[(F.parent || 'field_2464') + '_raw'];
    if (Array.isArray(pr) ? pr.length > 0 : !!(pr && pr.id)) return false;
    return true;
  }
  /** Label tokens: letters and digit runs, upper-cased, digit runs with
   *  leading zeros dropped — so E-001, E001, e1 and E-1 all read E,1. */
  function tokensOf(s) {
    var parts = String(s || '').toUpperCase().match(/[A-Z]+|\d+/g) || [];
    return parts.map(function (p) { return /^\d+$/.test(p) ? String(parseInt(p, 10)) : p; });
  }
  function candidatesFor(viewKey) {
    var recs = (ns.data && typeof ns.data.readRecords === 'function') ? ns.data.readRecords(viewKey) : [];
    var keep = [];
    for (var i = 0; i < recs.length; i++) if (isPhotoTarget(recs[i], viewKey)) keep.push(recs[i]);
    if (ns.picker && typeof ns.picker.canonicalItemSort === 'function') {
      keep.sort(ns.picker.canonicalItemSort(function (r) { return labelOf(r, viewKey); }));
    }
    var F = fieldsFor(viewKey);
    return keep.map(function (r) {
      var drop = dropLabelOf(r, F);
      return { id: r.id, label: labelOf(r, viewKey), drop: drop, tokens: tokensOf(drop), rec: r };
    });
  }
  function candidateById(id) {
    var list = (_state && _state.candidates) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function containsSeq(hay, needle) {
    if (!needle.length || needle.length > hay.length) return false;
    for (var i = 0; i + needle.length <= hay.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) { if (hay[i + j] !== needle[j]) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }
  /** The device a file name names, or null (no match, or two devices'
   *  labels both fit and neither is longer — say nothing rather than guess).
   *  A label that is only a bare number never matches (every photo has
   *  numbers in its name). */
  function matchFile(filename, candidates) {
    var hay = tokensOf(String(filename || '').replace(/\.[^.]+$/, ''));
    var best = null, bestLen = 0, tie = false;
    for (var i = 0; i < candidates.length; i++) {
      var t = candidates[i].tokens;
      if (!t.length) continue;
      if (t.length === 1 && /^\d+$/.test(t[0])) continue;
      if (!containsSeq(hay, t)) continue;
      if (t.length > bestLen) { best = candidates[i]; bestLen = t.length; tie = false; }
      else if (t.length === bestLen) tie = true;
    }
    return tie ? null : best;
  }

  // ── Slots + types ─────────────────────────────────────────────────
  /** This device's photo records WITHOUT an image: the open slots, in the
   *  order the worksheet strip shows them (photos.js pins Proposed Mounting
   *  Location first, then missing-required, then required, then type) —
   *  so "the first open required slot" is the one the strip shows first. */
  function openSlotsFor(viewKey, recordId) {
    var ph = (ns.photos && typeof ns.photos.extractPhotoRecords === 'function')
      ? ns.photos.extractPhotoRecords(viewKey, recordId) : [];
    var out = [];
    for (var i = 0; i < ph.length; i++) {
      var p = ph[i];
      if (!p || !p.id || p.imgUrl) continue;
      out.push({ id: p.id, type: p.type || '', required: !!p.required, history: p.qaHistory || '' });
    }
    return out;
  }
  function slotsCached(recordId) {
    if (!_state) return [];
    if (!_state.slotCache[recordId]) _state.slotCache[recordId] = openSlotsFor(_state.viewKey, recordId);
    return _state.slotCache[recordId];
  }
  function typeOptions() {
    var u = pepUtil();
    var list = (u && typeof u.collectTypeOptions === 'function') ? (u.collectTypeOptions() || []) : [];
    return list.filter(function (t) { return t && t.id && t.label; });
  }
  function typeIdByLabel(label) {
    var want = String(label || '').trim().toLowerCase();
    var list = typeOptions();
    for (var i = 0; i < list.length; i++) if (String(list[i].label).trim().toLowerCase() === want) return list[i].id;
    return '';
  }
  function typeLabelById(id) {
    var list = typeOptions();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return '';
  }

  // ── Styles ────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-pa-overlay { position:fixed; inset:0; z-index:99990; background:rgba(15,23,42,.55);',
      '  display:flex; align-items:center; justify-content:center; font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif; }',
      '.scw-pa { background:#fff; border-radius:10px; width:min(900px,94vw); max-height:92vh; display:flex; flex-direction:column;',
      '  box-shadow:0 20px 60px rgba(0,0,0,.4); overflow:hidden; color:#0f172a; }',
      '.scw-pa-hd { padding:12px 18px; display:flex; align-items:center; justify-content:space-between; background:#07467c; color:#fff; }',
      '.scw-pa-hd .scw-pa-title { font-weight:700; font-size:15px; }',
      '.scw-pa-hd .scw-pa-sub { font-size:12px; opacity:.85; margin-top:2px; }',
      '.scw-pa-hd button { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:0 4px; line-height:1; }',
      '.scw-pa-bd { padding:12px 18px; overflow-y:auto; flex:1; }',
      '.scw-pa-ft { padding:10px 18px; border-top:1px solid #e5e7eb; display:flex; gap:8px; justify-content:flex-end; align-items:center; background:#f8fafc; }',
      '.scw-pa-ft .scw-pa-summary { margin-right:auto; color:#475569; font-size:13px; }',
      '.scw-pa-btn { padding:8px 14px; border-radius:6px; border:1px solid transparent; cursor:pointer; font:600 13px/1 system-ui,sans-serif; background:#fff; color:#0f172a; border-color:#cbd5e1; }',
      '.scw-pa-btn.primary { background:#07467c; color:#fff; border-color:#053659; }',
      '.scw-pa-btn.primary:hover:not([disabled]) { background:#053659; }',
      '.scw-pa-btn[disabled] { opacity:.55; cursor:default; }',
      '.scw-pa-btn.sm { padding:5px 10px; font-size:12px; }',
      '.scw-pa-preview { margin:0 0 10px; padding:8px 12px; border-radius:8px; background:#fffbeb; border:1px solid #fcd34d; color:#78350f; font-size:12.5px; }',
      '.scw-pa-modes { display:inline-flex; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-bottom:10px; }',
      '.scw-pa-modes button { background:#fff; border:none; padding:7px 12px; font:600 12.5px system-ui,sans-serif; color:#334155; cursor:pointer; }',
      '.scw-pa-modes button + button { border-left:1px solid #cbd5e1; }',
      '.scw-pa-modes button.is-on { background:#07467c; color:#fff; }',
      '.scw-pa-modes button[disabled] { opacity:.5; cursor:default; }',
      '.scw-pa-drop { border:2px dashed #cbd5e1; border-radius:8px; padding:16px 14px; text-align:center; color:#475569; background:#f8fafc; cursor:pointer; }',
      '.scw-pa-drop.is-over { background:#e0f2fe; border-color:#0284c7; color:#0c4a6e; }',
      '.scw-pa-drop .scw-pa-hint { display:block; margin-top:4px; font-size:12px; color:#64748b; }',
      '.scw-pa-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:10px 0 6px; font-size:12.5px; color:#334155; }',
      '.scw-pa-tools select { padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; font-size:12.5px; max-width:300px; }',
      '.scw-pa-tools .scw-pa-spacer { flex:1; }',
      '.scw-pa-head, .scw-pa-row { display:grid; grid-template-columns:44px minmax(140px,1.1fr) minmax(170px,1.4fr) minmax(200px,1.7fr) 150px 28px; gap:10px; align-items:center; }',
      '.scw-pa-head { font:700 11px system-ui,sans-serif; text-transform:uppercase; letter-spacing:.04em; color:#64748b; padding:6px 0 4px; border-bottom:1px solid #e2e8f0; }',
      '.scw-pa-row { padding:8px 0; border-bottom:1px solid #f1f5f9; }',
      '.scw-pa-thumb { width:44px; height:44px; background:#f1f5f9; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#64748b; }',
      '.scw-pa-thumb img { width:100%; height:100%; object-fit:cover; }',
      '.scw-pa-name { min-width:0; }',
      '.scw-pa-name .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; font-size:13px; }',
      '.scw-pa-name .s { font-size:11.5px; color:#64748b; }',
      '.scw-pa-target { width:100%; text-align:left; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; font-size:12.5px; cursor:pointer; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.scw-pa-target.is-empty { color:#b45309; border-color:#f59e0b; background:#fffbeb; }',
      '.scw-pa-target .m { font-size:10.5px; color:#15803d; font-weight:700; margin-left:4px; }',
      '.scw-pa-slot { width:100%; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; font-size:12.5px; }',
      '.scw-pa-slot[disabled] { background:#f8fafc; color:#94a3b8; }',
      '.scw-pa-status { font-size:12px; color:#475569; }',
      '.scw-pa-status.is-ok { color:#15803d; font-weight:600; }',
      '.scw-pa-status.is-err { color:#b91c1c; font-weight:600; }',
      '.scw-pa-status.is-busy { color:#0369a1; }',
      '.scw-pa-x { background:none; border:none; cursor:pointer; color:#64748b; font-size:16px; padding:2px 6px; border-radius:4px; }',
      '.scw-pa-x:hover { background:#f1f5f9; color:#0f172a; }',
      '.scw-pa-copy { border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-top:10px; background:#fff; }',
      '.scw-pa-copy-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:6px 0; font-size:12.5px; }',
      '.scw-pa-copy-row select { padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; font-size:12.5px; max-width:420px; }',
      '.scw-pa-chips { display:flex; flex-wrap:wrap; gap:6px; }',
      '.scw-pa-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:999px; background:#e0f2fe; color:#0c4a6e; font-size:12px; border:1px solid #bae6fd; }',
      '.scw-pa-chip.is-done { background:#dcfce7; color:#14532d; border-color:#bbf7d0; }',
      '.scw-pa-chip.is-err { background:#fee2e2; color:#7f1d1d; border-color:#fecaca; }',
      '.scw-pa-errors { margin:10px 0 0; padding:8px 12px; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:#7f1d1d; font-size:12.5px; }',
      '.scw-pa-errors div + div { margin-top:3px; }',
      '.scw-pa-done { margin:10px 0 0; padding:8px 12px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#14532d; font-size:12.5px; }',
      '.scw-pa-empty { padding:14px 0; color:#64748b; font-size:12.5px; text-align:center; }',
      '@media (max-width: 720px) { .scw-pa-head { display:none; } .scw-pa-row { grid-template-columns:44px 1fr; } .scw-pa-row > * { grid-column:auto; } }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Toolbar button ────────────────────────────────────────────────
  /** Puts the v2 button beside the worksheet toolbar's "+ Add Photos".
   *  Idempotent; false when there is nothing to attach to yet. */
  function inject(viewKey) {
    if (!viewKey || !isAllowed()) return false;
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return false;
    var bar = container.querySelector(':scope > .scw-ws-v2-toolbar');
    if (!bar) return false;
    if (bar.querySelector('[data-scw-pa-open]')) return true;
    var ref = bar.querySelector('[data-scw-ws-v2-action="add-photos"]');
    if (!ref || !ref.parentNode) return false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta scw-ws-v2-toolbar-btn--preview';
    btn.setAttribute('data-scw-pa-open', viewKey);
    btn.title = CONFIG.BUTTON_TITLE;
    btn.textContent = CONFIG.BUTTON_LABEL;
    ref.parentNode.insertBefore(btn, ref.nextSibling);
    return true;
  }
  function watch(viewKey) {
    if (!viewKey || _subscribed[viewKey]) return;
    _subscribed[viewKey] = true;
    if (ns.data && typeof ns.data.subscribeRendered === 'function') {
      ns.data.subscribeRendered(viewKey, function () { inject(viewKey); });
    }
    // The toolbar mounts on the worksheet's own schedule — a few retries
    // cover the first paint without a MutationObserver.
    var delays = [0, 300, 1200, 3000, 6000];
    for (var i = 0; i < delays.length; i++) {
      setTimeout(function () { inject(viewKey); }, delays[i]);
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────
  function open(viewKey) {
    if (!isAllowed()) return null;
    injectStyles();
    close();
    _state = {
      viewKey:    viewKey,
      mode:       'assign',
      rows:       [],
      copy:       { targetIds: [], rule: 'new', results: [] },
      candidates: candidatesFor(viewKey),
      slotCache:  Object.create(null),
      sending:    false,
      errors:     [],
      done:       null,
      batchId:    uuid()
    };
    var overlay = document.createElement('div');
    overlay.className = 'scw-pa-overlay';
    overlay.id = ROOT_ID;
    var vc = viewCfg(viewKey);
    overlay.innerHTML =
      '<div class="scw-pa" role="dialog" aria-modal="true">' +
        '<div class="scw-pa-hd">' +
          '<div><div class="scw-pa-title">Add Photos (v2)</div>' +
            '<div class="scw-pa-sub">' + esc((vc && vc.label) || 'This worksheet') +
              ' · ' + _state.candidates.length + ' device' + (_state.candidates.length === 1 ? '' : 's') +
              ' on this page</div></div>' +
          '<button type="button" data-scw-pa-close aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-pa-bd"></div>' +
        '<div class="scw-pa-ft">' +
          '<div class="scw-pa-summary"></div>' +
          '<button type="button" class="scw-pa-btn" data-scw-pa-clear>Clear all</button>' +
          '<button type="button" class="scw-pa-btn primary" data-scw-pa-send>Send</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    wire(overlay);
    render();
    return _state;
  }
  function close() {
    var el = document.getElementById(ROOT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _state = null;
  }
  function root() { return document.getElementById(ROOT_ID); }

  function wire(overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { if (!_state || !_state.sending) close(); return; }
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var b;
      if (t.closest('[data-scw-pa-close]')) { if (!_state.sending) close(); return; }
      if (t.closest('[data-scw-pa-clear]')) { if (!_state.sending) { _state.rows = []; _state.copy.targetIds = []; _state.done = null; _state.errors = []; render(); } return; }
      if (t.closest('[data-scw-pa-send]')) { send(); return; }
      if ((b = t.closest('[data-scw-pa-mode]'))) { setMode(b.getAttribute('data-scw-pa-mode')); return; }
      if (t.closest('.scw-pa-drop')) { var inp = overlay.querySelector('input[type="file"]'); if (inp) inp.click(); return; }
      if ((b = t.closest('[data-scw-pa-remove]'))) { removeRow(b.getAttribute('data-scw-pa-remove')); return; }
      if ((b = t.closest('[data-scw-pa-target]'))) { pickTargetFor(b.getAttribute('data-scw-pa-target')); return; }
      if (t.closest('[data-scw-pa-match]')) { autoMatch(true); render(); return; }
      if (t.closest('[data-scw-pa-order]')) { assignInOrder(); return; }
      if (t.closest('[data-scw-pa-forall-apply]')) {
        var sel = overlay.querySelector('[data-scw-pa-forall]');
        applyToAll(sel ? sel.value : 'new'); render(); return;
      }
      if (t.closest('[data-scw-pa-copy-pick]')) { pickCopyTargets(); return; }
    });
    overlay.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.matches && t.matches('input[type="file"]')) {
        addFiles(Array.prototype.slice.call(t.files || []));
        t.value = '';
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-scw-pa-slot')) {
        var row = rowById(t.getAttribute('data-scw-pa-slot'));
        if (row) row.slot = t.value;
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-scw-pa-copy-rule')) {
        _state.copy.rule = t.value;
        return;
      }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      overlay.addEventListener(ev, function (e) {
        var d = e.target && e.target.closest && e.target.closest('.scw-pa-drop');
        if (!d) return;
        e.preventDefault(); e.stopPropagation(); d.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      overlay.addEventListener(ev, function (e) {
        var d = e.target && e.target.closest && e.target.closest('.scw-pa-drop');
        if (!d) return;
        e.preventDefault(); e.stopPropagation(); d.classList.remove('is-over');
        if (ev === 'drop') addFiles(Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []));
      });
    });
    document.addEventListener('keydown', function onKey(e) {
      if (!root()) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape' && _state && !_state.sending) close();
    });
  }

  function rowById(id) {
    if (!_state) return null;
    for (var i = 0; i < _state.rows.length; i++) if (_state.rows[i].id === id) return _state.rows[i];
    return null;
  }
  function removeRow(id) {
    if (!_state || _state.sending) return;
    _state.rows = _state.rows.filter(function (r) { return r.id !== id; });
    if (_state.mode === 'copy' && _state.rows.length !== 1) _state.mode = 'assign';
    render();
  }
  function setMode(mode) {
    if (!_state || _state.sending) return;
    if (mode === 'copy' && _state.rows.length !== 1) return;
    _state.mode = mode === 'copy' ? 'copy' : 'assign';
    _state.errors = [];
    render();
  }

  /** Queue picked files: HEIC → JPEG and oversized rasters downscaled via
   *  bulk-upload.js's prepareFile when it is exported, else the photo
   *  panel's downscale. Each row auto-matches a device from its name. */
  function prepare(file) {
    var bu = window.SCW && SCW.bulkUpload;
    if (bu && typeof bu.prepareFile === 'function') return bu.prepareFile(file);
    var u = pepUtil();
    if (u && typeof u.downscale === 'function') {
      return u.downscale(file).then(function (blob) {
        return { blob: blob, converted: !!(blob && blob !== file), triedResize: true };
      });
    }
    return Promise.resolve({ blob: file, converted: false, triedResize: false });
  }
  function addFiles(files) {
    if (!_state || !files || !files.length) return Promise.resolve([]);
    if (_state.sending) return Promise.resolve([]);
    var st = _state;
    return Promise.all(files.map(function (f) {
      return prepare(f).then(function (prep) {
        if (_state !== st) return null;
        var blob = prep && prep.blob;
        var filename = f.name || 'photo.jpg';
        var mime = f.type || 'application/octet-stream';
        if (blob && prep.converted) {
          mime = 'image/jpeg';
          filename = filename.replace(/\.[^.]+$/, '') + '.jpg';
        }
        var row = {
          id:        uuid(),
          file:      f,
          blob:      blob || f,
          filename:  filename,
          mimeType:  mime,
          sizeBytes: blob ? blob.size : f.size,
          origSize:  (prep && prep.converted) ? f.size : null,
          status:    blob ? 'queued' : 'too-big',
          error:     blob ? '' : ((prep && prep.heicFailed)
            ? 'HEIC photo could not be converted — export it as JPEG and re-add it'
            : 'File is too large and could not be resized'),
          targetId:  '',
          matched:   false,
          slot:      'new',
          assetId:   '',
          uploadId:  uuid(),
          result:    ''
        };
        st.rows.push(row);
        return row;
      }).catch(function (err) {
        console.warn('[scw-photo-assign] could not queue', f && f.name, err);
        return null;
      });
    })).then(function (rows) {
      if (_state !== st) return [];
      autoMatch(false);
      st.done = null;
      render();
      return rows.filter(Boolean);
    });
  }
  /** Fill targets from file names. `all` re-matches rows the user already
   *  aimed; otherwise only empty targets are touched. */
  function autoMatch(all) {
    if (!_state) return;
    for (var i = 0; i < _state.rows.length; i++) {
      var row = _state.rows[i];
      if (row.status === 'too-big') continue;
      if (row.targetId && !all) continue;
      var c = matchFile(row.filename, _state.candidates);
      if (c) { row.targetId = c.id; row.matched = true; row.slot = 'new'; }
      else if (all) { row.targetId = ''; row.matched = false; row.slot = 'new'; }
    }
  }
  function applyToAll(rule) {
    if (!_state) return;
    for (var i = 0; i < _state.rows.length; i++) {
      var row = _state.rows[i];
      if (row.status === 'too-big' || !row.targetId) continue;
      if (rule === 'firstreq') {
        var slots = slotsCached(row.targetId);
        var req = null;
        for (var s = 0; s < slots.length; s++) if (slots[s].required) { req = slots[s]; break; }
        row.slot = req ? 'slot:' + req.id : 'new';
      } else {
        row.slot = rule || 'new';
      }
    }
  }
  function setTarget(rowId, targetId) {
    var row = rowById(rowId);
    if (!row) return;
    row.targetId = targetId || '';
    row.matched = false;
    row.slot = 'new';
  }

  // ── Device pickers (worksheet-v2's canonical record picker, pickOnly) ──
  function groupByFor(viewKey) {
    var F = fieldsFor(viewKey);
    var key = F.mdfIdf || 'field_1946';
    return function (rec) {
      var raw = rec && rec[key + '_raw'];
      if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) {
        return { id: raw[0].id, label: stripHtml(raw[0].identifier) || 'MDF / IDF' };
      }
      return { id: '__unknown', label: 'No MDF / IDF' };
    };
  }
  function openPicker(opts) {
    if (!_state) return;
    if (!(ns.picker && typeof ns.picker.open === 'function')) {
      alert('The record picker is not loaded on this page.');
      return;
    }
    var vk = _state.viewKey;
    ns.picker.open({
      fieldKey:      'scwPhotoAssignTarget',
      recordId:      '__batch__',
      sourceViewKey: vk,
      label:         opts.label,
      multi:         !!opts.multi,
      selectedIds:   opts.selectedIds || [],
      candidates:    _state.candidates.map(function (c) { return c.rec; }),
      itemLabel:     function (r) { return labelOf(r, vk); },
      groupBy:       groupByFor(vk),
      allowClear:    false,
      pickOnly:      true,
      onChoose:      opts.onChoose
    });
  }
  function pickTargetFor(rowId) {
    var row = rowById(rowId);
    if (!row || _state.sending) return;
    openPicker({
      label: 'Which device is "' + row.filename + '" a photo of?',
      multi: false,
      selectedIds: row.targetId ? [row.targetId] : [],
      onChoose: function (ids) { setTarget(rowId, ids && ids[0]); render(); }
    });
  }
  /** Files in name order ↔ devices in the picked (canonical) order. */
  function assignInOrder() {
    if (!_state || _state.sending) return;
    openPicker({
      label: 'Pick the devices these photos belong to, in order',
      multi: true,
      selectedIds: _state.rows.map(function (r) { return r.targetId; }).filter(Boolean),
      onChoose: function (ids) { pairInOrder(ids || []); render(); }
    });
  }
  function pairInOrder(ids) {
    if (!_state) return;
    var order = [];
    for (var c = 0; c < _state.candidates.length; c++) {
      if (ids.indexOf(_state.candidates[c].id) !== -1) order.push(_state.candidates[c].id);
    }
    var rows = _state.rows.filter(function (r) { return r.status !== 'too-big'; });
    rows.sort(function (a, b) {
      return String(a.filename).localeCompare(String(b.filename), undefined, { numeric: true, sensitivity: 'base' });
    });
    for (var i = 0; i < rows.length; i++) {
      rows[i].targetId = order[i] || '';
      rows[i].matched = false;
      rows[i].slot = 'new';
    }
  }
  function pickCopyTargets() {
    if (!_state || _state.sending) return;
    openPicker({
      label: 'Copy this photo to which devices?',
      multi: true,
      selectedIds: _state.copy.targetIds.slice(),
      onChoose: function (ids) { setCopyTargets(ids || []); render(); }
    });
  }
  function setCopyTargets(ids) {
    if (!_state) return;
    var keep = [];
    for (var c = 0; c < _state.candidates.length; c++) {
      if (ids.indexOf(_state.candidates[c].id) !== -1) keep.push(_state.candidates[c].id);
    }
    _state.copy.targetIds = keep;
    _state.copy.results = [];
  }

  // ── Render ────────────────────────────────────────────────────────
  function thumbHtml(row) {
    var ext = (row.filename.match(/\.([^.]+)$/) || [, '?'])[1].toUpperCase();
    return '<div class="scw-pa-thumb" data-scw-pa-thumb="' + esc(row.id) + '">' + esc(ext) + '</div>';
  }
  function statusHtml(row) {
    var cls = 'scw-pa-status', txt = '';
    switch (row.status) {
      case 'queued':    txt = 'Queued'; break;
      case 'uploading': txt = 'Uploading…'; cls += ' is-busy'; break;
      case 'uploaded':  txt = 'Writing…'; cls += ' is-busy'; break;
      case 'done':      txt = row.result || 'Done'; cls += ' is-ok'; break;
      case 'failed':    txt = row.error || 'Failed'; cls += ' is-err'; break;
      case 'too-big':   txt = row.error || 'Too big'; cls += ' is-err'; break;
    }
    return '<div class="' + cls + '" title="' + esc(txt) + '">' + esc(txt) + '</div>';
  }
  function slotSelectHtml(row) {
    if (!row.targetId) {
      return '<select class="scw-pa-slot" disabled><option>Pick a device first</option></select>';
    }
    var c = candidateById(row.targetId);
    var slots = slotsCached(row.targetId);
    var types = typeOptions();
    var h = '<select class="scw-pa-slot" data-scw-pa-slot="' + esc(row.id) + '"' + (_state.sending ? ' disabled' : '') + '>';
    h += '<option value="new"' + (row.slot === 'new' ? ' selected' : '') + '>New photo (no type)</option>';
    if (slots.length) {
      h += '<optgroup label="Fill an open slot on ' + esc(c ? c.drop || c.label : 'this device') + '">';
      for (var i = 0; i < slots.length; i++) {
        var v = 'slot:' + slots[i].id;
        h += '<option value="' + esc(v) + '"' + (row.slot === v ? ' selected' : '') + '>' +
          esc(slots[i].type || 'Untyped slot') + (slots[i].required ? ' (required)' : ' (empty)') + '</option>';
      }
      h += '</optgroup>';
    }
    if (types.length) {
      h += '<optgroup label="New photo with a type">';
      for (var t = 0; t < types.length; t++) {
        var tv = 'type:' + types[t].id;
        h += '<option value="' + esc(tv) + '"' + (row.slot === tv ? ' selected' : '') + '>' + esc(types[t].label) + '</option>';
      }
      h += '</optgroup>';
    }
    return h + '</select>';
  }
  function rowHtml(row) {
    var c = row.targetId ? candidateById(row.targetId) : null;
    var tBtn = '<button type="button" class="scw-pa-target' + (c ? '' : ' is-empty') + '" data-scw-pa-target="' + esc(row.id) + '"' +
      (_state.sending ? ' disabled' : '') + ' title="' + esc(c ? c.label : 'Pick the device this photo belongs to') + '">' +
      (c ? esc(c.label) + (row.matched ? '<span class="m">matched</span>' : '') : 'Pick device…') + '</button>';
    return '<div class="scw-pa-row" data-scw-pa-row="' + esc(row.id) + '">' +
      thumbHtml(row) +
      '<div class="scw-pa-name"><div class="n" title="' + esc(row.filename) + '">' + esc(row.filename) + '</div>' +
        '<div class="s">' + esc(fmtBytes(row.sizeBytes)) + (row.origSize ? ' (resized)' : '') + '</div></div>' +
      (row.status === 'too-big' ? '<div></div><div></div>' : (tBtn + slotSelectHtml(row))) +
      statusHtml(row) +
      '<button type="button" class="scw-pa-x" data-scw-pa-remove="' + esc(row.id) + '" title="Remove"' + (_state.sending ? ' disabled' : '') + '>&times;</button>' +
    '</div>';
  }
  function copyRuleOptionsHtml() {
    var seen = Object.create(null);
    var labels = [];
    var ids = _state.copy.targetIds;
    for (var i = 0; i < ids.length; i++) {
      var slots = slotsCached(ids[i]);
      for (var s = 0; s < slots.length; s++) {
        var k = String(slots[s].type || '').trim().toLowerCase();
        if (k && !seen[k]) { seen[k] = true; labels.push(slots[s].type); }
      }
    }
    var types = typeOptions();
    for (var t = 0; t < types.length; t++) {
      var k2 = String(types[t].label).trim().toLowerCase();
      if (!seen[k2]) { seen[k2] = true; labels.push(types[t].label); }
    }
    labels.sort(function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); });
    var h = '<option value="new"' + (_state.copy.rule === 'new' ? ' selected' : '') + '>Add as a new photo (no type) on every device</option>';
    for (var l = 0; l < labels.length; l++) {
      var v = 'fill:' + labels[l];
      h += '<option value="' + esc(v) + '"' + (_state.copy.rule === v ? ' selected' : '') + '>' +
        'Fill the "' + esc(labels[l]) + '" slot where open, otherwise add as a "' + esc(labels[l]) + '" photo</option>';
    }
    return h;
  }
  function copyHtml() {
    var ids = _state.copy.targetIds;
    var chips = '';
    for (var i = 0; i < ids.length; i++) {
      var c = candidateById(ids[i]);
      var res = null;
      for (var r = 0; r < _state.copy.results.length; r++) if (_state.copy.results[r].targetId === ids[i]) res = _state.copy.results[r];
      chips += '<span class="scw-pa-chip' + (res ? (res.ok ? ' is-done' : ' is-err') : '') + '" title="' + esc(res ? res.text : '') + '">' +
        esc(c ? (c.drop || c.label) : ids[i]) + (res ? ' · ' + esc(res.text) : '') + '</span>';
    }
    return '<div class="scw-pa-copy">' +
      '<div class="scw-pa-copy-row"><strong>Copy to:</strong>' +
        '<button type="button" class="scw-pa-btn sm" data-scw-pa-copy-pick' + (_state.sending ? ' disabled' : '') + '>' +
          (ids.length ? 'Change devices…' : 'Pick devices…') + '</button>' +
        '<span>' + ids.length + ' device' + (ids.length === 1 ? '' : 's') + '</span></div>' +
      (chips ? '<div class="scw-pa-chips">' + chips + '</div>' : '') +
      '<div class="scw-pa-copy-row"><strong>On each device:</strong>' +
        '<select data-scw-pa-copy-rule' + (_state.sending ? ' disabled' : '') + '>' + copyRuleOptionsHtml() + '</select></div>' +
    '</div>';
  }
  function toolsHtml() {
    var types = typeOptions();
    var forall = '<option value="new">New photo (no type)</option>' +
      '<option value="firstreq">Fill the first open required slot (else new photo)</option>';
    for (var t = 0; t < types.length; t++) forall += '<option value="type:' + esc(types[t].id) + '">New photo: ' + esc(types[t].label) + '</option>';
    var dis = _state.sending ? ' disabled' : '';
    return '<div class="scw-pa-tools">' +
      '<button type="button" class="scw-pa-btn sm" data-scw-pa-match' + dis + ' title="Re-read every file name and aim each photo at the device it names">Match file names</button>' +
      '<button type="button" class="scw-pa-btn sm" data-scw-pa-order' + dis + ' title="Pick devices in order; the files pair with them in name order">Assign in order…</button>' +
      '<span class="scw-pa-spacer"></span>' +
      '<label>For all rows: <select data-scw-pa-forall' + dis + '>' + forall + '</select></label>' +
      '<button type="button" class="scw-pa-btn sm" data-scw-pa-forall-apply' + dis + '>Apply</button>' +
    '</div>';
  }
  function render() {
    var el = root();
    if (!el || !_state) return;
    var st = _state;
    var bd = el.querySelector('.scw-pa-bd');
    var rows = st.rows;
    var copyOk = rows.length === 1 && rows[0].status !== 'too-big';
    var h = '<div class="scw-pa-preview"><strong>Preview.</strong> Only you see this button and modal; the regular "+ Add Photos" is unchanged.</div>' +
      '<div class="scw-pa-modes">' +
        '<button type="button" data-scw-pa-mode="assign" class="' + (st.mode === 'assign' ? 'is-on' : '') + '"' + (st.sending ? ' disabled' : '') + '>One photo per device</button>' +
        '<button type="button" data-scw-pa-mode="copy" class="' + (st.mode === 'copy' ? 'is-on' : '') + '"' + ((!copyOk || st.sending) ? ' disabled' : '') +
          ' title="' + (copyOk ? 'Send one photo to several devices' : 'Queue exactly one photo to copy it to several devices') + '">Copy one photo to several devices</button>' +
      '</div>' +
      (st.sending ? '' :
        '<div class="scw-pa-drop" tabindex="0"><div><strong>Drop photos here</strong> or click to choose</div>' +
          '<span class="scw-pa-hint">Images only · large photos are resized · HEIC converts to JPEG</span>' +
          '<input type="file" multiple accept="image/*,.heic,.heif" style="display:none"></div>');
    if (!rows.length) {
      h += '<div class="scw-pa-empty">No photos queued yet.</div>';
    } else if (st.mode === 'copy') {
      h += '<div class="scw-pa-head"><div></div><div>Photo</div><div></div><div></div><div>Status</div><div></div></div>' +
        rows.map(function (r) {
          return '<div class="scw-pa-row" data-scw-pa-row="' + esc(r.id) + '">' + thumbHtml(r) +
            '<div class="scw-pa-name"><div class="n" title="' + esc(r.filename) + '">' + esc(r.filename) + '</div>' +
              '<div class="s">' + esc(fmtBytes(r.sizeBytes)) + (r.origSize ? ' (resized)' : '') + '</div></div>' +
            '<div></div><div></div>' + statusHtml(r) +
            '<button type="button" class="scw-pa-x" data-scw-pa-remove="' + esc(r.id) + '" title="Remove"' + (st.sending ? ' disabled' : '') + '>&times;</button></div>';
        }).join('') + copyHtml();
    } else {
      h += toolsHtml() +
        '<div class="scw-pa-head"><div></div><div>Photo</div><div>Device</div><div>Slot / type</div><div>Status</div><div></div></div>' +
        rows.map(rowHtml).join('');
    }
    if (st.errors.length) {
      h += '<div class="scw-pa-errors">' + st.errors.map(function (e) { return '<div>' + esc(e) + '</div>'; }).join('') + '</div>';
    }
    if (st.done) h += '<div class="scw-pa-done">' + esc(st.done) + '</div>';
    bd.innerHTML = h;

    // Thumbnails (object URLs, revoked on load).
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      var slots = bd.querySelectorAll('[data-scw-pa-thumb]');
      for (var i = 0; i < slots.length; i++) {
        var row = rowById(slots[i].getAttribute('data-scw-pa-thumb'));
        if (!row || !row.blob || String(row.mimeType).indexOf('image/') !== 0) continue;
        try {
          var url = URL.createObjectURL(row.blob);
          var img = document.createElement('img');
          img.src = url;
          img.onload = img.onerror = (function (u) { return function () { try { URL.revokeObjectURL(u); } catch (e) {} }; })(url);
          slots[i].innerHTML = '';
          slots[i].appendChild(img);
        } catch (e) { /* keep the extension tile */ }
      }
    }

    // Footer
    var usable = rows.filter(function (r) { return r.status !== 'too-big'; });
    var aimed = usable.filter(function (r) { return r.targetId; }).length;
    var sum = el.querySelector('.scw-pa-summary');
    var sendBtn = el.querySelector('[data-scw-pa-send]');
    var clearBtn = el.querySelector('[data-scw-pa-clear]');
    if (st.mode === 'copy') {
      sum.textContent = usable.length ? ('1 photo → ' + st.copy.targetIds.length + ' device' + (st.copy.targetIds.length === 1 ? '' : 's')) : '';
      sendBtn.disabled = st.sending || !usable.length || !st.copy.targetIds.length || !!st.done;
    } else {
      sum.textContent = rows.length
        ? (usable.length + ' photo' + (usable.length === 1 ? '' : 's') + ' · ' + aimed + ' aimed' +
           (usable.length - aimed ? ' · ' + (usable.length - aimed) + ' need a device' : '') +
           (rows.length - usable.length ? ' · ' + (rows.length - usable.length) + ' too big' : ''))
        : '';
      sendBtn.disabled = st.sending || !usable.length || aimed < usable.length || !!st.done;
    }
    sendBtn.textContent = st.sending ? 'Sending…' : (st.done ? 'Sent' : 'Send');
    clearBtn.disabled = st.sending || !rows.length;
  }

  // ── Plan + send ───────────────────────────────────────────────────
  /** Every write the batch will make, or the reasons it can't. */
  function buildPlan() {
    var st = _state;
    var errs = [], ops = [];
    if (!st) return { ops: ops, errs: ['Nothing to send.'] };
    var vk = st.viewKey;
    var saveView = saveViewFor(vk);
    var hook = webhookUrl();
    function create(row, targetId, typeId, typeLabel) {
      ops.push({ kind: 'create', rowId: row.id, targetId: targetId, typeId: typeId || '', typeLabel: typeLabel || '' });
    }
    function fill(row, targetId, slot) {
      ops.push({ kind: 'fill', rowId: row.id, targetId: targetId, slotId: slot.id, slotType: slot.type, slotRequired: slot.required, history: slot.history || '' });
    }
    if (st.mode === 'copy') {
      var row = st.rows[0];
      if (!row || row.status === 'too-big') errs.push('Queue one photo to copy.');
      else if (!st.copy.targetIds.length) errs.push('Pick at least one device to copy the photo to.');
      else {
        var rule = st.copy.rule || 'new';
        for (var i = 0; i < st.copy.targetIds.length; i++) {
          var tid = st.copy.targetIds[i];
          if (rule.indexOf('fill:') === 0) {
            var want = rule.slice(5);
            var slots = slotsCached(tid), hit = null;
            for (var s = 0; s < slots.length; s++) {
              if (String(slots[s].type).trim().toLowerCase() === want.trim().toLowerCase()) { hit = slots[s]; break; }
            }
            if (hit) fill(row, tid, hit);
            else create(row, tid, typeIdByLabel(want), want);
          } else {
            create(row, tid, '', '');
          }
        }
      }
    } else {
      for (var r = 0; r < st.rows.length; r++) {
        var rw = st.rows[r];
        if (rw.status === 'too-big') continue;
        if (!rw.targetId) { errs.push(rw.filename + ': pick a device.'); continue; }
        if (rw.slot && rw.slot.indexOf('slot:') === 0) {
          var sid = rw.slot.slice(5), sl = null, cs = slotsCached(rw.targetId);
          for (var k = 0; k < cs.length; k++) if (cs[k].id === sid) { sl = cs[k]; break; }
          if (!sl) { errs.push(rw.filename + ': that slot is no longer open — pick again.'); continue; }
          fill(rw, rw.targetId, sl);
        } else if (rw.slot && rw.slot.indexOf('type:') === 0) {
          var tid2 = rw.slot.slice(5);
          create(rw, rw.targetId, tid2, typeLabelById(tid2));
        } else {
          create(rw, rw.targetId, '', '');
        }
      }
    }
    var fills = ops.filter(function (o) { return o.kind === 'fill'; }).length;
    var creates = ops.filter(function (o) { return o.kind === 'create'; }).length;
    if (fills && !saveView) {
      errs.push('This page has no photo save view mapped (photo-edit-panel.js SAVE_VIEWS), so slots cannot be filled from here.');
    }
    if (creates && !hook) {
      errs.push(creates + ' new photo' + (creates === 1 ? '' : 's') + ' would need the Make webhook (SCW.CONFIG.' + CONFIG.WEBHOOK_KEY +
        '), which is not configured yet — aim those photos at open slots instead.');
    }
    if (!ops.length && !errs.length) errs.push('Nothing to send.');
    return { ops: ops, errs: errs, saveView: saveView, hook: hook };
  }

  function uploadRow(row) {
    var u = pepUtil();
    if (!u || typeof u.uploadImage !== 'function') return Promise.reject(new Error('photo upload machinery not loaded'));
    row.status = 'uploading'; row.error = '';
    render();
    return u.uploadImage(row.blob, row.filename).then(function (assetId) {
      if (!assetId) throw new Error('no asset id returned');
      row.assetId = String(assetId);
      row.status = 'uploaded';
      render();
      return row.assetId;
    }).catch(function (err) {
      row.status = 'failed';
      row.error = 'Upload failed: ' + ((err && err.message) || err);
      render();
      return '';
    });
  }
  function historyLine(existing, filename) {
    var line = nowStamp() + ' — ' + userName() + ' — UPLOADED PHOTO: bulk assign (' + String(filename || '') + ')';
    var safe = line.replace(/[<>]/g, function (c) { return c === '<' ? '&lt;' : '&gt;'; });
    return existing ? safe + '<br>' + existing : safe;
  }
  function doFill(op, row, saveView) {
    var u = pepUtil();
    var PF = CONFIG.PHOTO_FIELDS;
    var body = {}; body[PF.img] = row.assetId;
    return u.putRecord(saveView, op.slotId, body).then(function () {
      // Best-effort completion stamp + history — never fails the fill.
      var extra = {};
      extra[PF.completed] = 'Yes';
      extra[PF.history] = historyLine(op.history, row.filename);
      return Promise.resolve(u.putRecord(saveView, op.slotId, extra)).catch(function (err) {
        console.warn('[scw-photo-assign] completion stamp skipped on ' + op.slotId + ':', (err && err.message) || err);
      });
    }).then(function () {
      return { ok: true, kind: 'fill', op: op };
    }).catch(function (err) {
      return { ok: false, kind: 'fill', op: op, error: (err && err.message) || String(err) };
    });
  }
  function manifestFor(op, row) {
    var c = candidateById(op.targetId);
    return {
      uploadKind: 'photo_assign',
      batchId:    _state.batchId,
      uploadId:   row.uploadId + ':' + op.targetId,
      asset:      { id: row.assetId, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
      target:     { kind: targetKind(), recordId: op.targetId, label: c ? c.label : '' },
      slot:       null,
      photoType:  op.typeId ? { id: op.typeId, label: op.typeLabel || '' } : null,
      required:   false,
      scope:      resolveScope(_state.viewKey),
      sourceViewId: _state.viewKey,
      triggeredBy: triggeredBy()
    };
  }
  function doCreate(op, row, hook) {
    var body = JSON.stringify(manifestFor(op, row));
    var p;
    try {
      p = fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body });
    } catch (e) { p = Promise.reject(e); }
    // Optimistic, like bulk-upload.js: Make often answers without CORS
    // headers, which rejects the fetch AFTER the request was delivered.
    return Promise.resolve(p).then(function () {
      return { ok: true, kind: 'create', op: op };
    }, function (err) {
      console.warn('[scw-photo-assign] manifest send error (treated as sent):', (err && err.message) || err);
      return { ok: true, kind: 'create', op: op, unconfirmed: true };
    });
  }
  function runQueue(tasks, limit) {
    var results = new Array(tasks.length);
    var next = 0, active = 0;
    return new Promise(function (resolve) {
      function pump() {
        if (next >= tasks.length && active === 0) { resolve(results); return; }
        while (active < limit && next < tasks.length) {
          (function (i) {
            active++;
            Promise.resolve().then(tasks[i]).then(function (r) { results[i] = r; }, function (e) { results[i] = { ok: false, error: String(e) }; })
              .then(function () { active--; pump(); });
          })(next++);
        }
      }
      pump();
    });
  }
  function describeOp(op) {
    var c = candidateById(op.targetId);
    var dev = c ? (c.drop || c.label) : 'device';
    if (op.kind === 'fill') return 'Filled ' + (op.slotType || 'slot') + ' on ' + dev;
    return 'New ' + (op.typeLabel ? '"' + op.typeLabel + '" ' : '') + 'photo on ' + dev + ' (sent to Make)';
  }
  /** Upload every needed file once, then write every planned op with the
   *  concurrency cap. Resolves the summary; never rejects. */
  function send() {
    if (!_state || _state.sending || _state.done) return Promise.resolve(null);
    var st = _state;
    var plan = buildPlan();
    st.errors = plan.errs;
    if (plan.errs.length) { render(); return Promise.resolve({ errors: plan.errs }); }
    st.sending = true;
    render();
    var needed = [];
    for (var i = 0; i < plan.ops.length; i++) {
      var row = rowById(plan.ops[i].rowId);
      if (row && needed.indexOf(row) === -1) needed.push(row);
    }
    var up = Promise.resolve();
    needed.forEach(function (row) { up = up.then(function () { return uploadRow(row); }); });
    return up.then(function () {
      var tasks = plan.ops.map(function (op) {
        return function () {
          var row = rowById(op.rowId);
          if (!row || !row.assetId) return { ok: false, kind: op.kind, op: op, error: 'upload failed', skipped: true };
          return op.kind === 'fill' ? doFill(op, row, plan.saveView) : doCreate(op, row, plan.hook);
        };
      });
      return runQueue(tasks, CONFIG.WRITES_IN_FLIGHT);
    }).then(function (results) {
      var filled = 0, created = 0, failed = 0;
      var perRow = Object.create(null);
      st.copy.results = [];
      for (var r = 0; r < results.length; r++) {
        var res = results[r] || { ok: false, error: 'unknown' };
        var op = res.op || plan.ops[r];
        if (res.ok) { if (res.kind === 'fill') filled++; else created++; } else failed++;
        var text = res.ok ? describeOp(op) : ('Failed: ' + (res.error || 'unknown'));
        if (st.mode === 'copy') st.copy.results.push({ targetId: op.targetId, ok: !!res.ok, text: text });
        if (!perRow[op.rowId]) perRow[op.rowId] = { ok: 0, fail: 0, text: '' };
        if (res.ok) perRow[op.rowId].ok++; else perRow[op.rowId].fail++;
        perRow[op.rowId].text = text;
      }
      for (var k = 0; k < st.rows.length; k++) {
        var rw = st.rows[k], pr = perRow[rw.id];
        if (!pr) continue;
        if (rw.status === 'failed') continue;
        if (st.mode === 'copy') {
          rw.status = pr.fail ? (pr.ok ? 'done' : 'failed') : 'done';
          rw.result = pr.ok + ' of ' + (pr.ok + pr.fail) + ' devices written';
          if (!pr.ok) rw.error = 'Every write failed';
        } else {
          rw.status = pr.fail ? 'failed' : 'done';
          rw.result = pr.text;
          if (pr.fail) rw.error = pr.text;
        }
      }
      var summary = {
        filled: filled, created: created, failed: failed,
        uploaded: needed.filter(function (n) { return n.assetId; }).length
      };
      st.done = (filled ? filled + ' slot' + (filled === 1 ? '' : 's') + ' filled' : '') +
        (created ? (filled ? ' · ' : '') + created + ' new photo' + (created === 1 ? '' : 's') + ' sent to Make' : '') +
        (failed ? (filled || created ? ' · ' : '') + failed + ' failed' : '');
      if (!st.done) st.done = 'Nothing was written.';
      st.sending = false;
      render();
      refreshAfter(st.viewKey, created > 0);
      return summary;
    });
  }
  function refreshAfter(viewKey, sentToMake) {
    try { if (ns.warnings && typeof ns.warnings.invalidatePhotos === 'function') ns.warnings.invalidatePhotos(); } catch (e) {}
    try { if (ns.data && typeof ns.data.refetchAndNotify === 'function') ns.data.refetchAndNotify(viewKey); } catch (e2) {}
    if (sentToMake) {
      setTimeout(function () {
        try { if (ns.data && typeof ns.data.refetchAndNotify === 'function') ns.data.refetchAndNotify(viewKey); } catch (e3) {}
      }, CONFIG.MAKE_REFRESH_DELAY_MS);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if (!document.documentElement.hasAttribute('data-scw-photo-assign-bound')) {
    document.documentElement.setAttribute('data-scw-photo-assign-bound', '1');
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-scw-pa-open]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      open(b.getAttribute('data-scw-pa-open'));
    });
    // Any worksheet-v2 view that renders gets the button once its toolbar is up.
    try {
      if (typeof $ === 'function' && $(document).on) {
        $(document).on('knack-view-render.any.scwPhotoAssign', function (e, view) {
          var key = view && view.key;
          if (!key || !viewCfg(key)) return;
          watch(key);
        });
      }
    } catch (e) { /* no jQuery (tests) */ }
  }

  ns.photoAssign = {
    CONFIG:        CONFIG,
    open:          open,
    close:         close,
    inject:        inject,
    watch:         watch,
    isAllowed:     isAllowed,
    candidatesFor: candidatesFor,
    matchFile:     matchFile,
    tokensOf:      tokensOf,
    openSlotsFor:  openSlotsFor,
    targetKind:    targetKind,
    resolveScope:  resolveScope,
    addFiles:      addFiles,
    setTarget:     function (rowId, targetId) { setTarget(rowId, targetId); render(); },
    setSlot:       function (rowId, slot) { var r = rowById(rowId); if (r) { r.slot = slot; render(); } },
    setMode:       setMode,
    setCopyTargets: function (ids) { setCopyTargets(ids); render(); },
    setCopyRule:   function (rule) { if (_state) { _state.copy.rule = rule; render(); } },
    pairInOrder:   function (ids) { pairInOrder(ids); render(); },
    applyToAll:    function (rule) { applyToAll(rule); render(); },
    buildPlan:     buildPlan,
    send:          send,
    state:         function () { return _state; }
  };
})();
/*** END WORKSHEET V2 — BULK PHOTO ASSIGN *************************************/
