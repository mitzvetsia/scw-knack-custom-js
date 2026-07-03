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
 *   collectTypeOptions()     → [{id, label}] photo-type candidates scraped
 *                              from field_2445 connection values rendered
 *                              anywhere on the current scene.
 *
 * SAVE_VIEWS maps each worksheet source view → the DOC_photos view ON THE
 * SAME SCENE that PUTs go through (view-based PUTs only work against views
 * on the current scene). Those views must expose field_771 / field_2445 /
 * field_2446 as inline-editable or Knack rejects the write.
 ****************************************************************************/
(function () {
  'use strict';

  var SAVE_VIEWS = {
    view_3915: 'view_3937',   // deploy / implementation (scene_1311)
    view_4056: 'view_3937',   // "WHAT WE'RE INSTALLING" (same scene)
    view_3962: 'view_3584',   // build-SOW scene DOC_photos grid
    view_3505: 'view_4070'    // survey scene DOC_photos grid
  };

  var F = {
    img:      'field_771',
    type:     'field_2445',
    required: 'field_2446'
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

  window.SCW = window.SCW || {};
  SCW.photoEditPanel = {
    SAVE_VIEWS: SAVE_VIEWS,
    util: {
      downscale: downscale,
      uploadImage: uploadImage,
      putRecord: putRecord,
      clearFileField: clearFileField,
      FIELDS: F
    }
  };
})();
/*** END PHOTO EDIT MACHINERY *************************************************/
