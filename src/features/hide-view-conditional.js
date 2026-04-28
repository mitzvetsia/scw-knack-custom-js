/*** FEATURE: Hide view conditionally on field values ***/
/**
 * Generic utility. Given a list of rules, hides the target view when
 * the specified field-value conditions are met. Each rule's fields are
 * read from any Knack view model on the currently rendered scene, so
 * the source field can live in a details view, table view, or the
 * target view itself — no explicit source binding required.
 *
 * Config shape:
 *   {
 *     viewId: 'view_XXXX',
 *     hideWhen: { all: [ { field, value|notValue }, ... ] }
 *     // or     { any: [ ... ] }
 *   }
 */
(function () {
  'use strict';

  var EVENT_NS = '.scwHideViewCond';

  var CONFIG = [
    // (view_3858 gating moved into published-proposal-render.js — the
    // CTA is now injected inside the iframe content rather than left
    // visible on the parent page, so its show/hide logic and the
    // injection live together.)
  ];

  // ── Read a field's text value from any Knack view model on the page ──
  function readFieldFromAnyView(fieldKey) {
    try {
      var views = Knack && Knack.views || {};
      for (var vid in views) {
        var v = views[vid];
        if (!v || !v.model) continue;
        // Details view: single record attributes
        var attrs = v.model.attributes;
        if (attrs && attrs[fieldKey] !== undefined && attrs[fieldKey] !== '') {
          return stripHtml(attrs[fieldKey]);
        }
        // Table view: scan first record
        var data = v.model.data;
        var models = data && data.models;
        if (models && models.length && models[0].attributes) {
          var a0 = models[0].attributes;
          if (a0[fieldKey] !== undefined && a0[fieldKey] !== '') {
            return stripHtml(a0[fieldKey]);
          }
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').trim();
  }

  function conditionMet(cond) {
    var val = readFieldFromAnyView(cond.field);
    if (cond.value    !== undefined) return val === cond.value;
    if (cond.notValue !== undefined) return val !== cond.notValue;
    return false;
  }

  function shouldHide(rule) {
    var h = rule.hideWhen || {};
    if (Array.isArray(h.all)) return h.all.every(conditionMet);
    if (Array.isArray(h.any)) return h.any.some(conditionMet);
    return false;
  }

  function applyRule(rule) {
    var el = document.getElementById(rule.viewId);
    if (!el) return;
    el.style.display = shouldHide(rule) ? 'none' : '';
  }

  // Bind to each target view's render + scene render as a safety net.
  CONFIG.forEach(function (rule) {
    $(document)
      .off('knack-view-render.' + rule.viewId + EVENT_NS)
      .on('knack-view-render.' + rule.viewId + EVENT_NS, function () {
        setTimeout(function () { applyRule(rule); }, 200);
      });
  });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(function () { CONFIG.forEach(applyRule); }, 800);
    });
})();
