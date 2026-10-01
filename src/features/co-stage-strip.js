/*** CHANGE ORDER STAGE STRIP (view_4092 ops · view_4121 sub) **************
 *
 * "Where is this CO and whose court is the ball in" — a compact stepper +
 * exactly one primary action per status, rendered into the CO header card
 * between the header row and the value strip:
 *
 *   Draft ── Sub Pricing ── Ops Review ── Issued ── Accepted
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
 *     Issued/Accepted (- Billable / - Not Billable)/Declined/Void → notes.
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
  // "Authorize as not billable" (Ops Review exit, 2026-10-01): the CO is
  // approved — the sub is told so and the scope changes apply — but the
  // client is never sent a document, never e-signs, and is never invoiced.
  // It RIDES THE ISSUE SCENARIO (13.03, MAKE_CO_ISSUE_WEBHOOK, stepId
  // 'authorize-not-billable') — the same scenario that creates the locked
  // Proposal + Acceptance records on a normal Issue — but fired from THIS
  // page with a reduced payload built here (no client proposal DOM needed):
  // the raw line snapshot (`jsonString`, same `{ sowRecordId, view_3896 }`
  // shape the preview page ships, from view_4079's records), an INTERNAL
  // authorization card as `htmlPdf`/`html` (sub labor + equipment + the
  // reason — never tokenized for a client), the totals, the reason,
  // triggeredBy. Make's route: Proposal (Type CO, no token) + Acceptance
  // (Type CO) stamped with the ACCEPTANCE FLAGS + the reason, CO Status →
  // "Accepted" (Make-written, like Issue), sub notification + ClickUp,
  // then the 13.06b true-up webhook exactly as the signed scenario calls
  // it. No esignatures, no Xero.
  //
  // WHERE THE TRUTH LIVES (decided 2026-10-01): the SOW's CO Status is the
  // STAGE rollup only — one terminal value, "Accepted", for every path.
  // Billability / signature / the reason live on the ACCEPTANCE record as
  // flags (same family as approved-for-terms / payment / signed):
  //   field_2766 FLAG_agreement signed          — the esignatures event
  //   field_3309 FLAG_approved without signature — SCW accepted it (either
  //                                               new path)
  //   field_3310 FLAG_not billable               — never invoice it
  //   field_3311 INPUT_approved not billable reason — the ops reason
  // This page reads them from a hidden Acceptance grid on the CO scene
  // (ACC.view = view_4164: acceptances on the parent page's PROJECT, with
  // those columns + field_2755); it matches the row whose proposal is one
  // of this CO's published proposals (PUBLISHED_VIEW). If the grid hasn't
  // loaded yet it fails open to a same-browser marker written at the
  // click, so the user who authorized still sees the state.
  var NB_STATUS  = 'Accepted';
  var NB_STEP_ID = 'authorize-not-billable';
  var ACC = {
    view:      'view_4164',   // hidden Acceptance grid on the CO edit scene
    proposal:  'field_2755',  // acceptance → proposal connection
    signed:    'field_2766',
    noSig:     'field_3309',
    notBill:   'field_3310',
    reason:    'field_3311'   // INPUT_approved not billable reason
  };
  var NB_LS_PREFIX = 'scw-co-not-billable:';
  var POLL_MS        = 30 * 1000;

  var DEPLOYMENTS = [
    // PUBLISHED_VIEW (ops, optional): a hidden published-proposals grid on
    // the CO scene (view_3886-style, filtered to this SOW). When present,
    // the Issued/Signed/Applied stages render the proposal name + PDF +
    // customer link inline via SCW.publishedQuoteInfo. Until it exists the
    // strip links to the preview page, which already shows all of it.
    { VIEW: 'view_4092', CO_VIEW: 'view_4079', STATUS_VIEW: 'view_4109',
      PUBLISHED_VIEW: 'view_4125', MODE: 'ops', NS: '.scwCoStage' },
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
    // Terminal — one value for every path (e-signed, approved without
    // signature, not billable); the Acceptance flags say which.
    { key: 'accepted', label: 'Accepted',    match: /^accepted/ }
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
      // Two columns: stepper + status/actions left, published-proposal
      // card (Issued+) docked in the white space to the right.
      '#' + EL_ID + '{display:flex;align-items:flex-start;gap:28px;',
      'padding:10px 0 12px;margin-bottom:2px;border-bottom:1px solid #e2e8f0;}',
      '.scw-co-stage-main{flex:1 1 auto;min-width:0;}',
      '.scw-co-stage-side{flex:0 0 auto;max-width:320px;padding:2px 8px 0 0;}',
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
      '@keyframes scwCoPulse{0%,100%{opacity:1;}50%{opacity:.3;}}',
      // ── Skip Sub Pricing modal ──
      '.scw-co-skip-ovl{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.45);',
      'display:flex;align-items:center;justify-content:center;padding:20px;}',
      '.scw-co-skip-card{background:#fff;border-radius:12px;width:440px;max-width:100%;',
      'box-shadow:0 20px 50px rgba(15,23,42,.3);padding:20px 22px 18px;box-sizing:border-box;}',
      '.scw-co-skip-title{font:700 15px/1.3 system-ui,-apple-system,sans-serif;color:#1e293b;',
      'margin-bottom:6px;}',
      '.scw-co-skip-body{font:400 12.5px/1.5 system-ui,-apple-system,sans-serif;color:#475569;',
      'margin-bottom:14px;}',
      '.scw-co-skip-lbl{display:block;font:600 12px/1.3 system-ui,-apple-system,sans-serif;',
      'color:#334155;margin-bottom:12px;}',
      '.scw-co-skip-file{display:block;margin-top:5px;font:400 12px/1.3 system-ui,sans-serif;',
      'color:#334155;width:100%;}',
      '.scw-co-skip-nobid{display:flex;align-items:flex-start;gap:8px;cursor:pointer;',
      'font:400 12px/1.45 system-ui,-apple-system,sans-serif;color:#334155;',
      'margin:-4px 0 12px;}',
      '.scw-co-skip-nobid input{width:14px;height:14px;margin:1px 0 0;flex:0 0 auto;',
      'accent-color:#0f4c75;cursor:pointer;}',
      '.scw-co-skip-note{display:block;margin-top:5px;width:100%;box-sizing:border-box;',
      'border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;resize:vertical;',
      'font:400 12.5px/1.45 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-co-skip-note:focus{outline:none;border-color:#0f4c75;',
      'box-shadow:0 0 0 2px rgba(15,76,117,.15);}',
      '.scw-co-skip-err{font:600 12px/1.4 system-ui,sans-serif;color:#be123c;',
      'background:#fff1f2;border:1px solid #fecdd3;border-radius:7px;padding:7px 10px;',
      'margin-bottom:12px;}',
      '.scw-co-skip-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:4px;}',
      // ── Not billable ──
      // Header tag next to the status pill (slate — a state, not a warning)
      '.scw-co-hdr-nb{display:inline-flex;align-items:center;margin-left:8px;',
      'padding:4px 10px;border-radius:999px;background:#f1f5f9;border:1px solid #cbd5e1;',
      'font:700 10.5px/1.2 system-ui,-apple-system,sans-serif;color:#475569;',
      'letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;}',
      '.scw-co-hdr-nb--nosig{background:#fffbeb;border-color:#fde68a;color:#b45309;}',
      // Terminal "Accepted" summary card — one component, three accents:
      // slate (not billable), amber (approved without signature), green
      // (e-signed). Replaces the old chip + run-on sentence.
      '.scw-co-acc{display:flex;flex-direction:column;gap:7px;width:100%;max-width:640px;',
      'box-sizing:border-box;padding:11px 14px 11px 16px;border-radius:9px;',
      'background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid var(--scw-co-acc,#16a34a);}',
      '.scw-co-acc--nb{--scw-co-acc:#64748b;}',
      '.scw-co-acc--nosig{--scw-co-acc:#d97706;background:#fffdf7;border-color:#fde68a;}',
      '.scw-co-acc--signed{--scw-co-acc:#16a34a;background:#f7fdf9;border-color:#bbf7d0;}',
      '.scw-co-acc-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.scw-co-acc-title{font:800 11px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.06em;',
      'text-transform:uppercase;color:var(--scw-co-acc,#16a34a);}',
      '.scw-co-acc--nb .scw-co-acc-title{color:#475569;}',
      '.scw-co-acc--nosig .scw-co-acc-title{color:#b45309;}',
      '.scw-co-acc--signed .scw-co-acc-title{color:#15803d;}',
      '.scw-co-acc-meta{font:500 11.5px/1.3 system-ui,-apple-system,sans-serif;color:#64748b;}',
      '.scw-co-acc-reason{font:400 13px/1.5 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-co-acc-reason b{font-weight:600;color:#475569;margin-right:4px;}',
      '.scw-co-acc-facts{display:flex;flex-wrap:wrap;gap:6px;}',
      '.scw-co-acc-fact{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;',
      'border-radius:999px;background:#fff;border:1px solid #e2e8f0;',
      'font:600 10.5px/1.2 system-ui,-apple-system,sans-serif;color:#475569;white-space:nowrap;}',
      '.scw-co-acc-fact:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--scw-co-acc,#16a34a);}',
      '.scw-co-nb-note{display:block;margin-top:5px;width:100%;box-sizing:border-box;',
      'border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;resize:vertical;',
      'font:400 12.5px/1.45 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-co-nb-note:focus{outline:none;border-color:#0f4c75;',
      'box-shadow:0 0 0 2px rgba(15,76,117,.15);}',
      '.scw-co-nb-list{margin:0 0 14px;padding-left:18px;',
      'font:400 12.5px/1.5 system-ui,-apple-system,sans-serif;color:#475569;}',
      '.scw-co-nb-list b{color:#1e293b;}'
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
    // Recurring licenses (License bucket) are never the sub's to price:
    // they stay out of the sub-pricing snapshot, the request document and
    // the unpriced count. The CO proposal bills them under Recurring
    // Services on its own.
    var LICENSE_BUCKET = '645554dce6f3a60028362a6a';
    function isLicenseLine(r) {
      try {
        var ws = window.SCW && window.SCW.worksheetV2;
        if (ws && ws.card && typeof ws.card.isLicenseBucket === 'function') return ws.card.isLicenseBucket(r, CO_VIEW);
      } catch (e) { /* fall through */ }
      var raw = r && r['field_2219_raw'];
      var one = Array.isArray(raw) ? raw[0] : raw;
      return !!one && (one.id === LICENSE_BUCKET || /^\s*licen[cs]e/i.test(String(one.identifier || '')));
    }
    function buildSnapshot() {
      var ns = window.SCW && window.SCW.worksheetV2;
      var recs = (ns && ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(CO_VIEW) : [];
      var lines = {};
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r || !r.id || isLicenseLine(r)) continue;
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
          item:     readTxt(r, 'field_1949'),   // product name (names removed lines in the diff)
          prefixId: prefixId,                   // Drop Prefix connection record id
          prefix:   readTxt(r, 'field_2240'),   // Drop Prefix display text, e.g. "E-"
          number:   num(r, 'field_1951'),       // drop number, e.g. 10
          action:   readTxt(r, 'field_2965'),
          qty:      num(r, 'field_1964'),
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
    // opts.equip  — add an Equipment column (field_2269, extended) + its
    //               totals: the not-billable authorization card shows the
    //               full cost picture (sub labor + equipment), not just the
    //               labor the sub-pricing loop trades.
    // opts.banner — { label, text } highlighted band under the title (the
    //               not-billable REASON); `note` stays the amber send note.
    // opts.verb   — "Sent by" → e.g. "Authorized by".
    function buildRequestDoc(note, titleBase, opts) {
      opts = opts || {};
      var withEquip = !!opts.equip;
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
      // full set before rendering. LABOR ONLY: the sub pricing loop trades
      // labor numbers (sub bid); equipment pricing never rides this doc.
      var entries = [], nAdd = 0, nRm = 0;
      var tAdd = { bid: 0, equip: 0 }, tRm = { bid: 0, equip: 0 };
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (!r || !r.id || isLicenseLine(r)) continue;
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
          // field_2269 is the EXTENDED equipment amount (qty already in).
          equip: withEquip ? num(r, 'field_2269') : 0
        };
        // field_2150 is the PER-UNIT sub bid — the doc's line amount and the
        // totals are extended (qty × each), matching how the line is billed.
        e.total = e.qty * e.bid;
        entries.push(e);
        var t = isRm ? tRm : tAdd;
        if (isRm) nRm++; else nAdd++;
        t.bid += e.total;
        t.equip += e.equip;
      }
      var totBid = tAdd.bid + tRm.bid;
      var totEquip = tAdd.equip + tRm.equip;
      var nCols = withEquip ? 5 : 4;

      // Bucket by MDF/IDF location (first-seen order) — shared by the HTML
      // table (location header rows) and the plaintext groups, so both read
      // in the same order as the worksheet and a group can't split when the
      // model order interleaves locations.
      var locOrder = [], locMap = {};
      for (var g = 0; g < entries.length; g++) {
        var locKey = entries[g].loc || 'No location';
        if (!locMap[locKey]) { locMap[locKey] = []; locOrder.push(locKey); }
        locMap[locKey].push(entries[g]);
      }

      var title = (titleBase || 'Change Order Pricing Request') +
        (coNumber ? ' — ' + coNumber : '') + (coName ? ' · ' + coName : '');
      var sentLine = (opts.verb || 'Sent by') + ' ' + (who.name || who.email || 'SCW') + ' · ' +
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
      for (var lg = 0; lg < locOrder.length; lg++) {
        // MDF/IDF location header band — same grouping/order as the
        // worksheet, so the priced quote reads like the drafting surface.
        htmlRows.push(
          '<tr><td colspan="' + nCols + '" style="background:#e8eef7;color:#163C6E;' +
          'font-weight:800;font-size:11px;letter-spacing:.05em;' +
          'text-transform:uppercase;padding:6px 10px;' +
          'border-bottom:1px solid #dbe4ee;">' + esc(locOrder[lg]) + '</td></tr>');
        var grp = locMap[locOrder[lg]];
        for (var h = 0; h < grp.length; h++) {
          var en = grp[h];
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
              // Location moved to the group header — only the drop rides here.
              (en.drop
                ? '<br><span style="color:#64748b;font-size:11px;">' +
                  esc(en.drop) + '</span>'
                : '') +
              (en.desc
                ? '<div style="color:#475569;font-size:11px;margin-top:3px;">' +
                  esc(en.desc) + '</div>'
                : '') + '</td>' +
            '<td style="' + NUM_TD + '">' + en.qty + '</td>' +
            // Line total (qty × each); the per-unit price rides beneath it
            // whenever qty > 1 so the math is visible on the doc.
            '<td style="' + NUM_TD + '">' + esc(money(en.total)) +
              (en.qty > 1
                ? '<br><span style="color:#64748b;font-size:10.5px;' +
                  'font-weight:400;">' + en.qty + ' × ' + esc(money(en.bid)) +
                  ' each</span>'
                : '') + '</td>' +
            (withEquip
              ? '<td style="' + NUM_TD + '">' + esc(money(en.equip)) + '</td>'
              : '') +
            '</tr>');
        }
      }
      // Totals: adds/removals breakdown only when both exist, then the total.
      function footRow(label, bid, isNet, equip) {
        var td = 'padding:7px 10px;text-align:right;white-space:nowrap;' +
          (isNet ? 'border-top:2px solid #163C6E;font-weight:700;color:#163C6E;'
                 : 'font-weight:600;color:#334155;');
        return '<tr style="background:#f8fafc;">' +
          '<td colspan="3" style="' + td + '">' + esc(label) + '</td>' +
          '<td style="' + td + '">' + esc(money(bid)) + '</td>' +
          (withEquip ? '<td style="' + td + '">' + esc(money(equip)) + '</td>' : '') +
          '</tr>';
      }
      var foot = '';
      if (nAdd && nRm) {
        foot += footRow('Adds (' + nAdd + ')', tAdd.bid, false, tAdd.equip) +
                footRow('Removals (' + nRm + ')', tRm.bid, false, tRm.equip) +
                footRow('Net change', totBid, true, totEquip);
      } else {
        foot += footRow('Total', totBid, true, totEquip);
      }

      var html =
        '<div style="font-family:Helvetica,Arial,sans-serif;font-size:12.5px;' +
          'color:#1e293b;border:1px solid #dbe4ee;border-radius:8px;overflow:hidden;">' +
        '<div style="background:#163C6E;color:#fff;padding:8px 12px;font-weight:800;' +
          'font-size:12px;letter-spacing:.04em;text-transform:uppercase;">' + esc(title) + '</div>' +
        '<div style="padding:6px 12px;background:#f0f4fa;border-bottom:1px solid #dbe4ee;' +
          'color:#334155;font-size:11.5px;">' + esc(sentLine) + ' · ' + esc(countLine) + '</div>' +
        (opts.banner ? '<div style="padding:8px 12px;background:#f1f5f9;border-bottom:1px solid ' +
          '#cbd5e1;color:#334155;font-size:12px;"><b>' + esc(opts.banner.label) + '</b> ' +
          esc(opts.banner.text) + '</div>' : '') +
        (note ? '<div style="padding:6px 12px;background:#fffbeb;border-bottom:1px solid ' +
          '#fde68a;color:#92400e;font-size:12px;"><b>Note:</b> ' + esc(note) + '</div>' : '') +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr>' +
          (withEquip
            ? ['Action', 'Item', 'Qty', 'Sub Bid (Labor)', 'Equipment']
            : ['Action', 'Item', 'Qty', 'Sub Bid (Labor)']).map(function (hd, idx) {
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
      if (opts.banner) tx.push(opts.banner.label + ' ' + opts.banner.text);
      if (note) tx.push('Note: ' + note);
      // Same location buckets as the HTML table above.
      for (var lo = 0; lo < locOrder.length; lo++) {
        tx.push('');
        tx.push('== ' + locOrder[lo] + ' ==');
        var group = locMap[locOrder[lo]];
        for (var gi = 0; gi < group.length; gi++) {
          var et = group[gi];
          tx.push((et.isRm ? '- REMOVE  ' : '+ ADD  ') + et.item +
            (et.drop ? ' — ' + et.drop : ''));
          if (et.desc) tx.push('    ' + et.desc);
          tx.push('    qty ' + et.qty + ' · sub bid (labor) ' +
            (et.qty > 1
              ? money(et.bid) + ' each · line total ' + money(et.total)
              : money(et.total)) +
            (withEquip ? ' · equipment ' + money(et.equip) : ''));
        }
      }
      function eq(v) { return withEquip ? ' · equipment ' + money(v) : ''; }
      tx.push('');
      tx.push('== TOTALS (labor' + (withEquip ? ' · equipment' : '') + ') ==');
      if (nAdd && nRm) {
        tx.push('Adds (' + nAdd + '): ' + money(tAdd.bid) + eq(tAdd.equip));
        tx.push('Removals (' + nRm + '): ' + money(tRm.bid) + eq(tRm.equip));
        tx.push('Net change: ' + money(totBid) + eq(totEquip));
      } else {
        tx.push('Total: ' + money(totBid) + eq(totEquip));
      }

      return {
        coNumber: coNumber, coName: coName, html: html, text: tx.join('\n'),
        totals: {
          lines:     { adds: nAdd, removals: nRm },
          subLabor:  { adds: tAdd.bid,   removals: tRm.bid,   net: totBid },
          equipment: { adds: tAdd.equip, removals: tRm.equip, net: totEquip }
        }
      };
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
      // Confirm + optional note in one modal. The note is FOLDED INTO the
      // request document (requestHtml/requestText) that already rides the
      // webhook, so the existing Make scenario forwards it to the sub with
      // zero re-mapping — and it's attributed to the sender by name.
      var wsNs = window.SCW && window.SCW.worksheetV2;
      var ask = (wsNs && typeof wsNs.promptNote === 'function')
        ? wsNs.promptNote({
            title: 'Send to sub for pricing?',
            body: 'Current line pricing is snapshotted as the baseline, and ' +
                  'the sub is notified. Add a note for the subcontractor ' +
                  '(optional) — it appears at the top of the pricing request ' +
                  'they receive.',
            placeholder: 'e.g. Please price by Friday — client wants to sign next week',
            okLabel: 'Send to Sub',
            optional: true
          })
        : Promise.resolve(window.prompt(
            'Send this change order to the subcontractor for pricing?\n\n' +
            'Note for the subcontractor (optional):', ''));
      ask.then(function (note) {
        if (note === null || note === undefined) return;   // cancelled
        note = String(note).trim();
        var doc  = buildRequestDoc();
        var html = doc.html;
        var text = doc.text;
        if (note) {
          var who = (getTriggeredBy().name || '').trim() || 'SCW Ops';
          html = '<div style="margin:0 0 14px;padding:10px 14px;' +
            'background:#fffbeb;border:1px solid #fde68a;border-radius:8px;' +
            'font-size:14px;line-height:1.5;">' +
            '<b>Note from ' + esc(who) + ' (SCW):</b> ' + esc(note) +
            '</div>' + html;
          text = 'NOTE FROM ' + who.toUpperCase() + ' (SCW): ' + note +
            '\n\n' + text;
        }
        fireWebhook('send', {
          snapshot:    buildSnapshot(),
          coNumber:    doc.coNumber,
          coName:      doc.coName,
          requestHtml: html,
          requestText: text,
          // Also a first-class key, in case Make ever wants it separately.
          note:        note
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

    // ── ops: "Reopen for Changes" (Issued / Declined → Ops Review) ────────
    // The post-issue escape hatch: an Issued (or Declined) CO goes back to
    // Ops Review so the lines unlock and the normal Preview & Issue flow
    // re-applies. Status is written DIRECTLY (same session-authed PUT as
    // Recall from Sub — field_2953 sits hidden on view_4092 for this).
    // Client-side only, no webhook: there is no Make branch for a reopen
    // today. The already-sent e-signature request stays live in the
    // client's inbox — the confirm copy says so; withdraw it from the
    // esignatures.com dashboard if it shouldn't be signable meanwhile.
    // (If/when Make grows a mode:'reopen' branch that voids the contract
    // automatically, fire it here the way recallFromSub does.)
    function reopenForChanges() {
      confirmThen('Reopen this change order?',
        'Reopen for changes? The CO returns to Ops Review so you can edit ' +
        'the lines and re-issue.\n\nHeads up: the e-signature request ' +
        'already sent to the client stays active until you re-issue — ' +
        'withdraw it from the esignatures.com dashboard if it should not ' +
        'be signable in the meantime. Re-issuing sends a fresh agreement.',
        'Reopen for Changes',
        function () {
          setBusy(true);
          putStatus('Ops Review', function (ok) {
            setBusy(false);
            if (!ok) return;
            _optimistic = 'Ops Review';
            setPillText('Ops Review');
            render();
            managePoll();
            refreshLocks();
          });
        });
    }

    // ── ops: "Skip Sub Pricing" (Draft → Ops Review, no sub round-trip) ──
    // Ops sometimes already has the sub's number in hand (bid arrived by
    // email / phone) — let them jump straight to Preview & Issue. Gated:
    // the bid PDF (stored on the CO via SKIP_PDF_FIELD, exposed on
    // view_4092) and a reason note are both REQUIRED — EXCEPT when ops
    // declares the CO has $0 labor change (nothing for the sub to price):
    // the no-bid checkbox waives the PDF and the note alone carries the
    // audit trail (the webhook flags noBid:true). Status flips
    // directly (same session-authed PUT as Recall); a notify-only webhook
    // (mode 'skip-pricing') carries the note + asset id for ClickUp/audit
    // — fired silently until a Make branch exists for it.
    var SKIP_PDF_FIELD  = 'field_2981';
    // Optional CO field for the skip reason. Until a field exists, the note
    // rides the skip-pricing webhook payload only.
    var SKIP_NOTE_FIELD = '';

    function putFields(fields, done) {
      var coId = getCoSowId();
      if (!coId) {
        alert('Could not determine the change order record id from the URL.');
        done(false); return;
      }
      var url = SCW.knackRecordUrl(VIEW, coId);
      console.info('[scw-co-stage] fields PUT →', url, fields);
      SCW.knackAjax({
        url: url, type: 'PUT', data: JSON.stringify(fields)
      }).then(function () { done(true); }, function (xhr) {
        console.warn('[scw-co-stage] fields PUT FAILED', xhr && xhr.status,
          xhr && xhr.responseText);
        alert('Could not update the change order (HTTP ' +
          ((xhr && xhr.status) || '?') + ').');
        done(false);
      });
    }

    function uploadSkipPdf(file) {
      var fd = new FormData();
      fd.append('files', file, file.name || 'bid.pdf');
      return new Promise(function (resolve, reject) {
        $.ajax({
          url: Knack.api_url + '/v1/applications/' + Knack.application_id +
               '/assets/file/upload',
          type: 'POST', data: fd, processData: false, contentType: false,
          headers: {
            'X-Knack-Application-Id': Knack.application_id,
            'x-knack-rest-api-key': 'knack',
            'Authorization': Knack.getUserToken()
          },
          success: function (res) {
            var id = res && (res.id || (res.asset && res.asset.id));
            id ? resolve(id) : reject(new Error('no asset id in upload response'));
          },
          error: function (xhr) {
            reject(new Error('upload failed (HTTP ' + ((xhr && xhr.status) || '?') + ')'));
          }
        });
      });
    }

    function skipSubPricing() {
      var old = document.getElementById('scw-co-skip-ovl');
      if (old) old.remove();
      var ovl = document.createElement('div');
      ovl.id = 'scw-co-skip-ovl';
      ovl.className = 'scw-co-skip-ovl';
      ovl.innerHTML =
        '<div class="scw-co-skip-card">' +
          '<div class="scw-co-skip-title">Skip sub pricing?</div>' +
          '<div class="scw-co-skip-body">This jumps the change order straight ' +
            'to Ops Review / Preview &amp; Issue without the subcontractor ' +
            'pricing round-trip. Attach the bid you already have and note ' +
            'why — or, if this CO changes no labor, tick the box instead.</div>' +
          '<label class="scw-co-skip-lbl">Sub bid PDF' +
            '<input type="file" class="scw-co-skip-file" ' +
              'accept="application/pdf,.pdf"></label>' +
          '<label class="scw-co-skip-nobid">' +
            '<input type="checkbox" class="scw-co-skip-nobid-cb">' +
            '<span>No sub bid to attach — this CO has <b>$0 labor change</b>, ' +
              'so there was nothing for the sub to price</span></label>' +
          '<label class="scw-co-skip-lbl">Why are we skipping sub pricing?' +
            '<textarea class="scw-co-skip-note" rows="3" placeholder=' +
              '"e.g. Sub priced via email 7/15 — bid attached."></textarea></label>' +
          '<div class="scw-co-skip-err" hidden></div>' +
          '<div class="scw-co-skip-btns">' +
            '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
              'data-skip="cancel">Cancel</button>' +
            '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
              'data-skip="go">Skip &amp; Continue to Review</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ovl);

      var fileIn  = ovl.querySelector('.scw-co-skip-file');
      var noBidCb = ovl.querySelector('.scw-co-skip-nobid-cb');
      var noteIn  = ovl.querySelector('.scw-co-skip-note');
      var errEl   = ovl.querySelector('.scw-co-skip-err');
      var goBtn   = ovl.querySelector('[data-skip="go"]');
      function err(msg) { errEl.hidden = !msg; errEl.textContent = msg || ''; }
      function close() { ovl.remove(); }

      // $0-labor declaration: the PDF row hides (nothing to attach) and the
      // note — still required — is seeded with the standard reason so the
      // audit trail states it explicitly. Seed only an EMPTY note; whatever
      // ops typed themselves is never overwritten (and never cleared on
      // untick — they can edit either way).
      noBidCb.addEventListener('change', function () {
        var lbl = fileIn.closest ? fileIn.closest('label') : null;
        if (lbl) lbl.style.display = noBidCb.checked ? 'none' : '';
        if (noBidCb.checked) {
          err('');
          if (!(noteIn.value || '').trim()) {
            noteIn.value = '$0 labor change — no sub pricing required.';
          }
        }
      });

      ovl.addEventListener('click', function (e) {
        if (e.target === ovl) { close(); return; }
        var b = e.target.closest && e.target.closest('[data-skip]');
        if (!b) return;
        if (b.getAttribute('data-skip') === 'cancel') { close(); return; }

        var noBid = !!noBidCb.checked;
        var file  = fileIn.files && fileIn.files[0];
        var note  = (noteIn.value || '').trim();
        if (!noBid && !file) {
          err('Attach the sub bid PDF — or tick "No sub bid to attach" if ' +
            'this CO has no labor change.');
          return;
        }
        if (!note) { err('Add a note explaining why sub pricing is being skipped.'); return; }

        err('');
        goBtn.setAttribute('disabled', 'disabled');
        goBtn.textContent = noBid ? 'Saving…' : 'Uploading…';
        var step = noBid ? Promise.resolve(null) : uploadSkipPdf(file);
        step.then(function (assetId) {
          goBtn.textContent = 'Saving…';
          var fields = {};
          if (assetId) fields[SKIP_PDF_FIELD] = assetId;
          fields[STATUS_FIELD]   = 'Ops Review';
          if (SKIP_NOTE_FIELD) fields[SKIP_NOTE_FIELD] = note;
          putFields(fields, function (ok) {
            if (!ok) {
              goBtn.removeAttribute('disabled');
              goBtn.innerHTML = 'Skip &amp; Continue to Review';
              return;
            }
            close();
            _optimistic = 'Ops Review';
            setPillText('Ops Review');
            render();
            managePoll();
            refreshLocks();
            // Best-effort audit ping (no Make branch yet → fire silently;
            // the status PUT above is the source of truth).
            try {
              var url = (window.SCW && SCW.CONFIG &&
                SCW.CONFIG.MAKE_CO_SEND_TO_SUB_WEBHOOK) || '';
              if (url && !/PLACEHOLDER/.test(url)) {
                fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    changeOrderId: getCoSowId(),
                    mode: 'skip-pricing',
                    skipNote: note,
                    noBid: noBid,               // $0 labor change — PDF waived
                    bidPdfAssetId: assetId || null,
                    coNumber: readHeaderValue('field_2123'),
                    coName:   readHeaderValue('field_2126'),
                    triggeredBy: getTriggeredBy()
                  })
                }).catch(function () { /* audit-only */ });
              }
            } catch (eWh) { /* audit-only */ }
          });
        }).catch(function (e2) {
          err('Bid PDF upload failed — ' + (e2 && e2.message ? e2.message : e2));
          goBtn.removeAttribute('disabled');
          goBtn.innerHTML = 'Skip &amp; Continue to Review';
        });
      });
    }

    // ── ops: "Authorize as not billable" (Ops Review → approved, no client chain)
    // The third exit from Ops Review. Approving a CO we are NOT going to bill
    // the client for (SCW eats it / credit of goodwill / internal fix): the
    // sub is told it's approved and the scope changes apply, but no client
    // document, no e-signature, no invoice. Reason REQUIRED (seeded from the
    // CO notes). Durable record = the Builder flag fields when configured
    // (NOT_BILLABLE_FIELD / _NOTE_FIELD, written here by session PUT); until
    // then a same-browser localStorage marker keeps the strip honest. The
    // webhook (mode 'authorize-not-billable' on the send-to-sub hook) owns
    // the downstream: sub notification + ClickUp, and the status flips
    // (→ Accepted → Applied via the apply branch, with the authorization as
    // the trigger instead of the signed webhook). The status is deliberately
    // NOT flipped client-side — "apply" is Make's.
    function nbMarker() {
      try {
        var raw = localStorage.getItem(NB_LS_PREFIX + getCoSowId());
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function setNbMarker(obj) {
      try {
        var k = NB_LS_PREFIX + getCoSowId();
        if (obj) localStorage.setItem(k, JSON.stringify(obj));
        else localStorage.removeItem(k);
      } catch (e) { /* private mode */ }
    }
    // { reason, by, at } when the CO is on the not-billable path, else null.
    // ── Acceptance read (the truth for billability / signature / reason) ──
    // This CO's acceptance = the row in ACC.view whose proposal (field_2755)
    // is one of the published proposals the PUBLISHED_VIEW grid lists for
    // this SOW. Null when the grid isn't configured / not loaded / no row.
    function readAcceptance() {
      if (!ACC.view || !window.Knack || !Knack.views) return null;
      var pubIds = {};
      try {
        var pv = DEP.PUBLISHED_VIEW && Knack.views[DEP.PUBLISHED_VIEW];
        var pm = pv && pv.model && pv.model.data && pv.model.data.models;
        for (var i = 0; pm && i < pm.length; i++) {
          if (pm[i] && pm[i].id) pubIds[pm[i].id] = true;
        }
      } catch (e) { /* no proposal list → no match */ }
      try {
        var av = Knack.views[ACC.view];
        var am = av && av.model && av.model.data && av.model.data.models;
        var best = null;
        for (var j = 0; am && j < am.length; j++) {
          var r = am[j] && am[j].attributes;
          if (!r) continue;
          var raw = r[ACC.proposal + '_raw'];
          var pid = Array.isArray(raw) ? (raw[0] && raw[0].id) : (raw && raw.id);
          if (pid && pubIds[pid]) best = r;   // last wins = newest acceptance
        }
        return best;
      } catch (e2) { return null; }
    }
    function accYes(rec, fk) {
      if (!rec || !fk) return false;
      var raw = rec[fk + '_raw'];
      return raw === true || /^(yes|true)$/i.test(readTxt(rec, fk));
    }
    // { notBillable, noSignature, signed, reason, by, at } or null when the
    // CO isn't Accepted. Acceptance grid first; the same-browser marker
    // (written at the click) fills in when the grid isn't there yet.
    function acceptanceInfo() {
      if (!/^accepted/i.test(getStatus())) return null;
      var rec = readAcceptance();
      var marker = nbMarker();
      if (rec) {
        return {
          notBillable: accYes(rec, ACC.notBill),
          noSignature: accYes(rec, ACC.noSig) || accYes(rec, ACC.notBill),
          signed:      accYes(rec, ACC.signed),
          reason:      (ACC.reason && readTxt(rec, ACC.reason)) || (marker && marker.reason) || '',
          by:          (marker && marker.by) || '',
          at:          (marker && marker.at) || ''
        };
      }
      if (marker) {
        return {
          notBillable: marker.kind === 'not-billable',
          noSignature: true, signed: false,
          reason: marker.reason || '', by: marker.by || '', at: marker.at || ''
        };
      }
      return null;
    }
    function notBillable() {
      var a = acceptanceInfo();
      return a && a.notBillable ? a : null;
    }
    function noSignature() {
      var a = acceptanceInfo();
      return a && a.noSignature && !a.notBillable ? a : null;
    }

    // Raw-only record snapshot — the exact rule proposal-pdf-export.js
    // stripNonRawFields applies to the preview page's publish payload:
    // drop every `field_xxx` (and dotted projection) that has a `_raw`
    // twin, and strip tag ATTRIBUTES from any remaining HTML string (the
    // paragraph field the snapshot lives in mangles escaped attribute
    // quotes — CLAUDE.md Known Issue #24).
    function rawOnly(node) {
      if (typeof node === 'string') {
        return node.replace(/<([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?(\/?)>/g, '<$1$2>');
      }
      if (Array.isArray(node)) {
        var arr = [];
        for (var i = 0; i < node.length; i++) arr.push(rawOnly(node[i]));
        return arr;
      }
      if (node && typeof node === 'object') {
        var keys = Object.keys(node), twin = {}, out = {};
        for (var k = 0; k < keys.length; k++) {
          if (/_raw$/.test(keys[k])) twin[keys[k].replace(/_raw$/, '')] = true;
        }
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          if (/^field_\d+(\.field_\d+)*$/.test(key) && twin[key]) continue;
          out[key] = rawOnly(node[key]);
        }
        return out;
      }
      return node;
    }
    // `{ sowRecordId, view_3896: [...] }` — keyed "view_3896" so the Issue
    // scenario's existing Parse JSON → 13.06b feed reads it unchanged.
    // ⚠ view_4079 must carry every column 13.06b maps when it creates
    // install records; a missing column lands as a blank.
    function buildNbSnapshotString(coId) {
      var ns = window.SCW && window.SCW.worksheetV2;
      var recs = (ns && ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(CO_VIEW) : [];
      var rows = [];
      for (var i = 0; i < recs.length; i++) {
        if (recs[i] && recs[i].id) rows.push(recs[i]);
      }
      try {
        return JSON.stringify(rawOnly({ sowRecordId: coId, view_3896: rows }));
      } catch (e) { return ''; }
    }

    function authorizeNotBillable() {
      var old = document.getElementById('scw-co-skip-ovl');
      if (old) old.remove();
      var seed = readHeaderValue('field_2198');   // CO notes — usually already the why
      var ovl = document.createElement('div');
      ovl.id = 'scw-co-skip-ovl';
      ovl.className = 'scw-co-skip-ovl';
      ovl.innerHTML =
        '<div class="scw-co-skip-card">' +
          '<div class="scw-co-skip-title">Authorize as not billable?</div>' +
          '<div class="scw-co-skip-body">This approves the change order ' +
            '<b>without billing the client</b>:</div>' +
          '<ul class="scw-co-nb-list">' +
            '<li><b>No client document</b>, no e-signature request, <b>no invoice</b>.</li>' +
            '<li>The subcontractor is notified the CO is <b>approved</b> (their pricing stands).</li>' +
            '<li>An internal authorization record (sub labor + equipment + your reason) is ' +
              'filed in place of the client proposal, and the scope changes apply to the ' +
              'install as if signed. This cannot be undone from here.</li>' +
          '</ul>' +
          '<label class="scw-co-skip-lbl">Why is this not billable?' +
            '<textarea class="scw-co-nb-note" rows="3" placeholder=' +
              '"e.g. SCW absorbing lift extension due to equipment delivery delay">' +
              esc(seed) + '</textarea></label>' +
          '<div class="scw-co-skip-err" hidden></div>' +
          '<div class="scw-co-skip-btns">' +
            '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
              'data-nb="cancel">Cancel</button>' +
            '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
              'data-nb="go">Authorize as not billable</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ovl);

      var noteIn = ovl.querySelector('.scw-co-nb-note');
      var errEl  = ovl.querySelector('.scw-co-skip-err');
      var goBtn  = ovl.querySelector('[data-nb="go"]');
      function err(msg) { errEl.hidden = !msg; errEl.textContent = msg || ''; }
      function close() { ovl.remove(); }

      ovl.addEventListener('click', function (e) {
        if (e.target === ovl) { close(); return; }
        var b = e.target.closest && e.target.closest('[data-nb]');
        if (!b) return;
        if (b.getAttribute('data-nb') === 'cancel') { close(); return; }
        var note = (noteIn.value || '').trim();
        if (!note) { err('Add a note explaining why the client is not being billed.'); return; }
        err('');
        goBtn.setAttribute('disabled', 'disabled');
        goBtn.textContent = 'Saving…';

        var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ISSUE_WEBHOOK) || '';
        var ready = !!(window.SCW && SCW.CONFIG && SCW.CONFIG.CO_AUTHORIZE_NOT_BILLABLE_READY);
        if (!url || /PLACEHOLDER/.test(url) || !ready) {
          // ⚠ Hard stop until Make has the stepId route: the Issue scenario
          // without it would run the FULL Issue flow (contract sent) on this
          // payload. Flip CO_AUTHORIZE_NOT_BILLABLE_READY in src/config.js
          // once the route exists.
          err('Not live yet — the Make route for "Authorize as not billable" ' +
            'is not configured (CO_AUTHORIZE_NOT_BILLABLE_READY). Nothing was changed.');
          goBtn.removeAttribute('disabled');
          goBtn.textContent = 'Authorize as not billable';
          return;
        }
        var coId = getCoSowId();
        if (!coId) {
          err('Could not determine the change order record id from the URL.');
          goBtn.removeAttribute('disabled');
          goBtn.textContent = 'Authorize as not billable';
          return;
        }
        var who = getTriggeredBy();

        // No client-side writes: Make creates the Acceptance with the flags +
        // the reason and writes the SOW status. The marker below keeps this
        // browser honest until the Acceptance grid shows the record.
        var marker = { kind: 'not-billable', reason: note,
                       by: who.name || who.email || '', at: new Date().toISOString() };
        (function () {
          goBtn.textContent = 'Authorizing…';
          // 2. The Issue scenario, not-billable route. Internal card (sub
          //    labor + equipment + reason) stands in for the client proposal
          //    HTML; the raw snapshot feeds the Proposal record + 13.06b.
          var doc = buildRequestDoc(null, 'Change Order Authorization — Not Billable', {
            equip: true,
            verb: 'Authorized by',
            banner: { label: 'Authorized as not billable —', text: note }
          });
          // Key names follow 13.03's trunk (it runs for EVERY stepId before
          // the stepId router): `recordId` → Proposal field_2666 + the
          // supersede search, `sourceRecordId` → the entry router + get SOW,
          // `htmlPdf` → the PDF + field_2680 document, `jsonString` →
          // field_2671 (what 13.06b iterates), `plaintext` → field_2754, the
          // three totals → field_2668/2669/2670. Client-facing totals are $0
          // by definition here — the sub/equipment picture rides `totals`.
          // No proposalAccessToken/Url on purpose: no customer link.
          var payload = {
            stepId:          NB_STEP_ID,
            recordId:        coId,
            changeOrderId:   coId,
            sourceRecordId:  coId,
            isChangeOrder:   true,
            notBillable:     true,
            signed:          false,
            reason:          note,
            notes:           note,
            status:          NB_STATUS,          // what Make writes to field_2953 ("Accepted")
            coNumber:        doc.coNumber,
            coName:          doc.coName,
            html:            doc.html,           // internal authorization card
            htmlPdf:         doc.html,           // same card — 13.03 renders the PDF from htmlPdf
            plaintext:       doc.text,
            installationTotal: 0,
            equipmentTotal:    0,
            grandTotal:        0,
            totals:          doc.totals,         // { lines, subLabor, equipment } adds/removals/net
            jsonString:      buildNbSnapshotString(coId),
            triggeredBy:     who
          };
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (resp) {
            var httpOk = resp.ok;
            return resp.text().then(function (txt) {
              var body = null;
              try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
              return { ok: httpOk, data: body };
            });
          }).then(function (r) {
            var explicitFail = !!(r.data && (r.data.success === false || r.data.error));
            if (!r.ok || explicitFail) {
              err((r.data && (r.data.error || r.data.message)) ||
                'The authorization webhook failed. The reason was saved; try again.');
              goBtn.removeAttribute('disabled');
              goBtn.textContent = 'Authorize as not billable';
              return;
            }
            close();
            // Optimistic: Make writes the status a beat after the ACK.
            _optimistic = NB_STATUS;
            setPillText(NB_STATUS);
            var sel = document.querySelector('#' + VIEW + ' #kn-input-' + STATUS_FIELD + ' select');
            if (sel) sel.value = NB_STATUS;
            setNbMarker(marker);
            render();
            managePoll();
            refreshLocks();
          }).catch(function (e2) {
            err('Webhook error: ' + (e2 && e2.message ? e2.message : e2));
            goBtn.removeAttribute('disabled');
            goBtn.textContent = 'Authorize as not billable';
          });
        })();
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
        if (!r || !r.id || isLicenseLine(r)) continue;
        // "Sub bid required" (field_2478) explicitly No = the line is on
        // the CO but not the sub's to price (equipment-only rows) — never
        // counts as unpriced. Blank/missing (or the column not on the
        // grid) reads as required, matching bid-items-grid's convention.
        var req = String(r['field_2478'] == null ? '' : r['field_2478'])
          .replace(/<[^>]*>/g, '').trim();
        if (/^no$/i.test(req)) continue;
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
    // MAKE_CO_ISSUE_WEBHOOK). This button just takes them there. Post-issue
    // the same page hosts the published proposal PDF + customer links, so
    // the Issued stage's "Proposal & Links" button reuses it.
    function previewIssue() {
      var coId = getCoSowId();
      if (!coId) { alert('Could not determine the change order record id from the URL.'); return; }
      // New tab — the review/issue flow lives on its own page and ops keep
      // the build-CO page open underneath.
      window.open(
        window.location.origin + window.location.pathname +
          '#proposals/proposal/' + coId + '/',
        '_blank', 'noopener');
    }

    // WHO the CO agreement went to — stashed by ops-stepper's
    // issue-change-order success handler (same-browser best effort).
    function readIssuedRecipient() {
      try {
        var raw = localStorage.getItem('scw-co-issued-recipient:' + getCoSowId());
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
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
    function stepsHtml(cur, nb) {
      var stages = STAGES;
      if (nb) {
        // No client document / signature on this path: the Issued node
        // goes away and the terminal node names the path.
        stages = [];
        for (var k = 0; k < STAGES.length; k++) {
          if (STAGES[k].key === 'issued') continue;
          stages.push(STAGES[k].key === 'accepted'
            ? { key: 'accepted', label: 'Accepted · not billable' } : STAGES[k]);
        }
        if (cur >= 4) cur -= 1;
      }
      var out = '<div class="scw-co-steps">';
      for (var i = 0; i < stages.length; i++) {
        var cls = i < cur ? ' scw-co-step--done'
                : i === cur ? ' scw-co-step--done scw-co-step--current' : '';
        out += '<div class="scw-co-step' + cls + '">' +
          '<div class="scw-co-step-dot"></div>' +
          '<div class="scw-co-step-lbl">' + esc(stages[i].label) + '</div>' +
        '</div>';
      }
      return out + '</div>';
    }

    // Terminal-state summary card (the three Accepted flavours). `info` =
    // { reason, by, at } (or null for e-signed); `facts` = short chips.
    function acceptedCard(kind, title, info, facts) {
      var meta = '';
      if (info && (info.by || info.at)) {
        var when = '';
        if (info.at) {
          var d = new Date(info.at);
          if (!isNaN(+d)) when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        meta = (info.by ? 'by ' + esc(info.by) : '') +
               (info.by && when ? ' · ' : '') + esc(when);
      }
      var chips = '';
      for (var i = 0; i < (facts || []).length; i++) {
        chips += '<span class="scw-co-acc-fact">' + esc(facts[i]) + '</span>';
      }
      return '<div class="scw-co-acc scw-co-acc--' + kind + '">' +
        '<div class="scw-co-acc-head">' +
          '<span class="scw-co-acc-title">' + esc(title) + '</span>' +
          (meta ? '<span class="scw-co-acc-meta">' + meta + '</span>' : '') +
        '</div>' +
        (info && info.reason
          ? '<div class="scw-co-acc-reason"><b>Why</b>' + esc(info.reason) + '</div>'
          : '') +
        (chips ? '<div class="scw-co-acc-facts">' + chips + '</div>' : '') +
      '</div>';
    }

    function opsActionsHtml(status, cur, nb) {
      var s = String(status || '').toLowerCase();
      if (cur === 0) {
        return '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
          'data-scw-co-act="send">Send to Sub</button>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="skip">Skip Sub Pricing &rarr;</button>' +
          '<span class="scw-co-stage-note">Sends the CO to the subcontractor to price ' +
          '— or skip straight to review with a bid PDF on file (none needed ' +
          'when the CO has $0 labor change).</span>';
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
        // Three exits — negative, then the exception path, then the primary.
        return '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="sendback">Send back to sub</button>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="nb-authorize" title="Approve this change order without ' +
          'billing the client — no document, no e-signature, no invoice">' +
          'Authorize as not billable</button>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--primary" ' +
          'data-scw-co-act="preview-issue">Preview &amp; Issue &rarr;</button>' +
          '<span class="scw-co-stage-note">Review the client-facing document, then issue from there ' +
          '— or authorize internally if the client won’t be billed.</span>';
      }
      if (cur === 4 && nb) {
        // Accepted + FLAG_not billable: ops-authorized, no client chain.
        // Terminal (Proposal + Acceptance records exist, scope applied) —
        // no undo; further changes are a new CO, same as a signed one.
        return acceptedCard('nb', 'Accepted · not billable', nb,
          ['No client document', 'No invoice', 'Sub notified', 'Install scope applied']);
      }
      if (cur === 3) {
        var rcp = readIssuedRecipient();
        var copy = (rcp && rcp.name)
          ? 'CO agreement issued to <b>' + esc(rcp.name) + '</b>' +
            (rcp.email ? ' (' + esc(rcp.email) + ')' : '') +
            ' — have them check their email for the e-signature request.'
          : 'Issued — sent for client signature. Have the recipient check ' +
            'their email for the e-signature request.';
        // Reopen = the ops escape hatch after issue: unlocks editing so the
        // CO can be revised and re-issued (a re-issue mints a NEW published
        // proposal + a NEW e-sign agreement).
        return '<span class="scw-co-stage-note">' + copy + '</span>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="reopen">Reopen for Changes</button>';
      }
      if (cur === 4) {
        var nsig = noSignature();
        if (nsig) {
          return acceptedCard('nosig', 'Accepted · approved without client signature', nsig,
            ['No e-signature on file', 'Client invoiced', 'Sub notified', 'Install scope applied']);
        }
        return acceptedCard('signed', 'Accepted · signed by the client', null,
          ['Agreement signed', 'Client invoiced', 'Install scope applied']);
      }
      if (/declined/.test(s)) {
        return '<span class="scw-co-stage-note"><b>Declined.</b> Revise the lines and re-issue.</span>' +
          '<button type="button" class="scw-co-stage-btn scw-co-stage-btn--secondary" ' +
          'data-scw-co-act="reopen">Reopen for Changes</button>';
      }
      if (/void/.test(s))     return '<span class="scw-co-stage-note"><b>Void.</b></span>';
      return '<span class="scw-co-stage-note">Status: ' + esc(status || 'unknown') + '</span>';
    }

    // Sub-facing copy: same stepper, no verbs — the sub's only actions are
    // editing the worksheet while their window is open (co-sub-lock handles
    // the lock/unlock) and, later, the hand-back submit verb.
    function subActionsHtml(status, cur, nb) {
      var s = String(status || '').toLowerCase();
      if (nb && cur === 4) {
        return '<span class="scw-co-stage-note"><b>Approved by SCW.</b> ' +
          'Your pricing stands; the changes are being applied.</span>';
      }
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
      if (cur === 4) return '<span class="scw-co-stage-note"><b>Accepted</b> — signed by the client; SCW is applying the changes.</span>';
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
          if (act === 'skip')          skipSubPricing();
          if (act === 'nudge')         nudgeSub();
          if (act === 'recall')        recallFromSub();
          if (act === 'sendback')      sendBackToSub();
          if (act === 'preview-issue') previewIssue();
          if (act === 'reopen')        reopenForChanges();
          if (act === 'nb-authorize')  authorizeNotBillable();
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
      var nb = notBillable();
      var offPath = cur === -1 && /declined|void/i.test(status || '');
      el.className = offPath ? 'scw-co-stage--offpath' : '';
      el.innerHTML = '<div class="scw-co-stage-main">' + stepsHtml(cur, nb) +
        '<div class="scw-co-stage-actions">' +
        (IS_OPS ? opsActionsHtml(status, cur, nb) : subActionsHtml(status, cur, nb)) +
        '</div></div>';
      renderHeaderTag(form, nb);
      if (!nb) renderPublishedBlock(el, cur);
    }

    // Basis tag beside the header status pill (co-header-card rebuilds the
    // pill on its own timer — re-applied every render): slate "NOT
    // BILLABLE" on the not-billable path, amber "NO SIGNATURE" on a
    // billable CO approved without a client signature.
    function renderHeaderTag(form, nb) {
      var pill = form.querySelector('.scw-co-hdr-pill');
      var tag = form.querySelector('.scw-co-hdr-nb');
      var ns = !nb && noSignature();
      if (!nb && !ns) { if (tag) tag.remove(); return; }
      if (!pill) return;
      if (!tag) {
        tag = document.createElement('span');
        pill.parentNode.insertBefore(tag, pill.nextSibling);
      }
      tag.className = 'scw-co-hdr-nb' + (ns ? ' scw-co-hdr-nb--nosig' : '');
      tag.textContent = nb ? 'Not billable' : 'No signature';
      tag.title = nb
        ? (nb.reason || 'Authorized without billing the client') + (nb.by ? ' — ' + nb.by : '')
        : 'Approved and billed on client approval, no e-signature' + (ns.reason ? ' — ' + ns.reason : '');
      if (pill.nextSibling !== tag) pill.parentNode.insertBefore(tag, pill.nextSibling);
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
      if (DEP.PUBLISHED_VIEW) SCW.onViewRender(DEP.PUBLISHED_VIEW, soon, EVENT_NS);
      if (IS_OPS && ACC.view) SCW.onViewRender(ACC.view, soon, EVENT_NS);
    }
    // The published-proposals source grid is data-only — keep it out of
    // sight (display:none keeps the DOM + model readable).
    if (IS_OPS && ACC.view) {
      var accHideId = 'scw-co-stage-acchide-' + ACC.view;
      if (!document.getElementById(accHideId)) {
        var accHide = document.createElement('style');
        accHide.id = accHideId;
        accHide.textContent = '#' + ACC.view + ' { display: none !important; }';
        document.head.appendChild(accHide);
      }
    }
    if (DEP.PUBLISHED_VIEW) {
      var hideId = 'scw-co-stage-pubhide-' + DEP.PUBLISHED_VIEW;
      if (!document.getElementById(hideId)) {
        var hideStyle = document.createElement('style');
        hideStyle.id = hideId;
        hideStyle.textContent = '#' + DEP.PUBLISHED_VIEW + ' { display: none !important; }';
        document.head.appendChild(hideStyle);
      }
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
