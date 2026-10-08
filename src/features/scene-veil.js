/*** SCENE VEIL — hold heavy scenes behind a spinner until their transforms settle ***/
//
// Knack renders a scene's views progressively: each grid fetches, paints,
// and fires knack-view-render on its own schedule, and our transforms
// (worksheet-v2 panel, bid-review-v2 grid, accordion wrapping, the Project #
// hero, the header card) each land a few hundred ms later. The user sees the
// raw native views appear one at a time, then watches them get replaced —
// "the pieces come in all out of order."
//
// scene_1116 (sales Build SOW) solved this in scene-tweaks.js with a veil:
// children sit at opacity 0 under a spinner until (a) no view has rendered
// for REVEAL_QUIET_MS and (b) the page's transform markers exist, with
// safety caps so the page can never stay blank. This module is the same
// mechanism for the other heavy ops scenes, driven by a per-scene config.
//
// Per scene:
//   markers  — selectors that must ALL exist before the reveal (the
//              transforms whose late arrival is the visible flash).
//   panel    — the main custom surface; must exist AND have left its
//              "Waiting for source views…" placeholder (a `*-empty` child
//              whose text starts with "Waiting").
//
// Caps: REVEAL_SAFETY_MS from the first view render, 3s after the scene's
// own render event, and a 10s event-independent watchdog that force-reveals
// and dumps which markers are missing (so a stuck report is debuggable).
(function () {
  'use strict';

  var SCENES = {
    // ops K2: Build SOWs — worksheet-v2 on view_3962, project header card
    // (build-sow-project-header.js on view_3901), accordion shells, hero.
    scene_1085: {
      panel:   '#scw-ws-v2-view_3962',
      markers: ['#scw-pid-hero', '#view_3901 .scw-bsh-card', '.scw-ktl-accordion']
    },
    // K2: Reconcile Bids — bid-review-v2 panel (replaces the v1 grid), hero.
    scene_1155: {
      panel:   '#scw-bid-review-v2',
      markers: ['#scw-pid-hero']
    }
  };

  var REVEAL_QUIET_MS   = 600;
  var REVEAL_SAFETY_MS  = 6000;
  var SCENE_RENDER_CAP  = 3000;
  var WATCHDOG_MS       = 10000;
  var READY_CLS         = 'scw-scene-ready';
  var NS                = '.scwSceneVeil';
  var STYLE_ID          = 'scw-scene-veil-css';

  var sceneIds = Object.keys(SCENES);

  // ── CSS (one block per scene; same shape as scene_1116's veil) ──
  if (!document.getElementById(STYLE_ID)) {
    var css = '';
    for (var s = 0; s < sceneIds.length; s++) {
      var id = '#kn-' + sceneIds[s];
      css +=
        id + ' { min-height: 100vh; position: relative; }\n' +
        id + ' > * { opacity: 0; transition: opacity 350ms ease; }\n' +
        id + '.' + READY_CLS + ' > * { opacity: 1; }\n' +
        id + ':not(.' + READY_CLS + ') { pointer-events: none; }\n' +
        id + ':not(.' + READY_CLS + ')::before { content: ""; position: absolute; top: 140px; left: 50%;' +
          ' width: 30px; height: 30px; margin-left: -15px; border: 3px solid #e5e7eb;' +
          ' border-top-color: #163C6E; border-radius: 50%; animation: scwSceneVeilSpin2 0.8s linear infinite; }\n' +
        id + ':not(.' + READY_CLS + ')::after { content: "Loading page…"; position: absolute; top: 184px; left: 50%;' +
          ' transform: translateX(-50%); font: 600 13px/1.3 system-ui, -apple-system, sans-serif;' +
          ' color: #64748b; letter-spacing: 0.02em; }\n';
    }
    css += '@keyframes scwSceneVeilSpin2 { to { transform: rotate(360deg); } }\n';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── State per scene ──
  var _timers = {};        // sceneId → { quiet, safety }
  var _veilFirstSeen = {}; // sceneId → ts

  function sceneEl(sceneId) {
    return document.getElementById('kn-' + sceneId);
  }
  function veiled(sceneId) {
    var el = sceneEl(sceneId);
    return !!el && !el.classList.contains(READY_CLS);
  }
  function timers(sceneId) {
    return _timers[sceneId] || (_timers[sceneId] = { quiet: null, safety: null });
  }

  function panelRendered(sel) {
    var panel = document.querySelector(sel);
    if (!panel) return false;
    var empties = panel.querySelectorAll('[class$="-empty"]');
    for (var i = 0; i < empties.length; i++) {
      if (/^\s*Waiting/.test(empties[i].textContent || '')) return false;
    }
    return true;
  }

  function missingMarkers(sceneId) {
    var cfg = SCENES[sceneId];
    var scene = sceneEl(sceneId);
    var missing = [];
    if (!scene) return ['scene'];
    if (cfg.panel && !panelRendered(cfg.panel)) missing.push(cfg.panel);
    for (var i = 0; i < cfg.markers.length; i++) {
      if (!scene.querySelector(cfg.markers[i])) missing.push(cfg.markers[i]);
    }
    return missing;
  }

  function reveal(sceneId) {
    var t = timers(sceneId);
    clearTimeout(t.quiet);  t.quiet = null;
    clearTimeout(t.safety); t.safety = null;
    _veilFirstSeen[sceneId] = 0;
    var scene = sceneEl(sceneId);
    if (scene) scene.classList.add(READY_CLS);
  }

  function scheduleReveal(sceneId) {
    if (!veiled(sceneId)) return;
    var t = timers(sceneId);
    if (!t.safety) t.safety = setTimeout(function () { reveal(sceneId); }, REVEAL_SAFETY_MS);
    clearTimeout(t.quiet);
    t.quiet = setTimeout(function () {
      t.quiet = null;
      if (!veiled(sceneId)) return;
      if (missingMarkers(sceneId).length === 0) reveal(sceneId);
      else scheduleReveal(sceneId);   // markers not up yet — extend the wait
    }, REVEAL_QUIET_MS);
  }

  function activeVeiledScenes() {
    var out = [];
    for (var i = 0; i < sceneIds.length; i++) if (veiled(sceneIds[i])) out.push(sceneIds[i]);
    return out;
  }

  // Any view render anywhere re-arms the quiet window of every veiled
  // scene. Renders after reveal are ignored (class already set), so a
  // page never re-veils on refetches or inline edits.
  $(document).on('knack-view-render.any' + NS, function () {
    var ids = activeVeiledScenes();
    for (var i = 0; i < ids.length; i++) scheduleReveal(ids[i]);
  });

  // Secondary cap — the scene's own render event means Knack's initial
  // pass is done; whatever the transforms are doing, show the page soon.
  for (var k = 0; k < sceneIds.length; k++) {
    (function (sceneId) {
      $(document).on('knack-scene-render.' + sceneId + NS, function () {
        scheduleReveal(sceneId);
        setTimeout(function () { reveal(sceneId); }, SCENE_RENDER_CAP);
      });
    })(sceneIds[k]);
  }

  // Event-independent watchdog: a hung fetch or a starved event loop
  // produces no Knack events at all. Veiled for WATCHDOG_MS since first
  // seen → force the reveal and name what was missing.
  setInterval(function () {
    var now = Date.now();
    for (var i = 0; i < sceneIds.length; i++) {
      var sceneId = sceneIds[i];
      if (!veiled(sceneId)) { _veilFirstSeen[sceneId] = 0; continue; }
      if (!_veilFirstSeen[sceneId]) { _veilFirstSeen[sceneId] = now; continue; }
      if (now - _veilFirstSeen[sceneId] < WATCHDOG_MS) continue;
      try {
        console.warn('[scw-scene-veil] ' + sceneId + ' still veiled after ' +
          Math.round((now - _veilFirstSeen[sceneId]) / 1000) + 's — forcing reveal. missing: ' +
          (missingMarkers(sceneId).join(', ') || '(none)') +
          ' | Knack.views: ' + ((typeof Knack !== 'undefined' && Knack.views) ? Object.keys(Knack.views).join(', ') : '(none)'));
      } catch (e) { /* diagnostics only */ }
      reveal(sceneId);
    }
  }, 2000);

  window.SCW = window.SCW || {};
  SCW.sceneVeil = {
    SCENES: SCENES,
    reveal: reveal,
    schedule: scheduleReveal,
    missing: missingMarkers
  };
})();
