/*** SOW — custom "Add to Scope of Work" modal (replaces the DTO add forms) ***
 *
 * The native Add to Scope forms (view_3329 build-SOW, view_3748 / view_3451
 * sales + ops pages) create a DTO_create scope line items record that Make
 * expands into SOW Line Items. Since 2026-10 Knack's browser-side required
 * check blocks every bucket's submit (hidden required fields), and the
 * dto-form-submit-intercept.js workaround creates DTO records that never
 * connect to the SOW header (2026-10-08). Decision 2026-10-08: pivot to a
 * modal we control — the same engine as the CO add modal
 * (co-add-item-form.js), the DTO forms' per-bucket field suite
 * (SOW-line-item-DTO-bucket-field-visibility.js), and a Make webhook
 * (SCW.CONFIG.MAKE_SOW_ADD_ITEMS_WEBHOOK) that creates the SOW Line Items
 * directly, connected to the chosen SOW(s). No DTO record, no Knack form.
 *
 * LIVE for everyone since 2026-10-08 (CONFIG.ALLOWED_EMAILS is empty; put
 * emails back in to gate a future change). Where a view opts in, the
 * worksheet toolbar's "+ Add to SOW" IS this modal — the old button that
 * opened the Knack DTO form is gone; the bid-review-v2 (reconcile bids)
 * toolbar routes its "+ Add to SOW" here too.
 *
 * Wiring: a worksheet-v2 config entry sets sowAddModal:{…} → toolbar
 * build() renders the button → handleAction('add-sow-modal') calls
 * SCW.worksheetV2.sowAddForm.open({ viewKey }). Surfaces outside
 * worksheet-v2's config (bid-review-v2 on scene_1155) describe themselves
 * in HOSTS below.
 *
 * SOW target: the page's record (last 24-hex segment of the hash — the
 * build-SOW and sales SOW pages are both SOW record pages), pre-checked;
 * when the worksheet's rows carry other SOWs (field_2154) they are offered
 * too, mirroring the DTO's "Which SOWs are you adding to?" multi-select.
 *
 * SURVEY MODE (2026-10-09): a view whose sowAddModal has mode:'survey' (the
 * sub survey / bid worksheet view_3505 on scene_1140) gets the SAME modal
 * running the SURVEY DTO form's rules instead — SURVEY_BUCKETS mirrors
 * bucket-field-visibility_add-survey-bid-item.js (view_3627) field-for-field:
 * the bid(s) row on every bucket, the sub's labor bid (field_2233) + survey
 * notes (field_2432) on every bucket but License, accessories only on
 * Materials, License = product + qty only. The target is the page's SURVEY
 * REQUEST (last 24-hex segment of …/site-survey-request-details/<id>) plus
 * the bid(s) picked from the BIDs grid (view_3507, the worksheet's active bid
 * filter pre-checked). The payload mirrors the survey DTO record (field_2426
 * request · field_2427 bids · field_2432 notes · field_2233 labor bid …) for
 * Make 05.01 "SURVEY ITEM | Create from DTO (DUPE USING CUSTOM MODAL)" — the
 * DTO scenario re-triggered by SCW.CONFIG.MAKE_SURVEY_ADD_ITEMS_WEBHOOK.
 * requireWebhook:true keeps the toolbar on the native "Add Survey/Bid Item"
 * link until that URL is filled in.
 *
 * SUB-CAN-ADD (survey mode): only products flagged "FLAG_subcontractor can
 * add" (Products field_2433 = Yes) are offered, and a bucket with no such
 * product is hidden (product-less Other Services stays). Flag source:
 * sowAddModal.subCanAddView (a Products grid on the scene) else
 * SCW.productMap[id].subCanAdd (Builder snippet); neither on the page →
 * every product + an in-modal notice, never a silently empty list.
 *
 * PREVIEW (sowAddModal.previewEmails): while the list is set, the native
 * add button stays for EVERYONE and the listed users get a second
 * "(new)" button beside it that opens this modal — nothing changes for
 * anyone else. Remove the list to make the modal THE add button.
 ***************************************************************************/
