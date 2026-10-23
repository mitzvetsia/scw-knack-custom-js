# CLAUDE.md — SCW Knack Custom JS

## Project Overview

Custom JavaScript bundle for a **Knack** (no-code platform) application used by **SCW** (a field services / construction company). The code enhances Knack's default UI with custom worksheets, collapsible groups, boolean toggle chips, dynamic cell coloring, inline photo rows, and many other UX improvements.

The bundle is concatenated (not transpiled) and served via **jsDelivr CDN** from tagged GitHub releases.

## Repository Structure

```
src/
  config.js              # Global SCW namespace + version + webhook URLs
  util.js                # Binding helpers: SCW.onViewRender(), SCW.onSceneRender()
  knack-bundle.js        # Empty — the entry point is build.sh, not this file
  features/
    device-worksheet.js        # Largest module — summary row + expandable detail panel
    group-collapse.js          # Collapsible L1/L2 table groups with localStorage persistence
    dynamic-cell-colors.js     # Conditional cell highlighting (empty/zero → color)
    boolean-chips.js           # Yes/No toggle chips replacing inline-edit booleans
    global-styles.js           # Global CSS overrides (headings, KTL accordion styling)
    preserve-scroll-on-refresh.js  # Scroll preservation + post-edit restoration coordinator
    extract-hsv-color.js       # Per-view color theming via _hsvcolor= keyword
    inline-photo-row.js        # Photo strip rows beneath device worksheets
    bid-items-grid.js          # Bid items grid enhancements
    proposal-grid.js           # Proposal grid enhancements
    ...                        # ~40+ feature modules total
    ratking/                   # Legacy "ratking" modules split into focused files
      default-field-values.js
      discount-copy-tweaks.js
      hash-bump-record-update.js
      modal-backdrop-click-disable.js
      post-inline-edit-behavior.js
      scene-776-stub.js
      timepicker-init.js
    legacy/                    # Deprecated feature modules kept for compatibility
dist/
  knack-bundle.js              # Built artifact — concatenation of all src files
build.sh                       # Concatenates src files → dist/knack-bundle.js
release.sh                     # Build + commit + tag + push to main + CDN URL
save.sh                        # Commit source changes only (excludes dist/)
```

## Build System

**No npm, no bundler, no transpiler.** The build is a simple `cat` concatenation defined in `build.sh`.

### Key Commands

| Command | Description |
|---------|-------------|
| `bash build.sh` | Concatenates all `src/` files into `dist/knack-bundle.js` |
| `bash save.sh "commit message"` | Stages source only (excludes dist/), commits, and pushes |
| `bash release.sh v1.1.XXX` | Requires clean tree → builds → commits → tags → pushes to main |

### Build order matters

`build.sh` explicitly lists every source file in dependency order. When adding a new feature file:
1. Add the file to `src/features/`
2. Add it to `build.sh` in the correct position (after its dependencies)
3. Run `bash build.sh` to rebuild the dist bundle

### Testing branch builds (NO release needed)

**Do NOT assume the user must run `release.sh` (or that a tagged release) is
required before changes are testable.** jsDelivr serves the bundle from ANY
git ref — including a raw commit SHA — so the moment you `git push` a branch
commit that includes a rebuilt `dist/knack-bundle.js`, that exact build is
live on the CDN:

```
https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@<commit-sha>/dist/knack-bundle.js
```

The user pins the Knack loader directly to the pushed commit hash, so every
branch push is immediately testable in the live app. **Never** tell the user
that "this won't take effect until a release" or ask "did you release?" — and
never block a debugging loop on a release. Just rebuild (`bash build.sh`),
commit the `dist/` change, push the branch, and the new build is live at that
SHA. (jsDelivr caches per-ref; a commit SHA is immutable so there's no cache
staleness to worry about — each new commit is a new URL.)

### Release workflow (production tags only)

Tagged releases are for cutting a stable production version, not for testing.

1. Commit all source changes first (use `save.sh` or manual git)
2. Ensure working tree is clean
3. Run `bash release.sh v1.1.XXX` (increments the patch number from latest)
4. The release commit contains only the rebuilt `dist/knack-bundle.js`
5. CDN URL: `https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@vX.X.X/dist/knack-bundle.js`

## Architecture & Conventions

### Global Namespace

All custom code lives under `window.SCW`. Core utilities:
- `SCW.onViewRender(viewId, handler, ns)` — bind to Knack view render, auto-deduped
- `SCW.onSceneRender(sceneId, handler, ns)` — bind to Knack scene render, auto-deduped
- `SCW.CONFIG` — version, webhook URLs
- `SCW.groupCollapse` — public API for group-collapse coordination
- `SCW.scrollPreserve` — public API for scroll save/restore

### IIFE Module Pattern

Every feature file is wrapped in an IIFE:
```js
(function () {
  'use strict';
  // ... feature code ...
})();
```

### Knack Event System

Features bind to Knack's jQuery-based event system:
- `knack-view-render.{viewId}` — fires when a specific view renders
- `knack-scene-render.{sceneId}` — fires when a scene renders
- `knack-scene-render.any` — fires on any scene render
- `knack-cell-update.{viewId}` — fires after inline edit save

Always use **namespaced events** (e.g., `.scwGroupCollapse`, `.scwBoolChips`) and `off().on()` to prevent duplicate bindings.

### CSS Injection Pattern

Features inject `<style>` elements with unique IDs to prevent duplicates:
```js
const STYLE_ID = 'scw-feature-name-css';
if (document.getElementById(STYLE_ID)) return;
var style = document.createElement('style');
style.id = STYLE_ID;
style.textContent = css;
document.head.appendChild(style);
```

### Knack Field/View References

- Views: `view_XXXX` (e.g., `view_3512`, `view_3505`)
- Fields: `field_XXXX` (e.g., `field_2400`, `field_2415`)
- Scenes: `scene_XXXX` (e.g., `scene_1085`)

Configuration is always at the top of each feature file in a `CONFIG` or `VIEWS` constant. When modifying behavior for a specific view/field, edit the config — not the core logic.

### Reading Connection Fields from Table DOM

Connection fields in Knack table cells have a specific DOM structure that differs from plain text fields. Every table cell is wrapped in a `<span class="col-N">` container. Understanding this structure is critical when scraping data from hidden views.

**Connection field cell (populated):**
```html
<td class="field_2644 cell-edit" data-field-key="field_2644">
  <span class="col-2">
    <span class="64a1b2c3d4e5f6a7b8c9d0e1" data-kn="connection-value">
      Display Label Text
    </span>
  </span>
</td>
```

Key details:
- The **record ID** of the connected record is the `class` attribute on the inner `<span>` (a 24-character hex string like `64a1b2c3d4e5f6a7b8c9d0e1`)
- The inner span has `data-kn="connection-value"` — use this as the selector
- The span's `textContent` is the display label (identifier)
- Multi-connection fields repeat the inner span for each connected record

**Connection field cell (empty / blank):**
```html
<td class="field_2644 cell-edit" data-field-key="field_2644">
  <span class="col-2">
    &nbsp;
  </span>
</td>
```

There is no inner `<span data-kn="connection-value">` — only `&nbsp;` inside the wrapper.

**Rich-text / HTML field cell:**
```html
<td class="field_2695 cell-edit" data-field-key="field_2695">
  <span class="col-3">
    <div style="...">actual HTML content</div>
  </span>
</td>
```

Use `innerHTML` (not `textContent`) to preserve the rendered HTML. Remember the outer `<span class="col-N">` wrapper will be included — account for it when processing.

**Extracting connection record IDs from a table cell:**
```js
var cell = tr.querySelector('td.field_XXXX');
if (cell) {
  var span = cell.querySelector('span[data-kn="connection-value"]');
  if (span) {
    var recordId = span.className.trim();   // 24-char hex ID
    var label    = span.textContent.trim();  // display text
  }
  // If no span found, the connection is blank
}
```

**Reading from Knack model vs DOM scraping:**
- **Knack model** (`Knack.models`): use `record[fieldKey + '_raw']` for connection fields — returns `[{id, identifier}]`. Plain fields are at `record[fieldKey]` and may contain HTML.
- **DOM scraping**: more reliable for rich-text fields (`field.innerHTML`) and JSON fields (`field.textContent`). Always try DOM first when the view is on the same scene (even `display:none` views have their elements in the DOM).
- When scraping, `td.field_XXXX` selects the cell (field key is a CSS class on the `<td>`), then navigate into the `<span class="col-N">` wrapper to reach the actual content.

### ⚠️ `field_1957` ↔ `field_2197` are SEPARATE fields kept aligned by the cascade

On the SOW Line Item object, **Connected Devices** (`field_1957`, the
multi-connection on an NVR/switch pointing at its cameras/readers) and
**Connected To** (`field_2197`, the single-connection on a camera/reader
pointing back at its NVR/switch) are **two independent Knack fields, NOT
the two halves of one reciprocal Knack connection.** Knack does **not**
auto-sync them. They are kept consistent **only** by the cascade code in
`src/features/mirror-connection-sync.js` (the forward cascade: edit
`field_1957` on the parent → it writes `field_2197` on each added child and
clears it on each removed child; plus the inverse `-recip` handler for
direct `field_2197` edits).

Consequences you must respect:
- **Never assume writing one side updates the other.** If you write
  `field_1957` you must let (or make) the cascade write `field_2197`, and
  vice-versa — otherwise the two fields drift out of alignment.
- **The cascade's read of "what is currently selected" must be
  authoritative.** It diffs the parent's chosen children against the set of
  children currently pointing back, then adds/removes `field_2197`
  accordingly. If that read is stale (e.g. a `model.fetch()` racing ahead of
  a not-yet-committed PUT repopulates the old value), the diff over-removes
  and **clears connections that are still selected.** This is why the v2
  picker passes the exact chosen ids through the `knack-cell-update`
  dispatch as a 5th arg (`triggerIds`) — the cascade uses them verbatim
  instead of re-deriving from the Backbone model. Preserve that contract;
  don't "simplify" the cascade back to reading the model snapshot.
- The same field pair + cascade applies on every view that renders this
  object: `view_3505`/`view_3586`/`view_3610`/`view_3921`/`view_3962`
  (each has its own `createMirror()` instance).

### Data Saving Patterns

Features use Knack's internal APIs for saving data, in order of preference:
1. `Knack.views[viewId].model.updateRecord(recordId, data)` — preferred
2. `Knack.models[key].save(data)` — fallback
3. Direct `$.ajax` PUT to Knack REST API — last resort

### ⚠️ Pushing many PUTs at once — ALWAYS cap concurrency + retry with backoff

**Any time a feature fires more than a handful of PUTs/POSTs in one user
action (bulk field writes, unlocking/finalizing N rows, mirroring a
connection cascade, etc.), you MUST run them through a concurrency-capped
queue with retry-and-backoff.** Knack's REST API rate-limits at **~10
req/s** and silently returns **429** for the overflow — so a naive
`Promise.all` over 20–30 records reliably loses several writes, and any
`Promise.all` that rejects on the first error also produces a *false*
"failed" toast while most writes actually landed.

The canonical implementation is in
`src/features/mirror-connection-sync.js` (the `knackPutKeepalive` queue
+ `knackPutKeepaliveWithRetry`). The Reopen Bid handler in
`src/features/bid-review/init.js` (`handleReopenBid`) is a second,
self-contained copy of the same pattern. Copy one of these — do **not**
hand-roll a bare `Promise.all` of PUTs. Required pieces:

1. **Concurrency cap** — never more than ~4 requests in flight
   (`MAX_CONCURRENT`). Excess requests queue and start as slots free.
2. **Retry with exponential backoff + jitter** on *transient* failures
   only — HTTP `429`, `5xx`, `408`, and network/`status 0`. Use
   `BASE_BACKOFF * 2^(attempt-1) + random jitter`, up to ~4 attempts.
   **Do not retry permanent `4xx`** (403/404/400) — they won't recover.
3. **Settle, don't reject** — each write resolves to a
   `{ ok, recordId, status }` result so one failure never rejects the
   batch. Tally results afterward and report full / partial / total
   failure precisely (and `console.warn` per-record failures when
   `CONFIG.debug`).

### Setting Form Fields Programmatically

Knack maintains an internal model for form data that is separate from the DOM. Changing DOM values alone (e.g., `$.val()`) will **not** persist on submit — you must also fire a `change` event so Knack's model syncs.

**Connection fields** (Chosen.js dropdowns):
```js
var $select = $('#view_XXXX-field_YYYY');
var $hidden = $('#kn-input-field_YYYY input.connection[name="field_YYYY"]');

$select.val(recordId);
$select.trigger('chosen:updated');   // refresh Chosen UI
$select.trigger('liszt:updated');    // legacy Chosen event
$hidden.val(recordId);               // sync the hidden input
$select.trigger('change');           // ← CRITICAL: syncs Knack's internal model
```

**Standard fields** (text, number, etc.):
```js
$('#view_XXXX-field_YYYY').val(newValue).trigger('change');
```

The `change` event is the key — without it, Knack reads stale/empty data from its internal model on form submit, even though the UI looks correct.

### Picker conventions — record pickers ALWAYS group by MDF/IDF + canonical sort

**Any custom picker that serves SOW line-item RECORDS MUST group its options by
MDF/IDF and sort them in the SAME order as the worksheet devices.** This is a
hard UI/UX consistency rule — wherever a user picks a record (parent, connected
devices, connected to, …) they should see the same grouping and order as the
grid. Don't hand-roll a per-picker `groupBy`/sort.

This is already the **default** in `worksheet-v2/picker.js` (`ns.picker.open`):
- **Grouping**: with no `groupBy`, the picker groups by `field_1946` (MDF/IDF)
  via the canonical `groupByMdfIdf`. No-MDF records sink to a "No MDF / IDF"
  group at the bottom.
- **Sort**: every group's items use the canonical comparator — `field_2218`
  (proposal-bucket sortOrder) asc → display label (natural/numeric) → record id.
  Identical to the worksheet's default device order (`worksheet-v2/groups.js`).

So **a new record picker needs to do nothing** — call `ns.picker.open` *without*
a `groupBy` and it gets the canonical grouping + sort for free. If you need the
grouping fn explicitly, it's exported as `ns.picker.groupByMdfIdf`.

**Non-record pickers** (products, MDF/IDF locations, prefixes, SOWs — candidates
with no `field_1946`) collapse to a single flat list automatically, or opt out
explicitly with `groupBy: false`. The canonical sort still applies (it falls
back to label when `field_2218` is absent), so those lists stay alphabetical.

### MDF/IDF location numbering rule

On the MDF/IDF location object (type `field_1641`, ## `field_2458`, name
`field_1943`, notes `field_1643`, survey notes `field_2457`, computed display
name `field_1642`): **HEADENDs never carry a ## — only IDFs are numbered.**
Any UI that edits locations must hide the number input for HEADENDs and clear
`field_2458` when a location is converted to HEADEND. Reference
implementations: `mdf-idf-cards.js` (number box omitted for HEADEND) and
`bid-review-v2/mdf-manage.js` (## hidden + cleared on designator flip).

### Warning Icons in Card Headers

All warnings in device-worksheet card headers use the same pattern:
- **Class**: `scw-cr-hdr-warning` — placed inside `.scw-ws-warn-slot`
- **Color**: `#b45309` (amber) — defined in `connected-records.js`
- **Icon**: Triangle SVG with exclamation mark:
```html
<span class="scw-cr-hdr-warning" title="Warning description">
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
</span>
```
- Use the same amber color for inline warning messages below fields
- Never use red/pink for warnings — reserve red for errors and destructive actions

### MutationObserver Pattern

Many features install MutationObservers to re-apply enhancements after Knack re-renders the DOM. Always:
- Guard against duplicate observers (e.g., `$view.data('scwObsKey')`)
- Debounce observer callbacks (typically 100-250ms)
- Support suppression flags for coordinated restoration sequences

### Coordination Between Features

The `preserve-scroll-on-refresh.js` module acts as a post-edit coordinator:
- Suppresses auto-enhancement during intermediate DOM states
- Orchestrates restoration order: group-collapse → KTL accordions → scroll
- Features expose APIs on `window.SCW` for the coordinator to call

### Out-of-bundle Knack Builder snippets

A handful of features depend on globals populated by inline JS code
pasted into Knack Builder's app-level "JavaScript" settings — NOT
shipped in `dist/knack-bundle.js`. They run before the bundle and
expose data via `window.SCW.<thing>` for in-bundle features to read.

If a feature relies on `window.SCW.<foo>` but no in-bundle setter
exists, it's almost certainly a Builder snippet. Lose the snippet,
you lose the global, you lose the feature — but a `grep` won't tell
you any of that.

#### `window.SCW.productBucketMap` (used by filter-products-by-bucket.js, bulk-add-mounting-box.js, and v2 product picker)

**Source of truth (2026-10-09): `knack-snippets/product-catalog-loader.snippet.js`** — the live
Builder snippet, key blanked. It builds `productMap` (`{ name, buckets, subAllowed (field_2433),
salesAllowed (field_2434) }`), `productBucketMap`, `mountingBoxProducts` and `productMapReady` in one
paginated fetch; re-paste it into Builder on any change. The older minimal snippet below is kept
for the shape of the bucket map only.

Map of product id → array of proposal-bucket connection ids:

```js
{ '<productId>': ['<bucketId1>', '<bucketId2>'], ... }
```

Populated by this Builder snippet (one-time fetch on app boot):

```js
(function () {
  var APP_ID  = Knack.application_id;
  var API_KEY = '###';   // TBD — fill from Builder → Settings → API & Code; never commit the value
  var PRODUCT_OBJECT = 'object_8';
  var BUCKET_FIELD   = 'field_133';   // proposal bucket on the Products object
  var STATUS_FIELD   = 'field_956';   // Status (filter to "Enabled")

  var filters = encodeURIComponent(JSON.stringify([
    { field: STATUS_FIELD, operator: 'is', value: 'Enabled' }
  ]));

  window.SCW = window.SCW || {};
  var map = {};

  function fetchPage(page) {
    $.ajax({
      url: 'https://api.knack.com/v1/objects/' + PRODUCT_OBJECT +
           '/records?rows_per_page=1000&filters=' + filters + '&page=' + page,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': APP_ID,
        'X-Knack-REST-API-Key': API_KEY
      },
      success: function (res) {
        var records = res.records || [];
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          var raw = rec[BUCKET_FIELD + '_raw'];
          var buckets = [];
          if (Array.isArray(raw)) {
            for (var j = 0; j < raw.length; j++) {
              if (raw[j] && raw[j].id) buckets.push(raw[j].id);
            }
          } else if (raw && raw.id) {
            buckets.push(raw.id);
          }
          if (buckets.length) map[rec.id] = buckets;
        }
        if (res.total_pages && page < res.total_pages) fetchPage(page + 1);
        else window.SCW.productBucketMap = map;
      }
    });
  }
  fetchPage(1);
})();
```

Notes:
- Pulls EVERY Enabled product across paginated 1000-row batches. On
  catalogs with thousands of products this can be slow on cold load.
- Exposes ONLY the id → bucket map. No product names. Features that
  need names (e.g. a v2 product picker) must source those separately
  — typically from a hidden Knack view that exposes name + id, with
  the bucket map used purely to FILTER candidates.
- **API keys are NEVER committed to this repo** — snippet copies here
  (and in knack-snippets/) carry a `###`/TBD placeholder. Fill the real
  key in from Builder → Settings → API & Code at paste time only, and
  keep it out of PRs/issues/chat.

## Derived product flags (live 2026-10-13) — `src/features/product-catalog.js`

**Nothing about a product is stamped on a line item any more.** Two facts used to ride stored
line-item flags — the "accessory match check" (`field_2244`, Yes/No per attached accessory,
scraped off the parent row) and the product-status mirror (`field_2912`, Yes = still active) —
and both went stale whenever the catalog or the line changed. They are now QUESTIONS asked of
the product catalog the Builder snippet already loads (`knack-snippets/product-catalog-loader.
snippet.js`): `SCW.catalog.fits(accessoryProductId, parentProductId)` applies the exact rule
the add-accessory pickers use (either compatibility list, `field_2236` / `field_2205`, names
the parent's product) and `SCW.catalog.isDisabled(productId)` reads the product's status.
- **Three-state contract**: `true` / `false` when the catalog knows, `null` when it cannot say
  (not loaded, load failed, accessory product unknown, no compatibility list). On
  `null` every consumer falls back to the stored signal it had before; a `null` is never a
  warning. `SCW.catalog.ready(fn)` runs once the maps land (`scw-mounting-box-products-ready`);
  worksheets painted before that repaint themselves then.
- **Consumers**: `worksheet-v2/warnings.js` `buildBracketMaps` audits the view's records first
  (`auditAccessories`) — an accessory the catalog says fits is never flagged by a stale stamp,
  one it says does not fit is flagged with no stamp at all, undecided ones fall to the stamped
  spans; attached service lines stay exempt. `worksheet-v2/card.js` `isDiscontinued(rec,
  viewKey)` asks the catalog before `field_2912`. `bid-review-v2/warnings.js` runs the same
  audit over view_3921's own records — the accessory line items are rows of that grid like
  their parents (transform.js weaves them under their parent by `field_2464`), so no extra view
  is needed there either.
- **No extra load**: the snippet is unchanged and still fetches ENABLED products only — a
  line item whose product is not in that catalog has a product the pickers can no longer
  offer, so "absent from the enabled catalog" IS the disabled verdict (disabled, retired or
  deleted alike). The map is published only after its last page and an empty map counts as
  not loaded, so a missing or failed load can never badge a live product. Never narrow the
  snippet's filter: that would badge live products.
- **Discontinued-products bar** (same day): wherever a rendered line item carries a product
  the catalog no longer offers, a full-width amber bar names every such product with its count
  — under the worksheet banner on the build page (`worksheet-v2/discontinued-bar.js`, mounted
  by init.js after each render over the filtered records) and under each SOW section's status
  line on the reconcile page (`bid-review-v2/warnings.js` `mountDiscontinuedBar`, called by
  render.js). A click on a product highlights its cards / rows and scrolls to the first (the
  scope-tile gesture); a second click clears. The bar removes itself when the scope is clean.
- **Retired with it**: `worksheet-v2/product-enabled-flag.js` (it wrote `field_2912` Yes after
  a product change — nothing writes a product flag now) and the v1 worksheet's
  `device-worksheet.js isDiscontinuedRow` asks the catalog first. The `field_2244` /
  `field_2912` columns on the views, and the Make step that stamps them, can go: every reader
  treats a missing column as "no stored signal", and the catalog answers first. Known Issue #14
  (default accessory missing) becomes derivable the day the product object carries a
  default-accessory field.
- Tests: `tests/catalog/test-product-catalog.js`, `tests/worksheet-v2/test-derived-flags.js`,
  `tests/worksheet-v2/test-discontinued-bar.js`, `tests/bid-review-v2/test-derived-brackets.js`.

## Licenses on the worksheets (live 2026-10-13)

License-bucket line items (proposal bucket `645554dce6f3a60028362a6a`, or a bucket named
"License…") are ordinary SOW line items that used to be filtered OUT of the worksheet grids and
shown in standalone Knack grids (view_3369 on the build-SOW page, view_3471 on the sales SOW page).
The Builder filters are gone (ops first; widen view_3586 / view_3921 the same way) and the standalone
grid + its "Add License or Recurring Service" form (view_3877) are retired on scene_1085 — licenses
are added through "+ Add to SOW" (the modal offers the License bucket on both pages).
- **Worksheet-v2** (`groups.js`): every license lands in the **"Licenses"** synthetic L1 — LAST,
  under Project Wide Services, whatever MDF/IDF the record carries (a license is not installed
  anywhere) — indigo header (`styles.js` `--license`), sub-line "recurring · billed separately · not
  in the project total". The license CARD (`card.js` `buildRow_license` / `buildDetail_license`) is
  product · description · qty · the view's own price: the LABOR money tracks (Sub Bid / +Hrs / +Mat /
  Install fee) stay blank (`.scw-ws-v2-cell--license-blank`), the sales line total and the ops CO
  worksheet's Equipment $ stack + net total render as on any row, and the detail is pricing (where
  the view has it) + notes — no MDF/IDF, Parent, Mounting Hardware, Connected Devices or Require Sub
  Bid. The scope strip / summary already kept licenses out of the Total.
- **Reconcile page** (`bid-review-v2/transform.js` `isLicenseRow`, `LICENSE_L1`): a "Licenses" L1
  after Unassigned (`l1Rank` 4), `licenseItems: true`, `mdfIdfId: ''` (no manage gear, survey
  notes or photos band — `card.js`). Bid cells read a muted "—" ("Licenses are not priced by subs"):
  never the "Not surveyed" cut-out / "+ Add to bid"; the SOW cell shows Qty but no Sub Bid; the row
  total label reads "Recurring". Licenses are left out of the SOW Sub Bid / Install head totals and
  `deltaVsSow`, out of the diff bar's coverage gaps (`sub-bid-diff/render.js` `distill`) and out
  of "Update SOW to match Bid"'s disconnect list (`bid-review/actions.js`). The SOW item index now
  carries `proposalBucketId` and matched rows take it from the line item.
