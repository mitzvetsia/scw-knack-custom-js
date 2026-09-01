/*** CO REVIEW DIFF — "what did the sub change" (view_4079, Ops Review) *****
 *
 * While the CO sits in Ops Review, compare each live line on the internal
 * CO worksheet against the SEND-time pricing baseline (field_2972, the
 * snapshot Make stored when ops sent the CO to the sub — read back through
 * SCW.coStage.getSnapshot()) and surface exactly what the sub changed:
 *
 *   - a summary banner above the worksheet: "N changed · M added ·
 *     K removed since sent ⟨date⟩" (removed lines named in the tooltip —
 *     they have no card to badge)
 *   - an amber CHANGED flag in the label cell of each edited line, whose
 *     tooltip lists every delta ("Sub bid $350 → $425 · +Hrs 0 → 2")
 *   - an amber ring on each changed input + a small "was ⟨old⟩" note under
 *     it, so the specific number that moved is obvious at a glance
 *   - a sky NEW flag on lines that didn't exist at send time (sub-added)
 *
 * Diffed fields: Sub bid, +Hrs, +Mat, Qty, Drop # — whatever the
 * snapshot line actually carries (older snapshots without qty/item just
 * skip those checks; no false flags). Fee is derived from Sub bid, so it
 * isn't separately flagged.
 *
 * Active ONLY in Ops Review (status via SCW.coStage.getStatus(), which
 * honors the stage strip's optimistic flips). Everything is re-applied on
 * worksheet rebuilds (data notifies) and status-view renders; a pass
 * always starts by clearing its own annotations, so it's idempotent and
 * self-removing when the status moves on.
 ***************************************************************************/
