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

## Work Fast (Avoid Design Thrash)

This is a **copy-paste-and-modify codebase, not a design space.** Every feature follows the same skeleton: IIFE wrapper + `CONFIG`/`VIEWS` constant at top + `SCW.onViewRender` / `SCW.onSceneRender` binding + idempotent init + unique-ID CSS injection. There is no test framework, no linter, and no type system. Planning phases do not catch bugs here — manual testing against the live Knack app does. **Bias hard toward producing a diff the user can look at.**

1. **Copy the closest sibling feature.** Grid work → start from `bid-items-grid.js` or `proposal-grid.js`. Worksheet work → `device-worksheet.js`. Collapsible-table work → `group-collapse.js`. Match file layout, naming, event namespacing, and the CSS injection idiom. Do not redesign the module shape — it's already decided.
2. **Read each file once, in full — but know when to stop.** For files under ~800 lines, call `Read` with no `offset`/`limit` and be done. Reading overlapping chunks of the same small file wastes context and usually means you're re-searching instead of building a mental model. The `Read` tool caps single-call output at **10,000 tokens** (~800 lines of JS), so larger files will reject a full read with a "File content exceeds maximum allowed tokens" error. Known files over the cap, as of this writing:
    - `src/features/device-worksheet.js` (~5,800 lines, ~73K tokens) — the biggest module in the repo
    - `src/features/proposal-grid.js` (~2,400 lines)
    - `src/features/bid-items-grid.js` (~1,800 lines)
    - `src/features/inline-photo-row.js` (~1,100 lines)
    - `src/features/proposal-pdf-export.js` (~1,100 lines)
    - `dist/knack-bundle.js` (see Context Hygiene — never read this one at all)

    For those files: **`Grep` first to find the exact line you care about, then `Read` with a narrow `offset`/`limit` around it** (e.g. `offset: 1420, limit: 200`). If you genuinely need to understand the whole file, either read it in ~700-line chunks or delegate to an `Agent` subagent with `subagent_type: Explore` so the big read lives in the subagent's context and only the summary comes back to yours. Do not repeatedly chunk-read the same file in the main session — that's the exact thrash this section exists to prevent.
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
