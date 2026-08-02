/*** FEATURE: SURVEY REQUEST CARDS — show submitted requests on the sales build stepper ***/
/**
 * The survey step on scene_1116 is a CREATE form — after submitting, the
 * sales user has no way to see what they asked for (one SOW → many Survey
 * Requests). This module reads a hidden grid of the SOW's Survey Requests
 * and renders each one back as a card directly beneath the survey step:
 * status chip (Pending Validation renders as an amber ARMED chip), REQ #,
 * assigned partner, the Requested/Scheduled/Completed dates, and the
 * instructions/notes the user entered.
 *
 * Source: view_3876 — the existing hidden Survey Requests grid on
 * scene_1116 (already in hide-data-source-views; workflow-stepper reads
 * its field_2329 for the sibling-SOW link). Its rows may span the whole
 * PROJECT (sibling SOWs included), so each card tags the SOW it belongs
 * to. ⚠️ Builder: any CONFIG.fields key not projected as a (hidden-ok)
 * COLUMN on view_3876 renders blank — add the columns you want shown,
 * and make sure the view has NO status filter (pending must be visible).
 *
 * Also exposes SCW.surveyRequests.getRecords() so other modules (e.g.
 * workflow-stepper's armed state) can read the same data instead of
 * needing the Builder rollup field on view_3827.
 */
