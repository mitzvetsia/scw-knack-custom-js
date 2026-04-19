/*** WORKFLOW STEPPER — unified step states on scene_1116 ***/
(function () {
  'use strict';

  var NS = '.scwStepper';
  var STYLE_ID = 'scw-workflow-stepper-css';
  var SCENE_ID = 'scene_1116';
  var SOURCE_VIEW = 'view_3827';

  // ── Step definitions ─────────────────────────────────────
  // type       : 'accordion' (existing accordion) or 'action' (standalone step row)
  // viewKey    : the accordion's inner view key
  // menuView   : for action type, the original menu view to extract the link from
  // insertAfter: for action type, place after this viewKey's accordion
  // completed  : { field, value?, hasValue? } → green checkmark
  // disabled   : { field, value?, notValue? , message } → grayed out
  var STEPS = [
    {
      type: 'accordion',
      viewKey: 'view_2924',
      label: 'Project Playbook',
      completed: { field: 'field_1747', value: 'No' }
    },
    {
      type: 'action',
      id: 'initiate-install',
      label: 'Initiate Installation Project',
      menuView: 'view_3828',
      insertAfter: 'view_2924',
      completed: { field: 'field_1199', hasValue: true },
      disabled: { field: 'field_1747', notValue: 'No', message: 'Complete the Project Playbook first' }
    },
    {
      type: 'accordion',
      viewKey: 'view_3853',
      label: 'Request Site Survey',
      disabled: { field: 'field_2706', notValue: 'Yes', message: 'Not available yet' }
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  var FOLDER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 ' +
    '1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';

  var CHECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  var LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  var ARROW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  // ── CSS ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      /* ── Completed accordion ── */
      '.scw-step-completed .scw-acc-icon { color: #16a34a !important; }' +
      '.scw-step-check {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  color: #16a34a; margin-left: 6px; flex-shrink: 0;' +
      '}' +

      /* ── Disabled accordion ── */
      '.scw-step-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-disabled .scw-ktl-accordion__header { cursor: default; }' +
      '.scw-step-disabled-msg {' +
      '  display: flex; align-items: center; gap: 5px;' +
      '  font-size: 11px; color: #94a3b8; font-weight: 500;' +
      '  margin-left: auto; flex-shrink: 0; white-space: nowrap;' +
      '}' +

      /* ── Action step row (matches accordion header) ── */
      '.scw-step-action {' +
      '  position: relative; display: flex; align-items: center;' +
      '  width: 100%; min-height: 44px;' +
      '  padding: 14px 16px 14px 22px;' +
      '  background: #fff; cursor: pointer; user-select: none;' +
      '  box-sizing: border-box; transition: background 180ms ease;' +
      '  border: 1px solid #e5e7eb; border-radius: 14px;' +
      '  margin-bottom: 8px; text-decoration: none; color: inherit;' +
      '}' +
      '.scw-step-action::before {' +
      '  content: ""; position: absolute; left: 0; top: 0; bottom: 0;' +
      '  width: 6px; background: var(--scw-step-accent, #295f91);' +
      '  border-radius: 14px 0 0 14px;' +
      '}' +
      '.scw-step-action:hover { background: rgba(41,95,145,0.06); }' +
      '.scw-step-action .scw-step-icon {' +
      '  flex: 0 0 auto; display: inline-flex; align-items: center;' +
      '  justify-content: center; width: 28px; margin-right: 6px;' +
      '  color: var(--scw-step-accent, #295f91); opacity: .75;' +
      '}' +
      '.scw-step-action .scw-step-title {' +
      '  flex: 1 1 auto; font-size: 14px; font-weight: 600;' +
      '  color: #1e293b; white-space: nowrap; overflow: hidden;' +
      '  text-overflow: ellipsis;' +
      '}' +
      '.scw-step-action .scw-step-arrow {' +
      '  flex: 0 0 auto; display: inline-flex; align-items: center;' +
      '  color: #94a3b8; margin-left: 8px;' +
      '}' +

      /* ── Action step states ── */
      '.scw-step-action.is-completed {' +
      '  --scw-step-accent: #16a34a;' +
      '}' +
      '.scw-step-action.is-completed .scw-step-icon { color: #16a34a; opacity: 1; }' +
      '.scw-step-action.is-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +

      /* ── Hide injected menu button that stepper replaces ── */
      '.scw-step-menu-hidden { display: none !important; }';

    document.head.appendChild(style);
  }

  // ── Read field value from source view DOM ────────────────
  function readField(fieldKey) {
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').trim();
    return '';
  }

  // ── Check a condition ────────────────────────────────────
  function conditionMet(cond) {
    if (!cond) return false;
    var val = readField(cond.field);
    if (cond.hasValue) return val.length > 0;
    if (cond.value !== undefined) return val.toLowerCase() === cond.value.toLowerCase();
    if (cond.notValue !== undefined) return val.toLowerCase() !== cond.notValue.toLowerCase();
    return false;
  }

  // ── Find accordion wrapper by inner view key ─────────────
  function findAccordion(viewKey) {
    var hdr = document.querySelector('.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]');
    return hdr ? hdr.closest('.scw-ktl-accordion') : null;
  }

  // ── Extract link href from a menu view ───────────────────
  function getMenuHref(menuViewId) {
    var menu = document.getElementById(menuViewId);
    if (!menu) return '';
    var link = menu.querySelector('a.kn-link-page, a.kn-link');
    return link ? (link.getAttribute('href') || '') : '';
  }

  // ── Build a standalone action step element ───────────────
  function buildActionStep(step) {
    var href = getMenuHref(step.menuView);
    var el = document.createElement('a');
    el.id = 'scw-step-' + step.id;
    el.className = 'scw-step-action';
    if (href) el.href = href;

    var icon = document.createElement('span');
    icon.className = 'scw-step-icon';
    icon.innerHTML = FOLDER_SVG;
    el.appendChild(icon);

    var title = document.createElement('span');
    title.className = 'scw-step-title';
    title.textContent = step.label;
    el.appendChild(title);

    var arrow = document.createElement('span');
    arrow.className = 'scw-step-arrow';
    arrow.innerHTML = ARROW_SVG;
    el.appendChild(arrow);

    return el;
  }

  // ── Apply states to an accordion step ────────────────────
  function applyAccordionState(step) {
    var wrap = findAccordion(step.viewKey);
    if (!wrap) return;
    var hdr = wrap.querySelector('.scw-ktl-accordion__header');

    // Completed
    if (step.completed) {
      var done = conditionMet(step.completed);
      wrap.classList.toggle('scw-step-completed', done);
      var chk = hdr.querySelector('.scw-step-check');
      if (done && !chk) {
        var c = document.createElement('span');
        c.className = 'scw-step-check';
        c.innerHTML = CHECK_SVG;
        var ttl = hdr.querySelector('.scw-acc-title');
        if (ttl) ttl.after(c);
      } else if (!done && chk) {
        chk.remove();
      }
    }

    // Disabled
    if (step.disabled) {
      var dis = conditionMet(step.disabled);
      wrap.classList.toggle('scw-step-disabled', dis);
      var msgEl = hdr.querySelector('.scw-step-disabled-msg[data-step="' + step.viewKey + '"]');
      if (dis && !msgEl && step.disabled.message) {
        var msg = document.createElement('span');
        msg.className = 'scw-step-disabled-msg';
        msg.setAttribute('data-step', step.viewKey);
        msg.innerHTML = LOCK_SVG;
        msg.appendChild(document.createTextNode(step.disabled.message));
        var chevron = hdr.querySelector('.scw-acc-chevron');
        if (chevron) hdr.insertBefore(msg, chevron);
        else hdr.appendChild(msg);
      } else if (!dis && msgEl) {
        msgEl.remove();
      }
    }
  }

  // ── Apply states to an action step ───────────────────────
  function applyActionState(step) {
    var el = document.getElementById('scw-step-' + step.id);
    if (!el) {
      // Build and insert
      el = buildActionStep(step);
      var afterAcc = findAccordion(step.insertAfter);
      if (afterAcc) {
        afterAcc.after(el);
      }
    }

    // Update href in case menu re-rendered
    var href = getMenuHref(step.menuView);
    if (href) el.href = href;

    // Completed
    if (step.completed) {
      var done = conditionMet(step.completed);
      el.classList.toggle('is-completed', done);
      var icon = el.querySelector('.scw-step-icon');
      if (done) {
        icon.innerHTML = CHECK_SVG;
      } else {
        icon.innerHTML = FOLDER_SVG;
      }
      var chk = el.querySelector('.scw-step-check');
      if (done && !chk) {
        var c = document.createElement('span');
        c.className = 'scw-step-check';
        c.innerHTML = CHECK_SVG;
        var ttl = el.querySelector('.scw-step-title');
        if (ttl) ttl.after(c);
      } else if (!done && chk) {
        chk.remove();
      }
    }

    // Disabled (takes precedence over completed visually)
    if (step.disabled) {
      var dis = conditionMet(step.disabled);
      el.classList.toggle('is-disabled', dis);
      var msgEl = el.querySelector('.scw-step-disabled-msg[data-step="' + step.id + '"]');
      if (dis && !msgEl && step.disabled.message) {
        var msg = document.createElement('span');
        msg.className = 'scw-step-disabled-msg';
        msg.setAttribute('data-step', step.id);
        msg.innerHTML = LOCK_SVG;
        msg.appendChild(document.createTextNode(step.disabled.message));
        var arr = el.querySelector('.scw-step-arrow');
        if (arr) el.insertBefore(msg, arr);
        else el.appendChild(msg);
      } else if (!dis && msgEl) {
        msgEl.remove();
      }
    }

    // Hide the original menu view and any injected button
    if (step.menuView) {
      var origMenu = document.getElementById(step.menuView);
      if (origMenu) origMenu.style.display = 'none';
      var injected = document.querySelector('.scw-acc-actions[data-scw-menu-src="' + step.menuView + '"]');
      if (injected) injected.classList.add('scw-step-menu-hidden');
    }
  }

  // ── Main apply ───────────────────────────────────────────
  function applySteps() {
    for (var i = 0; i < STEPS.length; i++) {
      var step = STEPS[i];
      if (step.type === 'accordion') {
        applyAccordionState(step);
      } else if (step.type === 'action') {
        applyActionState(step);
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    injectStyles();
    setTimeout(applySteps, 500);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, init, NS);
  }

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    setTimeout(init, 800);
  });
})();
