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

Map of product id → array of proposal-bucket connection ids:

```js
{ '<productId>': ['<bucketId1>', '<bucketId2>'], ... }
```

Populated by this Builder snippet (one-time fetch on app boot):

```js
(function () {
  var APP_ID  = Knack.application_id;
  var API_KEY = 'f8371b90-524d-11e7-abaf-870b3d262aa2';
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
- The API key in the snippet is the live one. Treat the snippet
  contents as a secret; don't paste it into public PRs/issues.

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
- **No tests** — the codebase has no test framework. Changes are tested manually against the live Knack app
- **No linter** — no ESLint/Prettier config. Follow existing style in each file
- Use `!important` sparingly in CSS, but it's often necessary to override Knack's inline styles
- Comment headers use banner-style delimiters: `/*** FEATURE NAME ***/`
- Config objects at the top of each file — keep logic generic, keep config specific
- **Button ordering**: destructive/negative action first, positive/primary action last. Examples: Edit | Cancel, Reject | Accept, Cancel | Submit. The primary action is always the rightmost button.
- **Read-only / locked fields**: when programmatically making a field non-editable, keep it fully readable — no reduced opacity, no graying out. Instead, set `pointer-events: none`, `readOnly = true`, and give the input a **white background** (`background: #fff`) to visually distinguish it from editable inputs (which have a light-gray background). The field should look normal but clearly not interactive.

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
- **KTL (Knack Toolkit Library)** is loaded alongside this bundle. Some features interact with KTL's keyword system (`ktlKeywords`), accordion state, and hide/show buttons.
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
- **Suspected root cause**: Either `model.fetch()` isn't causing the view to re-render (KTL accordion may interfere), or Make's PDF generation takes longer than 60s, or the PDF filename doesn't change (same version uploaded). Needs console logging to check: (a) whether `model.fetch()` actually fires, (b) what `readFieldText` returns each poll cycle, (c) whether the field value genuinely changes after Make processes.

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
  - **KTL + scene-tweaks layering.** `VIEW_OVERRIDES` in `group-collapse.js` sets per-view L1 backgrounds (`view_3374`, `view_3325`, `view_3331`, `view_3475`). These ride on the variable system. A flat-slate rule with `!important` clobbers them and they go undifferentiated.
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
- **Status**: deferred — current Builder snippet (`window.SCW.dropPrefixOptions`) returns every Drop Prefix record regardless of who's viewing the page. Used by worksheet-v2's bulk-edit picker for `field_2240`.
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
