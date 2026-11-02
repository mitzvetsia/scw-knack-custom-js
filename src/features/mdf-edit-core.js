/*** MDF/IDF EDIT CORE — one save engine for every location editor ************
 *
 * The MDF/IDF location object is edited from FOUR surfaces (build-SOW +
 * deploy + sub-portal worksheets via worksheet-v2/mdf-notes.js, the compare
 * bid page via bid-review-v2/mdf-manage.js, and the survey/sales cards via
 * mdf-idf-cards.js). It is ONE object everywhere — same fields, same
 * display-name formula — so the save semantics must be identical everywhere.
 * This module is that single implementation; the surfaces own only their
 * panel DOM and plug in via callbacks.
 *
 * What every save gets, no matter which page fired it:
 *
 *  1. Diff-only view-scoped PUT (the caller sends only changed fields).
 *  2. Silent-drop detection (contradiction-based): Knack's view-scoped PUT
 *     can return 200 while dropping a write when the field's column on the
 *     target view is displayed WITHOUT inline editing. The echo only
 *     contains fields the view DISPLAYS, so absence proves nothing (a
 *     non-column field can save fine and simply not be echoed — observed
 *     live 2026-07-22); only an echoed value CONTRADICTING what we sent
 *     proves a real drop.
 *  3. Display-formula verification: field_1642 ("TYPE: ## : name") is a
 *     TEXT FORMULA — it cannot be written, Knack recomputes it server-side
 *     whenever the record updates. After an identity save (type/##/name) a
 *     delayed GET reads it back: recomputed with the new name → the write
 *     landed, and the SERVER's label (its formatting wins over our local
 *     composition) is pushed to the caller + patched into every loaded
 *     view model's connection identifiers; still missing the new name →
 *     the write was silently dropped → the caller gets an explicit error
 *     naming the Builder fix.
 *  4. Model sync (SCW.syncKnackModel) for every landed field, plus a
 *     best-effort patch of the hidden source view's rendered row (features
 *     that re-SCRAPE that DOM would otherwise resurrect stale values).
 *  5. On HTTP error: Knack's actual rejection reason parsed from the
 *     response + live view-schema introspection saying exactly which
 *     view-scoped-PUT precondition fails (view type / cell editor /
 *     missing column / ignore_edit).
 *
 * API (window.SCW.mdfEdit):
 *   FIELDS            — { type, num, name, notes, surveyNotes, displayName }
 *   parseDisplayName  — "TYPE: ## : name" → { type, num, name }
 *   composeLabel      — { type, num, name } → "TYPE: ## : name"
 *   patchConnectionIdentifiers(recId, newLabel)
 *   save({ viewKey, recordId, fields, onDone, onLabel, onDropped, onError })
 *     onDone({ landed, dropped, resp })  — PUT succeeded (dropped may be
 *                                          non-empty; caller updates UI for
 *                                          landed fields only)
 *     onLabel(serverLabel, resp)         — verification GET returned the
 *                                          recomputed display label (server
 *                                          truth; may differ in formatting)
 *     onDropped(fks, message)            — silent drop detected (echo
 *                                          contradiction or verification
 *                                          failure); message names the fix
 *     onError(message, xhr)              — HTTP error, message is
 *                                          user-displayable
 *   Survey notes log (field_2457 — see the section above the export):
 *   surveyContext(hash?)  — { id, label: 'SR1145' } of the page's survey, or null
 *   composeSurveyEntry(text, label, date?) / parseSurveyLog(text)
 *   visibleSurveyEntries(text, { ownOnly, only }) / renderSurveyLog(text, opts)
 *   appendSurveyNote({ viewKey, recordId, text, survey, onDone, onDropped, onError })
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var F = {
    type:        'field_1641',
    num:         'field_2458',
    name:        'field_1943',
    notes:       'field_1643',
    surveyNotes: 'field_2457',
    displayName: 'field_1642'
  };

  var VERIFY_DELAY_MS = 1500;   // formula recompute is near-synchronous; 1.5s is safety margin

  function stripTags(v) {
    return String(v == null ? '' : v).replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  /** field_1642 is the computed "TYPE: ## : name" label. Split on the first
   *  two colons; degrade gracefully when the ## segment is missing. */
  function parseDisplayName(dn) {
    dn = String(dn == null ? '' : dn);
    var m = /^([^:]*):([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: m[2].trim(), name: m[3].trim() };
    m = /^([^:]*):([\s\S]*)$/.exec(dn);
    if (m) return { type: m[1].trim(), num: '', name: m[2].trim() };
    return { type: '', num: '', name: dn.trim() };
  }

  function composeLabel(parts) {
    return ((parts.type || '') + ': ' + (parts.num || '') + ' : ' +
      (parts.name || '')).replace(/:\s*:/g, ':').trim();
  }

  function recOf(resp) {
    return (resp && resp.record && resp.record.id) ? resp.record : resp;
  }
  function labelOf(resp) {
    var r = recOf(resp);
    return r ? stripTags(r[F.displayName + '_raw'] != null
      ? r[F.displayName + '_raw'] : r[F.displayName]) : '';
  }

  /** After a rename, rewrite the location's connection identifier in EVERY
   *  loaded view model on the scene. Grids/worksheets group by line items'
   *  MDF/IDF connection identifier (snapshotted at load) — left stale, the
   *  next rebuild resurrects the old name and the rename looks like it
   *  "didn't take". Patches `_raw` identifiers plus the rendered HTML
   *  connection copy (<span class="<recId>">label</span>). Best-effort. */
  function patchConnectionIdentifiers(recId, newLabel) {
    if (!recId || !newLabel) return;
    var own = Object.prototype.hasOwnProperty;
    var spanRe = new RegExp(
      '(<span[^>]*class="[^"]*' + recId + '[^"]*"[^>]*>)[^<]*(</span>)', 'g');
    var htmlLabel = esc(newLabel).replace(/\$/g, '$$$$');
    try {
      var views = (window.Knack && Knack.views) || {};
      for (var vk in views) {
        if (!own.call(views, vk)) continue;
        var v = views[vk];
        var models = v && v.model && v.model.data && v.model.data.models;
        if (!models || !models.length) continue;
        for (var i = 0; i < models.length; i++) {
          var attrs = models[i] && (models[i].attributes || models[i]);
          if (!attrs) continue;
          for (var key in attrs) {
            if (!own.call(attrs, key)) continue;
            var val = attrs[key];
            if (/_raw$/.test(key)) {
              if (Array.isArray(val)) {
                for (var r = 0; r < val.length; r++) {
                  if (val[r] && val[r].id === recId) val[r].identifier = newLabel;
                }
              } else if (val && val.id === recId && val.identifier != null) {
                val.identifier = newLabel;
              }
            } else if (typeof val === 'string' && val.indexOf(recId) !== -1) {
              attrs[key] = val.replace(spanRe, '$1' + htmlLabel + '$2');
            }
          }
        }
      }
    } catch (e) { /* best-effort — a manual refresh still shows the rename */ }
  }

  /** Patch the source view's rendered table row after a save — features
   *  that re-SCRAPE that DOM (photo strips, notes callouts) would otherwise
   *  resurrect stale values on the next rebuild. Best-effort. */
  function patchSourceViewDom(viewKey, recId, fields, newLabel) {
    var own = Object.prototype.hasOwnProperty;
    try {
      var viewEl = document.getElementById(viewKey);
      var tr = viewEl && viewEl.querySelector('tbody tr[id="' + recId + '"]');
      if (!tr) return;
      var map = {};
      for (var fk in fields) { if (own.call(fields, fk)) map[fk] = fields[fk]; }
      if (newLabel) map[F.displayName] = newLabel;
      for (var k in map) {
        if (!own.call(map, k)) continue;
        var td = tr.querySelector('td.' + k);
        if (!td) continue;
        var span = td.querySelector('span');
        (span || td).textContent = map[k];
      }
    } catch (e) { /* best-effort */ }
  }

  function syncModel(viewKey, recId, resp, fk, value) {
    try {
      if (typeof SCW.syncKnackModel === 'function') {
        SCW.syncKnackModel(viewKey, recId, resp, fk, value);
      }
    } catch (e) { /* best-effort */ }
  }

  function builderFixMsg(viewKey) {
    return 'add field_1943 / field_1641 / field_2458 as inline-editable ' +
      'columns on ' + viewKey + ' in Builder.';
  }

  /** Verification GET: read the recomputed display formula. The server's
   *  label is the truth — push it to the caller and patch identifiers.
   *  If the caller changed the NAME and the recomputed label doesn't carry
   *  it, the write was silently dropped. */
  function verifyLabel(opts, fields) {
    setTimeout(function () {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(opts.viewKey, opts.recordId),
        type: 'GET',
        success: function (resp2) {
          var srv = labelOf(resp2);
          if (!srv) return;
          syncModel(opts.viewKey, opts.recordId, resp2, F.displayName, srv);
          patchConnectionIdentifiers(opts.recordId, srv);
          patchSourceViewDom(opts.viewKey, opts.recordId, {}, srv);
          var newName = Object.prototype.hasOwnProperty.call(fields, F.name)
            ? String(fields[F.name]).trim() : '';
          if (newName && srv.indexOf(newName) === -1) {
            var msg = 'NOT saved — ' + builderFixMsg(opts.viewKey);
            console.warn('[scw-mdf-edit] rename did NOT persist — the display ' +
              'formula (' + F.displayName + ') recomputed to "' + srv + '" ' +
              'without the new name, so ' + opts.viewKey + ' silently dropped ' +
              'the write. Builder fix: ' + builderFixMsg(opts.viewKey),
              { sent: fields, serverLabel: srv });
            if (opts.onDropped) opts.onDropped([F.name], msg);
            return;
          }
          if (opts.onLabel) opts.onLabel(srv, resp2);
        },
        error: function () { /* verification is best-effort */ }
      });
    }, VERIFY_DELAY_MS);
  }

  /** Compose a user-displayable message for an HTTP error: Knack's actual
   *  rejection reason + live view-schema introspection of the view-scoped
   *  PUT preconditions (view type / cell editor / column / ignore_edit). */
  function diagnoseError(viewKey, fields, xhr) {
    var srvMsg = '';
    try {
      var rb = JSON.parse((xhr && xhr.responseText) || '');
      var errs = (rb && (rb.errors || rb.error)) || [];
      if (!Array.isArray(errs)) errs = [errs];
      srvMsg = errs.map(function (er) {
        return (er && (er.message || er.msg)) || (typeof er === 'string' ? er : '');
      }).filter(Boolean).join('; ');
    } catch (e) { /* not JSON */ }
    var vinfo = null;
    try {
      var kv = window.Knack && Knack.views && Knack.views[viewKey];
      var vv = kv && kv.model && kv.model.view;
      if (vv) {
        vinfo = {
          type: vv.type || '',
          cellEditor: !!(vv.options && vv.options.cell_editor),
          columns: {}
        };
        var cols = vv.columns || [];
        for (var ci = 0; ci < cols.length; ci++) {
          var col = cols[ci] || {};
          var cf = (col.field && col.field.key) || col.id;
          if (cf) vinfo.columns[cf] = { ignoreEdit: !!col.ignore_edit };
        }
      }
    } catch (e) { /* best-effort */ }
    var problems = [];
    if (vinfo) {
      if (vinfo.type && vinfo.type !== 'table') {
        problems.push(viewKey + ' is a "' + vinfo.type + '" view — record ' +
          'PUTs need an inline-editable grid (table). Use/add a grid of MDF/IDF ' +
          'locations on this scene instead.');
      } else if (!vinfo.cellEditor) {
        problems.push('inline editing (cell editor) is OFF on ' + viewKey +
          ' as this page loaded it — enable it in Builder, then hard-refresh.');
      } else {
        for (var pk in fields) {
          if (!Object.prototype.hasOwnProperty.call(fields, pk)) continue;
          var colInfo = vinfo.columns[pk];
          if (!colInfo) {
            problems.push(pk + ' is not a column on ' + viewKey +
              ' — add it to the grid in Builder.');
          } else if (colInfo.ignoreEdit) {
            problems.push(pk + '’s column on ' + viewKey +
              ' has inline editing disabled (column setting).');
          }
        }
      }
    }
    console.warn('[scw-mdf-edit] save failed', {
      view: viewKey, sent: fields,
      status: xhr && xhr.status, response: xhr && xhr.responseText,
      viewSchema: vinfo, problems: problems
    });
    var msg = 'Save failed (' + (xhr && xhr.status) + ')';
    if (srvMsg) msg += ': ' + srvMsg;
    if (problems.length) {
      msg += ' — ' + problems.join(' ');
    } else if (!srvMsg || /invalid request/i.test(srvMsg)) {
      msg += ' — view schema looks editable from here; see console ' +
        '([scw-mdf-edit]) for the sent fields + view schema snapshot.';
    }
    return msg;
  }

  function save(opts) {
    var fields = opts.fields || {};
    var fks = [];
    for (var fk0 in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, fk0)) fks.push(fk0);
    }
    if (!fks.length) return;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(opts.viewKey, opts.recordId),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function (resp) {
        var echo = recOf(resp);
        var dropped = [];
        var landed = [];
        for (var k = 0; k < fks.length; k++) {
          var fk = fks[k];
          // Contradiction-based drop detection — see header note (2).
          if (echo && ((fk + '_raw') in echo || fk in echo)) {
            var got = echo[fk + '_raw'] != null ? echo[fk + '_raw'] : echo[fk];
            got = stripTags(got == null ? '' : String(got));
            if (got !== stripTags(fields[fk])) { dropped.push(fk); continue; }
          }
          landed.push(fk);
          syncModel(opts.viewKey, opts.recordId, resp, fk, fields[fk]);
        }
        if (dropped.length) {
          var msg = 'NOT saved: ' + dropped.join(', ') + ' — enable inline ' +
            'editing on its column on ' + opts.viewKey + ' in Builder.';
          console.warn('[scw-mdf-edit] server echoed a DIFFERENT value for ' +
            dropped.join(', ') + ' — its column on ' + opts.viewKey +
            ' is displayed without inline editing, so the write was dropped.',
            { sent: fields, echoedRecord: echo });
          if (opts.onDropped) opts.onDropped(dropped, msg);
        }
        var landedFields = {};
        for (var l = 0; l < landed.length; l++) landedFields[landed[l]] = fields[landed[l]];
        patchSourceViewDom(opts.viewKey, opts.recordId, landedFields, '');
        if (opts.onDone) opts.onDone({ landed: landed, dropped: dropped, resp: resp });
        // Identity change → verify against the recomputed display formula.
        var identityTouched =
          Object.prototype.hasOwnProperty.call(fields, F.type) ||
          Object.prototype.hasOwnProperty.call(fields, F.num) ||
          Object.prototype.hasOwnProperty.call(fields, F.name);
        if (identityTouched && landed.length) verifyLabel(opts, fields);
      },
      error: function (xhr) {
        if (opts.onError) opts.onError(diagnoseError(opts.viewKey, fields, xhr), xhr);
      }
    });
  }

  // ── SURVEY NOTES LOG (field_2457) ──────────────────────────────────────
  // A closet's survey notes are one field shared by every survey of the
  // site, so a survey ADDS an entry instead of overwriting what an earlier
  // survey wrote (decided 2026-11-02). Each entry opens with a stamp line
  // naming the date and the SURVEY RECORD only — never the person or the
  // company:
  //
  //     [11/02/2026 · SR1145] Rack is full; two open ports on the patch panel.
  //
  //     [10/14/2026 · SR1102] Closet locked — key with the front desk.
  //
  // Newest first (an append PREPENDS). Text written before the log existed
  // has no stamp: the first append marks it "[Earlier notes] …" so it stays
  // its own entry at the bottom instead of running into the entry above it.
  // Sub-facing surfaces show only the current survey's entries (plus the
  // unstamped earlier text, which every sub at the site could already
  // read); ops surfaces show every entry.
  var SURVEY_STAMP_RE = /^\[(\d{1,2}\/\d{1,2}\/\d{4})\s*·\s*([^\]\n]*)\]\s?(.*)$/;
  var EARLIER_TAG = '[Earlier notes]';
  var EARLIER_RE = /^\[Earlier notes\]\s?(.*)$/i;
  var SURVEY_ROUTE_RE = /site-survey-request-details2?\/([a-f0-9]{24})/gi;
  var SURVEY_ID_FIELD = 'field_2345';   // object_113 REQ_ID "60524852230-SR1145"
  var LOG_STYLE_ID = 'scw-mdf-svlog-css';

  function plainText(v) {
    return String(v == null ? '' : v).replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /** "60524852230-SR1145" / "SR-1145" → "SR1145"; anything else as given. */
  function shortSurveyLabel(identifier) {
    var s = plainText(identifier).trim();
    var m = /SR\s*-?\s*(\d+)/i.exec(s);
    return m ? 'SR' + m[1] : s;
  }

  function stampDate(d) {
    d = d || new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }

  /** The survey request this page is about: the DEEPEST
   *  site-survey-request-details(2)/<id> segment of the route (Knack nests a
   *  page under the page it was opened from — never take the first match),
   *  labelled from any loaded record that names it. null off survey pages. */
  var _ctxMemo = { id: '', label: '' };   // a found label, per survey id
  function surveyContext(hash) {
    var h = hash != null ? String(hash) : String((window.location && window.location.hash) || '');
    var id = '', m;
    SURVEY_ROUTE_RE.lastIndex = 0;
    while ((m = SURVEY_ROUTE_RE.exec(h))) id = m[1];
    if (!id) return null;
    if (_ctxMemo.id === id && _ctxMemo.label) return { id: id, label: _ctxMemo.label };
    var label = '';
    var own = Object.prototype.hasOwnProperty;
    function look(a) {
      if (!a) return '';
      if (a.id === id) {
        var idf = a[SURVEY_ID_FIELD + '_raw'] != null ? a[SURVEY_ID_FIELD + '_raw'] : a[SURVEY_ID_FIELD];
        if (idf) return plainText(idf);
        if (a.identifier) return plainText(a.identifier);
      }
      for (var k in a) {
        if (!own.call(a, k) || !/_raw$/.test(k) || !Array.isArray(a[k])) continue;
        for (var i = 0; i < a[k].length; i++) {
          var c = a[k][i];
          if (c && c.id === id && c.identifier != null && c.identifier !== '') return plainText(c.identifier);
        }
      }
      return '';
    }
    try {
      var views = (window.Knack && Knack.views) || {};
      for (var vk in views) {
        if (!own.call(views, vk) || label) continue;
        var mdl = views[vk] && views[vk].model;
        if (!mdl) continue;
        if (mdl.attributes && mdl.attributes.id) label = look(mdl.attributes);
        var rows = (mdl.data && mdl.data.models) || [];
        for (var r = 0; r < rows.length && !label; r++) label = look(rows[r] && (rows[r].attributes || rows[r]));
      }
    } catch (e) { /* not on a Knack page */ }
    label = label ? shortSurveyLabel(label) : '';
    if (label) _ctxMemo = { id: id, label: label };
    return { id: id, label: label };
  }

  function composeSurveyEntry(text, surveyLabel, date) {
    var body = plainText(text).replace(/\n{3,}/g, '\n\n').trim();
    if (!body) return '';
    return '[' + stampDate(date) + ' · ' + (String(surveyLabel || '').trim() || 'Survey') + '] ' + body;
  }

  /** Stored text → entries in stored order (newest first). The text after
   *  an "[Earlier notes]" marker, and any unstamped text above the first
   *  stamp (a field no survey has added to yet), is ONE legacy entry, kept
   *  last. */
  function parseSurveyLog(text) {
    var lines = plainText(text).split('\n');
    var entries = [], legacy = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var m = SURVEY_STAMP_RE.exec(lines[i]);
      var e = !m && EARLIER_RE.exec(lines[i]);
      if (m) {
        cur = { date: m[1], survey: m[2].trim(), lines: [m[3]], legacy: false };
        entries.push(cur);
      } else if (e) {
        cur = { lines: legacy, legacy: true };
        legacy.push(e[1]);
      } else if (cur) {
        cur.lines.push(lines[i]);
      } else {
        legacy.push(lines[i]);
      }
    }
    var out = [];
    for (var j = 0; j < entries.length; j++) {
      var t = entries[j].lines.join('\n').trim();
      if (t) out.push({ date: entries[j].date, survey: entries[j].survey, text: t, legacy: false });
    }
    var lt = legacy.join('\n').trim();
    if (lt) out.push({ date: '', survey: '', text: lt, legacy: true });
    return out;
  }

  /** The stored text with any unstamped, unmarked text that opens it marked
   *  "[Earlier notes]" — done once, by the first append. */
  function markEarlier(cur) {
    if (!cur) return cur;
    var first = cur.split('\n')[0];
    return (SURVEY_STAMP_RE.test(first) || EARLIER_RE.test(first)) ? cur : EARLIER_TAG + ' ' + cur;
  }

  /** Entries a surface may show. opts.only = a survey label → that survey's
   *  entries + the unstamped earlier text; opts.ownOnly with no label → the
   *  earlier text alone (a sub surface that is about no survey). */
  function visibleSurveyEntries(text, opts) {
    var all = parseSurveyLog(text);
    opts = opts || {};
    if (!opts.ownOnly) return all;
    var mine = String(opts.only || '').toUpperCase();
    return all.filter(function (e) {
      return e.legacy || (mine && String(e.survey).toUpperCase() === mine);
    });
  }

  function injectLogStyles() {
    if (document.getElementById(LOG_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = LOG_STYLE_ID;
    style.textContent = [
      '.scw-svlog { display: flex; flex-direction: column; gap: 8px; }',
      '.scw-svlog__e { padding-left: 9px; border-left: 2px solid #cbd5e1; }',
      '.scw-svlog__e--legacy { border-left-style: dashed; }',
      '.scw-svlog__meta { font: 700 10px/1.3 system-ui, sans-serif; letter-spacing: .04em;',
      '  text-transform: uppercase; color: #64748b; }',
      '.scw-svlog__txt { font: 13px/1.5 system-ui, sans-serif; color: #1e293b; white-space: pre-line; }',
      '.scw-svlog--empty { font: 13px/1.5 system-ui, sans-serif; color: #94a3b8; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  /** The log as HTML (escaped). '' when nothing is visible, unless
   *  opts.emptyText is given. */
  function renderSurveyLog(text, opts) {
    opts = opts || {};
    var list = visibleSurveyEntries(text, opts);
    injectLogStyles();
    if (!list.length) {
      return opts.emptyText
        ? '<div class="scw-svlog scw-svlog--empty">' + esc(opts.emptyText) + '</div>' : '';
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      html += '<div class="scw-svlog__e' + (e.legacy ? ' scw-svlog__e--legacy' : '') + '">' +
        '<div class="scw-svlog__meta">' +
          (e.legacy ? 'Earlier notes' : esc(e.date + ' · ' + e.survey)) + '</div>' +
        '<div class="scw-svlog__txt">' + esc(e.text) + '</div></div>';
    }
    return '<div class="scw-svlog">' + html + '</div>';
  }

  function rawFieldOf(rec, fk) {
    if (!rec) return null;
    var v = rec[fk + '_raw'] != null ? rec[fk + '_raw'] : rec[fk];
    return v == null ? null : plainText(v);
  }
  function modelFieldOf(viewKey, recId, fk) {
    try {
      var v = Knack.views[viewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        if (models[i] && models[i].id === recId) return rawFieldOf(models[i].attributes, fk);
      }
    } catch (e) { /* view not on scene */ }
    return null;
  }

  /** Add one stamped entry to a closet's survey notes. Reads the record
   *  first (another survey may have added an entry since this page loaded),
   *  puts the new entry on top, and saves through save() — so the PUT gets
   *  the same drop detection and model sync as every other closet edit.
   *  opts: { viewKey, recordId, text, survey (label), date?, current?,
   *          onDone({ value, entry, landed, dropped }), onDropped, onError }
   *  `current` is the fallback when the read fails (the model's copy). */
  function appendSurveyNote(opts) {
    var entry = composeSurveyEntry(opts.text, opts.survey, opts.date);
    if (!entry) return false;
    var fk = F.surveyNotes;
    function write(current) {
      var cur = markEarlier(plainText(current == null ? '' : current).trim());
      var value = cur ? entry + '\n\n' + cur : entry;
      var fields = {}; fields[fk] = value;
      save({
        viewKey: opts.viewKey,
        recordId: opts.recordId,
        fields: fields,
        onDone: function (res) {
          if (opts.onDone) opts.onDone({ value: value, entry: entry, landed: res.landed, dropped: res.dropped, resp: res.resp });
        },
        onDropped: opts.onDropped,
        onError: opts.onError
      });
    }
    var fallback = opts.current != null ? opts.current : modelFieldOf(opts.viewKey, opts.recordId, fk);
    // Never write blind: when neither the read nor the model carries the
    // field, the PUT would replace every earlier entry with this one.
    function writeOrRefuse(v) {
      if (v != null) return write(v);
      console.warn('[scw-mdf-edit] survey note NOT added — ' + fk + ' is not a column on ' +
        opts.viewKey + ', so the existing notes could not be read.');
      if (opts.onError) opts.onError('Not saved — the existing survey notes could not be read (' +
        fk + ' is not a column on ' + opts.viewKey + ').', null);
    }
    SCW.knackAjax({
      url: SCW.knackRecordUrl(opts.viewKey, opts.recordId),
      type: 'GET',
      success: function (resp) {
        var v = rawFieldOf(recOf(resp), fk);
        writeOrRefuse(v != null ? v : fallback);
      },
      error: function () { writeOrRefuse(fallback); }
    });
    return true;
  }

  SCW.mdfEdit = {
    FIELDS: F,
    parseDisplayName: parseDisplayName,
    composeLabel: composeLabel,
    patchConnectionIdentifiers: patchConnectionIdentifiers,
    patchSourceViewDom: patchSourceViewDom,
    save: save,
    // survey notes log
    surveyContext: surveyContext,
    shortSurveyLabel: shortSurveyLabel,
    composeSurveyEntry: composeSurveyEntry,
    parseSurveyLog: parseSurveyLog,
    visibleSurveyEntries: visibleSurveyEntries,
    renderSurveyLog: renderSurveyLog,
    appendSurveyNote: appendSurveyNote
  };
})();
/*** END MDF/IDF EDIT CORE ****************************************************/