- **Mount anchor**: `worksheet-v2/config.js` view_3962 `mountAfterSelector` is now an ORDERED list
  (`init.js` `firstMatch`): `#view_3369` while Builder still has it, then the Site Maps & Other
  Files accordion (`.scw-acc-for-view_3949`, then `#view_3949`). The fallback `#view_3962` sits in
  the region scene-tweaks.js hides after view_3898 — keep a listed anchor alive on the scene.
  `accordion-menu-inject.js` and `scene-tweaks.js` no longer reference view_3369.
- **Create Alternate SOW** (`create-sow-option-btn.js`): `licenseRecurringIds` (view_3471) drops any
  id the checklist already sends in `linkIds` / `cloneItems`, so a license never rides the payload
  twice once it also flows through view_3586.
- **Deploy worksheets (view_4093 ops / view_4056 sub) — same treatment (2026-10-16)**: licenses were
  landing in "Unassigned" there because `groups.js` `isLicenseRecord` asked the card helper with a view
  key render.js never passed, so the bucket fell back to the SOW's `field_2219` (the install object's
  is `field_2822`). It now reads the bucket off the per-view field map FIRST (`FIELD_BUCKET`: id =
  the License bucket or a label starting "Licen[cs]e"), and render.js hands `viewKey` through. The
  install license CARD (`card.js` `buildRow_installLicense` / `buildDetail_installLicense`) keeps the
  install grid — blank label, read-only product, an indigo "Recurring (×qty)" chit in Flags (plus the
  Removed-by-CO chip when a signed CO dropped it), editable SCW Notes — and a read-only detail of qty +
  description + a note; no MDF/IDF picker, Parent, Connected Devices or Mounting Hardware. The BOM tray
  (`bom-tray.js` `isLicense`) leaves licenses out of the box; the deploy page's own "Recurring
  licenses" card (`licenses-strip.js`) is where they are priced.
- Tests: `tests/worksheet-v2/test-license-group.js`, `tests/bid-review-v2/test-license-group.js`,
  `tests/deploy-page/test-bom-tray.js` (license exclusion).

## Manage Deployment page (scene_1311) redesign — full reference: docs/deploy-page-redesign.md

Phase I top section shipped 2026-09-18 on branch `claude/sow-sync-bid-compare-auk1dh`
(every push is live at `https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@<sha>/dist/knack-bundle.js`).
**Read the doc's "State of the build" section before touching the page**, then:

- **Modules**: `deploy-page-nav.js` (four stage tiles, parked sections + right
  drawer, section action bars, "Also on this project" list),
  `pinned-notes.js` (pinned strip, notes cards, inline composer submitting the
  hidden `view_4162` add form), `site-maps-strip.js` (maps card, pop-out
  viewer, density + "+N more"). Sub scene `scene_1353` shares the config.
- **Invariants**: tiles and the "Also" list are never rebuilt while a drawer is
  open or closing (a drawer-hosted section counts via its `.scw-deploy-home`
  placeholder); sections move into the drawer as ELEMENTS and back; UI copy says
  "Sub", never a subcontractor name; the current tile is white with a navy frame
  (the navy fill was rejected as "yelly"); no descriptions in the "Also" rows.
- **Tests**: `tests/deploy-page/` (jsdom). Run all four before every push.
- **Repaint diagnostics** (2026-10-14, "the worksheet flashes every few seconds"): set
  `localStorage.scwScrollSpy = '1'` in the console. The data layer logs every poll tick it SKIPS
  (model unchanged) and init.js now logs every worksheet REBUILD with its dirty state and caller
  (`[scw-ws-v2] view_4093 REBUILD — dirty: all=true records=0 — from: …`) — a repeating line names
  the trigger (a poll burst whose fetched model differs every time, a module refetching — never
  KTL, which is gone from the app). **Found 2026-10-15**: `moveChangeOrders` re-applied the pre-wrap hide
  (`scw-deploy-prewrap`: visibility hidden + max-height 0) to the moved Change Orders grid on EVERY
  3 s heartbeat while it sat outside a KTL wrapper, and its 2.5 s timer revealed it again — the strip
  blinked at a 3 s beat and the worksheet under it jumped with it. Now once per grid element
  (`data-scw-prewrap`). Periodic work on the page by design: deploy-page-nav's 3 s heartbeat
  (sig-checked, no DOM churn when nothing changed), bom-tray's 5 s takedown (leaves a saved "Summary
  only" mode ONCE per mount — the click rebuilds the worksheet, so it is guarded against looping),
  poll.js (2 min; 15 s for 5 min after any knack-record-create/update, repainting only on a changed
  model). photo-assign.js runs nothing periodic.
- **Ad-hoc photo delete (2026-10-15)**: on view_4093 a photo that is NOT required and has NO photo
  type may be deleted outright — `photos.js` `canDeleteAdhoc` (`PHOTO_DELETE_ADHOC_VIEWS`) puts the
  red trash on that card next to the amber disconnect, and the photo modal's viewer bar gets a
  filled-red "Delete photo" (`qa-popover.js`, `snapshot.canDelete`). Both go through the shared
  `ns.photos.confirmPhotoDelete` ("Are you SURE? This deletes the photo." · Keep it | Yes, delete
  it — every photo delete now uses this prompt) and `ns.photos.deletePhotoRecord` (native
  kn-link-delete on the photo's row, else a REST DELETE through `PHOTO_GRID_FALLBACK_VIEWS`, now
  `view_4093 → view_3937`; resolves false when neither lands, and the modal says so). Required or
  typed photos keep Remove photo (image cleared, slot kept) + disconnect. **Builder**: view_3937
  needs its Delete link enabled or the REST fallback 403s and the card comes back after the refetch.
  Test: `tests/worksheet-v2/test-photo-delete-adhoc.js`.
- **Shipments drawer = records only (2026-10-16)**: the Installation tile's "Shipments ›" line still
  opens the OMS order mirrors (counts, per-order cards, tracking links, contents), but the
  "Re-check shipments" re-pull button, its reference box and every resync hint are off
  (`shipments-tray.js` `RESYNC_ENABLED = false`; `SCW.shipments.setResyncEnabled(true)` in tests).
  The mirrors refresh on the OMS sync's own schedule. The line renders where a Shipments grid is
  on the scene: view_4163 on scene_1311 (ops) and, since 2026-10-16, view_4165 on the sub
  deployment dashboard scene_1353 (`SCENES` entry `sub: true` — same records, but no "Open in
  ShipEdge" link and no unlinked-queue attribution hint, neither of which a sub can use; both grids
  are hidden by `hide-data-source-views.js`).
- **Pending**: QA checklist per line item (Builder keys still needed — see the
  doc), contacts + pinned contacts, pinned files in the maps strip.

## Change Orders (design locked 2026-07-03 — full reference: docs/change-orders.md)

Install-phase change orders: ops (or the sub) proposes **adds and removes**
against the install scope (view_4056); the CO is priced by the sub, e-signed by
the client (esignatures.com), and on signature Make invoices (Xero) and applies
the changes. **Read `docs/change-orders.md` before touching anything CO-related**
— every decision below is locked there with rationale:

- **Adds + removes only, no field-level MODIFY** (qty change = add/remove;
  config change = swap pair with a `replaces` link; price-only = adjustment
  line). Never mutate live install records client-side.
- **A CO is a SOW subtype** — SOW `field_2952` Type (`base scope` /
  `change order`), NOT a new object. CO line items are ordinary SOW Line Item
  records (connected via `field_2154`). All SOW-consuming surfaces need a
  "Type **is not** change order" filter (blank fails safe).
- **CO Status is a NEW separate field** (`field_2953`, 7 options as of 2026-10-01:
  Draft, Pending Sub Pricing, Ops Review, Issued, Accepted, Declined, Void — the
  STAGE only; there is NO `Applied` — accepted IS applied). **Billability /
  signature / the ops reason live on the ACCEPTANCE as flags** (`field_2766`
  signed, `field_3309` approved without signature, `field_3310` not billable +
  a reason field), never on the SOW. Do NOT add options to the existing SOW
  status field.
- **A CO rides the full chain** SOW → Proposal snapshot → Acceptance → apply.
  The verb is "Issue" (creates snapshot + acceptance in one gesture); invoice
  defers to the SIGNED webhook; the apply gate is **signature alone**; the
  Acceptance Type field is the switch the criteria automation branches on.
- **Nothing mutates install scope until signature.** Removes flip a
  `Removed by CO` connection on the install record — never delete.
- **One sub per CO; the sub travels with the money** (bid basis `field_2942` →
  Proposal → Acceptance → CO auto-assign), not with the project.
- **The CO scene (shipped 2026-07-07, PR #98)**: `view_4079` = the worksheet-v2
  CO drafting surface (same object as view_3962 — config-only deployment);
  `view_4084` = MDF/IDFs; `view_4086` = project install items (removal
  source); `view_4088` = other project SOW/proposal items (adoption source).
  view_4079 has its own `createMirror` instance (the field_1957 ↔ field_2197
  cascade is mandatory on every view that edits this object).
- **Two no-e-signature accepted paths (prepped 2026-10-01, NOT live)** — see the doc's
  "Accepted without an e-signature" section. **Authorize as not billable**: third Ops Review
  exit in `co-stage-strip.js` — reason modal → `MAKE_CO_ISSUE_WEBHOOK` `stepId:
  'authorize-not-billable'` with a CO-page-built payload (raw snapshot, internal
  sub-labor+equipment+reason card, totals, `signed:false`); no client-side writes. **Approve
  without client signature**: amber CO-mode step on the preview page (`ops-stepper.js`
  `approve-without-signature`), full Issue payload + `noSignature:true` + `reason`. Make 13.03
  creates Proposal/Acceptance (flags + reason on the Acceptance), writes `Accepted`, calls
  13.06b. The CO strip reads the Acceptance from a hidden grid (`ACC.view`, TBD). Gated by
  `CO_AUTHORIZE_NOT_BILLABLE_READY` / `CO_APPROVE_WITHOUT_SIGNATURE_READY` (false).
- **CO add form — Mounting Hardware item type (2026-10-15)**: `co-add-item-form.js` offers the
  mounting-hardware bucket (`594a94536877675816984cb9`) as its own chip: a **"Mounts on"** picker
  (`parentCandidates`: this CO's own lines from view_4079 + the project's installed items from
  view_4086, minus services / assumptions / licenses / materials / mounting hardware, accessories
  and removed-by-CO rows), the hardware list narrowed to what the catalog says fits that device
  (`accessoryCandidates`, either compatibility list; the whole bucket with a note when nothing
  fits), the parent's MDF/IDF prefilled, qty. The payload adds `parentLineItemId` (the SOW line for
  `field_2464` — an installed device's via `field_2819`, so view_4086 must serve that column),
  `parentInstallItemId`, `parentProductId`, `parentLabel`, `parentSource`. **Make (02.xx CO add):
  write `field_2464` = parentLineItemId when present and skip default-accessory auto-adds for this
  bucket** — the client does not write the parent itself. Test: `tests/worksheet-v2/test-co-add-mounting.js`.
- **Remove gesture copy (2026-10-20)**: on the CO scene's install-items panel (`co-remove.js`,
  view_4086 / sub view_4116) the verb is **ADD** — card button `Add Removal`, bulk toolbar
  `Add Removal to CO` / `Add N Removals to CO`, confirm "Add a removal to the change order?" with the
  same OK label, busy text `Adding removal…`, accessory controls "Add removal for accessory …". The
  click drafts a Remove LINE on the CO (a credit against a greenlit install item); it removes nothing
  from the CO. "Remove from change order" is reserved for the UNLINK of an adopted row (init.js). The
  result pill still reads "− Slated for removal".
- **Not built yet**: CO add/adopt/remove flows (add CTA is suppressed via
  `noAddItem`), the remaining Builder fields (CO Status, CO Action, Target
  install item, Removed-by-CO, Proposal/Acceptance Type), all Make scenarios,
  and the sub-facing view (⚠️ gated on Known Issue #17 — no worksheet-v2
  surface to sub logins while the REST-key Builder snippet ships).

## SOW add-item modal (live 2026-10-08) — `src/features/worksheet-v2/sow-add-item-form.js`

The Knack DTO "Add to Scope" forms (view_3329 / view_4002 / view_3451 / view_3748) are
retired: Knack's browser-side required check blocked them, and the intercept that posted
them itself never connected the DTO to its SOW header. "+ Add to SOW" on the build-SOW
(view_3962), sales (view_3586) and reconcile-bids (bid-review-v2, host view_3921) surfaces
is now this modal — the CO modal's engine with the DTO forms' per-bucket field suite,
bucket-first or product-first (one bucket per product; click the active chip to clear).
Submit posts ONE payload to `MAKE_SOW_ADD_ITEMS_WEBHOOK` (Make scenario 02.01 "SOW Line
Item DTO (DUPE USING CUSTOM MODAL)", remapped from the DTO record to the payload, which
therefore mirrors the DTO's `field_XXXX_raw` shape — contract in `src/config.js`). Per-view
options: `sowAddModal` in worksheet-v2/config.js (ops = project page, SOW picker from
view_3325; sales = SOW page, four "allow sales to add" buckets, no picker) or the module's
`HOSTS` for non-worksheet surfaces. `ALLOWED_EMAILS` (empty = everyone) re-gates it.
`dto-form-submit-intercept.js` now covers only the survey add forms — likely carrying the
same connection bug; verify before relying on them.

**Survey mode (LIVE for everyone 2026-10-09)**: the sub survey / bid worksheet (view_3505,
scene_1140) runs the SAME modal with `sowAddModal: { mode: 'survey', bidViews: ['view_3507'],
requireWebhook: true }` as its one "+ Add Survey/Bid Item" button; the native Knack DTO form
view_3627 is retired from the page (dropped from `dto-form-submit-intercept.js`; reachable by URL only). `SURVEY_BUCKETS` in `sow-add-item-form.js` mirrors view_3627's
per-bucket rules (`bucket-field-visibility_add-survey-bid-item.js` — change both together): bid(s) row
on every bucket (active filter pills pre-checked, optional), labor bid `field_2233` + survey notes
`field_2432` on every bucket but License, accessories only on Materials, License = product + qty, MDF
single (camera) / multi (networking) / optional (others) / none (License), custom-assumption detail
conditional. Target = the page's survey request (last 24-hex route segment); payload = readable keys +
the survey DTO mirror (`field_2426`/`_raw` request, `field_2427_raw` bids, `field_2432`, `field_2233`,
`field_2185` pre-fix text, `field_2246_raw` unified product, `field_2181_raw` project when a view loads
`field_2346`, `field_2182_raw: []`). Make side: 05.01 "SURVEY ITEM | Create from DTO (DUPE USING CUSTOM
MODAL)" — the DTO scenario with the webhook as module 2 so every `2.field_*` read resolves against the
payload unchanged; config/variables sets from `var.organization.knack_config_set` /
`knack_variable_set`; module 157 keeps the request's own project / SOWs when the payload has none.
`MAKE_SURVEY_ADD_ITEMS_WEBHOOK` carries the live hook; `isAllowed(viewKey)` is false for
`requireWebhook` views while it is blank/PLACEHOLDER, in which case the toolbar falls back to the
native add link. **Preview gate** (for staging future changes): set `sowAddModal.previewEmails` and
the native button returns for everyone while only the listed users get a second amber
"+ Add Survey/Bid Item (new)" button that opens the modal (webhook or not; submit reports an
unconfigured one). Clear the list to make the modal the add button again. **Sub-can-add**: survey mode offers only products with `field_2433`
FLAG_subcontractor can add = Yes and hides buckets with no eligible product (the product-optional
Services chip stays — see "Services productized" below). Flag source: `sowAddModal.subCanAddView` (a Products grid on the scene, Builder TBD) else
`SCW.productMap[id].subCanAdd` (extend the productMap Builder snippet with `field_2433_raw`); with
neither on the page the modal shows every product behind an amber notice + console warning. Behaviors the
modal inherits from 05.01 (pre-existing, not changed): License qty is ignored (one line per license
product), exterior/plenum come from the PRODUCT not the toggles, Materials accessories (`field_2206`)
create SOW Line Items (object_105), not survey items. Test: `tests/worksheet-v2/test-survey-add-item-form.js`.

## Services productized in the add-item modals (2026-10-23) — `worksheet-v2/sow-add-item-form.js`

"I need to be able to productize services just like assumptions on the add-to-SOW and add-to-survey
modals, with the same 'select custom service' and get an option to describe the service." The Other
Services bucket was product-less by design (description · cost · qty · MDF). Both suites (`BUCKETS` for
"+ Add to SOW" on view_3962 / view_3586 / the reconcile host, `SURVEY_BUCKETS` for "+ Add Survey/Bid
Item" on view_3505) now lead with a **Service** picker over the catalog's Services bucket
(`productOptional` stays true), the same shape as Assumptions:
- **Three ways to fill the line**: pick a catalog service (the describe row folds away — the product is
  the line); pick **"Custom Service"** (the describe row returns and is required: "Describe the custom
  service."); pick nothing and describe it (the pre-existing product-less path, kept so nothing that
  worked stops: "Pick a service, or describe the service." when both are empty). `syncServiceDesc`
  drives the `data-cond="customService"` row on every product change and at the end of each render.
- **"Custom Service" is a PRODUCT RECORD in the Services bucket** (Builder: create it, like Custom
  Assumption `69ce7098172caa5786d3767d`). It is recognised by id once `CUSTOM_SERVICE_ID` is filled, and
  by NAME until then (`CUSTOM_SERVICE_NAME` = a product in that bucket named "Custom Service…", read
  off the picker label or `SCW.productMap`). In survey mode the sub sees it only when its
  `field_2433` sub-can-add flag is Yes (same gate as every product); the Services chip itself is never
  hidden by `hideEmptySurveyBuckets` (a product-optional bucket is always addable).
- **Payload**: the product rides `productIds` / `productLabels` and the DTO mirror's
  `field_2195_raw` — the DTO form's OPTIONAL service product field (view_4100,
  `set_unified_product_field.js` PARENTS / SINGLE_PRIORITY) — and the unified `field_2246_raw`
  (`UNIFIED_PRODUCT_BUCKETS` now includes Services); `customService: true` when the picked service is
  the Custom Service product; `description` carries the text as before (`field_2210`).
- **Make 02.01 (SOW) — patched blueprint delivered 2026-10-23** ("… v2-services.blueprint.json", built
  from the user's export by `scratchpad/tools/bp_patch_0201_services.py`; import INTO the scenario so
  the hook stays). Before it, a service WITH a product fell into the EQUIPMENT path (router 17 route 1:
  [151] "NOT assumption" → [99] HAS PRODUCT → [5]/[130]), which wrote the product's copy over the typed
  description, the product's default labor over the typed sub bid, repeated the line per qty with label
  numbers and ran the default-accessory search. Now: [151]'s filter also excludes the Services bucket
  (`6977caa7f246edf67b52cbcd`), and a NEW route 3 on router 17 — a clone of the assumption route —
  handles "IS service WITH product" (`field_2223` = Services AND `length(map(field_2195_raw; "id")) > 0`):
  [244] feeder over `field_2195_raw` → [245] get product → [246] variables `service copy` =
  `ifempty(field_2210_raw; product field_2021_raw)` (the typed description wins, else the catalog copy —
  so Custom Service needs no hardcoded id in Make), `service sub bid` = `ifempty(field_2233_raw;
  product field_2166_raw)`, `service require sub bid` = product `field_2477_raw` else true → [247]
  router → [249] (per MDF) / [250] (no MDF) "Create Service Line Item": ONE line, `field_1949` = the
  service product, qty `ifempty(field_2183_raw; 1)`, `field_2020` / `field_2150` / `field_2479` from
  the variables, the product-derived fields (`field_1958/1960/1962/1963/1981`) as every product-backed
  line gets them. The description-only path (router 17 route 4 "no product" → [177]/[178]) is unchanged.
  **05.01 (survey) still needs the same change** — same shape, its own export.
- **Add Product form (view_466) — `bucket-field-visibility_add-product.js`** (same day): the form shows
  only the fields whitelisted for the chosen bucket (`field_133`), and the Other Services bucket mapped
  to an EMPTY list — every field but the bucket hid, so no service product (Custom Service included)
  could be created there. It now shows bucket · status · type of system · name · description · retail
  price · eligible for discount · default labor description (`field_2021`, the catalog copy the Make
  route reads) · default sub bid (`field_2166`) · default installation hours; SKU, source, default qty
  and the equipment-only flags stay hidden; fields the module does not list (the sub-can-add /
  sales-allowed flags) are never touched. Test: `tests/misc/test-add-product-bucket-rules.js`.
- The product-first list (no chip picked) now offers services, bucket-labelled; picking one selects
  the Services chip. The CO add form (`co-add-item-form.js`) keeps its own product-less Services
  bucket — not in scope.
