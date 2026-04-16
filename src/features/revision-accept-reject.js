/*** REVISION ACCEPT / REJECT — view_3820 (scene_1140) ***/
/**
 * Adds per-row "Accept" and "Reject" buttons on the Revision Requests
 * grid (view_3820). Each button POSTs the row's record ID to a Make
 * webhook with the chosen action.
 */
(function () {
  'use strict';

  var VIEW_ID  = 'view_3820';
  var WEBHOOK  = 'https://hook.us1.make.com/0cobxwo9q6ycek787agapekg7gtahmt5';
  var CSS_ID   = 'scw-rev-accept-reject-css';
  var EVENT_NS = '.scwRevAcceptReject';

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
    ].join('\n');
    document.head.appendChild(s);
  }

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
      },
      error: function (xhr) {
        if (xhr && xhr.status === 0) {
          btn.textContent = label + 'ed \u2713';
        } else {
          btn.textContent = 'Failed';
          setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 3000);
        }
      },
    });
  }

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

      // Read package name from the row's field_2689 connection
      var pkgCell = tr.querySelector('td.field_2689');
      var connSpan = pkgCell ? pkgCell.querySelector('span[data-kn="connection-value"]') : null;
      var pkgName = connSpan ? (connSpan.textContent || '').trim() : '';

      var knackLink = actionTd.querySelector('a.kn-action-link');
      if (knackLink) knackLink.style.display = 'none';

      var wrapper = document.createElement('span');
      wrapper.className = 'scw-rev-actions';

      var acceptBtn = document.createElement('button');
      acceptBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--accept';
      acceptBtn.textContent = 'Accept';
      acceptBtn.addEventListener('click', (function (rid, pname) {
        return function () { sendAction('accept', rid, pname, this); };
      })(recordId, pkgName));
      wrapper.appendChild(acceptBtn);

      var rejectBtn = document.createElement('button');
      rejectBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', (function (rid, pname) {
        return function () { sendAction('reject', rid, pname, this); };
      })(recordId, pkgName));
      wrapper.appendChild(rejectBtn);

      actionTd.appendChild(wrapper);
    }
  }

  $(document)
    .off('knack-view-render.' + VIEW_ID + EVENT_NS)
    .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
      setTimeout(enhance, 100);
    });
})();
