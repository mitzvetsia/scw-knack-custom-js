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

  // ── TODO: bulk path ───────────────────────────────────────────
  // Native Knack / KTL bulk edits on view_3313 don\'t flow through
  // handleDirectEditSave — they fire PUTs directly to the API. To
  // gate them with the same two rules:
  //   1. Add a $.ajaxPrefilter (or XHR interceptor — see
  //      chit-bulk-edit-fix.js for the same pattern) that detects
  //      a PUT to view_3313 with field_2150 in the body.
  //   2. Before the PUT fires, scan the affected record ids:
  //        - which have field_2415 blank → collect for the note prompt
  //        - is the field_2150 value 0 → trigger the $0 modal once
  //   3. Show ONE note prompt for all blank-bid rows; apply the note
  //      to field_2412 only on rows where field_2412 is currently
  //      empty (don\'t clobber existing notes).
  //   4. Either chain the PUTs ourselves (modified bodies per row)
  //      or send a single follow-up batch to write field_2412 on the
  //      affected rows after the original bulk edit lands.
  // Holding off until we know which bulk surface (Knack native,
  // KTL, or a custom one we add) is the dominant path in practice.

})();
/*** END FEATURE: Survey worksheet Sub Bid validation *************************/
