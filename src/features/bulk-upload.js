// src/features/bulk-upload.js
// ---------------------------------------------------------------------------
// Multi-file uploader — drop-in replacement for the JotForm "Bulk Add Photos"
// flow. Built because JotForm stopped signing file URLs in their post-submission
// payloads, breaking the downstream retrieval step. By POSTing one file per
// webhook call we stay well under Make's 5 MB body limit and never need to
// retrieve files from a third party.
//
// Workflow:
//   1. User clicks a configured menu link (e.g. "Bulk Add Photos" on view_3482).
//   2. Modal opens with drag-drop zone + file picker.
//   3. Files are written to IndexedDB immediately so a tab close doesn't lose
//      the queue. The browser is the queue — Make never has to babysit.
//   4. User clicks Upload. Sequential POST to MAKE_BULK_UPLOAD_WEBHOOK, one
//      file per request.
//   5. On 2xx + { success: true }, blob is deleted from IDB to reclaim space.
//      On failure, the row is marked failed and a Retry button appears.
//   6. On reopen, any non-done rows from a previous session surface a Resume
//      banner.
//
// CONFIGURATION (CONFIG.VIEWS, below):
//   Empty by default — populate to switch a "Bulk Add Photos" link from the
//   JotForm flow to this uploader. ⚠ When you enable a view here, REMOVE the
//   matching entry from FORM_CONFIGS in jotform-embed-sow-photos.js — otherwise
//   both modals will open on the same click.
//
// CONSOLE HELPERS:
//   SCW.bulkUpload.open(viewCfg, recordId)   — open the modal manually
//   SCW.bulkUpload.dbGetAll()                — inspect persisted queue
//   SCW.bulkUpload.dbClear()                 — wipe persisted queue
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────
  var CONFIG = {
    // Make's webhook limit is 5 MB of REQUEST BODY — and we ship the
    // file base64-encoded (+~37%) inside a JSON envelope. A "5 MB" raw
    // file therefore produces a ~6 MB body, which Make answers by
    // dropping the connection → the browser reports "Failed to fetch"
    // and the row fails with no HTTP status. Cap raw size so the
    // encoded body stays safely under the limit: 3.5 MB × 4/3 ≈ 4.7 MB
    // + envelope.
    MAX_FILE_BYTES: 3.5 * 1024 * 1024,

    // Throttle between consecutive successful uploads (ms). Make limits
    // operations per minute at the org level — each upload triggers a
    // scenario that does multiple Knack API calls, so back-to-back
    // uploads can blow through small plan quotas. 1500ms = ~40 files/min.
    UPLOAD_DELAY_MS: 1500,

    // Post-close grid refresh delay (ms). Uploads are fire-and-forget: the
    // client marks each photo done the moment it's SENT and never waits on
    // Make's response, so Make does the actual Knack file write a few
    // seconds AFTER the modal closes. We re-fetch the configured grid
    // view(s) once, this many ms after close, so they appear without a
    // manual refresh. The new
    // record ids aren't known until after Make's async work, so we re-fetch
    // the whole view rather than specific records. Override per VIEWS entry
    // with `refreshDelayMs`. Bump it if Make's async write runs longer than
    // this; the refetch is harmless if it lands after the photos already
    // did (slow-Make case), so erring a little long is safe.
    DEFAULT_REFRESH_DELAY_MS: 9000,

    // Each entry hooks the new uploader onto a menu link by text. The
    // matching FORM_CONFIGS entries in jotform-embed-sow-photos.js are
    // disabled so both modals don't open on the same click.
    //
    // Three refresh strategies, applied on modal close after a
    // successful batch. They can be combined.
    //
    // refreshRecordInViews: array of view ids in which to refresh just
    //   THIS upload's recordId (the SOW / Survey / etc. linked by
    //   linkField). Re-fetches the single record and updates its
    //   Backbone model so just that one row's data refreshes — leaves
    //   the rest of the grid untouched. Cheapest, most precise. Use
    //   this when you only need to repaint a single row.
    //
    // refreshViews: array of view ids to re-fetch in full. Use for
    //   gallery / list views where you want every record's data to
    //   refresh (e.g. a photo strip that gained new records).
    //
    // reloadOnClose: if true, full window.location.reload() instead of
    //   either of the above. Heaviest but bulletproof. Off by default.
    //
    // Make's per-file webhook response can also include:
    //   { success: true, refresh: ["view_XXX", ...] }
    //     → those view ids unioned with refreshViews on close (full
    //       re-fetch of each named view).
    //   { success: true, refreshRecords: ["abc123...", "def456..."] }
    //     → those record ids will each be refreshed across every view
    //       in refreshRecordInViews. Use this when photos get connected
    //       to records OTHER than the upload's recordId — e.g. survey
    //       line items rather than the survey itself.
    //
    // The upload's own recordId is ALWAYS refreshed in refreshRecordInViews
    // too (in case the photo is connected to the parent record). So your
    // Make scenario only needs to include refreshRecords for the
    // additional / different records that got touched.
    VIEWS: [
      {
        menuViewId:           'view_3482',
        linkText:             'Bulk Add Photos',
        linkField:            'sowID',
        // The id we ship lives at different hash segments depending on
        // the route the user came from:
        //   standalone SOW page          → #…/scope-of-work-details/<sow>
        //   project-dashboard build-sow  → #…/project-dashboard/<proj>/build-sow/<sow>/?…
        // The default below covers both for the menuViewId click; the
        // view_3610 inject target overrides it (see contexts there)
        // because on the project-dashboard route the upload should be
        // associated with the PROJECT, not the SOW.
        hashPattern:          /(?:scope-of-work-details|build-sow)\/([a-f0-9]{24})/,
        refreshRecordInViews: [],
        refreshViews:         [],
        reloadOnClose:        false,
        // Inline buttons on SOW-context worksheet toolbars. Each entry
        // slots an Add Photos button before the named existing CTA on
        // that view. Targets can override the parent linkField/hashPattern
        // via `contexts: [{ hashPattern, linkField }, …]` — the click
        // handler walks contexts in order and uses the first that matches
        // the current URL.
        injectTargets: [
          // view_3586 target removed — the v1 surface is hidden by the v2
          // cutover; the sales page opens this modal through worksheet-v2's
          // toolbar (openBulkPhotoUpload → menuViewId view_3482) instead.
          {
            viewId: 'view_3610',
            beforeText: 'Add to Scope',
            // view_3610 is mounted on BOTH the standalone SOW page and
            // the project-dashboard build-sow route. On the project
            // route the upload context is the PROJECT (its id is the
            // segment after `project-dashboard/`); on the SOW page the
            // context is the SOW. Order matters — project-dashboard
            // match is checked first because the build-sow form ALSO
            // contains a 24-hex segment that would otherwise match
            // the sowID pattern.
            contexts: [
              { linkField: 'projectID', hashPattern: /project-dashboard\/([a-f0-9]{24})/ },
              // The id after build-sow/ is the PROJECT record (the page is
              // project-scoped). On the canonical team-calendar chain the
              // project-dashboard context above matched first, so lumping
              // build-sow in with the sowID pattern below never fired — but
              // on the top-level #build-sow/<projectId> route it labeled
              // the project id as sowID. Own context, right label.
              { linkField: 'projectID', hashPattern: /build-sow\/([a-f0-9]{24})/ },
              { linkField: 'sowID',     hashPattern: /scope-of-work-details\/([a-f0-9]{24})/ }
            ]
          }
        ]
      },
      {
        menuViewId:           'view_3532',
        linkText:             'Bulk Add Photos',
        linkField:            'surveyID',
        hashPattern:          /site-survey-request-details\/([a-f0-9]{24})/,
        refreshRecordInViews: ['view_3505'],
        refreshViews:         [],
        reloadOnClose:        false,
        injectTargets: [
          { viewId: 'view_3505', beforeText: 'Add Survey/Bid Item' }
        ]
      },
      {
        // Survey-form page (#all-quotes/survey-form/<recordId>/…) uses
        // a Vue-rendered Knack menu view (.knMenuLink class) rather
        // than the legacy a.kn-link. The selector in the interception
        // loop below covers both.
        menuViewId:           'view_2653',
        linkText:             'Bulk Add Photos',
        linkField:            'deprecatedQuoteID',
        hashPattern:          /survey-form\/([a-f0-9]{24})/,
        refreshRecordInViews: [],
        refreshViews:         [],
        reloadOnClose:        false
      },
      {
        // Sales "Edit Proposal" page hosts an "Upload Photos" Vue
        // menu link (view_2916) that historically opened a JotForm
        // in a popup window. Intercept it to route uploads through
        // the bulk-upload modal instead. The record context is the
        // proposal id, which is the LAST segment of the hash:
        //   …/sales-edit-proposal/<24-hex>
        // Make scenarios receiving this payload should key on
        // linkField:'proposalID'.
        menuViewId:           'view_2916',
        linkText:             'Upload Photos',
        linkField:            'proposalID',
        hashPattern:          /sales-edit-proposal\/([a-f0-9]{24})/,
        refreshRecordInViews: [],
        refreshViews:         [],
        reloadOnClose:        false
      },
      {
        // ── Deployment bulk photo upload (install worksheets) ──────────
        // Fired by the worksheet-v2 toolbar "+ Add Photos" button on the
        // install worksheets — view_4093 (internal deploy page) and its
        // clone view_4056 (subcontractor deployment dashboard). This is NOT
        // a Knack menu-link interception: there's no source menu view, so
        // `menuViewId` is just the lookup key the worksheet-v2 toolbar
        // resolves via the install config's `photoUploadView`. The
        // onViewRender bind in INIT is inert (no view by this id renders).
        //
        // ROUTING: `linkField: 'deploymentID'` is the discriminator that
        // tells Make this batch targets a DEPLOYMENT — distinct from a
        // SOW upload (which on the project-dashboard route already ships
        // `linkField: 'projectID'`, so we must NOT reuse that), a survey
        // ('surveyID'), or a proposal ('proposalID'). Pair it with
        // `recordId` (the project / deployment id pulled from the URL) to
        // connect the photos. The id is whichever dashboard segment the
        // route carries:
        //   internal deploy page  → #…/project-dashboard/<proj>/deploy/<proj>
        //   subcontractor portal  → #…/deployment-dashboard/<id>
        menuViewId:           'view_4093_deploy',
        linkText:             'Bulk Add Photos',
        linkField:            'deploymentID',
        hashPattern:          /(?:project-dashboard|deployment-dashboard)\/([a-f0-9]{24})/,
        refreshRecordInViews: [],
        // Whichever install grid is on the current scene gets a full
        // re-fetch on modal close so the new photos surface; the absent
        // one is skipped harmlessly.
        refreshViews:         ['view_4093', 'view_4056'],
        reloadOnClose:        false
      }
    ]
  };

  var MODAL_ID   = 'scw-bulk-upload-modal';
  var STYLE_ID   = 'scw-bulk-upload-css';
  var DB_NAME    = 'scw-bulk-upload';
  var DB_VERSION = 1;
  var STORE      = 'files';

  // The currently-open modal's in-memory state. null when modal is closed.
  var _state = null;

  // ── UTIL ──────────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getExtension(name) {
    var m = (name || '').match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function getCurrentUser() {
    try {
      var u = Knack.getUserAttributes();
      return { id: u.id, name: u.name, email: u.email };
    } catch (e) { return { id: '', name: '', email: '' }; }
  }

  function getRecordId(hashPattern) {
    var hash = window.location.hash || '';
    var m = hash.match(hashPattern);
    return m ? m[1] : '';
  }

  // ── INDEXEDDB ─────────────────────────────────────────────────────────
  // The queue is a single object store keyed by row id (uuid). Rows store
  // { id, recordId, linkField, filename, mimeType, extension, sizeBytes,
  //   blob, status, error, addedAt, batchId, uploadId }.
  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('byStatus', 'status');
          store.createIndex('byRecord', 'recordId');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function dbPut(row) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = function () { resolve(row); };
        tx.onerror    = function () { reject(tx.error || new Error('IDB write failed')); };
        tx.onabort    = function () { reject(tx.error || new Error('IDB write aborted (quota?)')); };
      });
    });
  }

  function dbGetAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function dbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  function dbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror    = function () { reject(tx.error); };
      });
    });
  }

  // Ask the browser to mark our origin as persistent so the IDB queue
  // isn't evicted under storage pressure. Best-effort — Chrome prompts,
  // Safari decides based on heuristics, all errors swallowed.
  function tryPersist() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  function readAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload  = function () {
        var s = String(r.result || '');     // "data:<mime>;base64,<...>"
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.substring(i + 1) : s);
      };
      r.onerror = function () { reject(r.error || new Error('Could not read file')); };
      r.readAsDataURL(blob);
    });
  }

  // ── CLIENT-SIDE IMAGE DOWNSCALE ───────────────────────────────────────
  // Oversized images are re-encoded as progressively smaller JPEGs until
  // they fit MAX_FILE_BYTES, so 8–12 MB phone photos upload instead of
  // bouncing off the size cap. Non-images, SVG/GIF (vector / animation
  // would be destroyed), and formats canvas can't decode (e.g. HEIC on
  // Chrome) fall through to the normal too-big rejection.
  var DOWNSCALE_LADDER = [
    { edge: 2400, quality: 0.85 },
    { edge: 2000, quality: 0.80 },
    { edge: 1600, quality: 0.75 },
    { edge: 1280, quality: 0.70 }
  ];

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
      // imageOrientation:'from-image' bakes EXIF rotation into the
      // bitmap so portrait phone photos don't come out sideways.
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
          .catch(function () { return loadViaImg(file); });
      } catch (e) { /* older signature — fall through */ }
    }
    return loadViaImg(file);
  }

  function canvasToJpeg(source, w, h, q) {
    return new Promise(function (resolve, reject) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(source, 0, 0, w, h);
      c.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('canvas.toBlob returned null'));
      }, 'image/jpeg', q);
    });
  }

  /** Walk the ladder until a JPEG fits targetBytes. Resolves Blob or null.
   *  If no step reaches the target, the smallest version produced is
   *  accepted as long as it clears the hard MAX_FILE_BYTES cap. */
  function downscaleImage(file, targetBytes) {
    targetBytes = targetBytes || CONFIG.MAX_FILE_BYTES;
    return loadBitmap(file).then(function (src) {
      var sw = src.width  || src.naturalWidth;
      var sh = src.height || src.naturalHeight;
      if (!sw || !sh) throw new Error('no dimensions');
      var smallest = null;   // best (smallest) blob produced so far
      function attempt(i) {
        if (i >= DOWNSCALE_LADDER.length) {
          // None hit the preferred target — accept the smallest version we
          // produced as long as it clears the hard cap; else give up.
          if (smallest && smallest.size <= CONFIG.MAX_FILE_BYTES) return Promise.resolve(smallest);
          return Promise.resolve(null);
        }
        var step  = DOWNSCALE_LADDER[i];
        var scale = Math.min(1, step.edge / Math.max(sw, sh));
        var w = Math.max(1, Math.round(sw * scale));
        var h = Math.max(1, Math.round(sh * scale));
        return canvasToJpeg(src, w, h, step.quality).then(function (blob) {
          if (!smallest || blob.size < smallest.size) smallest = blob;
          if (blob.size <= targetBytes) return blob;
          return attempt(i + 1);
        });
      }
      return attempt(0).then(function (blob) {
        if (src.close) { try { src.close(); } catch (e) {} }
        return blob;
      });
    }).catch(function () { return null; });
  }

  // ── HEIC → JPEG CONVERSION ────────────────────────────────────────────
  // Chrome/Edge/Firefox can't decode HEIC, so iPhone photos either bounced
  // (oversized) or uploaded as .heic files nothing downstream could render.
  // Lazy-load a WASM decoder from jsDelivr ONLY when a HEIC is actually
  // picked — zero cost on ordinary JPEG batches — and convert every HEIC
  // to JPEG on pick. Decode chain (each step only runs if the previous
  // failed):
  //   1. heic2any (small, fast, but bundles an OLD libheif — chokes on
  //      newer iPhone HEICs, e.g. iOS 17/18 HDR captures)
  //   2. libheif-js (current libheif build — bigger download, handles the
  //      formats heic2any can't)
  //   3. native canvas decode (Safari can read HEIC without any lib)
  var HEIC2ANY_URL = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
  var LIBHEIF_URL  = 'https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.js';
  var _heicLibPromise = null;
  var _libheifPromise = null;

  function isHeicFile(f) {
    var t = (f && f.type || '').toLowerCase();
    if (t === 'image/heic' || t === 'image/heif' ||
        t === 'image/heic-sequence' || t === 'image/heif-sequence') return true;
    // File.type is frequently EMPTY for HEIC on Windows — extension is the
    // reliable signal there.
    return /\.(heic|heif)$/i.test((f && f.name) || '');
  }

  function loadHeicLib() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    if (_heicLibPromise) return _heicLibPromise;
    _heicLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = HEIC2ANY_URL;
      s.onload = function () {
        if (window.heic2any) resolve(window.heic2any);
        else reject(new Error('heic2any loaded but global missing'));
      };
      s.onerror = function () {
        _heicLibPromise = null;   // network hiccup — allow retry on next pick
        reject(new Error('failed to load HEIC decoder'));
      };
      document.head.appendChild(s);
    });
    return _heicLibPromise;
  }

  function loadLibheifLib() {
    if (window.libheif && window.libheif.HeifDecoder) return Promise.resolve(window.libheif);
    if (_libheifPromise) return _libheifPromise;
    _libheifPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIBHEIF_URL;
      s.onload = function () {
        if (window.libheif && window.libheif.HeifDecoder) resolve(window.libheif);
        else reject(new Error('libheif loaded but global missing'));
      };
      s.onerror = function () {
        _libheifPromise = null;   // network hiccup — allow retry on next pick
        reject(new Error('failed to load libheif decoder'));
      };
      document.head.appendChild(s);
    });
    return _libheifPromise;
  }

  /** Decode a HEIC via libheif-js into a JPEG Blob (rejects on failure). */
  function convertHeicViaLibheif(f) {
    return loadLibheifLib().then(function (libheif) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onerror = function () { reject(new Error('read failed')); };
        r.onload = function () {
          try {
            var decoder = new libheif.HeifDecoder();
            var images  = decoder.decode(new Uint8Array(r.result));
            if (!images || !images.length) return reject(new Error('libheif: no images'));
            var image = images[0];   // primary frame (bursts/live photos)
            var w = image.get_width(), h = image.get_height();
            if (!w || !h) return reject(new Error('libheif: no dimensions'));
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            var imgData = ctx.createImageData(w, h);
            image.display(imgData, function (displayData) {
              try {
                if (!displayData) return reject(new Error('libheif: display failed'));
                ctx.putImageData(displayData, 0, 0);
                c.toBlob(function (b) {
                  if (b) resolve(b);
                  else reject(new Error('canvas.toBlob returned null'));
                }, 'image/jpeg', 0.88);
              } catch (e2) { reject(e2); }
            });
          } catch (e) { reject(e); }
        };
        r.readAsArrayBuffer(f);
      });
    });
  }

  /** HEIC/HEIF file → JPEG Blob. WASM decoders first (work in every
   *  browser); native decode via the canvas ladder as the last fallback
   *  (Safari can read HEIC without a lib). Resolves null when none work. */
  function convertHeic(f) {
    return loadHeicLib().then(function (heic2any) {
      return heic2any({ blob: f, toType: 'image/jpeg', quality: 0.88 });
    }).then(function (out) {
      // Multi-image HEIC (bursts/live photos) yields an array — take the
      // primary frame.
      var blob = Array.isArray(out) ? out[0] : out;
      return blob || null;
    }).catch(function (err) {
      console.warn('[bulk-upload] heic2any unavailable/failed — trying libheif-js', err);
      return convertHeicViaLibheif(f).catch(function (err2) {
        console.warn('[bulk-upload] libheif-js unavailable/failed — trying native decode', err2);
        return downscaleImage(f, CONFIG.MAX_FILE_BYTES);
      });
    });
  }

  /** Resolve what to queue for a picked file: pass-through when it fits,
   *  auto-resize oversized raster images, null blob → too-big row. */
  function prepareFile(f) {
    // HEIC always converts — even under the size cap. A sub-cap .heic used
    // to pass through untouched and then render nowhere downstream
    // (non-Apple browsers can't display HEIC).
    if (isHeicFile(f)) {
      var _tHeic = Date.now();
      return convertHeic(f).then(function (jpeg) {
        if (!jpeg) return { blob: null, converted: false, triedResize: true, heicFailed: true };
        var fit = (jpeg.size <= CONFIG.MAX_FILE_BYTES)
          ? Promise.resolve(jpeg)
          : downscaleImage(jpeg, CONFIG.MAX_FILE_BYTES);
        return fit.then(function (finalBlob) {
          if (!finalBlob) return { blob: null, converted: false, triedResize: true, heicFailed: true };
          console.info('[bulk-upload] HEIC converted', f.name,
            fmtBytes(f.size), '→', fmtBytes(finalBlob.size),
            '(' + (Date.now() - _tHeic) + 'ms)');
          return { blob: finalBlob, converted: true, triedResize: true };
        });
      });
    }
    // Full-resolution uploads under the hard cap — a sub-cap file ships
    // exactly as-is. Only genuinely oversized raster images get downscaled,
    // and only enough to clear MAX_FILE_BYTES so they upload at all instead
    // of bouncing off Make's 5 MB body limit.
    if (f.size <= CONFIG.MAX_FILE_BYTES) {
      return Promise.resolve({ blob: f, converted: false, triedResize: false });
    }
    var t = (f.type || '').toLowerCase();
    var isRaster = t.indexOf('image/') === 0 &&
                   t !== 'image/svg+xml' && t !== 'image/gif';
    if (!isRaster) {
      return Promise.resolve({ blob: null, converted: false, triedResize: false });
    }
    var _tResize = Date.now();
    return downscaleImage(f, CONFIG.MAX_FILE_BYTES).then(function (blob) {
      if (!blob) return { blob: null, converted: false, triedResize: true };
      console.info('[bulk-upload] auto-resized', f.name,
        fmtBytes(f.size), '→', fmtBytes(blob.size),
        '(' + (Date.now() - _tResize) + 'ms)');
      return { blob: blob, converted: true, triedResize: true };
    });
  }

  // ── STYLES ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var M = '#' + MODAL_ID;
    var css = [
      M + '-backdrop {',
      '  position:fixed; inset:0; z-index:100000;',
      '  background:rgba(0,0,0,0.55);',
      '  display:flex; align-items:center; justify-content:center;',
      '  font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;',
      '}',
      M + ' {',
      '  background:#fff; border-radius:10px;',
      '  width:min(720px, 92vw); max-height:90vh;',
      '  display:flex; flex-direction:column;',
      '  box-shadow:0 20px 60px rgba(0,0,0,.4);',
      '  overflow:hidden;',
      '}',
      M + '-header {',
      '  padding:14px 18px;',
      '  display:flex; align-items:center; justify-content:space-between;',
      '  background:#07467c; color:#fff;',
      '}',
      M + '-header .title { font-weight:700; font-size:15px; }',
      M + '-header .close {',
      '  background:none; border:none; color:#fff; font-size:22px;',
      '  cursor:pointer; padding:0 4px; line-height:1;',
      '}',
      M + '-body { padding:14px 18px; overflow-y:auto; flex:1; }',
      M + '-footer {',
      '  padding:10px 18px; border-top:1px solid #e5e7eb;',
      '  display:flex; gap:8px; justify-content:flex-end; align-items:center;',
      '  background:#f8fafc;',
      '}',
      M + '-footer .scw-bu-summary { margin-right:auto; color:#475569; font-size:13px; }',
      M + ' button.scw-bu-btn {',
      '  padding:8px 14px; border-radius:6px; border:none; cursor:pointer;',
      '  font:600 13px/1 system-ui,sans-serif;',
      '}',
      M + ' button.scw-bu-btn.primary { background:#07467c; color:#fff; }',
      M + ' button.scw-bu-btn.primary:hover:not([disabled]) { opacity:.92; }',
      M + ' button.scw-bu-btn.ghost { background:#fff; color:#0f172a; border:1px solid #cbd5e1; }',
      M + ' button.scw-bu-btn[disabled] { opacity:.55; cursor:default; }',
      M + ' .scw-bu-drop {',
      '  border:2px dashed #cbd5e1; border-radius:8px;',
      '  padding:22px 14px; text-align:center; color:#475569;',
      '  background:#f8fafc; cursor:pointer;',
      '  transition: background 150ms, border-color 150ms;',
      '}',
      M + ' .scw-bu-drop.is-over { background:#e0f2fe; border-color:#0284c7; color:#0c4a6e; }',
      M + ' .scw-bu-drop .scw-bu-drop-hint { display:block; margin-top:6px; font-size:12px; color:#64748b; }',
      M + ' .scw-bu-banner {',
      '  margin-bottom:12px; padding:10px 14px; border-radius:8px;',
      '  background:#fef9c3; border:1px solid #fde68a; color:#713f12;',
      '  display:flex; gap:8px; align-items:center; flex-wrap:wrap;',
      '}',
      M + ' .scw-bu-banner .scw-bu-banner-msg { flex:1; min-width:160px; }',
      M + ' .scw-bu-info {',
      '  margin-top:10px; padding:10px 14px; border-radius:8px;',
      '  background:#eff6ff; border:1px solid #bfdbfe; color:#1e3a5f;',
      '  font-size:12.5px; line-height:1.5;',
      '}',
      M + ' .scw-bu-info p { margin:0 0 6px 0; }',
      M + ' .scw-bu-info p:last-child { margin-bottom:0; }',
      M + ' .scw-bu-info strong { color:#0c4a6e; }',
      // Line-item scope callout — amber so it reads as a scope notice distinct
      // from the blue info box, making "this line item only" unmissable.
      M + ' .scw-bu-context {',
      '  margin:0 0 10px; padding:10px 14px; border-radius:8px;',
      '  background:#fffbeb; border:1px solid #fcd34d; color:#78350f;',
      '}',
      M + ' .scw-bu-context-title { font-weight:700; font-size:13.5px; }',
      M + ' .scw-bu-context-target {',
      '  margin-top:3px; font-weight:600; font-size:13px; color:#92400e;',
      '  word-break:break-word;',
      '}',
      M + ' .scw-bu-context-note { margin-top:4px; font-size:12px; line-height:1.45; }',
      M + ' .scw-bu-context-note strong { color:#78350f; }',
      M + ' .scw-bu-list { margin-top:10px; }',
      M + ' .scw-bu-row {',
      '  display:flex; align-items:center; gap:10px;',
      '  padding:8px 0; border-bottom:1px solid #f1f5f9;',
      '}',
      M + ' .scw-bu-row .scw-bu-thumb {',
      '  width:36px; height:36px; flex:none;',
      '  background:#f1f5f9; border-radius:4px;',
      '  display:flex; align-items:center; justify-content:center;',
      '  font-size:10px; font-weight:700; color:#64748b; overflow:hidden;',
      '}',
      M + ' .scw-bu-row .scw-bu-thumb img { width:100%; height:100%; object-fit:cover; }',
      M + ' .scw-bu-row .scw-bu-name { flex:1; min-width:0; overflow:hidden; }',
      M + ' .scw-bu-row .scw-bu-name-line { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      M + ' .scw-bu-row .scw-bu-size { color:#64748b; font-size:12px; flex:none; }',
      M + ' .scw-bu-row .scw-bu-status { flex:none; font-size:12px; min-width:90px; text-align:right; }',
      M + ' .scw-bu-row .scw-bu-status.is-queued    { color:#475569; }',
      M + ' .scw-bu-row .scw-bu-status.is-uploading { color:#0369a1; }',
      M + ' .scw-bu-row .scw-bu-status.is-done      { color:#15803d; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-status.is-failed    { color:#b91c1c; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-status.is-too-big   { color:#b91c1c; font-weight:600; }',
      M + ' .scw-bu-row .scw-bu-row-actions { flex:none; display:flex; gap:4px; }',
      M + ' .scw-bu-row button.scw-bu-row-btn {',
      '  background:none; border:none; cursor:pointer; padding:4px 6px;',
      '  color:#475569; font-size:12px; border-radius:4px;',
      '}',
      M + ' .scw-bu-row button.scw-bu-row-btn:hover { background:#f1f5f9; color:#0f172a; }',
      M + ' .scw-bu-row .scw-bu-error { color:#b91c1c; font-size:11px; margin-top:2px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── MODAL OPEN / CLOSE ────────────────────────────────────────────────
  function openModal(viewCfg, recordId) {
    injectStyles();
    closeModal();
    tryPersist();

    _state = {
      viewCfg:          viewCfg,
      recordId:         recordId,
      batchId:          uuid(),
      rows:             [],
      uploading:        false,
      successCount:     0,
      refreshViewIds:   {},   // Set of view ids — harvested from response.refresh
      refreshRecordIds: {}    // Set of record ids — harvested from response.refreshRecords
    };

    // Line-item scope — opened from a photo strip's "Add photo" button. The
    // upload targets ONE line item (not the parent SOW), so the header +
    // messaging change and the parent-SOW auto-match blurb is dropped (it only
    // applies when photos attach to the whole SOW and match device labels).
    var LINE_ITEM_KINDS = {
      surveyLineItemID:  'survey line item',
      sowLineItemID:     'SOW line item',
      installLineItemID: 'install line item',
      mdfIdfID:          'MDF/IDF location'
    };
    var isLineItem  = !!(viewCfg && viewCfg.lineItemUpload);
    var kindLabel   = (viewCfg && LINE_ITEM_KINDS[viewCfg.linkField]) || 'line item';
    var targetLabel = (viewCfg && viewCfg.targetLabel) || '';

    var titleText = isLineItem ? 'Add Photos to This ' +
      kindLabel.replace(/\b\w/, function (c) { return c.toUpperCase(); }) : 'Bulk Upload Files';

    var contextHtml = isLineItem
      ? '<div class="scw-bu-context">' +
          '<div class="scw-bu-context-title">Uploading to this ' + escapeHtml(kindLabel) + '</div>' +
          (targetLabel
            ? '<div class="scw-bu-context-target">' + escapeHtml(targetLabel) + '</div>' : '') +
          '<div class="scw-bu-context-note">These photos attach to <strong>this ' +
            escapeHtml(kindLabel) + ' only</strong> — not the whole SOW.</div>' +
        '</div>'
      : '';

    var infoHtml = isLineItem
      ? '<div class="scw-bu-info"><p>Photos you add here connect directly to this ' +
          escapeHtml(kindLabel) + '.</p></div>'
      : '<div class="scw-bu-info">' +
          '<p><strong>Optional Auto-Match:</strong> Name the file to match a camera or reader label (ex: E-001 or RA-E-02) and the photo will automatically connect to that device during upload.</p>' +
          '<p>Matches are flexible (E1, e-1, etc. will still match E-001). If no match is found, the photo will still upload and attach to the SOW.</p>' +
          '<p>Only use one device label per file name.</p>' +
        '</div>';

    var backdrop = document.createElement('div');
    backdrop.id = MODAL_ID + '-backdrop';
    backdrop.innerHTML =
      '<div id="' + MODAL_ID + '" role="dialog" aria-modal="true">' +
        '<div id="' + MODAL_ID + '-header">' +
          '<div class="title">' + escapeHtml(titleText) + '</div>' +
          '<button class="close" title="Close">×</button>' +
        '</div>' +
        '<div id="' + MODAL_ID + '-body">' +
          '<div class="scw-bu-banner-slot"></div>' +
          contextHtml +
          '<div class="scw-bu-drop" tabindex="0">' +
            '<div><strong>Drop files here</strong> or click to choose</div>' +
            '<span class="scw-bu-drop-hint">Any type · max ' +
              fmtBytes(CONFIG.MAX_FILE_BYTES) +
              ' per file · larger images are resized automatically</span>' +
            '<input type="file" multiple style="display:none">' +
          '</div>' +
          infoHtml +
          '<div class="scw-bu-list"></div>' +
        '</div>' +
        '<div id="' + MODAL_ID + '-footer">' +
          '<div class="scw-bu-summary"></div>' +
          '<button class="scw-bu-btn ghost scw-bu-clear">Clear all</button>' +
          '<button class="scw-bu-btn primary scw-bu-upload">Upload</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    wireModal(backdrop);
    loadExistingRows();
  }

  function closeModal() {
    var el = document.getElementById(MODAL_ID + '-backdrop');
    if (el) el.remove();
    if (_state && _state.successCount > 0) {
      var viewCfg = _state.viewCfg || {};
      if (viewCfg.reloadOnClose) {
        setTimeout(function () { window.location.reload(); }, 50);
      } else {
        // Make acks the upload instantly and writes the file ASYNCHRONOUSLY,
        // so the photos land a few seconds AFTER the modal closes. Re-fetch
        // the configured grid view(s) once, on a fixed delay, so the new
        // photos show up without a manual refresh. We refetch the WHOLE view
        // (one render) rather than specific records — the new record ids
        // aren't known until after Make's async work (the array-only-known-
        // after case). Harmless if Make was synchronous: the refetch just
        // lands after the photos already did.
        var delayViews = {};
        (viewCfg.refreshRecordInViews || []).forEach(function (v) { delayViews[v] = true; });
        (viewCfg.refreshViews || []).forEach(function (v) { delayViews[v] = true; });
        if (_state.refreshViewIds) {
          Object.keys(_state.refreshViewIds).forEach(function (v) { delayViews[v] = true; });
        }
        var vids = Object.keys(delayViews);
        if (vids.length) {
          scheduleDelayedRefresh(vids, viewCfg.refreshDelayMs || CONFIG.DEFAULT_REFRESH_DELAY_MS);
        }
      }
    }
    _state = null;
  }

  // Full re-fetch of each named view's model, once, after `delay` ms — so
  // the grid picks up photos Make wrote asynchronously after its instant
  // ack. A single render per view (not the disruptive one-row-at-a-time
  // pass that the old close-refresh did). Best-effort and silent.
  function scheduleDelayedRefresh(viewIds, delay) {
    setTimeout(function () {
      viewIds.forEach(function (vid) {
        try {
          var v = window.Knack && Knack.views && Knack.views[vid];
          if (v && v.model && typeof v.model.fetch === 'function') {
            v.model.fetch();
            if (window.SCW && SCW.DEBUG) console.log('[bulk-upload] delayed refresh →', vid);
          }
        } catch (e) { /* best-effort */ }
      });
    }, delay);
  }

  // Refresh a single record's row in a configured grid view.
  //
  // Multi-step strategy because Knack's table-view rendering doesn't
  // always react to Backbone change events the same way across view
  // types — and because the record may not yet be in the current
  // pagination page of the collection.
  //
  //   1. If the record exists in view.model.data → record.fetch()
  //      (Backbone re-fetches, fires change events, view should
  //      re-render the row in place).
  //   2. If the record isn't in the local collection (because it's on
  //      a different page) OR if step 1 silently fails → fall back to
  //      view.model.fetch() (full re-fetch of the visible page).
  //   3. Either way, if the view exposes a render() method we call it
  //      defensively after a short delay so the DOM definitely picks
  //      up the change — Knack table views with custom transforms
  //      (the SCW worksheet card pattern especially) don't always
  //      re-render on model change alone.
  //
  // All steps are best-effort and silent on failure — the user can
  // reload manually if needed.
  function refreshSingleRecord(viewId, recordId) {
    if (!viewId || !recordId || !window.Knack || !Knack.views) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: missing prereqs', { viewId: viewId, recordId: recordId, hasKnack: !!window.Knack });
      return;
    }
    var view = Knack.views[viewId];
    if (!view) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: Knack.views[' + viewId + '] not found');
      return;
    }
    if (!view.model || !view.model.data) {
      if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] refreshSingleRecord: view has no model.data', viewId);
      // Last resort: try a generic re-render
      try { if (typeof view.render === 'function') view.render(); } catch (e) {}
      return;
    }

    var coll = view.model.data;
    var record = (coll && typeof coll.get === 'function') ? coll.get(recordId) : null;
    if (!record && coll && typeof coll.findWhere === 'function') {
      record = coll.findWhere({ id: recordId });
    }

    function defensiveRender(reason) {
      if (window.SCW && SCW.DEBUG) console.log('[bulk-upload] defensiveRender (' + reason + ') on', viewId);
      setTimeout(function () {
        try {
          if (typeof view.render === 'function') view.render();
        } catch (e) {}
      }, 200);
    }

    if (record && typeof record.fetch === 'function') {
      record.fetch({
        success: function () {
          if (window.SCW && SCW.DEBUG) console.log('[bulk-upload] record.fetch() OK for', recordId, 'in', viewId);
          defensiveRender('after record.fetch success');
        },
        error: function (m, resp) {
          if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] record.fetch() failed; falling back to view.model.fetch()', resp && resp.status, resp && resp.responseText);
          if (typeof view.model.fetch === 'function') view.model.fetch();
        }
      });
      return;
    }

    if (window.SCW && SCW.DEBUG) console.warn('[bulk-upload] record', recordId, 'not in view', viewId, '— falling back to full view.model.fetch()');
    if (typeof view.model.fetch === 'function') {
      view.model.fetch();
    } else {
      defensiveRender('no fetch available');
    }
  }

  function confirmClose() {
    if (_state && _state.uploading) {
      var ok = confirm(
        'An upload is in progress. Closing will pause it — pending files ' +
        'will resume next time you open this. Close anyway?'
      );
      if (!ok) return;
    }
    closeModal();
  }

  function wireModal(backdrop) {
    var closeBtn = backdrop.querySelector('.close');
    var drop     = backdrop.querySelector('.scw-bu-drop');
    var input    = drop.querySelector('input[type=file]');
    var clear    = backdrop.querySelector('.scw-bu-clear');
    var upload   = backdrop.querySelector('.scw-bu-upload');

    // Click-on-backdrop to close (but not click-on-modal)
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) confirmClose();
    });
    closeBtn.addEventListener('click', confirmClose);

    // Drop zone: click → file picker; keyboard activate → file picker
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      addFiles(Array.prototype.slice.call(input.files || []));
      input.value = '';   // allow picking same filenames again
    });

    // Drag-and-drop
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      var files = (e.dataTransfer && e.dataTransfer.files) || [];
      addFiles(Array.prototype.slice.call(files));
    });

    clear.addEventListener('click', clearQueue);
    upload.addEventListener('click', startUpload);
  }

  // ── ROW STATE ─────────────────────────────────────────────────────────
  function loadExistingRows() {
    dbGetAll().then(function (rows) {
      // Per-record queues — don't show another record's files here
      var mine = rows.filter(function (r) { return r.recordId === _state.recordId; });

      // Any 'uploading' status is a crash/close mid-flight — flip to queued
      // so it gets retried. Make should idempotency-check by uploadId.
      var stuck = mine.filter(function (r) { return r.status === 'uploading'; });
      var fixes = stuck.map(function (r) {
        r.status = 'queued'; r.error = null;
        return dbPut(r);
      });

      Promise.all(fixes).then(function () {
        if (!_state) return;
        _state.rows = mine;
        renderRows();
        var pending = mine.filter(function (r) { return r.status !== 'done'; });
        if (pending.length) showResumeBanner(pending.length);
      });
    }).catch(function (err) {
      console.warn('[bulk-upload] Could not read IndexedDB:', err);
    });
  }

  function showResumeBanner(count) {
    var slot = document.querySelector('#' + MODAL_ID + '-body .scw-bu-banner-slot');
    if (!slot) return;
    slot.innerHTML =
      '<div class="scw-bu-banner">' +
        '<span class="scw-bu-banner-msg">' +
          '<strong>' + count + '</strong> file' + (count === 1 ? '' : 's') +
          ' pending from your previous session.' +
        '</span>' +
        '<button class="scw-bu-btn primary scw-bu-banner-resume">Resume</button>' +
        '<button class="scw-bu-btn ghost scw-bu-banner-discard">Discard</button>' +
      '</div>';
    slot.querySelector('.scw-bu-banner-resume').addEventListener('click', function () {
      slot.innerHTML = '';
      startUpload();
    });
    slot.querySelector('.scw-bu-banner-discard').addEventListener('click', function () {
      if (!_state) return;
      var ids = _state.rows
        .filter(function (r) { return r.status !== 'done'; })
        .map(function (r) { return r.id; });
      Promise.all(ids.map(dbDelete)).then(function () {
        if (!_state) return;
        _state.rows = _state.rows.filter(function (r) { return r.status === 'done'; });
        slot.innerHTML = '';
        renderRows();
      });
    });
  }

  function addFiles(files) {
    if (!_state || !files.length) return;
    var puts = files.map(function (f) {
      // prepareFile pass-throughs compliant files, canvas-resizes
      // oversized raster images, and returns blob:null when nothing
      // uploadable could be produced.
      return prepareFile(f).then(function (prep) {
        if (!_state) return;
        var blob   = prep.blob;
        var tooBig = !blob;
        var filename = f.name;
        // File.type can be empty for some extensions on some OSes; fall back
        // to a generic binary MIME so downstream code always has something.
        var mime = f.type || 'application/octet-stream';
        var ext  = getExtension(f.name);
        if (blob && prep.converted) {
          // Re-encoded as JPEG — rename so the payload metadata matches
          // the actual bytes. Auto-match labels (E-001 etc.) survive
          // since only the extension changes.
          mime = 'image/jpeg';
          ext  = 'jpg';
          filename = f.name.replace(/\.[^.]+$/, '') + '.jpg';
        }
        var row = {
          id:        uuid(),
          recordId:  _state.recordId,
          linkField: _state.viewCfg.linkField,
          filename:  filename,
          mimeType:  mime,
          extension: ext,
          sizeBytes: blob ? blob.size : f.size,
          // Surfaced in the size column so resizes are visible.
          origSizeBytes: prep.converted ? f.size : null,
          blob:      blob || f,
          status:    tooBig ? 'too-big' : 'queued',
          error:     tooBig
            ? (prep.heicFailed
              ? 'HEIC photo could not be converted — export it as JPEG and re-add it'
              : ('File exceeds ' + fmtBytes(CONFIG.MAX_FILE_BYTES) + ' limit' +
                 (prep.triedResize ? ' — auto-resize failed (unsupported image format?)' : '')))
            : null,
          addedAt:   Date.now(),
          batchId:   _state.batchId,
          uploadId:  uuid()
        };
        return dbPut(row).then(function () {
          if (_state) _state.rows.push(row);
        });
      });
    });
    Promise.all(puts).then(renderRows).catch(function (err) {
      alert('Could not save file to local storage: ' +
            ((err && err.message) || err) +
            '\n\nThis usually means the browser ran out of storage. Try fewer files at once.');
      loadExistingRows();   // resync in case of partial writes
    });
  }

  function clearQueue() {
    if (!_state) return;
    var pending = _state.rows.filter(function (r) { return r.status !== 'done'; });
    if (!pending.length) return;
    if (!confirm('Remove all ' + pending.length + ' queued file' +
                 (pending.length === 1 ? '' : 's') + '?')) return;
    Promise.all(pending.map(function (r) { return dbDelete(r.id); })).then(function () {
      if (!_state) return;
      _state.rows = _state.rows.filter(function (r) { return r.status === 'done'; });
      renderRows();
    });
  }

  function removeRow(row) {
    dbDelete(row.id).then(function () {
      if (!_state) return;
      _state.rows = _state.rows.filter(function (r) { return r.id !== row.id; });
      renderRows();
    });
  }

  function retryRow(row) {
    row.status = 'queued'; row.error = null;
    dbPut(row).then(renderRows);
  }

  // ── RENDER ────────────────────────────────────────────────────────────
  function renderRows() {
    if (!_state) return;
    var listEl    = document.querySelector('#' + MODAL_ID + '-body .scw-bu-list');
    var summaryEl = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-summary');
    var uploadBtn = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-upload');
    if (!listEl) return;

    if (!_state.rows.length) {
      listEl.innerHTML = '';
      if (summaryEl) summaryEl.textContent = '';
      if (uploadBtn) uploadBtn.disabled = true;
      return;
    }

    listEl.innerHTML = _state.rows.map(rowHtml).join('');

    var stats = countByStatus(_state.rows);
    if (summaryEl) {
      summaryEl.textContent =
        stats.total + ' file' + (stats.total === 1 ? '' : 's') + ' · ' +
        stats.queued + ' queued · ' + stats.done + ' done' +
        (stats.failed ? ' · ' + stats.failed + ' failed' : '') +
        (stats.tooBig ? ' · ' + stats.tooBig + ' too big' : '');
    }
    if (uploadBtn) {
      uploadBtn.disabled = _state.uploading || (stats.queued === 0 && stats.failed === 0);
      // The "everything I added is over the size cap" case reads as
      // "the upload silently does nothing" — say so on the button.
      uploadBtn.title = (!_state.uploading && stats.queued === 0 &&
                         stats.failed === 0 && stats.tooBig > 0)
        ? 'All files exceed the ' + fmtBytes(CONFIG.MAX_FILE_BYTES) +
          ' per-file limit — nothing to upload'
        : '';
    }

    // Wire row-level action buttons
    Array.prototype.forEach.call(listEl.querySelectorAll('button[data-action]'), function (btn) {
      btn.addEventListener('click', function () {
        if (!_state) return;
        var id = btn.getAttribute('data-id');
        var action = btn.getAttribute('data-action');
        var row = _state.rows.find(function (r) { return r.id === id; });
        if (!row) return;
        if (action === 'remove') removeRow(row);
        else if (action === 'retry') retryRow(row);
      });
    });

    // Lazy-build image thumbnails — Object URLs are revoked on load to free memory
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-thumb-id]'), function (slot) {
      var id = slot.getAttribute('data-thumb-id');
      var row = _state.rows.find(function (r) { return r.id === id; });
      if (!row || !row.blob || row.mimeType.indexOf('image/') !== 0) return;
      var url = URL.createObjectURL(row.blob);
      var img = document.createElement('img');
      img.src = url;
      img.onload = img.onerror = function () { URL.revokeObjectURL(url); };
      slot.innerHTML = '';
      slot.appendChild(img);
    });
  }

  function rowHtml(row) {
    var isImg = row.mimeType.indexOf('image/') === 0 && row.blob;
    var thumb = isImg
      ? '<div class="scw-bu-thumb" data-thumb-id="' + row.id + '">' +
          escapeHtml((row.extension || '?').toUpperCase()) + '</div>'
      : '<div class="scw-bu-thumb">' +
          escapeHtml((row.extension || '?').toUpperCase()) + '</div>';
    var labels = {
      queued:    'Queued',
      uploading: 'Uploading…',
      done:      '✓ Done',
      failed:    '✗ Failed',
      'too-big': '✗ Too big'
    };
    var actions = '';
    if (row.status === 'queued' || row.status === 'too-big') {
      actions = '<button class="scw-bu-row-btn" data-action="remove" data-id="' + row.id + '">Remove</button>';
    } else if (row.status === 'failed') {
      actions =
        '<button class="scw-bu-row-btn" data-action="retry"  data-id="' + row.id + '">Retry</button>' +
        '<button class="scw-bu-row-btn" data-action="remove" data-id="' + row.id + '">Remove</button>';
    }
    var errLine = row.error
      ? '<div class="scw-bu-error">' + escapeHtml(row.error) + '</div>'
      : '';
    return (
      '<div class="scw-bu-row">' +
        thumb +
        '<div class="scw-bu-name">' +
          '<div class="scw-bu-name-line" title="' + escapeHtml(row.filename) + '">' +
            escapeHtml(row.filename) +
          '</div>' +
          errLine +
        '</div>' +
        '<div class="scw-bu-size"' +
          (row.origSizeBytes
            ? ' title="Auto-resized from ' + escapeHtml(fmtBytes(row.origSizeBytes)) + '"'
            : '') + '>' +
          fmtBytes(row.sizeBytes) +
          (row.origSizeBytes ? ' <span style="color:#0369a1">(resized)</span>' : '') +
        '</div>' +
        '<div class="scw-bu-status is-' + row.status + '">' +
          (labels[row.status] || row.status) +
        '</div>' +
        '<div class="scw-bu-row-actions">' + actions + '</div>' +
      '</div>'
    );
  }

  function countByStatus(rows) {
    var s = { total: rows.length, queued: 0, uploading: 0, done: 0, failed: 0, tooBig: 0 };
    rows.forEach(function (r) {
      if (r.status === 'too-big')        s.tooBig++;
      else if (s[r.status] != null)      s[r.status]++;
    });
    return s;
  }

  // ── UPLOAD LOOP ───────────────────────────────────────────────────────
  function startUpload() {
    if (!_state || _state.uploading) return;
    var webhook = SCW.CONFIG && SCW.CONFIG.MAKE_BULK_UPLOAD_WEBHOOK;
    if (!webhook) {
      alert('Bulk upload webhook is not configured (SCW.CONFIG.MAKE_BULK_UPLOAD_WEBHOOK).');
      return;
    }
    // Re-queue any rows the user wants retried
    _state.rows.forEach(function (r) {
      if (r.status === 'failed') { r.status = 'queued'; r.error = null; }
    });
    // Always-on breadcrumb — uploads are rare and these lines turn
    // "the webhook doesn't seem to fire" reports into hard data.
    console.info('[bulk-upload] starting batch', {
      recordId:  _state.recordId,
      linkField: _state.viewCfg && _state.viewCfg.linkField,
      queued:    countByStatus(_state.rows).queued
    });
    _state.uploading = true;
    setButtonsDisabled(true);
    processNext(webhook);
  }

  function setButtonsDisabled(disabled) {
    var clearBtn  = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-clear');
    var uploadBtn = document.querySelector('#' + MODAL_ID + '-footer .scw-bu-upload');
    if (clearBtn)  clearBtn.disabled  = disabled;
    if (uploadBtn) {
      uploadBtn.disabled    = disabled;
      uploadBtn.textContent = disabled ? 'Uploading…' : 'Upload';
    }
  }

  function processNext(webhook) {
    if (!_state) return;
    var row = _state.rows.find(function (r) { return r.status === 'queued'; });
    if (!row) {
      // Batch complete
      _state.uploading = false;
      setButtonsDisabled(false);
      var stats = countByStatus(_state.rows);
      if (stats.failed === 0 && stats.tooBig === 0 && stats.done > 0) {
        setTimeout(function () {
          alert('All ' + stats.done + ' file' +
                (stats.done === 1 ? '' : 's') + ' uploaded.');
          closeModal();
        }, 100);
      }
      return;
    }
    uploadOne(row, webhook).then(function () {
      // Throttle BETWEEN uploads — gives Make headroom against per-minute
      // operations limits. Only needed when another file is still queued;
      // applying it after the last file just makes a single-photo upload
      // sit ~1.5s longer before the modal confirms/closes. Also skipped
      // after a failure since that file already paused itself with a
      // retry delay.
      if (!_state) return;
      var moreQueued = _state.rows.some(function (r) { return r.status === 'queued'; });
      var delay = (moreQueued && row.status === 'done') ? CONFIG.UPLOAD_DELAY_MS : 0;
      setTimeout(function () { processNext(webhook); }, delay);
    });
  }

  function uploadOne(row, webhook) {
    row.status = 'uploading'; row.error = null;
    return dbPut(row).then(function () {
      renderRows();
      return readAsBase64(row.blob);
    }).then(function (b64) {
      var payload = {
        recordId:    row.recordId,
        linkField:   row.linkField,
        filename:    row.filename,
        mimeType:    row.mimeType,
        extension:   row.extension,
        sizeBytes:   row.sizeBytes,
        dataBase64:  b64,
        uploadId:    row.uploadId,
        batchId:     row.batchId,
        triggeredBy: getCurrentUser()
      };
      var bodyStr = JSON.stringify(payload);
      // Client-side hard stop: Make silently drops connections on bodies
      // over ~5 MB. Fail BEFORE sending (this never touches the network) so
      // the user can resize instead of getting a false "done".
      if (bodyStr.length > 4.9 * 1024 * 1024) {
        row.status = 'failed';
        row.error  = 'Too large to send (' + fmtBytes(bodyStr.length) +
          ' encoded · 5 MB limit) — resize and retry';
        return dbPut(row).then(renderRows).catch(function () { renderRows(); });
      }
      console.info('[bulk-upload] POST (optimistic)', row.filename,
        '(' + fmtBytes(row.sizeBytes) + ' raw, ' + fmtBytes(bodyStr.length) + ' encoded) →',
        row.linkField, row.recordId);
      // OPTIMISTIC SEND: fire the request and immediately mark the row done.
      // We do NOT wait on or read Make's response — that round-trip is what
      // made uploads feel slow, and reading it brought CORS/retry/duplicate
      // headaches. The request keeps running in the background (closing the
      // modal doesn't cut it; only navigating away from the page would).
      // Make does its Knack write on its own schedule; the delayed grid
      // refresh on modal close surfaces the new photos. No Make change
      // needed — the existing scenario's response is simply ignored.
      fetch(webhook, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    bodyStr
      }).catch(function (err) {
        // Already reported done to the user — just log the background error.
        console.warn('[bulk-upload] background send error (already marked done):',
          row.filename, (err && err.message) || err);
      });
      return dbDelete(row.id).then(function () {
        row.status = 'done';
        row.blob = null;
        row.error = null;
        if (_state) _state.successCount++;
        renderRows();
      });
    }).catch(function (err) {
      // Only PRE-SEND client errors reach here (e.g. base64 read / IDB) —
      // these never touched the network, so marking failed is safe.
      var msg = (err && err.message) || String(err);
      console.warn('[bulk-upload] pre-send failure:', row.filename, msg);
      row.status = 'failed';
      row.error  = msg;
      return dbPut(row).then(renderRows).catch(function () { renderRows(); });
    });
  }

  // ── Inline button injection ───────────────────────────────────────────
  // Photo icon — Feather 'image' SVG (picture frame with sun + mountain),
  // not the camera icon. currentColor so it inherits the button's text
  // color from scw-acc-action-btn / the active --scw-accent.
  var PHOTO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
      '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
      '<polyline points="21 15 16 10 5 21"></polyline>' +
    '</svg>';

  function injectInlineStyles() {
    if (document.getElementById('scw-bulk-inline-btn-css')) return;
    var css = [
      // Match the visual layout of scw-acc-action-btn so the icon
      // sits to the left of the label with the same spacing as
      // sibling action buttons in the accordion-actions toolbar.
      '.scw-bulk-inline-btn {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '}',
      '.scw-bulk-inline-btn svg { flex-shrink: 0; vertical-align: middle; }',
      '.scw-bulk-inline-btn > span:first-child {',
      '  display: inline-flex; align-items: center;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'scw-bulk-inline-btn-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Find a clickable element in `scope` whose visible text matches
  // `text`. Looks at Knack's native button classes AND SCW's custom
  // accordion-action button class, since hoisted action buttons use
  // the latter. Ignores anything inside our own injected button.
  //
  // Prefers buttons inside .scw-acc-actions over source menu links —
  // accordion-menu-inject.js hides the source menu via a CSS class but
  // leaves its <a class="kn-link"> in the DOM. Without this preference
  // the scope-wide scan finds the hidden link first (document order)
  // and we end up inserting our button inside the hidden source view.
  function findButtonByText(scope, text) {
    if (!scope || !text) return null;

    // Preferred: visible button in .scw-acc-actions
    var preferred = scope.querySelectorAll(
      '.scw-acc-actions .scw-acc-action-btn'
    );
    for (var p = 0; p < preferred.length; p++) {
      if (preferred[p].closest('.scw-bulk-inline-btn')) continue;
      if ((preferred[p].textContent || '').trim() === text) return preferred[p];
    }

    // Fallback: any clickable in scope (e.g. the inline menu before
    // accordion-menu-inject has built the action button).
    var nodes = scope.querySelectorAll(
      'a.kn-link, a.kn-button, button.kn-button, ' +
      'button.scw-acc-action-btn, .scw-acc-action-btn'
    );
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest('.scw-bulk-inline-btn')) continue;
      // Skip anything inside a hidden source menu view — accordion-menu-inject
      // hides absorbed menu views with .scw-acc-menu-src-hidden.
      if (nodes[i].closest('.scw-acc-menu-src-hidden')) continue;
      if ((nodes[i].textContent || '').trim() === text) return nodes[i];
    }
    return null;
  }

  // Build the Add Photos button. Pure DOM construction — no insertion.
  // `target` is the optional injectTargets entry that asked for this
  // button. If `target.contexts` is set, the click handler picks the
  // first context whose hashPattern matches the URL — that lets a
  // single button source different { recordId, linkField } pairs
  // depending on the page route (e.g. view_3610 on the standalone
  // SOW page vs. inside project-dashboard/build-sow).
  function resolveContext(viewCfg, target) {
    var contexts = (target && target.contexts) || null;
    if (contexts) {
      for (var i = 0; i < contexts.length; i++) {
        var ctx = contexts[i];
        var id  = getRecordId(ctx.hashPattern);
        if (id) return { recordId: id, linkField: ctx.linkField || viewCfg.linkField };
      }
    }
    var fallback = getRecordId(viewCfg.hashPattern);
    if (fallback) return { recordId: fallback, linkField: viewCfg.linkField };
    return null;
  }

  function buildAddPhotosBtn(viewCfg, target) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scw-acc-action-btn scw-bulk-inline-btn';
    btn.setAttribute('data-scw-bulk-inline-bound', '1');
    btn.innerHTML = '<span>' + PHOTO_SVG + '</span>Add Photos';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var ctx = resolveContext(viewCfg, target);
      if (!ctx) { alert('Could not determine record id from URL.'); return; }
      // Shallow-clone viewCfg so the modal/queue picks up the
      // context-appropriate linkField without mutating the shared
      // config object.
      var cfgForUpload = $.extend({}, viewCfg, { linkField: ctx.linkField });
      openModal(cfgForUpload, ctx.recordId);
    });
    return btn;
  }

  // ── INIT: intercept configured menu links + register Add Photos ─────
  CONFIG.VIEWS.forEach(function (viewCfg) {
    // 1) Intercept the legacy menu link (replaces the JotForm flow when
    //    the user clicks the link in the source menu view).
    SCW.onViewRender(viewCfg.menuViewId, function () {
      var view = document.getElementById(viewCfg.menuViewId);
      if (!view) return;
      // a.knMenuLink covers Knack's newer Vue-rendered menu views
      // (e.g. view_2653) — legacy a.kn-link / a.kn-button covers the
      // older menu templates still used elsewhere.
      var links = view.querySelectorAll(
        'a.kn-link, a.kn-button, a.knMenuLink'
      );
      Array.prototype.forEach.call(links, function (a) {
        if ((a.textContent || '').trim() !== viewCfg.linkText) return;
        if (a.getAttribute('data-scw-bulk-bound') === '1') return;
        a.setAttribute('data-scw-bulk-bound', '1');
        a.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();    // beat any other listeners (e.g. JotForm)
          var recordId = getRecordId(viewCfg.hashPattern);
          if (!recordId) { alert('Could not determine record id from URL.'); return; }
          openModal(viewCfg, recordId);
        });
      });
    }, 'scwBulkUpload.' + viewCfg.menuViewId);

    // 2) Inline "Add Photos" button injected next to a reference button
    //    in one or more other views' toolbars (e.g. before "Add Survey/
    //    Bid Item" in view_3505). One toolbar registration per target.
    //    Registered with SCW.toolbar so it gets mounted on initial paint
    //    AND re-injected whenever accordion-menu-inject rebuilds
    //    .scw-acc-actions — no separate MutationObserver plumbing.
    var targets = viewCfg.injectTargets;
    if (!targets || !targets.length) return;

    injectInlineStyles();
    targets.forEach(function (target) {
      SCW.toolbar.register({
        id:    'add-photos-' + target.viewId,
        slot:  SCW.toolbar.SLOTS.actions,
        viewMatch: function (viewEl) { return viewEl.id === target.viewId; },
        mount: function (viewEl, nav) {
          // Reference button lives inside the hoisted .scw-acc-actions
          // in this view's nav. Restrict the lookup to that container
          // so we never match the source menu's hidden <a class="kn-link">
          // with the same text.
          var accActions = nav.querySelector('.scw-acc-actions');
          if (!accActions) return;   // tb-hoist hasn't moved it yet; retry next tick

          // Already inside the right container? Nothing to do.
          if (accActions.querySelector('button[data-scw-bulk-inline-bound="1"]')) {
            return;
          }

          var ref = findButtonByText(accActions, target.beforeText);
          if (!ref) return;          // accordion-menu-inject hasn't built it yet

          // Clean up any stranded button left over in THIS view's scope
          // from a previous render (e.g. one parked in nav.firstChild
          // before .scw-acc-actions was hoisted). Scoped to viewEl so
          // we don't clobber a sibling view's button.
          var stale = viewEl.querySelectorAll('button[data-scw-bulk-inline-bound="1"]');
          for (var i = 0; i < stale.length; i++) {
            if (stale[i].parentNode && !accActions.contains(stale[i])) {
              stale[i].parentNode.removeChild(stale[i]);
            }
          }

          ref.parentNode.insertBefore(buildAddPhotosBtn(viewCfg, target), ref);
        }
      });
    });
  });

  // Console debug helpers
  //   SCW.DEBUG = true                          → enable verbose refresh logging
  //   SCW.bulkUpload.refreshSingleRecord(v,r)   → manually trigger a row refresh
  //   SCW.bulkUpload.dbGetAll()                 → inspect persisted queue
  //   SCW.bulkUpload.dbClear()                  → wipe persisted queue
  window.SCW.bulkUpload = {
    open:                openModal,
    config:              CONFIG,
    dbGetAll:            dbGetAll,
    dbClear:             dbClear,
    refreshSingleRecord: refreshSingleRecord
  };
})();
