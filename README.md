# Linc Electrical — Company Brain (coded version)

This is the whole "Company Brain" as **one file**: [`brain.yaml`](./brain.yaml).

## Why this exists

"The Brain" in Google Drive is currently ~45 files across 8 folders — starter
sheets, CSVs, PDFs, "Observed Facts" docs, plus up to **6 versions** of some
CONSOLIDATED sheets (Company Core runs v1→v6). To read one fact you first have
to know which folder, which file, and which version is current.

The actual *knowledge* underneath all that is small. `brain.yaml` holds every
real fact from all 8 folders in one place — readable by a person in 5 minutes,
and readable by automations (the quote-builder, the Monday brief, reminders)
without parsing spreadsheets.

This was generated **read-only** from the Drive folder — nothing in Drive was
created, edited, or deleted.

## How it's organised

One top-level key per original folder, plus two roll-up sections:

| Key | Was | Holds |
|-----|-----|-------|
| `company` | 01 Company Core | legal/GST/NZBN, licence, contact, bank, insurance, branding |
| `people` | 02 People & Roles | team + charge-out rates, who-to-call, system access |
| `suppliers` | 03 Suppliers & Accounts | wholesalers, account refs, reps, terms |
| `rates_and_rules` | 04 Rates & Rules | labour, markup floor/bands, GP target, GST rule, deposits |
| `processes` | 05 Processes & SOPs | how we quote, job start→finish |
| `templates` | 06 Templates & Wording | quote intro, follow-up, review, deposit clause, T&Cs link |
| `compliance` | 07 Compliance & Safety | licences, training matrix, insurance (linked, not duplicated) |
| `customers_and_job_types` | 08 Customers & Job Types | job types, customer segments |
| `open_questions` | — | where sources conflict and a human must decide |
| `needs_human` | — | facts no system holds, still to be supplied |

## Two rules it keeps from the original

1. **Don't duplicate live systems.** Fergus (jobs), Xero (accounts) and Glide
   (pricing) stay the source of truth for their data. This file links to them
   (`see:` / URLs), never copies — copies go stale.
2. **Every fact carries a status:** `confirmed`, `decided`, `draft`,
   `conflict`, or `needs_human`. So you always know what's solid and what still
   needs your eye.

## To update

Edit `brain.yaml` directly — it's plain text. One file, one place, version
controlled by git (every change is tracked, nothing gets lost to a "v7").
