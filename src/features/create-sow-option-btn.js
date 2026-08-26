/*** FEATURE: Create Alternate SOW button → view_3869 accordion header ***/
/**
 * Injects a "Create Alternate SOW" button into the accordion header for
 * view_3869. Visible only after the Initiate Install step has fired
 * (field_1199 populated on the SOW detail view_3827).
 *
 * WHY THERE IS A MODAL NOW:
 *   The button used to fire straight at Make with EVERY line item id on the
 *   SOW, and a fully-populated duplicate SOW appeared with no warning and no
 *   choices. Nobody could tell what it was about to do, which is the whole
 *   complaint. Clicking now opens a picker: which items go on the alternate,
 *   and what model each one uses there.
 *
 * PARENT ITEMS ONLY:
 *   Accessories (a populated field_2464 parent) are deliberately absent —
 *   mounting boxes and brackets ride along with the device they hang off,
 *   and listing them turns a 12-row decision into a 40-row scroll. The
 *   automation is expected to carry a parent's accessories with it.
 *
 * LINK vs CLONE — the distinction the whole feature exists for:
 *   Leave a row's model alone and the SAME line item is shared onto the new
 *   SOW (field_2154 is a multi-connection) — one record, two SOWs, edits
 *   track both. Change the model and it must instead be CLONED, because the
 *   alternate needs a different product and the original has to keep its
 *   own. The payload says which per item; it never asks Make to guess.
 *
 * Payload:
 *   {
 *     sourceRecordId, triggeredBy,
 *     sowLineItemIds:      [ ids to LINK ],        // back-compat, link-only
 *     linkIds:             [ ids to LINK ],
 *     cloneItems:          [ { sourceItemId, productId, productName,
 *                              fromProductId, fromProductName } ],
 *     licenseRecurringIds: [ ids ]
 *   }
 *   Response: { success: true, newSowId, newSowUrl } | { success:false, error }
 *
 * ⚠️ sowLineItemIds carries ONLY the link-mode ids. Until the Make scenario
 *   grows a cloneItems branch, a model-changed row is simply absent from the
 *   new SOW — omitted, never linked with the wrong product. Failing by
 *   omission is recoverable; failing by quietly attaching the wrong model to
 *   a quote is not.
 */
