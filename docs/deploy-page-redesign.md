# Manage Deployment page (scene_1311) — redesign

Status: **Phase I top section BUILT and live on the branch (2026-09-18)** — see
"State of the build" at the bottom for what is shipped, what to verify, and what
is next. Mockup: the "Manage Deployment Redesign" design canvas
(https://claude.ai/artifact/7bJB4ndf7aP3ZbASRdVcTe — private artifact, eight
artboards: page at rest, line item open, map pop-out, filter, Files / Photos /
Closeout / Notes drawers). The live build deliberately differs from the mockup
where noted below (current tile is white with a navy frame, not navy-filled;
"Also" rows have no descriptions; notes are cards).

## Why

The page reads as nine co-equal accordion bars with three navigation layers
(K2 tabs, "On this page" pills, five band labels) indexing the same sections, six
status vocabularies, Closeout expanded by default pushing the install worksheet
~830px down, and Project Wide Assumptions rendering as legal paragraphs. Every
prior fix (deploy-page-nav.js: rename, bands, tiers, rollups, pill bar) was
additive chrome.

## The shape (Phase I)

**The worksheet is the page; everything else is a status tile or a drawer.**

1. **Four stage tiles** replace pills + bands + accordion bars: Paperwork & billing
   (its fact is acceptance-card.js's rollup, which since 2026-09-18 says when
   what is waiting is a change order: "change order awaiting signature" /
   "2 awaiting signature · 1 is a change order" — SW####CO number or the CO
   sub-pricing snapshot, `isCoRow`),
   Project setup, Installation (current, navy), Closeout. One four-state
   vocabulary: Done / Waiting / In progress / N missing. The rollups the nav
   module already computes feed the tiles.
   **Document generation lives on the Setup tile (decided 2026-09-18).**
   The closeout documents (approval forms etc.) are generated up front,
   after the client kickoff and before a tech is on site, so "Generate
   documents…" is a Setup action, not a Closeout one. The Setup tile shows
   two facts: questionnaire status, and documents generated / not yet
   (derived from the closeout DOC records the generator creates); the tile
   carries the "Generate documents…" button (the same proxy-CTA trick as
   the Change Order button: it fires the existing closeout-deliverables
   regenerate handler) and reads Waiting until both are done. Once
   generated, the action demotes to a "Regenerate…" text link. The Closeout
   tile / drawer tracks the OTHER half: documents in, QA passed, CoC sent.
   "Regenerate docs…" stays in the Closeout drawer's action bar as well.
2. **Site maps & coverage strip** directly under the tiles, always visible
   (PMs need the maps in their face). Map tiles open the file full size or
   **pop out** into their own browser window (`window.open` on a plain
   viewer page: zoom, fit, switch maps) so the map can sit on a second
   monitor at any size. Docking the map beside the worksheet was rejected:
   it fails on large maps and small screens.
   Right column, "Also on this project": Files, Context photos (the DOC_photos
   "Context" grid, formerly "Additional Photos"), Project notes, Change orders.
   Each row opens a right-side drawer that re-homes the existing Knack view
   (same trick deploy-page-nav.js uses to move Change Orders into the strip).
   The SOWs section is dropped (it only existed in the staging block).
3. **Pinned project notes**: up to three pinned notes render as a second row
   in the project header (one-line strip while working) and float to the top
   of the notes drawer with a Pin/Unpin toggle. Pins are shared.
4. **Worksheet**: starts ~560–610px from the top. The warning chips ARE the
   filters, and a "show only" filter must keep every record the user needs
   in order to act on what it shows (decided 2026-09-18):
   - **Disconnected** shows the disconnected devices PLUS every record whose
     product has `PRODUCT STORED FLAG_map camera or reader connections`
     (`field_2795`) = Yes, i.e. the switches / connection targets, across
     all MDF/IDFs. A device is connected from the network device's
     Connected Devices picker (the child's Connected To is read-only, see
     CLAUDE.md Known Issue #12), so hiding the targets hides the fix. The
     targets render with a "connection target" hint; groups with neither
     are hidden.
   - **Missing photos** and **Photos to review** need nothing extra: the
     action (upload, QA) lives on the item itself.
   The view switch is a three-segment control (MDF/IDFs | Line items |
   Summary), not a dropdown; sort stays a menu. "+ Change order" and
   "+ Add photos" live in the worksheet header (the CO CTA keeps its current
   home next to the worksheet). Assumptions / Services groups are a quiet
   tier, collapsed by default with a one-line summary. Bulk actions stay the
   existing checkbox-select flow (no header button).
5. **Progress: two bars, one per owner.** UI copy says **"Sub"**, never a
   subcontractor's name or initials (decided 2026-09-18; the page serves any
   sub). Sub: required photos
   in / required (missing + failed-to-resubmit count against them). SCW:
   items QA'd (see rollup below). Shown in the Installation tile and the
   worksheet header, later per MDF/IDF row. Real numbers for the reference
   project on 2026-09-18: 44 of 114 required photos in, 70 missing; 0 of 44
   reviewed.
