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
      completed: { field: 'field_2724', value: 'Yes' }
    },
    {
      type: 'action',
      id: 'initiate-install',
      label: 'Initiate Installation Project',
      menuView: 'view_3828',
      insertAfter: 'view_2924',
      completed: { field: 'field_1199', hasValue: true },
      lockWhenCompleted: true,
      disabled: { field: 'field_2724', notValue: 'Yes', message: 'Complete the Project Playbook first' }
    },
    {
      type: 'accordion',
      viewKey: 'view_3853',
      label: 'Request Site Survey',
      // Complete if the survey has been requested (field_2706 = Yes)
      // OR if there are any change requests queued (field_2728 > 0),
      // since the workflow has advanced past the initial survey step.
      completed: {
        any: [
          { field: 'field_2706', value: 'Yes' },
          { field: 'field_2728', gt: 0 }
        ]
      },
      lockWhenCompleted: true,
      // When the step is completed via the change-request path (i.e.
      // the survey was actually requested on a sibling SOW), surface
      // an info note linking back to that SOW. The {link} token pulls
      // the connection's identifier + record-id from field_2329 on
      // view_3876, then builds an href by swapping the second record-id
      // in the current URL hash (the SOW slot) for the linked record id.
      completedMessage: {
        when: { field: 'field_2728', gt: 0 },
        text: 'Survey Requested on {link}',
        link: { view: 'view_3876', field: 'field_2329' }
      },
      disabled: { field: 'field_2723', notValue: 'Yes', message: 'SOW not yet validated' }
    },
    {
      type: 'action',
      id: 'review-site-survey',
      label: 'Review Site Survey Report',
      menuView: 'view_3862',
      insertAfter: 'view_3853',
      activeIcon: 'eye',
      // Locked only when the survey hasn't been requested AND the
      // workflow hasn't advanced via the change-request path (field_2728 > 0).
      disabled: {
        all: [
          { field: 'field_2706', notValue: 'Yes' },
          { not: { field: 'field_2728', gt: 0 } }
        ],
        message: 'Site survey not yet requested'
      }
    },
    {
      // Shows only when the SOW has pending change requests (field_2728 > 0)
      // AND a survey has not yet been requested (field_2706 = No).
      // TODO: wire the click behaviour once Make scenario is in place.
      type: 'action',
      id: 'request-alternative-proposal',
      label: 'Request Alternative Proposal',
      insertAfterStepId: 'review-site-survey',
      showWhen: {
        all: [
          { field: 'field_2728', gt: 0 },
          { field: 'field_2706', value: 'No' }
        ]
      }
    },
    {
      // Navigates to the currently-published-proposal details page.
      // Scrapes the href from view_3814's first "View Published Proposal"
      // row link — same source the totals panel's proposal block uses.
      type: 'action',
      id: 'review-final-proposal',
      label: 'Review Completed Proposal',
      insertAfterStepId: 'request-alternative-proposal',
      hrefSelector: '#view_3814 tbody tr a.kn-link-page',
      activeIcon: 'eye',
      disabled: { field: 'field_2725', notValue: 'Yes', message: 'Bid not yet validated' }
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

  var EYE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

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

  var INFO_SM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  var COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

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
      /* Completed + locked accordion: keep full opacity + green icon,
         still block clicks. Same spirit as action-step variant. */
      '.scw-step-completed.scw-step-disabled {' +
      '  opacity: 1; pointer-events: none; cursor: default;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-acc-icon {' +
      '  color: #16a34a !important; opacity: 1 !important;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-ktl-accordion__header {' +
      '  cursor: default;' +
      '}' +
      '.scw-step-completed.scw-step-disabled .scw-acc-chevron {' +
      '  display: none !important;' +
      '}' +

      /* ── Disabled message (inline in header/step) ── */
      '.scw-step-disabled-msg {' +
      '  display: flex; align-items: center; gap: 5px;' +
      '  font-size: 11px; color: #94a3b8; font-weight: 500;' +
      '  margin-left: auto; flex-shrink: 0; white-space: nowrap;' +
      '}' +
      /* Token-expanded anchor inside the header message. */
      '.scw-step-msg-link {' +
      '  color: #2563eb; text-decoration: underline;' +
      '  pointer-events: auto; cursor: pointer;' +
      '}' +
      '.scw-step-msg-link:hover { color: #1d4ed8; }' +
      /* Even when the host step has pointer-events:none (locked-by-
         completion), the inline link stays clickable. */
      '.scw-step-completed.scw-step-disabled .scw-step-msg-link,' +
      '.scw-step-action.is-completed.is-disabled .scw-step-msg-link {' +
      '  pointer-events: auto; cursor: pointer;' +
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
      /* Completed + locked (no re-trigger): keep normal appearance,
         only block clicks. No opacity fade, no gray icon. */
      '.scw-step-action.is-completed.is-disabled {' +
      '  opacity: 1; cursor: default; pointer-events: none;' +
      '}' +
      '.scw-step-action.is-completed.is-disabled .scw-step-icon {' +
      '  color: #16a34a; opacity: 1;' +
      '}' +
      /* Webhook in-flight spinner */
      '.scw-step-action.is-loading {' +
      '  pointer-events: none; opacity: 0.75; cursor: wait;' +
      '}' +
      '.scw-step-action.is-loading .scw-step-icon svg {' +
      '  animation: scw-step-spin 0.8s linear infinite;' +
      '}' +
      '@keyframes scw-step-spin { to { transform: rotate(360deg); } }' +

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

    // Compound: all of the child conditions must match (AND)
    if (Array.isArray(cond.all)) return cond.all.every(conditionMet);
    // Compound: any of the child conditions must match (OR)
    if (Array.isArray(cond.any)) return cond.any.some(conditionMet);
    // Negation: passes when the wrapped condition does NOT match
    if (cond.not) return !conditionMet(cond.not);

    var val = readField(cond.field);
    if (cond.hasValue)  return val.length > 0;
    if (cond.value    !== undefined) return val.toLowerCase() === String(cond.value).toLowerCase();
    if (cond.notValue !== undefined) return val.toLowerCase() !== String(cond.notValue).toLowerCase();

    // Numeric comparisons — parse the field value as a float. Returns
    // false on non-numeric values so a missing/blank field never passes.
    if (cond.gt  !== undefined) { var n1 = parseFloat(val); return !isNaN(n1) && n1 >  cond.gt;  }
    if (cond.gte !== undefined) { var n2 = parseFloat(val); return !isNaN(n2) && n2 >= cond.gte; }
    if (cond.lt  !== undefined) { var n3 = parseFloat(val); return !isNaN(n3) && n3 <  cond.lt;  }
    if (cond.lte !== undefined) { var n4 = parseFloat(val); return !isNaN(n4) && n4 <= cond.lte; }

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

  // ── Resolve the click href for a step ────────────────────
  // Priority: step.hrefSelector (arbitrary CSS selector, scrapes the
  // first match's href) > step.menuView (hidden Knack menu view).
  // Used so a step can point at, e.g., a row inside a table view
  // rather than a single-link menu view.
  function resolveHref(step) {
    if (step.hrefSelector) {
      var el = document.querySelector(step.hrefSelector);
      if (el) return el.getAttribute('href') || '';
    }
    if (step.menuView) return getMenuHref(step.menuView);
    return '';
  }

  // ── Build a standalone action step element ───────────────
  function buildActionStep(step) {
    var el = document.createElement('a');
    el.id = 'scw-step-' + step.id;
    el.className = 'scw-step-action';

    if (step.webhookAction) {
      el.href = 'javascript:void(0)';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.classList.contains('is-loading') ||
            el.classList.contains('is-disabled')) return;
        var handler = WEBHOOK_ACTIONS[step.webhookAction];
        if (handler) handler(step, el);
      });
    } else {
      var href = resolveHref(step);
      if (href) el.href = href;
    }

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

  // ── Resolve the insertion anchor for an action step ──────
  // `insertAfter` points to an accordion by inner viewKey;
  // `insertAfterStepId` points to another action step by id.
  // Walk backwards through STEPS from the given step, returning the
  // first rendered DOM element (action-step or accordion wrapper).
  // Used as a fallback when insertAfterStepId points at a step that
  // isn't currently in the DOM (showWhen gated it out).
  function nearestRenderedPredecessor(step) {
    var idx = -1;
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i] === step) { idx = i; break; }
    }
    if (idx < 0) return null;
    for (var j = idx - 1; j >= 0; j--) {
      var prev = STEPS[j];
      if (prev.type === 'action') {
        var prevEl = document.getElementById('scw-step-' + prev.id);
        if (prevEl) return prevEl;
      } else if (prev.type === 'accordion') {
        var acc = findAccordion(prev.viewKey);
        if (acc) return acc;
      }
    }
    return null;
  }

  function findInsertAnchor(step) {
    if (step.insertAfterStepId) {
      var el = document.getElementById('scw-step-' + step.insertAfterStepId);
      if (el) return el;
      // Anchor step isn't in the DOM — gated out by showWhen. Fall back
      // to the nearest rendered predecessor in STEPS order.
      return nearestRenderedPredecessor(step);
    }
    return findAccordion(step.insertAfter);
  }

  // ── Webhook-driven step actions ──────────────────────────
  // Used by action steps with `webhookAction: 'key'`. Each handler
  // receives the step config and the step's DOM element so it can
  // toggle the in-flight spinner and re-enable on error.
  function setStepLoading(el, loading) {
    if (!el) return;
    if (loading) {
      el.classList.add('is-loading');
      var icon = el.querySelector('.scw-step-icon');
      if (icon) icon.innerHTML = SPINNER_SVG;
    } else {
      el.classList.remove('is-loading');
      // Icon will be re-applied on next applySteps() cycle.
    }
  }

  function getSourceSowId() {
    try {
      var v = Knack.views && Knack.views[SOURCE_VIEW];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* fall through */ }
    return '';
  }

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  var WEBHOOK_ACTIONS = {
    duplicateSow: function (step, el) {
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        alert('Duplicate-SOW webhook URL is not configured.');
        return;
      }
      var sourceRecordId = getSourceSowId();
      if (!sourceRecordId) {
        alert('Could not determine current SOW record ID.');
        return;
      }

      var payload = {
        sourceRecordId: sourceRecordId,
        triggeredBy: getTriggeredBy()
      };

      setStepLoading(el, true);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
        return resp.json().catch(function () { return null; });
      }).then(function (data) {
        if (data && data.success && data.newSowUrl) {
          window.location.href = data.newSowUrl;
          return;
        }
        setStepLoading(el, false);
        var errMsg = (data && (data.error || data.message)) || 'Failed to create SOW option.';
        alert(errMsg);
      }).catch(function (err) {
        setStepLoading(el, false);
        alert('Webhook error: ' + (err && err.message ? err.message : err));
      });
    }
  };

  // ── Pick the right icon for a state ──────────────────────
  var ACTIVE_ICONS = { eye: EYE_SVG, copy: COPY_SVG };

  function getIcon(isCompleted, isDisabled, step) {
    // Completed wins over disabled so a step whose prerequisite is
    // technically unmet but which is factually done (e.g. workflow
    // advanced past it via an alternate path) still reads as done.
    if (isCompleted) return CHECK_CIRCLE_SVG;
    if (isDisabled) return LOCK_SVG;
    if (step && step.activeIcon && ACTIVE_ICONS[step.activeIcon]) return ACTIVE_ICONS[step.activeIcon];
    return CIRCLE_SVG;
  }

  // ── Apply states to an accordion step ────────────────────
  // HTML-escape for safely injecting user-provided text into innerHTML.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Read a connection field's { recordId, identifier } from a given
  // view (details or table). Returns null if the field isn't visible
  // or has no connection value.
  function readConnectionFromView(viewId, fieldKey) {
    var view = document.getElementById(viewId);
    if (!view) return null;
    var scope = view.querySelector(
      '.kn-detail.' + fieldKey +
      ', td.' + fieldKey +
      ', [data-field-key="' + fieldKey + '"]'
    );
    if (!scope) return null;
    var spans = scope.querySelectorAll('span[data-kn="connection-value"]');
    for (var i = 0; i < spans.length; i++) {
      var el = spans[i];
      var cls = (el.className || '').trim();
      var id  = el.id || '';
      var rec = /^[a-f0-9]{24}$/.test(cls) ? cls
             : (/^[a-f0-9]{24}$/.test(id)  ? id  : '');
      if (rec) {
        return {
          id: rec,
          identifier: (el.textContent || '').replace(/\u00a0/g, ' ').trim()
        };
      }
    }
    return null;
  }

  // Build an href by swapping the SECOND 24-char hex record-id in the
  // current URL hash with the supplied one. Used to construct a link
  // to a sibling SOW on the same company (the second record-id slot).
  function hrefWithSwappedSowId(newSowId) {
    var hash = window.location.hash || '';
    if (!/^#/.test(hash)) hash = '#' + hash;
    var count = 0;
    return hash.replace(/[a-f0-9]{24}/g, function (m) {
      count++;
      return count === 2 ? newSowId : m;
    });
  }

  // Substitute tokens in a message template:
  //   {field_XXXX}  — plain text value from the SOURCE_VIEW (view_3827)
  //   {link}        — anchor tag to a sibling SOW, when cfg.link is set
  function expandMessage(text, cfg) {
    if (typeof text !== 'string') return '';
    // {field_XXXX} → escaped plain text
    var out = text.replace(/\{(field_\d+)\}/g, function (_, key) {
      return escapeHtml(readField(key) || '');
    });
    // {link} → <a href="<swapped-url>">identifier</a>
    out = out.replace(/\{link\}/g, function () {
      if (!cfg || !cfg.link || !cfg.link.view || !cfg.link.field) return '';
      var conn = readConnectionFromView(cfg.link.view, cfg.link.field);
      if (!conn || !conn.id) return escapeHtml(conn && conn.identifier || '');
      var href = hrefWithSwappedSowId(conn.id);
      var label = escapeHtml(conn.identifier || conn.id);
      return '<a href="' + escapeHtml(href) + '" class="scw-step-msg-link">' + label + '</a>';
    });
    return out.trim();
  }

  // Compute which header message (if any) to show for a step.
  // Priority:
  //   1. step.completedMessage when step is completed (optionally gated
  //      by .when) — uses info icon.
  //   2. step.disabled.message when baseDisabled AND step is NOT
  //      completed — uses lock icon.
  //   3. none otherwise.
  function resolveHeaderMessage(step, isCompleted, baseDisabled) {
    if (isCompleted && step.completedMessage) {
      var cm = step.completedMessage;
      var cmText = typeof cm === 'string' ? cm : (cm && cm.text) || '';
      var cmWhen = typeof cm === 'object' ? cm.when : null;
      if (cmText && (!cmWhen || conditionMet(cmWhen))) {
        var finalHtml = expandMessage(cmText, typeof cm === 'object' ? cm : null);
        if (finalHtml) return { html: finalHtml, icon: INFO_SM_SVG };
      }
    }
    if (baseDisabled && !isCompleted && step.disabled && step.disabled.message) {
      // Lock messages don't accept tokens — plain text.
      return { html: escapeHtml(step.disabled.message), icon: LOCK_SM_SVG };
    }
    return null;
  }

  function renderHeaderMessage(hdr, step, stepKey, isCompleted, baseDisabled) {
    var msgEl = hdr.querySelector('.scw-step-disabled-msg[data-step="' + stepKey + '"]');
    var msg = resolveHeaderMessage(step, isCompleted, baseDisabled);
    if (!msg) {
      if (msgEl) msgEl.remove();
      return;
    }
    if (!msgEl) {
      msgEl = document.createElement('span');
      msgEl.className = 'scw-step-disabled-msg';
      msgEl.setAttribute('data-step', stepKey);
      var chevron = hdr.querySelector('.scw-acc-chevron');
      if (chevron) hdr.insertBefore(msgEl, chevron);
      else hdr.appendChild(msgEl);
    }
    // innerHTML so token-expanded <a> tags render. All user text
    // passes through escapeHtml in expandMessage before reaching here.
    msgEl.innerHTML = msg.icon + '<span>' + msg.html + '</span>';
  }

  function applyAccordionState(step) {
    var wrap = findAccordion(step.viewKey);
    if (!wrap) return;
    var hdr = wrap.querySelector('.scw-ktl-accordion__header');
    var iconEl = hdr.querySelector('.scw-acc-icon');

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var baseDisabled = step.disabled ? conditionMet(step.disabled) : false;
    var lockedByCompletion = !!(step.lockWhenCompleted && isCompleted);
    var isDisabled = baseDisabled || lockedByCompletion;

    // Icon — show the completed checkmark even when locked-by-completion,
    // so the header reads as "done" rather than showing the lock.
    if (iconEl) iconEl.innerHTML = getIcon(isCompleted, baseDisabled, step);

    // Both completed AND disabled can apply simultaneously when the step
    // is locked by completion; CSS (scw-step-completed.scw-step-disabled)
    // styles that combined state (full opacity, green icon, no clicks).
    wrap.classList.toggle('scw-step-completed', isCompleted);
    wrap.classList.toggle('scw-step-disabled', isDisabled);

    renderHeaderMessage(hdr, step, step.viewKey, isCompleted, baseDisabled);
  }

  // ── Apply states to an action step ───────────────────────
  function applyActionState(step) {
    var el = document.getElementById('scw-step-' + step.id);

    // Render gate: skip (and remove if present) when the showWhen
    // condition isn't met. Distinct from `disabled` which dims a
    // visible step — `showWhen` controls whether it exists at all.
    if (step.showWhen && !conditionMet(step.showWhen)) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      el = buildActionStep(step);
      var afterAcc = findInsertAnchor(step);
      if (afterAcc) afterAcc.after(el);
    }

    // Update href (only for navigation-type steps, not webhook steps)
    if (!step.webhookAction) {
      var href = resolveHref(step);
      if (href) el.href = href;
    }

    var isCompleted = step.completed ? conditionMet(step.completed) : false;
    var baseDisabled = step.disabled ? conditionMet(step.disabled) : false;
    var lockedByCompletion = !!(step.lockWhenCompleted && isCompleted);
    var isDisabled = baseDisabled || lockedByCompletion;

    // Icon — keep the completed check when locked-by-completion so the
    // user still sees the "done" state rather than a lock.
    var icon = el.querySelector('.scw-step-icon');
    if (icon) icon.innerHTML = getIcon(isCompleted, baseDisabled, step);

    // Classes: prefer is-completed styling when locked by completion so
    // the step reads as "done" while still being non-clickable.
    el.classList.toggle('is-completed', isCompleted);
    el.classList.toggle('is-disabled', isDisabled);

    // Disabled / informational message — shared helper with accordions.
    renderHeaderMessage(el, step, step.id, isCompleted, baseDisabled);

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
    // Read from the <select> first — Chosen.js keeps this in sync
    var select = document.getElementById(PLAYBOOK_VIEW + '-' + fieldKey);
    if (select && select.value) return select.value.trim();
    // Fallback to hidden input
    var hidden = document.querySelector('#' + PLAYBOOK_VIEW + ' input.connection[name="' + fieldKey + '"]');
    if (hidden) {
      var v = decodeURIComponent(hidden.value || '').replace(/[\[\]"]/g, '').trim();
      if (v) return v;
    }
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

    // Connection field change (Chosen.js fires change on the original select)
    $('#' + PLAYBOOK_VIEW + '-field_2228').on('change' + NS, applyPlaybookRules);
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

  // Any view referenced by a step's menuView / hrefSelector is a source
  // of the step's navigation href. Re-run applySteps when that view
  // renders so the step's href stays current (e.g. published proposal
  // link appearing after view_3814 loads).
  function collectDependencyViews() {
    var ids = {};
    STEPS.forEach(function (s) {
      if (s.menuView) ids[s.menuView] = true;
      if (s.hrefSelector) {
        var m = String(s.hrefSelector).match(/#(view_\d+)/);
        if (m) ids[m[1]] = true;
      }
      // completedMessage.link pulls a record from a specific view —
      // re-run applySteps on that view's render so the token refreshes.
      var cm = s.completedMessage;
      if (cm && typeof cm === 'object' && cm.link && cm.link.view) {
        ids[cm.link.view] = true;
      }
    });
    return Object.keys(ids);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, init, NS);
    SCW.onViewRender(PLAYBOOK_VIEW, function () {
      setTimeout(bindPlaybookRules, 200);
    }, NS);

    collectDependencyViews().forEach(function (vid) {
      if (vid === SOURCE_VIEW || vid === PLAYBOOK_VIEW) return;
      SCW.onViewRender(vid, function () {
        setTimeout(applySteps, 200);
      }, NS);
    });
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
