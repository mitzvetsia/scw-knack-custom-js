/*** PHOTO EDIT PANEL (unified photo-strip click experience) ******************
 *
 * One custom panel for photo-strip photo clicks (worksheet-v2 strips):
 *
 *   1. Photo record with EMPTY field_771 → upload zone. Picked images are
 *      downsampled client-side (same ladder as bulk-upload.js), uploaded to
 *      Knack's asset endpoint with the user's session, then PUT onto
 *      field_771 through the scene's DOC_photos save view. No Make hop.
 *   2. Photo Type (field_2445 connection) + Required (field_2446 Yes/No)
 *      are editable in the panel — whether or not a photo exists — so
 *      untyped/unset records can be classified in place. Type options are
 *      scraped from the connection values already rendered on the scene.
 *   3. Required photos (field_2446 = Yes) get a "Photo QA" button that
 *      opens the existing QA panel (qa-popover.js openAnchor) with the
 *      card's QA snapshot — restoring QA access for records with no image.
 *
 * Saves go through per-scene DOC_photos views (SAVE_VIEWS) — the same
 * view-based PUT idiom as qa-popover.js. The save view MUST expose
 * field_771 / field_2445 / field_2446 as inline-editable or Knack rejects
 * the PUT for that field.
 *
 * Wire-up: worksheet-v2/photos.js routes strip clicks here via
 * SCW.photoEditPanel.open(opts). If the panel can't run (no save view for
 * the scene), open() returns false and the caller falls back to its old
 * behavior (Knack edit page / lightbox) — graceful degradation.
 ****************************************************************************/
