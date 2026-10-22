/*** BID REVIEW V2 — SOW DROP AUDIT (console tool) ***************************
 *
 * Recovery for ClickUp 86bcjbxwp (2026-10-22): until that day the SOW cascade
 * in mirror-connection-sync.js RE-ALIGNED a connected device (camera / reader)
 * to its parent's SOW set whenever the parent (switch / NVR) left a SOW — so
 * taking the switch off SOW A pulled every camera wired to it off A as well.
 * The cameras' bid lines still belong to A, which is why the reconcile grid
 * shows them as "Not on this SOW. On <B>." rows with "+ Add to this SOW
 * (also)". This tool finds those rows and re-adds the items in one go.
 *
 *   SCW.sowAudit.scan()            → console.table + returns the candidates:
 *                                    every "other-SOW" bid line whose item is
 *                                    a CONNECTED device (has a Connected To, or
 *                                    sits in a parent's Connected Devices list)
 *   SCW.sowAudit.scan({ all: true }) → every other-SOW line, connected or not
 *   SCW.sowAudit.restore()         → union-adds each candidate to the SOW its
 *                                    bid line is on (sow-item-tray addToSow:
 *                                    the item KEEPS its other SOWs)
 *   SCW.sowAudit.restore(sowId)    → one SOW only
 *
 * Reads what the reconcile page already loaded (ns.builtState rows + the
 * view_3921 line items); writes through the tray's existing PUT, spaced out.
 * No UI — run from the console on the Reconcile Bids page of each project.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var ITEMS_VIEW = 'view_3921';
  var F = {
    label:            'field_1950',
    product:          'field_1949',
    sow:              'field_2154',
    connectedTo:      'field_2197',
    connectedDevices: 'field_1957'
  };
  var GAP_MS = 400;   // between restore writes — the tray refetches after each

  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function idsOf(raw) {
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id);
    } else if (raw && raw.id) out.push(raw.id);
    return out;
  }
  function namesOf(raw) {
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i]) out.push(plain(raw[i].identifier));
    }
    return out;
  }
  function items() {
    try {
      if (ns.data && typeof ns.data.readRecords === 'function') return ns.data.readRecords(ITEMS_VIEW) || [];
      var v = window.Knack && Knack.views && Knack.views[ITEMS_VIEW];
      var ms = v && v.model && v.model.data && v.model.data.models;
      return (ms || []).map(function (m) { return m.attributes || m; });
    } catch (e) { return []; }
  }
  function noSowId() {
    return (ns.transform && ns.transform.NO_SOW) || '__no_sow__';
  }

  /** Candidates: { sowId, sow, itemId, label, product, itemSows, parentId,
   *  parentLabel, parentOnThisSow, connected }. */
  function scan(opts) {
    opts = opts || {};
    var st = ns.builtState;
    if (!st || !Array.isArray(st.sowGrids)) {
      console.warn('[scw-sow-audit] the reconcile grid has not built yet — open the page, then run again');
      return [];
    }
    var recs = items(), byId = Object.create(null), parentsOf = Object.create(null);
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      byId[r.id] = r;
      var kids = idsOf(r[F.connectedDevices + '_raw']);
      for (var k = 0; k < kids.length; k++) (parentsOf[kids[k]] = parentsOf[kids[k]] || []).push(r.id);
    }
    var out = [], seen = Object.create(null);
    for (var g = 0; g < st.sowGrids.length; g++) {
      var grid = st.sowGrids[g];
      if (!grid || !grid.sowId || grid.sowId === noSowId()) continue;
      var rows = grid.rows || [];
      for (var w = 0; w < rows.length; w++) {
        var row = rows[w];
        if (!row || !row.needsSow || row.otherKind !== 'other-sow' || !row.sowItem) continue;
        var key = grid.sowId + ':' + row.sowItem;
        if (seen[key]) continue;
        seen[key] = true;
        var rec = byId[row.sowItem];
        if (!rec) continue;
        var parentIds = idsOf(rec[F.connectedTo + '_raw']);
        var fromFwd = parentsOf[rec.id] || [];
        for (var f = 0; f < fromFwd.length; f++) if (parentIds.indexOf(fromFwd[f]) === -1) parentIds.push(fromFwd[f]);
        var connected = parentIds.length > 0;
        if (!connected && !opts.all) continue;
        var parent = parentIds.length ? byId[parentIds[0]] : null;
        out.push({
          sowId:           grid.sowId,
          sow:             plain(grid.sowName || grid.sowId),
          itemId:          rec.id,
          label:           plain(rec[F.label]),
          product:         plain(rec[F.product]),
          itemSows:        namesOf(rec[F.sow + '_raw']).join(', '),
          parentId:        parentIds[0] || '',
          parentLabel:     parent ? (plain(parent[F.label]) || plain(parent[F.product])) : (parentIds[0] || ''),
          parentOnThisSow: !!(parent && idsOf(parent[F.sow + '_raw']).indexOf(grid.sowId) !== -1),
          connected:       connected
        });
      }
    }
    if (typeof console.table === 'function') {
      console.table(out.map(function (e) {
        return { SOW: e.sow, item: e.label, product: e.product, 'item is on': e.itemSows,
                 'connected to': e.parentLabel, 'parent on this SOW': e.parentOnThisSow ? 'yes' : 'no' };
      }));
    }
    console.log('[scw-sow-audit] ' + out.length + ' candidate(s)' +
      (opts.all ? '' : ' (connected devices only — scan({ all: true }) for every off-SOW line)') +
      '. SCW.sowAudit.restore(' + (out.length ? '' : 'sowId') + ') re-adds them to the SOW their bid line is on.');
    return out;
  }

  /** Re-add every candidate (or one SOW's) to the SOW its bid line is on —
   *  a UNION write through the tray, one every GAP_MS. Returns the count. */
  function restore(sowId, entries) {
    var tray = window.SCW && window.SCW.sowItemTray;
    if (!tray || typeof tray.addToSow !== 'function') {
      console.warn('[scw-sow-audit] SCW.sowItemTray.addToSow is not available on this page');
      return 0;
    }
    var list = (Array.isArray(entries) ? entries : scan()).filter(function (e) {
      return e && e.itemId && e.sowId && (!sowId || e.sowId === sowId);
    });
    if (!list.length) { console.log('[scw-sow-audit] nothing to restore'); return 0; }
    var i = 0;
    (function next() {
      if (i >= list.length) { console.log('[scw-sow-audit] restore queued for ' + list.length + ' item(s) — the grid refetches as each lands'); return; }
      var e = list[i++];
      var btn = document.createElement('button');
      btn.setAttribute('data-label', '+ Add to this SOW');
      try { tray.addToSow(e.itemId, e.sowId, btn); }
      catch (err) { console.warn('[scw-sow-audit] addToSow threw for ' + e.itemId, err); }
      setTimeout(next, GAP_MS);
    })();
    return list.length;
  }

  ns.sowAudit = { scan: scan, restore: restore, _GAP_MS: GAP_MS };
  window.SCW.sowAudit = ns.sowAudit;
})();
/*** END BID REVIEW V2 — SOW DROP AUDIT **************************************/
