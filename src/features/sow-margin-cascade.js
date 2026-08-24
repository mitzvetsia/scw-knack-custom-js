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
 *   items. Rather than pick a rule, the apply dialog names the blast radius
 *   and makes the user choose:
 *     - Independent only — items owned solely by this SOW. No cross-SOW
 *       effect. The safe default (primary button).
 *     - All items — includes shared ones, which changes what the OTHER SOWs
 *       charge for them. Spelled out by name and count before it runs.
 *   If a shared item genuinely needs two different margins, the answer is to
 *   un-share it (duplicate the line item so each SOW owns one) — no client-
 *   side rule can make one field hold two numbers.
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
      '.' + P + '-input {',
      '  width: 68px; padding: 4px 6px; text-align: right;',
      '  border: 1px solid #cbd5e1; border-radius: 5px;',
      '  font: 600 12px/1.2 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.' + P + '-input:focus { outline: 2px solid #93c5fd; outline-offset: 0; }',
      '.' + P + '-suffix { color: #64748b; margin-left: -4px; }',
      '.' + P + '-apply {',
      '  padding: 4px 12px; border: none; border-radius: 5px;',
      '  background: #0f4c75; color: #fff; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif;',
      '}',
      '.' + P + '-apply:hover { filter: brightness(1.12); }',
      '.' + P + '-apply:disabled { opacity: .45; cursor: not-allowed; }',
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
      '.' + P + '-modal h3 { margin: 0 0 10px; font: 700 15px/1.3 system-ui, sans-serif;',
      '  color: #0c4a6e; }',
      '.' + P + '-modal p { margin: 0 0 10px; }',
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

  // ── Apply dialog ────────────────────────────────────────────────────────

  function closeModal() {
    var b = document.querySelector('.' + P + '-back');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  /** Ask which items to write. Buttons follow the repo convention: negative
   *  first, primary (the safe scope) last. */
  function askScope(sowName, pct, part, onPick) {
    injectStyles();
    closeModal();

    var ownN = part.own.length, sharedN = part.shared.length;

    var body = '<h3>Set margin to ' + esc(pct) + '% on ' + esc(sowName) + '</h3>';
    if (sharedN) {
      body +=
        '<div class="' + P + '-warn">' +
          '<strong>' + sharedN + ' of these line items ' +
          (sharedN === 1 ? 'is' : 'are') + ' also on ' +
          esc(part.otherSowNames.join(', ') || 'another SOW') + '.</strong><br>' +
          'A line item carries one margin, so changing it here changes what ' +
          (part.otherSowNames.length === 1 ? 'that SOW' : 'those SOWs') +
          ' charges for the same work. To price them differently, duplicate ' +
          'the item so each SOW owns its own copy.' +
        '</div>' +
        '<p>Apply to:</p>';
    } else {
      body += '<p>This writes the margin to all ' + ownN + ' line item' +
        (ownN === 1 ? '' : 's') + ' on this SOW. None of them are shared with ' +
        'another SOW.</p>';
    }

    var actions = '<div class="' + P + '-actions">' +
      '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel" ' +
        'data-scope="cancel">Cancel</button>';
    if (sharedN) {
      actions +=
        '<button type="button" class="' + P + '-btn ' + P + '-btn--all" ' +
          'data-scope="all">All ' + (ownN + sharedN) + ' items</button>' +
        '<button type="button" class="' + P + '-btn ' + P + '-btn--own" ' +
          'data-scope="own">Independent only (' + ownN + ')</button>';
    } else {
      actions +=
        '<button type="button" class="' + P + '-btn ' + P + '-btn--own" ' +
          'data-scope="own">Apply to ' + ownN + ' item' +
          (ownN === 1 ? '' : 's') + '</button>';
    }
    actions += '</div>';

    var back = document.createElement('div');
    back.className = P + '-back';
    back.innerHTML = '<div class="' + P + '-modal" role="dialog" aria-modal="true">' +
      body + actions + '</div>';

    back.addEventListener('click', function (e) {
      if (e.target === back) { closeModal(); return; }
      var btn = e.target.closest && e.target.closest('[data-scope]');
      if (!btn) return;
      var scope = btn.getAttribute('data-scope');
      if (scope === 'cancel') { closeModal(); return; }
      // Disable the whole set so a double-click can't launch two cascades.
      var all = back.querySelectorAll('[data-scope]');
      for (var i = 0; i < all.length; i++) all[i].disabled = true;
      btn.textContent = 'Applying…';
      onPick(scope, back);
    });
    document.body.appendChild(back);
  }

  // ── Apply ───────────────────────────────────────────────────────────────

  function applyMargin(sowId, sowName, dec, input) {
    var part = partition(sowId);
    if (!part.own.length && !part.shared.length) {
      toast('No line items found for this SOW', 'error');
      return;
    }

    askScope(sowName, toPct(dec), part, function (scope, back) {
      var targets = (scope === 'all')
        ? part.own.concat(part.shared)
        : part.own;
      if (!targets.length) {
        closeModal();
        toast('Nothing to update — every item on this SOW is shared', 'error');
        return;
      }
      var ids = [];
      for (var i = 0; i < targets.length; i++) ids.push(targets[i].id);

      var btn = back.querySelector('[data-scope="' + scope + '"]');
      cascade(ids, dec, function (doneN, total) {
        if (btn) btn.textContent = 'Applying… ' + doneN + '/' + total;
      }, function (results) {
        closeModal();
        var okN = 0;
        for (var r = 0; r < results.length; r++) if (results[r].ok) okN++;
        var failN = results.length - okN;
        if (!failN) {
          toast('Margin set to ' + toPct(dec) + '% on ' + okN + ' line item' +
                (okN === 1 ? '' : 's'), 'success');
        } else if (okN) {
          toast(okN + ' of ' + results.length + ' updated — ' + failN +
                ' failed. Re-apply to retry the rest.', 'error');
        } else {
          toast('Margin update failed — no line items were changed', 'error');
        }
        // Install fee (field_2151 / field_2028) is a Knack equation over
        // field_2152, so it recomputes server-side. Refetch so the grid and
        // the sub-bid diff both show the new fees.
        try {
          var d = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.data;
          if (d && typeof d.refetchAll === 'function') setTimeout(d.refetchAll, 600);
        } catch (e) { /* grid refreshes on the next render anyway */ }
        if (input) input.blur();
      });
    });
  }

  // ── Mount ───────────────────────────────────────────────────────────────

  function barHtml(sowId) {
    var part = partition(sowId);
    var all = part.own.concat(part.shared);
    if (!all.length) return '';

    var margins = distinctMargins(all);
    var mixed = margins.length > 1;
    var cur = mixed ? null : margins[0];

    var meta = mixed
      ? '<span class="' + P + '-meta ' + P + '-meta--mixed">mixed across ' +
          all.length + ' items</span>'
      : '<span class="' + P + '-meta">' + all.length + ' line item' +
          (all.length === 1 ? '' : 's') +
          (cur == null ? ' — no margin set' : '') + '</span>';

    var sharedChip = part.shared.length
      ? '<span class="' + P + '-shared" title="Also on ' +
          esc(part.otherSowNames.join(', ')) +
          ' — a line item carries one margin, so these price the same on both">' +
          part.shared.length + ' shared with ' +
          esc(part.otherSowNames.join(', ')) + '</span>'
      : '';

    return '<div class="' + P + '-bar" data-scw-sow-margin-bar="' + esc(sowId) + '">' +
      '<span class="' + P + '-label">Install margin:</span>' +
      '<input type="text" class="' + P + '-input" data-scw-sow-margin-input ' +
        'value="' + esc(mixed ? '' : toPct(cur)) + '" ' +
        'placeholder="' + (mixed ? 'mixed' : '12') + '" ' +
        'inputmode="decimal" aria-label="Install fee margin percent">' +
      '<span class="' + P + '-suffix">%</span>' +
      '<button type="button" class="' + P + '-apply" data-scw-sow-margin-apply>' +
        'Apply to SOW</button>' +
      meta + sharedChip +
    '</div>';
  }

  function mount() {
    var sections = document.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    if (!sections.length) return;
    injectStyles();

    var active = document.activeElement;
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var sowId = sec.getAttribute('data-sow-id');
      if (!sowId) continue;

      var bar = sec.querySelector(':scope > [data-scw-sow-margin-bar]');
      // Never rebuild while the user is mid-edit in this bar.
      if (bar && active && bar.contains(active)) continue;

      var html = barHtml(sowId);
      if (!html) {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        continue;
      }

      if (!bar) {
        var holder = document.createElement('div');
        holder.innerHTML = html;
        bar = holder.firstChild;
        // Sit below the sub-bid-diff block when it exists, else directly
        // under the header. Both modules insert idempotently and neither
        // moves an existing block, so the order converges either way.
        var sbd = sec.querySelector(':scope > .scw-sbd-inline');
        var hdr = sec.querySelector('.scw-bid-review-v2__sow-header');
        if (sbd) sbd.insertAdjacentElement('afterend', bar);
        else if (hdr) hdr.insertAdjacentElement('afterend', bar);
        else sec.insertBefore(bar, sec.firstChild);
      } else {
        var fresh = document.createElement('div');
        fresh.innerHTML = html;
        bar.parentNode.replaceChild(fresh.firstChild, bar);
      }
    }
  }

  function sowNameOf(sec) {
    var n = sec && sec.querySelector('.scw-bid-review-v2__sow-name');
    return (n && (n.textContent || '').trim()) || 'this SOW';
  }

  function commitFrom(el) {
    var bar = el.closest('[data-scw-sow-margin-bar]');
    if (!bar) return;
    var sowId = bar.getAttribute('data-scw-sow-margin-bar');
    var input = bar.querySelector('[data-scw-sow-margin-input]');
    var dec = toDecimal(input && input.value);
    if (dec == null) {
      toast('Enter a margin between 0 and 99% (e.g. 12)', 'error');
      if (input) input.focus();
      return;
    }
    applyMargin(sowId, sowNameOf(bar.closest('.scw-bid-review-v2__sow')), dec, input);
  }

  // ── Bindings ────────────────────────────────────────────────────────────

  if (!document.documentElement.hasAttribute('data-scw-sow-margin-bound')) {
    document.documentElement.setAttribute('data-scw-sow-margin-bound', '1');

    document.addEventListener('click', function (e) {
      var apply = e.target && e.target.closest &&
                  e.target.closest('[data-scw-sow-margin-apply]');
      if (!apply || apply.disabled) return;
      // The SOW header is role="button" and toggles the section — keep the
      // click from reaching it.
      e.preventDefault();
      e.stopPropagation();
      commitFrom(apply);
    });

    // Enter commits; clicks inside the bar must not fold the SOW section.
    document.addEventListener('keydown', function (e) {
      var input = e.target && e.target.closest &&
                  e.target.closest('[data-scw-sow-margin-input]');
      if (!input) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitFrom(input); }
      if (e.key === 'Escape') { input.blur(); }
    });
    document.addEventListener('click', function (e) {
      var inBar = e.target && e.target.closest && e.target.closest('.' + P + '-bar');
      if (inBar) e.stopPropagation();
    }, true);
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

  SCW.sowMarginCascade = { mount: mount, partition: partition, CONFIG: CFG };
})();
/*** END SOW MARGIN CASCADE **************************************************/
