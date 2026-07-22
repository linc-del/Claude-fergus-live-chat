# Fergus Invoice Drafts — Linc Electrical Ltd

An automated sweep of Fergus that finds every active **charge-up** job with logged,
**unbilled** work and drafts a customer-ready invoice for each one, for Lincoln to
review and then enter/approve in Fergus.

## What it produced

As at **22 Jul 2026**:

| | |
|---|---|
| Draft invoices | **72** |
| Subtotal (ex GST) | **$79,954.01** |
| GST (15%) | **$11,993.09** |
| **Total (inc GST)** | **$91,947.10** |
| Flagged for review before sending | 3 |

Open [`invoice-drafts.html`](invoice-drafts.html) — a self-contained review dashboard
(search, filter, sort, per-job "copy description"). Underlying data is in
[`data/drafts.json`](data/drafts.json).

## How a job qualifies

A job is drafted when, in its Fergus financial summary:

- it is an **Active** job of type **Charge Up**, **and**
- `chargeableAmount.total > 0` (work has been logged), **and**
- `totalBilled.total == 0` (nothing invoiced yet).

This excludes empty jobs with no time logged (e.g. freshly created bookings) and
any job already invoiced or part-invoiced.

## Where the numbers come from (nothing is altered)

Everything financial is read straight from Fergus and left untouched:

- **Labour** — from each job's **time entries**: `hours × chargeOutRate`
  (Fergus already holds the correct charge-out rates per staff member).
- **Materials & parts** — the job's chargeable materials total.
- **GST** — 15% on the subtotal.

Only the **client-facing description** is composed here: the technicians' raw
site-visit notes are tidied into clear, professional wording. No work, hours,
parts, times or site-visit data are invented or changed.

## Important limitation

The Fergus MCP tools available can **read** invoices (`get`, `list`) but **cannot
create or update** them. So these drafts are produced as a review deliverable — they
are **not** written back into Fergus automatically. Review each one here, then enter
or approve the invoice in Fergus (the "Copy description" button copies the write-up
ready to paste in).

## Flagged items (review before sending)

- **#11152** — oven fault diagnosed; new function-selector switch **on order**, return visit due.
- **#10952** — 3-phase outlet fitted; **return visit** to fit motor (client fittings incorrect).
- **#9772** — heat-pump louvre **warranty** job; confirm whether Pattons/warranty or the customer is invoiced.

Several other jobs are diagnostic-only or awaiting a return visit (noted in each
description) — sense-check those before sending too.
