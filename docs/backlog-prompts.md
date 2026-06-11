# Backlog Prompts (lower-priority captures)

A running list of "things we noticed we need to work on," captured as **ready-to-run
prompts** for a fresh Claude Code session. This is the lower-priority inbox; the
curated, higher-priority backlog lives in `CLAUDE.md → High-Priority TODOs (Known
Issues)`. When an item here becomes a priority, graduate it into that section (and
mark it **Promoted** here).

## How to use

- **Capturing**: append a new entry using the template below. Write the prompt so a
  session with **no chat history** can execute it — name the views/fields/files,
  the symptom or goal, constraints, and what "done" looks like. Assume the session
  has CLAUDE.md but nothing else.
- **Running one**: copy the fenced prompt block into a new Claude Code session
  verbatim. Update the entry's status afterward.
- **Statuses**: `Captured` → `Promoted` (moved to CLAUDE.md High-Priority TODOs)
  or `Done` (link the commit/PR).

## Entry template

```markdown
### YYYY-MM-DD — Short title
- **Status**: Captured
- **Context**: 1–3 lines on where/how this was noticed (views, scenes, repro).

#### Prompt
​```
<self-contained prompt for a fresh session>
​```
```

---

<!-- Entries below, newest last -->
