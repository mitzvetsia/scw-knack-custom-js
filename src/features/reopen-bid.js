/*** REOPEN BID — scene_1140 *********************************************
 *
 * Per-row button on the BIDs accordion grid (view_3507) that puts a
 * submitted/locked bid back into an editable state:
 *
 *   1. Sets the bid's status (field_2250) back to "Draft".
 *   2. Unlocks every line item on that bid by setting the finalize
 *      flag (field_2551) to "No" on the survey line-item grid
 *      (view_3505) — this is the same flag device-worksheet.js reads
 *      to lock a whole worksheet row.
 *
 * All updates are client-side view-based PUTs via SCW.knackAjax — no
 * webhook. After the writes land we refetch both views so the grid +
 * worksheets reflect the unlocked state without a manual reload.
 *
 * Sibling to copy from: sub-variant-bid.js (same two views, same
 * column-injection idiom, same data helpers).
 ************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    sceneId:      'scene_1140',
    bidGridView:  'view_3507',   // BIDs accordion table (bid records)
    itemGridView: 'view_3505',   // survey line items / device worksheets

    bidStatusField: 'field_2250', // bid status — set to "Draft"
    lockField:      'field_2551', // line-item finalize/lock flag — set to "No"
    itemBidField:   'field_2415'  // REL_bid on the line item
  };

  var STYLE_ID  = 'scw-reopen-bid-css';
  var COL_FLAG  = 'data-scw-reopen-col';
  var BTN_CLASS = 'scw-reopen-bid-btn';

  // ── STYLES ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      'th[' + COL_FLAG + '], td[' + COL_FLAG + '] {',
      '  white-space: nowrap; text-align: center; padding: 6px 10px;',
      '}',
      '.' + BTN_CLASS + ' {',
      '  appearance: none; cursor: pointer;',
      '  background: #fff; color: #b45309;',
      '  border: 1px solid #d6a35c; border-radius: 4px;',
      '  font: 600 12px/1.2 system-ui, sans-serif;',
      '  padding: 6px 12px; white-space: nowrap;',
      '  transition: background 100ms ease, color 100ms ease;',
      '}',
      '.' + BTN_CLASS + ':hover { background: #b45309; color: #fff; border-color: #b45309; }',
      '.' + BTN_CLASS + '[disabled] { opacity: 0.5; cursor: not-allowed; }',

      '.scw-reopen-overlay {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15,23,42,0.55);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '}',
      '.scw-reopen-card {',
      '  background: #fff; border-radius: 10px;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '  min-width: 420px; max-width: 520px;',
      '  display: flex; flex-direction: column;',
      '}',
      '.scw-reopen-hd {',
      '  padding: 14px 18px; border-bottom: 1px solid #e5e7eb;',
      '  font-size: 15px; font-weight: 700; color: #07467c;',
      '}',
      '.scw-reopen-bd { padding: 16px 18px; color: #1f2937; }',
      '.scw-reopen-bd b { color: #07467c; }',
      '.scw-reopen-ft {',
      '  padding: 12px 18px; border-top: 1px solid #e5e7eb;',
      '  display: flex; justify-content: flex-end; gap: 8px; align-items: center;',
      '}',
      '.scw-reopen-status { font-size: 12px; color: #64748b; margin-right: auto; }',
      '.scw-reopen-status--err { color: #b45309; }',
      '.scw-reopen-btn {',
      '  appearance: none; cursor: pointer; padding: 8px 16px;',
      '  border-radius: 6px; font: 600 13px system-ui, sans-serif;',
      '  border: 1px solid transparent;',
      '}',
      '.scw-reopen-btn--cancel { background: #fff; color: #1f2937; border-color: #d1d5db; }',
      '.scw-reopen-btn--cancel:hover { background: #f3f4f6; }',
      '.scw-reopen-btn--confirm { background: #b45309; color: #fff; border-color: #92400e; }',
      '.scw-reopen-btn--confirm:hover { background: #92400e; }',
      '.scw-reopen-btn[disabled] { opacity: 0.6; cursor: not-allowed; }'
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

  function plainText(s) {
    if (s == null) return '';
    return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readConnIds(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (!raw) return [];
    if (!Array.isArray(raw)) raw = [raw];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r) continue;
      if (typeof r === 'object') { if (r.id) out.push(r.id); }
      else if (typeof r === 'string' && /^[0-9a-f]{24}$/i.test(r)) out.push(r);
    }
    return out;
  }

  function resolveBidLabel(bidId) {
    var models = getModels(CONFIG.bidGridView);
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === bidId) {
        var a = modelAttrs(models[i]);
        return plainText(a.identifier) || bidId.slice(0, 6);
      }
    }
    return bidId.slice(0, 6);
  }

  /** Record ids of every line item on view_3505 connected to bidId. */
  function lineItemIdsForBid(bidId) {
    var items = getModels(CONFIG.itemGridView);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var a = modelAttrs(items[i]);
      if (readConnIds(a, CONFIG.itemBidField).indexOf(bidId) !== -1) {
        out.push(items[i].id);
      }
    }
    return out;
  }

  // ── SAVE ────────────────────────────────────────────────
  /** Promise-wrapped view-based PUT of a single field on one record. */
  function putField(viewId, recordId, fieldKey, value) {
    return new Promise(function (resolve, reject) {
      var data = {};
      data[fieldKey] = value;
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function (resp) {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(viewId, recordId, resp, fieldKey, value);
          }
          resolve(resp);
        },
        error: function (xhr) { reject(xhr); }
      });
    });
  }

  function refetchView(viewKey) {
    return new Promise(function (resolve) {
      try {
        var v = Knack.views[viewKey];
        if (!v || !v.model || typeof v.model.fetch !== 'function') { resolve(); return; }
        var p = v.model.fetch();
        if (p && typeof p.always === 'function') p.always(function () { resolve(); });
        else if (p && typeof p.then === 'function') p.then(resolve, resolve);
        else setTimeout(resolve, 600);
      } catch (e) { resolve(); }
    });
  }

  // ── CONFIRM MODAL ───────────────────────────────────────
  function openReopenModal(bidId) {
    var bidLabel = resolveBidLabel(bidId);
    var itemIds  = lineItemIdsForBid(bidId);

    var overlay = document.createElement('div');
    overlay.className = 'scw-reopen-overlay';
    overlay.innerHTML =
      '<div class="scw-reopen-card">' +
      '  <div class="scw-reopen-hd">Reopen bid ' + escapeHtml(bidLabel) + '?</div>' +
      '  <div class="scw-reopen-bd">' +
      '    This sets the bid status back to <b>Draft</b> and unlocks ' +
           '<b>' + itemIds.length + '</b> line item' + (itemIds.length === 1 ? '' : 's') +
           ' so they can be edited again.' +
      '  </div>' +
      '  <div class="scw-reopen-ft">' +
      '    <span class="scw-reopen-status"></span>' +
      '    <button type="button" class="scw-reopen-btn scw-reopen-btn--cancel">Cancel</button>' +
      '    <button type="button" class="scw-reopen-btn scw-reopen-btn--confirm">Reopen Bid</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(overlay);

    var statusEl  = overlay.querySelector('.scw-reopen-status');
    var cancelBtn = overlay.querySelector('.scw-reopen-btn--cancel');
    var confirmBtn = overlay.querySelector('.scw-reopen-btn--confirm');

    function setStatus(msg, isErr) {
      statusEl.className = 'scw-reopen-status' + (isErr ? ' scw-reopen-status--err' : '');
      statusEl.textContent = msg || '';
    }
    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    confirmBtn.addEventListener('click', function () {
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      setStatus('Reopening…');

      // Bid status first, then unlock every line item. Line-item PUTs
      // run in parallel — each is an independent record write.
      putField(CONFIG.bidGridView, bidId, CONFIG.bidStatusField, 'Draft')
        .then(function () {
          setStatus('Unlocking line items…');
          return Promise.all(itemIds.map(function (id) {
            return putField(CONFIG.itemGridView, id, CONFIG.lockField, 'No');
          }));
        })
        .then(function () {
          setStatus('Done. Refreshing…');
          return Promise.all([
            refetchView(CONFIG.bidGridView),
            refetchView(CONFIG.itemGridView)
          ]);
        })
        .then(function () { setTimeout(close, 500); })
        .catch(function (xhr) {
          var msg = 'Reopen failed — please retry.';
          try { if (xhr && xhr.responseText) console.warn('[scw-reopen-bid]', xhr.responseText); } catch (e) {}
          setStatus(msg, true);
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
        });
    });
  }

  // ── COLUMN INJECTION ────────────────────────────────────
  function injectColumn() {
    var $view = $('#' + CONFIG.bidGridView);
    if (!$view.length) return;
    var $table = $view.find('table').first();
    if (!$table.length) return;

    var $thead = $table.find('thead tr').first();
    if ($thead.length && !$thead.find('th[' + COL_FLAG + ']').length) {
      $thead.append($('<th>').attr(COL_FLAG, '1').text('Reopen'));
    }

    $table.find('tbody tr').each(function () {
      var $tr = $(this);
      if ($tr.find('td[' + COL_FLAG + ']').length) return;
      var recId = $tr.attr('id');
      if (!recId || !/^[0-9a-f]{24}$/i.test(recId)) return;
      var $btn = $('<button type="button">')
        .addClass(BTN_CLASS)
        .text('Reopen Bid')
        .attr('data-bid-id', recId)
        .attr('title', 'Set bid back to Draft and unlock its line items');
      $tr.append($('<td>').attr(COL_FLAG, '1').append($btn));
    });
  }

  // Capture-phase click — survives Knack re-render races.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button.' + BTN_CLASS);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var bidId = btn.getAttribute('data-bid-id');
    if (bidId) openReopenModal(bidId);
  }, true);

  // ── BIND ────────────────────────────────────────────────
  function bind() {
    injectStyles();
    SCW.onSceneRender(CONFIG.sceneId, injectColumn, 'scwReopenBid');
    SCW.onViewRender(CONFIG.bidGridView, injectColumn, 'scwReopenBid');
  }

  if (window.SCW && SCW.onSceneRender) bind();
  else $(document).on('knack-scene-render.any', function () { bind(); });
})();
