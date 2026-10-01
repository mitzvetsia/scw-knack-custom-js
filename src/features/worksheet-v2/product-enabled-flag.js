/*** WORKSHEET V2 — PRODUCT ENABLED FLAG **************************************
 *
 * Clears the "product discontinued" badge after a product change, when the
 * NEW product is confirmed enabled.
 *
 * The badge reads the line item's stored product flag (config `discontinued`,
 * field_2912 on the SOW object — Yes = product still active, No = discontinued).
 * It is a STORED copy stamped from the product, not a formula, so swapping the
 * line item onto a live product leaves it reading No and the ⊘ badge stays.
 *
 * "Confirmed enabled" = the product id is in SCW.productMap — the catalog the
 * Builder snippet fetches at boot filtered to field_956 (Status) = Enabled, and
 * the same list the product picker offers. On a scene without the snippet the
 * map is absent and the picker runs on in-use products only; there we can't
 * confirm anything, so nothing is written (the badge clears on the next stamp).
 *
 * Only a live No is cleared — a record whose flag is blank or already Yes is
 * left alone — and only for objects that carry the field (the survey object's
 * product field_2627 has no flag → skipped). The PUT goes through the view the
 * product was changed on, with the dropped-write check the other flag writers
 * use: a 200 whose record still reads No means the column isn't inline-
 * editable on that view (Builder) — reported in the console, never hidden.
 *
 *   ns.productEnabledFlag.clearIfEnabled({ viewKey, recordId, productId, rec })
 *     → Promise<{ ok, skipped?, dropped?, message? }>
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var TAG = '[scw-ws-v2 product-flag]';

  /** The stored product flag key for a view ('' when that object has none). */
  function fieldFor(viewKey) {
    try {
      var f = ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey);
      return (f && f.discontinued) || '';
    } catch (e) { return ''; }
  }

  /** True only when the flag EXPLICITLY reads No/false (mirrors card.js
   *  isDiscontinued — blank / missing is unknown, not flagged). */
  function readsNo(rec, field) {
    if (!rec || !field) return false;
    var raw = rec[field + '_raw'];
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    if (raw === undefined || raw === null || raw === '') {
      var v = rec[field];
      if (v == null || v === '') return false;
      var s = String(v).replace(/<[^>]*>/g, '').trim().toLowerCase();
      return s === 'no' || s === 'false';
    }
    return false;
  }

  /** true / false when the enabled catalog is loaded, null when it isn't
   *  (no snippet on this scene, or still fetching) — unknown, not "no". */
  function isEnabled(productId) {
    var pmap = window.SCW && window.SCW.productMap;
    if (!productId || !pmap) return null;
    var any = false;
    for (var k in pmap) { if (Object.prototype.hasOwnProperty.call(pmap, k)) { any = true; break; } }
    if (!any) return null;
    return Object.prototype.hasOwnProperty.call(pmap, productId) && !!pmap[productId];
  }

  function clearIfEnabled(o) {
    o = o || {};
    var viewKey = o.viewKey, recordId = o.recordId, productId = o.productId, rec = o.rec;
    return new Promise(function (resolve) {
      var field = fieldFor(viewKey);
      if (!viewKey || !recordId || !field) { resolve({ ok: false, skipped: 'no-field' }); return; }
      if (!readsNo(rec, field))            { resolve({ ok: false, skipped: 'not-flagged' }); return; }
      var en = isEnabled(productId);
      if (en === null) {
        console.warn(TAG + ' enabled catalog (SCW.productMap) not loaded on this scene — ' +
          'leaving ' + field + ' as is on ' + recordId);
        resolve({ ok: false, skipped: 'catalog-absent' }); return;
      }
      if (!en) {
        console.warn(TAG + ' product ' + productId + ' is not in the enabled catalog — ' +
          'badge stays on ' + recordId);
        resolve({ ok: false, skipped: 'not-enabled' }); return;
      }
      if (!window.SCW || typeof SCW.knackAjax !== 'function' || typeof SCW.knackRecordUrl !== 'function') {
        resolve({ ok: false, skipped: 'no-save-path' }); return;
      }
      var body = {}; body[field] = 'Yes';
      try {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function (resp) {
            var srv = (resp && resp.record && typeof resp.record === 'object' && resp.record.id)
              ? resp.record : resp;
            // Dropped-write check: 200 but the server still says No → the
            // column isn't inline-editable on this view (Builder).
            if (srv && typeof srv === 'object' && readsNo(srv, field)) {
              console.warn(TAG + ' save IGNORED by Knack (200, ' + field + ' unchanged) — ' +
                'make ' + field + ' an inline-editable column on ' + viewKey + ' (Builder).',
                { viewKey: viewKey, recordId: recordId, resp: resp });
              resolve({ ok: false, dropped: true, status: 200,
                message: field + ' is probably not inline-editable on ' + viewKey + '.' });
              return;
            }
            var raw = (srv && typeof srv === 'object' && srv[field + '_raw'] != null)
              ? srv[field + '_raw'] : true;
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, recordId, srv || {}, field, raw);
              }
            } catch (e) { /* ignore */ }
            try {
              if (ns.data && typeof ns.data.registerPendingWrite === 'function') {
                ns.data.registerPendingWrite(viewKey, recordId, field, raw);
              }
              if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
                ns.data.refetchAndNotify(viewKey);
              } else if (ns.data && typeof ns.data.notify === 'function') {
                ns.data.notify(viewKey);
              }
            } catch (e2) { /* ignore */ }
            resolve({ ok: true, status: 200, resp: resp });
          },
          error: function (xhr) {
            var st = xhr && xhr.status;
            console.warn(TAG + ' save failed', { viewKey: viewKey, recordId: recordId, field: field, xhr: xhr });
            resolve({ ok: false, status: st,
              message: 'Save failed' + (st ? ' (' + st + ')' : '') + '.' });
          }
        });
      } catch (e3) {
        resolve({ ok: false, message: String(e3 && e3.message || e3) });
      }
    });
  }

  ns.productEnabledFlag = {
    fieldFor:       fieldFor,
    readsNo:        readsNo,
    isEnabled:      isEnabled,
    clearIfEnabled: clearIfEnabled
  };
})();
/*** END WORKSHEET V2 — PRODUCT ENABLED FLAG **********************************/
