/*** SUB-BID DIFF — RENDER ***************************************************
 *
 * Distills v2's already-computed diff (SCW.bidReviewV2.transform.buildState)
 * into a short, read-only "what's off vs the basis bid" verdict. Does NOT
 * recompute or re-render the grid — single source of truth is v2's state.
 *
 * The basis bid is ALWAYS an explicit choice (persisted SOW→bid field, or
 * an interim in-session selector). No overlap auto-pick.
 *
 * Included exception types (everything else is suppressed):
 *   - material : matched line, SOW fee ≠ sub bid labor
 *   - added    : SOW line that REQUIRES a bid (field_2479 ≠ No) but has none
 *   - orphan   : bid line pointing outside THIS SOW (bid-only or other-SOW)
 * Excluded: covered (equal), field_2479=No, and removed (on neither side —
 * v2 already drops those from grid.rows).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;
  var C = ns.CONFIG, T = C.TIERS;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function money(n) {
    var neg = n < 0;
    return (neg ? '-$' : '$') + Math.abs(n || 0)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signedMoney(n) {
    if (Math.abs(n || 0) <= C.moneyEps) return '$0.00';
    return (n > 0 ? '+$' : '-$') + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyEq(a, b) { return Math.abs((a || 0) - (b || 0)) <= C.moneyEps; }

  /** field_2479 (Require Sub Bid) reads No / false. Blank ≠ No (unknown). */
  function isReqNo(v) {
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v.identifier || v.id || '';
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'no' || s === 'false';
  }

  // Explicit, per-SOW basis selection. No default — the user must choose.
  // Keyed by sowId. Seeded from the persisted field when configured.
  var selectedByGrid = Object.create(null);
  var savedByGrid    = Object.create(null);  // sowId → true once PUT succeeds
  var savingGrid     = Object.create(null);  // sowId → true while a write is in flight

  // Per-SOW collapse of the inline diff panel — INDEPENDENT of the v2 SOW
  // section accordion (that hides the whole grid; this just folds our panel's
  // body so the grid can stay open with the panel out of the way). Persisted
  // across reloads, keyed by sowId. Survives render()'s innerHTML rebuilds via
  // the class re-applied in render() from this map.
  var COLLAPSE_LS = 'scwSbdInlineCollapsed';
  function loadCollapsed() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_LS)) || {}; }
    catch (e) { return {}; }
  }
  var collapsedBySow = loadCollapsed();
  function saveCollapsed() {
    try { localStorage.setItem(COLLAPSE_LS, JSON.stringify(collapsedBySow)); }
    catch (e) {}
  }

  // Quiet layout (2026-08-27 UX triage): the diff panel defaults FOLDED —
  // the bar (chevron + basis picker + readiness + gap chip) stays standing,
  // the body only opens when the diff needs eyes (coverage gaps / missing
  // note) or the user opens it. An explicit toggle always wins and persists
  // per SOW; the toolbar's Classic-layout switch restores default-open.
  function brClassic() {
    try { return localStorage.getItem('scwBrLayoutClassic') === '1'; }
    catch (e) { return false; }
  }
  var attentionBySow = {};   // sowId → diff currently needs eyes (set by inlineHtml)
  function resolveCollapsed(sowId) {
    if (Object.prototype.hasOwnProperty.call(collapsedBySow, sowId)) {
      return !!collapsedBySow[sowId];
    }
    if (brClassic()) return false;
    return !attentionBySow[sowId];
  }

  /** Persist the basis bid on the SOW (field_2942, single connection) via the
   *  SOW write view. The diff snapshot (field_2941) rides in the SAME PUT so
   *  the two fields can never diverge: relying on the debounced auto-save to
   *  follow up meant a basis change whose snapshot write never landed (user
   *  navigated away inside the 400ms window, or a stale tab re-saved later)
   *  left field_2941 describing the PREVIOUS bid while field_2942 pointed at
   *  the new one — and every snapshot reader (ops stepper, publish payload)
   *  showed the wrong bid. Optimistic: caller updates selection first. */
  function writeBasis(sowId, pkgId) {
    if (!C.basisBidField || !sowId) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && SCW.knackRecordUrl)) return;
    var body = {};
    // K1 is a sentinel, not a record — never write it into the connection.
    body[C.basisBidField] = (pkgId && pkgId !== K1_ID) ? [pkgId] : [];
    var blob = null, sig = '';
    if (C.snapshotField) {
      // Cancel any pending debounced snapshot write — it would describe the
      // OLD basis. The fresh blob (or the clear) goes in this PUT instead.
      if (autoTimers[sowId]) { clearTimeout(autoTimers[sowId]); autoTimers[sowId] = null; }
      blob = pkgId ? buildBlob(sowId) : null;
      if (blob) { sig = blobSig(blob); body[C.snapshotField] = JSON.stringify(blob); }
      else if (!pkgId) body[C.snapshotField] = '';
      // pkgId set but blob unresolvable → leave field_2941 out of the body;
      // the next auto-save will catch it up.
    }
    savingGrid[sowId] = true; render();
    SCW.knackAjax({
      url: SCW.knackRecordUrl(C.basisBidView, sowId),
      type: 'PUT',
      data: JSON.stringify(body)
    }).then(function () {
      savingGrid[sowId] = false;
      if (pkgId) savedByGrid[sowId] = true; else delete savedByGrid[sowId];
      if (C.snapshotField) {
        if (blob) { savedSnap[sowId] = true; lastWrittenSig[sowId] = sig; }
        else if (!pkgId) { savedSnap[sowId] = false; delete lastWrittenSig[sowId]; }
      }
      render();
    }, function (xhr) {
      savingGrid[sowId] = false;
      console.warn('[scw-sub-bid-diff] basis write failed', sowId, xhr && xhr.status);
      render();
    });
  }

  // ── source reads ───────────────────────────────────────────────────────
  function v2data() { return window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data; }
  function readView(k) {
    var d = v2data();
    if (d && typeof d.readRecords === 'function') return d.readRecords(k);
    try {
      var v = Knack.views[k];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      return models.map(function (m) { return m.attributes || m.toJSON(); });
    } catch (e) { return []; }
  }

  /** Persisted basis bid id for a SOW (reads CONFIG.basisBidField off the
   *  SOW records view). '' when unconfigured or unset. */
  function persistedBasis(sowId) {
    if (!C.basisBidField) return '';
    var sows = readView(C.basisBidView);
    for (var i = 0; i < sows.length; i++) {
      if (sows[i] && sows[i].id === sowId) {
        var raw = sows[i][C.basisBidField + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    }
    return '';
  }

  // Sentinel basis choice: "K1 Bid" = there genuinely is NO subcontractor
  // bid for this SOW (K1 self-performs). Not a Knack record, so it can't
  // live in the field_2942 connection — writeBasis CLEARS field_2942 and the
  // choice persists via the field_2941 snapshot blob (basisBidId: 'K1').
  // Downstream: the ops-stepper publish gate accepts it (snap.basisBidId is
  // truthy, no mismatch since field_2942 is empty), and the publish payload
  // ships subBidBasisId 'K1' + subBidIsK1 true so Make can branch on it.
  var K1_ID = 'K1';

  // ACTION sentinel on the same picker — "Request a K2 bid". Deliberately not
  // a bid id: the change handler intercepts it before writeBasis ever sees it
  // and restores the prior selection, so it can never reach field_2942 or the
  // snapshot blob. Prefixed/suffixed with __ so it can't collide with a Knack
  // 24-hex record id.
  var REQ_K2_ID = '__request_k2__';
  var requestingK2 = {};   // sowId -> true while its POST is in flight

  // ── Builder-assigned bid → soft default ─────────────────────────────
  // A bid package can carry REL_SOW (field_2387) in Builder. When it names
  // this SOW and NOTHING is chosen or persisted yet, the compare defaults
  // to that bid on first load — a VIEW default only. It deliberately does
  // NOT write field_2942 or the field_2941 snapshot (see the autoSave
  // guard): the basis pick is the award moment and must stay a human
  // gesture, so a defaulted-but-unsaved bid can never open the publish
  // gate. Every persistence path (saved basis, session pick, K1 snapshot)
  // outranks it, so remembered selections behave exactly as before.

  /** pkgId → [{id, identifier}] of the SOWs its REL_SOW names. */
  function pkgSowLinks() {
    var out = Object.create(null);
    if (!(C.f && C.f.pkgToSow)) return out;
    var pkgs = readView(C.bidPkgViewKey);
    for (var i = 0; i < pkgs.length; i++) {
      var p = pkgs[i];
      if (!p || !p.id) continue;
      var raw = p[C.f.pkgToSow + '_raw'];
      var list = [];
      if (Array.isArray(raw)) {
        for (var j = 0; j < raw.length; j++) if (raw[j] && raw[j].id) list.push(raw[j]);
      } else if (raw && raw.id) {
        list.push(raw);
      }
      if (list.length) out[p.id] = list;
    }
    return out;
  }

  /** First bid package (view_3573 order) whose REL_SOW names this SOW. */
  function assignedDefaultFor(sowId) {
    var links = pkgSowLinks();
    var pkgs = readView(C.bidPkgViewKey);
    for (var i = 0; i < pkgs.length; i++) {
      var p = pkgs[i];
      if (!p || !p.id || !links[p.id]) continue;
      for (var j = 0; j < links[p.id].length; j++) {
        if (links[p.id][j].id === sowId) return p.id;
      }
    }
    return '';
  }

  /** True while the CURRENT selection is only the soft REL_SOW default —
   *  nothing chosen this session, nothing persisted. */
  function isDefaulted(sowId) {
    if (sowId in selectedByGrid) return false;
    if (persistedBasis(sowId)) return false;
    var snap = persistedSnapshot(sowId);
    if (snap && snap.basisBidId === K1_ID) return false;
    return !!assignedDefaultFor(sowId);
  }

  function basisFor(sowId) {
    // An explicit session choice — INCLUDING the cleared '' option — wins over
    // the persisted value, so toggling back to "— choose —" actually clears
    // the diff (and the field_2942 write below clears the connection).
    if (sowId in selectedByGrid) return selectedByGrid[sowId];
    var pb = persistedBasis(sowId);
    if (pb) return pb;
    // K1 persists only in the snapshot blob (no connection to read).
    var snap = persistedSnapshot(sowId);
    if (snap && snap.basisBidId === K1_ID) return K1_ID;
    // Soft default, last: the Builder-assigned bid (REL_SOW → this SOW).
    // Guard on the SOW record being loaded — persistedBasis reads '' both
    // when empty and when the model hasn't populated, and defaulting in
    // that window would flash the wrong bid over a real saved basis.
    if (sowRecordLoaded(sowId)) {
      var def = assignedDefaultFor(sowId);
      if (def) return def;
    }
    return '';
  }

  /** True once the SOW's record is actually present in the basis view's
   *  model — distinguishes "basis is empty" from "model not loaded yet". */
  function sowRecordLoaded(sowId) {
    var sows = readView(C.basisBidView);
    for (var i = 0; i < sows.length; i++) {
      if (sows[i] && sows[i].id === sowId) return true;
    }
    return false;
  }

  /** Does this project have any survey connected? Gates the "Request a K2
   *  bid" option, which is only meaningful when there's no survey.
   *
   *  Fails CLOSED — an unreadable or not-yet-loaded gate view returns true
   *  (treat as "has a survey", hide the option). The rule is "offer it ONLY
   *  when there are no surveys", so the option needs positive evidence of
   *  zero; an empty read during load is not that evidence, and showing it
   *  then would flash the option on every page load of a surveyed project. */
  function projectHasSurvey() {
    if (!C.surveyGateView) return false;      // gate unconfigured → don't gate
    var recs;
    try { recs = readView(C.surveyGateView) || []; } catch (e) { return true; }

    if (!recs.length) {
      // Zero records is the load-bearing case, and it is AMBIGUOUS: a project
      // with no survey has no survey line items either, so "empty" is exactly
      // what we're looking for — but it's also what a not-yet-fetched view
      // looks like. Knack renders an explicit no-data row once a grid has
      // loaded empty, so that marker is the difference. No marker = still
      // loading = unknown, and unknown hides the option (the rule is "offer it
      // ONLY when there are no surveys", which needs positive evidence).
      var el = document.getElementById(C.surveyGateView);
      return !(el && el.querySelector('tr.kn-tr-nodata'));
    }

    if (!C.surveyGateField) return true;      // records ARE surveys, and there are some
    for (var i = 0; i < recs.length; i++) {
      var raw = recs[i] && recs[i][C.surveyGateField + '_raw'];
      if (Array.isArray(raw) ? raw.length : (raw && raw.id)) return true;
      // Fall back to the display value for views whose model lacks _raw.
      if (!raw && recs[i] && String(recs[i][C.surveyGateField] || '').trim()) return true;
    }
    return false;
  }

  // ── Auto-pick: exact-match basis ────────────────────────────────────────
  // "No default — the user must choose" has one carve-out: when a bid EXACTLY
  // matches the SOW (zero diff exceptions AND zero raw total delta), there is
  // nothing to review, so reviewers routinely never touch the selector — the
  // basis never persisted and everything downstream (ops stepper, publish
  // gate) stayed blocked. If exactly ONE column bid is a perfect match and no
  // basis is set, designate + save it automatically through the same
  // single-PUT path as a manual pick. Ambiguous cases (two matching bids, or
  // no match) still require the human.
  var autoPickTried  = Object.create(null);  // sowId → true once evaluated
  var autoPickedBySow = Object.create(null); // sowId → true when we auto-saved
  function maybeAutoPickBasis(grid) {
    if (!C.basisBidField || !grid) return;
    var sowId = grid.sowId;
    if (autoPickTried[sowId]) return;
    // An explicit session choice — including the cleared '' — is the user's;
    // never auto-override it.
    if (sowId in selectedByGrid) { autoPickTried[sowId] = true; return; }
    if (savingGrid[sowId]) return;
    // Don't decide off an unloaded model: persistedBasis() reads '' both when
    // the basis is genuinely empty and when the SOW view hasn't populated yet.
    // Auto-picking in the latter window could clobber a real saved basis.
    if (!sowRecordLoaded(sowId)) return;       // retry on a later render
    if (persistedBasis(sowId)) { autoPickTried[sowId] = true; return; }

    // Grid not populated yet (rows/bids still loading) → DON'T latch the
    // tried flag; retry on a later render once the data is actually there.
    if (!grid.rows || !grid.rows.length) return;
    // Candidates that genuinely price line items on this SOW: the column
    // packages plus the gated-out "touching" tier basisCandidates recovers.
    // Tier 3 (offSowOnly — prices nothing here) can never be a match.
    var cands = [];
    var all = basisCandidates(grid);
    for (var c = 0; c < all.length; c++) {
      if (all[c] && all[c].id && !all[c].offSowOnly) cands.push(all[c]);
    }
    if (!cands.length) return;                 // bids not loaded yet — retry
    var matches = [];
    for (var i = 0; i < cands.length && matches.length < 2; i++) {
      var res;
      try { res = distill(grid, cands[i].id); } catch (e) { continue; }
      // "Match" = zero diff line items AND the bid actually prices this SOW.
      // totalDelta is deliberately NOT required to be zero — it counts
      // Require-Sub-Bid=No rows that the exception scan (and the reviewer's
      // "diff line items" view) intentionally ignores, so demanding a zero
      // raw delta rejected bids the panel itself reports as clean.
      if (res.total === 0 && (res.basisTotal || 0) > 0) matches.push(cands[i].id);
    }
    autoPickTried[sowId] = true;
    if (matches.length !== 1) {
      if (window.SCW && SCW.DEBUG) console.log('[scw-sub-bid-diff] auto-pick: ' +
        matches.length + ' matching bid(s) for', sowId, '— leaving to the user');
      return;
    }
    autoPickedBySow[sowId] = true;
    selectedByGrid[sowId] = matches[0];
    if (window.SCW && SCW.DEBUG) console.log('[scw-sub-bid-diff] auto-pick: saving',
      matches[0], 'as basis for', sowId);
    writeBasis(sowId, matches[0]);
  }

  // ── snapshot (field_2941): reviewer note + frozen diff ──────────────────
  var noteByGrid = Object.create(null);  // sowId → in-progress note text
  var savedSnap  = Object.create(null);  // sowId → true after a successful save
  var savingSnap = Object.create(null);  // sowId → true while a save is in flight

  /** Parsed field_2941 JSON for a SOW, or null. */
  function persistedSnapshot(sowId) {
    if (!C.snapshotField) return null;
    var sows = readView(C.basisBidView);
    for (var i = 0; i < sows.length; i++) {
      if (sows[i] && sows[i].id === sowId) {
        var raw = sows[i][C.snapshotField + '_raw'];
        if (raw == null) raw = sows[i][C.snapshotField];
        if (raw == null) return null;
        var s = String(raw).replace(/<[^>]*>/g, '').trim();
        if (!s) return null;
        try { return JSON.parse(s); } catch (e) { return null; }
      }
    }
    return null;
  }

  var lastWrittenSig = Object.create(null);  // sowId → signature last PUT to field_2941
  var autoTimers     = Object.create(null);  // sowId → pending debounce timer

  /** The reviewer note in effect for a SOW: an in-session edit wins, else the
   *  persisted snapshot's note. */
  function currentNote(sowId) {
    if (sowId in noteByGrid) return noteByGrid[sowId] || '';
    var snap = persistedSnapshot(sowId);
    return (snap && snap.note) || '';
  }

  // Bump when the bidHtml/diffHtml RENDER changes (pdf-html.js) — the
  // signature below only covers the diff DATA, so without a version bump an
  // improved render would never re-persist onto already-saved blobs.
  var PDF_RENDER_VERSION = 2;

  /** Stable signature of a blob's MEANINGFUL content (excludes savedAt, which
   *  always changes) — so auto-save only fires when the diff/note actually
   *  changed, never in a loop. */
  function blobSig(b) {
    if (!b) return '';
    var exSig = (b.exceptions || []).map(function (e) {
      return e.tier + '|' + e.label + '|' + Math.round((e.delta || 0) * 100) +
        '|' + ((e.fields || []).join(','));
    }).join(';');
    var c = b.counts || {};
    return [
      (b.rv || 0),
      b.basisBidId || '', b.total || 0, Math.round((b.laborDelta || 0) * 100),
      [c.material || 0, c.spec || 0, c.added || 0, c.orphan || 0].join(','),
      String(b.note || '').trim(), exSig
    ].join('~');
  }

  /** Build the diff blob for a SOW from an already-resolved v2 grid (no second
   *  buildState). The note is whatever's currently in effect for the SOW. */
  function buildBlobWith(grid) {
    if (!grid) return null;
    var sowId = grid.sowId;
    var pkgId = basisFor(sowId);
    if (!pkgId) return null;
    // K1 sentinel — no bid to diff against. A minimal, well-formed blob so
    // every snapshot reader (ops stepper, publish payload) sees a truthy
    // basisBidId with zero differences and no HTML fragments.
    if (pkgId === K1_ID) {
      return {
        v: 1, rv: PDF_RENDER_VERSION, sowId: sowId, sowName: grid.sowName || '',
        basisBidId: K1_ID, basisBidName: 'K1 Bid',
        basisSubId: '', basisSubName: '',
        savedAt: new Date().toISOString(),
        laborDelta: 0, counts: { material: 0, spec: 0, added: 0, orphan: 0 },
        coverageGaps: 0, total: 0, exceptions: [],
        note: currentNote(sowId),
        bidHtml: '', diffHtml: ''
      };
    }
    var res = distill(grid, pkgId);
    var pkg = null;
    var cands = basisCandidates(grid);   // includes gated-out touching packages
    for (var p = 0; p < cands.length; p++) {
      if (cands[p].id === pkgId) { pkg = cands[p]; break; }
    }
    var basisName = (pkg && (pkg.bidName || pkg.name)) || '';
    // Basis subcontractor identity — read off the raw bid-package record
    // (the candidates above are transformed objects without raw fields).
    // Dormant until C.f.pkgSub names the package -> sub connection field.
    var basisSubId = '', basisSubName = '';
    if (C.f && C.f.pkgSub) {
      var pkgRecs = readView(C.bidPkgViewKey);
      for (var pr = 0; pr < pkgRecs.length; pr++) {
        if (pkgRecs[pr] && pkgRecs[pr].id === pkgId) {
          var subRaw = pkgRecs[pr][C.f.pkgSub + '_raw'];
          var subOne = Array.isArray(subRaw) ? subRaw[0] : subRaw;
          if (subOne && subOne.id) {
            basisSubId = subOne.id;
            basisSubName = String(subOne.identifier || '').trim();
          }
          break;
        }
      }
    }
    // PDF-ready HTML fragments (bid + diff) so the snapshot can be stamped onto
    // the published proposal. Built with the bid-PDF class names — see
    // sub-bid-diff/pdf-html.js. Guarded: absent module → empty strings.
    var pdf = window.SCW.subBidDiff && window.SCW.subBidDiff.pdfHtml;
    var bidHtml = '', diffHtml = '';
    if (pdf) {
      try { bidHtml  = pdf.buildBid(grid, pkgId, basisName) || ''; } catch (e) { bidHtml = ''; }
      try { diffHtml = pdf.buildDiff(grid, pkgId, basisName) || ''; } catch (e) { diffHtml = ''; }
    }
    return {
      v: 1, rv: PDF_RENDER_VERSION, sowId: sowId, sowName: grid.sowName || '',
      basisBidId: pkgId, basisBidName: basisName,
      basisSubId: basisSubId, basisSubName: basisSubName,
      savedAt: new Date().toISOString(),
      laborDelta: res.laborDelta, counts: res.counts, coverageGaps: res.coverageGaps,
      total: res.total,
      exceptions: res.exceptions.map(function (e) {
        return { tier: e.tier, label: e.label, product: e.product, fields: e.fields || [],
                 sowFee: e.sowFee, bidLabor: e.bidLabor, delta: e.delta, jumpId: e.jumpId || '' };
      }),
      note: currentNote(sowId),
      bidHtml: bidHtml, diffHtml: diffHtml
    };
  }

  /** Build the diff blob for a SOW by id (resolves the grid via buildState). */
  function buildBlob(sowId) {
    var v2t = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.transform;
    if (!v2t || typeof v2t.buildState !== 'function') return null;
    var state = v2t.buildState(
      readView(C.bidViewKey), readView(C.sowItemsViewKey), readView(C.bidPkgViewKey));
    var grid = null;
    for (var i = 0; state && i < state.sowGrids.length; i++) {
      if (state.sowGrids[i].sowId === sowId) { grid = state.sowGrids[i]; break; }
    }
    return buildBlobWith(grid);
  }

  // One-time guard: a Knack view-based PUT only accepts fields that are
  // exposed (editable) on the write view. If field_2941 isn't on view_3918,
  // the snapshot PUT is silently dropped — basis (field_2942) saves but the
  // diff/note never persists, so the publish gate stays blocked. Warn loudly
  // (once) so this config gap is diagnosable instead of mysterious.
  var _warnedNoSnapCol = false;
  function warnIfFieldMissingFromWriteView() {
    if (_warnedNoSnapCol) return;
    var recs = readView(C.basisBidView);
    if (!recs.length) return;                 // can't tell yet
    var has = recs.some(function (r) {
      return r && (r[C.snapshotField] !== undefined || r[C.snapshotField + '_raw'] !== undefined);
    });
    if (!has) {
      _warnedNoSnapCol = true;
      console.warn('[scw-sub-bid-diff] ' + C.snapshotField + ' is not exposed on ' +
        C.basisBidView + ' — Knack will silently DROP the snapshot on the view-based ' +
        'PUT. Add ' + C.snapshotField + ' as an editable field on ' + C.basisBidView +
        ' (the SOW write view on scene_1155). Until then the publish-final gate stays ' +
        'blocked because the diff/note never persists.');
    }
  }

  /** Persist a blob to field_2941. Records its signature so auto-save won't
   *  re-write the same content (the local model isn't refetched after a PUT). */
  function writeSnapshotWith(grid, sig) {
    if (!C.snapshotField || !grid) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && SCW.knackRecordUrl)) return;
    warnIfFieldMissingFromWriteView();
    var sowId = grid.sowId;
    var blob = buildBlobWith(grid);
    if (!blob) return;
    if (!sig) sig = blobSig(blob);
    var body = {};
    body[C.snapshotField] = JSON.stringify(blob);
    // field_2942 rides in the same PUT, set to the basis this blob was built
    // for — snapshot and basis connection stay consistent no matter which
    // write path (or which tab) lands last. K1 is a sentinel, not a record
    // id — never write it into the connection (writeBasis already cleared it).
    if (C.basisBidField && blob.basisBidId && blob.basisBidId !== K1_ID) {
      body[C.basisBidField] = [blob.basisBidId];
    }
    savingSnap[sowId] = true; render();
    SCW.knackAjax({
      url: SCW.knackRecordUrl(C.basisBidView, sowId),
      type: 'PUT', data: JSON.stringify(body)
    }).then(function () {
      savingSnap[sowId] = false; savedSnap[sowId] = true;
      if (C.basisBidField && blob.basisBidId) savedByGrid[sowId] = true;
      lastWrittenSig[sowId] = sig; render();
    }, function (xhr) {
      savingSnap[sowId] = false;
      console.warn('[scw-sub-bid-diff] snapshot write failed', sowId, xhr && xhr.status);
      render();
    });
  }

  /** Auto-save the snapshot whenever the diff or note for a SOW changes.
   *  Debounced + signature-guarded so it fires once per real change, never in a
   *  loop. No basis → nothing to snapshot. */
  function autoSave(grid) {
    if (!C.snapshotField || !grid) return;
    var sowId = grid.sowId;
    if (!basisFor(sowId)) return;
    // Soft REL_SOW default: never snapshot it. A field_2941 blob with a
    // basisBidId reads as "basis chosen" downstream (ops publish gate), and
    // a Builder connection nobody confirmed must not open that gate. The
    // moment the user picks (or Save-as-basis promotes it), this clears.
    if (isDefaulted(sowId)) return;
    var blob = buildBlobWith(grid);
    if (!blob) return;
    var sig = blobSig(blob);
    if (lastWrittenSig[sowId] === sig) return;          // already persisted this exact diff
    var snap = persistedSnapshot(sowId);
    if (snap && blobSig(snap) === sig) {                // model already has it
      lastWrittenSig[sowId] = sig; return;
    }
    if (savingSnap[sowId]) return;                      // a write is mid-flight
    if (autoTimers[sowId]) return;                      // already scheduled
    autoTimers[sowId] = setTimeout(function () {
      autoTimers[sowId] = null;
      writeSnapshotWith(grid, sig);
    }, 400);
  }

  /** Scroll to + flash the matching v2 grid row for an exception. */
  function jumpTo(sowId, attr, id) {
    if (!id) return;
    var sel = attr === 'bid'
      ? '[data-row-id="' + id + '"]' : '[data-sow-item-id="' + id + '"]';
    var sec = document.querySelector('.scw-bid-review-v2__sow[data-sow-id="' + sowId + '"]');
    // Expand the SOW section if it's collapsed (rows are hidden when closed).
    if (sec) {
      var hdr = sec.querySelector('.scw-bid-review-v2__sow-header');
      if (hdr && hdr.getAttribute('aria-expanded') === 'false') hdr.click();
    }
    // Only accept ACTUAL grid rows. data-row-id / data-sow-item-id also ride
    // on other elements around the page — dupe-block action buttons, pending
    // change-request cards (data-row-id = the bid record id!), v1 leftovers —
    // and a raw document-wide querySelector can land on one of those instead:
    // the jump then scrolls/flashes an invisible card and looks like a dead
    // click. Resolve every candidate through closest('.__row') and take the
    // first that is a real row.
    function findRow(root) {
      if (!root) return null;
      var cands = root.querySelectorAll(sel);
      for (var c = 0; c < cands.length; c++) {
        var r = cands[c].closest('.scw-bid-review-v2__row');
        if (r) return r;
      }
      return null;
    }
    var el = findRow(sec);
    // A bid record with no row of its own renders as a dupe sub-item
    // ("2nd bid item → same SOW item") inside its host row — find any
    // element tagged with its bid record id and jump to the host row,
    // flashing the dupe block itself when there is one.
    var flashEl = null;
    if (!el && attr === 'bid') {
      var tagged = (sec || document).querySelector(
        '.scw-bid-review-v2__bid-item--dupe [data-bid-record-id="' + id + '"]');
      if (tagged) {
        el = tagged.closest('.scw-bid-review-v2__row');
        flashEl = tagged.closest('.scw-bid-review-v2__bid-item--dupe');
      }
    }
    if (!el) el = findRow(document);
    if (!el) { console.warn('[scw-sub-bid-diff] jump target not found:', sel, 'in SOW', sowId); return; }
    console.log('[scw-sub-bid-diff] jump →', attr, id,
      flashEl ? '(dupe block in host row ' + (el.getAttribute('data-row-id') || '') + ')' : '');
    // Expand collapsed group/subgroup headers the row sits inside. A row can
    // be hidden by BOTH a collapsed subgroup and a collapsed L1 group — keep
    // walking up and clicking collapsed headers until the row is visible.
    var guard = 0;
    while (el.classList.contains('scw-bid-review-v2__row--hidden') && guard++ < 3) {
      var prev = el.previousElementSibling;
      var clicked = false;
      while (prev) {
        var isSub = prev.classList.contains('scw-bid-review-v2__subgroup-header');
        var isGrp = prev.classList.contains('scw-bid-review-v2__group-header');
        if (isSub || isGrp) {
          var collapsed = isSub
            ? prev.classList.contains('scw-bid-review-v2__subgroup-header--collapsed')
            : prev.classList.contains('scw-bid-review-v2__group-header--collapsed');
          if (collapsed) { prev.click(); clicked = true; break; }
          if (isGrp) break;   // reached an already-open L1 — nothing left to expand
        }
        prev = prev.previousElementSibling;
      }
      if (!clicked) break;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash the host row AND (when the target is a dupe sub-item) the dupe
    // block itself — the row-level flash is the visible cue, the block-level
    // one pinpoints which stacked bid item was meant.
    var targets = flashEl ? [el, flashEl] : [el];
    targets.forEach(function (fl) {
      fl.classList.remove('scw-sbd-flash');
      void fl.offsetWidth;          // restart the animation
      fl.classList.add('scw-sbd-flash');
      setTimeout(function () { fl.classList.remove('scw-sbd-flash'); }, 2000);
    });
  }

  // ── distill one SOW grid against the chosen basis package ───────────────
  function distill(grid, pkgId) {
    var ex = [];
    var counts = { material: 0, spec: 0, added: 0, orphan: 0 };
    var laborDelta = 0;
    var rows = grid.rows || [];
    var v2t = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.transform;
    // Same normalization v2 uses, so our labor-desc/conduit diffs match its
    // grid underlines exactly.
    function wseq(v) {
      var w = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ')
        .toLowerCase().match(/[a-z0-9]+/g);
      return w ? w.join(' ') : '';
    }
    function cnum(v) {
      var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
      if (s === '') return null;
      var n = parseFloat(s);
      return isNaN(n) ? null : n;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var cell = row.cellsByPackage && row.cellsByPackage[pkgId];

      // Orphan — bid line that points outside THIS SOW (bid-only OR other-SOW).
      if (row.offSow) {
        if (!cell) continue;                    // not on the basis package
        var ol = Number(cell.labor) || 0;
        // Absent vs $0 reads as a MATCH (user rule 2026-07-14): a $0 bid-only
        // line (Wattbox/UPS placeholders the sub listed but didn't price)
        // moves no money and isn't a coverage gap — suppress it like any
        // covered line instead of stacking "Bid only" exceptions.
        if (moneyEq(ol, 0)) continue;
        laborDelta -= ol; counts.orphan++;
        ex.push({
          tier: 'orphan',
          label: row.displayLabel || row.productName ||
                 (cell.productName || '') || '(bid item)',
          product: cell.productName || row.productName || '',
          note: (row.otherSowNames && row.otherSowNames.length)
                  ? 'on ' + row.otherSowNames.join(', ') : 'not on this SOW',
          sowFee: 0, bidLabor: ol, delta: -ol,
          jumpId: row.id || '', jumpAttr: 'bid'   // off-sow rows keyed by bid record id
        });
        continue;
      }

      // Matched to this SOW. Exclude require-sub-bid = No.
      if (isReqNo(row.requireSubBidSow)) continue;

      // Live SOW fee, blank-safe: a blank/zero fee on the LIVE SOW item is a
      // real $0 — never fall through to row.sowFee (the bid view's related
      // copy) when sowItemData exists, or a cleared/blank SOW fee resurrects
      // as the stale copy and flags a phantom "Labor change" against a $0
      // bid (the blank-vs-$0 bug).
      var sowFee = row.sowItemData
        ? (Number(row.sowItemData.fee) || 0)
        : (Number(row.sowFee) || 0);
      var label  = row.displayLabel ||
                   (row.sowItemData && row.sowItemData.productName) ||
                   row.productName || '(line item)';
      var product = (row.sowItemData && row.sowItemData.productName) ||
                    row.productName || row.sowProduct || '';
      var jId = row.sowItem || row.id || '';   // SOW line item id → v2 grid row

      if (!cell) {
        // SOW line that requires a bid but isn't on the basis bid → gap.
        // Same absent-vs-$0 = match rule as the orphan tier: a SOW line whose
        // expected labor is $0/blank prices nothing, so the sub not listing
        // it isn't a gap worth flagging.
        if (moneyEq(sowFee, 0)) continue;
        laborDelta += sowFee; counts.added++;
        ex.push({ tier: 'added', label: label, product: product,
                  note: 'not on basis bid', sowFee: sowFee, bidLabor: 0, delta: sowFee,
                  jumpId: jId, jumpAttr: 'item' });
        continue;
      }

      var bidLabor = Number(cell.labor) || 0;
      var feeDiff = !moneyEq(sowFee, bidLabor);

      // Non-labor spec diffs (labor desc / connected-to / connected-devices /
      // conduit) come straight from v2's getMismatches so they match the grid.
      var changed = [];
      var mm = null;
      if (v2t && typeof v2t.getMismatches === 'function') {
        try { mm = v2t.getMismatches(row, cell); } catch (e) { mm = null; }
      }
      // Labor desc + conduit computed LOCALLY (same normalization as v2) so
      // they're detected even when getMismatches bails — its guard needs
      // row.sowItem, which isn't guaranteed on every grid row, which is why
      // labor-desc diffs were being missed. Connection diffs still come from
      // getMismatches (they need its internal bid→SOW id map).
      var sowDesc = (row.sowItemData && row.sowItemData.laborDesc) ||
                    row.sowLaborDesc || '';
      if (wseq(sowDesc) !== wseq(cell.laborDesc)) changed.push('labor desc');
      if (mm && mm.connTo)     changed.push('connected to');
      if (mm && mm.connDevice) changed.push('connected devices');
      var sowCond = cnum(row.sowItemData && row.sowItemData.conduit);
      var bidCond = cnum(cell.conduit);
      var conduitDiff = (sowCond != null && bidCond != null)
                          ? (sowCond !== bidCond) : (mm ? !!mm.conduit : false);
      if (conduitDiff) changed.push('conduit');

      if (!feeDiff && !changed.length) continue;   // covered — suppressed

      if (feeDiff) {
        var d = sowFee - bidLabor;
        laborDelta += d; counts.material++;
        ex.push({ tier: 'material', label: label, product: product,
                  note: '', fields: changed.slice(),
                  sowFee: sowFee, bidLabor: bidLabor, delta: d,
                  jumpId: jId, jumpAttr: 'item' });
      } else {
        counts.spec++;
        ex.push({ tier: 'spec', label: label, product: product,
                  note: '', fields: changed.slice(),
                  sowFee: sowFee, bidLabor: bidLabor, delta: 0,
                  jumpId: jId, jumpAttr: 'item' });
      }
    }

    // ── Reconcile against the v2 column-header total ────────────────────
    // The column header shows deltaVsSow = Σ(basis cell labor) − Σ(SOW fee) —
    // a RAW total that counts SOW items flagged Require-Sub-Bid = No. The
    // exception scan above deliberately SKIPS those (they don't need a bid),
    // so its laborDelta can read $0 while the column shows a real gap (the
    // "panel says no differences but the column says −$125" confusion). Recompute
    // the SAME raw totals here — with the SAME row set + formula the column uses
    // (transform.js: sowSub over non-offSow sowItemData.fee; pkgTotal over every
    // row's basis cell.labor) — so the panel's headline can't contradict the
    // column, then collect the No-required items behind the residual so the
    // reviewer sees exactly what it is.
    var sowSubAll = 0, basisTotal = 0;
    for (var t = 0; t < rows.length; t++) {
      var trow = rows[t];
      if (!trow) continue;
      var tcell = trow.cellsByPackage && trow.cellsByPackage[pkgId];
      if (tcell) basisTotal += Number(tcell.labor) || 0;
      if (trow.sowItemData && !trow.offSow) sowSubAll += Number(trow.sowItemData.fee) || 0;
    }
    var totalDelta  = sowSubAll - basisTotal;   // SOW − sub (panel sign; = −deltaVsSow)
    var nonBidDelta = totalDelta - laborDelta;  // residual = the No-required items
    var nonBidItems = [];
    if (Math.abs(nonBidDelta) > C.moneyEps) {
      for (var nb = 0; nb < rows.length; nb++) {
        var nrow = rows[nb];
        if (!nrow || nrow.offSow || !isReqNo(nrow.requireSubBidSow)) continue;
        // Same blank-safe read as the exception scan above: a blank live fee
        // is $0, not an invitation to fall back to the stale bid-side copy.
        var nfee = nrow.sowItemData
          ? (Number(nrow.sowItemData.fee) || 0)
          : (Number(nrow.sowFee) || 0);
        var ncell = nrow.cellsByPackage && nrow.cellsByPackage[pkgId];
        var nbid  = ncell ? (Number(ncell.labor) || 0) : 0;
        if (moneyEq(nfee, nbid)) continue;      // covered — not part of the gap
        nonBidItems.push({
          label:   nrow.displayLabel ||
                   (nrow.sowItemData && nrow.sowItemData.productName) ||
                   nrow.productName || '(line item)',
          product: (nrow.sowItemData && nrow.sowItemData.productName) ||
                   nrow.productName || '',
          sowFee: nfee, bidLabor: nbid, delta: nfee - nbid, onBasis: !!ncell
        });
      }
      nonBidItems.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    }

    // Order MOST important first: coverage gaps (a SOW line nobody bid, a bid
    // line off this SOW) lead, then labor changes, then model/spec diffs (the
    // least actionable — same scope, attributes reworded). Within a tier, by
    // |delta| desc. The panel additionally tucks the spec tier behind a
    // collapsible group, but this order also drives the PDF + snapshot blob.
    var order = { added: 0, orphan: 1, material: 2, spec: 3 };
    ex.sort(function (a, b) {
      if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier];
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
    return {
      exceptions: ex, counts: counts, laborDelta: laborDelta,
      coverageGaps: counts.added + counts.orphan,
      total: ex.length,
      // Column-consistent reconciliation (drives the headline + the
      // "no sub-bid required" explanation block).
      sowSubAll: sowSubAll, basisTotal: basisTotal,
      totalDelta: totalDelta, nonBidDelta: nonBidDelta, nonBidItems: nonBidItems
    };
  }

  // ── basis candidates ────────────────────────────────────────────────────
  // The basis is an EXPLICIT user designation: "this SOW → proposal is built
  // on THAT bid." So the selector must offer EVERY project bid, not just the
  // bids the v2 comparison grid shows as COLUMNS for this SOW. There are three
  // tiers of relevance, all offered, most-relevant first:
  //
  //   1. Column packages (grid.packages) — bids v2 already shows as columns
  //      here (they price ≥1 line item on this SOW and survived the gate).
  //   2. Gated-out touching packages — bids that DO price line items on this
  //      SOW but whose column v2 dropped via its sibling-SOW gate
  //      (transform.js: field_2387 REL_SOW names only a sibling). Recovered
  //      from the grid's OWN rows: buildRow fills row.cellsByPackage from each
  //      bid record's field_2415 independent of the column gate, so any
  //      package with a cell on a row here genuinely touches this SOW.
  //   3. Every OTHER project bid (view_3573) — bids that price NO line item on
  //      this SOW. Without these, a SOW whose bids all bucket onto a SIBLING
  //      SOW shows an EMPTY dropdown ("no choices"), which is exactly what
  //      blocks assigning different bids as the basis for different SOWs. They
  //      carry a 0 on-SOW count so the option honestly reads "no items on this
  //      SOW" — the user can still designate one (and the diff then correctly
  //      reports the SOW's lines as un-bid).
  //
  // distill() works purely off cellsByPackage, so the diff renders for any
  // tier with no further change (tier 3 simply has no cells → all-added diff).
  function stripTags(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }
  function pkgStatusOf(rec, fk) {
    var r = rec[fk + '_raw'];
    if (r == null) r = rec[fk];
    if (Array.isArray(r)) r = r[0];
    if (r && typeof r === 'object') r = r.identifier || r.id || '';
    return stripTags(r);
  }
  function basisCandidates(grid) {
    var out = [], seen = Object.create(null);
    var cols = (grid && grid.packages) || [];
    for (var i = 0; i < cols.length; i++) {
      if (cols[i] && cols[i].id && !seen[cols[i].id]) { seen[cols[i].id] = true; out.push(cols[i]); }
    }
    // Packages that touch this SOW but were gated out of its columns —
    // discovered from the rows' cells, counted by on-SOW (non-offSow) rows.
    var counts = Object.create(null);
    var rows = (grid && grid.rows) || [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r] && rows[r].cellsByPackage;
      if (!cells) continue;
      for (var pid in cells) {
        if (!Object.prototype.hasOwnProperty.call(cells, pid) || seen[pid]) continue;
        if (!(pid in counts)) counts[pid] = 0;
        if (!rows[r].offSow) counts[pid]++;
      }
    }

    // Name/status for any non-column package come from the bid-package view.
    var meta = Object.create(null);
    var pkgs = readView(C.bidPkgViewKey);
    var nameF = C.f && C.f.pkgName, statusF = C.f && C.f.pkgStatus;
    for (var p = 0; p < pkgs.length; p++) {
      if (pkgs[p] && pkgs[p].id) {
        meta[pkgs[p].id] = {
          bidName:   nameF ? stripTags(pkgs[p][nameF]) : '',
          bidStatus: statusF ? pkgStatusOf(pkgs[p], statusF) : ''
        };
      }
    }

    // Tier 2: gated-out touching packages (real on-SOW count).
    var touching = Object.keys(counts);
    var extra = [];
    for (var e = 0; e < touching.length; e++) {
      seen[touching[e]] = true;
      var m = meta[touching[e]] || {};
      extra.push({
        id: touching[e], bidName: m.bidName || '', name: m.bidName || '',
        bidStatus: m.bidStatus || '', onSowItemCount: counts[touching[e]], recovered: true
      });
    }
    extra.sort(function (a, b) { return (a.bidName || '').localeCompare(b.bidName || ''); });

    // Tier 3: every OTHER project bid — so a SOW with no touching bid can still
    // designate one as its basis. Shown as "no items on this SOW", sorted last.
    var rest = [];
    for (var q = 0; q < pkgs.length; q++) {
      var pk = pkgs[q];
      if (!pk || !pk.id || seen[pk.id]) continue;
      seen[pk.id] = true;
      var mm = meta[pk.id] || {};
      rest.push({
        id: pk.id, bidName: mm.bidName || '', name: mm.bidName || '',
        bidStatus: mm.bidStatus || '', onSowItemCount: 0, offSowOnly: true
      });
    }
    rest.sort(function (a, b) { return (a.bidName || '').localeCompare(b.bidName || ''); });

    return out.concat(extra).concat(rest);
  }

  // ── HTML builders ───────────────────────────────────────────────────────
  /** Short display for a SOW identifier — the SW#### token when present,
   *  else the (tag-stripped, trimmed) identifier itself. */
  function shortSowName(identifier) {
    var s = stripTags(identifier || '');
    var m = s.match(/SW-?\d+(?:CO)?/i);
    if (m) return m[0];
    return s.length > 20 ? s.slice(0, 18) + '…' : s;
  }

  function pkgOption(p, selId, ctx) {
    var bits = [p.bidName || p.name || 'Bid'];
    if (p.bidStatus) bits.push(p.bidStatus);
    var n = p.onSowItemCount || 0;
    bits.push(n ? (n + ' on SOW') : 'no items on this SOW');
    // REL_SOW marks: say plainly which SOW each bid is assigned to in
    // Builder — ★ when it's THIS one. Informational only; any bid stays
    // pickable.
    var star = '';
    if (ctx && ctx.links && ctx.links[p.id]) {
      var mine = false, others = [];
      for (var li = 0; li < ctx.links[p.id].length; li++) {
        var lk = ctx.links[p.id][li];
        if (lk.id === ctx.sowId) mine = true;
        else others.push(shortSowName(lk.identifier));
      }
      if (mine) { star = '★ '; bits.push('assigned to this SOW'); }
      else if (others.length) bits.push('assigned to ' + others.join(', '));
    }
    return '<option value="' + esc(p.id) + '"' + (p.id === selId ? ' selected' : '') +
      '>' + star + esc(bits.join(' · ')) + '</option>';
  }

  function selector(grid, selId, persisted) {
    var pkgs = basisCandidates(grid);
    var optCtx = { sowId: grid.sowId, links: pkgSowLinks() };
    var opts = '<option value="">— choose the basis bid —</option>' +
      // Sentinel: no subcontractor bid exists for this SOW (self-perform).
      '<option value="' + K1_ID + '"' + (selId === K1_ID ? ' selected' : '') +
        '>K1 Bid — no subcontractor bid (self-perform)</option>' +
      pkgs.map(function (p) { return pkgOption(p, selId, optCtx); }).join('');
    // Action item, pinned last under its own rule so it never reads as one of
    // the bids above. Never carries `selected` — it's a verb, not a state.
    // Offered only while the project has no survey connected: with a survey
    // in hand the work goes out to subs, so a K2 request doesn't apply.
    if (C.requestK2Webhook && !projectHasSurvey()) {
      opts += '<option disabled>──────────</option>' +
        '<option value="' + REQ_K2_ID + '">' +
        (requestingK2[grid.sowId] ? 'Requesting a K2 bid…' : '⤴ Request a K2 bid') +
        '</option>';
    }
    var note;
    if (savingGrid[grid.sowId]) {
      note = '<span class="scw-sbd-baseline__meta">saving…</span>';
    } else if (selId && isDefaulted(grid.sowId)) {
      // Soft REL_SOW default: shown, compared, but deliberately unsaved.
      // The button is the explicit award gesture (re-selecting the same
      // option in a native <select> fires no change event).
      note = '<span class="scw-sbd-baseline__meta">★ shown by default — assigned to this SOW · not saved as basis</span>' +
        '<button type="button" class="scw-sbd-savedef" data-scw-sbd-savedef ' +
          'data-sow-id="' + esc(grid.sowId) + '" data-pkg-id="' + esc(selId) + '"' +
          ' title="Save this bid as the basis for this SOW → proposal">Save as basis</button>';
    } else if (selId === K1_ID && (persisted || savedByGrid[grid.sowId])) {
      note = '<span class="scw-sbd-baseline__meta scw-sbd-baseline__meta--saved">✓ saved — K1 Bid (no sub bid for this SOW)</span>';
    } else if (selId && (persisted || savedByGrid[grid.sowId])) {
      note = autoPickedBySow[grid.sowId]
        ? '<span class="scw-sbd-baseline__meta scw-sbd-baseline__meta--saved">✓ auto-selected — this bid matches the SOW · saved</span>'
        : '<span class="scw-sbd-baseline__meta scw-sbd-baseline__meta--saved">✓ saved as the basis for this SOW → proposal</span>';
    } else if (selId) {
      note = '<span class="scw-sbd-baseline__meta">not saved yet</span>';
    } else {
      note = '<span class="scw-sbd-baseline__meta">choose the bid this SOW → proposal is built on</span>';
    }
    return '<div class="scw-sbd-baseline">' +
      '<label>Basis bid:</label>' +
      '<select data-scw-sbd-basis data-sow-id="' + esc(grid.sowId) + '"' +
        ' data-sow-name="' + esc(grid.sowName || '') + '"' +
        (savingGrid[grid.sowId] ? ' disabled' : '') + '>' + opts + '</select>' +
      note + '</div>';
  }

  function tally(res) {
    function stat(n, label) {
      return '<div class="scw-sbd-stat"><span class="scw-sbd-stat__n">' + n +
        '</span><span class="scw-sbd-stat__l">' + esc(label) + '</span></div>';
    }
    // Headline uses the column-consistent RAW total (SOW − sub) so the panel
    // can't disagree with the v2 column header. It includes the labor-coverage
    // delta PLUS any "no sub-bid required" items the exception scan suppresses
    // (explained in their own block below).
    var d = (res.totalDelta != null ? res.totalDelta : res.laborDelta);
    var dCls = Math.abs(d) <= C.moneyEps ? 'zero' : (d > 0 ? 'pos' : 'neg');
    return '<div class="scw-sbd-tally">' +
      stat(res.counts.added, 'Not bid') +
      stat(res.counts.orphan, 'Bid only') +
      stat(res.counts.material, 'Labor change') +
      stat(res.counts.spec, 'Spec change') +
      '<div class="scw-sbd-stat scw-sbd-stat--delta"><span class="scw-sbd-stat__n ' + dCls +
        '">' + signedMoney(d) + '</span><span class="scw-sbd-stat__l">total Δ (SOW − sub)</span></div>' +
      '</div>';
  }

  function flag(res) {
    if (res.coverageGaps > 0) {
      return '<div class="scw-sbd-flag scw-sbd-flag--gap">⚠️ ' + res.coverageGaps +
        ' coverage gap' + (res.coverageGaps === 1 ? '' : 's') +
        ' — SOW lines needing a bid, or bid lines off this SOW.</div>';
    }
    var td = (res.totalDelta != null ? res.totalDelta : res.laborDelta);
    // No coverage/labor exceptions, but the RAW SOW↔bid total still differs —
    // entirely from "no sub-bid required" items that aren't on this bid (or
    // priced differently). Explain it instead of falsely claiming a match, so
    // the panel never contradicts the column header's "vs SOW" delta.
    if (res.total === 0 && Math.abs(td) > C.moneyEps) {
      var n = (res.nonBidItems && res.nonBidItems.length) || 0;
      return '<div class="scw-sbd-flag scw-sbd-flag--gap">' + signedMoney(td) +
        ' total vs SOW' + (n ? ' from ' + n + ' item' + (n === 1 ? '' : 's') +
        ' marked “no sub-bid required”' : '') +
        ' — not a coverage gap, but it’s why this bid’s total differs from the SOW.</div>';
    }
    if (res.total === 0) {
      return '<div class="scw-sbd-flag scw-sbd-flag--ok">✓ Basis bid matches the SOW — no labor or coverage differences.</div>';
    }
    return '';
  }

  function badge(tier) {
    var def = T[tier] || T.material;
    return '<span class="scw-sbd-badge" style="background:' + def.color + '">' +
      esc(def.label) + '</span>';
  }
  function deltaCell(n) {
    if (Math.abs(n) <= C.moneyEps) return '<td class="scw-sbd-num scw-sbd-delta-zero">—</td>';
    return '<td class="scw-sbd-num ' + (n > 0 ? 'scw-sbd-delta-pos' : 'scw-sbd-delta-neg') +
      '">' + signedMoney(n) + '</td>';
  }
  function exRow(r, sowId) {
    var jump = r.jumpId
      ? ' data-scw-sbd-jump-id="' + esc(r.jumpId) + '" data-scw-sbd-jump-attr="' +
        esc(r.jumpAttr || 'item') + '" data-scw-sbd-jump-sow="' + esc(sowId) +
        '" title="Jump to this row in the grid above"'
      : '';
    return '<tr class="scw-sbd-row scw-sbd-row--' + r.tier +
        (r.jumpId ? ' scw-sbd-row--jump' : '') + '"' + jump + '>' +
      '<td>' + badge(r.tier) + '</td>' +
      '<td><div class="scw-sbd-label">' + esc(r.label) + '</div>' +
        (r.product ? '<div class="scw-sbd-product">' + esc(r.product) + '</div>' : '') +
        (r.fields && r.fields.length
          ? '<div class="scw-sbd-changed">' + r.fields.map(function (f) {
              return '<span class="scw-sbd-chip">' + esc(f) + '</span>'; }).join('') + '</div>'
          : '') +
        (r.note ? '<div class="scw-sbd-mdf">' + esc(r.note) + '</div>' : '') + '</td>' +
      '<td class="scw-sbd-num">' + (r.tier === 'orphan' ? '—' : money(r.sowFee)) + '</td>' +
      '<td class="scw-sbd-num">' + (r.tier === 'added' ? '—' : money(r.bidLabor)) + '</td>' +
      deltaCell(r.delta) + '</tr>';
  }
  function exTable(rows, sowId) {
    if (!rows || !rows.length) return '';
    return '<table class="scw-sbd-table"><thead><tr>' +
      '<th>Status</th><th>Line item</th>' +
      '<th class="scw-sbd-num">SOW labor</th><th class="scw-sbd-num">Sub bid</th>' +
      '<th class="scw-sbd-num">Δ</th></tr></thead><tbody>' +
      rows.map(function (r) { return exRow(r, sowId); }).join('') +
      '</tbody></table>';
  }

  /** Exception detail, importance-tiered: coverage gaps + labor changes are
   *  surfaced directly (most actionable), while model/spec differences — same
   *  scope, attributes reworded — collapse into their own group so they don't
   *  bury the gaps that actually need a decision. */
  function exDetail(res, sowId) {
    if (!res.exceptions.length) return '';
    var significant = [], minor = [];
    for (var i = 0; i < res.exceptions.length; i++) {
      (res.exceptions[i].tier === 'spec' ? minor : significant).push(res.exceptions[i]);
    }
    var html = '';
    if (significant.length) {
      html += '<div class="scw-sbd-exwrap scw-sbd-exwrap--lead">' +
        exTable(significant, sowId) + '</div>';
    }
    if (minor.length) {
      html += '<details class="scw-sbd-exwrap scw-sbd-exwrap--minor"><summary>' +
        minor.length + ' model / spec difference' + (minor.length === 1 ? '' : 's') +
        ' — same scope, attributes reworded</summary>' +
        exTable(minor, sowId) + '</details>';
    }
    return html;
  }

  /** "No sub-bid required" reconciliation — the items that make the raw
   *  SOW↔bid total differ but which the coverage scan intentionally skips.
   *  Collapsed by default (informational), it's what explains the headline
   *  total when there are no coverage/labor exceptions. */
  function nonBidDetail(res) {
    var items = (res && res.nonBidItems) || [];
    if (!items.length) return '';
    var body = items.map(function (r) {
      return '<tr class="scw-sbd-row scw-sbd-row--nonbid">' +
        '<td><span class="scw-sbd-badge" style="background:#94a3b8">No bid req’d</span></td>' +
        '<td><div class="scw-sbd-label">' + esc(r.label) + '</div>' +
          (r.product ? '<div class="scw-sbd-product">' + esc(r.product) + '</div>' : '') +
          '<div class="scw-sbd-mdf">' +
            (r.onBasis ? 'on this bid — different amount' : 'not on this bid') +
          '</div></td>' +
        '<td class="scw-sbd-num">' + money(r.sowFee) + '</td>' +
        '<td class="scw-sbd-num">' + (r.onBasis ? money(r.bidLabor) : '—') + '</td>' +
        deltaCell(r.delta) + '</tr>';
    }).join('');
    return '<details class="scw-sbd-exwrap scw-sbd-exwrap--minor"><summary>' +
      items.length + ' item' + (items.length === 1 ? '' : 's') +
      ' marked “no sub-bid required” differ from the SOW (' + signedMoney(res.nonBidDelta) +
      ') — informational, not a coverage gap</summary>' +
      '<table class="scw-sbd-table"><thead><tr>' +
        '<th>Status</th><th>Line item</th>' +
        '<th class="scw-sbd-num">SOW labor</th><th class="scw-sbd-num">Sub bid</th>' +
        '<th class="scw-sbd-num">Δ</th></tr></thead><tbody>' + body + '</tbody></table></details>';
  }

  /** Compact per-SOW diff block, injected INTO that SOW's section in the v2
   *  grid (under its header). Exceptions collapse behind a <details> since the
   *  grid itself shows them — the block leads with the decision: basis bid +
   *  readiness + the labor/coverage headline + note. */
  function inlineHtml(grid) {
    var sowId = grid.sowId;
    var selId = basisFor(sowId);
    // "Persisted" = the connection is saved, OR (K1) the snapshot blob carries
    // the sentinel — K1 has no connection to read back after a reload.
    var persisted = !!(C.basisBidField && persistedBasis(sowId));
    if (!persisted && selId === K1_ID) {
      var pSnap = persistedSnapshot(sowId);
      persisted = !!(pSnap && pSnap.basisBidId === K1_ID);
    }

    // Readiness derived from the LOCAL diff (no second buildState). The snapshot
    // auto-saves, so the only thing a reviewer still owes us is a note when
    // there are differences.
    var rd, res = null, needsNote = false;
    if (!selId) {
      rd = { state: 'needs-basis', label: 'Pick a basis bid' };
    } else if (selId === K1_ID) {
      rd = savingSnap[sowId]
        ? { state: 'needs-review', label: 'Saving…' }
        : { state: 'ready', label: '✓ K1 Bid — no sub bid' };
    } else {
      res = distill(grid, selId);
      needsNote = res.total > 0 && !currentNote(sowId).trim();
      if (needsNote)               rd = { state: 'needs-note',   label: 'Add a reviewer note' };
      else if (savingSnap[sowId])  rd = { state: 'needs-review', label: 'Saving…' };
      else                         rd = { state: 'ready',        label: '✓ Reviewed — auto-saved' };
    }

    // Chevron + pill form the collapse handle (independent of the SOW
    // accordion). The basis selector + readiness stay in the bar so they're
    // reachable even while the body is folded.
    var toggle = '<button type="button" class="scw-sbd-collapse" data-scw-sbd-collapse ' +
      'data-sow-id="' + esc(sowId) + '" aria-label="Collapse or expand this diff panel" ' +
      'title="Collapse / expand this diff panel">' +
      '<svg class="scw-sbd-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
        'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg>' +
      '<span class="scw-sbd-pill">sub-bid diff</span></button>';
    // Signals the folded bar must carry: attention state (drives the quiet
    // default-open) and a gap chip so a collapsed panel can't hide a
    // coverage problem.
    var gaps = (res && res.coverageGaps) || 0;
    attentionBySow[sowId] = !!(gaps > 0 || needsNote);
    var gapChip = gaps > 0
      ? '<span class="scw-sbd-bargap" title="SOW lines needing a bid, or bid lines off this SOW">⚠ ' +
          gaps + ' gap' + (gaps === 1 ? '' : 's') + '</span>'
      : '';
    var bar = '<div class="scw-sbd-inline-bar">' +
      toggle +
      selector(grid, selId, persisted) +
      '<span class="scw-sbd-ready scw-sbd-ready--' + rd.state + '">' + esc(rd.label) + '</span>' +
      gapChip +
      '</div>';
    var body;
    if (!selId) {
      body = '<div class="scw-sbd-empty">Choose the basis bid to see what differs vs this SOW.</div>';
    } else if (selId === K1_ID) {
      body = '<div class="scw-sbd-empty">K1 Bid — no subcontractor bid applies to this ' +
        'SOW (self-perform). There is nothing to diff, and Publish Final is not gated.</div>' +
        noteBar(sowId, false);
    } else {
      var ex = res.total ? exDetail(res, sowId) : '';
      body = tally(res) + flag(res) + ex + nonBidDetail(res) +
        (res.total > 0 ? noteBar(sowId, needsNote) : '');
    }
    return bar + '<div class="scw-sbd-inline-body">' + body + '</div>';
  }

  /** Reviewer note. Auto-saves with the diff (no Save button) — the note PUTs
   *  to field_2941 when the reviewer clicks away. Required when diffs exist. */
  function noteBar(sowId, needsNote) {
    var noteVal = currentNote(sowId);
    var msg = '';
    if (savingSnap[sowId]) msg = '<span class="scw-sbd-savemsg">saving…</span>';
    else if (savedSnap[sowId]) msg = '<span class="scw-sbd-savemsg scw-sbd-savemsg--ok">✓ auto-saved</span>';
    else {
      var snap = persistedSnapshot(sowId);
      if (snap && snap.savedAt) msg = '<span class="scw-sbd-savemsg">saved ' +
        esc(String(snap.savedAt).slice(0, 10)) + '</span>';
    }
    var reqLbl = needsNote
      ? ' <span class="scw-sbd-req">(required — there are differences)</span>'
      : ' (optional)';
    return '<div class="scw-sbd-notebar' + (needsNote ? ' scw-sbd-notebar--req' : '') + '">' +
      '<label class="scw-sbd-note-label">Reviewer note — why we’re proceeding with this diff' +
        reqLbl + '</label>' +
      '<textarea class="scw-sbd-note" data-scw-sbd-note data-sow-id="' + esc(sowId) + '" ' +
        'rows="2" placeholder="e.g. labor delta approved with sub; descriptions reworded, scope unchanged.">' +
        esc(noteVal) + '</textarea>' +
      '<div class="scw-sbd-noterow">' + msg +
        '<span class="scw-sbd-hint">Saves automatically when you click away.</span></div></div>';
  }

  /** Inject/refresh a per-SOW diff block inside each v2 SOW section. Deferred
   *  one frame so it runs AFTER v2 rebuilds its section innerHTML on a tick. */
  // ── comparison-state source ────────────────────────────────────────────
  // buildState is the ~800-line v2 comparison transform (O(items×sows×pkgs)).
  // The v2 grid ALREADY runs it for its own render on every data change and
  // publishes the result as SCW.bidReviewV2.builtState. We inject a per-SOW
  // diff into those same sections, so we REUSE that exact state instead of
  // running the transform a second time — one transform per data change, not
  // two. v2's renderSnapshot runs synchronously on the data notify and we
  // render rAF-deferred off the same notify, so the published state reflects
  // the current data by the time we read it.
  //
  // Fallback: if v2 hasn't published yet (we booted first) OR a direct Knack
  // event raced ahead of v2's debounced notify, build our own — memoized so
  // the load-time retries (150/500/1200ms) and basis/note/collapse
  // interactions reuse it rather than recomputing. markDirty() (wired to the
  // real data events in init.js) bumps _dataGen; the retries/display
  // interactions do NOT, so they reuse the cache and just re-inject.
  var _dataGen = 0, _builtGen = -1, _builtState = null;
  function markDirty() { _dataGen++; }

  function currentState(v2t) {
    // Preferred: reuse the v2 grid's already-built state.
    var v2ns = window.SCW.bidReviewV2;
    var pub = v2ns && v2ns.builtState;
    if (pub && pub.sowGrids && pub.sowGrids.length) {
      _builtState = pub;          // keep as the fallback cache too
      return pub;
    }
    // Fallback: build our own (memoized). Only commit the cache on a usable
    // build — a transient empty read (mid-fetch) must not poison it.
    if (_dataGen === _builtGen && _builtState) return _builtState;
    var state = v2t.buildState(
      readView(C.bidViewKey), readView(C.sowItemsViewKey), readView(C.bidPkgViewKey));
    if (state && state.sowGrids && state.sowGrids.length) {
      _builtState = state;
      _builtGen = _dataGen;
    }
    return state;
  }

  function render() {
    var v2t = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.transform;
    if (!v2t || typeof v2t.buildState !== 'function') return;
    var state = currentState(v2t);
    if (!state || !state.sowGrids || !state.sowGrids.length) return;

    var byId = Object.create(null);
    for (var i = 0; i < state.sowGrids.length; i++) byId[state.sowGrids[i].sowId] = state.sowGrids[i];

    var ae = document.activeElement;
    var sections = document.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var sowId = sec.getAttribute('data-sow-id');
      var grid = byId[sowId];
      if (!grid) continue;

      var block = null, kids = sec.children;
      for (var k = 0; k < kids.length; k++) {
        if (kids[k].className && kids[k].className.indexOf('scw-sbd-inline') !== -1) { block = kids[k]; break; }
      }
      // Don't clobber a note being typed inside this block.
      if (block && ae && block.contains(ae) && ae.getAttribute &&
          ae.getAttribute('data-scw-sbd-note') != null) continue;

      if (!block) {
        block = document.createElement('div');
        block.className = 'scw-sbd-inline';
        var hdr = sec.querySelector('.scw-bid-review-v2__sow-header');
        if (hdr) hdr.insertAdjacentElement('afterend', block);
        else sec.insertBefore(block, sec.firstChild);
      }
      block.innerHTML = inlineHtml(grid);
      // Re-apply the collapse state (survives this rebuild). inlineHtml just
      // stashed attentionBySow, so the quiet default resolves correctly.
      block.classList.toggle('scw-sbd-inline--collapsed', resolveCollapsed(sowId));

      // Keep field_2941 in lockstep with whatever the diff currently shows —
      // any data change, basis pick, or note edit re-persists (debounced).
      autoSave(grid);
      // No basis yet + exactly one perfectly-matching bid → save it
      // automatically (guards + once-per-session inside).
      maybeAutoPickBasis(grid);
    }
  }

  // ── "Request a K2 bid" ──────────────────────────────────────────────────
  // Fires the SOW id at Make so a K2 (internal/self-perform) bid gets raised
  // for this SOW. Deliberately NOT routed through SCW.knackAjax: that helper
  // attaches the user's Knack session token, which has no business being sent
  // to a third-party webhook host.
  function sbdToast(msg, type) {
    try {
      var br = window.SCW && window.SCW.bidReview;
      if (br && typeof br.renderToast === 'function') { br.renderToast(msg, type); return; }
    } catch (e) { /* fall through */ }
    if (type === 'error') console.warn('[SubBidDiff] ' + msg);
  }

  function requestK2Bid(sowId, sowName) {
    if (!sowId || !C.requestK2Webhook) return;
    if (requestingK2[sowId]) return;               // one in-flight per SOW
    // Re-check the gate at fire time: a survey can land between render and
    // click (the option sits in DOM Knack re-renders on its own schedule), and
    // this is the last point before the POST.
    if (projectHasSurvey()) {
      sbdToast('This project already has a survey — a K2 bid request no longer applies', 'error');
      render();
      return;
    }
    var label = sowName ? ('SOW ' + sowName) : 'this SOW';
    if (!window.confirm('Request a K2 bid for ' + label + '?')) return;

    requestingK2[sowId] = true;
    render();                                      // option reads "Requesting…"

    var body = {
      actionType: 'request_k2_bid',
      sowId:      sowId,
      sowName:    sowName || '',
      timestamp:  new Date().toISOString()
    };
    try {
      var u = Knack.getUserAttributes();
      if (u) body.user = { id: u.id || '', name: u.name || '', email: u.email || '' };
    } catch (ex) { /* user attrs unavailable */ }

    function done(ok, msg) {
      delete requestingK2[sowId];
      render();
      sbdToast(msg, ok ? 'success' : 'error');
    }

    $.ajax({
      url:         C.requestK2Webhook,
      type:        'POST',
      contentType: 'application/json',
      data:        JSON.stringify(body),
      timeout:     30000,
      success: function () { done(true, 'K2 bid requested for ' + label); },
      error: function (xhr) {
        // Make's hook host answers cross-origin without CORS headers, so a
        // delivered POST still surfaces as status 0 — treated as sent, the
        // same convention revision-accept-reject.js uses.
        if (xhr && xhr.status === 0) { done(true, 'K2 bid requested for ' + label); return; }
        console.error('[SubBidDiff] Request K2 bid failed:',
                      xhr && xhr.status, xhr && xhr.responseText);
        done(false, 'Could not request a K2 bid — please try again');
      }
    });
  }

  function bindOnce() {
    if (document.documentElement.hasAttribute('data-scw-sbd-bound')) return;
    document.documentElement.setAttribute('data-scw-sbd-bound', '1');
    document.addEventListener('change', function (e) {
      var sel = e.target.closest && e.target.closest('[data-scw-sbd-basis]');
      if (sel) {
        var bsow = sel.getAttribute('data-sow-id');
        if (!bsow) return;
        var pkgId = sel.value || '';
        // "Request a K2 bid" is an ACTION, not a basis choice. Snap the picker
        // back to the real basis FIRST — before the confirm, so declining (or
        // a failed POST) can't leave the control misreporting the basis — then
        // fire. Nothing below this runs, so field_2942 is never touched.
        if (pkgId === REQ_K2_ID) {
          sel.value = basisFor(bsow) || '';
          requestK2Bid(bsow, sel.getAttribute('data-sow-name') || '');
          return;
        }
        selectedByGrid[bsow] = pkgId;          // optimistic — diff shows immediately
        // ONE PUT persists basis + snapshot together (set or cleared) — see
        // writeBasis. Never split across writes, so they can't drift apart.
        if (C.basisBidField) writeBasis(bsow, pkgId);
        else render();
        return;
      }
      // Reviewer note committed (blur / Enter on the field) → re-persist.
      var nt = e.target.closest && e.target.closest('[data-scw-sbd-note]');
      if (nt) {
        var nsow = nt.getAttribute('data-sow-id');
        if (nsow) { noteByGrid[nsow] = nt.value; render(); }  // render → autoSave persists the note
      }
    });
    // Capture the reviewer note live (no re-render → caret stays put; render()
    // also skips rebuilds while a note is focused). The actual save happens on
    // 'change' (blur) above.
    document.addEventListener('input', function (e) {
      var n = e.target.closest && e.target.closest('[data-scw-sbd-note]');
      if (!n) return;
      var sowId = n.getAttribute('data-sow-id');
      if (sowId) noteByGrid[sowId] = n.value;
    });
    document.addEventListener('click', function (e) {
      // "Save as basis" on a soft REL_SOW default — the explicit award
      // gesture. Routes through the SAME writeBasis path as a manual pick,
      // so field_2942 + snapshot + downstream gates behave identically.
      var sd = e.target.closest && e.target.closest('[data-scw-sbd-savedef]');
      if (sd) {
        var dsow = sd.getAttribute('data-sow-id');
        var dpkg = sd.getAttribute('data-pkg-id');
        if (dsow && dpkg) {
          selectedByGrid[dsow] = dpkg;   // now the user's choice, not a default
          writeBasis(dsow, dpkg);
        }
        return;
      }
      // Independent collapse toggle — fold just this SOW's diff panel, no
      // re-render needed (CSS drives body visibility + chevron rotation).
      var ct = e.target.closest && e.target.closest('[data-scw-sbd-collapse]');
      if (ct) {
        var csow = ct.getAttribute('data-sow-id');
        if (csow) {
          // Flip from the RESOLVED state, not the raw map — under the quiet
          // default a SOW with no stored entry renders collapsed, and its
          // first click must open it (storing the choice explicitly).
          collapsedBySow[csow] = !resolveCollapsed(csow);
          saveCollapsed();
          var blk = ct.closest('.scw-sbd-inline');
          if (blk) blk.classList.toggle('scw-sbd-inline--collapsed', !!collapsedBySow[csow]);
        }
        return;
      }
    });
    // Jump rows — plain delegated click. (The dead-click bug was never the
    // event path: jumpTo's document-wide fallback could match a NON-row
    // element carrying the same data-row-id — see findRow in jumpTo.)
    document.addEventListener('click', function (e) {
      var jr = e.target && e.target.closest && e.target.closest('[data-scw-sbd-jump-id]');
      if (jr) {
        jumpTo(jr.getAttribute('data-scw-sbd-jump-sow'),
               jr.getAttribute('data-scw-sbd-jump-attr'),
               jr.getAttribute('data-scw-sbd-jump-id'));
      }
    });
  }

  // basisFor exported for bid-review-v2's basis column filter — same
  // resolution order as the selector (session pick → persisted field_2942 →
  // K1 snapshot sentinel), so the filter always agrees with the dropdown.
  ns.render = { render: render, bindOnce: bindOnce, distill: distill,
                markDirty: markDirty, basisFor: basisFor };
})();
/*** END SUB-BID DIFF — RENDER ***********************************************/
