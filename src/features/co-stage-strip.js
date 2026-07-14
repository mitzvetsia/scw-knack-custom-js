/*** CHANGE ORDER STAGE STRIP (view_4092) **********************************
 *
 * "Where is this CO and whose court is the ball in" — a compact stepper +
 * exactly one primary action per status, rendered into the CO header card
 * between the header row and the value strip:
 *
 *   Draft ── Sub Pricing ── Ops Review ── Issued ── Signed ── Applied
 *   [ Send to Sub ]                    (action area matches the status)
 *
 * Status → action (one writer per status, docs/change-orders.md):
 *   Draft               → [Send to Sub]  (snapshot + webhook, status flip
 *                         happens in Make — the one writer)
 *   Pending Sub Pricing → waiting state "With the sub since ⟨date⟩ — N days"
 *                         + [Nudge sub] (re-notify only, no state change)
 *   Ops Review          → [Send back to sub] [Preview & Issue →]
 *                         (destructive/secondary first, primary last; the
 *                         Issue itself fires from the preview page's CO-mode
 *                         ops stepper — see ops-stepper.js issue-change-order)
 *   Issued/Accepted/Applied/Declined/Void → informational notes.
 *
 * Send to Sub also captures the PRICING SNAPSHOT (the "ops proposed" money
 * baseline, per line) and ships it in the webhook payload — Make writes it
 * verbatim to the CO header's snapshot field. The Ops-Review diff ("what
 * did the sub change") reads it back from the hidden status view.
 *
 * Builder dependencies (fill the CFG placeholders as they land):
 *   - STATUS_VIEW: hidden details view on scene_1362 showing the CO record
 *     with CO Status (field_2953) + the snapshot field. Read + poll target.
 *   - SNAPSHOT_FIELD: the `CO Sub Pricing Snapshot` paragraph field key.
 *   - MAKE_CO_SEND_TO_SUB_WEBHOOK / MAKE_CO_ISSUE_WEBHOOK in SCW.CONFIG.
 * Until they exist: status falls back to view_4092's (hidden) field_2953
 * value, and the buttons alert what's missing instead of firing.
 ***************************************************************************/