(function () {
  'use strict';

  var P        = 'scw-pep';
  var STYLE_ID = P + '-css';

  // Source worksheet view → DOC_photos save view ON THE SAME SCENE.
  // (View-based PUTs only work against views on the current scene.)
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

  // Downsample ladder (bulk-upload.js parity). Target keeps phone photos
  // light without visible quality loss; hard cap guards the upload.
  var LADDER = [
    { edge: 2400, quality: 0.85 },
    { edge: 2000, quality: 0.80 },
    { edge: 1600, quality: 0.75 },
    { edge: 1280, quality: 0.70 }
  ];
  var TARGET_BYTES = 1.5 * 1024 * 1024;
  var CAP_BYTES    = 5   * 1024 * 1024;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  // ── image downscale (copied shape from bulk-upload.js) ───────────
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

  // ── Knack asset upload (session-authenticated, no REST key) ──────
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

  // ── Photo-type options: scrape connection values on the scene ────
  // field_2445 is a connection (→ CONFIG_photo type). Every rendered cell
  // carries <span class="<typeRecordId>" data-kn="connection-value">Label</span>
  // (nested inside the per-photo span on worksheet source views). Collect
  // {id,label} pairs from every view on the scene that shows the column.
  function collectTypeOptions() {
    var map = Object.create(null);
    var cells = document.querySelectorAll(
      'td[data-field-key="' + F.type + '"], td.' + F.type);
    for (var c = 0; c < cells.length; c++) {
      var spans = cells[c].querySelectorAll('span[data-kn="connection-value"]');
      for (var s = 0; s < spans.length; s++) {
        var sp = spans[s];
        // Inner span: class = type record id. Outer per-photo spans have an
        // id attribute (photo record id) — skip those, we want the inner.
        var cls = (sp.className || '').trim();
        if (!/^[a-f0-9]{24}$/i.test(cls)) continue;
        var label = (sp.textContent || '').trim();
        if (label) map[cls] = label;
      }
    }
    var out = [];
    for (var id in map) out.push({ id: id, label: map[id] });
    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
  }

  // ── CSS ───────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + P + '-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55);',
      '  z-index: 99990; display: flex; align-items: center; justify-content: center; padding: 18px; }',
      '.' + P + ' { background: #fff; color: #0f172a; border-radius: 12px; width: 100%;',
      '  max-width: 480px; max-height: calc(100vh - 40px); display: flex; flex-direction: column;',
      '  box-shadow: 0 24px 60px rgba(0,0,0,.4); overflow: hidden;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif; }',
      '.' + P + '__head { display: flex; align-items: center; gap: 10px; padding: 12px 16px;',
      '  background: #f8fafc; border-bottom: 1px solid #e2e8f0; }',
      '.' + P + '__title { font-weight: 700; font-size: 14px; flex: 1; min-width: 0;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.' + P + '__close { background: none; border: 0; cursor: pointer; color: #64748b;',
      '  font-size: 20px; line-height: 1; padding: 2px 6px; }',
      '.' + P + '__close:hover { color: #0f172a; }',
      '.' + P + '__body { padding: 14px 16px; overflow-y: auto; }',
      '.' + P + '__sect { margin-bottom: 16px; }',
      '.' + P + '__label { font: 700 10.5px/1.2 system-ui, sans-serif; letter-spacing: .05em;',
      '  text-transform: uppercase; color: #64748b; margin-bottom: 6px; }',

      // Photo zone
      '.' + P + '__img { display: block; width: 100%; max-height: 300px; object-fit: contain;',
      '  border-radius: 8px; background: #f1f5f9; cursor: zoom-in; }',
      '.' + P + '__drop { display: flex; flex-direction: column; align-items: center; gap: 8px;',
      '  justify-content: center; min-height: 140px; border: 2px dashed #cbd5e1;',
      '  border-radius: 10px; background: #f8fafc; color: #64748b; cursor: pointer;',
      '  text-align: center; padding: 16px; transition: border-color .15s, background .15s; }',
      '.' + P + '__drop:hover, .' + P + '__drop.is-over { border-color: #0f4c75; background: #eff6ff;',
      '  color: #0f4c75; }',
      '.' + P + '__drop input { display: none; }',
      '.' + P + '__upstatus { margin-top: 8px; font-size: 12.5px; color: #0f4c75; font-weight: 600; }',
      '.' + P + '__upstatus.is-err { color: #be123c; }',

      // Type / required controls
      '.' + P + '__select { width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; font: inherit; background: #fff; }',
      '.' + P + '__seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 7px;',
      '  overflow: hidden; }',
      '.' + P + '__seg button { background: #fff; border: 0; padding: 7px 18px; cursor: pointer;',
      '  font: 600 12.5px/1 system-ui, sans-serif; color: #64748b; }',
      '.' + P + '__seg button + button { border-left: 1px solid #cbd5e1; }',
      '.' + P + '__seg button.is-on { background: #0f4c75; color: #fff; }',

      // QA row
      '.' + P + '__qa { display: flex; align-items: center; gap: 10px; padding: 10px 12px;',
      '  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }',
      '.' + P + '__qa-btn { margin-left: auto; background: #b45309; color: #fff; border: 0;',
      '  border-radius: 6px; padding: 7px 14px; font: 600 12.5px/1 system-ui, sans-serif;',
      '  cursor: pointer; }',
      '.' + P + '__qa-btn:hover { background: #92400e; }',

      '.' + P + '__foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px;',
      '  border-top: 1px solid #e2e8f0; background: #f8fafc; }',
      '.' + P + '__btn { padding: 8px 16px; border-radius: 6px; cursor: pointer;',
      '  font: 600 13px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.' + P + '__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.' + P + '__btn--cancel:hover { background: #f1f5f9; }',
      '.' + P + '__btn--save { background: #0f4c75; color: #fff; }',
      '.' + P + '__btn--save:hover { background: #0c3a5e; }',
      '.' + P + '__btn--save:disabled { background: #cbd5e1; cursor: not-allowed; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── panel ─────────────────────────────────────────────────────────
  /**
   * opts: { photoId, viewKey, hasImage, imgUrl, type, required, requiredSet,
   *         qa: {status, client, notes, history, by, date} | null,
   *         onSaved: fn() }
   * Returns true if the panel opened, false if it can't run here.
   */
  function open(opts) {
    if (!opts || !opts.photoId) return false;
    var saveView = SAVE_VIEWS[opts.viewKey];
    if (!saveView) return false;
    if (!(window.SCW && typeof SCW.knackAjax === 'function')) return false;
    injectCss();

    var prior = document.querySelector('.' + P + '-backdrop');
    if (prior) prior.remove();

    var types = collectTypeOptions();
    var curTypeId = '';
    for (var t = 0; t < types.length; t++) {
      if (types[t].label === (opts.type || '')) { curTypeId = types[t].id; break; }
    }

    var back = document.createElement('div');
    back.className = P + '-backdrop';

    var optHtml = '<option value="">— No type —</option>';
    for (var o = 0; o < types.length; o++) {
      optHtml += '<option value="' + esc(types[o].id) + '"' +
        (types[o].id === curTypeId ? ' selected' : '') + '>' + esc(types[o].label) + '</option>';
    }
    // Current type not found among scraped options — keep it selectable so
    // opening + saving without touching Type never clears it.
    if (opts.type && !curTypeId) {
      optHtml += '<option value="__keep__" selected>' + esc(opts.type) + '</option>';
    }

    var photoHtml = opts.hasImage
      ? '<img class="' + P + '__img" src="' + esc(opts.imgUrl) + '" alt="" title="Open full size">'
      : '<label class="' + P + '__drop">' +
          '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>' +
          '<span><strong>Add a photo</strong> — click to choose or drag one here.<br>' +
          '<span style="font-size:11.5px">Large images are resized automatically.</span></span>' +
          '<input type="file" accept="image/*">' +
        '</label>' +
        '<div class="' + P + '__upstatus" style="display:none"></div>';

    var qaHtml = '';
    var isRequired = !!opts.required;
    if (window.SCW && SCW.qaPopover && typeof SCW.qaPopover.openAnchor === 'function') {
      qaHtml =
        '<div class="' + P + '__sect ' + P + '__qa-sect"' + (isRequired ? '' : ' style="display:none"') + '>' +
          '<div class="' + P + '__qa">' +
            '<span>This photo is <strong>required</strong> — QA review applies.</span>' +
            '<button type="button" class="' + P + '__qa-btn">Photo QA</button>' +
          '</div>' +
        '</div>';
    }

    back.innerHTML =
      '<div class="' + P + '" role="dialog" aria-modal="true">' +
        '<div class="' + P + '__head">' +
          '<div class="' + P + '__title">' + esc(opts.type || 'Photo') + '</div>' +
          '<button type="button" class="' + P + '__close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="' + P + '__body">' +
          '<div class="' + P + '__sect">' + photoHtml + '</div>' +
          qaHtml +
          '<div class="' + P + '__sect">' +
            '<div class="' + P + '__label">Photo Type</div>' +
            '<select class="' + P + '__select">' + optHtml + '</select>' +
          '</div>' +
          '<div class="' + P + '__sect">' +
            '<div class="' + P + '__label">Required</div>' +
            '<span class="' + P + '__seg">' +
              '<button type="button" data-req="No"' + (!isRequired ? ' class="is-on"' : '') + '>No</button>' +
              '<button type="button" data-req="Yes"' + (isRequired ? ' class="is-on"' : '') + '>Yes</button>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="' + P + '__foot">' +
          '<button type="button" class="' + P + '__btn ' + P + '__btn--cancel">Cancel</button>' +
          '<button type="button" class="' + P + '__btn ' + P + '__btn--save" disabled>Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    var panel   = back.firstChild;
    var saveBtn = panel.querySelector('.' + P + '__btn--save');
    var select  = panel.querySelector('.' + P + '__select');
    var segBtns = panel.querySelectorAll('.' + P + '__seg button');
    var qaSect  = panel.querySelector('.' + P + '__qa-sect');
    var reqVal  = isRequired ? 'Yes' : 'No';
    var dirty   = false;

    function markDirty() { dirty = true; saveBtn.disabled = false; }
    function close() { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    panel.querySelector('.' + P + '__close').addEventListener('click', close);
    panel.querySelector('.' + P + '__btn--cancel').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });

    select.addEventListener('change', markDirty);
    for (var sb = 0; sb < segBtns.length; sb++) {
      segBtns[sb].addEventListener('click', function () {
        reqVal = this.getAttribute('data-req');
        for (var k = 0; k < segBtns.length; k++) segBtns[k].classList.remove('is-on');
        this.classList.add('is-on');
        if (qaSect) qaSect.style.display = (reqVal === 'Yes') ? '' : 'none';
        markDirty();
      });
    }

    // Full-size view for existing photo.
    var imgEl = panel.querySelector('.' + P + '__img');
    if (imgEl) imgEl.addEventListener('click', function () {
      window.open(opts.imgUrl, '_blank', 'noopener');
    });

    // QA button → the panel we already built (qa-popover modal).
    var qaBtn = panel.querySelector('.' + P + '__qa-btn');
    if (qaBtn) qaBtn.addEventListener('click', function () {
      var qa = opts.qa || {};
      SCW.qaPopover.openAnchor(panel, opts.photoId, {
        type: opts.type || 'Photo',
        imgUrl: opts.imgUrl || '',
        status: qa.status || 'Pending',
        client: qa.client || 'N/A',
        notes: qa.notes || '',
        history: qa.history || '',
        completedBy: qa.by || '',
        completedDate: qa.date || '',
        completed: !!opts.hasImage,
        needsQa: true
      }, function () { if (opts.onSaved) opts.onSaved(); });
    });

    // ── upload flow ──
    var drop = panel.querySelector('.' + P + '__drop');
    if (drop) {
      var input  = drop.querySelector('input[type="file"]');
      var status = panel.querySelector('.' + P + '__upstatus');
      function setStatus(msg, isErr) {
        status.style.display = '';
        status.textContent = msg;
        status.classList.toggle('is-err', !!isErr);
      }
      function handleFile(file) {
        if (!file) return;
        if ((file.type || '').indexOf('image/') !== 0) { setStatus('Not an image file.', true); return; }
        setStatus('Resizing…');
        downscale(file).then(function (blob) {
          if (!blob) { setStatus('Image too large and could not be resized.', true); return null; }
          setStatus('Uploading…');
          var name = /jpe?g$/i.test(file.name || '') || blob !== file
            ? (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg'
            : file.name;
          return uploadImage(blob, name).then(function (assetId) {
            setStatus('Saving…');
            var body = {}; body[F.img] = assetId;
            return putRecord(saveView, opts.photoId, body);
          }).then(function () {
            setStatus('Photo saved ✓');
            // Swap the dropzone for a live preview.
            var url = URL.createObjectURL(blob);
            var img = document.createElement('img');
            img.className = P + '__img';
            img.src = url;
            drop.parentNode.replaceChild(img, drop);
            opts.hasImage = true;
            if (opts.onSaved) opts.onSaved();
          });
        }).catch(function (err) {
          setStatus((err && err.message) || 'Upload failed — try again.', true);
        });
      }
      input.addEventListener('change', function () { handleFile(this.files && this.files[0]); });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('is-over');
        handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });
    }

    // ── details save ──
    saveBtn.addEventListener('click', function () {
      if (!dirty) { close(); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      var body = {};
      var sel = select.value;
      if (sel !== '__keep__') body[F.type] = sel ? [sel] : [];
      body[F.required] = reqVal;
      putRecord(saveView, opts.photoId, body).then(function () {
        if (opts.onSaved) opts.onSaved();
        close();
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        alert('Save failed: ' + ((err && err.message) || 'unknown error') +
              '\nMake sure the photo fields are editable on the save view (' + saveView + ').');
      });
    });

    return true;
  }

  window.SCW = window.SCW || {};
  SCW.photoEditPanel = { open: open, SAVE_VIEWS: SAVE_VIEWS };
})();
/*** END PHOTO EDIT PANEL *****************************************************/
