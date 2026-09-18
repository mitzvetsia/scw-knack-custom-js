/*** PROPOSAL PREVIEW — show + EDIT the expiration date (scene_1096) *********
 *
 * The customer-facing proposal shows an "Expiration Date" row in its top
 * detail block (built by proposal-pdf-export's tokenized `_Expiration_Date_`
 * row + live-patched by published-proposal-render.js). The internal Preview
 * Proposal page (scene_1096, #proposals/proposal/<sowId>/) renders the
 * proposal from LIVE Knack views and had no expiration row — so staff
 * previewing a quote couldn't see it.
 *
 * WHERE THE VALUE COMES FROM: we read the SOW-side expiration `field_2135`
 * (the field that feeds publish and mirrors the proposal's `field_2659`)
 * off whichever rendered view on the scene carries it — on scene_1096 that's
 * `view_3861` (the hidden "SOW_sow header Details" host). We fall back to
 * `field_2659` if `field_2135` isn't present.
 *
 * WHERE IT'S PLACED: the SOW identity on this scene lives in `view_3339` as
 * label-less items — `field_2126` (SOW name `<h1>`) and `field_2122` (SW#
 * `<strong>`). We insert an "Expiration Date" `.kn-detail` row right after
 * the SW# so the block reads Name · SW# · Expiration Date.
 *
 * EDITING (added 2026-09-04 — "no place to update a CO's expiration"): the
 * row carries a pencil; clicking it swaps the value for a date input +
 * Save/Cancel. WHAT the save writes depends on publish state, because after
 * publishing the date actually in effect is `field_2659` on the PUBLISHED
 * PROPOSAL record (what the top-right blob shows and what the customer link
 * honors) — not the SOW's `field_2135`:
 *
 *   — PUBLISHED (view_3886 has a record): write `field_2659` on the proposal
 *     record through view_3886 (same scene → plain knackRecordUrl), then
 *     mirror `field_2135` onto the SOW best-effort — the same primary/mirror
 *     split pq-expiration-edit.js uses on scene_1085/1155. This is what lets
 *     an expiration be EXTENDED without re-publishing. The blob's "Expires:"
 *     line is patched in place and view_3886 refetched so the widget
 *     repaints from server truth.
 *   — NOT published: write `field_2135` on the SOW only; it carries into the
 *     proposal at publish time.
 *
 * scene_1096 has no editable SOW view, so the field_2135 write goes through
 * `view_3325` (the build-SOW SOW list — the same field_2135-capable write
 * view the expiration mirror uses). knackRecordUrl pins URLs to the CURRENT
 * scene, so we resolve view_3325's own scene key from the Knack schema at
 * runtime and build the cross-scene URL directly — a view-scoped PUT works
 * from any page as long as the logged-in role can access that scene. Base
 * SOWs get the same editor; the gap it closes is COs, which have no other
 * surface for their expiration. When the field is blank the row still
 * renders ("—") so the pencil stays reachable.
 *
 * DISPLAY follows the same rule: when published, the row shows the
 * proposal's `field_2659` (the in-effect date), so the row and the blob can
 * never disagree; otherwise it shows the SOW-side value.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENE_ID   = 'scene_1096';
  var ID_VIEW    = 'view_3339';                    // SOW identity host
  var ANCHOR_FLD = 'field_2122';                   // SW# item to insert after
  var EXP_FIELDS = ['field_2135', 'field_2659'];   // SOW expiration, then proposal
  var EXP_FIELD  = 'field_2135';                   // SOW-side expiration
  var WRITE_VIEW = 'view_3325';                    // field_2135-capable SOW view
  var MODEL_VIEW = 'view_3861';                    // refetched after a save
  var PQ_VIEW      = 'view_3886';                  // published proposals grid (this scene)
  var PQ_EXP_FIELD = 'field_2659';                 // in-effect expiration on the proposal
  var MARKER     = 'scw-preview-exp';
  var CSS_ID     = 'scw-preview-exp-css';
  var NS         = '.scwPreviewExp';

  // ── Read the live expiration off any rendered view on the scene ─────
  function pickDate(attrs) {
    if (!attrs) return '';
    for (var i = 0; i < EXP_FIELDS.length; i++) {
      var raw = attrs[EXP_FIELDS[i] + '_raw'];
      if (raw && typeof raw === 'object') {
        if (raw.date_formatted) return String(raw.date_formatted).trim();
        if (raw.date)           return String(raw.date).trim();
      }
      var v = attrs[EXP_FIELDS[i]];
      if (v != null && String(v).replace(/<[^>]*>/g, '').trim()) {
        return String(v).replace(/<[^>]*>/g, '').trim();
      }
    }
    return '';
  }

  function readExpiration() {
    try {
      var views = window.Knack && Knack.views;
      if (!views) return '';
      for (var vk in views) {
        if (!Object.prototype.hasOwnProperty.call(views, vk)) continue;
        var m = views[vk] && views[vk].model;
        if (!m) continue;
        // Details view — single record on model.attributes.
        var got = pickDate(m.attributes);
        if (got) return got;
        // Grid/table view — scan its records.
        var models = m.data && m.data.models;
        if (models) {
          for (var i = 0; i < models.length; i++) {
            got = pickDate(models[i] && models[i].attributes);
            if (got) return got;
          }
        }
      }
    } catch (e) { /* fail soft */ }
    return '';
  }

  // ── SOW record id: URL hash first, header-details model second ──────
  function getSowId() {
    var m = (window.location.hash || '').match(/proposals\/proposal\/([a-f0-9]{24})/i);
    if (m) return m[1];
    try {
      var mv = Knack.views[MODEL_VIEW] && Knack.views[MODEL_VIEW].model;
      if (mv && mv.id) return mv.id;
    } catch (e) { /* fall through */ }
    return '';
  }

  // ── Published proposal on this scene (null when not yet published) ──
  function readPublished() {
    try {
      if (window.SCW && SCW.publishedQuoteInfo) {
        var p = SCW.publishedQuoteInfo.read({ sourceView: PQ_VIEW });
        if (p && p.recordId) return p;
      }
    } catch (e) { /* fail soft */ }
    return null;
  }

  // ── Cross-scene record URL for the write view ───────────────────────
  // knackRecordUrl uses Knack.router.current_scene_key, but view_3325
  // lives on the build-SOW scene — find that scene in the app schema.
  var _writeSceneKey = null;
  function writeSceneKey() {
    if (_writeSceneKey) return _writeSceneKey;
    try {
      var scenes = Knack.scenes && Knack.scenes.models;
      for (var i = 0; i < (scenes ? scenes.length : 0); i++) {
        var sc = scenes[i];
        var views = (sc.views && sc.views.models) ||
                    (sc.attributes && sc.attributes.views) || [];
        for (var j = 0; j < views.length; j++) {
          var v = views[j];
          var key = (v && (v.id || (v.attributes && v.attributes.key))) ||
                    (v && v.key);
          if (key === WRITE_VIEW) {
            _writeSceneKey = (sc.attributes && sc.attributes.key) || sc.id;
            return _writeSceneKey;
          }
        }
      }
    } catch (e) { /* fall through */ }
    return '';
  }
  function writeUrl(recordId) {
    var sk = writeSceneKey();
    if (!sk) return '';
    return Knack.api_url + '/v1/pages/' + sk + '/views/' + WRITE_VIEW +
           '/records/' + recordId;
  }

  function saveExpiration(recordId, mdy, cb) {
    var url = writeUrl(recordId);
    if (!url) { cb(new Error('Write view not found in app schema')); return; }
    var body = {};
    body[EXP_FIELD] = mdy;
    SCW.knackAjax({
      url:  url,
      type: 'PUT',
      data: JSON.stringify(body),
      success: function () { cb(null); },
      error: function (xhr) {
        console.warn('[scw-preview-exp] field_2135 save failed', xhr && xhr.status);
        cb(new Error('Save failed' +
          (xhr && xhr.status ? ' (' + xhr.status + ')' : '')));
      }
    });
  }

  // field_2659 on the published-proposal record, through this scene's own
  // published-proposals grid — the date the blob + customer link honor.
  function savePublishedExp(proposalId, mdy, cb) {
    var body = {};
    body[PQ_EXP_FIELD] = mdy;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(PQ_VIEW, proposalId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function () { cb(null); },
      error: function (xhr) {
        var status = xhr && xhr.status;
        var msg = 'Save failed' + (status ? ' (' + status + ')' : '');
        if (status === 401 || status === 403) {
          msg = 'Save denied (' + status + ') — ' + PQ_VIEW + ' needs ' +
                PQ_EXP_FIELD + ' editable (inline edit / update rights).';
        }
        console.warn('[scw-preview-exp] field_2659 save failed',
          xhr && xhr.responseText);
        cb(new Error(msg));
      }
    });
  }

  // In-place ack on the blob after a field_2659 save; the view_3886 refetch
  // that follows rebuilds it fully (expired badge/note, etc.).
  function patchBlob(proposalId, mdy) {
    var els = document.querySelectorAll(
      '.scw-pq-info[data-proposal-record-id="' + proposalId + '"] .scw-pq-exp');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = 'Expires: ' + mdy;
      els[i].classList.remove('scw-pq-exp--past');
    }
  }

  // ── mm/dd/yyyy helpers ──────────────────────────────────────────────
  function mdyToIso(mdy) {
    var m = String(mdy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }
  function isoToMdy(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return m[2] + '/' + m[3] + '/' + m[1];
  }

  // Same semantics as published-quote-info.js isExpired(): strictly before
  // today (calendar-day boundary); blank / unparseable = not expired. Kept
  // identical so this row and the blob can never disagree on expired-ness.
  function isExpired(mdy) {
    if (!mdy) return false;
    var d = new Date(mdy);
    if (isNaN(d.getTime())) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  // Toggle the loud expired treatment (row tint + red date + EXPIRED pill)
  // to match `mdy`. Idempotent — safe on every render and after every save.
  function applyExpiredState(row, mdy) {
    var expired = isExpired(mdy);
    row.classList.toggle('scw-preview-exp--expired', expired);
    var badge = row.querySelector('.scw-exp-expired-badge');
    if (expired && !badge) {
      var bSpan = row.querySelector('.kn-detail-body > span');
      if (bSpan) {
        badge = document.createElement('span');
        badge.className = 'scw-exp-expired-badge';
        badge.textContent = 'Expired';
        bSpan.insertBefore(badge, bSpan.querySelector('.scw-exp-edit-btn'));
      }
    } else if (!expired && badge && badge.parentNode) {
      badge.parentNode.removeChild(badge);
    }
  }

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.' + MARKER + ' .scw-exp-edit-btn { border: 0; background: none; cursor: pointer;',
      '  padding: 0 4px; margin-left: 6px; color: #64748b; vertical-align: middle; }',
      '.' + MARKER + ' .scw-exp-edit-btn:hover { color: #07467c; }',
      '.' + MARKER + ' .scw-exp-editor { display: inline-flex; align-items: center; gap: 6px; }',
      '.' + MARKER + ' .scw-exp-editor input[type=date] { padding: 2px 6px;',
      '  border: 1px solid #cbd5e1; border-radius: 4px; font: inherit; }',
      '.' + MARKER + ' .scw-exp-editor button { padding: 2px 10px; border-radius: 4px;',
      '  border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font: inherit; }',
      '.' + MARKER + ' .scw-exp-editor button.scw-exp-save { background: #07467c;',
      '  border-color: #07467c; color: #fff; }',
      '.' + MARKER + ' .scw-exp-err { color: #b45309; font-size: 11px; margin-left: 8px; }',
      // Expired = loud. Red-tinted row + bold red date + solid EXPIRED pill
      // (red is the error/expired color here, matching .scw-pq-exp--past /
      // .scw-pq-pdf__badge in published-quote-info.js — not a warning amber).
      '.' + MARKER + '.scw-preview-exp--expired { background: #fef2f2 !important;',
      '  box-shadow: inset 4px 0 0 #dc2626; }',
      '.' + MARKER + '.scw-preview-exp--expired .scw-exp-value {',
      '  color: #b91c1c; font-weight: 700; }',
      '.' + MARKER + ' .scw-exp-expired-badge { display: inline-block;',
      '  margin-left: 10px; padding: 4px 12px; background: #dc2626; color: #fff;',
      '  border-radius: 5px; font: 800 13px/1.2 system-ui, sans-serif;',
      '  letter-spacing: 0.08em; text-transform: uppercase;',
      '  vertical-align: middle; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Build a native-looking labeled detail row (with a pencil) ───────
  function buildExpRow(value) {
    injectCss();
    var row = document.createElement('div');
    row.className = 'kn-detail ' + MARKER;
    row.setAttribute('data-scw-preview-exp', '1');

    var label = document.createElement('div');
    label.className = 'kn-detail-label';
    label.style.minWidth = '174px';
    label.style.maxWidth = '174px';
    label.innerHTML = '<span><span class="">Expiration Date</span></span>';

    var body = document.createElement('div');
    body.className = 'kn-detail-body';
    var bSpan = document.createElement('span');
    var bInner = document.createElement('span');
    bInner.className = 'scw-exp-value';
    bInner.textContent = value || '—';
    bSpan.appendChild(bInner);
    body.appendChild(bSpan);

    if (getSowId()) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-exp-edit-btn';
      btn.title = 'Edit expiration date';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 ' +
        '2 22l1.5-5.5z"/></svg>';
      bSpan.appendChild(btn);
    }

    row.appendChild(label);
    row.appendChild(body);
    applyExpiredState(row, value);
    return row;
  }

  // ── Inline editor: date input + Save / Cancel ───────────────────────
  function openEditor(row) {
    var body = row.querySelector('.kn-detail-body');
    if (!body || row.querySelector('.scw-exp-editor')) return;
    var valueEl = row.querySelector('.scw-exp-value');
    var current = valueEl ? valueEl.textContent.trim() : '';
    var sowId = getSowId();
    if (!sowId) return;

    var holder = body.firstChild;             // the display span (value + pencil)
    if (holder) holder.style.display = 'none';

    var ed = document.createElement('span');
    ed.className = 'scw-exp-editor';
    var input = document.createElement('input');
    input.type = 'date';
    input.value = mdyToIso(current) || '';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'scw-exp-save';
    save.textContent = 'Save';
    var err = document.createElement('span');
    err.className = 'scw-exp-err';
    ed.appendChild(input); ed.appendChild(cancel); ed.appendChild(save);
    ed.appendChild(err);
    body.appendChild(ed);
    input.focus();

    function close() {
      if (ed.parentNode) ed.parentNode.removeChild(ed);
      if (holder) holder.style.display = '';
    }
    cancel.addEventListener('click', close);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') save.click();
    });
    save.addEventListener('click', function () {
      var mdy = isoToMdy(input.value);
      if (!mdy) { err.textContent = 'Pick a date.'; return; }
      save.disabled = true;
      save.textContent = 'Saving…';

      function fail(saveErr) {
        err.textContent = saveErr.message || 'Save failed';
        save.disabled = false;
        save.textContent = 'Save';
      }
      function committed() {
        if (valueEl) valueEl.textContent = mdy;
        applyExpiredState(row, mdy);
        close();
        // Refresh the hidden SOW-header details model so the next publish
        // payload (summary.expirationDate reads live views) carries it.
        try {
          var mv = Knack.views[MODEL_VIEW];
          if (mv && mv.model && typeof mv.model.fetch === 'function') {
            mv.model.fetch();
          }
        } catch (e) { /* non-fatal */ }
      }

      var pub = readPublished();
      if (pub) {
        // Published — field_2659 on the proposal record is the date in
        // effect. Write it first; on success mirror field_2135 onto the
        // SOW best-effort (same split as pq-expiration-edit.js). This is
        // the extend-without-republishing path.
        savePublishedExp(pub.recordId, mdy, function (pErr) {
          if (pErr) { fail(pErr); return; }
          saveExpiration(sowId, mdy, function (mErr) {
            if (mErr) {
              console.warn('[scw-preview-exp] field_2135 mirror failed ' +
                '(field_2659 saved) — SOW', sowId, mErr.message);
            }
          });
          patchBlob(pub.recordId, mdy);
          try {
            var pv = Knack.views[PQ_VIEW];
            if (pv && pv.model && typeof pv.model.fetch === 'function') {
              pv.model.fetch();
            }
          } catch (e2) { /* non-fatal */ }
          committed();
        });
      } else {
        // Not published yet — the SOW field is the only copy; it feeds the
        // proposal at publish time.
        saveExpiration(sowId, mdy, function (saveErr) {
          if (saveErr) { fail(saveErr); return; }
          committed();
        });
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.scw-exp-edit-btn');
    if (!btn) return;
    var row = btn.closest('.' + MARKER);
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(row);
  });

  function detailLabelText(item) {
    var lbl = item.querySelector('.kn-detail-label');
    return lbl ? (lbl.textContent || '').replace(/[ \s]+/g, ' ').trim().toLowerCase() : '';
  }
  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  // ── Inject the expiration row into the SOW-identity block ───────────
  function inject() {
    var scene = document.getElementById('kn-' + SCENE_ID);
    if (!scene) return;

    // Published → the proposal's field_2659 is the date in effect (keeps
    // this row agreeing with the blob); otherwise the SOW-side value.
    var pub   = readPublished();
    var value = (pub && pub.expDate) ? String(pub.expDate).trim()
                                     : readExpiration();

    // Idempotent — one expiration row on the scene. If a later data load
    // surfaces a value the placeholder row missed, update it in place
    // (never mid-edit).
    var existing = scene.querySelector('.' + MARKER);
    if (existing) {
      if (value && !existing.querySelector('.scw-exp-editor')) {
        var ve = existing.querySelector('.scw-exp-value');
        if (ve && ve.textContent.trim() !== value) ve.textContent = value;
        applyExpiredState(existing, value);
      }
      return;
    }

    // Without a value the row still renders (as "—") when the SOW id is
    // resolvable, so the pencil stays reachable on blank-expiration SOWs.
    if (!value && !getSowId()) return;

    // Primary anchor: the SW# item (field_2122) inside view_3339. Insert the
    // expiration row right after it, in the same label-column container, so
    // the block reads Name · SW# · Expiration Date.
    var idView = scene.querySelector('#' + ID_VIEW);
    var anchor = idView && isVisible(idView)
      ? idView.querySelector('.' + ANCHOR_FLD)
      : null;

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(buildExpRow(value), anchor.nextSibling);
      return;
    }

    // Fallback anchor: a visible `.kn-detail` labeled "SOW ID" / "Proposal ID"
    // on any scene that surfaces one. Insert the expiration row just before it.
    var items = scene.querySelectorAll('.kn-detail');
    for (var i = 0; i < items.length; i++) {
      if (!isVisible(items[i])) continue;
      var t = detailLabelText(items[i]);
      if (/^expir/.test(t)) return;                 // already present
      if (/^sow\s*id/.test(t) || /^proposal\s*id/.test(t)) {
        if (items[i].parentNode) {
          items[i].parentNode.insertBefore(buildExpRow(value), items[i]);
          return;
        }
      }
    }
  }

  var _t = null;
  function injectSoon() {
    clearTimeout(_t);
    _t = setTimeout(inject, 120);
  }

  function boot() {
    inject();
    // Detail views + their models can land a beat after scene render.
    [200, 600, 1500].forEach(function (ms) { setTimeout(inject, ms); });
  }

  if (window.SCW && SCW.onSceneRender) SCW.onSceneRender(SCENE_ID, boot, NS);
  $(document).off('knack-scene-render.any' + NS).on('knack-scene-render.any' + NS, function () {
    if ((document.body.id || '').indexOf(SCENE_ID) !== -1) boot();
  });
  // Re-inject after any view on the scene re-renders (data refresh, etc.).
  $(document).off('knack-view-render.any' + NS).on('knack-view-render.any' + NS, function () {
    if ((document.body.id || '').indexOf(SCENE_ID) !== -1) injectSoon();
  });
})();
/*** END PROPOSAL PREVIEW — expiration date *********************************/
