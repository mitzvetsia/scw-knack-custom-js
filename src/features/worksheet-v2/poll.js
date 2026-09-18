/*** WORKSHEET V2 — POLL ******************************************************
 *
 * Lightweight background polling so v2 picks up records added by other
 * tabs / users / the API / Make scenarios — anything that bypasses
 * this tab\'s knack-record-create event.
 *
 * Two cadences:
 *   - DEFAULT_INTERVAL_MS = 120_000  (2 minutes) — steady state
 *   - BURST_INTERVAL_MS   =  15_000  (15 seconds) — triggered for
 *     BURST_WINDOW_MS after a known local change so the data layer
 *     catches the cascade Knack/Make ran on the other side.
 *
 * Each tick calls ns.data.refetchAndNotify(viewKey) — the cheapest
 * full refresh path we already have. Silent: no UI, no toast, no
 * loading indicator. Render flicker is mitigated by render.js\'s
 * focus-skip logic — a tick that lands while the user is mid-edit
 * defers itself until focus leaves.
 *
 * Public API:
 *   ns.poll.start(viewKey)        — start polling (called by init.js)
 *   ns.poll.triggerBurst(viewKey) — flip to 15s mode for BURST_WINDOW_MS
 *
 * Triggers wired by default:
 *   - knack-record-create on any form view
 *   - knack-record-update on any form view
 *   - visibilitychange → resume from sleep
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var DEFAULT_INTERVAL_MS = 2 * 60 * 1000;   // 2 minutes
  var BURST_INTERVAL_MS   = 15 * 1000;       // 15 seconds
  var BURST_WINDOW_MS     = 5 * 60 * 1000;   // 5 minutes of burst after a trigger

  // Per-view state.
  var state = Object.create(null);

  function getOrInit(viewKey) {
    if (!state[viewKey]) {
      state[viewKey] = {
        timer:        null,
        burstUntil:   0,
        lastTickedAt: 0,
        running:      false
      };
    }
    return state[viewKey];
  }

  function currentIntervalMs(viewKey) {
    var s = state[viewKey];
    if (s && s.burstUntil > Date.now()) return BURST_INTERVAL_MS;
    return DEFAULT_INTERVAL_MS;
  }

  function tick(viewKey) {
    var s = getOrInit(viewKey);
    s.timer = null;
    if (document.hidden) {
      // Backgrounded — skip the network call, just reschedule. Wakes
      // up on visibilitychange below.
      schedule(viewKey);
      return;
    }
    if (s.running) {
      schedule(viewKey);
      return;
    }
    s.running = true;
    s.lastTickedAt = Date.now();
    try {
      if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
        // skipIfUnchanged: a freshness check that finds nothing must cost
        // zero DOM work — no rebuild, no swap, no flash. Only ticks whose
        // fetch actually brought different data repaint.
        ns.data.refetchAndNotify(viewKey, { skipIfUnchanged: true });
      }
    } catch (e) {
      console.warn('[scw-ws-v2 poll] refetch threw', e);
    }
    // We don\'t wait on the fetch to finish — refetchAndNotify is
    // fire-and-forget and the focus-skip / pending-render logic in
    // render.js handles overlap safely. Reschedule immediately so
    // the next tick uses the current (possibly bursting) interval.
    s.running = false;
    schedule(viewKey);
  }

  function schedule(viewKey) {
    var s = getOrInit(viewKey);
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    s.timer = setTimeout(function () { tick(viewKey); }, currentIntervalMs(viewKey));
  }

  function start(viewKey) {
    if (!viewKey) return;
    var s = getOrInit(viewKey);
    if (s.timer) return; // already running
    schedule(viewKey);
  }

  /** Flip to 15s cadence for the next BURST_WINDOW_MS. Use after any
   *  local change that probably triggered server-side work whose
   *  side-effects we want to surface quickly. Resets the running
   *  timer so the next tick happens within 15s. */
  function triggerBurst(viewKey) {
    if (!viewKey) return;
    var s = getOrInit(viewKey);
    s.burstUntil = Date.now() + BURST_WINDOW_MS;
    schedule(viewKey);
  }

  // ── Global triggers ─────────────────────────────────────────
  // After ANY Knack form successfully creates or updates a record,
  // flip ALL registered views into burst mode. We don\'t know which
  // view\'s data the form\'s record relates to without per-form
  // wiring, so the broad approach is to burst-poll everything for a
  // few minutes; the cost is one extra fetch per registered view per
  // 15s window, which is cheap.
  $(document).on('knack-record-create.any knack-record-update.any', function () {
    Object.keys(state).forEach(triggerBurst);
  });

  // visibilitychange → if we slept past an interval, fire immediately.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    Object.keys(state).forEach(function (vk) {
      var s = state[vk];
      if (!s) return;
      var elapsed = Date.now() - s.lastTickedAt;
      var interval = currentIntervalMs(vk);
      if (elapsed >= interval) {
        if (s.timer) { clearTimeout(s.timer); s.timer = null; }
        tick(vk);
      }
    });
  });

  ns.poll = {
    start:        start,
    triggerBurst: triggerBurst,
    DEFAULT_INTERVAL_MS: DEFAULT_INTERVAL_MS,
    BURST_INTERVAL_MS:   BURST_INTERVAL_MS,
    BURST_WINDOW_MS:     BURST_WINDOW_MS
  };
})();
/*** END WORKSHEET V2 — POLL **************************************************/
