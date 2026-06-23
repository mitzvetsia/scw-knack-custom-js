/*** SUBCONTRACTOR VARIANT BID — scene_1140 ********************************
 *
 * Two-button flow that lets a subcontractor present a second bid built
 * off an existing one, with only the line items they choose carried
 * across.  All record creation happens server-side via Make webhooks —
 * this module only collects the user's intent and POSTs the payload.
 *
 *   Feature A — "Create Variant Bid" (per-row button on view_3507)
 *     One new column in the BIDs accordion grid.  Clicking the button
 *     opens a modal listing every line item on that bid, grouped first
 *     by MDF/IDF and then by proposal bucket.  All checkboxes are
 *     preselected by default; the user unchecks anything they don't
 *     want carried over.  Submit fires the BID webhook with
 *     { originating_bid_id, originating_bid_label, line_item_ids: [...] }.
 *
 *   Feature B — "Create Variant" (per-card button on view_3505)
 *     A button on each device-worksheet card.  Clicking it pops a
 *     small dialog with a bid picker (every bid currently on this
 *     SOW).  Submit fires the ITEM webhook with
 *     { source_line_item_id, target_bid_id, fields: { field_XXXX: value, ... } }.
 *
 * Both webhooks are placeholders right now — fill in the URLs in
 * CONFIG below before going live.
 *
 * Sibling features to compare against:
 *   bulk-delete-confirm.js — modal scaffold + capture-phase click flow
 *   bid-revision-inject.js — view_3505 card-injection idiom
 *   qa-popover.js         — popover-style picker on top of cards
 ****************************************************************************/
