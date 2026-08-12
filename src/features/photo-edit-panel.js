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
 * SAVE_VIEWS maps each worksheet source view → the DOC_photos view ON THE
 * SAME SCENE that PUTs go through (view-based PUTs only work against views
 * on the current scene). Those views must expose field_771 / field_2445 /
 * field_2446 as inline-editable or Knack rejects the write.
 ****************************************************************************/
(function () {
  'use strict';

  var SAVE_VIEWS = {
    view_4093: 'view_3937',   // deploy / implementation (scene_1311)
    // view_4056 (sub deployment dashboard) deliberately UNMAPPED — subs
    // don't do photo QA / classify (decided 2026-08-12), and view_3937
    // lives on scene_1311, so a PUT through it 404s from the sub scene
    // anyway (knackRecordUrl uses the CURRENT scene key). photos.js also
    // blocks the QA modal on that surface (QA_MODAL_DISABLED_VIEWS).
    view_3962: 'view_3584',   // build-SOW scene DOC_photos grid
    view_3505: 'view_4070'    // survey scene DOC_photos grid
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

  function uploadImage(blob, filename) {
    var fd = new FormData();
    fd.append('files', blob, filename || 'photo.jpg');
    return new Promise(function (resolve, reject) {
      $.ajax({
        url: Knack.api_url + '/v1/applications/' + Knack.application_id + '/assets/image/upload',
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
        error: function (xhr) { reject(new Error('upload failed (' + (xhr && xhr.status) + ')')); }
      });
    });
  }

  function putRecord(saveView, recordId, data) {
    return new Promise(function (resolve, reject) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(saveView, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: resolve,
        error: function (xhr) { reject(new Error('save failed (' + (xhr && xhr.status) + ')')); }
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
      collectTypeOptions: collectTypeOptions,
      FIELDS: F
    }
  };
})();
/*** END PHOTO EDIT MACHINERY *************************************************/
