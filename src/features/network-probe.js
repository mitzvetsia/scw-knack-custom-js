/*** FEATURE: Network probe — diagnose interminable page loads ****************
 *
 * The browser's tab refresh-spinner only stops once every in-flight
 * network request has settled. When users report "the page works but
 * the spinner just keeps going forever," it's almost always a single
 * XHR or fetch that never resolves (and never errors), keeping the
 * document `load`/`readystatechange` accounting alive.
 *
 * This module wraps XMLHttpRequest and fetch globally — always on, no
 * webhook push — and keeps a small in-memory ledger of every request
 * with start timestamp, method, URL, and resolution time. When a
 * request stays open past SLOW_THRESHOLD_MS, it's flagged. When the
 * spinner appears stuck (any request open > STUCK_THRESHOLD_MS), the
 * ledger is snapshotted into sessionStorage so the user can retrieve
 * it after the fact — even if they reload before running the helper.
 *
 *   window.SCW.netProbe.pending()    // pending requests, oldest first
 *   window.SCW.netProbe.recent()     // last N completed (default 25)
 *   window.SCW.netProbe.stuck()      // snapshots collected this session
 *   window.SCW.netProbe.clear()      // wipe sessionStorage snapshots
 *   window.SCW.netProbe.dump()       // console.table of pending + recent
 *
 * Overhead: a Map insert + delete per request, plus a setInterval at
 * 5s scanning the pending map. Negligible.
 ******************************************************************************/
