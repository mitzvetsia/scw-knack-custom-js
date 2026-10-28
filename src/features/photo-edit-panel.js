/*** PHOTO EDIT MACHINERY (SCW.photoEditPanel) ********************************
 *
 * Shared plumbing for photo add/classify inside the photo QA modal
 * (qa-popover.js) — the single custom panel for photo-strip interactions.
 * This module deliberately renders NO UI of its own:
 *
 *   downscale(file)          → Blob | null. Re-encodes oversized raster
 *                              images down a JPEG ladder (bulk-upload.js
 *                              parity, EXIF-orientation-safe) until they
 *                              fit TARGET_BYTES; hard-capped at CAP_BYTES.
 *   uploadImage(blob, name)  → Promise<assetId>. Knack image-asset upload
 *                              authenticated with the user's session token
 *                              (no REST key, no Make hop).
 *   putRecord(view, id, data)→ view-based PUT via SCW.knackAjax.
 *   collectTypeOptions()     → [{id, label}] photo-type candidates. Prefers
 *                              window.SCW.photoTypeOptions — the FULL
 *                              catalog, populated by the Builder snippet
 *                              knack-snippets/config-photo-type-options
 *                              .snippet.js — falling back to whatever
 *                              field_2445 connection values happen to be
 *                              rendered on the current scene (incomplete by
 *                              construction: only types already in use).
 *
 * SAVE_VIEWS maps each worksheet source view → the DOC_photos view that
 * PUTs go through: a grid with field_771 / field_2445 / field_2446 inline-
 * editable, or an UPDATE FORM whose inputs carry them. The PUT is addressed
 * under the scene that OWNS the save view (util.js knackRecordUrl →
 * sceneOfView), so the view need not be on the page — a form on a child
 * scene works (view_3585 below). A view with no editable field for what is
 * sent is a 400 "Invalid request" / 403 "Unauthorized view access" from
 * Knack, whatever page it sits on (view_3584 on the Build SOW page, found
 * 2026-10-28: Edit + Delete links only, inline editing off). putRecord drops
 * the fields a FORM save view has no input for (one console line names
 * them) and rejects when nothing is left, so a stamp the form cannot take
 * fails honestly instead of 200ing without a write.
 ****************************************************************************/
