# Revenue dashboard — working notes

## What it is

`q2-2026-revenue-dashboard.html` is a single-file, dependency-free dashboard
used for the twice-a-month revenue update to the field. It is published as a
Claude artifact and read live by the team.

- **Artifact:** https://claude.ai/code/artifact/38f8f30f-7f94-4e19-9751-3d082b4d7cc2
- **Sharing:** owner-only. It declares the `db` capability, and artifacts using
  `db` cannot be shared publicly — turning public sharing on will make the
  publish fail with a 422.

## Structure

1. **This month** — hero (booked + projected), thermometer, readouts, a
   collapsible *Last month*, burn-up chart.
2. **Q2 & Q3** — the Apr–Sep goal window: paired hero, goal track, four tiles,
   window chart, Aug/Sep chart.
3. **Previous years** — monthly lines, ten-year chart with the 2026 projection
   pair.

A *Backstage* drawer holds the entry deck, the editable holiday list, the 2026
YTD override, and the month navigator. A history editor and a "Numbers &
methodology" section sit at the bottom.

## Goals

| Scope | Modest | Stretch |
|---|---|---|
| Apr–Sep window | $6,650,000 | $7,850,000 |
| Per month (implied) | $1,170,000 | $1,360,000 |

The window is Apr–Sep — the source sheet's "Q2 / Q3" column. Confirmed because
the stretch figure matches the sheet's own $1.4M/month scenario exactly.

## Where the numbers live

Entered figures are stored in the artifact's shared `db`, so every viewer sees
the same values and Claude can read them back:

- `board/history` — a single document holding `DATA` (monthly history by year,
  goals, decade totals, holiday overrides).
- `months/<YYYY-M>` — one document per tracked month, with `mInstall`,
  `mMagento` (eCommerce), `mCheckMO`, `mBigDeal`, `mPendInstall`, `mDaysTD`,
  `mDaysTotal`, `mGoal1`, `mGoal2`.

`localStorage` mirrors both as an offline fallback (`scw-board-history-v1`,
`scw-q2-board-v2`). Read the db with the Artifact tool's `read_db` action
against the artifact URL above.

**Saving happens in the input handlers, never in `renderMonth()`.** A
snapshot-driven render that wrote back to the store would retrigger itself.

## Conventions that took a while to settle

- **Pacing, not plan.** No "plan" language anywhere.
- **eCommerce**, never "magento".
- **Colour expresses pacing**, not category: red/amber only below modest, blue
  from 90%, green at modest, green + gold star at stretch. Never colour a
  positive number with a warning hue.
- **No invented goal lines on charts.** Monthly charts show actuals plus a
  single forward dashed segment for the month in progress.
- **Big deal** pulls a one-off (≈30%+ of a typical month) out of the daily
  average so it doesn't skew the projection, then adds back to the total.
- **Business days auto-default from the calendar**; the ±¼ buttons are manual
  adjustments only.
- Compact currency rounds to thousands *before* choosing the unit, so $999,700
  reads $1.00M and never $1000K.

## Posting an update to Slack

Approved copy for the current cycle lives beside this file (e.g.
`september-2026-update.md`) with the source figures that produced it. Read the
live numbers from the artifact db first — the committed copy is a snapshot and
goes stale as the month fills in.

The group chat is Micah / Matthew Nederlanden / Ben Larue.

## Rendering a screenshot

Playwright + Chromium are available (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
Render the local file with `p.clock.install()` set to the date you want, and
seed `localStorage` with the db values so the render matches what the team sees.
The artifact skeleton supplies `[hidden]{display:none!important}` — a local
preview wrapper must include it too, or hidden banners show up in the shot.