(function () {
  'use strict';

  var VIEW      = 'view_4092';   // CO header form (mount target)
  var CO_VIEW   = 'view_4079';   // CO worksheet (snapshot source)
  var EL_ID     = 'scw-co-stage';
  var STYLE_ID  = 'scw-co-stage-css';
  var EVENT_NS  = '.scwCoStage';

  var CFG = {
    // Hidden details view (CO record: status + snapshot) on scene_1362.
    // Hidden via hide-data-source-views.js; model is the read/poll target.
    STATUS_VIEW:    'view_4109',
    // `CO Sub Pricing Snapshot` field key on the SOW object (paragraph
    // text, JSON — written only by the send-to-sub Make scenario).
    SNAPSHOT_FIELD: 'field_2972',
    STATUS_FIELD:   'field_2953',
    // Poll cadence while the CO sits in Pending Sub Pricing (only when
    // STATUS_VIEW is configured — a form view can't be refetched).
    POLL_MS:        30 * 1000
  };

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

  // Optimistic status override after a successful webhook fire — Make owns
  // the real write; this keeps the strip honest until the next read.
  var _optimistic = '';

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
      '@keyframes scwCoPulse{0%,100%{opacity:1;}50%{opacity:.3;}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── status + snapshot reads ───────────────────────────────────────────
  function readTxt(rec, key) {
    var v = rec && rec[key];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function statusViewRecord() {
    if (!CFG.STATUS_VIEW) return null;
    try {
      var v = Knack.views[CFG.STATUS_VIEW];
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
      var s = readTxt(rec, CFG.STATUS_FIELD);
      if (s) return s;
    }
    // Fallback: view_4092's read-only status block (hidden by
    // co-header-card's CSS but still in the DOM).
    var viewEl = document.getElementById(VIEW);
    var wrap = viewEl && viewEl.querySelector('#kn-input-' + CFG.STATUS_FIELD);
    if (!wrap) return '';
    var clone = wrap.cloneNode(true);
    var strip = clone.querySelectorAll('label, p.kn-instructions');
    for (var i = 0; i < strip.length; i++) {
      if (strip[i].parentNode) strip[i].parentNode.removeChild(strip[i]);
    }
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getSnapshot() {
    if (!CFG.SNAPSHOT_FIELD) return null;
    var rec = statusViewRecord();
    if (!rec) return null;
    var raw = readTxt(rec, CFG.SNAPSHOT_FIELD);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function stageIndex(status) {
    var s = String(status || '').toLowerCase();
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].match.test(s)) return i;
    }
    return -1;   // unknown / declined / void
  }

  // ── webhook plumbing (shared shape with co-remove.js) ─────────────────
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
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

  function num(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    var n = parseFloat(readTxt(rec, key).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  // Read a field's current value off the CO header form (view_4092) —
  // input value for editable fields (CO name), rendered text for
  // read-only ones (CO number). Fields hidden by co-header-card's CSS
  // are still in the DOM.
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
  // status change. `note` = the send-back note, when present.
  function buildRequestDoc(note) {
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
    function money(n) {
      return (n < 0 ? '−' : '') + '$' + Math.abs(n || 0)
        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    var htmlRows = [], textLines = [], nAdd = 0, nRm = 0;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      var isRm = /remove/i.test(readTxt(r, 'field_2965'));
      if (isRm) nRm++; else nAdd++;
      // Services/assumptions rows have no product — fall back to the
      // labor description so every line names itself.
      var item = conn(r, 'field_1949') || readTxt(r, 'field_2020') || '(item)';
      var drop = readTxt(r, 'field_1950');
      var loc  = conn(r, 'field_1946');
      var qty  = num(r, 'field_1964') || 1;
      var bid  = num(r, 'field_2150');
      var eq   = num(r, 'field_2269');
      var tint = isRm ? '#fff1f2' : '#f0fdf4';
      var bar  = isRm ? '#e11d48' : '#059669';
      htmlRows.push(
        '<tr style="background:' + tint + ';">' +
        '<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;' +
          'box-shadow:inset 3px 0 0 ' + bar + ';font-weight:700;color:' +
          (isRm ? '#9f1239' : '#065f46') + ';white-space:nowrap;">' +
          (isRm ? 'REMOVE' : 'ADD') + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;">' + esc(item) +
          (drop || loc
            ? '<br><span style="color:#64748b;font-size:11px;">' +
              esc([drop, loc].filter(Boolean).join(' · ')) + '</span>'
            : '') + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;text-align:right;">' + qty + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;text-align:right;">' + esc(money(bid)) + '</td>' +
        '<td style="padding:4px 8px;border-bottom:1px solid #eef2f7;text-align:right;">' + esc(money(eq)) + '</td>' +
        '</tr>');
      textLines.push('[' + (isRm ? 'REMOVE' : 'ADD') + '] ' + item +
        (drop ? ' — ' + drop : '') + (loc ? ' · ' + loc : '') +
        ' · qty ' + qty + ' · baseline sub bid ' + money(bid) +
        (eq ? ' · equip ' + money(eq) : ''));
    }

    var title = 'Change Order Pricing Request' +
      (coNumber ? ' — ' + coNumber : '') + (coName ? ' · ' + coName : '');
    var sentLine = 'Sent by ' + (who.name || who.email || 'SCW') + ' · ' +
      when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    var html =
      '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:12.5px;' +
        'color:#1e293b;border:1px solid #dbe4ee;border-radius:8px;overflow:hidden;">' +
      '<div style="background:#163C6E;color:#fff;padding:8px 12px;font-weight:800;' +
        'font-size:12px;letter-spacing:.04em;text-transform:uppercase;">' + esc(title) + '</div>' +
      '<div style="padding:6px 12px;background:#f0f4fa;border-bottom:1px solid #dbe4ee;' +
        'color:#334155;font-size:11.5px;">' + esc(sentLine) +
        ' · ' + nAdd + ' add' + (nAdd === 1 ? '' : 's') +
        ', ' + nRm + ' removal' + (nRm === 1 ? '' : 's') + '</div>' +
      (note ? '<div style="padding:6px 12px;background:#fffbeb;border-bottom:1px solid ' +
        '#fde68a;color:#92400e;font-size:12px;"><b>Note:</b> ' + esc(note) + '</div>' : '') +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr>' +
        ['Action', 'Item', 'Qty', 'Baseline Bid', 'Equip'].map(function (h, idx) {
          return '<th style="padding:5px 8px;background:#f8fafc;border-bottom:1px solid ' +
            '#dbe4ee;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;' +
            'color:#64748b;text-align:' + (idx >= 2 ? 'right' : 'left') + ';">' + h + '</th>';
        }).join('') +
      '</tr></thead><tbody>' + htmlRows.join('') + '</tbody></table></div>';

    var text = title + '\n' + sentLine +
      (note ? '\nNote: ' + note : '') + '\n' +
      textLines.join('\n') +
      '\nAdds: ' + nAdd + ' · Removals: ' + nRm;

    return { coNumber: coNumber, coName: coName, html: html, text: text };
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

  // ── actions ───────────────────────────────────────────────────────────
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

  function actionsHtml(status, cur) {
    var s = String(status || '').toLowerCase();
    if (cur === 0) {
      return '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
        'data-scw-co-act="send">Send to Sub</button>' +
        '<span class="scw-co-stage-note">Sends the CO to the subcontractor to price.</span>';
    }
    if (cur === 1) {
      return '<span class="scw-co-stage-wait"><span class="scw-co-stage-pulse"></span>' +
        esc(waitingCopy()) + '</span>';
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
        if (act === 'send')          sendToSub();
        if (act === 'nudge')         nudgeSub();
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
      '<div class="scw-co-stage-actions">' + actionsHtml(status, cur) + '</div>';
  }

  // ── status polling while the ball is in the sub's court ──────────────
  // Only possible once the hidden STATUS_VIEW exists (forms can't refetch).
  var _pollTimer = null;
  function managePoll() {
    var pending = stageIndex(getStatus()) === 1;
    if (pending && CFG.STATUS_VIEW && !_pollTimer) {
      _pollTimer = setInterval(function () {
        try {
          var v = Knack.views[CFG.STATUS_VIEW];
          if (v && v.model && typeof v.model.fetch === 'function') {
            v.model.fetch();   // its view-render re-triggers render() below
          }
        } catch (e) { /* keep polling */ }
      }, CFG.POLL_MS);
    } else if ((!pending || !CFG.STATUS_VIEW) && _pollTimer) {
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
    if (CFG.STATUS_VIEW) SCW.onViewRender(CFG.STATUS_VIEW, soon, EVENT_NS);
  }
  $(document).off('knack-view-render.' + VIEW + EVENT_NS)
    .on('knack-view-render.' + VIEW + EVENT_NS, soon);

  // Shared surface for the Ops-Review diff module (next piece): current
  // status + the send-to-sub pricing baseline.
  window.SCW = window.SCW || {};
  SCW.coStage = { getStatus: getStatus, getSnapshot: getSnapshot, refresh: render };
})();
/*** END: CO stage strip ***************************************************/
