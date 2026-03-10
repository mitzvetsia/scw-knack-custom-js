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

## Common Pitfalls

- **dist/knack-bundle.js must be rebuilt** after any source change. Run `bash build.sh`.
- **build.sh file order** is the include order. Dependencies must come first.
- **Knack re-renders the entire view** after inline edits. Features must be idempotent and handle re-initialization gracefully.
- **KTL (Knack Toolkit Library)** is loaded alongside this bundle. Some features interact with KTL's keyword system (`ktlKeywords`), accordion state, and hide/show buttons.
- **`save.sh` excludes dist/** — use it for source-only commits during development. Only `release.sh` includes the built bundle.
