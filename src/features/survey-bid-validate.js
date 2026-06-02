/*** FEATURE: Survey worksheet Sub Bid validation (view_3313) *****************
 *
 * Two save-gates fire when the user commits field_2150 (Sub Bid) on
 * the site-survey device worksheet (view_3313):
 *
 *   1. Bid connection is BLANK (field_2415 has no value).
 *      → Modal forces the user to type a survey note explaining why
 *        the row is being bid before it isn't tied to a bid record.
 *        The note is written to field_2412 in the same PUT as the
 *        Sub Bid edit.
 *
 *   2. Sub Bid is being committed as $0.
 *      → Confirmation modal makes sure the user understands "$0" means
 *        "we will do this for free" — NOT "remove from bid". If the
 *        item shouldn't be done, they need to remove it from the bid
 *        instead. Confirm proceeds with the $0 save; cancel reverts.
 *
 * Both gates can fire on the same edit (blank bid + $0 value) — we
 * show them sequentially.
 *
 * Wiring:
 *   - Registers SCW.deviceWorksheet.preSaveHook, called by
 *     handleDirectEditSave in device-worksheet.js before its PUT.
 *   - The hook returns { proceed: bool, extraData?: {field_2412: '...'} }
 *     so the survey note rides along in the same PUT as the Sub Bid
 *     value — single round-trip, no race.
 *
 * Bulk path (Knack/KTL native multi-row edit, mounting-box bulk, etc.)
 * is NOT yet intercepted — those go through their own request paths
 * and would need a separate gate. See TODO at the bottom for the
 * sketch.
 *****************************************************************************/
