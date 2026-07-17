/*** FEATURE: Acceptance summary card (view_3914) **************************
 *
 * Replaces the raw INSTALL_acceptance table on the deploy scene with clean
 * cards — ONE PER RECORD (2026-07-17: a project accrues an acceptance per
 * signed agreement — the base proposal plus each change order — so the old
 * first-row-only render hid every CO acceptance). Each card: the proposal as
 * the title, Yes/No flags as status pills, and the document links + the
 * "Create Questionnaire" action rendered as buttons. The native table is
 * hidden (kept in the DOM) and the buttons proxy clicks to their own row's
 * original anchors so Knack's asset/action handlers still fire; the editors
 * PUT against their own row's record id.
 *
 * Columns:
 *   field_2755  REL proposal (connection link)        → title
 *   field_2765  FLAG_initial payment received (Yes/No) → pill
 *   field_2766  FLAG_agreement signed (Yes/No)         → pill
 *   field_1847  Xero Equipment Invoice Link (URL)      → button
 *   field_2767  SYS_signed agreement (file)            → button
 *   .kn-action-link "Create Questionnaire"             → primary button
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_3914';
  var STYLE_ID = 'scw-acpt-css';
  var EVENT_NS = '.scwAcceptanceCard';
  var F = {
    proposal:  'field_2755',
    payment:   'field_2765',
    signed:    'field_2766',
    terms:     'field_2940',   // FLAG_approved for terms (Yes/No)
    xero:      'field_1847',
    agreement: 'field_2767'
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
  var LINK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      // Hide the raw grid chrome — the card replaces it. (Editing no longer
      // proxies Knack's cell editor; the card has its own editors, so the
      // table can be plain display:none again.)
      '#' + VIEW + ' .view-header,',
      '#' + VIEW + ' .kn-records-nav,',
      '#' + VIEW + ' .kn-table-wrapper { display: none !important; }',
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
      // Edit pencil beside a populated value + "add" ghost when empty.
      '.scw-acpt-edit { display: inline-flex; align-items: center; justify-content: center;',
      '  width: 26px; height: 26px; border-radius: 6px; cursor: pointer; color: #64748b;',
      '  background: transparent; border: 1px solid transparent; padding: 0; }',
      '.scw-acpt-edit:hover { background: #eef2f7; border-color: #cbd5e1; color: #0f4c75; }',
      '.scw-acpt-btn--add { background: #fff; border: 1px dashed #cbd5e1; color: #64748b; }',
      '.scw-acpt-btn--add:hover { background: #f8fafc; border-color: #94a3b8; color: #334155; }',
      '.scw-acpt-group { display: inline-flex; align-items: center; gap: 2px; }',
      // Compact list mode: ONE card, one row per acceptance record —
      // title | pills | actions on a single line (wraps on narrow).
      '.scw-acpt-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;',
      '  padding: 8px 2px; }',
      '.scw-acpt-row + .scw-acpt-row { border-top: 1px solid #eef2f7; }',
      '.scw-acpt-row .scw-acpt-title { font-size: 13px; flex: 0 1 auto; }',
      '.scw-acpt-row .scw-acpt-status { margin: 0; gap: 6px; }',
      '.scw-acpt-row .scw-acpt-pill { padding: 3px 9px; font-size: 11px; }',
      '.scw-acpt-row .scw-acpt-actions { margin-left: auto; gap: 6px; }',
      '.scw-acpt-row .scw-acpt-btn { padding: 5px 10px; font-size: 11.5px; }',
      '.scw-acpt-row .scw-acpt-edit { width: 22px; height: 22px; }',
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
      '.scw-acpt-m__btn--ok:disabled { background: #cbd5e1; cursor: not-allowed; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
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

  function refreshAcptView() {
    try {
      var v = window.Knack && Knack.views && Knack.views[VIEW];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    } catch (e) { /* best-effort */ }
  }
  function putAcceptance(recId, fields) {
    return new Promise(function (resolve, reject) {
      if (!recId) return reject(new Error('no acceptance record on the page'));
      if (!(window.SCW && typeof SCW.knackAjax === 'function')) {
        return reject(new Error('SCW.knackAjax unavailable'));
      }
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(VIEW, recId),
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

  /** Xero invoice link (field_1847, Link field) — URL input modal. */
  function openXeroEditor(recId, currentUrl) {
    var body = document.createElement('div');
    body.innerHTML =
      '<input type="url" class="scw-acpt-m__input" placeholder="https://…">' +
      '<div class="scw-acpt-m__status" style="display:none"></div>';
    var input = body.querySelector('input');
    input.value = currentUrl || '';
    var m = acptModal('Xero invoice link', body, 'Save link');
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
      fields[F.xero] = url;   // empty string clears the link
      putAcceptance(recId, fields).then(function () {
        m.close();
        refreshAcptView();
      }).catch(function (err) { fail((err && err.message) || 'Save failed'); });
    });
  }

  /** Signed agreement (field_2767, File field) — picker → Knack asset
   *  upload with the session token → PUT the asset id. */
  function openAgreementUpload(recId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,image/*,application/pdf';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var body = document.createElement('div');
      body.innerHTML = '<div class="scw-acpt-m__status">Uploading ' +
        esc(file.name || 'file') + '…</div>';
      var m = acptModal('Signed agreement', body, 'Close');
      m.ok.disabled = true;
      var status = body.querySelector('.scw-acpt-m__status');

      var fd = new FormData();
      fd.append('files', file, file.name || 'agreement.pdf');
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
          if (!assetId) {
            status.classList.add('is-err');
            status.textContent = 'Upload failed — no asset id returned.';
            m.ok.disabled = false;
            return;
          }
          status.textContent = 'Saving…';
          var fields = {};
          fields[F.agreement] = assetId;
          putAcceptance(recId, fields).then(function () {
            m.close();
            refreshAcptView();
          }).catch(function (err) {
            status.classList.add('is-err');
            status.textContent = (err && err.message) || 'Save failed';
            m.ok.disabled = false;
          });
        },
        error: function (xhr) {
          status.classList.add('is-err');
          status.textContent = 'Upload failed (' + (xhr && xhr.status) + ')';
          m.ok.disabled = false;
        }
      });
      m.ok.addEventListener('click', m.close);
    });
    document.body.appendChild(input);
    input.click();
  }

  /** One compact list row for one acceptance record. All anchors/editors
   *  bind to THIS row's record. */
  function buildCard(row) {
    var recId   = row.id;
    var propA   = cellAnchor(row, F.proposal, 'a[data-kn="connection-link"]') || cellAnchor(row, F.proposal);
    var propTxt = propA ? propA.textContent.replace(/\s+/g, ' ').trim() : (cellText(row, F.proposal) || 'Proposal');
    var propHref = propA ? (propA.getAttribute('href') || '') : '';
    var paid    = isYes(cellText(row, F.payment));
    var signed  = isYes(cellText(row, F.signed));
    // When approved for terms, the initial-payment requirement is waived —
    // show an "Approved for terms" pill in place of the payment-received pill.
    var terms   = isYes(cellText(row, F.terms));
    var xeroA   = cellAnchor(row, F.xero);
    var fileA   = cellAnchor(row, F.agreement, 'a.kn-view-asset') || cellAnchor(row, F.agreement);
    var actionA = row.querySelector('.kn-action-link') || row.querySelector('.kn-table-link a');

    var html =
      (propHref
        ? '<a class="scw-acpt-title" href="' + esc(propHref) + '">' + esc(propTxt) + '</a>'
        : '<div class="scw-acpt-title">' + esc(propTxt) + '</div>') +
      '<div class="scw-acpt-status">' +
        (terms
          ? pill('Approved for terms', true)
          : pill(paid ? 'Initial payment received' : 'Initial payment pending', paid)) +
        pill(signed ? 'Agreement signed'         : 'Agreement not signed',    signed) +
      '</div>' +
      '<div class="scw-acpt-actions">' +
        (fileA
          ? '<span class="scw-acpt-group">' +
              '<a class="scw-acpt-btn scw-acpt-btn--ghost" data-proxy="file" href="javascript:void(0)">' + FILE_SVG + 'Signed agreement</a>' +
              '<button type="button" class="scw-acpt-edit" data-edit-field="' + F.agreement + '" title="Replace signed agreement">' + PENCIL_SVG + '</button>' +
            '</span>'
          : '<button type="button" class="scw-acpt-btn scw-acpt-btn--add" data-edit-field="' + F.agreement + '">' + PLUS_SVG + 'Signed agreement</button>') +
        (xeroA
          ? '<span class="scw-acpt-group">' +
              '<a class="scw-acpt-btn scw-acpt-btn--ghost" target="_blank" rel="noopener" href="' + esc(xeroA.getAttribute('href') || '') + '">' + LINK_SVG + 'Xero invoice</a>' +
              '<button type="button" class="scw-acpt-edit" data-edit-field="' + F.xero + '" title="Edit Xero invoice link">' + PENCIL_SVG + '</button>' +
            '</span>'
          : '<button type="button" class="scw-acpt-btn scw-acpt-btn--add" data-edit-field="' + F.xero + '">' + PLUS_SVG + 'Xero invoice link</button>') +
        (actionA ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--primary" data-proxy="action">Create Questionnaire</button>' : '') +
      '</div>';

    var card = document.createElement('div');
    card.className = 'scw-acpt-row';
    card.innerHTML = html;

    // Proxy clicks to the original (hidden) anchors so Knack's asset preview +
    // action-rule handlers still run.
    var fileBtn = card.querySelector('[data-proxy="file"]');
    if (fileBtn && fileA) fileBtn.addEventListener('click', function (e) { e.preventDefault(); fileA.click(); });
    var actBtn = card.querySelector('[data-proxy="action"]');
    if (actBtn && actionA) actBtn.addEventListener('click', function () { actionA.click(); });

    // Edit / add affordances → the card's own editors (view-based PUT
    // against THIS row's record id).
    var editBtns = card.querySelectorAll('[data-edit-field]');
    for (var eb = 0; eb < editBtns.length; eb++) {
      editBtns[eb].addEventListener('click', function () {
        var fk = this.getAttribute('data-edit-field');
        if (fk === F.xero) {
          openXeroEditor(recId, xeroA ? (xeroA.getAttribute('href') || '') : '');
        } else if (fk === F.agreement) {
          openAgreementUpload(recId);
        }
      });
    }
    return card;
  }

  function render() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();

    // Rebuild from scratch — a project accrues one acceptance per signed
    // agreement (base proposal + each CO). ONE card, one compact list row
    // per record in the grid's own order, so a testing pile of 20 doesn't
    // eat the page.
    var prior = viewEl.querySelector(':scope > .scw-acpt-card');
    if (prior) prior.remove();

    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!rows.length) return;

    var card = document.createElement('div');
    card.className = 'scw-acpt-card';
    card.innerHTML = '<div class="scw-acpt-eyebrow">Acceptance</div>';
    for (var ri = 0; ri < rows.length; ri++) {
      card.appendChild(buildCard(rows[ri]));
    }
    viewEl.appendChild(card);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(render, 30); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(render, 150); });
})();
/*** END FEATURE: Acceptance summary card **********************************/
