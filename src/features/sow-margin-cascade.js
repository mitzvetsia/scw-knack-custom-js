/*** SOW MARGIN CASCADE — bid review page (scene_1155) ************************
 *
 * Sets the install-fee margin (field_2152) on every line item of a SOW from
 * one control in that SOW's header on the bid comparison grid.
 *
 * WHY THE MARGIN LIVES ON THE LINE ITEM, NOT THE SOW:
 *   field_2152 is what the install-fee equations (field_2151 / field_2028)
 *   actually read, so it IS the source of truth. A SOW-level copy would be a
 *   second denormalized number to keep aligned — the same trap documented for
 *   field_1957/field_2197 in CLAUDE.md. So there is no SOW margin field: the
 *   control DERIVES the SOW's margin from the items it owns and reports
 *   "mixed" when they disagree. Writing cascades the value down.
 *
 * THE SHARED-ITEM PROBLEM (the reason this file exists):
 *   A line item connects to one or MORE SOWs via field_2154 — on a live
 *   project 30 of 104 items sat on both SW-1187 and SW-1285. Those items hold
 *   ONE margin, so two SOWs cannot price them differently, and a naive
 *   cascade lets whichever SOW was saved last silently reprice the other's
 *   items. Rather than pick a rule, the override modal names the blast radius
 *   and makes the user choose:
 *     - Independent only — items owned solely by this SOW. No cross-SOW
 *       effect. The safe default (pre-selected).
 *     - All items — includes shared ones, which changes what the OTHER SOWs
 *       charge for them. Spelled out by name and count before it runs.
 *   If a shared item genuinely needs two different margins, the answer is to
 *   un-share it (duplicate the line item so each SOW owns one) — no client-
 *   side rule can make one field hold two numbers.
 *
 * NOTHING WRITES FROM THE GRID ITSELF. The bar is a read-only summary plus an
 * "Override margin" button; the number is typed inside the modal, next to a
 * live "when you submit" callout that restates the exact scope, count and
 * before → after. A control that can reprice a hundred line items should not
 * sit one stray click away on the page.
 *
 * Reads : SCW.bidReviewV2.data (view_3921 model)
 * Writes: field_2152 PUTs through view_3921, concurrency-capped + retried.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var CFG = {
    sceneKey:      'scene_1155',
    // Read + write view. Must be cell-editable AND expose field_2152 as a
    // column, or the view-based PUT 403s.
    itemsViewKey:  'view_3921',
    marginField:   'field_2152',   // margin used by the install-fee equation
    sowConnField:  'field_2154',   // REL_scope of work (MULTI connection)
    eventNs:       '.scwSowMargin',
    cssId:         'scw-sow-margin-css',
    debug:         false
  };

  var P = 'scw-sow-margin';

  // ── Rate-limit discipline (CLAUDE.md: never a bare Promise.all of PUTs) ──
  // Knack rate-limits around 10 req/s and silently 429s the overflow, and a
  // cascade here is 30–100 writes in one gesture. Same shape as
  // mirror-connection-sync.js: capped concurrency, retry transient failures
  // with backoff + jitter, and SETTLE every write so one failure can't reject
  // the batch and produce a false "failed" toast over mostly-landed writes.
  var MAX_CONCURRENT = 4;
  var MAX_ATTEMPTS   = 4;
  var BASE_BACKOFF   = 350;

  var _queue = [], _running = 0;

  function isTransient(status) {
    return status === 429 || status === 408 || status === 0 || status >= 500;
  }

  function putOnce(recordId, body, done) {
    try {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(CFG.itemsViewKey, recordId),
        type: 'PUT',
        data: JSON.stringify(body),
        success: function () { done(null); },
        error:   function (xhr) { done({ status: (xhr && xhr.status) || 0 }); }
      });
    } catch (e) {
      done({ status: 0 });
    }
  }

  function putWithRetry(recordId, body, done) {
    var attempt = 0;
    function go() {
      attempt++;
      putOnce(recordId, body, function (err) {
        if (!err) return done({ ok: true, recordId: recordId, status: 200 });
        if (attempt < MAX_ATTEMPTS && isTransient(err.status)) {
          var delay = BASE_BACKOFF * Math.pow(2, attempt - 1) +
                      Math.floor(Math.random() * 250);
          setTimeout(go, delay);
          return;
        }
        if (CFG.debug || !isTransient(err.status)) {
          console.warn('[scw-sow-margin] PUT failed for ' + recordId +
                       ' (status ' + err.status + ')');
        }
        done({ ok: false, recordId: recordId, status: err.status });
      });
    }
    go();
  }

  function pump() {
    while (_running < MAX_CONCURRENT && _queue.length) {
      var task = _queue.shift();
      _running++;
      /* jshint loopfunc:true */
      (function (t) {
        putWithRetry(t.recordId, t.body, function (res) {
          _running--;
          t.done(res);
          pump();
        });
      })(task);
    }
  }

  function queuePut(recordId, body, done) {
    _queue.push({ recordId: recordId, body: body, done: done });
    pump();
  }

  /** Run every write, settling each one. Never rejects. */
  function cascade(recordIds, margin, onProgress, onComplete) {
    var results = [], total = recordIds.length;
    if (!total) { onComplete([]); return; }
    var body = {};
    body[CFG.marginField] = margin;
    for (var i = 0; i < total; i++) {
      queuePut(recordIds[i], body, function (res) {
        results.push(res);
        if (onProgress) onProgress(results.length, total);
        if (results.length === total) onComplete(results);
      });
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────

  function records() {
    try {
      var d = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.data;
      if (d && typeof d.readRecords === 'function') {
        return d.readRecords(CFG.itemsViewKey) || [];
      }
    } catch (e) { /* fall through */ }
    return [];
  }

  /** [{id, identifier}] of the SOWs a record is connected to. */
  function sowsOf(rec) {
    var raw = rec && rec[CFG.sowConnField + '_raw'];
    if (Array.isArray(raw)) return raw;
    if (raw && raw.id) return [raw];
    return [];
  }

  function marginOf(rec) {
    var raw = rec && rec[CFG.marginField + '_raw'];
    var n = (typeof raw === 'number') ? raw
          : parseFloat(String((raw != null ? raw : rec[CFG.marginField]) || '')
              .replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  /** Partition a SOW's items into those it owns alone and those it shares. */
  function partition(sowId) {
    var recs = records();
    var own = [], shared = [], otherSows = Object.create(null);
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      var sows = sowsOf(rec);
      var mine = false;
      for (var s = 0; s < sows.length; s++) {
        if (sows[s] && sows[s].id === sowId) { mine = true; break; }
      }
      if (!mine) continue;
      if (sows.length > 1) {
        shared.push(rec);
        for (var o = 0; o < sows.length; o++) {
          if (sows[o] && sows[o].id && sows[o].id !== sowId) {
            otherSows[sows[o].id] =
              String(sows[o].identifier || '').trim() || sows[o].id;
          }
        }
      } else {
        own.push(rec);
      }
    }
    var names = [];
    for (var k in otherSows) names.push(otherSows[k]);
    names.sort();
    return { own: own, shared: shared, otherSowNames: names };
  }

  /** Distinct margins currently in force across a set of records. */
  function distinctMargins(recs) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < recs.length; i++) {
      var m = marginOf(recs[i]);
      var key = (m == null) ? '' : String(m);
      if (!(key in seen)) { seen[key] = 1; out.push(m); }
    }
    return out;
  }

  // ── Formatting ──────────────────────────────────────────────────────────
  // field_2152 is a percent field stored as a decimal (0.12 = 12%), matching
  // the project margin field_2158 convention the ops stepper already uses.

  function toPct(dec) {
    if (dec == null) return '';
    return String(Math.round(dec * 1000) / 10);
  }

  /** Accepts "12", "12%", "0.12" and returns the decimal form. Values > 1 are
   *  read as percentages — nobody sets a 1200% margin, and typing "12" for
   *  12% is the overwhelmingly likely intent. */
  function toDecimal(input) {
    var n = parseFloat(String(input || '').replace(/[^0-9.\-]/g, ''));
    if (!isFinite(n)) return null;
    if (n > 1) n = n / 100;
    if (n < 0 || n >= 1) return null;    // margin is (price-cost)/price
    return Math.round(n * 10000) / 10000;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, type) {
    try {
      var br = window.SCW && SCW.bidReview;
      if (br && typeof br.renderToast === 'function') { br.renderToast(msg, type); return; }
    } catch (e) { /* fall through */ }
    if (type === 'error') console.warn('[scw-sow-margin] ' + msg);
  }

  // ── Styles ──────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(CFG.cssId)) return;
    var css = [
      '.' + P + '-bar {',
      '  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;',
      '  padding: 6px 12px 10px; margin: 0;',
      '  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;',
      '  color: #475569;',
      '}',
      '.' + P + '-label { font-weight: 600; color: #475569; }',
      '.' + P + '-value {',
      '  font: 700 13px/1.2 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.' + P + '-open {',
      '  padding: 4px 12px; border: 1px solid #cbd5e1; border-radius: 5px;',
      '  background: #fff; color: #0f4c75; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif;',
      '}',
      '.' + P + '-open:hover { background: #f1f5f9; border-color: #94a3b8; }',
      '.' + P + '-meta { color: #64748b; }',
      '.' + P + '-meta--mixed { color: #b45309; font-weight: 600; }',
      '.' + P + '-shared {',
      '  display: inline-flex; align-items: center; gap: 5px;',
      '  padding: 2px 9px; border-radius: 999px;',
      '  background: #fef3c7; border: 1px solid #fde68a; color: #92400e;',
      '  font: 600 11px/1.2 system-ui, sans-serif;',
      '}',
      // ── Apply dialog ──
      '.' + P + '-back {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,.45);',
      '  z-index: 10050; display: flex; align-items: center; justify-content: center;',
      '}',
      '.' + P + '-modal {',
      '  background: #fff; border-radius: 10px; padding: 20px 22px;',
      '  width: min(520px, calc(100vw - 32px)); max-height: 80vh; overflow: auto;',
      '  box-shadow: 0 12px 32px rgba(15,23,42,.25);',
      '  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;',
      '  color: #0f172a;',
      '}',
      '.' + P + '-modal h3 { margin: 0 0 4px; font: 700 15px/1.3 system-ui, sans-serif;',
      '  color: #0c4a6e; }',
      '.' + P + '-modal p { margin: 0 0 10px; }',
      '.' + P + '-sub { margin: 0 0 16px; color: #64748b; font-size: 12.5px; }',
      // Margin input row
      '.' + P + '-row {',
      '  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;',
      '}',
      '.' + P + '-input {',
      '  width: 82px; padding: 7px 9px; text-align: right;',
      '  border: 1px solid #cbd5e1; border-radius: 6px;',
      '  font: 700 14px/1.2 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.' + P + '-input:focus { outline: 2px solid #93c5fd; outline-offset: 0; }',
      '.' + P + '-input--bad { border-color: #fda4af; background: #fff1f2; }',
      '.' + P + '-suffix { color: #64748b; font-weight: 600; }',
      '.' + P + '-cur { color: #64748b; font-size: 12.5px; margin-left: 4px; }',
      // Scope options
      '.' + P + '-scopes { display: flex; flex-direction: column; gap: 8px; margin: 0 0 16px; }',
      '.' + P + '-scope {',
      '  display: flex; gap: 9px; align-items: flex-start;',
      '  padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;',
      '  cursor: pointer; background: #fff;',
      '}',
      '.' + P + '-scope:hover { background: #f8fafc; }',
      '.' + P + '-scope--on { border-color: #0f4c75; background: #f0f7fc; }',
      '.' + P + '-scope input { margin-top: 2px; flex-shrink: 0; }',
      '.' + P + '-scope-t { font-weight: 700; color: #0f172a; }',
      '.' + P + '-scope-d { color: #64748b; font-size: 12px; margin-top: 2px; }',
      '.' + P + '-scope-d--warn { color: #92400e; font-weight: 600; }',
      // "When you submit" callout
      '.' + P + '-callout {',
      '  border: 1px solid #bae6fd; background: #f0f9ff; border-radius: 8px;',
      '  padding: 12px 14px; margin: 0;',
      '}',
      '.' + P + '-callout--warn { border-color: #fde68a; background: #fffbeb; }',
      '.' + P + '-callout--bad  { border-color: #fecdd3; background: #fff1f2; }',
      '.' + P + '-callout-h {',
      '  font: 700 11px/1.2 system-ui, sans-serif; letter-spacing: .04em;',
      '  text-transform: uppercase; color: #0369a1; margin: 0 0 7px;',
      '}',
      '.' + P + '-callout--warn .' + P + '-callout-h { color: #92400e; }',
      '.' + P + '-callout--bad  .' + P + '-callout-h { color: #be123c; }',
      '.' + P + '-callout ul { margin: 0; padding-left: 18px; }',
      '.' + P + '-callout li { margin: 0 0 4px; }',
      '.' + P + '-callout li:last-child { margin-bottom: 0; }',
      '.' + P + '-warn {',
      '  background: #fffbeb; border: 1px solid #fde68a; border-radius: 7px;',
      '  padding: 10px 12px; margin: 0 0 12px; color: #92400e;',
      '}',
      '.' + P + '-actions {',
      '  display: flex; gap: 8px; justify-content: flex-end;',
      '  margin-top: 16px; flex-wrap: wrap;',
      '}',
      '.' + P + '-btn {',
      '  padding: 7px 14px; border-radius: 6px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent;',
      '}',
      '.' + P + '-btn--cancel { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }',
      '.' + P + '-btn--all    { background: #fff1f2; border-color: #fecdd3; color: #be123c; }',
      '.' + P + '-btn--own    { background: #0f4c75; color: #fff; }',
      '.' + P + '-btn:hover   { filter: brightness(1.06); }',
      '.' + P + '-btn:disabled { opacity: .5; cursor: not-allowed; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = CFG.cssId;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Override modal ──────────────────────────────────────────────────────
  // Everything that can change money lives in here: the number is typed in
  // the modal, the scope is picked in the modal, and a live callout restates
  // the exact effect before the single Apply button becomes meaningful.

  function closeModal() {
    var b = document.querySelector('.' + P + '-back');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function scopeRow(id, checked, title, desc, warn) {
    return '<label class="' + P + '-scope' + (checked ? ' ' + P + '-scope--on' : '') +
        '" data-scope-row="' + id + '">' +
      '<input type="radio" name="scw-margin-scope" value="' + id + '"' +
        (checked ? ' checked' : '') + '>' +
      '<span>' +
        '<span class="' + P + '-scope-t">' + title + '</span>' +
        '<span class="' + P + '-scope-d' + (warn ? ' ' + P + '-scope-d--warn' : '') +
          '" style="display:block">' + desc + '</span>' +
      '</span>' +
    '</label>';
  }

  /** The "when you submit" block. Rebuilt on every keystroke / scope change so
   *  it always describes what the Apply button is about to do right now. */
  function calloutHtml(state) {
    var dec = state.dec, part = state.part, scope = state.scope;
    var targets = (scope === 'all') ? part.own.length + part.shared.length
                                    : part.own.length;

    if (dec == null) {
      return '<div class="' + P + '-callout ' + P + '-callout--bad">' +
        '<div class="' + P + '-callout-h">When you submit</div>' +
        'Enter a margin between 0 and 99% first (type <strong>15</strong> for 15%).' +
      '</div>';
    }
    if (!targets) {
      return '<div class="' + P + '-callout ' + P + '-callout--bad">' +
        '<div class="' + P + '-callout-h">When you submit</div>' +
        'Nothing would change — every line item on this SOW is shared with ' +
        esc(part.otherSowNames.join(', ')) + '. Choose <em>All items</em>, or ' +
        'duplicate the items you want priced differently.' +
      '</div>';
    }

    var pct = toPct(dec);
    var curList = distinctMargins(
      scope === 'all' ? part.own.concat(part.shared) : part.own);
    var fromTxt;
    if (curList.length === 1) {
      fromTxt = (curList[0] == null)
        ? ' (they have no margin set today)'
        : ' (from ' + toPct(curList[0]) + '%)';
    } else {
      fromTxt = ' (they currently range across ' + curList.length + ' different values)';
    }

    var bits = [
      '<li><strong>' + targets + ' line item' + (targets === 1 ? '' : 's') +
        '</strong> on ' + esc(state.sowName) + ' will have their margin set to ' +
        '<strong>' + esc(pct) + '%</strong>' + fromTxt + '.</li>',
      '<li>Each of those items’ install fee recalculates from its sub bid — ' +
        'the SOW total will move.</li>'
    ];
    var warn = false;
    if (scope === 'all' && part.shared.length) {
      warn = true;
      bits.push('<li><strong>' + part.shared.length + ' of them are shared with ' +
        esc(part.otherSowNames.join(', ')) + '</strong>, so ' +
        (part.otherSowNames.length === 1 ? 'that SOW’s' : 'those SOWs’') +
        ' price for the same work changes too.</li>');
    } else if (part.shared.length) {
      bits.push('<li>' + part.shared.length + ' shared item' +
        (part.shared.length === 1 ? '' : 's') + ' (also on ' +
        esc(part.otherSowNames.join(', ')) + ') ' +
        (part.shared.length === 1 ? 'is' : 'are') + ' <strong>left unchanged</strong>.</li>');
    }

    return '<div class="' + P + '-callout' + (warn ? ' ' + P + '-callout--warn' : '') + '">' +
      '<div class="' + P + '-callout-h">When you submit</div>' +
      '<ul>' + bits.join('') + '</ul>' +
    '</div>';
  }

  function applyLabel(state) {
    var n = (state.scope === 'all')
      ? state.part.own.length + state.part.shared.length
      : state.part.own.length;
    return 'Apply to ' + n + ' item' + (n === 1 ? '' : 's');
  }

  function openModal(sowId, sowName) {
    var part = partition(sowId);
    if (!part.own.length && !part.shared.length) {
      toast('No line items found for this SOW', 'error');
      return;
    }
    injectStyles();
    closeModal();

    var all = part.own.concat(part.shared);
    var curMargins = distinctMargins(all);
    var state = {
      sowId: sowId, sowName: sowName, part: part,
      // Pre-seed with the SOW's current margin when it has exactly one, so the
      // common "nudge it up two points" edit starts from the real number.
      dec: (curMargins.length === 1 ? curMargins[0] : null),
      // Safe scope pre-selected: no cross-SOW effect unless explicitly chosen.
      scope: 'own'
    };
    if (!part.shared.length) state.scope = 'own';

    var curTxt = (curMargins.length === 1)
      ? (curMargins[0] == null ? 'no margin set today'
                               : 'currently ' + toPct(curMargins[0]) + '%')
      : 'currently mixed across ' + all.length + ' items';

    var scopes = '';
    if (part.shared.length) {
      scopes = '<div class="' + P + '-scopes">' +
        scopeRow('own', true, 'Independent items only — ' + part.own.length,
          'Items that live on this SOW alone. No other SOW is affected.', false) +
        scopeRow('all', false, 'All items on this SOW — ' + all.length,
          'Includes ' + part.shared.length + ' item' +
            (part.shared.length === 1 ? '' : 's') + ' shared with ' +
            esc(part.otherSowNames.join(', ')) +
            ' — this reprices the same work on ' +
            (part.otherSowNames.length === 1 ? 'that SOW' : 'those SOWs') + '.', true) +
      '</div>';
    }

    var back = document.createElement('div');
    back.className = P + '-back';
    back.innerHTML =
      '<div class="' + P + '-modal" role="dialog" aria-modal="true" ' +
           'aria-label="Override install margin">' +
        '<h3>Override install margin</h3>' +
        '<p class="' + P + '-sub">' + esc(sowName) + ' — ' + all.length +
          ' line item' + (all.length === 1 ? '' : 's') + ', ' + esc(curTxt) + '.</p>' +
        '<div class="' + P + '-row">' +
          '<label class="' + P + '-label" for="scw-margin-input">New margin</label>' +
          '<input id="scw-margin-input" type="text" class="' + P + '-input" ' +
            'data-scw-margin-field value="' +
            esc(state.dec == null ? '' : toPct(state.dec)) + '" ' +
            'placeholder="15" inputmode="decimal" autocomplete="off">' +
          '<span class="' + P + '-suffix">%</span>' +
        '</div>' +
        scopes +
        '<div data-scw-margin-callout>' + calloutHtml(state) + '</div>' +
        '<div class="' + P + '-actions">' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel" ' +
            'data-scw-margin-act="cancel">Cancel</button>' +
          '<button type="button" class="' + P + '-btn ' + P + '-btn--own" ' +
            'data-scw-margin-act="apply">' + applyLabel(state) + '</button>' +
        '</div>' +
      '</div>';

    var input    = back.querySelector('[data-scw-margin-field]');
    var calloutH = back.querySelector('[data-scw-margin-callout]');
    var applyBtn = back.querySelector('[data-scw-margin-act="apply"]');

    function refresh() {
      calloutH.innerHTML = calloutHtml(state);
      applyBtn.textContent = applyLabel(state);
      var targets = (state.scope === 'all')
        ? state.part.own.length + state.part.shared.length
        : state.part.own.length;
      applyBtn.disabled = (state.dec == null || !targets);
      // The destructive styling follows the CHOICE, not the button's identity —
      // Apply is only "dangerous" while it would reach into another SOW.
      applyBtn.className = P + '-btn ' +
        ((state.scope === 'all' && state.part.shared.length)
          ? P + '-btn--all' : P + '-btn--own');
      input.classList.toggle(P + '-input--bad',
        !!(input.value || '').trim() && state.dec == null);
    }

    input.addEventListener('input', function () {
      state.dec = toDecimal(input.value);
      refresh();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !applyBtn.disabled) { e.preventDefault(); submit(); }
    });

    back.addEventListener('change', function (e) {
      var r = e.target.closest && e.target.closest('input[name="scw-margin-scope"]');
      if (!r) return;
      state.scope = r.value;
      var rows = back.querySelectorAll('[data-scope-row]');
      for (var i = 0; i < rows.length; i++) {
        rows[i].classList.toggle(P + '-scope--on',
          rows[i].getAttribute('data-scope-row') === state.scope);
      }
      refresh();
    });

    function submit() {
      var targets = (state.scope === 'all')
        ? state.part.own.concat(state.part.shared)
        : state.part.own;
      if (state.dec == null || !targets.length) return;

      var ids = [];
      for (var i = 0; i < targets.length; i++) ids.push(targets[i].id);

      // Lock the whole modal so a second click can't launch a second cascade.
      var ctrls = back.querySelectorAll('button, input');
      for (var c = 0; c < ctrls.length; c++) ctrls[c].disabled = true;
      applyBtn.textContent = 'Applying… 0/' + ids.length;

      cascade(ids, state.dec, function (doneN, total) {
        applyBtn.textContent = 'Applying… ' + doneN + '/' + total;
      }, function (results) {
        closeModal();
        var okN = 0;
        for (var r = 0; r < results.length; r++) if (results[r].ok) okN++;
        var failN = results.length - okN;
        if (!failN) {
          toast('Margin set to ' + toPct(state.dec) + '% on ' + okN + ' line item' +
                (okN === 1 ? '' : 's'), 'success');
        } else if (okN) {
          toast(okN + ' of ' + results.length + ' updated — ' + failN +
                ' failed. Re-open Override margin to retry the rest.', 'error');
        } else {
          toast('Margin update failed — no line items were changed', 'error');
        }
        // field_2151 / field_2028 are Knack equations over field_2152, so the
        // fees recompute server-side; refetch so the grid and the sub-bid diff
        // both show the new numbers.
        try {
          var d = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.data;
          if (d && typeof d.refetchAll === 'function') setTimeout(d.refetchAll, 600);
        } catch (e) { /* the next render picks it up anyway */ }
      });
    }

    back.addEventListener('click', function (e) {
      if (e.target === back) { closeModal(); return; }
      var act = e.target.closest && e.target.closest('[data-scw-margin-act]');
      if (!act || act.disabled) return;
      if (act.getAttribute('data-scw-margin-act') === 'cancel') { closeModal(); return; }
      submit();
    });

    document.body.appendChild(back);
    refresh();
    try { input.focus(); input.select(); } catch (e) { /* non-fatal */ }
  }

  // Escape closes the modal — but never mid-cascade, when the controls are
  // disabled and writes are still landing.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var back = document.querySelector('.' + P + '-back');
    if (!back) return;
    var apply = back.querySelector('[data-scw-margin-act="apply"]');
    if (apply && apply.disabled && /Applying/.test(apply.textContent || '')) return;
    closeModal();
  });

  // ── Mount ───────────────────────────────────────────────────────────────
  // Read-only summary + a button that opens the modal. Nothing here writes.

  function barHtml(sowId) {
    var part = partition(sowId);
    var all = part.own.concat(part.shared);
    if (!all.length) return '';

    var margins = distinctMargins(all);
    var mixed = margins.length > 1;
    var cur = mixed ? null : margins[0];

    var value = mixed
      ? '<span class="' + P + '-value ' + P + '-meta--mixed">mixed</span>'
      : '<span class="' + P + '-value">' +
          (cur == null ? '—' : esc(toPct(cur)) + '%') + '</span>';

    var meta = '<span class="' + P + '-meta">' + all.length + ' line item' +
      (all.length === 1 ? '' : 's') +
      (mixed ? ' across ' + margins.length + ' different margins' : '') +
      (!mixed && cur == null ? ' — no margin set' : '') + '</span>';

    var sharedChip = part.shared.length
      ? '<span class="' + P + '-shared" title="Also on ' +
          esc(part.otherSowNames.join(', ')) +
          ' — a line item carries one margin, so these price the same on both">' +
          part.shared.length + ' shared with ' +
          esc(part.otherSowNames.join(', ')) + '</span>'
      : '';

    return '<div class="' + P + '-bar" data-scw-sow-margin-bar="' + esc(sowId) + '">' +
      '<span class="' + P + '-label">Install margin:</span>' + value +
      '<button type="button" class="' + P + '-open" data-scw-sow-margin-open>' +
        'Override margin…</button>' +
      meta + sharedChip +
    '</div>';
  }

  function mount() {
    var sections = document.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    if (!sections.length) return;
    injectStyles();

    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var sowId = sec.getAttribute('data-sow-id');
      if (!sowId) continue;

      var bar = sec.querySelector(':scope > [data-scw-sow-margin-bar]');
      var html = barHtml(sowId);
      if (!html) {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        continue;
      }

      var holder = document.createElement('div');
      holder.innerHTML = html;
      var fresh = holder.firstChild;

      if (!bar) {
        // Sit below the sub-bid-diff block when it exists, else directly under
        // the header. Both modules insert idempotently and neither moves an
        // existing block, so the order converges either way.
        var sbd = sec.querySelector(':scope > .scw-sbd-inline');
        var hdr = sec.querySelector('.scw-bid-review-v2__sow-header');
        if (sbd) sbd.insertAdjacentElement('afterend', fresh);
        else if (hdr) hdr.insertAdjacentElement('afterend', fresh);
        else sec.insertBefore(fresh, sec.firstChild);
      } else if (bar.innerHTML !== fresh.innerHTML) {
        // Only touch the DOM when the summary actually changed — the grid
        // re-renders constantly and a blind replace would fight the observer.
        bar.parentNode.replaceChild(fresh, bar);
      }
    }
  }

  function sowNameOf(sec) {
    var n = sec && sec.querySelector('.scw-bid-review-v2__sow-name');
    return (n && (n.textContent || '').trim()) || 'this SOW';
  }

  // ── Bindings ────────────────────────────────────────────────────────────
  // NOTE: there is deliberately NO capture-phase listener here. An earlier
  // version added one on `document` to stop bar clicks folding the SOW
  // section — but stopPropagation() during CAPTURE at the document level ends
  // the dispatch before it ever reaches the target, so the delegated handler
  // below never ran and the button was dead. The bar is a SIBLING of the
  // header (not a descendant), so header clicks were never a risk anyway.

  if (!document.documentElement.hasAttribute('data-scw-sow-margin-bound')) {
    document.documentElement.setAttribute('data-scw-sow-margin-bound', '1');

    document.addEventListener('click', function (e) {
      var open = e.target && e.target.closest &&
                 e.target.closest('[data-scw-sow-margin-open]');
      if (!open || open.disabled) return;
      e.preventDefault();
      e.stopPropagation();   // bubble-phase only — safe
      var bar = open.closest('[data-scw-sow-margin-bar]');
      if (!bar) return;
      openModal(bar.getAttribute('data-scw-sow-margin-bar'),
                sowNameOf(bar.closest('.scw-bid-review-v2__sow')));
    });
  }

  var _t = null, _suppress = false, _observer = null;
  function mountSoon() {
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () {
      _suppress = true;
      try { mount(); } finally { setTimeout(function () { _suppress = false; }, 0); }
    }, 120);
  }

  /** The v2 grid rebuilds its body wholesale on every data tick, taking the
   *  SOW sections (and our bar with them) — and it emits no "rendered" event.
   *  A MutationObserver is the only reliable after-render hook, same as
   *  sales-revision-column.js. Our own writes are gated by _suppress so they
   *  don't retrigger it. */
  function observeGrid() {
    if (_observer) return;
    var mountEl = document.getElementById(
      (SCW.bidReviewV2 && SCW.bidReviewV2.CONFIG && SCW.bidReviewV2.CONFIG.mountId) ||
      'scw-bid-review-v2');
    if (!mountEl) return;
    _observer = new MutationObserver(function () {
      if (_suppress) return;
      mountSoon();
    });
    _observer.observe(mountEl, { childList: true, subtree: true });
  }

  function boot() { mountSoon(); observeGrid(); }

  SCW.onSceneRender(CFG.sceneKey, boot, CFG.eventNs);
  SCW.onViewRender(CFG.itemsViewKey, boot, CFG.eventNs);

  SCW.sowMarginCascade = {
    mount: mount, partition: partition, open: openModal, CONFIG: CFG
  };
})();
/*** END SOW MARGIN CASCADE **************************************************/
