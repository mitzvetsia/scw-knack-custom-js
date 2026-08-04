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

  SCW.mdfEdit = {
    FIELDS: F,
    parseDisplayName: parseDisplayName,
    composeLabel: composeLabel,
    patchConnectionIdentifiers: patchConnectionIdentifiers,
    patchSourceViewDom: patchSourceViewDom,
    save: save
  };
})();
/*** END MDF/IDF EDIT CORE ****************************************************/
