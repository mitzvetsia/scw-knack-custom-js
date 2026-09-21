/*** SHIPMENTS — Installation tile line + drawer (scene_1311) ****************
 *
 * A Shipment record mirrors ONE order in the third-party OMS (an OMS order
 * has exactly one shipment, so order and shipment are one object here). The
 * OMS owns the facts; Knack owns the LINKAGE (which project / proposal an
 * order belongs to). Everything below follows from that split:
 *
 *   • Every OMS-owned field is READ-ONLY here — no edit affordances, ever.
 *     A "fix" typed in Knack is overwritten by the next reconcile pass and
 *     we end up with two stories about one order. Nothing in this tray
 *     writes a record; the rows are plain text (repo read-only convention:
 *     fully readable, white, no graying).
 *   • The LINKAGE fields are ours to edit (live: CORE_projects and
 *     INSTALL_acceptances) — but not here: on view_4163 every record is
 *     already linked to this project by definition. Attribution lives on
 *     the unlinked-shipments queue page, so this tray offers none.
 *   • OMS_order status / SHIP_status are FREE TEXT from the OMS, not a
 *     closed vocabulary (Short Text on purpose — an unrecognized value
 *     would fail the API write). `tone()` keyword-matches what it knows and
 *     FALLS THROUGH to a neutral chip for anything it has never seen; the
 *     value is always shown verbatim.
 *   • "Missing in OMS" (sync state) means the Knack record's OMS order no
 *     longer resolves — deleted or renumbered upstream. It is surfaced, on
 *     the row AND on the tile line, never hidden.
 *   • STALE DATA IS WORSE THAN NO DATA. `SYS_last synced` blank or older
 *     than STALE_MS makes freshness the headline: the tile line says so
 *     and the drawer leads with it.
 *   • WE CANNOT SEE DELIVERY (2026-09-21). ShipEdge's terminal state is
 *     "shipped" — its order payload carries no delivered date and no ETA,
 *     and the Knack object exposes neither. So this tray says NOTHING
 *     about arrival: no delivered date, no ETA, no overdue, no "all
 *     delivered". A shipment is not shipped yet, or it shipped on a date
 *     with a carrier and a tracking number the PM can click. Claiming
 *     more would be inventing it. PHASING IT BACK IN: get a real
 *     delivery feed first (a ShipEdge webhook, carrier tracking, or
 *     parsed delivery mail), add the field, then restore the delivered /
 *     ETA branches here — the search for "delivery" in this file finds
 *     every place they belong.
 *
 * What a PM on this page needs: how many shipments there are and whether
 * they have gone out. So the tile line is a COUNT plus the last ship
 * date — never "in transit" or "out", which imply a location the OMS
 * never tells us. The drawer's rows lead with the ship date + carrier +
 * tracking link (the link is what knows where a parcel is), and
 * order administration (order no, date, ship-to, address, OMS link, sync
 * state) sits behind a per-row "Order details" disclosure.
 *
 * LIVE FIELD SET (view_4163, confirmed 2026-09-21): order no, oms order id,
 * oms url, source, sync state, last synced, order date, order status, ship
 * to name, ship status, carrier, tracking no, tracking url, ship date,
 * delivered date, address street/city/state/zip, CORE_projects,
 * INSTALL_acceptances. `SHIP_delivered date` exists on the object but is
 * NEVER POPULATED (ShipEdge has no delivery feed), and `SHIP_eta` /
 * `OMS_order total` are not on the view at all — so none of the three is
 * read here.
 *
 * FIELD KEYS ARE DISCOVERED, NOT HARDCODED (the object was built from a
 * spec; the Builder assigned the keys). `fields()` reads view_4163's
 * <thead> and maps each column by its HEADER TEXT — the same trick
 * bom-tray.js uses for the SKU column. A column the Builder hasn't exposed
 * simply doesn't render; nothing throws.
 *
 * Re-check shipments: POSTs SCW.CONFIG.MAKE_SHIPMENTS_RESYNC_WEBHOOK with
 * everything the page already knows, so the scenario can match OMS orders
 * without re-querying Knack first — the project, every SOW and acceptance
 * on the page (an order ties to a project directly OR through an accepted
 * proposal), and the shipment records we already hold (id + order no + OMS
 * order id + sync state), which is also the list the scenario diffs against
 * to decide what is new, what changed and what no longer resolves upstream.
 * Then it refetches view_4163 a few times (project rollups recalculate
 * LAZILY — never read one straight after a write; this tray reads the
 * shipment RECORDS, never a rollup).
 *
 * Entry points: a compact always-visible line on the Installation tile
 * (deploy-page-nav.js asks SCW.shipments.tileLine() while building the
 * tile, so the tile's innerHTML diff stays stable) and the deploy drawer
 * (SCW.deployNav.openPanel) behind it.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENES = [
    { sceneId: 'scene_1311', view: 'view_4163' }     // internal ops deploy page
  ];
  var STYLE_ID = 'scw-ships-css';
  var EVENT_NS = '.scwShipments';
  var STALE_MS = 24 * 60 * 60 * 1000;   // older than this and the facts are not trustworthy

  // Header text → logical field, most specific first. Matched against the
  // column header lowercased with non-alphanumerics collapsed to spaces
  // ("SHIP_order no" → "ship order no"). First match wins; a column is
  // consumed once. Confirmed against the live view_4163 headers
  // (field_3281…field_3305) on 2026-09-21 — but still matched by LABEL, so
  // a Builder reshuffle or a re-created field can't silently blank a row.
  //
  // ⚠️ DELIVERY IS DELIBERATELY NOT MAPPED. `SHIP_delivered date`,
  // `SHIP_eta` and `OMS_order total` have no feed behind them, so they are
  // absent from this map on purpose — not an oversight. Re-add the entry
  // (and the branches this file's header points at) once a real delivery
  // source exists.
  var FIELD_PATTERNS = [
    ['omsId',         /oms order id/],
    ['omsUrl',        /oms url/],
    ['orderNo',       /order no\b/],
    ['orderDate',     /order date/],
    ['orderStatus',   /order status/],
    ['orderTotal',    /order total/],
    ['shipToName',    /ship to name/],
    ['shipStatus',    /^ship status$|^ship status\b|shipment status/],
    ['carrier',       /carrier/],
    ['trackingUrl',   /tracking url/],
    ['trackingNo',    /tracking no/],
    ['shipDate',      /ship date/],
    ['source',        /source/],
    ['syncState',     /sync state/],
    ['lastSynced',    /last synced/],
    ['street',        /address street|^street/],
    ['city',          /address city|^city/],
    ['state',         /address state|^state/],
    ['zip',           /address zip|^zip|postal/],
    ['address',       /^ship address$|^address$/],
    ['acceptance',    /acceptance|proposal/],
    ['project',       /project/]
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      if (document.getElementById('kn-' + SCENES[i].sceneId) && document.getElementById(SCENES[i].view)) return SCENES[i];
    }
    return null;
  }
  function modelRecords(viewKey) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewKey] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }

  /** logical name → field key, read off view_4163's own column headers.
   *  Cached per header signature so a Builder change is picked up without
   *  a reload. */
  var _fieldCache = null, _fieldSig = '';
  function fields(cfg) {
    var ths = document.querySelectorAll('#' + cfg.view + ' thead th');
    if (!ths.length) return _fieldCache || {};
    var sig = '', cols = [];
    for (var i = 0; i < ths.length; i++) {
      var m = (ths[i].className || '').match(/\bfield_\d+\b/);
      if (!m) continue;
      var label = plain(ths[i].textContent).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      cols.push({ key: m[0], label: label });
      sig += m[0] + ':' + label + '|';
    }
    if (sig === _fieldSig && _fieldCache) return _fieldCache;
    var out = {}, used = {};
    for (var p = 0; p < FIELD_PATTERNS.length; p++) {
      var name = FIELD_PATTERNS[p][0], re = FIELD_PATTERNS[p][1];
      for (var c = 0; c < cols.length; c++) {
        if (used[cols[c].key] || !re.test(cols[c].label)) continue;
        out[name] = cols[c].key; used[cols[c].key] = true; break;
      }
    }
    _fieldSig = sig; _fieldCache = out;
    return out;
  }

  // ── Readers ────────────────────────────────────────────────────────
  function txtOf(rec, key) {
    if (!key || !rec) return '';
    var raw = rec[key + '_raw'];
    if (typeof raw === 'string' && raw) return plain(raw);
    if (Array.isArray(raw)) return raw.length && raw[0] ? plain(raw[0].identifier) : '';
    if (raw && typeof raw === 'object') {
      if (raw.identifier) return plain(raw.identifier);
      if (raw.url) return plain(raw.url);
      if (raw.date_formatted) return plain(raw.date_formatted);
    }
    if (raw != null && typeof raw !== 'object') return plain(raw);
    return plain(rec[key]);
  }
  function urlOf(rec, key) {
    if (!key || !rec) return '';
    var raw = rec[key + '_raw'];
    if (raw && typeof raw === 'object' && raw.url) return String(raw.url);
    if (typeof raw === 'string' && /^https?:/i.test(raw)) return raw;
    var m = String(rec[key] == null ? '' : rec[key]).match(/href="([^"]+)"/);
    if (m) return m[1];
    var t = plain(rec[key]);
    return /^https?:/i.test(t) ? t : '';
  }
  /** A Date, or null. Knack date fields arrive as an object (iso_timestamp
   *  / date / timestamp) or as formatted text. */
  function dateOf(rec, key) {
    if (!key || !rec) return null;
    var raw = rec[key + '_raw'], d = null;
    if (raw && typeof raw === 'object') {
      if (raw.iso_timestamp) d = new Date(raw.iso_timestamp);
      else if (raw.timestamp) d = new Date(raw.timestamp);
      else if (raw.date) d = new Date(raw.date + (raw.hours != null ? ' ' + raw.hours + ':' + (raw.minutes || '00') : ''));
    }
    if ((!d || isNaN(+d))) {
      var t = txtOf(rec, key);
      d = t ? new Date(t) : null;
    }
    return (d && !isNaN(+d)) ? d : null;
  }
  /** The ship-to address: one field when the Builder exposes one, else the
   *  four parts (street / city / state / zip) joined. */
  function addressOf(rec, F) {
    var one = txtOf(rec, F.address);
    if (one) return one;
    var street = txtOf(rec, F.street), city = txtOf(rec, F.city),
        st = txtOf(rec, F.state), zip = txtOf(rec, F.zip);
    var tail = [city, [st, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [street, tail].filter(Boolean).join(' · ');
  }
  function money(rec, key) {
    var t = txtOf(rec, key);
    if (!t) return '';
    return /^[-$]/.test(t) || /[0-9]/.test(t) === false ? t : (/[$]/.test(t) ? t : '$' + t);
  }

  // ── Dates ─────────────────────────────────────────────────────────
  function startOfDay(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  function fmtDay(d) {
    if (!d) return '';
    try { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
    catch (e) { return d.toDateString(); }
  }
  /** "3 hours ago" / "2 days ago" / "just now". */
  function ago(d, now) {
    if (!d) return '';
    var ms = now - d.getTime();
    if (ms < 0) return 'just now';
    var mins = Math.floor(ms / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' minutes ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hrs / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  // ── Status → tone. The OMS vocabulary is OPEN: anything unrecognized
  //    gets the neutral tone and is shown verbatim. ───────────────────
  function tone(status) {
    var s = String(status || '').toLowerCase();
    if (!s) return 'none';
    if (/exception|return|lost|damag|fail|cancel|void|hold/.test(s)) return 'warn';
    if (/transit|shipped|out for delivery|en route|dispatch/.test(s)) return 'go';
    if (/pending|process|await|backorder|prepar|label|new\b|open\b/.test(s)) return 'wait';
    return 'neutral';
  }
  function isMissing(sh)   { return /missing/i.test(sh.syncState || ''); }
  function isNoProject(sh) { return /no project/i.test(sh.syncState || ''); }
  function isUnlinked(sh)  { return /unlink/i.test(sh.syncState || ''); }

  // ── Model ─────────────────────────────────────────────────────────
  function shipments(cfg) {
    var F = fields(cfg), recs = modelRecords(cfg.view), out = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      out.push({
        id: r.id,
        orderNo:     txtOf(r, F.orderNo),
        omsId:       txtOf(r, F.omsId),
        omsUrl:      urlOf(r, F.omsUrl),
        orderDate:   dateOf(r, F.orderDate),
        orderStatus: txtOf(r, F.orderStatus),
        orderTotal:  money(r, F.orderTotal),
        shipToName:  txtOf(r, F.shipToName),
        address:     addressOf(r, F),
        shipStatus:  txtOf(r, F.shipStatus),
        carrier:     txtOf(r, F.carrier),
        trackingNo:  txtOf(r, F.trackingNo),
        trackingUrl: urlOf(r, F.trackingUrl),
        shipDate:    dateOf(r, F.shipDate),
        source:      txtOf(r, F.source),
        syncState:   txtOf(r, F.syncState),
        lastSynced:  dateOf(r, F.lastSynced),
        acceptance:  txtOf(r, F.acceptance)
      });
    }
    return out;
  }
  /** The one summary both the tile line and the drawer head read from. */
  function summarize(list, now) {
    var s = { total: list.length, shipped: 0, waiting: 0,
              missing: 0, noProject: 0, lastShipped: null,
              newest: null, oldest: null, stale: false, neverSynced: 0 };
    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      // Shipped or not. That is the whole vocabulary until a delivery
      // feed exists — see the header.
      sh.shipped = !!sh.shipDate || tone(sh.shipStatus) === 'go';
      if (sh.shipped) s.shipped++; else s.waiting++;
      if (isMissing(sh)) s.missing++;
      if (isNoProject(sh) || isUnlinked(sh)) s.noProject++;
      if (sh.shipDate && (!s.lastShipped || sh.shipDate > s.lastShipped)) s.lastShipped = sh.shipDate;
      if (!sh.lastSynced) s.neverSynced++;
      else {
        if (!s.newest || sh.lastSynced > s.newest) s.newest = sh.lastSynced;
        if (!s.oldest || sh.lastSynced < s.oldest) s.oldest = sh.lastSynced;
      }
    }
    // Stale = nothing has a sync stamp, or the OLDEST stamp is past the
    // window. Freshness is judged by the worst record, not the best.
    s.stale = list.length > 0 && (!s.oldest || (now - s.oldest.getTime()) > STALE_MS);
    // Two different numbers, and mixing them up is how a stale set ends up
    // reading as fresh: `syncedText` is the MOST RECENT sync (a fact about
    // the best record), `staleText` the OLDEST (the record that makes the
    // set untrustworthy). Anything that reports staleness quotes the
    // oldest.
    s.syncedText = s.newest ? ago(s.newest, now) : '';
    s.staleText  = s.oldest ? ago(s.oldest, now) : '';
    return s;
  }

  // ── The compact tile line (always visible on the Installation tile) ──
  /** Returns an HTML string deploy-page-nav folds into the tile, or ''.
   *  Leads with what a PM acts on: a warning state, else a plain count
   *  plus the last ship date. Staleness OVERRIDES the headline — a stale
   *  status must not read as fact. Nothing here speaks to WHERE anything
   *  is: no "in transit", no "out", no arrival. We cannot see any of it;
   *  the tracking link can. */
  function tileLine() {
    var cfg = activeScene();
    if (!cfg) return '';
    injectStyles();
    var list = shipments(cfg);
    var now = Date.now();
    var s = summarize(list, now);
    var cls = 'neutral', text;
    if (!list.length) {
      // No records: could be "none ordered yet", which is not a problem.
      text = 'No shipments on this project yet';
      cls = 'none';
    } else if (s.stale) {
      cls = 'warn';
      text = s.total + (s.total === 1 ? ' shipment' : ' shipments') + ' · ' +
        (s.neverSynced === s.total ? 'never synced'
                                   : 'not synced since ' + s.staleText) +
        ' — status may be out of date';
    } else if (s.missing) {
      cls = 'warn';
      text = s.missing + (s.missing === 1 ? ' order missing in the OMS' : ' orders missing in the OMS');
    } else if (s.shipped) {
      cls = 'go';
      // A COUNT and a DATE — nothing about where a parcel is. "In transit"
      // / "out" both imply a location we cannot see: all we know is that
      // this many shipments exist and when the last one left.
      text = s.total + (s.total === 1 ? ' shipment' : ' shipments') +
        (s.waiting ? ' · ' + s.waiting + ' not shipped yet' : '') +
        (s.lastShipped ? ' · last shipped ' + fmtDay(s.lastShipped) : '');
    } else {
      cls = 'wait';
      text = s.total + (s.total === 1 ? ' shipment' : ' shipments') + ' · none shipped yet';
    }
    return '<button type="button" class="scw-ships-line" data-scw-tile-ships="1" ' +
        'aria-label="Shipments: ' + esc(text) + '">' +
      '<span class="scw-ships-dot scw-ships-dot--' + cls + '"></span>' +
      '<span class="scw-ships-text">' + esc(text) + '</span>' +
      '<span class="scw-ships-chev">Shipments ›</span>' +
    '</button>';
  }

  // ── Styles ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Tile line */
      '.scw-ships-line { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 0 0; border: 0; background: none; cursor: pointer; text-align: left; font: 12px/1.35 system-ui, -apple-system, sans-serif; color: #475569; }',
      '.scw-ships-line:hover .scw-ships-text { color: #0f172a; }',
      '.scw-ships-line:hover .scw-ships-chev { text-decoration: underline; }',
      '.scw-ships-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }',
      '.scw-ships-dot--ok { background: #22c55e; }',
      '.scw-ships-dot--go { background: #3b82f6; }',
      '.scw-ships-dot--warn { background: #e11d48; }',
      '.scw-ships-dot--wait { background: #f59e0b; }',
      '.scw-ships-dot--none, .scw-ships-dot--neutral { background: #cbd5e1; }',
      '.scw-ships-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-ships-chev { flex: none; font-weight: 600; color: #0f4c81; }',
      /* Drawer */
      '.scw-ships { font: 13px/1.45 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.scw-ships__bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 4px 0 12px; border-bottom: 1px solid #e2e8f0; }',
      '.scw-ships__freshness { font-size: 12.5px; color: #475569; }',
      '.scw-ships__freshness b { color: #0f172a; }',
      '.scw-ships__freshness.is-stale { color: #92400e; }',
      '.scw-ships__spring { flex: 1 1 auto; }',
      '.scw-ships__resync { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #0f172a; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-ships__resync:hover { background: #f1f5f9; }',
      '.scw-ships__resync[disabled] { opacity: .6; cursor: default; }',
      '.scw-ships__resync.is-err { border-color: #fca5a5; color: #b91c1c; }',
      '.scw-ships__resync.is-done { border-color: #86efac; color: #15803d; }',
      '.scw-ships__stalebanner { margin: 12px 0 0; padding: 10px 12px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 8px; color: #92400e; font-size: 12.5px; }',
      '.scw-ships__counts { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 0 4px; font-size: 12.5px; color: #475569; }',
      '.scw-ships__counts b { color: #0f172a; font-size: 15px; font-weight: 800; display: block; }',
      '.scw-ships__count--warn b { color: #b91c1c; }',
      '.scw-ships__list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }',
      '.scw-ships__card { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 12px 14px; }',
      '.scw-ships__card.is-warnsync { border-color: #fcd34d; background: #fffdf7; }',
      '.scw-ships__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.scw-ships__chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font: 700 11px/1.5 system-ui, sans-serif; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; }',
      '.scw-ships__chip--ok { border-color: #86efac; background: #dcfce7; color: #15803d; }',
      '.scw-ships__chip--go { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }',
      '.scw-ships__chip--warn { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }',
      '.scw-ships__chip--wait { border-color: #fde68a; background: #fffbeb; color: #92400e; }',
      '.scw-ships__order { font-weight: 700; }',
      '.scw-ships__when { margin-top: 7px; font-size: 13px; }',
      '.scw-ships__when b { font-weight: 700; }',
      '.scw-ships__when .is-stale { color: #92400e; }',
      '.scw-ships__meta { margin-top: 4px; color: #475569; font-size: 12.5px; }',
      '.scw-ships__meta a { color: #0f4c81; font-weight: 600; }',
      '.scw-ships__more { margin-top: 8px; }',
      '.scw-ships__more summary { cursor: pointer; font: 600 11.5px/1.2 system-ui, sans-serif; color: #64748b; list-style: none; }',
      '.scw-ships__more summary::-webkit-details-marker { display: none; }',
      '.scw-ships__more summary:hover { color: #0f172a; }',
      '.scw-ships__more[open] summary { margin-bottom: 8px; }',
      '.scw-ships__dl { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 12.5px; }',
      '.scw-ships__dl dt { color: #64748b; }',
      '.scw-ships__dl dd { margin: 0; color: #0f172a; }',
      '.scw-ships__empty { padding: 20px 0; color: #64748b; }',
      '.scw-ships__note { margin-top: 14px; font-size: 12px; color: #94a3b8; }'
    ].join('\n');
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Re-check (resync) ──────────────────────────────────────────────
  function projectId() {
    var m = (window.location.hash || '')
      .match(/(?:project-dashboard|deployment-dashboard|deploy)\/([0-9a-f]{24})/i);
    return m ? m[1] : '';
  }
  // The page's other grids, read for the resync payload. Rows are records:
  // SOWs on view_4161 ("All Associated SOWs") and acceptances on view_3914
  // ("ACCEPTANCE", whose proposal connection names the accepted proposal).
  // Field keys are the ones acceptance-card.js already uses; every read
  // falls back so a missing column costs a label, never the payload.
  // Acceptance grids on the deploy scene. BOTH are read: which one
  // projects the published-proposal connection is a Builder decision.
  var SOW_VIEW = 'view_4161', ACPT_VIEW = 'view_3914', ACPT_VIEW_2 = 'view_4157';
  var SOW_ID_FIELD = 'field_2122';        // SOW ID ("1347")
  var ACPT_PROPOSAL = 'field_2755';       // REL_SOW_published proposal
  var ACPT_SIGNED = 'field_2766';         // FLAG_agreement signed
  function rowsOf(viewKey, map) {
    var recs = modelRecords(viewKey), out = [];
    for (var i = 0; i < recs.length; i++) {
      if (!recs[i] || !recs[i].id) continue;
      out.push(map(recs[i]));
    }
    return out;
  }
  // ── OMS reference numbers ─────────────────────────────────────────
  // ShipEdge carries the linkage in the ORDER'S REFERENCE, shaped
  //   <project no>-SW<sow no> | <quote no>
  //   e.g. "62489857827-SW1454 | 20260910-11567"
  // which is exactly the published proposal's identifier. That matters
  // because ShipEdge's Orders API has NO contains / LIKE / keyword filter
  // on reference_number — only an exact lookup
  // (GET /apirest/v4/oms/orders/{ref}?identify_by=order_reference) or a
  // date-windowed list you filter yourself. So the page CONSTRUCTS every
  // reference an order for this project could carry and ships them, and
  // the scenario can hit the exact endpoint per reference instead of
  // paging the whole order history.
  //
  // Both forms travel, because an order may or may not have a quote
  // behind it (a shipment with a project and no proposal is a normal
  // state): `reference` is the full string when a quote is known, and
  // `sowRef` is the left side alone. `projectNo` rides at the top level
  // as the one token every reference for this project shares — the
  // needle for a client-side contains pass over a date-windowed list,
  // which is the only way to catch an order somebody typed by hand.
  // The full reference, anywhere it appears in a longer string. The left
  // side is the SOW id (<project no>-SW<sow no>, the shape field_2122
  // carries); the right is the proposal / quote number.
  var REF_FULL_RE = /(\d{4,}-SW\d+[A-Za-z]*)\s*\|\s*([A-Za-z0-9][\w.\/-]*)/;
  /** "62489857827-SW1454 | 20260910-11567" → its parts. Accepts the left
   *  side alone ("62489857827-SW1454"), which is what the SOW ID field
   *  carries. Returns null for anything that isn't reference-shaped. */
  function parseReference(v) {
    var raw = plain(v);
    if (!raw) return null;
    var bar = raw.split('|');
    var left = plain(bar[0]);
    var quote = bar.length > 1 ? plain(bar.slice(1).join('|')) : '';
    if (!left) return null;
    var segs = left.split('-');
    var sow = segs.length > 1 ? plain(segs[segs.length - 1]) : '';
    var projectNo = segs.length > 1 ? plain(segs.slice(0, -1).join('-')) : '';
    // A bare SOW number with no project prefix is not a reference.
    if (!sow || !projectNo) return null;
    return {
      reference: left + (quote ? ' | ' + quote : ''),
      sowRef: left,
      projectNo: projectNo,
      sow: sow,
      quote: quote
    };
  }
  /** The reference on ONE record. The named connection first, then a
   *  scan of every other field for the shape.
   *
   *  Why scan: the string is the PUBLISHED PROPOSAL's identifier, and
   *  which connection projects it onto a given grid is a Builder
   *  decision — on a live project the acceptance's own
   *  REL_SOW_published proposal (field_2755) rendered EMPTY while the
   *  same string sat on a neighbouring field. Reading one hardcoded key
   *  silently produced a quote-less reference, which is exactly the bug
   *  this shape scan removes. A record with the string nowhere yields
   *  the left side alone (or nothing), never a guess. */
  function referenceOnRecord(rec, preferKey) {
    var direct = parseReference(txtOf(rec, preferKey));
    if (direct && direct.quote) return direct;
    for (var k in rec) {
      if (!/^field_\d+$/.test(k)) continue;
      var v = txtOf(rec, k);
      if (!v || v.indexOf('|') === -1) continue;
      var m = v.match(REF_FULL_RE);
      if (!m) continue;
      var p = parseReference(m[0]);
      if (p && p.quote) return p;
    }
    return direct;
  }
  /** Every reference an OMS order for this project could carry, built
   *  from the acceptances (which know the quote) and the SOWs (which do
   *  not), deduped on the full string. */
  function buildReferences(cfg) {
    var out = [], seen = {};
    function add(parsed, extra) {
      if (!parsed || seen[parsed.reference]) return;
      seen[parsed.reference] = true;
      var row = {
        reference: parsed.reference, sowRef: parsed.sowRef,
        projectNo: parsed.projectNo, sow: parsed.sow, quote: parsed.quote
      };
      for (var k in extra) row[k] = extra[k];
      out.push(row);
    }
    // Acceptances first — the published proposal's identifier IS the
    // full shape, "<SOW id> | <proposal no>", and it should sit on every
    // accepted acceptance.
    var acptSeen = {};
    var acptViews = [ACPT_VIEW, ACPT_VIEW_2];
    for (var v = 0; v < acptViews.length; v++) {
      var acpts = modelRecords(acptViews[v]);
      for (var a = 0; a < acpts.length; a++) {
        if (acptSeen[acpts[a].id]) continue;    // the two grids overlap
        acptSeen[acpts[a].id] = true;
        add(referenceOnRecord(acpts[a], ACPT_PROPOSAL),
            { acceptanceId: acpts[a].id, signed: /^yes$/i.test(txtOf(acpts[a], ACPT_SIGNED)) });
      }
    }
    // Then the SOWs. A SOW row may carry the full string too (its
    // proposal-basis connection), so scan before falling back to the SOW
    // id's left-side-only form.
    var sows = modelRecords(SOW_VIEW);
    for (var i = 0; i < sows.length; i++) {
      add(referenceOnRecord(sows[i], SOW_ID_FIELD), { sowRecordId: sows[i].id });
    }
    return out;
  }
  /** Everything the page already knows, handed to the scenario so it can
   *  match OMS orders without re-querying Knack. */
  function resyncPayload(cfg) {
    var list = shipments(cfg);
    var refs = buildReferences(cfg);
    return {
      project_recordID: projectId(),
      source: 'deploy-page',
      requestedAt: new Date().toISOString(),
      // The one token every reference for this project shares — the
      // needle for a contains pass when an exact lookup can't be used.
      projectNo: refs.length ? refs[0].projectNo : '',
      // Exact-match candidates for ShipEdge's order_reference lookup.
      references: refs,
      // True when NOT ONE reference carries a proposal number. Every
      // accepted acceptance should have one, so this means the published
      // proposal isn't linked (or isn't on these grids) — the scenario
      // can only fall back to the date-windowed contains pass, and
      // should say so rather than reporting a clean run.
      referencesMissingQuote: refs.length > 0 && !refs.some(function (r) { return !!r.quote; }),
      // An order ties to a project directly, or through an accepted
      // proposal — ship both sides of the match.
      sows: rowsOf(SOW_VIEW, function (r) {
        return { id: r.id, sowId: txtOf(r, SOW_ID_FIELD) };
      }),
      acceptances: rowsOf(ACPT_VIEW, function (r) {
        return {
          id: r.id,
          proposal: txtOf(r, ACPT_PROPOSAL),
          signed: /^yes$/i.test(txtOf(r, ACPT_SIGNED))
        };
      }),
      // What we already hold: the scenario diffs against this to decide
      // what is new, what changed, and what no longer resolves upstream.
      shipments: list.map(function (sh) {
        return {
          id: sh.id,
          orderNo: sh.orderNo,
          omsOrderId: sh.omsId,
          syncState: sh.syncState,
          lastSynced: sh.lastSynced ? sh.lastSynced.toISOString() : ''
        };
      })
    };
  }
  function webhookUrl() {
    var c = (window.SCW && SCW.CONFIG) || {};
    var u = c.MAKE_SHIPMENTS_RESYNC_WEBHOOK || '';
    return /^https?:\/\//i.test(u) && !/PLACEHOLDER/i.test(u) ? u : '';
  }
  /** One lenient POST — any 2xx without an explicit success:false counts,
   *  and so does a CORS-opaque status 0 (the webhook landed). Same rule
   *  regenerate-closeout-docs.js uses. */
  function postWebhook(url, payload, cb) {
    $.ajax({
      url: url, type: 'POST', contentType: 'application/json',
      data: JSON.stringify(payload), crossDomain: true, timeout: 120000
    }).done(function (resp) {
      var data = resp;
      if (typeof resp === 'string') { try { data = JSON.parse(resp); } catch (e) { data = null; } }
      cb(!data || data.success !== false);
    }).fail(function (xhr) {
      cb(!!(xhr && (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))));
    });
  }
  /** Refetch the shipments view and repaint. The reconcile job runs on
   *  Make's clock, so poll a few times rather than once. Project rollups
   *  recalculate lazily — this reads the shipment RECORDS, never a rollup. */
  function refetchAndRepaint(cfg, el) {
    var tries = [1500, 6000, 15000];
    for (var i = 0; i < tries.length; i++) {
      (function (delay) {
        setTimeout(function () {
          try {
            var v = Knack.views[cfg.view];
            if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
          } catch (e) { /* best-effort */ }
          setTimeout(function () { repaint(el); }, 600);
        }, delay);
      })(tries[i]);
    }
  }
  function onResync(cfg, btn, el) {
    var url = webhookUrl();
    if (!url) {
      btn.classList.add('is-err');
      btn.textContent = 'Re-check not configured';
      setTimeout(function () { resetResync(btn); }, 5000);
      return;
    }
    var payload = resyncPayload(cfg);
    if (!payload.project_recordID) {
      btn.classList.add('is-err');
      btn.textContent = 'No project id in the URL';
      setTimeout(function () { resetResync(btn); }, 5000);
      return;
    }
    btn.disabled = true;
    btn.classList.remove('is-err', 'is-done');
    btn.textContent = 'Re-checking…';
    if (window.SCW && SCW.debug) SCW.debug('[scw-ships] resync payload', payload);
    postWebhook(url, payload, function (ok) {
      btn.disabled = false;
      if (!ok) {
        btn.classList.add('is-err');
        btn.textContent = 'Re-check failed — retry';
        setTimeout(function () { resetResync(btn); }, 6000);
        return;
      }
      btn.classList.add('is-done');
      btn.textContent = 'Re-check requested';
      setTimeout(function () { resetResync(btn); }, 6000);
      refetchAndRepaint(cfg, el);
    });
  }
  function resetResync(btn) {
    btn.classList.remove('is-err', 'is-done');
    btn.disabled = false;
    btn.textContent = 'Re-check shipments';
  }

  // ── Drawer ────────────────────────────────────────────────────────
  function cardHtml(sh, stale, now) {
    var t = tone(sh.shipStatus || sh.orderStatus);
    var cls = 'scw-ships__card' +
              ((isMissing(sh) || isNoProject(sh) || isUnlinked(sh)) ? ' is-warnsync' : '');
    var chips = '';
    if (sh.shipStatus) chips += '<span class="scw-ships__chip scw-ships__chip--' + t + '">' + esc(sh.shipStatus) + '</span>';
    else if (sh.orderStatus) chips += '<span class="scw-ships__chip scw-ships__chip--' + tone(sh.orderStatus) + '">' + esc(sh.orderStatus) + '</span>';
    // Sync state: "Missing in OMS" is a real warning — surface it (rule 4).
    if (isMissing(sh)) chips += '<span class="scw-ships__chip scw-ships__chip--warn" title="The OMS order this record mirrors no longer resolves — deleted or renumbered upstream.">Missing in OMS</span>';
    else if (isNoProject(sh) || isUnlinked(sh)) chips += '<span class="scw-ships__chip scw-ships__chip--wait">' + esc(sh.syncState) + '</span>';

    // Lead with the last thing we actually know. There is no arrival
    // date to lead with — see the header.
    var when;
    if (sh.shipDate) {
      when = 'Shipped <b>' + esc(fmtDay(sh.shipDate)) + '</b>' +
        (stale ? ' <span class="is-stale">(as of the last sync)</span>' : '');
    } else if (sh.shipped) {
      when = 'Shipped';
    } else {
      when = 'Not shipped yet';
    }

    var track = [];
    if (sh.carrier) track.push(esc(sh.carrier));
    if (sh.trackingNo) {
      track.push(sh.trackingUrl
        ? '<a href="' + esc(sh.trackingUrl) + '" target="_blank" rel="noopener">' + esc(sh.trackingNo) + ' ›</a>'
        : esc(sh.trackingNo));
    }

    var rows = '';
    function row(label, value) { if (value) rows += '<dt>' + esc(label) + '</dt><dd>' + value + '</dd>'; }
    row('Order no', esc(sh.orderNo));
    row('Order date', esc(fmtDay(sh.orderDate)));
    row('Order status', esc(sh.orderStatus));
    row('Order total', esc(sh.orderTotal));
    row('Ship to', esc(sh.shipToName));
    row('Address', esc(sh.address));
    row('Acceptance', esc(sh.acceptance));
    row('Source', esc(sh.source));
    row('Sync state', esc(sh.syncState));
    row('Last synced', sh.lastSynced ? esc(ago(sh.lastSynced, now)) : '<span class="is-stale">never</span>');
    if (sh.omsUrl) row('In the OMS', '<a href="' + esc(sh.omsUrl) + '" target="_blank" rel="noopener">Open order ›</a>');

    return '<div class="' + cls + '">' +
      '<div class="scw-ships__head">' +
        '<span class="scw-ships__order">' + esc(sh.orderNo || sh.omsId || 'Shipment') + '</span>' + chips +
      '</div>' +
      '<div class="scw-ships__when">' + when + '</div>' +
      (track.length ? '<div class="scw-ships__meta">' + track.join(' · ') + '</div>' : '') +
      (rows ? '<details class="scw-ships__more"><summary>Order details</summary>' +
                '<dl class="scw-ships__dl">' + rows + '</dl></details>' : '') +
    '</div>';
  }

  function paint(el, cfg) {
    var list = shipments(cfg), now = Date.now();
    var s = summarize(list, now);
    // A sync warning first, then what hasn't gone out, then the most
    // recently shipped.
    list.sort(function (a, b) {
      var aw = (isMissing(a) || isNoProject(a) || isUnlinked(a)) ? 0 : 1;
      var bw = (isMissing(b) || isNoProject(b) || isUnlinked(b)) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      if (a.shipped !== b.shipped) return a.shipped ? 1 : -1;
      var ad = a.shipDate ? a.shipDate.getTime() : 0, bd = b.shipDate ? b.shipDate.getTime() : 0;
      if (ad !== bd) return bd - ad;
      return String(a.orderNo).localeCompare(String(b.orderNo), undefined, { numeric: true });
    });
    // Fresh: the most recent sync. Stale: the OLDEST, because that is the
    // record making the set untrustworthy.
    var fresh = !s.total
      ? 'No shipments on this project yet'
      : (!s.newest
          ? 'Never synced'
          : (s.stale
              ? 'Oldest sync <b>' + esc(s.staleText) + '</b> · newest ' + esc(s.syncedText) +
                (s.neverSynced ? ' · ' + s.neverSynced + ' never synced' : '')
              : 'Last synced <b>' + esc(s.syncedText) + '</b>' +
                (s.neverSynced ? ' · ' + s.neverSynced + ' never synced' : '')));
    var html =
      '<div class="scw-ships__bar">' +
        '<span class="scw-ships__freshness' + (s.stale ? ' is-stale' : '') + '">' + fresh + '</span>' +
        '<span class="scw-ships__spring"></span>' +
        '<button type="button" class="scw-ships__resync" data-scw-ships-resync="1">Re-check shipments</button>' +
      '</div>';
    if (s.stale && s.total) {
      html += '<div class="scw-ships__stalebanner">These figures come from the last sync, not from the OMS right now. ' +
        'Treat the statuses and ETAs below as last known, and re-check before you rely on them.</div>';
    }
    if (!s.total) {
      html += '<div class="scw-ships__empty">Nothing has been ordered for this project yet, or an order exists in the OMS ' +
        'that nobody has attributed to this project. Re-check shipments pulls the latest from the OMS.</div>';
    } else {
      html += '<div class="scw-ships__counts">' +
        '<span><b>' + s.total + '</b>' + (s.total === 1 ? 'shipment' : 'shipments') + '</span>' +
        '<span><b>' + s.shipped + '</b>shipped</span>' +
        '<span><b>' + s.waiting + '</b>not shipped</span>' +
        (s.missing ? '<span class="scw-ships__count--warn"><b>' + s.missing + '</b>missing in OMS</span>' : '') +
      '</div>';
      var cards = '';
      for (var i = 0; i < list.length; i++) cards += cardHtml(list[i], s.stale, now);
      html += '<div class="scw-ships__list">' + cards + '</div>';
      html += '<div class="scw-ships__note">Delivery is not tracked yet: the OMS stops at "shipped", so ' +
        'there is no arrival date here. Use the tracking link for where a parcel actually is.</div>';
      html += '<div class="scw-ships__note">Order facts come from the OMS and are read-only here — ' +
        'a change typed in Knack is overwritten by the next sync. Attribution (which project an order belongs to) ' +
        'lives on the unlinked-shipments queue.</div>';
    }
    el.innerHTML = html;
  }
  function repaint(el) {
    var cfg = activeScene();
    if (!cfg || !el || !el.parentNode) return;
    paint(el, cfg);
  }
  function render(cfg) {
    var el = document.createElement('div');
    el.className = 'scw-ships';
    paint(el, cfg);
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-scw-ships-resync]');
      if (!b) return;
      e.preventDefault();
      onResync(cfg, b, el);
    });
    return el;
  }
  function open() {
    var cfg = activeScene();
    if (!cfg) return false;
    var api = window.SCW && SCW.deployNav;
    if (!api || typeof api.openPanel !== 'function') return false;
    injectStyles();
    // One tray at a time: drop anything an earlier open left behind.
    var stale = document.querySelectorAll('.scw-ships');
    for (var i = 0; i < stale.length; i++) if (stale[i].parentNode) stale[i].parentNode.removeChild(stale[i]);
    return api.openPanel({
      eyebrow: '3 · Installation',
      title: 'Shipments',
      sub: 'Orders mirrored from the OMS — how many, and what has gone out',
      el: render(cfg)
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  // Styles at load so the tile line never paints unstyled (same rule the
  // rest of the deploy page follows).
  injectStyles();
  var _timer = null;
  function schedule(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      if (!activeScene()) return;
      injectStyles();
      // The tile's line is built by deploy-page-nav (it owns the tile's
      // innerHTML diff) — nudge it to re-read us when the model changes.
      var open = document.querySelector('.scw-ships');
      if (open) repaint(open);
    }, delay == null ? 200 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { schedule(300); });
    $(document).on('knack-view-render.' + SCENES[s].view + EVENT_NS, function () { schedule(200); });
  }

  window.SCW = window.SCW || {};
  window.SCW.shipments = {
    open: open,
    tileLine: tileLine,
    /** Test seams / other modules. */
    shipments: function () { var c = activeScene(); return c ? shipments(c) : []; },
    summarize: summarize,
    resyncPayload: function () { var c = activeScene(); return c ? resyncPayload(c) : null; },
    parseReference: parseReference,
    fields: function () { var c = activeScene(); return c ? fields(c) : {}; },
    tone: tone
  };
})();
/*** END SHIPMENTS ***********************************************************/
