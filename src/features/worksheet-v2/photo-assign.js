/*** WORKSHEET V2 — BULK PHOTO ASSIGN (the v2 "Add Photos" modal) *************
 *
 * PREVIEW — gated to CONFIG.ALLOWED_EMAILS. The listed users get a second,
 * amber "+ Add Photos (v2)" button beside the worksheet toolbar's existing
 * "+ Add Photos"; everyone else sees nothing. The v1 button and modal
 * (bulk-upload.js) are untouched.
 *
 * ONE SCREEN, NO MODES (design canvas "Bulk Photo Assign v2", rev 2). Photos
 * are tiles on the left; the worksheet's devices are a rail on the right,
 * always on screen. Every photo is AIMED at one or more devices — each
 * destination is a chip on the tile that says what happens there: FILL an
 * open slot (an existing DOC_photos record with a type and no image — the
 * "required" placeholders) or add a NEW photo (with or without a type).
 * A tile with two chips is the old "copy" case: one upload, two writes.
 * Three gestures, same result:
 *   · type on the tile — a photo with no device carries a finder; it
 *     filters the rail, Enter takes the top hit, Tab walks the unaimed;
 *   · select photos, click a device in the rail (toggles the destination)
 *     — or click one of the device's OPEN SLOTS, listed as rows under it,
 *     to aim at exactly that slot (rev 3, 2026-10-14: the batch-rule
 *     select and "Assign in order…" are gone — the rail SAYS what is open,
 *     and a slot is picked by clicking it);
 *   · drag a tile (or the selection) onto a device row or a slot row.
 * A device click fills the first open REQUIRED slot nobody else in the
 * batch is filling, else adds a new photo; the chip's own menu and the slot
 * rows are the per-photo override. A slot is never filled twice in one
 * batch. The zoom button on a tile opens the photo full-size (← → walk the
 * queue) so a photo can be recognised before it is aimed.
 *
 * FILE-NAME MATCHING (board 2 of the canvas): a name is read as letters and
 * digit runs, separators and case ignored, leading zeros dropped. A device
 * label in the name is a MATCH (the longer label wins); a bare number is a
 * match when it is unique among this worksheet's labels; a leading "1" read
 * as the letter I (1.10 → I-010) or a sibling prefix (E-003 → I-003) is a
 * GUESS — applied, flagged blue, and counted as confirmed if not corrected;
 * two devices named, or two devices sharing the number, is AMBIGUOUS and
 * asks; camera-roll names (IMG_4523) are never guessed from. The label read
 * is the one the card shows (display label, else the alternate label —
 * install rows often carry only the latter, which is why the first build
 * matched nothing on a deploy page).
 *
 * HOW IT WRITES — no API key in the browser (Known Issue #17 pattern):
 *   1. The binary goes STRAIGHT to Knack's asset store with the user's own
 *      session token (SCW.photoEditPanel.util.uploadImage — the same call
 *      the single-photo modal makes). One asset per photo, however many
 *      destinations it has.
 *   2. A FILL writes the asset id onto the slot record through the scene's
 *      DOC_photos save view (photo-edit-panel.js SAVE_VIEWS — view-based
 *      PUT, session token), then a best-effort second PUT stamps
 *      FLAG_complete = Yes and a history line; its failure never fails the
 *      fill.
 *   3. A NEW photo posts a small MANIFEST (asset id + target + type + scope,
 *      no file bytes) to SCW.CONFIG.MAKE_PHOTO_ASSIGN_WEBHOOK, where Make
 *      creates the DOC_photos record and connects it — contract in
 *      src/config.js. While that URL is blank the Send refuses batches that
 *      need it and says so; fills work without Make.
 * Send takes the aimed photos; unaimed ones stay in the queue and can be
 * aimed and sent afterwards. Not carried over from v1: the IndexedDB queue /
 * resume banner — a closed modal drops its queue.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  var ns = window.SCW.worksheetV2 = window.SCW.worksheetV2 || {};

  var CONFIG = {
    // Preview gate. Empty list = everyone.
    ALLOWED_EMAILS: ['micah.shearer@getscw.com', 'jon.carter@getscw.com'],
    BUTTON_LABEL:   '+ Add Photos (v2)',
    BUTTON_TITLE:   'Bulk photo assign (v2) — preview: only the listed users see this button',
    WEBHOOK_KEY:    'MAKE_PHOTO_ASSIGN_WEBHOOK',
    // Slot writes are view-based PUTs against Knack (~10 req/s): cap them.
    WRITES_IN_FLIGHT: 3,
    // Make creates the records on its own schedule after the ack; refetch
    // the worksheet once more this long after a batch that sent any.
    MAKE_REFRESH_DELAY_MS: 9000,
    // Camera-roll name stems: the number that follows one of these is a
    // frame counter, never a device number.
    CAMERA_ROLL_STEMS: ['IMG', 'DSC', 'DSCN', 'DSCF', 'PXL', 'DJI', 'GOPR', 'GP', 'MVIMG', 'PANO', 'SAM', 'DCIM', 'PHOTO', 'IMAGE', 'SCREENSHOT', 'VID'],
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
  // Rail rows a tile can be dropped on: a device, one of its open slots, or
  // its "+ new photo" row.
  var DROP_SEL = '[data-scw-pa-dev-row], [data-scw-pa-slot-row], [data-scw-pa-new-row]';
  var ZOOM_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
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
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function natCmp(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
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
  /** The label the card shows: the display label, else the alternate
   *  label (install rows often carry only field_2801). */
  function dropLabelOf(rec, F) {
    var d = readText(rec, F.displayLabel || 'field_1950') ||
            readText(rec, F.labelAlt || 'field_2365');
    if (d) return d;
    // Neither label column served: compose the designator from its parts.
    var pre = F.dropPrefix ? readText(rec, F.dropPrefix) : '';
    var num = F.dropNumber ? readText(rec, F.dropNumber) : '';
    if (pre && num) return pre + '-' + num;
    return pre || num || '';
  }
  function productOf(rec, F) {
    return readText(rec, F.productName || '') || readText(rec, F.product || 'field_1949');
  }
  function mdfOf(rec, F) {
    var raw = rec && rec[(F.mdfIdf || 'field_1946') + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) {
      return { id: raw[0].id, label: stripHtml(raw[0].identifier) || 'MDF / IDF' };
    }
    return { id: '__unknown', label: 'No MDF / IDF' };
  }
  function labelOf(rec, viewKey) {
    var F = fieldsFor(viewKey);
    var d = dropLabelOf(rec, F), p = productOf(rec, F);
    if (d && p) return d + ' · ' + p;
    return d || p || rec.id || '';
  }
  function mountingBucket(viewKey) {
    try { return (ns.cfg && typeof ns.cfg.bucket === 'function') ? (ns.cfg.bucket('mountingHardware', viewKey) || '') : ''; }
    catch (e) { return ''; }
  }
  function bucketIdOf(rec, viewKey) {
    var card = ns.card;
    return (card && typeof card.bucketIdOf === 'function') ? (card.bucketIdOf(rec, viewKey) || '') : '';
  }
  /** The records the worksheet folds under a parent card — the SAME rule as
   *  groups.js collectAttachedAccessoryIds (copied, not shared: that one
   *  runs on module state the last render set). Services never attach; on
   *  install (config accessoriesAlwaysAttach) any other record naming a
   *  LOADED parent is attached, elsewhere only when its Require Sub Bid is
   *  No/false; and when two records name EACH OTHER as parent (seen live on
   *  the install worksheet: a camera and its mount, a corrupt reciprocal
   *  link) the mounting-hardware side stays attached and the device
   *  un-hides — both stay visible when the buckets cannot tell them apart.
   *  Without this tie-break every camera with a bracket read as "parented"
   *  and vanished from the rail (2026-10-15). */
  function attachedAccessoryIds(records, viewKey) {
    var F = fieldsFor(viewKey), vc = viewCfg(viewKey), card = ns.card;
    var parentKey = F.parent || 'field_2464';
    var rsbKey = F.requireSubBid || 'field_2479';
    var always = !!(vc && vc.accessoriesAlwaysAttach);
    var mh = mountingBucket(viewKey);
    var byId = Object.create(null), attached = Object.create(null), parentOf = Object.create(null);
    for (var i = 0; i < records.length; i++) if (records[i] && records[i].id) byId[records[i].id] = records[i];
    function rsbNoOrFalse(rec) {
      var raw = rec && rec[rsbKey + '_raw'];
      if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
      if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
      var sv = (rec && rec[rsbKey] || '').toString().trim().toLowerCase();
      return sv === 'no' || sv === 'false' || sv === '0';
    }
    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (!rec || !rec.id) continue;
      if (card && typeof card.bucketCategoryOf === 'function' && card.bucketCategoryOf(rec, viewKey) === 'services') continue;
      if (!always && !rsbNoOrFalse(rec)) continue;
      var raw = rec[parentKey + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var k = 0; k < raw.length; k++) {
        var pid = raw[k] && raw[k].id;
        if (pid && pid !== rec.id && byId[pid]) { attached[rec.id] = true; parentOf[rec.id] = pid; break; }
      }
    }
    for (var cid in parentOf) {
      var p = parentOf[cid];
      if (cid >= p || parentOf[p] !== cid) continue;          // each 2-cycle once
      var cMount = !!mh && bucketIdOf(byId[cid], viewKey) === mh;
      var pMount = !!mh && bucketIdOf(byId[p], viewKey) === mh;
      if (cMount !== pMount) delete attached[cMount ? p : cid];   // the device side un-hides
      else { delete attached[cid]; delete attached[p]; }          // ambiguous — show both
    }
    return attached;
  }
  /** Photos attach to hardware: services, assumptions and licenses are
   *  never targets, nor are accessories — a record the worksheet folds
   *  under a parent card (`attached`, above) or anything in the
   *  mounting-hardware bucket (an orphan mount, or a view that serves no
   *  parent column). `why` (optional) tallies the skips for the console
   *  line open() logs. */
  function isPhotoTarget(rec, viewKey, why, attached) {
    if (!rec || !rec.id) return false;
    function skip(reason) { if (why) why[reason] = (why[reason] || 0) + 1; return false; }
    var card = ns.card, cat = 'default';
    if (card && typeof card.bucketCategoryOf === 'function') cat = card.bucketCategoryOf(rec, viewKey);
    if (cat === 'services' || cat === 'assumptions') return skip(cat);
    if (card && typeof card.isLicenseBucket === 'function' && card.isLicenseBucket(rec, viewKey)) return skip('licenses');
    if (attached && attached[rec.id]) return skip('attached');
    var mh = mountingBucket(viewKey);
    if (mh && bucketIdOf(rec, viewKey) === mh) return skip('accessories');
    return true;
  }
  /** Label tokens: letters and digit runs, upper-cased, digit runs with
   *  leading zeros dropped — so E-001, E001, e1 and E-1 all read E,1. */
  function tokensOf(s) {
    var parts = String(s || '').toUpperCase().match(/[A-Z]+|\d+/g) || [];
    return parts.map(function (p) { return /^\d+$/.test(p) ? String(parseInt(p, 10)) : p; });
  }
  function candidatesFor(viewKey, why) {
    var recs = (ns.data && typeof ns.data.readRecords === 'function') ? ns.data.readRecords(viewKey) : [];
    var keep = [], attached = attachedAccessoryIds(recs, viewKey);
    if (why) why.records = recs.length;
    for (var i = 0; i < recs.length; i++) if (isPhotoTarget(recs[i], viewKey, why, attached)) keep.push(recs[i]);
    if (ns.picker && typeof ns.picker.canonicalItemSort === 'function') {
      keep.sort(ns.picker.canonicalItemSort(function (r) { return labelOf(r, viewKey); }));
    }
    var F = fieldsFor(viewKey);
    return keep.map(function (r) {
      var drop = dropLabelOf(r, F);
      var toks = tokensOf(drop);
      var letters = [], number = '';
      for (var t = 0; t < toks.length; t++) {
        if (/^\d+$/.test(toks[t])) number = toks[t]; else letters.push(toks[t]);
      }
      return {
        id: r.id, label: labelOf(r, viewKey), drop: drop, product: productOf(r, F),
        tokens: toks, prefix: letters.join(''), number: number, mdf: mdfOf(r, F), rec: r
      };
    });
  }
  function candidateById(id) {
    return (_state && _state.candIndex && _state.candIndex[id]) || null;
  }

  // ── File-name matching ────────────────────────────────────────────
  /** Per-batch index over the candidates: which prefixes exist, and which
   *  devices carry each number. */
  function buildMatchContext(candidates) {
    var prefixes = Object.create(null), byNumber = Object.create(null);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.prefix) prefixes[c.prefix] = true;
      if (c.number) (byNumber[c.number] = byNumber[c.number] || []).push(c);
    }
    return { prefixes: prefixes, byNumber: byNumber };
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
  function isRollStem(tok) { return CONFIG.CAMERA_ROLL_STEMS.indexOf(tok) !== -1; }
  /** The device a file name names → { cand, confidence: 'matched'|'guessed',
   *  via } or null (nothing, ambiguous, or camera-roll only). */
  function matchFile(filename, candidates, ctx) {
    ctx = ctx || buildMatchContext(candidates);
    var hay = tokensOf(String(filename || '').replace(/\.[^.]+$/, ''));
    if (!hay.length) return null;

    // 1 — a whole device label in the name. The longer label wins; two
    //     different devices at the same length is ambiguous.
    var best = null, bestLen = 0, bestCount = 0;
    for (var i = 0; i < candidates.length; i++) {
      var t = candidates[i].tokens;
      if (!t.length || !candidates[i].prefix) continue;     // bare-number labels: step 3
      if (!containsSeq(hay, t)) continue;
      if (t.length > bestLen) { best = candidates[i]; bestLen = t.length; bestCount = 1; }
      else if (t.length === bestLen) bestCount++;
    }
    if (best) return bestCount === 1 ? { cand: best, confidence: 'matched', via: 'label' } : null;

    // Numbers the name carries, minus a camera-roll counter (IMG_4523).
    var nums = [], lettersBefore = Object.create(null), prev = null;
    for (var h = 0; h < hay.length; h++) {
      var tok = hay[h];
      if (/^\d+$/.test(tok)) {
        if (prev && isRollStem(prev)) { prev = tok; continue; }
        if (nums.indexOf(tok) === -1) nums.push(tok);
        if (prev && /^[A-Z]+$/.test(prev)) lettersBefore[tok] = prev;
      }
      prev = tok;
    }
    if (!nums.length) return null;

    // 2 — a leading "1" read as the letter I: 1.10 → I-010 (a guess).
    if (hay.length >= 2 && hay[0] === '1' && /^\d+$/.test(hay[1]) && ctx.prefixes.I) {
      var iHits = (ctx.byNumber[hay[1]] || []).filter(function (c) { return c.prefix === 'I'; });
      if (iHits.length === 1) return { cand: iHits[0], confidence: 'guessed', via: 'leading1' };
    }

    // 3 — a number unique on this worksheet: a match on its own, a guess
    //     when an unknown prefix precedes it (E-003 on an I- page).
    var hit = null, hitNum = '';
    for (var n = 0; n < nums.length; n++) {
      var list = ctx.byNumber[nums[n]] || [];
      if (!list.length) continue;
      if (list.length > 1 || hit) return null;               // two devices fit
      hit = list[0]; hitNum = nums[n];
    }
    if (!hit) return null;
    var pre = lettersBefore[hitNum] || '';
    if (pre && pre !== hit.prefix) {
      return ctx.prefixes[pre] ? null : { cand: hit, confidence: 'guessed', via: 'prefix' };
    }
    return { cand: hit, confidence: 'matched', via: 'number' };
  }

  // ── Slots + types ─────────────────────────────────────────────────
  function photoList(viewKey, deviceId) {
    var ph = (ns.photos && typeof ns.photos.extractPhotoRecords === 'function')
      ? ns.photos.extractPhotoRecords(viewKey, deviceId) : [];
    var out = [];
    for (var i = 0; i < ph.length; i++) {
      var p = ph[i];
      if (!p || !p.id) continue;
      out.push({ id: p.id, type: p.type || '', required: !!p.required, filled: !!p.imgUrl, history: p.qaHistory || '' });
    }
    return out;
  }
  /** This device's photo records, in the order the worksheet strip shows
   *  them (photos.js pins Proposed Mounting Location first, then
   *  missing-required, then required, then type). Cached per batch. */
  function photosFor(deviceId) {
    if (!_state) return [];
    if (!_state.photoCache[deviceId]) _state.photoCache[deviceId] = photoList(_state.viewKey, deviceId);
    return _state.photoCache[deviceId];
  }
  function openSlotsFor(viewKey, deviceId) {
    var list = (_state && _state.viewKey === viewKey) ? photosFor(deviceId) : photoList(viewKey, deviceId);
    return list.filter(function (p) { return !p.filled; });
  }
  function deviceInfo(deviceId) {
    var all = photosFor(deviceId);
    var reqTotal = 0, reqOpen = 0, open = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].required) { reqTotal++; if (!all[i].filled) reqOpen++; }
      if (!all[i].filled) open.push(all[i]);
    }
    return { reqTotal: reqTotal, reqOpen: reqOpen, open: open };
  }
  function typeOptions() {
    var u = pepUtil();
    var list = (u && typeof u.collectTypeOptions === 'function') ? (u.collectTypeOptions() || []) : [];
    return list.filter(function (t) { return t && t.id && t.label; });
  }
  function typeLabelById(id) {
    var list = typeOptions();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return '';
  }
  // ── Targets (the chips) ───────────────────────────────────────────
  function slotTakenBy(slotId, exceptRowId) {
    if (!_state) return null;
    for (var i = 0; i < _state.rows.length; i++) {
      var r = _state.rows[i];
      if (r.id === exceptRowId || r.status === 'done') continue;
      for (var t = 0; t < r.targets.length; t++) {
        if (r.targets[t].mode === 'slot' && r.targets[t].slotId === slotId) return r.id;
      }
    }
    return null;
  }
  function slotTarget(deviceId, slot, guessed) {
    return { deviceId: deviceId, mode: 'slot', slotId: slot.id, slotType: slot.type, slotRequired: !!slot.required,
             history: slot.history || '', typeId: '', typeLabel: '', guessed: !!guessed };
  }
  function newTarget(deviceId, typeId, guessed) {
    return { deviceId: deviceId, mode: 'new', slotId: '', slotType: '', slotRequired: false, history: '',
             typeId: typeId || '', typeLabel: typeId ? typeLabelById(typeId) : '', guessed: !!guessed };
  }
  /** What a plain device click does: the first open REQUIRED slot nobody
   *  else in the batch is filling, else a new photo. The slot rows under
   *  the device (and the chip menu) pick anything else explicitly. */
  function defaultTarget(deviceId, guessed) {
    var open = deviceInfo(deviceId).open;
    for (var i = 0; i < open.length; i++) {
      if (open[i].required && !slotTakenBy(open[i].id)) return slotTarget(deviceId, open[i], guessed);
    }
    return newTarget(deviceId, '', guessed);
  }
  function targetOf(row, deviceId) {
    for (var i = 0; i < row.targets.length; i++) if (row.targets[i].deviceId === deviceId) return row.targets[i];
    return null;
  }
  function addTarget(rowId, deviceId, spec) {
    var row = rowById(rowId);
    if (!row || row.status === 'done' || row.status === 'too-big' || !candidateById(deviceId)) return false;
    var existing = targetOf(row, deviceId);
    var t;
    if (spec && spec.mode === 'slot') {
      var slots = deviceInfo(deviceId).open, slot = null;
      for (var i = 0; i < slots.length; i++) if (slots[i].id === spec.slotId) { slot = slots[i]; break; }
      if (!slot) return false;
      if (slotTakenBy(slot.id, rowId)) return false;
      t = slotTarget(deviceId, slot, spec.guessed);
    } else if (spec && spec.mode === 'new') {
      t = newTarget(deviceId, spec.typeId, spec.guessed);
    } else {
      t = defaultTarget(deviceId, spec && spec.guessed);
    }
    if (existing) row.targets[row.targets.indexOf(existing)] = t; else row.targets.push(t);
    if (row.status === 'failed') { row.status = 'queued'; row.error = ''; }
    return true;
  }
  function removeTarget(rowId, deviceId) {
    var row = rowById(rowId);
    if (!row) return;
    row.targets = row.targets.filter(function (t) { return t.deviceId !== deviceId; });
  }
  function describeTarget(t) {
    if (t.mode === 'slot') return 'fills ' + (t.slotType || 'open slot');
    return t.typeLabel ? 'new ' + t.typeLabel + ' photo' : 'new photo';
  }
  function describeTargetLong(t) {
    var c = candidateById(t.deviceId);
    var dev = c ? (c.drop || c.label) : 'device';
    if (t.mode === 'slot') return 'Fill ' + (t.slotType || 'slot') + ' on ' + dev;
    return 'New ' + (t.typeLabel ? '"' + t.typeLabel + '" ' : '') + 'photo on ' + dev;
  }

  // ── Styles ────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-pa-overlay { position:fixed; inset:0; z-index:99990; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center;',
      '  font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif; color:#0f172a; }',
      '.scw-pa { position:relative; background:#fff; border-radius:12px; width:min(1440px,97vw); height:min(940px,95vh); display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.4); overflow:hidden; }',
      '.scw-pa-hd { padding:12px 18px; display:flex; align-items:center; justify-content:space-between; background:#07467c; color:#fff; flex:none; }',
      '.scw-pa-hd .scw-pa-title { font-weight:700; font-size:15px; }',
      '.scw-pa-hd .scw-pa-sub { font-size:12px; opacity:.85; margin-top:2px; }',
      '.scw-pa-hd button { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:0 4px; line-height:1; }',
      '.scw-pa-tb { padding:10px 18px 0; display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex:none; }',
      '.scw-pa-tb .scw-pa-spacer { flex:1; }',
      '.scw-pa-tbhint { font-size:12px; color:#64748b; max-width:520px; line-height:1.35; }',
      '.scw-pa-matchsum { display:flex; align-items:center; gap:8px; font-size:12.5px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; }',
      '.scw-pa-matchsum .ok { font-weight:700; color:#14532d; } .scw-pa-matchsum .gs { font-weight:700; color:#1e3a8a; } .scw-pa-matchsum .td { font-weight:700; color:#92400e; } .scw-pa-matchsum .dot { color:#cbd5e1; }',
      '.scw-pa-main { display:flex; gap:14px; padding:12px 18px; flex:1; min-height:0; }',
      '.scw-pa-left { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; min-height:0; }',
      '.scw-pa-selbar { display:flex; align-items:center; gap:10px; font-size:12.5px; flex:none; flex-wrap:wrap; }',
      '.scw-pa-selbar .muted { color:#64748b; } .scw-pa-selbar .scw-pa-spacer { flex:1; }',
      '.scw-pa-gridwrap { flex:1; min-height:0; overflow-y:auto; border-radius:10px; padding:10px 8px 8px; }',
      '.scw-pa-gridwrap.is-over { outline:2px dashed #0284c7; outline-offset:-2px; background:#f0f9ff; }',
      '.scw-pa-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(236px, 1fr)); gap:14px; align-content:start; }',
      '.scw-pa-empty { grid-column:1 / -1; padding:40px 16px; text-align:center; color:#64748b; font-size:13px; border:2px dashed #cbd5e1; border-radius:10px; background:#f8fafc; }',
      '.scw-pa-tile { background:#fff; border:2px solid #e2e8f0; border-radius:10px; display:flex; flex-direction:column; position:relative; }',
      '.scw-pa-tile.is-sel { border-color:#0284c7; box-shadow:0 0 0 3px rgba(2,132,199,.2); }',
      '.scw-pa-tile.is-todo { border-color:#f59e0b; }',
      '.scw-pa-tile.is-done { opacity:.6; }',
      '.scw-pa-tile.is-dragging { opacity:.4; }',
      '.scw-pa-tile.has-menu { z-index:5; }',
      /* The thumb shows the WHOLE photo (contain, not cover): a crop of the
         middle of a pole is why nobody could tell which camera it was. */
      '.scw-pa-thumb { height:176px; border-radius:8px 8px 0 0; background:#1f2937; display:flex; align-items:flex-end; justify-content:space-between; padding:6px 8px; box-sizing:border-box; color:#cbd5e1; font-size:11px; overflow:hidden; position:relative; cursor:pointer; border:0; width:100%; text-align:left; }',
      '.scw-pa-thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }',
      '.scw-pa-thumb .sz { position:relative; z-index:1; background:rgba(15,23,42,.6); border-radius:4px; padding:1px 5px; margin-left:auto; }',
      '.scw-pa-zoom { position:absolute; left:8px; top:8px; z-index:3; width:28px; height:28px; border-radius:7px; border:0; background:rgba(15,23,42,.62); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }',
      '.scw-pa-zoom:hover { background:#0284c7; }',
      '.scw-pa-cb { position:absolute; right:8px; top:8px; width:20px; height:20px; border-radius:4px; border:2px solid #fff; background:rgba(255,255,255,.35); z-index:2; pointer-events:none; }',
      '.scw-pa-tile.is-sel .scw-pa-cb { background:#0284c7; border-color:#0284c7; }',
      '.scw-pa-tile.is-sel .scw-pa-cb::after { content:""; position:absolute; left:6px; top:1px; width:4px; height:10px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }',
      '.scw-pa-meta { padding:8px 10px 10px; display:flex; flex-direction:column; gap:6px; position:relative; }',
      '.scw-pa-name { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
      /* A chip is a small card: the device on line 1 (wraps — install labels
         can be a whole product name), what happens there on line 2. Nothing
         is ever clipped. */
      '.scw-pa-chip { display:flex; flex-direction:column; align-items:flex-start; gap:3px; border-radius:7px; padding:6px 8px; font-size:12px; border:1px solid #86efac; background:#f0fdf4; color:#14532d; box-sizing:border-box; cursor:pointer; width:100%; text-align:left; }',
      '.scw-pa-chip.is-guess { border-color:#93c5fd; background:#eff6ff; color:#1e3a8a; }',
      '.scw-pa-chip .lbl { font-weight:700; white-space:normal; overflow-wrap:anywhere; line-height:1.3; }',
      '.scw-pa-chip .slot { font-size:11px; font-weight:700; color:#312e81; background:#eef2ff; border-radius:4px; padding:1px 6px; white-space:normal; line-height:1.4; text-align:left; }',
      '.scw-pa-chip .slot.new { color:#475569; background:#f1f5f9; }',
      '.scw-pa-addmore { border:1px dashed #cbd5e1; border-radius:7px; padding:4px 8px; font-size:11.5px; color:#64748b; background:#fff; text-align:left; cursor:pointer; width:100%; }',
      '.scw-pa-finder { display:flex; align-items:center; gap:6px; border-radius:7px; padding:4px 6px; border:1px solid #f59e0b; background:#fffbeb; }',
      '.scw-pa-finder:focus-within { border-color:#0284c7; background:#fff; box-shadow:0 0 0 3px rgba(2,132,199,.18); }',
      '.scw-pa-finder input { border:0; outline:0; font:600 12.5px system-ui,sans-serif; width:100%; color:#0f172a; background:transparent; min-width:0; }',
      '.scw-pa-finder input::placeholder { color:#b45309; font-weight:600; }',
      '.scw-pa-hint { font-size:11px; color:#64748b; }',
      '.scw-pa-status { font-size:11.5px; color:#475569; }',
      '.scw-pa-status.is-ok { color:#15803d; font-weight:600; } .scw-pa-status.is-err { color:#b91c1c; font-weight:600; } .scw-pa-status.is-busy { color:#0369a1; }',
      '.scw-pa-menu { position:absolute; left:8px; right:8px; top:100%; margin-top:-6px; z-index:6; background:#fff; border:1px solid #cbd5e1; border-radius:10px; box-shadow:0 16px 40px rgba(15,23,42,.25); padding:6px; font-size:12px; }',
      '.scw-pa-menu .h { padding:4px 8px; font-size:10.5px; font-weight:700; letter-spacing:.04em; color:#64748b; text-transform:uppercase; }',
      '.scw-pa-menu button { display:flex; width:100%; justify-content:space-between; gap:8px; border:0; background:#fff; text-align:left; padding:7px 8px; border-radius:6px; font:12px system-ui,sans-serif; color:#0f172a; cursor:pointer; }',
      '.scw-pa-menu button:hover { background:#f1f5f9; } .scw-pa-menu button.is-on { background:#e0f2fe; } .scw-pa-menu button[disabled] { color:#94a3b8; cursor:default; }',
      '.scw-pa-menu button.danger { color:#b91c1c; }',
      '.scw-pa-x { position:absolute; right:-7px; top:-7px; width:20px; height:20px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#64748b; font-size:13px; line-height:1; cursor:pointer; z-index:3; display:none; padding:0; }',
      '.scw-pa-tile:hover .scw-pa-x { display:block; }',
      /* Rail: every label wraps, nothing truncates; the product sits on its
         own muted line; open slots are rows under the device. */
      '.scw-pa-rail { width:460px; flex:none; border:1px solid #e2e8f0; border-radius:10px; display:flex; flex-direction:column; overflow:hidden; min-height:0; }',
      '.scw-pa-rail-hd { padding:10px 10px 8px; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; gap:8px; flex:none; }',
      '.scw-pa-rail-hd .t { font-size:12.5px; } .scw-pa-rail-hd .t .muted { color:#64748b; }',
      '.scw-pa-search { display:flex; align-items:center; gap:8px; border:1px solid #cbd5e1; border-radius:6px; padding:6px 8px; }',
      '.scw-pa-search input { border:0; outline:0; flex:1; font:12.5px system-ui,sans-serif; min-width:0; }',
      '.scw-pa-rail-hd label { display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; }',
      '.scw-pa-railcount { font-size:12px; color:#92400e; } .scw-pa-railcount:empty { display:none; }',
      '.scw-pa-railcount button { border:0; background:none; color:#07467c; font:600 12px system-ui,sans-serif; cursor:pointer; padding:0; text-decoration:underline; }',
      '.scw-pa-rail-list { flex:1; overflow-y:auto; min-height:0; padding:4px 0; }',
      '.scw-pa-grp { font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#64748b; padding:12px 10px 4px; display:flex; justify-content:space-between; align-items:center; gap:8px; }',
      '.scw-pa-grp span { white-space:normal; }',
      '.scw-pa-grp button { border:0; background:none; color:#07467c; font:600 11px system-ui,sans-serif; cursor:pointer; text-transform:none; letter-spacing:0; white-space:nowrap; }',
      '.scw-pa-dev { display:grid; grid-template-columns:18px minmax(0,1fr) auto; gap:2px 10px; align-items:start; padding:8px 10px; margin:0 4px; border-radius:8px; border:1px solid transparent; font-size:12.5px; cursor:pointer; }',
      '.scw-pa-dev:hover { background:#f8fafc; }',
      '.scw-pa-dev.is-hit { background:#e0f2fe; border-color:#7dd3fc; }',
      '.scw-pa-dev.is-over { background:#e0f2fe; border-color:#0284c7; border-style:dashed; }',
      '.scw-pa-dev .id { font-weight:700; white-space:normal; overflow-wrap:anywhere; line-height:1.3; }',
      '.scw-pa-dev .nm { grid-column:2; color:#64748b; font-size:11.5px; white-space:normal; overflow-wrap:anywhere; line-height:1.3; }',
      '.scw-pa-dev .st { grid-column:3; grid-row:1 / span 2; font-size:11px; white-space:normal; text-align:right; max-width:150px; line-height:1.3; color:#92400e; font-weight:700; align-self:start; }',
      '.scw-pa-dev .st.full { color:#15803d; font-weight:400; } .scw-pa-dev .st.none { color:#94a3b8; font-weight:400; } .scw-pa-dev .st.q { color:#0369a1; font-weight:600; }',
      '.scw-pa-dev .box { width:16px; height:16px; border-radius:4px; border:1.5px solid #cbd5e1; background:#fff; position:relative; margin-top:1px; grid-row:1 / span 2; }',
      '.scw-pa-dev .box.on { background:#0284c7; border-color:#0284c7; }',
      '.scw-pa-dev .box.on::after { content:""; position:absolute; left:4px; top:1px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }',
      '.scw-pa-dev .box.some { background:#bae6fd; border-color:#0284c7; }',
      '.scw-pa-slot { display:grid; grid-template-columns:14px minmax(0,1fr) auto; gap:8px; align-items:center; padding:4px 10px 4px 38px; margin:0 4px; border-radius:6px; border:1px solid transparent; font-size:12px; color:#334155; cursor:pointer; }',
      '.scw-pa-slot:hover { background:#f8fafc; }',
      '.scw-pa-slot.is-hit { background:#e0f2fe; border-color:#7dd3fc; }',
      '.scw-pa-slot.is-over { background:#e0f2fe; border-color:#0284c7; border-style:dashed; }',
      '.scw-pa-slot.is-taken { color:#94a3b8; }',
      '.scw-pa-slot.new { color:#1e3a8a; }',
      '.scw-pa-slot .box { width:14px; height:14px; border-radius:4px; border:1.5px solid #cbd5e1; background:#fff; position:relative; }',
      '.scw-pa-slot .box.on { background:#0284c7; border-color:#0284c7; }',
      '.scw-pa-slot .box.on::after { content:""; position:absolute; left:3px; top:0; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }',
      '.scw-pa-slot .sl { white-space:normal; overflow-wrap:anywhere; line-height:1.3; }',
      '.scw-pa-slot .req { font-size:10px; font-weight:700; color:#92400e; background:#fffbeb; border:1px solid #fcd34d; border-radius:4px; padding:0 4px; margin-left:4px; white-space:nowrap; }',
      '.scw-pa-slot .who { font-size:11px; color:#64748b; white-space:normal; text-align:right; max-width:140px; overflow-wrap:anywhere; }',
      '.scw-pa-slot.is-hit .who { color:#0369a1; font-weight:600; }',
      '.scw-pa-rail-ft { padding:8px 10px; border-top:1px solid #e2e8f0; font-size:11.5px; color:#64748b; background:#f8fafc; flex:none; }',
      '.scw-pa-ft { padding:10px 18px; border-top:1px solid #e5e7eb; display:flex; gap:8px; justify-content:flex-end; align-items:center; background:#f8fafc; flex:none; }',
      '.scw-pa-ft .scw-pa-summary { margin-right:auto; color:#475569; font-size:13px; } .scw-pa-ft .scw-pa-summary b { color:#0f172a; }',
      '.scw-pa-btn { padding:7px 12px; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer; font:600 12.5px/1 system-ui,sans-serif; background:#fff; color:#0f172a; }',
      '.scw-pa-btn.primary { background:#07467c; color:#fff; border-color:#053659; }',
      '.scw-pa-btn.primary:hover:not([disabled]) { background:#053659; }',
      '.scw-pa-btn.sm { padding:5px 10px; font-size:12px; }',
      '.scw-pa-btn[disabled] { opacity:.55; cursor:default; }',
      '.scw-pa-errors { margin:10px 18px 0; padding:8px 12px; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:#7f1d1d; font-size:12.5px; flex:none; }',
      '.scw-pa-errors div + div { margin-top:3px; }',
      '.scw-pa-done { margin:10px 18px 0; padding:8px 12px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#14532d; font-size:12.5px; flex:none; }',
      '.scw-pa-k { display:inline-block; border:1px solid #cbd5e1; border-bottom-width:2px; border-radius:4px; padding:0 5px; font-size:10.5px; color:#475569; background:#f8fafc; }',
      /* Lightbox: the photo at full size inside the dialog, ← → walk the queue. */
      '.scw-pa-lb { position:absolute; inset:0; z-index:20; background:rgba(15,23,42,.94); display:flex; flex-direction:column; color:#fff; }',
      '.scw-pa-lb-hd { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 18px; flex:none; }',
      '.scw-pa-lb-name { font-weight:700; font-size:14px; } .scw-pa-lb-sub { font-size:12px; opacity:.8; margin-top:2px; }',
      '.scw-pa-lb-hd button { background:none; border:0; color:#fff; font-size:26px; line-height:1; cursor:pointer; padding:0 4px; }',
      '.scw-pa-lb-body { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:0 12px; }',
      '.scw-pa-lb-body img { max-width:100%; max-height:100%; object-fit:contain; flex:1; min-width:0; border-radius:6px; }',
      '.scw-pa-lb-ph { font-size:40px; font-weight:700; color:#94a3b8; }',
      '.scw-pa-lb-nav { flex:none; width:40px; height:72px; border-radius:8px; border:0; background:rgba(255,255,255,.12); color:#fff; font-size:30px; cursor:pointer; }',
      '.scw-pa-lb-nav:hover { background:rgba(255,255,255,.25); }',
      '.scw-pa-lb-ft { padding:10px 18px 14px; font-size:12px; opacity:.8; flex:none; text-align:center; }',
      '.scw-pa-lb .scw-pa-k { color:#e2e8f0; background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.3); }',
      '@media (max-width: 900px) { .scw-pa-main { flex-direction:column; } .scw-pa-rail { width:auto; max-height:40%; } }'
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
    var why = {};
    var cands = candidatesFor(viewKey, why);
    try {
      var skipped = []; for (var wk in why) if (wk !== 'records') skipped.push(wk + ' ' + why[wk]);
      console.info('[scw-photo-assign] ' + viewKey + ': ' + (why.records || 0) + ' records → ' + cands.length +
        ' photo targets' + (skipped.length ? ' (skipped: ' + skipped.join(', ') + ')' : ''));
    } catch (eLog) { /* console is optional */ }
    var idx = Object.create(null);
    for (var i = 0; i < cands.length; i++) idx[cands[i].id] = cands[i];
    _state = {
      viewKey:    viewKey,
      rows:       [],
      candidates: cands,
      candIndex:  idx,
      matchCtx:   buildMatchContext(cands),
      photoCache: Object.create(null),
      selected:   Object.create(null),
      hideAimed:  false,
      railQuery:  '',
      railNeedFirst: true,
      zoomRow:    '',
      finderRow:  '',
      menuRow:    '',
      menuDevice: '',
      dragIds:    null,
      sending:    false,
      errors:     [],
      done:       '',
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
            '<div class="scw-pa-sub">' + esc((vc && vc.label) || 'This worksheet') + ' · ' +
              plural(cands.length, 'device') + ' · aim each photo at one or more devices · preview</div></div>' +
          '<button type="button" data-scw-pa-close aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-pa-tb"></div>' +
        '<div class="scw-pa-errors" hidden></div>' +
        '<div class="scw-pa-done" hidden></div>' +
        '<div class="scw-pa-main">' +
          '<div class="scw-pa-left">' +
            '<div class="scw-pa-selbar"></div>' +
            '<div class="scw-pa-gridwrap"><div class="scw-pa-grid"></div></div>' +
          '</div>' +
          '<div class="scw-pa-rail">' +
            '<div class="scw-pa-rail-hd"></div>' +
            '<div class="scw-pa-rail-list"></div>' +
            '<div class="scw-pa-rail-ft">Ticks show where the <b>selected</b> photo goes. Click a device for its first open required slot (else a new photo), or click a slot under it to fill exactly that one. Drag works too.</div>' +
          '</div>' +
        '</div>' +
        '<div class="scw-pa-ft">' +
          '<div class="scw-pa-summary"></div>' +
          '<button type="button" class="scw-pa-btn" data-scw-pa-clear>Clear all</button>' +
          '<button type="button" class="scw-pa-btn primary" data-scw-pa-send>Send</button>' +
        '</div>' +
        '<input type="file" multiple accept="image/*,.heic,.heif" style="display:none" data-scw-pa-file>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.tabIndex = -1;
    wire(overlay);
    render();
    try { overlay.focus(); } catch (eF) { /* keys still work once anything inside is focused */ }
    return _state;
  }
  function close() {
    var el = document.getElementById(ROOT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (_state) {
      for (var i = 0; i < _state.rows.length; i++) {
        if (_state.rows[i].thumbUrl) { try { URL.revokeObjectURL(_state.rows[i].thumbUrl); } catch (e) {} }
      }
    }
    _state = null;
  }
  function root() { return document.getElementById(ROOT_ID); }
  function q(sel) { var r = root(); return r ? r.querySelector(sel) : null; }

  function wire(overlay) {
    overlay.addEventListener('click', function (e) {
      if (!_state) return;
      if (e.target === overlay) { if (!_state.sending) close(); return; }
      var t = e.target;
      if (!t || !t.closest) return;
      var b;
      if (t.closest('[data-scw-pa-close]')) { if (!_state.sending) close(); return; }
      if (t.closest('[data-scw-pa-clear]')) { if (!_state.sending) clearAll(); return; }
      if (t.closest('[data-scw-pa-send]')) { send(); return; }
      if (t.closest('[data-scw-pa-add]')) { var inp = overlay.querySelector('[data-scw-pa-file]'); if (inp) inp.click(); return; }
      if (t.closest('[data-scw-pa-rematch]')) { autoMatch(true); render(); return; }
      if (t.closest('[data-scw-pa-selunaimed]')) { selectUnaimed(); return; }
      if (t.closest('[data-scw-pa-hideaimed]')) { _state.hideAimed = !_state.hideAimed; render(); return; }
      if ((b = t.closest('[data-scw-pa-remove]'))) { removeRow(b.getAttribute('data-scw-pa-remove')); return; }
      if ((b = t.closest('[data-scw-pa-zoom]'))) { openZoom(b.getAttribute('data-scw-pa-zoom')); return; }
      if (t.closest('[data-scw-pa-lb-close]')) { closeZoom(); return; }
      if (t.closest('[data-scw-pa-lb-prev]')) { zoomStep(-1); return; }
      if (t.closest('[data-scw-pa-lb-next]')) { zoomStep(1); return; }
      if (t.closest('.scw-pa-lb')) { if (t.closest('.scw-pa-lb-body') && !t.closest('img')) closeZoom(); return; }
      if ((b = t.closest('[data-scw-pa-toggle]'))) { toggleSelect(b.getAttribute('data-scw-pa-toggle')); return; }
      if ((b = t.closest('[data-scw-pa-chip]'))) { openMenu(b.getAttribute('data-scw-pa-chip'), b.getAttribute('data-scw-pa-dev')); return; }
      if ((b = t.closest('[data-scw-pa-more]'))) { focusRailFor(b.getAttribute('data-scw-pa-more')); return; }
      if ((b = t.closest('[data-scw-pa-menu-slot]'))) { chooseFromMenu({ mode: 'slot', slotId: b.getAttribute('data-scw-pa-menu-slot') }); return; }
      if ((b = t.closest('[data-scw-pa-menu-new]'))) { chooseFromMenu({ mode: 'new', typeId: b.getAttribute('data-scw-pa-menu-new') }); return; }
      if (t.closest('[data-scw-pa-menu-remove]')) { chooseFromMenu({ remove: true }); return; }
      if (t.closest('[data-scw-pa-menu-close]')) { closeMenu(); render(); return; }
      if (t.closest('[data-scw-pa-railclear]')) { _state.railQuery = ''; var rqc = q('[data-scw-pa-railq]'); if (rqc) rqc.value = ''; renderRail(); return; }
      if ((b = t.closest('[data-scw-pa-tickgrp]'))) { tickGroup(b.getAttribute('data-scw-pa-tickgrp')); return; }
      if ((b = t.closest('[data-scw-pa-slot-row]'))) { clickSlot(b.getAttribute('data-scw-pa-slot-dev'), b.getAttribute('data-scw-pa-slot-row')); return; }
      if ((b = t.closest('[data-scw-pa-new-row]'))) { clickNew(b.getAttribute('data-scw-pa-new-row')); return; }
      if ((b = t.closest('[data-scw-pa-dev-row]'))) { clickDevice(b.getAttribute('data-scw-pa-dev-row')); return; }
      if (_state.menuRow && !t.closest('.scw-pa-menu')) { closeMenu(); render(); }
    });
    overlay.addEventListener('change', function (e) {
      if (!_state) return;
      var t = e.target;
      if (!t) return;
      if (t.hasAttribute('data-scw-pa-file')) {
        addFiles(Array.prototype.slice.call(t.files || []));
        t.value = '';
      } else if (t.hasAttribute('data-scw-pa-needfirst')) {
        _state.railNeedFirst = !!t.checked;
        renderRail();
      }
    });
    overlay.addEventListener('input', function (e) {
      if (!_state) return;
      var t = e.target;
      if (!t) return;
      if (t.hasAttribute('data-scw-pa-finder')) {
        _state.finderRow = t.getAttribute('data-scw-pa-finder');
        _state.railQuery = t.value;
        var rs = q('[data-scw-pa-railq]');
        if (rs) rs.value = t.value;
        renderRail();
      } else if (t.hasAttribute('data-scw-pa-railq')) {
        _state.railQuery = t.value;
        _state.finderRow = '';
        renderRail();
      }
    });
    overlay.addEventListener('focusin', function (e) {
      if (!_state) return;
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute('data-scw-pa-finder')) {
        _state.finderRow = t.getAttribute('data-scw-pa-finder');
        _state.railQuery = t.value;
        renderRail();
      }
    });
    overlay.addEventListener('keydown', function (e) {
      if (!_state) return;
      var t = e.target;
      if (_state.zoomRow) {
        if (e.key === 'Escape') { e.preventDefault(); closeZoom(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); zoomStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); zoomStep(1); }
        return;
      }
      if (t && t.hasAttribute && t.hasAttribute('data-scw-pa-finder')) {
        if (e.key === 'Enter') { e.preventDefault(); finderEnter(t.getAttribute('data-scw-pa-finder')); }
        else if (e.key === 'Escape') { e.preventDefault(); t.value = ''; _state.railQuery = ''; renderRail(); }
        return;
      }
      if (t && t.hasAttribute && t.hasAttribute('data-scw-pa-railq')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var first = q('[data-scw-pa-dev-row]');
          if (first) clickDevice(first.getAttribute('data-scw-pa-dev-row'));
          return;
        }
        if (e.key === 'Escape' && t.value) { e.preventDefault(); t.value = ''; _state.railQuery = ''; renderRail(); return; }
      }
      if (e.key === 'Escape') {
        if (_state.menuRow) { closeMenu(); render(); }
        else if (!_state.sending) close();
      }
    });
    // Drag: tiles → device rows; files from the desktop → the grid.
    overlay.addEventListener('dragstart', function (e) {
      var tile = e.target && e.target.closest && e.target.closest('[data-scw-pa-row]');
      if (!tile || !_state || _state.sending) return;
      var id = tile.getAttribute('data-scw-pa-row');
      _state.dragIds = _state.selected[id] ? selectedIds() : [id];
      try { e.dataTransfer.setData('text/plain', _state.dragIds.join(',')); e.dataTransfer.effectAllowed = 'copyMove'; } catch (e2) {}
      tile.classList.add('is-dragging');
    });
    overlay.addEventListener('dragend', function () {
      if (_state) _state.dragIds = null;
      var d = overlay.querySelectorAll('.is-dragging, .is-over');
      for (var i = 0; i < d.length; i++) { d[i].classList.remove('is-dragging'); d[i].classList.remove('is-over'); }
    });
    overlay.addEventListener('dragover', function (e) {
      var row = e.target && e.target.closest && e.target.closest(DROP_SEL);
      var grid = e.target && e.target.closest && e.target.closest('.scw-pa-gridwrap');
      var hasFiles = e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
      if (row && _state && _state.dragIds) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (e2) {} row.classList.add('is-over'); }
      else if (grid && hasFiles) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (e3) {} grid.classList.add('is-over'); }
    });
    overlay.addEventListener('dragleave', function (e) {
      var row = e.target && e.target.closest && e.target.closest(DROP_SEL);
      if (row) row.classList.remove('is-over');
      var grid = e.target && e.target.closest && e.target.closest('.scw-pa-gridwrap');
      if (grid && e.target === grid) grid.classList.remove('is-over');
    });
    overlay.addEventListener('drop', function (e) {
      var row = e.target && e.target.closest && e.target.closest(DROP_SEL);
      var grid = e.target && e.target.closest && e.target.closest('.scw-pa-gridwrap');
      if (row && _state && _state.dragIds) {
        e.preventDefault();
        row.classList.remove('is-over');
        dropOn(row, _state.dragIds);
        _state.dragIds = null;
        render();
      } else if (grid && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        grid.classList.remove('is-over');
        addFiles(Array.prototype.slice.call(e.dataTransfer.files));
      }
    });
  }

  // ── Rows ──────────────────────────────────────────────────────────
  function rowById(id) {
    if (!_state) return null;
    for (var i = 0; i < _state.rows.length; i++) if (_state.rows[i].id === id) return _state.rows[i];
    return null;
  }
  function selectedIds() {
    if (!_state) return [];
    return _state.rows.filter(function (r) { return _state.selected[r.id]; }).map(function (r) { return r.id; });
  }
  function removeRow(id) {
    if (!_state || _state.sending) return;
    var row = rowById(id);
    if (row && row.thumbUrl) { try { URL.revokeObjectURL(row.thumbUrl); } catch (e) {} }
    _state.rows = _state.rows.filter(function (r) { return r.id !== id; });
    delete _state.selected[id];
    if (_state.zoomRow === id) closeZoom();
    render();
  }
  function clearAll() {
    if (!_state) return;
    closeZoom();
    for (var i = 0; i < _state.rows.length; i++) {
      if (_state.rows[i].thumbUrl) { try { URL.revokeObjectURL(_state.rows[i].thumbUrl); } catch (e) {} }
    }
    _state.rows = [];
    _state.selected = Object.create(null);
    _state.errors = []; _state.done = '';
    render();
  }
  function toggleSelect(id) {
    if (!_state || _state.sending) return;
    if (_state.selected[id]) delete _state.selected[id]; else _state.selected[id] = true;
    renderTile(id); renderSelbar(); renderRail();
  }
  function selectUnaimed() {
    if (!_state) return;
    _state.selected = Object.create(null);
    for (var i = 0; i < _state.rows.length; i++) {
      var r = _state.rows[i];
      if (r.status !== 'too-big' && r.status !== 'done' && !r.targets.length) _state.selected[r.id] = true;
    }
    render();
  }

  /** Queue picked files: HEIC → JPEG and oversized rasters downscaled via
   *  bulk-upload.js's prepareFile when it is exported, else the photo
   *  panel's downscale. Each row is aimed from its name. */
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
    if (!_state || !files || !files.length || _state.sending) return Promise.resolve([]);
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
          targets:   [],
          match:     null,       // { confidence, via } while the aim came from the name
          assetId:   '',
          uploadId:  uuid(),
          result:    '',
          thumbUrl:  ''
        };
        if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' &&
            String(mime).indexOf('image/') === 0) {
          try { row.thumbUrl = URL.createObjectURL(blob); } catch (e) {}
        }
        st.rows.push(row);
        return row;
      }).catch(function (err) {
        console.warn('[scw-photo-assign] could not queue', f && f.name, err);
        return null;
      });
    })).then(function (rows) {
      if (_state !== st) return [];
      autoMatch(false);
      st.done = '';
      render();
      return rows.filter(Boolean);
    });
  }
  /** Aim rows from their file names. `all` re-aims rows that were aimed by
   *  name before; rows the user aimed by hand are left alone. */
  function autoMatch(all) {
    if (!_state) return;
    for (var i = 0; i < _state.rows.length; i++) {
      var row = _state.rows[i];
      if (row.status === 'too-big' || row.status === 'done') continue;
      if (row.targets.length && !(all && row.match)) continue;
      var m = matchFile(row.filename, _state.candidates, _state.matchCtx);
      if (!m) { if (all && row.match) { row.targets = []; row.match = null; } continue; }
      row.targets = [];
      row.match = { confidence: m.confidence, via: m.via };
      addTarget(row.id, m.cand.id, { guessed: m.confidence === 'guessed' });
    }
  }
  function matchCounts() {
    var c = { matched: 0, guessed: 0, todo: 0 };
    if (!_state) return c;
    for (var i = 0; i < _state.rows.length; i++) {
      var r = _state.rows[i];
      if (r.status === 'too-big' || r.status === 'done') continue;
      if (!r.targets.length) c.todo++;
      else if (r.match && r.match.confidence === 'guessed') c.guessed++;
      else if (r.match) c.matched++;
    }
    return c;
  }

  // ── Gestures ──────────────────────────────────────────────────────
  /** A device row click: toggles the destination on the selected photos,
   *  else aims the photo whose finder is open. */
  function clickDevice(deviceId) {
    if (!_state || _state.sending || !candidateById(deviceId)) return;
    var ids = selectedIds();
    var viaFinder = false;
    if (!ids.length && _state.finderRow) { ids = [_state.finderRow]; viaFinder = true; }
    if (!ids.length) {
      var ft = q('.scw-pa-rail-ft');
      if (ft) ft.innerHTML = '<b style="color:#92400e">Select a photo first</b> — tick a tile (or type in its finder), then click the device it belongs to.';
      return;
    }
    var allHave = ids.every(function (id) { var r = rowById(id); return r && targetOf(r, deviceId); });
    for (var i = 0; i < ids.length; i++) {
      var row = rowById(ids[i]);
      if (!row) continue;
      if (allHave) removeTarget(ids[i], deviceId);
      else if (!targetOf(row, deviceId)) { row.match = null; addTarget(ids[i], deviceId, null); }
    }
    if (viaFinder && !allHave) {
      var fr = _state.finderRow;
      _state.finderRow = ''; _state.railQuery = '';
      render();
      focusNextFinder(fr);
      return;
    }
    render();
  }
  function tickGroup(groupId) {
    if (!_state || _state.sending) return;
    var ids = selectedIds();
    if (!ids.length) return;
    for (var c = 0; c < _state.candidates.length; c++) {
      var cand = _state.candidates[c];
      if (cand.mdf.id !== groupId) continue;
      for (var i = 0; i < ids.length; i++) {
        var row = rowById(ids[i]);
        if (row && !targetOf(row, cand.id)) { row.match = null; addTarget(ids[i], cand.id, null); }
      }
    }
    render();
  }
  function railHits() {
    if (!_state) return [];
    var query = tokensOf(_state.railQuery);
    var raw = String(_state.railQuery || '').trim().toLowerCase();
    var out = [];
    for (var i = 0; i < _state.candidates.length; i++) {
      var c = _state.candidates[i];
      if (!raw) { out.push(c); continue; }
      var hay = tokensOf(c.drop + ' ' + c.product + ' ' + c.mdf.label);
      var ok = query.length > 0 && containsSeq(hay, query);
      if (!ok && query.length === 1 && /^\d+$/.test(query[0])) ok = c.number === query[0];
      if (!ok) ok = (c.label + ' ' + c.mdf.label).toLowerCase().indexOf(raw) !== -1;
      if (ok) out.push(c);
    }
    return out;
  }
  function railOrdered(list) {
    if (!_state || !_state.railNeedFirst) return list;
    // Devices still missing a required photo first; canonical order kept
    // inside each band — a stable partition, not a re-sort.
    var need = [], rest = [];
    for (var i = 0; i < list.length; i++) (deviceInfo(list[i].id).reqOpen > 0 ? need : rest).push(list[i]);
    return need.concat(rest);
  }
  function finderEnter(rowId) {
    if (!_state) return;
    _state.finderRow = rowId;
    var hits = railOrdered(railHits());
    if (!hits.length) return;
    var row = rowById(rowId);
    if (!row) return;
    row.match = null;
    addTarget(rowId, hits[0].id, null);
    _state.finderRow = ''; _state.railQuery = '';
    render();
    focusNextFinder(rowId);
  }
  function setFinderQuery(rowId, text) {
    if (!_state) return;
    _state.finderRow = rowId; _state.railQuery = text || '';
    var inp = q('[data-scw-pa-finder="' + rowId + '"]');
    if (inp) inp.value = _state.railQuery;
    renderRail();
  }
  function focusNextFinder(afterRowId) {
    var r = root();
    if (!r) return;
    var finders = r.querySelectorAll('[data-scw-pa-finder]');
    var pick = null, seen = !afterRowId;
    for (var i = 0; i < finders.length; i++) {
      var id = finders[i].getAttribute('data-scw-pa-finder');
      if (seen) { pick = finders[i]; break; }
      if (id === afterRowId) seen = true;
    }
    if (!pick && finders.length) pick = finders[0];
    if (pick) { try { pick.focus(); } catch (e) {} }
  }
  function focusRailFor(rowId) {
    if (!_state) return;
    _state.selected = Object.create(null);
    _state.selected[rowId] = true;
    _state.finderRow = '';
    render();
    var rs = q('[data-scw-pa-railq]');
    if (rs) { try { rs.focus(); } catch (e) {} }
  }
  function openMenu(rowId, deviceId) {
    if (!_state || _state.sending) return;
    _state.menuRow = rowId; _state.menuDevice = deviceId;
    renderTile(rowId);
  }
  function closeMenu() { if (_state) { _state.menuRow = ''; _state.menuDevice = ''; } }
  function chooseFromMenu(spec) {
    if (!_state || !_state.menuRow) return;
    var rowId = _state.menuRow, dev = _state.menuDevice;
    var row = rowById(rowId);
    if (row) {
      if (spec.remove) removeTarget(rowId, dev);
      else { row.match = null; addTarget(rowId, dev, spec); }
    }
    closeMenu();
    render();
  }
  function nudge(text) {
    var ft = q('.scw-pa-rail-ft');
    if (ft) ft.innerHTML = '<b style="color:#92400e">' + esc(text) + '</b>';
  }
  /** The photos a rail click acts on: the selected tiles, else the tile
   *  whose finder is open. */
  function actingRows() {
    var ids = selectedIds(), viaFinder = false;
    if (!ids.length && _state.finderRow) { ids = [_state.finderRow]; viaFinder = true; }
    return { ids: ids, viaFinder: viaFinder };
  }
  function finishFinder(rowId) {
    _state.finderRow = ''; _state.railQuery = '';
    render();
    focusNextFinder(rowId);
  }
  /** A slot row click: aims ONE photo (the first selected, else the finder
   *  row) at exactly that slot; the slot's own photo clicked again clears it. */
  function clickSlot(deviceId, slotId) {
    if (!_state || _state.sending || !candidateById(deviceId) || !slotId) return;
    var act = actingRows(), ids = act.ids;
    if (!ids.length) { nudge('Select a photo first — tick a tile (or type in its finder), then click the slot it should fill.'); return; }
    var holder = slotTakenBy(slotId, null);
    if (holder && ids.indexOf(holder) !== -1) { removeTarget(holder, deviceId); render(); return; }
    if (holder) {
      var h = rowById(holder);
      nudge('That slot is already taken by ' + ((h && h.filename) || 'another photo in this batch') + ' — remove it from that tile first.');
      return;
    }
    var row = rowById(ids[0]);
    if (!row) return;
    row.match = null;
    if (!addTarget(ids[0], deviceId, { mode: 'slot', slotId: slotId })) return;
    if (ids.length > 1) {
      nudge('A slot takes one photo — ' + row.filename + ' fills it; the other ' + (ids.length - 1) +
        ' selected ' + (ids.length === 2 ? 'photo was' : 'photos were') + ' left alone.');
    }
    if (act.viaFinder) { finishFinder(ids[0]); return; }
    render();
  }
  /** The "+ new photo" row under a device: every acting photo becomes a new
   *  photo of it (toggles off when they all already are). */
  function clickNew(deviceId) {
    if (!_state || _state.sending || !candidateById(deviceId)) return;
    var act = actingRows(), ids = act.ids;
    if (!ids.length) { nudge('Select a photo first — tick a tile, then click "+ new photo" under the device.'); return; }
    var allNew = ids.every(function (id) { var r = rowById(id), t = r && targetOf(r, deviceId); return !!(t && t.mode === 'new'); });
    for (var i = 0; i < ids.length; i++) {
      var row = rowById(ids[i]);
      if (!row) continue;
      if (allNew) removeTarget(ids[i], deviceId);
      else { row.match = null; addTarget(ids[i], deviceId, { mode: 'new' }); }
    }
    if (act.viaFinder && !allNew) { finishFinder(ids[0]); return; }
    render();
  }
  /** A drop on a device row, a slot row or the "+ new photo" row. A slot
   *  takes the first dropped photo; the rest get the device default. */
  function dropOn(rowEl, ids) {
    if (!rowEl || !ids) return;
    var slotId = rowEl.getAttribute('data-scw-pa-slot-row') || '';
    var isNew = rowEl.hasAttribute('data-scw-pa-new-row');
    var dev = rowEl.getAttribute('data-scw-pa-dev-row') || rowEl.getAttribute('data-scw-pa-slot-dev') || rowEl.getAttribute('data-scw-pa-new-row');
    for (var i = 0; i < ids.length; i++) {
      var r = rowById(ids[i]);
      if (!r) continue;
      r.match = null;
      var spec = null;
      if (slotId && i === 0 && !slotTakenBy(slotId, ids[i])) spec = { mode: 'slot', slotId: slotId };
      else if (isNew) spec = { mode: 'new' };
      addTarget(ids[i], dev, spec);
    }
  }

  // ── Lightbox ──────────────────────────────────────────────────────
  function zoomList() {
    return _state ? _state.rows.filter(function (r) { return r.status !== 'too-big'; }) : [];
  }
  function openZoom(rowId) {
    if (!_state || !rowById(rowId)) return;
    _state.zoomRow = rowId;
    renderZoom();
  }
  function closeZoom() {
    if (!_state) return;
    _state.zoomRow = '';
    renderZoom();
    // Focus back on the dialog so Esc / Tab keep working after the close
    // button (which had focus) is gone.
    var r = root();
    if (r) { try { r.focus(); } catch (e) { /* ignore */ } }
  }
  function zoomStep(dir) {
    if (!_state || !_state.zoomRow) return;
    var list = zoomList();
    if (!list.length) return;
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === _state.zoomRow) { i = k; break; }
    _state.zoomRow = list[(i + dir + list.length) % list.length].id;
    renderZoom();
  }
  function renderZoom() {
    var r = root();
    if (!r) return;
    var old = r.querySelector('.scw-pa-lb');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var row = _state && _state.zoomRow ? rowById(_state.zoomRow) : null;
    if (!row) return;
    var list = zoomList(), idx = 0;
    for (var k = 0; k < list.length; k++) if (list[k].id === row.id) { idx = k; break; }
    var where = row.targets.length ? row.targets.map(describeTargetLong).join(' · ') : 'Not aimed yet — close this and tick a device for it';
    var ext = (row.filename.match(/\.([^.]+)$/) || [, '?'])[1].toUpperCase();
    var lb = document.createElement('div');
    lb.className = 'scw-pa-lb';
    lb.innerHTML =
      '<div class="scw-pa-lb-hd"><div><div class="scw-pa-lb-name">' + esc(row.filename) + '</div>' +
        '<div class="scw-pa-lb-sub">' + esc(where) + ' · ' + (idx + 1) + ' of ' + list.length + ' · ' + esc(fmtBytes(row.sizeBytes)) + '</div></div>' +
        '<button type="button" data-scw-pa-lb-close aria-label="Close">&times;</button></div>' +
      '<div class="scw-pa-lb-body">' +
        '<button type="button" class="scw-pa-lb-nav" data-scw-pa-lb-prev aria-label="Previous photo">&lsaquo;</button>' +
        (row.thumbUrl ? '<img src="' + esc(row.thumbUrl) + '" alt="">' : '<div class="scw-pa-lb-ph">' + esc(ext) + '</div>') +
        '<button type="button" class="scw-pa-lb-nav" data-scw-pa-lb-next aria-label="Next photo">&rsaquo;</button></div>' +
      '<div class="scw-pa-lb-ft"><span class="scw-pa-k">&larr;</span> <span class="scw-pa-k">&rarr;</span> other photos · <span class="scw-pa-k">Esc</span> back to the queue</div>';
    var host = r.querySelector('.scw-pa') || r;
    host.appendChild(lb);
    var cb = lb.querySelector('[data-scw-pa-lb-close]');
    if (cb) { try { cb.focus(); } catch (e) { /* ignore */ } }
  }

  // ── Render ────────────────────────────────────────────────────────
  function render() {
    if (!root() || !_state) return;
    renderToolbar(); renderSelbar(); renderGrid(); renderRail(); renderFooter(); renderNotes();
  }
  function renderToolbar() {
    var tb = q('.scw-pa-tb');
    if (!tb) return;
    var st = _state, mc = matchCounts(), dis = st.sending ? ' disabled' : '';
    tb.innerHTML =
      '<button type="button" class="scw-pa-btn" data-scw-pa-add' + dis + '>+ Add photos</button>' +
      '<div class="scw-pa-matchsum"><span style="color:#64748b">From the file names:</span>' +
        '<span class="ok">' + mc.matched + ' matched</span><span class="dot">·</span>' +
        '<span class="gs">' + mc.guessed + ' guessed</span><span class="dot">·</span>' +
        '<span class="td">' + mc.todo + ' to pick</span>' +
        '<button type="button" class="scw-pa-btn sm" data-scw-pa-rematch' + dis + ' style="margin-left:4px" title="Re-read every file name">Re-match</button></div>' +
      '<span class="scw-pa-spacer"></span>' +
      '<span class="scw-pa-tbhint">Clicking a device fills its first open <b>required</b> slot, else adds a new photo. The slots listed under a device let you pick exactly which one a photo fills.</span>';
  }
  function renderSelbar() {
    var el = q('.scw-pa-selbar');
    if (!el) return;
    var st = _state, sel = selectedIds().length, dis = st.sending ? ' disabled' : '';
    var unaimed = st.rows.filter(function (r) { return r.status !== 'too-big' && r.status !== 'done' && !r.targets.length; }).length;
    el.innerHTML =
      (sel ? '<b>' + plural(sel, 'photo') + ' selected</b><span class="muted">· click a device on the right, or drag onto it</span>'
           : '<span class="muted">Tick photos, then click a device on the right — or type in a tile\'s finder. <span class="scw-pa-k">Tab</span> walks the unaimed ones.</span>') +
      '<span class="scw-pa-spacer"></span>' +
      (unaimed ? '<button type="button" class="scw-pa-btn sm" data-scw-pa-selunaimed' + dis + '>Select the ' + unaimed + ' unaimed</button>' : '') +
      '<button type="button" class="scw-pa-btn sm" data-scw-pa-hideaimed' + dis + '>' + (st.hideAimed ? 'Show aimed' : 'Hide aimed') + '</button>';
  }
  function thumbHtml(row, canDrag) {
    var ext = (row.filename.match(/\.([^.]+)$/) || [, '?'])[1].toUpperCase();
    return '<button type="button" class="scw-pa-thumb" data-scw-pa-toggle="' + esc(row.id) + '" aria-label="Select ' + esc(row.filename) + '"' +
      (canDrag ? ' draggable="true" title="Click to select · drag onto a device or a slot"' : '') + '>' +
      (row.thumbUrl ? '<img src="' + esc(row.thumbUrl) + '" alt="">' : '<span style="position:relative;z-index:1">' + esc(ext) + '</span>') +
      '<span class="sz">' + esc(fmtBytes(row.sizeBytes)) + (row.origSize ? ' · resized' : '') + '</span></button>' +
      '<button type="button" class="scw-pa-zoom" data-scw-pa-zoom="' + esc(row.id) + '" title="View larger" aria-label="View ' + esc(row.filename) + ' larger">' + ZOOM_SVG + '</button>' +
      '<span class="scw-pa-cb" aria-hidden="true"></span>';
  }
  function statusHtml(row) {
    var cls = 'scw-pa-status', txt = '';
    switch (row.status) {
      case 'uploading': txt = 'Uploading…'; cls += ' is-busy'; break;
      case 'uploaded':  txt = 'Writing…'; cls += ' is-busy'; break;
      case 'done':      txt = row.result || 'Done'; cls += ' is-ok'; break;
      case 'failed':    txt = row.error || 'Failed'; cls += ' is-err'; break;
      case 'too-big':   txt = row.error || 'Too big'; cls += ' is-err'; break;
      default: return '';
    }
    return '<div class="' + cls + '" title="' + esc(txt) + '">' + esc(txt) + '</div>';
  }
  function chipHtml(row, t) {
    var c = candidateById(t.deviceId);
    var dev = c ? (c.drop || c.product || c.label) : t.deviceId;
    var product = c && c.drop && c.product ? c.product : '';
    return '<button type="button" class="scw-pa-chip' + (t.guessed ? ' is-guess' : '') + '" data-scw-pa-chip="' + esc(row.id) + '" data-scw-pa-dev="' + esc(t.deviceId) + '"' +
      ' title="' + esc(describeTargetLong(t) + (product ? ' (' + product + ')' : '')) + (t.guessed ? ' — a guess from the file name; click to change, Send confirms' : ' — click to change') + '">' +
      '<span class="lbl">' + esc(dev) + (t.guessed ? '?' : '') + (product ? ' <span style="font-weight:400;opacity:.8">· ' + esc(product) + '</span>' : '') + '</span> ' +
      '<span class="slot' + (t.mode === 'new' ? ' new' : '') + '">' + esc(describeTarget(t)) + '</span></button>';
  }
  function menuHtml(row) {
    var dev = _state.menuDevice, c = candidateById(dev);
    var cur = targetOf(row, dev);
    var open = deviceInfo(dev).open, types = typeOptions();
    var h = '<div class="scw-pa-menu"><div class="h">' + esc(c ? (c.drop || c.label) : 'device') + ' — this photo</div>';
    for (var i = 0; i < open.length; i++) {
      var taker = slotTakenBy(open[i].id, row.id);
      var on = cur && cur.mode === 'slot' && cur.slotId === open[i].id;
      h += '<button type="button" data-scw-pa-menu-slot="' + esc(open[i].id) + '" class="' + (on ? 'is-on' : '') + '"' + (taker ? ' disabled' : '') + '>' +
        '<span>Fill ' + esc(open[i].type || 'untyped slot') + (open[i].required ? ' (required)' : '') + '</span>' +
        '<span style="color:#64748b">' + (taker ? 'another photo in this batch' : 'open') + '</span></button>';
    }
    h += '<button type="button" data-scw-pa-menu-new="" class="' + (cur && cur.mode === 'new' && !cur.typeId ? 'is-on' : '') + '"><span>New photo, no type</span></button>';
    for (var t = 0; t < types.length; t++) {
      h += '<button type="button" data-scw-pa-menu-new="' + esc(types[t].id) + '" class="' + (cur && cur.mode === 'new' && cur.typeId === types[t].id ? 'is-on' : '') + '"><span>New photo: ' + esc(types[t].label) + '</span></button>';
    }
    h += '<button type="button" class="danger" data-scw-pa-menu-remove><span>Remove this device</span></button>' +
         '<button type="button" data-scw-pa-menu-close><span style="color:#64748b">Close</span></button></div>';
    return h;
  }
  function tileHtml(row) {
    var st = _state;
    var cls = 'scw-pa-tile' + (st.selected[row.id] ? ' is-sel' : '') +
      (row.status === 'too-big' || (!row.targets.length && row.status !== 'done') ? ' is-todo' : '') +
      (row.status === 'done' ? ' is-done' : '') + (st.menuRow === row.id ? ' has-menu' : '');
    var h = '<div class="' + cls + '" data-scw-pa-row="' + esc(row.id) + '">' +
      thumbHtml(row, !(st.sending || row.status === 'done' || row.status === 'too-big')) +
      '<button type="button" class="scw-pa-x" data-scw-pa-remove="' + esc(row.id) + '" title="Remove from the queue" aria-label="Remove ' + esc(row.filename) + '"' + (st.sending ? ' disabled' : '') + '>&times;</button>' +
      '<div class="scw-pa-meta">' +
        '<div class="scw-pa-name" title="' + esc(row.filename) + '">' + esc(row.filename) + '</div>';
    if (row.status === 'too-big') {
      h += statusHtml(row);
    } else {
      for (var i = 0; i < row.targets.length; i++) h += chipHtml(row, row.targets[i]);
      if (row.status !== 'done') {
        if (!row.targets.length) {
          h += '<div class="scw-pa-finder"><svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            '<input type="text" data-scw-pa-finder="' + esc(row.id) + '" placeholder="Pick device — type a number" aria-label="Which device is ' + esc(row.filename) + '?" autocomplete="off"' +
            (st.finderRow === row.id ? ' value="' + esc(st.railQuery) + '"' : '') + (st.sending ? ' disabled' : '') + '></div>' +
            '<div class="scw-pa-hint">Filters the devices on the right · <span class="scw-pa-k">Enter</span> takes the top one</div>';
        } else {
          h += '<button type="button" class="scw-pa-addmore" data-scw-pa-more="' + esc(row.id) + '"' + (st.sending ? ' disabled' : '') + '>+ another device' +
            (row.targets.length > 1 ? ' · one upload, ' + row.targets.length + ' copies' : '') + '</button>';
        }
      }
      h += statusHtml(row);
      if (st.menuRow === row.id) h += menuHtml(row);
    }
    return h + '</div></div>';
  }
  function visibleRows() {
    return _state.rows.filter(function (r) {
      if (_state.hideAimed && r.targets.length && r.status !== 'done') return false;
      return true;
    });
  }
  function renderGrid() {
    var g = q('.scw-pa-grid');
    if (!g) return;
    if (!_state.rows.length) {
      g.innerHTML = '<div class="scw-pa-empty"><b>Drop photos here</b> or use "+ Add photos".<br><span style="font-size:12px">Large photos are resized · HEIC converts to JPEG · name a file after its device (i10, I-010, 10) and it aims itself.</span></div>';
      return;
    }
    var rows = visibleRows();
    g.innerHTML = rows.map(tileHtml).join('') +
      (rows.length < _state.rows.length ? '<div class="scw-pa-empty" style="padding:14px">' + (_state.rows.length - rows.length) + ' aimed photos hidden</div>' : '');
  }
  function renderTile(rowId) {
    var row = rowById(rowId);
    var el = q('[data-scw-pa-row="' + rowId + '"]');
    if (!row || !el) { renderGrid(); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = tileHtml(row);
    el.parentNode.replaceChild(tmp.firstChild, el);
  }
  function renderRail() {
    var hd = q('.scw-pa-rail-hd'), list = q('.scw-pa-rail-list');
    if (!hd || !list || !_state) return;
    var st = _state;
    if (!hd.querySelector('[data-scw-pa-railq]')) {
      hd.innerHTML =
        '<div class="t"><b>Devices</b> <span class="muted">· click one, or one of its open slots, to aim the selected photo</span></div>' +
        '<div class="scw-pa-search"><svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="text" data-scw-pa-railq placeholder="Number, name or MDF/IDF" aria-label="Find a device" autocomplete="off"></div>' +
        '<label><input type="checkbox" data-scw-pa-needfirst' + (st.railNeedFirst ? ' checked' : '') + '> Devices still missing a required photo first</label>';
    }
    // The search box always shows the query the list is filtered by — a
    // finder that was cleared (Enter, a device click) clears it too.
    var rq = hd.querySelector('[data-scw-pa-railq]');
    if (rq && document.activeElement !== rq && rq.value !== (st.railQuery || '')) rq.value = st.railQuery || '';
    var sel = selectedIds().map(rowById).filter(Boolean);
    if (!sel.length && st.finderRow) { var fr = rowById(st.finderRow); if (fr) sel = [fr]; }
    var hits = railHits();
    var cnt = hd.querySelector('.scw-pa-railcount');
    if (!cnt) { cnt = document.createElement('div'); cnt.className = 'scw-pa-railcount'; hd.appendChild(cnt); }
    cnt.innerHTML = hits.length < st.candidates.length
      ? 'Showing <b>' + hits.length + ' of ' + st.candidates.length + '</b> devices for "' + esc(st.railQuery) + '" · <button type="button" data-scw-pa-railclear>show all</button>'
      : '';
    var groups = [], byId = Object.create(null);
    for (var i = 0; i < hits.length; i++) {
      var c = hits[i];
      if (!byId[c.mdf.id]) { byId[c.mdf.id] = { id: c.mdf.id, label: c.mdf.label, items: [] }; groups.push(byId[c.mdf.id]); }
      byId[c.mdf.id].items.push(c);
    }
    // Groups in name order (HEADEND before the IDFs), the no-location group last.
    groups.sort(function (a, b) {
      if (a.id === '__unknown') return 1;
      if (b.id === '__unknown') return -1;
      return natCmp(a.label, b.label);
    });
    var h = '';
    if (!hits.length) h = '<div style="padding:16px 12px;color:#64748b;font-size:12.5px">No device matches "' + esc(st.railQuery) + '".</div>';
    for (var g = 0; g < groups.length; g++) {
      var items = railOrdered(groups[g].items);
      h += '<div class="scw-pa-grp"><span>' + esc(groups[g].label) + '</span>' +
        (selectedIds().length && items.length > 1 ? '<button type="button" data-scw-pa-tickgrp="' + esc(groups[g].id) + '">Tick all ' + items.length + '</button>' : '') + '</div>';
      for (var k = 0; k < items.length; k++) h += devRowHtml(items[k], sel);
    }
    list.innerHTML = h;
  }
  function queuedOn(deviceId, mode) {
    var n = 0;
    for (var r = 0; r < _state.rows.length; r++) {
      var row = _state.rows[r];
      if (row.status === 'done' || row.status === 'too-big') continue;
      var t = targetOf(row, deviceId);
      if (t && (!mode || t.mode === mode)) n++;
    }
    return n;
  }
  /** A device row (label wraps; product on its own line) followed by one row
   *  per OPEN slot and, when there are any, a "+ new photo" row — so a photo
   *  can be aimed at exactly the slot it belongs in. */
  function devRowHtml(c, sel) {
    var info = deviceInfo(c.id);
    var have = 0, hit = null;
    for (var i = 0; i < sel.length; i++) { var t = targetOf(sel[i], c.id); if (t) { have++; hit = hit || t; } }
    var queued = queuedOn(c.id, '');
    var box = have === 0 ? '' : (have === sel.length ? ' on' : ' some');
    var stCls = '', stTxt = '';
    if (hit && sel.length === 1) { stCls = 'q'; stTxt = 'this photo → ' + describeTarget(hit); }
    else if (have) { stCls = 'q'; stTxt = have + ' of ' + sel.length + ' selected → here'; }
    else {
      if (info.open.length) {
        stTxt = plural(info.open.length, 'open slot') + (info.reqOpen ? ' · ' + info.reqOpen + ' required' : '');
        stCls = info.reqOpen ? '' : 'none';
      } else if (info.reqTotal) { stTxt = 'required photos all in'; stCls = 'full'; }
      else { stTxt = 'no slots'; stCls = 'none'; }
      if (queued) stTxt += ' · ' + queued + ' queued';
    }
    var def = defaultTarget(c.id, false);
    var main = c.drop || c.product || c.label || '—';
    var sub = (c.drop && c.product) ? c.product : '';
    var h = '<div class="scw-pa-dev' + (have ? ' is-hit' : '') + '" data-scw-pa-dev-row="' + esc(c.id) + '" title="' +
        esc('Click → ' + (def.mode === 'slot' ? 'fills ' + def.slotType : 'adds a new photo') + (sub ? ' · ' + sub : '')) + '">' +
      '<span class="box' + box + '" aria-hidden="true"></span>' +
      '<span class="id">' + esc(main) + '</span>' +
      '<span class="st ' + stCls + '">' + esc(stTxt) + '</span>' +
      (sub ? '<span class="nm">' + esc(sub) + '</span>' : '') +
      '</div>';
    if (!info.open.length) return h;
    for (var sIdx = 0; sIdx < info.open.length; sIdx++) {
      var sl = info.open[sIdx];
      var holder = slotTakenBy(sl.id, null), holderRow = holder ? rowById(holder) : null;
      var mine = false;
      for (var m = 0; m < sel.length; m++) {
        var tt = targetOf(sel[m], c.id);
        if (tt && tt.mode === 'slot' && tt.slotId === sl.id) { mine = true; break; }
      }
      var who = mine ? 'this photo' : (holderRow ? '← ' + holderRow.filename : 'open');
      h += '<div class="scw-pa-slot' + (mine ? ' is-hit' : '') + (holder && !mine ? ' is-taken' : '') + '" data-scw-pa-slot-row="' + esc(sl.id) + '" data-scw-pa-slot-dev="' + esc(c.id) + '" title="' +
          esc(mine ? 'Click to clear' : (holderRow ? 'Taken by ' + holderRow.filename + ' — remove it from that tile first' : 'Click to fill this slot with the selected photo')) + '">' +
        '<span class="box' + (mine ? ' on' : '') + '" aria-hidden="true"></span>' +
        '<span class="sl">' + esc(sl.type || 'Untyped slot') + (sl.required ? '<span class="req">required</span>' : '') + '</span>' +
        '<span class="who">' + esc(who) + '</span></div>';
    }
    var newMine = false;
    for (var m2 = 0; m2 < sel.length; m2++) { var t2 = targetOf(sel[m2], c.id); if (t2 && t2.mode === 'new') { newMine = true; break; } }
    var newCount = queuedOn(c.id, 'new');
    h += '<div class="scw-pa-slot new' + (newMine ? ' is-hit' : '') + '" data-scw-pa-new-row="' + esc(c.id) + '" title="Add the selected photo as a new photo of this device, leaving the open slots alone">' +
      '<span class="box' + (newMine ? ' on' : '') + '" aria-hidden="true"></span>' +
      '<span class="sl">+ new photo</span>' +
      '<span class="who">' + esc(newMine ? 'this photo' : (newCount ? newCount + ' queued' : '')) + '</span></div>';
    return h;
  }
  function counts() {
    var st = _state, out = { photos: 0, aimed: 0, dest: 0, fills: 0, news: 0, unaimed: 0, tooBig: 0, done: 0, guessed: 0 };
    for (var i = 0; i < st.rows.length; i++) {
      var r = st.rows[i];
      if (r.status === 'too-big') { out.tooBig++; continue; }
      if (r.status === 'done') { out.done++; continue; }
      out.photos++;
      if (!r.targets.length) { out.unaimed++; continue; }
      out.aimed++;
      var g = false;
      for (var t = 0; t < r.targets.length; t++) {
        out.dest++;
        if (r.targets[t].mode === 'slot') out.fills++; else out.news++;
        if (r.targets[t].guessed) g = true;
      }
      if (g) out.guessed++;
    }
    return out;
  }
  function renderFooter() {
    var sum = q('.scw-pa-summary'), sendBtn = q('[data-scw-pa-send]'), clearBtn = q('[data-scw-pa-clear]');
    if (!sum || !sendBtn) return;
    var st = _state, c = counts();
    var parts = [];
    if (c.photos) {
      parts.push('<b>' + plural(c.photos, 'photo') + ' → ' + plural(c.dest, 'destination') + '</b>');
      if (c.fills) parts.push(c.fills + ' fill a slot');
      if (c.news) parts.push(plural(c.news, 'new photo'));
      if (c.guessed) parts.push(plural(c.guessed, 'guess', 'guesses') + ' to confirm');
      if (c.unaimed) parts.push('<span style="color:#92400e">' + plural(c.unaimed, 'photo') + ' still need' + (c.unaimed === 1 ? 's' : '') + ' a device</span>');
    }
    if (c.done) parts.push(plural(c.done, 'sent photo'));
    if (c.tooBig) parts.push(plural(c.tooBig, 'too big'));
    sum.innerHTML = parts.join(' · ');
    sendBtn.disabled = st.sending || !c.aimed;
    sendBtn.textContent = st.sending ? 'Sending…' : (c.aimed ? 'Send ' + plural(c.aimed, 'photo') : 'Send');
    sendBtn.title = c.unaimed && c.aimed ? 'The ' + plural(c.unaimed, 'unaimed photo') + ' stay in the queue' : '';
    if (clearBtn) clearBtn.disabled = st.sending || !st.rows.length;
  }
  function renderNotes() {
    var er = q('.scw-pa-errors'), dn = q('.scw-pa-done');
    if (er) { er.hidden = !_state.errors.length; er.innerHTML = _state.errors.map(function (e) { return '<div>' + esc(e) + '</div>'; }).join(''); }
    if (dn) { dn.hidden = !_state.done; dn.textContent = _state.done; }
  }

  // ── Plan + send ───────────────────────────────────────────────────
  /** Every write the batch will make, or the reasons it can't. Aimed rows
   *  only; unaimed rows are left in the queue, never an error. */
  function buildPlan() {
    var st = _state, errs = [], ops = [];
    if (!st) return { ops: ops, errs: ['Nothing to send.'] };
    var saveView = saveViewFor(st.viewKey), hook = webhookUrl();
    for (var r = 0; r < st.rows.length; r++) {
      var row = st.rows[r];
      if (row.status === 'too-big' || row.status === 'done' || !row.targets.length) continue;
      for (var t = 0; t < row.targets.length; t++) {
        var tg = row.targets[t];
        if (tg.mode === 'slot') {
          if (slotTakenBy(tg.slotId, row.id)) { errs.push(row.filename + ': two photos aim at the same slot (' + describeTargetLong(tg).replace(/^Fill /, '') + ').'); continue; }
          ops.push({ kind: 'fill', rowId: row.id, target: tg });
        } else {
          ops.push({ kind: 'create', rowId: row.id, target: tg });
        }
      }
    }
    var fills = ops.filter(function (o) { return o.kind === 'fill'; }).length;
    var creates = ops.filter(function (o) { return o.kind === 'create'; }).length;
    if (fills && !saveView) errs.push('This page has no photo save view mapped (photo-edit-panel.js SAVE_VIEWS), so slots cannot be filled from here.');
    if (creates && !hook) {
      errs.push(plural(creates, 'new photo') + ' would need the Make webhook (SCW.CONFIG.' + CONFIG.WEBHOOK_KEY +
        '), which is not configured yet — aim those photos at open slots instead.');
    }
    if (!ops.length && !errs.length) errs.push('Nothing to send — aim a photo at a device first.');
    return { ops: ops, errs: errs, saveView: saveView, hook: hook };
  }
  function uploadRow(row) {
    var u = pepUtil();
    if (!u || typeof u.uploadImage !== 'function') return Promise.reject(new Error('photo upload machinery not loaded'));
    row.status = 'uploading'; row.error = '';
    renderTile(row.id);
    return u.uploadImage(row.blob, row.filename).then(function (assetId) {
      if (!assetId) throw new Error('no asset id returned');
      row.assetId = String(assetId);
      row.status = 'uploaded';
      renderTile(row.id);
      return row.assetId;
    }).catch(function (err) {
      row.status = 'failed';
      row.error = 'Upload failed: ' + ((err && err.message) || err);
      renderTile(row.id);
      return '';
    });
  }
  function historyLine(existing, filename) {
    var line = nowStamp() + ' — ' + userName() + ' — UPLOADED PHOTO: bulk assign (' + String(filename || '') + ')';
    var safe = line.replace(/[<>]/g, function (c) { return c === '<' ? '&lt;' : '&gt;'; });
    return existing ? safe + '<br>' + existing : safe;
  }
  function doFill(op, row, saveView) {
    var u = pepUtil(), PF = CONFIG.PHOTO_FIELDS, tg = op.target;
    var body = {}; body[PF.img] = row.assetId;
    return u.putRecord(saveView, tg.slotId, body).then(function () {
      var extra = {};
      extra[PF.completed] = 'Yes';
      extra[PF.history] = historyLine(tg.history, row.filename);
      return Promise.resolve(u.putRecord(saveView, tg.slotId, extra)).catch(function (err) {
        console.warn('[scw-photo-assign] completion stamp skipped on ' + tg.slotId + ':', (err && err.message) || err);
      });
    }).then(function () {
      return { ok: true, op: op };
    }).catch(function (err) {
      return { ok: false, op: op, error: (err && err.message) || String(err) };
    });
  }
  function manifestFor(op, row) {
    var tg = op.target, c = candidateById(tg.deviceId);
    return {
      uploadKind: 'photo_assign',
      batchId:    _state.batchId,
      uploadId:   row.uploadId + ':' + tg.deviceId,
      asset:      { id: row.assetId, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
      target:     { kind: targetKind(), recordId: tg.deviceId, label: c ? c.label : '' },
      slot:       null,
      photoType:  tg.typeId ? { id: tg.typeId, label: tg.typeLabel || '' } : null,
      required:   false,
      scope:      resolveScope(_state.viewKey),
      sourceViewId: _state.viewKey,
      triggeredBy: triggeredBy()
    };
  }
  function doCreate(op, row, hook) {
    var body = JSON.stringify(manifestFor(op, row)), p;
    try { p = fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }); }
    catch (e) { p = Promise.reject(e); }
    // Optimistic, like bulk-upload.js: Make often answers without CORS
    // headers, which rejects the fetch AFTER the request was delivered.
    return Promise.resolve(p).then(function () { return { ok: true, op: op }; }, function (err) {
      console.warn('[scw-photo-assign] manifest send error (treated as sent):', (err && err.message) || err);
      return { ok: true, op: op, unconfirmed: true };
    });
  }
  function runQueue(tasks, limit) {
    var results = new Array(tasks.length), next = 0, active = 0;
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
  /** Upload every aimed photo once, then write every destination with the
   *  concurrency cap. Resolves the summary; never rejects. */
  function send() {
    if (!_state || _state.sending) return Promise.resolve(null);
    var st = _state;
    closeMenu();
    var plan = buildPlan();
    st.errors = plan.errs; st.done = '';
    if (plan.errs.length) { render(); return Promise.resolve({ errors: plan.errs }); }
    st.sending = true;
    render();
    var needed = [];
    for (var i = 0; i < plan.ops.length; i++) {
      var row = rowById(plan.ops[i].rowId);
      if (row && needed.indexOf(row) === -1) needed.push(row);
    }
    var guessed = 0;
    for (var g = 0; g < needed.length; g++) {
      for (var gt = 0; gt < needed[g].targets.length; gt++) if (needed[g].targets[gt].guessed) { guessed++; break; }
    }
    var up = Promise.resolve();
    needed.forEach(function (row) { up = up.then(function () { return uploadRow(row); }); });
    return up.then(function () {
      var tasks = plan.ops.map(function (op) {
        return function () {
          var row = rowById(op.rowId);
          if (!row || !row.assetId) return { ok: false, op: op, error: 'upload failed', skipped: true };
          return op.kind === 'fill' ? doFill(op, row, plan.saveView) : doCreate(op, row, plan.hook);
        };
      });
      return runQueue(tasks, CONFIG.WRITES_IN_FLIGHT);
    }).then(function (results) {
      var filled = 0, created = 0, failed = 0, perRow = Object.create(null);
      for (var r = 0; r < results.length; r++) {
        var res = results[r] || { ok: false, error: 'unknown' };
        var op = res.op || plan.ops[r];
        if (res.ok) { if (op.kind === 'fill') filled++; else created++; } else failed++;
        var pr = perRow[op.rowId] || (perRow[op.rowId] = { ok: 0, fail: 0, texts: [] });
        if (res.ok) pr.ok++; else pr.fail++;
        pr.texts.push(res.ok ? describeTargetLong(op.target) + (op.kind === 'create' ? ' (sent to Make)' : '') : 'Failed: ' + (res.error || 'unknown'));
      }
      for (var k = 0; k < st.rows.length; k++) {
        var rw = st.rows[k], p = perRow[rw.id];
        if (!p || rw.status === 'failed') continue;
        if (p.fail) { rw.status = 'failed'; rw.error = p.texts.join(' · '); }
        else {
          rw.status = 'done'; rw.result = p.texts.join(' · ');
          for (var tg2 = 0; tg2 < rw.targets.length; tg2++) rw.targets[tg2].guessed = false;
          delete st.selected[rw.id];
        }
      }
      var uploaded = needed.filter(function (n) { return n.assetId; }).length;
      var summary = { sent: uploaded, uploaded: uploaded, filled: filled, created: created, failed: failed, guessed: guessed,
                      leftover: st.rows.filter(function (x) { return x.status === 'queued' && !x.targets.length; }).length };
      var bits = [];
      if (filled) bits.push(plural(filled, 'slot') + ' filled');
      if (created) bits.push(plural(created, 'new photo') + ' sent to Make');
      if (guessed) bits.push(plural(guessed, 'guess', 'guesses') + ' confirmed');
      if (failed) bits.push(failed + ' failed');
      if (summary.leftover) bits.push(plural(summary.leftover, 'photo') + ' still in the queue');
      st.done = bits.length ? bits.join(' · ') : 'Nothing was written.';
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
    CONFIG:            CONFIG,
    open:              open,
    close:             close,
    inject:            inject,
    watch:             watch,
    isAllowed:         isAllowed,
    candidatesFor:     candidatesFor,
    attachedAccessoryIds: attachedAccessoryIds,
    buildMatchContext: buildMatchContext,
    matchFile:         matchFile,
    tokensOf:          tokensOf,
    openSlotsFor:      openSlotsFor,
    targetKind:        targetKind,
    resolveScope:      resolveScope,
    addFiles:          addFiles,
    select:            function (rowId, on) { if (!_state) return; if (on === false) delete _state.selected[rowId]; else _state.selected[rowId] = true; render(); },
    clickDevice:       clickDevice,
    tickGroup:         tickGroup,
    setFinderQuery:    setFinderQuery,
    finderEnter:       finderEnter,
    railHits:          function () { return railOrdered(railHits()).map(function (c) { return c.id; }); },
    setTarget:         function (rowId, deviceId, spec) { var r = rowById(rowId); if (r) r.match = null; var ok = addTarget(rowId, deviceId, spec || null); render(); return ok; },
    removeTarget:      function (rowId, deviceId) { removeTarget(rowId, deviceId); render(); },
    clickSlot:         clickSlot,
    clickNew:          clickNew,
    openZoom:          openZoom,
    closeZoom:         closeZoom,
    zoomStep:          zoomStep,
    buildPlan:         buildPlan,
    send:              send,
    state:             function () { return _state; }
  };
})();
/*** END WORKSHEET V2 — BULK PHOTO ASSIGN *************************************/