- **Services are MULTI-select (same day)**: both suites carry `productMulti: true` (label "Services") —
  several services in one add, one line each. The one description / sub-bid pair belongs to the
  **Custom Service** line (or to a lone pick): `syncServiceCost` HIDES the sub-bid box when 2+ catalog
  services are picked with no Custom Service (each line takes its catalog default `field_2166`; the
  payload sends `serviceCost: ''` / `field_2233_raw: null`) and relabels it "Custom service sub bid ($)"
  / "Custom service labor bid ($)" when a Custom Service is among several; the payload adds
  `customServiceId` (the picked id the modal recognises as Custom Service, else ''). **Make 02.01 v3
  ("… v3-multi-services.blueprint.json", `scratchpad/tools/bp_patch_0201_services_v3.py`, built on the
  user's re-export of v2 — import INTO the scenario)**: only [246] changed — `service copy` =
  `if(245.id = 243.customServiceId; typed; if(contains(lower(245.field_35); "custom service"); typed;
  245.field_2021_raw))` (the typed description lands on the Custom Service line by id, or by the product
  NAME when the webhook does not carry the new key; every other service takes its catalog copy) and
  `service sub bid` = typed-else-default on the Custom Service line or on a lone pick
  (`length(243.field_2195_raw) = 1`), the catalog default `field_2166_raw` otherwise. [244] already
  iterates `field_2195_raw`, so N picks = N lines. Nested `if()`s, no `or` operator.
- **No MDF/IDF on the Services form (same day)**: both suites dropped the `{ t: 'mdf', mode: 'opt' }`
  row. A service's location is never used — `groups.js` routes every Services line to the synthetic
  "Project Wide Services" group whatever `field_1946` says (bid-review-v2 `transform.js` the same) —
  so the row only ever read as a requirement. `field_2250_raw` still rides the payload as `[]`
  (`DTO_ARRAY_KEYS`); Make's MDF handling is unchanged (`154.MDFs` = `[""]` → one line, blank MDF).
- **A service WITH a product shows the product everywhere (same day — "onboarding fee")**: the
  onboarding fee is a Services-bucket PRODUCT whose detail lives in the product's catalog description
  (`field_57` → the line item's STORED copy `field_1962`, written by 02.01 at create) with a separate
  labor description (`field_2021` → `field_2020`: the tech plugs in hardware). Every surface used to
  hide the product for services; each now hides it only on a description-only line:
  `worksheet-v2/card.js` `buildRow_services` renders `productCell` (the editable product picker)
  instead of the "Service" tag when `field_1949` is set and labels the fill cell "Labor description"
  (else "Service description"), `buildDetail_services` adds a read-only "Product description"
  (`field_1962`, only when the view serves it and it is populated — Builder: add the column to the
  worksheet grids to see it), the survey row (`buildRow_survey`, view_3505) renders
  `surveyProductCell` when `field_2379` / `field_2627` carry a product; v1 `device-worksheet.js`
  `applyBucketRules` keeps the product (and its bucket chit) for a `hideProduct` rule when the row's
  product cell has text; `SOW_lineitem_conditional-field-grayout.js` (view_3456 replace mode) and
  `SURVEY_lineitem_conditional-field-grayout.js` skip the "SERVICE — …" / "SERVICE" overlay on a
  product cell that has text; the bid items grid's L3 product-name injection never excluded
  services, so it shows the name as soon as the row has one. **Proposal (`proposal-grid-v2.js`)**:
  `hideL3` is now `kind === 'assumptions'` only — a services L3 shows when the product label is
  non-blank (the blank-label gate hides it for description-only lines, which still ride the
  label-less synthetic L3 with qty/cost, as before); `fields.productDesc = 'field_1962'` turns the
  quiet catalog-description sub-row ON (**Builder: `field_1962` must be a column on view_4140 and
  view_3371** — not a probe field, nothing renders until it is) and `productDescKinds: ['services',
  'license']` limits the sub-row to services and licenses (`null` = every product; widening it puts a
  description under every device on every proposal). **Licenses (same day — "licenses need the product
  description on the proposal as well")**: the "Recurring Services or Licenses (billed separately)"
  section (view_3371) lists each license as product name · qty · cost and nothing else, so the catalog
  description is the line's only detail. The License bucket stays `'default'` to `bucketKind` (no
  rendering rule of its own); the gate reads a description-only kind instead — `descKindOf(bucket,
  kind)` → `'license'` when `isLicenseBucket` (id in `licenseBucketIds` = `645554dce6f3a60028362a6a`,
  or a label starting "Licen[cs]e"), else the bucketKind — carried as `bctx.descKind` and read by both
  `productDescOf` call sites (DOM render + publish payload). proposal-pdf-export / the published
  proposal follow the grid payload (`productDesc` on the L3 entry) — the recurring section's PDF rows
  get the same quiet `l4-proddesc` row. **Line structure (same day — "no line breaks here is
  brutal")**: `field_1962` is Knack rich text (one `<p>` per paragraph, `<br>`s, bold, lists) and the
  flat `readText` read ran a six-paragraph license description into one 90-word run. `descHtmlOf(html)`
  keeps the author's lines as limited HTML — block boundaries (`</p>`, `<br>`, `</div>`, headings, list
  edges) → `<br />`, empty paragraphs dropped, `b` / `ul` / `ol` / `li` kept WITHOUT attributes (the
  snapshot rule), every other tag gone, and never a `<br />` beside a list (a list is a block; a break
  next to it reads as a blank line). `productDescRec` finds the record once; `productDescOf` is the
  flat text (payload `productDesc`, the fallback), `productDescHtmlOf` the HTML (the grid's
  `.scw-pg2-l3-desc` row and payload `productDescHtml`); proposal-pdf-export renders `productDescHtml`
  when present (`<b>` → inline-styled span as on labor lines) else the escaped flat text; the e-sign
  manifest's `cellText` turns tags into spaces, so the words never glue across a break. **Reconcile grid** (`bid-review-v2`, same day — "I need to see the
  product description of this service product"): `bid-review/config.js` `sowItemFieldKeys.productDesc =
  'field_1962'`, carried on the transform's SOW item index (`productDesc`, rich text), and `card.js`
  `buildSowCell` renders it as a quiet `__sow-proddesc` line between the product name and the numbers on
  SERVICE rows (`isServiceRow`: bucket id, else a label naming "service") when populated — the labor
  description keeps its own line below. **Builder: view_3921 must carry `field_1962` as a column.**
  Deploy-client-report still skips services by design.
- Tests: the service flows in `tests/worksheet-v2/test-sow-add-item-form.js` and
  `tests/worksheet-v2/test-survey-add-item-form.js` (picker, the three paths, the fold, both POSTs, no
  MDF row, the multi picks: two catalog services hide the sub-bid box, a Custom Service among them
  relabels it, `customServiceId` on the payload); `tests/worksheet-v2/test-service-product.js` (ops / sales / survey rows with and without a
  product, the detail description); `tests/proposal/test-product-desc.js` (the services + licenses gate: the
  productized service's L3 + description sub-row, the equipment product without one, the
  description-only service unchanged, the view_3371 licenses by bucket id and by label, the PDF rows, `descHtmlOf` + the
  `productDescHtml` payload / PDF / manifest / flat-fallback path); `tests/bid-review-v2/test-service-product-desc.js` (the SOW
  cell line: order, rich text, services only, description-only and label-only rows).

## Change request "Remove from bid" can also remove the item from the SOW (2026-10-22) — `bid-review/change-requests.js`

ClickUp 86bcdrp7m ("Can a bid revision request to SVS to remove items from a bid also remove those items
from the SoW?"). Yes, as an OPT-IN per removal, and the SOW half is done by the page on SUBMISSION — not by
Make, not on the sub's acceptance (decided 2026-10-22):
- **Where**: the Remove modal (`openRemoveModal`) carries an **"Also remove this item from SOW <n>"** box,
  offered only when the bid line maps to a SOW line item (`params.sowItemId`; a bid-only line has nothing to
  unlink), with a hint that reads the item's SOW set off the view_3921 model: "It stays on SOW 1628." /
  "It is on no other SOW, so it will be left unassigned — it is not deleted." Re-opening a pending removal
  prefills its note and its choice. The bulk modal (`bid-review-v2/bulk-cr.js`) has the same box under
  "Remove from bid" (`data-remove-sow`, enabled only in removal mode) → `addBulkRemoveFromBid(pkgId, ids,
  note, { removeFromSow })`.
- **The flag** `removeFromSow` (+ `removeFromSowName`) rides the pending item through the draft
  (sessionStorage + `field_2684`), the pending card ("Also leaves SOW 1589 when submitted"), the webhook
  payload (`entry.removeFromSow`, informational — Make does not act on it), the submit HTML and the plain
  text ("Also removed from SOW 1589 when this request was submitted").
- **On submit** (`submitChangeRequest` → `onSent`, on a 200 AND on the CORS-opaque status 0 the module
  already treats as sent): `removeItemsFromSow(items, sowId)` — per item an authoritative GET of the SOW
  line item through view_3921 (`CFG.sowItemsViewKey`), then a PUT of `field_2154` minus this SOW (a no-op
  when it is already off); the tray's "+ Add to this SOW" write in reverse. 2 in flight, 150 ms apart,
  0 / 408 / 429 / 5xx retried ×4 with backoff, a permanent 4xx reported (`UNLINK`, exported as
  `_unlink` for tests). Each landed PUT fires Knack's own `knack-cell-update.view_3921` (`[{key}, record,
  'field_2154']`) so `mirror-connection-sync`'s SOW cascade runs exactly as for an inline edit: accessories
  follow the parent off the SOW, connected devices that no longer share a SOW with it are disconnected.
  Toast: "Removed N items from SOW 1589" or the failures by label with "take them off on the worksheet";
  then the existing refresh schedule re-reads both grids. Nothing is deleted.
- Test: `tests/bid-review-v2/test-cr-remove-from-sow.js` (drives the real module: the box + hints, the
  card / payload / HTML / text, the 2-wide GET → PUT queue, the cell-update dispatch, the status-0 webhook,
  a 500 retry, a 403 report, the already-off no-op).

## Bid / SOW filter choice: per tab, never erased by a rebuild (2026-10-22) — `worksheet-v2/sow-filter.js`

Slack (SVS, survey / bid page view_3505): "as I am reviewing the different variants … Knack is resetting
and switching off the variant I'm on to the other one … just scrolling". Two causes, both in how the
Bid / SOW filter stored its choice:
- **The choice lived in ONE shared localStorage key and was re-read on every rebuild.** The worksheet
  rebuilds with no click (poll.js: every 2 min, every 15 s for 5 min after any record save), and each
  rebuild re-ran `sow-filter.mount` → `loadActive`. Two tabs on the same request (one per variant) share
  the key, so the last tab to click won in BOTH — the other tab flipped on its next tick. Now the live
  choice is PER TAB in `sessionStorage` (survives a reload of that tab); `localStorage` only SEEDS a tab
  that has no choice yet (the last pick made anywhere). An explicit "nothing selected" is stored as `''`
  so another tab's later pick never re-seeds it.
- **`mount` filtered the stored ids against the list visible at that instant and WROTE the result back.**
  The list is only what the models show right then: a variant with no items is listed only through the
  BIDs grid view_3507, so a rebuild while that grid was not rendered (first paint, Knack re-creating it
  after a child page) erased the choice for good — with one bid left the bar went to `only` mode on the
  other bid; later, the chooser. Now a stored id the list lacks is KEPT (display applies the valid
  subset) and the only purge left is an id the page positively knows as a change order on a view that
  hides them. Clicks never carry a stale id along: the pills strip and the context bar's tab / chooser
  build the next choice from the ids listed right now (`sow-context.js` `bind`). `data.js` also
  re-notifies the worksheet when a filter's NAME grid renders (`filterSpec(key).nameViews`, the context
  bar's `listView`), so a choice the list could not show yet applies the moment the grid is there.
- Tests: `tests/worksheet-v2/test-bid-filter-tab-storage.js` (two tabs, fresh-tab seed, grid absent on a
  rebuild, stale id on a click, explicit empty, CO purge); `test-bid-context.js` clears both stores for a
  fresh state.

## Add accessories — multi-select (2026-10-22) — `src/features/worksheet-v2/toolbar.js`

ClickUp 86bb8bhu2 ("need ability to add more than one accessory to products at a time"). The add-accessory
modal (`openMountingBoxModal`, reached from the bulk panel's "Add accessories" and every card's "+ Add" on
the Mounting Hardware line, and reused by the reconcile grid) used to be ONE `<select>`: one product per
round for the selected rows, so a device that needs a bracket, a box and a conduit adapter took three
rounds. It is now a CHECKBOX list — the same compatibility filter (either compatibility list names every
selected row's product), the same bucket grouping and order, a filter box above lists longer than 8 — and
**Add posts ONE call per ticked product** to `MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK` with the unchanged
single-product payload (`productId`, `parentRecordIds`, …; the Make scenario fans out over the parents
itself and did not change). The calls run through the module's capped queue (`runQueue`: 2 in flight,
150 ms apart) with `postWithRetry` (408 / 429 / 5xx back off ×4; a CORS-opaque status 0 counts as delivered
as it always did; a TIMEOUT is not retried — the run may have happened — and is reported as "no response").
Results settle, never reject: when every product lands the dialog closes and the worksheet refetches (twice
for a batch — the later Make runs land after the first read); on a partial failure the dialog stays, the
products that landed are un-ticked and the status names the failures, so "Add" again re-sends only those.
The dialog is inert while sending. Test seams: `ns.toolbar._accQueue` / `_accRetry` / `_accRefresh`.
Test: `tests/worksheet-v2/test-add-accessories-multi.js`.

## Bulk photo ASSIGN modal — v2 "+ Add Photos" (LIVE for @getscw.com 2026-10-16, rev 3) — `src/features/worksheet-v2/photo-assign.js`

Gate: `CONFIG.ALLOWED_DOMAINS` (`['getscw.com']` since 2026-10-16) + `ALLOWED_EMAILS` for one-offs (both
empty = everyone). For allowed users v2 REPLACES the v1 uploader (`REPLACE_V1: true`): the worksheet
toolbar's own "+ Add Photos" opens it (`toolbar.js` asks `ns.photoAssign.replacesV1()`), and each card's
"+ Add Photos" opens it with that DEVICE PRESET (`photos.js` → `open(viewKey, { deviceId })`: every photo
added goes to that device — first open required slot, else new — file names are not consulted, the chips
stay editable, the header says where they go); no second button is injected. Subs and every other domain
keep the v1 button + modal (`bulk-upload.js`), untouched — except the **alongside** lists (2026-10-19):
`ALONGSIDE_DOMAINS` (`['securevisionsolutions.com']`) + `ALONGSIDE_EMAILS` get v2 BESIDE v1 — the second amber
"+ Add Photos (v2)" toolbar button, with the v1 button + modal and the card-level "+ Add Photos" untouched
(`isAlongside()`, which wins over the ALLOWED lists for a user on both; `replacesV1()` is false for them and
the modal header reads "(v2)" without "preview"). `REPLACE_V1: false` restores the 2026-10-14
preview (a second amber "+ Add Photos (v2)" button beside v1). Design: Claude Design canvas
"Bulk Photo Assign v2" (rev 2, 2026-10-14 — the first cut's three modes were replaced by ONE screen;
rev 3 the same day from live feedback: slot rows, no batch rule, zoom, nothing clipped).
- **One screen, no modes**: photo tiles on the left (176px CONTAIN-fit thumbnails — the whole photo,
  never a crop — each with a zoom button that opens a LIGHTBOX inside the dialog: ← → walk the queue,
  Esc back), the worksheet's devices in a rail on the right, always on screen. Every photo is AIMED at
  one or more devices; each destination is a CHIP on the tile (device on line 1, what happens there on
  line 2, full slot names, text wraps) that FILLS an open slot (a DOC_photos record with a type and no
  image, from `ns.photos.extractPhotoRecords`, in the strip's own order) or adds a NEW photo (typed from
  the photo-type catalog, or untyped). A tile with two chips is the old "copy" case: one upload, N writes.
- **The rail says what is open**: each device row (label wraps; the product on its own muted line ONLY
  when the label does not already carry it — `labelCarriesProduct`: the install label of a non-camera
  row is "<product, often truncated> <location>", so the whole name or a 12+ character opening run of
  it counts; groups in MDF/IDF name order; "N open slots · M required · K queued") can unfold one row
  per OPEN slot ("Proposed Mounting Location · required"; "← IMG_1.jpg" when another queued photo
  takes it) and a "+ new photo" row. The slot rows are COLLAPSED by default (2026-10-15): the status
  text is the toggle (sticky for the session once a device's slots were worked), a device a selected
  photo is aimed at opens by itself, and "Show open slots under every device" in the rail header
  persists (`scw:pa:show-slots`). Three gestures, same result: the unaimed tile's FINDER (filters the rail — the
  search box mirrors it, a filtered list says "Showing 3 of 30 · show all", and both clear with it —
  Enter = top hit, Tab walks the unaimed), tick tiles + click a DEVICE row (the first open required
  slot nobody else in the batch fills, else new) or a SLOT row (exactly that slot; a slot takes ONE
  photo) or "+ new photo", or drag a tile / the selection onto any of those rows. The chip menu is the
  per-photo override. The batch-rule select and "Assign in order…" are gone (both read as puzzles).
- **Targets** = the worksheet's hardware (`ns.data.readRecords` minus services / assumptions /
  licenses, minus accessories = the rows the worksheet folds under a parent card — `attachedAccessoryIds`
  is a copy of groups.js `collectAttachedAccessoryIds`, INCLUDING its mutual-parent tie-break: live
  install data has cameras and their mounts naming each other as parent, and a plain "has a parent"
  test dropped every camera with a bracket (2026-10-15) — plus anything in the mounting-hardware
  bucket), label = the one the card shows: `displayLabel` else
  `labelAlt` (install rows often carry only `field_2801` — reading only the display label is why the
  first build matched nothing on a deploy page) else prefix + number. `open()` logs one console line
  ("view_4093: 42 records → 30 photo targets (skipped: services 3, accessories 9)") — read it when a
  device is missing from the rail. Candidates carry `prefix` (letters) + `number`.
- **File-name matching** (`matchFile(name, candidates, ctx)` → `{cand, confidence, via}` | null; canvas
  board 2): tokens = letters + zero-stripped digit runs (i10 / I-10 / I_010 / 0010 all read I,10). A
  whole label in the name = `matched` (longest label wins; two devices at the same length = null); a
  bare number that is UNIQUE among the worksheet's labels = `matched` via `number`; a leading "1"
  read as I (1.10 → I-010) or an unknown sibling prefix (E-003 on an I- page) = `guessed` (applied,
  blue chip, counted as confirmed on Send); a shared number, a known prefix with a missing number, or
  two devices named = null (the tile asks); the number after a camera-roll stem
  (`CONFIG.CAMERA_ROLL_STEMS`: IMG, DSC, PXL, DJI…) is never used. "Re-match" re-reads only rows that
  were aimed by name; hand-aimed rows are never touched.
- **Writes — no API key in the browser**: the binary goes to Knack's asset store with the session
  token (`SCW.photoEditPanel.util.uploadImage`, one asset per photo); a FILL is a view-based PUT of
  the asset id onto the slot record through the scene's save view (`photo-edit-panel.js
  SAVE_VIEWS`) plus a best-effort second PUT (`field_2447` Yes + a `field_2865` history line) that
  never fails the fill; a CREATE posts a byte-less manifest to `MAKE_PHOTO_ASSIGN_WEBHOOK` (LIVE
  2026-10-15; contract in `src/config.js`: `uploadKind: 'photo_assign'`, asset, target kind/record,
  photoType, scope = the v1 upload's parent linkField/recordId, uploadId `<row>:<device>` for
  idempotency, and **`links`** — everything else the page knows, `linksFor(viewKey, rec)`: deploy
  pages → deploymentId + projectId from the route + the install item's source SOW line
  (`field_2819`); the ops project page → projectId + the item's SOW headers (`field_2154` → sowIds,
  sowId when it has one); the sales SOW page → sowId from the route (the page IS one SOW; projectId
  '' — Make reads it off the SOW) + the item's SOW headers; the survey page → surveyId + the
  request's project (`field_2346` on any loaded record) + the survey item's MATCHING SOW line(s)
  (`field_2404`)). The rail also carries a pinned **"… photo — not tied to a device"** row
  (`SCOPE_ID`, labelled Deployment / Project / SOW / Survey photo by page): aimable like a device,
  never matched or grouped, its manifest has `target.kind: 'none'` and the links only. Were the hook
  blank the Send would refuse batches needing a create; fills work without Make. Writes run through
  a 3-wide queue. **Send takes the aimed photos only** — unaimed
  ones stay queued (still carrying their finder) and can be aimed and sent afterwards; the worksheet
  refetches after the batch (again 9s later when Make was sent anything).
  `SCW.bulkUpload.prepareFile` (HEIC → JPEG, downscale) is exported for it.
- **Make side (reworked 2026-10-15)**: the user's duplicate of 20.04 ("… (v2 Modal)", the live hook)
  was rebuilt for the manifests — no base64 / filename matching; the v1 branches are gone from that
  copy (the original 20.04 still serves the v1 uploader). Flow: resend guard (search DOC_photos
  `field_2865` contains uploadId → aggregate → the router runs only when no found history TEXT
  contains the uploadId — never the bundle count, which blocked every create on the first import) →
  router on `target.kind` (case-insensitive)
  (install / SOW line / survey item, each fetching its record for the connections; `none` branches on
  `links.page`: SOW page reads the project off the SOW, survey page off the request, project / deploy
  pages take `links.projectId`). Every create: `field_771` = asset.id, `field_2445` = photoType.id,
  required No, complete Yes, a history line carrying the uploadId. The full mapping lives in the
  `MAKE_PHOTO_ASSIGN_WEBHOOK` comment in `src/config.js`; the blueprint itself is not in the repo.
- **Batch controls + rate limiting (2026-10-16, from the first live batch)**: the grid has **Select
  all N** / **Clear selection** (⌘/Ctrl+A outside a text box = select all) and **shift-click** selects
  the range from the last plain-clicked tile (`anchorRow`; nothing already ticked is dropped). The
  rail has **family pills** — All · Cameras / Readers / Cameras & readers (by product name) · Headend &
  networking · Other equipment, with counts, only when the worksheet carries 2+ families — that
  combine with the search (`railHits`, `candidate.family` from `summary.familyOf`, card fallback;
  "show all" clears both). **Sending locks the dialog** (`.scw-pa.is-sending`: toolbar / grid / rail
  grayed and inert, close box off, `beforeunload` warning) and the footer carries a **progress bar**
  (uploads first, then writes, retry notes). **Writes follow the CLAUDE.md rate-limit rule now**: 2 in
  flight, starts 150 ms apart (`runQueue(tasks, limit, gapMs)`), and every upload / fill PUT / stamp
  PUT / manifest POST goes through `withRetry` — 429 / 408 / 5xx / network backed off
  `RETRY_BASE_MS × 2^(n−1)` + jitter up to `RETRY_ATTEMPTS`, permanent 4xx failing at once (a Make
  webhook 429 counts; a CORS-rejected fetch still counts as delivered). The first batch had lost
  writes after the first few fills: 3 concurrent fills × 2 PUTs each with no retry. A row whose writes
  failed keeps its asset, so Send again re-writes it without a second upload; an unexpected throw
  unlocks the dialog and says so instead of leaving it stuck.
- **Not carried over (yet)**: the IndexedDB queue / resume banner; the phone layout (canvas board 5)
  is a future state; per-destination resume after a partial failure (today the whole row re-sends).
  Test: `tests/worksheet-v2/test-photo-assign-v2.js`.

## Worksheet scope strip (live 2026-10-09) — `src/features/worksheet-v2/summary.js`

The worksheet-v2 grand "Summary" panel is now the **scope strip** (`buildScopeStrip`): one tile
per family filling the width, always open, answering "what is on this proposal?". Families are the
**proposal bucket every line already carries** — there is no product family field and no name
rules: cameras / readers (tile titled Cameras, Readers, or Cameras & readers by product name —
proposals never mix them) with full-width split bars (new drops vs existing cable from
`existCabling`, interior vs exterior, plenum, and QA passed on install), headend & networking and
other equipment listing their **products by name with counts** (how NVRs / switches / antennas
read apart), muted services + licenses (licenses never in the total), and a rose "Removed by
change order" tile on install (same `removedByCo` marker as the cards). **Mounts fold into the
camera tile** as a "N mounts" line. Counts are qty-weighted; assumptions are skipped; money is the
view's own (`buildMoneyOpts`: sub bid / Total / Sub Bid, none on install). Each **MDF/IDF header**
carries its COUNTS ONLY, inline after the group name (`l1ScopeLine`: "6 cameras · 6 mounts · 3
headend · 8 other", muted, ellipsizes first; splits + product names on the hover title; a
removed-by-CO count is the one rose chip) — a chip-per-family line with splits and product lists
was "busy as fuck" on install pages (2026-10-09). The per-group summary panel is no longer
rendered. The old product table lives behind the strip's "Products (N)" disclosure (persisted under
the same `grand` open-state key).
- **Attached accessories**: groups.js hides mounts under their parent card, so the tree never
  carries them. render.js stashes the render's filtered record list (`_scopeRecords`) and passes it
  as `opts.records`; the tiles and header lines count from it (`attachedTo`), while the Products
  table keeps the tree's rows as before. A strip built without `records` falls back to the tree.
- **Tile click** highlights that family's cards (`scw-ws-v2-card--scope-hl`, ids ride on the tile)
  and scrolls to the first — the warning-chip gesture; click again to clear.
- **Bar labels never clip**: each segment is at least its own label's width (`min-width:
  max-content`); the fill's width is the share of the pair and shrinks first when both labels need
  the room. A zero side folds into the other segment's text. Product names wrap (hover = full name).
- **Deploy pages** (view_4093 ops / view_4056 sub) get the strip too: `bom-tray.js` hides only the
  old `.scw-ws-v2-summary` / `.scw-ws-v2-grand-summary` panels, the strip is its own element.
- Design: Claude Design canvas "Worksheet Scope Summary". Test: `tests/worksheet-v2/test-scope-strip.js`.

## SOW context bar (live 2026-10-09) — `src/features/worksheet-v2/sow-context.js`

"Which scope of work am I looking at?" is now unavoidable on the worksheets (RCA, 2026-10-06
revision: the ops project page mixed two SOWs' items, so "22 cameras at the MDF" and "none" were both
true, and nothing said "you are on SW1589 — Alternate"). A **sticky bar above the worksheet banner**:
- **Project page (view_3962, `sowContext: { requireChoice: true }`)**: the bar names the SOW the
  worksheet is filtered to — number, name, badge, line-item count, how many items are shared with
  another scope — and carries the **scope tabs** (one per SOW with its count, "(no SOW)", "All ·
  mixed"); click = only that scope, shift/cmd-click = add. Mixed views (several SOWs or All) turn the
  bar AMBER ("counts and totals combine these scopes"). A project with **2+ SOWs and no stored choice
  waits behind a chooser** ("Which scope of work are you working on?") — everything but the bar is
  hidden until a scope is picked; "Show all … (mixed counts)" is the explicit alternative. The choice
  IS the SOW filter's selection (`sow-filter.js` storage, now per scene + view + **page record id**
  from the route, so one project's choice never carries to the next project); "all" is stored as
  the `__all` sentinel so the chooser doesn't return (`[]` = never chose). The old pills strip is hidden
  on these views (`.scw-ws-v2--sowctx`); its code still drives the filtering (`setActive`,
  `collectSowList` exported).
- **SOW page (view_3586, `sowContext: { page: 'sow', detailView: 'view_3827', siblingsView:
  'view_3869' }`)**: the bar names THIS SOW and the project's other scopes with their badges
  ("1 of 2 scopes on this project · also on this project: SW1334 (Original)").
- **Badges** (no Builder field marks an alternate): among the project's non-CO SOWs the LOWEST SW
  number is **Original**, every other one **Alternate**; an identifier ending in CO (or
  `field_2952` = change order where the grid loads it) is **Change order**, never an alternate.
  Numbers are parsed from the connection identifier (`SW-1589`), the SOW name (`field_2126`) or the
  ID (`field_2122`, `60486704913-SW1589`).
- **Identifiers are bare numbers** as Knack shows them ("1628", "1926CO") — `parseSow` reads those,
  `SW-1589` and the deal-prefixed `60486704913-SW1589`; `token()` keeps the bare label users see.
  "(no SOW)" alone is its own mode (`blank`: "No SOW designated · Unassigned"), never "mixed".
- **Change-order items are VIEW-ONLY on the ops project worksheet** (view_3962 `coItemsReadOnly`,
  2026-10-09): `card.js isCoLocked` — a line item whose `field_2154` lists a CO SOW (identifier CO
  suffix, or the SOW grid's Type `field_2952` via `sowContext.isChangeOrderRef`) gets the full lock
  (`lockCardFields` `lockAll`: no whitelist), no bulk-select box, the lock in the trash slot, a
  "CHANGE ORDER · VIEW ONLY" flag and a detail note; the context bar's CO tabs / chooser options
  say "view only" and a single CO scope reads "Viewing … View only". COs are edited on their own
  scene (view_4079 + co-ops-lock). Test: `tests/worksheet-v2/test-co-items-readonly.js`.
- **Change orders are NOT SERVED on the ops project worksheet** (2026-10-13, `sowContext:
  { hideChangeOrders: true }` on view_3962): `sow-filter.js` `collectSowList` drops CO SOWs (CO
  suffix on the identifier / name, or the SOW grid's Type `field_2952`) from the pills / tabs /
  chooser, and `visibleRecords` drops every line item whose SOW connections are ALL change orders
  before the selection filter runs (`filterRecords`, the context bar's counts). An item on a base
  SOW AND a CO stays (base scope) and is still view-only (`coItemsReadOnly`); `collectSowList(vk,
  { includeCo: true })` is the unfiltered list `sowContext.isChangeOrderRef` recognises CO ids
  from. A stored selection naming only a CO is discarded on mount (the chooser returns). The add
  modal's "Which SOW(s)?" list skips COs on such views (`sow-add-item-form.js` `isCoSow`;
  the reconcile host carries `hideChangeOrders: true` in `HOSTS`). COs are drafted / priced /
  signed on their own scene (view_4079). Builder can also filter view_3325 / view_3918 to
  "Type is not change order"; the bundle does not depend on it.
- The scope strip's meta line leads with `describe(viewKey)` ("on 1589 (alternate)" / "across 2
  scopes, mixed"). Sticky offset follows the project header's pinned bar (`#scw-phn-bar`).
- **Bid context on the survey / bid worksheet (view_3505, scene_1140 — 2026-10-16)**: the same bar
  for a survey request's BIDS, via a per-view VOCABULARY in sow-context.js (`VOCAB.sow` / `VOCAB.bid`,
  picked by `sowContext.kind`) — not a second module. view_3505 carries `sowContext: { kind: 'bid',
  requireChoice: true, listView: 'view_3507', idField: 'field_2414', nameField: 'field_2636',
  statusField: 'field_2550', pdfField: 'field_2626' }`. The bar names the bid being worked on (BD-n ·
  friendly name · **Base / Variant** — the SOW rule on the BD number: lowest = Base, the rest Variant,
  what "Create Variant Bid" makes · the BIDs grid's status text as a chip, else **Submitted** when the
  grid shows a bid PDF), bid TABS with the friendly name + count, "(no bid)" (items taken off every
  bid: "Not on any bid · Unassigned"), "All · mixed" (amber), and the chooser "Which bid are you working
  on?" when the request has 2+ bids and nothing is stored. The choice IS the Bid filter's selection
  (`sow-filter.js` filterPills on `field_2415`, stored per scene + view + request id); the pills strip
  hides under the bar as on the SOW pages; `describe()` feeds the scope strip ("on BD-1 (base)"). The
  bar's connection field comes from `sowFilter.filterSpec(viewKey).fieldKey` (SOW `field_2154` by
  default), never from `cfg.fields().sow`. **`filterPills.listAll` + `labelField`** (view_3505): the Bid
  list also takes every row of the name grids (view_3507) that no item connects to yet, so a freshly
  created variant bid has a pill / tab / chooser option with 0 items and a stored choice of it is not
  dropped as stale. New mode `only` (one scope / bid on the page): the bar states it calmly — white, no
  tabs, no chooser — where it used to carry the amber "all" styling. `statusField` reads only when
  view_3507 serves that column (Builder: add Bid status `field_2550` to view_3507 for the chip).
