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

### Release workflow

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

### Data Saving Patterns

Features use Knack's internal APIs for saving data, in order of preference:
1. `Knack.views[viewId].model.updateRecord(recordId, data)` — preferred
2. `Knack.models[key].save(data)` — fallback
3. Direct `$.ajax` PUT to Knack REST API — last resort

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