(function () {
  'use strict';

  var TARGET_VIEW    = 'view_3869';
  var GATE_VIEW      = 'view_3827';   // SOW detail view supplying field_1199 + record id
  var GATE_FIELD     = 'field_1199';  // Install Project populated -> show button
  var ITEMS_VIEW     = 'view_3586';   // SOW line items
  var LICENSE_VIEW   = 'view_3471';   // Licenses / recurring services
  var BTN_MARKER     = 'scw-create-sow-option-btn';
  var BTN_LABEL      = 'Create Alternate SOW';
  var EVENT_NS       = '.scwCreateSowOption';

  var F = {
    product:  'field_1949',   // REL_product (single connection)
    label:    'field_1950',   // display label
    parent:   'field_2464',   // accessory → parent line item
    bucket:   'field_2219',   // proposal bucket
    mdfIdf:   'field_1946'    // MDF/IDF location
  };

  // Proposal-wide assumption rows carry no product, so a model dropdown on
  // them is meaningless — they're excluded from the picker entirely. Same
  // bucket id worksheet-v2's bucketCategoryOf uses for 'assumptions'.
  var ASSUMPTIONS_BUCKET = '697b7a023a31502ec68b3303';

  var P = 'scw-alt-sow';

  var COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SPINNER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" class="scw-create-sow-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ── Styles ───────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('scw-create-sow-option-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-create-sow-option-css';
    s.textContent = [
      '.' + BTN_MARKER + '.is-loading { pointer-events: none; opacity: 0.75; cursor: wait; }',
      '.' + BTN_MARKER + '.is-loading svg { animation: scw-create-sow-spin 0.8s linear infinite; }',
      '@keyframes scw-create-sow-spin { to { transform: rotate(360deg); } }',
      '.' + P + '-back {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,.45);',
      '  z-index: 10060; display: flex; align-items: center; justify-content: center;',
      '}',
      '.' + P + '-modal {',
      '  background: #fff; border-radius: 10px; display: flex; flex-direction: column;',
      '  width: min(860px, calc(100vw - 32px)); max-height: 86vh;',
      '  box-shadow: 0 12px 32px rgba(15,23,42,.25);',
      '  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a;',
      '}',
      '.' + P + '-head { padding: 18px 22px 12px; border-bottom: 1px solid #eef2f7; }',
      '.' + P + '-title { margin: 0 0 4px; font: 700 16px/1.3 system-ui, sans-serif; color: #0c4a6e; }',
      '.' + P + '-sub { margin: 0; color: #64748b; font-size: 12.5px; }',
      '.' + P + '-tools {',
      '  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;',
      '  padding: 10px 22px; border-bottom: 1px solid #eef2f7; background: #f8fafc;',
      '}',
      '.' + P + '-tools button {',
      '  border: 1px solid #cbd5e1; background: #fff; border-radius: 5px;',
      '  padding: 3px 10px; cursor: pointer; color: #0f4c75;',
      '  font: 600 11.5px/1.4 system-ui, sans-serif;',
      '}',
      '.' + P + '-tools button:hover { background: #f1f5f9; }',
      '.' + P + '-tally { margin-left: auto; color: #475569; font-size: 12px; }',
      '.' + P + '-tally b { color: #0f172a; }',
      '.' + P + '-body { padding: 6px 22px 14px; overflow-y: auto; flex: 1 1 auto; }',
      // Group header — a real button so MDF/IDF sections collapse. Sticky so
      // you always know which location you're scrolled into.
      '.' + P + '-grp {',
      '  position: sticky; top: 0; z-index: 2; width: 100%;',
      '  display: flex; align-items: center; gap: 8px;',
      '  background: #fff; border: 0; border-bottom: 1px solid #eef2f7;',
      '  padding: 9px 2px 5px; margin: 0; cursor: pointer; text-align: left;',
      '  font: 700 10.5px/1.3 system-ui, sans-serif; letter-spacing: .04em;',
      '  text-transform: uppercase; color: #475569;',
      '}',
      '.' + P + '-grp:hover { color: #0f172a; }',
      '.' + P + '-grp-chev { display: inline-flex; transition: transform 120ms ease;',
      '  color: #94a3b8; }',
      '.' + P + '-grp--closed .' + P + '-grp-chev { transform: rotate(-90deg); }',
      // Collapsed groups still have to report what's ticked inside them.
      '.' + P + '-grp-n { margin-left: auto; text-transform: none;',
      '  letter-spacing: 0; font-weight: 600; color: #64748b; font-size: 11px; }',
      '.' + P + '-grp--closed + .' + P + '-rows { display: none; }',
      // One line per item. The product used to print twice — once as a
      // sub-line, once as the dropdown's own value — and the mode pill took
      // a second row on EVERY item. Both gone: the select is the product,
      // and only the exceptional state (duplicated) says anything.
      '.' + P + '-row {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 4px 2px; border-bottom: 1px solid #f8fafc;',
      '}',
      '.' + P + '-row--off { opacity: .45; }',
      '.' + P + '-row input[type=checkbox] { margin: 0; flex: 0 0 auto; }',
      '.' + P + '-name { flex: 1 1 auto; min-width: 0; display: flex;',
      '  align-items: baseline; gap: 7px; }',
      '.' + P + '-name-l { font-weight: 600; white-space: nowrap; }',
      '.' + P + '-was { color: #92400e; font-size: 11px; min-width: 0;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.' + P + '-sel {',
      '  flex: 0 0 268px; max-width: 268px; padding: 4px 7px;',
      '  border: 1px solid #cbd5e1; border-radius: 5px;',
      '  font: inherit; font-size: 12px; background: #fff; color: #0f172a;',
      '}',
      '.' + P + '-sel:disabled { background: #f1f5f9; color: #94a3b8; }',
      // A changed model is what turns a share into a copy — flag it on the
      // control the user just touched.
      '.' + P + '-sel--changed { border-color: #fbbf24; background: #fffbeb; }',
      '.' + P + '-mode {',
      '  flex: 0 0 auto; padding: 2px 8px; border-radius: 999px;',
      '  font: 700 10px/1.5 system-ui, sans-serif; white-space: nowrap;',
      '  background: #fef3c7; border: 1px solid #fde68a; color: #92400e;',
      '}',
      '.' + P + '-legend { display: flex; gap: 14px; flex-wrap: wrap;',
      '  padding: 8px 22px 0; color: #64748b; font-size: 11.5px; }',
      '.' + P + '-legend b { color: #475569; }',
      '.' + P + '-foot {',
      '  display: flex; gap: 8px; justify-content: flex-end; align-items: center;',
      '  padding: 14px 22px; border-top: 1px solid #eef2f7; flex-wrap: wrap;',
      '}',
      '.' + P + '-btn {',
      '  padding: 8px 15px; border-radius: 6px; cursor: pointer;',
      '  border: 1px solid transparent; font: 600 13px/1.2 system-ui, sans-serif;',
      '}',
      '.' + P + '-btn--cancel { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }',
      '.' + P + '-btn--go { background: #0f4c75; color: #fff; }',
      '.' + P + '-btn:hover:not(:disabled) { filter: brightness(1.08); }',
      '.' + P + '-btn:disabled { opacity: .5; cursor: not-allowed; }',
      '.' + P + '-empty { padding: 24px 4px; color: #64748b; }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  // ── Reads ────────────────────────────────────────────────

  function getGateFieldValue() {
    var view = document.getElementById(GATE_VIEW);
    if (!view) return '';
    var cell = view.querySelector('.kn-detail.' + GATE_FIELD + ' .kn-detail-body');
    if (!cell) return '';
    return (cell.textContent || '').replace(/ /g, ' ').trim();
  }

  function getSourceSowId() {
    try {
      var v = Knack.views && Knack.views[GATE_VIEW];
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

  function viewRecords(viewId) {
    var out = [];
    try {
      var v = Knack && Knack.views && Knack.views[viewId];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return out;
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes;
        if (a && typeof a.id === 'string' && /^[a-f0-9]{24}$/.test(a.id)) out.push(a);
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  function collectRecordIdsFromView(viewId) {
    var recs = viewRecords(viewId), out = [];
    for (var i = 0; i < recs.length; i++) out.push(recs[i].id);
    return out;
  }

  function refreshView(viewId) {
    return new Promise(function (resolve) {
      try {
        var v = Knack && Knack.views && Knack.views[viewId];
        if (!v || !v.model || typeof v.model.fetch !== 'function') { resolve(); return; }
        v.model.fetch({ success: function () { resolve(); },
                        error:   function () { resolve(); } });
      } catch (e) { resolve(); }
    });
  }

  function conn(rec, key) {
    var raw = rec && rec[key + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? raw[0] : null;
    if (raw && raw.id) return raw;
    return null;
  }

  function plain(rec, key) {
    var c = conn(rec, key);
    if (c) return String(c.identifier || '').replace(/<[^>]*>/g, '').trim();
    var v = rec && (rec[key + '_raw'] != null ? rec[key + '_raw'] : rec[key]);
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Product catalog ──────────────────────────────────────
  // Same sources and the same "no bucket data anywhere → universal" rule the
  // worksheet's own product picker uses, so the two offer the same models for
  // a given bucket. Falls back to the products actually in use on this SOW
  // when the Builder maps aren't deployed on this scene — degraded, but a
  // usable list beats a dead dropdown.

  function productsForBucket(bucketId, records) {
    var pmap = (window.SCW && SCW.productMap) || null;
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    var out = [], seen = Object.create(null);

    function allowed(pid, p) {
      if (!bucketId) return true;
      var known = false, hit = false;
      if (p && Array.isArray(p.buckets) && p.buckets.length) {
        known = true;
        if (p.buckets.indexOf(bucketId) !== -1) hit = true;
      }
      if (!hit && bmap) {
        var bl = bmap[pid];
        if (bl && bl.length) {
          known = true;
          if (bl.indexOf(bucketId) !== -1) hit = true;
        }
      }
      return known ? hit : true;
    }

    if (pmap) {
      for (var pid in pmap) {
        var p = pmap[pid];
        if (!allowed(pid, p)) continue;
        var nm = (p && p.name) || '';
        if (!nm) continue;
        if (seen[pid]) continue;
        seen[pid] = 1;
        out.push({ id: pid, label: nm });
      }
    }

    if (!out.length) {
      // In-use fallback: every product paired with THIS bucket somewhere on
      // the SOW. Derived from the rows themselves, so the ids line up.
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        var pc = conn(rec, F.product);
        if (!pc || !pc.id || seen[pc.id]) continue;
        var rb = conn(rec, F.bucket);
        if (bucketId && rb && rb.id && rb.id !== bucketId) continue;
        seen[pc.id] = 1;
        out.push({ id: pc.id, label: String(pc.identifier || pc.id).replace(/<[^>]*>/g, '').trim() });
      }
    }

    out.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  // ── Candidate rows ───────────────────────────────────────

  /** Parent line items only — anything with a field_2464 parent is an
   *  accessory that travels with its device, and assumption rows have no
   *  model to choose. Grouped + sorted the canonical way (CLAUDE.md picker
   *  rule) via worksheet-v2's exported helpers. */
  function candidateGroups() {
    var recs = viewRecords(ITEMS_VIEW);
    var parents = [];
    for (var i = 0; i < recs.length; i++) {
      if (conn(recs[i], F.parent)) continue;              // accessory — skip
      var b = conn(recs[i], F.bucket);
      if (b && b.id === ASSUMPTIONS_BUCKET) continue;     // assumption — no model
      parents.push(recs[i]);
    }

    var pk = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.picker;
    function itemLabel(rec) {
      var l = plain(rec, F.label), p = plain(rec, F.product);
      if (l && p && p !== l) return l + ' · ' + p;
      return l || p || rec.id;
    }
    var cmp = (pk && typeof pk.canonicalItemSort === 'function')
      ? pk.canonicalItemSort(itemLabel)
      : function (a, b) {
          return String(itemLabel(a)).localeCompare(String(itemLabel(b)),
            undefined, { numeric: true, sensitivity: 'base' });
        };
    var groupBy = (pk && pk.groupByMdfIdf) || function (rec) {
      var m = conn(rec, F.mdfIdf);
      return m && m.id ? { id: m.id, label: String(m.identifier || 'MDF / IDF') }
                       : { id: '__unknown', label: 'No MDF / IDF' };
    };

    var map = Object.create(null), order = [];
    for (var q = 0; q < parents.length; q++) {
      var g = groupBy(parents[q]) || { id: '__unknown', label: 'No MDF / IDF' };
      if (!map[g.id]) { map[g.id] = { id: g.id, label: g.label || '', items: [] }; order.push(g.id); }
      map[g.id].items.push(parents[q]);
    }
    var groups = [];
    for (var o = 0; o < order.length; o++) {
      map[order[o]].items.sort(cmp);
      groups.push(map[order[o]]);
    }
    groups.sort(function (a, b) {
      var au = a.id === '__unknown' ? 1 : 0, bu = b.id === '__unknown' ? 1 : 0;
      if (au !== bu) return au - bu;
      return String(a.label).localeCompare(String(b.label), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return { groups: groups, all: parents, itemLabel: itemLabel };
  }

  // ── Modal ────────────────────────────────────────────────

  function closeModal() {
    var b = document.querySelector('.' + P + '-back');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function openModal(btn) {
    var built = candidateGroups();
    if (!built.all.length) {
      alert('No line items found on this SOW to build an alternate from.');
      setBtnLoading(btn, false);
      return;
    }
    var allRecs = viewRecords(ITEMS_VIEW);

    closeModal();
    var back = document.createElement('div');
    back.className = P + '-back';
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });

    var modal = document.createElement('div');
    modal.className = P + '-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var head = document.createElement('div');
    head.className = P + '-head';
    head.innerHTML =
      '<h3 class="' + P + '-title">Create Alternate SOW</h3>' +
      '<p class="' + P + '-sub">Pick the items the alternate carries, and the model each ' +
        'one uses there. Accessories travel with their device, and assumptions aren’t ' +
        'listed.</p>';
    modal.appendChild(head);

    var tools = document.createElement('div');
    tools.className = P + '-tools';
    // "Reset models" was the right control with the wrong name — it says what
    // it operates on, not what you get. This one names the outcome: every row
    // back on the model it already has, which is also every row back to
    // Shared. Hidden until at least one row has actually been changed, so it
    // only shows up when there is something to undo.
    tools.innerHTML =
      '<button type="button" data-alt-all>Select all</button>' +
      '<button type="button" data-alt-none>Select none</button>' +
      '<button type="button" data-alt-reset style="display:none" ' +
        'title="Put every model back to the one the item already uses, so ' +
        'nothing is duplicated">Keep all current models</button>' +
      '<span class="' + P + '-tally" data-alt-tally></span>';
    modal.appendChild(tools);

    // The two states, stated once. They used to be repeated as a pill on
    // every row, which is what pushed each item onto two lines.
    var legend = document.createElement('div');
    legend.className = P + '-legend';
    legend.innerHTML =
      '<span><b>Shared</b> — one record on both SOWs, edits affect both ' +
        '(the default)</span>' +
      '<span><b>Duplicated</b> — each SOW edits its own copy ' +
        '(when you change the model)</span>';
    modal.appendChild(legend);

    var body = document.createElement('div');
    body.className = P + '-body';

    var CHEV = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
      'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    for (var g = 0; g < built.groups.length; g++) {
      var grp = built.groups[g];
      var h = document.createElement('button');
      h.type = 'button';
      h.className = P + '-grp';
      h.setAttribute('data-alt-grp', String(g));
      h.innerHTML =
        '<span class="' + P + '-grp-chev">' + CHEV + '</span>' +
        '<span>' + esc(grp.label || 'Unassigned') + '</span>' +
        '<span class="' + P + '-grp-n" data-alt-grp-n></span>';
      body.appendChild(h);

      var rowsWrap = document.createElement('div');
      rowsWrap.className = P + '-rows';
      for (var i = 0; i < grp.items.length; i++) {
        rowsWrap.appendChild(buildRow(grp.items[i], allRecs));
      }
      body.appendChild(rowsWrap);
    }
    modal.appendChild(body);

    var foot = document.createElement('div');
    foot.className = P + '-foot';
    foot.innerHTML =
      '<button type="button" class="' + P + '-btn ' + P + '-btn--cancel" data-alt-cancel>Cancel</button>' +
      '<button type="button" class="' + P + '-btn ' + P + '-btn--go" data-alt-go>Create alternate SOW</button>';
    modal.appendChild(foot);

    back.appendChild(modal);
    document.body.appendChild(back);
    setBtnLoading(btn, false);

    var tally    = tools.querySelector('[data-alt-tally]');
    var resetBtn = tools.querySelector('[data-alt-reset]');
    var goBtn    = foot.querySelector('[data-alt-go]');

    function rows() { return body.querySelectorAll('[data-alt-row]'); }

    function readRow(row) {
      var cb  = row.querySelector('input[type=checkbox]');
      var sel = row.querySelector('select');
      var from = row.getAttribute('data-from-id') || '';
      var to   = sel ? sel.value : from;
      return {
        id:      row.getAttribute('data-alt-row'),
        on:      !!(cb && cb.checked),
        fromId:  from,
        toId:    to,
        changed: !!(to && from && to !== from),
        fromName: row.getAttribute('data-from-name') || '',
        toName:  sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : ''
      };
    }

    function repaint() {
      var rs = rows(), on = 0, clones = 0;
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]);
        rs[i].classList.toggle(P + '-row--off', !st.on);
        var sel = rs[i].querySelector('select');
        if (sel) {
          sel.disabled = !st.on;
          sel.classList.toggle(P + '-sel--changed', st.on && st.changed);
        }
        // Only the exceptional state speaks. Shared is the default and was
        // being restated on every single row; the legend carries its meaning
        // once, and silence on a row means shared.
        var mode = rs[i].querySelector('[data-alt-mode]');
        if (mode) {
          var showMode = st.on && st.changed;
          mode.style.display = showMode ? '' : 'none';
          mode.title = showMode ? 'Duplicated — each SOW edits its own copy' : '';
        }
        var was = rs[i].querySelector('[data-alt-was]');
        if (was) {
          if (st.on && st.changed && st.fromName) {
            was.style.display = '';
            was.textContent = 'was ' + st.fromName;
            was.title = 'This SOW keeps ' + st.fromName;
          } else {
            was.style.display = 'none';
          }
        }
        if (st.on) { on++; if (st.changed) clones++; }
      }
      tally.innerHTML = '<b>' + on + '</b> of ' + rs.length + ' item' +
        (rs.length === 1 ? '' : 's') +
        (clones ? (' · <b>' + clones + '</b> duplicated') : '');
      // Only offer the undo once a model has actually been changed —
      // otherwise it sits there inviting the "what does this do?" it exists
      // to answer. Counts changed rows whether selected or not, so a change
      // parked on an unticked row is still reachable.
      var anyChanged = false;
      for (var c = 0; c < rs.length && !anyChanged; c++) {
        if (readRow(rs[c]).changed) anyChanged = true;
      }
      if (resetBtn) resetBtn.style.display = anyChanged ? '' : 'none';

      // Group tallies — a collapsed section still has to report what's ticked
      // inside it, or collapsing hides decisions instead of just rows.
      var heads = body.querySelectorAll('[data-alt-grp]');
      for (var gi = 0; gi < heads.length; gi++) {
        var wrap = heads[gi].nextElementSibling;
        if (!wrap) continue;
        var grs = wrap.querySelectorAll('[data-alt-row]');
        var gOn = 0, gDup = 0;
        for (var gr = 0; gr < grs.length; gr++) {
          var gst = readRow(grs[gr]);
          if (gst.on) { gOn++; if (gst.changed) gDup++; }
        }
        var n = heads[gi].querySelector('[data-alt-grp-n]');
        if (n) {
          n.textContent = gOn + ' of ' + grs.length +
            (gDup ? (' · ' + gDup + ' duplicated') : '');
        }
      }
      goBtn.disabled = (on === 0);
      goBtn.textContent = on ? ('Create alternate SOW (' + on + ')') : 'Create alternate SOW';
    }

    back.addEventListener('change', repaint);
    back.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-alt-cancel]')) { closeModal(); return; }
      if (t.closest('[data-alt-all]') || t.closest('[data-alt-none]')) {
        var on = !!t.closest('[data-alt-all]');
        var rs = rows();
        for (var i = 0; i < rs.length; i++) {
          var cb = rs[i].querySelector('input[type=checkbox]');
          if (cb) cb.checked = on;
        }
        repaint(); return;
      }
      var gh = t.closest('[data-alt-grp]');
      if (gh) {
        gh.classList.toggle(P + '-grp--closed');
        return;
      }
      if (t.closest('[data-alt-reset]')) {
        var rr = rows();
        for (var k = 0; k < rr.length; k++) {
          var rsel = rr[k].querySelector('select');
          if (rsel) rsel.value = rr[k].getAttribute('data-from-id') || '';
        }
        repaint(); return;
      }
      if (t.closest('[data-alt-go]') && !goBtn.disabled) submit();
    });

    function submit() {
      var linkIds = [], cloneItems = [];
      var rs = rows();
      for (var i = 0; i < rs.length; i++) {
        var st = readRow(rs[i]);
        if (!st.on) continue;
        if (st.changed) {
          cloneItems.push({
            sourceItemId:    st.id,
            productId:       st.toId,
            productName:     st.toName,
            fromProductId:   st.fromId,
            fromProductName: st.fromName
          });
        } else {
          linkIds.push(st.id);
        }
      }
      var ctrls = modal.querySelectorAll('button, input, select');
      for (var c = 0; c < ctrls.length; c++) ctrls[c].disabled = true;
      goBtn.textContent = 'Creating…';
      fireWebhook(btn, linkIds, cloneItems);
    }

    repaint();
  }

  function buildRow(rec, allRecs) {
    var pc = conn(rec, F.product);
    var fromId = pc && pc.id ? pc.id : '';
    var fromName = pc ? String(pc.identifier || '').replace(/<[^>]*>/g, '').trim() : '';
    var bucket = conn(rec, F.bucket);
    var opts = productsForBucket(bucket && bucket.id, allRecs);

    // The current product must always be offered even when the catalog
    // filter wouldn't have produced it — otherwise the select silently
    // lands on a DIFFERENT model and a share turns into a copy nobody asked
    // for. This is the one option that must never be missing.
    var haveCurrent = false;
    for (var o = 0; o < opts.length; o++) if (opts[o].id === fromId) { haveCurrent = true; break; }
    if (fromId && !haveCurrent) opts.unshift({ id: fromId, label: fromName || '(current model)' });

    var row = document.createElement('div');
    row.className = P + '-row';
    row.setAttribute('data-alt-row', rec.id);
    row.setAttribute('data-from-id', fromId);
    row.setAttribute('data-from-name', fromName);

    var label = plain(rec, F.label);
    var optHtml = '';
    for (var q = 0; q < opts.length; q++) {
      optHtml += '<option value="' + esc(opts[q].id) + '"' +
        (opts[q].id === fromId ? ' selected' : '') + '>' + esc(opts[q].label) + '</option>';
    }
    if (!opts.length) optHtml = '<option value="">(no models available)</option>';

    // No product sub-line: the dropdown already shows it, and printing it
    // twice per row was most of the wasted height. When the model IS changed
    // the original reappears as "was …", which is the only time it isn't
    // already on screen.
    row.innerHTML =
      '<input type="checkbox" checked aria-label="Include on the alternate SOW">' +
      '<span class="' + P + '-name">' +
        '<span class="' + P + '-name-l">' + esc(label || '(unlabelled)') + '</span>' +
        '<span class="' + P + '-was" data-alt-was style="display:none"></span>' +
      '</span>' +
      '<select class="' + P + '-sel" aria-label="Model on the alternate SOW">' + optHtml + '</select>' +
      '<span class="' + P + '-mode" data-alt-mode style="display:none">Duplicated</span>';
    return row;
  }

  // ── Fire the duplicate-SOW webhook ───────────────────────

  function fireWebhook(btn, linkIds, cloneItems) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DUPLICATE_SOW_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      alert('Duplicate-SOW webhook URL is not configured.');
      closeModal(); return;
    }
    var sourceRecordId = getSourceSowId();
    if (!sourceRecordId) {
      alert('Could not determine current SOW record ID.');
      closeModal(); return;
    }

    setBtnLoading(btn, true);

    refreshView(LICENSE_VIEW).then(function () {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRecordId:      sourceRecordId,
          // Link-mode ONLY — see the header note. A clone-mode row must not
          // ride this list, or the scenario attaches the original product.
          sowLineItemIds:      linkIds,
          linkIds:             linkIds,
          cloneItems:          cloneItems,
          licenseRecurringIds: collectRecordIdsFromView(LICENSE_VIEW),
          triggeredBy:         getTriggeredBy()
        })
      });
    }).then(function (resp) {
      return resp.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* not JSON */ }
        SCW.debug('[SCW clone-sow] status=' + resp.status + ' body=' + body);
        return { status: resp.status, body: body, data: data, ok: resp.ok };
      });
    }).then(function (resp) {
      if (resp.data && resp.data.success && resp.data.newSowUrl) {
        window.location.href = resp.data.newSowUrl;
        return;
      }
      setBtnLoading(btn, false);
      closeModal();

      var msg;
      if (!resp.ok) {
        msg = 'Webhook returned HTTP ' + resp.status + '. Response:\n\n' + (resp.body || '(empty)');
      } else if (!resp.data) {
        msg = 'Webhook returned non-JSON response. Add a "Webhook Response" module in Make ' +
              'that returns JSON like {"success": true, "newSowUrl": "..."}.\n\n' +
              'Actual body:\n' + (resp.body || '(empty)');
      } else if (resp.data.error || resp.data.message) {
        msg = resp.data.error || resp.data.message;
      } else if (resp.data.success && !resp.data.newSowUrl) {
        msg = 'Webhook returned success but no newSowUrl. Add newSowUrl to the ' +
              'Webhook Response body so the client knows where to redirect.';
      } else {
        msg = 'Failed to create SOW option. Body:\n\n' + (resp.body || '(empty)');
      }
      alert(msg);
    }).catch(function (err) {
      setBtnLoading(btn, false);
      closeModal();
      alert('Webhook error: ' + (err && err.message ? err.message : err));
    });
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    var iconSpan = btn.querySelector('.scw-create-sow-icon');
    if (loading) {
      btn.classList.add('is-loading');
      if (iconSpan) iconSpan.innerHTML = SPINNER_SVG;
    } else {
      btn.classList.remove('is-loading');
      if (iconSpan) iconSpan.innerHTML = COPY_SVG;
    }
  }

  /** Open the picker. Refresh the items grid first — it may sit in a
   *  collapsed accordion, and the whole modal is built from its model. */
  function startPicker(btn) {
    setBtnLoading(btn, true);
    var ready = (window.SCW && SCW.productMapReady &&
                 typeof SCW.productMapReady.then === 'function')
      ? SCW.productMapReady : Promise.resolve();
    Promise.all([refreshView(ITEMS_VIEW), ready])
      .then(function () { openModal(btn); })
      .catch(function () { openModal(btn); });
  }

  // ── Inject / remove the button based on gate + presence ──
  function syncButton() {
    var targetEl = document.getElementById(TARGET_VIEW);
    if (!targetEl) return;
    var accordion = targetEl.closest('.scw-ktl-accordion');
    if (!accordion) return;
    var body = accordion.querySelector('.scw-ktl-accordion__body');
    if (!body) return;

    var existing = body.querySelector('.' + BTN_MARKER);
    var shouldShow = !!getGateFieldValue();

    if (!shouldShow) {
      if (existing) {
        var oldHost = existing.parentElement;
        existing.remove();
        if (oldHost && oldHost.classList.contains('scw-acc-actions') &&
            !oldHost.children.length) {
          oldHost.remove();
        }
      }
      return;
    }
    if (existing) return;

    var actions = body.querySelector(':scope > .scw-acc-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'scw-acc-actions';
      if (targetEl.parentNode === body) body.insertBefore(actions, targetEl);
      else body.insertBefore(actions, body.firstChild);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn ' + BTN_MARKER;
    btn.title = 'Choose which items and models go on a second SOW option';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'scw-create-sow-icon';
    iconSpan.innerHTML = COPY_SVG;
    btn.appendChild(iconSpan);
    btn.appendChild(document.createTextNode(BTN_LABEL));

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (btn.classList.contains('is-loading')) return;
      startPicker(btn);
    });

    actions.appendChild(btn);
  }

  // Escape closes the picker (never mid-submit — controls are disabled then).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var back = document.querySelector('.' + P + '-back');
    if (!back) return;
    var go = back.querySelector('[data-alt-go]');
    if (go && go.disabled && /Creating/.test(go.textContent || '')) return;
    closeModal();
  });

  // ── Bindings ─────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
      .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
        setTimeout(syncButton, 500);
      });

    $(document)
      .off('knack-view-render.' + GATE_VIEW + EVENT_NS)
      .on('knack-view-render.' + GATE_VIEW + EVENT_NS, function () {
        setTimeout(syncButton, 500);
      });

    $(document)
      .off('knack-scene-render.any' + EVENT_NS)
      .on('knack-scene-render.any' + EVENT_NS, function () {
        setTimeout(syncButton, 1500);
      });
  }

  bind();
})();
