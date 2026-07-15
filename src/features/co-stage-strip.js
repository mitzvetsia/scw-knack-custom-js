/*** CHANGE ORDER STAGE STRIP (view_4092 ops · view_4121 sub) **************
 *
 * "Where is this CO and whose court is the ball in" — a compact stepper +
 * exactly one primary action per status, rendered into the CO header card
 * between the header row and the value strip:
 *
 *   Draft ── Sub Pricing ── Ops Review ── Issued ── Signed ── Applied
 *   [ Send to Sub ]                    (action area matches the status)
 *
 * Two deployments (scenes never coexist, so the mount id is shared):
 *   ops (view_4092, scene_1362) — full action set. Status → action (one
 *   writer per status, docs/change-orders.md):
 *     Draft               → [Send to Sub]  (snapshot + webhook, status flip
 *                           happens in Make — the one writer)
 *     Pending Sub Pricing → waiting state "With the sub since ⟨date⟩ — N days"
 *                           + [Recall from Sub] (mirror-lock escape hatch)
 *     Ops Review          → [Send back to sub] [Preview & Issue →]
 *                           (destructive/secondary first, primary last; the
 *                           Issue itself fires from the preview page's CO-mode
 *                           ops stepper — see ops-stepper.js issue-change-order)
 *     Issued/Accepted/Applied/Declined/Void → informational notes.
 *   sub (view_4121, scene_1374) — the SAME stepper, display-only: sub-facing
 *   notes per stage ("Your pricing window is open…"), NO action buttons. The
 *   sub's verbs live elsewhere (worksheet edits while unlocked; the hand-back
 *   submit verb ships separately).
 *
 * Send to Sub also captures the PRICING SNAPSHOT (the "ops proposed" money
 * baseline, per line) and ships it in the webhook payload — Make writes it
 * verbatim to the CO header's snapshot field. The Ops-Review diff ("what
 * did the sub change") reads it back from the hidden status view.
 *
 * Builder dependencies (fill the DEP placeholders as they land):
 *   - STATUS_VIEW: hidden details view showing the CO record with CO Status
 *     (field_2953) + the snapshot field. Read + poll target.
 *   - SNAPSHOT_FIELD: the `CO Sub Pricing Snapshot` paragraph field key.
 *   - MAKE_CO_SEND_TO_SUB_WEBHOOK / MAKE_CO_ISSUE_WEBHOOK in SCW.CONFIG.
 * Until they exist: status falls back to the header form's (hidden)
 * field_2953 value, and the buttons alert what's missing instead of firing.
 ***************************************************************************/
