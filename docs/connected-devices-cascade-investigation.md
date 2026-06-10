# Connected Devices Cascade — Investigation Handoff

**Status:** UNRESOLVED. Branch `claude/sharp-fermat-eKEa9`. Latest build `e39677f`.

## The symptom

On **view_3586** (sales "Scope of Work Line Items", v2 worksheet, scene_1116):
when you **remove** one device from an NVR/switch's **Connected Devices**
(`field_1957`), the cameras' **Connected To** (`field_2197`) show as
**disconnected on ALL** former members, not just the de-selected one.
**Adding** devices works fine. The same cascade code works correctly on
**view_3962** (build-SOW scene).

## Field model (confirmed, documented in CLAUDE.md)

- `field_1957` = Connected Devices (multi-connection, on the switch/NVR → cams).
- `field_2197` = Connected To (single-connection, on the cam → switch).
- These are **SEPARATE Knack fields**, NOT two halves of one reciprocal
  connection. Knack does **not** auto-sync them. They are kept aligned **only**
  by the cascade in `src/features/mirror-connection-sync.js`
  (`applyDeterministicRegroup`). (User confirmed: editing one natively does
  not update the other.)
- SOW Line Item object = **`object_105`**.

## What is CONFIRMED (do not re-investigate)

1. **The cascade diff logic is CORRECT.** A temporary unconditional
   `CASCADE DIAG` log (added then removed) proved, on a real removal:
   ```
   authoritative: true, authoritativeIds: ["E-003"],
   newChildIds: ["E-003"], currentChildIds: ["E-002","E-003"],
   added: [], removed: ["E-002"]
   ```
   i.e. it correctly computes `removed = current − selected` and fires
   `field_2197:[]` on ONLY the de-selected child. **The bug is NOT in the diff.**

2. **The v2 picker passes the authoritative chosen ids** through the
   `knack-cell-update` dispatch (5th arg `triggerIds`), and the mirror uses
   them verbatim. `authoritative: true` in the DIAG confirms this reaches the
   cascade.

3. **Object-scoped PUTs do NOT work from the browser.** Routing reciprocal
   writes to `/v1/objects/object_105/records/<id>` returns **403 + CORS**
   (`No 'Access-Control-Allow-Origin'`) because that endpoint needs the secret
   `X-Knack-REST-API-Key`. **Reverted.** Only **view-scoped**
   (`/v1/pages/<scene>/views/<view>/records/<id>`) works with session auth.
   Do not retry object-scoped from client JS.

4. **view_3586 runs BOTH worksheets + multiple editors in parallel.** This is
   the key environmental difference from view_3962:
   - v1 `device-worksheet.js` IS configured for view_3586 (line ~579); NOT for
     view_3962.
   - v1 `connection-picker.js` is configured for view_3586 (+3610/3921/3505/
     3915); NOT for view_3962.
   - `sales-change-request` listens to `knack-cell-update.view_3586` and writes
     a CR draft (`field_2707` on `view_3841`) on every edit.
   - So on view_3586, a single edit produces MULTIPLE `field_1957` PUTs +
     a CR-draft PUT. On view_3962 there's a single clean path.

## Fixes already shipped on the branch (all still in place)

- `picker.js` / `mirror-connection-sync.js`: thread authoritative chosen ids
  into `applyDeterministicRegroup` (3rd arg) + keep them **sticky** through the
  400ms settle window so a second non-authoritative `knack-cell-update` (from
  `sales-change-request`) can't null them out.
- `connection-picker.js`: pass `selectedIds` as the authoritative arg to the
  mirror; and **bail on any click inside `.scw-ws-v2`** so the v1 picker can't
  double-handle a v2 edit.
- `device-worksheet.js` (separate, earlier task): Survey Notes moved into the
  summary row on view_3505 — unrelated to this bug.

## The OPEN QUESTION (where the next session should start)

The diff is correct and fires `field_2197:[]` on only the removed child — yet
the UI still shows multiple disconnected. The user confirmed **the warning is
NOT stale** (it reads `field_2197_raw` straight from the model). So either:

**(A) view-scoped `field_2197` writes don't actually persist on view_3586.**
`field_1957` (on the switch) persists because it's an editable input on the
view. `field_2197` (on the cam) may be a read-only DISPLAY column on view_3586,
so the view-scoped PUT silently drops it. (On view_3962 it's editable → works.)
- **BUT** the original "clears all" bug *did* visibly stick, which suggests
  `field_2197:[]` writes DO persist. Unresolved tension — needs a definitive
  hard-reload test (see below).

**(B) Residual data damage.** Early all-clearing runs wiped `field_2197` on
cams server-side; a later re-add failed (the 403 object-scoped build) so the
damage was never repaired. The "2 disconnected" may simply be old wreckage on
records that were never successfully re-connected.

### Definitive test to run FIRST in the next session (on `e39677f` or later)

Pin the loader to the build under test, then with the **console open**:
1. Connect the switch to BOTH cams. **Hard reload** (Cmd/Ctrl-Shift-R).
   - Both show connected? → view-scoped `field_2197` SET persists → rule out (A).
   - Either shows disconnected? → `field_2197` is NOT writable via view-scoped
     on view_3586 → it's a **Knack Builder config fix**: make `field_2197`
     an inline-editable field on view_3586 (or point the cascade's reciprocal
     PUT at a view/form where it is editable). Not a code fix.
2. Remove one cam. **Hard reload.**
   - Expect: only the removed cam disconnected.

The hard reloads are essential — they separate true server state from
optimistic local-model patching (`syncModelChild` patches the model before/
without the server confirming).

## Other notes

- **CDN caching suspicion:** several user logs were byte-for-byte identical
  across builds. jsDelivr serves per-commit-SHA immutably, so if the Knack
  loader is pinned to an old SHA, none of the fixes are live. ALWAYS confirm
  the `@<sha>` in the Knack JavaScript loader matches the build being tested.
- **Pre-existing unrelated error** in console on view_3586:
  `[SCW] renderTotals threw on view_3586 … Cannot read properties of undefined
  (reading 'push')` — a Knack Builder Totals-row config referencing a dead
  field. Suppressed; harmless; clean up in Builder when convenient.
- **Pending structural cleanup:** view_3586 is meant to become v2-only (hide
  the v1 worksheet). While both render in parallel, edits can take either
  path. If (A) turns out true and the Builder fix is undesirable, the
  alternative is to fully retire v1 on view_3586 so only the v2 path (which
  could write `field_2197` through a view where it's editable) is used.

## Key files

- `src/features/mirror-connection-sync.js` — the cascade (`applyDeterministicRegroup`,
  `firePut`, `fireAccessoryPut`, `createMirror` registrations).
- `src/features/worksheet-v2/picker.js` — v2 picker; dispatches `knack-cell-update`
  with authoritative `triggerIds`.
- `src/features/worksheet-v2/init.js` — v2 conn-btn → picker wiring (field_1957
  candidate filter ~line 1113).
- `src/features/connection-picker.js` — v1 picker (td.field_1957 clicks);
  `saveSelection` 3-stage flow.
- `src/features/worksheet-v2/warnings.js` — `isDisconnected()` reads
  `field_2197_raw` from the model.
</content>
