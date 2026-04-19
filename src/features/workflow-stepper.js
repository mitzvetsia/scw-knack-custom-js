/*** WORKFLOW STEPPER — unified step states on scene_1116 ***/
(function () {
  'use strict';

  var NS = '.scwStepper';
  var STYLE_ID = 'scw-workflow-stepper-css';
  var SCENE_ID = 'scene_1116';
  var SOURCE_VIEW = 'view_3827';

  // ── Step definitions ─────────────────────────────────────
  var STEPS = [
    {
      type: 'accordion',
      viewKey: 'view_2924',
      label: 'Project Playbook',
      completed: { field: 'field_1747', value: 'Complete' }
    },
    {
      type: 'action',
      id: 'initiate-install',
      label: 'Initiate Installation Project',
      menuView: 'view_3828',
      insertAfter: 'view_2924',
      completed: { field: 'field_1199', hasValue: true },
      disabled: { field: 'field_1747', notValue: 'Complete', message: 'Complete the Project Playbook first' }
    },
    {
      type: 'accordion',
      viewKey: 'view_3853',
      label: 'Request Site Survey',
      disabled: { field: 'field_2706', notValue: 'Yes', message: 'Not available yet' }
    }
  ];

  // ── Icons ────────────────────────────────────────────────
  var CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';

  var CHECK_CIRCLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
    '<polyline points="22 4 12 14.01 9 11.01"/></svg>';

  var LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  var LOCK_SM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // ── CSS ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      /* ── Fix empty Knack column in view-group-4 ── */
      '#kn-scene_1116 .view-group-4 > .view-column:empty {' +
      '  display: none !important;' +
      '}' +

      /* ── Completed accordion ── */
      '.scw-step-completed .scw-acc-icon { color: #16a34a !important; opacity: 1 !important; }' +

      /* ── Disabled accordion ── */
      '.scw-step-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-disabled .scw-ktl-accordion__header { cursor: default; }' +
      '.scw-step-disabled .scw-acc-icon { color: #94a3b8 !important; }' +

      /* ── Disabled message (inline in header/step) ── */
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

      /* ── Action step states ── */
      '.scw-step-action.is-completed {' +
      '  --scw-step-accent: #16a34a;' +
      '}' +
      '.scw-step-action.is-completed .scw-step-icon { color: #16a34a; opacity: 1; }' +
      '.scw-step-action.is-disabled {' +
      '  opacity: 0.45; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-action.is-disabled .scw-step-icon { color: #94a3b8; opacity: 1; }' +

      /* ── Hide original menu view ── */
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
    icon.innerHTML = CIRCLE_SVG;
    el.appendChild(icon);

    var title = document.createElement('span');
    title.className = 'scw-step-title';
    title.textContent = step.label;
    el.appendChild(title);

    return el;
  }

  // ── Pick the right icon for a state ──────────────────────
  function getIcon(isCompleted, isDisabled) {
    if (isDisabled) return LOCK_SVG;
    if (isCompleted) return CHECK_CIRCLE_SVG;
    return CIRCLE_SVG;
  }

  // ── Apply states to an accordion step ────────────────────
  function applyAccordionState(step) {
    var wrap = findAccordion(step.viewKey);
    if (!wrap) return;
    var hdr = wrap.querySelector('.scw-ktl-accordion__header');
    var iconEl = hdr.querySelector('.scw-acc-icon');

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var isDisabled = step.disabled ? conditionMet(step.disabled) : false;

    // Icon
    if (iconEl) iconEl.innerHTML = getIcon(isCompleted, isDisabled);

    // Completed class
    wrap.classList.toggle('scw-step-completed', isCompleted && !isDisabled);

    // Disabled class + message
    wrap.classList.toggle('scw-step-disabled', isDisabled);
    var msgEl = hdr.querySelector('.scw-step-disabled-msg[data-step="' + step.viewKey + '"]');
    if (isDisabled && !msgEl && step.disabled.message) {
      var msg = document.createElement('span');
      msg.className = 'scw-step-disabled-msg';
      msg.setAttribute('data-step', step.viewKey);
      msg.innerHTML = LOCK_SM_SVG;
      msg.appendChild(document.createTextNode(step.disabled.message));
      var chevron = hdr.querySelector('.scw-acc-chevron');
      if (chevron) hdr.insertBefore(msg, chevron);
      else hdr.appendChild(msg);
    } else if (!isDisabled && msgEl) {
      msgEl.remove();
    }
  }

  // ── Apply states to an action step ───────────────────────
  function applyActionState(step) {
    var el = document.getElementById('scw-step-' + step.id);
    if (!el) {
      el = buildActionStep(step);
      var afterAcc = findAccordion(step.insertAfter);
      if (afterAcc) afterAcc.after(el);
    }

    // Update href
    var href = getMenuHref(step.menuView);
    if (href) el.href = href;

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var isDisabled = step.disabled ? conditionMet(step.disabled) : false;

    // Icon
    var icon = el.querySelector('.scw-step-icon');
    if (icon) icon.innerHTML = getIcon(isCompleted, isDisabled);

    // Classes
    el.classList.toggle('is-completed', isCompleted && !isDisabled);
    el.classList.toggle('is-disabled', isDisabled);

    // Disabled message
    var msgEl = el.querySelector('.scw-step-disabled-msg[data-step="' + step.id + '"]');
    if (isDisabled && !msgEl && step.disabled.message) {
      var msg = document.createElement('span');
      msg.className = 'scw-step-disabled-msg';
      msg.setAttribute('data-step', step.id);
      msg.innerHTML = LOCK_SM_SVG;
      msg.appendChild(document.createTextNode(step.disabled.message));
      el.appendChild(msg);
    } else if (!isDisabled && msgEl) {
      msgEl.remove();
    }

    // Hide original menu view
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
      if (step.type === 'accordion') applyAccordionState(step);
      else if (step.type === 'action') applyActionState(step);
    }
  }

  // ── Playbook form display rules (view_2924) ──────────────
  var PLAYBOOK_VIEW = 'view_2924';
  var ACCESS_CONTROL_ID = '6977d26243bab906665fe872';
  var CAMERAS_ID = '6977d25a3a701a1a3e4c9d70';

  function getConnectionVal(fieldKey) {
    var hidden = document.querySelector('#' + PLAYBOOK_VIEW + ' input.connection[name="' + fieldKey + '"]');
    if (hidden) {
      var v = decodeURIComponent(hidden.value || '').replace(/"/g, '').trim();
      if (v) return v;
    }
    var select = document.getElementById(PLAYBOOK_VIEW + '-' + fieldKey);
    if (select) return (select.value || '').trim();
    return '';
  }

  function getRadioVal(fieldKey) {
    var checked = document.querySelector('#' + PLAYBOOK_VIEW + ' input[name="' + PLAYBOOK_VIEW + '-' + fieldKey + '"]:checked');
    return checked ? checked.value : '';
  }

  function setFieldVisible(fieldKey, visible) {
    var wrap = document.querySelector('#' + PLAYBOOK_VIEW + ' #kn-input-' + fieldKey);
    if (wrap) wrap.style.display = visible ? '' : 'none';
  }

  function applyPlaybookRules() {
    var projectType = getConnectionVal('field_2228');

    // field_1756 (locking hardware): only for Access Control
    setFieldVisible('field_1756', projectType === ACCESS_CONTROL_ID);

    // field_1752 (multiple buildings): only for Cameras
    setFieldVisible('field_1752', projectType === CAMERAS_ID);

    // field_1753 (building assumptions): only when field_1752 = Yes
    var multiBuilding = getRadioVal('field_1752');
    setFieldVisible('field_1753', projectType === CAMERAS_ID && /^yes$/i.test(multiBuilding));
  }

  function bindPlaybookRules() {
    var form = document.getElementById(PLAYBOOK_VIEW);
    if (!form || form.getAttribute('data-scw-playbook-rules') === '1') return;
    form.setAttribute('data-scw-playbook-rules', '1');

    // Connection field change (Chosen.js)
    $(form).on('change' + NS, 'select[name="field_2228"], input[name="field_2228"]', applyPlaybookRules);
    // Radio change for field_1752
    $(form).on('change' + NS, 'input[name="' + PLAYBOOK_VIEW + '-field_1752"]', applyPlaybookRules);

    applyPlaybookRules();
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    injectStyles();
    setTimeout(applySteps, 500);
    setTimeout(bindPlaybookRules, 600);
  }

  // Collapse accordion and refresh steps after form submit
  function onFormSubmit(viewKey) {
    var wrap = findAccordion(viewKey);
    if (wrap && wrap.classList.contains('is-expanded')) {
      var hdr = wrap.querySelector('.scw-ktl-accordion__header');
      if (hdr) hdr.click();
    }
    // Refresh source view to get updated field values, then re-apply steps
    if (typeof Knack !== 'undefined' && Knack.views[SOURCE_VIEW] && Knack.views[SOURCE_VIEW].model) {
      Knack.views[SOURCE_VIEW].model.fetch({
        success: function () { setTimeout(applySteps, 300); }
      });
    }
    setTimeout(applySteps, 1500);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, init, NS);
    SCW.onViewRender(PLAYBOOK_VIEW, function () {
      setTimeout(bindPlaybookRules, 200);
    }, NS);
  }

  $(document).on('knack-scene-render.' + SCENE_ID + NS, function () {
    setTimeout(init, 800);
  });

  // Listen for form submissions on step accordion views
  $(document).on('knack-form-submit.view_2924' + NS, function () {
    onFormSubmit('view_2924');
  });
  $(document).on('knack-form-submit.view_3853' + NS, function () {
    onFormSubmit('view_3853');
  });
})();
