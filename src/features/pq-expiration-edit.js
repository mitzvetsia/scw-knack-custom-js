/*** PUBLISHED QUOTE — inline expiration edit (field_2659) *******************
 *
 * Ports published-proposal-sow-card.js's pencil-edit affordance for the
 * proposal expiration date to OTHER scenes that render the shared
 * SCW.publishedQuoteInfo block (.scw-pq-info). First target: the ops
 * build-SOW page (scene_1085), where ops-review-pill renders the compact
 * block into view_3325's Next Step cell and sow-grid-cards mirrors it
 * into the SOW cards.
 *
 * Every block carries data-proposal-record-id, so the record to write is
 * read straight off the DOM. Handlers are DELEGATED (document-level) —
 * sow-grid-cards clones the cell block into its cards, and clones drop
 * element-bound listeners; delegation makes both copies editable.
 *
 * Save path: view-based PUT of field_2659 through the scene's published-
 * proposal grid (view_3885 on scene_1085) — same SCW.knackAjax +
 * SCW.knackRecordUrl pattern as published-proposal-sow-card.js /
 * ops-review-pill.js. On success every same-record block on the page is
 * patched in place, then the source view refetches so ops-review-pill
 * repaints from fresh data.
 ******************************************************************************/
(function () {
  'use strict';

  var EXP_FIELD = 'field_2659';
  var STYLE_ID  = 'scw-pq-exp-edit-css';
  var NS        = '.scwPqExpEdit';

  // Per-scene enablement:
  //   saveView   = a view on that scene through which the published-proposal
  //                record accepts a field_2659 PUT.
  //   sowExpView = a view on that scene through which the SOW record accepts a
  //                field_2135 PUT — the MIRROR write (field_2135 tracks
  //                field_2659, but on the SOW record, a DIFFERENT record). On
  //                the build-SOW page the SOW grid is view_3325.
  // (scene_1116 is intentionally absent — published-proposal-sow-card.js
  // already owns the editable expiration there.)
  var SCENES = {
    scene_1085: { saveView: 'view_3885', sowExpView: 'view_3325' }
  };

  function sceneCfg() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return (m && SCENES[m[0]]) || null;
  }

  // ── Date helpers (mirror published-proposal-sow-card.js) ───────────
  function toIsoYmd(mdy) {
    var m = String(mdy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return '';
    function pad(n) { return (n.length < 2 ? '0' : '') + n; }
    return m[3] + '-' + pad(m[1]) + '-' + pad(m[2]);
  }
  function toMdy(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return parseInt(m[2], 10) + '/' + parseInt(m[3], 10) + '/' + m[1];
  }

  // ── Styles ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-pq-exp-edit-btn {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 18px; height: 18px; padding: 0; margin-left: 4px;',
      '  border: 1px solid transparent; vertical-align: middle;',
      '  background: transparent; color: #64748b; cursor: pointer;',
      '  border-radius: 4px;',
      '  transition: background 0.12s, color 0.12s, border-color 0.12s;',
      '}',
      '.scw-pq-exp-edit-btn:hover {',
      '  background: #e2e8f0; color: #0f4c75; border-color: #cbd5e1;',
      '}',
      '.scw-pq-exp-edit-btn svg { width: 11px; height: 11px; }',
      '.scw-pq-exp-edit-form {',
      '  display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;',
      '}',
      '.scw-pq-exp-edit-form input[type="date"] {',
      '  font-size: 12px; padding: 2px 5px; border: 1px solid #cbd5e1;',
      '  border-radius: 4px; background: #fff;',
      '}',
      '.scw-pq-exp-edit-form button {',
      '  font-size: 11px; font-weight: 600; padding: 3px 8px;',
      '  border-radius: 4px; cursor: pointer; border: 1px solid transparent;',
      '}',
      '.scw-pq-exp-edit-form .scw-pq-exp-save {',
      '  background: #07467c; color: #fff; border-color: #07467c;',
      '}',
      '.scw-pq-exp-edit-form .scw-pq-exp-cancel {',
      '  background: #fff; color: #475569; border-color: #cbd5e1;',
      '}',
      '.scw-pq-exp-error { color: #b91c1c; font-size: 11px; margin-left: 4px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function pencilSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M12 20h9"></path>' +
           '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>' +
           '</svg>';
  }

  // ── Decorate: add the pencil to every undecorated block ─────────────
  function decorate() {
    if (!sceneCfg()) return;
    injectStyles();
    var exps = document.querySelectorAll(
      '.scw-pq-info[data-proposal-record-id] .scw-pq-exp:not([data-scw-exp-editable])');
    for (var i = 0; i < exps.length; i++) {
      var expEl = exps[i];
      expEl.setAttribute('data-scw-exp-editable', '1');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-pq-exp-edit-btn';
      btn.setAttribute('title', 'Edit expiration date');
      btn.setAttribute('aria-label', 'Edit expiration date');
      btn.innerHTML = pencilSvg();
      expEl.appendChild(btn);
    }
  }

  var _decorateTimer = null;
  function decorateSoon() {
    clearTimeout(_decorateTimer);
    _decorateTimer = setTimeout(decorate, 150);
  }

  // ── Current value: prefer the live model over the rendered text ─────
  function readCurrentMdy(recordId, expEl, saveView) {
    try {
      var v = window.Knack && Knack.views && Knack.views[saveView];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && (models[i].attributes || models[i]);
          if (!a || a.id !== recordId) continue;
          var raw = a[EXP_FIELD + '_raw'];
          if (raw && raw.date_formatted) return String(raw.date_formatted).trim();
          if (raw && raw.date)           return String(raw.date).trim();
          break;
        }
      }
    } catch (e) { /* fall through to text parse */ }
    var m = (expEl.textContent || '').match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    return m ? m[1] : '';
  }

  function saveExpiration(recordId, mdy, saveView, onDone) {
    if (!window.SCW || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      onDone(new Error('SCW API helpers not loaded'));
      return;
    }
    var body = {};
    body[EXP_FIELD] = mdy;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(saveView, recordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function () { onDone(null); },
      error: function (xhr) {
        var status = xhr && xhr.status;
        var msg = 'Save failed' + (status ? ' (HTTP ' + status + ')' : '');
        if (status === 403 || status === 401) {
          msg = 'Save denied (HTTP ' + status + ') — ' + saveView +
                ' needs ' + EXP_FIELD + ' editable (inline edit / update rights).';
        }
        console.warn('[scw-pq-exp-edit] saveExpiration failed:', xhr && xhr.responseText);
        onDone(new Error(msg));
      }
    });
  }

  // After a save: patch every block for this record in place (the card
  // clone AND the table cell), then refetch the source view so the next
  // full repaint uses server truth.
  function applySavedValue(recordId, mdy, saveView) {
    var blocks = document.querySelectorAll(
      '.scw-pq-info[data-proposal-record-id="' + recordId + '"] .scw-pq-exp');
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].textContent = 'Expires: ' + mdy;
      blocks[i].removeAttribute('data-scw-exp-editable');
    }
    decorate();   // re-append pencils to the rewritten elements
    try {
      var v = window.Knack && Knack.views && Knack.views[saveView];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    } catch (e) { /* non-fatal */ }
  }

  // ── Inline editor (delegated) ────────────────────────────────────────
  function openEditor(expEl, recordId, saveView, sowId, sowExpView) {
    if (expEl.querySelector('.scw-pq-exp-edit-form')) return;
    var current = readCurrentMdy(recordId, expEl, saveView);
    var restoreHtml = expEl.innerHTML;

    var form = document.createElement('span');
    form.className = 'scw-pq-exp-edit-form';
    var input = document.createElement('input');
    input.type = 'date';
    input.value = toIsoYmd(current);
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'scw-pq-exp-save';
    save.textContent = 'Save';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'scw-pq-exp-cancel';
    cancel.textContent = 'Cancel';
    var err = document.createElement('span');
    err.className = 'scw-pq-exp-error';

    form.appendChild(input);
    form.appendChild(save);
    form.appendChild(cancel);

    expEl.innerHTML = '';
    expEl.appendChild(form);
    expEl.appendChild(err);
    input.focus();

    function close() { expEl.innerHTML = restoreHtml; }
    cancel.addEventListener('click', function (ev) { ev.stopPropagation(); close(); });
    input.addEventListener('click', function (ev) { ev.stopPropagation(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape')     { ev.stopPropagation(); close(); }
      else if (ev.key === 'Enter') { ev.stopPropagation(); save.click(); }
    });
    save.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var mdy = toMdy(input.value);
      if (!mdy) { err.textContent = 'Pick a valid date.'; return; }
      save.disabled = true; save.textContent = 'Saving…';
      saveExpiration(recordId, mdy, saveView, function (saveErr) {
        if (saveErr) {
          err.textContent = saveErr.message || 'Save failed';
          save.disabled = false; save.textContent = 'Save';
          return;
        }
        applySavedValue(recordId, mdy, saveView);
        // Mirror onto the SOW record's field_2135 (best-effort, non-fatal —
        // the proposal save already landed).
        if (sowId && sowExpView && typeof SCW.mirrorProposalExpToSow === 'function') {
          SCW.mirrorProposalExpToSow(sowId, mdy, sowExpView);
        }
      });
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.scw-pq-exp-edit-btn');
    if (!btn) return;
    var cfg = sceneCfg();
    if (!cfg) return;
    var block = btn.closest('.scw-pq-info[data-proposal-record-id]');
    var expEl = btn.closest('.scw-pq-exp');
    if (!block || !expEl) return;
    e.preventDefault();
    e.stopPropagation();   // don't toggle the SOW card collapse
    // data-sow-record-id is stamped by published-quote-info when the block was
    // built with a SOW context (ops-review-pill); used to mirror field_2135.
    openEditor(expEl, block.getAttribute('data-proposal-record-id'), cfg.saveView,
      block.getAttribute('data-sow-record-id'), cfg.sowExpView);
  }, true);

  // Re-decorate whenever anything re-renders — ops-review-pill rebuilds
  // the cell blocks on every view render and sow-grid-cards re-clones
  // them into the cards; both paths land within the debounce.
  $(document).on('knack-view-render.any' + NS, decorateSoon);
  $(document).on('knack-scene-render.any' + NS, function () {
    decorateSoon();
    setTimeout(decorate, 800);   // catch late card builds
  });
})();
/*** END PUBLISHED QUOTE — inline expiration edit *****************************/
