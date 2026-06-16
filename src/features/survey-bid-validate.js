/*** FEATURE: Bid worksheet validation (view_3313 + view_3505) ***************
 *
 * Save-gates for the bid worksheets. The $0-bid confirm and the
 * remove-from-bid survey-note gate apply to BOTH the site-survey
 * worksheet (view_3313) and the subcontractor bid worksheet (view_3505);
 * the blank-bid note rule stays view_3313-only. See ZERO_CONFIRM_TARGETS
 * and BID_GATE_VIEWS for the per-view wiring.
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

  // Fields where committing a $0 value should trigger the "you're
  // bidding to do this for free — NOT removing it from the bid"
  // confirmation. The survey worksheet's Sub Bid (view_3313/field_2150)
  // and the subcontractor bid worksheet's Labor/bid (view_3505/
  // field_2400) both flow through device-worksheet's directEdit
  // preSaveHook, so a single gate covers both. (The blank-bid survey
  // note rule below stays view_3313-only.)
  var ZERO_CONFIRM_TARGETS = [
    // view_3313 (site-survey worksheet) is no longer a live grid.
    { viewId: 'view_3505', fieldKey: 'field_2400' }
  ];
  function isZeroConfirmTarget(viewId, fieldKey) {
    for (var i = 0; i < ZERO_CONFIRM_TARGETS.length; i++) {
      if (ZERO_CONFIRM_TARGETS[i].viewId === viewId &&
          ZERO_CONFIRM_TARGETS[i].fieldKey === fieldKey) return true;
    }
    return false;
  }

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
        // Prefill with any existing note so the user edits in place
        // rather than starting blank.
        if (opts.inputValue) textarea.value = opts.inputValue;
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
      // Require text for input modals — but a prefilled note already
      // satisfies that, so only disable when empty.
      if (opts.withInput) okBtn.disabled = !(textarea.value && textarea.value.trim());
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
    // The survey worksheet's Sub Bid commit gets BOTH gates (blank-bid
    // note + $0 confirm). Any other configured $0-confirm field (e.g.
    // the subcontractor worksheet's Labor/bid) gets the $0 confirm only.
    var isSurveySubBid = (ctx.viewId === VIEW_ID && ctx.fieldKey === SUB_BID);
    var isZeroTarget   = isZeroConfirmTarget(ctx.viewId, ctx.fieldKey);
    if (!isSurveySubBid && !isZeroTarget) return { proceed: true };

    var newNum = numericOrNull(ctx.newValue);
    var extraData = null;

    // Rule 1 (survey worksheet only): bid connection blank → require note.
    var needNote = isSurveySubBid && bidIsBlank(ctx.viewId, ctx.recordId);
    // Rule 2: bid being committed as $0 → confirm intent.
    var isZero = isZeroTarget && (newNum === 0);

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
          title: 'Confirm $0 bid',
          html:
            '<p>You\'re setting this bid to <strong>$0</strong>.</p>' +
            '<p>That means you\'re committing to <strong>do this item ' +
            'for free</strong> — it does <strong>not</strong> remove it ' +
            'from the bid. If this item shouldn\'t be done, ' +
            '<strong>take it off the bid</strong> instead; a $0 line ' +
            'still commits you to deliver it at no cost.</p>' +
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
  //   1. Detect PUT to a gated bid-worksheet record (view_3313 survey or
  //      view_3505 subcontractor) with field_2415 transitioning from
  //      set → cleared.
  //   2. Abort the request before it goes to the server.
  //   3. Queue it; debounce ~250ms to batch bulk-edit aborts.
  //   4. Show ONE modal asking for a survey note.
  //   5. On confirm: re-fire each queued PUT with field_2412 added.
  //      Skip rows that already have field_2412 set (don\'t clobber).
  //   6. On cancel: show toast, refetch the view so the picker\'s
  //      optimistic UI reverts to server-side state.

  // Views whose records require a survey note when their Bid (field_2415)
  // connection is cleared. Both are device-worksheet bid surfaces sharing
  // the same field keys (field_2415 Bid, field_2412 note).
  // view_3313 (site-survey worksheet) is no longer a live grid.
  var BID_GATE_VIEWS = ['view_3505'];

  var BATCH_WINDOW_MS = 250;
  var _gateQueue   = [];
  var _gateTimer   = null;
  var _gateModalOpen = false;

  /** Return the gated view id this record URL belongs to, or '' if none. */
  function gateViewForUrl(url) {
    if (!url) return '';
    for (var i = 0; i < BID_GATE_VIEWS.length; i++) {
      var v = BID_GATE_VIEWS[i];
      if (new RegExp('/views/' + v + '/records/[a-f0-9]{24}\\b', 'i').test(url)) {
        return v;
      }
    }
    return '';
  }
  function isWriteMethod(m) {
    if (!m) return false;
    var u = String(m).toUpperCase();
    return u === 'PUT' || u === 'POST' || u === 'PATCH';
  }

  // ── TEMP DIAGNOSTICS ─────────────────────────────────────────
  // Flip on to log every write whose body/URL mentions the Bid field or
  // a gated view, across all three transports (fetch / XHR / jQuery), so
  // we can see exactly what the subcontractor portal fires on a bid
  // removal. Turn off (or remove) once the gate is confirmed working.
  var SBV_DIAG = true;
  function bodyToStr(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body); } catch (e) { return String(body); }
  }
  function sbvDiag(tag, method, url, body) {
    if (!SBV_DIAG) return;
    try {
      var s = bodyToStr(body);
      var u = String(url || '');
      // Log any Knack record write, plus anything mentioning the Bid
      // field or a gated view, so an edit-page form submit through a
      // different view still surfaces.
      var isRecordWrite = isWriteMethod(method) && /\/records\//i.test(u);
      if (!isRecordWrite &&
          u.indexOf('view_3505') === -1 &&
          u.indexOf('field_2415') === -1 &&
          s.indexOf(BID_CONN) === -1) return;
      console.log('[scw-sbv-diag] ' + tag, {
        method: method, url: u,
        bodyType: (typeof body), body: s,
        gateView: gateViewForUrl(u),
        bidInBody: parseBidConnFromBody(typeof body === 'string' ? body : s)
      });
    } catch (e) { /* ignore */ }
  }
  // Wrap fetch (Knack's Vue views use it). Log only — no gating yet.
  if (SBV_DIAG && typeof window.fetch === 'function' && !window.__scwSbvFetchWrapped) {
    window.__scwSbvFetchWrapped = true;
    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method) || (input && input.method) || 'GET';
        var body = init && init.body;
        sbvDiag('fetch', method, url, body);
      } catch (e) { /* ignore */ }
      return _origFetch.apply(this, arguments);
    };
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
  /** Normalize a field_2415 value (from a PUT body) into an array of
   *  24-hex bid record ids. Handles arrays of strings/objects, JSON
   *  strings, and URL-encoded JSON. */
  function normalizeBidIds(val) {
    if (val == null) return [];
    if (typeof val === 'string') {
      var s = val.trim();
      if (s === '' || s === '[]') return [];
      // Try plain, then URL-decoded, JSON.
      var parsed = null;
      try { parsed = JSON.parse(s); }
      catch (e) {
        try { parsed = JSON.parse(decodeURIComponent(s)); }
        catch (e2) { parsed = null; }
      }
      if (parsed == null) {
        // Bare 24-hex id string.
        return /^[a-f0-9]{24}$/i.test(s) ? [s] : [];
      }
      val = parsed;
    }
    if (!Array.isArray(val)) val = [val];
    var out = [];
    for (var i = 0; i < val.length; i++) {
      var r = val[i];
      if (!r) continue;
      if (typeof r === 'object') { if (r.id) out.push(r.id); }
      else if (typeof r === 'string' && /^[a-f0-9]{24}$/i.test(r)) out.push(r);
    }
    return out;
  }

  /** The bid (field_2415) record ids currently on this record per the model. */
  function currentBidIds(viewId, recordId) {
    try {
      var v = Knack.views && Knack.views[viewId];
      if (!v || !v.model || !v.model.data) return [];
      var rec = (typeof v.model.data.get === 'function') ? v.model.data.get(recordId) : null;
      if (!rec) return [];
      var a   = rec.attributes || rec;
      return normalizeBidIds(a[BID_CONN + '_raw']);
    } catch (e) { return []; }
  }
  /** True if the record already has a survey note we shouldn\'t clobber. */
  function noteAlreadySet(viewId, recordId) {
    try {
      var v = Knack.views && Knack.views[viewId];
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
      if (!noteAlreadySet(item.viewId, item.recordId)) {
        body[NOTES] = note;
      }
      // Bypass the gate for this replay (it carries the note + still empties
      // the bid). Cleared on complete — prefilter + send both run synchronously
      // within this $.ajax call, so the flag is live for both.
      _replayBypass[item.recordId] = true;
      $.ajax({
        url:  item.url,
        type: item.method,
        contentType: 'application/json',
        data: JSON.stringify(body),
        headers: item.headers || {},
        success: function () { /* server has the right state now */ },
        error:   function (xhr) {
          console.warn('[scw-survey-bid-validate] replay failed', xhr);
        },
        complete: function () { delete _replayBypass[item.recordId]; }
      });
    } catch (e) {
      console.warn('[scw-survey-bid-validate] replay threw', e);
    }
  }

  /** Refetch every gated view that's currently on the page so the
   *  picker's optimistic UI reverts (cancel) or reflects the note PUTs
   *  (confirm). Refetching all gate views is cheap and avoids tracking
   *  which views a batch touched. */
  function refreshGateViews() {
    for (var i = 0; i < BID_GATE_VIEWS.length; i++) {
      try {
        var v = Knack.views && Knack.views[BID_GATE_VIEWS[i]];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) { /* ignore */ }
    }
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
        refreshGateViews();
        return;
      }
      for (var i = 0; i < batch.length; i++) replayWithNote(batch[i], r.value);
      // Give the server a moment to land all PUTs then refresh.
      setTimeout(refreshGateViews, 600);
    });
  }

  function queueGate(item) {
    _gateQueue.push(item);
    if (_gateTimer) clearTimeout(_gateTimer);
    _gateTimer = setTimeout(processGateQueue, BATCH_WINDOW_MS);
  }

  /** Returns { viewId, recordId } when this PUT should be gated, else null.
   *  Gate ONLY when the bid (field_2415) connection is being fully cleared —
   *  i.e. the incoming value is an empty array and the record currently has
   *  at least one bid. Removing one bid while others remain (a multi-bid
   *  array merely shrinking) is intentionally NOT gated. */
  // Records whose next gated PUT is a REPLAY from this gate (already carries
  // the survey note) — must bypass shouldGate, else the replay re-empties the
  // bid while the model still shows the old bids and the modal loops forever.
  // Set before firing the replay, cleared when it settles. NOT consumed on
  // read because BOTH the ajaxPrefilter and the XHR.send hook call shouldGate
  // for the same request.
  var _replayBypass = Object.create(null);

  /** True when a PUT body already carries a non-empty survey note (field_2412).
   *  Such a PUT satisfies the note requirement (a replay, or a caller — e.g.
   *  the v2 bulk edit — that already prompted), so it must NOT be gated. */
  function bodyHasNote(body) {
    var s = (typeof body === 'string') ? body : bodyToStr(body);
    if (!s || s.indexOf(NOTES) === -1) return false;
    var p = null;
    try { p = JSON.parse(s); }
    catch (e) { try { p = JSON.parse(decodeURIComponent(s)); } catch (e2) { p = null; } }
    if (!p || typeof p !== 'object') return false;
    var v = p[NOTES];
    return v != null && String(v).replace(/<[^>]*>/g, '').trim() !== '';
  }

  function shouldGate(method, url, body) {
    if (!isWriteMethod(method)) return null;
    var viewId = gateViewForUrl(url);
    if (!viewId) return null;
    var recordId = recordIdFromUrl(url);
    if (recordId && _replayBypass[recordId]) return null; // replay — don't re-gate
    if (bodyHasNote(body)) return null;                   // already carries a note
    var incoming = parseBidConnFromBody(body);
    if (incoming === undefined) return null; // field_2415 not in body
    if (normalizeBidIds(incoming).length !== 0) return null; // not emptied
    if (!recordId) return null;
    if (!currentBidIds(viewId, recordId).length) return null; // already empty
    return { viewId: viewId, recordId: recordId };
  }

  // ── 1. jQuery $.ajaxPrefilter (Knack uses jQuery for inline edits)
  if (typeof $ !== 'undefined' && $.ajaxPrefilter) {
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      try {
        sbvDiag('jquery', options.type, options.url || '', options.data);
        var gate = shouldGate(options.type, options.url || '', options.data);
        if (!gate) return;
        queueGate({
          viewId:   gate.viewId,
          recordId: gate.recordId,
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
        sbvDiag('xhr', this.__scwSbvMethod, this.__scwSbvUrl, body);
        var gate = shouldGate(this.__scwSbvMethod, this.__scwSbvUrl, body);
        if (gate) {
          queueGate({
            viewId:   gate.viewId,
            recordId: gate.recordId,
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

  // ── 3. knack-cell-update gate (the real path for inline bid edits) ──
  // On the worksheet the Bid (field_2415) is edited via Knack's native
  // inline connection popover. On the Vue-rendered subcontractor grid
  // that save goes over a transport our XHR/ajax/fetch hooks can't see
  // (Knack captured `fetch` before our bundle loaded). But Knack still
  // fires its own knack-cell-update.<viewId> event after the save — the
  // worksheet card already rebuilds off it — so we gate there instead.
  //
  // We keep a per-record cache of the Bid ids primed on view-render;
  // when a gated record's bid array goes fully empty, force a survey
  // note (field_2412). Cancel restores the prior bid connection. The
  // PUT has already hit the server by the time this fires, so "cancel"
  // is a re-PUT of the previous value rather than an abort.
  var _bidCache = Object.create(null);   // recordId -> [bidIds]
  var _bidGateModalOpen = false;
  var _bidOwnPuts = Object.create(null);

  function primeBidCache(viewId) {
    try {
      var v = Knack.views && Knack.views[viewId];
      if (!v || !v.model || !v.model.data) return;
      var models = v.model.data.models || [];
      for (var i = 0; i < models.length; i++) {
        var id = models[i] && models[i].id;
        var a  = (models[i] && (models[i].attributes || models[i])) || null;
        if (id && a) _bidCache[id] = normalizeBidIds(a[BID_CONN + '_raw']);
      }
    } catch (e) { /* ignore */ }
  }

  function putRecord(viewId, recordId, body, done) {
    var url = (window.SCW && typeof SCW.knackRecordUrl === 'function')
      ? SCW.knackRecordUrl(viewId, recordId) : null;
    if (!url || !window.SCW || typeof SCW.knackAjax !== 'function') {
      if (done) done(); return;
    }
    _bidOwnPuts[recordId] = true;
    SCW.knackAjax({
      url: url, type: 'PUT', data: JSON.stringify(body),
      success: function () { delete _bidOwnPuts[recordId]; if (done) done(); },
      error:   function (x) { delete _bidOwnPuts[recordId];
        console.warn('[scw-survey-bid-validate] bid-gate PUT failed', x); if (done) done(); }
    });
  }

  /** Current survey-note (field_2412) text for a record, from the model. */
  function readNoteText(viewId, recordId) {
    try {
      var v = Knack.views && Knack.views[viewId];
      if (!v || !v.model || !v.model.data) return '';
      var rec = (typeof v.model.data.get === 'function') ? v.model.data.get(recordId) : null;
      if (!rec) return '';
      var a = rec.attributes || rec;
      return (a[NOTES] || '').toString().replace(/<[^>]*>/g, '').trim();
    } catch (e) { return ''; }
  }

  function promptBidRemovalNote(viewId, recordId, beforeIds) {
    if (_bidGateModalOpen) return;
    _bidGateModalOpen = true;
    var existing = readNoteText(viewId, recordId);
    showModal({
      kind: 'warn',
      title: 'Survey note required',
      html:
        '<p>You\'re <strong>removing this item from the bid</strong>.</p>' +
        '<p>Add to the survey note explaining why' +
        (existing ? ' — the existing note is shown below; edit or add to it.' : '.') +
        '</p>',
      inputPlaceholder: 'e.g. Item not needed per customer; duplicate; etc.',
      inputValue: existing,
      withInput: true,
      okLabel: 'Save with note',
      cancelLabel: 'Cancel — restore bid'
    }).then(function (r) {
      _bidGateModalOpen = false;
      if (r.ok) {
        // The textarea was prefilled with the existing note, so its
        // value IS the full note — write it verbatim (no re-append).
        var body = {}; body[NOTES] = r.value;
        putRecord(viewId, recordId, body);
      } else {
        // Re-attach the bid the user just removed, then refresh so the
        // grid reflects the restored connection.
        var rbody = {}; rbody[BID_CONN] = beforeIds;
        _bidCache[recordId] = beforeIds;
        putRecord(viewId, recordId, rbody, function () { refreshGateViews(); });
      }
    });
  }

  function onBidCellUpdate(viewId, record) {
    try {
      if (!record || !record.id) return;
      if (_bidOwnPuts[record.id]) return;        // ignore our own writes
      var after  = normalizeBidIds(record[BID_CONN + '_raw']);
      var before = _bidCache[record.id] || [];
      _bidCache[record.id] = after;              // keep cache fresh
      if (before.length === 0) return;           // had no bid → nothing removed
      if (after.length !== 0) return;            // still on a bid → not a full clear
      if (SBV_DIAG) console.log('[scw-sbv] bid emptied → prompting note', { recordId: record.id, before: before });
      promptBidRemovalNote(viewId, record.id, before);
    } catch (e) {
      console.warn('[scw-survey-bid-validate] bid cell-update handler threw', e);
    }
  }

  BID_GATE_VIEWS.forEach(function (vid) {
    $(document)
      .off('knack-view-render.' + vid + '.scwSbvBidCache')
      .on('knack-view-render.' + vid + '.scwSbvBidCache', function () { primeBidCache(vid); });
    $(document)
      .off('knack-cell-update.' + vid + '.scwSbvBidGate')
      .on('knack-cell-update.' + vid + '.scwSbvBidGate', function (e, view, record) {
        onBidCellUpdate(vid, record);
      });
  });

  // ── TODO: bulk path for field_2150 (Sub Bid) ─────────────────
  // The preSaveHook above gates Sub Bid commits row-by-row. KTL bulk
  // edits that set field_2150 still fire PUTs through XHR and bypass
  // the hook entirely. Same shape as the field_2415 gate could apply,
  // but with the additional $0 check and a more nuanced bulk note
  // rule (apply only to rows with empty field_2412). Holding off
  // until we see how often this happens in practice.

  if (SBV_DIAG) {
    try {
      console.log('[scw-sbv] interceptors installed', {
        gateViews: BID_GATE_VIEWS,
        fetchWrapped: !!window.__scwSbvFetchWrapped,
        jqueryPrefilter: (typeof $ !== 'undefined' && !!$.ajaxPrefilter),
        xhrWrapped: (typeof XMLHttpRequest !== 'undefined')
      });
    } catch (e) { /* ignore */ }
  }

})();
/*** END FEATURE: Survey worksheet Sub Bid validation *************************/
