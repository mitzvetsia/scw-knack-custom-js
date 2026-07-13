/*** FEATURE: Published-proposal card at top of the SOW column (scene_1116) ***/
/**
 * Mounts the shared SCW.publishedQuoteInfo widget as a collapsible card at
 * the very top of the SOW-detail column on the Build SOW page (scene_1116).
 *
 * Source of truth: view_3814 — the SOW_published_proposals details view that
 * already lives on this scene (currently consumed by scene-tweaks.js to draw
 * the proposal in the right-hand totals panel). This file relocates that
 * block into the SOW column and adds:
 *
 *   1. A collapsible accordion header that matches the workflow-stepper
 *      chrome (chevron + uppercase title + chip slot for status hints).
 *      Collapsed state persists in localStorage between sessions.
 *
 *   2. An inline edit affordance on the expiration date — pencil icon
 *      next to "Expires: MM/DD/YYYY"; click → date input + save/cancel
 *      buttons. Save PUTs field_2659 on the proposal record via
 *      Knack.views.view_3814.model.save (Backbone patch), then refreshes
 *      the underlying view so the block re-paints with the new date.
 *
 * Designed so scene-tweaks.js's injectProposalInfo can stop rendering the
 * block in the totals — we don't want two copies of it on the same page.
 */
(function () {
  'use strict';

  var SCENE_ID     = 'scene_1116';
  var SOURCE_VIEW  = 'view_3814';   // SOW_published proposals details view
  var ANCHOR_VIEW  = 'view_3827';   // SOW details — drop the card above this
  var EXP_FIELD    = 'field_2659';  // expiration date on the proposal record
  var STYLE_ID     = 'scw-pp-sow-card-css';
  var CARD_ID      = 'scw-pp-sow-card';
  var STORAGE_KEY  = 'scw-pp-sow-card-collapsed';
  var NS           = '.scwPPSowCard';

  // ── Styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + CARD_ID + ' {' +
      '  display: block; margin: 0 0 12px 0;' +
      '  background: #ffffff; border: 1px solid #e2e8f0;' +
      '  border-radius: 10px; overflow: hidden;' +
      '  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr {' +
      '  display: flex; align-items: center; gap: 8px;' +
      '  padding: 10px 14px; cursor: pointer; user-select: none;' +
      '  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);' +
      '  border-bottom: 1px solid transparent;' +
      '  transition: background 0.12s ease, border-color 0.12s ease;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr:hover { background: #eef2f7; }' +
      '#' + CARD_ID + ':not(.is-collapsed) .scw-pp-hdr {' +
      '  border-bottom-color: #e2e8f0;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-chev {' +
      '  flex: 0 0 auto; width: 14px; height: 14px;' +
      '  color: #64748b; transition: transform 0.15s ease;' +
      '}' +
      '#' + CARD_ID + '.is-collapsed .scw-pp-chev { transform: rotate(-90deg); }' +
      '#' + CARD_ID + ' .scw-pp-title {' +
      '  flex: 1 1 auto; font-size: 11px; font-weight: 700;' +
      '  letter-spacing: 0.6px; text-transform: uppercase; color: #07467c;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr-chips {' +
      '  flex: 0 0 auto; display: flex; align-items: center; gap: 6px;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr-chips > * {' +
      '  font-size: 10px !important;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr-exp {' +
      '  font-size: 11px; font-weight: 500; color: #475569;' +
      '  font-variant-numeric: tabular-nums;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-hdr-exp--past { color: #b91c1c; font-weight: 600; }' +
      '#' + CARD_ID + ' .scw-pp-body {' +
      '  padding: 12px 14px 14px;' +
      '}' +
      '#' + CARD_ID + '.is-collapsed .scw-pp-body { display: none; }' +
      /* Tighten the embedded widget — it ships a panel chrome by default
         in the 'panel' variant; we provide our own outer card so use
         'regular' and zero out the inner margins. */
      '#' + CARD_ID + ' .scw-pq-info {' +
      '  margin: 0 !important; padding: 0 !important;' +
      '  background: transparent !important; border: none !important;' +
      '  text-align: left !important;' +
      '}' +
      '#' + CARD_ID + ' .scw-pq-header {' +
      '  /* Hide the embedded "Published Proposal" header — our card */' +
      '  /* header already shows it.                                  */' +
      '  display: none !important;' +
      '}' +
      /* Inline edit affordance on the expiration date */
      '#' + CARD_ID + ' .scw-pp-exp-edit-row {' +
      '  display: inline-flex; align-items: center; gap: 6px;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-btn {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 22px; height: 22px; padding: 0; border: 1px solid transparent;' +
      '  background: transparent; color: #64748b; cursor: pointer;' +
      '  border-radius: 4px; transition: background 0.12s, color 0.12s, border-color 0.12s;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-btn:hover {' +
      '  background: #e2e8f0; color: #0f4c75; border-color: #cbd5e1;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-btn svg { width: 13px; height: 13px; }' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form {' +
      '  display: inline-flex; align-items: center; gap: 4px;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form input[type="date"] {' +
      '  font-size: 13px; padding: 3px 6px; border: 1px solid #cbd5e1;' +
      '  border-radius: 4px; background: #fff;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form button {' +
      '  font-size: 11px; font-weight: 600; padding: 4px 8px;' +
      '  border-radius: 4px; cursor: pointer; border: 1px solid transparent;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form .scw-pp-exp-save {' +
      '  background: #07467c; color: #fff; border-color: #07467c;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form .scw-pp-exp-save:hover { background: #0a5494; }' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form .scw-pp-exp-cancel {' +
      '  background: #fff; color: #475569; border-color: #cbd5e1;' +
      '}' +
      '#' + CARD_ID + ' .scw-pp-exp-edit-form .scw-pp-exp-cancel:hover { background: #f1f5f9; }' +
      '#' + CARD_ID + ' .scw-pp-exp-error {' +
      '  display: block; margin-top: 4px; font-size: 11px; color: #b91c1c;' +
      '}';

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Collapsed state persistence ────────────────────────────
  function loadCollapsed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch (e) { return false; }
  }
  function saveCollapsed(collapsed) {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); }
    catch (e) { /* ignore */ }
  }

  // ── Date helpers ────────────────────────────────────────────
  // Knack date fields render as "MM/DD/YYYY". <input type="date"> wants
  // "YYYY-MM-DD". These convert between the two.
  function toIsoYmd(mdy) {
    if (!mdy) return '';
    var m = String(mdy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return '';
    var mm = ('0' + m[1]).slice(-2);
    var dd = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  function toMdy(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return parseInt(m[2], 10) + '/' + parseInt(m[3], 10) + '/' + m[1];
  }

  // ── Save expiration date through Knack's page-view PUT API ──
  // Mirrors the pattern used by ops-review-pill.js (SCW.knackAjax +
  // SCW.knackRecordUrl). SAVE_VIEW must be a view on scene_1116 that
  // permits writes to field_2659. view_3814 is the details view that
  // already lives on this scene and is what we read from; if Knack
  // rejects the PUT (403/400), set SAVE_VIEW to a dedicated Update
  // form view for SOW_published_proposals with field_2659 editable.
  var SAVE_VIEW = SOURCE_VIEW;

  function getProposalRecordId() {
    var view = window.Knack && Knack.views && Knack.views[SOURCE_VIEW];
    if (!view) return '';
    // Details view: model.id (or attributes.id)
    if (view.model) {
      if (view.model.id) return view.model.id;
      if (view.model.attributes && view.model.attributes.id) return view.model.attributes.id;
    }
    // Grid view fallback: first row of the data collection
    if (view.model && view.model.data && view.model.data.length) {
      var first = view.model.data.models && view.model.data.models[0];
      if (first && first.id) return first.id;
    }
    return '';
  }

  function saveExpiration(mdyValue, onDone) {
    if (!window.SCW || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      onDone(new Error('SCW API helpers not loaded'));
      return;
    }
    var recordId = getProposalRecordId();
    if (!recordId) {
      onDone(new Error('Proposal record id not found on ' + SOURCE_VIEW));
      return;
    }
    var body = {};
    body[EXP_FIELD] = mdyValue;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(SAVE_VIEW, recordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function (resp) {
        // Patch the live model so the card repaints with the new date
        // without a full re-fetch. syncKnackModel touches both .data
        // and ._raw on the model.
        if (typeof SCW.syncKnackModel === 'function') {
          try { SCW.syncKnackModel(SOURCE_VIEW, recordId, resp, EXP_FIELD, mdyValue); }
          catch (e) { /* non-fatal */ }
        }
        // Best-effort fetch to pick up server-recomputed "expired" state.
        try {
          var v = window.Knack && Knack.views && Knack.views[SOURCE_VIEW];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e) { /* non-fatal */ }
        onDone(null);
      },
      error: function (xhr) {
        var status = xhr && xhr.status;
        var msg = 'Save failed';
        if (status === 403 || status === 401) {
          msg = 'Save denied (HTTP ' + status + ') — need an editable ' +
                'Update form view for SOW_published proposals on scene_1116 ' +
                'with ' + EXP_FIELD + ' enabled. Set SAVE_VIEW to that view id.';
        } else if (status === 404) {
          msg = 'Save failed (404) — record or view path not found.';
        } else if (status) {
          msg = 'Save failed (HTTP ' + status + ')';
          try {
            var resp = xhr.responseJSON;
            if (resp && resp.errors && resp.errors.length) {
              msg += ': ' + resp.errors.map(function (e) { return e.message || JSON.stringify(e); }).join('; ');
            }
          } catch (e) { /* ignore parse errors */ }
        }
        console.warn('[scw-pp-sow-card] saveExpiration failed:', xhr && xhr.responseText);
        onDone(new Error(msg));
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────
  function chevronSvg() {
    return '<svg class="scw-pp-chev" viewBox="0 0 24 24" fill="none" ' +
           'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
           'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  }
  function pencilSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M12 20h9"></path>' +
           '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>' +
           '</svg>';
  }

  // Replace the static "Expires: MM/DD/YYYY" line inside the rendered
  // .scw-pq-info block with an editable equivalent. The display still
  // reads identical when not in edit mode — we just wrap it with a
  // pencil button.
  function makeExpirationEditable(block, currentMdy) {
    var expEl = block.querySelector('.scw-pq-exp');
    if (!expEl || expEl.querySelector('.scw-pp-exp-edit-row')) return;

    // Preserve the original "Expires: …" text so re-rendering / cancel
    // can put it back verbatim.
    var originalText = expEl.textContent;

    var row = document.createElement('span');
    row.className = 'scw-pp-exp-edit-row';

    var textSpan = document.createElement('span');
    textSpan.textContent = originalText;
    row.appendChild(textSpan);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-pp-exp-edit-btn';
    btn.setAttribute('title', 'Edit expiration date');
    btn.setAttribute('aria-label', 'Edit expiration date');
    btn.innerHTML = pencilSvg();
    row.appendChild(btn);

    expEl.textContent = '';
    expEl.appendChild(row);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();  // don't toggle the card collapse
      openEditor();
    });

    function openEditor() {
      var form = document.createElement('span');
      form.className = 'scw-pp-exp-edit-form';

      var input = document.createElement('input');
      input.type = 'date';
      input.value = toIsoYmd(currentMdy);

      var save = document.createElement('button');
      save.type = 'button';
      save.className = 'scw-pp-exp-save';
      save.textContent = 'Save';

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'scw-pp-exp-cancel';
      cancel.textContent = 'Cancel';

      var err = document.createElement('span');
      err.className = 'scw-pp-exp-error';

      form.appendChild(input);
      form.appendChild(save);
      form.appendChild(cancel);

      expEl.textContent = '';
      expEl.appendChild(form);
      expEl.appendChild(err);
      input.focus();

      function close() { expEl.textContent = ''; expEl.appendChild(row); }
      cancel.addEventListener('click', function (ev) { ev.stopPropagation(); close(); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
        else if (ev.key === 'Enter') { ev.stopPropagation(); save.click(); }
      });
      save.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var iso = input.value;
        var mdy = toMdy(iso);
        if (!mdy) { err.textContent = 'Pick a valid date.'; return; }
        save.disabled = true; save.textContent = 'Saving…';
        saveExpiration(mdy, function (saveErr) {
          if (saveErr) {
            err.textContent = saveErr.message || 'Save failed';
            save.disabled = false; save.textContent = 'Save';
            return;
          }
          // model.fetch fires knack-view-render on view_3814 → our
          // listener re-runs render() and rebuilds the card with the
          // updated expiration. Nothing more to do here.
          close();
        });
      });
    }
  }

  function buildHeaderChips(block) {
    // Pull the type chip + expired badge out of the embedded block and
    // mirror them up into our card header (keeping them near the title
    // when collapsed, where the body is hidden).
    var hdrChipsHost = document.createElement('div');
    hdrChipsHost.className = 'scw-pp-hdr-chips';

    var typeChip = block.querySelector('.scw-proposal-type-chip');
    if (typeChip) hdrChipsHost.appendChild(typeChip.cloneNode(true));

    var expBadge = block.querySelector('.scw-pq-expired-badge');
    if (expBadge) hdrChipsHost.appendChild(expBadge.cloneNode(true));

    // Surface the expiration date next to the chips so the user sees
    // "Expires MM/DD/YYYY" even when collapsed. Click still toggles
    // collapse — the editable affordance is only inside the body.
    var expEl = block.querySelector('.scw-pq-exp');
    if (expEl) {
      var hdrExp = document.createElement('span');
      hdrExp.className = 'scw-pp-hdr-exp';
      if (expEl.classList.contains('scw-pq-exp--past')) {
        hdrExp.classList.add('scw-pp-hdr-exp--past');
      }
      hdrExp.textContent = (expEl.textContent || '').trim();
      hdrChipsHost.appendChild(hdrExp);
    }

    return hdrChipsHost;
  }

  function render() {
    if (!window.SCW || !SCW.publishedQuoteInfo) return;
    var anchor = document.getElementById(ANCHOR_VIEW);
    if (!anchor) return;
    var column = anchor.closest('.view-column') || anchor.parentNode;
    if (!column) return;

    // Remove any previous card before rebuilding — re-renders happen
    // on every view-render of view_3814 / view_3827.
    var existing = document.getElementById(CARD_ID);
    if (existing) existing.remove();

    var proposal = SCW.publishedQuoteInfo.read({ sourceView: SOURCE_VIEW });
    if (!proposal) return;   // no published proposal yet — nothing to show

    var block = SCW.publishedQuoteInfo.buildBlock(proposal, {
      variant: 'regular',
      header:  'Published Proposal',
      customerLink: {
        url:                  proposal.tokenUrl || '',
        label:                'Open Customer Link',
        expiredFallbackUrl:   proposal.viewLink || '',
        expiredFallbackLabel: 'View Published Details'
      }
    });
    if (!block) return;

    // Card chrome.
    var card = document.createElement('div');
    card.id = CARD_ID;
    if (loadCollapsed()) card.classList.add('is-collapsed');

    var hdr = document.createElement('div');
    hdr.className = 'scw-pp-hdr';
    hdr.setAttribute('role', 'button');
    hdr.setAttribute('aria-expanded', card.classList.contains('is-collapsed') ? 'false' : 'true');
    hdr.innerHTML = chevronSvg();

    var title = document.createElement('span');
    title.className = 'scw-pp-title';
    title.textContent = 'Published Proposal';
    hdr.appendChild(title);

    hdr.appendChild(buildHeaderChips(block));

    hdr.addEventListener('click', function () {
      var collapsed = card.classList.toggle('is-collapsed');
      hdr.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      saveCollapsed(collapsed);
    });

    var body = document.createElement('div');
    body.className = 'scw-pp-body';
    body.appendChild(block);

    // Expiration is READ-ONLY here: scene_1116 is the sales-facing Build SOW
    // page and sales must NOT edit the proposal expiration. The date shows as
    // plain "Expires: MM/DD/YYYY" (the block's default display). Editing lives
    // on the bid comparison grid + the ops build-SOW page (view_3325), both of
    // which also mirror field_2659 → the SOW's field_2135. Leaving the pencil
    // here would edit field_2659 WITHOUT that mirror, drifting the two apart.
    // makeExpirationEditable()/saveExpiration() are retained (unused) in case an
    // internal-only variant of this card ever needs them.

    card.appendChild(hdr);
    card.appendChild(body);

    // Insert as the FIRST child of view_3827's column so the proposal
    // info reads as the lead element of the SOW header area.
    column.insertBefore(card, column.firstChild);

    // hide-data-source-views.js hides view_3827 AND its parent column
    // (because at first render view_3827 is the column's only child).
    // Our card is now a sibling in that hidden column — clear the
    // inline display:none so the card is actually visible. view_3827
    // itself stays hidden via its own inline style + the CSS rule.
    if (column.style && column.style.display === 'none') {
      column.style.removeProperty('display');
    }
  }

  // ── Wiring ──────────────────────────────────────────────────
  function init() {
    injectStyles();
    setTimeout(render, 150);
  }

  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender(SCENE_ID, init, NS);
  }
  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, function () { setTimeout(render, 100); }, NS);
    SCW.onViewRender(ANCHOR_VIEW, function () { setTimeout(render, 100); }, NS);
  }

  // First-paint attempt in case both views are already in the DOM by the
  // time this IIFE runs.
  if (document.getElementById(ANCHOR_VIEW) && document.getElementById(SOURCE_VIEW)) {
    setTimeout(init, 200);
  }
})();
/*** END FEATURE: Published-proposal card at top of the SOW column ***/
