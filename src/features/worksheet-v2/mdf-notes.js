/*** WORKSHEET V2 — MDF/IDF LOCATION NOTES (manage-section integration) *******
 *
 * Folds the deploy page's standalone "Manage MDFs / IDFs" section INTO the
 * install worksheet: every real-location L1 header gets a pencil control that
 * toggles an inline notes panel (the location's GC/MDF notes, saved straight
 * through the manage view), and the standalone accordion section is hidden —
 * one less section on an already-crowded page, and the notes live where the
 * location's hardware already is.
 *
 * Config (per worksheet-v2 view entry):
 *   mdfManage: { viewKey: 'view_3932', notesField: 'field_1643' }
 *
 * Guards / degradation:
 *   - No mdfManage config, synthetic L1s, or the manage view absent on the
 *     scene (e.g. the view_4056 sub-portal clone inherits the config but not
 *     the view) → no control renders and the section is left alone.
 *   - The accordion hide only happens once a pencil actually rendered, so if
 *     the worksheet fails to mount the native manage section stays usable.
 *   - The panel is ephemeral DOM (a full re-render drops it) — reopening is
 *     one click and the value always re-reads fresh from the model.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var STYLE_ID = 'scw-ws-v2-mdf-notes-css';

  var PENCIL_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M12 20h9"></path>' +
    '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-ws-v2-mdf-notes-btn {',
      '  display: inline-flex; align-items: center; gap: 4px; flex: none;',
      '  margin-left: 6px; padding: 4px 7px;',
      '  border: 1px solid rgba(255,255,255,0.45); border-radius: 6px;',
      '  background: transparent; color: #fff; cursor: pointer;',
      '  opacity: 0.85;',
      '}',
      '.scw-ws-v2-mdf-notes-btn:hover { opacity: 1; background: rgba(255,255,255,0.12); }',
      /* Location HAS notes — filled state so it reads as "there is info here" */
      '.scw-ws-v2-mdf-notes-btn--has {',
      '  background: rgba(255,255,255,0.92); color: #0f4c81;',
      '  border-color: rgba(255,255,255,0.92); opacity: 1;',
      '}',
      '.scw-ws-v2-mdf-notes-btn--has:hover { background: #fff; }',
      /* Panel — direct child of the L1 <section>, right under the header, so',
         it shows even when the group accordion is collapsed. */
      '.scw-ws-v2-mdf-notes-panel {',
      '  background: #f8fafc; border: 1px solid #dbe4ee;',
      '  border-left: 3px solid #0f4c81; border-radius: 0 0 8px 8px;',
      '  padding: 10px 14px 12px; margin: 0 0 6px;',
      '}',
      '.scw-ws-v2-mdf-notes-label {',
      '  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;',
      '  text-transform: uppercase; color: #475569; margin-bottom: 6px;',
      '}',
      '.scw-ws-v2-mdf-notes-ta {',
      '  width: 100%; min-height: 54px; box-sizing: border-box;',
      '  font: 13px/1.5 system-ui, sans-serif; color: #1e293b;',
      '  padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px;',
      '  background: #fff; resize: vertical;',
      '  transition: background 0.4s, border-color 0.2s;',
      '}',
      '.scw-ws-v2-mdf-notes-ta:focus { outline: none; border-color: #0f4c81; }',
      '.scw-ws-v2-mdf-notes-ta--saving { border-color: #93c5fd !important; }',
      '.scw-ws-v2-mdf-notes-ta--saved  { background: #dcfce7 !important; border-color: #4ade80 !important; }',
      '.scw-ws-v2-mdf-notes-ta--err    { background: #fef2f2 !important; border-color: #fca5a5 !important; }',
      '.scw-ws-v2-mdf-notes-hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function manageCfg(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return (vc && vc.mdfManage && vc.mdfManage.viewKey) ? vc.mdfManage : null;
    } catch (e) { return null; }
  }

  function manageAttrs(manageViewKey, recId) {
    try {
      var v = Knack && Knack.views && Knack.views[manageViewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === recId) return models[i].attributes;
      }
    } catch (e) { /* view not on scene */ }
    return null;
  }

  function stripTags(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /** Hide the standalone Manage MDFs/IDFs accordion section — only called
   *  after a pencil control actually rendered, so the native section stays
   *  reachable whenever the integrated path isn't live. Re-applied on every
   *  render (accordion wrappers get rebuilt by their own module). */
  function hideManageSection(manageViewKey) {
    var mv = document.getElementById(manageViewKey);
    if (!mv) return;
    var acc = mv.closest('.scw-ktl-accordion');
    if (acc) acc.style.setProperty('display', 'none', 'important');
  }

  /** Called by render.js buildL1Block for every L1 — returns the pencil
   *  control (lives in the head-wrap next to the select-all checkbox, NOT
   *  inside the head <button>: nested buttons are invalid and the head node
   *  gets swapped by in-place updates while the wrap persists). */
  function headerControl(l1, sourceViewKey) {
    var cfg = manageCfg(sourceViewKey);
    if (!cfg) return null;
    if (!l1 || !/^[a-f0-9]{24}$/i.test(String(l1.id || ''))) return null;
    var attrs = manageAttrs(cfg.viewKey, l1.id);
    if (!attrs) return null;
    injectStyles();
    hideManageSection(cfg.viewKey);

    var notesField = cfg.notesField || 'field_1643';
    var hasNotes = !!stripTags(attrs[notesField]);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-ws-v2-mdf-notes-btn' +
      (hasNotes ? ' scw-ws-v2-mdf-notes-btn--has' : '');
    btn.setAttribute('data-scw-ws-v2-mdf-notes', l1.id);
    btn.setAttribute('data-scw-ws-v2-view', sourceViewKey);
    btn.setAttribute('aria-label', 'Location notes');
    btn.title = hasNotes
      ? 'This location has notes — click to view / edit'
      : 'Add notes for this location';
    btn.innerHTML = PENCIL_SVG + (hasNotes ? '<span>Notes</span>' : '');
    return btn;
  }

  function saveNotes(ta) {
    var manageViewKey = ta.getAttribute('data-scw-ws-v2-mdf-view');
    var recId = ta.getAttribute('data-scw-ws-v2-mdf-rec');
    var field = ta.getAttribute('data-scw-ws-v2-mdf-field');
    if (!manageViewKey || !recId || !field) return;
    if (ta.getAttribute('data-scw-saved-val') === ta.value) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' &&
          typeof SCW.knackRecordUrl === 'function')) return;
    var value = ta.value;
    var body = {}; body[field] = value;
    ta.classList.add('scw-ws-v2-mdf-notes-ta--saving');
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(manageViewKey, recId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json'
    }).then(function (resp) {
      ta.classList.remove('scw-ws-v2-mdf-notes-ta--saving');
      ta.setAttribute('data-scw-saved-val', value);
      ta.classList.add('scw-ws-v2-mdf-notes-ta--saved');
      setTimeout(function () { ta.classList.remove('scw-ws-v2-mdf-notes-ta--saved'); }, 1200);
      try {
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(manageViewKey, recId, resp, field, value);
        }
      } catch (e) { /* model sync best-effort */ }
      // Refresh the pencil's has-notes state without waiting for a re-render.
      var btn = document.querySelector('[data-scw-ws-v2-mdf-notes="' + recId + '"]');
      if (btn) {
        var has = !!value.trim();
        btn.classList.toggle('scw-ws-v2-mdf-notes-btn--has', has);
        btn.innerHTML = PENCIL_SVG + (has ? '<span>Notes</span>' : '');
      }
    }, function (xhr) {
      ta.classList.remove('scw-ws-v2-mdf-notes-ta--saving');
      ta.classList.add('scw-ws-v2-mdf-notes-ta--err');
      console.warn('[scw-ws-v2-mdf-notes] save failed', manageViewKey, recId,
        xhr && xhr.status);
      setTimeout(function () { ta.classList.remove('scw-ws-v2-mdf-notes-ta--err'); }, 2500);
    });
  }

  function buildPanel(cfg, l1Id, label) {
    var attrs = manageAttrs(cfg.viewKey, l1Id) || {};
    var notesField = cfg.notesField || 'field_1643';
    var panel = document.createElement('div');
    panel.className = 'scw-ws-v2-mdf-notes-panel';
    var lbl = document.createElement('div');
    lbl.className = 'scw-ws-v2-mdf-notes-label';
    lbl.textContent = 'Location notes' + (label ? ' — ' + label : '');
    var ta = document.createElement('textarea');
    ta.className = 'scw-ws-v2-mdf-notes-ta';
    ta.value = stripTags(attrs[notesField]);
    ta.setAttribute('data-scw-saved-val', ta.value);
    ta.setAttribute('data-scw-ws-v2-mdf-view', cfg.viewKey);
    ta.setAttribute('data-scw-ws-v2-mdf-rec', l1Id);
    ta.setAttribute('data-scw-ws-v2-mdf-field', notesField);
    ta.addEventListener('blur', function () { saveNotes(ta); });
    var hint = document.createElement('div');
    hint.className = 'scw-ws-v2-mdf-notes-hint';
    hint.textContent = 'Saves when you click away';
    panel.appendChild(lbl);
    panel.appendChild(ta);
    panel.appendChild(hint);
    return panel;
  }

  // ── Delegated toggle ──────────────────────────────────────────────
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-mdf-notes-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-mdf-notes-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest &&
        e.target.closest('[data-scw-ws-v2-mdf-notes]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var l1Id = btn.getAttribute('data-scw-ws-v2-mdf-notes');
      var viewKey = btn.getAttribute('data-scw-ws-v2-view');
      var cfg = manageCfg(viewKey);
      var block = btn.closest('.scw-ws-v2-l1');
      if (!cfg || !block) return;
      var existing = block.querySelector(':scope > .scw-ws-v2-mdf-notes-panel');
      if (existing) { existing.remove(); return; }
      var labelEl = block.querySelector('.scw-ws-v2-l1-label');
      var panel = buildPanel(cfg, l1Id, labelEl ? labelEl.textContent : '');
      // Directly after the header wrap (NOT inside the l1-body) so the notes
      // are readable/editable even while the group accordion is collapsed.
      var headWrap = block.querySelector(':scope > .scw-ws-v2-l1-head-wrap');
      if (headWrap && headWrap.nextSibling) {
        block.insertBefore(panel, headWrap.nextSibling);
      } else {
        block.appendChild(panel);
      }
      var ta = panel.querySelector('textarea');
      if (ta) ta.focus();
    }, true);
  }

  ns.mdfNotes = { headerControl: headerControl };
})();
/*** END WORKSHEET V2 — MDF/IDF LOCATION NOTES ********************************/
