/*** REQUIRE SUB BID — shared write path (accessory modal) ******************
 *
 * The Require Sub Bid flag lives on TWO objects:
 *
 *   · SOW line item   field_2479  (build page view_3962, compare page
 *                                  view_3921). No + a field_2464 parent =
 *                                  a child-only accessory folded under its
 *                                  parent (worksheet-v2 promote rule, the
 *                                  comparison grid's child-only filter).
 *   · bid line item   field_2478  (compare page view_3680 bid records; the
 *                                  sub's bid worksheet view_3505). No locks
 *                                  the sub's Labor input — "no bid needed".
 *
 * The ONE place ops edit it is the accessory edit modal
 * (src/features/accessory-edit-modal.js, build + compare pages), whose
 * Yes / No control calls setFlag() here. This module owns the write:
 *
 *   · a view-based PUT on the existing ajax path with the dropped-write
 *     check (a column that isn't inline-editable on the view comes back
 *     200-but-unchanged; that's reported, not swallowed) + the local model
 *     patch;
 *   · the No → Yes friction copy + confirm modal (the flip changes what
 *     subs must price and pops an attached accessory out as its own row);
 *   · the reconcile-page cascade: a SOW line item going to Yes also sets
 *     Yes on every bid record whose related-SOW-item connection points at
 *     it — wherever the bid view is loaded (only the compare page);
 *   · the surface refresh (worksheet refetch so the fold / promote regroup
 *     happens; comparison grid re-render when mounted).
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var FIELDS = { sow: 'field_2479', bid: 'field_2478' };
  var CSS_ID = 'scw-rsb-css';

  // Label / product keys tried in order — SOW line item, bid (survey) line
  // item, install line item. Only used to NAME records in copy.
  var LABEL_KEYS   = ['field_1950', 'field_2365', 'field_2802', 'field_2801'];
  var PRODUCT_KEYS = ['field_1949', 'field_2379', 'field_1958', 'field_2790'];

  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function clean(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Confirm */
      '.scw-rsb-overlay {',
      '  position: fixed; inset: 0; z-index: 100000; background: rgba(15, 23, 42, .45);',
      '  display: flex; align-items: center; justify-content: center; padding: 16px;',
      '}',
      '.scw-rsb-modal {',
      '  width: 440px; max-width: 100%; background: #fff; border-radius: 10px;',
      '  box-shadow: 0 20px 50px rgba(15, 23, 42, .3); overflow: hidden;',
      '  font: 400 13px/1.45 system-ui, -apple-system, sans-serif; color: #1f2937;',
      '}',
      '.scw-rsb-modal-head { padding: 16px 18px 6px; }',
      '.scw-rsb-modal-title { font: 600 16px/1.3 system-ui, sans-serif; color: #0f172a; }',
      '.scw-rsb-modal-body { padding: 0 18px 12px; color: #334155; }',
      '.scw-rsb-modal-body p { margin: 8px 0 0; }',
      '.scw-rsb-warn {',
      '  display: flex; gap: 8px; align-items: flex-start; margin-top: 10px;',
      '  padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px;',
      '  color: #92400e; font-weight: 500;',
      '}',
      '.scw-rsb-warn svg { flex: 0 0 auto; color: #b45309; margin-top: 1px; }',
      '.scw-rsb-modal-actions {',
      '  display: flex; justify-content: flex-end; gap: 8px; padding: 10px 18px 16px;',
      '}',
      '.scw-rsb-cancel {',
      '  padding: 6px 14px; border-radius: 5px; border: 1px solid #cbd5e1; background: #fff;',
      '  color: #334155; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;',
      '}',
      '.scw-rsb-cancel:hover { background: #f8fafc; }',
      '.scw-rsb-ok {',
      '  padding: 6px 14px; border-radius: 5px; border: 0; background: #b45309;',
      '  color: #fff; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;',
      '}',
      '.scw-rsb-ok:hover { background: #92400e; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Flag reading ─────────────────────────────────────────────────────
  function readFlag(rec, field) {
    if (!rec) return '';
    var raw = rec[field + '_raw'];
    if (raw === true)  return 'Yes';
    if (raw === false) return 'No';
    var v = clean(raw != null && typeof raw !== 'object' ? raw : rec[field]);
    if (/^(yes|true)$/i.test(v)) return 'Yes';
    if (/^(no|false)$/i.test(v)) return 'No';
    return '';
  }
  function isYes(v) { return v === true || /^(yes|true)$/i.test(clean(v)); }
  function isNo(v)  { return v === false || /^(no|false)$/i.test(clean(v)); }

  function readRecords(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        if (!m) continue;
        var a = m.attributes || (typeof m.toJSON === 'function' ? m.toJSON() : null);
        if (a) out.push(a);
      }
      return out;
    } catch (e) { return []; }
  }
  function connIds(rec, field) {
    var raw = rec && rec[field + '_raw'];
    var out = [];
    if (Array.isArray(raw)) { for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id); }
    else if (raw && typeof raw === 'object' && raw.id) out.push(raw.id);
    return out;
  }
  function firstText(rec, keys) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var raw = rec[k + '_raw'];
      var v = '';
      if (Array.isArray(raw) && raw[0]) v = clean(raw[0].identifier || '');
      else if (raw && typeof raw === 'object') v = clean(raw.identifier || '');
      if (!v) v = clean(rec[k]);
      if (v && !/^[a-f0-9]{24}(\s|\b|$)/i.test(v)) return v;
    }
    return '';
  }
  /** "E-003 · Informant Dual Vision" style name for any line-item record. */
  function labelOf(rec) {
    if (!rec) return '';
    var drop = firstText(rec, LABEL_KEYS);
    var prod = firstText(rec, PRODUCT_KEYS);
    if (drop && prod) return drop + ' · ' + prod;
    return prod || drop || '';
  }

  // ── Confirm (the No → Yes friction) ──────────────────────────────────
  // item: { label, sub, promote, parentLabel }
  function confirmCopy(item) {
    var name = item.label === 'This item' || item.label === 'SOW item'
      ? item.sub : item.label + (item.sub ? ' (' + item.sub + ')' : '');
    var body =
      '<p>Subs will have to price this item. It shows as its own line on bids and in ' +
      'the comparison grid, and its labor becomes editable on the sub’s bid worksheet.</p>' +
      (item.promote
        ? '<p>Right now it is attached to <strong>' + esc(item.parentLabel || 'its parent') +
          '</strong> with no bid of its own — after this it gets its own row.</p>'
        : '') +
      '<div class="scw-rsb-warn">' + WARN_SVG +
        '<div>Only do this if you are sure the item should be bid separately.</div>' +
      '</div>';
    return {
      title: 'Require a sub bid for ' + (name || 'this item') + '?',
      body: body, okLabel: 'Set to Yes', cancelLabel: 'Cancel'
    };
  }

  function confirmModal(copy) {
    injectCss();
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'scw-rsb-overlay';
      ov.innerHTML =
        '<div class="scw-rsb-modal" role="dialog" aria-modal="true" aria-label="' + esc(copy.title) + '">' +
          '<div class="scw-rsb-modal-head"><div class="scw-rsb-modal-title">' + esc(copy.title) + '</div></div>' +
          '<div class="scw-rsb-modal-body">' + copy.body + '</div>' +
          '<div class="scw-rsb-modal-actions">' +
            '<button type="button" class="scw-rsb-cancel">' + esc(copy.cancelLabel || 'Cancel') + '</button>' +
            '<button type="button" class="scw-rsb-ok">' + esc(copy.okLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      }
      document.addEventListener('keydown', onKey, true);
      ov.querySelector('.scw-rsb-cancel').addEventListener('click', function () { done(false); });
      ov.querySelector('.scw-rsb-ok').addEventListener('click', function () { done(true); });
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
      setTimeout(function () {
        try { ov.querySelector('.scw-rsb-cancel').focus(); } catch (e) { /* ignore */ }
      }, 20);
    });
  }

  // ── The write ────────────────────────────────────────────────────────
  function viewLabel(viewKey) {
    return viewKey;
  }

  /** One view-based PUT of <field> = value, with the dropped-write check
   *  and the local model patch. Resolves { ok, dropped, status, message,
   *  rec, confirmed } — never rejects. No surface refresh here. */
  function putFlag(viewKey, recordId, field, value) {
    return new Promise(function (resolve) {
      if (!viewKey || !recordId || !field) { resolve({ ok: false, message: 'Nothing to save.' }); return; }
      if (!window.SCW || typeof SCW.knackAjax !== 'function' || typeof SCW.knackRecordUrl !== 'function') {
        resolve({ ok: false, message: 'Save path unavailable.' }); return;
      }
      var body = {}; body[field] = value;
      try {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function (resp) {
            var rec = (resp && resp.record && typeof resp.record === 'object' && resp.record.id)
              ? resp.record : resp;
            // Dropped-write check: 200 but the server still holds the old
            // value → the column isn't inline-editable on this view
            // (Builder), or a rule re-stamped it. Report it, don't pretend.
            var srvRaw = rec && typeof rec === 'object' ? rec[field + '_raw'] : undefined;
            var srvFlag = (srvRaw != null) ? readFlag(rec, field) : '';
            if (srvFlag && srvFlag !== value) {
              console.warn('[scw-rsb] save IGNORED by Knack (200, field unchanged)', {
                viewKey: viewKey, recordId: recordId, field: field, sent: value, resp: resp
              });
              resolve({ ok: false, dropped: true, status: 200, resp: resp,
                message: 'Knack didn’t keep the change — ' + field + ' is probably not an ' +
                  'inline-editable column on ' + viewLabel(viewKey) + ' (Builder).' });
              return;
            }
            var confirmed = (srvRaw != null) ? srvRaw : (value === 'Yes');
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, recordId, rec || {}, field, confirmed);
              }
            } catch (e) { /* ignore */ }
            resolve({ ok: true, status: 200, resp: resp, rec: rec, confirmed: confirmed });
          },
          error: function (xhr) {
            var st = xhr && xhr.status;
            console.warn('[scw-rsb] save failed', { viewKey: viewKey, recordId: recordId, field: field, xhr: xhr });
            resolve({ ok: false, status: st,
              message: 'Save failed' + (st ? ' (' + st + ')' : '') +
                (st === 403 ? ' — no permission to edit this field through ' + viewLabel(viewKey) + '.' : '. Try again.') });
          }
        });
      } catch (e) {
        resolve({ ok: false, message: 'Save failed. Try again.' });
      }
    });
  }

  /** Bid records (view_3680) whose REL_sow Line Item (field_2404) points at
   *  this SOW item and whose own Require Sub Bid (field_2478) isn't Yes. Empty
   *  wherever the bid view isn't loaded (build page). */
  function bidItemsFor(sowItemId) {
    var v1 = (window.SCW.bidReview && window.SCW.bidReview.CONFIG) || {};
    var FK = v1.fieldKeys || {};
    var bidView = v1.viewKey || 'view_3680';
    var relKey  = FK.relatedSowItem || 'field_2404';
    var recs = readRecords(bidView);
    var out = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      if (connIds(r, relKey).indexOf(sowItemId) === -1) continue;
      if (isYes(readFlag(r, FIELDS.bid))) continue;
      out.push({ viewKey: bidView, recordId: r.id, field: FIELDS.bid, label: labelOf(r) || r.id });
    }
    return out;
  }

  /** Reconcile-page rule: when a SOW item goes to Yes, every bid item
   *  associated with it goes to Yes too (the sub's Labor input unlocks on
   *  their bid worksheet only when the BID record's flag is Yes). Runs the
   *  bid PUTs one at a time — a row has a handful of bids, well under the
   *  rate limit — and resolves { attempted, done, failed:[labels] }. */
  function cascadeBids(sowItemId) {
    var targets = bidItemsFor(sowItemId);
    var out = { attempted: targets.length, done: 0, failed: [] };
    var i = 0;
    return new Promise(function (resolve) {
      (function next() {
        if (i >= targets.length) { resolve(out); return; }
        var t = targets[i++];
        putFlag(t.viewKey, t.recordId, t.field, 'Yes').then(function (r) {
          if (r.ok) out.done++; else out.failed.push(t.label);
          next();
        });
      })();
    });
  }

  function refreshSurfaces(item, surface) {
    var wsData = window.SCW.worksheetV2 && window.SCW.worksheetV2.data;
    var brCfg  = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.CONFIG;
    var brData = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data;
    var gridMounted = !!(brCfg && brCfg.mountId && document.getElementById(brCfg.mountId));
    if (surface === 'worksheet') {
      // Grouping can change (a folded accessory becomes its own row) —
      // full refetch + rebuild, not a single-card patch.
      try {
        if (wsData && typeof wsData.refetchAndNotify === 'function') wsData.refetchAndNotify(item.viewKey);
        else if (wsData && typeof wsData.notify === 'function') wsData.notify(item.viewKey);
      } catch (e) { /* ignore */ }
      // The compare page hosts the same worksheet view (view_3921) inside
      // its grid — re-render the grid too when it's mounted.
      try {
        if (gridMounted && brData && typeof brData.notifyDebounced === 'function') brData.notifyDebounced();
      } catch (e) { /* ignore */ }
    } else {
      try {
        if (brData && typeof brData.notifyDebounced === 'function') brData.notifyDebounced();
      } catch (e) { /* ignore */ }
      // A worksheet-v2 panel on the same scene reading this view (the
      // comparison page's SOW-item expand editor) re-renders too.
      try {
        if (wsData && typeof wsData.notify === 'function') wsData.notify(item.viewKey);
      } catch (e) { /* ignore */ }
    }
  }

  /** Set <field> = value ('Yes' | 'No') on one item, then refresh the
   *  surface and — on a SOW item going to Yes with the bid view loaded (the
   *  reconcile page) — cascade Yes to its bid items. Resolves
   *  { ok, dropped, status, message, cascaded, cascadeAttempted, warning }.
   *  item: { kind:'sow'|'bid', viewKey, recordId, field }. surface:
   *  'worksheet' refetches the worksheet view and re-renders a mounted
   *  comparison grid; 'bidReview' re-renders the grid and notifies any
   *  worksheet panel on the same view. */
  function setFlag(item, surface, value) {
    value = (value === 'No') ? 'No' : 'Yes';
    if (!item || !item.viewKey || !item.recordId || !item.field) {
      return Promise.resolve({ ok: false, message: 'Nothing to save.' });
    }
    var wsData = window.SCW.worksheetV2 && window.SCW.worksheetV2.data;
    var audit  = window.SCW.worksheetV2 && window.SCW.worksheetV2.audit;
    var body = {}; body[item.field] = value;
    var prevSnap = null;
    try {
      if (surface === 'worksheet' && audit && typeof audit.enabledFor === 'function' &&
          audit.enabledFor(item.viewKey) && typeof audit.snapshotValues === 'function') {
        prevSnap = audit.snapshotValues(item.viewKey, item.recordId, body);
      }
    } catch (e) { prevSnap = null; }

    return putFlag(item.viewKey, item.recordId, item.field, value).then(function (r) {
      if (!r.ok) return r;
      if (surface === 'worksheet') {
        try {
          if (wsData && typeof wsData.registerPendingWrite === 'function') {
            wsData.registerPendingWrite(item.viewKey, item.recordId, item.field, r.confirmed);
          }
        } catch (e) { /* ignore */ }
        try {
          if (prevSnap && audit && typeof audit.logPut === 'function') {
            var lbls = {}; lbls[item.field] = 'Require Sub Bid';
            audit.logPut(item.viewKey, item.recordId, body, { prevValues: prevSnap, resp: r.resp, labels: lbls });
          }
        } catch (e) { /* ignore */ }
      }
      var cascade = (value === 'Yes' && item.kind === 'sow')
        ? cascadeBids(item.recordId)
        : Promise.resolve({ attempted: 0, done: 0, failed: [] });
      return cascade.then(function (c) {
        refreshSurfaces(item, surface);
        var warning = '';
        if (c.failed.length) {
          warning = 'Saved, but ' + c.failed.length + ' of ' + c.attempted + ' bid item' +
            (c.attempted === 1 ? '' : 's') + ' could not be set to Yes (' + c.failed.join(', ') + ').';
        }
        return { ok: true, status: 200, cascaded: c.done, cascadeAttempted: c.attempted, warning: warning };
      });
    });
  }
  function setYes(item, surface) { return setFlag(item, surface, 'Yes'); }

  window.SCW.requireSubBid = {
    FIELDS:      FIELDS,
    setFlag:     setFlag,
    setYes:      setYes,
    bidItemsFor: bidItemsFor,
    confirm:     confirmModal,
    confirmCopy: confirmCopy,
    readFlag:    readFlag,
    isYes:       isYes,
    isNo:        isNo,
    labelOf:     labelOf
  };
})();
/*** END REQUIRE SUB BID *****************************************************/
