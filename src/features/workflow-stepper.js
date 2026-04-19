/*** WORKFLOW STEPPER — conditional accordion/menu states on scene_1116 ***/
(function () {
  'use strict';

  var NS = '.scwStepper';
  var STYLE_ID = 'scw-workflow-stepper-css';
  var SCENE_ID = 'scene_1116';
  var SOURCE_VIEW = 'view_3827';

  // ── Step definitions ─────────────────────────────────────
  // viewKey  : the accordion's inner view (data-view-key on header)
  // menuView : for menu buttons injected into an accordion header
  // completed: { field, value } → show checkmark when field matches
  // disabled : { field, value/notValue, message } → gray out when condition met
  var STEPS = [
    {
      viewKey: 'view_2924',
      completed: { field: 'field_1747', value: 'No' }
    },
    {
      menuView: 'view_3828',
      disabled: { field: 'field_1747', value: 'Yes', message: 'Complete the Project Playbook first' }
    },
    {
      viewKey: 'view_3853',
      disabled: { field: 'field_2706', notValue: 'Yes', message: 'Not available yet' }
    }
  ];

  // ── SVGs ─────────────────────────────────────────────────
  var CHECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  var LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // ── CSS ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.scw-step-completed .scw-acc-icon {' +
      '  color: #16a34a !important;' +
      '}' +
      '.scw-step-completed .scw-step-check {' +
      '  display: inline-flex;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  color: #16a34a;' +
      '  margin-left: 8px;' +
      '  flex-shrink: 0;' +
      '}' +
      '.scw-step-disabled {' +
      '  opacity: 0.45;' +
      '  pointer-events: none;' +
      '  cursor: default;' +
      '}' +
      '.scw-step-disabled .scw-ktl-accordion__header {' +
      '  cursor: default;' +
      '}' +
      '.scw-step-disabled-msg {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 5px;' +
      '  font-size: 11px;' +
      '  color: #94a3b8;' +
      '  font-weight: 500;' +
      '  padding: 4px 16px 6px 22px;' +
      '  margin-top: -4px;' +
      '}' +
      '.scw-step-btn-disabled {' +
      '  opacity: 0.35 !important;' +
      '  pointer-events: none !important;' +
      '  cursor: default !important;' +
      '}';
    document.head.appendChild(style);
  }

  // ── Read field value from source view DOM ────────────────
  function readField(fieldKey) {
    var view = document.getElementById(SOURCE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + fieldKey + ' .kn-detail-body');
    if (cell) return (cell.textContent || '').trim();
    var td = view.querySelector('td.' + fieldKey);
    if (td) return (td.textContent || '').trim();
    return '';
  }

  // ── Check a condition ────────────────────────────────────
  function conditionMet(cond) {
    if (!cond) return false;
    var val = readField(cond.field);
    if (cond.value !== undefined) return val.toLowerCase() === cond.value.toLowerCase();
    if (cond.notValue !== undefined) return val.toLowerCase() !== cond.notValue.toLowerCase();
    return false;
  }

  // ── Find accordion wrapper by inner view key ─────────────
  function findAccordion(viewKey) {
    var hdr = document.querySelector('.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]');
    return hdr ? hdr.closest('.scw-ktl-accordion') : null;
  }

  // ── Find menu button(s) by menu view ID ──────────────────
  function findMenuButtons(menuViewId) {
    return document.querySelectorAll('.scw-acc-action-btn[data-menu-view="' + menuViewId + '"]');
  }

  // ── Apply step states ────────────────────────────────────
  function applySteps() {
    for (var i = 0; i < STEPS.length; i++) {
      var step = STEPS[i];

      // Accordion-level states (completed / disabled)
      if (step.viewKey) {
        var wrap = findAccordion(step.viewKey);
        if (!wrap) continue;
        var hdr = wrap.querySelector('.scw-ktl-accordion__header');

        // Completed state
        if (step.completed) {
          var isComplete = conditionMet(step.completed);
          wrap.classList.toggle('scw-step-completed', isComplete);
          var existing = hdr.querySelector('.scw-step-check');
          if (isComplete && !existing) {
            var chk = document.createElement('span');
            chk.className = 'scw-step-check';
            chk.innerHTML = CHECK_SVG;
            var title = hdr.querySelector('.scw-acc-title');
            if (title) title.after(chk);
          } else if (!isComplete && existing) {
            existing.remove();
          }
        }

        // Disabled state
        if (step.disabled) {
          var isDisabled = conditionMet(step.disabled);
          wrap.classList.toggle('scw-step-disabled', isDisabled);
          var msgEl = wrap.parentNode.querySelector('.scw-step-disabled-msg[data-step-view="' + step.viewKey + '"]');
          if (isDisabled && !msgEl && step.disabled.message) {
            var msg = document.createElement('div');
            msg.className = 'scw-step-disabled-msg';
            msg.setAttribute('data-step-view', step.viewKey);
            msg.innerHTML = LOCK_SVG;
            msg.appendChild(document.createTextNode(step.disabled.message));
            wrap.after(msg);
          } else if (!isDisabled && msgEl) {
            msgEl.remove();
          }
        }
      }

      // Menu button states (disabled)
      if (step.menuView && step.disabled) {
        var btns = findMenuButtons(step.menuView);
        var btnDisabled = conditionMet(step.disabled);
        for (var b = 0; b < btns.length; b++) {
          btns[b].classList.toggle('scw-step-btn-disabled', btnDisabled);
          if (btnDisabled) {
            btns[b].setAttribute('title', step.disabled.message || '');
          } else {
            btns[b].removeAttribute('title');
          }
        }
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
