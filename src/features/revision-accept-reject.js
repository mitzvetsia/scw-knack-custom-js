/*** REVISION ACCEPT / REJECT — view_3820 (scene_1140) ***/
/**
 * Adds per-row "Accept" and "Reject" buttons on the Revision Requests
 * grid (view_3820). Each button POSTs the row's record ID to a Make
 * webhook with the chosen action, then polls view_3823 + view_3505
 * to reflect changes as Make processes each revision line item.
 * When all items are processed, refreshes view_3820.
 */
(function () {
  'use strict';

  var VIEW_ID       = 'view_3820';
  var WORKSHEET_ID  = 'view_3505';
  var REVISIONS_ID  = 'view_3823';
  var WEBHOOK       = 'https://hook.us1.make.com/0cobxwo9q6ycek787agapekg7gtahmt5';
  var CSS_ID        = 'scw-rev-accept-reject-css';
  var EVENT_NS      = '.scwRevAcceptReject';
  var POLL_MS       = 5000;
  var POLL_TIMEOUT  = 120000;
  var TOAST_ID      = 'scw-rev-poll-toast';

  var _pollTimer    = null;

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.scw-rev-actions { display: inline-flex; gap: 6px; }',
      '.scw-rev-actions__btn {',
      '  padding: 5px 12px; border: none; border-radius: 4px;',
      '  font: 600 12px/1 system-ui, sans-serif; cursor: pointer;',
      '  transition: filter .15s; white-space: nowrap;',
      '}',
      '.scw-rev-actions__btn:hover { filter: brightness(.88); }',
      '.scw-rev-actions__btn:disabled { opacity: .5; cursor: not-allowed; }',
      '.scw-rev-actions__btn--accept { background: #059669; color: #fff; }',
      '.scw-rev-actions__btn--reject { background: #dc2626; color: #fff; }',
      '#' + TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 12px 20px;',
      '  border-radius: 8px; font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  display: flex; align-items: center; gap: 10px;',
      '  transition: opacity 300ms ease;',
      '}',
      '#' + TOAST_ID + ' .scw-rev-spinner {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwRevSpin .8s linear infinite; flex-shrink: 0;',
      '}',
      '@keyframes scwRevSpin { to { transform: rotate(360deg); } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Toast helpers ──

  function showToast(msg) {
    hideToast(true);
    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    var spinner = document.createElement('span');
    spinner.className = 'scw-rev-spinner';
    toast.appendChild(spinner);
    toast.appendChild(document.createTextNode(msg));
    document.body.appendChild(toast);
  }

  function hideToast(instant) {
    var toast = document.getElementById(TOAST_ID);
    if (!toast) return;
    if (instant) { toast.remove(); return; }
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 350);
  }

  // ── Knack view refresh helpers ──

  function fetchView(viewId) {
    if (typeof Knack === 'undefined') return;
    var view = Knack.views && Knack.views[viewId];
    if (view && view.model && typeof view.model.fetch === 'function') {
      view.model.fetch();
    }
  }

  function countPendingRevisions() {
    var viewEl = document.getElementById(REVISIONS_ID);
    if (!viewEl) return -1;
    var rows = viewEl.querySelectorAll('table.kn-table-table tbody tr[id]');
    if (!rows.length) return 0;
    var pending = 0;
    for (var i = 0; i < rows.length; i++) {
      var statusCell = rows[i].querySelector('td.field_2645');
      var text = statusCell ? (statusCell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() : '';
      if (text === 'pending' || text === '') pending++;
    }
    return pending;
  }

  // ── Polling ──

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function startPolling(action, pkgName) {
    stopPolling();

    var initialPending = countPendingRevisions();
    var label = action === 'accept' ? 'Accepting' : 'Rejecting';
    showToast(label + ' revisions for ' + pkgName + '\u2026');

    var elapsed = 0;
    _pollTimer = setInterval(function () {
      elapsed += POLL_MS;

      // Refresh revision data source + worksheet
      fetchView(REVISIONS_ID);
      fetchView(WORKSHEET_ID);

      // Check if all pending items are processed
      setTimeout(function () {
        var remaining = countPendingRevisions();
        if (remaining === 0 || (remaining !== -1 && initialPending > 0 && remaining < initialPending)) {
          // Progress detected — update initial for next check
          initialPending = remaining;
        }
        if (remaining === 0) {
          stopPolling();
          hideToast();
          fetchView(VIEW_ID);
        }
      }, 2000);

      if (elapsed >= POLL_TIMEOUT) {
        stopPolling();
        hideToast();
        fetchView(VIEW_ID);
      }
    }, POLL_MS);
  }

  // ── Webhook ──

  function sendAction(action, recordId, pkgName, btn) {
    var label = action === 'accept' ? 'Accept' : 'Reject';

    if (!window.confirm(label + ' revision for ' + (pkgName || 'this package') + '?')) return;

    btn.disabled = true;
    btn.textContent = label + 'ing\u2026';

    var payload = {
      action: action,
      recordId: recordId,
      timestamp: new Date().toISOString(),
    };

    $.ajax({
      url: WEBHOOK,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      timeout: 30000,
      success: function () {
        btn.textContent = label + 'ed \u2713';
        startPolling(action, pkgName);
      },
      error: function (xhr) {
        if (xhr && xhr.status === 0) {
          btn.textContent = label + 'ed \u2713';
          startPolling(action, pkgName);
        } else {
          btn.textContent = 'Failed';
          setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 3000);
        }
      },
    });
  }

  // ── Enhance view ──

  function enhance() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;

    var rows = view.querySelectorAll('table.kn-table-table tbody tr[id]');
    if (!rows.length) return;

    injectStyles();

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var recordId = tr.id;
      if (!recordId) continue;

      var knackActionLink = tr.querySelector('a.kn-action-link');
      if (!knackActionLink) continue;
      var actionTd = knackActionLink.closest('td');
      if (!actionTd) continue;
      if (actionTd.querySelector('.scw-rev-actions')) continue;

      var pkgCell = tr.querySelector('td.field_2689');
      var connSpan = pkgCell ? pkgCell.querySelector('span[data-kn="connection-value"]') : null;
      var pkgName = connSpan ? (connSpan.textContent || '').trim() : '';

      knackActionLink.style.display = 'none';

      var wrapper = document.createElement('span');
      wrapper.className = 'scw-rev-actions';

      var rejectBtn = document.createElement('button');
      rejectBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--reject';
      rejectBtn.textContent = 'Reject All';
      rejectBtn.addEventListener('click', (function (rid, pname) {
        return function () { sendAction('reject', rid, pname, this); };
      })(recordId, pkgName));
      wrapper.appendChild(rejectBtn);

      var acceptBtn = document.createElement('button');
      acceptBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--accept';
      acceptBtn.textContent = 'Accept All';
      acceptBtn.addEventListener('click', (function (rid, pname) {
        return function () { sendAction('accept', rid, pname, this); };
      })(recordId, pkgName));
      wrapper.appendChild(acceptBtn);

      actionTd.appendChild(wrapper);
    }
  }

  $(document)
    .off('knack-view-render.' + VIEW_ID + EVENT_NS)
    .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
      setTimeout(enhance, 100);
    });
})();