(function () {
  'use strict';

  var SLOW_THRESHOLD_MS    = 5000;   // mark as slow after 5s
  var STUCK_THRESHOLD_MS   = 20000;  // snapshot to sessionStorage after 20s
  var RECENT_LIMIT         = 50;     // keep last N completed
  var SNAPSHOT_KEY         = 'scw.netProbe.stuck';
  var SNAPSHOT_MAX         = 10;     // cap stored snapshots per session
  var SCAN_INTERVAL_MS     = 5000;

  var pending = new Map();   // id → { id, kind, method, url, startedAt }
  var recent  = [];          // newest first
  var nextId  = 1;
  var snapshotIdsSeen = new Set();

  function now() { return Date.now(); }

  function shortUrl(u) {
    if (!u) return '';
    try {
      var s = String(u);
      // Strip origin so the ledger stays readable; keep path + query
      var m = s.match(/^https?:\/\/[^/]+(\/.*)$/);
      return m ? m[1] : s;
    } catch (e) { return String(u); }
  }

  function record(entry) {
    entry.endedAt = now();
    entry.durationMs = entry.endedAt - entry.startedAt;
    recent.unshift(entry);
    if (recent.length > RECENT_LIMIT) recent.length = RECENT_LIMIT;
    pending.delete(entry.id);
  }

  // ── XHR wrap ────────────────────────────────────────────────────
  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR && OrigXHR.prototype) {
    var origOpen = OrigXHR.prototype.open;
    var origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function (method, url) {
      try {
        this.__scwProbe = {
          id: nextId++, kind: 'xhr',
          method: (method || 'GET').toUpperCase(),
          url: shortUrl(url),
        };
      } catch (e) { /* never throw from wrapper */ }
      return origOpen.apply(this, arguments);
    };

    OrigXHR.prototype.send = function () {
      var entry = this.__scwProbe;
      if (entry) {
        entry.startedAt = now();
        pending.set(entry.id, entry);
        var self = this;
        var done = function (status) {
          if (!entry || entry.endedAt) return;
          entry.status = status || self.status || 0;
          record(entry);
        };
        this.addEventListener('loadend', function () { done(self.status); });
        // loadend fires for success/error/abort, but be defensive — if
        // something kills the XHR without firing loadend, the next
        // scan() pass will still surface it as pending.
      }
      return origSend.apply(this, arguments);
    };
  }

  // ── fetch wrap ──────────────────────────────────────────────────
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var entry = {
        id: nextId++, kind: 'fetch',
        method: (init && init.method ? init.method : (input && input.method) || 'GET').toUpperCase(),
        url: shortUrl(typeof input === 'string' ? input : (input && input.url) || ''),
        startedAt: now(),
      };
      pending.set(entry.id, entry);
      var p;
      try {
        p = origFetch.apply(this, arguments);
      } catch (e) {
        entry.status = -1; entry.error = String(e && e.message || e);
        record(entry);
        throw e;
      }
      return p.then(function (resp) {
        entry.status = resp && resp.status || 0;
        record(entry);
        return resp;
      }, function (err) {
        entry.status = -1; entry.error = String(err && err.message || err);
        record(entry);
        throw err;
      });
    };
  }

  // ── snapshot stuck requests to sessionStorage ───────────────────
  function readSnapshots() {
    try {
      var raw = sessionStorage.getItem(SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeSnapshots(arr) {
    try {
      while (arr.length > SNAPSHOT_MAX) arr.shift();
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr));
    } catch (e) { /* quota etc — ignore */ }
  }

  function snapshotStuck(stuckEntries) {
    if (!stuckEntries.length) return;
    var snaps = readSnapshots();
    snaps.push({
      at: new Date().toISOString(),
      href: location.href,
      hash: location.hash,
      stuck: stuckEntries.map(function (e) {
        return {
          id: e.id, kind: e.kind, method: e.method, url: e.url,
          ageMs: now() - e.startedAt,
        };
      }),
    });
    writeSnapshots(snaps);
  }

  function scan() {
    if (!pending.size) return;
    var stuck = [];
    pending.forEach(function (e) {
      var age = now() - e.startedAt;
      if (age >= STUCK_THRESHOLD_MS && !snapshotIdsSeen.has(e.id)) {
        stuck.push(e);
        snapshotIdsSeen.add(e.id);
      }
    });
    if (stuck.length) snapshotStuck(stuck);
  }

  setInterval(scan, SCAN_INTERVAL_MS);

  // ── public helpers ──────────────────────────────────────────────
  function pendingList() {
    var list = [];
    pending.forEach(function (e) {
      list.push({
        id: e.id, kind: e.kind, method: e.method, url: e.url,
        ageMs: now() - e.startedAt,
        slow: (now() - e.startedAt) >= SLOW_THRESHOLD_MS,
      });
    });
    list.sort(function (a, b) { return b.ageMs - a.ageMs; });
    return list;
  }

  function recentList(n) {
    var limit = (typeof n === 'number' && n > 0) ? n : 25;
    return recent.slice(0, limit).map(function (e) {
      return {
        id: e.id, kind: e.kind, method: e.method, url: e.url,
        status: e.status, durationMs: e.durationMs, error: e.error || '',
      };
    });
  }

  function dump() {
    var p = pendingList();
    var r = recentList(15);
    if (console.groupCollapsed) {
      console.groupCollapsed('[SCW netProbe] pending: ' + p.length +
                             '  recent: ' + recent.length);
    }
    if (p.length && console.table) console.table(p);
    else if (p.length) console.log('Pending:', p);
    else console.log('No pending requests.');
    if (r.length && console.table) console.table(r);
    if (console.groupEnd) console.groupEnd();
    var snaps = readSnapshots();
    if (snaps.length) console.log('[SCW netProbe] ' + snaps.length +
                                  ' stuck-snapshot(s) in sessionStorage. ' +
                                  'Run SCW.netProbe.stuck() to inspect.');
  }

  window.SCW = window.SCW || {};
  window.SCW.netProbe = {
    pending: pendingList,
    recent:  recentList,
    stuck:   readSnapshots,
    clear:   function () {
      try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch (e) {}
      snapshotIdsSeen.clear();
    },
    dump:    dump,
    _config: {
      SLOW_THRESHOLD_MS: SLOW_THRESHOLD_MS,
      STUCK_THRESHOLD_MS: STUCK_THRESHOLD_MS,
      RECENT_LIMIT: RECENT_LIMIT,
    },
  };
})();