- Tests: `tests/worksheet-v2/test-sow-context.js`, `tests/worksheet-v2/test-bid-context.js`.

## Reconcile Bids header rework (live 2026-10-09) — `src/features/bid-review-v2/header.js`

The top of the reconcile-bids page (scene_1155, bid-review-v2) reworked per the canvas boards 7–9
("Worksheet Scope Summary"): **one band, one party**. Kill switch `CONFIG.headerRework`
(bid-review-v2/config.js) — off = the old stacked layout, untouched.
- **SOW tabs** (`.scw-bid-review-v2__sowtabs`, container level above the toolbar): ONE SOW at a time —
  the number as Knack shows it + **Original / Alternate / Change order** badge (same rule as the
  worksheet context bar: lowest non-CO SW number = Original; CO suffix or view_3918's `field_2952`
  = Change order; `SCW.worksheetV2.sowContext.classify` when loaded, local fallback otherwise), the
  full SOW name on its own line (✎ on the active tab = inline rename, committed through v1's hidden
  SOW Name input + its `change`), the scope counts ("2 cameras · 1 mount · 1 headend", from
  `SCW.worksheetV2.summary.aggregateScope` over `ns.lastSowItems`, stashed by render.js), the state
  line (✓ reviewed / ● basis chosen / ○ pick a basis bid · N gaps · N change requests queued · N bids
  in) and "N of M scopes reviewed". The synthetic no-SOW grid is the **"Unmatched bid items"** tab.
  Choice persists in `scw:br-v2:sow-tab:<scene>:<project id from the route>`; default = the
  Original. Inactive sections are `display:none`; section fold (the navy header click) is OFF
  under the tabs (init.js reads `data-scw-br-v2-tabs`) and a persisted fold is cleared.
- **Status line** = the old navy SOW header restyled (same element, so the warning chips keep
  their row-scoped click): "Scope summary ▸" (the worksheet scope strip for this SOW, built on
  first open from the grid's groups + SOW items, no money; a tile click highlights that family's
  ROWS, `tr.scw-bid-review-v2__row--scope-hl`) + the aggregate warning chips. Name / meta /
  Collapse all hidden (the tab is the identity; the toolbar has Expand/Collapse).
- **Column cards**: the four head bands (title / totals / details / actions) stay four `<tr>`s —
  CSS reads them as one card per column. Existing elements are MOVED, never rebuilt (same classes +
  `data-action`, so init.js's delegated click still routes to v1's handlers). SCW's card: the diff
  bar's basis `<select>` (`.scw-sbd-baseline`) moves into `.scw-bid-review-v2__basis-slot` (the
  complete picker incl. K1 / Request a K2 bid / Save as basis), then survey costs / margin /
  proposal, then **Next step**: a MIRROR of the diff bar's readiness (`.scw-sbd-ready` → `__ready`,
  "— auto-saved" trimmed) ahead of Preview Proposal. Each sub card: a **radio** that sets the basis
  (bridged: sets the select + dispatches ONE `change`, so sub-bid-diff persists `field_2942` and
  basis-filter repaints exactly as for a dropdown pick), BASIS badge + navy top rule, basis-filter's
  "Show all bids (+N)" pill (untouched), `−$X under the SOW` / `+$X over the SOW` (amber either way;
  signed + worded since 2026-10-22, ClickUp 86bchp573 — it read `$X off the SOW` before) or
  `✓ matches the SOW` (card.js `pkgTotalsCell`), status · PDF · Reopen Bid on one line, the gap count
  (mirror of `.scw-sbd-bargap`, basis card only; click unfolds the diff panel), then "N change
  requests queued for <sub>, not sent yet" over ONE primary — `cr_preview` relabelled **"Review &
  send to <sub>"** (the Preview Change Request modal's Submit is the send; `cr_submit` is hidden)
  or, with nothing queued, `cr_bulk_selected` as "Request changes on selected…" — and a **⋮ menu**
  (Set as basis bid · Open bid PDF · Request changes on selected rows… · Discard the N queued
  requests · Update SOW to match this bid… · Create a new SOW from this bid…). Mirrors re-sync from
  a MutationObserver on the body (the diff bar re-renders its own innerHTML on its own schedule;
  `syncAll` is idempotent and `takeRecords()` swallows its own moves).
- **No basis = every bid column shows** (the radios are the picker; basis-filter `modeFor` returns
  `none` under the rework). K1 still folds the sub-bid side away. Once a basis is chosen only that
  column shows, as before.
- **Documents** stay their own row under the cards (card.js already mounts `bar.docs` there);
  the **Line item / Photos labels** are a thin `tr.scw-bid-review-v2__collabels` row directly above
  the line items (after the docs row) that also names each column; its bid cells carry
  `__pkg-col` + `data-pkg-id` so basis-filter / column-collapse fold them with the column. The two
  rowspan corner cells stay (table-layout: fixed needs them for widths) and read blank.
- The diff bar keeps only its fold handle; the exceptions list + reviewer note are as they were.
- **Change orders are NOT SERVED on the reconcile page** (2026-10-13, `bid-review-v2/config.js`
  `hideChangeOrders: true`): `transform.js` `dropChangeOrders` runs first in `buildState` —
  CO SOW ids come from the CO suffix on any SOW ref and from view_3918's Type column
  (`coIdsFromGrid`) — and removes every SOW line item and bid record whose SOW membership
  (own `field_2154` ∪ the related line item's) is non-empty and all change orders, so they never
  become "Unmatched bid items" or removed rows; `extractSows` / `unionSowsFromItems` skip CO refs
  a kept (mixed) record still names. `ns.transform.isChangeOrderSow(ref)` is the shared test —
  `sow-item-tray.js` ignores CO memberships and leaves CO-only items out of the tray. COs are
  reconciled on their own scene. Test: `tests/bid-review-v2/test-hide-change-orders.js`.
- Test: `tests/bid-review-v2/test-header-rework.js`.

## Reconcile grid: every bid line not on this SOW is a row (live 2026-10-16)

With a basis bid chosen, **every** basis-bid line whose line item (`field_2404`) is not on the SOW
being reviewed renders as a grid row — whether that line item lives on ANOTHER SOW or on none
(`bid-review-v2/transform.js`: both `otherKind` values, `other-sow` and `bid-only`, carry
`needsSow: true` and flow through the same basis-filter husk routing into `groupRows`; before, the
other-sow rows only fed the column totals and the tray, so 13 of Bid 8's priced lines had no row on
SOW 1105 — they were on 1684). Nothing is gated on the bid package's `field_2387`; no "wrong SOW" /
"errant" copy anywhere — the row is the sub's priced line, and the two actions are the remedies.
- **SOW cell** (`card.js` `buildSowCell`, any `needsSow` row): the EMPTY shape (`--empty` +
  `--off-sow` + `--not-on-sow`), the dash, one context line — `Not on this SOW. On 1684.`
  (`otherSowNames` joined) / `Not on any SOW.` — then `Remove from bid | + Add to this SOW`
  (destructive first). Never the other SOW's line details in the blue cut-out. Remove is
  `cell_remove_from_bid` on the SOW's basis column when the row has a cell there (else its first
  bid), carrying that cell's bid record id for v1's `resolveBidTarget`. A husk parked in the
  Removed subgroup (cells only on basis-hidden columns) shows the line, no actions. **Bid cell**: a
  rose `Not on this SOW` badge (`__no-bid-badge--not-on-sow`) on both kinds; its own Revise /
  Re-link / Remove stay. The old `__sow-elsewhere` "on 1684" line is gone.
- **Two add writes** by `row.addMode`: `create` (bid-only) = the existing `row_add_to_sow` CR
  (Make creates the line item and re-points the bid record); `union` (other-sow, button reads
  `+ Add to this SOW (also)`) = `row_add_item_to_sow`, routed by `bid-review-v2/init.js` to
  `SCW.sowItemTray.addToSow(itemId, sowId, btn)` — the tray's union PUT of `field_2154` through
  view_3921 (never replace: the item keeps 1684 and gains 1105), then `data.refetchAll()` and the
  row rebuilds as a matched row. One PUT per click, no queue needed.
- **Diff panel** (`sub-bid-diff`): the orphan tier / tally / PDF stat read `Not on this SOW`; the
  row note says where (`on 1684` / `on no SOW`, now stored on the `field_2941` snapshot so a PDF
  rebuilt from it keeps it; older blobs fall back to `on no SOW`); the `$0 → covered` suppression
  no longer applies to a line scoped on another SOW. Panel rows jump to the new grid rows
  (`jumpAttr 'bid'`, the row's `data-row-id` is the bid record id).
- **Tray** (`sow-item-tray.js`): items on one of the section's bids are grid rows now, so
  `buildGroups` leaves them out (a group emptied by that is dropped); the "on this bid" badges and
  the open-by-default-when-on-bid rule are gone. The tray is only the lines NO bid here prices.
- Accepted consequence: a bid assigned to two SOWs shows each line on both grids — matched on the
  owner, "Not on this SOW" on the other. Test: `tests/bid-review-v2/test-not-on-sow-rows.js`.

## Sales change request: the SOW rides with the request (2026-10-21) — `src/features/sales-change-request/`

"When sales puts in a revision request it does not allow us to choose which scope of work the
revision goes on, and even if we enter the revision on the alternate, it comes through as the original
scope of work." The first half is the design: the request is scoped to the SOW PAGE the rep is on
(`state.js` `sowIdFromHash`, `…/scope-of-work-details/<sowId>/` on the sales build page), there is no
picker. The second half is a shared-line-item effect: "Create Alternate SOW" / Share puts ONE line item
on two SOWs (`field_2154` lists both), so a revision record that only points at the line item
(`field_2708` / `field_2644`) renders on BOTH SOW pages and under BOTH SOW tabs of the reconcile
grid — the Original opens first, and that read as "it came through on the original". The envelope has
carried `sowId` + `sowLabel` since 2026-09-15 (7a2b836f), but the per-item JSON a revision line stores
(`field_2696`) did not, so nothing downstream could tell. Now:
- `payload.js` stamps `sowId` + `sowLabel` on EVERY item (so each stored revision line's JSON carries
  the SOW it was raised on) and the combined HTML header reads "For SOW 1980" (plain text already did);
  `ns.sowDisplayLabel` is exported. `render.js`'s bar reads "N pending changes · for SOW 1980" and
  `submit.js`'s confirm names the SOW.
- `state.js` `revisionOnThisSow(rev)`: a submitted revision whose JSON names a DIFFERENT SOW is not
  this page's — `revision-inject.js` (v1 strips) and `render-v2.js` (card strips) skip it; rows with no
  SOW on record (older revisions) show wherever their item renders, as before.
- `sales-revision-column.js` (reconcile page): pending cards, the per-item cell history and the
  per-SOW history strip place a revision by `json.sowId` when it has one (`forSection` /
  `raisedOnSow`), else by its row; the card reads "Raised on SOW 1980" and the history head carries a
  "SOW 1980" chip. Test seams: `SCW.salesRevHistory._setRevisionData` / `injectIntoV2` / `forSection`.
- **Make (jlbup3qu…, the sales CR scenario) is the half the bundle cannot fix**: whatever it writes
  as the SOW of the BID_revision request / line items must come from the payload's `sowId` (envelope,
  and now every `items[].sowId`), never be derived from the line item's `field_2154` — on a shared
  item that connection lists the original first. Verify there if the record itself still says the
  original.
- Tests: `tests/sow-page/test-sales-cr-sow-scope.js`, `tests/bid-review-v2/test-revision-sow-scope.js`.

