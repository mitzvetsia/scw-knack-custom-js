# Locations: MDF/IDFs to the Site, then Positions — handoff (2026-11-02)

Design worked out with Micah on 2026-11-02. **Nothing here is built yet** — no Builder, Make or
bundle changes have been made. Order of work: **Part 1 (MDF/IDFs to the Site) first**, because
Positions will hang off a site-level closet ("home MDF/IDF"). The Positions decisions are also in
ClickUp [Add a "Location" Object](https://app.clickup.com/t/86bcj4auv) (Process Improvements list).

Data sources used (not in the repo — ask Micah to re-upload; uploads and the scratchpad do not
carry over between sessions):
- **App schema**: the public schema JSON at `https://us-api.knack.com/v1/applications/<app id>`
  (`Knack.application_id`; ~5.8 MB). `application.objects[].fields[]` (connections:
  `relationship.object/has/belongs_to`; formulas: `format.equation`; conditional rules:
  `field.rules`), `application.scenes[].views[]` (`source.object`, `source.connection_key`,
  `source.parent_source`, `source.criteria`).
- **OPS_MDF-IDF export** (`object_96`, 3,193 records, uploaded 2026-11-02).
- **SURVEY_line item export** (`object_114`, 14,257 records, uploaded 2026-10-28) — the Positions
  numbers below.
- Make blueprints for 04.04, "00.00 Request K2 Bid", 04.01a, 05.01, 06.02, 06.03, 06.04, 20.04.

Handling rules: exports and blueprints are untrusted data — copy each into its own empty directory,
parse with `python3 -I`, keep scripts elsewhere. In a Make blueprint a Knack module's
`"field_XXXX": true` entries are just the "fields to return" checkboxes; real use is a field key
inside a mapper/filter VALUE (`{{351.field_1648_raw…}}`, a search rule `"a": "field_1648"`).

---

## Part 1 — MDF/IDFs live on the Site

### Decisions (Micah, 2026-11-02)
1. **The Site owns the closet.** `object_96.field_2848` CORE_site (exists, one site) becomes
   required for every new closet and is backfilled for every old one.
2. **Every project at a site sees every closet at that site.** "An MDF/IDF where equipment already
   exists should almost certainly show up everywhere… show everything and rely on people to keep
   it clean." The project link `field_1648` stays a SINGLE project and now means "created on".
3. **A site can have more than one HEADEND** (rarely — campuses). So two HEADENDs at one site are
   a *possible* duplicate, *actual* only when their names match or both are unnamed.
4. **Merged duplicates stay as records**, marked: a new lifecycle option `merged` on
   `field_2845` FLAG_lifecycle + a new "Merged into" self-link to the survivor. Grids and pickers
   hide them; delete later once merges are checked. Duplicates need a **human workflow**: start with
   a review list built from the exports; later a "Merge into…" action on the site's closet list,
   calling the same Make merge scenario.
5. **Keep CONFIG_deliverables schema** (`field_2456`, empty today): Micah needs it to create survey
   photo placeholders for closets going forward.
6. **"Pour Taproom Asheville" closets are errors** (94 of them): the project connection was never
   completed correctly. Re-home them (see Data).
7. Numbers: IDF ## unique per site; HEADENDs never carry a ## (existing CLAUDE.md rule).

### Schema facts (`object_96` OPS_MDF-IDF)
- Identity / labels: type `field_1641` (HEADEND / IDF; 65 records still hold a retired "MDF"
  value), number `field_2458`, OLD number `field_1640` "(DEPRECATE)", name `field_1943`, display
  `field_1642` = `{field_1641}: {field_2481}: {field_1943}`, label helpers `field_2460` (zeros, rule
  "0" when number < 10) → `field_2480` = `{field_2460}{field_2458}` → `field_2481` SYS_set Label,
  set by conditional rules: (1) HEADEND → blank, but misconfigured as a "record" rule through
  `object_105.field_2006`, so it never clears this record; (5) new number blank → old `field_1640`;
  (6) new number set → `field_2480`.
- Other: notes `field_1643`, survey notes `field_2457`, location text `field_1644`, lifecycle
  `field_2845` (proposed / approved / installed / decomissioned), status `field_2844`, Record ID
  `field_2115` (text, = the record id), auto increment `field_1992`.
- Links out: project `field_1648` (one), site `field_2848` (one), survey requests `field_2435`
  (many), photos `field_1652` (many — the ONLY photo↔closet link; DOC_photos has no closet field),
  deliverables schema `field_2456`, old quote `field_1650`, fee structure `field_2002` (→ a
  DEPRECATED object), old quote equipment `field_1645` / `field_1646` / `field_1944`,
  `field_2006` → SOW line items (many, empty), `field_2145` closet↔closet mapping (empty).
- Links IN (everything points up at the closet): SOW line `field_1946` (one), SOW header
  `field_2144` (many), DTO `field_2211` / `field_2180` / `field_2250`, survey request `field_2438`
  (many — a second, independent pair with `field_2435` on the closet; check which one is current
  before merging), survey item `field_2375` (one), bid revision line `field_2720` (one), install
  item `field_2818` (one).
- Project `object_3`: Site `field_1259` (required), Record ID `field_2059`, Quotes `field_358`
  (old quotes → project; each quote belongs to one project). Site `object_74`: Record ID
  `field_2095`, Site ID `field_1469`, nickname `field_1256` (identifier).
- Legacy `object_75` "As Built: MDF / IDF" is already site-level (name, type, location, notes;
  3 views) — usable to cross-check older sites.
- Knack CAN source a view "through the page record's connection": `source.parent_source =
  {object, connection}` + `source.connection_key`. view_3892 already does (through the fee
  structure — wrongly, see below).

### Views to re-source (Builder)
Source each from "MDF/IDFs connected to this project's Site" (parent_source `object_3` /
`field_1259`, connection_key `field_2848`) and filter lifecycle is not `merged`:

| View | Scene |
|---|---|
| view_3577 | Build SOW (scene_1085) |
| view_3602 | Scope of Work Details (scene_1116) |
| view_3617 | Surveys dashboard (scene_1140) |
| view_3803 | Survey request details (scene_1271) |
| view_3822 | Reconcile bids (scene_1155) |
| view_3894 | Review surveys (scene_1303) |
| view_3932 / view_4060 | Deploy, ops / sub (scene_1311 / scene_1353) |
| view_4084 / view_4114 | Change order, ops / sub (scene_1362 / scene_1374) |

- **view_3892** (Review surveys) is sourced through the project's FEE STRUCTURE (`field_2002`), so
  it lists every closet sharing that fee structure across all projects (613 closets carry the one
  value). Re-source it by site too.
- Add forms view_3441, view_3656, view_4137 (project-connected) and view_3773 (survey-request
  connected) must also set the Site. Form record rules may not offer "the project's Site" as a value
  — if not, the bundle fills a hidden Site input (CLAUDE.md "Setting Form Fields Programmatically").
- **Switch the grids only after the first cleanup pass**, or every closet picker at a site lists all
  its duplicate "HEADEND: :" rows.
- Bundle: nothing reads `field_1648` / `field_2848`; the pickers list what these grids render
  (e.g. `filter-mdf-idf-by-view.js` reads view_3617; `worksheet-v2` `mdfManage` /
  `mdfSourceViewKey`, `bid-review-v2/mdf-manage.js`, `mdf-idf-cards.js`, `mdf-edit-core.js`). Re-check
  each after the switch; no code change is expected.

### Make
- 04.04, K2 and 04.01a look closets up by project: Knack search `field_1648 text:contains {{project
  id}}` (modules [156], [244]; 04.01a also [301], then [302] updates). Change to the project's site.
- 20.04 [351]/[352] read the closet's `field_1648` as a project fallback — still fine ("created on").
- **Unknown, find first**: (a) whatever creates default headends ("Default MDF", "placeholder MDF
  name - UPDATE ME", notes "this is a default Headend record -- please…"; 244 records) — none of
  the 8 blueprints above creates `object_96` records; (b) whatever stamped site + lifecycle
  "installed" on 147 closets (probably the install / greenlight path).
- **Merge scenario (to build)** — runs ONLY on a person's decision (a group in the review file marked KEEP on
  one row + MERGE on others, or later the "Merge into…" action); nothing merges on its own. Input =
  survivor id + loser ids. Re-point every record pointing at a
  loser: `field_1946`, `field_2375`, `field_2818`, `field_2720` (single → survivor),
  `field_2438` (many → swap loser for survivor, distinct; the SOW list `field_2144` is dropped, see below). On the survivor: union
  `field_1652` photos, `field_2435`; append the loser's notes with its label, and its survey-notes entries
  under the survivor's (both logs are newest first; keep each entry's own stamp). Loser:
  lifecycle `merged` + "Merged into" = survivor. Run sequentially (Make "Sequential processing")
  — the unions are read-modify-write. Skip DTO rows (transient).
