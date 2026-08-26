/*** FEATURE: Acceptance summary card (view_3914 / view_4066) **************
 *
 * Replaces the raw INSTALL_acceptance table on the deploy scenes with clean
 * cards — ONE PER RECORD (2026-07-17: a project accrues an acceptance per
 * signed agreement — the base proposal plus each change order — so the old
 * first-row-only render hid every CO acceptance). Each card: the proposal as
 * the title, Yes/No flags as status pills, and the document links + the
 * "Create Questionnaire" action rendered as buttons. The native table is
 * hidden (kept in the DOM); the questionnaire button proxies its row's
 * original action link so Knack's handler still fires. File tiles do NOT
 * proxy to Knack's asset viewer — clicking anywhere on one opens the
 * card's own uploader modal (current file + replace + greenlight check),
 * and the editors PUT against their own row's record id.
 *
 * Columns:
 *   field_2755  REL proposal (connection link)        → title
 *   field_2765  FLAG_initial payment received (Yes/No) → pill
 *   field_2766  FLAG_agreement signed (Yes/No)         → pill
 *   field_1847  Xero Equipment Invoice Link (URL)      → button
 *   field_2767  SYS_signed agreement (file)            → button
 *   field_2947  SYS_bid basis pdf (file)               → button
 *   field_2948  SYS_xero estimate link (URL)           → button
 *   .kn-action-link "Create Questionnaire"             → primary button
 *
 * Document slots (agreement / bid-basis PDF / Xero invoice / Xero
 * estimate) turn GREEN once populated — the card doubles as a
 * completeness checklist. All four are editable in place: URL modal for
 * the links, file picker + Knack asset upload for the PDFs.
 *
 * COLUMN GUARD: the card only takes over a view whose table actually has
 * the proposal column (th.field_2755) — otherwise the native table stays
 * visible untouched. The sub-dashboard ACCEPTANCE grid (view_4066) is
 * deliberately NOT listed: acceptances are an ops surface, and the sub's
 * grid is hidden outright (hide-data-source-views.js; decided 2026-08-12).
 ****************************************************************************/
