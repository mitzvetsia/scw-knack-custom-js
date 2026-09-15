/*** FEATURE: Acceptance summary card (view_3914 / view_4066) **************
 *
 * Replaces the raw INSTALL_acceptance table on the deploy scenes with clean
 * cards — ONE PER RECORD (2026-07-17: a project accrues an acceptance per
 * signed agreement — the base proposal plus each change order — so the old
 * first-row-only render hid every CO acceptance). Each card: the proposal as
 * the title, Yes/No flags as status pills, and the document links + the
 * "Create Questionnaire" action rendered as buttons. The native table is
 * hidden (kept in the DOM); the questionnaire button proxies its row's
 * original action link so Knack's handler still fires. File tiles do NOT
 * proxy to Knack's asset viewer — clicking anywhere on one opens the
 * card's own uploader modal (current file + replace + greenlight check),
 * and the editors PUT against their own row's record id.
 *
 * Columns:
 *   field_2755  REL proposal (connection link)        → title
 *   field_2765  FLAG_initial payment received (Yes/No) → pill
 *   field_2766  FLAG_agreement signed (Yes/No)         → pill
 *   field_1847  Xero Equipment Invoice Link (URL)      → button
 *   field_2767  SYS_signed agreement (file)            → button
 *   field_2947  SYS_bid basis pdf (file)               → button
 *   field_2948  SYS_xero estimate link (URL)           → button
 *   .kn-action-link "Create Questionnaire"             → primary button
 *
 * Document slots (agreement / bid-basis PDF / Xero invoice / Xero
 * estimate) turn GREEN once populated — the card doubles as a
 * completeness checklist. All four are editable in place: URL modal for
 * the links, file picker + Knack asset upload for the PDFs.
 *
 * COLUMN GUARD: the ops card only takes over a view whose table actually
 * has the proposal column (th.field_2755) — otherwise the native table
 * stays visible untouched.
 *
 * SUB VARIANT (view_4066, 2026-09-14 — reverses the 2026-08-12 "hide it
 * outright" call): the subcontractor dashboard shows a READ-ONLY card with
 * exactly three things, because that is what a sub needs to see and all a
 * sub is entitled to see:
 *   1. the bid this SOW is priced from  (basis name + the bid PDF)
 *   2. that bid's total                 (see BID TOTAL below)
 *   3. approved-for-terms / initial-payment + agreement-signed pills
 * Nothing else renders: no Xero invoice or estimate links, no eSignatures
 * reference, no uploaders/editors, no greenlight check, no questionnaire
 * button. The native grid is hidden for sub views unconditionally, so a
 * failed guard can never leak the raw table to a sub.
 *
 * BID TOTAL — two sources, in order:
 *   a) F.bidTotal — a currency field on the acceptance record itself.
 *      PREFERRED: one number, nothing else rides along. ⚠ Builder TBD.
 *   b) the SOW's field_2941 sub-bid snapshot, if a snapshot-shaped blob is
 *      exposed on the row (any column — we scan for it). Only basisTotal
 *      and basisBidName are read. ⚠ EXPOSURE: that blob ALSO carries the
 *      diff (exceptions[].sowFee = SCW-side money) and diffHtml, and a sub
 *      can read the whole thing out of the page regardless of what this
 *      code touches. Prefer (a); don't put field_2941 on a sub view unless
 *      you've accepted that.
 * Neither available → the total line is omitted (fail open, no error).
 ****************************************************************************/
