# Manage Deployment page (scene_1311) — redesign

Status: **design direction agreed 2026-09-18** (mockup session). Implementation not
started. Mockup: the "Manage Deployment Redesign" design canvas (private artifact,
six artboards: page at rest, line item open, Files / Context photos / Closeout /
Project notes drawers).

## Why

The page reads as nine co-equal accordion bars with three navigation layers
(K2 tabs, "On this page" pills, five band labels) indexing the same sections, six
status vocabularies, Closeout expanded by default pushing the install worksheet
~830px down, and Project Wide Assumptions rendering as legal paragraphs. Every
prior fix (deploy-page-nav.js: rename, bands, tiers, rollups, pill bar) was
additive chrome.

## The shape (Phase I)

**The worksheet is the page; everything else is a status tile or a drawer.**

1. **Four stage tiles** replace pills + bands + accordion bars: Paperwork & billing,
   Project setup, Installation (current, navy), Closeout. One four-state
   vocabulary: Done / Waiting / In progress / N missing. The rollups the nav
   module already computes feed the tiles.
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

## Rolling up "QA checklist complete"

The JSON blob cannot be rolled up by Knack formulas, so the **item verdict is
the rollup unit**, not the individual checks.

- **Per item, written by the bundle in the SAME view-based PUT as the blob**
  (one request, no extra rate-limit cost):
  - `QA_status` (new multiple choice): Not started / In progress / Complete /
    Failed — derived: no checks → Not started; some → In progress; every
    checklist item checked + required photos in → Complete; verdict Fail →
    Failed. (Or reuse `QA_passed` Yes/No for Complete only; the 4-state field
    is what makes "in progress" visible.)
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
- Scene_1311: a hidden DOC_files grid filtered to doc type "Site Plan"
  (`field_67`) for the maps strip; today no view on the scene loads site plans
  (Other Files, view_3942, only carries closeout docs).
