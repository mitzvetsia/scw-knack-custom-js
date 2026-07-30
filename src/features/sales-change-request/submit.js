/*** SALES CHANGE REQUEST — SUBMIT ***/
/**
 * Webhook submission for final submissions, and draft save to Knack field.
 *
 * Direction: Sales → SCW Ops team. This is NOT the channel that sends
 * change requests to the subcontractor. When Sales submits here, the
 * Make scenario at CFG.submitWebhook (jlbup3qu…) notifies Ops so the
 * Ops team can review the requested changes against the active SOW
 * before anything downstream happens.
 *
 * Save Draft: writes pending JSON to field_2707 immediately (no webhook).
 * Submit: posts to webhook, then clears pending + draft field.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, .pendingCount, .persist,
 *         .buildPayload, .buildHtml, .showToast, .refresh
 * Writes: SCW.salesCR.submitToWebhook, .saveDraft, .clear
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;

  function submitToWebhook() {
    var count = ns.pendingCount();
    if (!count) { ns.showToast('No pending changes to submit', 'info'); return; }

    if (!window.confirm('Submit ' + count + ' change(s)?\n\nThis will send the change request for review.')) return;

    var payload = ns.buildPayload(false);
    payload.html      = ns.buildHtml();
    payload.plainText = ns.buildPlainText();

    if (CFG.debug) {
      SCW.debug('[SalesCR] Submit:', payload);
    }

    SCW.knackAjax({
      url:  CFG.submitWebhook,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function (resp) {
        if (CFG.debug) SCW.debug('[SalesCR] Submit success:', resp);
        clearPending();
        autoRevertValidation(count);
        ns.showToast('Change request submitted', 'success');
      },
      error: function (xhr) {
        if (xhr && xhr.status === 0) {
          autoRevertValidation(count);
          if (CFG.debug) SCW.debug('[SalesCR] CORS-blocked (status 0) \u2014 treating as success');
          clearPending();
          ns.showToast('Change request submitted', 'success');
        } else {
          console.error('[SalesCR] Submit failed:', xhr.status, xhr.responseText);
          ns.showToast('Failed to submit \u2014 please try again', 'error');
        }
      },
    });
  }

  /** Save draft: immediate write to field_2707 (no debounce). */
  function saveDraft() {
    var count = ns.pendingCount();
    if (!count) { ns.showToast('No pending changes to save', 'info'); return; }

    ns.forceSaveDraft();
    ns.showToast('Draft saved', 'success');
  }

  function clearPending() {
    // Capture current IDs into the dismissed set BEFORE deleting them, so
    // detectAddRecords doesn't immediately re-create them on the next
    // render (we're typically in Add mode here, which auto-flags any
    // record with no associated survey items as an 'add').
    if (ns.dismissAll) ns.dismissAll();
    var pending = S.pending();
    var keys = Object.keys(pending);
    for (var i = 0; i < keys.length; i++) delete pending[keys[i]];
    ns.persist();          // clears sessionStorage immediately
    ns.forceSaveDraft();   // bypass 3s debounce — write empty to field_2707 NOW
    if (ns.refresh) ns.refresh();
  }

  // ── Auto-revert gate ──────────────────────────────────────
  // A CR submission only invalidates the released proposal when it moved
  // the INSTALL TOTAL — a notes / expiration / non-price change shouldn't
  // yank field_2725 (which drops pricing back to TBD for the customer).
  // Compare the most recent PUBLISHED proposal's stored install total
  // (field_2668, on the view_3814 Proposals grid) against the live SOW
  // install total, to the cent. If either side can't be read, fail SAFE:
  // revert as before (blank ⇒ Ops re-review, matching repo convention).

  function parseMoney(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'object') {
      v = v.currency_field_extended || v.amount || v.value || '';
    }
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }

  function attrsMoney(attrs, fieldKey) {
    if (!attrs) return null;
    var n = parseMoney(attrs[fieldKey + '_raw']);
    if (n == null) n = parseMoney(attrs[fieldKey]);
    return n;
  }

  // Most recent PUBLISHED proposal's stored install total (field_2668).
  // Primary source: the Proposals grid (view_3814 — its "Current" tab holds
  // the live published record). Fallback: sweep every rendered view on the
  // scene for the field, then the DOM cell.
  function readPublishedInstallTotal() {
    var FK = CFG.pubInstallField || 'field_2668';
    var keys = [CFG.pubInstallView || 'view_3814'];
    try {
      var all = Object.keys((window.Knack && Knack.views) || {});
      for (var a = 0; a < all.length; a++) {
        if (keys.indexOf(all[a]) === -1) keys.push(all[a]);
      }
    } catch (e) { /* ignore */ }
    for (var i = 0; i < keys.length; i++) {
      if (!document.getElementById(keys[i])) continue;
      var v = Knack.views && Knack.views[keys[i]];
      if (!v || !v.model) continue;
      // Details view — record attrs live on the model.
      var dAttrs = (v.model.data && v.model.data.attributes) || v.model.attributes;
      var n = attrsMoney(dAttrs, FK);
      if (n != null) return n;
      // Grid — first record carrying the field (grid order = newest first).
      var models = v.model.data && v.model.data.models;
      if (models) {
        for (var j = 0; j < models.length; j++) {
          n = attrsMoney(models[j] && models[j].attributes, FK);
          if (n != null) return n;
        }
      }
    }
    var cell = document.querySelector('td.' + FK + ', .kn-detail.' + FK + ' .kn-detail-body');
    return cell ? parseMoney(cell.textContent) : null;
  }

  // Live SOW install total. Primary: sum per-row install fees (field_2028)
  // over the worksheet model — same math as the scene-tweaks totals panel,
  // and worksheet-v2 refetches that model on every edit so it already
  // reflects the CR's changes at submit time. Fallback: the SOW record's
  // Installation Total rollup (field_2161) off the SOW detail views.
  function readCurrentInstallTotal() {
    var v = window.Knack && Knack.views && Knack.views[CFG.worksheetView];
    var models = v && v.model && v.model.data && v.model.data.models;
    if (models && models.length) {
      var total = 0;
      for (var i = 0; i < models.length; i++) {
        var n = attrsMoney(models[i] && models[i].attributes,
          CFG.installFeeField || 'field_2028');
        if (n != null) total += n;
      }
      return total;
    }
    var dviews = CFG.sowDetailViews || ['view_3418', 'view_3827'];
    for (var d = 0; d < dviews.length; d++) {
      var dv = window.Knack && Knack.views && Knack.views[dviews[d]];
      var attrs = dv && dv.model &&
        ((dv.model.data && dv.model.data.attributes) || dv.model.attributes);
      var f = attrsMoney(attrs, CFG.sowInstallField || 'field_2161');
      if (f != null) return f;
    }
    return null;
  }

  function installTotalChanged() {
    var published = readPublishedInstallTotal();
    var current   = readCurrentInstallTotal();
    if (published == null || current == null) {
      console.warn('[SalesCR] auto-revert gate: could not read ' +
        (published == null ? 'published install total (field_2668)' : '') +
        (published == null && current == null ? ' + ' : '') +
        (current == null ? 'current install total' : '') +
        ' — failing safe (reverting release)');
      return true;
    }
    var changed = Math.round(published * 100) !== Math.round(current * 100);
    console.log('[SalesCR] auto-revert gate: published install $' + published +
      ' vs current $' + current + ' → ' +
      (changed ? 'CHANGED — reverting field_2725' : 'unchanged — keeping release'));
    return changed;
  }

  // Flip field_2725 (FLAG_released to sales) back to No and drop a note
  // into field_2736 so the Ops Review pill on view_3325 surfaces why the
  // released-to-sales state was revoked — but ONLY when the change request
  // actually moved the install total vs the last published proposal (see
  // installTotalChanged above). No-op if the ops-review feature hasn't
  // loaded or the SOW id can't be resolved.
  function autoRevertValidation(count) {
    if (!window.SCW || !SCW.opsReview ||
        typeof SCW.opsReview.autoRevertValidation !== 'function') return;
    var sowId = S.sowRecordId && S.sowRecordId();
    if (!sowId) return;
    if (!installTotalChanged()) return;
    SCW.opsReview.autoRevertValidation(sowId, { itemCount: count });
  }

  // ── Public API ──
  ns.submitToWebhook = submitToWebhook;
  ns.saveDraft       = saveDraft;
  ns.clear           = clearPending;

})();