(function () {
  'use strict';

  var EL_ID    = 'scw-co-stage';        // shared — the two scenes never coexist
  var STYLE_ID = 'scw-co-stage-css';

  var SNAPSHOT_FIELD = 'field_2972';
  var STATUS_FIELD   = 'field_2953';
  var POLL_MS        = 30 * 1000;

  var DEPLOYMENTS = [
    { VIEW: 'view_4092', CO_VIEW: 'view_4079', STATUS_VIEW: 'view_4109',
      MODE: 'ops', NS: '.scwCoStage' },
    { VIEW: 'view_4121', CO_VIEW: 'view_4112', STATUS_VIEW: 'view_4122',
      MODE: 'sub', NS: '.scwCoStageSub' }
  ];

  // Stepper stages in lifecycle order. `match` normalizes the Builder
  // status text (lowercased) to a stage index.
  var STAGES = [
    { key: 'draft',    label: 'Draft',       match: /^draft$/ },
    { key: 'pricing',  label: 'Sub Pricing', match: /pending sub pricing/ },
    { key: 'review',   label: 'Ops Review',  match: /ops review/ },
    { key: 'issued',   label: 'Issued',      match: /^issued$/ },
    { key: 'signed',   label: 'Signed',      match: /^accepted$/ },
    { key: 'applied',  label: 'Applied',     match: /^applied$/ }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + EL_ID + '{padding:10px 0 12px;margin-bottom:2px;border-bottom:1px solid #e2e8f0;}',
      // ── stepper ──
      '.scw-co-steps{display:flex;align-items:flex-start;gap:0;max-width:640px;}',
      '.scw-co-step{display:flex;flex-direction:column;align-items:center;flex:1 1 0;',
      'position:relative;min-width:0;}',
      '.scw-co-step-dot{width:14px;height:14px;border-radius:50%;background:#fff;',
      'border:2px solid #cbd5e1;box-sizing:border-box;z-index:1;}',
      '.scw-co-step--done .scw-co-step-dot{background:#0f4c75;border-color:#0f4c75;}',
      '.scw-co-step--current .scw-co-step-dot{border-color:#0f4c75;border-width:3px;',
      'width:16px;height:16px;margin-top:-1px;}',
      '.scw-co-step-lbl{margin-top:4px;font:600 10.5px/1.2 system-ui,-apple-system,sans-serif;',
      'color:#94a3b8;white-space:nowrap;}',
      '.scw-co-step--done .scw-co-step-lbl{color:#475569;}',
      '.scw-co-step--current .scw-co-step-lbl{color:#0f4c75;font-weight:700;}',
      // connecting line: drawn from each step (except the first) to its
      // left neighbour, at dot height.
      '.scw-co-step + .scw-co-step:before{content:"";position:absolute;',
      'top:6px;right:50%;width:100%;height:2px;background:#e2e8f0;}',
      '.scw-co-step--done + .scw-co-step:before,',
      '.scw-co-step--done + .scw-co-step--current:before{background:#0f4c75;}',
      // off-path terminal (Declined / Void): dim the track, show a chip
      '.scw-co-stage--offpath .scw-co-steps{opacity:.45;}',
      // ── action row ──
      '.scw-co-stage-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;',
      'margin-top:10px;}',
      '.scw-co-stage-btn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
      'border-radius:7px;padding:8px 16px;font:600 12.5px/1.2 system-ui,-apple-system,sans-serif;',
      'border:1px solid transparent;transition:background .12s,border-color .12s;}',
      '.scw-co-stage-btn--primary{background:#0f4c75;color:#fff;border-color:#0f4c75;}',
      '.scw-co-stage-btn--primary:hover{background:#0d3f61;}',
      '.scw-co-stage-btn--secondary{background:#fff;color:#334155;border-color:#cbd5e1;}',
      '.scw-co-stage-btn--secondary:hover{background:#f1f5f9;}',
      '.scw-co-stage-btn[disabled]{opacity:.55;cursor:default;pointer-events:none;}',
      '.scw-co-stage-note{font:400 12.5px/1.45 system-ui,-apple-system,sans-serif;color:#475569;}',
      '.scw-co-stage-note b{font-weight:700;color:#1e293b;}',
      '.scw-co-stage-wait{display:inline-flex;align-items:center;gap:8px;',
      'padding:7px 12px;border-radius:7px;background:#fffbeb;border:1px solid #fde68a;',
      'font:600 12px/1.3 system-ui,sans-serif;color:#b45309;}',
      '.scw-co-stage-wait .scw-co-stage-pulse{width:8px;height:8px;border-radius:50%;',
      'background:#f59e0b;animation:scwCoPulse 1.6s ease-in-out infinite;}',
      // sub "your window is open" variant — green, same pulse
      '.scw-co-stage-wait--open{background:#f0fdf4;border-color:#bbf7d0;color:#166534;}',
      '.scw-co-stage-wait--open .scw-co-stage-pulse{background:#22c55e;}',
      '@keyframes scwCoPulse{0%,100%{opacity:1;}50%{opacity:.3;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function readTxt(rec, key) {
    var v = rec && rec[key];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function stageIndex(status) {
    var s = String(status || '').toLowerCase();
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].match.test(s)) return i;
    }
    return -1;   // unknown / declined / void
  }

  function getTriggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' &&
               typeof Knack.getUserAttributes === 'function')
        ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }

  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
  }

  // ═══ per-deployment instance ══════════════════════════════════════════
  function setup(DEP) {
    var VIEW        = DEP.VIEW;
    var CO_VIEW     = DEP.CO_VIEW;
    var STATUS_VIEW = DEP.STATUS_VIEW;
    var IS_OPS      = DEP.MODE === 'ops';
    var EVENT_NS    = DEP.NS;

    // Optimistic status override after a successful webhook fire — Make owns
    // the real write; this keeps the strip honest until the next read.
    var _optimistic = '';

    // ── status + snapshot reads ─────────────────────────────────────────
    function statusViewRecord() {
      if (!STATUS_VIEW) return null;
      try {
        var v = Knack.views[STATUS_VIEW];
        // Details view → model.attributes; grid → first row.
        if (v && v.model) {
          if (v.model.attributes && v.model.attributes.id) return v.model.attributes;
          var models = v.model.data && v.model.data.models;
          if (models && models.length) return models[0].attributes;
        }
      } catch (e) { /* fall through */ }
      return null;
    }

    function getStatus() {
      if (_optimistic) return _optimistic;
      var rec = statusViewRecord();
      if (rec) {
        var s = readTxt(rec, STATUS_FIELD);
        if (s) return s;
      }
      // Fallback: the header form's status block (hidden by co-header-card's
      // CSS but still in the DOM). If the field is EDITABLE on the form
      // (view_4092 carries it as a hidden dropdown so recall can PUT it),
      // read the selected value — the wrapper's textContent would concatenate
      // every option.
      var viewEl = document.getElementById(VIEW);
      var wrap = viewEl && viewEl.querySelector('#kn-input-' + STATUS_FIELD);
      if (!wrap) return '';
      var ctl = wrap.querySelector('select, input[type="radio"]:checked, input:not([type="radio"])');
      if (ctl && typeof ctl.value === 'string' && ctl.value.trim()) {
        return ctl.value.trim();
      }
      var clone = wrap.cloneNode(true);
      var strip = clone.querySelectorAll('label, p.kn-instructions');
      for (var i = 0; i < strip.length; i++) {
        if (strip[i].parentNode) strip[i].parentNode.removeChild(strip[i]);
      }
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getSnapshot() {
      if (!SNAPSHOT_FIELD) return null;
      var rec = statusViewRecord();
      if (!rec) return null;
      var raw = readTxt(rec, SNAPSHOT_FIELD);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function num(rec, key) {
      var raw = rec[key + '_raw'];
      if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
      var n = parseFloat(readTxt(rec, key).replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : 0;
    }

    // Read a field's current value off the CO header form — input value for
    // editable fields (CO name), rendered text for read-only ones (CO
    // number). Fields hidden by co-header-card's CSS are still in the DOM.
    function readHeaderValue(fieldKey) {
      var viewEl = document.getElementById(VIEW);
      if (!viewEl) return '';
      var input = viewEl.querySelector(
        '#kn-input-' + fieldKey + ' input, #kn-input-' + fieldKey + ' textarea');
      if (input && typeof input.value === 'string' && input.value.trim()) {
        return input.value.trim();
      }
      var wrap = viewEl.querySelector('#kn-input-' + fieldKey);
      if (!wrap) return '';
      var clone = wrap.cloneNode(true);
      var strip = clone.querySelectorAll('label, p.kn-instructions');
      for (var i = 0; i < strip.length; i++) {
        if (strip[i].parentNode) strip[i].parentNode.removeChild(strip[i]);
      }
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // The "ops proposed" money baseline, per CO line — what the Ops-Review
    // diff compares the sub's returned pricing against.
    function buildSnapshot() {
      var ns = window.SCW && window.SCW.worksheetV2;
      var recs = (ns && ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(CO_VIEW) : [];
      var lines = {};
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r || !r.id) continue;
        // Drop prefix (field_2240) is a connection — ship both the record id
        // (what Make writes/references) and the display text.
        var prefixRaw = r['field_2240_raw'];
        var prefixId = '';
        if (Array.isArray(prefixRaw) && prefixRaw.length && prefixRaw[0] && prefixRaw[0].id) {
          prefixId = prefixRaw[0].id;
        } else if (prefixRaw && prefixRaw.id) {
          prefixId = prefixRaw.id;
        }
        lines[r.id] = {
          label:    readTxt(r, 'field_1950'),   // computed drop label, e.g. "E-010"
          prefixId: prefixId,                   // Drop Prefix connection record id
          prefix:   readTxt(r, 'field_2240'),   // Drop Prefix display text, e.g. "E-"
          number:   num(r, 'field_1951'),       // drop number, e.g. 10
          action:   readTxt(r, 'field_2965'),
          subBid:   num(r, 'field_2150'),
          hrs:      num(r, 'field_1973'),
          mat:      num(r, 'field_1974'),
          fee:      num(r, 'field_2028'),
          equip:    num(r, 'field_2269')
        };
      }
      return {
        sentAt: new Date().toISOString(),
        sentBy: getTriggeredBy(),
        lines:  lines
      };
    }

    // ── the fixed record of WHAT WAS REQUESTED ──────────────────────────
    // A self-contained HTML card (inline styles only — renders anywhere) +
    // a plaintext twin, shipped in the webhook so Make can (a) store the
    // durable "this is exactly what we sent the sub" artifact and (b) drop
    // it on the ClickUp tasks (the subcontractor's AND ours) alongside the
    // status change. `note` = the send-back note, when present. `titleBase`
    // overrides the doc title — the sub's hand-back reuses this builder as
    // "Pricing Submission" (same lines/totals, the values ARE the sub's
    // submitted pricing).
    function buildRequestDoc(note, titleBase) {
      var ns = window.SCW && window.SCW.worksheetV2;
      var recs = (ns && ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(CO_VIEW) : [];
      var who = getTriggeredBy();
      var when = new Date();
      var coNumber = readHeaderValue('field_2123');
      var coName   = readHeaderValue('field_2126');

      function conn(r, key) {
        var raw = r[key + '_raw'];
        if (Array.isArray(raw) && raw.length && raw[0]) {
          return String(raw[0].identifier || '').trim();
        }
        return readTxt(r, key);
      }
      // ASCII minus — Make's HTML→PDF font subset drops U+2212 in some setups.
      function money(n) {
        return (n < 0 ? '-' : '') + '$' + Math.abs(n || 0)
          .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      // HEADEND display names compute with an empty ## segment ("HEADEND: :
      // behind cashregister") — collapse the doubled colon for the doc.
      function cleanLoc(s) { return String(s || '').replace(/:\s*:/g, ':').trim(); }

      // Collect entries first — the totals row and the grouped text need the
      // full set before rendering.
      var entries = [], nAdd = 0, nRm = 0;
      var tAdd = { bid: 0, eq: 0 }, tRm = { bid: 0, eq: 0 };
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r || !r.id) continue;
        var isRm = /remove/i.test(readTxt(r, 'field_2965'));
        // Services/assumptions rows have no product — fall back to the
        // labor description so every line names itself.
        var prod = conn(r, 'field_1949');
        var desc = readTxt(r, 'field_2020');
        var e = {
          isRm: isRm,
          item: prod || desc || '(item)',
          // Labor description rides under the item name — but not when it
          // already IS the item name (no-product services rows).
          desc: prod ? desc : '',
          drop: readTxt(r, 'field_1950'),
          loc:  cleanLoc(conn(r, 'field_1946')),
          qty:  num(r, 'field_1964') || 1,
          bid:  num(r, 'field_2150'),
          eq:   num(r, 'field_2269')
        };
        entries.push(e);
        var t = isRm ? tRm : tAdd;
        if (isRm) nRm++; else nAdd++;
        t.bid += e.bid; t.eq += e.eq;
      }
      var totBid = tAdd.bid + tRm.bid, totEq = tAdd.eq + tRm.eq;

      var title = (titleBase || 'Change Order Pricing Request') +
        (coNumber ? ' — ' + coNumber : '') + (coName ? ' · ' + coName : '');
      var sentLine = 'Sent by ' + (who.name || who.email || 'SCW') + ' · ' +
        when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      var countLine = nAdd + ' add' + (nAdd === 1 ? '' : 's') +
        ', ' + nRm + ' removal' + (nRm === 1 ? '' : 's');

      // ── HTML (the durable card + Make's PDF source) ──────────────────
      // Font: Helvetica/Arial only — PDF engines don't know system-ui and
      // fall back to Courier. Numeric cells: right-aligned + nowrap so a
      // leading minus sign can't wrap/clip in a tight column.
      // Roomier rows: rows carry a description line now, so cells get real
      // padding + top alignment (numbers stay on the item-name line).
      var NUM_TD = 'padding:8px 10px;border-bottom:1px solid #eef2f7;' +
        'text-align:right;white-space:nowrap;vertical-align:top;';
      var htmlRows = [];
      for (var h = 0; h < entries.length; h++) {
        var en = entries[h];
        var tint = en.isRm ? '#fff1f2' : '#f0fdf4';
        var bar  = en.isRm ? '#e11d48' : '#059669';
        htmlRows.push(
          '<tr style="background:' + tint + ';">' +
          '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;' +
            'box-shadow:inset 3px 0 0 ' + bar + ';font-weight:700;color:' +
            (en.isRm ? '#9f1239' : '#065f46') + ';white-space:nowrap;' +
            'vertical-align:top;">' +
            (en.isRm ? 'REMOVE' : 'ADD') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;' +
            'vertical-align:top;line-height:1.45;">' +
            '<span style="font-weight:600;">' + esc(en.item) + '</span>' +
            (en.drop || en.loc
              ? '<br><span style="color:#64748b;font-size:11px;">' +
                esc([en.drop, en.loc].filter(Boolean).join(' · ')) + '</span>'
              : '') +
            (en.desc
              ? '<div style="color:#475569;font-size:11px;margin-top:3px;">' +
                esc(en.desc) + '</div>'
              : '') + '</td>' +
          '<td style="' + NUM_TD + '">' + en.qty + '</td>' +
          '<td style="' + NUM_TD + '">' + esc(money(en.bid)) + '</td>' +
          '<td style="' + NUM_TD + '">' + esc(money(en.eq)) + '</td>' +
          '</tr>');
      }
      // Totals: adds/removals breakdown only when both exist, then the total.
      function footRow(label, bid, eq, isNet) {
        var td = 'padding:7px 10px;text-align:right;white-space:nowrap;' +
          (isNet ? 'border-top:2px solid #163C6E;font-weight:700;color:#163C6E;'
                 : 'font-weight:600;color:#334155;');
        return '<tr style="background:#f8fafc;">' +
          '<td colspan="3" style="' + td + '">' + esc(label) + '</td>' +
          '<td style="' + td + '">' + esc(money(bid)) + '</td>' +
          '<td style="' + td + '">' + esc(money(eq)) + '</td></tr>';
      }
      var foot = '';
      if (nAdd && nRm) {
        foot += footRow('Adds (' + nAdd + ')', tAdd.bid, tAdd.eq, false) +
                footRow('Removals (' + nRm + ')', tRm.bid, tRm.eq, false) +
                footRow('Net change', totBid, totEq, true);
      } else {
        foot += footRow('Total', totBid, totEq, true);
      }

      var html =
        '<div style="font-family:Helvetica,Arial,sans-serif;font-size:12.5px;' +
          'color:#1e293b;border:1px solid #dbe4ee;border-radius:8px;overflow:hidden;">' +
        '<div style="background:#163C6E;color:#fff;padding:8px 12px;font-weight:800;' +
          'font-size:12px;letter-spacing:.04em;text-transform:uppercase;">' + esc(title) + '</div>' +
        '<div style="padding:6px 12px;background:#f0f4fa;border-bottom:1px solid #dbe4ee;' +
          'color:#334155;font-size:11.5px;">' + esc(sentLine) + ' · ' + esc(countLine) + '</div>' +
        (note ? '<div style="padding:6px 12px;background:#fffbeb;border-bottom:1px solid ' +
          '#fde68a;color:#92400e;font-size:12px;"><b>Note:</b> ' + esc(note) + '</div>' : '') +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr>' +
          ['Action', 'Item', 'Qty', 'Baseline Bid', 'Equip'].map(function (hd, idx) {
            return '<th style="padding:5px ' + (idx >= 2 ? '10px' : '8px') + ';' +
              'background:#f8fafc;border-bottom:1px solid ' +
              '#dbe4ee;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;' +
              'color:#64748b;white-space:nowrap;text-align:' + (idx >= 2 ? 'right' : 'left') +
              ';">' + hd + '</th>';
          }).join('') +
        '</tr></thead><tbody>' + htmlRows.join('') + '</tbody>' +
        '<tfoot>' + foot + '</tfoot></table></div>';

      // ── Plain text (the ClickUp comment) ─────────────────────────────
      // Grouped by location, one item per line + an indented detail line,
      // totals block at the end — reads top-to-bottom instead of one dense
      // run-on line per item.
      var tx = [title, sentLine + ' · ' + countLine];
      if (note) tx.push('Note: ' + note);
      // Bucket by location (first-seen order) so a group can't split when the
      // model order interleaves locations.
      var locOrder = [], locMap = {};
      for (var g = 0; g < entries.length; g++) {
        var locKey = entries[g].loc || 'No location';
        if (!locMap[locKey]) { locMap[locKey] = []; locOrder.push(locKey); }
        locMap[locKey].push(entries[g]);
      }
      for (var lo = 0; lo < locOrder.length; lo++) {
        tx.push('');
        tx.push('== ' + locOrder[lo] + ' ==');
        var group = locMap[locOrder[lo]];
        for (var gi = 0; gi < group.length; gi++) {
          var et = group[gi];
          tx.push((et.isRm ? '- REMOVE  ' : '+ ADD  ') + et.item +
            (et.drop ? ' — ' + et.drop : ''));
          if (et.desc) tx.push('    ' + et.desc);
          tx.push('    qty ' + et.qty + ' · baseline sub bid ' + money(et.bid) +
            (et.eq ? ' · equip ' + money(et.eq) : ''));
        }
      }
      tx.push('');
      tx.push('== TOTALS ==');
      if (nAdd && nRm) {
        tx.push('Adds (' + nAdd + '): baseline sub bid ' + money(tAdd.bid) +
          ' · equip ' + money(tAdd.eq));
        tx.push('Removals (' + nRm + '): baseline sub bid ' + money(tRm.bid) +
          ' · equip ' + money(tRm.eq));
        tx.push('Net change: baseline sub bid ' + money(totBid) +
          ' · equip ' + money(totEq));
      } else {
        tx.push('Total: baseline sub bid ' + money(totBid) +
          ' · equip ' + money(totEq));
      }

      return { coNumber: coNumber, coName: coName, html: html, text: tx.join('\n') };
    }

    function fireWebhook(mode, extra, onOk) {
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_SEND_TO_SUB_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('The send-to-sub webhook is not configured yet.\n\n' +
          'Needs: the CO Sub Pricing Snapshot field, the Make scenario ' +
          '(store snapshot + flip CO Status + notify sub), then set ' +
          'MAKE_CO_SEND_TO_SUB_WEBHOOK in src/config.js.');
        return;
      }
      var coId = getCoSowId();
      if (!coId) { alert('Could not determine the change order record id from the URL.'); return; }

      var payload = { changeOrderId: coId, mode: mode, triggeredBy: getTriggeredBy() };
      if (extra) for (var k in extra) payload[k] = extra[k];

      setBusy(true);
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
        var ok = resp.ok;
        return resp.text().then(function (txt) {
          var body = null;
          try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
          return { ok: ok, data: body };
        });
      }).then(function (r) {
        setBusy(false);
        var explicitFail = !!(r.data && (r.data.success === false || r.data.error));
        if (r.ok && !explicitFail) { if (onOk) onOk(r.data); return; }
        alert((r.data && (r.data.error || r.data.message)) || 'The action failed. Try again.');
      }).catch(function (err) {
        setBusy(false);
        alert('Webhook error: ' + (err && err.message ? err.message : err));
      });
    }

    function setBusy(busy) {
      var el = document.getElementById(EL_ID);
      if (!el) return;
      var btns = el.querySelectorAll('.scw-co-stage-btn');
      for (var i = 0; i < btns.length; i++) {
        if (busy) btns[i].setAttribute('disabled', 'disabled');
        else btns[i].removeAttribute('disabled');
      }
    }

    // Also retint the header pill so the optimistic flip reads everywhere.
    function setPillText(text) {
      var pill = document.querySelector('#' + VIEW + ' .scw-co-hdr-pill');
      if (pill) pill.textContent = text;
    }

    function confirmThen(title, body, okLabel, fn) {
      var ns = window.SCW && window.SCW.worksheetV2;
      if (ns && typeof ns.confirmModal === 'function') {
        ns.confirmModal({ title: title, body: body, okLabel: okLabel, cancelLabel: 'Cancel' })
          .then(function (ok) { if (ok) fn(); });
      } else if (window.confirm(body)) {
        fn();
      }
    }

    // ── actions (ops only — the sub strip renders no buttons) ────────────
    function sendToSub() {
      confirmThen('Send to sub for pricing?',
        'Send this change order to the subcontractor for pricing? Current ' +
        'line pricing is snapshotted as the baseline, and the sub is notified.',
        'Send to Sub',
        function () {
          var doc = buildRequestDoc();
          fireWebhook('send', {
            snapshot:    buildSnapshot(),
            coNumber:    doc.coNumber,
            coName:      doc.coName,
            requestHtml: doc.html,
            requestText: doc.text
          }, function () {
            _optimistic = 'Pending Sub Pricing';
            setPillText('Pending Sub Pricing');
            render();
            managePoll();
            refreshLocks();
          });
        });
    }

    function nudgeSub() {
      confirmThen('Nudge the sub?',
        'Re-send the pricing request notification to the subcontractor?',
        'Nudge sub',
        function () {
          fireWebhook('nudge', {
            coNumber: readHeaderValue('field_2123'),
            coName:   readHeaderValue('field_2126')
          }, function () { render(); });
        });
    }

    // Recall writes CO Status DIRECTLY — a session-authed view-based PUT
    // through this form (field_2953 sits on view_4092 as a hidden dropdown
    // for exactly this). The send/sendback status flips stay Make-written;
    // recall's webhook is NOTIFY-ONLY (sub notification + ClickUp) and must
    // NOT write the status — an early Make branch that wrote it back was
    // masking this PUT as "not working."
    function putStatus(value, done) {
      var coId = getCoSowId();
      if (!coId) {
        alert('Could not determine the change order record id from the URL.');
        done(false); return;
      }
      if (!(window.SCW && typeof SCW.knackAjax === 'function' &&
            typeof SCW.knackRecordUrl === 'function')) {
        alert('Status write unavailable (SCW.knackAjax missing).');
        done(false); return;
      }
      var body = {};
      body[STATUS_FIELD] = value;
      var url = SCW.knackRecordUrl(VIEW, coId);
      console.info('[scw-co-stage] status PUT →', url, body);
      // No dataType — an empty/non-JSON 200 body must not read as an error.
      SCW.knackAjax({
        url:  url,
        type: 'PUT',
        data: JSON.stringify(body)
      }).then(function (resp) {
        console.info('[scw-co-stage] status PUT ok; response ' +
          STATUS_FIELD + ' =',
          resp && (resp[STATUS_FIELD] ||
            (resp.record && resp.record[STATUS_FIELD])));
        // Keep the hidden form dropdown in sync so later reads (the status
        // fallback, any form serialize) reflect the new value.
        var sel = document.querySelector(
          '#' + VIEW + ' #kn-input-' + STATUS_FIELD + ' select');
        if (sel) sel.value = value;
        done(true);
      }, function (xhr) {
        console.warn('[scw-co-stage] status PUT FAILED', xhr && xhr.status,
          xhr && xhr.responseText);
        alert('Could not update the CO status (HTTP ' +
          ((xhr && xhr.status) || '?') + ').\n\n' +
          ((xhr && xhr.responseText) || '').slice(0, 200));
        done(false);
      });
    }

    function recallFromSub() {
      confirmThen('Recall from sub?',
        'Take this change order back from the subcontractor? Their pricing ' +
        'window closes and they are notified. Any pricing they already ' +
        'entered stays on the lines.',
        'Recall from Sub',
        function () {
          setBusy(true);
          putStatus('Draft', function (ok) {
            setBusy(false);
            if (!ok) return;
            _optimistic = 'Draft';
            setPillText('Draft');
            render();
            managePoll();
            refreshLocks();
            // Notify-only webhook (sub notification + ClickUp statuses) —
            // the status is already written; a notify failure surfaces via
            // fireWebhook's alert but doesn't undo the recall.
            fireWebhook('recall', {
              coNumber: readHeaderValue('field_2123'),
              coName:   readHeaderValue('field_2126')
            }, function () {});
          });
        });
    }

    // ── sub hand-back: "Submit Pricing to SCW" ────────────────────────────
    // Lines with no Sub Bid yet — surfaced in the confirm copy so the sub
    // knows what they're about to hand back (informational, not a block:
    // $0/no-charge lines are legitimate).
    function countUnpriced() {
      var wsns = window.SCW && window.SCW.worksheetV2;
      var recs = (wsns && wsns.data && typeof wsns.data.readRecords === 'function')
        ? wsns.data.readRecords(CO_VIEW) : [];
      var n = 0;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r || !r.id) continue;
        var raw = r['field_2150_raw'];
        var txt = String(r['field_2150'] == null ? '' : r['field_2150'])
          .replace(/<[^>]*>/g, '').trim();
        if ((raw == null || raw === '') && !txt) n++;
      }
      return n;
    }

    // Fires mode:'sub-submit' — Make progresses CO Status → "Ops Review"
    // (forward flips stay Make-written), writes payload.snapshot verbatim to
    // the handoff-snapshot field (the submittal capture = the agreed cost
    // basis), notifies SCW + updates both ClickUp tasks. The optimistic flip
    // relocks this page instantly; the status-view refetch confirms.
    function submitToScw() {
      var blank = countUnpriced();
      confirmThen('Submit pricing to SCW?',
        'Send your pricing back to SCW for review? Your pricing window ' +
        'closes when you submit.' +
        (blank ? '\n\nHeads up: ' + blank + ' line item' +
          (blank === 1 ? ' has' : 's have') + ' no Sub Bid entered.' : ''),
        'Submit Pricing',
        function () {
          var doc = buildRequestDoc(null, 'Change Order Pricing Submission');
          fireWebhook('sub-submit', {
            snapshot:    buildSnapshot(),
            coNumber:    doc.coNumber,
            coName:      doc.coName,
            requestHtml: doc.html,
            requestText: doc.text
          }, function () {
            _optimistic = 'Ops Review';
            setPillText('Ops Review');
            render();
            managePoll();
            refreshLocks();
          });
        });
    }

    // Unlock/relock this deployment's page immediately after an optimistic
    // status flip (each lock reads status through its stage-strip surface,
    // which honors the flip), then refetch the status view so the durable
    // value replaces it.
    function refreshLocks() {
      try {
        var lock = IS_OPS ? SCW.coOpsLock : SCW.coSubLock;
        if (lock && typeof lock.refresh === 'function') lock.refresh();
        var v = Knack.views[STATUS_VIEW];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) { /* next render corrects it */ }
    }

    function sendBackToSub() {
      var note = window.prompt(
        'Note to the subcontractor (what needs revisiting):', '');
      if (note === null) return;   // cancelled
      var doc = buildRequestDoc(note);
      fireWebhook('sendback', {
        snapshot:    buildSnapshot(),
        note:        note,
        coNumber:    doc.coNumber,
        coName:      doc.coName,
        requestHtml: doc.html,
        requestText: doc.text
      }, function () {
        _optimistic = 'Pending Sub Pricing';
        setPillText('Pending Sub Pricing');
        render();
        managePoll();
        refreshLocks();
      });
    }

    // Issuing happens FROM THE PREVIEW PAGE (scene_1096) — ops reviews the
    // client-facing document, then fires the "Issue Change Order" step that
    // ops-stepper.js renders there in CO mode (full publish payload →
    // MAKE_CO_ISSUE_WEBHOOK). This button just takes them there.
    function previewIssue() {
      var coId = getCoSowId();
      if (!coId) { alert('Could not determine the change order record id from the URL.'); return; }
      window.location.hash = '#proposals/proposal/' + coId + '/';
    }

    // ── waiting copy ("With the sub since ⟨date⟩ — N days") ──────────────
    function waitingCopy() {
      var snap = getSnapshot();
      var sentAt = snap && snap.sentAt ? new Date(snap.sentAt) : null;
      if (!sentAt || isNaN(+sentAt)) return 'Waiting on subcontractor pricing';
      var days = Math.floor((Date.now() - sentAt.getTime()) / 86400000);
      var when = sentAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return 'With the sub since ' + when +
        (days > 0 ? ' — ' + days + ' day' + (days === 1 ? '' : 's') : '');
    }

    // ── render ────────────────────────────────────────────────────────────
    function stepsHtml(cur) {
      var out = '<div class="scw-co-steps">';
      for (var i = 0; i < STAGES.length; i++) {
        var cls = i < cur ? ' scw-co-step--done'
                : i === cur ? ' scw-co-step--done scw-co-step--current' : '';
        out += '<div class="scw-co-step' + cls + '">' +
          '<div class="scw-co-step-dot"></div>' +
          '<div class="scw-co-step-lbl">' + esc(STAGES[i].label) + '</div>' +
        '</div>';
      }
      return out + '</div>';
    }

    function opsActionsHtml(status, cur) {
      var s = String(status || '').toLowerCase();
      if (cur === 0) {
        return '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
          'data-scw-co-act="send">Send to Sub</button>' +
          '<span class="scw-co-stage-note">Sends the CO to the subcontractor to price.</span>';
      }
      if (cur === 1) {
        // Recall = the ops escape hatch while the ball is in the sub's court —
        // the internal page is mirror-LOCKED during Pending Sub Pricing
        // (co-ops-lock.js) so exactly one party holds the pen; recalling
        // closes the sub's window (Make flips status → Draft) instead of
        // letting ops edit underneath them.
        return '<span class="scw-co-stage-wait"><span class="scw-co-stage-pulse"></span>' +
          esc(waitingCopy()) + '</span>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="recall">Recall from Sub</button>' +
          '<span class="scw-co-stage-note">Recalling closes the sub’s pricing window and unlocks editing here.</span>';
        // Nudge sub — shelved 2026-07-14 (nice-to-have; wire later). The
        // 'nudge' handler + webhook mode:'nudge' contract stay in place:
        // + '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" '
        // + 'data-scw-co-act="nudge">Nudge sub</button>';
      }
      if (cur === 2) {
        return '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="sendback">Send back to sub</button>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
          'data-scw-co-act="preview-issue">Preview &amp; Issue &rarr;</button>' +
          '<span class="scw-co-stage-note">Review the client-facing document, then issue from there.</span>';
      }
      if (cur === 3) return '<span class="scw-co-stage-note">Sent for client signature — waiting on e-sign.</span>';
      if (cur === 4) return '<span class="scw-co-stage-note">Signed — applying changes to the install scope…</span>';
      if (cur === 5) return '<span class="scw-co-stage-note"><b>Applied.</b> Install scope updated and invoiced.</span>';
      if (/declined/.test(s)) return '<span class="scw-co-stage-note"><b>Declined.</b> Revise the lines and re-issue.</span>';
      if (/void/.test(s))     return '<span class="scw-co-stage-note"><b>Void.</b></span>';
      return '<span class="scw-co-stage-note">Status: ' + esc(status || 'unknown') + '</span>';
    }

    // Sub-facing copy: same stepper, no verbs — the sub's only actions are
    // editing the worksheet while their window is open (co-sub-lock handles
    // the lock/unlock) and, later, the hand-back submit verb.
    function subActionsHtml(status, cur) {
      var s = String(status || '').toLowerCase();
      if (cur === 0) {
        return '<span class="scw-co-stage-note">SCW is drafting this change order — ' +
          'you’ll be notified when it’s ready to price.</span>';
      }
      if (cur === 1) {
        return '<span class="scw-co-stage-wait scw-co-stage-wait--open">' +
          '<span class="scw-co-stage-pulse"></span>' +
          'Your pricing window is open — price the items below.</span>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
          'data-scw-co-act="sub-submit">Submit Pricing to SCW</button>' +
          '<span class="scw-co-stage-note">Submitting closes your pricing window and sends it to SCW for review.</span>';
      }
      if (cur === 2) return '<span class="scw-co-stage-note">Pricing submitted — SCW is reviewing.</span>';
      if (cur === 3) return '<span class="scw-co-stage-note">Issued — awaiting client signature.</span>';
      if (cur === 4) return '<span class="scw-co-stage-note">Signed — SCW is applying the changes.</span>';
      if (cur === 5) return '<span class="scw-co-stage-note"><b>Applied.</b></span>';
      if (/declined/.test(s)) return '<span class="scw-co-stage-note"><b>Declined</b> by the client.</span>';
      if (/void/.test(s))     return '<span class="scw-co-stage-note"><b>Void.</b></span>';
      return '<span class="scw-co-stage-note">Status: ' + esc(status || 'unknown') + '</span>';
    }

    function render() {
      var viewEl = document.getElementById(VIEW);
      var form = viewEl && viewEl.querySelector('form');
      if (!form) return;
      injectCss();

      var el = document.getElementById(EL_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = EL_ID;
        el.addEventListener('click', function (e) {
          var btn = e.target && e.target.closest && e.target.closest('[data-scw-co-act]');
          if (!btn) return;
          e.preventDefault();
          var act = btn.getAttribute('data-scw-co-act');
          if (!IS_OPS) {
            // The sub strip's one verb: hand the priced CO back to SCW.
            if (act === 'sub-submit') submitToScw();
            return;
          }
          if (act === 'send')          sendToSub();
          if (act === 'nudge')         nudgeSub();
          if (act === 'recall')        recallFromSub();
          if (act === 'sendback')      sendBackToSub();
          if (act === 'preview-issue') previewIssue();
        });
      }
      // Pin directly under the header row (co-header-card builds .scw-co-hdr
      // on its own timer — reposition every render).
      var hdr = form.querySelector('.scw-co-hdr');
      if (el.parentNode !== form || (hdr && hdr.nextElementSibling !== el)) {
        form.insertBefore(el, hdr ? hdr.nextSibling : form.firstChild);
      }

      var status = getStatus();
      var cur = stageIndex(status);
      var offPath = cur === -1 && /declined|void/i.test(status || '');
      el.className = offPath ? 'scw-co-stage--offpath' : '';
      el.innerHTML = stepsHtml(cur) +
        '<div class="scw-co-stage-actions">' +
        (IS_OPS ? opsActionsHtml(status, cur) : subActionsHtml(status, cur)) +
        '</div>';
    }

    // ── status polling while the ball is in the other court ──────────────
    // Only possible once the hidden STATUS_VIEW exists (forms can't refetch).
    // ops: polls during Pending Sub Pricing (waiting on the sub to submit).
    // sub: polls during Draft (waiting for the window to open), Pending Sub
    //      Pricing (to notice a recall closing the window), and Ops Review
    //      (to notice a send-back reopening it) — the status view's
    //      re-render also re-fires co-sub-lock, so the page locks/unlocks
    //      without a manual refresh.
    var _pollTimer = null;
    function shouldPoll() {
      var cur = stageIndex(getStatus());
      return IS_OPS ? cur === 1 : (cur === 0 || cur === 1 || cur === 2);
    }
    function managePoll() {
      var pending = shouldPoll();
      if (pending && STATUS_VIEW && !_pollTimer) {
        _pollTimer = setInterval(function () {
          try {
            var v = Knack.views[STATUS_VIEW];
            if (v && v.model && typeof v.model.fetch === 'function') {
              v.model.fetch();   // its view-render re-triggers render() below
            }
          } catch (e) { /* keep polling */ }
        }, POLL_MS);
      } else if ((!pending || !STATUS_VIEW) && _pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
    }

    function soon() {
      // After co-header-card's 50ms enhance so .scw-co-hdr exists; before/after
      // doesn't matter for correctness (we reposition), just avoids a reflow.
      setTimeout(function () { render(); managePoll(); }, 80);
      setTimeout(function () { render(); managePoll(); }, 600);
    }

    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(VIEW, soon, EVENT_NS);
      if (STATUS_VIEW) SCW.onViewRender(STATUS_VIEW, soon, EVENT_NS);
    }
    $(document).off('knack-view-render.' + VIEW + EVENT_NS)
      .on('knack-view-render.' + VIEW + EVENT_NS, soon);

    // Shared surface: current status (honors the optimistic flip) + the
    // send-to-sub pricing baseline. The ops instance is SCW.coStage — read
    // by co-ops-lock.js and the Ops-Review diff; the sub instance is
    // SCW.coStageSub (co-sub-lock reads view_4122 directly, but the surface
    // is there if anything needs the sub-page status).
    window.SCW = window.SCW || {};
    SCW[IS_OPS ? 'coStage' : 'coStageSub'] =
      { getStatus: getStatus, getSnapshot: getSnapshot, refresh: render };
  }

  for (var d = 0; d < DEPLOYMENTS.length; d++) setup(DEPLOYMENTS[d]);
})();
/*** END: CO stage strip ***************************************************/
