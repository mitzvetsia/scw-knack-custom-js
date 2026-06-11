# High-Priority Backlog Prompts

The **higher-priority** TODO queue: things we've noticed and decided to work on
soon, each captured as a **ready-to-run prompt** for a fresh Claude Code session.
The lower-priority backlog (documented known issues and deferred follow-ups) lives
in `CLAUDE.md → Lower-Priority TODOs (Known Issues)`.

## How to use

- **Capturing**: append a new entry using the template below. Write the prompt so a
  session with **no chat history** can execute it — name the views/fields/files,
  the symptom or goal, constraints, and what "done" looks like. Assume the session
  has CLAUDE.md but nothing else.
- **Running one**: copy the fenced prompt block into a new Claude Code session
  verbatim. Update the entry's status afterward.
- **Statuses**: `Captured` → `Done` (link the commit/PR) or `Deferred` (demoted to
  the CLAUDE.md lower-priority section).

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