(function () {
  'use strict';

  var CONFIG = {
    sceneId: 'scene_1116',
    viewId: 'view_3876',            // hidden Survey Requests grid (existing)
    fields: {
      reqId:        'field_2345',   // REQ identifier (e.g. SR-12)
      status:       'field_2349',   // status (incl. Pending Validation)
      partner:      'field_2347',   // subcontractor / branch connection
      sow:          'field_2329',   // SOW connection (rows may span the project)
      requested:    'field_2351',   // DATE requested
      scheduled:    'field_2352',   // DATE scheduled
      completed:    'field_2353',   // DATE completed
      instructions: 'field_2355',   // instructions text
      otherNotes:   'field_2357'    // other notes text
    },
    // Status values (lowercased substring match) that mean "armed" —
    // created but held until Ops validates the SOW.
    armedStatusMatch: 'pending'
  };

  var STYLE_ID = 'scw-srq-cards-css';
  var WRAP_ID  = 'scw-srq-cards';
  var NS       = '.scwSrqCards';

  // ── Styles ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      (CONFIG.viewId ? '#' + CONFIG.viewId + ' { display: none !important; }' : '') +
      '#' + WRAP_ID + ' { margin: 0 0 8px; }' +
      '#' + WRAP_ID + '__label, .scw-srqc-label {' +
      '  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;' +
      '  text-transform: uppercase; color: #64748b; margin: 0 2px 6px;' +
      '}' +
      '.scw-srqc {' +
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;' +
      '  padding: 10px 14px; margin-bottom: 8px; font-size: 12.5px; color: #334155;' +
      '  border-left: 4px solid #295f91;' +
      '}' +
      '.scw-srqc--armed { border-left-color: #b45309; }' +
      '.scw-srqc__top {' +
      '  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' +
      '}' +
      '.scw-srqc__req {' +
      '  font: 600 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;' +
      '  color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 5px;' +
      '}' +
      '.scw-srqc__chip {' +
      '  font: 700 10.5px/1 system-ui, sans-serif; text-transform: uppercase;' +
      '  letter-spacing: .4px; padding: 4px 8px; border-radius: 5px; white-space: nowrap;' +
      '}' +
      '.scw-srqc__chip--armed   { background: #fef3c7; color: #b45309; }' +
      '.scw-srqc__chip--pending { background: #fef3c7; color: #b45309; }' +
      '.scw-srqc__chip--active  { background: #dbeafe; color: #1d4ed8; }' +
      '.scw-srqc__chip--done    { background: #d1fae5; color: #047857; }' +
      '.scw-srqc__chip--neutral { background: #f1f5f9; color: #475569; }' +
      '.scw-srqc__partner { font-weight: 650; color: #0f172a; }' +
      '.scw-srqc__armed-note {' +
      '  margin-left: auto; font-size: 11.5px; font-weight: 600; color: #b45309;' +
      '}' +
      '.scw-srqc__dates {' +
      '  display: flex; gap: 14px; flex-wrap: wrap; margin-top: 7px;' +
      '  font-size: 11.5px; color: #475569;' +
      '}' +
      '.scw-srqc__date b {' +
      '  display: block; font-size: 10px; font-weight: 700; color: #94a3b8;' +
      '  text-transform: uppercase; letter-spacing: .3px;' +
      '}' +
      '.scw-srqc__date--empty { color: #cbd5e1; font-style: italic; }' +
      '.scw-srqc__row { margin-top: 7px; line-height: 1.4; }' +
      '.scw-srqc__row b {' +
      '  font-size: 10px; font-weight: 700; color: #94a3b8;' +
      '  text-transform: uppercase; letter-spacing: .3px; display: block;' +
      '}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Data ─────────────────────────────────────────────────
  function displayValue(attrs, fieldKey) {
    if (!attrs || !fieldKey) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].identifier) {
      return String(raw[0].identifier).trim();
    }
    if (raw && typeof raw === 'object' && raw.identifier) {
      return String(raw.identifier).trim();
    }
    var v = attrs[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim();
  }

  function getRecords() {
    var out = [];
    if (!CONFIG.viewId) return out;
    var F = CONFIG.fields;
    try {
      var v = Knack.views && Knack.views[CONFIG.viewId];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || models[i];
        if (!a || !a.id) continue;
        out.push({
          id:           a.id,
          reqId:        displayValue(a, F.reqId),
          status:       displayValue(a, F.status),
          partner:      displayValue(a, F.partner),
          sow:          displayValue(a, F.sow),
          requested:    displayValue(a, F.requested),
          scheduled:    displayValue(a, F.scheduled),
          completed:    displayValue(a, F.completed),
          instructions: displayValue(a, F.instructions),
          otherNotes:   displayValue(a, F.otherNotes)
        });
      }
    } catch (e) { /* fall through to DOM */ }
    if (!out.length) {
      var viewEl = document.getElementById(CONFIG.viewId);
      var rows = viewEl ? viewEl.querySelectorAll('tbody tr[id]') : [];
      for (var r = 0; r < rows.length; r++) {
        if (!/^[a-f0-9]{24}$/i.test(rows[r].id || '')) continue;
        var cell = function (fk) {
          var td = fk ? rows[r].querySelector('td.' + fk) : null;
          return td ? (td.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '';
        };
        out.push({
          id: rows[r].id,
          reqId: cell(F.reqId), status: cell(F.status), partner: cell(F.partner),
          sow: cell(F.sow),
          requested: cell(F.requested), scheduled: cell(F.scheduled),
          completed: cell(F.completed), instructions: cell(F.instructions),
          otherNotes: cell(F.otherNotes)
        });
      }
    }
    return out;
  }

  function isArmed(rec) {
    return String(rec.status || '').toLowerCase()
      .indexOf(CONFIG.armedStatusMatch) !== -1;
  }

  function chipClass(rec) {
    if (isArmed(rec)) return 'armed';
    var s = String(rec.status || '').toLowerCase();
    if (/complete|done|delivered|submitted/.test(s)) return 'done';
    if (/schedul|progress|active|request/.test(s))   return 'active';
    return 'neutral';
  }

  // ── Render ───────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function dateCell(label, val) {
    return '<span class="scw-srqc__date' + (val ? '' : ' scw-srqc__date--empty') + '">' +
      '<b>' + esc(label) + '</b>' + (val ? esc(val) : 'Pending') + '</span>';
  }

  function textRow(label, val) {
    if (!val) return '';
    return '<div class="scw-srqc__row"><b>' + esc(label) + '</b>' + esc(val) + '</div>';
  }

  function buildCard(rec) {
    var armed = isArmed(rec);
    var cls = chipClass(rec);
    var chipText = armed ? 'Armed' : (rec.status || 'Submitted');
    return '' +
      '<div class="scw-srqc' + (armed ? ' scw-srqc--armed' : '') + '" data-req="' + esc(rec.id) + '">' +
        '<div class="scw-srqc__top">' +
          '<span class="scw-srqc__chip scw-srqc__chip--' + cls + '">' + esc(chipText) + '</span>' +
          (rec.reqId ? '<span class="scw-srqc__req">REQ ' + esc(rec.reqId) + '</span>' : '') +
          (rec.sow ? '<span class="scw-srqc__req">' + esc(rec.sow) + '</span>' : '') +
          (rec.partner ? '<span class="scw-srqc__partner">' + esc(rec.partner) + '</span>' : '') +
          (armed ? '<span class="scw-srqc__armed-note">Sends when Ops validates</span>' : '') +
        '</div>' +
        '<div class="scw-srqc__dates">' +
          dateCell('Requested', rec.requested) +
          dateCell('Scheduled', rec.scheduled) +
          dateCell('Completed', rec.completed) +
        '</div>' +
        textRow('Instructions', rec.instructions) +
        textRow('Other Notes', rec.otherNotes) +
      '</div>';
  }

  // Anchor: directly beneath the survey step — the view_3853 accordion
  // wrapper, or the either/or choice group when the accordion currently
  // lives inside it (workflow-stepper moves it there pre-decision).
  function findAnchor() {
    var hdr = document.querySelector('.scw-ktl-accordion__header[data-view-key="view_3853"]');
    var wrap = hdr && hdr.closest('.scw-ktl-accordion');
    if (!wrap) return null;
    return wrap.closest('.scw-step-choice') || wrap;
  }

  function render() {
    if (!CONFIG.viewId) return;
    var anchor = findAnchor();
    var wrap = document.getElementById(WRAP_ID);
    var records = getRecords();

    if (!records.length || !anchor) {
      if (wrap) wrap.remove();
      return;
    }

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
    }
    // Self-assert position: directly after the survey step, every pass —
    // the choice group forming/dissolving moves the anchor around.
    if (wrap.previousElementSibling !== anchor || wrap.parentNode !== anchor.parentNode) {
      anchor.after(wrap);
    }

    var html =
      '<div class="scw-srqc-label">Submitted Survey Request' +
      (records.length > 1 ? 's' : '') + '</div>' +
      records.map(buildCard).join('');
    // Change-guarded — renders fire often on this scene.
    if (wrap.getAttribute('data-scw-html') !== html) {
      wrap.setAttribute('data-scw-html', html);
      wrap.innerHTML = html;
    }
  }

  // ── Public API ───────────────────────────────────────────
  window.SCW = window.SCW || {};
  SCW.surveyRequests = SCW.surveyRequests || {};
  SCW.surveyRequests.getRecords = getRecords;
  SCW.surveyRequests.armedCount = function () {
    return getRecords().filter(isArmed).length;
  };
  SCW.surveyRequests.refresh = render;

  // ── Bindings ─────────────────────────────────────────────
  injectStyles();
  if (CONFIG.viewId && window.SCW && SCW.onViewRender) {
    SCW.onViewRender(CONFIG.viewId, function () { setTimeout(render, 150); }, NS);
  }
  $(document)
    .off('knack-scene-render.' + CONFIG.sceneId + NS)
    .on('knack-scene-render.' + CONFIG.sceneId + NS, function () {
      setTimeout(render, 900);   // after workflow-stepper's applySteps pass
    });
  // The survey step's position changes when the choice group forms or
  // dissolves (workflow-stepper re-applies on view_3827 renders) — track it.
  $(document)
    .off('knack-view-render.view_3827' + NS)
    .on('knack-view-render.view_3827' + NS, function () {
      setTimeout(render, 900);
    });
})();
/*** END SURVEY REQUEST CARDS ***********************************************/