(function () {
  'use strict';

  var VIEWS    = ['view_3914', 'view_4066'];
  // Sub-facing views get the read-only variant (see SUB VARIANT above).
  var SUB_VIEWS = { view_4066: 1 };   // subcontractor deployment dashboard
  var STYLE_ID = 'scw-acpt-css';
  var EVENT_NS = '.scwAcceptanceCard';
  var F = {
    proposal:  'field_2755',
    payment:   'field_2765',
    signed:    'field_2766',
    terms:     'field_2940',   // FLAG_approved for terms (Yes/No)
    xero:      'field_1847',
    agreement: 'field_2767',
    bidPdf:    'field_2947',   // SYS_bid basis pdf (file) — "Matching Bid"
    xeroEst:   'field_2948',   // SYS_xero estimate link (URL)
    contract:  'field_1843',   // esignatures.com contract id (uuid)
    // ── Sub card only ────────────────────────────────────────────
    // Bid total on the acceptance record. Optional: a currency field, so
    // the card doesn't have to total the snapshot itself. Blank = derive
    // it from the snapshot below.
    bidTotal:  '',
    // SYS_bid basis json snapshot — the acceptance's own copy of whatever
    // priced it. Two shapes arrive here and both are handled:
    //   · base scope — the SOW's sub-bid diff blob (basisBidName +
    //     basisTotal, or the "Sub Bid Total" inside bidHtml)
    //   · change order — the CO sub-pricing snapshot Make stored when the
    //     CO went to the sub: { sentAt, sentBy, lines{ id: {qty, subBid,
    //     action, …} } }. Its total is Σ(qty × subBid) — field_2150 is
    //     PER-UNIT and a Remove line carries negative qty, so a CO total
    //     is signed (a net credit reads negative). Same formula the
    //     send-to-sub document uses (co-stage-strip buildRequestDoc).
    // Blank = auto-detect any column that parses into either shape.
    snapshot:  'field_2946',
    // ── Ops: the frozen bid, carried on the PROPOSAL ─────────────
    // These come through the proposal connection (field_2755-field_29xx)
    // and are the STRONGEST source there is — the bid document as it was
    // when the proposal was published, not a live sum.
    bidBasis:  'field_2960',   // SYS_bid basis — the bid's number ("183")
    bidDoc:    'field_2944',   // SYS_bid snapshot HTML — carries Grand Total
    bidDiff:   'field_2943',   // SYS_bid snapshot with diff — OPS ONLY
    po:        'field_1343',   // PO# — OPS ONLY
    // ── Ops: what the CLIENT is billed ───────────────────────────
    // The bid total above is what SCW PAYS the sub. These are what SCW
    // BILLS, as stored on the published proposal — so the row shows both
    // sides of the deal. OPS ONLY: never render these on a sub surface.
    // ⚠ Builder: expose them on a view as connected columns through
    // field_2755 (same as field_2943/2944/2960 already are) and the billed
    // block fills itself in. Absent, no block renders — nothing breaks.
    pubEquip:   'field_2669',  // TOTALS_equipment total
    pubInstall: 'field_2668',  // TOTALS_install total
    pubGrand:   'field_2670',  // TOTALS_project total (authoritative)
    // REL_scope of work — the SOW this acceptance's proposal belongs
    // to, which is how the survey cost finds its row. sowRefOf falls
    // back to DISCOVERING the column (the connection whose value is this
    // row's own SOW) if this key ever moves.
    sow:        'field_2666'
  };

  // eSignatures contract page — the id in field_1843 appended verbatim.
  // Display-only reference (Make writes the id); when the column isn't on
  // the view or the cell is blank, no tile renders.
  var ESIGN_URL_PREFIX = 'https://esignatures.com/contracts/';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function cellText(row, fk) {
    var td = row.querySelector('td.' + fk);
    return td ? td.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function cellAnchor(row, fk, sel) {
    var td = row.querySelector('td.' + fk);
    return td ? td.querySelector(sel || 'a[href]') : null;
  }
  function isYes(v) { return /^(yes|true)$/i.test(String(v || '').trim()); }
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    var neg = v < 0, p = Math.abs(v).toFixed(2).split('.');
    return (neg ? '-$' : '$') +
      p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + p[1];
  }
  /** A number out of a displayed currency cell ("$10,150.00" → 10150).
   *  Returns null for blank/unparseable so callers can fall through. */
  function numFromText(s) {
    var t = String(s == null ? '' : s).replace(/[^0-9.\-]/g, '');
    if (t === '' || t === '-' || t === '.') return null;
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  /** This row's Knack model attributes — the verbatim stored values. The
   *  sub-bid snapshot embeds bidHtml/diffHtml, which Knack renders as real
   *  elements in the cell, so DOM textContent strips the tags and corrupts
   *  the JSON (same trap ops-stepper.js documents). The model holds it
   *  exactly as it was PUT. */
  function rowAttrs(viewKey, recId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return null;
      for (var i = 0; i < models.length; i++) {
        if (models[i] && models[i].id === recId) return models[i].attributes;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  /** Tolerant JSON parse: direct, then entity-decoded, then tag-stripped. */
  function parseLooseJson(s) {
    if (s == null) return null;
    var t = String(s).trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.innerHTML = t;
      return JSON.parse(ta.value.trim());
    } catch (e) {}
    try { return JSON.parse(t.replace(/<[^>]*>/g, '').trim()); } catch (e) {}
    return null;
  }
  /** Either snapshot shape: the SOW sub-bid diff blob, or a CO
   *  sub-pricing snapshot (a `lines` map keyed by record id). */
  function isSnapshot(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    return ('basisBidId' in o || 'basisBidName' in o) ||
      !!(o.lines && typeof o.lines === 'object' && !Array.isArray(o.lines));
  }
  /** A change-order pricing snapshot (vs. a base-scope bid basis). */
  function isCoSnapshot(o) {
    return !!(o && o.lines && typeof o.lines === 'object' && !Array.isArray(o.lines));
  }
  /** Σ(qty × subBid) over a CO snapshot's lines. field_2150 is the
   *  PER-UNIT sub bid and a Remove line carries negative qty, so the sum
   *  is signed — exactly what co-stage-strip's send document totals.
   *  Returns null when there are no usable lines. */
  function linesTotal(snap) {
    if (!isCoSnapshot(snap)) return null;
    var sum = 0, seen = false;
    for (var id in snap.lines) {
      var ln = snap.lines[id];
      if (!ln || typeof ln !== 'object') continue;
      var bid = Number(ln.subBid);
      if (!isFinite(bid)) continue;
      var qty = Number(ln.qty);
      if (!isFinite(qty) || qty === 0) qty = 1;
      sum += qty * bid;
      seen = true;
    }
    return seen ? sum : null;
  }
  function shortDate(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(+d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  /** The SOW's field_2941 sub-bid snapshot as seen from this acceptance
   *  row: the configured column if F.snapshot names one, else ANY column
   *  whose value parses into a snapshot — so exposing the blob in Builder
   *  is enough, whatever key or connection it arrives under. Model first,
   *  DOM last. Returns null when there's nothing snapshot-shaped. */
  function readSnapshot(viewKey, row) {
    var attrs = rowAttrs(viewKey, row.id);
    if (F.snapshot) {
      var one = parseLooseJson(
        (attrs && (attrs[F.snapshot] != null ? attrs[F.snapshot] : attrs[F.snapshot + '_raw'])) ||
        cellText(row, F.snapshot));
      if (isSnapshot(one)) return one;
    }
    if (attrs) {
      for (var k in attrs) {
        if (!/^field_\d+$/.test(k)) continue;
        var val = attrs[k];
        if (typeof val !== 'string') continue;
        if (val.indexOf('basisBid') === -1 && val.indexOf('"lines"') === -1) continue;
        var snap = parseLooseJson(val);
        if (isSnapshot(snap)) return snap;
      }
    }
    return null;
  }

  // ── Base-scope money ────────────────────────────────────────
  // A base acceptance has no pricing snapshot to total — field_2946 only
  // gets stamped for change orders — but the line items it was accepted
  // against are already on the scene: the proposed-items grid carries the
  // per-line sub bid and the SOW each line belongs to. Sum by SOW and the
  // base row gets its number the same way the CO row does.
  //
  // field_2150 is the PER-UNIT sub bid, so the line amount is qty × bid —
  // the same extension co-stage-strip's send document uses, and the one
  // the legacy base path in buildInvoiceItems under-reports (Known Issue
  // #21). This is the sub's own money, already shown to subs elsewhere
  // (install-as-quoted-panel reads the same field on the same views).
  // SOW grid carrying the survey cost, read-only. Rows ARE SOW records,
  // so the <tr> id is the SOW record id the acceptance's SOW connection
  // points at. field_2122 (SOW ID) gives the token for the fallback match.
  var SURVEY_VIEWS = ['view_4161'];
  var SVF = {
    cost:  'field_2750',   // INPUT_survey cost
    sowId: 'field_2122'    // SOW ID ("1347") — token fallback
  };
  var PROPOSED_VIEWS = ['view_4151', 'view_4072'];
  var PF = {
    subBid: 'field_2150',   // INSTALL FEE INPUT_sub bid (per unit)
    sow:    'field_2154',   // REL_scope of work
    qty:    'field_1964'    // PRODUCT INPUT_quantity
  };
  /** SOW identifiers arrive with and without the SW prefix depending on
   *  the surface ("SW1347" on acceptance proposal identifiers, "1347" on
   *  SOW connections), so compare both ways — same rule as
   *  install-as-quoted-panel's acceptFor. */
  function normToken(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '')
      .replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  function tokenMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf('SW') === 0 && a.slice(2) === b) return true;
    if (b.indexOf('SW') === 0 && b.slice(2) === a) return true;
    return false;
  }
  /** The SOW token out of a project-prefixed label — the proposal
   *  identifier ("61507493933-SW1347 | 20260807-11068" → "SW1347") and the
   *  SOW ID field ("61507493933-SW1347" → "SW1347") are the same shape, so
   *  one reader serves both. */
  function sowLabelToken(s) {
    var left = String(s == null ? '' : s).split('|')[0] || '';
    var segs = left.trim().split('-');
    return normToken(segs[segs.length - 1]);
  }
  /** This acceptance's SOW token, off the proposal identifier. */
  function sowTokenOf(row) {
    return sowLabelToken(cellText(row, F.proposal));
  }
  /** This acceptance's SOW: { id, token }. Prefers the SOW connection
   *  column the ops grid carries (the span's class is the SOW record id —
   *  an exact match beats a label match), falling back to the token parsed
   *  off the proposal identifier.
   *
   *  The column is DISCOVERED rather than configured, and self-validates
   *  while doing it: the SOW column is the connection column whose value
   *  token-matches this row's own SOW. No dependence on Builder naming or
   *  column order, and a wrong guess can't pass. Cached per view. */
  var _sowColCache = Object.create(null);
  function sowRefOf(viewKey, row) {
    var tok = sowTokenOf(row);
    function read(fk) {
      var c = fk ? row.querySelector('td.' + fk) : null;
      var sp = c ? c.querySelector('span[data-kn="connection-value"]') : null;
      if (!sp) return null;
      var id = String(sp.className || '').trim();
      return { id: /^[a-f0-9]{24}$/i.test(id) ? id : '',
               token: normToken(sp.textContent) || tok };
    }
    var known = read(F.sow || _sowColCache[viewKey]);
    if (known) return known;
    var cells = row.querySelectorAll('td[data-field-key]');
    for (var i = 0; i < cells.length; i++) {
      var fk = cells[i].getAttribute('data-field-key');
      if (!fk || fk === F.proposal) continue;
      var spans = cells[i].querySelectorAll('span[data-kn="connection-value"]');
      for (var s = 0; s < spans.length; s++) {
        var t = normToken(spans[s].textContent);
        if (!t || !tokenMatch(tok, t)) continue;
        var id = String(spans[s].className || '').trim();
        if (!/^[a-f0-9]{24}$/i.test(id)) continue;   // not the connection itself
        _sowColCache[viewKey] = fk;
        return { id: id, token: t };
      }
    }
    return { id: '', token: tok };
  }

  /** Survey cost per SOW, keyed by record id AND by SOW token so either
   *  match works. A recorded $0 is a real answer and stays in the map —
   *  only a SOW with nothing recorded is absent. */
  function surveyCostBySow() {
    var out = { byId: Object.create(null), byTok: Object.create(null) };
    for (var v = 0; v < SURVEY_VIEWS.length; v++) {
      var key = SURVEY_VIEWS[v];
      var el = document.getElementById(key);
      if (!el) continue;
      var models = null;
      try {
        var vw = window.Knack && Knack.views && Knack.views[key];
        models = vw && vw.model && vw.model.data && vw.model.data.models;
      } catch (e) { models = null; }
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && models[i].attributes;
          if (!a) continue;
          var cost = numFromText(a[SVF.cost] != null ? a[SVF.cost] : a[SVF.cost + '_raw']);
          if (cost == null) continue;
          if (models[i].id) out.byId[models[i].id] = cost;
          var tok = sowLabelToken(a[SVF.sowId]);
          if (tok) out.byTok[tok] = cost;
        }
        continue;                                  // model read succeeded
      }
      // DOM fallback — the <tr> id is the SOW record id.
      var rows = el.querySelectorAll('tbody tr[id]');
      for (var d = 0; d < rows.length; d++) {
        var tr = rows[d];
        var dcost = numFromText(cellText(tr, SVF.cost));
        if (dcost == null) continue;
        if (tr.id) out.byId[tr.id] = dcost;
        var dtok = sowLabelToken(cellText(tr, SVF.sowId));
        if (dtok) out.byTok[dtok] = dcost;
      }
    }
    return out;
  }

  /** The survey cost for one acceptance row, or null when this SOW has
   *  none recorded. Record id first, then the token (which tolerates the
   *  SW-prefix difference between surfaces). */
  function surveyCostFor(ref, survey) {
    if (!ref || !survey) return null;
    if (ref.id && survey.byId[ref.id] != null) return survey.byId[ref.id];
    if (!ref.token) return null;
    if (survey.byTok[ref.token] != null) return survey.byTok[ref.token];
    for (var k in survey.byTok) {
      if (tokenMatch(ref.token, k)) return survey.byTok[k];
    }
    return null;
  }

  /** token → Σ(qty × sub bid) over the proposed line items on this scene.
   *  Model first (connection identifiers live in _raw), DOM as a
   *  fallback. Returns an empty map when no proposed grid is present, so
   *  callers just find nothing rather than erroring. */
  function proposedSubBidBySow() {
    var out = Object.create(null);
    for (var v = 0; v < PROPOSED_VIEWS.length; v++) {
      var key = PROPOSED_VIEWS[v];
      var el = document.getElementById(key);
      if (!el) continue;
      var models = null;
      try {
        var vw = window.Knack && Knack.views && Knack.views[key];
        models = vw && vw.model && vw.model.data && vw.model.data.models;
      } catch (e) { models = null; }
      if (models && models.length) {
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && models[i].attributes;
          if (!a) continue;
          var raw = a[PF.sow + '_raw'];
          var refs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          if (!refs.length) continue;
          var bid = numFromText(a[PF.subBid] != null ? a[PF.subBid] : a[PF.subBid + '_raw']);
          if (bid == null) continue;
          var q = numFromText(a[PF.qty] != null ? a[PF.qty] : a[PF.qty + '_raw']);
          if (q == null || q === 0) q = 1;
          // A line on several SOWs counts once per SOW — each SOW's total
          // is what THAT SOW was accepted at.
          for (var r = 0; r < refs.length; r++) {
            var tok = normToken(refs[r] && refs[r].identifier);
            if (!tok) continue;
            out[tok] = (out[tok] || 0) + q * bid;
          }
        }
        continue;                                  // model read succeeded
      }
      // DOM fallback — same shape, scraped.
      var rows = el.querySelectorAll('tbody tr[id]');
      for (var d = 0; d < rows.length; d++) {
        var tr = rows[d];
        var dbid = numFromText(cellText(tr, PF.subBid));
        if (dbid == null) continue;
        var dq = numFromText(cellText(tr, PF.qty));
        if (dq == null || dq === 0) dq = 1;
        var cell = tr.querySelector('td.' + PF.sow);
        var spans = cell ? cell.querySelectorAll('span[data-kn="connection-value"]') : [];
        for (var s = 0; s < spans.length; s++) {
          var dtok = normToken(spans[s].textContent);
          if (!dtok) continue;
          out[dtok] = (out[dtok] || 0) + dq * dbid;
        }
      }
    }
    return out;
  }

  /** Grand total out of the stored bid document (F.bidDoc). The fragment
   *  our own PDF builder wrote carries classed totals, so prefer the
   *  grand-total line and fall back to the last project total. */
  function totalFromBidDoc(row) {
    if (!F.bidDoc) return null;
    var cell = row.querySelector('td.' + F.bidDoc);
    if (!cell) return null;
    var el = cell.querySelector('.pt-line--grand-total .pt-value');
    if (!el) {
      var all = cell.querySelectorAll('.project-totals .pt-value, .pt-value');
      el = all.length ? all[all.length - 1] : null;
    }
    return el ? numFromText(el.textContent) : null;
  }

  /** OPS ONLY — the bid-vs-SOW diff the proposal stored (F.bidDiff), as a
   *  one-line summary. Counts the diff table's rows by their own status
   *  label (real elements, so no HTML parsing) and picks up the labor
   *  delta when the fragment carries it. Material here because ops is
   *  about to pay this bid: it says whether the sub priced what we scoped.
   *  Never rendered on the sub card — the SOW-side figures in that
   *  fragment are SCW's. */
  var DIFF_PLURAL = /change$/i;      // "spec change" → "spec changes"
  function diffSummary(row) {
    if (!F.bidDiff) return null;
    var cell = row.querySelector('td.' + F.bidDiff);
    if (!cell) return null;
    var rows = cell.querySelectorAll('table.product-table tbody tr');
    var counts = Object.create(null), order = [];
    for (var i = 0; i < rows.length; i++) {
      var lab = rows[i].querySelector('td span');
      var tier = lab ? (lab.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (!tier) continue;
      if (!(tier in counts)) { counts[tier] = 0; order.push(tier); }
      counts[tier]++;
    }
    var parts = [];
    for (var o = 0; o < order.length; o++) {
      var n = counts[order[o]], lbl = order[o].toLowerCase();
      parts.push(n + ' ' + lbl + (n === 1 || !DIFF_PLURAL.test(lbl) ? '' : 's'));
    }
    // The tally prints the delta BEFORE its label ("$0.00 labor Δ …").
    var dm = (cell.textContent || '').match(/\$\s*(-?[\d,]+(?:\.\d+)?)\s*labor\s*Δ/i);
    var delta = dm ? dm[1] : '';
    if (!parts.length && !delta) return null;      // column present but empty
    return {
      n: rows.length,
      text: rows.length
        ? rows.length + ' bid difference' + (rows.length === 1 ? '' : 's')
        : 'Matches the SOW',
      breakdown: parts.join(', '),
      delta: delta
    };
  }

  /** The stored bid DOCUMENT as HTML (F.bidDoc), unwrapped from Knack's
   *  connection span. Rich text, so innerHTML — textContent would strip
   *  the tables that are the whole point (see CLAUDE.md on reading
   *  rich-text cells). '' when the column is absent or blank. */
  function bidDocHtml(row) {
    if (!F.bidDoc) return '';
    var cell = row.querySelector('td.' + F.bidDoc);
    if (!cell) return '';
    var inner = cell.querySelector('span[data-kn="connection-value"]') ||
                cell.querySelector('span[class^="col-"]') || cell;
    var html = (inner.innerHTML || '').trim();
    // A blank Knack cell is &nbsp; / whitespace, not empty.
    return html.replace(/<[^>]*>/g, '').replace(/[\s ]/g, '') ? html : '';
  }

  /** Open a stored bid document in its own tab, styled with the SAME
   *  stylesheet the published PDF uses (SCW.pdfExport.getCss), so it reads
   *  as the document it is — and can be printed or saved as a PDF, which
   *  is the point when no PDF was ever attached. A new tab rather than a
   *  modal: this is a full proposal-length document with wide tables, and
   *  the card's modal is 420px. */
  function openBidDoc(html, title) {
    if (!html) return;
    var css = '';
    try {
      if (window.SCW && SCW.pdfExport && typeof SCW.pdfExport.getCss === 'function') {
        css = SCW.pdfExport.getCss() || '';
      }
    } catch (e) { css = ''; }
    var w = null;
    try { w = window.open('', '_blank'); } catch (e2) { w = null; }
    if (!w) {
      toast('Allow pop-ups for this site to open the bid document.', true);
      return;
    }
    // Minimal page scaffold when the PDF stylesheet isn't in scope — the
    // fragment carries its own inline styles for the diff tables, but the
    // bid document leans on classes.
    var fallback = css ? '' : [
      'body{font:13px/1.5 Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:28px;}',
      'table{width:100%;border-collapse:collapse;margin:8px 0;}',
      'th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;',
      'vertical-align:top;font-size:12px;}',
      '.col-qty,.col-cost{text-align:right;white-space:nowrap;}',
      '.l1-header{font-weight:800;font-size:14px;color:#0f4c75;margin:18px 0 4px;}',
      '.l2-header{font-weight:700;font-size:12px;color:#475569;margin:12px 0 2px;}',
      '.pt-value,.l1-footer-value{font-weight:800;}'
    ].join('');
    w.document.write('<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title || 'Bid document') + '</title><style>' +
      (css || fallback) +
      // Give the printed page a sane wrapper whichever stylesheet applied.
      ' .scw-bid-doc{max-width:900px;margin:0 auto;padding:24px 16px;}' +
      '</style></head><body><div class="scw-bid-doc">' + html + '</div></body></html>');
    w.document.close();
    try { w.focus(); } catch (e3) { /* ignore */ }
  }

  /** Which columns on this view hold the proposal's money. The three keys
   *  in F (pubEquip / pubInstall / pubGrand) are the answer; the header-
   *  label pass below only fills a slot a key didn't, so a view that
   *  exposes the totals under different keys still reads. A label must say
   *  "total" and must NOT be one of the link/PDF/JSON columns (SYS_Xero
   *  EQUIPMENT Invoice Link would otherwise match on "equip"). A slot with
   *  no column stays empty and its figure simply doesn't render. */
  var _moneyColsWarned = false;
  function moneyColsOf(viewEl) {
    var out = {
      equip:   F.pubEquip || '',
      install: F.pubInstall || '',
      grand:   F.pubGrand || ''
    };
    if (!viewEl) return out;
    var ths = viewEl.querySelectorAll('thead th');
    for (var i = 0; i < ths.length; i++) {
      var fk = (String(ths[i].className || '').match(/field_\d+/) || [''])[0];
      if (!fk) continue;
      var lbl = (ths[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (!/total/i.test(lbl)) continue;
      if (/(link|pdf|json|snapshot|html|id\b)/i.test(lbl)) continue;
      if (!out.equip && /equip/i.test(lbl))                       { out.equip = fk; continue; }
      if (!out.install && /(install|labor)/i.test(lbl))            { out.install = fk; continue; }
      if (!out.grand && /(project|grand|proposal|contract)/i.test(lbl)) { out.grand = fk; continue; }
    }
    if (!_moneyColsWarned && window.console && console.log &&
        (out.equip || out.install || out.grand) && window.SCW && SCW.DEBUG) {
      _moneyColsWarned = true;
      console.log('[AcceptanceCard] proposal money columns:', out);
    }
    return out;
  }

  /** OPS ONLY — what the CLIENT is billed for this proposal. A stored
   *  project total is authoritative; otherwise equipment + install is the
   *  sum. Returns null when none of the columns are on the view, so the
   *  block simply doesn't appear. The bid figure is what SCW PAYS; this is
   *  what SCW BILLS, and having both on one row is the point. */
  function billedOf(row, cols) {
    if (!cols) return null;
    var eq = cols.equip ? numFromText(cellText(row, cols.equip)) : null;
    var inst = cols.install ? numFromText(cellText(row, cols.install)) : null;
    var grand = cols.grand ? numFromText(cellText(row, cols.grand)) : null;
    if (eq == null && inst == null && grand == null) return null;
    var sum = (eq == null ? 0 : eq) + (inst == null ? 0 : inst);
    return {
      equip: eq, install: inst,
      total: grand != null ? grand : sum,
      stored: grand != null,
      // Only worth printing the split when BOTH halves are there; one half
      // alone is already the total above it.
      split: eq != null && inst != null
    };
  }

  // Target labor margin. The retained share of what we bill the client
  // for install, after the sub's bid — at or above this is on target.
  var LABOR_TARGET_PCT = 12;

  /** LABOR MARGIN — what we billed the client for install against what
   *  that work cost us: the sub's bill PLUS the site survey cost, since
   *  the survey is money spent on the sub side of this scope. Equipment
   *  isn't theirs, so it never enters this.
   *
   *    (billed − sub − survey) ÷ billed
   *
   *  A RATE, deliberately, never a net dollar figure. A net number invites
   *  "we made $4k, where's my cut" — it reads as a prize instead of a rate
   *  to hold. The rate is also sign-invariant, so a credit line rates the
   *  same as the equivalent add (-54 / -454 is the same 12% as 54 / 454).
   *
   *  Rounds once and compares the ROUNDED value, so the figure shown and
   *  the verdict beside it can never disagree (11.9% shows as 12% and is
   *  on target, not "12% below target"). Null when a half is missing or
   *  there's nothing billed to take a share of. */
  function laborMargin(installBilled, subAmount, surveyCost) {
    if (installBilled == null || subAmount == null) return null;
    if (!installBilled) return null;   // no billing → no share of it
    var cost = subAmount + (surveyCost || 0);
    var pct = Math.round((installBilled - cost) / installBilled * 100);
    return { pct: pct, onTarget: pct >= LABOR_TARGET_PCT };
  }

  /** The equipment column — one figure, right-aligned in its width; the
   *  column header names it. An EMPTY grid cell still has to exist or the
   *  labor column slides left out of its track, so a missing figure
   *  renders the cell blank rather than omitting it. */
  function equipCell(val) {
    return '<span class="scw-acpt-col scw-acpt-col--equip">' +
      (val ? '<span class="scw-acpt-col__val">' + val + '</span>' : '') +
      '</span>';
  }

  /** One value + name line inside a stat's stacked block. */
  function line(val, lbl, valMod, tip) {
    return '<span class="scw-acpt-line__val' + (valMod ? ' ' + valMod : '') + '"' +
      (tip ? ' title="' + esc(tip) + '"' : '') + '>' + val + '</span>' +
      '<span class="scw-acpt-line__lbl">' + lbl + '</span>';
  }

  /** The LABOR column: what we billed the client, what the sub billed us
   *  for that work, the site survey cost, and the percent of the billing
   *  left over after both. Numbers in one right-aligned column with their
   *  names beside them, and the percent is the heavy one — it's the
   *  answer.
   *
   *  The percent, not a net dollar figure: a net reads as a prize rather
   *  than a rate to hold (see laborMargin). Each line drops out when its
   *  figure is unknown, so the column never implies a rate it couldn't
   *  compute. */
  function laborStat(installBilled, amt, surveyCost) {
    var subAmt  = amt ? amt.amount : null;
    var derived = !!(amt && amt.source === 'derived');
    if (installBilled == null && subAmt == null) {
      return '<span class="scw-acpt-col scw-acpt-col--labor"></span>';
    }
    var lines = '';
    if (installBilled != null) {
      lines += line(esc(money(installBilled)), 'billed to client');
    }
    if (subAmt != null) {
      lines += line(esc(money(subAmt)),
        'billed by sub' + (derived ? ' <span class="scw-acpt-line__src" title="' +
          esc(DERIVED_NOTE) + '">(line items)</span>' : ''));
    } else {
      lines += line('—', 'no sub bid on file');
    }
    // A recorded $0 survey is an answer, so it prints; a SOW with nothing
    // recorded shows no line and doesn't move the percent.
    if (surveyCost != null) {
      lines += line(esc(money(surveyCost)), 'survey cost');
    }
    var m = laborMargin(installBilled, subAmt, surveyCost);
    if (m) {
      lines += line(esc(m.pct + '%'), 'remaining',
        'scw-acpt-line__val--rate scw-acpt-gap--' + (m.onTarget ? 'on' : 'under'),
        'Percent of the labor billed to the client that is left after the ' +
        'subcontractor\'s bill' +
        (surveyCost != null ? ' and the survey cost' : '') +
        '. Target ' + LABOR_TARGET_PCT + '%.');
    }
    return '<span class="scw-acpt-col scw-acpt-col--labor">' + lines + '</span>';
  }

  /** The money for one acceptance row: { amount, source } or null.
   *
   *  PROVENANCE MATTERS, so the source travels with the number and the
   *  card says which one it is. Strongest first:
   *    'quoted'  — a stamped total on the acceptance record, or the frozen
   *                pricing snapshot: what the sub actually bid/submitted,
   *                fixed at that moment. This is the agreed figure.
   *    'derived' — summed from the CURRENT proposed line items for that
   *                SOW. Real data, but NOT the same thing as a bid
   *                document: it moves when the scope moves, and nobody
   *                signed it. Always labelled as derived on the card.
   */
  function bidAmountOf(row, snap, bySow) {
    if (F.bidTotal) {
      var direct = numFromText(cellText(row, F.bidTotal));
      if (direct != null) return { amount: direct, source: 'quoted' };
    }
    // The stored bid DOCUMENT, if that column is on the view. Knack renders
    // the fragment as real elements, so the grand total is a class lookup
    // rather than an HTML parse. This is the bid as published — the
    // strongest figure available.
    var docTotal = totalFromBidDoc(row);
    if (docTotal != null) return { amount: docTotal, source: 'quoted' };
    if (snap) {
      if (snap.basisTotal != null && isFinite(Number(snap.basisTotal))) {
        return { amount: Number(snap.basisTotal), source: 'quoted' };
      }
      var m = String(snap.bidHtml || '').match(/class="pt-value"[^>]*>([^<]+)</);
      if (m) {
        var scraped = numFromText(m[1]);
        if (scraped != null) return { amount: scraped, source: 'quoted' };
      }
      var lt = linesTotal(snap);
      if (lt != null) return { amount: lt, source: 'quoted' };
    }
    if (bySow) {
      var tok = sowTokenOf(row);
      if (tok) {
        for (var k in bySow) {
          if (tokenMatch(tok, k)) return { amount: bySow[k], source: 'derived' };
        }
      }
    }
    return null;
  }
  var DERIVED_NOTE = 'Summed from the current line items on this scope — ' +
    'not a figure read off a signed bid document.';

  // Beta notice on the SUB card. The money on it is newly derived (see
  // bidAmountOf) and some of it is summed rather than quoted, so say so
  // plainly while it's being trusted for the first time. Set to '' to
  // retire the notice — that's the whole switch.
  var SUB_BETA_NOTE = 'These totals are new. If a number looks wrong, ' +
    'please flag it to Micah.';
  var INFO_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line>' +
    '<line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle>' +
    '<polyline points="12 7 12 12 15 14"></polyline></svg>';
  var FILE_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  var UPLOAD_SVG =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
    '<polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
  var LINK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    // Hide the raw grid chrome — the card replaces it. Scoped to the
    // .scw-acpt-on marker class render() stamps only after the column
    // guard passes, so a view without the acceptance columns keeps its
    // native table.
    var hideSel = [];
    for (var hv = 0; hv < VIEWS.length; hv++) {
      // Sub views: hide the native grid UNCONDITIONALLY. The card is the
      // only sanctioned view of an acceptance for a subcontractor, so a
      // guard that fails (columns pulled in Builder, model not populated)
      // must leave an empty section, never the raw table.
      var gate = SUB_VIEWS[VIEWS[hv]] ? '' : '.scw-acpt-on';
      hideSel.push('#' + VIEWS[hv] + gate + ' .view-header',
                   '#' + VIEWS[hv] + gate + ' .kn-records-nav',
                   '#' + VIEWS[hv] + gate + ' .kn-table-wrapper');
    }
    var css = [
      hideSel.join(',\n') + ' { display: none !important; }',
      '.scw-acpt-card {',
      '  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); padding: 16px 18px; margin-top: 8px;',
      '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '.scw-acpt-eyebrow { font: 700 10px/1.2 system-ui, sans-serif; letter-spacing: .07em;',
      '  text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }',
      // Titles come in two flavours and must not look alike: an ANCHOR is
      // navy and underlines on hover, a plain title is ink and does
      // neither. Nothing that can't be clicked gets to look clickable.
      '.scw-acpt-title { font: 700 15px/1.35 system-ui, sans-serif; color: #0f172a;',
      '  text-decoration: none; display: inline-block; }',
      'a.scw-acpt-title { color: #0f4c75; }',
      'a.scw-acpt-title:hover { text-decoration: underline; }',
      '.scw-acpt-status { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }',
      '.scw-acpt-pill { display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px; border-radius: 999px; font: 600 12px/1 system-ui, sans-serif;',
      '  border: 1px solid transparent; }',
      '.scw-acpt-pill.is-yes { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      '.scw-acpt-pill.is-no  { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-acpt-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.scw-acpt-btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer;',
      '  font: 600 12.5px/1 system-ui, sans-serif; padding: 8px 14px; border-radius: 6px;',
      '  text-decoration: none; transition: background .12s, border-color .12s; }',
      '.scw-acpt-btn--ghost { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; }',
      '.scw-acpt-btn--ghost:hover { background: #eef2f7; border-color: #94a3b8; }',
      '.scw-acpt-btn--primary { background: #0f4c75; border: 1px solid #0a3a63; color: #fff;',
      '  margin-left: auto; }',
      '.scw-acpt-btn--primary:hover { background: #0a3a63; }',
      // ── Document tiles ─────────────────────────────────────────
      // Design rules (2026-08-21 pass): labels NEVER truncate (tiles are
      // content-sized — a checklist you can\'t read is decoration); ONE
      // state glyph per tile (leading check = done, plus = missing —
      // state never rides on color alone); the pencil is progressive
      // disclosure (hidden until tile hover / keyboard focus, fixed
      // width so nothing shifts). Pair captions carry the shared context
      // so the tile labels stay short.
      // A PRESENT document is quiet: the checklist's job is to show what's
      // MISSING, and five filled-green chips per row shouted over the
      // money and the title. Done = white with a muted check; the dashed
      // "+" tiles below are what the eye should catch.
      '.scw-acpt-doc { display: inline-flex; align-items: stretch;',
      '  border-radius: 8px; border: 1px solid #e2e8f0; background: #fff;',
      '  overflow: hidden; }',
      '.scw-acpt-doc:hover { border-color: #cbd5e1; }',
      // A stored-HTML document isn't the PDF the checklist wants, so its
      // glyph stays slate rather than the done-green check.
      '.scw-acpt-doc--html .scw-acpt-doc__open svg { color: #64748b; }',
      '.scw-acpt-doc__open { display: inline-flex; align-items: center;',
      '  gap: 7px; padding: 7px 4px 7px 10px; color: #334155 !important; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none !important; }',
      '.scw-acpt-doc__open svg { color: #16a34a; }',
      '.scw-acpt-doc__open:hover { background: #f8fafc; text-decoration: none !important; }',
      '.scw-acpt-doc__open svg { flex: none; color: #16a34a; }',
      '.scw-acpt-doc__lbl { white-space: nowrap; }',
      '.scw-acpt-doc__edit { flex: none; width: 24px; display: inline-flex; align-items: center;',
      '  justify-content: center; border: none; background: transparent;',
      '  color: #15803d; cursor: pointer; opacity: 0; padding: 0;',
      '  transition: opacity .12s, background .12s; }',
      '.scw-acpt-doc:hover .scw-acpt-doc__edit,',
      '.scw-acpt-doc:focus-within .scw-acpt-doc__edit { opacity: .65; }',
      '.scw-acpt-doc__edit:hover { opacity: 1 !important; background: #dcfce7; }',
      'button.scw-acpt-doc--missing { box-sizing: border-box;',
      '  display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px 7px 10px;',
      '  border-radius: 8px; border: 1.5px dashed #cbd5e1; background: #fff;',
      '  color: #64748b; cursor: pointer; font: 600 12px/1.2 system-ui, sans-serif;',
      '  text-align: left; white-space: nowrap;',
      '  transition: border-color .12s, color .12s, background .12s; }',
      'button.scw-acpt-doc--missing:hover { border-color: #0f4c75; color: #0f4c75;',
      '  background: #f8fafc; }',
      'button.scw-acpt-doc--missing svg { flex: none; }',
      // Reference tile — a plain outbound link (eSignatures contract).
      // Neutral slate, no check/plus state glyphs: it isn\'t a checklist
      // slot, just a jump to the contract page.
      'a.scw-acpt-ref { display: inline-flex; align-items: center; gap: 7px;',
      '  padding: 7px 12px 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1;',
      '  background: #f8fafc; color: #334155 !important; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif; text-decoration: none !important;',
      '  white-space: nowrap; transition: background .12s, border-color .12s; }',
      'a.scw-acpt-ref:hover { background: #eef2f7; border-color: #94a3b8; }',
      'a.scw-acpt-ref svg { flex: none; color: #64748b; }',
      // Mirror pairs (agreement·invoice / bid-PDF·estimate): a micro-
      // caption names the pair so the tiles inside can use short labels.
      '.scw-acpt-pair { display: inline-flex; flex-direction: column; gap: 3px; }',
      '.scw-acpt-pair__cap { font: 700 9.5px/1 system-ui, sans-serif;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  padding-left: 2px; }',
      '.scw-acpt-pair__tiles { display: inline-flex; gap: 6px; }',
      // Compact list mode: ONE card, one row per acceptance record —
      // title | pills | actions on a single line (wraps on narrow).
      // Accordion-header rollup badge (signed tally) — sits before the count
      // pill; margin-left:auto is harmless when the title already flexes.
      '.scw-acpt-rollup { display: inline-flex; align-items: center;',
      '  margin-left: auto; margin-right: 8px; padding: 3px 10px;',
      '  border-radius: 999px; font: 700 11px/1.2 system-ui, sans-serif;',
      '  border: 1px solid transparent; white-space: nowrap; }',
      '.scw-acpt-rollup--warn { background: #fef3c7; border-color: #fde68a; color: #92400e; }',
      '.scw-acpt-rollup--ok   { background: #dcfce7; border-color: #86efac; color: #15803d; }',
      // ── Sub variant ────────────────────────────────────────────
      // TWO columns: everything identifying the scope on the left (name,
      // document, status pills), the money on the right. Money is the one
      // column that has to line up row to row and with the tally footer,
      // so it's the LAST column in every one of them and right-aligned —
      // pills vary in width and would otherwise push each row's figure to
      // a different place. The money cell renders even when empty to hold
      // the column.
      // Card head: section eyebrow left, beta notice right. Amber because
      // it asks for caution, not because anything is broken (red stays for
      // errors) — and it sits ABOVE the figures it's about.
      '.scw-acpt-cardhead { display: flex; align-items: center;',
      '  justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; }',
      '.scw-acpt-beta { display: inline-flex; align-items: center; gap: 7px;',
      '  padding: 5px 10px; border-radius: 6px; background: #fffbeb;',
      '  border: 1px solid #fde68a; color: #b45309;',
      '  font: 600 11.5px/1.3 system-ui, sans-serif; }',
      '.scw-acpt-beta svg { flex: none; }',
      '.scw-acpt-beta b { font: 800 9.5px/1 system-ui, sans-serif; letter-spacing: .08em;',
      '  text-transform: uppercase; padding: 3px 6px; border-radius: 4px;',
      '  background: #fef3c7; }',
      // Sub row: identity then money, one right edge for every figure.
      // Grid (not flex) so the two columns agree row to row, and the money
      // column drops below the identity on a narrow screen.
      '.scw-acpt-row--sub { grid-template-columns: minmax(0, 1fr) auto;',
      '  grid-template-areas: "id money"; column-gap: 24px; }',
      '@media (max-width: 760px) {',
      '  .scw-acpt-row--sub { grid-template-columns: minmax(0, 1fr);',
      '    grid-template-areas: "id" "money"; }',
      '}',
      '.scw-acpt-money { display: flex; flex-direction: column; gap: 10px;',
      '  align-items: flex-end; justify-content: flex-start; }',
      '.scw-acpt-basis { display: flex; flex-direction: column; gap: 2px;',
      '  align-items: flex-start; }',
      // The bid name doubles as the link to its PDF: leading file glyph,
      // underline on the text only (not the icon) so it still reads as a
      // title rather than a button.
      'a.scw-acpt-title--doc { display: inline-flex; align-items: center; gap: 6px;',
      '  text-decoration: none !important; }',
      'a.scw-acpt-title--doc svg { flex: none; color: #64748b; }',
      'a.scw-acpt-title--doc:hover span { text-decoration: underline; }',
      '.scw-acpt-row--sub .scw-acpt-sub { overflow-wrap: anywhere; }',
      // Money block — right-aligned inside the money column so every
      // figure on the card shares one right edge.
      '.scw-acpt-total { flex: 0 0 auto; display: flex; flex-direction: column;',
      '  gap: 2px; padding: 2px 0; align-items: flex-end; text-align: right; }',
      '.scw-acpt-total__lbl { font: 700 9.5px/1 system-ui, sans-serif;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  white-space: nowrap; }',
      // NEUTRAL. A change order that nets negative isn\'t bad news and one
      // that nets positive isn\'t good news — it\'s a change. The sign is
      // the whole story; colour would editorialise. (Green/amber stay for
      // the yes/no status pills, where they mean done / not done.)
      '.scw-acpt-total__val { font: 700 16px/1.15 system-ui, sans-serif;',
      '  color: #0f172a; font-variant-numeric: tabular-nums; }',
      // Provenance caption. A figure summed off the live line items is
      // weaker than one off a bid document, so it never sits there
      // unqualified — dotted underline invites the tooltip.
      '.scw-acpt-total__src { font: 600 9.5px/1.2 system-ui, sans-serif;',
      '  color: #94a3b8; letter-spacing: .02em; cursor: help;',
      '  border-bottom: 1px dotted #cbd5e1; }',
      // Running tally: original bid + change orders = total. Sits under
      // the rows it sums, separated by a rule so it reads as a footer, and
      // ends flush right so its Total lands under the rows\' figures.
      '.scw-acpt-tally { display: flex; align-items: flex-end; flex-wrap: wrap;',
      '  justify-content: flex-end; gap: 6px 16px; margin-top: 4px;',
      '  padding: 12px 2px 2px; border-top: 2px solid #e2e8f0; }',
      '.scw-acpt-tally__cell { display: flex; flex-direction: column; gap: 2px;',
      '  align-items: flex-end; text-align: right; }',
      '.scw-acpt-tally__lbl { font: 700 9.5px/1 system-ui, sans-serif;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  white-space: nowrap; }',
      '.scw-acpt-tally__val { font: 700 15px/1.15 system-ui, sans-serif;',
      '  color: #0f172a; font-variant-numeric: tabular-nums; }',
      '.scw-acpt-tally__op { font: 600 14px/1 system-ui, sans-serif; color: #cbd5e1;',
      '  padding-bottom: 2px; }',
      // The total is the figure the sub is looking for — give it the
      // emphasis and let the inputs read as inputs.
      '.scw-acpt-tally__cell--total .scw-acpt-tally__lbl { color: #475569; }',
      '.scw-acpt-tally__cell--total .scw-acpt-tally__val { font-size: 18px; }',
      // Caveat rides on the LEFT so the numbers keep the right edge.
      '.scw-acpt-tally__note { margin-right: auto; align-self: center;',
      '  font: 600 10px/1.3 system-ui, sans-serif; color: #94a3b8; cursor: help;',
      '  border-bottom: 1px dotted #cbd5e1; }',
      // MUST follow the base rules above — same specificity, so source
      // order decides. Declared earlier it silently lost to flex-end.
      '.scw-acpt-tally--left { justify-content: flex-start; }',
      '.scw-acpt-tally--left .scw-acpt-tally__cell { align-items: flex-start;',
      '  text-align: left; }',
      '.scw-acpt-tally--left .scw-acpt-tally__note { margin-right: 0; margin-left: auto; }',
      // ── ONE money grid, shared by every band ─────────────
      // The rows, the column header and the project footer all use the
      // SAME fixed column widths, so every figure sits on the same axis by
      // construction. min-width alignment (what this replaced) only lines
      // up when the content happens to be the same width — -$454.00 and
      // $11,735.00 are not, which is what made the edges rag.
      '.scw-acpt-card { --acpt-equip: 112px; --acpt-num: 94px;',
      '  --acpt-lbl: 98px; }',
      '.scw-acpt-col { display: grid; grid-template-columns:',
      '  var(--acpt-num) var(--acpt-lbl); gap: 2px 7px; align-items: baseline; }',
      // Equipment is one figure, so it needs no label column of its own —
      // it right-aligns in its width and the header names it.
      '.scw-acpt-col--equip { display: block; text-align: right; }',
      '.scw-acpt-col__val { color: #0f172a;',
      '  font: 700 16px/1.2 system-ui, sans-serif;',
      '  font-variant-numeric: tabular-nums; white-space: nowrap; }',
      // ── Column header, stated once ───────────────────
      // EQUIPMENT / LABOR sat on every row three times over. One header
      // over the columns says it once, and LABOR lands over the FIGURES
      // (not their names), which is where it was pointing wrong before.
      '.scw-acpt-colhead { padding: 0 2px 6px; }',
      '.scw-acpt-colhead__lbl { font: 700 9.5px/1 system-ui, sans-serif;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  white-space: nowrap; text-align: right; }',
      '.scw-acpt-colhead .scw-acpt-col--labor .scw-acpt-colhead__lbl:last-child {',
      '  display: none; }',
      // Labor\'s lines: figures in the number column, their names beside
      // them. Same grid as the header, so they cannot drift.
      '.scw-acpt-line__val { text-align: right; color: #475569;',
      '  font: 700 13px/1.25 system-ui, sans-serif;',
      '  font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.scw-acpt-line__lbl { text-align: left; color: #94a3b8;',
      '  font: 600 10px/1.3 system-ui, sans-serif; white-space: nowrap; }',
      // The percent is the answer — give it the weight and let the figures
      // above it read as the inputs they are.
      '.scw-acpt-line__val--rate { font-size: 20px; cursor: help; }',
      '.scw-acpt-line__val--rate + .scw-acpt-line__lbl { font-size: 10.5px;',
      '  color: #64748b; }',
      '.scw-acpt-line__src { cursor: help; border-bottom: 1px dotted #cbd5e1; }',
      // ── Labor margin vs target ───────────────────
      // A verdict, unlike a change order\'s sign: at or above target is
      // fine, under it isn\'t. Green for on, AMBER for under (repo
      // convention — amber warns, red is errors and destructive actions).
      // Colour only; the figure keeps the type set above it.
      '.scw-acpt-gap--on    { color: #047857; }',
      '.scw-acpt-gap--under { color: #b45309; }',
      // ── Project footer ─────────────────────────
      // Same grid as the rows, so each project figure lands directly under
      // the per-row figures it sums — the point of a footer.
      '.scw-acpt-foot { margin-top: 4px; padding: 12px 2px 2px;',
      '  border-top: 2px solid #e2e8f0; }',
      '.scw-acpt-foot__cap { font: 700 10px/1 system-ui, sans-serif;',
      '  letter-spacing: .1em; text-transform: uppercase; color: #475569; }',
      '.scw-acpt-foot .scw-acpt-col__val { font-size: 17px; }',
      '.scw-acpt-foot .scw-acpt-line__val--rate { font-size: 21px; }',
      // The bid + change-order split rides in the footer\'s identity cell,
      // beside the word PROJECT. It used to be a third band with its own
      // layout, whose Total poked past every other right edge — and that
      // Total is the same figure as the project\'s "billed by sub" one
      // column over. As a line under PROJECT it EXPLAINS that figure
      // instead of competing with it.
      '.scw-acpt-split { display: flex; flex-wrap: wrap; align-items: baseline;',
      '  gap: 2px 5px; margin-top: 5px;',
      '  font: 600 10.5px/1.45 system-ui, sans-serif; color: #94a3b8;',
      '  font-variant-numeric: tabular-nums; }',
      '.scw-acpt-split__n { font-weight: 700; color: #64748b; }',
      '.scw-acpt-split__op { color: #cbd5e1; }',
      '.scw-acpt-split__note { cursor: help; border-bottom: 1px dotted #cbd5e1; }',
      // ── Ops row: GRID, not a wrapping flex line ────────────────
      // As flex with margin-left:auto on the actions, the tile cluster
      // wrapped to its own line but stayed pinned right, leaving a void
      // under the identity column. A grid puts each part in a named area
      // and reflows in deliberate steps:
      //   default  id | money | status   /   actions across the bottom
      //   >=1600px everything on one line
      //   <=860px  one column, stacked
      // Columns are declared once, so they line up row to row by
      // construction rather than by matching fixed widths.
      // TWO columns, one hierarchy. Left: what this is, how it stands,
      // and its documents. Right: the money, right-aligned — the only
      // thing over there, so the eye lands on it, and the tally footer
      // continues the same axis. Documents sit on their own band under a
      // hairline: they're a checklist, not the headline, and five tiles
      // beside the title was what made the row read as noise.
      // THE grid: identity takes what\'s left, the two money columns are
      // fixed. Declared identically on the row, the column header and the
      // footer — that shared template is what puts every figure on one
      // axis, header included.
      '.scw-acpt-row, .scw-acpt-colhead, .scw-acpt-foot {',
      '  display: grid; align-items: start;',
      '  grid-template-columns: minmax(240px, 440px) minmax(0, 1fr)',
      '    var(--acpt-equip) calc(var(--acpt-num) + var(--acpt-lbl) + 7px);',
      '  grid-template-areas: "id docs equip labor";',
      '  column-gap: 26px; }',
      // Not enough room for four: the tiles take a band of their own again
      // and the identity stretches back across the slack.
      '@media (max-width: 1200px) {',
      '  .scw-acpt-row, .scw-acpt-colhead, .scw-acpt-foot {',
      '    grid-template-columns: minmax(0, 1fr) var(--acpt-equip)',
      '      calc(var(--acpt-num) + var(--acpt-lbl) + 7px);',
      '    grid-template-areas: "id equip labor" "docs docs docs"; }',
      '}',
      '.scw-acpt-row { row-gap: 10px; padding: 16px 2px; }',
      '.scw-acpt-row > .scw-acpt-id { grid-area: id; }',
      '.scw-acpt-col--equip { grid-area: equip; }',
      '.scw-acpt-col--labor { grid-area: labor; }',
      '.scw-acpt-row > .scw-acpt-actions { grid-area: docs; }',
      '@media (max-width: 860px) {',
      '  .scw-acpt-row, .scw-acpt-colhead, .scw-acpt-foot {',
      '    grid-template-columns: minmax(0, 1fr);',
      '    grid-template-areas: "id" "equip" "labor" "docs"; }',
      // Stacked, there is no right edge to hang from and no header above
      // the columns, so each figure left-aligns and names itself again.
      '  .scw-acpt-colhead { display: none; }',
      '  .scw-acpt-col--equip { text-align: left; }',
      '  .scw-acpt-col { grid-template-columns: auto auto; justify-content: start; }',
      '  .scw-acpt-line__val { text-align: left; }',
      '  .scw-acpt-col--equip::before, .scw-acpt-col--labor::before {',
      '    display: block; font: 700 9.5px/1 system-ui, sans-serif;',
      '    letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '    margin-bottom: 3px; }',
      '  .scw-acpt-col--equip::before { content: "Equipment"; }',
      '  .scw-acpt-col--labor::before { content: "Labor"; grid-column: 1 / -1; }',
      '}',
      '.scw-acpt-row + .scw-acpt-row { border-top: 1px solid #e2e8f0; }',
      // The identity column: base SOW numbers (SW1145) are shorter than CO
      // numbers (SW1418CO), so an auto width staggered everything beside
      // them. The proposal id renders as a muted sub-line instead of riding
      // in the title, with the bid/PO/diff tags under that.
      '.scw-acpt-id { min-width: 0; }',
      '.scw-acpt-id .scw-acpt-title { font-size: 13.5px; overflow-wrap: anywhere; }',
      '.scw-acpt-sub { font: 500 11px/1.3 system-ui, sans-serif; color: #94a3b8;',
      '  margin-top: 1px; }',
      // Context tags: which bid, which PO, how the bid compared to the
      // SOW. Neutral slate — none of these are good or bad news, and the
      // detail rides in the tooltip so the row stays one glance.
      '.scw-acpt-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }',
      '.scw-acpt-tag { display: inline-flex; align-items: center;',
      '  padding: 2px 7px; border-radius: 4px; background: #f1f5f9;',
      '  border: 1px solid #e2e8f0; color: #475569;',
      '  font: 600 10px/1.4 system-ui, sans-serif; white-space: nowrap;',
      '  max-width: 100%; overflow: hidden; text-overflow: ellipsis; cursor: help; }',
      '.scw-acpt-row .scw-acpt-status { margin: 6px 0 0; gap: 5px; }',
      '.scw-acpt-row .scw-acpt-meta { margin-top: 5px; }',
      '.scw-acpt-row .scw-acpt-pill { padding: 3px 9px; font-size: 11px; }',
      // Grid places the cluster; margin-left:auto would re-pin it right
      // inside its own full-width area, which is the void we just removed.
      '.scw-acpt-row .scw-acpt-actions { margin-left: 0; gap: 14px;',
      '  align-items: flex-start; flex-wrap: wrap; }',
      // ── Paperwork column ───────────────────────
      // Nothing hidden: the tiles moved INTO the gap between the identity
      // and the money, which at desk width was ~900px of nothing while the
      // same tiles doubled the row height from a band underneath.
      '.scw-acpt-docs { grid-area: docs; min-width: 0; }',
      // Only below 1200px, where the tiles fall back to their own band,
      // does the hairline that separated them return.
      '@media (max-width: 1200px) {',
      '  .scw-acpt-docs > .scw-acpt-actions { border-top: 1px dashed #eef2f7;',
      '    padding-top: 12px; }',
      '}',
      '.scw-acpt-row .scw-acpt-btn { padding: 6px 12px; font-size: 11.5px; }',
      // Own mini-modal (link editor / upload progress).
      '.scw-acpt-m-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55);',
      '  z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 18px; }',
      '.scw-acpt-m { background: #fff; color: #0f172a; border-radius: 10px; width: 100%;',
      '  max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif; }',
      '.scw-acpt-m__head { padding: 12px 16px; background: #0f4c75; color: #fff;',
      '  font-weight: 700; font-size: 13.5px; }',
      '.scw-acpt-m__body { padding: 14px 16px; }',
      '.scw-acpt-m__input { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; font: inherit; box-sizing: border-box; }',
      '.scw-acpt-m__input:focus { outline: none; border-color: #0f4c75;',
      '  box-shadow: 0 0 0 3px rgba(15,76,117,.15); }',
      '.scw-acpt-m__status { margin-top: 10px; font-weight: 600; color: #0f4c75; }',
      '.scw-acpt-m__status.is-err { color: #be123c; }',
      '.scw-acpt-m__foot { padding: 11px 16px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc; }',
      '.scw-acpt-m__btn { padding: 7px 14px; border-radius: 5px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.scw-acpt-m__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.scw-acpt-m__btn--ok { background: #0f4c75; color: #fff; }',
      '.scw-acpt-m__btn--ok:disabled { background: #cbd5e1; cursor: not-allowed; }',
      // Destructive action — pinned LEFT of Cancel/OK (repo button-order
      // convention: destructive first, primary last).
      '.scw-acpt-m__btn--danger { background: #fff; color: #be123c;',
      '  border-color: #fca5a5; margin-right: auto; }',
      '.scw-acpt-m__btn--danger:hover { background: #fee2e2; }',
      '.scw-acpt-m__btn--danger:disabled { opacity: .6; cursor: not-allowed; }',
      // ── Uploader: drop zone → file chip → optional check ───────
      // The zone and the chosen-file chip are the same slot in two
      // states, so the modal never grows a second empty target.
      '.scw-acpt-drop { display: flex; flex-direction: column; align-items: center;',
      '  justify-content: center; gap: 4px; padding: 22px 14px; cursor: pointer;',
      '  border: 2px dashed #cbd5e1; border-radius: 9px; background: #f8fafc;',
      '  color: #64748b; text-align: center;',
      '  transition: border-color .12s, background .12s, color .12s; }',
      '.scw-acpt-drop:hover, .scw-acpt-drop:focus-visible { border-color: #0f4c75;',
      '  color: #0f4c75; background: #f1f5f9; outline: none; }',
      '.scw-acpt-drop.is-over { border-color: #0f4c75; background: #e6f0f7;',
      '  color: #0f4c75; border-style: solid; }',
      '.scw-acpt-drop svg { color: inherit; }',
      '.scw-acpt-drop__t { font: 600 13px/1.3 system-ui, sans-serif; }',
      '.scw-acpt-drop__s { font: 500 11.5px/1.3 system-ui, sans-serif; color: #94a3b8; }',
      '.scw-acpt-file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 10px 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d; font: 600 12.5px/1.3 system-ui, sans-serif; }',
      '.scw-acpt-file[hidden] { display: none; }',
      '.scw-acpt-file svg { flex: none; color: #16a34a; }',
      '.scw-acpt-file__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-acpt-file__sz { flex: none; font-weight: 500; color: #4ade80; }',
      '.scw-acpt-file__x { flex: none; border: none; background: transparent;',
      '  color: #15803d; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px;',
      '  opacity: .6; }',
      '.scw-acpt-file__x:hover { opacity: 1; }',
      '.scw-acpt-chk { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px;',
      '  cursor: pointer; font: 500 12.5px/1.4 system-ui, sans-serif; color: #334155; }',
      '.scw-acpt-chk input { margin: 1px 0 0; width: 15px; height: 15px; flex: none;',
      '  accent-color: #0f4c75; cursor: pointer; }',
      // Current-file block at the top of the uploader.
      '.scw-acpt-cur { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }',
      '.scw-acpt-cur__cap { font: 700 9.5px/1 system-ui, sans-serif; letter-spacing: .08em;',
      '  text-transform: uppercase; color: #94a3b8; }',
      '.scw-acpt-cur__file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d !important;',
      '  font: 600 12.5px/1.3 system-ui, sans-serif; text-decoration: none !important; }',
      'a.scw-acpt-cur__file:hover { background: #dcfce7; }',
      '.scw-acpt-cur__file svg { flex: none; color: #16a34a; }',
      '.scw-acpt-cur__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-acpt-cur__hint { flex: none; font: 600 10px/1 system-ui, sans-serif;',
      '  letter-spacing: .06em; text-transform: uppercase; color: #4ade80; }',
      // Outcome toast (uploader auto-closes; results land here).
      '.scw-acpt-toast { position: fixed; left: 50%; bottom: 28px;',
      '  transform: translate(-50%, 10px); z-index: 100001; pointer-events: none;',
      '  background: #0f4c75; color: #fff; padding: 11px 20px; border-radius: 999px;',
      '  font: 600 12.5px/1.45 system-ui, -apple-system, sans-serif;',
      '  box-shadow: 0 10px 28px rgba(15,23,42,.35); max-width: min(560px, 92vw);',
      '  text-align: center; opacity: 0; transition: opacity .25s, transform .25s; }',
      '.scw-acpt-toast.is-in { opacity: 1; transform: translate(-50%, 0); }',
      '.scw-acpt-toast.is-err { background: #be123c; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Greenlight check ────────────────────────────────────────────
  // Asks Make whether the deal is ready to greenlight for install. ALWAYS
  // opt-in: offered after a signed-agreement upload (the user can decline)
  // and available on demand from the row. Never fires on its own.
  function greenlightUrl() {
    var u = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_GREENLIGHT_CHECK_WEBHOOK) || '';
    return (!u || /PLACEHOLDER/i.test(u)) ? '' : u;
  }
  function triggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /** POST the greenlight check. Resolves { ok, data, status }, never rejects
   *  — callers render the outcome. Deliberately a BARE fetch: this is a
   *  third-party host, so no Knack session token rides along (same rule as
   *  the other Make posts in the bundle). */
  function postGreenlight(payload) {
    var url = greenlightUrl();
    if (!url) return Promise.resolve({ ok: false, data: null, status: 0, unconfigured: true });
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* Make's "Accepted" */ }
        return { ok: resp.ok, data: data, status: resp.status };
      });
    }).catch(function (err) {
      return { ok: false, data: null, status: 0, error: (err && err.message) || 'network error' };
    });
  }

  /** Build the payload from a row's already-scraped state. */
  function greenlightPayload(recId, info, source) {
    return {
      acceptanceRecordId: recId,
      proposalId:         info.proposalId || '',
      proposalLabel:      info.proposalLabel || '',
      agreementSigned:    !!info.signed,
      paymentReceived:    !!info.paid,
      approvedForTerms:   !!info.terms,
      // CO acceptance (SW####CO) — the scenario branches on this: change
      // orders skip the ready-to-greenlight question and go straight to
      // the CO apply path.
      changeOrder:        !!info.changeOrder,
      source:             source,
      pageUrl:            (window.location && window.location.href) || '',
      triggeredBy:        triggeredBy()
    };
  }

  /** Run the check and report into an existing modal status element.
   *  `onDone` fires after the view refetch is queued. */
  function runGreenlight(viewKey, recId, info, source, statusEl, btn) {
    // With a statusEl the outcome renders inline (a modal is still open);
    // without one the caller has already closed its modal, so outcomes
    // land as toasts instead.
    function report(msg, isErr) {
      if (statusEl) {
        statusEl.style.display = '';
        statusEl.classList.toggle('is-err', !!isErr);
        statusEl.textContent = msg;
      } else {
        toast(msg, isErr);
      }
    }
    if (statusEl) report('Checking…');
    if (btn) btn.disabled = true;
    return postGreenlight(greenlightPayload(recId, info, source)).then(function (r) {
      var explicitError = r.data && (r.data.success === false || r.data.error);
      if (r.unconfigured) {
        report('Greenlight check isn\'t configured yet.', true);
        if (btn) btn.disabled = false;
        return false;
      }
      if (!r.ok || explicitError) {
        var msg = (r.data && (r.data.error || r.data.message)) ||
          (r.status ? 'Greenlight check failed (HTTP ' + r.status + ')'
                    : 'Greenlight check failed — network error');
        // Toast mode has no modal to retry from — point at the row button.
        report(statusEl ? msg : msg + '. Use “Check greenlight” on the row to retry.', true);
        if (btn) btn.disabled = false;
        return false;
      }
      // Success. Make may answer with a verdict, or just ack (HTTP 200 +
      // "Accepted") while the scenario keeps running past its 40s window —
      // both are fine, so say what we actually know and let the refetch
      // surface whatever flags the scenario flips.
      report((r.data && r.data.message) ||
        (r.data && typeof r.data.greenlit === 'boolean'
          ? (r.data.greenlit ? 'Ready to greenlight.' : 'Not ready to greenlight yet.')
          : 'Greenlight check sent — this panel updates when it finishes.'));
      setTimeout(function () { refreshAcptView(viewKey); }, 2500);
      return true;
    });
  }

  // Bottom-center toast — the uploader closes itself on submit, so async
  // outcomes need somewhere to land that isn't a modal. One at a time;
  // a new toast replaces the current one. Errors linger longer.
  var TOAST_ID = 'scw-acpt-toast';
  function toast(msg, isErr) {
    var t = document.getElementById(TOAST_ID);
    if (t) t.remove();
    t = document.createElement('div');
    t.id = TOAST_ID;
    t.className = 'scw-acpt-toast' + (isErr ? ' is-err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-in'); }, 20);
    setTimeout(function () {
      t.classList.remove('is-in');
      setTimeout(function () { if (t.parentNode) t.remove(); }, 300);
    }, isErr ? 8000 : 4500);
  }

  function pill(label, yes) {
    return '<span class="scw-acpt-pill ' + (yes ? 'is-yes' : 'is-no') + '">' +
      (yes ? CHECK_SVG : CLOCK_SVG) + '<span>' + esc(label) + '</span></span>';
  }

  var PENCIL_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  // ── Own editors (view-based PUT through view_3914) ──────────────
  // The Knack cell-editor proxy proved unreliable against the Vue table
  // renderer, so the card edits directly: a small URL modal for the Xero
  // link, and a file picker + Knack asset upload for the signed agreement.
  // Both PUT through this view with the user's session and refetch so the
  // card rebuilds with the fresh value.

  function refreshAcptView(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    } catch (e) { /* best-effort */ }
  }
  /** Clear a file field on the acceptance. Prefers photo-edit-panel's
   *  clearFileField (it verifies the PUT and retries with '' when Knack
   *  silently ignores null — the file-field quirk); falls back to a plain
   *  null PUT when that module isn't loaded. */
  function clearAcptFile(viewKey, recId, fieldKey) {
    var u = window.SCW && SCW.photoEditPanel && SCW.photoEditPanel.util;
    if (u && typeof u.clearFileField === 'function') {
      return u.clearFileField(viewKey, recId, fieldKey, {});
    }
    var f = {};
    f[fieldKey] = null;
    return putAcceptance(viewKey, recId, f);
  }

  function putAcceptance(viewKey, recId, fields) {
    return new Promise(function (resolve, reject) {
      if (!recId) return reject(new Error('no acceptance record on the page'));
      if (!(window.SCW && typeof SCW.knackAjax === 'function')) {
        return reject(new Error('SCW.knackAjax unavailable'));
      }
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recId),
        type: 'PUT',
        data: JSON.stringify(fields),
        success: resolve,
        error: function (xhr) { reject(new Error('save failed (' + (xhr && xhr.status) + ')')); }
      });
    });
  }

  /** Minimal modal shell. body is an element; returns {backdrop, foot, close}. */
  function acptModal(title, bodyEl, okLabel) {
    var backdrop = document.createElement('div');
    backdrop.className = 'scw-acpt-m-backdrop';
    backdrop.innerHTML =
      '<div class="scw-acpt-m">' +
        '<div class="scw-acpt-m__head"></div>' +
        '<div class="scw-acpt-m__body"></div>' +
        '<div class="scw-acpt-m__foot">' +
          '<button type="button" class="scw-acpt-m__btn scw-acpt-m__btn--cancel">Cancel</button>' +
          '<button type="button" class="scw-acpt-m__btn scw-acpt-m__btn--ok"></button>' +
        '</div>' +
      '</div>';
    backdrop.querySelector('.scw-acpt-m__head').textContent = title;
    backdrop.querySelector('.scw-acpt-m__body').appendChild(bodyEl);
    var ok = backdrop.querySelector('.scw-acpt-m__btn--ok');
    ok.textContent = okLabel || 'Save';
    function close() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
    backdrop.querySelector('.scw-acpt-m__btn--cancel').addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    return { backdrop: backdrop, ok: ok, close: close };
  }

  /** Link-field editor (Xero invoice field_1847 / Xero estimate
   *  field_2948) — URL input modal, PUT through the view. */
  function openLinkEditor(viewKey, recId, fieldKey, title, currentUrl) {
    var body = document.createElement('div');
    body.innerHTML =
      '<input type="url" class="scw-acpt-m__input" placeholder="https://…">' +
      '<div class="scw-acpt-m__status" style="display:none"></div>';
    var input = body.querySelector('input');
    input.value = currentUrl || '';
    var m = acptModal(title, body, 'Save link');
    setTimeout(function () { input.focus(); input.select(); }, 30);
    var status = body.querySelector('.scw-acpt-m__status');
    function fail(msg) {
      status.style.display = '';
      status.classList.add('is-err');
      status.textContent = msg;
      m.ok.disabled = false;
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.ok.click(); });
    m.ok.addEventListener('click', function () {
      var url = input.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      m.ok.disabled = true;
      status.style.display = '';
      status.classList.remove('is-err');
      status.textContent = 'Saving…';
      var fields = {};
      fields[fieldKey] = url;   // empty string clears the link
      putAcceptance(viewKey, recId, fields).then(function () {
        m.close();
        refreshAcptView(viewKey);
      }).catch(function (err) { fail((err && err.message) || 'Save failed'); });
    });
  }

  /** File-field editor (signed agreement field_2767 / bid basis PDF
   *  field_2947). ONE modal for the whole slot — clicking anywhere on a
   *  populated tile lands here, so there's no viewer/editor split:
   *    - shows the CURRENT file (opens in a new tab),
   *    - takes a replacement by drop or browse,
   *    - carries the greenlight-check option (agreement only).
   *  One submit does everything, then the modal closes ITSELF — outcomes
   *  land as toasts, so there's nothing left to click through.
   *
   *  opts: { offerGreenlight: bool, autoGreenlight: bool, info: {...},
   *          greenlightLabel: string, current: { name, href } | null }
   *  autoGreenlight (change orders): no checkbox — a successful upload
   *  ALWAYS fires the greenlight webhook (payload.changeOrder tells the
   *  scenario to take the CO branch). */
  function openFileUpload(viewKey, recId, fieldKey, title, opts) {
    opts = opts || {};
    var autoGl = !!(opts.autoGreenlight && greenlightUrl());
    var wantsGreenlight = !!(opts.offerGreenlight && greenlightUrl()) && !autoGl;
    var current = opts.current || null;

    var body = document.createElement('div');
    body.innerHTML =
      // Current file — visible the moment the modal opens, clicks out to
      // a new tab (no z-index fight with Knack's lightbox under our modal).
      (current
        ? '<div class="scw-acpt-cur">' +
            '<div class="scw-acpt-cur__cap">Current file</div>' +
            (current.href
              ? '<a class="scw-acpt-cur__file" target="_blank" rel="noopener" href="' + esc(current.href) + '" ' +
                   'title="Open ' + esc(current.name || 'file') + ' in a new tab">' +
                  FILE_SVG + '<span class="scw-acpt-cur__nm">' + esc(current.name || 'file') + '</span>' +
                  '<span class="scw-acpt-cur__hint">view</span>' +
                '</a>'
              : '<span class="scw-acpt-cur__file">' + FILE_SVG +
                  '<span class="scw-acpt-cur__nm">' + esc(current.name || 'file') + '</span></span>') +
          '</div>'
        : '') +
      '<div class="scw-acpt-drop" tabindex="0" role="button" ' +
           'aria-label="' + (current ? 'Drop a replacement here or click to browse'
                                     : 'Drop a file here or click to browse') + '">' +
        UPLOAD_SVG +
        '<div class="scw-acpt-drop__t">' + (current ? 'Drop a replacement here' : 'Drop the file here') + '</div>' +
        '<div class="scw-acpt-drop__s">or click to browse</div>' +
      '</div>' +
      '<div class="scw-acpt-file" hidden>' +
        FILE_SVG +
        '<span class="scw-acpt-file__nm"></span>' +
        '<span class="scw-acpt-file__sz"></span>' +
        '<button type="button" class="scw-acpt-file__x" title="Choose a different file">&times;</button>' +
      '</div>' +
      (wantsGreenlight
        ? '<label class="scw-acpt-chk">' +
            '<input type="checkbox" checked>' +
            '<span>' + esc(opts.greenlightLabel ||
              'Check whether this deal is ready to greenlight') + '</span>' +
          '</label>'
        : '') +
      '<div class="scw-acpt-m__status" style="display:none"></div>';

    var m       = acptModal(title, body, 'Upload');

    // Remove file — only when a file is on record. Clears the field (the
    // slot returns to its empty "+ add" state); the previously uploaded
    // asset itself isn't destroyed, and NO webhook fires on removal (the
    // greenlight/CO fire is strictly tied to an upload).
    if (current) {
      var rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'scw-acpt-m__btn scw-acpt-m__btn--danger';
      rmBtn.textContent = 'Remove file';
      var foot = m.backdrop.querySelector('.scw-acpt-m__foot');
      foot.insertBefore(rmBtn, foot.firstChild);
      rmBtn.addEventListener('click', function () {
        if (!window.confirm('Remove "' + (current.name || 'this file') +
              '" from this record?\n\nThe slot goes back to empty — you can ' +
              'upload a new file any time.')) return;
        rmBtn.disabled = true;
        rmBtn.textContent = 'Removing…';
        m.ok.disabled = true;
        clearAcptFile(viewKey, recId, fieldKey).then(function () {
          m.close();
          refreshAcptView(viewKey);
          toast(title + ' removed.');
        }).catch(function (err) {
          rmBtn.disabled = false;
          rmBtn.textContent = 'Remove file';
          fail((err && err.message) || 'Remove failed');
        });
      });
    }

    var drop    = body.querySelector('.scw-acpt-drop');
    var chip    = body.querySelector('.scw-acpt-file');
    var chipNm  = body.querySelector('.scw-acpt-file__nm');
    var chipSz  = body.querySelector('.scw-acpt-file__sz');
    var chipX   = body.querySelector('.scw-acpt-file__x');
    var glCheck = body.querySelector('.scw-acpt-chk input');
    var status  = body.querySelector('.scw-acpt-m__status');
    var chosen  = null;

    // Hidden native input — the dropzone's click/keyboard path.
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,image/*,application/pdf';
    input.style.display = 'none';
    body.appendChild(input);

    // The primary button says exactly what submit will do: a replacement
    // chosen → "Upload"; nothing chosen but the check ticked on an
    // already-populated slot → "Run check"; otherwise there's nothing to
    // submit and it stays disabled.
    function updateOk() {
      if (chosen) { m.ok.textContent = 'Upload'; m.ok.disabled = false; return; }
      if (current && wantsGreenlight && glCheck && glCheck.checked) {
        m.ok.textContent = 'Run check'; m.ok.disabled = false; return;
      }
      m.ok.textContent = 'Upload';
      m.ok.disabled = true;
    }

    function fmtSize(n) {
      if (!n && n !== 0) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function setFile(file) {
      chosen = file || null;
      if (!chosen) {
        chip.hidden = true;
        drop.hidden = false;
      } else {
        chipNm.textContent = chosen.name || 'file';
        chipSz.textContent = fmtSize(chosen.size);
        chip.hidden = false;
        drop.hidden = true;        // the chip IS the state — no duplicate zone
        status.style.display = 'none';
        status.classList.remove('is-err');
      }
      updateOk();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      setFile(input.files && input.files[0]);
    });
    chipX.addEventListener('click', function () {
      input.value = '';
      setFile(null);
    });
    if (glCheck) glCheck.addEventListener('change', updateOk);
    updateOk();

    // Drag + drop. dragover MUST preventDefault or the browser navigates to
    // the file instead of firing drop.
    ['dragenter', 'dragover'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-over');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) setFile(dt.files[0]);
    });
    // A miss anywhere else in the modal must not hand the page to the file.
    ['dragover', 'drop'].forEach(function (evt) {
      m.backdrop.addEventListener(evt, function (e) {
        if (drop.contains(e.target)) return;
        e.preventDefault();
      });
    });

    function fail(msg) {
      status.style.display = '';
      status.classList.add('is-err');
      status.textContent = msg;
      m.ok.disabled = false;
      m.ok.textContent = 'Upload';
    }
    function say(msg) {
      status.style.display = '';
      status.classList.remove('is-err');
      status.textContent = msg;
    }

    m.ok.addEventListener('click', function () {
      var manualCheck = !!(wantsGreenlight && glCheck && glCheck.checked);
      var runCheck = manualCheck || autoGl;

      // Check-only submit (populated slot, no replacement chosen): fire
      // and close — the outcome arrives as a toast. Manual mode only; the
      // auto (CO) fire is tied to an actual upload.
      if (!chosen) {
        if (!manualCheck) return;
        m.close();
        toast('Checking greenlight…');
        runGreenlight(viewKey, recId, opts.info || {}, 'manual', null, null);
        return;
      }

      m.ok.disabled = true;
      m.ok.textContent = 'Uploading…';
      say('Uploading ' + (chosen.name || 'file') + '…');

      var fd = new FormData();
      fd.append('files', chosen, chosen.name || 'agreement.pdf');
      $.ajax({
        url: Knack.api_url + '/v1/applications/' + Knack.application_id + '/assets/file/upload',
        type: 'POST',
        data: fd,
        processData: false,
        contentType: false,
        headers: {
          'X-Knack-Application-Id': Knack.application_id,
          'x-knack-rest-api-key': 'knack',
          'Authorization': Knack.getUserToken()
        },
        success: function (res) {
          var assetId = res && (res.id || (res.asset && res.asset.id));
          if (!assetId) return fail('Upload failed — no asset id returned.');
          say('Saving…');
          var fields = {};
          fields[fieldKey] = assetId;
          putAcceptance(viewKey, recId, fields).then(function () {
            // Saved — close immediately and report by toast. The check is
            // a separate promise: if it fails, the toast says the file
            // still landed. Failures BEFORE this point keep the modal open
            // (an error the user must retry can't auto-dismiss).
            m.close();
            refreshAcptView(viewKey);
            if (runCheck) {
              toast(autoGl ? 'Uploaded — sending the signed change order to Make…'
                           : 'Uploaded — checking greenlight…');
              runGreenlight(viewKey, recId, opts.info || {},
                autoGl ? 'co-agreement-upload-auto' : 'agreement-upload',
                null, null);
            } else {
              toast(title + ' uploaded.');
            }
          }).catch(function (err) {
            fail((err && err.message) || 'Save failed');
          });
        },
        error: function (xhr) {
          fail('Upload failed (' + (xhr && xhr.status) + ')');
        }
      });
    });

    setTimeout(function () { drop.focus(); }, 30);
  }

  /** Standalone greenlight check (row button): confirm, fire, close —
   *  the outcome lands as a toast. */
  function openGreenlightCheck(viewKey, recId, info) {
    var body = document.createElement('div');
    body.innerHTML = '<div>Ask Make whether this deal is ready to greenlight for install?</div>';
    var m = acptModal('Greenlight check', body, 'Run check');
    m.ok.addEventListener('click', function () {
      m.close();
      toast('Checking greenlight…');
      runGreenlight(viewKey, recId, info, 'manual', null, null);
    });
  }

  /** One compact list row for one acceptance record. All anchors/editors
   *  bind to THIS row's record. */
  function buildCard(viewKey, row, bySow, moneyCols, survey) {
    var recId   = row.id;
    var propA   = cellAnchor(row, F.proposal, 'a[data-kn="connection-link"]') || cellAnchor(row, F.proposal);
    var propTxt = propA ? propA.textContent.replace(/\s+/g, ' ').trim() : (cellText(row, F.proposal) || 'Proposal');
    var propHref = propA ? (propA.getAttribute('href') || '') : '';
    var paid    = isYes(cellText(row, F.payment));
    var signed  = isYes(cellText(row, F.signed));
    // When approved for terms, the initial-payment requirement is waived —
    // show an "Approved for terms" pill in place of the payment-received pill.
    var terms   = isYes(cellText(row, F.terms));
    var xeroA    = cellAnchor(row, F.xero);
    var xeroEstA = cellAnchor(row, F.xeroEst);
    var contractId = cellText(row, F.contract);
    var fileA    = cellAnchor(row, F.agreement, 'a.kn-view-asset') || cellAnchor(row, F.agreement);
    var bidPdfA  = cellAnchor(row, F.bidPdf, 'a.kn-view-asset') || cellAnchor(row, F.bidPdf);
    var actionA  = row.querySelector('.kn-action-link') || row.querySelector('.kn-table-link a');

    // Connected proposal's record id — the 24-hex class on the connection
    // span (see CLAUDE.md "Reading Connection Fields from Table DOM"),
    // falling back to a hex run in the link href.
    var propId = '';
    var propSpan = row.querySelector('td.' + F.proposal + ' span[data-kn="connection-value"]');
    if (propSpan) propId = (propSpan.className || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(propId)) {
      var hrefHex = propHref.match(/[a-f0-9]{24}/i);
      propId = hrefHex ? hrefHex[0] : '';
    }

    // One tile per document. DONE → green tile, leading check; the main
    // zone opens the doc, the hover-revealed pencil edits it. MISSING →
    // dashed ghost with a leading plus; the whole tile opens the editor.
    // `full` is the untruncated document name (tooltips + aria); `label`
    // is the short on-tile text (the pair caption carries the context).
    function fileSlot(fk, label, full, anchor, editTitle) {
      // No file, but the document EXISTS as stored HTML: offer the thing
      // itself rather than only an upload placeholder. Neutral styling —
      // it's a document to read, not a satisfied checklist item — with the
      // pencil still there to attach the PDF.
      if (!anchor && fk === F.bidPdf && docHtml) {
        return '<span class="scw-acpt-doc scw-acpt-doc--html">' +
          '<a class="scw-acpt-doc__open" data-bid-doc="1" href="javascript:void(0)" ' +
            'title="Open the stored bid document (no PDF attached)">' + FILE_SVG +
            '<span class="scw-acpt-doc__lbl">Bid document</span>' +
          '</a>' +
          '<button type="button" class="scw-acpt-doc__edit" data-edit-field="' + fk + '" ' +
            'title="Attach a bid PDF">' + PENCIL_SVG + '</button>' +
        '</span>';
      }
      if (!anchor) {
        return '<button type="button" class="scw-acpt-doc--missing" data-edit-field="' + fk + '" title="Add ' + esc(full) + '">' +
          PLUS_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span></button>';
      }
      // Populated: the WHOLE tile (main zone and pencil alike) opens the
      // uploader modal, which shows the current file and takes a
      // replacement — one behavior, no viewer/editor split.
      return '<span class="scw-acpt-doc">' +
        '<a class="scw-acpt-doc__open" data-edit-field="' + fk + '" href="javascript:void(0)" title="View or replace ' + esc(full) + '">' +
          CHECK_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span>' +
        '</a>' +
        '<button type="button" class="scw-acpt-doc__edit" data-edit-field="' + fk + '" title="' + esc(editTitle) + '">' + PENCIL_SVG + '</button>' +
      '</span>';
    }
    function linkSlot(fk, label, full, anchor, editTitle) {
      if (!anchor) {
        return '<button type="button" class="scw-acpt-doc--missing" data-edit-field="' + fk + '" title="Add ' + esc(full) + '">' +
          PLUS_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span></button>';
      }
      return '<span class="scw-acpt-doc">' +
        '<a class="scw-acpt-doc__open" target="_blank" rel="noopener" href="' + esc(anchor.getAttribute('href') || '') + '" title="Open ' + esc(full) + '">' +
          CHECK_SVG + '<span class="scw-acpt-doc__lbl">' + esc(label) + '</span>' +
        '</a>' +
        '<button type="button" class="scw-acpt-doc__edit" data-edit-field="' + fk + '" title="' + esc(editTitle) + '">' + PENCIL_SVG + '</button>' +
      '</span>';
    }

    // Change-order acceptances (SOW number "SW####CO") have no initial
    // payment — the CO amount rides the final project invoice — so the
    // payment pill is noise there. Signature is the only gate.
    var snap  = readSnapshot(viewKey, row);
    var isCo  = /\bSW\d+CO\b/i.test(propTxt) || isCoSnapshot(snap);
    // Same money as the sub card, same sources and same priority — ops
    // reads the figures it's asking the sub to agree to, so the two
    // surfaces can't quietly disagree. Provenance travels with it.
    var amt      = bidAmountOf(row, snap, bySow);
    var total    = amt ? money(amt.amount) : '';
    var totalLbl = isCo ? 'Change order total' : 'Bid total';
    // Ops context that belongs on a paperwork row: WHICH bid was priced,
    // the PO it's billed against, and whether the sub priced what we
    // scoped. Each is omitted when its column is absent or blank — the
    // meta line only appears when it has something to say.
    var basisNo  = cellText(row, F.bidBasis);
    var poNo     = cellText(row, F.po);
    var diff     = diffSummary(row);
    var billed   = billedOf(row, moneyCols);
    // Survey cost travels with the SOW this acceptance's proposal was
    // accepted from, so it lands on the right row when a project has a
    // base SOW plus change-order SOWs.
    var sowRef   = sowRefOf(viewKey, row);
    var svyCost  = surveyCostFor(sowRef, survey);
    var docHtml  = bidDocHtml(row);
    var meta = '';
    if (basisNo) {
      meta += '<span class="scw-acpt-tag" title="Priced from bid ' + esc(basisNo) + '">' +
        'Bid ' + esc(basisNo) + '</span>';
    }
    if (poNo) {
      meta += '<span class="scw-acpt-tag" title="Purchase order">PO ' + esc(poNo) + '</span>';
    }
    if (diff) {
      // The COUNT and the money delta are the signal; the tier breakdown
      // is detail, so it rides in the tooltip. Spelling all four tiers
      // inline made a tag wider than the column it sits in.
      meta += '<span class="scw-acpt-tag" title="' +
        esc(diff.n
          ? diff.breakdown + '. Full comparison lives on the bid review page.'
          : 'The sub priced the SOW as scoped.') + '">' +
        esc(diff.text) +
        (diff.delta ? ' · labor Δ $' + esc(diff.delta) : '') +
      '</span>';
    }

    // Already greenlit: agreement signed AND (payment received OR approved
    // for terms) — signature alone for COs, matching the pill logic above.
    // Once true there's nothing left to check, so every greenlight-check
    // affordance (row button + the uploader's checkbox) disappears.
    var greenlit = signed && (isCo || paid || terms);

    // "61507493933-SW1347 | 20260807-11068" → bold deal-SOW title with the
    // proposal id as a muted sub-line (the pipe tail was noise in the title).
    var propMain = propTxt, propSub = '';
    var pSplit = propTxt.split(/\s*\|\s*/);
    if (pSplit.length === 2 && pSplit[1]) { propMain = pSplit[0]; propSub = pSplit[1]; }

    var html =
      '<div class="scw-acpt-id">' +
        (propHref
          ? '<a class="scw-acpt-title" href="' + esc(propHref) + '">' + esc(propMain) + '</a>'
          : '<div class="scw-acpt-title">' + esc(propMain) + '</div>') +
        (propSub ? '<div class="scw-acpt-sub">Proposal ' + esc(propSub) + '</div>' : '') +
        (meta ? '<div class="scw-acpt-meta">' + meta + '</div>' : '') +
        // Status belongs under the thing it describes, and keeps the top
        // line to just name + figure.
        '<div class="scw-acpt-status">' +
          (isCo ? '' :
            (terms
              ? pill('Approved for terms', true)
              : pill(paid ? 'Initial payment received' : 'Initial payment pending', paid))) +
          pill(signed ? 'Agreement signed' : 'Agreement not signed', signed) +
        '</div>' +
      '</div>' +
      // Two money columns, straight into the row\'s own grid tracks — no
      // wrapper. A wrapper would size itself to its content and the
      // columns would drift row to row; as grid children they inherit the
      // card\'s fixed tracks, which is what holds the axis.
      (billed
        ? equipCell(billed.equip != null ? money(billed.equip) : '') +
          // No total column: it\'s exactly equipment + labor billed, both
          // of which are right here.
          laborStat(billed.install, amt, svyCost)
        // No billed columns on the view: nothing to compare against, so
        // the row keeps its single figure — what we pay the sub. It sits
        // in the labor track, since that is what it measures.
        : equipCell('') +
          '<span class="scw-acpt-col scw-acpt-col--labor">' +
            (total
              ? line(esc(total), esc(totalLbl).toLowerCase()) +
                (amt.source === 'derived'
                  ? line('', '<span class="scw-acpt-line__src" title="' +
                      esc(DERIVED_NOTE) + '">from line items</span>')
                  : '')
              : '') +
          '</span>') +
      // Paperwork rides in the MIDDLE column, in the horizontal void that
      // used to sit between the identity and the money. As its own
      // full-width band underneath it doubled every row's height while
      // ~900px beside it went unused — same tiles, half the rows.
      '<div class="scw-acpt-docs">' +
      '<div class="scw-acpt-actions">' +
        // Two captioned mirror pairs: the signed agreement with its
        // invoice, and the bid basis PDF with its Xero estimate. The
        // caption carries the context so tile labels stay short enough
        // to never truncate.
        '<span class="scw-acpt-pair">' +
          '<span class="scw-acpt-pair__cap">Agreement</span>' +
          '<span class="scw-acpt-pair__tiles">' +
            fileSlot(F.agreement, 'Signed PDF',   'signed agreement',   fileA,    'Replace signed agreement') +
            linkSlot(F.xero,      'Xero invoice', 'Xero invoice link',  xeroA,    'Edit Xero invoice link') +
            // eSignatures contract page — display-only reference, present
            // only when the row carries a contract id.
            (contractId
              ? '<a class="scw-acpt-ref" target="_blank" rel="noopener" href="' +
                  esc(ESIGN_URL_PREFIX + encodeURIComponent(contractId)) + '" ' +
                  'title="Open the eSignatures contract in a new tab">' +
                  LINK_SVG + '<span class="scw-acpt-doc__lbl">eSign contract</span></a>'
              : '') +
          '</span>' +
        '</span>' +
        '<span class="scw-acpt-pair">' +
          '<span class="scw-acpt-pair__cap">Estimate</span>' +
          '<span class="scw-acpt-pair__tiles">' +
            fileSlot(F.bidPdf,    'Bid PDF',       'bid basis PDF',      bidPdfA,  'Replace bid basis PDF') +
            linkSlot(F.xeroEst,   'Xero estimate', 'Xero estimate link', xeroEstA, 'Edit Xero estimate link') +
          '</span>' +
        '</span>' +
        // Re-run the greenlight check without touching the agreement.
        // Only once there's an agreement on file (nothing to check before
        // that), only while the deal is NOT already greenlit, and only
        // when the scenario is configured.
        ((fileA && !greenlit && greenlightUrl())
          ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--ghost" data-greenlight="1" ' +
            'title="Check whether this deal is ready to greenlight for install">Check greenlight</button>'
          : '') +
        (actionA ? '<button type="button" class="scw-acpt-btn scw-acpt-btn--primary" data-proxy="action">Create Questionnaire</button>' : '') +
      '</div></div>';

    var card = document.createElement('div');
    card.className = 'scw-acpt-row';
    card.innerHTML = html;

    var actBtn = card.querySelector('[data-proxy="action"]');
    if (actBtn && actionA) actBtn.addEventListener('click', function () { actionA.click(); });

    // Row state the greenlight payload carries, snapshotted at build time.
    var glInfo = {
      proposalId:    propId,
      proposalLabel: propTxt,
      signed:        signed,
      paid:          paid,
      terms:         terms,
      changeOrder:   isCo
    };
    var glBtn = card.querySelector('[data-greenlight]');
    if (glBtn) {
      glBtn.addEventListener('click', function () {
        openGreenlightCheck(viewKey, recId, glInfo);
      });
    }

    // Stored bid document → its own tab, printable.
    var docBtns = card.querySelectorAll('[data-bid-doc]');
    for (var db = 0; db < docBtns.length; db++) {
      docBtns[db].addEventListener('click', function (e) {
        e.preventDefault();
        openBidDoc(docHtml, 'Bid document — ' + propMain);
      });
    }

    // Edit / add affordances → the card's own editors (view-based PUT
    // against THIS row's record id).
    var editBtns = card.querySelectorAll('[data-edit-field]');
    for (var eb = 0; eb < editBtns.length; eb++) {
      editBtns[eb].addEventListener('click', function () {
        var fk = this.getAttribute('data-edit-field');
        if (fk === F.xero) {
          openLinkEditor(viewKey, recId, F.xero, 'Xero invoice link',
            xeroA ? (xeroA.getAttribute('href') || '') : '');
        } else if (fk === F.xeroEst) {
          openLinkEditor(viewKey, recId, F.xeroEst, 'Xero estimate link',
            xeroEstA ? (xeroEstA.getAttribute('href') || '') : '');
        } else if (fk === F.agreement) {
          openFileUpload(viewKey, recId, F.agreement, 'Signed agreement', {
            // Change orders don't ASK — a CO's signed agreement always
            // fires the webhook (Make's scenario branches on
            // payload.changeOrder into the CO apply path), so the opt-in
            // checkbox is base-scope only.
            offerGreenlight: !greenlit && !isCo,
            autoGreenlight:  isCo,
            info: glInfo,
            greenlightLabel: 'Also check whether this deal is ready to greenlight',
            current: fileA ? { name: (fileA.textContent || '').replace(/\s+/g, ' ').trim(),
                              href: fileA.getAttribute('href') || '' } : null
          });
        } else if (fk === F.bidPdf) {
          openFileUpload(viewKey, recId, F.bidPdf, 'Bid basis PDF', {
            current: bidPdfA ? { name: (bidPdfA.textContent || '').replace(/\s+/g, ' ').trim(),
                                href: bidPdfA.getAttribute('href') || '' } : null
          });
        }
      });
    }
    return { el: card, isCo: isCo, amount: amt ? amt.amount : null,
             source: amt ? amt.source : '', billed: billed,
             sowKey: sowRef.id || sowRef.token, survey: svyCost };
  }

  /** SUB VARIANT — one read-only row per acceptance: the bid we're paying
   *  against, its total, and the paperwork pills. Nothing here writes,
   *  proxies a Knack action, or renders the snapshot's diff. */
  function buildSubRow(viewKey, row, bySow) {
    var snap = readSnapshot(viewKey, row);
    // The bid PDF cell ("Matching Bid", field_2947) — reuse Knack's own
    // asset href so the file opens through Knack's viewer as usual.
    var bidPdfA = cellAnchor(row, F.bidPdf, 'a.kn-view-asset') || cellAnchor(row, F.bidPdf);
    var pdfName = bidPdfA
      ? (bidPdfA.getAttribute('data-file-name') ||
         (bidPdfA.textContent || '').replace(/\s+/g, ' ').trim())
      : '';
    // ONE representation of the bid. The snapshot's basis name is the real
    // designation ("BD-2", or the K1 label); the file name stands in when
    // there isn't one. Whatever ends up as the name IS the link to the PDF
    // — never a name plus a separate button that opens the same document.
    // The file name only repeats as a sub-line when it isn't already the
    // name (i.e. when we have a real designation to lead with).
    // Proposal identifier embeds the SOW number ("<project#>-<SOW#> | <quote#>")
    // — when the column is exposed, lead with the SOW so a project with a
    // base SOW plus change orders is readable. Fail quiet when it isn't.
    var propTxt = cellText(row, F.proposal);
    var sowNo   = (propTxt.split(/\s*\|\s*/)[0] || '').trim();
    // A change order: the SOW number's CO suffix when we can see it, else
    // the snapshot's own shape — a CO acceptance carries the sub-pricing
    // snapshot, which a base-scope one never does. Matters because a CO
    // has no initial payment (it rides the final project invoice), so the
    // payment pill is noise on it.
    var isCoRow = /\bSW\d+CO\b/i.test(propTxt) || isCoSnapshot(snap);

    var basisName = String((snap && snap.basisBidName) || '').trim() || pdfName ||
      (isCoRow ? 'Change order pricing' : 'Not designated yet');
    var pdfHref  = bidPdfA ? (bidPdfA.getAttribute('href') || '') : '';
    // No PDF but the document is stored as HTML — the name opens THAT, so
    // the sub can still read (and print) the bid it's working from.
    var subDocHtml = pdfHref ? '' : bidDocHtml(row);
    var fileSub  = (pdfName && pdfName !== basisName) ? pdfName : '';
    // No document to name a CO's pricing by — say when it was submitted
    // and by whom instead of leaving the row bare.
    if (!fileSub && isCoSnapshot(snap)) {
      var when = shortDate(snap.sentAt);
      var who  = String((snap.sentBy && snap.sentBy.name) || '').trim();
      if (when || who) {
        fileSub = 'Submitted' + (when ? ' ' + when : '') + (who ? ' by ' + who : '');
      }
    }
    var nameHtml;
    if (pdfHref) {
      nameHtml = '<a class="scw-acpt-title scw-acpt-title--doc" href="' + esc(pdfHref) + '" ' +
        'title="Open ' + esc(pdfName || 'the bid PDF') + '">' + FILE_SVG +
        '<span>' + esc(basisName) + '</span></a>';
    } else if (subDocHtml) {
      nameHtml = '<a class="scw-acpt-title scw-acpt-title--doc" data-bid-doc="1" ' +
        'href="javascript:void(0)" title="Open the bid document">' + FILE_SVG +
        '<span>' + esc(basisName) + '</span></a>';
    } else {
      nameHtml = '<div class="scw-acpt-title">' + esc(basisName) + '</div>';
    }
    var amt    = bidAmountOf(row, snap, bySow);
    var total  = amt ? money(amt.amount) : '';
    // A CO total is a signed CHANGE (removes credit back), so it can't
    // wear the same label as a base-scope bid total.
    var totalLbl = isCoRow ? 'Change order total' : 'Bid total';
    var paid   = isYes(cellText(row, F.payment));
    var signed = isYes(cellText(row, F.signed));
    var terms  = isYes(cellText(row, F.terms));

    // Identity column carries everything that describes the scope —
    // including its status pills, which belong under the thing they
    // describe. The money column is last and right-aligned in every row
    // (and in the tally), so all the figures share one edge; it renders
    // even when empty so a row without a total doesn't shift the others.
    var html =
      '<div class="scw-acpt-id">' +
        '<div class="scw-acpt-pair__cap">' +
          (sowNo ? esc(sowNo) : 'Priced from') + '</div>' +
        '<div class="scw-acpt-basis">' +
          nameHtml +
          (fileSub ? '<div class="scw-acpt-sub">' + esc(fileSub) + '</div>' : '') +
        '</div>' +
        '<div class="scw-acpt-status">' +
          // A change order carries no initial payment (it rides the final
          // project invoice), so signature is its only gate — same rule
          // the ops card uses.
          (isCoRow ? '' :
            (terms
              ? pill('Approved for terms', true)
              : pill(paid ? 'Initial payment received' : 'Initial payment pending', paid))) +
          pill(signed ? 'Agreement signed' : 'Agreement not signed', signed) +
        '</div>' +
      '</div>' +
      '<div class="scw-acpt-money">' +
        (total
          ? '<div class="scw-acpt-total">' +
              '<span class="scw-acpt-total__lbl">' + esc(totalLbl) + '</span>' +
              '<span class="scw-acpt-total__val">' + esc(total) + '</span>' +
              (amt.source === 'derived'
                ? '<span class="scw-acpt-total__src" title="' + esc(DERIVED_NOTE) + '">' +
                    'from line items</span>'
                : '') +
            '</div>'
          : '') +
      '</div>';

    var el = document.createElement('div');
    el.className = 'scw-acpt-row scw-acpt-row--sub';
    el.innerHTML = html;
    var subDocBtns = el.querySelectorAll('[data-bid-doc]');
    for (var sd = 0; sd < subDocBtns.length; sd++) {
      subDocBtns[sd].addEventListener('click', function (e) {
        e.preventDefault();
        openBidDoc(subDocHtml, 'Bid document — ' + (sowNo || basisName));
      });
    }
    return { el: el, isCo: isCoRow, amount: amt ? amt.amount : null,
             source: amt ? amt.source : '' };
  }

  /** Running tally for the sub: what the scope started at, what the change
   *  orders moved it by, and where it stands. Only when there IS a change
   *  order and a base figure to add it to — with one base row and nothing
   *  else, the row's own total already says it, and a "total" that quietly
   *  omits an unknown base would be worse than no total at all. */
  /** PROJECT ROLLUP — the same two money columns summed across every
   *  acceptance on the project (base scope + each change order), so the
   *  labor rate for the project overall reads in the same place the
   *  per-row one does. Null for a single row: that row already IS the
   *  project, and a footer repeating it is noise. */
  function buildProjectMoney(entries) {
    var eq = null, inst = null, sub = null, svy = null;
    var billedRows = 0, derived = false;
    var seenSow = Object.create(null);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], b = e.billed;
      if (b) {
        billedRows++;
        if (b.equip   != null) eq   = (eq   == null ? 0 : eq)   + b.equip;
        if (b.install != null) inst = (inst == null ? 0 : inst) + b.install;
      }
      if (e.amount != null) {
        sub = (sub == null ? 0 : sub) + e.amount;
        if (e.source === 'derived') derived = true;
      }
      // ONCE PER SOW. Two acceptances against the same SOW (a re-issue,
      // say) share its one survey — counting it twice would invent cost
      // and understate the project rate.
      if (e.survey != null && e.sowKey && !seenSow[e.sowKey]) {
        seenSow[e.sowKey] = 1;
        svy = (svy == null ? 0 : svy) + e.survey;
      }
    }
    // The footer earns its place when it SUMS something — two or more
    // billed rows — or when there's a base-vs-CO split to explain. A view
    // with no billed columns still has the split, which is the whole
    // footer in that case.
    var split = splitLine(entries);
    if (billedRows < 2 && !split) return null;
    var el = document.createElement('div');
    el.className = 'scw-acpt-foot';
    el.innerHTML =
      '<span class="scw-acpt-id">' +
        '<span class="scw-acpt-foot__cap">' +
          (billedRows < 2 ? 'Project total' : 'Project') + '</span>' +
        split +
      '</span>' +
      equipCell(eq != null ? money(eq) : '') +
      laborStat(inst, sub == null ? null : { amount: sub,
        source: derived ? 'derived' : 'quoted' }, svy);
    return el;
  }

  /** The base-scope + change-order split, as a line under PROJECT. It
   *  explains the project's "billed by sub" figure one column over — which
   *  is the same number as this line's total — rather than restating it in
   *  a band of its own. Only when there IS a change order and a base figure
   *  to add it to: with one base row the row's own figure already says it,
   *  and a total that quietly omits an unknown base is worse than none. */
  function splitLine(entries) {
    var base = 0, baseN = 0, co = 0, coN = 0, derived = false;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.amount == null) continue;
      if (e.source === 'derived') derived = true;
      if (e.isCo) { co += e.amount; coN++; }
      else { base += e.amount; baseN++; }
    }
    if (!coN || !baseN) return '';
    function n(v) { return '<span class="scw-acpt-split__n">' + esc(v) + '</span>'; }
    function op(v) { return '<span class="scw-acpt-split__op">' + v + '</span>'; }
    return '<span class="scw-acpt-split">' +
      n(money(base)) + '<span>' + (baseN > 1 ? 'original bids' : 'original bid') + '</span>' +
      op('+') +
      // Signed, not coloured: the sign says which way the scope moved and
      // that's all it means.
      n((co > 0 ? '+' : '') + money(co)) +
      '<span>' + (coN > 1 ? coN + ' change orders' : 'change order') + '</span>' +
      op('=') + n(money(base + co)) + '<span>to sub</span>' +
      (derived
        ? op('\u00b7') + '<span class="scw-acpt-split__note" title="' +
            esc(DERIVED_NOTE) + '">includes line-item sums</span>'
        : '') +
      '</span>';
  }

  /** SUB CARD ONLY — the running tally band. The sub card keeps its
   *  single-figure money column (it never sees equipment or the billed
   *  side), so the ops card's folded split line has nothing to attach to
   *  here; this stays its own band. */
  function buildTally(entries) {
    var base = 0, baseN = 0, co = 0, coN = 0, derived = false;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.amount == null) continue;
      if (e.source === 'derived') derived = true;
      if (e.isCo) { co += e.amount; coN++; }
      else { base += e.amount; baseN++; }
    }
    if (!coN || !baseN) return null;
    function cell(lbl, val, mod) {
      return '<span class="scw-acpt-tally__cell' + (mod ? ' ' + mod : '') + '">' +
        '<span class="scw-acpt-tally__lbl">' + esc(lbl) + '</span>' +
        '<span class="scw-acpt-tally__val">' + esc(val) + '</span></span>';
    }
    var el = document.createElement('div');
    el.className = 'scw-acpt-tally';
    el.innerHTML =
      // Caveat first so the figures keep the card's right edge.
      (derived
        ? '<span class="scw-acpt-tally__note" title="' + esc(DERIVED_NOTE) + '">' +
            'Includes amounts summed from line items</span>'
        : '') +
      cell(baseN > 1 ? 'Original bids' : 'Original bid', money(base)) +
      '<span class="scw-acpt-tally__op" aria-hidden="true">+</span>' +
      cell(coN > 1 ? coN + ' change orders' : 'Change order',
           (co > 0 ? '+' : '') + money(co)) +
      '<span class="scw-acpt-tally__op" aria-hidden="true">=</span>' +
      cell('Total', money(base + co), 'scw-acpt-tally__cell--total');
    return el;
  }

  function renderSubView(VIEW) {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();
    viewEl.classList.add('scw-acpt-on');

    var prior = viewEl.querySelector(':scope > .scw-acpt-card');
    if (prior) prior.remove();

    // COLUMN GUARD — needs at least one of the things the card shows.
    // Unlike the ops card this doesn't fall back to the native table
    // (it's hidden unconditionally for sub views); it just renders
    // nothing, same as an empty section.
    var hasAny = !!(viewEl.querySelector('thead th.' + F.bidPdf) ||
                    viewEl.querySelector('thead th.' + F.terms) ||
                    viewEl.querySelector('thead th.' + F.payment) ||
                    viewEl.querySelector('thead th.' + F.signed));
    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!hasAny || !rows.length) return;

    var card = document.createElement('div');
    card.className = 'scw-acpt-card scw-acpt-card--sub';
    card.innerHTML =
      '<div class="scw-acpt-cardhead">' +
        '<div class="scw-acpt-eyebrow">Bid basis &amp; agreement</div>' +
        (SUB_BETA_NOTE
          ? '<div class="scw-acpt-beta">' + INFO_SVG +
              '<b>Beta</b><span>' + esc(SUB_BETA_NOTE) + '</span></div>'
          : '') +
      '</div>';
    // Per-SOW sub-bid sums, resolved ONCE for the whole card.
    var bySow = proposedSubBidBySow();
    var signedCount = 0, entries = [];
    for (var ri = 0; ri < rows.length; ri++) {
      if (isYes(cellText(rows[ri], F.signed))) signedCount++;
      var entry = buildSubRow(VIEW, rows[ri], bySow);
      entries.push(entry);
      card.appendChild(entry.el);
    }
    var tally = buildTally(entries);
    if (tally) card.appendChild(tally);
    viewEl.appendChild(card);
    rollup(viewEl, rows.length - signedCount);
  }

  /** Accordion-header tally: "N awaiting signature" (amber) / "all signed"
   *  (green), plus the attention flag the deploy nav's amber dot reads.
   *  Shared by both variants. */
  function rollup(viewEl, pending) {
    var acc = viewEl.closest('.scw-ktl-accordion');
    if (!acc) return;
    acc.toggleAttribute && acc.toggleAttribute('data-scw-attention', pending > 0);
    var head = acc.querySelector('.scw-ktl-accordion__header');
    if (!head) return;
    var countEl = head.querySelector('.scw-acc-count');
    var roll = head.querySelector('.scw-acpt-rollup');
    if (!roll) {
      roll = document.createElement('span');
      roll.className = 'scw-acpt-rollup';
      if (countEl) head.insertBefore(roll, countEl);
      else head.appendChild(roll);
    }
    roll.classList.toggle('scw-acpt-rollup--warn', pending > 0);
    roll.classList.toggle('scw-acpt-rollup--ok', pending === 0);
    roll.textContent = pending > 0
      ? (pending + ' awaiting signature')
      : 'all signed';
  }

  function render() {
    for (var vi = 0; vi < VIEWS.length; vi++) {
      if (SUB_VIEWS[VIEWS[vi]]) renderSubView(VIEWS[vi]);
      else renderView(VIEWS[vi]);
    }
  }

  function renderView(VIEW) {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();

    // COLUMN GUARD — no proposal column means this grid doesn't expose the
    // acceptance fields (the sub view_4066 ships thin). Leave the native
    // table alone; the card takes over the moment Builder adds the columns.
    if (!viewEl.querySelector('thead th.' + F.proposal)) {
      viewEl.classList.remove('scw-acpt-on');
      var stale = viewEl.querySelector(':scope > .scw-acpt-card');
      if (stale) stale.remove();
      return;
    }
    viewEl.classList.add('scw-acpt-on');

    // Rebuild from scratch — a project accrues one acceptance per signed
    // agreement (base proposal + each CO). ONE card, one compact list row
    // per record in the grid's own order, so a testing pile of 20 doesn't
    // eat the page.
    var prior = viewEl.querySelector(':scope > .scw-acpt-card');
    if (prior) prior.remove();

    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!rows.length) return;

    // Triage sort: rows still needing something (unsigned agreement, or a
    // base acceptance with neither payment nor terms approval) float to the
    // top so a 6-12 acceptance pile on a big project self-prioritizes.
    var entries = [];
    var signedCount = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      var rSigned = isYes(cellText(r, F.signed));
      var rPaid   = isYes(cellText(r, F.payment));
      var rTerms  = isYes(cellText(r, F.terms));
      var rIsCo   = /\bSW\d+CO\b/i.test(cellText(r, F.proposal));
      var attention = !rSigned || (!rIsCo && !rTerms && !rPaid);
      if (rSigned) signedCount++;
      entries.push({ row: r, attention: attention, order: ri });
    }
    entries.sort(function (a, b) {
      if (a.attention !== b.attention) return a.attention ? -1 : 1;
      return a.order - b.order;   // stable within each tier
    });

    var card = document.createElement('div');
    card.className = 'scw-acpt-card';
    card.innerHTML =
      '<div class="scw-acpt-cardhead">' +
        '<div class="scw-acpt-eyebrow">Acceptance</div>' +
        // Same caveat as the sub card — it's the same newly derived money.
        (SUB_BETA_NOTE
          ? '<div class="scw-acpt-beta">' + INFO_SVG +
              '<b>Beta</b><span>' + esc(SUB_BETA_NOTE) + '</span></div>'
          : '') +
      '</div>';
    var bySow = proposedSubBidBySow();
    var survey = surveyCostBySow();
    var moneyCols = moneyColsOf(viewEl);
    var built = [];
    for (var ei = 0; ei < entries.length; ei++) {
      var made = buildCard(VIEW, entries[ei].row, bySow, moneyCols, survey);
      built.push(made);
      card.appendChild(made.el);
    }
    // Column header, once, and only when a row actually rendered billed
    // money — the keys in F are always set, so THEY can't answer whether
    // the columns are on this view; the built rows can. EQUIPMENT / LABOR
    // used to repeat on every row, with LABOR sitting over the figures'
    // NAMES instead of the figures. Sharing the rows' grid puts each
    // label on the column it names.
    var anyBilled = false;
    for (var bi = 0; bi < built.length; bi++) {
      if (built[bi].billed) { anyBilled = true; break; }
    }
    if (anyBilled) {
      var head = document.createElement('div');
      head.className = 'scw-acpt-colhead';
      // Only the two money cells: grid areas need no child to hold their
      // place, so the identity and paperwork columns simply stay empty
      // here rather than carrying filler spans.
      head.innerHTML =
        '<span class="scw-acpt-col scw-acpt-col--equip">' +
          '<span class="scw-acpt-colhead__lbl">Equipment</span></span>' +
        '<span class="scw-acpt-col scw-acpt-col--labor">' +
          '<span class="scw-acpt-colhead__lbl">Labor</span>' +
          '<span class="scw-acpt-colhead__lbl"></span></span>';
      card.insertBefore(head, built[0].el);
    }

    // Project footer: the same two columns summed, with the bid +
    // change-order split folded into its identity cell. One band, one
    // grid, one right edge — the separate tally band used to end further
    // right than every figure above it.
    var projMoney = buildProjectMoney(built);
    if (projMoney) card.appendChild(projMoney);
    viewEl.appendChild(card);

    // Rollup badge in the accordion header bar — visible without
    // expanding; the attention attribute feeds the deploy nav's amber dot.
    rollup(viewEl, rows.length - signedCount);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    // The survey views feed the labor margin, so a render of one has to
    // re-run the card — otherwise a survey grid that lands after
    // view_3914 leaves the percent computed without its survey cost.
    VIEWS.concat(SURVEY_VIEWS).forEach(function (v) {
      SCW.onViewRender(v, function () { setTimeout(render, 30); }, EVENT_NS);
    });
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(render, 150); });
})();
/*** END FEATURE: Acceptance summary card **********************************/