(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────
  var CONFIG = {
    sceneId:        'scene_1140',
    bidGridView:    'view_3507',   // BIDs accordion table
    itemGridView:   'view_3505',   // Survey line items / device worksheets

    // Make webhook URLs.
    // Bid-level variant (per-bid button on view_3507): full payload
    // with the array of originating line item ids — Make duplicates
    // the bid + clones every selected item.
    bidWebhookUrl:  'https://hook.us1.make.com/hkm5wyfs9o3yljjejukf4e6n6qbfwqq6',
    // Per-line-item variant (per-card button on view_3505): minimal
    // payload — Make pulls the source record server-side and creates
    // a variant attached to the target bid. We don't need to ship
    // the field values since Make has direct Knack access.
    itemWebhookUrl: 'https://hook.us1.make.com/gschofitcabgv81gq0qaed7dxsn2f425',

    // Field keys
    // Bid (BID record on view_3507)
    bidLabelField:    'field_2414',  // BID label (BD-1, BD-2, …) — best-effort; see resolveBidLabel
    // Line item (view_3505 / view_3680 records)
    f: {
      bid:            'field_2415',  // REL_bid
      mdfIdf:         'field_2375',  // MDF/IDF location
      bucket:         'field_2366',  // proposal bucket
      product:        'field_2627',  // REL_product (used as productName-ish fallback)
      productName:    'field_2379',  // STORED_product name
      label:          'field_2365',  // display label (E-003, etc.)
      qty:            'field_2399',
      rate:           'field_2400',
      laborDesc:      'field_2409',
      bidExistCabling:'field_2370',
      bidPlenum:      'field_2371',
      bidExterior:    'field_2372',
      bidDropLength:  'field_2367',
      bidConduit:     'field_2368',
      bidConnDevice:  'field_2380',
      bidConnTo:      'field_2381',
      bidMapConn:     'field_2374',
      notes:          'field_2412',
      sortOrder:      'field_2218'
    }
  };

  // Full set of fields to ship with a per-item variant create.
  // Anything connection-shaped is sent as the connected record id(s) —
  // helpers below normalize this.
  var ITEM_PAYLOAD_FIELDS = [
    'field_2627','field_2379','field_2365','field_2375','field_2366',
    'field_2399','field_2400','field_2409',
    'field_2370','field_2371','field_2372','field_2367','field_2368',
    'field_2380','field_2381','field_2374',
    'field_2412','field_2218'
  ];

  var STYLE_ID = 'scw-svb-css';
  var EVENT_NS = '.scwSubVariantBid';
  var COL_FLAG = 'data-scw-svb-col';
  var BTN_CLASS = 'scw-svb-bid-btn';
  var CARD_BTN_CLASS = 'scw-svb-item-btn';

  // ── STYLES ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Column button (Feature A — view_3507 row action)
      'th[' + COL_FLAG + '], td[' + COL_FLAG + '] {',
      '  white-space: nowrap; text-align: center;',
      '  padding: 6px 10px;',
      '}',
      '.' + BTN_CLASS + ' {',
      '  appearance: none; cursor: pointer;',
      '  background: #07467c; color: #fff;',
      '  border: 1px solid #053659; border-radius: 4px;',
      '  font: 600 12px/1.2 system-ui, sans-serif;',
      '  padding: 6px 12px; white-space: nowrap;',
      '}',
      '.' + BTN_CLASS + ':hover { background: #053659; }',
      '.' + BTN_CLASS + '[disabled] { opacity: 0.5; cursor: not-allowed; }',

      // Per-card button — sits inside the Bid summary group, beneath
      // the bid value. Sized small + subdued so it doesn't compete
      // with the actual data; hover lifts it.
      '.' + CARD_BTN_CLASS + ' {',
      '  display: inline-block; appearance: none; cursor: pointer;',
      '  background: #fff; color: #07467c;',
      '  border: 1px solid #cbd5e1; border-radius: 3px;',
      '  font: 600 9px/1.2 system-ui, sans-serif;',
      '  letter-spacing: 0.04em; text-transform: uppercase;',
      '  padding: 2px 6px; margin: 4px 0 0; white-space: nowrap;',
      '  transition: background 100ms ease, border-color 100ms ease, color 100ms ease;',
      '}',
      '.' + CARD_BTN_CLASS + ':hover {',
      '  background: #eaf2fb; border-color: #07467c; color: #053659;',
      '}',
      // v2 worksheet: the button sits in the card HEADER, stacked directly
      // beneath the Bid summary cell. The wrapper takes the bid cell's grid
      // track; the cell keeps its look and the button sits under it.
      '.scw-svb-bid-stack {',
      '  display: flex; flex-direction: column; align-items: stretch;',
      '  gap: 3px; min-width: 0;',
      '}',
      '.scw-svb-bid-stack .' + CARD_BTN_CLASS + ' {',
      '  align-self: center; text-align: center;',
      '}',

      // Modal scaffold (shared with both features)
      '.scw-svb-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15,23,42,0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-svb-card {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  min-width: 520px; max-width: 720px;',
      '  max-height: 80vh; display: flex; flex-direction: column;',
      '}',
      '.scw-svb-hd {',
      '  padding: 14px 18px; border-bottom: 1px solid #e5e7eb;',
      '  font-size: 15px; font-weight: 700; color: #07467c;',
      '}',
      '.scw-svb-hd .scw-svb-sub {',
      '  display:block; font-weight: 500; font-size: 12px; color: #64748b; margin-top: 2px;',
      '}',
      '.scw-svb-bd {',
      '  flex: 1 1 auto; overflow: auto; padding: 14px 18px;',
      '}',
      '.scw-svb-ft {',
      '  padding: 12px 18px; border-top: 1px solid #e5e7eb;',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  align-items: center;',
      '}',
      '.scw-svb-btn {',
      '  appearance: none; cursor: pointer;',
      '  padding: 8px 16px; border-radius: 6px;',
      '  font: 600 13px system-ui, sans-serif;',
      '  border: 1px solid transparent;',
      '}',
      '.scw-svb-btn--cancel {',
      '  background: #fff; color: #1f2937; border-color: #d1d5db;',
      '}',
      '.scw-svb-btn--cancel:hover { background: #f3f4f6; }',
      '.scw-svb-btn--confirm {',
      '  background: #07467c; color: #fff; border-color: #053659;',
      '}',
      '.scw-svb-btn--confirm:hover { background: #053659; }',
      '.scw-svb-btn[disabled] { opacity: 0.6; cursor: not-allowed; }',
      '.scw-svb-toolbar {',
      '  display: flex; gap: 12px; align-items: center;',
      '  padding-bottom: 8px; margin-bottom: 8px;',
      '  border-bottom: 1px dashed #e5e7eb;',
      '  font-size: 12px; color: #475569;',
      '}',
      '.scw-svb-toolbar a {',
      '  cursor: pointer; color: #07467c; text-decoration: underline;',
      '}',

      // Tree of MDF/IDF → bucket → items
      '.scw-svb-l1 { margin-top: 6px; }',
      '.scw-svb-l1 > .scw-svb-l1-hd {',
      '  font-weight: 700; color: #07467c; padding: 6px 4px;',
      '  border-bottom: 1px solid #cbd5e1; display: flex; align-items: center; gap: 6px;',
      '}',
      '.scw-svb-l2 { margin: 4px 0 4px 16px; }',
      '.scw-svb-l2 > .scw-svb-l2-hd {',
      '  font-weight: 600; color: #334155; padding: 4px;',
      '  display: flex; align-items: center; gap: 6px;',
      '}',
      '.scw-svb-items { margin-left: 22px; }',
      '.scw-svb-item {',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 3px 4px; border-radius: 4px;',
      '  font-size: 13px; color: #1f2937;',
      '}',
      '.scw-svb-item:hover { background: #f8fafc; }',
      '.scw-svb-item .scw-svb-label {',
      '  display: inline-block; min-width: 48px;',
      '  font-weight: 600; color: #07467c;',
      '}',
      '.scw-svb-item .scw-svb-qty {',
      '  margin-left: auto; color: #64748b; font-variant-numeric: tabular-nums;',
      '}',

      // Bid picker (Feature B)
      '.scw-svb-pick-row {',
      '  display: flex; flex-direction: column; gap: 6px; padding: 4px 0;',
      '}',
      '.scw-svb-pick-row label {',
      '  font-weight: 600; color: #334155;',
      '}',
      '.scw-svb-pick-row select {',
      '  padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 4px;',
      '  font-size: 13px; background: #fff;',
      '}',

      // Status banner inside modal
      '.scw-svb-status {',
      '  font-size: 12px; color: #64748b; margin-right: auto;',
      '}',
      '.scw-svb-status--err { color: #b45309; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── DATA HELPERS ────────────────────────────────────────

  function getModels(viewKey) {
    try {
      var v = Knack.views[viewKey];
      if (!v || !v.model || !v.model.data) return [];
      return v.model.data.models || [];
    } catch (e) { return []; }
  }

  function modelAttrs(m) {
    if (!m) return {};
    return m.attributes || (typeof m.toJSON === 'function' ? m.toJSON() : m) || {};
  }

  function findModel(viewKey, recordId) {
    var models = getModels(viewKey);
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === recordId) return models[i];
    }
    return null;
  }

  /** Return array of connection-id strings for a record's field. */
  function readConnIds(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (!raw) return [];
    if (!Array.isArray(raw)) raw = [raw];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r) continue;
      if (typeof r === 'object') {
        if (r.id) out.push(r.id);
      } else if (typeof r === 'string' && /^[0-9a-f]{24}$/i.test(r)) {
        out.push(r);
      }
    }
    return out;
  }

  function readConnPair(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (!raw) return { id: null, label: '' };
    if (Array.isArray(raw)) raw = raw[0];
    if (!raw) return { id: null, label: '' };
    if (typeof raw === 'object') return { id: raw.id || null, label: raw.identifier || '' };
    return { id: String(raw), label: '' };
  }

  /** Strip HTML and trim. Knack often returns rendered HTML for some field reads. */
  function plainText(s) {
    if (s == null) return '';
    return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Best-effort label resolution for a bid record id. Looks at the
   * BIDs view model first; if the label field isn't there falls back
   * to the bid's connected identifier on any line item.
   */
  function resolveBidLabel(bidId) {
    var bm = findModel(CONFIG.bidGridView, bidId);
    if (bm) {
      var ba = modelAttrs(bm);
      var lbl = plainText(ba[CONFIG.bidLabelField]);
      if (lbl) return lbl;
      // try identifier fallback — the record's own identifier
      if (ba.identifier) return plainText(ba.identifier);
    }
    // walk items for an identifier on the bid connection
    var items = getModels(CONFIG.itemGridView);
    for (var i = 0; i < items.length; i++) {
      var a = modelAttrs(items[i]);
      var raw = a[CONFIG.f.bid + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id === bidId && raw[j].identifier) return plainText(raw[j].identifier);
      }
    }
    return bidId.slice(0, 6);
  }

  /** All distinct bids referenced by any line item on view_3505. */
  function listBidsOnSow() {
    var seen = {};
    var out = [];
    // Prefer view_3507's own model so a fresh, on-SOW bid with no
    // items yet still appears in the picker.
    var bidModels = getModels(CONFIG.bidGridView);
    for (var i = 0; i < bidModels.length; i++) {
      var a = modelAttrs(bidModels[i]);
      var id = bidModels[i].id;
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({ id: id, label: plainText(a[CONFIG.bidLabelField]) || a.identifier || id.slice(0,6) });
    }
    // Fall back to items if view_3507 wasn't on this scene render.
    if (!out.length) {
      var items = getModels(CONFIG.itemGridView);
      for (var k = 0; k < items.length; k++) {
        var raw = modelAttrs(items[k])[CONFIG.f.bid + '_raw'];
        if (!Array.isArray(raw)) continue;
        for (var n = 0; n < raw.length; n++) {
          var r = raw[n];
          if (!r || !r.id || seen[r.id]) continue;
          seen[r.id] = true;
          out.push({ id: r.id, label: plainText(r.identifier) || r.id.slice(0,6) });
        }
      }
    }
    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
  }

  /** Items connected to a given bid, normalized for the modal tree. */
  function listItemsForBid(bidId) {
    var items = getModels(CONFIG.itemGridView);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var a = modelAttrs(items[i]);
      var ids = readConnIds(a, CONFIG.f.bid);
      if (ids.indexOf(bidId) === -1) continue;
      var mdf = readConnPair(a, CONFIG.f.mdfIdf);
      var buck = readConnPair(a, CONFIG.f.bucket);
      var prod = readConnPair(a, CONFIG.f.product);
      var name = plainText(a[CONFIG.f.productName]) || prod.label || '(unnamed)';
      out.push({
        id:          items[i].id,
        label:       plainText(a[CONFIG.f.label]) || '',
        productName: name,
        qty:         plainText(a[CONFIG.f.qty]) || '',
        mdfId:       mdf.id || '__none',
        mdfLabel:    mdf.label || '(No MDF/IDF)',
        bucketId:    buck.id || '__none',
        bucketLabel: buck.label || '(No bucket)',
        sortOrder:   parseFloat(plainText(a[CONFIG.f.sortOrder])) || 0
      });
    }
    return out;
  }

  /** Build full field payload for a single line-item id. */
  function buildItemPayload(recordId) {
    var m = findModel(CONFIG.itemGridView, recordId);
    if (!m) return null;
    var a = modelAttrs(m);
    var fields = {};
    for (var i = 0; i < ITEM_PAYLOAD_FIELDS.length; i++) {
      var k = ITEM_PAYLOAD_FIELDS[i];
      var raw = a[k + '_raw'];
      if (raw && Array.isArray(raw)) {
        // Connection field — send array of ids
        var ids = [];
        for (var j = 0; j < raw.length; j++) if (raw[j] && raw[j].id) ids.push(raw[j].id);
        fields[k] = ids;
      } else if (raw && typeof raw === 'object' && raw.id) {
        fields[k] = raw.id;
      } else if (raw != null) {
        fields[k] = raw;
      } else if (a[k] != null) {
        fields[k] = plainText(a[k]);
      } else {
        fields[k] = null;
      }
    }
    return fields;
  }

  // ── WEBHOOK FIRE ────────────────────────────────────────

  // ── POLLING ─────────────────────────────────────────────
  //
  // After webhook submit, Make takes ~5-30s to create the record(s)
  // and write them back to Knack. Rather than blindly waiting a fixed
  // duration and refreshing once, poll the relevant view's model
  // every few seconds and watch for the expected change. Stop the
  // moment we detect it; cap the total wait at MAX_MS to avoid
  // spinning forever on a webhook that silently failed.

  var POLL_INTERVAL_MS = 3000;
  var POLL_MAX_MS      = 90000;

  /** Refetch a view's model and resolve on success/error either way. */
  function refetchView(viewKey) {
    return new Promise(function (resolve) {
      try {
        var v = Knack.views[viewKey];
        if (!v || !v.model || typeof v.model.fetch !== 'function') {
          resolve();
          return;
        }
        var p = v.model.fetch();
        if (p && typeof p.always === 'function') {
          p.always(function () { resolve(); });
        } else if (p && typeof p.then === 'function') {
          p.then(resolve, resolve);
        } else {
          // Backbone returned no thenable — best-effort wait.
          setTimeout(resolve, 600);
        }
      } catch (e) { resolve(); }
    });
  }

  /** Read the set of record ids currently in a view's model. */
  function recordIdsIn(viewKey) {
    try {
      var v = Knack.views[viewKey];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        if (models[i] && models[i].id) out.push(models[i].id);
      }
      return out;
    } catch (e) { return []; }
  }

  /**
   * Poll a view repeatedly until checkFn returns truthy or the
   * timeout elapses. checkFn is called with { elapsed, attempt }
   * after each model.fetch returns.
   *
   * @param {string}   viewKey  — view to refetch each tick
   * @param {function} checkFn  — return truthy when the awaited
   *                              change is detected; we stop polling.
   * @param {function} onTick   — optional, called with elapsed ms
   *                              each iteration so the UI can update
   *                              its progress message.
   * @returns {Promise} resolves { found:true } on detect or
   *                   { found:false, timedOut:true } on cap-out.
   */
  function pollUntil(viewKey, checkFn, onTick) {
    var startedAt = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        refetchView(viewKey).then(function () {
          var elapsed = Date.now() - startedAt;
          try {
            if (checkFn({ elapsed: elapsed })) {
              resolve({ found: true, elapsedMs: elapsed });
              return;
            }
          } catch (e) { /* keep polling on inspect errors */ }
          if (elapsed >= POLL_MAX_MS) {
            resolve({ found: false, timedOut: true, elapsedMs: elapsed });
            return;
          }
          if (typeof onTick === 'function') {
            try { onTick(elapsed); } catch (e) { /* ignore */ }
          }
          setTimeout(tick, POLL_INTERVAL_MS);
        });
      }
      tick();
    });
  }

  // Make's Webhook Response module can hold the HTTP response open
  // until the scenario finishes — up to 5 minutes by default. If the
  // scenario is configured to respond after ALL its work is done,
  // awaiting this fetch IS the completion signal: no polling needed.
  var WEBHOOK_TIMEOUT_MS = 5 * 60 * 1000;

  function postWebhook(url, body) {
    // Native fetch — matches connected-records.js / bulk-add-mounting-
    // box / other working Make webhook callers in this codebase.
    //
    // AbortController gives us a hard ceiling — if Make never responds
    // (network drop, scenario crash, Make outage) we don't hang the
    // modal forever. 5min matches Make's max response-hold window.
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var killTimer = ctrl
      ? setTimeout(function () { ctrl.abort(); }, WEBHOOK_TIMEOUT_MS)
      : null;

    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl ? ctrl.signal : undefined
    }).then(function (resp) {
      if (killTimer) clearTimeout(killTimer);
      if (!resp.ok) throw new Error('Webhook returned ' + resp.status);
      return resp.json().catch(function () { return { ok: true }; });
    }, function (err) {
      if (killTimer) clearTimeout(killTimer);
      throw err;
    });
  }

  /**
   * Tick the modal's status line with an elapsed-time counter while
   * we wait for Make to respond. Returns a stop() function.
   */
  function startElapsedTicker(modal, label) {
    var startedAt = Date.now();
    function paint() {
      var elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatus(modal, label + ' (' + elapsed + 's)');
    }
    paint();
    var id = setInterval(paint, 1000);
    return function stop() { clearInterval(id); };
  }

  // ── MODAL SCAFFOLD ──────────────────────────────────────

  function buildModal(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'scw-svb-overlay';
    var card = document.createElement('div');
    card.className = 'scw-svb-card';
    overlay.appendChild(card);

    var hd = document.createElement('div');
    hd.className = 'scw-svb-hd';
    hd.innerHTML = escapeHtml(opts.title) +
      (opts.subtitle ? '<span class="scw-svb-sub">' + escapeHtml(opts.subtitle) + '</span>' : '');
    card.appendChild(hd);

    var bd = document.createElement('div');
    bd.className = 'scw-svb-bd';
    card.appendChild(bd);

    var ft = document.createElement('div');
    ft.className = 'scw-svb-ft';
    var status = document.createElement('span');
    status.className = 'scw-svb-status';
    ft.appendChild(status);
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scw-svb-btn scw-svb-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    ft.appendChild(cancelBtn);
    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'scw-svb-btn scw-svb-btn--confirm';
    confirmBtn.textContent = opts.confirmText || 'Submit';
    ft.appendChild(confirmBtn);
    card.appendChild(ft);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);

    return {
      overlay: overlay,
      body: bd,
      status: status,
      cancelBtn: cancelBtn,
      confirmBtn: confirmBtn,
      close: close
    };
  }

  function setStatus(modal, msg, isErr) {
    modal.status.className = 'scw-svb-status' + (isErr ? ' scw-svb-status--err' : '');
    modal.status.textContent = msg || '';
  }

  // ── FEATURE A — MODAL ───────────────────────────────────

  /** Group items: { mdfId: { label, sortOrder, buckets: { bucketId: { label, items: [] } } } } */
  function groupForTree(items) {
    var mdfs = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var m = mdfs[it.mdfId];
      if (!m) m = mdfs[it.mdfId] = { label: it.mdfLabel, sortOrder: it.sortOrder, buckets: {} };
      else m.sortOrder = Math.min(m.sortOrder, it.sortOrder);
      var b = m.buckets[it.bucketId];
      if (!b) b = m.buckets[it.bucketId] = { label: it.bucketLabel, sortOrder: it.sortOrder, items: [] };
      else b.sortOrder = Math.min(b.sortOrder, it.sortOrder);
      b.items.push(it);
    }
    return mdfs;
  }

  function renderTree(host, mdfs) {
    var mdfKeys = Object.keys(mdfs).sort(function (a, b) {
      var sa = mdfs[a].sortOrder, sb = mdfs[b].sortOrder;
      if (sa !== sb) return sa - sb;
      return mdfs[a].label.localeCompare(mdfs[b].label);
    });

    mdfKeys.forEach(function (mid) {
      var m = mdfs[mid];
      var l1 = document.createElement('div');
      l1.className = 'scw-svb-l1';

      var l1hd = document.createElement('div');
      l1hd.className = 'scw-svb-l1-hd';
      var l1cb = document.createElement('input');
      l1cb.type = 'checkbox';
      l1cb.checked = true;
      l1cb.setAttribute('data-scope', 'mdf');
      l1hd.appendChild(l1cb);
      var l1label = document.createElement('span');
      l1label.textContent = m.label;
      l1hd.appendChild(l1label);
      l1.appendChild(l1hd);

      var bucketKeys = Object.keys(m.buckets).sort(function (a, b) {
        var sa = m.buckets[a].sortOrder, sb = m.buckets[b].sortOrder;
        if (sa !== sb) return sa - sb;
        return m.buckets[a].label.localeCompare(m.buckets[b].label);
      });

      bucketKeys.forEach(function (bid) {
        var b = m.buckets[bid];
        var l2 = document.createElement('div');
        l2.className = 'scw-svb-l2';

        var l2hd = document.createElement('div');
        l2hd.className = 'scw-svb-l2-hd';
        var l2cb = document.createElement('input');
        l2cb.type = 'checkbox';
        l2cb.checked = true;
        l2cb.setAttribute('data-scope', 'bucket');
        l2hd.appendChild(l2cb);
        var l2label = document.createElement('span');
        l2label.textContent = b.label + ' (' + b.items.length + ')';
        l2hd.appendChild(l2label);
        l2.appendChild(l2hd);

        var items = document.createElement('div');
        items.className = 'scw-svb-items';
        b.items.sort(function (x, y) {
          if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder;
          return (x.label || '').localeCompare(y.label || '');
        });
        b.items.forEach(function (it) {
          var row = document.createElement('label');
          row.className = 'scw-svb-item';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = true;
          cb.value = it.id;
          cb.setAttribute('data-scope', 'item');
          row.appendChild(cb);
          var lbl = document.createElement('span');
          lbl.className = 'scw-svb-label';
          lbl.textContent = it.label || ' ';
          row.appendChild(lbl);
          var name = document.createElement('span');
          name.textContent = it.productName;
          row.appendChild(name);
          if (it.qty) {
            var qty = document.createElement('span');
            qty.className = 'scw-svb-qty';
            qty.textContent = 'qty ' + it.qty;
            row.appendChild(qty);
          }
          items.appendChild(row);
        });
        l2.appendChild(items);

        // L2 toggle — flip all items in this bucket
        l2cb.addEventListener('change', function () {
          var boxes = items.querySelectorAll('input[type=checkbox]');
          for (var i = 0; i < boxes.length; i++) boxes[i].checked = l2cb.checked;
          recomputeParents(host);
        });

        l1.appendChild(l2);
      });

      // L1 toggle — flip everything inside this MDF/IDF
      l1cb.addEventListener('change', function () {
        var boxes = l1.querySelectorAll('input[type=checkbox]');
        for (var i = 0; i < boxes.length; i++) boxes[i].checked = l1cb.checked;
        recomputeParents(host);
      });

      host.appendChild(l1);
    });

    // Wire item-level changes back to L1/L2 indeterminate state.
    host.addEventListener('change', function (e) {
      if (e.target && e.target.getAttribute('data-scope') === 'item') {
        recomputeParents(host);
      }
    });
  }

  function recomputeParents(host) {
    var l1s = host.querySelectorAll('.scw-svb-l1');
    for (var i = 0; i < l1s.length; i++) {
      var l1 = l1s[i];
      var l1cb = l1.querySelector(':scope > .scw-svb-l1-hd > input[type=checkbox]');
      var l2s = l1.querySelectorAll(':scope > .scw-svb-l2');
      var l1All = true, l1Any = false;
      for (var j = 0; j < l2s.length; j++) {
        var l2 = l2s[j];
        var l2cb = l2.querySelector(':scope > .scw-svb-l2-hd > input[type=checkbox]');
        var items = l2.querySelectorAll('input[data-scope="item"]');
        var all = items.length > 0, any = false;
        for (var k = 0; k < items.length; k++) {
          if (items[k].checked) any = true; else all = false;
        }
        l2cb.checked = all;
        l2cb.indeterminate = any && !all;
        if (!all) l1All = false;
        if (any) l1Any = true;
      }
      if (l1cb) {
        l1cb.checked = l1All;
        l1cb.indeterminate = l1Any && !l1All;
      }
    }
  }

  function openBidVariantModal(bidId) {
    var bidLabel = resolveBidLabel(bidId);
    var items = listItemsForBid(bidId);

    var modal = buildModal({
      title: 'Create Variant Bid from ' + bidLabel,
      subtitle: items.length
        ? 'Uncheck any line items you do NOT want carried over to the new bid.'
        : 'No line items found on this bid.',
      confirmText: 'Create Variant Bid'
    });

    if (!items.length) {
      modal.body.innerHTML = '<div style="padding:18px;color:#64748b;">' +
        'This bid has no line items yet. Add items to the bid first, then come back here.</div>';
      modal.confirmBtn.disabled = true;
      return;
    }

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'scw-svb-toolbar';
    toolbar.innerHTML = '<span>' + items.length + ' line item' + (items.length === 1 ? '' : 's') +
      '</span><a data-act="all">Select all</a> · <a data-act="none">Deselect all</a>';
    modal.body.appendChild(toolbar);

    var tree = document.createElement('div');
    modal.body.appendChild(tree);
    renderTree(tree, groupForTree(items));

    toolbar.addEventListener('click', function (e) {
      var t = e.target.closest('a[data-act]');
      if (!t) return;
      var on = t.getAttribute('data-act') === 'all';
      var boxes = tree.querySelectorAll('input[type=checkbox]');
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].checked = on;
        boxes[i].indeterminate = false;
      }
    });

    modal.confirmBtn.addEventListener('click', function () {
      var picked = tree.querySelectorAll('input[data-scope="item"]:checked');
      if (!picked.length) {
        setStatus(modal, 'Select at least one line item.', true);
        return;
      }
      var ids = [];
      for (var i = 0; i < picked.length; i++) ids.push(picked[i].value);

      modal.confirmBtn.disabled = true;
      modal.cancelBtn.disabled = true;
      setStatus(modal, 'Submitting…');

      // Wait on Make's response — the Make scenario holds the HTTP
      // response open until ALL its record creation is done, then
      // returns success. No client-side polling = no mid-cascade
      // view refreshes; the view only updates ONCE after Make
      // signals completion.
      var stopTicker = startElapsedTicker(modal, "We're working on it… Make is processing");

      postWebhook(CONFIG.bidWebhookUrl, {
        type:                   'variant_bid',
        originating_bid_id:     bidId,
        originating_bid_label:  bidLabel,
        line_item_count:        ids.length,
        line_item_ids:          ids
      }).then(function (resp) {
        stopTicker();
        // Optional success check — Make can return {success:false}
        // alongside an error message to mark known-failures. Anything
        // not explicitly false is treated as success (matches the
        // existing pattern in the rest of this codebase).
        if (resp && resp.success === false) {
          var msg = (resp && resp.message) || 'Make reported an error.';
          throw new Error(msg);
        }
        setStatus(modal, 'Done. Refreshing…');
        return Promise.all([
          refetchView(CONFIG.bidGridView),
          refetchView(CONFIG.itemGridView)
        ]);
      }).then(function () {
        setTimeout(function () { modal.close(); }, 600);
      }).catch(function (err) {
        stopTicker();
        var msg = (err && err.message) || 'Submission failed — please retry.';
        setStatus(modal, msg, true);
        modal.confirmBtn.disabled = false;
        modal.cancelBtn.disabled = false;
      });
    });
  }

  // ── FEATURE A — COLUMN INJECTION ────────────────────────

  function injectBidColumn() {
    var $view = $('#' + CONFIG.bidGridView);
    if (!$view.length) return;
    var $table = $view.find('table').first();
    if (!$table.length) return;

    // Header
    var $thead = $table.find('thead tr').first();
    if ($thead.length && !$thead.find('th[' + COL_FLAG + ']').length) {
      var $th = $('<th>').attr(COL_FLAG, '1').text('Variant');
      $thead.append($th);
    }

    // Body rows
    $table.find('tbody tr').each(function () {
      var $tr = $(this);
      if ($tr.find('td[' + COL_FLAG + ']').length) return;
      var recId = $tr.attr('id');
      if (!recId || !/^[0-9a-f]{24}$/i.test(recId)) return;
      var $td = $('<td>').attr(COL_FLAG, '1');
      var $btn = $('<button type="button">')
        .addClass(BTN_CLASS)
        .text('Create Variant Bid')
        .attr('data-bid-id', recId);
      $td.append($btn);
      $tr.append($td);
    });
  }

  // Capture-phase click — survives Knack re-render races
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button.' + BTN_CLASS);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var bidId = btn.getAttribute('data-bid-id');
    if (bidId) openBidVariantModal(bidId);
  }, true);

  // ── FEATURE B — PER-CARD BUTTON ─────────────────────────

  function injectItemButtons() {
    var $view = $('#' + CONFIG.itemGridView);
    if (!$view.length) return;
    $view.find('tr.scw-ws-row').each(function () {
      var $tr = $(this);
      var recId = $tr.attr('id');
      if (!recId || !/^[0-9a-f]{24}$/i.test(recId)) return;
      var $card = $tr.find('.scw-ws-card').first();
      if (!$card.length) return;
      // Skip if our button is already on this card.
      if ($card.find('button.' + CARD_BTN_CLASS).length) return;

      // Anchor inside the Bid summary group. device-worksheet stamps
      // every summary group with data-scw-fields=<fieldKey>; field_
      // 2415 is the Bid connection on view_3505. The group element
      // is `display: flex; flex-direction: column` so appending the
      // button lands it BELOW the label + value, vertically stacked.
      //
      // No .scw-ws-identity fallback — if the bid group isn't built
      // yet (transformView is mid-render), bail and wait for the next
      // 'scw-worksheet-ready' event. Better an absent button than a
      // wrongly-anchored one next to product.
      var anchor = $card[0].querySelector('[data-scw-fields="field_2415"]');
      if (!anchor) return;

      var $btn = $('<button type="button">')
        .addClass(CARD_BTN_CLASS)
        .text('+ Variant')
        .attr('data-item-id', recId)
        .attr('title', 'Send a copy of this line item to another bid');

      anchor.appendChild($btn[0]);
    });
  }

  // ── v2 worksheet path ───────────────────────────────────
  // view_3505 is cut over to worksheet-v2, which renders .scw-ws-v2-card
  // (not v1's tr.scw-ws-row). Inject the same "+ Variant" button into the
  // card HEADER, directly beneath the Bid summary cell (NOT the detail
  // panel) — mirroring the v1 path that anchors inside the bid group. Shown
  // on EVERY card including locked ones (the variant action is independent of
  // the card's own field lock). The summary row is a CSS grid; the Bid cell
  // is one grid track, so wrap it and stack the button below it in-column.
  // The document-level click handler + openItemVariantModal (model-based)
  // work unchanged.
  var V2_PANEL_ID = 'scw-ws-v2-' + CONFIG.itemGridView;
  var BID_STACK_CLASS = 'scw-svb-bid-stack';
  var _v2Mutating = false;
  function injectItemButtonsV2() {
    var container = document.getElementById(V2_PANEL_ID);
    if (!container) return;
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    if (!cards.length) return;
    _v2Mutating = true;
    try {
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var recId = card.getAttribute('data-scw-ws-v2-record');
        if (!recId || !/^[0-9a-f]{24}$/i.test(recId)) continue;
        if (card.querySelector('button.' + CARD_BTN_CLASS)) continue;   // already injected
        // Anchor under the Bid summary cell in the card header. No detail-
        // panel fallback — if the bid cell isn't built yet, bail and let the
        // observer re-fire (better an absent button than a misplaced one).
        var bidCell = card.querySelector('.scw-ws-v2-cell--survey-bid');
        if (!bidCell || !bidCell.parentNode) continue;
        // Wrap the bid cell so the button stacks beneath it within the same
        // grid track (the wrapper takes the bid cell's grid placement).
        var stack = bidCell.parentNode.classList &&
          bidCell.parentNode.classList.contains(BID_STACK_CLASS)
            ? bidCell.parentNode : null;
        if (!stack) {
          stack = document.createElement('div');
          stack.className = BID_STACK_CLASS;
          bidCell.parentNode.insertBefore(stack, bidCell);
          stack.appendChild(bidCell);
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = CARD_BTN_CLASS;
        btn.textContent = '+ Variant';
        btn.setAttribute('data-item-id', recId);
        btn.setAttribute('title', 'Send a copy of this line item to another bid');
        stack.appendChild(btn);
      }
    } finally {
      setTimeout(function () { _v2Mutating = false; }, 0);
    }
  }
  // worksheet-v2 swaps its body innerHTML on every data tick, wiping our
  // buttons; re-inject on any child mutation (ignoring our own writes).
  function installV2Observer() {
    var container = document.getElementById(V2_PANEL_ID);
    if (!container || container.__scwSvbObs) return;
    container.__scwSvbObs = true;
    var body = container.querySelector('.scw-ws-v2-body') || container;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (_v2Mutating || pending) return;
      pending = true;
      setTimeout(function () { pending = false; injectItemButtonsV2(); }, 150);
    });
    obs.observe(body, { childList: true, subtree: true });
  }
  function staggerV2() {
    [50, 250, 750, 2000].forEach(function (d) {
      setTimeout(function () { installV2Observer(); injectItemButtonsV2(); }, d);
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button.' + CARD_BTN_CLASS);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var itemId = btn.getAttribute('data-item-id');
    if (itemId) openItemVariantModal(itemId);
  }, true);

  function openItemVariantModal(itemId) {
    var m = findModel(CONFIG.itemGridView, itemId);
    var a = m ? modelAttrs(m) : {};
    var itemLabel = plainText(a[CONFIG.f.label]) || '';
    var itemName  = plainText(a[CONFIG.f.productName]) || readConnPair(a, CONFIG.f.product).label || '(unnamed)';
    var currentBidIds = readConnIds(a, CONFIG.f.bid);

    var bids = listBidsOnSow();

    var modal = buildModal({
      title: 'Create Variant of ' + (itemLabel ? itemLabel + ' — ' : '') + itemName,
      subtitle: 'Pick the bid this variant should be attached to. ' +
                'Bids this item is already on are marked.',
      confirmText: 'Create Variant'
    });

    if (!bids.length) {
      modal.body.innerHTML = '<div style="padding:18px;color:#64748b;">' +
        'No bids found on this SOW to attach a variant to.</div>';
      modal.confirmBtn.disabled = true;
      return;
    }

    var row = document.createElement('div');
    row.className = 'scw-svb-pick-row';
    row.innerHTML = '<label for="scw-svb-bid-pick">Target bid</label>';
    var sel = document.createElement('select');
    sel.id = 'scw-svb-bid-pick';
    bids.forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      var alreadyOn = currentBidIds.indexOf(b.id) !== -1;
      opt.textContent = b.label + (alreadyOn ? '  (already on this bid)' : '');
      sel.appendChild(opt);
    });
    // Default to the FIRST bid the item isn't already on, if any.
    for (var i = 0; i < sel.options.length; i++) {
      if (currentBidIds.indexOf(sel.options[i].value) === -1) { sel.selectedIndex = i; break; }
    }
    row.appendChild(sel);
    modal.body.appendChild(row);

    modal.confirmBtn.addEventListener('click', function () {
      var targetBidId = sel.value;
      if (!targetBidId) {
        setStatus(modal, 'Pick a target bid.', true);
        return;
      }

      modal.confirmBtn.disabled = true;
      modal.cancelBtn.disabled = true;
      setStatus(modal, 'Creating variant line item…');

      // Wait on Make's response — same await-don't-poll pattern as
      // the bid variant flow. No mid-cascade refreshes of view_3505.
      var stopTicker = startElapsedTicker(modal, "We're working on it… Make is processing");

      // Minimal payload — Make's scenario reads the source record
      // server-side via the Knack API and creates a variant on the
      // target bid. No need to ship the full field map.
      postWebhook(CONFIG.itemWebhookUrl, {
        source_line_item_id: itemId,
        target_bid_id:       targetBidId
      }).then(function (resp) {
        stopTicker();
        if (resp && resp.success === false) {
          var msg = (resp && resp.message) || 'Make reported an error.';
          throw new Error(msg);
        }
        setStatus(modal, 'Done. Refreshing…');
        return refetchView(CONFIG.itemGridView);
      }).then(function () {
        setTimeout(function () { modal.close(); }, 600);
      }).catch(function (err) {
        stopTicker();
        var msg = (err && err.message) || 'Submission failed — please retry.';
        setStatus(modal, msg, true);
        modal.confirmBtn.disabled = false;
        modal.cancelBtn.disabled = false;
      });
    });
  }

  // ── BIND ────────────────────────────────────────────────

  function bind() {
    injectStyles();

    // Scene-wide hook: enhances both views whenever scene_1140 renders.
    SCW.onSceneRender(CONFIG.sceneId, function () {
      injectBidColumn();
      injectItemButtons();   // v1 cards (if any)
      staggerV2();           // v2 worksheet cards
    }, 'scwSubVariantBid');

    // View-specific hooks so re-renders after inline edits don't strip
    // our column or per-card buttons.
    SCW.onViewRender(CONFIG.bidGridView,  injectBidColumn,   'scwSubVariantBid');
    SCW.onViewRender(CONFIG.itemGridView, function () {
      injectItemButtons();   // v1 path (no-op on v2)
      staggerV2();           // v2 path
    }, 'scwSubVariantBid');

    // device-worksheet rebuilds the worksheet cards inside view_3505
    // every time it runs transformView (initial render, inline edits,
    // model refetches, etc.) — that wipes any DOM we injected into
    // those cards. The 'scw-worksheet-ready' CustomEvent fires when
    // the rebuild has settled, so re-inject our per-card button here
    // every time. Without this hook, the button shows up on first
    // render and randomly disappears later — which is the "doesn't
    // show up consistently" complaint.
    document.addEventListener('scw-worksheet-ready', function (e) {
      var viewId = e && e.detail && e.detail.viewId;
      if (viewId !== CONFIG.itemGridView) return;
      injectItemButtons();
    });
  }

  if (window.SCW && SCW.onSceneRender) bind();
  else $(document).on('knack-scene-render.any', function () { bind(); });
})();