6. **Install QA checklist = the Configuration schema.** The open card keeps
   the schema-driven "Configuration" panel (deliverables-worksheet.js, values
   in the item's JSON blob `field_2932`, schema via `field_2930`). Add one
   Yes/No to the Config Field Definition object, **Include on checklist**:
   a Yes/No definition flagged on becomes a check item ("Right device
   installed"); any other flagged field becomes a "verify this value" item
   ("OSD matches the label: I-010"). Checked state + who/when live in the same
   blob. Verdict (Pass / Fail…) writes the existing `QA_passed`
   (`field_2830`), `QA_completed by` (`field_2831`), `QA_completed on`
   (`field_2832`).
   **One QA surface per item (decided 2026-09-18)**: the checklist is the
   only place QA happens. The photo strip is evidence only (thumbnails,
   upload, replace; no "Needs QA" chit). Every required photo is a row in
   the checklist ("Uploaded by Sub · needs your review" → Review opens the
   existing photo modal, whose Pass / Fail writes the DOC_photos QA fields
   exactly as today; "Not uploaded · waiting on Sub" rows are inert). The
   item is Complete when every schema check is ticked AND every required
   photo has passed.
   **Config Field Definition object, what to add**: ONE Yes/No field,
   `Include on checklist`. Rendering rule: a definition of Input Type
   Yes/No with the flag = a check item (it does NOT render in the
   Configuration grid); any other Input Type with the flag = normal config
   field AND a "verify this value" row. The existing tooltip column
   (`field_2938`) is the instruction shown under the item; sort order
   (`field_2927`) orders the checklist. The bundle reads the flag off the
   same raw records the Builder snippet already emits
   (`window.SCW.deliverablesFields`), so the only code change is a new
   `checklist` key in `CONFIG.DEF` (deliverables-worksheet.js).
7. **Visual restraint**: filled colored pills only for the current stage tile
   and the active filter. Everything else is plain text with a small colored
   dot. No colored tile borders.

## Phase II (deferred 2026-09-18)

- **Zoom-to-item on card open** (item carries x, y as % of the map + which
  map; placed by clicking the map once; the worksheet tells the pop-out
  window which item opened, e.g. over a BroadcastChannel). Deferred because a
  second floorplan application already exists; this will most likely be built
  back into that app rather than here. Phase I ships the strip + pop-out
  viewer only.

## Checklist rows: pass / fail / fix submitted (decided 2026-09-18)

- The Config Field Definition object got a **Checkbox** input type: a
  definition of that type IS a check item (renders only in the checklist,
  never in the Configuration grid; no flag needed). `Include on checklist`
  still marks other input types as "verify this value" rows.
- Each check row renders as **pass / fail controls, not a bare tick**. Fail
  requires a short note. Stored per row in the blob: state (`pass`, `fail`,
  `fixed`, or empty), note, who, when.
- **Only SCW passes or fails a row.** The sub can set a failed row to
  **`fixed`** ("Fixed, please re-review") with a note and, usually, a new
  photo, from the sub worksheet (view_4056). The sub never writes the
  verdict fields; the row stays in SCW's court until SCW passes or fails it
  again.
- **The item verdict derives from the rows; no Pass / Fail buttons.** Any
  row `fail` → Failed (row notes = the failure reason). Every row (and every
  required photo) passed → Complete, stamping `QA_completed by/on` with the
  last passer. Any row `fixed` and none `fail` → **Fix submitted**. Else In
  progress / Not started.
- `QA_status` choices: Not started / In progress / **Fix submitted** /
  Complete / Failed. **Fix submitted counts in SCW's queue**: it leaves the
  sub's failed count and joins the SCW bar's "to review" segment, and the
  "photos to review" chip / filter includes it. Make can watch the value to
  ping the PM.
- Builder: view_4056 needs inline editing on the config blob (`field_2932`)
  and `QA_status` so "Mark fixed" saves through the sub's view.

## Rolling up "QA checklist complete"

The JSON blob cannot be rolled up by Knack formulas, so the **item verdict is
the rollup unit**, not the individual checks.

- **Per item, written by the bundle in the SAME view-based PUT as the blob**
  (one request, no extra rate-limit cost):
  - `QA_status` (new multiple choice): Not started / In progress / Fix
    submitted / Complete / Failed — derived from the rows as above (see
    "Checklist rows"). `QA_passed` Yes/No mirrors Complete for anything that
    already reads it.
  - **Owner split for the two bars**: sub bar = required photos in / required
    (missing and failed rows count against the sub); SCW bar = items
    reviewed / items with evidence, where "to review" = photos awaiting first
    review PLUS items in Fix submitted.
  - `QA_checks done` / `QA_checks total` (new numbers) for finer progress.
- **Per MDF/IDF group and per project**: the bundle computes counts from the
  loaded records (instant, no Builder work) for the group headers ("QA 3/16"),
  the Installation tile and the worksheet header. **Knack count/sum rollups**
  on the acceptance/project object (count of items with `QA_status` =
  Complete, sum of checks done/total) give the same numbers to the project
  dashboard, list views, and Make (notify at 100%) with no bundle involved.
- **Denominator rules**: hardware items only (cam / reader / network buckets);
  services and assumptions exempt; Removed-by-CO items exempt; an item whose
  schema has no checklist items counts as Complete once its required photos
  are in.
- **Schema drift**: adding a checklist item later makes previously complete
  items incomplete. The bundle recomputes on render and rewrites the stored
  status/counters when they differ (throttled, like the reconcile-sweep
  pattern), so the rollups self-heal.
- **Send CoC gate (decided 2026-09-18)**: NOT gated on item QA. Send CoC
  keeps its current rule (every required closeout document QA passed).
  Requiring every hardware item QA Complete is a possible later policy
  change, not part of this design. When it comes, it is one extra condition
  in the closeout module's Send CoC enablement, reading the project rollup
  of `QA_status` = Complete.

## Builder work implied (Phase I)

- Project note: `FLAG_pinned` (Yes/No), inline-editable on the deploy notes
  grid (view_4135).
- Config Field Definition: `Include on checklist` (Yes/No).
- Install line item: `QA_status` (multiple choice), `QA_checks done`,
  `QA_checks total` (numbers), all inline-editable on the install grid
  (view_4093) so the bundle can PUT them. Rollups on the acceptance/project.
- Scene_1311: the maps strip reads the existing Other Files grid (view_3942)
  and picks site plans by CONFIG_file type (`field_2877`, "Site Plan"); no
  extra view needed (decided 2026-09-18 — `field_67` FLAG_doc type is
  deprecated). Plus an "Add File" menu link → project-connected DOC_files form
  so uploads from this page attach to the PROJECT.

## Next up (noted 2026-09-18, not built)

1. **Contacts + pinned contacts.** The people a PM needs on every open:
   site contact, IT, the sub's lead. Shape: a contacts strip beside the
   pinned notes (name · role · phone · email, tap-to-call/mail), sourced from
   a project contacts grid on scene_1311, with a `FLAG_pinned` on the contact
   record (same pattern as notes: pinned first, cap 3, Pin/Unpin in a
   Contacts tray listed under "Also on this project"). Builder asks: which
   object holds project contacts (HubSpot-synced contacts vs. a per-project
   contact join), a grid of them on scene_1311 with `FLAG_pinned` inline-
   editable, and the role field key.
2. **Pinned files.** A `FLAG_pinned` on DOC_files; pinned files show in the
   maps strip ("Site maps & pinned files"), document card style, ahead of the
   maps, with Pin/Unpin in the Files tray. Same view (view_3942) — the flag is
   just another column. Builder ask: `FLAG_pinned` on DOC_files, on view_3942
   and inline-editable.
3. **Many maps (built 2026-09-18).** The strip scales by count: ≤3 big tiles,
   4–6 medium, 7+ compact; past 6 the rest sit behind a "+N more" tile that
   expands in place. Pinned files will share the same cap, so a dozen maps +
   pinned files never stack the page. Open question for the user: should
   pinned files count against the 6, or get their own row above the maps?

## State of the build (2026-09-18, end of first build session)

Branch `claude/sow-sync-bid-compare-auk1dh`; every push is live at
`https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@<sha>/dist/knack-bundle.js`.

### Modules (all `src/features/`, wired in `build.sh` after `deploy-page-nav.js`)

- **`deploy-page-nav.js`** — the page frame. `STAGES` → four tiles (`tileModel`,
  patched in place; `.scw-deploy-tile--current` = white tile, navy frame, filled
  pill). `SECTIONS` = rename / sub / icon per Builder section; `EXCLUDE_TITLES`
  keeps Manage MDFs, All associated SOWs, CORE_/INSTALL_ grids out of the nav.
  Every non-worksheet section is **parked** (`scw-deploy-parked`, hidden in
  place) and opens in the right **drawer** (`#scw-deploy-drawer`, 1100px): the
  accordion ELEMENT moves into the drawer and back to a `.scw-deploy-home`
  placeholder (`openDrawer` / `returnHome` / `closeDrawer`). Invariants: tiles
  and the "Also" list are never rebuilt while a drawer is open or closing
  (`_drawerAcc` / `_drawerBusy`); `collectTargets` counts a drawer-hosted
  section via its placeholder so the nav signature is stable across open/close;
  the "Also" list re-renders only when its own rows change. The drawer forces
  the acceptance card's narrow band layout (it sizes by viewport otherwise).
  Section **action bars** (`mountProxyCta`) proxy Builder menu links (Create
  Change Order, Add Project Note, Add File) into the section body; the Setup
  drawer leads with the generated documents (`buildSetupPrelude`, blank forms
  from Other Files by CONFIG_file type); Setup tile hosts the doc generator
  (`SCW.regenDocs.openPicker`). **Re-issued documents** (2026-09-21): PMs
  regenerate the blanks when something changes, so the list piled up
  copies. On the ops page (`docsSaveView` view_3941 live + the write
  helpers) every row offers **Supersede** (PUT the note with a
  "Superseded · " prefix, `SUPERSEDED_RE`; reversible, no Builder field —
  the Files tray and Closeout show the note so the mark reads everywhere)
  and **delete** (× → confirm → view-based DELETE, the Files tray's path).
  Superseded copies drop into a "N superseded · show" fold with Restore.
  When a document has several live copies the newest (the date the
  generator stamps into the file name, else model order) is the one to
  print, older ones carry an "older copy" chip, and **Keep newest of each**
  supersedes them in one confirm (two writes at a time, each settled).
  After a write the docs views refetch and the prelude rebuilds in place.
  Sub dashboard: read-only. Public API `SCW.deployNav.openSection(re) /
  closeDrawer() / addFileHref()`. **No flash of the native page** (2026-09-18):
  styles are injected at load, not at the first pass; the scene is
  `visibility: hidden` until the first pass after a scene render marks it
  `scw-deploy-ready` (the `knack-scene-render` handler drops the class
  synchronously, a 2.5s watchdog lifts it regardless); every
  `.scw-ktl-accordion` in the scene is `display: none` until a pass stamps
  `data-scw-deploy="keep|parked"` (`parkSections`), so a section ktl-accordion
  wraps after the pass never paints in the old layout first; a
  `MutationObserver` on the scene runs a pass as soon as an unclassified
  section appears. bom-tray.js likewise injects its summary-hiding CSS at
  load.
- **`shipments-tray.js`** (2026-09-21) — a Shipment record mirrors ONE order
  in the third-party OMS (one order = one shipment = one record). The OMS
  owns the facts; Knack owns the linkage. A **compact always-visible line on
  the Installation tile** (`SCW.shipments.tileLine()`, folded into the tile
  by deploy-page-nav so it lives inside the tile's own innerHTML diff and a
  nav pass can't fight it) opens the **Shipments drawer**
  (`SCW.deployNav.openPanel`). **DELIVERY IS NOT TRACKED (scrubbed
  2026-09-21):** ShipEdge's terminal state is "shipped" — its order payload
  carries no delivered date and no ETA, and nothing else feeds them — so
  the tray says NOTHING about arrival. No delivered date, no ETA, no
  overdue, no "all delivered"; `SHIP_delivered date` exists on the object
  but is deliberately not read, and a status string that happens to say
  "delivered" is shown verbatim without being counted or coloured as
  landed. The vocabulary is: not shipped yet, or shipped on a date with a
  carrier and a tracking link. To phase it back in, get a real delivery
  feed first (a ShipEdge webhook, carrier tracking, or parsed delivery
  mail), then restore the branches the module header points at. The line
  leads with what a PM acts on: missing in OMS → what is out + last ship
  date → nothing sent yet, and **staleness outranks every other
  headline**. Drawer: freshness bar + "Re-check shipments", a stale
  banner, counts, then one card per order leading with its ship date plus
  carrier and tracking link, with order administration behind a per-row
  "Order details" disclosure, and one line stating plainly that delivery
  is not tracked. **Everything is read-only** — nothing writes a record; a
  "fix" typed in Knack is overwritten by the next reconcile pass.
  `field_2967`-style guessing is avoided entirely: **field keys are
  discovered from view_4163's own column headers by LABEL** (`fields()`,
  the trick bom-tray.js uses for SKU), confirmed against the live view
  (field_3281…field_3305). **Two spec fields are NOT on the view** —
  `SHIP_eta` and `OMS_order total` — so no arrival date is implied and
  nothing can be "overdue"; the drawer says so once, and both light up
  with no code change if Builder adds them. `SHIP_address` is four parts
  (street/city/state/zip) composed into one line. OMS statuses are FREE
  TEXT: `tone()` keyword-matches what it knows and **falls through to a
  neutral chip** for anything unseen, shown verbatim. "Missing in OMS" is
  surfaced on the row and the tile. Staleness is judged by the OLDEST
  `SYS_last synced` (the worst record), and reported from it — `syncedText`
  is the newest, `staleText` the oldest, and anything reporting staleness
  quotes the oldest. **Re-check shipments** POSTs
  `MAKE_SHIPMENTS_RESYNC_WEBHOOK` with everything the page knows so the
  scenario needn't re-query Knack: project id, the SOWs (view_4161), the
  acceptances + signed flag (view_3914 — an order ties to a project
  directly OR through an accepted proposal), the shipments we already
  hold (id / order no / OMS order id / sync state / last synced) as the
  list to diff against, and — the key to matching ShipEdge —
  **constructed `references`**. ShipEdge's Orders API has no contains /
  LIKE / keyword filter on `reference_number`, only an exact lookup
  (`GET /apirest/v4/oms/orders/{ref}?identify_by=order_reference`) or a
  date-windowed list you filter yourself. Our linkage lives in the order
  reference, shaped `<project no>-SW<sow no> | <quote no>` (e.g.
  `62489857827-SW1454 | 20260910-11567`) — exactly the published
  proposal's identifier — so `buildReferences()` emits every reference an
  order for this project could carry: the acceptances' full strings first
  (they know the quote), then the SOW-only left sides (`sowRef`, for an
  order with no proposal behind it), deduped, each naming its source
  record. The string is the published proposal's identifier
  (`<SOW id> | <proposal no>`) and should sit on every accepted
  acceptance, but WHICH connection projects it onto a grid is a Builder
  decision — on a live project the acceptance's own `field_2755` rendered
  empty and the quote went missing — so `referenceOnRecord()` takes the
  named connection first and then scans every field **by shape**
  (`REF_FULL_RE`), across both acceptance grids (view_3914 + view_4157,
  deduped) and the SOWs. `referencesMissingQuote` flags the case where not
  one reference carries a proposal number, so the scenario reports a
  fallback rather than a clean run. `projectNo` rides at the top level as
  the one token they all share, the needle for a contains pass over a list
  windowed by the newest `lastSynced` — the only way to catch an order
  typed into ShipEdge by hand. Then it refetches view_4163 at 1.5s / 6s / 15s and repaints (project rollups recalculate lazily — this reads the shipment
  RECORDS, never a rollup). The native grid is registered in
  `hide-data-source-views.js`. Ops page only.
  `tests/deploy-page/test-shipments.js` (+ the tile-line integration in
  `test-deploy-tiles.js`).
- **`pinned-notes.js`** — pinned strip under the project header (≤3, `FLAG_pinned`
  field_3278 via view_4135 PUT); the Notes drawer as **cards** (author · date,
  text with paragraphs, Show more past 4 lines, Pin/Unpin, per-row action links
  proxied to the hidden grid — the Push Note to ClickUp/Slack action is an
  icon + EMPTY anchor, label from the column header); **the add form is on the
  page**: Knack's own "Add DOC_note" form **view_4162** (`addFormView`) is
  adopted (`adoptForm`) — moved above the card list, restyled
  (`.scw-notes-addform`: header/label hidden, "Save note" button, a "Pin to
  project header" checkbox in the submit row since the form has no pin
  input). **Knack's submit is not used**: its post-submit state (confirmation,
  "Reload form", element replacement) never gave the form back live, so
  Knack's button is hidden behind our "Save note", which POSTs every
  `field_N` input of the form (the note + the hidden project connection)
  through the form view — `/v1/pages/scene_1311/views/view_4162/records`,
  and the element sits as a sibling directly BEFORE `#view_4135`, never
  inside it (Knack rewrites the grid element's contents on every refresh;
  the form was being wiped by the first refresh after adoption),
  the same view-based endpoint the form itself uses, so the form's record
  rules (author, date) run server-side (`saveViaApi`). A native submit is
  intercepted (capture) and saved the same way; Knack's
  `knack-record-create` / `knack-form-submit` are treated as echoes. On
  success: pin PUT through the grid, view_4135 refetched (new card +
  strip), textarea cleared, "Note saved." flash. The form never leaves. The proxied "Add Project
  Note" button (`#scw-deploy-notes-actionbar`) is hidden while the form is
  adopted; the empty state's "add the first one" focuses the form. Detection
  is DOM-only (`#view_4162` with a `<form>`), no dependence on `Knack.views`
  schema. The schema-POST composer (child page's form view via the menu
  link's slug) remains only as the fallback on a scene without the form.
- **`other-files-gallery.js`** (pre-existing; the Files tray) gained **delete**
  (2026-09-18): a × on each card, ops page only (`canDelete` on the
  view_3942 deployment), confirm → view-based DELETE through the DOC save
  view view_3941 (the path closeout-deliverables.js already deletes by) →
  card + native row dropped → save / gallery / closeout models refetched
  (maps strip and closeout list follow). Sub dashboard: no ×. **Bulk delete**
  (same day): "Select files…" above the grid puts a checkbox on every card
  (Select all, "N selected"); Delete selected → ONE confirm naming the files
  (and how many are Required) → the DELETEs run two at a time, each settled
  on its own (`deleteDocs`), successes drop card + row as they land,
  failures stay selected and are named in one alert; Done leaves the mode.
  Selection survives a re-render (save-view refetch) and prunes rows that
  went away. `tests/deploy-page/test-files-gallery.js`.
- **`bom-tray.js`** (2026-09-18, replaces the worksheet Summary on the
  deploy pages) — the FIRST row of "Also on this project" ("Bill of
  materials", box icon, a `kind:'panel'` target deploy-page-nav adds when
  `SCW.bomTray` exists) opens the deploy drawer around a tray
  (`SCW.deployNav.openPanel`, new: a custom element in the drawer, the
  hosted section goes home first). Head: N new drops · M on existing cable
  (cam/reader rows, `field_2807`) + By category / By MDF-IDF / By SOW
  toggle (persisted `scw:bom:mode`; the tray element is REPAINTED in place
  on toggle, never swapped: the drawer tags that element to clear it when
  the next section or panel opens, and a fresh untagged copy lingered under
  whatever opened next, 2026-09-18 fix; `open()` also drops any earlier
  `.scw-bom` in the page). **Shipping**: one row per product per group
  (bucket L2 name `field_2822`, cameras first; location `field_2818`; or the
  SOW off the linked SOW item's `field_2154`, "SOW 1524", a line shared by
  two SOWs under "SOW 1524 + SOW 1601"; location / SOW groups sort A→Z with
  "No MDF / IDF" / "No SOW" last and muted; group rows carry 26px of top
  space + a rule so the list skims):
  Product (+ designators `field_2802` compacted "I-001 to I-005", chips; no
  location run-on in the category view, the MDF/IDF view carries it) | SKU |
  Qty | Retail | Discount ($) | After discount, extended × qty, totals row.
  **A column with no data on any row is left out** (SKU, Retail, Discount,
  After discount each on their own), so until view_4072 carries the price
  columns the ops tray is Product | Qty. Pricing is joined from the PROPOSED SOW item the install
  record points at (`field_2819` → hidden view_4072 / view_4151):
  `field_1960` retail, `field_2262` discount each, `field_2268` net unit;
  SKU: the column is found by its HEADER text ("SKU") on the hidden SOW grid
  first, then the install grid (`skuField`), so whichever field the Builder
  exposed under that label is the one read; `field_56` is only the fallback.
  Added to view_4072 on 2026-09-18. Pricing columns stay dormant until the
  price fields are on the grid (deferred by Micah). Ops page only shows
  pricing; the sub tray is Product | SKU | Qty. **Not shipping**: a dashed,
  muted block for Pre-existing (`/^pre-existing/` in the product name: on
  site, we connect to it) and Customer-supplied (`customer|client supplied`
  in the name: they provide it, we install it). **Removed by change order**:
  a third muted block for rows a signed CO pulled (`field_2967` set, the
  worksheet's "Removed by CO" rule), headed by the CO's SOW number, struck
  through, never counted or priced. **Change orders are read off the CO's
  own lines on the proposed grid** (view_4072 / view_4151: target install
  record `field_2966`, action `field_2965`, SOW `field_2154` → "SOW 1418CO";
  `coIndex`): `field_2967`'s display value is the removed line's product
  name, so the flag alone cannot head a group. A line's ACTION comes first
  from the CO's pricing snapshot JSON (`{lines:{id:{action,qty,item}}}`,
  co-stage-strip's blob as the acceptance grid carries it on field_2959 /
  field_2946 — every view model on the page is scanned for a string with
  `"lines"`, joined by line id), then the grid's field_2965, then the sign
  of the qty (a Remove is negative) — view_4072 may not expose the action
  column, and without it every line read as an Add (the "Swap pending →
  Wall Mount Bracket" on an Informant). Lines are paired to the record
  they target BY CATEGORY (bucket field_2219, else the product name): the
  camera's swap is the camera-bucket Add/Remove pair; a mount line on the
  same record is the accessory riding along — its Remove lists as
  "Swapped out · SOW ####CO", never as the camera's replacement. Product
  names compare with the CO line's " - SKU" suffix stripped. An accessory
  the swap pulled that ALSO has its own install record flagged removed
  (signature flags the ride-along mount as well as targeting it on the
  device's line) is listed once: its own row, carrying the CO from the
  device's line. Rows inside every group follow the proposal's bucket order
  (install `field_2218`), worksheet order within a bucket; the By MDF/IDF
  and By SOW views carry small bucket sub-heads; By category orders its
  groups the same way. And the lines show what the
  install record cannot — a Remove on an UNSIGNED CO (row stays in
  Shipping, amber "Removal pending · SOW 1418CO not signed" chip: nothing
  leaves scope before signature) and a SWAP (Remove + Add pair targeting
  one record; signature updates the record's product in place, so the row
  shows the NEW product with a "Swapped in by SOW 1418CO · was <old>" chip;
  and because the OLD unit is real hardware — quoted, maybe shipped, maybe
  on site — the pair's Remove line (product + qty) is listed in the removed
  block as "Swapped out · replaced by <new>", hardware to bring back. The
  block is titled "Removed or swapped out by change order" — the "the CO
  swapped a camera and there's an extra one on site" case). Never listed: services, assumptions. Accessories are rows in their
  own bucket. Group headers are 15px headings with a rule; Camera / Reader
  alone carries a subtotal row in the category view (the drop count is what
  a PM checks; on mounts or headend it adds nothing). The old per-MDF / grand summary panels and the "Summary
  only" toolbar mode are hidden on both deploy mounts (a saved Summary-only
  mode is bounced back to the default). Mockup: the "Install BOM Summary
  Wireframes" canvas. `tests/deploy-page/test-bom-tray.js`.
- **`site-maps-strip.js`** — "Site maps & coverage" card in row 2 beside the
  "Also" list. Reads Other Files (view_3942 / sub view_4063), picks maps by
  CONFIG_file type (field_2877 matching site plan / coverage / floor plan);
  image tiles with thumbnail + Pop out (own window, zoom/fit), PDFs as document
  cards; empty state holds the place; density ≤3 big / 4–6 medium / 7+ compact,
  `MAX_VISIBLE` 6 then a "+N more" tile.
- **`regenerate-closeout-docs.js`** gained `SCW.regenDocs.openPicker(host,
  stateBtn)`; **`acceptance-card.js`** unchanged (drawer CSS override lives in
  deploy-page-nav).

### Tests

`tests/deploy-page/test-*.js` (jsdom, no framework): `cd tests && npm install &&
npm test`. They fake jQuery/Knack, emulate ktl-accordion's header toggle and
scene re-render, and pin the invariants above (tile/list element identity across
open → mid-close pass → close; composer fills the hidden form; icon-only action
links; 12-map overflow). Update them with the module; run all four before a push.

### Builder state

Done: `FLAG_pinned` field_3278 on DOC_notes, on view_4135 inline-editable;
`QA_status` field_3277 (multiple choice), `QA_checks done` field_3279,
`QA_checks total` field_3280 on the install line item (same object as view_4093);
`Add DOC_note` form view_4162 on scene_1311 (Notes + hidden project connection
field_329). Still needed for the QA checklist: `Include on checklist` on the
Config Field Definition object (key TBD), the Checkbox input type's exact name,
field_3277 choice spellings, inline edit on view_4093 for 3277/3279/3280/2830/
2831/2832, and on view_4056 for field_2932 + QA_status (sub "Mark fixed").
Optional: an "Add File" menu link → project-connected DOC_files form on
scene_1311 (the bundle proxies it into the Files action bar + the maps upload
button automatically when the link text matches /add|upload file/i).

### Learned 2026-09-18 (second session)

- The hidden-form composer never opened live: "Add Project Note (K2)" kept
  navigating to the child page (the on-page/schema lookups came back empty,
  so the click fell through to the anchor's href). Replaced by adopting the
  form itself into the drawer — nothing to look up, nothing to fill by
  proxy. The user's call: no button, the form lives on the page.
- First live test of the adopted form: it looked like a raw KTL view
  (KTL's global `.kn-view:has(.ktlHideShowButton)` styling beat the class
  CSS) and after the first save it vanished with the button back (Knack
  replaced the element; the pass that couldn't find a `<form>` restored the
  button). Both fixed as described in the module note.
- Second live test: the button stayed gone, but after a submit the form never
  came back; third test: no form at all, `[id=view_4162]` absent from the
  DOM while `Knack.views.view_4162` still existed. Root cause of both: the
  adopted form was placed INSIDE `#view_4135`, and Knack rewrites that
  element's contents on every grid refresh (after a save, a pin, its own
  fetch). Moved to a sibling before the view. (Knack's confirmation /
  reload path was a red herring.) Dropped Knack's submit
  entirely: the note is POSTed through the form view by the bundle and the
  form is never touched (see the module note).
- The Agreements & Invoices tray "reproduced the entire top section of the
  page": `buildNav` anchors the nav directly before the FIRST accordion
  (Acceptance) on every pass, using the accordion element wherever it is —
  with Acceptance in the drawer, the tiles / maps strip / "Also" list were
  carried into the drawer body. Now a first section that is away anchors at
  its home placeholder. Any pass while the tray was open triggered it
  (heartbeat, a view render), which is why it looked new: the notes work
  made more passes happen with a tray open.
- Setup drawer said "Not generated" for approval forms the project clearly
  had: live, the generator types a blank as plain "Location Approval Form"
  and puts "(not completed)" in the file NOTE (field_588); some runs miss the
  type and carry only the note. `setupDocs` now matches type + note together
  (a completed upload has the type and no such note, so it still stays out).
  The Setup TILE's "N of M docs generated" still counts the closeout doc
  cards, a different tally.
- The Push link was not exercised; still unverified below.

### To verify live (not yet confirmed by the user)

- BOM tray: the button shows in the worksheet toolbar, the old Summary
  blocks are gone, pricing columns fill (they need view_4072 to carry
  field_1960 / field_2262 / field_2268 — if every row shows —, those
  columns are missing from the hidden grid), SKU fills once INPUT_sku is on
  view_4072. Sub dashboard: no pricing.

- Notes drawer: the "Add DOC_note" form (view_4162) shows at the top of the
  list as a bordered box (textarea, Pin checkbox, "Save note"), and the
  "Add Project Note (K2)" button is gone. A saved note lands with
  author/date filled (form rules), the card appears without a reload, the
  ticked pin sticks, the textarea clears and "Note saved." flashes above the
  list. Author / date must come from the form's record rules (they run
  server-side for the view-based POST). If
  the form shows Knack's default look (title "Add DOC_note", "Submit"),
  the adoption didn't run: check the console for
  `[scw-pinned-notes] add form not adopted`.
- The card's "Push Note to Clickup and Slack ›" link fires the action rule
  (it programmatically clicks the hidden row's anchor; if Knack ignores
  that, target the `i.fa-send` icon instead).
- Slow first load reported once, not reproduced (jsDelivr cold fetch per new SHA
  is the likely cause; ask which phase is slow on a second load).

### Next

1. Line items: the QA checklist per item (design above, Builder keys pending),
   the 3-segment view switch, "show only Disconnected" including connection
   targets (`field_2795` = Yes), checkbox bulk flow.
2. Contacts + pinned contacts; pinned files in the maps strip (see "Next up").
