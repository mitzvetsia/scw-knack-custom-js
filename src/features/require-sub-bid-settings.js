/*** REQUIRE SUB BID — "item settings" gear (build page + bid compare page) **
 *
 * Ops sometimes need to flip a line item to Require Sub Bid = YES — the
 * flag lives on TWO objects:
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
 * Both surfaces treat the flag as read-only today, and it should stay
 * mostly out of reach: flipping it changes what subs must price and can
 * pop an attached accessory out as its own row. So the edit sits behind a
 * small SETTINGS gear (low-opacity until the row is hovered):
 *
 *   gear → "Item settings" popover listing every flag this row owns
 *          (the SOW item · each bid's item · attached accessories still on
 *          No) with its current value → [Set to Yes] → a confirm that
 *          spells out the consequences → view-based PUT → the surface
 *          refreshes (worksheet refetch / comparison-grid re-render).
 *
 * Only the No → Yes direction is offered (that's the ask); the confirm
 * says so. Nothing here reads or writes through Knack's inline editor —
 * the PUT rides SCW.knackAjax like every other worksheet save, with the
 * same dropped-write check (a column that isn't inline-editable on the
 * view comes back 200-but-unchanged; that's reported, not swallowed).
 *
 * Surfaces render the gear themselves via SCW.requireSubBid.gearHtml(spec):
 *   · worksheet-v2/card.js  — build page rows (config requireSubBidSettings)
 *   · bid-review-v2/card.js — the SOW cell of every comparison-grid row
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var FIELDS = { sow: 'field_2479', bid: 'field_2478' };
  var CSS_ID = 'scw-rsb-css';
  var POP_ID = 'scw-rsb-pop';

  // Label / product keys tried in order — SOW line item, bid (survey) line
  // item, install line item. Only used to NAME rows in the popover.
  var LABEL_KEYS   = ['field_1950', 'field_2365', 'field_2802', 'field_2801'];
  var PRODUCT_KEYS = ['field_1949', 'field_2379', 'field_1958', 'field_2790'];

  var GEAR_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06' +
    'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09' +
    'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06' +
    'a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09' +
    'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06' +
    'a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09' +
    'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06' +
    'a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09' +
    'a1.65 1.65 0 0 0-1.51 1z"/></svg>';

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
      /* The gear — quiet until the row / cell is hovered or it has focus. */
      '.scw-rsb-gear {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 20px; height: 20px; padding: 0; margin: 0;',
      '  border: 0; border-radius: 4px; background: transparent;',
      '  color: #64748b; opacity: .35; cursor: pointer;',
      '  transition: opacity 100ms ease, background 100ms ease, color 100ms ease;',
      '}',
      '.scw-rsb-gear:hover, .scw-rsb-gear:focus-visible, .scw-rsb-gear.is-open { opacity: 1; background: #e2e8f0; color: #0f172a; }',
      '.scw-rsb-gear:focus-visible { outline: 2px solid #07467c; outline-offset: 1px; }',
      '.scw-ws-v2-card:hover .scw-rsb-gear, .scw-bid-review-v2__row:hover .scw-rsb-gear { opacity: .8; }',
      /* worksheet-v2 rows: right-edge slot, mirror of the select box on the left */
      '.scw-ws-v2-card--rsb > .scw-ws-v2-row { padding-right: 26px !important; }',
      '.scw-ws-v2-row > .scw-rsb-gear {',
      '  position: absolute; right: 3px; top: 50%; transform: translateY(-50%); z-index: 2;',
      '}',
      '.scw-ws-v2--readonly .scw-rsb-gear, .scw-ws-v2-card--locked .scw-rsb-gear { display: none !important; }',
      /* bid-review-v2 SOW cell: top-right corner of the cell */
      '.scw-bid-review-v2__sow-cell > .scw-rsb-gear { position: absolute; top: 5px; right: 5px; z-index: 2; }',

      /* Popover */
      '#scw-rsb-pop {',
      '  position: fixed; z-index: 99999; width: 360px; max-width: calc(100vw - 16px);',
      '  background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;',
      '  box-shadow: 0 10px 30px rgba(15, 23, 42, .18);',
      '  font: 400 13px/1.4 system-ui, -apple-system, sans-serif; color: #1f2937;',
      '}',
      '.scw-rsb-head {',
      '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
      '  padding: 9px 12px; border-bottom: 1px solid #e2e8f0;',
      '}',
      '.scw-rsb-title { font-weight: 700; font-size: 13px; color: #0f172a; }',
      '.scw-rsb-close {',
      '  border: 0; background: transparent; color: #64748b; cursor: pointer;',
      '  font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px;',
      '}',
      '.scw-rsb-close:hover { background: #f1f5f9; color: #0f172a; }',
      '.scw-rsb-section {',
      '  padding: 6px 12px 2px; font: 700 10px/1.4 system-ui, sans-serif;',
      '  letter-spacing: .06em; text-transform: uppercase; color: #64748b;',
      '}',
      '.scw-rsb-row {',
      '  display: flex; align-items: center; gap: 8px; padding: 7px 12px;',
      '  border-bottom: 1px solid #f1f5f9;',
      '}',
      '.scw-rsb-row:last-of-type { border-bottom: 0; }',
      '.scw-rsb-row-main { flex: 1 1 auto; min-width: 0; }',
      '.scw-rsb-row-label { font-weight: 600; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-rsb-row-sub { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-rsb-val {',
      '  flex: 0 0 auto; padding: 1px 8px; border-radius: 999px; border: 1px solid transparent;',
      '  font: 600 11px/1.6 system-ui, sans-serif;',
      '}',
      '.scw-rsb-val--yes { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }',
      '.scw-rsb-val--no { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }',
      '.scw-rsb-val--unset { background: #fff; color: #94a3b8; border-color: #e2e8f0; }',
      '.scw-rsb-set {',
      '  flex: 0 0 auto; padding: 3px 9px; border-radius: 5px; cursor: pointer;',
      '  background: #fffbeb; color: #92400e; border: 1px solid #f59e0b;',
      '  font: 600 11px/1.4 system-ui, sans-serif; white-space: nowrap;',
      '}',
      '.scw-rsb-set:hover { background: #fef3c7; }',
      '.scw-rsb-set:disabled { opacity: .6; cursor: default; }',
      '.scw-rsb-err { flex: 1 1 100%; font-size: 11px; color: #b91c1c; }',
      '.scw-rsb-empty { padding: 12px; color: #64748b; font-size: 12px; }',
      '.scw-rsb-note {',
      '  display: flex; gap: 6px; align-items: flex-start; padding: 8px 12px 10px;',
      '  font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-rsb-note svg { flex: 0 0 auto; color: #b45309; margin-top: 1px; }',

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
  function findRec(records, id) {
    for (var i = 0; i < records.length; i++) {
      if (records[i] && records[i].id === id) return records[i];
    }
    return null;
  }
  function connId(rec, field) {
    var raw = rec && rec[field + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
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

  // ── Items behind a gear ──────────────────────────────────────────────
  // spec.surface 'worksheet': { viewKey, recordId }
  // spec.surface 'bidReview': { sowViewKey, bidViewKey, sowItemId, bids:[{id,label}] }
  // Attached accessories still on No (folded under the parent — they have no
  // row / gear of their own). `keep` (key → true) holds rows the open popover
  // already shows, so an accessory the user JUST flipped to Yes stays
  // listed as Yes instead of vanishing from under them.
  function accessoryItems(records, parentId, viewKey, parentLabel, keep) {
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var a = records[i];
      if (!a || !a.id || a.id === parentId) continue;
      if (connId(a, 'field_2464') !== parentId) continue;
      var v = readFlag(a, FIELDS.sow);
      var key = 'acc:' + a.id;
      if (!isNo(v) && !(keep && keep[key])) continue;   // Yes/blank accessories are their own row — own gear
      out.push({
        key: key, kind: 'sow', viewKey: viewKey, recordId: a.id,
        field: FIELDS.sow, label: labelOf(a) || 'Accessory',
        sub: isNo(v) ? 'attached accessory · no bid of its own'
                     : 'attached accessory · now bid on its own line',
        value: v, promote: true, parentLabel: parentLabel
      });
    }
    return out;
  }

  function itemsFor(spec, keep) {
    var items = [];
    if (!spec) return items;
    if (spec.surface === 'worksheet') {
      var recs = readRecords(spec.viewKey);
      var rec  = findRec(recs, spec.recordId);
      var lbl  = labelOf(rec) || 'this item';
      if (rec) {
        items.push({
          key: 'sow:' + rec.id, kind: 'sow', viewKey: spec.viewKey, recordId: rec.id,
          field: FIELDS.sow, label: 'This item', sub: lbl,
          value: readFlag(rec, FIELDS.sow), promote: false
        });
      }
      return items.concat(accessoryItems(recs, spec.recordId, spec.viewKey, lbl, keep));
    }
    if (spec.surface === 'bidReview') {
      var sowRecs = spec.sowViewKey ? readRecords(spec.sowViewKey) : [];
      var sowRec  = spec.sowItemId ? findRec(sowRecs, spec.sowItemId) : null;
      var sowLbl  = labelOf(sowRec) || 'this item';
      if (sowRec) {
        items.push({
          key: 'sow:' + sowRec.id, kind: 'sow', viewKey: spec.sowViewKey, recordId: sowRec.id,
          field: FIELDS.sow, label: 'SOW item', sub: sowLbl,
          value: readFlag(sowRec, FIELDS.sow), promote: false
        });
      }
      var bidRecs = spec.bidViewKey ? readRecords(spec.bidViewKey) : [];
      var bids = Array.isArray(spec.bids) ? spec.bids : [];
      for (var b = 0; b < bids.length; b++) {
        if (!bids[b] || !bids[b].id) continue;
        var brec = findRec(bidRecs, bids[b].id);
        items.push({
          key: 'bid:' + bids[b].id, kind: 'bid', viewKey: spec.bidViewKey, recordId: bids[b].id,
          field: FIELDS.bid, label: 'Bid item · ' + (bids[b].label || 'bid'),
          sub: labelOf(brec) || (brec ? '' : 'not loaded on this page'),
          value: readFlag(brec, FIELDS.bid), promote: false
        });
      }
      if (sowRec) items = items.concat(accessoryItems(sowRecs, sowRec.id, spec.sowViewKey, sowLbl, keep));
      return items;
    }
    return items;
  }

  // ── Gear markup (rendered by the surfaces) ───────────────────────────
  function gearHtml(spec) {
    var json;
    try { json = JSON.stringify(spec || {}); } catch (e) { json = '{}'; }
    return '<button type="button" class="scw-rsb-gear" data-scw-rsb-gear="1" ' +
      'data-scw-rsb-spec="' + esc(json) + '" ' +
      'title="Item settings — require sub bid" aria-label="Item settings" aria-haspopup="dialog">' +
      GEAR_SVG + '</button>';
  }

  // ── Confirm ──────────────────────────────────────────────────────────
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
        '<div>Only do this if you are sure the item should be bid separately. ' +
        'You can’t switch it back to No from here.</div>' +
      '</div>';
    return {
      title: 'Require a sub bid for ' + (name || 'this item') + '?',
      body: body, okLabel: 'Set to Yes', cancelLabel: 'Cancel'
    };
  }

  function confirmModal(copy) {
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

  function connIds(rec, field) {
    var raw = rec && rec[field + '_raw'];
    var out = [];
    if (Array.isArray(raw)) { for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id); }
    else if (raw && typeof raw === 'object' && raw.id) out.push(raw.id);
    return out;
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
   *  { ok, dropped, status, message, cascaded, warning }. `surface`:
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

  // ── Popover ──────────────────────────────────────────────────────────
  var _open = null;   // { pop, gear, spec, surface }

  function rowHtml(it) {
    var v = it.value;
    var valCls = isYes(v) ? 'yes' : (isNo(v) ? 'no' : 'unset');
    var valTxt = isYes(v) ? 'Yes' : (isNo(v) ? 'No' : 'Not set');
    return '<div class="scw-rsb-row" data-scw-rsb-row="' + esc(it.key) + '">' +
      '<div class="scw-rsb-row-main">' +
        '<div class="scw-rsb-row-label" title="' + esc(it.label) + '">' + esc(it.label) + '</div>' +
        (it.sub ? '<div class="scw-rsb-row-sub" title="' + esc(it.sub) + '">' + esc(it.sub) + '</div>' : '') +
      '</div>' +
      '<span class="scw-rsb-val scw-rsb-val--' + valCls + '">' + valTxt + '</span>' +
      (isYes(v) ? '' :
        '<button type="button" class="scw-rsb-set" data-scw-rsb-set="' + esc(it.key) + '">Set to Yes</button>') +
    '</div>';
  }

  function renderRows(pop, spec) {
    // Keep every row already on screen (a just-flipped accessory stays
    // listed as Yes rather than dropping out of the list mid-gesture).
    var keep = Object.create(null);
    var prev = pop._scwRsbItems || [];
    for (var p = 0; p < prev.length; p++) keep[prev[p].key] = true;
    var items = itemsFor(spec, keep);
    var html = '';
    if (!items.length) {
      html = '<div class="scw-rsb-empty">Nothing to set here — the record isn’t loaded on this page.</div>';
    } else {
      html += '<div class="scw-rsb-section">Require sub bid</div>';
      for (var i = 0; i < items.length; i++) html += rowHtml(items[i]);
    }
    html += '<div class="scw-rsb-note">' + WARN_SVG +
      '<div>Subs only price items marked <strong>Yes</strong>. Setting an attached accessory ' +
      'to Yes gives it its own line. Changes here can’t be reverted from this menu.</div></div>';
    pop.querySelector('.scw-rsb-body').innerHTML = html;
    pop._scwRsbItems = items;
  }

  function position(pop, gear) {
    var r = gear.getBoundingClientRect();
    var w = pop.offsetWidth || 360;
    var h = pop.offsetHeight || 200;
    var left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    var top  = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  function close() {
    if (!_open) return;
    try { _open.gear.classList.remove('is-open'); } catch (e) { /* ignore */ }
    if (_open.pop.parentNode) _open.pop.parentNode.removeChild(_open.pop);
    _open = null;
  }

  function open(gear) {
    var spec;
    try { spec = JSON.parse(gear.getAttribute('data-scw-rsb-spec') || '{}'); }
    catch (e) { spec = null; }
    if (!spec || !spec.surface) return;
    if (_open && _open.gear === gear) { close(); return; }
    close();
    var pop = document.createElement('div');
    pop.id = POP_ID;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Item settings');
    pop.innerHTML =
      '<div class="scw-rsb-head">' +
        '<div class="scw-rsb-title">Item settings</div>' +
        '<button type="button" class="scw-rsb-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="scw-rsb-body"></div>';
    document.body.appendChild(pop);
    _open = { pop: pop, gear: gear, spec: spec, surface: spec.surface };
    gear.classList.add('is-open');
    renderRows(pop, spec);
    position(pop, gear);
  }

  function onSetClick(btn) {
    if (!_open) return;
    var key = btn.getAttribute('data-scw-rsb-set');
    var items = _open.pop._scwRsbItems || [];
    var item = null;
    for (var i = 0; i < items.length; i++) { if (items[i].key === key) { item = items[i]; break; } }
    if (!item) return;
    var surface = _open.surface;
    var pop = _open.pop;
    confirmModal(confirmCopy(item)).then(function (ok) {
      if (!ok) return;
      var row = pop.querySelector('[data-scw-rsb-row="' + key.replace(/"/g, '\\"') + '"]');
      var b = row && row.querySelector('.scw-rsb-set');
      if (b) { b.disabled = true; b.textContent = 'Saving…'; }
      var old = row && row.querySelector('.scw-rsb-err');
      if (old) old.parentNode.removeChild(old);
      return setYes(item, surface).then(function (res) {
        if (!_open || _open.pop !== pop) return;
        if (res.ok) {
          // Re-read from the (now patched) model so every row reflects truth
          // — including bid items the cascade just flipped.
          renderRows(pop, _open.spec);
          position(pop, _open.gear);
          if (res.warning) {
            var wrow = pop.querySelector('[data-scw-rsb-row="' + key.replace(/"/g, '\\"') + '"]');
            if (wrow) {
              var warn = document.createElement('div');
              warn.className = 'scw-rsb-err';
              warn.textContent = res.warning;
              wrow.appendChild(warn);
            }
          }
          return;
        }
        if (b) { b.disabled = false; b.textContent = 'Set to Yes'; }
        if (row) {
          var err = document.createElement('div');
          err.className = 'scw-rsb-err';
          err.textContent = res.message || 'Save failed.';
          row.appendChild(err);
        }
      });
    });
  }

  function wire() {
    if (document.documentElement.hasAttribute('data-scw-rsb-bound')) return;
    document.documentElement.setAttribute('data-scw-rsb-bound', '1');

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var gear = t.closest('[data-scw-rsb-gear]');
      if (gear) {
        e.preventDefault();
        e.stopPropagation();
        open(gear);
        return;
      }
      if (!_open) return;
      var setBtn = t.closest('[data-scw-rsb-set]');
      if (setBtn && _open.pop.contains(setBtn)) {
        e.preventDefault();
        e.stopPropagation();
        onSetClick(setBtn);
        return;
      }
      if (t.closest('.scw-rsb-close')) { e.preventDefault(); e.stopPropagation(); close(); return; }
      // Anything else inside the popover (or the confirm) keeps it open.
      if (_open.pop.contains(t) || t.closest('.scw-rsb-overlay')) return;
      close();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !_open) return;
      if (document.querySelector('.scw-rsb-overlay')) return;   // the confirm owns Escape
      close();
    }, true);
  }

  window.SCW.requireSubBid = {
    FIELDS:      FIELDS,
    gearHtml:    gearHtml,
    itemsFor:    itemsFor,
    open:        open,
    close:       close,
    setYes:      setYes,
    setFlag:     setFlag,
    bidItemsFor: bidItemsFor,
    confirm:     confirmModal,
    readFlag:    readFlag,
    isYes:       isYes,
    isNo:        isNo,
    labelOf:     labelOf,
    confirmCopy: confirmCopy,
    isOpen:      function () { return !!_open; }
  };

  injectCss();
  wire();
})();
/*** END REQUIRE SUB BID — ITEM SETTINGS *************************************/
