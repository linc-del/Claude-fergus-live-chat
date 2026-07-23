# Handoff — where things stand (2026-07-22)

Quick catch-up note so a fresh session can carry on. Branch: `claude/the-brain-refactor-b76jik`.

## Done & committed
- **`brain.yaml`** — the whole Company Brain as one file (replaces the ~45-file Drive "Brain").
- **`README.md`** — explains the coded Brain.
- **`brain-dashboard.html`** — live private dashboard. Published artifact:
  https://claude.ai/code/artifact/bfd40719-aa8c-49b9-a519-514e70c16932
  (weekly auto-refresh routine set; masks bank acct + personal emails).
- **`.claude/skills/fergus-gear-entry/`** — voice/text → Fergus job-card skill.
  - Tightened over 2 eval rounds; **live-tested on a real job** (works end-to-end).
  - Push method: `manage-stock create-on-hand` with item **details** (description/cost/price/qty),
    NOT the pricebook search id (404s), and the job must be **active** (draft 500s).
  - `references/linc-standard-fits.md` = Lincoln's confirmed gear:
    sockets/switches Vynco Home / Voltex / PDL Iconic · downlights Voltex (Monaco 9W) ·
    **flat** TPS (2.5mm #1, then 1mm, 1.5mm) · batten Voltex VBH · switchboard **all Schneider Resi9**
    (RCBOs + MCBs, always ask amp) · flush box 144MT · plus history-mined fittings.

## OPEN — pick up here
1. **Job 11176 (Oven / David Russ): rangehood still not added.** 6 lines are on; Lincoln needs to
   pick which rangehood (Parmco 60cm S/S or White ~$333.72, Bellini 60cm S/S $299, or other) then push it.
2. **Web-booking → Fergus auto-create clients** — to be designed. Data shows Google/Web is the #1
   *known* source; ~59% of recent new clients still tagged "Unknown" (capture not sticking).
   Caveat: Fergus API can NOT read/write the customer **Source** field (checked) — auto-created
   clients land "Unknown" unless the web form captures source and passes it into a note.
3. **Fergus Source dropdown cleanup** — delete the "zz DONT USE" options (staff still pick them).
4. **Fergus auth stability** — session token kept expiring (~every 20 min) tonight; not yet fit for
   unattended automations. Needs a stable/service connection before building anything mission-critical.
5. **Parked:** connect Fergus in Lincoln's phone app (self-serve skill use) · supplier-document
   auto-filing · help Toni finish the Glide stock rollout (Glide = the stock DB/app; Claude = the
   brain layer on top, not a replacement for it).

## Notes
- Skills install to profile via the `.skill` file's "Save skill" button (needs org permission);
  otherwise the skill just lives in this repo and is active in-session.
- Commit trailers in this repo: Co-Authored-By + Claude-Session lines.
