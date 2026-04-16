/*** REVISION ACCEPT / REJECT — view_3820 (scene_1140) ***/
/**
 * Adds "Accept All" and "Reject All" buttons per bid-package on the
 * Revision Requests grid (view_3820). Each button collects all record
 * IDs for that package and POSTs them to a Make webhook.
 */
(function () {
  'use strict';

  var VIEW_ID  = 'view_3820';
  var WEBHOOK  = 'https://hook.us1.make.com/0cobxwo9q6ycek787agapekg7gtahmt5';
  var PKG_FIELD = 'field_2689';
  var CSS_ID   = 'scw-rev-accept-reject-css';
  var EVENT_NS = '.scwRevAcceptReject';

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.scw-rev-actions { display: flex; gap: 8px; padding: 8px 0; }',
      '.scw-rev-actions__btn {',
      '  padding: 6px 14px; border: none; border-radius: 5px;',
      '  font: 600 12px/1 system-ui, sans-serif; cursor: pointer;',
      '  transition: filter .15s;',
      '}',
      '.scw-rev-actions__btn:hover { filter: brightness(.88); }',
      '.scw-rev-actions__btn:disabled { opacity: .5; cursor: not-allowed; }',
      '.scw-rev-actions__btn--accept { background: #059669; color: #fff; }',
      '.scw-rev-actions__btn--reject { background: #dc2626; color: #fff; }',
      '.scw-rev-actions__pkg-label {',
      '  font-size: 12px; font-weight: 600; color: #475569;',
      '  align-self: center; margin-right: 4px;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function getPackagesFromRows($tbody) {
    var packages = {};
    $tbody.find('tr[id]').each(function () {
      var tr = this;
      var recordId = tr.id;
      if (!recordId) return;

      var pkgCell = tr.querySelector('td.' + PKG_FIELD);
      if (!pkgCell) return;

      var connSpan = pkgCell.querySelector('span[data-kn="connection-value"]');
      var pkgId = connSpan ? (connSpan.className || '').trim() : '';
      var pkgName = connSpan ? (connSpan.textContent || '').trim() : '';

      if (!pkgId) return;

      if (!packages[pkgId]) {
        packages[pkgId] = { name: pkgName, recordIds: [] };
      }
      packages[pkgId].recordIds.push(recordId);
    });
    return packages;
  }

  function sendAction(action, pkgId, pkgName, recordIds, btn) {
    var count = recordIds.length;
    var label = action === 'accept_all' ? 'Accept' : 'Reject';

    if (!window.confirm(label + ' all ' + count + ' revision(s) for ' + pkgName + '?')) return;

    btn.disabled = true;
    btn.textContent = label + 'ing\u2026';

    var payload = {
      action: action,
      packageId: pkgId,
      packageName: pkgName,
      recordIds: recordIds,
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
        setTimeout(function () { btn.textContent = label + ' All'; btn.disabled = false; }, 3000);
      },
      error: function (xhr) {
        if (xhr && xhr.status === 0) {
          btn.textContent = label + 'ed \u2713';
          setTimeout(function () { btn.textContent = label + ' All'; btn.disabled = false; }, 3000);
        } else {
          btn.textContent = 'Failed';
          btn.disabled = false;
          setTimeout(function () { btn.textContent = label + ' All'; }, 3000);
        }
      },
    });
  }

  function enhance() {
    var $view = $('#' + VIEW_ID);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    var packages = getPackagesFromRows($tbody);
    if (!Object.keys(packages).length) return;

    injectStyles();

    // Inject buttons into each row's action-link cell
    $tbody.find('tr[id]').each(function () {
      var tr = this;
      var recordId = tr.id;
      if (!recordId) return;

      var actionTd = tr.querySelector('td.kn-table-action-link');
      if (!actionTd) return;
      if (actionTd.querySelector('.scw-rev-actions')) return;

      // Find this row's package
      var pkgCell = tr.querySelector('td.' + PKG_FIELD);
      if (!pkgCell) return;
      var connSpan = pkgCell.querySelector('span[data-kn="connection-value"]');
      var pkgId = connSpan ? (connSpan.className || '').trim() : '';
      if (!pkgId || !packages[pkgId]) return;

      var pkg = packages[pkgId];

      // Hide the existing Knack action link
      var knackLink = actionTd.querySelector('a.kn-action-link');
      if (knackLink) knackLink.style.display = 'none';

      var wrapper = document.createElement('div');
      wrapper.className = 'scw-rev-actions';

      var acceptBtn = document.createElement('button');
      acceptBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--accept';
      acceptBtn.textContent = 'Accept All';
      (function (pid, pname, rids) {
        acceptBtn.addEventListener('click', function () {
          sendAction('accept_all', pid, pname, rids, this);
        });
      })(pkgId, pkg.name, pkg.recordIds);
      wrapper.appendChild(acceptBtn);

      var rejectBtn = document.createElement('button');
      rejectBtn.className = 'scw-rev-actions__btn scw-rev-actions__btn--reject';
      rejectBtn.textContent = 'Reject All';
      (function (pid, pname, rids) {
        rejectBtn.addEventListener('click', function () {
          sendAction('reject_all', pid, pname, rids, this);
        });
      })(pkgId, pkg.name, pkg.recordIds);
      wrapper.appendChild(rejectBtn);

      actionTd.appendChild(wrapper);
    });
  }

  $(document)
    .off('knack-view-render.' + VIEW_ID + EVENT_NS)
    .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
      setTimeout(enhance, 100);
    });
})();