- **Why Make, not a CSV re-upload, for merges**: exports show a closet by its display name, and
  duplicates share it (1,276 closets display as just "HEADEND: :"), so a line-item export cannot
  say which closet a line points at. Closet-only changes (site backfill, numbers, type, lifecycle
  marks) ARE a CSV re-upload matched on Record ID.

### Data (OPS_MDF-IDF export, 2026-11-02, 3,193 closets)
- 2,921 on a project (1,450 projects; 920 have one closet, 25 have 10+); 243 only on an old quote;
  29 on nothing.
- Only 147 have a site — all lifecycle "installed", all also on a project.
- 1,341 HEADEND/MDF records have no name; 1,276 display as "HEADEND: :"; 244 carry default text.
- Inside one project already: 81 projects with 2+ HEADEND/MDF, 17 with the same IDF number twice,
  9 with the same name twice.
- **Pour Taproom Asheville**: 94 closets (63 blank HEADENDs, 14 "Default MDF"), auto increment 97 →
  3348 (created across the app's whole history), none with a survey request or site. 55 carry an
  OLD QUOTE — 55 different quotes — so their real project is the quote's project (project
  `field_358` Quotes). The other 39 need tracing through what points at them (SOW / survey /
  install lines, photos) or a human.
- Numbers on IDFs (1,314): 764 only in the old `field_1640`, 533 only in `field_2458`, 6 agree, 4
  disagree, 7 neither. 1,361 HEADEND/MDF records carry an old number (against the HEADEND rule).