(function () {
  'use strict';

  var VIEW        = 'view_4079';           // internal CO worksheet
  var STATUS_VIEW = 'view_4109';           // snapshot/status source (re-apply hook)
  var STYLE_ID    = 'scw-co-review-diff-css';
  var BANNER_ID   = 'scw-co-review-diff-banner';
  var EVENT_NS    = '.scwCoReviewDiff';

  // Snapshot key → live field + display formatting. LABOR ONLY — the sub
  // loop trades labor numbers; equip stays in the snapshot as data but is
  // never the sub's to change, so it isn't diffed.
  var FIELDS = [
    { key: 'subBid', field: 'field_2150', label: 'Sub bid', money: true  },
    { key: 'hrs',    field: 'field_1973', label: '+Hrs',    money: false },
    { key: 'mat',    field: 'field_1974', label: '+Mat',    money: true  },
    { key: 'qty',    field: 'field_1964', label: 'Qty',     money: false },
    { key: 'number', field: 'field_1951', label: 'Drop #',  money: false }
  ];

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BANNER_ID + '{display:flex;align-items:center;gap:8px;flex-wrap:wrap;',
      'margin:0 0 10px;padding:9px 14px;border-radius:8px;',
      'background:#fffbeb;border:1px solid #fde68a;box-shadow:inset 4px 0 0 #f59e0b;',
      'font:600 12.5px/1.4 system-ui,-apple-system,sans-serif;color:#92400e;}',
      '#' + BANNER_ID + ' .scw-co-rd-chip{display:inline-flex;align-items:center;gap:5px;',
      'padding:3px 9px;border-radius:999px;font:700 11px/1.2 system-ui,sans-serif;}',
      '#' + BANNER_ID + ' .scw-co-rd-chip--changed{color:#92400e;background:#fef3c7;border:1px solid #fde68a;}',
      '#' + BANNER_ID + ' .scw-co-rd-chip--new{color:#0c4a6e;background:#e0f2fe;border:1px solid #bae6fd;}',
      '#' + BANNER_ID + ' .scw-co-rd-chip--removed{color:#9f1239;background:#ffe4e6;border:1px solid #fecdd3;}',
      '#' + BANNER_ID + ' .scw-co-rd-legend{flex-basis:100%;',
      'font:500 11px/1.45 system-ui,-apple-system,sans-serif;color:#a16207;}',
      // per-line flags (same family as the REMOVE flag)
      '.scw-ws-v2-co-flag--changed{display:block;width:-moz-fit-content;width:fit-content;',
      'margin:0 0 3px 0;font:700 8.5px/1 system-ui,-apple-system,sans-serif;letter-spacing:.06em;',
      'padding:2px 6px;border-radius:4px;color:#92400e;background:#fef3c7;white-space:nowrap;}',
      '.scw-ws-v2-co-flag--new{display:block;width:-moz-fit-content;width:fit-content;',
      'margin:0 0 3px 0;font:700 8.5px/1 system-ui,-apple-system,sans-serif;letter-spacing:.06em;',
      'padding:2px 6px;border-radius:4px;color:#0c4a6e;background:#e0f2fe;white-space:nowrap;}',
      // changed input ring + "was" note
      '.scw-ws-v2-input.scw-ws-v2-diff-changed{',
      'border-color:#f59e0b !important;box-shadow:0 0 0 2px rgba(245,158,11,.28) !important;}',
      '.scw-ws-v2-diff-was{font:600 10px/1.2 system-ui,sans-serif;color:#b45309;',
      'text-align:center;margin-top:2px;white-space:nowrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  function readTxt(rec, key) {
    var v = rec && rec[key];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }
  function num(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    var n = parseFloat(readTxt(rec, key).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function eq(a, b) { return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005; }
  function fmt(v, money) {
    v = Number(v) || 0;
    if (!money) return String(v);
    return (v < 0 ? '-' : '') + '$' + Math.abs(v)
      .toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function inOpsReview() {
    try {
      var s = (window.SCW && SCW.coStage && typeof SCW.coStage.getStatus === 'function')
        ? SCW.coStage.getStatus() : '';
      return /ops review/i.test(String(s || ''));
    } catch (e) { return false; }
  }
  function getSnapshot() {
    try {
      return (window.SCW && SCW.coStage && typeof SCW.coStage.getSnapshot === 'function')
        ? SCW.coStage.getSnapshot() : null;
    } catch (e) { return null; }
  }

  // Remove every annotation this module owns — run at the top of each pass
  // so re-applies never stack and leaving Ops Review self-cleans.
  function clearAnnotations(panel) {
    var banner = document.getElementById(BANNER_ID);
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    if (!panel) return;
    var kill = panel.querySelectorAll(
      '.scw-ws-v2-diff-was, .scw-ws-v2-co-flag--changed, .scw-ws-v2-co-flag--new');
    for (var i = 0; i < kill.length; i++) {
      if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
    }
    var rings = panel.querySelectorAll('.scw-ws-v2-diff-changed');
    for (var j = 0; j < rings.length; j++) {
      rings[j].classList.remove('scw-ws-v2-diff-changed');
    }
  }

  function lineName(base) {
    return base.label || base.item ||
      ((base.prefix || '') && (base.prefix + (base.number || ''))) || '(line)';
  }

  function flagCard(card, cls, text, title) {
    var cell = card.querySelector('.scw-ws-v2-row .scw-ws-v2-cell--label');
    if (!cell) return;
    var flag = document.createElement('span');
    flag.className = 'scw-ws-v2-co-flag ' + cls;
    flag.textContent = text;
    if (title) flag.title = title;
    cell.insertBefore(flag, cell.firstChild);
  }

  function annotateInput(card, fieldKey, oldVal, money) {
    var input = card.querySelector('[data-scw-ws-v2-field="' + fieldKey + '"]');
    if (!input) return;
    input.classList.add('scw-ws-v2-diff-changed');
    var was = document.createElement('div');
    was.className = 'scw-ws-v2-diff-was';
    was.textContent = 'was ' + fmt(oldVal, money);
    input.parentNode.insertBefore(was, input.nextSibling);
  }

  function renderBanner(panel, changed, added, removedNames, sentAt) {
    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    var when = '';
    if (sentAt) {
      var d = new Date(sentAt);
      if (!isNaN(+d)) {
        when = ' since sent ' +
          d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    }
    var bits = ['<span>Changes since this CO was sent to the sub for pricing' +
      esc(when) + ':</span>'];
    bits.push('<span class="scw-co-rd-chip scw-co-rd-chip--changed">' +
      changed + ' changed</span>');
    if (added) {
      bits.push('<span class="scw-co-rd-chip scw-co-rd-chip--new">' +
        added + ' added</span>');
    }
    if (removedNames.length) {
      bits.push('<span class="scw-co-rd-chip scw-co-rd-chip--removed" title="' +
        esc(removedNames.join(', ')) + '">' +
        removedNames.length + ' removed</span>');
    }
    if (changed === 0 && !added && !removedNames.length) {
      bits = ['<span>No changes since this CO was sent to the sub for pricing' +
        esc(when) + ' — it came back exactly as sent.</span>'];
    } else {
      // The flags read as absolutes ("NEW") without this anchor — spell out
      // the reference point once, on the banner every flag sits under.
      bits.push('<span class="scw-co-rd-legend">' +
        'NEW = added after that send (no sub pricing yet) &middot; ' +
        'CHANGED = differs from what was sent &mdash; hover a flag for the ' +
        'exact deltas &middot; REMOVE = credit line (item leaves scope at ' +
        'signature)</span>');
    }
    banner.innerHTML = bits.join('');
    // Above the grand summary, below the toolbar/banner strip.
    var body = panel.querySelector('.scw-ws-v2-body');
    if (body) panel.insertBefore(banner, body);
    else panel.appendChild(banner);
  }

  var _timer = null;
  function schedule() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(apply, 180);
  }

  function apply() {
    var panel = document.getElementById('scw-ws-v2-' + VIEW);
    clearAnnotations(panel);
    if (!panel || !inOpsReview()) return;
    var snap = getSnapshot();
    if (!snap || !snap.lines) {
      // Loud when dormant-in-review: the #1 setup gap is the snapshot not
      // being readable (field_2972 missing from view_4109, or Make's send
      // branch not writing payload.snapshot verbatim).
      console.warn('[scw-co-review-diff] CO is in Ops Review but the send ' +
        'baseline is unreadable — no diff will render. Check that ' +
        'field_2972 is a field ON view_4109 and that Make\'s send/sendback ' +
        'branch writes payload.snapshot (raw JSON) to it. getSnapshot() =',
        snap);
      return;
    }
    injectCss();

    // "(Jul 15)" — appended to the per-line flag tooltips so the reference
    // point (the last send to the sub) is explicit right where the flag is.
    var sentWhen = '';
    if (snap.sentAt) {
      var sd = new Date(snap.sentAt);
      if (!isNaN(+sd)) {
        sentWhen = ' (' +
          sd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ')';
      }
    }

    var ws = window.SCW && SCW.worksheetV2;
    var recs = (ws && ws.data && typeof ws.data.readRecords === 'function')
      ? ws.data.readRecords(VIEW) : [];
    if (!recs.length) return;

    var liveIds = {};
    var changedCount = 0, addedCount = 0;

    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (!rec || !rec.id) continue;
      liveIds[rec.id] = 1;
      var card = panel.querySelector(
        '.scw-ws-v2-card[data-scw-ws-v2-record="' + rec.id + '"]');
      if (!card) continue;

      var base = snap.lines[rec.id];
      if (!base) {
        addedCount++;
        // Neutral wording: anything drafted after the send lands here — the
        // sub's additions AND ops' own post-submission adds/swap pairs alike.
        flagCard(card, 'scw-ws-v2-co-flag--new', 'NEW',
          'Added since the CO was last sent to the sub for pricing' +
          sentWhen + ' — the sub has NOT priced this line.');
        continue;
      }

      var deltas = [];
      for (var f = 0; f < FIELDS.length; f++) {
        var spec = FIELDS[f];
        if (base[spec.key] === undefined) continue;   // older snapshot — skip
        var live = num(rec, spec.field);
        var old  = Number(base[spec.key]) || 0;
        if (eq(live, old)) continue;
        deltas.push({ spec: spec, old: old, live: live });
      }
      if (!deltas.length) continue;

      changedCount++;
      var parts = [];
      for (var d = 0; d < deltas.length; d++) {
        parts.push(deltas[d].spec.label + ' ' +
          fmt(deltas[d].old, deltas[d].spec.money) + ' → ' +
          fmt(deltas[d].live, deltas[d].spec.money));
        annotateInput(card, deltas[d].spec.field,
          deltas[d].old, deltas[d].spec.money);
      }
      flagCard(card, 'scw-ws-v2-co-flag--changed', 'CHANGED',
        'Changed since the CO was sent to the sub' + sentWhen + ': ' +
        parts.join(' · '));
    }

    var removedNames = [];
    for (var id in snap.lines) {
      if (!liveIds[id]) removedNames.push(lineName(snap.lines[id]));
    }

    renderBanner(panel, changedCount, addedCount, removedNames, snap.sentAt);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, schedule, EVENT_NS);
    SCW.onViewRender(STATUS_VIEW, schedule, EVENT_NS);
  }
  // Worksheet rebuilds fire data notifies, not knack-view-render — re-apply
  // after each (same hook the CO locks use).
  (function () {
    var ws = window.SCW && SCW.worksheetV2;
    if (ws && ws.data && typeof ws.data.subscribe === 'function') {
      ws.data.subscribe(VIEW, schedule);
    }
  })();
  $(document).off('knack-view-render.' + VIEW + EVENT_NS)
    .on('knack-view-render.' + VIEW + EVENT_NS, schedule);
})();
/*** END: CO review diff ****************************************************/