(function () {
  'use strict';

  var VIEWS    = ['view_3914'];  // ops deploy scene only
  var STYLE_ID = 'scw-acpt-css';
  var EVENT_NS = '.scwAcceptanceCard';
  var F = {
    proposal:  'field_2755',
    payment:   'field_2765',
    signed:    'field_2766',
    terms:     'field_2940',   // FLAG_approved for terms (Yes/No)
    xero:      'field_1847',
    agreement: 'field_2767',
    bidPdf:    'field_2947',   // SYS_bid basis pdf (file)
    xeroEst:   'field_2948'    // SYS_xero estimate link (URL)
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function cellText(row, fk) {
    var td = row.querySelector('td.' + fk);
    return td ? td.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function cellAnchor(row, fk, sel) {
    var td = row.querySelector('td.' + fk);
    return td ? td.querySelector(sel || 'a[href]') : null;
  }
  function isYes(v) { return /^(yes|true)$/i.test(String(v || '').trim()); }

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle>' +
    '<polyline points="12 7 12 12 15 14"></polyline></svg>';
  var FILE_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  var UPLOAD_SVG =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
    '<polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
  var LINK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    // Hide the raw grid chrome — the card replaces it. Scoped to the
    // .scw-acpt-on marker class render() stamps only after the column
    // guard passes, so a view without the acceptance columns keeps its
    // native table.
    var hideSel = [];
    for (var hv = 0; hv < VIEWS.length; hv++) {
      hideSel.push('#' + VIEWS[hv] + '.scw-acpt-on .view-header',
                   '#' + VIEWS[hv] + '.scw-acpt-on .kn-records-nav',
                   '#' + VIEWS[hv] + '.scw-acpt-on .kn-table-wrapper');
    }
    var css = [
      hideSel.join(',\n') + ' { display: none !important; }',
      '.scw-acpt-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 18px; margin-top: 8px;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '.scw-acpt-eyebrow { font: 700 10px/1.2 system-ui, sans-serif; letter-spacing: .07em;',
      '  text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }',
      '.scw-acpt-title { font: 700 15px/1.35 system-ui, sans-serif; color: #0f4c75;',
      '  text-decoration: none; display: inline-block; }',
      '.scw-acpt-title:hover { text-decoration: underline; }',
      '.scw-acpt-status { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }',
      '.scw-acpt-pill { display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px; border-radius: 999px; font: 600 12px/1 system-ui, sans-serif;',
      '  border: 1px solid transparent; }',
      '.scw-acpt-pill.is-yes { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      '.scw-acpt-pill.is-no  { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-acpt-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.scw-acpt-btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer;',
      '  font: 600 12.5px/1 system-ui, sans-serif; padding: 8px 14px; border-radius: 6px;',
      '  text-decoration: none; transition: background .12s, border-color .12s; }',
      '.scw-acpt-btn--ghost { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; }',
      '.scw-acpt-btn--ghost:hover { background: #eef2f7; border-color: #94a3b8; }',
      '.scw-acpt-btn--primary { background: #0f4c75; border: 1px solid #0a3a63; color: #fff;',
      '  margin-left: auto; }',
      '.scw-acpt-btn--primary:hover { background: #0a3a63; }',
      // ── Document tiles ─────────────────────────────────────────
      // Design rules (2026-08-21 pass): labels NEVER truncate (tiles are
      // content-sized — a checklist you can\'t read is decoration); ONE
      // state glyph per tile (leading check = done, plus = missing —
      // state never rides on color alone); the pencil is progressive
      // disclosure (hidden until tile hover / keyboard focus, fixed
      // width so nothing shifts). Pair captions carry the shared context
      // so the tile labels stay short.
      '.scw-acpt-doc { display: inline-flex; align-items: stretch;',
      '  border-radius: 8px; border: 1px solid #bbf7d0; background: #f0fdf4;',
      '  overflow: hidden; }',
      '.scw-acpt-doc__open { display: inline-flex; align-items: center;',
      '  gap: 7px; padding: 7px 4px 7px 10px; color: #15803d !important; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none !important; }',
      '.scw-acpt-doc__open:hover { background: #dcfce7; text-decoration: none !important; }',
      '.scw-acpt-doc__open svg { flex: none; color: #16a34a; }',
      '.scw-acpt-doc__lbl { white-space: nowrap; }',
      '.scw-acpt-doc__edit { flex: none; width: 24px; display: inline-flex; align-items: center;',
      '  justify-content: center; border: none; background: transparent;',
      '  color: #15803d; cursor: pointer; opacity: 0; padding: 0;',
      '  transition: opacity .12s, background .12s; }',
      '.scw-acpt-doc:hover .scw-acpt-doc__edit,',
      '.scw-acpt-doc:focus-within .scw-acpt-doc__edit { opacity: .65; }',
      '.scw-acpt-doc__edit:hover { opacity: 1 !important; background: #dcfce7; }',
      'button.scw-acpt-doc--missing { box-sizing: border-box;',
      '  display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px 7px 10px;',
      '  border-radius: 8px; border: 1.5px dashed #cbd5e1; background: #fff;',
      '  color: #64748b; cursor: pointer; font: 600 12px/1.2 system-ui, sans-serif;',
      '  text-align: left; white-space: nowrap;',
      '  transition: border-color .12s, color .12s, background .12s; }',
      'button.scw-acpt-doc--missing:hover { border-color: #0f4c75; color: #0f4c75;',
      '  background: #f8fafc; }',
      'button.scw-acpt-doc--missing svg { flex: none; }',
      // Mirror pairs (agreement·invoice / bid-PDF·estimate): a micro-
      // caption names the pair so the tiles inside can use short labels.
      '.scw-acpt-pair { display: inline-flex; flex-direction: column; gap: 3px; }',
      '.scw-acpt-pair__cap { font: 700 9.5px/1 system-ui, sans-serif;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  padding-left: 2px; }',
      '.scw-acpt-pair__tiles { display: inline-flex; gap: 6px; }',
      // Compact list mode: ONE card, one row per acceptance record —
      // title | pills | actions on a single line (wraps on narrow).
      // Accordion-header rollup badge (signed tally) — sits before the count
      // pill; margin-left:auto is harmless when the title already flexes.
      '.scw-acpt-rollup { display: inline-flex; align-items: center;',
      '  margin-left: auto; margin-right: 8px; padding: 3px 10px;',
      '  border-radius: 999px; font: 700 11px/1.2 system-ui, sans-serif;',
      '  border: 1px solid transparent; white-space: nowrap; }',
      '.scw-acpt-rollup--warn { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-acpt-rollup--ok   { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      '.scw-acpt-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap;',
      '  padding: 10px 2px; }',
      '.scw-acpt-row + .scw-acpt-row { border-top: 1px solid #eef2f7; }',
      // Fixed identity column — base SOW numbers (SW1145) are shorter than
      // CO numbers (SW1418CO), so an auto-width title staggered the pills.
      // The proposal id renders as a muted sub-line instead of riding in
      // the title (the " | 20260807-11068" tail was pure noise up there).
      '.scw-acpt-id { flex: 0 0 280px; min-width: 0; }',
      '.scw-acpt-id .scw-acpt-title { font-size: 13.5px; overflow-wrap: anywhere; }',
      '.scw-acpt-sub { font: 500 11px/1.3 system-ui, sans-serif; color: #94a3b8;',
      '  margin-top: 1px; }',
      '.scw-acpt-row .scw-acpt-status { margin: 0; gap: 6px; }',
      '.scw-acpt-row .scw-acpt-pill { padding: 3px 9px; font-size: 11px; }',
      '.scw-acpt-row .scw-acpt-actions { margin-left: auto; gap: 14px; align-items: center; }',
      '.scw-acpt-row .scw-acpt-btn { padding: 6px 12px; font-size: 11.5px; }',
      // Own mini-modal (link editor / upload progress).
      '.scw-acpt-m-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55);',
      '  z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 18px; }',
      '.scw-acpt-m { background: #fff; color: #0f172a; border-radius: 10px; width: 100%;',
      '  max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif; }',
      '.scw-acpt-m__head { padding: 12px 16px; background: #0f4c75; color: #fff;',
      '  font-weight: 700; font-size: 13.5px; }',
      '.scw-acpt-m__body { padding: 14px 16px; }',
      '.scw-acpt-m__input { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; font: inherit; box-sizing: border-box; }',
      '.scw-acpt-m__input:focus { outline: none; border-color: #0f4c75;',
      '  box-shadow: 0 0 0 3px rgba(15,76,117,.15); }',
      '.scw-acpt-m__status { margin-top: 10px; font-weight: 600; color: #0f4c75; }',
      '.scw-acpt-m__status.is-err { color: #be123c; }',
      '.scw-acpt-m__foot { padding: 11px 16px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc; }',
      '.scw-acpt-m__btn { padding: 7px 14px; border-radius: 5px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.scw-acpt-m__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.scw-acpt-m__btn--ok { background: #0f4c75; color: #fff; }',
      '.scw-acpt-m__btn--ok:disabled { background: #cbd5e1; cursor: not-allowed; }',
      // ── Uploader: drop zone → file chip → optional check ───────
      // The zone and the chosen-file chip are the same slot in two
      // states, so the modal never grows a second empty target.
      '.scw-acpt-drop { display: flex; flex-direction: column; align-items: center;',
      '  justify-content: center; gap: 4px; padding: 22px 14px; cursor: pointer;',
      '  border: 2px dashed #cbd5e1; border-radius: 9px; background: #f8fafc;',
      '  color: #64748b; text-align: center;',
      '  transition: border-color .12s, background .12s, color .12s; }',
      '.scw-acpt-drop:hover, .scw-acpt-drop:focus-visible { border-color: #0f4c75;',
      '  color: #0f4c75; background: #f1f5f9; outline: none; }',
      '.scw-acpt-drop.is-over { border-color: #0f4c75; background: #e6f0f7;',
      '  color: #0f4c75; border-style: solid; }',
      '.scw-acpt-drop svg { color: inherit; }',
      '.scw-acpt-drop__t { font: 600 13px/1.3 system-ui, sans-serif; }',
      '.scw-acpt-drop__s { font: 500 11.5px/1.3 system-ui, sans-serif; color: #94a3b8; }',
      '.scw-acpt-file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 10px 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d; font: 600 12.5px/1.3 system-ui, sans-serif; }',
      '.scw-acpt-file[hidden] { display: none; }',
      '.scw-acpt-file svg { flex: none; color: #16a34a; }',
      '.scw-acpt-file__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-acpt-file__sz { flex: none; font-weight: 500; color: #4ade80; }',
      '.scw-acpt-file__x { flex: none; border: none; background: transparent;',
      '  color: #15803d; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px;',
      '  opacity: .6; }',
      '.scw-acpt-file__x:hover { opacity: 1; }',
      '.scw-acpt-chk { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px;',
      '  cursor: pointer; font: 500 12.5px/1.4 system-ui, sans-serif; color: #334155; }',
      '.scw-acpt-chk input { margin: 1px 0 0; width: 15px; height: 15px; flex: none;',
      '  accent-color: #0f4c75; cursor: pointer; }',
      // Current-file block at the top of the uploader.
      '.scw-acpt-cur { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }',
      '.scw-acpt-cur__cap { font: 700 9.5px/1 system-ui, sans-serif; letter-spacing: .08em;',
      '  text-transform: uppercase; color: #94a3b8; }',
      '.scw-acpt-cur__file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d !important;',
      '  font: 600 12.5px/1.3 system-ui, sans-serif; text-decoration: none !important; }',
      'a.scw-acpt-cur__file:hover { background: #dcfce7; }',
      '.scw-acpt-cur__file svg { flex: none; color: #16a34a; }',
      '.scw-acpt-cur__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-acpt-cur__hint { flex: none; font: 600 10px/1 system-ui, sans-serif;',
      '  letter-spacing: .06em; text-transform: uppercase; color: #4ade80; }',
      // Outcome toast (uploader auto-closes; results land here).
      '.scw-acpt-toast { position: fixed; left: 50%; bottom: 28px;',
      '  transform: translate(-50%, 10px); z-index: 100001; pointer-events: none;',
      '  background: #0f4c75; color: #fff; padding: 11px 20px; border-radius: 999px;',
      '  font: 600 12.5px/1.45 system-ui, -apple-system, sans-serif;',
      '  box-shadow: 0 10px 28px rgba(15,23,42,.35); max-width: min(560px, 92vw);',
      '  text-align: center; opacity: 0; transition: opacity .25s, transform .25s; }',
      '.scw-acpt-toast.is-in { opacity: 1; transform: translate(-50%, 0); }',
      '.scw-acpt-toast.is-err { background: #be123c; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Greenlight check ────────────────────────────────────────────
  // Asks Make whether the deal is ready to greenlight for install. ALWAYS
  // opt-in: offered after a signed-agreement upload (the user can decline)
  // and available on demand from the row. Never fires on its own.
  function greenlightUrl() {
    var u = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_GREENLIGHT_CHECK_WEBHOOK) || '';
    return (!u || /PLACEHOLDER/i.test(u)) ? '' : u;
  }
  function triggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /** POST the greenlight check. Resolves { ok, data, status }, never rejects
   *  — callers render the outcome. Deliberately a BARE fetch: this is a
   *  third-party host, so no Knack session token rides along (same rule as
   *  the other Make posts in the bundle). */
  function postGreenlight(payload) {
    var url = greenlightUrl();
    if (!url) return Promise.resolve({ ok: false, data: null, status: 0, unconfigured: true });
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* Make's "Accepted" */ }
        return { ok: resp.ok, data: data, status: resp.status };
      });
    }).catch(function (err) {
      return { ok: false, data: null, status: 0, error: (err && err.message) || 'network error' };
    });
  }

  /** Build the payload from a row's already-scraped state. */
  function greenlightPayload(recId, info, source) {
    return {
      acceptanceRecordId: recId,
      proposalId:         info.proposalId || '',
      proposalLabel:      info.proposalLabel || '',
      agreementSigned:    !!info.signed,
      paymentReceived:    !!info.paid,
      approvedForTerms:   !!info.terms,
      source:             source,
      pageUrl:            (window.location && window.location.href) || '',
      triggeredBy:        triggeredBy()
    };
  }

  /** Run the check and report into an existing modal status element.
   *  `onDone` fires after the view refetch is queued. */
  function runGreenlight(viewKey, recId, info, source, statusEl, btn) {
    // With a statusEl the outcome renders inline (a modal is still open);
    // without one the caller has already closed its modal, so outcomes
    // land as toasts instead.
    function report(msg, isErr) {
      if (statusEl) {
        statusEl.style.display = '';
        statusEl.classList.toggle('is-err', !!isErr);
        statusEl.textContent = msg;
      } else {
        toast(msg, isErr);
      }
    }
    if (statusEl) report('Checking…');
    if (btn) btn.disabled = true;
    return postGreenlight(greenlightPayload(recId, info, source)).then(function (r) {
      var explicitError = r.data && (r.data.success === false || r.data.error);
      if (r.unconfigured) {
        report('Greenlight check isn\'t configured yet.', true);
        if (btn) btn.disabled = false;
        return false;
      }
      if (!r.ok || explicitError) {
        var msg = (r.data && (r.data.error || r.data.message)) ||
          (r.status ? 'Greenlight check failed (HTTP ' + r.status + ')'
                    : 'Greenlight check failed — network error');
        // Toast mode has no modal to retry from — point at the row button.
        report(statusEl ? msg : msg + '. Use “Check greenlight” on the row to retry.', true);
        if (btn) btn.disabled = false;
        return false;
      }
      // Success. Make may answer with a verdict, or just ack (HTTP 200 +
      // "Accepted") while the scenario keeps running past its 40s window —
      // both are fine, so say what we actually know and let the refetch
      // surface whatever flags the scenario flips.
      report((r.data && r.data.message) ||
        (r.data && typeof r.data.greenlit === 'boolean'
          ? (r.data.greenlit ? 'Ready to greenlight.' : 'Not ready to greenlight yet.')
          : 'Greenlight check sent — this panel updates when it finishes.'));
      setTimeout(function () { refreshAcptView(viewKey); }, 2500);
      return true;
    });
  }

  // Bottom-center toast — the uploader closes itself on submit, so async
  // outcomes need somewhere to land that isn't a modal. One at a time;
  // a new toast replaces the current one. Errors linger longer.
  var TOAST_ID = 'scw-acpt-toast';
  function toast(msg, isErr) {
    var t = document.getElementById(TOAST_ID);
    if (t) t.remove();
    t = document.createElement('div');
    t.id = TOAST_ID;
    t.className = 'scw-acpt-toast' + (isErr ? ' is-err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-in'); }, 20);
    setTimeout(function () {
      t.classList.remove('is-in');
      setTimeout(function () { if (t.parentNode) t.remove(); }, 300);
    }, isErr ? 8000 : 4500);
  }

  function pill(label, yes) {
    return '<span class="scw-acpt-pill ' + (yes ? 'is-yes' : 'is-no') + '">' +
      (yes ? CHECK_SVG : CLOCK_SVG) + '<span>' + esc(label) + '</span></span>';
  }

  var PENCIL_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  // ── Own editors (view-based PUT through view_3914) ──────────────
  // The Knack cell-editor proxy proved unreliable against the Vue table
  // renderer, so the card edits directly: a small URL modal for the Xero
  // link, and a file picker + Knack asset upload for the signed agreement.
  // Both PUT through this view with the user's session and refetch so the
  // card rebuilds with the fresh value.

  function refreshAcptView(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    } catch (e) { /* best-effort */ }
  }
  function putAcceptance(viewKey, recId, fields) {
    return new Promise(function (resolve, reject) {
      if (!recId) return reject(new Error('no acceptance record on the page'));
      if (!(window.SCW && typeof SCW.knackAjax === 'function')) {
        return reject(new Error('SCW.knackAjax unavailable'));
      }
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recId),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: resolve,
        error: function (xhr) { reject(new Error('save failed (' + (xhr && xhr.status) + ')')); }
      });
    });
  }

  /** Minimal modal shell. body is an element; returns {backdrop, foot, close}. */
  function acptModal(title, bodyEl, okLabel) {
    var backdrop = document.createElement('div');
    backdrop.className = 'scw-acpt-m-backdrop';
    backdrop.innerHTML =
      '<div class="scw-acpt-m">' +
        '<div class="scw-acpt-m__head"></div>' +
        '<div class="scw-acpt-m__body"></div>' +
        '<div class="scw-acpt-m__foot">' +
          '<button type="button" class="scw-acpt-m__btn scw-acpt-m__btn--cancel">Cancel</button>' +
          '<button type="button" class="scw-acpt-m__btn scw-acpt-m__btn--ok"></button>' +
        '</div>' +
      '</div>';
    backdrop.querySelector('.scw-acpt-m__head').textContent = title;
    backdrop.querySelector('.scw-acpt-m__body').appendChild(bodyEl);
    var ok = backdrop.querySelector('.scw-acpt-m__btn--ok');
    ok.textContent = okLabel || 'Save';
    function close() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
    backdrop.querySelector('.scw-acpt-m__btn--cancel').addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    return { backdrop: backdrop, ok: ok, close: close };
  }

  /** Link-field editor (Xero invoice field_1847 / Xero estimate
   *  field_2948) — URL input modal, PUT through the view. */
  function openLinkEditor(viewKey, recId, fieldKey, title, currentUrl) {
    var body = document.createElement('div');
    body.innerHTML =
      '<input type="url" class="scw-acpt-m__input" placeholder="https://…">' +
      '<div class="scw-acpt-m__status" style="display:none"></div>';
    var input = body.querySelector('input');
    input.value = currentUrl || '';
    var m = acptModal(title, body, 'Save link');
    setTimeout(function () { input.focus(); input.select(); }, 30);
    var status = body.querySelector('.scw-acpt-m__status');
    function fail(msg) {
      status.style.display = '';
      status.classList.add('is-err');
      status.textContent = msg;
      m.ok.disabled = false;
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.ok.click(); });
    m.ok.addEventListener('click', function () {
      var url = input.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      m.ok.disabled = true;
      status.style.display = '';
      status.classList.remove('is-err');
      status.textContent = 'Saving…';
      var fields = {};
      fields[fieldKey] = url;   // empty string clears the link
      putAcceptance(viewKey, recId, fields).then(function () {
        m.close();
        refreshAcptView(viewKey);
      }).catch(function (err) { fail((err && err.message) || 'Save failed'); });
    });
  }

  /** File-field editor (signed agreement field_2767 / bid basis PDF
   *  field_2947). ONE modal for the whole slot — clicking anywhere on a
   *  populated tile lands here, so there's no viewer/editor split:
   *    - shows the CURRENT file (opens in a new tab),
   *    - takes a replacement by drop or browse,
   *    - carries the greenlight-check option (agreement only).
   *  One submit does everything, then the modal closes ITSELF — outcomes
   *  land as toasts, so there's nothing left to click through.
   *
   *  opts: { offerGreenlight: bool, info: {...}, greenlightLabel: string,
   *          current: { name, href } | null } */
  function openFileUpload(viewKey, recId, fieldKey, title, opts) {
    opts = opts || {};
    var wantsGreenlight = !!(opts.offerGreenlight && greenlightUrl());
    var current = opts.current || null;

    var body = document.createElement('div');
    body.innerHTML =
      // Current file — visible the moment the modal opens, clicks out to
      // a new tab (no z-index fight with Knack's lightbox under our modal).
      (current
        ? '<div class="scw-acpt-cur">' +
            '<div class="scw-acpt-cur__cap">Current file</div>' +
            (current.href
              ? '<a class="scw-acpt-cur__file" target="_blank" rel="noopener" href="' + esc(current.href) + '" ' +
                   'title="Open ' + esc(current.name || 'file') + ' in a new tab">' +
                  FILE_SVG + '<span class="scw-acpt-cur__nm">' + esc(current.name || 'file') + '</span>' +
                  '<span class="scw-acpt-cur__hint">view</span>' +
                '</a>'
              : '<span class="scw-acpt-cur__file">' + FILE_SVG +
                  '<span class="scw-acpt-cur__nm">' + esc(current.name || 'file') + '</span></span>') +
          '</div>'
        : '') +
      '<div class="scw-acpt-drop" tabindex="0" role="button" ' +
           'aria-label="' + (current ? 'Drop a replacement here or click to browse'
                                     : 'Drop a file here or click to browse') + '">' +
        UPLOAD_SVG +
        '<div class="scw-acpt-drop__t">' + (current ? 'Drop a replacement here' : 'Drop the file here') + '</div>' +
        '<div class="scw-acpt-drop__s">or click to browse</div>' +
      '</div>' +
      '<div class="scw-acpt-file" hidden>' +
        FILE_SVG +
        '<span class="scw-acpt-file__nm"></span>' +
        '<span class="scw-acpt-file__sz"></span>' +
        '<button type="button" class="scw-acpt-file__x" title="Choose a different file">&times;</button>' +
      '</div>' +
      (wantsGreenlight
        ? '<label class="scw-acpt-chk">' +
            '<input type="checkbox" checked>' +
            '<span>' + esc(opts.greenlightLabel ||
              'Check whether this deal is ready to greenlight') + '</span>' +
          '</label>'
        : '') +
      '<div class="scw-acpt-m__status" style="display:none"></div>';

    var m       = acptModal(title, body, 'Upload');
    var drop    = body.querySelector('.scw-acpt-drop');
    var chip    = body.querySelector('.scw-acpt-file');
    var chipNm  = body.querySelector('.scw-acpt-file__nm');
    var chipSz  = body.querySelector('.scw-acpt-file__sz');
    var chipX   = body.querySelector('.scw-acpt-file__x');
    var glCheck = body.querySelector('.scw-acpt-chk input');
    var status  = body.querySelector('.scw-acpt-m__status');
    var chosen  = null;

    // Hidden native input — the dropzone's click/keyboard path.
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,image/*,application/pdf';
    input.style.display = 'none';
    body.appendChild(input);

    // The primary button says exactly what submit will do: a replacement
    // chosen → "Upload"; nothing chosen but the check ticked on an
    // already-populated slot → "Run check"; otherwise there's nothing to
    // submit and it stays disabled.
    function updateOk() {
      if (chosen) { m.ok.textContent = 'Upload'; m.ok.disabled = false; return; }
      if (current && wantsGreenlight && glCheck && glCheck.checked) {
        m.ok.textContent = 'Run check'; m.ok.disabled = false; return;
      }
      m.ok.textContent = 'Upload';
      m.ok.disabled = true;
    }

    function fmtSize(n) {
      if (!n && n !== 0) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function setFile(file) {
      chosen = file || null;
      if (!chosen) {
        chip.hidden = true;
        drop.hidden = false;
      } else {
        chipNm.textContent = chosen.name || 'file';
        chipSz.textContent = fmtSize(chosen.size);
        chip.hidden = false;
        drop.hidden = true;        // the chip IS the state — no duplicate zone
        status.style.display = 'none';
        status.classList.remove('is-err');
      }
      updateOk();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      setFile(input.files && input.files[0]);
    });
    chipX.addEventListener('click', function () {
      input.value = '';
      setFile(null);
    });
    if (glCheck) glCheck.addEventListener('change', updateOk);
    updateOk();

    // Drag + drop. dragover MUST preventDefault or the browser navigates to
    // the file instead of firing drop.
    ['dragenter', 'dragover'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-over');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) setFile(dt.files[0]);
    });
    // A miss anywhere else in the modal must not hand the page to the file.
    ['dragover', 'drop'].forEach(function (evt) {
      m.backdrop.addEventListener(evt, function (e) {
        if (drop.contains(e.target)) return;
        e.preventDefault();
      });
    });

    function fail(msg) {
      status.style.display = '';
      status.classList.add('is-err');
      status.textContent = msg;
      m.ok.disabled = false;
      m.ok.textContent = 'Upload';
    }
    function say(msg) {
      status.style.display = '';
      status.classList.remove('is-err');
      status.textContent = msg;
    }

    m.ok.addEventListener('click', function () {
      var runCheck = !!(wantsGreenlight && glCheck && glCheck.checked);

      // Check-only submit (populated slot, no replacement chosen): fire
      // and close — the outcome arrives as a toast.
      if (!chosen) {
        if (!runCheck) return;
        m.close();
        toast('Checking greenlight…');
        runGreenlight(viewKey, recId, opts.info || {}, 'manual', null, null);
        return;
      }

      m.ok.disabled = true;
      m.ok.textContent = 'Uploading…';
      say('Uploading ' + (chosen.name || 'file') + '…');

      var fd = new FormData();
      fd.append('files', chosen, chosen.name || 'agreement.pdf');
      $.ajax({
        url: Knack.api_url + '/v1/applications/' + Knack.application_id + '/assets/file/upload',
        type: 'POST',
        data: fd,
        processData: false,
        contentType: false,
        headers: {
          'X-Knack-Application-Id': Knack.application_id,
          'x-knack-rest-api-key': 'knack',
          'Authorization': Knack.getUserToken()
        },
        success: function (res) {
          var assetId = res && (res.id || (res.asset && res.asset.id));
          if (!assetId) return fail('Upload failed — no asset id returned.');
          say('Saving…');
          var fields = {};
          fields[fieldKey] = assetId;
          putAcceptance(viewKey, recId, fields).then(function () {
            // Saved — close immediately and report by toast. The check is
            // a separate promise: if it fails, the toast says the file
            // still landed. Failures BEFORE this point keep the modal open
            // (an error the user must retry can't auto-dismiss).
            m.close();
            refreshAcptView(viewKey);
            if (runCheck) {
              toast('Uploaded — checking greenlight…');
              runGreenlight(viewKey, recId, opts.info || {}, 'agreement-upload', null, null);
            } else {
              toast(title + ' uploaded.');
            }
          }).catch(function (err) {
            fail((err && err.message) || 'Save failed');
          });
        },
        error: function (xhr) {
          fail('Upload failed (' + (xhr && xhr.status) + ')');
        }
      });
    });

    setTimeout(function () { drop.focus(); }, 30);
  }

  /** Standalone greenlight check (row button): confirm, fire, close —
   *  the outcome lands as a toast. */
  function openGreenlightCheck(viewKey, recId, info) {
    var body = document.createElement('div');
    body.innerHTML = '<div>Ask Make whether this deal is ready to greenlight for install?</div>';
    var m = acptModal('Greenlight check', body, 'Run check');
    m.ok.addEventListener('click', function () {
      m.close();
      toast('Checking greenlight…');
      runGreenlight(viewKey, recId, info, 'manual', null, null);
    });
  }

  /** One compact list row for one acceptance record. All anchors/editors
   *  bind to THIS row's record. */
  function buildCard(viewKey, row) {
    var recId   = row.id;
    var propA   = cellAnchor(row, F.proposal, 'a[data-kn="connection-link"]') || cellAnchor(row, F.proposal);
    var propTxt = propA ? propA.textContent.replace(/\s+/g, ' ').trim() : (cellText(row, F.proposal) || 'Proposal');
    var propHref = propA ? (propA.getAttribute('href') || '') : '';
    var paid    = isYes(cellText(row, F.payment));
    var signed  = isYes(cellText(row, F.signed));
    // When approved for terms, the initial-payment requirement is waived —
    // show an "Approved for terms" pill in place of the payment-received pill.
    var terms   = isYes(cellText(row, F.terms));
    var xeroA    = cellAnchor(row, F.xero);
    var xeroEstA = cellAnchor(row, F.xeroEst);
    var fileA    = cellAnchor(row, F.agreement, 'a.kn-view-asset') || cellAnchor(row, F.agreement);
    var bidPdfA  = cellAnchor(row, F.bidPdf, 'a.kn-view-asset') || cellAnchor(row, F.bidPdf);
    var actionA  = row.querySelector('.kn-action-link') || row.querySelector('.kn-table-link a');

    // Connected proposal's record id — the 24-hex class on the connection
    // span (see CLAUDE.md "Reading Connection Fields from Table DOM"),
    // falling back to a hex run in the link href.
    var propId = '';
    var propSpan = row.querySelector('td.' + F.proposal + ' span[data-kn="connection-value"]');
    if (propSpan) propId = (propSpan.className || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(propId)) {
      var hrefHex = propHref.match(/[a-f0-9]{24}/i);
      propId = hrefHex ? hrefHex[0] : '';
    }

    // One tile per document. DONE → green tile, leading check; the main
    // zone opens the doc, the hover-revealed pencil edits it. MISSING →
    // dashed ghost with a leading plus; the whole tile opens the editor.
    // `full` is the untruncated document name (tooltips + aria); `label`
    // is the short on-tile text (the pair caption carries the context).
    function fileSlot(fk, label, full, anchor, editTitle) {
      if (!anchor) {
        return '<button type="button" class="scw-acpt-doc--missing" data-edit-field="' + fk + '" title="Add ' + esc(full) + '">' +
          PLUS_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span></button>';
      }
      // Populated: the WHOLE tile (main zone and pencil alike) opens the
      // uploader modal, which shows the current file and takes a
      // replacement — one behavior, no viewer/editor split.
      return '<span class="scw-acpt-doc">' +
        '<a class="scw-acpt-doc__open" data-edit-field="' + fk + '" href="javascript:void(0)" title="View or replace ' + esc(full) + '">' +
          CHECK_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span>' +
        '</a>' +
        '<button type="button" class="scw-acpt-doc__edit" data-edit-field="' + fk + '" title="' + esc(editTitle) + '">' + PENCIL_SVG + '</button>' +
      '</span>';
    }
    function linkSlot(fk, label, full, anchor, editTitle) {
      if (!anchor) {
        return '<button type="button" class="scw-acpt-doc--missing" data-edit-field="' + fk + '" title="Add ' + esc(full) + '">' +
          PLUS_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span></button>';
      }
      return '<span class="scw-acpt-doc">' +
        '<a class="scw-acpt-doc__open" target="_blank" rel="noopener" href="' + esc(anchor.getAttribute('href') || '') + '" title="Open ' + esc(full) + '">' +
          CHECK_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span>' +
        '</a>' +
        '<button type="button" class="scw-acpt-doc__edit" data-edit-field="' + fk + '" title="' + esc(editTitle) + '">' + PENCIL_SVG + '</button>' +
      '</span>';
    }

    // Change-order acceptances (SOW number "SW####CO") have no initial
    // payment — the CO amount rides the final project invoice — so the
    // payment pill is noise there. Signature is the only gate.
    var isCo = /\bSW\d+CO\b/i.test(propTxt);

    // "61507493933-SW1347 | 20260807-11068" → bold deal-SOW title with the
    // proposal id as a muted sub-line (the pipe tail was noise in the title).
    var propMain = propTxt, propSub = '';
    var pSplit = propTxt.split(/\s*\|\s*/);
    if (pSplit.length === 2 && pSplit[1]) { propMain = pSplit[0]; propSub = pSplit[1]; }

    var html =
      '<div class="scw-acpt-id">' +
        (propHref
          ? '<a class="scw-acpt-title" href="' + esc(propHref) + '">' + esc(propMain) + '</a>'
          : '<div class="scw-acpt-title">' + esc(propMain) + '</div>') +
        (propSub ? '<div class="scw-acpt-sub">Proposal ' + esc(propSub) + '</div>' : '') +
      '</div>' +
      '<div class="scw-acpt-status">' +
        (isCo ? '' :
          (terms
            ? pill('Approved for terms', true)
            : pill(paid ? 'Initial payment received' : 'Initial payment pending', paid))) +
        pill(signed ? 'Agreement signed'         : 'Agreement not signed',    signed) +
      '</div>' +
      '<div class="scw-acpt-actions">' +
        // Two captioned mirror pairs: the signed agreement with its
        // invoice, and the bid basis PDF with its Xero estimate. The
        // caption carries the context so tile labels stay short enough
        // to never truncate.
        '<span class="scw-acpt-pair">' +
          '<span class="scw-acpt-pair__cap">Agreement</span>' +
          '<span class="scw-acpt-pair__tiles">' +
            fileSlot(F.agreement, 'Signed PDF',   'signed agreement',   fileA,    'Replace signed agreement') +
            linkSlot(F.xero,      'Xero invoice', 'Xero invoice link',  xeroA,    'Edit Xero invoice link') +
          '</span>' +
        '</span>' +
        '<span class="scw-acpt-pair">' +
          '<span class="scw-acpt-pair__cap">Estimate</span>' +
          '<span class="scw-acpt-pair__tiles">' +
            fileSlot(F.bidPdf,    'Bid PDF',       'bid basis PDF',      bidPdfA,  'Replace bid basis PDF') +
            linkSlot(F.xeroEst,   'Xero estimate', 'Xero estimate link', xeroEstA, 'Edit Xero estimate link') +
          '</span>' +
        '</span>' +
        // Re-run the greenlight check without touching the agreement.
        // Only once there's an agreement on file (nothing to check before
        // that) and only when the scenario is configured.
        ((fileA && greenlightUrl())
          ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--ghost" data-greenlight="1" ' +
            'title="Check whether this deal is ready to greenlight for install">Check greenlight</button>'
          : '') +
        (actionA ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--primary" data-proxy="action">Create Questionnaire</button>' : '') +
      '</div>';

    var card = document.createElement('div');
    card.className = 'scw-acpt-row';
    card.innerHTML = html;

    var actBtn = card.querySelector('[data-proxy="action"]');
    if (actBtn && actionA) actBtn.addEventListener('click', function () { actionA.click(); });

    // Row state the greenlight payload carries, snapshotted at build time.
    var glInfo = {
      proposalId:    propId,
      proposalLabel: propTxt,
      signed:        signed,
      paid:          paid,
      terms:         terms
    };
    var glBtn = card.querySelector('[data-greenlight]');
    if (glBtn) {
      glBtn.addEventListener('click', function () {
        openGreenlightCheck(viewKey, recId, glInfo);
      });
    }

    // Edit / add affordances → the card's own editors (view-based PUT
    // against THIS row's record id).
    var editBtns = card.querySelectorAll('[data-edit-field]');
    for (var eb = 0; eb < editBtns.length; eb++) {
      editBtns[eb].addEventListener('click', function () {
        var fk = this.getAttribute('data-edit-field');
        if (fk === F.xero) {
          openLinkEditor(viewKey, recId, F.xero, 'Xero invoice link',
            xeroA ? (xeroA.getAttribute('href') || '') : '');
        } else if (fk === F.xeroEst) {
          openLinkEditor(viewKey, recId, F.xeroEst, 'Xero estimate link',
            xeroEstA ? (xeroEstA.getAttribute('href') || '') : '');
        } else if (fk === F.agreement) {
          openFileUpload(viewKey, recId, F.agreement, 'Signed agreement', {
            offerGreenlight: true,
            info: glInfo,
            greenlightLabel: 'Also check whether this deal is ready to greenlight',
            current: fileA ? { name: (fileA.textContent || '').replace(/\s+/g, ' ').trim(),
                              href: fileA.getAttribute('href') || '' } : null
          });
        } else if (fk === F.bidPdf) {
          openFileUpload(viewKey, recId, F.bidPdf, 'Bid basis PDF', {
            current: bidPdfA ? { name: (bidPdfA.textContent || '').replace(/\s+/g, ' ').trim(),
                                href: bidPdfA.getAttribute('href') || '' } : null
          });
        }
      });
    }
    return card;
  }

  function render() {
    for (var vi = 0; vi < VIEWS.length; vi++) renderView(VIEWS[vi]);
  }

  function renderView(VIEW) {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();

    // COLUMN GUARD — no proposal column means this grid doesn't expose the
    // acceptance fields (the sub view_4066 ships thin). Leave the native
    // table alone; the card takes over the moment Builder adds the columns.
    if (!viewEl.querySelector('thead th.' + F.proposal)) {
      viewEl.classList.remove('scw-acpt-on');
      var stale = viewEl.querySelector(':scope > .scw-acpt-card');
      if (stale) stale.remove();
      return;
    }
    viewEl.classList.add('scw-acpt-on');

    // Rebuild from scratch — a project accrues one acceptance per signed
    // agreement (base proposal + each CO). ONE card, one compact list row
    // per record in the grid's own order, so a testing pile of 20 doesn't
    // eat the page.
    var prior = viewEl.querySelector(':scope > .scw-acpt-card');
    if (prior) prior.remove();

    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!rows.length) return;

    // Triage sort: rows still needing something (unsigned agreement, or a
    // base acceptance with neither payment nor terms approval) float to the
    // top so a 6-12 acceptance pile on a big project self-prioritizes.
    var entries = [];
    var signedCount = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      var rSigned = isYes(cellText(r, F.signed));
      var rPaid   = isYes(cellText(r, F.payment));
      var rTerms  = isYes(cellText(r, F.terms));
      var rIsCo   = /\bSW\d+CO\b/i.test(cellText(r, F.proposal));
      var attention = !rSigned || (!rIsCo && !rTerms && !rPaid);
      if (rSigned) signedCount++;
      entries.push({ row: r, attention: attention, order: ri });
    }
    entries.sort(function (a, b) {
      if (a.attention !== b.attention) return a.attention ? -1 : 1;
      return a.order - b.order;   // stable within each tier
    });

    var card = document.createElement('div');
    card.className = 'scw-acpt-card';
    card.innerHTML = '<div class="scw-acpt-eyebrow">Acceptance</div>';
    for (var ei = 0; ei < entries.length; ei++) {
      card.appendChild(buildCard(VIEW, entries[ei].row));
    }
    viewEl.appendChild(card);

    // Rollup badge in the accordion header bar: "N awaiting signature"
    // (amber) or "all signed" (green) — visible without expanding, and the
    // attention attribute feeds the deploy page nav's amber dot.
    var pending = rows.length - signedCount;
    var acc = viewEl.closest('.scw-ktl-accordion');
    if (acc) {
      acc.toggleAttribute && acc.toggleAttribute('data-scw-attention', pending > 0);
      var head = acc.querySelector('.scw-ktl-accordion__header');
      var countEl = head && head.querySelector('.scw-acc-count');
      if (head) {
        var roll = head.querySelector('.scw-acpt-rollup');
        if (!roll) {
          roll = document.createElement('span');
          roll.className = 'scw-acpt-rollup';
          if (countEl) head.insertBefore(roll, countEl);
          else head.appendChild(roll);
        }
        roll.classList.toggle('scw-acpt-rollup--warn', pending > 0);
        roll.classList.toggle('scw-acpt-rollup--ok', pending === 0);
        roll.textContent = pending > 0
          ? (pending + ' awaiting signature')
          : 'all signed';
      }
    }
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    VIEWS.forEach(function (v) {
      SCW.onViewRender(v, function () { setTimeout(render, 30); }, EVENT_NS);
    });
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(render, 150); });
})();
/*** END FEATURE: Acceptance summary card **********************************/
