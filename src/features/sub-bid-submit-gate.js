/*** FEATURE: SUB BID SUBMIT GATE (scene_1149 — preview / submit bid page) ****
 *
 * On the subcontractor's preview-bid page (edit-bid-package, scene_1149),
 * the "Finalize & Submit to SCW" button (view_3679's form submit) must be
 * BLOCKED while any change request on this bid package is still pending.
 *
 * Data source: view_4073 ("BID_revision line items") — a data-source grid
 * on the same scene, Builder-filtered to this bid package. We read its
 * Backbone model (DOM scrape fallback), treat any record whose FLAG_status
 * (field_2645) is NOT "Accepted"/"Rejected" as pending — the same rule the
 * worksheet's "Change request pending" banners use
 * (worksheet-v2/change-requests.js) — and:
 *
 *   1. Render a "Pending change requests (N)" panel above the submit
 *      button, showing each revision's pre-built HTML card (field_2695)
 *      plus a link back to the bid worksheet where the sub responds.
 *   2. Lock the submit button (visual + capture-phase click/submit
 *      intercepts, so Enter-key submits are blocked too). Clicking the
 *      locked button flashes the panel instead of dying silently.
 *
 * view_4073 itself is raw payload columns (SYS_html / SYS_json) — never
 * meant for display — so it's hidden via CSS and the panel is the only
 * visible surface. Everything re-derives on each view render, so
 * accepting/rejecting the CRs elsewhere and returning here unblocks
 * without a hard reload.
 ****************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    formViewId:  'view_3679',   // "Submit to SCW" form (Finalize & Submit button)
    revViewId:   'view_4073',   // BID_revision line items (data source, hidden)
    statusField: 'field_2645',  // FLAG_status
    htmlField:   'field_2695',  // SYS_html payload — pre-built revision card
    resolvedRe:  /^(accepted|rejected)$/i,
    debug: false
  };

  var P        = 'scw-sbsg';
  var STYLE_ID = P + '-css';
  var PANEL_ID = P + '-panel';
  var EVENT_NS = '.scwSubBidSubmitGate';

  var _blocked = false;

  function dbg() {
    if (CONFIG.debug && window.console) console.log.apply(console, ['[scw-sbsg]'].concat([].slice.call(arguments)));
  }

  function stripHtml(v) {
    if (typeof v !== 'string') return String(v == null ? '' : v);
    return v.replace(/<[^>]*>/g, '').trim();
  }

  function isPendingStatus(statusText) {
    var s = stripHtml(statusText).trim();
    if (!s) return true; // blank status = not resolved
    return !CONFIG.resolvedRe.test(s);
  }

  // ── Pending revisions: model first, DOM scrape fallback ──────────
  function getPendingFromModel() {
    try {
      var v = window.Knack && Knack.views && Knack.views[CONFIG.revViewId];
      if (!v || !v.model || !v.model.data || !v.model.data.models) return null;
      var out = [];
      var models = v.model.data.models;
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && (models[i].attributes || models[i]);
        if (!a) continue;
        if (!isPendingStatus(a[CONFIG.statusField])) continue;
        out.push({ id: models[i].id, html: a[CONFIG.htmlField] || '' });
      }
      return out;
    } catch (e) { return null; }
  }

  function getPendingFromDom() {
    var out = [];
    var rows = document.querySelectorAll('#' + CONFIG.revViewId + ' tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i].querySelector('td.' + CONFIG.statusField);
      if (!st || !isPendingStatus(st.textContent)) continue;
      var htmlTd = rows[i].querySelector('td.' + CONFIG.htmlField);
      // Content sits inside the <span class="col-N"> wrapper.
      var wrap = htmlTd && htmlTd.querySelector('span[class^="col-"]');
      out.push({ id: rows[i].id, html: (wrap || htmlTd || {}).innerHTML || '' });
    }
    return out;
  }

  function getPending() {
    var fromModel = getPendingFromModel();
    return (fromModel !== null) ? fromModel : getPendingFromDom();
  }

  // ── Worksheet deep-link (where the sub responds to CRs) ──────────
  function worksheetHref() {
    var crumb = document.querySelector(
      '#' + CONFIG.formViewId + ' input.crumb[name="site-survey-request-details_id"]');
    if (crumb && /^[a-f0-9]{24}$/i.test(crumb.value || '')) {
      return '#subcontractor-portal/site-survey-request-details/' + crumb.value;
    }
    var back = document.querySelector('.kn-back-link a');
    return (back && back.getAttribute('href')) || '';
  }

  // ── CSS ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Raw payload grid — data source only, never displayable.
      '#' + CONFIG.revViewId + ' { display: none !important; }',

      '#' + PANEL_ID + ' {',
      '  margin: 0 0 12px;',
      '  border: 1px solid #f59e0b66;',
      '  border-left: 4px solid #b45309;',
      '  border-radius: 8px;',
      '  background: #fffbeb;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif;',
      '  color: #0f172a;',
      '  overflow: hidden;',
      '}',
      '#' + PANEL_ID + '.' + P + '-flash { animation: ' + P + '-flash-kf 0.9s ease 2; }',
      '@keyframes ' + P + '-flash-kf {',
      '  0%, 100% { box-shadow: none; }',
      '  50% { box-shadow: 0 0 0 4px rgba(180, 83, 9, 0.35); }',
      '}',
      '.' + P + '-head {',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 14px;',
      '  font-weight: 700; font-size: 13px; color: #b45309;',
      '}',
      '.' + P + '-head svg { flex: none; }',
      '.' + P + '-body { padding: 0 14px 4px; }',
      '.' + P + '-card {',
      '  margin: 0 0 10px;',
      '  background: #fff;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 6px;',
      '  padding: 8px 10px;',
      '  overflow-x: auto;',
      '}',
      '.' + P + '-foot {',
      '  padding: 10px 14px 12px;',
      '  color: #92400e; font-size: 12.5px;',
      '}',
      '.' + P + '-foot a {',
      '  display: inline-block; margin-top: 6px;',
      '  font-weight: 600; color: #0f4c75; text-decoration: underline;',
      '}',
      // Locked submit button — readable, clearly not actionable.
      '.' + P + '-locked {',
      '  background: #e2e8f0 !important;',
      '  border-color: #cbd5e1 !important;',
      '  color: #64748b !important;',
      '  cursor: not-allowed !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  // ── Panel ────────────────────────────────────────────────────────
  function renderPanel(pending) {
    var old = document.getElementById(PANEL_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!pending.length) return;

    var view = document.getElementById(CONFIG.formViewId);
    if (!view) return;

    var panel = document.createElement('div');
    panel.id = PANEL_ID;

    var n = pending.length;
    var html =
      '<div class="' + P + '-head">' + WARN_SVG +
        '<span>Pending change request' + (n !== 1 ? 's' : '') + ' (' + n + ')</span>' +
      '</div>' +
      '<div class="' + P + '-body">';
    for (var i = 0; i < n; i++) {
      html += '<div class="' + P + '-card">' + (pending[i].html || '<em>Change request</em>') + '</div>';
    }
    html += '</div>' +
      '<div class="' + P + '-foot">' +
        'These change request' + (n !== 1 ? 's' : '') + ' must be accepted or rejected ' +
        'before this bid can be finalized &amp; submitted to SCW.';
    var href = worksheetHref();
    if (href) {
      html += '<br><a href="' + href + '">Review &amp; respond on the bid worksheet →</a>';
    }
    html += '</div>';

    panel.innerHTML = html;
    view.insertBefore(panel, view.firstChild);
  }

  function flashPanel() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.classList.remove(P + '-flash');
    // Force reflow so the animation restarts on repeated clicks.
    void panel.offsetWidth;
    panel.classList.add(P + '-flash');
    if (typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ── Button lock ──────────────────────────────────────────────────
  function submitButton() {
    return document.querySelector('#' + CONFIG.formViewId + ' .kn-submit button[type="submit"]');
  }

  function applyLock() {
    var btn = submitButton();
    if (!btn) return;
    btn.classList.toggle(P + '-locked', _blocked);
    if (_blocked) {
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'Blocked — pending change requests must be resolved first.';
    } else {
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('title');
    }
  }

  // Capture-phase intercepts: click (mouse) + submit (Enter key / any
  // other path into the form). Bound once, document-level, so they
  // survive Knack re-renders of the form view.
  function bindInterceptsOnce() {
    if (document.__scwSbsgBound) return;
    document.__scwSbsgBound = true;
    document.addEventListener('click', function (e) {
      if (!_blocked) return;
      var t = e.target;
      var btn = t && t.closest && t.closest('#' + CONFIG.formViewId + ' .kn-submit button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      flashPanel();
    }, true);
    document.addEventListener('submit', function (e) {
      if (!_blocked) return;
      var form = e.target;
      if (!form || !form.closest || !form.closest('#' + CONFIG.formViewId)) return;
      e.preventDefault();
      e.stopPropagation();
      flashPanel();
    }, true);
  }

  // ── Refresh (idempotent — runs on every relevant render) ─────────
  function refresh() {
    // Only act when the submit form is actually on the page.
    if (!document.getElementById(CONFIG.formViewId)) return;
    injectStyles();
    bindInterceptsOnce();
    var pending = getPending();
    _blocked = pending.length > 0;
    dbg('refresh — pending:', pending.length);
    renderPanel(pending);
    applyLock();
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CONFIG.formViewId, refresh, EVENT_NS);
    SCW.onViewRender(CONFIG.revViewId, refresh, EVENT_NS);
  } else {
    $(document)
      .off('knack-view-render.' + CONFIG.formViewId + EVENT_NS)
      .on('knack-view-render.' + CONFIG.formViewId + EVENT_NS, refresh)
      .off('knack-view-render.' + CONFIG.revViewId + EVENT_NS)
      .on('knack-view-render.' + CONFIG.revViewId + EVENT_NS, refresh);
  }
})();
/*** END FEATURE: Sub bid submit gate *****************************************/