(function () {
  'use strict';

  var ns  = (window.SCW = window.SCW || {});
  ns.worksheetV2 = ns.worksheetV2 || {};
  var wv2 = ns.worksheetV2;

  var CONFIG = {
    // Who sees the button (case-insensitive). Empty list = everyone (LIVE).
    ALLOWED_EMAILS: [],
    // SCW.CONFIG key holding the Make webhook that creates the line items.
    WEBHOOK_KEY:    'MAKE_SOW_ADD_ITEMS_WEBHOOK',
    // Survey mode (sowAddModal.mode:'survey'): Make 05.01 twin.
    SURVEY_WEBHOOK_KEY: 'MAKE_SURVEY_ADD_ITEMS_WEBHOOK',
    BUTTON_LABEL:   '+ Add to SOW',
    BUTTON_TITLE:   'Add line items to the Scope of Work',
    SURVEY_BUTTON_TITLE: 'Add survey / bid items',
    // Line item → SOW(s): where the "other SOWs on this project" list comes from.
    SOW_FIELD:      'field_2154',
    // Survey mode: line item → bid(s) (the worksheet's grouping connection),
    // the BIDs grid's label (bid number) + friendly name columns, and the
    // survey request's project connection (object_113) read off any view on
    // the scene that loads the request.
    BID_FIELD:            'field_2415',
    BID_LABEL_FIELD:      'field_2414',
    BID_NAME_FIELD:       'field_2636',
    SURVEY_PROJECT_FIELD: 'field_2346',
    // Products · FLAG_subcontractor can add — survey mode offers only these.
    SUB_CAN_ADD_FIELD:    'field_2433',
    // Key(s) the productMap Builder snippet may expose the flag under
    // (first one present wins; the snippet names the field SUB_ALLOWED).
    SUB_CAN_ADD_KEYS:     ['subAllowed', 'subCanAdd', 'sub_allowed', 'field_2433', 'field_2433_raw'],
    // Make creates N records asynchronously — refetch the worksheet twice.
    REFETCH_DELAYS_MS: [2500, 8000],
    // Structural initiator per hosting deployment (never the user's email).
    ORIGINS: {
      view_3962: { origin: 'ops',   originPage: 'Build SOW' },
      view_3586: { origin: 'sales', originPage: 'Sales SOW' },
      view_3921: { origin: 'ops',   originPage: 'Reconcile bids' },
      view_3505: { origin: 'sub',   originPage: 'Survey / bid worksheet' }
    },
    // Hosts outside worksheet-v2's config — same keys as a view's
    // sowAddModal entry (page / sowViews / buckets / sowPicker) plus the
    // MDF/IDF source (mdfView / mdfLabelField) worksheet views get from
    // their own config. view_3921 = the SOW items grid bid-review-v2 reads
    // on scene_1155 (reconcile bids): a PROJECT page (review-bids/<project>),
    // SOWs from the Scopes of Work grid view_3918, locations from view_3822.
    HOSTS: {
      view_3921: { page: 'project', sowViews: ['view_3918', 'view_3325'], mdfView: 'view_3822', mdfLabelField: 'field_1642' }
    },
    debug: false
  };

  var STYLE_ID = 'scw-sow-add-form-css';
  var HEX24    = /^[a-f0-9]{24}$/i;
  var CUSTOM_ASSUMPTION_ID = '69ce7098172caa5786d3767d';

  function log() { if (CONFIG.debug) { try { console.info.apply(console, ['[scw-sow-add]'].concat([].slice.call(arguments))); } catch (e) { /* ignore */ } } }

  // Bucket ids ← the DTO forms' field_2223 options. Each bucket's `fields`
  // is an ORDERED list of field descriptors — the render order IS this
  // array. Mirrors BUCKET_RULES_HUMAN in
  // SOW-line-item-DTO-bucket-field-visibility.js (view_3329) /
  // …_view_3451.js (view_3451 + view_3748), with the Knack forms' labels.
  // Descriptor types:
  //   product | mdf(mode:single|multi|opt) | accessories | qty | prefix |
  //   startNumber | serviceCost | description | notes | toggles(items:[...])
  var B_CAMERA      = '6481e5ba38f283002898113c';
  var B_NETWORKING  = '647953bb54b4e1002931ed97';
  var B_OTHEREQUIP  = '5df12ce036f91b0015404d78';
  var B_SERVICE     = '6977caa7f246edf67b52cbcd';
  var B_ASSUMPTIONS = '697b7a023a31502ec68b3303';
  var B_MATERIALS   = '6a14eee134e422f3769ada00';
  var B_LICENSE     = '645554dce6f3a60028362a6a';

  var CAM_START_HELPER =
    'I.e. If you’re adding quantity 5 cameras here with a pre-fix of ' +
    '"EX-" and want to start the numbering at 12, you’ll get EX-12, ' +
    'EX-13, EX-14, EX-15, and EX-16';
  var MDF_MULTI_HELPER =
    'If multiple MDF/IDFs are selected, the selected product(s) will be added ' +
    'to each IDF/MDF. I.e., if you select quantity 2, 2 switches will be added ' +
    'to EACH IDF/MDF for 4 switches total.';

  var BUCKETS = [
    // field_2193 product · field_2211 MDF (single, relabeled) · field_2183 qty ·
    // field_2241 pre-fix · field_2184 label number · field_2462/2739/2740 flags ·
    // field_2206 accessories · field_2466 notes
    // productMulti: Camera/Reader + Networking are SINGLE product (one prefix /
    // numbering run, one headend device); Other Equipment, License, Assumptions,
    // Materials take several at once.
    { id: B_CAMERA, name: 'Camera or Reader', productMulti: false, fields: [
      { t: 'product', label: 'Product' },
      { t: 'mdf', mode: 'single', label: 'Cabling for these cameras will route back to which MDF or IDF?' },
      { t: 'qty', label: 'How many cameras or readers do you want to add?' },
      { t: 'prefix', label: 'Label pre-fix' },
      { t: 'startNumber', label: 'What number should we start the camera label numbers on?', helper: CAM_START_HELPER },
      { t: 'toggles', items: ['existingCabling', 'exterior', 'plenum'] },
      { t: 'accessories' },
      { t: 'notes' }
    ]},
    // field_2194 product · field_2206 accessories · field_2183 qty · field_2180 MDF (multi, mandatory)
    { id: B_NETWORKING, name: 'Networking or Headend', productMulti: false, fields: [
      { t: 'product' },
      { t: 'accessories' },
      { t: 'qty', label: 'How many do you want to add to EACH MDF/IDF selected below?' },
      { t: 'mdf', mode: 'multi', label: 'Which MDF or IDFs will this item go in?', helper: MDF_MULTI_HELPER }
    ]},
    // field_2195 product · field_2250 MDF (optional multi) · field_2183 qty
    { id: B_OTHEREQUIP, name: 'Other Equipment', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // Product-less by design: field_2233 expected sub bid · field_2183 qty ·
    // field_2210 service description · field_2250 MDF (optional)
    { id: B_SERVICE, name: 'Other Services', productOptional: true, fields: [
      { t: 'description', label: 'Service description' },
      { t: 'serviceCost', label: 'Expected sub bid ($)' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2248 assumption catalog (Products in the Assumptions bucket) ·
    // field_2210 description, shown only when "Custom Assumption" is picked ·
    // field_2250 MDF (optional)
    { id: B_ASSUMPTIONS, name: 'Assumptions', productMulti: true, fields: [
      { t: 'product', label: 'Assumption(s)', placeholder: 'Search assumptions…' },
      { t: 'description', label: 'Detail custom assumption', conditional: 'customAssumption' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2913 product · field_2206 accessories · field_2250 MDF (optional)
    { id: B_MATERIALS, name: 'Materials', productMulti: true, fields: [
      { t: 'product' },
      { t: 'accessories' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2224 product · field_2183 qty
    { id: B_LICENSE, name: 'License', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' }
    ]}
  ];
  // SURVEY mode — the survey DTO form's (view_3627) per-bucket suite:
  // bucket-field-visibility_add-survey-bid-item.js BUCKET_RULES_HUMAN, field
  // for field (product first like the SOW suite, then the Knack form's
  // order). Differences from the SOW suite: the bid(s) row (field_2427) on
  // EVERY bucket (rendered once above the fields, where the SOW row sits);
  // the sub's LABOR BID (field_2233 — Make 05.01 writes it to the line's
  // Labor field_2400, blank = the product's default labor rate) and SURVEY
  // NOTES (field_2432) on every bucket but License; accessories (field_2206)
  // only on Materials; no camera-notes field; License = product + qty only
  // (no project / MDF / notes). field_2181 project + field_2246 unified
  // product are the form's hidden plumbing — the payload carries both.
  // ⚠ Keep in step with BUCKET_RULES_HUMAN when view_3627's rules change.
  var SURVEY_LABOR_LABEL  = 'Labor bid ($ each)';
  var SURVEY_LABOR_HELPER = 'Your labor price per item. Leave blank to use the product’s default labor rate.';
  var SURVEY_BUCKETS = [
    // field_2211 MDF (single, mandatory) · field_2193 product · field_2183 qty ·
    // field_2241 pre-fix · field_2184 label number · field_2462/2739/2740 flags ·
    // field_2432 survey notes · field_2233 labor bid
    { id: B_CAMERA, name: 'Camera or Reader', productMulti: false, fields: [
      { t: 'product', label: 'Product' },
      { t: 'mdf', mode: 'single', label: 'Cabling for these cameras will route back to which MDF or IDF?' },
      { t: 'qty', label: 'How many cameras or readers do you want to add?' },
      { t: 'prefix', label: 'Label pre-fix' },
      { t: 'startNumber', label: 'What number should we start the camera label numbers on?', helper: CAM_START_HELPER },
      { t: 'toggles', items: ['existingCabling', 'exterior', 'plenum'] },
      { t: 'notes', label: 'Survey notes' },
      { t: 'serviceCost', label: SURVEY_LABOR_LABEL, helper: SURVEY_LABOR_HELPER }
    ]},
    // field_2180 MDF (multi, mandatory) · field_2183 qty · field_2194 product ·
    // field_2233 labor bid · field_2432 survey notes
    { id: B_NETWORKING, name: 'Networking or Headend', productMulti: false, fields: [
      { t: 'product' },
      { t: 'qty', label: 'How many do you want to add to EACH MDF/IDF selected below?' },
      { t: 'mdf', mode: 'multi', label: 'Which MDF or IDFs will this item go in?', helper: MDF_MULTI_HELPER },
      { t: 'serviceCost', label: SURVEY_LABOR_LABEL, helper: SURVEY_LABOR_HELPER },
      { t: 'notes', label: 'Survey notes' }
    ]},
    // field_2250 MDF (optional) · field_2195 product · field_2233 · field_2432 · field_2183 qty
    { id: B_OTHEREQUIP, name: 'Other Equipment', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' },
      { t: 'serviceCost', label: SURVEY_LABOR_LABEL, helper: SURVEY_LABOR_HELPER },
      { t: 'notes', label: 'Survey notes' }
    ]},
    // Product-less: field_2250 MDF (optional) · field_2233 labor bid · field_2183 qty ·
    // field_2210 service description · field_2432 survey notes
    { id: B_SERVICE, name: 'Other Services', productOptional: true, fields: [
      { t: 'description', label: 'Service description' },
      { t: 'serviceCost', label: 'Labor bid ($)', helper: 'Your price for this service.' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' },
      { t: 'notes', label: 'Survey notes' }
    ]},
    // field_2250 MDF (optional) · field_2432 · field_2248 assumptions
    // (+ field_2210 only when "Custom Assumption" is picked)
    { id: B_ASSUMPTIONS, name: 'Assumptions', productMulti: true, fields: [
      { t: 'product', label: 'Assumption(s)', placeholder: 'Search assumptions…' },
      { t: 'description', label: 'Detail custom assumption', conditional: 'customAssumption' },
      { t: 'mdf', mode: 'opt' },
      { t: 'notes', label: 'Survey notes' }
    ]},
    // field_2250 MDF (optional) · field_2432 · field_2913 product · field_2206 accessories
    { id: B_MATERIALS, name: 'Materials', productMulti: true, fields: [
      { t: 'product' },
      { t: 'accessories' },
      { t: 'mdf', mode: 'opt' },
      { t: 'notes', label: 'Survey notes' }
    ]},
    // field_2183 qty · field_2224 product — no project, MDF or notes
    { id: B_LICENSE, name: 'License', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' }
    ]}
  ];
  function bucketById(id, list) {
    list = list || BUCKETS;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** The bucket catalogue a view runs: the survey DTO form's suite in survey
   *  mode, else the SOW forms'. Same ids, different field suites. */
  function allBuckets(viewKey) {
    return modalOpts(viewKey).mode === 'survey' ? SURVEY_BUCKETS : BUCKETS;
  }
  // Config names for the per-view bucket list (worksheet-v2/config.js
  // `sowAddModal: { buckets: [...] }`, names or 24-hex ids, in display order).
  var BUCKET_KEYS = {
    camera: B_CAMERA, networking: B_NETWORKING, otherEquipment: B_OTHEREQUIP, services: B_SERVICE,
    assumptions: B_ASSUMPTIONS, materials: B_MATERIALS, license: B_LICENSE
  };
  /** The buckets this worksheet offers — the view's configured list (e.g. the
   *  sales page: only the buckets whose "allow sales to add" is Yes, in the
   *  DTO dropdown's order), else every bucket. */
  function bucketsFor(viewKey) {
    var vc = viewCfg(viewKey);
    var o = (vc && vc.sowAddModal && typeof vc.sowAddModal === 'object') ? vc.sowAddModal : (CONFIG.HOSTS[viewKey] || {});
    var base = allBuckets(viewKey);
    var list = Array.isArray(o.buckets) ? o.buckets : null;
    if (!list || !list.length) return hideEmptySurveyBuckets(base.slice(), viewKey);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var b = bucketById(BUCKET_KEYS[list[i]] || list[i], base);
      if (b && out.indexOf(b) === -1) out.push(b);
    }
    return hideEmptySurveyBuckets(out.length ? out : base.slice(), viewKey);
  }

  // Label prefix options (object_111 CONFIG: Pre-Fix — the DTO's field_2241
  // connection). Payload carries both the id and the text.
  var PREFIX_OPTIONS = [
    { id: '69dd35883b2c9b81f2c634a1', label: 'AC-' },
    { id: '697c23e95fcd43d578c31963', label: 'E-' },
    { id: '697c23ee918bb194da5537bb', label: 'I-' },
    { id: '69eb72a13bb36ab20c234e2d', label: 'RA-AC-' },
    { id: '697c23f4918bb194da5559e1', label: 'RA-E-' },
    { id: '697c23f7178250c8b80d8332', label: 'RA-I-' },
    { id: '697c23fe178250c8b80dbd4c', label: 'UPLINK-' }
  ];
  function prefixLabelFor(id) {
    for (var i = 0; i < PREFIX_OPTIONS.length; i++) if (PREFIX_OPTIONS[i].id === id) return PREFIX_OPTIONS[i].label;
    return '';
  }

  var TOGGLE_LABELS = {
    existingCabling: 'Use existing cabling',
    exterior:        'Exterior',
    plenum:          'Plenum'
  };

  // ── DTO-shaped payload ─────────────────────────────────────────────
  // Make scenario 02.01 "SOW Line Item DTO (DUPE USING CUSTOM MODAL)" was
  // remapped MECHANICALLY from the DTO record to this webhook's payload, so
  // alongside the readable keys the payload mirrors the DTO record: every
  // connection arrives as Knack's `_raw` shape ([{id, identifier}]) under
  // the DTO's field key, every plain input under both `field_X` and
  // `field_X_raw`. Which product / MDF key carries the choice depends on
  // the bucket, exactly like the DTO form's per-bucket fields.
  var DTO_PRODUCT_FIELD = {};
  DTO_PRODUCT_FIELD[B_CAMERA]      = 'field_2193';   // REL_products_for readers & cameras
  DTO_PRODUCT_FIELD[B_NETWORKING]  = 'field_2194';   // REL_products_for networking
  DTO_PRODUCT_FIELD[B_OTHEREQUIP]  = 'field_2195';   // REL_products_for other equipment
  DTO_PRODUCT_FIELD[B_LICENSE]     = 'field_2224';   // REL_products for licenses
  DTO_PRODUCT_FIELD[B_ASSUMPTIONS] = 'field_2248';   // REL_products for assumptions
  DTO_PRODUCT_FIELD[B_MATERIALS]   = 'field_2913';   // REL_products for materials
  var DTO_MDF_FIELD = { single: 'field_2211', multi: 'field_2180', opt: 'field_2250' };
  var DTO_ARRAY_KEYS = ['field_2193', 'field_2194', 'field_2195', 'field_2224', 'field_2248', 'field_2913',
                        'field_2211', 'field_2180', 'field_2250', 'field_2206', 'field_2241', 'field_2181',
                        'field_2187', 'field_2246', 'field_2426', 'field_2427'];
  // field_2246 "unified product" = the first filled product field in this
  // priority (set_unified_product_field.js SINGLE_PRIORITY) — the buckets
  // whose product field is one of them.
  var UNIFIED_PRODUCT_BUCKETS = [B_CAMERA, B_NETWORKING, B_OTHEREQUIP, B_MATERIALS];
  function conn(ids, labels) {
    var out = [];
    for (var i = 0; i < ids.length; i++) out.push({ id: ids[i], identifier: (labels && labels[ids[i]]) || '' });
    return out;
  }
  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function yesNo(b) { return b ? 'Yes' : 'No'; }

  // ── helpers ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hashSegments() {
    return (window.location.hash || '').replace(/^#/, '').split('?')[0].split('/');
  }
  /** The page's record — the SOW on the build-SOW / sales SOW pages. */
  function currentSowId() {
    var segs = hashSegments();
    for (var i = segs.length - 1; i >= 0; i--) if (HEX24.test(segs[i])) return segs[i];
    return '';
  }
  /** The project record, when the route carries it (…/project-dashboard/<id>/…). */
  function currentProjectId() {
    var segs = hashSegments();
    for (var i = 0; i + 1 < segs.length; i++) {
      if (segs[i] === 'project-dashboard' && HEX24.test(segs[i + 1])) return segs[i + 1];
    }
    return '';
  }
  function viewCfg(viewKey) {
    try { return wv2.cfg && wv2.cfg.viewCfg && wv2.cfg.viewCfg(viewKey); } catch (e) { return null; }
  }
  function userEmail() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes && Knack.getUserAttributes();
      return u && u.email ? String(u.email).trim().toLowerCase() : '';
    } catch (e) { return ''; }
  }
  /** The view's configured webhook URL — '' when blank / PLACEHOLDER. */
  function webhookUrl(viewKey) {
    var key = modalOpts(viewKey).webhookKey;
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[key]) || '';
    return (!url || /PLACEHOLDER/.test(url)) ? '' : String(url);
  }
  function buttonTitle(viewKey) {
    return modalOpts(viewKey).mode === 'survey' ? CONFIG.SURVEY_BUTTON_TITLE : CONFIG.BUTTON_TITLE;
  }
  /** Preview rollout on this view: previewEmails is set → the toolbar keeps
   *  the native add button for everyone and adds the modal as a "(new)"
   *  button for the listed users only. */
  function isPreview(viewKey) { return !!viewKey && modalOpts(viewKey).previewEmails.length > 0; }
  function isPreviewUser(viewKey) {
    var email = userEmail();
    return !!email && modalOpts(viewKey).previewEmails.indexOf(email) !== -1;
  }
  /** Rollout gate for the toolbar button + open(): the email list, and on
   *  views flagged requireWebhook a configured webhook (survey: the native
   *  "Add Survey/Bid Item" link stays until MAKE_SURVEY_ADD_ITEMS_WEBHOOK is
   *  filled in — a modal that can't submit would strand the sub). */
  function isAllowed(viewKey) {
    // Preview: the listed users, webhook or not (submit reports an
    // unconfigured webhook) — everyone else keeps the native button.
    if (isPreview(viewKey)) return isPreviewUser(viewKey);
    if (viewKey && modalOpts(viewKey).requireWebhook && !webhookUrl(viewKey)) return false;
    if (!CONFIG.ALLOWED_EMAILS.length) return true;
    var email = userEmail();
    if (!email) return false;   // no identity → not shown
    for (var i = 0; i < CONFIG.ALLOWED_EMAILS.length; i++) {
      if (String(CONFIG.ALLOWED_EMAILS[i]).toLowerCase() === email) return true;
    }
    return false;
  }
  function triggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
      if (!u) return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }
  function viewModels(viewKey) {
    var v = viewKey && window.Knack && Knack.views && Knack.views[viewKey];
    return (v && v.model && v.model.data && v.model.data.models) || [];
  }

  // ── candidate sources ──────────────────────────────────────────────
  /** A product's bucket (SCW.productMap buckets, else SCW.productBucketMap).
   *  Every product has exactly ONE bucket; '' only when the catalog map
   *  hasn't loaded or lacks the product. */
  function productBucketOf(pid) {
    var pmap = (window.SCW && SCW.productMap) || {};
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    var p = pmap[pid];
    if (p && Array.isArray(p.buckets) && p.buckets.length) return p.buckets[0];
    if (bmap && Array.isArray(bmap[pid]) && bmap[pid].length) return bmap[pid][0];
    return '';
  }
  function flagTruthy(v) {
    if (v === true) return true;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  /** Survey mode: the products a SUBCONTRACTOR may add — Products field_2433
   *  "FLAG_subcontractor can add" = Yes. Source, in order: a Products grid on
   *  the scene (sowAddModal.subCanAddView — one row per product, the flag as
   *  a column), else the catalog entry's `subCanAdd` (SCW.productMap, when
   *  the Builder snippet carries field_2433). null on SOW surfaces (no
   *  restriction); { known:false } when neither source is on this page —
   *  callers then FAIL OPEN (every product, every bucket) and the modal says
   *  so, rather than silently offering nothing. */
  function subCanAddIndex(viewKey) {
    var o = modalOpts(viewKey);
    if (o.mode !== 'survey') return null;
    var F = CONFIG.SUB_CAN_ADD_FIELD, set = Object.create(null), known = false, i, a;
    if (o.subCanAddView) {
      var rows = viewModels(o.subCanAddView);
      for (i = 0; i < rows.length; i++) {
        a = rows[i] && rows[i].attributes; if (!a || !a.id) continue;
        known = true;
        if (flagTruthy(a[F + '_raw'] != null ? a[F + '_raw'] : a[F])) set[a.id] = true;
      }
    }
    if (!known) {
      var pmap = (window.SCW && SCW.productMap) || {};
      for (var id in pmap) {
        if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
        var p = pmap[id];
        if (!p) continue;
        var v = undefined;   // reset per product — a bare `var v;` keeps the previous product's value
        for (var k = 0; k < CONFIG.SUB_CAN_ADD_KEYS.length && v === undefined; k++) v = p[CONFIG.SUB_CAN_ADD_KEYS[k]];
        if (v === undefined) continue;
        known = true;
        if (flagTruthy(v)) set[id] = true;
      }
    }
    return { known: known, set: set };
  }
  /** The sub-can-add restriction on a candidate list — a no-op where it
   *  doesn't apply or isn't known on this page. */
  function restrictSubCanAdd(list, viewKey) {
    var idx = subCanAddIndex(viewKey);
    if (!idx || !idx.known) return list;
    return list.filter(function (c) { return !!idx.set[c.id]; });
  }
  /** Survey mode: a bucket with a product field is offered only when at
   *  least one sub-can-add product belongs to it — there would be nothing to
   *  add otherwise. Product-less buckets (Other Services) stay. No-op until
   *  both the flag and the catalog's bucket map are on the page. */
  function hideEmptySurveyBuckets(buckets, viewKey) {
    var idx = subCanAddIndex(viewKey);
    if (!idx || !idx.known) return buckets;
    var pmap = (window.SCW && SCW.productMap) || {};
    var bmap = (window.SCW && SCW.productBucketMap) || {};
    if (!Object.keys(pmap).length && !Object.keys(bmap).length) return buckets;   // catalog not loaded: can't tell
    var has = Object.create(null);
    for (var pid in idx.set) {
      if (!Object.prototype.hasOwnProperty.call(idx.set, pid)) continue;
      var bk = productBucketOf(pid); if (bk) has[bk] = true;
    }
    return buckets.filter(function (b) {
      var hasProductField = b.fields.some(function (f) { return f.t === 'product'; });
      return !hasProductField || !!has[b.id];
    });
  }
  /** Product-first list: every product whose bucket this view offers,
   *  labelled "name · bucket" so the item type reads at a glance. A product
   *  the catalog map doesn't know yet (cold load) is left out here; it still
   *  shows once a bucket is chosen (productCandidates fails open). Survey
   *  mode: sub-can-add products only. */
  function productFirstCandidates(buckets, viewKey) {
    var pmap = (window.SCW && SCW.productMap) || {};
    var out = [];
    for (var id in pmap) {
      if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
      var b = bucketForProduct(id, buckets);
      if (!b || !b.fields.some(function (f) { return f.t === 'product'; })) continue;
      out.push({ id: id, name: ((pmap[id] && pmap[id].name) || '(unnamed)') + ' · ' + b.name, bucketId: b.id });
    }
    out = restrictSubCanAdd(out, viewKey);
    out.sort(sortByName);
    return out;
  }
  /** The product's bucket, when this view offers it. */
  function bucketForProduct(pid, buckets) {
    var mine = productBucketOf(pid);
    for (var i = 0; i < buckets.length; i++) if (buckets[i].id === mine) return buckets[i];
    return null;
  }
  // Products: ONE list, filtered to the chosen bucket via SCW.productMap /
  // SCW.productBucketMap (Builder-snippet globals). Falls back to the
  // products already on the worksheet's rows when the catalog is absent.
  function productCandidates(bucketId, viewKey) {
    var pmap = (window.SCW && SCW.productMap) || {};
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    function allowed(pid, p) {
      if (!bucketId) return true;
      var known = false, hit = false;
      if (p && Array.isArray(p.buckets) && p.buckets.length) {
        known = true; if (p.buckets.indexOf(bucketId) !== -1) hit = true;
      }
      if (!hit && bmap && bmap[pid] && bmap[pid].length) {
        known = true; if (bmap[pid].indexOf(bucketId) !== -1) hit = true;
      }
      return known ? hit : true;
    }
    var out = [], id, p;
    for (id in pmap) {
      if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
      p = pmap[id];
      if (p && allowed(id, p)) out.push({ id: id, name: p.name || '(unnamed)' });
    }
    if (!out.length) {
      var seen = Object.create(null);
      var models = viewModels(viewKey);
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        var raw = a && (a.field_1949_raw || a.field_2627_raw);
        if (!Array.isArray(raw)) continue;
        for (var j = 0; j < raw.length; j++) {
          var rv = raw[j];
          if (rv && rv.id && !seen[rv.id]) {
            seen[rv.id] = 1;
            out.push({ id: rv.id, name: rv.identifier != null ? stripHtml(rv.identifier) : rv.id });
          }
        }
      }
    }
    out = restrictSubCanAdd(out, viewKey);   // survey: sub-can-add products only
    out.sort(sortByName);
    return out;
  }
  // MDF/IDF locations from the scene's locations grid (viewCfg.mdfSourceViewKey
  // — view_3577 on build-SOW, view_3602 on the sales page).
  function mdfCandidates(viewKey) {
    var o = modalOpts(viewKey);
    var mv = o.mdfView, lf = o.mdfLabelField;
    var out = [];
    var models = viewModels(mv);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes; if (!a || !a.id) continue;
      var label = stripHtml(a[lf + '_raw'] != null ? a[lf + '_raw'] : a[lf]);
      out.push({ id: a.id, name: label || a.id });
    }
    out.sort(sortByName);
    return out;
  }
  /** Per-view modal options (worksheet-v2/config.js `sowAddModal`):
   *    page:      'sow'     — the page's record IS a SOW (sales SOW page): it is
   *                           the implicit target, others may be offered;
   *               'project' — the page's record is the PROJECT (ops build-SOW,
   *                           whose route repeats the project id): the user
   *                           picks the SOW(s), like the DTO's "Which SOWs?"
   *    sowViews:  SOW grids on the scene listing the project's SOWs (default
   *               view_3325 build-SOW / view_3918 bid review — field_2122 =
   *               SW-#### id, field_2126 = name, same as the bulk editor)
   *    sowPicker: false hides the SOW row (sales adds to the page's SOW only)
   *    buckets:   the buckets offered, in order (names or ids)
   *    mode:      'survey' — the survey DTO form's suite (SURVEY_BUCKETS), the
   *               page's SURVEY REQUEST as the target, a bid(s) row instead of
   *               the SOW row, the survey webhook (see header)
   *    bidViews:  survey mode — the BIDs grid(s) the bid row reads
   *               (default view_3507: bid number field_2414, name field_2636)
   *    requireWebhook: the toolbar shows the modal only once the webhook URL
   *               is configured (the native add link stays until then)
   *    subCanAddView: survey mode — a Products grid on the scene carrying
   *               field_2433 (one row per product); preferred flag source
   *    webhookKey: SCW.CONFIG key override (defaults per mode) */
  function modalOpts(viewKey) {
    var vc = viewCfg(viewKey);
    var o = (vc && vc.sowAddModal && typeof vc.sowAddModal === 'object') ? vc.sowAddModal : (CONFIG.HOSTS[viewKey] || {});
    var mode = o.mode === 'survey' ? 'survey' : 'sow';
    var preview = [];
    if (Array.isArray(o.previewEmails)) {
      for (var p = 0; p < o.previewEmails.length; p++) preview.push(String(o.previewEmails[p]).trim().toLowerCase());
    }
    return {
      mode:          mode,
      // preview rollout: only these users get the modal (as a SECOND button
      // beside the untouched native one); empty = the modal is the button
      previewEmails: preview,
      bidViews:      Array.isArray(o.bidViews) && o.bidViews.length ? o.bidViews : ['view_3507'],
      requireWebhook: !!o.requireWebhook,
      subCanAddView: o.subCanAddView || '',
      webhookKey:    o.webhookKey || (mode === 'survey' ? CONFIG.SURVEY_WEBHOOK_KEY : CONFIG.WEBHOOK_KEY),
      page:          o.page === 'project' ? 'project' : 'sow',
      sowViews:      Array.isArray(o.sowViews) && o.sowViews.length ? o.sowViews : ['view_3325', 'view_3918'],
      sowPicker:     o.sowPicker !== false,
      mdfView:       o.mdfView || (vc && vc.mdfSourceViewKey) || '',
      mdfLabelField: o.mdfLabelField || (vc && vc.mdfLabelField) || 'field_1642'
    };
  }
  /** The project record: on a project page the page record itself, else the
   *  …/project-dashboard/<id>/… segment when the route carries it. */
  function projectIdFor(viewKey) {
    return modalOpts(viewKey).page === 'project' ? currentSowId() : currentProjectId();
  }
  // SOWs the user can add to.
  //   project page: every SOW on the project from the scene's SOW grid
  //                 (falls back to the SOWs the worksheet's rows connect to);
  //   SOW page:     the page's SOW first, then any other SOW the rows connect to.
  function sowCandidates(viewKey) {
    var opts = modalOpts(viewKey);
    var seen = Object.create(null), out = [];
    if (opts.page === 'project') {
      for (var v = 0; v < opts.sowViews.length && !out.length; v++) {
        var grid = viewModels(opts.sowViews[v]);
        for (var g = 0; g < grid.length; g++) {
          var ga = grid[g] && grid[g].attributes; if (!ga || !ga.id || seen[ga.id]) continue;
          var sowNo = stripHtml(ga.field_2122_raw != null ? ga.field_2122_raw : ga.field_2122);
          var sowNm = stripHtml(ga.field_2126_raw != null ? ga.field_2126_raw : ga.field_2126);
          if (!sowNo && !sowNm) continue;
          seen[ga.id] = 1;
          out.push({ id: ga.id, name: sowNo && sowNm ? sowNo + ' · ' + sowNm : (sowNo || sowNm), identifier: sowNo || sowNm });
        }
      }
    }
    var cur = opts.page === 'sow' ? currentSowId() : '';
    var fromRows = [], curName = '';
    var models = viewModels(viewKey);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes;
      var raw = a && a[CONFIG.SOW_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        var s = raw[j]; if (!s || !s.id || seen[s.id]) continue;
        seen[s.id] = 1;
        var nm = s.identifier != null ? stripHtml(s.identifier) : s.id;
        if (s.id === cur) curName = nm; else fromRows.push({ id: s.id, name: nm, identifier: nm });
      }
    }
    if (!out.length) { fromRows.sort(sortByName); out = fromRows; }
    else out.sort(sortByName);
    if (cur) out.unshift({ id: cur, name: (curName || 'This SOW') + ' (this page)', identifier: curName || 'This SOW' });
    return out;
  }
  function sortByName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
  }
  /** Every record a view on the scene has loaded — details views
   *  (model.attributes) and grids (model.data.models[*].attributes).
   *  fn(attrs, viewKey) returning truthy stops the scan with that value. */
  function scanLoadedRecords(fn) {
    var views = (window.Knack && Knack.views) || {};
    for (var k in views) {
      if (!Object.prototype.hasOwnProperty.call(views, k)) continue;
      var m = views[k] && views[k].model, r;
      if (!m) continue;
      if (m.attributes && m.attributes.id) { r = fn(m.attributes, k); if (r) return r; }
      var rows = (m.data && m.data.models) || [];
      for (var i = 0; i < rows.length; i++) {
        var a = rows[i] && rows[i].attributes;
        if (a) { r = fn(a, k); if (r) return r; }
      }
    }
    return null;
  }
  /** Display identifier of a record id from any loaded connection pointing at
   *  it (the survey request through the rows' field_2360, the MDFs' field_2435,
   *  a details view of the record itself …); '' when nothing on the scene
   *  names it. */
  function identifierOf(recordId) {
    if (!recordId) return '';
    return scanLoadedRecords(function (a) {
      if (a.id === recordId && a.identifier != null) return stripHtml(a.identifier) || null;
      for (var key in a) {
        if (!Object.prototype.hasOwnProperty.call(a, key) || !/_raw$/.test(key)) continue;
        var raw = a[key];
        if (!Array.isArray(raw)) continue;
        for (var i = 0; i < raw.length; i++) {
          if (raw[i] && raw[i].id === recordId && raw[i].identifier != null) return stripHtml(raw[i].identifier) || null;
        }
      }
      return null;
    }) || '';
  }
  /** Survey mode: the request's project (object_113 field_2346) when a view on
   *  the scene loads the request; '' otherwise — the 05.01 twin then keeps the
   *  request's own project. */
  function surveyProjectId() {
    return scanLoadedRecords(function (a) {
      var raw = a[CONFIG.SURVEY_PROJECT_FIELD + '_raw'];
      return (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) ? raw[0].id : null;
    }) || '';
  }
  // Survey mode: the bids the item can sit on — every bid on the BIDs grid(s),
  // labelled like the worksheet's pickers (the in-use connection identifier
  // from the rows' field_2415, else the grid's bid number field_2414, with the
  // friendly name field_2636 appended). Falls back to the bids the rows
  // connect to when the grid isn't loaded.
  function bidCandidates(viewKey) {
    var opts = modalOpts(viewKey);
    var inUse = Object.create(null), seen = Object.create(null), out = [];
    var rows = viewModels(viewKey), i, j;
    for (i = 0; i < rows.length; i++) {
      var a = rows[i] && rows[i].attributes;
      var raw = a && a[CONFIG.BID_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id && raw[j].identifier != null) inUse[raw[j].id] = stripHtml(raw[j].identifier);
      }
    }
    for (var v = 0; v < opts.bidViews.length && !out.length; v++) {
      var grid = viewModels(opts.bidViews[v]);
      for (i = 0; i < grid.length; i++) {
        var g = grid[i] && grid[i].attributes; if (!g || !g.id || seen[g.id]) continue;
        var lblRaw = g[CONFIG.BID_LABEL_FIELD + '_raw'];
        var base = inUse[g.id] || stripHtml(lblRaw != null ? lblRaw : g[CONFIG.BID_LABEL_FIELD]) ||
          stripHtml(g.identifier) || g.id;
        var fn = stripHtml(g[CONFIG.BID_NAME_FIELD]);
        seen[g.id] = 1;
        out.push({ id: g.id, name: (fn && base.indexOf(fn) === -1) ? (base + ' — ' + fn) : base, identifier: base });
      }
    }
    if (!out.length) {
      for (var id in inUse) if (Object.prototype.hasOwnProperty.call(inUse, id)) out.push({ id: id, name: inUse[id], identifier: inUse[id] });
    }
    out.sort(sortByName);
    return out;
  }
  // Accessories: OPTIONAL accessories only — Make auto-adds a product's
  // default accessories. SCW.mountingBoxProducts filtered to products whose
  // compatibleProducts (field_2236) OR compatibleProductsAlt (field_2205)
  // list the chosen product (same rule as the CO modal + bulk editor).
  function accessoryCandidates(productIds) {
    var raw = (window.SCW && SCW.mountingBoxProducts) || [];
    if (!raw.length || !productIds.length) return [];
    var out = raw.filter(function (p) {
      if (!p) return false;
      var a = (Array.isArray(p.compatibleProducts)    && p.compatibleProducts.length)    ? p.compatibleProducts    : null;
      var b = (Array.isArray(p.compatibleProductsAlt) && p.compatibleProductsAlt.length) ? p.compatibleProductsAlt : null;
      if (!a && !b) return false;
      for (var i = 0; i < productIds.length; i++) {
        var hit = (a && a.indexOf(productIds[i]) !== -1) || (b && b.indexOf(productIds[i]) !== -1);
        if (!hit) return false;
      }
      return true;
    }).map(function (p) { return { id: p.id, name: p.name || p.id }; });
    out.sort(sortByName);
    return out;
  }

  // ── CSS ────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-sowadd__overlay{position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.5);',
      'display:flex;align-items:center;justify-content:center;padding:20px;}',
      '.scw-sowadd{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);',
      'width:560px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;',
      'font:13px/1.45 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-sowadd.is-busy{opacity:.65;pointer-events:none;}',
      '.scw-sowadd__head{display:flex;align-items:center;gap:8px;padding:16px 20px 12px;border-bottom:1px solid #e2e8f0;}',
      '.scw-sowadd__title{font:700 15px/1.3 system-ui,sans-serif;color:#0f4c75;flex:1 1 auto;}',
      '.scw-sowadd__beta{font:700 10px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;',
      'color:#b45309;background:#fef3c7;border:1px solid #fcd34d;border-radius:999px;padding:4px 8px;}',
      '.scw-sowadd__x{border:none;background:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;padding:0 4px;}',
      '.scw-sowadd__x:hover{color:#475569;}',
      '.scw-sowadd__body{padding:16px 20px;overflow-y:auto;}',
      '.scw-sowadd__row{margin-bottom:14px;}',
      '.scw-sowadd__lbl{display:block;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;',
      'text-transform:uppercase;color:#64748b;margin-bottom:6px;}',
      '.scw-sowadd__help{font:400 11.5px/1.4 system-ui,sans-serif;color:#94a3b8;margin:5px 0 0;}',
      '.scw-sowadd__note{font:600 11.5px/1.4 system-ui,-apple-system,sans-serif;color:#b45309;background:#fef3c7;',
      'border:1px solid #fcd34d;border-radius:6px;padding:6px 9px;margin:8px 0 0;}',
      '.scw-sowadd__chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.scw-sowadd__chip{padding:7px 13px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;',
      'font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-sowadd__chip:hover{background:#f1f5f9;}',
      '.scw-sowadd__chip.is-on{background:#0f4c75;border-color:#0a3a63;color:#fff;}',
      '.scw-sowadd__chip-x{margin-left:7px;opacity:.75;font-weight:700;}',
      '.scw-sowadd__chip.is-on:hover .scw-sowadd__chip-x{opacity:1;}',
      '.scw-sowadd__in{width:100%;padding:9px 11px;border:1px solid #cbd5e1;border-radius:7px;',
      'font:13px/1.4 system-ui,sans-serif;color:#1e293b;box-sizing:border-box;background:#fff;}',
      '.scw-sowadd__in:focus{outline:none;border-color:#60a5fa;}',
      'textarea.scw-sowadd__in{min-height:64px;resize:vertical;}',
      'select.scw-sowadd__in{appearance:auto;}',
      // inline combobox
      '.scw-sowadd__combo{position:relative;}',
      '.scw-sowadd__tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}',
      '.scw-sowadd__tags:empty{display:none;}',
      '.scw-sowadd__tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
      'background:#eef2f7;color:#0f4c75;font:600 12px/1 system-ui,sans-serif;}',
      '.scw-sowadd__tag button{border:none;background:none;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0;}',
      '.scw-sowadd__menu{margin-top:5px;border:1px solid #cbd5e1;border-radius:7px;max-height:220px;',
      'overflow-y:auto;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.12);}',
      '.scw-sowadd__menu[hidden]{display:none;}',
      '.scw-sowadd__opt{padding:8px 11px;font:13px/1.35 system-ui,sans-serif;color:#1e293b;cursor:pointer;}',
      '.scw-sowadd__opt:hover{background:#eef2f7;}',
      '.scw-sowadd__opt.is-sel{background:#0f4c75;color:#fff;}',
      '.scw-sowadd__opt.scw-sowadd__hide{display:none;}',
      '.scw-sowadd__menu-empty{padding:10px 11px;font:12px/1.4 system-ui,sans-serif;color:#94a3b8;}',
      // checkbox / radio group (MDF/IDF, SOWs)
      '.scw-sowadd__checks{display:flex;flex-direction:column;gap:7px;border:1px solid #e2e8f0;',
      'border-radius:7px;padding:9px 11px;max-height:200px;overflow-y:auto;}',
      '.scw-sowadd__check{display:flex;align-items:center;gap:8px;font:13px/1.3 system-ui,sans-serif;',
      'color:#1e293b;cursor:pointer;}',
      '.scw-sowadd__check input{cursor:pointer;}',
      '.scw-sowadd__toggles{display:flex;flex-wrap:wrap;gap:16px;}',
      '.scw-sowadd__tog{display:inline-flex;align-items:center;gap:7px;font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-sowadd__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e2e8f0;}',
      '.scw-sowadd__btn{padding:9px 18px;border-radius:7px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}',
      '.scw-sowadd__btn--sec{background:#fff;border:1px solid #cbd5e1;color:#475569;}',
      '.scw-sowadd__btn--sec:hover{background:#f1f5f9;}',
      '.scw-sowadd__btn--pri{background:#0f4c75;border:1px solid #0a3a63;color:#fff;}',
      '.scw-sowadd__btn--pri:hover{background:#0a3a63;}',
      '.scw-sowadd__err{color:#b91c1c;font:600 12px/1.3 system-ui,sans-serif;margin-right:auto;align-self:center;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── inline combobox ────────────────────────────────────────────────
  // Search input + filterable option list INSIDE `host` (no overlay, so it
  // never renders behind the modal). Single-select shows the label in the
  // input; multi shows removable tags.
  function makeCombo(host, cfg) {
    var multi = !!cfg.multi;
    var selected = [];
    var labels = {};
    (cfg.candidates || []).forEach(function (c) { labels[c.id] = c.name; });
    (cfg.selected || []).forEach(function (id) { if (labels[id] && selected.indexOf(id) === -1) selected.push(id); });
    if (!multi && selected.length > 1) selected = selected.slice(0, 1);

    host.classList.add('scw-sowadd__combo');
    var tags  = document.createElement('div'); tags.className = 'scw-sowadd__tags';
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'scw-sowadd__in scw-sowadd__combo-in';
    input.placeholder = cfg.placeholder || 'Search…';
    input.autocomplete = 'off';
    var menu  = document.createElement('div'); menu.className = 'scw-sowadd__menu'; menu.hidden = true;
    if (!(cfg.candidates || []).length) {
      menu.innerHTML = '<div class="scw-sowadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
    } else {
      var frag = '';
      for (var i = 0; i < cfg.candidates.length; i++) {
        frag += '<div class="scw-sowadd__opt" data-id="' + esc(cfg.candidates[i].id) + '">' +
          esc(cfg.candidates[i].name) + '</div>';
      }
      menu.innerHTML = frag;
    }
    host.appendChild(tags); host.appendChild(input); host.appendChild(menu);

    function fire() { if (typeof cfg.onChange === 'function') cfg.onChange(selected.slice(), labels); }
    // Initial selection (product carried over from the product-first pick).
    setTimeout(function () { renderTags(); markSel(); if (!multi && selected.length) input.value = labels[selected[0]] || ''; }, 0);
    function renderTags() {
      if (!multi) { tags.innerHTML = ''; return; }
      var h = '';
      for (var i = 0; i < selected.length; i++) {
        h += '<span class="scw-sowadd__tag">' + esc(labels[selected[i]] || selected[i]) +
          '<button type="button" data-rm="' + esc(selected[i]) + '">&times;</button></span>';
      }
      tags.innerHTML = h;
    }
    function markSel() {
      var opts = menu.querySelectorAll('.scw-sowadd__opt');
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('is-sel', selected.indexOf(opts[i].getAttribute('data-id')) !== -1);
      }
    }
    function filter(q) {
      q = (q || '').toLowerCase();
      var opts = menu.querySelectorAll('.scw-sowadd__opt');
      for (var i = 0; i < opts.length; i++) {
        var hit = !q || opts[i].textContent.toLowerCase().indexOf(q) !== -1;
        opts[i].classList.toggle('scw-sowadd__hide', !hit);
      }
    }
    // Open = show the FULL list (single-select: with the current pick
    // highlighted and the field's text selected so typing replaces it).
    function openMenu() {
      menu.hidden = false;
      if (!multi) { input.select(); filter(''); }
    }
    input.addEventListener('focus', openMenu);
    // After a single-select pick the list closes but focus stays in the
    // field — a click (or ArrowDown / Enter) on the focused field re-opens
    // it instead of forcing a blur-and-refocus. Deferred so the browser's
    // own mousedown handling (caret placement) runs first.
    input.addEventListener('mousedown', function () { if (menu.hidden) setTimeout(openMenu, 0); });
    input.addEventListener('keydown', function (e) {
      if (menu.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openMenu(); }
    });
    input.addEventListener('input', function () { menu.hidden = false; filter(input.value); });
    input.addEventListener('blur', function () {
      setTimeout(function () { menu.hidden = true; }, 120);
    });
    menu.addEventListener('mousedown', function (e) {
      var opt = e.target.closest && e.target.closest('.scw-sowadd__opt');
      if (!opt) return;
      e.preventDefault();
      var id = opt.getAttribute('data-id');
      if (multi) {
        var idx = selected.indexOf(id);
        if (idx === -1) selected.push(id); else selected.splice(idx, 1);
        renderTags(); markSel(); input.value = ''; filter(''); fire();
      } else {
        selected = [id]; input.value = labels[id] || id; markSel(); menu.hidden = true; fire();
      }
    });
    tags.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-rm]');
      if (!b) return;
      var id = b.getAttribute('data-rm'), idx = selected.indexOf(id);
      if (idx !== -1) { selected.splice(idx, 1); renderTags(); markSel(); fire(); }
    });
    host._closeMenu = function (target) { if (!host.contains(target)) menu.hidden = true; };
    return { ids: function () { return selected.slice(); } };
  }

  // ── inline checkbox / radio group (short lists — MDF/IDF, SOWs) ────
  var _cgSeq = 0;
  function makeCheckGroup(host, cfg) {
    var multi = !!cfg.multi;
    var cands = cfg.candidates || [];
    var checked0 = cfg.checked || [];
    host.className = 'scw-sowadd__checks';
    if (!cands.length) {
      host.innerHTML = '<div class="scw-sowadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
      if (typeof cfg.onChange === 'function') cfg.onChange([]);
      return;
    }
    var name = 'scw-sowadd-cg-' + (++_cgSeq);
    var type = multi ? 'checkbox' : 'radio';
    var h = '';
    for (var i = 0; i < cands.length; i++) {
      h += '<label class="scw-sowadd__check"><input type="' + type + '" name="' + name +
        '" value="' + esc(cands[i].id) + '"' + (checked0.indexOf(cands[i].id) !== -1 ? ' checked' : '') + '> ' +
        esc(cands[i].name) + '</label>';
    }
    host.innerHTML = h;
    function read() {
      var checked = host.querySelectorAll('input:checked');
      var ids = [];
      for (var k = 0; k < checked.length; k++) ids.push(checked[k].value);
      return ids;
    }
    host.addEventListener('change', function () {
      if (typeof cfg.onChange === 'function') cfg.onChange(read());
    });
    if (checked0.length && typeof cfg.onChange === 'function') cfg.onChange(read());
  }

  // ── the modal ──────────────────────────────────────────────────────
  function open(callerOpts) {
    // callerOpts = { viewKey, onClose, onAdded } (kept apart from the view's
    // modalOpts — an earlier `opts` reuse silently dropped bid-review-v2's
    // onAdded refresh).
    callerOpts = callerOpts || {};
    var viewKey = callerOpts.viewKey || 'view_3962';
    if (!isAllowed(viewKey)) { log('open refused — gate (ALLOWED_EMAILS / webhook) for ' + viewKey); return; }
    injectCss();

    var opts       = modalOpts(viewKey);
    var survey     = opts.mode === 'survey';
    var bucketList = allBuckets(viewKey);
    var buckets    = bucketsFor(viewKey);
    function pickBucket(id) { return bucketById(id, bucketList); }
    // SOW picker: ops (project page) picks the SOW(s) — pre-checked only when
    // the project has exactly one; a SOW page targets its own SOW and may
    // offer the others (sowPicker:false — sales — hides the choice). Survey
    // mode has no SOW row at all: the survey DTO form carries no SOW field.
    var sowCands = survey ? [] : sowCandidates(viewKey);
    if (!opts.sowPicker) sowCands = sowCands.slice(0, 1);
    var showSowRow = !survey && opts.sowPicker && (opts.page === 'project' ? sowCands.length > 0 : sowCands.length > 1);
    var preChecked = survey ? [] : (opts.page === 'project' ? (sowCands.length === 1 ? [sowCands[0].id] : []) : (sowCands.length ? [sowCands[0].id] : []));
    // Survey mode: the page's survey request is the target; the bid(s) are the
    // user's choice, the worksheet's active bid filter pills pre-checked.
    var requestId = survey ? currentSowId() : '';
    var bidCands  = survey ? bidCandidates(viewKey) : [];
    var activeBids = [];
    if (survey && wv2.sowFilter && typeof wv2.sowFilter.loadActive === 'function') {
      try { activeBids = wv2.sowFilter.loadActive(viewKey) || []; } catch (e) { activeBids = []; }
    }
    var preBids = [];
    bidCands.forEach(function (c) { if (activeBids.indexOf(c.id) !== -1) preBids.push(c.id); });
    // Survey mode without a sub-can-add source on the page: fail OPEN and say so.
    var subCanAddIdx = survey ? subCanAddIndex(viewKey) : null;
    var subCanAddNotice = !!(survey && !(subCanAddIdx && subCanAddIdx.known));
    if (subCanAddNotice) {
      try {
        console.warn('[scw-sow-add] survey: products are not filtered to "subcontractor can add" (' + CONFIG.SUB_CAN_ADD_FIELD +
          ') — no Products grid (sowAddModal.subCanAddView) and no subCanAdd on SCW.productMap. Showing every product.');
      } catch (e) { /* ignore */ }
    }
    var mdfCands = mdfCandidates(viewKey);
    var sowLabels = {}, mdfLabels = {}, bidLabels = {};
    sowCands.forEach(function (c) { sowLabels[c.id] = c.identifier || c.name; });
    mdfCands.forEach(function (c) { mdfLabels[c.id] = c.name; });
    bidCands.forEach(function (c) { bidLabels[c.id] = c.identifier || c.name; });
    var st = { bucketId: '', sowIds: preChecked, bidIds: preBids, productIds: [], mdfIds: [], accessoryIds: [],
               productLabels: {}, accessoryLabels: {} };

    var overlay = document.createElement('div');
    overlay.className = 'scw-sowadd__overlay';
    overlay.innerHTML =
      '<div class="scw-sowadd" role="dialog" aria-modal="true">' +
        '<div class="scw-sowadd__head">' +
          '<span class="scw-sowadd__title">' + (survey ? 'Add Survey / Bid Item' : 'Add to Scope of Work') + '</span>' +
          (isPreview(viewKey) ? '<span class="scw-sowadd__beta" title="Preview — only the listed users see this modal; everyone else keeps the Knack form">Preview</span>' : '') +
          '<button type="button" class="scw-sowadd__x" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-sowadd__body"></div>' +
        '<div class="scw-sowadd__foot">' +
          '<span class="scw-sowadd__err" hidden></span>' +
          '<button type="button" class="scw-sowadd__btn scw-sowadd__btn--sec" data-act="cancel">Cancel</button>' +
          '<button type="button" class="scw-sowadd__btn scw-sowadd__btn--pri" data-act="submit">' +
            (survey ? 'Add to survey' : 'Add to SOW') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var modal = overlay.querySelector('.scw-sowadd');
    var body  = modal.querySelector('.scw-sowadd__body');
    var errEl = modal.querySelector('.scw-sowadd__err');
    var combos = {};

    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof callerOpts.onClose === 'function') callerOpts.onClose();
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      var openMenu = body.querySelector('.scw-sowadd__menu:not([hidden])');
      if (openMenu) { e.preventDefault(); e.stopPropagation(); openMenu.hidden = true; return; }
      e.preventDefault(); close();
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    modal.querySelector('.scw-sowadd__x').addEventListener('click', close);
    modal.addEventListener('mousedown', function (e) {
      var hosts = body.querySelectorAll('.scw-sowadd__combo');
      for (var i = 0; i < hosts.length; i++) {
        if (typeof hosts[i]._closeMenu === 'function') hosts[i]._closeMenu(e.target);
      }
    });
    function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }

    function labelRow(label, helper) {
      var row = document.createElement('div'); row.className = 'scw-sowadd__row';
      row.innerHTML = '<span class="scw-sowadd__lbl">' + esc(label) + '</span>';
      if (helper) row.insertAdjacentHTML('beforeend', '<p class="scw-sowadd__help">' + esc(helper) + '</p>');
      return row;
    }

    function buildField(fd, b, keep) {
      var t = fd.t;
      if (t === 'product') {
        // Single vs multi per bucket (productMulti above) — productIds is an
        // array either way so Make iterates one uniform list.
        var pMulti = !!b.productMulti;
        var row = labelRow(fd.label || (pMulti ? 'Products' : 'Product'), fd.helper);
        var host = document.createElement('div'); row.appendChild(host);
        var cands = productCandidates(st.bucketId, viewKey);
        var keepIds = keep ? keep.filter(function (id) { return cands.some(function (c) { return c.id === id; }); }) : [];
        if (!pMulti) keepIds = keepIds.slice(0, 1);
        combos.product = makeCombo(host, {
          candidates: cands, multi: pMulti, selected: keepIds,
          placeholder: fd.placeholder || 'Search products…',
          emptyText: 'No products available on this page',
          onChange: function (ids, labels) {
            st.productIds = ids; st.productLabels = labels || {};
            if (b.id === B_ASSUMPTIONS) syncAssumptionDesc();
            rebuildAccessoryCombo();
          }
        });
        if (keepIds.length) {
          st.productIds = keepIds.slice(); st.productLabels = {};
          cands.forEach(function (c) { st.productLabels[c.id] = c.name; });
        }
        return row;
      }
      if (t === 'mdf') {
        var req = fd.mode === 'single' || fd.mode === 'multi';
        var lbl = fd.label || ('MDF / IDF' + (req ? '' : ' (optional)'));
        var mrow = labelRow(lbl + (req ? ' *' : ''), fd.helper);
        var mhost = document.createElement('div'); mrow.appendChild(mhost);
        makeCheckGroup(mhost, {
          candidates: mdfCands, multi: fd.mode !== 'single',
          emptyText: 'No MDF/IDF locations on this SOW yet — add one with "+ Add MDF/IDF" first',
          onChange: function (ids) { st.mdfIds = ids; }
        });
        return mrow;
      }
      if (t === 'accessories') {
        var arow = labelRow('Optional accessories',
          'Default accessories are added automatically — pick only extras.');
        var ahost = document.createElement('div'); arow.appendChild(ahost);
        combos.accessoryHost = ahost;
        buildAccessoryCombo();
        return arow;
      }
      if (t === 'qty') {
        var qrow = labelRow(fd.label || 'Quantity');
        qrow.insertAdjacentHTML('beforeend', '<input type="number" min="1" class="scw-sowadd__in" data-f="qty" value="1">');
        return qrow;
      }
      if (t === 'startNumber') {
        var srow = labelRow(fd.label || 'Start label number', fd.helper);
        srow.querySelector('.scw-sowadd__lbl').insertAdjacentHTML('afterend',
          '<input type="number" class="scw-sowadd__in" data-f="startNumber" placeholder="e.g. 12">');
        return srow;
      }
      if (t === 'prefix') {
        var prow = labelRow(fd.label || 'Label prefix');
        var sel = '<option value="">Select…</option>';
        for (var i = 0; i < PREFIX_OPTIONS.length; i++) {
          sel += '<option value="' + esc(PREFIX_OPTIONS[i].id) + '">' + esc(PREFIX_OPTIONS[i].label) + '</option>';
        }
        prow.insertAdjacentHTML('beforeend', '<select class="scw-sowadd__in" data-f="prefix">' + sel + '</select>');
        return prow;
      }
      if (t === 'serviceCost') {
        var crow = labelRow(fd.label || 'Expected sub bid ($)', fd.helper);
        crow.insertAdjacentHTML('beforeend', '<input type="number" step="0.01" class="scw-sowadd__in" data-f="serviceCost">');
        return crow;
      }
      if (t === 'description') {
        var drow = labelRow(fd.label || 'Description');
        drow.insertAdjacentHTML('beforeend', '<textarea class="scw-sowadd__in" data-f="description"></textarea>');
        if (fd.conditional === 'customAssumption') { drow.setAttribute('data-cond', 'customAssumption'); drow.style.display = 'none'; }
        return drow;
      }
      if (t === 'notes') {
        var nrow = labelRow(fd.label || 'Camera / reader notes');
        nrow.insertAdjacentHTML('beforeend', '<textarea class="scw-sowadd__in" data-f="notes"></textarea>');
        return nrow;
      }
      if (t === 'toggles') {
        var trow = labelRow('Cabling');
        var wrap = document.createElement('div'); wrap.className = 'scw-sowadd__toggles';
        for (var k = 0; k < fd.items.length; k++) {
          var key = fd.items[k];
          wrap.insertAdjacentHTML('beforeend',
            '<label class="scw-sowadd__tog"><input type="checkbox" data-f="' + key + '"> ' +
            esc(TOGGLE_LABELS[key] || key) + '</label>');
        }
        trow.appendChild(wrap);
        return trow;
      }
      return null;
    }

    function syncAssumptionDesc() {
      var descRow = body.querySelector('[data-cond="customAssumption"]');
      if (!descRow) return;
      descRow.style.display = st.productIds.indexOf(CUSTOM_ASSUMPTION_ID) !== -1 ? '' : 'none';
    }

    function buildAccessoryCombo() {
      var host = combos.accessoryHost;
      if (!host) return;
      host.innerHTML = '';
      host.className = '';
      st.accessoryIds = [];
      if (st.productIds.length > 1) {
        host.innerHTML = '<div class="scw-sowadd__menu-empty">Multiple products selected — ' +
          'add optional accessories per item on the worksheet after creating. ' +
          '(Default accessories attach automatically.)</div>';
        return;
      }
      combos.accessory = makeCombo(host, {
        candidates: accessoryCandidates(st.productIds), multi: true,
        placeholder: 'Search optional accessories…',
        emptyText: st.productIds.length
          ? 'No optional accessories for this product'
          : 'Pick a product first',
        onChange: function (ids, labels) { st.accessoryIds = ids; st.accessoryLabels = labels || {}; }
      });
    }
    function rebuildAccessoryCombo() { if (combos.accessoryHost) buildAccessoryCombo(); }

    // Full render — on open, on bucket change, and after a product-first
    // pick. The SOW choice persists; field rows and combos are re-created.
    // `keep` = product ids to carry into the bucket's own product field.
    function render(keep) {
      combos = {};
      st.productIds = []; st.productLabels = {}; st.mdfIds = []; st.accessoryIds = [];
      body.innerHTML = '';

      var chipRow = document.createElement('div'); chipRow.className = 'scw-sowadd__row';
      var chipHtml = '<span class="scw-sowadd__lbl">' +
        (survey ? 'What type of item are you adding to the survey?' : 'What type of item are you adding to your Scope of Work?') +
        '</span>' +
        '<div class="scw-sowadd__chips">';
      for (var i = 0; i < buckets.length; i++) {
        var on = buckets[i].id === st.bucketId;
        chipHtml += '<button type="button" class="scw-sowadd__chip' + (on ? ' is-on' : '') +
          '" data-bucket="' + buckets[i].id + '"' +
          (on ? ' title="Clear the item type and search every product again"' : '') + '>' +
          esc(buckets[i].name) + (on ? '<span class="scw-sowadd__chip-x" aria-hidden="true">&times;</span>' : '') +
          '</button>';
      }
      chipRow.innerHTML = chipHtml + '</div>';
      if (subCanAddNotice) {
        chipRow.insertAdjacentHTML('beforeend', '<p class="scw-sowadd__note">Products aren’t filtered to “subcontractor can add” on this page ' +
          '(no flag source loaded) — showing every product.</p>');
      }
      body.appendChild(chipRow);
      chipRow.querySelector('.scw-sowadd__chips').addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-bucket]');
        if (!chip) return;
        var nextId = chip.getAttribute('data-bucket');
        showErr('');
        // Clicking the ACTIVE chip clears the item type (and with it the
        // product) — back to the search-everything list, no cycling through
        // the other types to get there.
        if (nextId === st.bucketId) { st.bucketId = ''; render(); return; }
        // A product already picked stays only if it IS this bucket's (one
        // bucket per product) — switching type clears a mismatched pick.
        var carry = st.productIds.filter(function (pid) { return productBucketOf(pid) === nextId; });
        st.bucketId = nextId;
        render(carry);
      });

      // "Which SOWs are you adding to?" — project pages always (the SOW is the
      // user's choice there); SOW pages only when there is another SOW to offer.
      if (showSowRow) {
        var srow = labelRow('Which SOW(s) are you adding to? *');
        var shost = document.createElement('div'); srow.appendChild(shost);
        makeCheckGroup(shost, {
          candidates: sowCands, multi: true, checked: st.sowIds,
          onChange: function (ids) { st.sowIds = ids; }
        });
        body.appendChild(srow);
      }
      // Survey mode: "Which bid(s) is this item on?" — every bid on the BIDs
      // grid, the worksheet's active bid filter pre-checked. Optional: an item
      // can be surveyed before it sits on a bid (the form's field_2427 is
      // not required).
      if (survey && bidCands.length) {
        var brow = labelRow('Which bid(s) is this item on?',
          'Optional — leave every bid unchecked to add the item to the survey only.');
        var bhost = document.createElement('div'); brow.appendChild(bhost);
        makeCheckGroup(bhost, {
          candidates: bidCands, multi: true, checked: st.bidIds,
          onChange: function (ids) { st.bidIds = ids; }
        });
        body.appendChild(brow);
      }

      var b = pickBucket(st.bucketId);
      if (!b || buckets.indexOf(b) === -1) {
        // Product FIRST: no item type yet — offer every product the offered
        // buckets contain; picking one selects its bucket and opens that
        // bucket's form with the product filled in.
        var prow = labelRow('Product', 'Pick a product and its item type is set for you — or choose the type above and the list narrows.');
        var phost = document.createElement('div'); prow.appendChild(phost);
        var firstCands = productFirstCandidates(buckets, viewKey);
        makeCombo(phost, {
          candidates: firstCands, multi: false,
          placeholder: 'Search all products…',
          emptyText: 'No products available on this page — choose an item type above',
          onChange: function (ids) {
            if (!ids.length) return;
            var pick = null;
            for (var c = 0; c < firstCands.length; c++) if (firstCands[c].id === ids[0]) pick = firstCands[c];
            if (!pick) return;
            st.bucketId = pick.bucketId;
            showErr(''); render([pick.id]);
          }
        });
        body.appendChild(prow);
        return;
      }
      for (var f = 0; f < b.fields.length; f++) {
        var el = buildField(b.fields[f], b, keep);
        if (el) body.appendChild(el);
      }
      if (b.id === B_ASSUMPTIONS) syncAssumptionDesc();
    }

    function readField(f) {
      var el = body.querySelector('[data-f="' + f + '"]');
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked;
      return el.value;
    }

    function submit() {
      var b = pickBucket(st.bucketId);
      if (!b) { showErr('Pick an item type.'); return; }
      if (survey) {
        if (!requestId) { showErr('Could not resolve this survey request from the URL.'); return; }
      } else if (!st.sowIds.length) {
        showErr(sowCands.length ? 'Pick at least one SOW.' :
          (opts.page === 'project' ? 'No Scope of Work found on this project — create the SOW first.' : 'Could not resolve this SOW from the URL.'));
        return;
      }
      if (!st.productIds.length && !b.productOptional) {
        showErr(b.id === B_ASSUMPTIONS ? 'Pick at least one assumption.' : 'Pick a product.'); return;
      }
      if (b.productOptional && !String(readField('description') || '').trim()) {
        showErr('Enter a description — it defines this line item.'); return;
      }
      if (b.id === B_ASSUMPTIONS && st.productIds.indexOf(CUSTOM_ASSUMPTION_ID) !== -1 &&
          !String(readField('description') || '').trim()) {
        showErr('Detail the custom assumption.'); return;
      }
      var mdfField = null;
      for (var i = 0; i < b.fields.length; i++) if (b.fields[i].t === 'mdf') mdfField = b.fields[i];
      if (mdfField && (mdfField.mode === 'single' || mdfField.mode === 'multi') && !st.mdfIds.length) {
        showErr('Pick at least one MDF / IDF.'); return;
      }
      var url = webhookUrl(viewKey);
      if (!url) {
        showErr('Add-item webhook is not configured yet (SCW.CONFIG.' + opts.webhookKey + ').'); return;
      }

      var prefixId = readField('prefix') || '';
      var org = CONFIG.ORIGINS[viewKey] || {};
      var payload = {
        sowId:           survey ? '' : st.sowIds[0],
        sowIds:          survey ? [] : st.sowIds.slice(),
        projectId:       survey ? surveyProjectId() : projectIdFor(viewKey),
        bucketId:        b.id,
        bucketName:      b.name,
        productIds:      st.productIds.slice(),
        accessoryIds:    st.accessoryIds.slice(),
        mdfIds:          st.mdfIds.slice(),
        qty:             readField('qty') || '',
        prefixId:        prefixId,
        prefix:          prefixLabelFor(prefixId),
        startNumber:     readField('startNumber') || '',
        existingCabling: !!readField('existingCabling'),
        exterior:        !!readField('exterior'),
        plenum:          !!readField('plenum'),
        serviceCost:     readField('serviceCost') || '',
        description:     readField('description') || '',
        notes:           readField('notes') || '',
        triggeredBy:     triggeredBy(),
        origin:          org.origin || 'ops',
        originPage:      org.originPage || viewKey,
        originView:      viewKey,
        originScene:     (typeof Knack !== 'undefined' && Knack.router &&
                          Knack.router.current_scene_key) || ''
      };
      if (survey) {
        payload.surveyRequestId = requestId;
        payload.surveyRequest   = identifierOf(requestId);   // "60524852230-SR1145"; '' when no loaded view names it
        payload.bidIds          = st.bidIds.slice();
        payload.laborBid        = payload.serviceCost;        // field_2233 — the sub's labor price per item
        payload.surveyNotes     = payload.notes;              // field_2432
      }
      // DTO-shaped mirror (see DTO_PRODUCT_FIELD above). Keys the bucket
      // doesn't use are sent as EMPTY arrays so the scenario's merges and
      // `[].id` reads behave exactly as they did on a DTO record.
      var dto = {};
      for (var d = 0; d < DTO_ARRAY_KEYS.length; d++) dto[DTO_ARRAY_KEYS[d] + '_raw'] = [];
      dto.field_2223_raw = [{ id: b.id, identifier: b.name }];
      dto.field_2182_raw = conn(st.sowIds, sowLabels);   // [] in survey mode — the survey form has no SOW field
      if (survey) {
        var reqLabel = payload.surveyRequest || requestId;
        dto.field_2426_raw = [{ id: requestId, identifier: reqLabel }];
        dto.field_2426     = reqLabel;   // 05.01's "is connected to a Survey" gate reads the formatted value
        dto.field_2427_raw = conn(st.bidIds, bidLabels);
      }
      if (mdfField) dto[DTO_MDF_FIELD[mdfField.mode] + '_raw'] = conn(st.mdfIds, mdfLabels);
      if (DTO_PRODUCT_FIELD[b.id]) dto[DTO_PRODUCT_FIELD[b.id] + '_raw'] = conn(st.productIds, st.productLabels);
      dto.field_2206_raw = conn(st.accessoryIds, st.accessoryLabels);
      if (prefixId) dto.field_2241_raw = [{ id: prefixId, identifier: prefixLabelFor(prefixId) }];
      dto.field_2185_raw = payload.prefix;                  dto.field_2185 = payload.prefix;   // legacy text twin of the pre-fix
      if (UNIFIED_PRODUCT_BUCKETS.indexOf(b.id) !== -1) dto.field_2246_raw = conn(st.productIds, st.productLabels);
      if (payload.projectId) dto.field_2181_raw = [{ id: payload.projectId, identifier: '' }];
      dto.field_2183_raw = numOrNull(payload.qty);          dto.field_2183 = String(payload.qty);
      dto.field_2184_raw = numOrNull(payload.startNumber);  dto.field_2184 = String(payload.startNumber);
      dto.field_2233_raw = numOrNull(payload.serviceCost);  dto.field_2233 = String(payload.serviceCost);
      dto.field_2462_raw = payload.existingCabling;         dto.field_2462 = yesNo(payload.existingCabling);
      dto.field_2739_raw = payload.exterior;                dto.field_2739 = yesNo(payload.exterior);
      dto.field_2740_raw = payload.plenum;                  dto.field_2740 = yesNo(payload.plenum);
      dto.field_2210_raw = payload.description;             dto.field_2210 = payload.description;
      if (survey) { dto.field_2432_raw = payload.notes;     dto.field_2432 = payload.notes; }   // survey notes
      else        { dto.field_2466_raw = payload.notes;     dto.field_2466 = payload.notes; }   // camera / reader notes
      for (var dk in dto) if (Object.prototype.hasOwnProperty.call(dto, dk)) payload[dk] = dto[dk];
      log('submit', payload);

      showErr('');
      modal.classList.add('is-busy');
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (resp) {
          var ok = resp.ok;
          return resp.text().then(function (txt) {
            var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* not JSON */ }
            return { ok: ok, data: data };
          });
        }).then(function (r) {
          var explicitFail = !!(r.data && (r.data.success === false || r.data.error));
          if (r.ok && !explicitFail) {
            close();
            CONFIG.REFETCH_DELAYS_MS.forEach(function (ms) {
              setTimeout(function () {
                if (wv2.data && typeof wv2.data.refetchAndNotify === 'function') wv2.data.refetchAndNotify(viewKey);
                if (typeof callerOpts.onAdded === 'function') { try { callerOpts.onAdded(); } catch (e) { /* host refresh is best-effort */ } }
              }, ms);
            });
            if (typeof wv2.toast === 'function') {
              wv2.toast(survey ? 'Adding to the survey… the worksheet refreshes when Make has created the items.'
                               : 'Adding to SOW… the worksheet refreshes when Make has created the items.');
            }
          } else {
            modal.classList.remove('is-busy');
            showErr((r.data && r.data.error) ? ('Failed: ' + r.data.error) : 'Add failed — try again.');
          }
        }).catch(function () {
          modal.classList.remove('is-busy');
          showErr('Network error — try again.');
        });
    }

    modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
    modal.querySelector('[data-act="submit"]').addEventListener('click', submit);

    render();
    return { close: close };
  }

  wv2.sowAddForm = { open: open, isAllowed: isAllowed, isPreview: isPreview, buttonTitle: buttonTitle, bucketsFor: bucketsFor,
                     subCanAddIndex: subCanAddIndex,
                     sowCandidates: sowCandidates, bidCandidates: bidCandidates, modalOpts: modalOpts, webhookUrl: webhookUrl,
                     CONFIG: CONFIG, BUCKETS: BUCKETS, SURVEY_BUCKETS: SURVEY_BUCKETS, BUCKET_KEYS: BUCKET_KEYS };
})();
/*** END: SOW add-item modal **********************************************/