(function () {
  'use strict';

  if (!window.SCW) window.SCW = {};
  if (!SCW.deviceWorksheet) SCW.deviceWorksheet = {};

  var VIEW_ID    = 'view_3313';
  var BID_CONN   = 'field_2415';   // REL_bid (connection)
  var SUB_BID    = 'field_2150';   // INPUT_sub bid (the gated field)
  var NOTES      = 'field_2412';   // INPUT_survey notes
  var STYLE_ID   = 'scw-survey-bid-validate-css';

  /** Read field_2415 (Bid connection) from the live Knack model. The
   *  worksheet input has already been optimistically updated, but
   *  field_2415 is read-only on this view so the model copy is the
   *  authoritative source. */
  function bidIsBlank(viewId, recordId) {
    try {
      var v = Knack.views && Knack.views[viewId];
      if (!v || !v.model || !v.model.data) return false;
      var rec = (typeof v.model.data.get === 'function')
        ? v.model.data.get(recordId)
        : null;
      if (!rec) return false;
      var attrs = rec.attributes || rec;
      var raw = attrs[BID_CONN + '_raw'];
      if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) return false;
      if (raw && typeof raw === 'object' && raw.id) return false;
      var plain = attrs[BID_CONN];
      if (plain && typeof plain === 'string' && plain.trim()) return false;
      return true;
    } catch (e) { return false; }
  }

  /** Numeric coercion that treats blank/whitespace as null (not 0). */
  function numericOrNull(v) {
    if (v == null) return null;
    var s = String(v).trim().replace(/[$,]/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-svbv-backdrop {',
      '  position: fixed; inset: 0;',
      '  background: rgba(15, 23, 42, 0.55);',
      '  z-index: 100000;',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 20px;',
      '}',
      '.scw-svbv-modal {',
      '  background: #fff; color: #0f172a;',
      '  border-radius: 10px;',
      '  max-width: 480px; width: 100%;',
      '  box-shadow: 0 20px 50px rgba(0,0,0,0.35);',
      '  font: 14px/1.4 system-ui, -apple-system, sans-serif;',
      '  overflow: hidden;',
      '}',
      '.scw-svbv-modal__head {',
      '  padding: 14px 18px;',
      '  background: #b45309; color: #fff;',
      '  font-weight: 700; font-size: 14px;',
      '  display: flex; align-items: center; gap: 8px;',
      '}',
      '.scw-svbv-modal--info .scw-svbv-modal__head { background: #0f4c75; }',
      '.scw-svbv-modal__body { padding: 16px 18px; }',
      '.scw-svbv-modal__body p { margin: 0 0 10px; }',
      '.scw-svbv-modal__body p:last-child { margin-bottom: 0; }',
      '.scw-svbv-modal__body strong { color: #b45309; }',
      '.scw-svbv-modal--info .scw-svbv-modal__body strong { color: #0f4c75; }',
      '.scw-svbv-modal__textarea {',
      '  width: 100%; min-height: 80px;',
      '  padding: 8px 10px;',
      '  border: 1px solid #cbd5e1; border-radius: 6px;',
      '  font: inherit; color: inherit;',
      '  resize: vertical; box-sizing: border-box;',
      '  margin-top: 8px;',
      '}',
      '.scw-svbv-modal__textarea:focus {',
      '  outline: none;',
      '  border-color: #0f4c75;',
      '  box-shadow: 0 0 0 3px rgba(15,76,117,0.15);',
      '}',
      '.scw-svbv-modal__foot {',
      '  padding: 12px 18px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  background: #f8fafc;',
      '}',
      '.scw-svbv-btn {',
      '  padding: 7px 14px; border-radius: 5px;',
      '  font: 600 13px/1.2 system-ui, sans-serif;',
      '  cursor: pointer; border: 1px solid transparent;',
      '}',
      '.scw-svbv-btn--cancel {',
      '  background: #fff; color: #475569; border-color: #cbd5e1;',
      '}',
      '.scw-svbv-btn--cancel:hover { background: #f1f5f9; }',
      '.scw-svbv-btn--ok {',
      '  background: #b45309; color: #fff;',
      '}',
      '.scw-svbv-btn--ok:hover { background: #92400e; }',
      '.scw-svbv-modal--info .scw-svbv-btn--ok { background: #0f4c75; }',
      '.scw-svbv-modal--info .scw-svbv-btn--ok:hover { background: #0c3a5e; }',
      '.scw-svbv-btn:disabled { opacity: 0.5; cursor: not-allowed; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /** Generic modal. Returns a Promise resolving with the user choice.
   *
   * opts.kind        — 'warn' (amber) | 'info' (blue)
   * opts.title       — header text
   * opts.html        — body HTML (will not be escaped — caller controls)
   * opts.withInput   — true → render textarea; promise resolves to its
   *                    value when OK clicked. Empty input disables OK.
   * opts.okLabel     — text for the OK button
   * opts.cancelLabel — text for Cancel
   *
   * Resolves to { ok: bool, value?: string }.
   */
  function showModal(opts) {
    injectStyles();
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'scw-svbv-backdrop';

      var modal = document.createElement('div');
      modal.className = 'scw-svbv-modal' +
        (opts.kind === 'info' ? ' scw-svbv-modal--info' : '');

      var head = document.createElement('div');
      head.className = 'scw-svbv-modal__head';
      head.textContent = opts.title || '';
      modal.appendChild(head);

      var body = document.createElement('div');
      body.className = 'scw-svbv-modal__body';
      body.innerHTML = opts.html || '';
      var textarea = null;
      if (opts.withInput) {
        textarea = document.createElement('textarea');
        textarea.className = 'scw-svbv-modal__textarea';
        textarea.placeholder = opts.inputPlaceholder ||
          'Type a survey note for this item…';
        body.appendChild(textarea);
      }
      modal.appendChild(body);

      var foot = document.createElement('div');
      foot.className = 'scw-svbv-modal__foot';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'scw-svbv-btn scw-svbv-btn--cancel';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'scw-svbv-btn scw-svbv-btn--ok';
      okBtn.textContent = opts.okLabel || 'OK';
      if (opts.withInput) okBtn.disabled = true;
      foot.appendChild(cancelBtn);
      foot.appendChild(okBtn);
      modal.appendChild(foot);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      function close(result) {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close({ ok: false }); }
        if (e.key === 'Enter' && !opts.withInput) { e.preventDefault(); okBtn.click(); }
      }
      document.addEventListener('keydown', onKey, true);

      cancelBtn.addEventListener('click', function () { close({ ok: false }); });
      okBtn.addEventListener('click', function () {
        close({ ok: true, value: textarea ? textarea.value.trim() : '' });
      });
      if (textarea) {
        textarea.addEventListener('input', function () {
          okBtn.disabled = !textarea.value.trim();
        });
        setTimeout(function () { textarea.focus(); }, 30);
      } else {
        setTimeout(function () { okBtn.focus(); }, 30);
      }
    });
  }

  // ── Pre-save hook ─────────────────────────────────────────────

  SCW.deviceWorksheet.preSaveHook = function (ctx) {
    // Only intercept Sub Bid commits on the survey worksheet.
    if (ctx.viewId !== VIEW_ID) return { proceed: true };
    if (ctx.fieldKey !== SUB_BID) return { proceed: true };

    var newNum = numericOrNull(ctx.newValue);
    var extraData = null;

    // Rule 1: bid connection is blank → require a survey note.
    var needNote = bidIsBlank(ctx.viewId, ctx.recordId);
    // Rule 2: Sub Bid being committed as $0 → confirm intent.
    var isZero = (newNum === 0);

    return Promise.resolve()
      .then(function () {
        if (!needNote) return null;
        return showModal({
          kind: 'warn',
          title: 'Survey note required',
          html:
            '<p>This line item is <strong>not yet tied to a bid</strong> ' +
            '(<code>Bid</code> field is blank).</p>' +
            '<p>Before you set a Sub Bid, capture a survey note ' +
            'explaining the context — what was observed, why this ' +
            'value, anything the bidder needs to know.</p>',
          inputPlaceholder: 'e.g. Customer pointed out additional run; ' +
                            'priced 50 ft conduit at $X/ft …',
          withInput: true,
          okLabel: 'Save with note',
          cancelLabel: 'Cancel save'
        }).then(function (r) {
          if (!r.ok) return { abort: true };
          extraData = extraData || {};
          extraData[NOTES] = r.value;
          return null;
        });
      })
      .then(function (early) {
        if (early && early.abort) return { proceed: false };
        if (!isZero) return null;
        return showModal({
          kind: 'info',
          title: 'Confirm $0 Sub Bid',
          html:
            '<p>You\'re setting Sub Bid to <strong>$0</strong>.</p>' +
            '<p>That means <strong>SCW will do this work for free</strong>, ' +
            'not "skip this item." If the item shouldn\'t be done, ' +
            '<strong>remove it from the bid</strong> instead — leaving ' +
            'a $0 line still commits SCW to deliver it at no cost.</p>' +
            '<p>Continue with $0?</p>',
          withInput: false,
          okLabel: 'Yes, $0 is correct',
          cancelLabel: 'Cancel save'
        }).then(function (r) {
          if (!r.ok) return { abort: true };
          return null;
        });
      })
      .then(function (late) {
        if (late && late.abort) return { proceed: false };
        return { proceed: true, extraData: extraData };
      });
  };

  // ── Bid-clear gate (Knack inline picker + KTL bulk edit) ─────
  //
  // The directEdit preSaveHook above only fires for inline-edit fields
  // that flow through device-worksheet.js (Sub Bid). Clearing field_2415
  // (Bid) happens via Knack\'s native connection picker or KTL\'s bulk
  // edit — both fire PUTs through different paths that never reach our
  // hook.
  //
  // We intercept those PUTs at the XHR layer:
  //   1. Detect PUT to view_3313 records with field_2415 transitioning
  //      from set → cleared.
  //   2. Abort the request before it goes to the server.
  //   3. Queue it; debounce ~250ms to batch bulk-edit aborts.
  //   4. Show ONE modal asking for a survey note.
  //   5. On confirm: re-fire each queued PUT with field_2412 added.
  //      Skip rows that already have field_2412 set (don\'t clobber).
  //   6. On cancel: show toast, refetch the view so the picker\'s
  //      optimistic UI reverts to server-side state.

  var BATCH_WINDOW_MS = 250;
  var _gateQueue   = [];
  var _gateTimer   = null;
  var _gateModalOpen = false;

  function isView3313RecordUrl(url) {
    if (!url) return false;
    return /\/views\/view_3313\/records\/[a-f0-9]{24}\b/i.test(url);
  }
  function isWriteMethod(m) {
    if (!m) return false;
    var u = String(m).toUpperCase();
    return u === 'PUT' || u === 'POST' || u === 'PATCH';
  }
  function isFieldCleared(val) {
    if (val == null) return true;
    if (val === '' || val === '[]') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    // Knack sometimes sends URL-encoded JSON like %5B%5D
    if (typeof val === 'string') {
      try {
        var dec = decodeURIComponent(val);
        if (dec === '[]' || dec === '') return true;
        var parsed = JSON.parse(dec);
        if (Array.isArray(parsed) && parsed.length === 0) return true;
      } catch (e) { /* not encoded JSON */ }
    }
    return false;
  }
  function parseBidConnFromBody(body) {
    if (typeof body !== 'string' || !body) return undefined;
    if (body.indexOf(BID_CONN) === -1) return undefined;
    try {
      var p = JSON.parse(body);
      if (p && Object.prototype.hasOwnProperty.call(p, BID_CONN)) return p[BID_CONN];
    } catch (e) { /* not JSON; ignore form-encoded for now */ }
    return undefined;
  }
  function recordIdFromUrl(url) {
    var m = url && url.match(/\/records\/([a-f0-9]{24})\b/i);
    return m ? m[1] : '';
  }
  /** True if the model says field_2415 currently has a value. */
  function bidCurrentlySet(recordId) {
    try {
      var v = Knack.views && Knack.views[VIEW_ID];
      if (!v || !v.model || !v.model.data) return false;
      var rec = (typeof v.model.data.get === 'function') ? v.model.data.get(recordId) : null;
      if (!rec) return false;
      var a   = rec.attributes || rec;
      var raw = a[BID_CONN + '_raw'];
      if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) return true;
      if (raw && typeof raw === 'object' && raw.id) return true;
      return false;
    } catch (e) { return false; }
  }
  /** True if the record already has a survey note we shouldn\'t clobber. */
  function noteAlreadySet(recordId) {
    try {
      var v = Knack.views && Knack.views[VIEW_ID];
      if (!v || !v.model || !v.model.data) return false;
      var rec = (typeof v.model.data.get === 'function') ? v.model.data.get(recordId) : null;
      if (!rec) return false;
      var a = rec.attributes || rec;
      var s = (a[NOTES] || '').toString().trim();
      return !!s;
    } catch (e) { return false; }
  }

  /** Re-fire a queued PUT with field_2412 merged in. */
  function replayWithNote(item, note) {
    try {
      var body = JSON.parse(item.body);
      if (!body || typeof body !== 'object') body = {};
      // Don\'t clobber existing notes — only fill empty ones.
      if (!noteAlreadySet(item.recordId)) {
        body[NOTES] = note;
      }
      $.ajax({
        url:  item.url,
        type: item.method,
        contentType: 'application/json',
        data: JSON.stringify(body),
        headers: item.headers || {},
        success: function () { /* server has the right state now */ },
        error:   function (xhr) {
          console.warn('[scw-survey-bid-validate] replay failed', xhr);
        }
      });
    } catch (e) {
      console.warn('[scw-survey-bid-validate] replay threw', e);
    }
  }

  function refreshView3313() {
    try {
      var v = Knack.views && Knack.views[VIEW_ID];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    } catch (e) { /* ignore */ }
  }

  function processGateQueue() {
    _gateTimer = null;
    if (!_gateQueue.length) return;
    if (_gateModalOpen) {
      // Modal already up — fold any new aborts into the same prompt
      // when the existing modal resolves. Re-schedule to retry.
      _gateTimer = setTimeout(processGateQueue, BATCH_WINDOW_MS);
      return;
    }
    var batch = _gateQueue.splice(0, _gateQueue.length);
    _gateModalOpen = true;
    var n = batch.length;
    showModal({
      kind: 'warn',
      title: n > 1
        ? ('Survey note required (' + n + ' records)')
        : 'Survey note required',
      html:
        '<p>You\'re <strong>removing ' +
        (n > 1 ? n + ' items' : 'an item') +
        ' from the bid</strong>.</p>' +
        '<p>Capture a survey note explaining why — the note will be ' +
        'saved on ' + (n > 1 ? 'each item' : 'the item') +
        ' (existing notes won\'t be overwritten).</p>',
      inputPlaceholder: 'e.g. Item not needed per customer; ' +
                        'duplicate of E-014; etc.',
      withInput: true,
      okLabel: 'Save with note',
      cancelLabel: 'Cancel — restore bid link'
    }).then(function (r) {
      _gateModalOpen = false;
      if (!r.ok) {
        // Aborted PUTs never landed; the model fetch will restore
        // whatever the server still says.
        refreshView3313();
        return;
      }
      for (var i = 0; i < batch.length; i++) replayWithNote(batch[i], r.value);
      // Give the server a moment to land all PUTs then refresh.
      setTimeout(refreshView3313, 600);
    });
  }

  function queueGate(item) {
    _gateQueue.push(item);
    if (_gateTimer) clearTimeout(_gateTimer);
    _gateTimer = setTimeout(processGateQueue, BATCH_WINDOW_MS);
  }

  function shouldGate(method, url, body) {
    if (!isWriteMethod(method)) return false;
    if (!isView3313RecordUrl(url)) return false;
    var incoming = parseBidConnFromBody(body);
    if (incoming === undefined) return false; // field_2415 not in body
    if (!isFieldCleared(incoming)) return false;
    var recordId = recordIdFromUrl(url);
    if (!recordId) return false;
    if (!bidCurrentlySet(recordId)) return false; // already empty, no-op
    return recordId;
  }

  // ── 1. jQuery $.ajaxPrefilter (Knack uses jQuery for inline edits)
  if (typeof $ !== 'undefined' && $.ajaxPrefilter) {
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      try {
        var recordId = shouldGate(options.type, options.url || '', options.data);
        if (!recordId) return;
        queueGate({
          recordId: recordId,
          url:      options.url,
          method:   options.type,
          body:     options.data,
          headers:  options.headers || {}
        });
        // Cancel the original request — we\'ll re-fire with the note
        // attached once the user fills out the modal.
        jqXHR.abort();
      } catch (e) {
        console.warn('[scw-survey-bid-validate] prefilter threw', e);
      }
    });
  }

  // ── 2. XMLHttpRequest.send (covers KTL\'s native XHR bulk edits)
  if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__scwSbvMethod = method;
      this.__scwSbvUrl    = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        var recordId = shouldGate(this.__scwSbvMethod, this.__scwSbvUrl, body);
        if (recordId) {
          queueGate({
            recordId: recordId,
            url:      this.__scwSbvUrl,
            method:   this.__scwSbvMethod,
            body:     typeof body === 'string' ? body : '',
            headers:  {} // headers from native XHR aren\'t easy to read; replay uses jQuery defaults
          });
          this.abort();
          return; // don\'t send the original
        }
      } catch (e) {
        console.warn('[scw-survey-bid-validate] XHR send hook threw', e);
      }
      return origSend.apply(this, arguments);
    };
  }

  // ── TODO: bulk path for field_2150 (Sub Bid) ─────────────────
  // The preSaveHook above gates Sub Bid commits row-by-row. KTL bulk
  // edits that set field_2150 still fire PUTs through XHR and bypass
  // the hook entirely. Same shape as the field_2415 gate could apply,
  // but with the additional $0 check and a more nuanced bulk note
  // rule (apply only to rows with empty field_2412). Holding off
  // until we see how often this happens in practice.

})();
/*** END FEATURE: Survey worksheet Sub Bid validation *************************/
