# Job Close-Off / Reconciliation

Use this whenever Lincoln wants to **close off, reconcile, check off, or finalise** a job — e.g. "close off Pasty Trust's job", "reconcile job 9659", "have we charged everything on 9659?", "check the supplier invoices against what's on the job". The goal is to make sure **every dollar we spent is captured on the job, nothing's doubled up, and every extra beyond the estimate is charged out.**

## The three-way reconciliation

You compare three sources for the job:

1. **BOUGHT** — supplier invoices in Gmail (mostly **Ideal**, plus JA Russell, Voltex, etc.). These are the items actually purchased.
2. **RECORDED** — the materials/stock lines logged on the **Fergus job and its phases** (what the staff member entered as used — the "stock on hand" for the job).
3. **ESTIMATED** — the job's **Fergus estimate/quote** line items and total.

Then flag:
- **MISSED** — on a supplier invoice but **not** recorded on the job → cost we spent that isn't captured, needs adding so it gets charged.
- **DOUBLED UP** — recorded on the job more than once, or the same invoice counted twice.
- **EXTRA** — bought/recorded beyond what the estimate covers → **extra works that must be charged out** as a variation.

## Steps

1. **Find the job in Fergus and confirm it's the right one** — customer, site, job number. Get its **phases** and its **creation date** (you'll search Gmail back to that date).
2. **Pull everything bought.** Search Gmail for the job's order references — the base number **and every phase** (e.g. `9659 OR 9659A OR 9659B …`), `has:attachment`, from the job creation date onward (`after:YYYY/MM/DD`). Supplier orders quote the specific phase (9659A), so search the phase forms — the bare number alone misses them. **Read the invoice PDFs in small batches** (a handful at a time, tallying as you go) rather than opening dozens at once. If one PDF won't open, note it and carry on — don't abandon the run. Extract each line: qty, description/part #, unit cost, line total.
3. **Pull what's recorded** — the materials/stock lines on the Fergus job and each phase.
4. **Pull the estimate** — the job's Fergus estimate/quote lines and total.
5. **Reconcile into a clear table.** For each bought item: is it recorded on the job? Do the quantities match? Mark MISSED / DOUBLED / matched, and mark anything beyond the estimate as EXTRA.
6. **Summarise:**
   - Total **bought** (state ex- or inc-GST), total **recorded**, total **estimated**.
   - The **missed** items (with cost) — to be added.
   - The **doubled-up** items — to be removed.
   - The **extras vs estimate** — to be charged out, with the sell price using Linc's markup rules.
   - Any **standard close-off lines** that look absent — CoC/ESC ($26) and mileage — flag if not already on the job.
7. **Confirm before writing anything.** Present the findings first. Then offer to (a) add missed items onto the job and (b) charge out the extras as a variation. **Never push changes to Fergus without Lincoln's explicit OK**, and never invent a price.

## Rules

- **Normalise GST.** Supplier invoices are usually **GST-inclusive**; Fergus pricebook cost is **ex-GST**. Compare like-for-like and say which basis you're using.
- **Cost vs charge.** Reconciling *purchases* is about cost. *Charging out* extras applies Linc's markup — materials **cost ÷ 0.6** (67% markup / 40% GP floor), and the other rules from the quoting workflow. Don't confuse what we paid with what we bill.
- **Don't double-count across phases.** A supplier line belongs to the phase it was ordered against — use the order reference on the invoice (9659A vs 9659B) to place it.
- **Show your working** — name the invoices, the job lines, and the estimate lines behind each flag, so Lincoln can check it.
- **When unsure whether something is an extra or already in the estimate, ask** — don't assume it's covered.