- Fill of old-quote fields: REL_Quote 2,093; REL_Networking Equipment 1,084; REL_Misc Equipment 1;
  REL_Drops 1; Devices Connected to Switches (sum of `field_1653` over `field_1645`) non-zero on 431;
  INPUT_Location 444.

### Field cleanup
- **Delete now** (empty or unused, on no view, not read by the bundle, not mapped in the 8
  blueprints): `field_2006` REL_MDF -> Scope Line Items (empty on all 3,193; its only reference is
  SYS_set Label rule 1 — remove that rule first), `field_2145` connection mapping (empty),
  `field_2844` FLAG_status (empty; lifecycle covers it), `field_2031` / `field_2032` (sums of SOW
  line money per closet over `field_1946`; on no view, and at site level they would add up every
  project's lines).
- **Keep**: `field_2456` deliverables schema (decision 5).
- **Old quote system — keep as history for now**: `field_1650` REL_Quote (also needed to re-home the
  Pour Taproom closets), `field_1645` REL_Networking Equipment, `field_1902` Devices Connected to
  Switches. `field_1646` and `field_1944` hold one record each and can go with the old quote pages
  (Draft Quote scene_873, Survey Form scene_915, Add HEADEND/IDF scene_926, scene_927). Fold
  `field_1644` INPUT_Location (444 records, only on those old pages) into Notes before deleting it.
- **`field_2002` REL_Fee Structure**: re-source view_3892, take it off view_3441 / view_4137, delete.
- **`field_1640` old number — not yet**: copy the 764 into `field_2458`, hand the 4 conflicts to
  Micah, blank HEADEND numbers, then delete SYS_set Label rule 5, then the field.
- Fix SYS_set Label rule 1 to clear THIS record's label for HEADENDs.
- Normalize the 65 type "MDF" records to HEADEND.

### Cleanup kit (built 2026-11-02 from the 11-02 exports — `tools/mdf_site_cleanup.py`)
Run: `python3 -I tools/mdf_site_cleanup.py <projects.csv> <sites.csv> <mdfidf.csv> <outdir>`. Results:
- Every closet's project resolved by name (2,921, none ambiguous); 3,090 of 3,193 closets resolve to a site
  (147 already had one, all agreeing); 103 cannot (40 Pour Taproom closets with no traceable quote, 30 on no
  project and no quote, 26 whose project has no site, 7 whose project's site nickname is shared). "Pour Taproom
  Asheville" is the OLDEST project record (`594359a8095db351c990ffef`) — consistent with a lookup falling back
  to the first record.
- 296 closets re-homed through their old quote's project (54 Pour Taproom + 242 quote-only), matched on the
  quote number (`YYYYMMDD-NNNN`) in the project's Quotes column.
- Import files (update existing records, matched on Record ID; no mapped column is ever blank):
  `01_site_backfill` 2,943 · `02_project_rehome` 296 · `03_idf_numbers` 764 · `04_headend_type` 1,879 (every
  HEADEND re-saved, so the fixed label rules clear their "01") · `05_location_to_notes` 434. `06_by_hand` 115.
  Before importing: lifecycle option `merged`, the "Merged into" link, SYS_set Label rule 1 on THIS record and
  rules 5 / 6 limited to IDFs.
- `07_duplicate_review` — **suggestions only; every merge is a human decision** (Micah 2026-11-02: "I'm
  extremely nervous about auto merging… all merging should be human review"). The file's Class is a confidence
  ranking (likely 368 groups / 900 closets; possible 121 / 312), "Suggested" names a keeper (installed →
  survey requests → named → most photos / old equipment → oldest), and the Decision column is filled by a
  person: KEEP on one row + MERGE on the others, or SEPARATE. Blank rows are left alone. 64 likely groups are
  unnamed IDFs matched on their number alone, 43 of them across projects that each numbered from 01. The
  exports carry no line-item counts per closet.
- **One closet, both systems; the SOWs keep the work apart** (Micah 2026-11-02: "they physically ARE one
  closet… and they DO have both types of equipment in them… but I do need to keep the SOWs separate by
  type"). 97 sites carry closets from both camera and access control projects; 117 likely groups pair a
  camera project's closet with an access control project's. The closet is shared and carries no system
  type; each SOW's lines point at it, so every worksheet, bid and proposal (all filtered by SOW) shows only
  its own SOW's equipment under the closet. The review file has a "Project type" column for reference.
- **No per-survey closet records** (recommended 2026-11-02 after Micah: "I really don't want to create 'MDF
  Survey records'… keeping track of all that and diffing all that feels overwhelming"). A closet has few facts;
  a per-survey copy + diff would recreate the duplicate problem the site rework is cleaning up. The survey adds
  OBSERVATIONS to the one closet, never a copy of it. Revisit only if ops finds itself regularly copying
  structured sub findings (rack space, power circuit…) into closet fields.
- **Survey notes → a stamped log in the SAME field** (`field_2457`; BUILT 2026-11-02, replacing the DOC_notes
  idea, which would add records and views for no visible gain to the sub). The stamp names the date and the
  SURVEY RECORD only — never the person or the company (Micah: "let's not include the sub name … just
  identifying by Survey Record would be enough"): `[11/02/2026 · SR262] no free outlet on the rack`. The sub
  types in the closet band's survey-notes box as before (`mdf-notes.js`, survey scene view_3617), but the box
  starts EMPTY and a blur ADDS the entry on top: `mdf-edit-core.js` `appendSurveyNote` GETs the record first
  (an entry another survey added since the page loaded is kept), prepends, and saves through the shared PUT
  (drop detection, model sync); it refuses to write when it cannot read the current notes. Text from before
  the log is marked `[Earlier notes] …` by the first append so it stays its own entry. Readable plain text
  everywhere (Knack, Make, exports), no JSON. Who sees what: sub surfaces (`mdfManage.surveyLog: 'own'` —
  the survey page view_3505 and the sub deployment dashboard view_4056) show only the page's survey's entries
  plus the earlier text, so one group never reads another group's survey notes on screen (the whole field
  still rides in the page's data — anyone reading the network traffic sees it); ops surfaces (build SOW,
  deploy, sales, reconcile, review surveys) show every entry, read-only. The location cards
  (`mdf-idf-cards.js`) follow the same rule: an "add" box on a survey page, a read-only log elsewhere — never
  an overwrite box. The cards' "Table view" toggle was REMOVED (2026-11-03): it was the one way left to reach
  a raw Knack grid whose `field_2457` cell is inline-editable (every other closet grid is a hidden data source
  or replaced by the worksheet), so no user can overwrite the log on screen and no Builder change is needed.
  The table was also the only way to page through a grid (the cards hide Knack's page controls), so the three
  visible card grids at 25 rows (view_3803, view_3892, view_3894) now load every closet
  (`change-record-limit.js`). The create form view_3773 writes the first note unstamped (it reads as
  "Earlier notes"). Two saves in the same second could
  still collide (rare). Corrections to the closet's own facts (name, ##, where) are applied by ops by hand;
  nothing applies automatically. Test: `tests/worksheet-v2/test-mdf-survey-notes-log.js`.
- **"What we know" on the survey page**: the panel's read-only part (name, ##, ops Notes, photos) plus the
  devices this survey home-runs there; once closets are site-level, also the equipment already INSTALLED there
  on past jobs (install items `field_2818`, site `field_2847` — a hidden install-items grid on the survey
  scene). Subs adding a closet see the site's closets first ("is it one of these?"); a new one is marked
  proposed / added by sub for ops review — that is where duplicates are born.
- **Closet photos are general photos of the closet and everything in it**; equipment-specific photos belong
  on that equipment's line item. So ONE general closet photo schema (`field_2456`) serves every system —
  no per-type schema. Photos stay on the closet (`field_1652`) and accumulate across projects (that is the
  closet's history); each DOC_photos record already says which project / SOW / survey took it
  (`field_675`, `field_2341`, `field_2423`) and when, so the photo band can show the current survey / SOW
  first and fold the earlier ones by job. On sub surfaces show "Sub" / "SCW", never the uploader's company.
- One ## per closet per site, shared by both SOWs; never renumber an INSTALLED closet (its number may be on
  cable labels). Optional later: "Also in this closet: N access control devices (SOW …)" on a closet card.
- Not built yet: the Make merge scenario (input = a reviewed group: survivor + losers).

### Why closets land on "Pour Taproom Asheville" (found 2026-11-10, fresh exports)
Dated from the record ids (the first 8 hex digits of a Knack id are its creation time; auto increment
tracks it in order): the 94 Pour Taproom closets are NOT old — 93 were created from 2026-02-12 on, the
newest on 2026-10-26. The 272 closets with NO project are older: created 2024-03 … 2026-03 (median
2025-08); 243 of them were made by automation the same day as their old quote, and they stop on
2026-03-24 — the old quote flow left the project blank. From February the same blanks became Pour Taproom.
- **Root cause**: OPS_MDF-IDF `field_1648` REL_Installation Project has `conn_default: "first"` (the
  schema), so a closet created without a project gets the FIRST project record — Pour Taproom is the
  oldest. Five forms show the project as a radio list defaulting to the first: view_3773, view_3628,
  view_3630, view_3781, view_2678; the DTO "add MDF/IDF" child forms view_4003 / 4004 / 4005 have no
  project input at all. **Builder fix (pending)**: set the field's default and those inputs to none, so a
  create that forgets the project leaves it blank and visible.
- **The creators**: every SOW-create scenario makes a default closet. 01.01 (floorplan submission)
  creates "placeholder MDF name - UPDATE ME" with the project it made (`249.id`) — correct. 01.02
  (HubSpot SOW) creates "Default MDF" with the project it created (`28.id`) or found (`8.id`) — correct.
  **01.03** (fires on every SOW created) created "Default MDF" when the project had no closet, taking the
  project from the closet search that had just come back EMPTY (`54.field_1648_raw[].id`) → blank → Pour
  Taproom, and connected the SOW to it (`field_2144`). **Fixed by Micah 2026-11-10**: module 67 now maps
  `{{2.field_2119_raw[].id}}`. My first scan of these blueprints missed the creates: they sit in
  `builtin:BasicIfElse` `branches`, not router `routes` — walk both.
- Attribution of the 94: old quote flow 55 (Feb–Jun 2026, stopped); native "add closet" forms / other
  automation 21 (Mar–Aug, incl. "testing survey created MDF from the add other…"); 01.03 "Default MDF" 14
  (Apr 24 – Oct 26); forms by a person 4 (Sep–Oct). The 14 01.03 closets are each on the SOW that
  triggered them — re-homing the closet does not detach it; a SOW export (`field_2144` + `field_2119`)
  lists them and their real project.
- **22.01 "MDF created → make sure it matches any SOWs"** adds every new closet to all SOWs on its project
  (`field_2144`). Unverified risk: for a closet with no project the SOW search filter value is empty, which
  may match up to 100 unrelated SOWs. A filter "closet has a project" before its search closes it.
- Kit re-run on the 2026-11-10 exports (3,233 closets): 01 2,975 · 02 296 · 03 764 · 04 1,906 · 05 434 ·
  06 114 · 07 1,231 rows (374 likely groups / 122 possible). The "Merged into" link exists now
  (`REL_merged into` in the export).

### Merging happens in the app, not from the review file (decided 2026-11-10)
Micah: "All merging will happen through the front end by adding a 'merge' button on the Site and/or Project
level that triggers a Make scenario … move [all connected records] to the 'merged into' record." The label
fix (SYS_set Label rules, `04_headend_type.csv`) is deferred. `07_duplicate_review.csv` stays as a WORKLIST
of suspected duplicates; its Decision column is no longer used.
- **The UI (bundle)**: a "Merge…" action on a closet card, ops logins only. It lists every closet at the
  project's SITE (a new hidden grid on the page: OPS_MDF-IDF connected to the project's site, parent
  `object_3.field_1259`, connection `field_2848`, lifecycle not merged), this project's first; the user ticks
  the duplicates and picks the keeper (default: installed → survey requests → named → most photos →
  oldest), sees what moves, confirms; one POST to a new `MAKE_MDF_MERGE_WEBHOOK` with survivor + loser ids.
  Mismatched type or ## shows an amber warning, never a block. The project pickers stay project-sourced until
  the merging is done (re-sourcing them first floods every picker with the duplicates).
- **The scenario (`22.03 | MDF-IDF | MDF/IDF merge -> move connected records to keeper`, Make)**: per loser, re-point every field that points at it — single: SOW line
  `field_1946`, survey item `field_2375`, install item `field_2818`, bid revision line `field_2720`; many
  (remove loser, add survivor, distinct): survey request `field_2438` (not the SOW list `field_2144`); union onto the
  survivor its own photos `field_1652` and survey requests `field_2435`; fill the survivor's blank name / ##;
  append the loser's notes and survey-note entries under a "[merged from <label>]" line; loser → lifecycle
  `merged` + "Merged into" (`field_3318` REL_merged into, added 2026-11-10) = survivor. Skip the DTO fields (`field_2211` / `field_2180` / `field_2250`,
  transient). Sequential processing ON (the unions are read-modify-write) — which means NO Webhook Response
  (Make refuses one in a sequential scenario): the page polls until the losers read `merged`.
- **22.01** (MDF created) gains the site: when a new closet has no site, read its project's site
  (`field_1259`) and write `field_2848`, so every creator — forms, 01.01 / 01.02 / 01.03 — lands on its site
  without touching each one; plus the "closet has a project" guard before its SOW search.

### One "create MDF/IDF" Make scenario (decided 2026-11-10)
Scenario names (Micah's convention `SS.NN | DOMAIN | Trigger -> Result`; stage 22 is MDF-IDF): `22.01 | MDF-IDF | MDF/IDF created -> add to project SOWs` (retiring), `22.02 | MDF-IDF | MDF/IDF create, ensure default, list (webhook)`, `22.03 | MDF-IDF | MDF/IDF merge -> move connected records to keeper`. Positions get their own stage.
Micah: "integrate 22.01's functionality into one combined 'create MDF' Make automation." Knack's native
forms get the connections wrong (the project radio defaulting to the first project), so every closet is
created by ONE webhook scenario, called by a custom closet modal (every "+ Add MDF/IDF": survey page,
Build SOW, CO, deploy) and by the SOW-create scenarios. Two actions:
- **`create`** (the modal): payload = project, survey request / SOW when the page has one, type, ##, name,
  notes, who. Make reads the project's site (`field_1259`), refuses a ## already used at the site (HEADENDs
  never get one; blank IDF ## = next free at the site), creates the closet with project ("created on"),
  site, lifecycle `proposed` for a sub / `approved` for ops, survey request (`field_2435`) and adds it to
  the request's `field_2438`, and replies with the new id so the modal can use it at once. It does NOT
  add the closet to SOWs (see "The SOW's closet list is dropped" below). Create-only, so no sequential processing is needed and a Webhook
  Response is allowed; a rare same-second ## clash is left to the merge tool.
- **`ensure-default`** (01.01 / 01.02 / 01.03, replacing their direct "placeholder / Default MDF" creates):
  with closets at the site, a new project must NOT make another blank HEADEND — that is where most of the
  "unnamed HEADENDs at one site" duplicates come from. Find the site's live HEADEND(s); create one only
  when the site has none; return the ids.
- **22.01** is retired once the scenario is live: its only job was the SOW list, and the site step lives in
  the create scenario. Until then it stays, with the "closet has a project" guard. The modal opens on the
  site's existing closets ("is it one of these?") before offering "new".
- **The SOW's closet list is dropped (Micah, same day: "I'm also not sure that connecting an MDF/IDF to a
  SOW matters in the new construct")**. SOW header `field_2144` REL_mdf-idf has writers (01.01, 01.02,
  01.03, 22.01) and no reader that matters: every closet grid the app shows is sourced through the PROJECT
  (`field_1648`) — view_3577 / 3602 / 3617 / 3803 / 3822 / 3894 / 3932 / 4084, the SOW pages through SOW →
  project — the worksheet-v2 pickers read those grids, and the bundle never reads `field_2144`. Its one
  reader is a native inline-edit option limit on view_3586's MDF/IDF column, a grid worksheet-v2 renders
  itself. In the site construct a SOW's closets are simply the closets its lines point at (`field_1946`).
  So: no SOW step in the create or merge scenarios; remove the SOW-connect modules from 01.01 / 01.02 /
  01.03 when they are switched to `ensure-default`; delete the field after a search of the Make scenarios
  not on hand (13.06b, 11.04, the publish path) finds no reader.

### Next steps
Done 2026-11-02 / 11-03: the exports came in, the cleanup kit and the duplicate review list are built
(see "Cleanup kit" above), and survey notes are a stamped log in the bundle. Nothing has been written
to Knack yet. What is left, in order:
1. **Builder, before any import**: closet project field default → none (see "Why closets land on Pour
   Taproom"); lifecycle option `merged` + a "Merged into" connection (the link exists as of 11-10: `field_3318` REL_merged into); fix the
   SYS_set Label rules (rule 1 to this record; rules 5 / 6 limited to IDFs).
2. **Imports** (update existing records, matched on Record ID): `01_site_backfill.csv` →
   `05_location_to_notes.csv`, in order; then the `06_by_hand.csv` rows by hand.
3. **Duplicate review**: Micah marks KEEP / MERGE / SEPARATE in `07_duplicate_review.csv`; nothing
   merges without that column.
4. **Make**: the merge scenario (runs only on the reviewed groups); site lookups in 04.04 / K2 /
   04.01a. The default-closet creators are found (01.01 / 01.02 / 01.03 — see "Why closets land on Pour
   Taproom"); 01.03 fixed 2026-11-10; 22.01's empty-project guard still to add.
5. **Builder**: Site on the add forms; re-source the 10 grids + view_3892 to the site; delete the
   fields in "Field cleanup".
6. Then Part 2.

---

## Part 2 — Positions (decided, not built)

A **Position** is a durable record for one device's spot at a Site — the identity an outside
service integrates with, shared by the SOW line, survey line and install item. Named "Position" in
Knack to avoid clashing with MDF/IDF Locations.

### Decisions
- **One device per Position per scope** (a scope = one SOW, one bid, or the as-built). A second
  device at the same Position in the same scope is a swap or gets a new Position. Alternates share
  Positions: the Original's bullet and the Alternate's dome both point at E-003.
- **Two cameras on one pole are two Positions** (same coordinates allowed). A Position can be
  "in/on" another Position (switches in rack ENC-001; cameras on a named pole). A bare pole or a
  door with two readers can be a Position with a name and no device.
- **The Position owns the designator.** Line items' prefix + number become display copies written
  from the Position (by the cascade), never edited by hand. The existing line-item prefix links stay
  as those copies: SOW `field_2240`, DTO `field_2241`, survey `field_2361`, bid revision
  `field_2973`, install `field_2823` (all → `object_111` CONFIG_pre-fix).
- **The prefix names the KIND of spot, never the current product**: E- / I- (camera exterior /
  interior), AC- (door), ANT- (antenna mount), ENC- (rack or enclosure), SW- (switch), NVR-
  (recorder), HUB- (door hub — Micah's pick over ACP-), plus the existing RA-E- / RA-I- / RA-AC-.
  Today's camera prefixes already behave this way: in the survey export 86% of E- lines are flagged
  exterior, 1% of I- lines, and every AC- line is a reader.
- **Assigned once at creation, then frozen.** Swaps, alternates and upgrades never rename. A
  different kind of thing at the same place = a new Position. A real reclassification is a manual
  rename that warns which SOWs share the spot.
- **Numbers unique per prefix per site**, next free number at creation, manual override.
- **Products carry "Allowed prefixes"** (new connection `object_8` → `object_111`, many). One
  allowed → used without asking; several → the form asks (the camera exterior toggle preselects
  E- / I-); none → the product never gets a Position. No "default prefix" field (Knack does not
  reliably keep multi-connection order). The list also filters "same spot as…".
- **Which lines get a Position**: a product with an allowed prefix (cameras, readers, antennas,
  racks / enclosures, switches, NVRs, hubs). Switches / NVRs / hubs get their own Position "in" the
  rack's Position — counting switches = counting SW- Positions holding a device; a closet with no
  rack line (488 of the 827 closets with networking gear in the survey export) locates its gear by
  the MDF/IDF.
- **A line with a parent shares the parent's Position** — mounts, materials, attached service
  lines, and door switches / exit sensors once parented to the reader. Read through the top-level
  parent (the worksheet's existing loop tie-break), never stored on the child.
- **Services and assumptions** get an optional **"covers"** link to any number of Positions,
  separate from equipment's single link so the as-built never counts a service as occupying a spot.
  They keep their MDF/IDF field for proposal grouping. Licenses and uplinks get none.

### Builder
- New Position object: Site (one), Prefix → `object_111` (one, required), Number, Designator (text
  formula: prefix + zero-padded number), In/on → Position (one), Name, the spot facts (interior /
  exterior, mounting height, existing drop, home MDF/IDF, map + coordinates), the other service's id.
- `object_8` Product: Allowed prefixes → `object_111` (many).
- `object_111`: new records SW-, NVR-, ANT-, ENC-, HUB- with their sub / sales visibility flags
  (`field_2439` / `field_2440`).
- Line items: Position (one) on SOW, survey and install lines; "Covers positions" (many) for
  services and assumptions.
- Allowed prefixes: cameras E-, I-, RA-E-, RA-I-; readers AC-, RA-AC-; switches SW-; NVRs NVR-;
  radios ANT-; racks / enclosures ENC-; Avigilon Alta 4 / 8 Door Hub and "AC Controller added during
  Survey" HUB-.
- The add modal's prefix list is hard-coded today (`worksheet-v2/sow-add-item-form.js`
  `PREFIX_OPTIONS`, asked for Camera or Reader only) — it becomes the product's allowed list.

### Enforcement
Knack's "unique" rule is app-wide and cannot apply to a formula, so: the Make find-or-create step
(sequential) checks designator uniqueness per site and one device per Position per scope; the add
form and the Position picker refuse a second device at an occupied Position on the same SOW; the
worksheet flags existing conflicts.

### Data (survey line item export, 2026-10-28, 14,257 lines)
- Camera or Reader 6,037 (99% designated: I- 2,636, E- 1,754, AC- 779, RA-I- 460, RA-E- 273,
  RA-AC- 71, UPLINK- 26; none qty > 1). Networking or Headend 1,533 (1% designated; NVRs,
  switches, door hubs, 270 uplinks). Other Equipment 2,742 (DPS + REX 707, labeled by product name
  and linked to no door; radios 273; racks / enclosures 373 lines incl. Server Rack 6U, 14x12x8 and
  weatherproof / NEMA enclosures). Services 810 (24 name a designator in their text); assumptions
  3,118 (18 do).
- Same designator twice on ONE bid: 33 cases on 8 bids, 11 with different products (E-1 Deputy 4.0
  v4 vs Deputy 8.0; I-100..I-102 "Camera Added During Survey" vs Informant 8.0) — the backfill's
  review list.

### Backfill
Create Positions from designated lines only; skip the 26 UPLINK- lines; same-bid duplicates go to
review (swap or two spots?).

### Still open
1. Which service is this for — a VMS or the floor-plan app? Decides who owns coordinates and which
   way names flow.
2. When does the name lock — survey / final bid, or signature?
3. Backfill reach — one set of Positions per project, or merged across projects at a site?
4. Number existing switches / NVRs in the backfill, or leave them?
5. Door switches / exit sensors: parent them to the reader, or pin by hand?

### Rough size (first scope)
Builder ~2 days; Make ~1 week (≈15 scenarios that create or copy line items); backfill ~3 days +
review; bundle UI 1.5–2 weeks; the integration depends on the service.