**The actual leak, found the same day ("the payload came across as 1642" from a rep who was on 1980):
the hash is not the page.** Knack NESTS a page under the page it was opened from, so hopping from SOW A
to SOW B inside the app (the context bar's "also on this project" link, the other-SOWs grid) leaves
`…/scope-of-work-details/<A>/scope-of-work-details/<B>` (seen in the 2026-10 page dumps), and every
first-match read of the hash returned A — the page the rep LEFT. The sales CR filed against A, kept its
draft on A's `field_2707`, and `autoRevertValidation` revoked A's release. Fixed in three ways:
- `state.js` `resolveSowRecordId`: the page's SOW comes from a SOW-bound SINGLE-RECORD view on the scene
  first (`CFG.sowRecordViews` view_3827 / view_3841 / view_3418, then any details / form view whose
  `model.view.source.object` is the SOW object `CFG.sowObject` = object_106 — Knack renders the scene for
  the record at the END of the chain, so those models hold the SOW on screen), and only then the hash,
  taking the DEEPEST `scope-of-work-details/<id>`.
- The same first-match bug in every other reader on these pages: `bulk-upload.js` `getRecordId` and
  `worksheet-v2/toolbar.js`'s upload contexts (photos uploaded on B linked to A), `jotform-embed-sow-
  photos.js`, the three `buildSowBasePath` sales patterns (toolbar / photos / card: greedy through nested
  SOW segments, else every child page — edit photo, add accessory — opened under A and dropped the user
  back on A), and the "second 24-hex token" reads in `survey-request-sow-link.js`,
  `survey-request-cards.js`, `survey-request-form.js`. `photo-assign.js` `routeIdsOf` and
  `sow-add-item-form.js` `currentSowId` already took the last segment.
- Rule going forward: **never take the FIRST match of a page slug in the hash.** Prefer the page's own
  record view; when the hash is all there is, take the deepest occurrence of the slug.

## SOW cascade: a parent's SOW edit never moves its connected devices (2026-10-22)

ClickUp 86bcjbxwp ("URGENT: Removing a switch/NVR from a SOW removes its linked cameras too"). The
SOW cascade in `mirror-connection-sync.js` (`knack-cell-update … -sow` handler; instances view_3610 /
view_3962 / view_3921 / view_4079 / view_4112, `SOW_FIELD` = `field_2154`) used to RE-ALIGN every
connected device (a child whose `field_2197` names the parent) that sat on a SOW the parent no longer
included to the parent's exact new set (7a2b836f, 2026-09-15: "keep its children on the parent's
SOW"). So taking a switch off ONE of two SOWs ([A,B] → [B]) rewrote every camera on A to [B] — the
cameras vanished from SOW A. (A parent cleared to [] already left devices alone.) Now:
- **Connected devices' SOW membership is never written by the cascade.** For each child (found by
  back-pointer AND by the parent's `field_1957` list) with an authoritative SOW read: shares a SOW
  with the parent's new set → untouched; shares none → **disconnected** — its `field_2197` cleared
  and it is dropped from the parent's `field_1957` (two mirrored fields, both written through the
  capped queue, local models patched), so it stays in its SOW's scope wearing the "disconnected"
  warning. An unverifiable child SOW read is left alone. A cleared parent disconnects every
  judgeable child. **Behaviour change on a MOVE** ([A] → [B]): the cameras used to be dragged
  along; now they stay on A, disconnected — the user re-connects them on B's worksheet if that was
  the intent.
- **Accessories are unchanged**: they still mirror the parent's exact set (empty included); the
  accessory-SOW reconcile sweep is unchanged.
- **Recovery** — `bid-review-v2/sow-drop-audit.js`, console only, on a project's Reconcile Bids
  page: `SCW.sowAudit.scan()` lists every "Not on this SOW" row whose line item is a connected
  device (back-pointer or a parent's list), with the parent and whether it is on that SOW;
  `scan({ all: true })` lists every off-SOW line; `SCW.sowAudit.restore()` / `restore(sowId)`
  union-adds them through `SCW.sowItemTray.addToSow` (the item keeps its other SOWs), one write
  every 400 ms. The grid's own "+ Add to this SOW (also)" button is the same write per row. Bid lines
  are the signal: a camera dropped from A still has its bid line on A.
- Tests: `tests/misc/test-sow-cascade-connected-devices.js` (the real module's view_3962 instance:
  removal, clear, add, move), `tests/bid-review-v2/test-sow-drop-audit.js`.

## Three "it doesn't go anywhere" fixes from #install-operations-tools (2026-10-22)

Thread https://securitycw.slack.com/archives/C02TSSJKKU2/p1792615081468539 (Lee, Gil). Three separate
bugs, one symptom family: a click that should open / scroll to something did nothing or jumped.
- **Deploy page "Change Orders" row jumped onto the worksheet's scope strip** (`deploy-page-nav.js`).
  `moveChangeOrders` moved the bare CO grid into the strip above the worksheet and waited for the
  accordion engine's NEXT render pass to wrap it; meanwhile `collectTargets` listed the strip itself
  (`kind: 'co'`) and the row's click fell through `openDrawer` to `scrollIntoView` on a container
  that is `visibility: hidden; max-height: 0` for 2.5 s (`scw-deploy-prewrap`) — so the viewport landed
  on the next element, the scope strip. The engine wraps only on Knack render events, never on the nav's
  heartbeat: when the CO grid was the last view to render the row stayed broken for the whole visit
  (hence "intermittent", gone after a reload). A second variant: the engine had wrapped the grid first
  and the move ripped the bare grid out, leaving an empty "Change orders" shell (a second row, an empty
  drawer). Now the grid moves WITH its wrapper when it has one, a bare grid is wrapped on the spot
  (`wrapNow` → `SCW.ktlAccordion.refresh()`, whose `enhance()` ends in `enhanceStandalone()`), the
  fallback row only exists while no CO section does, `openDrawer` re-resolves a `kind: 'co'` target at
  click time (`liveTarget` → `findCoAcc`, the strip's wrapper first), and nothing scrolls to an element
  with no box (`hasBox`). Test: `tests/deploy-page/test-co-row-live-target.js`.
- **Scope-strip tiles whose cards sit in a closed group did nothing** (Gil 2026-10-16, "the box for
  Licenses doesn't go anywhere"; Lee's "tab to the right in Build SOW" is the same rightmost tile).
  `highlightScopeFamily` (`worksheet-v2/init.js`) highlighted the cards and `scrollIntoView`'d the
  first — which has no box inside a collapsed L1 (groups default closed above 30 records, `state.js`
  `DEFAULT_OPEN_THRESHOLD`; the synthetic Licenses group is last and never opened) or inside the
  collapsed Removed-by-CO subgroup. It now runs `applyScopeHighlight`, which opens the holding group
  through `ns.summary.revealCard(card)` (the REAL head click, so the state persists, like the
  warning-chip handler always did) and re-queries after the toggle before scrolling. Test: the
  revealCard block in `tests/worksheet-v2/test-scope-strip.js`.
- **Proposal preview said "select the basis bid" over a basis the reconcile page showed** (Lee
  2026-10-22). The stepper (`ops-stepper.js`) gates Publish Final on the SOW RECORD (view_3861:
  `field_2942` / the `field_2941` snapshot); the reconcile page can show a basis the record lacks:
  (1) the **Builder-assigned soft default** (REL_SOW `field_2387` on the bid package) — shown, compared,
  deliberately unsaved (`isDefaulted`) — used to wear the plain BASIS badge and read "✓ Reviewed";
  (2) a basis picked seconds before Preview Proposal whose lone PUT was still landing or got a silent
  429; (3) the stepper read the DOM once and never re-checked. Now: `sub-bid-diff/render.js`
  readiness reads `needs-basis` "Default bid shown — save it as the basis" for a default (never ready),
  `writeBasis` runs through `putWithRetry` (429 / 408 / 5xx / network backed off ×4, `_basisRetry` for
  tests) and a final failure shows "⚠ basis NOT saved (HTTP n)" with a Retry (`basisWriteErr`,
  `basisWriteError()` / `isSavingBasis()` / `isDefaulted()` exported on `ns.render`);
  `bid-review-v2/header.js` renders the default as an amber "Default · not saved" badge, keeps the
  radio label as "Save as basis" (the ⋮ item "Save as basis bid"), says "○ default bid shown · not
  saved as basis" on the tab, and a click on the already-checked radio (no change event) saves it via
  the picker's own Save-as-basis button (`setBasis` default path); `ops-stepper.js` re-reads the SOW
  record once (view-scoped GET, 2.5 s after a BLOCKED render, `scheduleAutoRecheck`) and offers a
  **Re-check** button on the blocked banner — the fresh record outranks the DOM for the basis and the
  snapshot (`freshRecord` / `basisPresent` / `basisLabel`). Tests:
  `tests/bid-review-v2/test-basis-write-retry.js`, the defaulted block in
  `tests/bid-review-v2/test-header-rework.js`, `tests/misc/test-ops-stepper-recheck.js`.

## Reconcile page scroll guard + render diary (2026-10-20)

"The Reconcile Bid page repeatedly jumps to the top" (ILJIN, then Sonaca; paired `'message'` /
`'setTimeout'` console violations every few seconds with no user action). Every source view on
scene_1155 is a HIDDEN Knack grid: when one re-renders after a `model.fetch` (ours, a cascade's, a
truncation repair's, anything Knack-side) Knack's own deferred post-render scroll fires, and a hidden
grid's offset is the top of the page. Two changes and a diagnostic:
- `bid-review-v2/data.js` arms the row-anchored capture-early / restore-late guard
  (`SCW.v2ScrollAnchor.guard`, the one worksheet-v2 arms on its source-view renders) on every
  source-view `knack-view-render` and before every fetch it issues (`refetchAll`, truncation
  repair), anchored on `.scw-bid-review-v2__row[data-row-id]`. A user gesture cancels it, and the
  deliberate jumps (scope tiles, warning chips, diff-panel row jumps) call
  `SCW.v2ScrollAnchor.cancel()` first so the guard never chases them back.
- v1 `bid-review/init.js` `ensureFullPage` is bounded: one push to 1000 rows per view instance, and
  only when the dropdown offers 1000. Unbounded, a dropdown that could not take the value re-triggered
  `change` on every render — a silent fetch → render → scroll loop.
- **Diagnostics**: `localStorage.scwScrollSpy = '1'` + reload. `_scroll-spy.js` is back in the bundle
  (opt-in, zero cost when disarmed: traces every programmatic scroll with a stack and logs no-gesture
  jumps with the active element); data.js logs every source-view render (`view_3680 render — 812
  records, 2.4s since its last render`), render.js every `REBUILD — N section(s) reused, M rebuilt —
  trigger: view_3921 render`, and `[scw-v2-guard]` lines say what the guard saw and did. A view
  re-rendering on its own every few seconds names the loop: a fetch loop in a module bound to its
  render — never KTL, which is gone from the app. `SCW.traceChurn('view_3680')` (util.js) names the
  fetcher directly: it wraps that view's `model.fetch` for 8 s and logs every call WITH its caller
  stack. The 2026-10-20 deep dive below lists every fetcher on the scene.

**Root cause found 2026-10-21 (console capture, build `52c83ad0`, spy armed): the jump is the BROWSER'S
SCROLL CLAMP, not a scroll call.** Twenty "JUMP UP … → 261 (no user gesture)" lines, every one right after a
`[scw-br-v2] REBUILD`, and not one traced `scrollTo` / `scrollBy` / `scrollTop` for them — the spy patches
every scroll API, so nothing scrolled. 261 = (1263 − ~1000): the scene WITHOUT the grid measured 1263px on
first paint, and a 1000px viewport clamps to 261 when the document is that short. `render.js`
`renderSnapshot` made the page that short twice per rebuild: reused sections were moved into a fragment one
by one (`frag.appendChild(ex)` DETACHES them) before the swap, and fresh sections had no
`scw-bid-review-v2__sow--active` class until `header.afterRender` ran last — under the tabs CSS every
section without it is `display:none`. Any layout flush inside either window (the `reopenExpandedRows`
`offsetParent` probe runs right there; the diary's `pageYOffset` read when the spy is on) laid the page out
at ~1260px and Chrome clamped scrollY to it; the grid came back, the scroll did not. The row guard could not
help: the user was reading the header cards, so no grid row was in view ("arm SKIPPED — no visible anchor
row", on every one of them) — and a skipped arm left `_guardUntil` set, so the next renders only logged
"re-arm → window extended" against a guard that never ran. Fixes, all in the same task as the rebuild:
- `render.js`: `SCW.v2ScrollAnchor.floor()` before the DOM is touched (body min-height = the pre-rebuild
  scrollHeight for 1.5 s, released by a gesture — a short intermediate layout can no longer clamp); fresh
  sections get the active class at BUILD time when `header.activeSowId()` knows it; `swapChildren` replaces
  the body's children in one pass with no layout read in between and does nothing when the sections are
  unchanged (a fully reused render leaves the DOM alone); the REBUILD diary moved after the swap and now
  carries `floor NNNNpx` / `off (at top)` and `sections swapped` / `DOM untouched`.
- `_v2-scroll-anchor.js` `guard()`: with no row in view it arms a **pixel hold** ("armed (pixel hold)
  y=6700") — a no-gesture displacement > 120px is put back while the old position is still reachable; the
  same fallback runs when the anchor row is gone or hidden after the rebuild; `mousedown` / `touchstart`
  cancel the guard like wheel / touch / keys (a fold or expand the user clicked is never "corrected"); an arm
  skipped at the top of the page resets the window; `floor()` is exported.
- Test: `tests/bid-review-v2/test-render-scroll-clamp.js` (real render.js + anchor module under jsdom).

## Reconcile page re-render sources — deep dive (2026-10-20, build `1b0019bb`)

**KTL is not on the page.** It was removed from the application entirely; no `_ar` auto-refresh
exists anywhere. A Knack view re-renders only after a `model.fetch()` — Knack's own (per-page / sort /
filter / inline-edit handlers) or a bundle module's — so a repaint "with no user action" always has a
fetch caller in this bundle. The console pair the report showed is one cycle: the long `'message'`
handler in Knack's app file is Knack-side deferred render work for a hidden source grid (plus every
bundle handler bound synchronously to its `knack-view-render`), and the ~70 ms `'setTimeout'` handler
at minified line 1126 is `bid-review-v2/data.js` `notifyDebounced` rebuilding the reconcile grid after
it — the minifier keeps one module per line and the `[scw-br-v2]` strings sit on that line.

Every `model.fetch()`, per-page `change` and synthetic `knack-view-render` reachable on scene_1155
was read. None is unbounded; the sustained "loop" is a long load-time burst on a project whose data has
drifted, and each step re-rendered a hidden grid, which scrolled the page to the top until the
scroll guard above. The sources, and what changed:
- **Knack per-page push** — `change-record-limit.js` (once per view element) and v1 `bid-review/init.js`
  `ensureFullPage` (once per view instance since 688e7d93; every per-page dropdown in this app offers
  1000, so the earlier unbounded version converged too). The first view to render on the scene is the
  one the `.any` prefilter cannot stamp before its fetch — hence the `view_3680_page=1` URL param: one
  extra fetch of view_3680 per scene load.
- **Truncation repair** — `bid-review-v2/data.js` `repairTruncated`: ≤2 refetches per view per page
  lifetime, only while loaded < server total.
- **Calc-field nudge** — `calc-field-nudge.js` on view_3921: up to 2 sweeps per load (40 records, then
  sticky per browser for 30 days). Each sweep used to end in a FULL `model.fetch()` of the hidden grid;
  it now re-reads only the nudged records (view-scoped GETs → `SCW.syncKnackModel`) and notifies the
  consumers (`SCW.worksheetV2.data.notify`, `SCW.bidReviewV2.data.notifyDebounced`) — no native
  re-render. `readbackDelayMs` in its CONFIG.
- **Accessory-SOW reconcile sweep** — `mirror-connection-sync.js` (view_3921 instance, accessories from
  view_3927), 1.5 s after every render of either view: one silent repair PUT per accessory whose
  `field_2154` set differs from its parent's (once per accessory+set per load). Its `cascadeEnd` fired
  `scw-cascade-idle`, and the reconcile data layer answered with `refetchAll()` — SIX hidden grids
  refetched and re-rendered on every load of a drifted project — plus the worksheet data layer's own
  refetch of its views. Now a batch with no loud (user) write dispatches the idle with
  `detail.silent = true`; the sweep patches the accessory's local model copies on success
  (`patchLocalAccessorySow`) and both data layers rebuild from the models instead of refetching.
- **After a save** (user action, unchanged): `scw-ws-v2-record-saved` → `refetchAll()`; a loud cascade →
  `refetchAll()` + the worksheet refetch; `refetchNextStepView` after margin / survey-cost / SOW-name
  saves; the diff panel's snapshot auto-save is a PUT only (signature-guarded, never a fetch).
- **Not on this scene**: worksheet-v2 `poll.js` (view_3921 has no worksheet config entry), the
  ops-review pill, the CO stage strip and the stepper polls — their views are absent here, so their
  ticks fetch nothing.
- **Still open**: view_3927 (the accessories grid) is not in `change-record-limit.js`, so it loads 25
  rows (Builder default); the sweep and `transform.js`'s bracket back-connections see only those.
Tests: `tests/bid-review-v2/test-cascade-idle-silent.js`, `tests/misc/test-calc-nudge-readback.js`.

## Reviewer note on the reconcile page — durable save (2026-10-20) — `src/features/sub-bid-diff/render.js`

"The reviewer note is not reliably saving." The note rides the `field_2941` snapshot blob (written
through view_3918 with the diff + `field_2942`), and it used to persist ONLY on the textarea's blur.
Three ways text was lost, all fixed: (1) a data tick rebuilt the SOW section while the reviewer typed
— `bid-review-v2/render.js` `hasFocusInPanel` did not count the note textarea as mid-edit, the
textarea was replaced with no blur, and everything typed after that went nowhere; it now defers the
rebuild for `data-scw-sbd-note` too. (2) A SOW whose basis is only the Builder-assigned soft default
never wrote a blob (`isDefaulted` — the award must stay a human gesture) while the bar still said
"saves automatically". It now writes a **note-only blob** (`buildBlobWith`: `basisBidId: ''`,
`noteOnly: true`, `defaultBidId`, no fragments, no `field_2942`), so the note lands while the publish
gate and the award gesture stay exactly as they were; it is written only when the note differs from
the persisted one (a load with nothing typed writes nothing, and an older full blob is never downgraded
on its own). Save-as-basis / a pick then builds the full blob and carries the note forward. (3) Another
tab with a stale snapshot wrote its blob, stale note included, over a fresh one. Now:
- every keystroke is kept in `noteByGrid` AND a per-device draft (`localStorage` `scwSbdNoteDraft`,
  14-day TTL; resumed by `currentNote` when nothing is persisted) and persisted after a 1.5 s idle
  (`scheduleNoteSave` → the same guarded `autoSave`); blur still saves at once;
- `writeSnapshotWith` re-reads the record first (view-scoped GET) and, when this tab has no
  in-session note edit, keeps the server's note over the model's stale copy; on success it mirrors the
  blob onto the local model (`patchLocalSnapshot`) and retires the draft / in-session copy, so the
  textarea never reverts to an older note;
- failures back off (2 s … 60 s, six tries; a 400/403/404 stops at once) and show in the status line
  (`noteStatusHtml`, refreshed in place by `refreshNoteStatus` so a focused textarea is never rebuilt)
  instead of the old render → autoSave → 400 ms retry loop;
- `persistedSnapshot` parses the verbatim JSON first and only then entity-decodes or strips tags —
  a `<` typed into a note used to make the old strip-first parser swallow the blob up to the next `>`
  inside `bidHtml`, so a saved note read back as nothing after a reload.
Test: `tests/bid-review-v2/test-reviewer-note-save.js` (drives the real module: idle save, draft,
cross-tab merge, backoff, tolerant parse, defaulted basis).

## Client deployment report (preview, 2026-10-21) — `src/features/deploy-client-report.js`

"Turn the deployment page into a client-facing deliverable, like the survey report: devices, device
info, photos." A **"Deployment Report"** button in the install worksheet's toolbar CTA group on the
ops Manage Deployment page (scene_1311 / view_4093), gated by `CONFIG.ALLOWED_EMAILS`
(micah.shearer, ben.larue and jon.carter @getscw.com while in preview; empty = everyone on the scene; the scene is watched
with a MutationObserver so the button survives every toolbar rebuild). The click opens a new tab
synchronously (pop-up blockers stay quiet), builds the report from the data already on the page,
writes it into the tab and calls `print()` — the user saves as PDF (the document title, which the browser uses as the file name, reads
"Project <number> - <client> - Deployment report"). No Make, no API key, nothing is written to
Knack. Mockup: Claude Design canvas "Client Deployment Report".
- **Data** (`collect`): the worksheet's records (`SCW.worksheetV2.data.readRecords`) grouped with the
  worksheet's OWN `groups.buildGroupTree`, so the pages follow the worksheet — locations alphabetical
  (numeric-aware), within a location proposal-bucket sort order then label; photos from
  `photos.extractPhotoRecords` (every photo with an image, typed or not — decided 2026-10-21; empty
  slots never print); the per-device configuration answers from `SCW.deliverables` (the active
  fields of the item's schema, answers from `field_2932`; a label or key matching
  `CONFIG.CONFIG_EXCLUDE` — password, PIN, credential, token… — never prints); the attached
  accessories from the back-pointer `field_2853`, split by bucket into the card's "Mount" line
  (mounting hardware) and "Accessories" line (anything else attached, e.g. a recorder's hard
  drives; `SHOW_MOUNTS` / `SHOW_ACCESSORIES`) — an attached item is never a card and never counts
  in a tile; the install status `field_2825` is read but NOT printed
  (`STATUS_CHIP: 'none'` — the field is not maintained; the first live run read "NOT STARTED" on
  every installed camera; `'done'` / `'all'` turn the chip back on); a cable line that is ONLY
  "New drop" / "Existing cable" (length,
  interior / exterior, plenum and conduit struck from the client copy, 2026-10-21); the project
  number through `SCW.projectId.resolve` + `banner` / `footer` (house rule: the number prints
  first); the project name off `field_4`; client and address by label off any details view on the
  scene; location names tidied (`cleanLocation`: "HEADEND: : 019 - …" → "HEADEND: 019 - …"); the
  site map images off view_3942 (site-maps-strip rules; a PDF plan is named, not embedded).
- **Pages**: cover (scope tiles counted from the devices that get cards, qty-weighted — the
  aggregate is only asked whether the family reads Cameras or Readers, never both; headend &
  network; other equipment = the Other Equipment bucket, never mounting hardware; MDF / IDF
  locations = the worksheet's location groups with at least one installed device; photos), one page per site map image, one page per location with
  THREE cards to a Letter page (compact head, one-column facts, four contain-fit photos to a row,
  a card never split across pages), the **network map, DRAWN, on ONE page** (`networkLayout`,
  rendered as absolutely placed nodes over one SVG of lines: the recorder is the hub at the top
  left, a trunk runs down from it, one branch per switch in location order with that switch's
  devices in a cluster box of chips beside it, the hub's own cameras as a "Direct connections"
  row, a shaded band per location, cameras with no connection in an amber band at the end; a
  drawing taller than the page is scaled down to fit, to 55 %). The tree comes from `buildNetwork`
  (a child's own Connected To `field_2821` wins, a parent's Connected Devices `field_2820` adopts
  only a child that names no parent — the worksheet's authoritative union). `IMPLY_UPLINKS`: when
  the deployment has exactly ONE recorder (`isRecorder`: the PRODUCT name reads NVR / DVR /
  recorder / network video — never the label, which carries the location: "… 019 - Server Room"
  once made a switch the hub) and a switch records no uplink, the switch hangs off the recorder by a DASHED line and the
  legend says the uplink is not recorded on the device — the first live run (one NVR recording
  nothing, six switches recording no uplink) otherwise drew six unrelated switches and no
  recorder. Then the items removed by change order (`field_2967`, "CO 1781" from the identifier)
  and the device index.
- **Never printed**: SCW notes, labor descriptions, pricing, sub names, QA notes, edit history,
  services, assumptions, licenses, mounts as rows of their own.
- **Photo weight (first live run 2026-10-21: 71 photos, an 18 MB PDF)**: the browser can redraw a
  photo smaller only when the image host allows cross-origin reads, and Knack's asset hosts did
  not. `resolvePhoto` now tries BOTH addresses of an asset (`hostForms`: the api.knack.com
  download endpoint, then the S3 path) with `crossOrigin`; a success is redrawn to
  `PHOTO_MAX_DIM` (800 px JPEG) and embedded as data; when neither loads the photo prints from
  Knack's thumbnail derivative (`PHOTO_FALLBACK_STYLE` `thumb_14`, the app's 300 px style, via
  `SCW.knackImgThumb`, with the full-size file as the `<img>` onerror fallback), and only when
  there is no derivative at full size. Photos are `object-fit: contain` (the whole photo, and no
  re-rasterised crop in the PDF). The report tab's bar and `report.photoStats` say how many went
  each way — read that line when a PDF comes out big. `PHOTO_MAX_DIM: 0` embeds the URLs untouched.
- **Not built (v2 of the 2026-10-21 estimate)**: a Make path — POST the same HTML, render the PDF,
  store it as a DOC_files record so it lists under Files, email it to the client. A larger Knack
  thumbnail style on the DOC_photos image field would lift the no-CORS print quality above 300 px.
- Test: `tests/deploy-page/test-client-report.js` (real worksheet-v2 config / card / groups / summary
  modules under the report; the gate, the re-mount, the order, the facts, the network tree, the
  print tab).

## Margin-low recovery on the reconcile page — `src/features/bid-review/margin.js` (2026-10-16)

The "Margin is low" block under a SOW's Next step (v1 `buildSowStatusBar`, mounted in the v2
header; the same block on the ops SOW list via `ops-review-pill.js`) offers "Add Project
Management & Mobilization line item" and "Increase project margin to X%". Three things changed:
- **The number lives once** — `SCW.bidReview.margin.target(subBidTotal, surveyCosts, opts)`.
  House model (calc-install-fee-adjustment.js): project margin `field_2158` is a GROSS margin,
  install fee = sub bid / (1 − m), and the margin on labor Knack shows (`field_2749`) is what is
  left after survey costs: `m − (C/S)(1 − m)`; the target that lands at `marginRecoveryTarget`
  (12%) is `(t + C/S)/(1 + C/S)`. When view_3918's row also carries the current project margin
  the row's own numbers pick the model (gross vs plain markup `fee = S(1 + m)`) before inverting;
  a row fitting neither logs the four numbers once (read `field_2749`'s formula in Builder). The
  written decimal is the labelled percent; the button tooltip spells out the inputs.
- **The write is a verified view-based PUT** (`margin.save`) through the hidden update form
  `marginWriteView` (view_3923): to the SOW the button names when that form edits SOW records,
  else to the record the form is bound to ("Update Installation Project" → the page's project —
  the toast says so). A 200 whose record does not echo the value reads as "field not editable on
  the view". No form submit, no page reload (the old flow's jQuery value/change never reached the
  form's model, so its watchdog reloaded an unchanged page). The pre-2026-10-16 form-submit flow
  stays as the fallback when the PUT cannot reach the record (4xx / no record).
- **Live refresh**: v2's SOW section signature now includes `nextStepRowSignature(sowId)` (the
  view_3918 row's text), so the refetch every save already fires (survey costs, margin, PM line)
  rebuilds that SOW's header — margin, warning, button targets — instead of reusing the stale one.
- Test: `tests/bid-review-v2/test-margin-recovery.js`.

## Alternative SOWs: Share vs Consolidate (view_3869) — `src/features/import-unique-items-btn.js`

On the SOW page, view_3869 lists the project's OTHER SOWs. Per row: "Add (N) unique items"
(N = that SOW's line items not on the current SOW, from the hidden all-items grid view_3913;
`field_2154` is the multi-connection to SOW headers), or "Delete SW-x" when N = 0. Above the
grid: "Add (N) unique items from other SOWs" and "Consolidate K SOWs into this one". Every modal
makes the user pick an intent and spells out what it leaves behind (this replaced a buried
"also delete" checkbox that users read as a move, 2026-10-08):
- **Share** (default): link the selected items onto this SOW. The source SOW KEEPS them — one line
  item on both SOWs, so edits, margin and pricing changes apply to both (the same idiom as the
  bid-review tray's "+ Add to this SOW" and Create Alternate SOW's link mode).
- **Consolidate**: link EVERY unique item, then DELETE the source SOW(s); Knack drops a deleted
  record's connections, so the items end up on this SOW only. Offered ONLY when NO survey has been
  requested anywhere on the project (`surveyBlockers`: this SOW's `field_2706`, its project-wide
  count `field_2728` on view_3827, any row in the SURVEY_requests grid view_4155, each source SOW's
  `field_2706`) — surveyed scope has bids attached — otherwise the tile / bar button / 0-unique
  "Delete" button read unavailable naming the blocker. The checklist locks to everything (a partial
  consolidate orphans the unticked items). Bulk consolidate takes every other SOW on the project,
  including ones with nothing unique; change-order SOWs (`field_2952`) are never included —
  Builder must expose `field_2952` on view_3869 (or filter COs out of it) for that guard to see them.
- Both fire `MAKE_IMPORT_UNIQUE_ITEMS_WEBHOOK` with `mode: 'share' | 'consolidate'` (contract in
  `src/config.js`); Make links `uniqueItemIds` and deletes `deleteSourceIds`. Whether the scenario
  acts on `deleteSourceIds` has to be verified in Make — the client never deletes anything itself.
- Test: `tests/sow-page/test-share-consolidate.js`.

## Scene veil (load gating) — `src/features/scene-veil.js`

Heavy ops scenes are hidden behind a spinner until Knack's render stream goes quiet (600ms)
AND the page's transform markers exist (scene_1085: worksheet-v2 panel on view_3962 past its
"Waiting…" placeholder, `#scw-pid-hero`, the view_3901 header card, an accordion shell;
scene_1155: bid-review-v2 panel + hero). Caps: 6s from first render, 3s after the scene's own
render event, 10s event-independent watchdog that force-reveals and logs the missing markers.
Add a scene by adding a `SCENES` entry — pick markers that exist on EVERY record of that
scene or the page waits for the cap. scene_1116 keeps its original veil in `scene-tweaks.js`.
`change-record-limit.js` forces its listed grids to the full record set: set the per-page dropdown
to 1000 when the grid has one; otherwise (view_4031, the customer questionnaire grid) PAGE THROUGH —
GET pages 2..N at Knack's own page size on the grid's own request address (`model.url()`, which
carries the parent-record crumb), `data.add` the records, re-fire `knack-view-render` so the model
consumers rebuild. Every bigger-page lever is proven dead on a dropdown-less grid (2026-10-05..07):
`model.view.rows_per_page` + `model.fetch()`, an `$.ajaxPrefilter` (Knack's requests bypass the
page's jQuery), and `view_XXXX_per_page=1000` in the page address all came back 100 of 142 — with
the dropdown disabled in Builder, Knack serves its configured page size. Once per view instance.
Tests: `tests/scene-veil/`.

## Project Number badge (HubSpot deal id) — `src/features/project-id-badge.js`

The "Project Number" is the project's HubSpot deal id (`field_1622`). It is what a tech
quotes to SCW tech support, so it renders FIRST on every sub-facing scene (scene_1353 /
scene_1374 / scene_1140) and the ops scenes, and at the top of every bundle-built document.
`SCW.projectId.resolve(sceneId)` reads `field_1622` off any loaded record or rendered detail,
else derives it from the SOW / survey identifier prefix (`60486704913-SW1163`,
`62610818596-SR168` — flagged `derived`), else renders "not on this record" (never blank, never
a guess). `SCW.projectId.banner(id, {right, phone})` / `.footer(id, right)` are the inline-styled
document fragments — every new document builder must call them (proposal-pdf-export,
co-stage-strip request doc, survey-worksheet-pdf-export, sow-pdf-stepper, questionnaire
printable already do). `buildPublishPayload` ships `projectNumber` (and ops-stepper's
`PUBLISH_KEYS` carries it) for the Make-side templates. Builder: adding `field_1622` to a view a
scene loads makes that scene's read authoritative. Test: `tests/project-id/test-badge.js`.

**Project header navigation** (`src/features/project-header-nav.js`, 2026-10-02): Knack's project menu
(`view_44`) is folded into the hero as a tab strip — the menu's REAL anchors move into
`#scw-pid-hero .scw-pid-foot` (routing + Builder renames intact), `K2:` prefixes stripped, the three
workflow stages numbered in order, Dashboard behind a hairline, everything else under "More"; the
project header card's `.scw-bsh-top` is adopted into the hero's `.scw-pid-adopt` slot (deal-id suffix
stripped from the title) so the name is said once; a 48px bar with the number + cloned tabs pins on
scroll (the badge's pill is switched off via `SCW.projectId.CONFIG.stickyPill`). `view_44` stays in the
DOM hidden as the source of truth; a Knack menu rebuild is re-adopted. The badge re-renders ONLY its
`.scw-pid-own` block so the adopt slot and footer survive data refreshes. Supersedes
`nav-knack2-highlight.js` (deleted). Test: `tests/project-id/test-header-nav.js`.

## Security & External Services

### ⚠️ Third-party image-resize proxy (proposal PDF Site Maps)

`proposal-pdf-export.js` routes **Site Map floorplan images through a
public third-party CDN, `images.weserv.nl`**, to resize them before they
land in the published PDF. This is a deliberate, user-approved tradeoff —
**do not extend it to other images or remove the warnings without asking.**

- **Where:** `toProxyResizeUrl()` + the `proxyResize` option on the
  `view_3928` entry in `SCENES[...].appendImageViews`. Only assets that are
  DOM-rendered map images (`fromDom`) get proxied; the File-field map and
  the `field_771` photos do **not**.
- **Why it exists:** Site Map floorplans live in Knack **File fields**, which
  (a) can't have server-side thumbnails, and (b) are served from an S3 host
  that sends **no CORS headers**, so they taint a `<canvas>` and cannot be
  downscaled in the browser. Confirmed by byte-identical embedded images
  across builds. The proxy is the only way to shrink them while keeping the
  "just send the HTML" pipeline (no Knack thumbnail config, no Make resize
  steps). A 12 MB / 4364px floorplan becomes a ~2000px JPEG well under 1 MB.
- **The vulnerability / data-exposure to be aware of:** the floorplan image
  URL is handed to `images.weserv.nl`, which fetches and may **cache** it on
  its infrastructure. These are **camera-placement diagrams** of customer
  facilities — more sensitive than a logo. The Knack asset URLs are already
  public-but-unguessable, but routing them through a third party widens the
  exposure surface and adds an **availability dependency** (if weserv is
  down, those images break in newly-generated PDFs). It is **not** an
  authenticated/private channel.
- **If you need to remove the third-party dependency:** the only
  alternatives are resizing inside the Make scenario (server-side, keeps
  data in the Knack→Make pipeline, but extra Make steps) or self-hosting an
  equivalent resize proxy.

## Coding Standards

- **ES5-compatible** syntax for the most part (`var`, `function`, no arrow functions in older modules), though newer modules use `const`/`let` and template literals
- **jQuery** (`$`) is available globally (provided by Knack)
- **No module system** — everything is global via `window.SCW` or IIFE-scoped
- **Tests**: no framework, but `tests/` holds plain-node **jsdom smoke tests** for the deploy-page modules (`cd tests && npm install && npm test`). Add one next to a module you change there and keep them green before a push. Everything else is tested manually against the live Knack app
- **No linter** — no ESLint/Prettier config. Follow existing style in each file
- Use `!important` sparingly in CSS, but it's often necessary to override Knack's inline styles
- Comment headers use banner-style delimiters: `/*** FEATURE NAME ***/`
- Config objects at the top of each file — keep logic generic, keep config specific
- **Button ordering**: destructive/negative action first, positive/primary action last. Examples: Edit | Cancel, Reject | Accept, Cancel | Submit. The primary action is always the rightmost button.
- **Read-only / locked fields** (convention updated 2026-07-15): when programmatically making a field non-editable, keep it fully readable — no reduced opacity, no graying out — but **strip ALL input chrome so it reads as plain text**: `pointer-events: none`, `readOnly = true`, `background: transparent`, `border-color: transparent`, `box-shadow: none` (selects also get `appearance: none` and an explicit text color so UA disabled-graying doesn't apply). A white input box on a locked field makes readers think they should be able to edit it — never leave the box visible. Reference implementations: `worksheet-v2/styles.js` `.scw-ws-v2--readonly` / `.scw-ws-v2-card--locked` blocks, `co-sub-lock.js` / `co-ops-lock.js` header-form + MDF rules.

## Context Hygiene (Read This First)

**Never `Read` `dist/knack-bundle.js` in full.** The built bundle is ~1 MB / ~28 k lines and is nothing more than a `cat`-concatenation of every `src/` file in `build.sh` order. Reading it end-to-end wastes a huge amount of context for zero additional information vs. reading the source.

- **To understand a feature:** open the relevant `src/features/*.js` file directly. Use `Grep` over `src/` to locate a symbol, then `Read` the specific source file it lives in.
- **If you genuinely need to inspect the built artifact** (e.g. verifying a release build): use `Read` with a narrow `offset`/`limit`, or `Grep` with `dist/knack-bundle.js` as the path. Do not `Read` it without a limit.
- **Never** dump `dist/knack-bundle.js` into a subagent prompt or pipe it through `cat`/`Bash`. Treat it as a binary build artifact.
- **To diff built vs. source:** don't. Rebuild with `bash build.sh` and check `git status` / `git diff -- dist/knack-bundle.js`.

The same principle applies to **git history** on this repo — it can dump enormous amounts of text into context if invoked carelessly:

- `git log -p` with no path filter or `-n` limit produces **~20 MB** of output on this repo. Never run it unscoped.
- To find a commit: `git log --all --oneline | grep <term>` (~40 KB total, instant).
- To inspect a specific commit: `git show --stat <sha>` first, then `git show <sha> -- <path>` for a targeted diff.
- To search history for a string: `git log --all -S '<string>' --oneline` — stays small.
- Always exclude `dist/knack-bundle.js` from history-wide diffs: append `-- . ':(exclude)dist/knack-bundle.js'`.

## Avoid Idle Timeouts

**Never spend more than ~30 seconds thinking before producing output.** For large file rewrites, break them into multiple sequential Edit calls instead of one massive Write. If a file needs 10+ changes, do 3-4 Edits per message rather than rewriting the whole file at once. Silence kills the stream — interleave tool calls to keep output flowing.

## Work Fast (Avoid Design Thrash)

This is a **copy-paste-and-modify codebase, not a design space.** Every feature follows the same skeleton: IIFE wrapper + `CONFIG`/`VIEWS` constant at top + `SCW.onViewRender` / `SCW.onSceneRender` binding + idempotent init + unique-ID CSS injection. There is no test framework, no linter, and no type system. Planning phases do not catch bugs here — manual testing against the live Knack app does. **Bias hard toward producing a diff the user can look at.**

1. **Copy the closest sibling feature.** Grid work → start from `bid-items-grid.js` or `proposal-grid.js`. Worksheet work → `device-worksheet.js`. Collapsible-table work → `group-collapse.js`. Match file layout, naming, event namespacing, and the CSS injection idiom. Do not redesign the module shape — it's already decided.
2. **Read each file once, in full.** For files under ~1500 lines, call `Read` with no `offset`/`limit` and be done. Reading overlapping chunks of the same file wastes context and usually means you're re-searching instead of building a mental model. (The explicit exception is `dist/knack-bundle.js` — see Context Hygiene.)
3. **Commit to one approach before you write code.** Do not enumerate alternatives in assistant text ("we could do X, or Y, or Z…"). Pick the option with the smallest diff against existing code and write it. If two approaches look equal, the one that matches the nearest sibling feature wins by default.
4. **Refactor with `Write`, not a chain of `Edit`s.** For anything larger than a couple of lines, produce the finished source in one `Write`, then `bash build.sh`, then commit. Don't narrate the design — write the code.
5. **Don't ask questions the codebase already answers.** "Where should X live?" is almost always "a new file under `src/features/`, wired into `build.sh` in dependency order, matching the nearest sibling." "What should the API look like?" is almost always "whatever the sibling feature exposes on `window.SCW`." Check before asking.
6. **When stuck, ship the smaller version.** A real visible diff beats a perfect plan. Land the obvious 80% behind the same `CONFIG` shape and stop. You can expand it in a follow-up once the user has seen it working.
7. **Status updates live inside a turn, not across turns.** There is no background timer and no way to wake yourself between user messages. If you need to give progress signals, interleave them with tool calls in a single turn — don't promise to "check back in five minutes."

## Common Pitfalls

- **dist/knack-bundle.js must be rebuilt** after any source change. Run `bash build.sh`.
- **build.sh file order** is the include order. Dependencies must come first.
- **Knack re-renders the entire view** after inline edits. Features must be idempotent and handle re-initialization gracefully.
- **KTL (Knack Toolkit Library) is GONE.** It was removed from the application entirely (confirmed
  2026-10-20). Nothing on any page is KTL: no `_ar` auto-refresh keywords, no KTL accordions, no KTL
  hide/show buttons. The `ktl-*` module names (`ktl-accordion.js`, `ktl-hide-show-state.js`), the
  `.scw-ktl-accordion` class and the `window.ktlKeywords` reads are historical — the bundle's own
  accordion engine owns every section and the keyword readers fall back to the Knack model.
  **Never attribute a re-render, auto-refresh or repaint to KTL when diagnosing**: every view
  re-render is a `model.fetch()` from Knack's own handlers or from a bundle module (`SCW.traceChurn`
  names the caller). `knack-snippets/ktl-loader-gate.snippet.js` is retired, kept for history only.
- **`save.sh` excludes dist/** — use it for source-only commits during development. Only `release.sh` includes the built bundle.

## Known Issues (TODO)

### 1. Bid comparison grid does not refresh after change request submission
- **Location**: `src/features/bid-review/change-requests.js` → `submitChangeRequest()`
- **Symptom**: After submitting a change request on the bid review page (scene_1155), the comparison grid does not rebuild to reflect the new CR. User must manually refresh.
- **What we tried**: Calling `ns.refresh()` (full data refetch + grid rebuild) on success, on CORS-fallback (status 0), and unconditionally after 3s. None worked.
- **Suspected root cause**: Unknown. The webhook to Make returns 200 + `{success: true}`, but the grid doesn't update. May be a deeper issue with how `runPipeline` / `loadRawData` interacts with the page state after a CR submission, or the Knack views may not have fresh data yet. Needs console logging in `runPipeline` to confirm it's even being called and whether `loadRawData` returns updated records.

### 2. "Generating subcontractor bid PDF…" poll message doesn't stop on webhook completion
- **Location**: `src/features/proposal-pdf-export.js` → `startPollRefresh()`
- **Symptom**: After form submission on view_3679 (which fires a webhook and redirects to parent page scene_1140), the blue "Generating subcontractor bid PDF…" toast and field overlay persist. The 60s timeout DOES eventually stop it, but it should stop sooner when the PDF is actually ready.
- **How it works**: Poll stores flags in sessionStorage before redirect. On parent page scene render, it starts polling view_3507 every 4s via `Knack.views[viewId].model.fetch()`. It watches for `field_2626` (PDF file field) text content to change from its initial value.
- **What we tried**: Added direct field check in setInterval (not just on view re-render). The 60s timeout works, but the field change detection doesn't fire before timeout.
- **Suspected root cause**: Either `model.fetch()` isn't causing the view to re-render (the accordion wrapper may interfere), or Make's PDF generation takes longer than 60s, or the PDF filename doesn't change (same version uploaded). Needs console logging to check: (a) whether `model.fetch()` actually fires, (b) what `readFieldText` returns each poll cycle, (c) whether the field value genuinely changes after Make processes.

### 3. Edit Revision modal needs field/choice rules (TEMPORARILY DISABLED)
- **Location**: `src/features/bid-revision-inject.js` → `openEditModal()`
- **Status**: Edit button is disabled. The modal opens and prefills revised values correctly (from `data.fields`), but it doesn't apply the right field visibility and choice rules based on the product/bucket type. For example, connection options, cabling fields, and chip choices don't match what the worksheet shows for that product.
- **What's needed**: The edit modal should mirror the same field visibility, connection option filtering, and chip/select choices that the device worksheet (view_3505/view_3313) uses for the same record's bucket type. This likely means reading the proposal bucket from the revision data and applying the same `bucketOverride` / `bucketRules` logic that `device-worksheet.js` uses.
- **What works**: Prefill from `data.fields` is correct. Save writes to field_2687/2688/2695/2696 correctly. The HTML card rebuilds on save.

### 4. Stale field references: `field_1968` (MCB) and `field_2462` (Cat) on view_3313
- **Status**: Both references **commented out** in `device-worksheet.js` view_3313 cam/reader config. Confirmed 2026-04-19: these fields do not exist on Site Survey / Survey Line Item objects (the object view_3313 renders).
- **`field_2462`** actually lives on the **DTO_create scope line items** object and is used legitimately by the three DTO-form visibility modules below. It was a stale reference on view_3313 only (the cell never rendered because `findCell` returned null for a field key not in the view's columns).
- **`field_1968`** (MCB) could not be located on any object; only referenced on view_3313. Likely entirely stale.
- **Locations left commented out** (safe to delete outright in a future cleanup):
  - `src/features/device-worksheet.js` — view_3313 cam/reader `fields.mountCableBoth` (field_1968) and `fields.laborCategory` (field_2462), plus both names removed from `summaryLayout`.
- **Locations with field_2462 restored** (confirmed real on DTO_create scope line items):
  - `src/features/bucket-field-visibility_add-survey-bid-item.js`
  - `src/features/SOW-line-item-DTO-bucket-field-visibility.js`
  - `src/features/SOW-line-item-DTO-bucket-field-visibility_view_3451.js`
- **Follow-up**: (a) watch view_3313 for missing MCB / Cat columns — no breakage expected since the fields weren't resolving anyway; (b) after a few days of clean usage, delete the two commented `// mountCableBoth:` and `// laborCategory:` lines in `device-worksheet.js` and the stale `TODO(field_1968/field_2462)` comments above them.

### 5. scene_1116 perf follow-ups (INP 496ms, CLS 0.16)
- **Status**: Current metrics are a big improvement from starting point (INP 3,600ms → 496ms, CLS 0.60 → 0.16) but both are still in Google's "needs improvement" band. Further optimization is deferred, not attempted.
- **INP → green (<200ms)**: remaining main-thread work lives outside `device-worksheet` — `group-collapse`, `inline-photo-row`, `dynamic-cell-colors`, etc., all fire on the same `knack-view-render.view_3586` event. Candidates for deferral via `requestIdleCallback`: `inline-photo-row`, `dynamic-cell-colors`. `group-collapse` must run before first paint (state-dependent visibility).
- **CLS → green (<0.1)**: remaining 0.0079 cluster is the workflow stepper — `div.scw-ktl-accordion.scw-step-disabled` + `a#scw-step-review-final-proposal.scw-step-action.is-disabled` resizing when `is-disabled` resolves late. Fix would be a `min-width` / `min-height` on `.scw-step-action` (or `.scw-ktl-accordion`) so the disabled-state visual doesn't change the layout box.
- **Checkbox-click INP in field_1957 picker (~408ms)**: already down from 1,544ms via `contain: layout style` on the multi-col container and a narrowed observer scope (commit 721058d). The remaining ~400ms is almost certainly Knack's own change-handler on the connection popover — updating internal form state, re-evaluating validation, refreshing whatever live-value indicator the popover shows. Further reduction would require intercepting / monkey-patching Knack's connection picker handler, which is brittle (Knack-internal surface). Not worth pursuing unless this specific interaction becomes a major daily pain. Diagnostic next step if re-attempted: DevTools Performance recording on a single checkbox click — the call tree will show whether time is in Knack's bundle, style/layout, or something else we can actually reach.
- **Warning — do NOT naively re-try chunking `transformView`**: commit 567d975 split Phase 2 into rAF chunks and regressed INP to 4,400ms in live testing because there's no in-flight guard and `knack-view-render` fires repeatedly on this scene (filter changes, cross-view refreshes from `refresh-on-inline-edit.js`). Multiple `transformView` runs end up overlapping, each stacking its own rAF queue and its own `finalize()` pass. If chunking is attempted again, it needs (a) per-view in-flight guard that cancels or skips concurrent runs, (b) a shared `finalize()` that isn't re-run per overlapping call, and (c) testing under real event storms (filter changes, cell edits) not just first load.

### 6. Tighten ops-stepper "Processing…" pill polling cadence
- **Location**: `src/features/ops-review-pill.js` → `POLL_INTERVAL_MS` (currently `5 * 1000`) and `schedulePoll()` / `pollOnce()` flow.
- **Symptom**: after an Ops action fires (Mark Ready / Request Alt Bid / Publish Proposal), Make's webhook returns `{success: true}` immediately because the scenario also generates a PDF and can't hold the connection for 40+s. The build-SOW page reloads, view_3325's pill shows "Processing X…" with the spinner, and then *waits up to 5s* per poll cycle to detect the underlying fields flipping. Users sit on the spinner longer than the actual Make work takes.
- **Why we can't just wait for the webhook**: PDF generation may exceed Make's 40s webhook-response timeout. Webhook Response module has to fire early; client-side polling has to bridge the gap until the SOW's flag fields actually update.
- **Recommended fix (adaptive)**: poll fast (1.5s) for the first ~15s of the pending window — covers the bulk of cases — then back off to 5s baseline. Plus: when `transform()` first sees a row in pending state on a fresh page load, schedule a 500ms first poll instead of waiting a full interval (handles the "Make finished a hair before reload" case).
- **Cheaper variant**: drop `POLL_INTERVAL_MS` from 5000 to 2000 flat. One-line change. Worst-case detection latency 2s instead of 5s. Knack rate limit is ~10 req/s; 2 fetches per cycle (`view_3325` + `view_3885`) every 2s is comfortably under budget.
- **Why deferred**: this is UX polish on a flow that already works. Ship the simple flat-interval change first if/when it bubbles up as a real complaint; only do adaptive if PDF gen times stay long.

### 7. SOW filter pills above view_3610 (Scope of Work Line Items grid)
- **Goal**: a row in this grid can connect to one or more SOWs via `field_2154` (e.g. the same line item is in `SW-1001` AND `SW-1060`). Currently you have to scroll/scan to figure out which SOW a row belongs to. Add a quick-filter strip above the grid: one pill per unique SOW (label = SW-####), plus a "Show All" pill. Clicking a SOW pill hides rows that don't connect to that SOW; "Show All" resets.
- **DOM contract for `field_2154`**: each cell looks like
  ```html
  <td class="field_2154 ..." data-field-key="field_2154">
    <span class="col-1">
      <span class="69dd0f8333dbe73a5cdfc652" data-kn="connection-value">SW-1001</span><br>
      <span class="69ea62103a04f2f006dde85c" data-kn="connection-value">SW-1060</span>
    </span>
  </td>
  ```
  The 24-hex `class` on each inner span is the SOW record id; `textContent` is the display label. Empty cells have `&nbsp;` only.
- **Where to read SOWs**: prefer `Knack.views.view_3610.model.data.models[*].field_2154_raw` — that's an array of `{id, identifier}` per row, fully reliable. DOM scrape is the fallback if the model isn't populated yet.
- **Where to inject the pill strip**: above the table, beneath the existing `.kn-records-nav` / `Add filters` / per-page block. Look at how `bulk-delete-confirm.js` mounts the moved button cluster on `#bulkOpsControlsDiv-view_3610` for the right insertion-point pattern.
- **Filtering implementation**: the safest approach is row-level `display:none` on:
  - the data row (`tr[data-scw-worksheet="1"]`)
  - the paired worksheet card row (`tr.scw-ws-row` with the matching record id)
  - the paired inline-photo row (`tr.scw-inline-photo-row`)
  Each "logical row" in this grid is actually a triplet of `<tr>` elements — they need to hide together. Group-collapse already coordinates `display:none` on these triplets; mirror its `rowsUntilNextRelevantGroup` pattern. Group headers (`tr.kn-table-group`) should auto-hide when none of their children are visible.
- **Coexistence with group-collapse exclusive accordion**: view_3610 is `exclusive: true`, so only one MDF/IDF L1 group is open at a time. The SOW filter is orthogonal to the group accordion — applying both is "row must be visible per accordion AND match SOW filter." Pills should not flip the accordion state; group-collapse should not clobber the filter when re-enhancing.
- **Sibling to copy from**: `bid-items-grid.js` for header-strip injection idiom; `group-collapse.js` for triplet/row-pairing logic.
- **Stretch**: persist last-selected SOW per view in `localStorage` keyed by sceneId (matches group-collapse's `storageKey` convention). Empty-default = Show All.

### 8. Device worksheet renders broken after add-via-modal redirect to parent
- **Symptom**: when a record is added through a Knack modal that redirects back to a parent page hosting a device worksheet view (e.g. view_3610 on the Build SOWs page), the page loads with malformed worksheet rows: empty `<tr class="scw-ws-row">` shells (id + `data-scw-view-id` set but no `<td>` content), and worksheet card text content extruded into Knack-side `tr.kn-table-group` rows. `scw-acc-count` and Knack's "Showing 1-N of N" both report the correct record count, so the data is loaded — only the DOM transform is wrong.
- **Trigger**: post-modal redirect fires a fresh `knack-view-render.view_3610` while the model is mid-populate. `device-worksheet.js`'s `transformView` runs against an incomplete DOM — the source `<tr data-scw-worksheet="1">` rows aren't fully populated yet, so `card` comes back empty, the wsTr is appended without content, and Knack's grouping then buckets the empty wsTr's row identity into surrounding group headers using whatever neighbouring text it finds.
- **Workaround**: hard-reload the parent page after a modal-add redirect. Subsequent renders are correct because the source `<tr>`s are fully present before `transformView` fires.
- **Suspected fix shape**: in `device-worksheet.js`, before building each wsTr, verify the source `<tr>` actually contains the cells the card needs (e.g. `tr.querySelector('td.field_XXXX')` returns a populated cell, not just `&nbsp;`). If not, skip and let the next `knack-view-render` retry. Add an in-flight guard so a second `transformView` doesn't run on top of an in-progress first pass — see Known Issue #5's warning about chunked `transformView` regressing under event storms (filter changes, cell edits, redirects all stack).
- **Related**: same root class as #5 (perf follow-ups). The chunked-transform attempt referenced in #5 also produces incomplete DOM under event storms; the fix here would help both.

### 9. L1 accordion theming system needs a rethink (HIGH PRIORITY)
- **Status**: Multiple attempts to "just change the L1 colour" on the device worksheet have all looked half-painted — a "color + CSS" tweak isn't a one-property change because the L1 styling is wired into a small system with several coupled pieces.
- **What's coupled**:
  - **Per-row accent variable.** `group-collapse.js` sets `--scw-grp-accent` and `--scw-grp-accent-rgb` on each L1 `<tr>` in JS (orange default `#ed8326`, or HSV-extracted colour from `extract-hsv-color.js`, or a per-view override from `VIEW_OVERRIDES` like `view_3374` `#124E85`, `view_3475` `#5F6B7A`). Background, left border, chevron, hover background, bottom border, and the bridge rule on the *content row beneath* the header all read the same variable.
  - **Bridge to content rows.** `tr:not(.kn-table-group) + tr > td:first-child` continues the accent left border so the worksheet card looks like one unit with its header. `.scw-ws-card` border-top is also retinted to match. Drop the accent on the header without retinting these and the card visually detaches.
  - **Accordion + scene-tweaks layering.** `VIEW_OVERRIDES` in `group-collapse.js` sets per-view L1 backgrounds (`view_3374`, `view_3325`, `view_3331`, `view_3475`). These ride on the variable system. A flat-slate rule with `!important` clobbers them and they go undifferentiated.
  - **L1 ↔ L2 contrast.** L2 is hardcoded `#0f4c75` text on `#f8fafc`, designed to sit *under* the orange-tinted L1. Slate L1 + slate-blue L2 reads as one undifferentiated band — visually loses the hierarchy.
- **What we want**: a clean, named theming surface (e.g. `data-scw-l1-theme="comparison-grid"` on the view, or a token map `L1_THEME_TOKENS`) that bundles all the coupled pieces (bg, hover, accent, chevron, bridge, card top-border, L2 contrast adjustment) so swapping themes per view is a single attribute / single config object change instead of nine coordinated CSS edits. Should preserve existing per-view overrides via the same surface.
- **Sibling to copy from**: `bid-items-grid.js` design tokens; `proposal-grid.js` for per-view theming entry points. The bid-review comparison grid (`src/features/bid-review/styles.js` lines 468–550) is the visual target some users prefer.
- **Why high priority**: every time someone wants to tweak L1 visuals on a single view (which is a common request), we either ship something half-painted or punt. The current system is the bottleneck.

### 10. Custom photo-edit modal to replace Knack's default edit page
- **Status**: deferred — bigger scope than the original "just style it" framing. Currently when a user clicks a thumbnail in `.scw-inline-photo-card`, `inline-photo-row.js:1236` (and the empty-card click handlers at lines 1262/1271) calls `editPhotoHash(id, viewId)` then `navigateToHash(h)`, which routes Knack to its own edit page (`#…/edit-doc-photo3/<id>`, `edit-doc-photo2`, `edit-photo`, etc. — slug varies by view). That page is ugly and tears the user out of the worksheet flow.
- **Direction**: build a custom popover/modal in the `qa-popover.js` style rather than restyle Knack's page. Less fighting Knack's machinery — Knack re-renders aggressively and validation/save flow is theirs, so "make their form look like a popover" turns into a months-long cat-and-mouse with their CSS.
- **What the modal needs to surface**:
  - Image preview (large)
  - Photo type chips (`field_2445`)
  - Required toggle (`field_2446`)
  - Photo-level notes (likely `field_114` — confirm before building)
  - QA fields the qa-popover already edits (`field_2859` status, `field_2860` client signoff, `field_2861` notes) so PMs don't bounce between surfaces
  - Footer: `Cancel | Replace Image | Save`
- **Save path**: view-based PUT, same trick qa-popover uses. qa-popover's `PIC_SAVE_VIEW = view_3937` is the natural reuse target — needs `field_771` (img), `field_2445`, `field_2446`, `field_114`, plus the QA fields all present on that view before the module can write to them. Either extend `view_3937` or stand up a dedicated DOC_photos save view on the deploy scene and tell the module which to use.
- **Image replacement**: v1 punt — modal handles type/required/notes/QA inline, `Replace Image` button deep-links to the existing Knack edit page (one click out, but only when the user actually needs to swap the binary). v2: pipe the binary through the existing Make bulk-upload webhook (`CONFIG.MAKE_PHOTO_UPLOAD_WEBHOOK`) so the swap stays in-modal, then PUT the returned file id back.
- **Intercept point**: `inline-photo-row.js:1236` (and the empty-card branches at 1262/1271). Bind the new modal's `open()` before the `navigateToHash(editPhotoHash(...))` call; if the modal can't open (e.g. no save view configured, or fields missing) fall through to the existing navigate so the feature degrades gracefully.
- **Sibling to copy from**: `qa-popover.js` — same modal scaffold, save-view contract, and field-mapping shape. Inject CSS once, build the form in JS, snapshot initial state to detect changes, save through Knack's view-based PUT endpoint.
- **Why deferred**: each piece is small but the dependency chain (save view setup → modal scaffold → upload pipeline) deserves a focused pass instead of being squeezed alongside other worksheet work.

### 11. Drop Prefix snippet — role-based visibility filtering
- **Status (updated 2026-07-14)**: the Builder copy of the snippet was lost/overwritten;
  reconstructed + enhanced as **`knack-snippets/drop-prefix-options.snippet.js`** (now the
  version-controlled source of truth — fill in the two TODO constants, Drop Prefix object
  key + label field key, then paste into Builder). Catalog entries now carry
  `subVisible` (`field_2439`) and `salesVisible` (`field_2440`) booleans.
- **Shipped**: the survey/bid page Prefix picker (`field_2361`, worksheet-v2/init.js)
  hides entries with `subVisible === false`; entries without the flag fail open. The
  internal pickers (`field_2240`) and the ops-side CR-modal prefix list stay unfiltered.
- **Still deferred**: the sales-page filter (`salesVisible`) — needs the sales scene-id
  mapping (below).
- **What's needed**: when we build the sales and subcontractor pages we'll want the picker to honor two existing visibility flags on the Drop Prefix object:
  - `field_2440` — **Sales-visible** (Yes/No). Filter out records where this is No when the loader runs inside a sales scene.
  - `field_2439` — **Subcontractor-visible** (Yes/No). Filter out records where this is No when the loader runs inside a subcontractor scene.
- **How to scope**: cheapest path is to detect the scene class on `document.body` (e.g. `scene_1140` = sales build SOW vs. subcontractor scenes have their own ids) and union the right filter into the snippet's `filters=` query before the fetch. Internal/PM scenes get the unfiltered list.
- **Why deferred**: we don't have the sales / subcontractor scene ids fully sorted yet, and the filter is dead weight on internal pages. Land the scene-id mapping in the same pass.

### 12. De-fragilize the `field_1957` ↔ `field_2197` cascade — canonical side + read-only mirror + reconcile sweep (HIGH PRIORITY)
- **Why this exists**: the Connected Devices (`field_1957`, parent NVR/switch → children) ↔ Connected To (`field_2197`, child → parent) cascade has been a recurring, *intermittent* source of "only SOME downstream devices get the reciprocal write" bugs (see git history: `e3cf88d`, `4b34e4e`, `50acdaa`, `9e89a6f`, `7c36e7c`, `2b9a816`, and the converging-verify fix `82d132d`). Each fix patched a different **symptom** (stale forward list, refetch race, remove-knocks-out-siblings, rate-limit tail) but never the **root**: it's a *denormalized bidirectional* relationship maintained **client-side over a rate-limited API with no transaction and no self-healing**, so dropped writes accumulate drift and the next edit's diff starts from a wrong baseline. The pile of defensive layers (pre-union + authoritative-ids + kept-repair + converging verify + concurrency queue) is the smell — five hopeful mechanisms instead of one correct one.
- **Locked constraints (decided 2026-06-11)**:
  - **The two-field split is a hard Knack limitation** — they MUST stay two separate fields. Collapsing into one auto-synced Knack connection is OFF the table, so the cascade has to exist.
  - **No Make.** Server-side cascade via a Make scenario is rejected (too slow). The cascade stays **client-side**.
- **Chosen direction**: **make `field_1957` (Connected Devices) the single canonical/editable side, and make `field_2197` (Connected To) strictly DERIVED + READ-ONLY.** This kills the bidirectional ambiguity (which copy is truth *this millisecond*) that's the actual root of the fragility — every edit flows one way (parent's `field_1957`), and `field_2197` is only ever computed from it.
- **Plan**:
  1. **Make `field_2197` non-editable in every UI surface.** In worksheet-v2, the cam/reader cards render it editable via `detailConnection(rec, viewKey, 'field_2197', 'Connected Device', …)` (`worksheet-v2/card.js` ~lines 1164/1259) → the generic `[data-scw-ws-v2-conn]` click handler (`worksheet-v2/init.js:809`) opens the picker. Render it as a plain read-only display value instead (drop the `data-scw-ws-v2-conn` hook so the handler skips it). Follow the repo's read-only convention: fully readable, **white background**, `pointer-events:none`, no graying/opacity. Audit v1 surfaces too (`device-worksheet.js`, `connection-picker.js`) for any inline `field_2197` edit and lock them the same way.
  2. **Retire the inverse cascade.** Once `field_2197` is only ever written BY the cascade (guarded by `ownPuts`), the `-recip` handler in `mirror-connection-sync.js` (the "user edited a child's `field_2197` directly → move child + accessories to new parent's MDF" path) is dead — its only trigger was a user edit. Remove it (and re-home the MDF/accessory follow-on it did into the forward `field_1957` add-child path, which already sets the child's `GROUPING_FIELD`). Keep the `field_1946` MDF-move handler (`-mdf` / `maybeClearCrossMdfConnection`) — that's orthogonal.
  3. **Add a client-side reconcile SWEEP (the self-healing piece that's missing today).** On `knack-view-render` of the MODEL_ONLY views, derive the correct `field_2197` for every child from the forward `field_1957_raw` map (truth = `field_1957`), diff against each child's actual `field_2197`, and queue idempotent repair PUTs for any mismatch through the existing `knackPutKeepalive` queue. This makes accumulated drift **self-correct on load** instead of compounding. Guards: skip while `SCW.mirrorConn.isCascadeInFlight()`, debounce, suppress own PUTs via `ownPuts`, and `console.warn` (don't auto-"fix") the genuinely-ambiguous case of one child claimed by two parents' `field_1957` (since `field_2197` is single-connection — that's an inconsistency in the canonical side itself).
  4. **Then collapse the defensive layers into ONE op.** With a single editable side + the sweep, fold pre-union / kept-repair / converging-verify into one `reconcile(parentId, selectedIds)` that the picker calls and the sweep reuses. **Keep the concurrency-capped + retry queue** — that one is legitimately necessary (Knack's ~10 req/s silent-429 limit). Retire the rest.
- **Interim state**: the converging-verify + unconditional kept-repair fix (`82d132d`) is the current safety net and **stays until this lands** — it makes the existing path converge, but it's still symptomatic. Don't remove it before steps 1–3 are in.
- **Sibling to copy from**: `mirror-connection-sync.js` (`knackPutKeepalive` queue, `findRowsPointingTo`, `getModelRecords`) for the sweep; `worksheet-v2/card.js` read-only field rendering + the repo's locked-field convention (white bg / `pointer-events:none`) for step 1.
- **Progress (2026-06-12)**: applied the same "the child's back-pointer is authoritative" principle to the *accessory* denormalized pair (`field_2464` child→parent ↔ `field_1958`/`field_2207` parent→children). worksheet-v2 mounting-hardware chips now read **only** each accessory's own `field_2464` (`worksheet-v2/card.js` `detailMountingHardware`), so a stale parent forward-list can neither hide an accessory (the "two same-product accessories, one shown" bug) nor ghost a re-parented one. The canonical-side steps 1–4 for `field_1957`/`field_2197` are **not** done yet. Backlog #1 finding #3 (clear the `field_1957`↔`field_2197` reciprocal on device delete) folds into this item.
- **Progress (2026-08-03) — STEP 1 SHIPPED**: `field_2197` is now read-only in every UI surface. worksheet-v2: both `detailConnection(..., 'field_2197', ...)` call sites (cam detail + sales detail, `worksheet-v2/card.js`) pass `readOnly=true` (no `data-scw-ws-v2-conn` picker hook), and the `field_2197` conn-single entries were removed from `bulk.js` `FIELDS.cam` / `SALES_FIELDS.cam`. v1: the three `nativeEdit` configs in `device-worksheet.js` flipped to `readOnly`. Knack-native surfaces: new `src/features/connected-to-readonly.js` (global) kills grid inline edit on `td.field_2197.cell-edit` (CSS pointer-events + capture-phase blocker) and locks `#kn-input-field_2197` in Knack edit/create forms per the locked-field convention, with a hint pointing at the parent's Connected Devices picker. Display side already derives from the authoritative union (forward `field_1957` ∪ `field_2197` back-pointers) in worksheet-v2 (`init.js` `detailConnectedDevices` union) and bid-review-v2 (`transform.js` `connDeviceUnion`). The survey pair (`field_2380`↔`field_2381`) was deliberately NOT locked. Same-day follow-up: the INSTALL object's back-pointer `field_2821` (Connected To, derived from parent `field_2820`) got the same treatment — worksheet-v2 install cam detail now read-only, `connected-to-readonly.js` covers both fields on Knack-native surfaces. Steps 2–4 (retire `-recip`, reconcile sweep, collapse defensive layers) still pending — the sweep (step 3) is what self-heals already-drifted records.

### 13. Proposal PDF too large — Make reads `html` (raw Site Maps) instead of `htmlPdf` (resized)
- **Symptom**: published proposal PDFs are ~5× too big (observed 7.5 MB). The large images embed as full-size lossless PNG (`FlateDecode`) instead of resized JPEG (`DCTDecode`).
- **Root cause (NOT a code regression, NOT insufficient downsampling)**: `buildPublishPayload` (`proposal-pdf-export.js:3957`) intentionally ships two HTML variants — `html` (snapshot-safe: **raw full-size** Site Map URLs, because the weserv proxy URL is stripped by Knack's `field_2680` rich-text sanitizer) and `htmlPdf` (the **resized** variant: weserv 2000px JPEG). The code comment states it outright: *"Make's PDF step should read `htmlPdf`. Until the Make scenario is pointed at `htmlPdf`, the PDF uses the raw (larger) images."* The May-25 snapshot/PDF split landed `htmlPdf`, but the Make scenario was never repointed.
- **Fix (Make-side, not code)**: point the HTML→PDF generation module's HTML input at the payload's **`htmlPdf`** field instead of **`html`**. Leave the `field_2680` web-page write reading `html`. Expected drop: ~7.5 MB → ~1.4 MB.
- **Optional code lever**: tighten `proxyResize: { w: 2000, q: 80 }` (`proposal-pdf-export.js:134`) if still too big after repointing.
- **Confirmed 2026-06-12** by image-decoding a May-25 PDF (all DCTDecode/JPEG, 1.6 MB) vs a Jun-11 PDF (FlateDecode/PNG at 2400px wide — the proxy caps at 2000px, so the 2400px proves the proxy was bypassed = raw original embedded).

### 14. Warning: hardware with a DEFAULT accessory but NO accessory child record
- **Goal**: surface a warning (worksheet-v2 cards + bid-review-v2 comparison chips) when a line item's **product is configured with a default accessory** (default mounting hardware) but the line item has **zero accessory child records** (no record whose `field_2464` points back at it). Today the only accessory warning is "wrong accessory" (`bracket`, from the parent's `field_2244` match-check spans) — a device that should have a mount but has NONE attached is silent.
- **Why deferred (2026-06-12)**: the "product → default accessory" config is **not client-side today**. The loaded views carry the line item's actual accessories (`field_2464` back-pointers) but nothing that says what the product *should* have by default — so detection needs a new data source first. Flagged as too complex to troubleshoot alongside the current work; parking it here.
- **Detection shape**: per device row → resolve its product (`field_1949`/`field_2627`) → look up "does this product have default accessory config?" → if yes and no loaded record's `field_2464` points at the row, flag it.
- **Data-source options for the product → default-accessory map**:
  - Extend the Builder snippet pattern (`window.SCW.productBucketMap` in CLAUDE.md "Out-of-bundle Knack Builder snippets") with a `productDefaultAccessoryMap` — same paginated objects-API fetch, exposing product id → default-accessory product id(s). Cheapest, but adds cold-load weight.
  - Or a hidden Knack view exposing the Products grid with the default-accessory connection column, scraped like other MODEL_ONLY views.
  - `worksheet-v2/prefill-accessory-parent.js` and `bulk-add-mounting-box.js` are the closest existing consumers of accessory-default behavior — check what they key off before inventing a new source.
- **Where to wire it**: `worksheet-v2/warnings.js` — add a 4th TYPE (e.g. `noAccessory`) alongside `photos`/`disconnected`/`bracket`; the analyzer already walks the loaded records, and bid-review-v2's chips (`bid-review-v2/warnings.js`) reuse the same TYPES/ICONS, so both surfaces light up from one implementation. Follow the per-type color convention (photos=indigo, disconnected=rose, bracket=amber — pick a distinct 4th).
- **Watch out**: only flag buckets where a default accessory is meaningful (cam/reader primarily); services/assumptions/accessory rows themselves must be exempt. And a product with default accessory config but the user *deliberately* removed the mount may need an opt-out, or the warning becomes noise — consider counting it only when the row has NEVER had an accessory vs. has one deleted (probably not distinguishable client-side; accept the noise or keep it informational-severity).

### 15. worksheet-v2 pipeline is NOT config-driven yet — generalize all field reads through `cfg.fields()` (HIGH PRIORITY)
- **Why this exists**: the v2 worksheet config (`worksheet-v2/config.js`) advertises a clean logical-name → `field_XXXX` resolver (`SCW.worksheetV2.cfg.fields(viewKey)`) and a `DEFAULT_FIELDS` map, implying a new deployment is "just a config entry." **It isn't.** The pipeline modules overwhelmingly read **hardcoded SOW literals** instead of resolving through `cfg.fields()` — ~320 `field_XXXX` references across the module (`card.js` ~87, `init.js` ~71, `bulk.js` ~69, `groups.js` ~13, `warnings.js`/`picker.js`/`summary.js` ~9 each, …). `DEFAULT_FIELDS` is effectively documentation; the code ignores it. This is why `view_4093` (install) is `enabled:false` ("render-side money-column suppression + QA surface not ported") and why the survey worksheet (`view_3505`, added 2026-06-16) had to take the **Hybrid** path (survey-specific card branch + `moneyMode:'survey'`) instead of a pure config entry.
- **The real goal (decided 2026-06-16, deferred)**: route **every** per-record field read in the pipeline through `var F = ns.cfg.fields(viewKey)` so `buildCard` and friends become genuinely object-agnostic. Then a new object (survey, install, future sales/sub pages) is a config entry only — no card fork, no `moneyMode` per-object branch sprawl.
- **Why it's behavior-preserving (low risk if done right)**: `DEFAULT_FIELDS` already maps each logical name to the EXACT literal the code uses today, so swapping `readField(rec, 'field_1949')` → `readField(rec, F.product)` resolves to the same key for the 3 live deployments (build-SOW `view_3962`, sales `view_3586`, bid-review `view_3921`). Verify each swap by `git diff` of the built bundle being inert for those views.
- **Scope / order**: start with `card.js` (the single `buildCard` seam — biggest payoff), then the per-record readers in `warnings.js` / `photos.js` / `edit.js` / `bulk.js` / `groups.js` / `summary.js` / `sort.js`. `bucketIdOf`/`bucketCategoryOf` need an optional `viewKey` param (default `field_2219`) so the bucket field resolves per-object (survey = `field_2366`). Money model: replace the `moneyMode:'sales'`/`'survey'` branches with a config-described money column set once reads are generic.
- **Until then**: every new object needs a Hybrid card branch + careful field map (see the `view_3505` entry in `config.js` for the pattern). Each Hybrid we add is more duplication this generalization will later collapse — so prioritize it before a 4th object lands.

### 16. Survey Line Items need a parent/child (accessory + connection cascade) relationship
- **Status**: noted 2026-06-16 while building the v2 survey device worksheet (`view_3505`). The **Survey Line Item** object currently has **no** accessory parent/child denormalization and **no** mirror-sync cascade — unlike the SOW Line Item object, which has Connected Devices (`field_1957`) ↔ Connected To (`field_2197`) kept aligned by `mirror-connection-sync.js`, plus accessory `field_2464` (child→parent) ↔ `field_1958`/`field_2207` (parent→children).
- **What survey HAS today**: `field_2380` (Connected Devices, multi, on NVR/switch) ↔ `field_2381` ("Connected To", single, on cam/reader). **Correction (2026-06-16):** these ARE backed by a mirror-sync cascade — `mirror-connection-sync.js` registers a `createMirror({ VIEW_ID:'view_3505', TRIGGER_FIELD:'field_2380', CONNECTIONS_FIELD:'field_2381' })` instance (grouped by `field_2375`). The worksheet-v2 survey Connected Devices/To pickers route PUTs through view_3505 so it fires, same as the SOW `field_1957`/`field_2197` pair. What survey still LACKS is the **accessory** parent/child relationship — no accessory→parent field (`field_2464` analogue) and no `field_1958`/`field_2207` forward array — so the v2 survey card renders **no** mounting-hardware/accessory UI and maps no `accessories`/`children`/`parent`/`accessoryMatch` logical slots (see the `view_3505` config entry + card branch).
- **What's needed (future)**: when the survey object gains the accessory relationship (+ a mirror-sync analogue for `field_2380`↔`field_2381`), map it into the same worksheet-v2 logical slots (`connectedDevices`/`connectedDevice`/`accessories`/`parent`/`children`). At that point it becomes config-only IF Known Issue #15 (full generalization) has landed; otherwise it needs the same Hybrid accessory-UI port the SOW card already has.
- **Watch out**: don't assume writing one survey connection side updates the other — there's no cascade today, so they can drift exactly like the SOW pair did before `mirror-connection-sync.js`. Building the cascade should follow the canonical-side direction decided for the SOW pair (Known Issue #12), not re-create the bidirectional-ambiguity fragility.

### 18. Pre-bundle flash on gated scenes — raw scene paints before the bundle's CSS exists
- **Symptom (scene_1116, likely all NO_KTL_SCENES)**: on load the raw Knack views paint for ~a second, THEN the scene-load veil/spinner appears, then the styled reveal. All in-bundle veil work (scene-tweaks.js `scw-scene-ready` gating, 2026-07-07) only helps AFTER the bundle executes — the first paint races the bundle download and wins.
- **Root cause**: `knack-snippets/ktl-loader-gate.snippet.js` calls `callback()` immediately on gated scenes, letting Knack render while `dist/knack-bundle.js` is still downloading in parallel (loaded separately by the Builder JS). Until the bundle lands, none of its injected CSS (veil, v1 cutover hides, hide-data-source views) exists.
- **Fix direction (Builder-side)**: in the gate snippet's `skip` branch, load the CDN bundle FIRST (LazyLoad is already available there), then call `callback()`. SHA-pinned jsDelivr is immutable + browser-cached, so warm cost is small. Needs a guard so the Builder JS's existing bundle loader doesn't double-load. Update the snippet file in `knack-snippets/` and re-paste into Builder.
- **Status**: parked 2026-07-07 mid-testing ("we'll come back to this") after the in-bundle reveal gating (quiet-window + transform markers incl. `#scw-step-initiate-install`) fixed the post-veil flashes.
- **2026-10-20**: KTL has since been removed from the app entirely and the loader-gate snippet is retired (kept in `knack-snippets/` for history). Whatever Builder boot code loads the bundle now, the fix shape is unchanged: load the CDN bundle before letting Knack render.

### 19. Delete the dead v1 bid-review GRID code (decided 2026-07-14: v1 grid is dead and gone)
- **Runtime state (done 2026-07-14)**: with `bid-review-v2/config.js` `replaceV1: true`, v1's
  `renderMatrix` / `showLoading` short-circuit (`v2OwnsPage()` in `bid-review/render.js`) —
  the v1 matrix is never BUILT, not just hidden. CR-draft rehydration was moved ahead of
  the mount gate in `bid-review/init.js` `runPipeline` so v2's pending cards still hydrate.
- **What remains (the actual deletion)**: physically remove the v1 grid DOM builders and
  their v1-grid-only event wiring — `render.js` (`buildDataRow`, `buildSowDetailCell`,
  `buildDataCell`, `buildSowSection`, toolbar/accordion machinery, `getMismatches`) and the
  init.js handlers that only serve v1 grid DOM (accordion clicks, expand rows / wsTr
  moving, `attachClickHandler` paths). ~thousands of lines across `render.js` (2.8k) and
  `init.js` (4.3k).
- **⚠️ v1 is NOT a dead directory — v2 uses it as a library.** Confirmed call surface v2
  depends on (must survive the deletion): `SCW.bidReview.changeRequests` (the entire CR
  modal/payload/draft engine), the action dispatchers (`dispatchCRAction`,
  `dispatchHeaderAction` — every v2 Revise/Remove/Add/Reinstate button routes through v1
  handlers that resolve rows from v1 `_state`), the data pipeline (`loadRawData`,
  `buildState`, `_state`), `buildSowStatusBar` (rendered INSIDE v2's SOW headers),
  `scrapeRowPhotoUrls`, `addBulkChangeRequest`, `rerender`/`refreshSilently`,
  `refreshHeaderTotals`, `resetDocsIndex`, `renderToast`, `sowFriendlyName`, and
  `CONFIG` (field keys — also read by worksheet-v2/change-requests.js and
  bid-revision-inject.js, incl. `revisionResponseWebhook`). `sales-revision-column.js`
  listens for `scw-bid-review-rendered` (v1-grid-only; no-ops now).
- **How to do it**: work function-by-function in `render.js`/`init.js`, grepping each for
  external references before deleting; keep everything in the list above. Also strip
  v1-grid-only CSS from `bid-review/styles.js` EXCEPT the classes v2 reuses
  (`.scw-bid-review__cell-action*`, overflow menu, status-bar, toast styles).

### 20. Proposal grid: full model-driven rebuild (DEFERRED 2026-07-14 — insane amount of work)
- **The question**: rebuild the proposal grid from `Knack.views[x].model` data into our own DOM (like worksheet-v2 does) instead of layering ~3.5k lines of transforms on Knack's grid render (`proposal-grid.js` reorders, synthesized L2/L3/L4 headers, accessory relocation, subtotal/discount/total rows, label rewrites, TBD masking, CO tint/banner/manifest, 5 safety-net re-runs).
- **Decision**: deferred. The pipeline encodes years of pricing-presentation behavior with no tests; a rebuild risks regressing the PUBLISHED PROPOSAL/PDF pipeline (`buildPublishPayload` scrapes this DOM). Revisit only if the layered approach becomes untenable (e.g. another render-race class of bugs like the CO row-moving failures). If attempted: worksheet-v2's model→DOM architecture is the sibling to copy; the publish payload contract is the compatibility bar.

### 21. buildInvoiceItems base/CO branch — COLLAPSED 2026-09-17
- **What forked (2026-07-17)**: `buildInvoiceItems` (proposal-pdf-export.js) grew an
  `isChangeOrder` param. The CO path aggregated rows by REAL qty
  (`field_1964_raw`) × extended net (`field_2269_raw`); the base path kept the
  legacy 1-per-row unit-price sum (`field_2268_raw` once per row) — a LATENT
  UNDERCOUNT for any line with qty > 1.
- **Collapsed (2026-09-17, INV-11795 audit)**: every row now bills
  `qty (field_1964_raw; blank → 1; explicit 0 → 0) × net unit (field_2268)` with
  the amount taken from `field_2269_raw` (fallback qty × unit when the snapshot
  doesn't project it). Base proposals keep a positive-only include gate
  (`rowAmt > 0`); COs keep non-zero (removes are negative), the signed labor
  lump, `isCredit` and the xeroSafe pass. Invoice equipment lines now reconcile
  to the proposal's Equipment Total (Σ `field_2269`) except License rows, which
  still route to `recurring` and are NOT invoiced by scenario 10.01.
- **Expect invoices to be HIGHER than before on proposals with qty>1 rows** —
  that's the fix, not a regression. Node suite: scratchpad
  `test-invoice-items.js` (base qty math, edge cases, discounts, CO paths).
- **Still open (Make side, scenario 10.01)**: the combined invoice (module 165)
  hardcodes DueDate now+180 while the acceptance is NET30 (`field_948` = +30);
  the two-invoice route's labor invoice (163) hardcodes a Contact id and +180;
  TaxJar calls (110/149/168) hit `api.sandbox.taxjar.com`; module 234 updates
  object_125 with the ACCEPTANCE id (`{{2.id}}`); `recurring` lines are never
  invoiced anywhere.

### 17. Builder snippets ship the live Knack REST API key client-side — migrate to view-based reads (HIGH PRIORITY / SECURITY)
- **The hole**: the out-of-bundle Builder snippets that populate `window.SCW.*` globals (`productBucketMap`, and the newer `deliverablesFields` for the questionnaires) authenticate with the app's **REST API key** in client-side JS. That key is delivered to and used in the **browser** — Knack Builder "JavaScript" is NOT server-side — so anyone who can load the page can read it (DevTools → Network → any `api.knack.com` request → `X-Knack-REST-API-Key` header, in plaintext). A Knack REST key is **not role-scoped**: it grants full read/write to every object, bypassing view/role permissions. This is bad on internal pages and **much worse on customer-facing pages** (e.g. the customer questionnaire `view_4031`), where customers could extract it and read/write all app data.
- **Confirmed 2026-06-19**: the `deliverablesFields` key was exposed in chat + lives in client JS. Key must be **rotated** in Knack (Settings → API & Code → reset) and every consumer updated (rotation is app-wide: all Builder snippets + any Make scenarios/integrations on the old key break until updated).
- **The fix (no Make, no key)**: replace each REST-API-key snippet with a **view-based read**. A Knack **view** loads with the logged-in user's **session token** (the cookie), not the API key — the exact MODEL_ONLY pattern the rest of the bundle uses. Add a **hidden, unconnected "all records" grid** of the source object to each scene that needs it, then read `Knack.views[viewKey].model` in the bundle. No key ever ships.
  - **Knack mechanic** (the snag that triggered this TODO): a grid does NOT need a connection to the page's object — the connection only filters to the page record. For global config data (schema defs, product→bucket map) add an **all-records / no-connection** grid. If the Add-Grid flow only offers connected sources, fallback is a **throwaway connection field** on the source object → the page object (never populated) to satisfy Knack, then set the grid's filter to show all.
- **Scope (why it's a TODO, not a quick fix)**: this must be done on **every scene** each global is consumed on — `deliverablesFields` → deploy scene (`view_4093` internal worksheet) + customer questionnaire scene (`view_4031`); `productBucketMap` → all worksheet-v2 scenes + bid-review + the v2 product picker + `filter-products-by-bucket.js` + `bulk-add-mounting-box.js`. Each needs its own hidden grid view.
- **Bundle side is ready for it**: `deliverables-worksheet.js` / `customer-questionnaire.js` `loadSchemaFields()` reads raw Knack records (`field_XXXX`/`_raw`) — a view model returns the identical shape, so swapping `window.SCW.deliverablesFields` → `getViewRecords(SCHEMA_DEF_VIEW)` is a one-line source change per feature (the scaffold originally had `SCHEMA_DEF_VIEW` for exactly this). Add a per-feature `SCHEMA_DEF_VIEW` config + hide the grid, then delete the key snippet.
- **Interim**: rotate the key, keep the snippet running on the new (still-exposed) key until the hidden views are added scene-by-scene, then retire the snippet. Don't add NEW client-side-key snippets in the meantime.

### 18. SOW acceptance write-back — FLAG_accepted is never set and SYS_accepted date is auto-filled
- **Found 2026-07-19** during the quote-value trends analysis (data exports, not bundle code). Two related record-keeping holes on the SOW header object:
  - **`FLAG_accepted` is never written.** All 275 SOWs in the export read "No" — including the 15 SOWs that verifiably went through acceptance (they have install-acceptance records with invoice dates, several with signed agreements). Acceptance truth lives ONLY in the install-acceptance table; anything that filters/reports on the SOW flag silently sees zero accepted SOWs. Correcting this in the analysis moved 2026 accepted totals up ~11% ($1.19M → $1.32M).
  - **`SYS_accepted date` equals `SYS_create date` on 240 of 241 SOWs** that have it (field default "today" stamped at record creation, sample rows show create = accepted = default-expiration). It cannot measure quote→accept cycle time; the analysis had to proxy via the acceptance record's Invoice Date (which itself once predated the SOW create date by 26 days in a CO sequence).
- **Fix shape (small)**: acceptance flows through the accept-SOW DTO / Make scenario — add a write-back at the moment the install-acceptance record is created (or on the e-signature SIGNED webhook, matching the CO design where signature is the gate): PUT the parent SOW's `FLAG_accepted = Yes` and stamp the REAL date into `SYS_accepted date` (or a new dedicated date field if the auto-fill default must stay). One step fixes both holes.
- **Double acceptance (2026-09-18)**: reps were accepting a proposal twice (a second acceptance record → second agreement + invoice). The Accept CTA gate reads `field_2990` (a Knack count that catches up seconds after the record lands, and it counts as accepted when it reads >= 1 — see `published-proposal-render.js` `isAcceptedCount`; it was `> 1` until 2026-09-30, which left the CTA up on singly-accepted proposals. The public token page's snippet `knack-snippets/proposal-access-public.snippet.js` carries its own copy of the rule and must be re-pasted into Builder when it changes), and the accept form is a child page reachable again via Back / a second tab. `accept-proposal-guard.js` now (1) locks the form's submit button on first click, (2) trips a per-browser wire in localStorage (`scw:proposal-accepted:<id>`) on `knack-form-submit`, which the CTA gate and the guard both read at once, and (3) on render GETs the proposal through scene_1279 / view_3813 and replaces the form with an "already accepted" notice when `field_2990` says so. `acceptance-card.js` flags duplicate base acceptances (same SOW token, non-CO, >1 row) with a red "Accepted twice — duplicate" pill and "· accepted twice" in the rollup / Paperwork tile so ops removes the extra. `tests/proposal/test-accept-guard.js`.
- **Follow-up audit**: after the write-back lands, sweep everything that currently READS `FLAG_accepted` (views, filters, Make scenarios, bundle features) — those consumers have only ever seen "No", so their behavior/reporting has been silently understated and may need re-checking once the flag starts flipping.
- **Related nice-to-have**: keep project `REL_company` mandatory (98% populated today) — it is what makes client-level analysis (and the full "Testies" test-project sweep) possible; the legacy quote-era Contact field is only 22% populated and the legacy Company field is empty (3/7,617).

### 22. Product retirement cascade + "where is this product quoted?" — INERT until Builder keys are filled
- **Shipped 2026-09-10** as `src/features/product-lifecycle.js` with a `CONFIG` of Builder TBDs
  that all fail open (one console warning naming what's missing). Full design, rules, and the
  Builder checklist: **`docs/product-retirement.md`**.
- **What it does once configured**: saving a product as Disabled (edit form / grid inline edit on
  the Products page) opens an impact modal and, on confirm, flips a new `FLAG_is disabled` on every
  SOW line item carrying that product whose SOW was quoted in the last 12 months (or never quoted
  but created in the last 12 months); the product details view gets a "Where is this product
  quoted?" panel listing SOWs with a proposal in the last 6 months (window selectable). Writes go
  through a capped retry queue; already-flagged items are skipped.
- **Builder work needed**: `FLAG_is disabled` on SOW Line Item; `SYS_latest proposal date` (Max
  formula over published proposals) on the SOW header; hidden all-records grids of SOW Line Items
  (flag inline-editable) and SOW headers on the Products page; then fill `sceneKey`,
  `productDetailView`, `productStatusViews`, `lineItemsView`, `sowsView`, `lineItem.disabled`,
  `sow.created`, `sow.latestProposal` (+ optional `sow.project`).
- **Do NOT reuse `field_2912`** for the flag — it is derived from the product (Yes = still active)
  and flips for every line item ever created, which is exactly the noise the 12-month rule avoids.
  Follow-up once the flag exists: OR it into the worksheet "discontinued" badge.

### 23. CO product SWAP lands as "Removed by CO" — Make scenario 13.06b (HIGH URGENCY — VERIFIED)

✅ **Independently verified 2026-09-16** by re-reading the blueprint JSON
(router 164 filters and modules 161/219 mappers quoted verbatim below are
exact) and confirmed against the live SW1781CO publish payload. That payload
settles the last open question — WHY the bracket's line specifically won:
feeder [87] emits the CO lines in `field_2173` order (30914 Deputy-Remove,
30915 Informant-Add, **30916 Wall-Bracket-Remove targeting the CAMERA**,
30917 EBM-Add). For the camera that is [161] set → [219] clear → [161] set,
so the last writer is the bracket's Remove line, hence `field_2967` = that
line and the chip shows a bracket name. Router semantics: a Make router runs
*every* route whose filter passes, but the three filters are mutually
exclusive per line — the fight is across LINES, and feeder order decides.
Two corrections to the original read: (a) the EBM Add having no
`field_2966` is CORRECT — it is a net-new accessory, a plain Add, not a
swap leg; (b) the real upstream anomaly is the wall-bracket Remove targeting
the camera's install record instead of its own.

- **Symptom (seen 2026-09-15)**: install record `6a62981788f3ebe5858c08a1`
  (`I-03`, Informant Dual Vision, project `69f0d4b567a35332e743cc27`) renders in
  the worksheet's collapsible **Removed by CO** section with the chip
  `Removed by CO Wall Mount Bra…` — when the change order (`1781CO`, quote
  20260915-11613, signed) was meant to be a **product swap, not a removal**. The
  card still lists BOTH mounts ("Wall Mount Bracket for The Deputy…" and
  "Electrical Box Mount for the Informant 4.0 Dual Vision"), and its As-Quoted
  panel does resolve the 1781CO line (`2 differ`: Connected To, Conduit) — so
  the target-linked Add leg exists.
- **Scenario**: `*13.06b | CHANGE ORDER | True Deployment Records based on
  signed CO`. Relevant modules: router **[164]** (3 routes), **[161]** REMOVE,
  **[219]** SWAP, **[92]** create install line, feeder **[87]** (iterates
  `{{73.view_3896}}` = the CO's LINE ITEMS), **[11]** get SOW (= the CO header,
  `object_106`, `record_id = {{9.field_2666_raw[].id}}`).

**Claimed bug 1 — route 1 has no swap guard.** Router [164] filters:
  - route 0 ADD: `field_2965_raw = "Add"` AND `field_2966_raw[].id` **notexist**
  - route 1 REMOVE: `field_2965_raw = "Remove"` ← *only condition*
  - route 2 SWAP: `field_2965_raw = "Add"` AND `field_2966_raw[].id` **exist**

  A swap is a **linked pair** of CO lines (see the swap contract in
  `worksheet-v2/co-remove.js`, header comment ~lines 27-57) and BOTH carry
  `field_2966` pointing at the same install record. Feeder [87] processes both:
  [219] sets `field_2967: {{null}}` (clears the flag), [161] sets
  `field_2967: {{87.id}}` (re-flags it). They fight; the last one processed
  wins, and the client fires Add-then-remove so the Remove tends to land last.
  Route 0 got the analogous guard; route 1 didn't.
  - **Fix shape**: `field_2966` exist/notexist CANNOT distinguish them (a plain
    Remove needs it to know what to flag). Use the same test the client uses
    (`co-remove.js` `coTargetCounts`: *one* targeting line = plain remove,
    *two+* = swap pair): before feeder [87], aggregate install ids targeted by
    `action = Add AND field_2966 exists` lines into a variable, then add to
    route 1 `target install id NOT IN that set`. Modules **[303]/[304]** already
    build this shape of map. Reordering routes will NOT fix it — feeder order
    decides, not route order.
  - ⚠ **Unconfirmed premise**: whether a Make BasicRouter runs *every* passing
    route or only the first match, and whether that changes the analysis.

**Claimed bug 2 — `field_2967` gets the CO LINE id, not the CO header.**
  [161] maps `field_2967 = "{{87.id}}"`, but [87] iterates CO **line items**, so
  the install record is connected to a SOW Line Item whose identifier is a
  **product name** — hence the bracket text in the chip (`card.js` `shortCoLabel`
  finds no CO digits and falls back to a 14-char truncation).
  `config.js` (~line 232) declares `removedByCo: 'field_2967'` as
  *"CO_REL_removed by co (**→ CO header**)"*.
  - **Fix shape**: `field_2967 = {{11.id}}`. Note [92] does the analogous thing
    correctly — `field_2819 = {{87.id}}` genuinely *is* the source CO line — so
    [161] looks copy-pasted from it.
  - **Builder check needed**: which object does `field_2967` actually connect
    to? It accepted a line-item id and rendered a product name, suggesting it
    points at SOW Line Items, not SOW. Either Builder is wrong or our
    `config.js` comment is. The card's label logic assumes the header.

**Not in this blueprint — upstream.** For the CAMERA's install record to be
flagged by the BRACKET's CO line, that bracket Remove line's `field_2966` must
point at the camera rather than at the bracket's own install record. This
scenario only *consumes* `field_2966`; it's set by whatever handles
`MAKE_CO_REMOVE_ITEMS_WEBHOOK` when the CO lines are created. The client sends
each accessory its own target (`co-remove.js` ~line 1418,
`targetInstallItemId: aRec.id`), so check whether that scenario applies the
device's install id across every id in the call instead of per-id. Fixing bug 1
makes this harmless for swaps but it would still mis-flag a plain accessory
removal. **Also unexplained**: both mounts are still present, i.e. the bracket
accessory was never actually removed.

**Recovery for the affected record**: clear `field_2967` on
`6a62981788f3ebe5858c08a1` (the durable flag — clearing it returns the item to
active scope), confirm the product swap actually applied to the camera, and
check whether the wall-bracket accessory still needs removing.

**Optional client-side guard (not built)**: `card.js` already has the signal —
flag when `field_2967` resolves to a record whose identifier carries no CO
number, and when a removed item still has a target-linked Add. Render amber
rather than presenting the bad state as fact. Same shape as the acceptance-card
bid-basis seal (`acceptance-card.js` `basisDrift`). Useful after the Make fixes
too, since it catches the next regression where someone is actually looking.

### 24. JSON snapshot (`field_2671`) — HTML attributes get mangled in the stored string (bundle FIXED 2026-09-17; Make patch pending)
- **Symptom**: 11.04 module 6 (Parse JSON of `[{{4.field_2671_raw}}]`) fails with
  "invalid JSON" at greenlight. Same read in 13.06b module 73 (`9.field_2671_raw`)
  and 11.06 module 84 (`83.field_2671_raw`).
- **Root cause (confirmed against all 429 published proposals)**: rich-text `_raw`
  values that carry tag ATTRIBUTES (`<ul class="ak-ul">`, `<span style>`, `<a href>`)
  serialize as `class=\"ak-ul\"`; the paragraph field the snapshot is stored in runs
  an HTML-aware sanitizer that mangles every escaped attribute quote to `class="\"`
  (value dropped, one backslash dropped). 21/21 snapshots that ever contained a tag
  with attributes are broken; 0/408 without one; escaped quotes in plain text
  (`26\" monitor`) survive. `stripNonRawFields` already dropped the rendered
  `<span class="id">` twins for this reason — the rich-text raw HTML slipped through.
- **Bundle fix**: `stripHtmlTagAttrs` (proposal-pdf-export.js) runs on every string
  leaf inside `stripNonRawFields`, so `jsonString` never contains `=\"`. Rule going
  forward: **the stored snapshot must never contain an HTML tag with attributes.**
- **Make side (pending — needed for the 21 already-published snapshots)**: repair
  before parsing in each consumer, e.g. 11.04 module 6 JSON string:
  `[{{replace(4.field_2671_raw; "/ [a-zA-Z-]+=[!-#].[!-#]/g"; emptystring)}}]`
  (13.06b module 73 uses `9.`, 11.06 module 84 uses `83.`). Drops the mangled
  attribute (`<ul class="\">` → `<ul>`); the attribute values are already lost and
  nothing downstream needs them. Verified against all 21 broken snapshots (0 hits
  in the 408 clean ones). Shipped for 11.04 as a textual blueprint patch
  (2026-09-17); 13.06b / 11.06 still need the same edit.
  **Make formula gotchas** (learned the hard way): the regex MUST be a quoted
  string — bare, the editor tokenizes `/ - + =` as arithmetic operators. A literal
  `"` cannot be put inside a Make string: typing `\"` in the editor CLOSES the
  string and it auto-inserts `+` operators around the leftovers (seen in the
  exported mapper). Hence the pattern spells the quote as the character range
  `[!-#]` (`!`, `"`, `#`) and the stray backslash as `.` — no quotes, no
  backslashes, nothing for the editor or IML to reinterpret. Make's `replace()`
  accepts ONE regex flag only (`g`). Fallback with zero escaping: a Text parser →
  Replace module (Pattern ` [a-zA-Z-]+="\\"`, New value empty, Global match yes)
  between the Get Record and the Parse JSON.

### 26. Make 06.04 "Update Bid from SOW" did not true the bid to the SOW (v3 patched blueprint delivered 2026-10-16)
- **Scenario**: `06.04 | BID RECONCILIATION | SOW -> BID - Create Alternative / Update Bid from SOW`
  (ops stepper `request-alt-bid` / `update-matching-bid`, one hook, branches on `actionLabel`). It
  copies the SOW lines (`1.json.view_3896`, from view_4140) onto the survey items (`object_114`,
  `field_2404` = SOW line) for the bid matched by SOW + survey (`object_115`, [88]). Confirmed gaps:
  (1) the item filter ([8]/[59]) was `not Mounting OR (not License AND Require Sub Bid ≠ No)` — a
  non-mounting item always passed, so licenses and Require-Sub-Bid = No items landed on bids; (2) the
  UPDATE module ([61], item already on the survey) skipped labor description `field_2409` and the
  mounting list `field_2463` and read drop length / SCW notes from the DISPLAY twins (blank whenever
  the payload is slimmed past the 4.5 MB budget → would clear them); (3) the create paths ([16]/[65])
  mapped SCW notes `field_2418` from `field_2263` (discount reason) while the update path used
  `field_1953`; (4) [61] `field_2415 = {{88.id}}` REPLACED the item's bids (a variant bid's run wins
  last); (5) the survey pair `field_2380` / `field_2381` was never derived from the SOW's `field_1957`:
  [61] mapped neither, and the in-loop "NETWORK CONNECTIONS" branches ([37] route 2 / [69] route 2)
  were dead — their second iterator read `field_1957_raw` off a CONNECTION bundle (`{id, identifier}`,
  copied from 13.06b's item feeder [87]), always empty, so the aggregator stopped; the update copy also
  searched the parent (`58.id`) instead of the child; (6) items the SOW no longer carries were never
  taken off the bid.
- **Patch v3 (blueprint export, imported INTO the scenario so the hook URL stays)**: item filter = one
  AND group on `field_2479_raw`; [61] parity with the create path for the SOW-derived fields (`_raw`
  reads, + `field_2463` via a cloned mount-list iterator/aggregator ahead of it, bids `distinct(add(…; 88.id))`,
  connections reset with `{{emptyarray}}` — a literal `[]` in a blueprint is an UNMAPPED array field);
  create paths' notes → `field_1953_raw`; the dead branches removed; a SECOND PASS route after each item
  loop (router [86] route 1, router [120] route 1): iterate the payload's SOW lines → (filter
  `length(field_1957_raw) > 0`) search the parent's survey item → iterate `map(field_1957_raw; "id")` →
  search the child's survey item → child `field_2381 = [parent]` → aggregate (stop-if-empty OFF) → parent
  `field_2380 = exactly the children on this survey`; and an UNLINK pass (router [86] route 2, guarded by
  `length(1.json.view_3896) > 0`): aggregate the SOW line ids that pass the item rule into a
  `includedSowIds` variable, search this bid's survey items, `field_2415 = remove(own bids; this bid)`
  for every item with NO `field_2404` (a deleted SOW line — Knack blanks the connection — or a
  sub-added item) OR whose SOW line is not in the set; nothing is deleted (the items stay on the survey
  under "(no bid)"). The update path never writes the sub's labor $ `field_2400` or the labor
  description `field_2409` (v2 briefly re-copied the description; reverted 2026-10-16) — both are only
  SEEDED at create ([16]/[65], original behaviour); survey notes `field_2412`, mounting height
  `field_2455`, photos and the bid PDF stay the sub's too. **Verify live**: remove a camera from an
  NVR on the SOW → Update → its Connected To must blank (else the module dropped `{{emptyarray}}` → a
  Knack "Make an API Call" PUT with `{"field_2380": [], "field_2381": []}` ahead of [61]); delete a SOW
  line → Update → its item leaves the bid.
- **Decisions flagged, not made**: sub-added items leave the bid on Update unless adopted into the SOW
  first; `field_1953` vs `field_2263` for SCW notes; unlinked items stay on the survey (not deleted);
  licenses / Require-Sub-Bid = No items already on bids leave them on the next Update; new items still
  seed labor $ / description from the SOW line.

### 25. Sales page photo modal (view_3586) — restricted, QA read-only; Builder activation pending
- **Shipped 2026-09-17**: the worksheet-v2 photo modal now has a per-surface policy
  (`worksheet-v2/photos.js` `PHOTO_MODAL_POLICY`): ops (view_4093) editable QA; sub
  (view_4056) and **sales (view_3586) `qa:'readonly'`** — upload / view / replace /
  remove, the QA sidebar READ-ONLY (status, client signoff, notes, who/when, history
  log incl. the synthesized "Photo uploaded" stamp), never Type/Required editors; a Pass
  freezes replace/remove. (`qa:'none'` — no sidebar at all — stays available.) Filled
  cards on policy surfaces open the modal (Replace/Remove) instead of the lightbox. The
  save view is mapped (`photo-edit-panel.js` SAVE_VIEWS: `view_3586 → view_3522`); before
  that the upload pane fell back to the DEPLOY scene's grid (view_3937) and every PUT
  403'd from scene_1116. Unmapped/unready ⇒ the modal doesn't open and the card keeps
  its native Knack href (empty slot → add-photo page; filled → lightbox).
- **QA data self-activates — two sources**: (a) the worksheet's SOURCE grid, where the
  DOC_photos fields ride THROUGH the photo connection as columns (`extractPhotoRecords`
  reads `td[data-field-key=field_2859…]` → one `span[id=<photoId>]` per photo — the
  ops/sub shape, view_4093/view_4056); or (b) when the source row has no QA status
  column, a same-scene DOC_photos grid mapped in `photos.js` `QA_SOURCE_VIEWS`
  (**sales: view_3586 → view_3522**, the "Additional Photos" grid) — one
  `tr[id=<photoId>]` per photo, the PIC fields as plain cells, plus Knack's built-in
  **Created By (`field_3180`)** as the UPLOADER for every photo (the modal's "Photo
  uploaded" line names them; bulk/Make uploads read as the API user). Each photo carries
  `qaColumns` (served); on a `readonly` surface an unserved photo gets no chit and opens
  the plain viewer instead of a misleading "Needs QA". Source (b) serves a photo only
  when its row is on the grid's current PAGE. The consumed columns are hidden on the
  source grid by injected CSS (`scw-ws-v2-qa-source-css`); its render refreshes the
  worksheet strips (QA state is in the strip signature), and a photo save refetches it.
  **Builder (sales, done 2026-09-17)**: view_3522 carries `field_2859`/`2860`/`2861`/
  `2862`/`2863`/`2865` + `field_3180`; set its page size to 1000 (it was 25).
- **Builder (TO ACTIVATE uploads)**: on view_3522 "Additional Photos" (scene_1116) widen
  the source filter from "Assign to SOW Item is blank" to every photo on this SOW, enable
  inline editing on `field_771` (PIC) — plus `field_2447` (FLAG_complete) so "Remove
  photo" clears the completed flag, and `field_2865` (history) so the sales user's
  replace/remove events land in the log they now read. Give the grid a large page size:
  the save PUT is keyed by record id so pagination never blocks it, but hidden linked
  rows still count against the page, so a small page can leave the visible section empty
  while unassigned photos sit on page 2.
  `photo-grid-unlinked-filter.js` hides the rows whose `field_2342` is populated so the
  section still shows only unassigned photos, fixes "Showing N of N", and stamps
  `data-scw-acc-count` on the view (a new override `ktl-accordion.js` `computeCount`
  honors ahead of the model count). Alternative with no client-side filtering: a separate
  hidden all-photos DOC_photos grid (the view_3584 / view_4070 / view_4158 pattern) and
  point the SAVE_VIEWS entry at it.
- **Not changed**: the survey worksheet (view_3505) still opens the FULL editable QA modal
  for the sub on empty required slots — same class of leak, decide separately.