(function () {
  'use strict';

  var SAVE_VIEWS = {
    view_4093: 'view_3937',   // deploy / implementation (scene_1311)
    // view_4056 (sub deployment dashboard): the RESTRICTED photo modal
    // (upload / view / replace — no classify, no QA; photos.js
    // QA_MODAL_RESTRICTED_VIEWS, decided 2026-09-02, partially reversing
    // the 2026-08-12 full opt-out after sub feedback that upload-then-drag
    // is the only way to fill a required slot). ⚠️ TO ACTIVATE: add a
    // DOC_photos grid to the SUB deployment scene with field_771
    // inline-editable (view-based PUTs are same-scene only — view_3937
    // 404s from there). view_4158 is that grid (added 2026-09-03).
    view_4056: 'view_4158',  // sub deployment scene DOC_photos grid
    // view_3962 (ops Build SOW page, scene_1085): the edit-photo FORM on the
    // child scene_1159 — image / type / required / notes inputs, no record
    // rules. It replaced view_3584 on 2026-10-28 (Slack, photo uploads
    // failing on the Build SOW page): view_3584 is the grid that only houses
    // the photo strip's Edit link — no field columns, inline editing off, so
    // every PUT through it was a 400 / 403 (it was never exercised until v2
    // "+ Add Photos" replaced the v1 uploader for @getscw.com on
    // 2026-10-16). view_3917, the page's editable DOC_photos grid, serves
    // only unassigned photos (source filter "REL_sow line items is blank"),
    // so the slots being filled are outside it. ⚠️ Builder (optional): add
    // FLAG_complete (field_2447) and QA_history (field_2865) as inputs on
    // view_3585 and the fill's completion stamp / Remove-photo flag land
    // from this page too — until then putRecord drops them (console line).
    view_3962: 'view_3585',   // build-SOW: edit-photo form (scene_1159)
    // view_3921 (Reconcile Bids page, scene_1155 — v2 "+ Add Photos" there
    // since 2026-10-28): the same SOW line items, and the scene's only
    // DOC_photos grid (view_4098) is a delete-only link grid, so the same
    // edit-photo form serves it — a view is addressed under its own scene.
    view_3921: 'view_3585',   // reconcile page: edit-photo form (scene_1159)
    view_3505: 'view_4070',   // survey scene DOC_photos grid
    // view_3586 (sales scope-of-work page, scene_1116): the RESTRICTED
    // modal with NO QA (photos.js PHOTO_MODAL_POLICY qa:'none'). Before this
    // mapping the upload pane fell back to view_3937 — the DEPLOY scene's
    // grid — and every PUT 403'd from the sales scene. view_3522 is the
    // "Additional Photos" DOC_photos grid already on that scene.
    // ⚠️ Builder (TO ACTIVATE): view_3522 must (a) include the photos being
    // edited — widen its source filter from "not assigned to a SOW item" to
    // every photo on this SOW (photo-grid-unlinked-filter.js keeps the
    // visible section showing only the unassigned ones), and (b) have
    // inline editing on field_771 (PIC). field_2447 (FLAG_complete) inline-
    // editable too, or "Remove photo" clears the image but leaves the
    // completed flag set; field_2865 (QA history) inline-editable so the
    // sales user's replace/remove events land in the history log they
    // now read (photos.js PHOTO_MODAL_POLICY view_3586 qa:'readonly').
    view_3586: 'view_3522'    // sales scene DOC_photos grid ("Additional Photos")
  };

  var F = {
    img:      'field_771',
    type:     'field_2445',
    required: 'field_2446'
  };

  // Photo-type catalog source — a HIDDEN grid of the CONFIG_photo type
  // object on the deploy scene, read via the view model (session-token
  // auth; the view-based pattern from Known Issue #17 — NOT the REST-key
  // Builder snippet). Fill in once the grid exists in Builder:
  //   view:       the hidden grid's view key
  //   labelField: the type object's display-name field on that grid
  var TYPE_SOURCE = {
    view:       '',   // TODO: e.g. 'view_41XX'
    labelField: ''    // TODO: e.g. 'field_XXXX'
  };

  var LADDER = [
    { edge: 2400, quality: 0.85 },
    { edge: 2000, quality: 0.80 },
    { edge: 1600, quality: 0.75 },
    { edge: 1280, quality: 0.70 }
  ];
  var TARGET_BYTES = 1.5 * 1024 * 1024;
  var CAP_BYTES    = 5   * 1024 * 1024;

  function loadViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload  = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
          .catch(function () { return loadViaImg(file); });
      } catch (e) { /* older signature */ }
    }
    return loadViaImg(file);
  }
  function canvasToJpeg(src, w, h, q) {
    return new Promise(function (resolve, reject) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      c.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob null')); }, 'image/jpeg', q);
    });
  }
  function downscale(file) {
    if (file.size <= TARGET_BYTES) return Promise.resolve(file);
    var t = (file.type || '').toLowerCase();
    var raster = t.indexOf('image/') === 0 && t !== 'image/svg+xml' && t !== 'image/gif';
    if (!raster) return Promise.resolve(file.size <= CAP_BYTES ? file : null);
    return loadBitmap(file).then(function (src) {
      var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
      if (!sw || !sh) throw new Error('no dims');
      var smallest = null;
      function attempt(i) {
        if (i >= LADDER.length) {
          return Promise.resolve(smallest && smallest.size <= CAP_BYTES ? smallest : null);
        }
        var step = LADDER[i];
        var scale = Math.min(1, step.edge / Math.max(sw, sh));
        return canvasToJpeg(src, Math.max(1, Math.round(sw * scale)),
                            Math.max(1, Math.round(sh * scale)), step.quality)
          .then(function (blob) {
            if (!smallest || blob.size < smallest.size) smallest = blob;
            if (blob.size <= TARGET_BYTES) return blob;
            return attempt(i + 1);
          });
      }
      return attempt(0).then(function (b) {
        if (src.close) { try { src.close(); } catch (e) {} }
        return b;
      });
    }).catch(function () { return file.size <= CAP_BYTES ? file : null; });
  }

  // Knack's own error text for a failed request — its REST endpoints answer
  // 400 / 403 with {"errors":[{"message":"…"}]} — so a failure names its
  // CAUSE, not only its status. 2026-10-28: three users saw "save failed
  // (400)" / "(403)" on every photo upload of one project and nothing on the
  // page said why (view not on the page? field not editable? record outside
  // the view's source?). The message now rides the error the modals show,
  // and one console line carries the request that failed.
  function knackErrorText(xhr) {
    var msg = '';
    try {
      var j = xhr && (xhr.responseJSON ||
        (typeof xhr.responseText === 'string' && /^\s*[\[{]/.test(xhr.responseText)
          ? JSON.parse(xhr.responseText) : null));
      if (j) {
        if (Array.isArray(j.errors)) {
          msg = j.errors.map(function (e) {
            return (e && (e.message || e.msg)) || (typeof e === 'string' ? e : '');
          }).filter(Boolean).join('; ');
        } else if (j.message) msg = String(j.message);
        else if (j.error) msg = String(j.error);
      }
    } catch (e) { /* not JSON */ }
    if (!msg && xhr && typeof xhr.responseText === 'string') {
      msg = xhr.responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    }
    return msg;
  }
  function failError(kind, xhr, url, detail) {
    var status = xhr ? xhr.status : undefined;
    var txt = knackErrorText(xhr);
    var m = kind + ' failed (' + status + ')' + (txt ? ': ' + txt : '');
    try {
      console.warn('[scw-pep] ' + m + (url ? ' — ' + (xhr && xhr.status === 0 ? 'no response (network / CORS) ' : '') + url : '') +
        (detail ? ' — ' + detail : '') +
        ((status === 400 || status === 403) && /pages\//.test(url || '')
          ? ' — a 400 / 403 on a view-based PUT usually means the view is not on this page, the field is not inline-editable on it, or the record is outside the view\'s source'
          : ''));
    } catch (e) { /* console unavailable */ }
    var err = new Error(m);
    err.status = status;
    err.knackMessage = txt;
    return err;
  }

  function uploadImage(blob, filename) {
    var fd = new FormData();
    fd.append('files', blob, filename || 'photo.jpg');
    var uploadUrl = Knack.api_url + '/v1/applications/' + Knack.application_id + '/assets/image/upload';
    return new Promise(function (resolve, reject) {
      $.ajax({
        url: uploadUrl,
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
          var id = res && (res.id || (res.asset && res.asset.id));
          id ? resolve(id) : reject(new Error('no asset id in response'));
        },
        error: function (xhr) {
          reject(failError('upload', xhr, uploadUrl, (blob && blob.size) ? Math.round(blob.size / 1024) + ' KB' : ''));
        }
      });
    });
  }

  // A FORM save view can only write the fields its inputs carry (util.js
  // viewWritableFields; null for a grid or an unknown view = send as-is).
  // Fields it lacks are dropped — one console line per view + field set
  // names them, so the Builder fix is spelled out — and a body with nothing
  // left REJECTS (status 400, no request): a 200 that wrote nothing would
  // read as saved. Callers that treat a stamp as best-effort (photo-assign's
  // completion stamp) already catch and move on.
  var _droppedOnce = {};
  function writableBody(saveView, data) {
    var allowed = null;
    try { allowed = (typeof SCW.viewWritableFields === 'function') ? SCW.viewWritableFields(saveView) : null; }
    catch (e) { allowed = null; }
    var body = {}, dropped = [];
    for (var k in data) {
      if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
      if (allowed && allowed.indexOf(k) < 0) dropped.push(k); else body[k] = data[k];
    }
    return { body: body, dropped: dropped };
  }
  function putRecord(saveView, recordId, data) {
    var url = SCW.knackRecordUrl(saveView, recordId);
    var w = writableBody(saveView, data || {});
    if (w.dropped.length) {
      var sig = saveView + ':' + w.dropped.join(',');
      if (!_droppedOnce[sig]) {
        _droppedOnce[sig] = true;
        console.info('[scw-pep] ' + saveView + ' has no input for ' + w.dropped.join(', ') +
          ' — not sent. Add the field(s) to that form in Builder to write them from this page.');
      }
    }
    if (!Object.keys(w.body).length) {
      var err = new Error('save skipped: ' + saveView + ' has no input for ' + w.dropped.join(', '));
      err.status = 400;
      err.knackMessage = 'no writable field on ' + saveView;
      return Promise.reject(err);
    }
    return new Promise(function (resolve, reject) {
      SCW.knackAjax({
        url: url,
        type: 'PUT',
        data: JSON.stringify(w.body),
        success: resolve,
        error: function (xhr) {
          reject(failError('save', xhr, url, 'fields: ' + Object.keys(w.body).join(', ')));
        }
      });
    });
  }

  /** Clear a file/image field. Knack is inconsistent about what empties an
   *  asset field — some fields treat null as "no change" (the PUT 200s but
   *  the file survives). So: PUT null, VERIFY against the response record,
   *  and if the asset is still there retry with '' before giving up. */
  function clearFileField(saveView, recordId, fieldKey, extraFields) {
    function stillThere(resp) {
      var rec = (resp && (resp.record || resp)) || {};
      var raw = rec[fieldKey + '_raw'];
      if (raw && (raw.url || raw.id || raw.filename)) return true;
      var plain = rec[fieldKey];
      if (typeof plain === 'string' && plain.trim() &&
          /asset|<img|<a /i.test(plain)) return true;
      return false;   // absent from the response counts as cleared
    }
    function attempt(value) {
      var body = {};
      body[fieldKey] = value;
      if (extraFields) for (var k in extraFields) body[k] = extraFields[k];
      return putRecord(saveView, recordId, body);
    }
    return attempt(null).then(function (resp) {
      if (!stillThere(resp)) return resp;
      console.warn('[scw-pep] null did not clear ' + fieldKey + ' — retrying with ""');
      return attempt('').then(function (resp2) {
        if (!stillThere(resp2)) return resp2;
        throw new Error(fieldKey + ' would not clear (null and "" both ignored)');
      });
    });
  }

  /** Photo-type candidates for a type picker. Prefers the full catalog
   *  (window.SCW.photoTypeOptions, from the Builder snippet); falls back to
   *  scraping field_2445 connection-value spans already rendered anywhere on
   *  the current scene — necessarily incomplete (only types in use), but
   *  keeps a picker functional before the snippet's object/field TODOs are
   *  filled in. */
  function collectTypeOptions() {
    var catalog = window.SCW && SCW.photoTypeOptions;
    if (Array.isArray(catalog) && catalog.length) {
      var out = [];
      for (var i = 0; i < catalog.length; i++) {
        if (catalog[i] && catalog[i].id) out.push({ id: catalog[i].id, label: catalog[i].label });
      }
      if (out.length) return out;
    }
    // Full catalog from the hidden type-object grid's model (preferred —
    // complete by construction, no key, no scrape).
    if (TYPE_SOURCE.view && TYPE_SOURCE.labelField) {
      try {
        var tv = typeof Knack !== 'undefined' && Knack.views && Knack.views[TYPE_SOURCE.view];
        var models = tv && tv.model && tv.model.data && tv.model.data.models;
        if (models && models.length) {
          var fromView = [];
          for (var m = 0; m < models.length; m++) {
            var a = models[m].attributes || models[m];
            var lbl = String(a[TYPE_SOURCE.labelField] || '').replace(/<[^>]*>/g, '').trim();
            if (a.id && lbl) fromView.push({ id: a.id, label: lbl });
          }
          if (fromView.length) {
            fromView.sort(function (x, y) {
              return x.label.localeCompare(y.label, undefined, { numeric: true, sensitivity: 'base' });
            });
            return fromView;
          }
        }
      } catch (eTv) { /* fall through to the scene scrape */ }
    }
    // Scrape shape gotcha: in grouped photo columns the OUTER span's `id`
    // attr is the PHOTO record id and only the INNER span's class is the
    // TYPE record id (24-hex). Walk the INNERMOST connection-value spans
    // and take the 24-hex class — never the id attr, which on wrappers
    // points at the photo record (a 400 on PUT).
    var seen = {};
    var scraped = [];
    var spans = document.querySelectorAll(
      'td.' + F.type + ' span[data-kn="connection-value"]');
    for (var s = 0; s < spans.length; s++) {
      if (spans[s].querySelector('span[data-kn="connection-value"]')) continue; // wrapper
      var id = (spans[s].className || '').trim();
      if (!/^[0-9a-f]{24}$/i.test(id) || seen[id]) continue;
      var label = (spans[s].textContent || '').trim();
      if (!label) continue;
      seen[id] = true;
      scraped.push({ id: id, label: label });
    }
    scraped.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
    return scraped;
  }

  window.SCW = window.SCW || {};
  SCW.photoEditPanel = {
    SAVE_VIEWS: SAVE_VIEWS,
    util: {
      downscale: downscale,
      uploadImage: uploadImage,
      putRecord: putRecord,
      clearFileField: clearFileField,
      knackErrorText: knackErrorText,
      collectTypeOptions: collectTypeOptions,
      FIELDS: F
    }
  };
})();
/*** END PHOTO EDIT MACHINERY *************************************************/
