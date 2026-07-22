---
name: fergus-gear-entry
description: >
  Turn a spoken or typed list of gear/materials used on a job into line items on the
  right Fergus job card. Use this WHENEVER Lincoln or a Linc Electrical staffer reports
  materials used on a job for entry into Fergus — a transcribed voice note, or messages
  like "chuck 20m of 2.5 TPS and 3 double GPOs on the Henderson job", "add these to
  job 4821", "put the gear from today on Job-500", "used two Slick downlights and a
  weatherproof GPO at the Smith rental". It parses the items and quantities, matches each
  to a real Fergus pricebook item (live cost/sell), asks a quick pick for anything
  ambiguous, and pushes confirmed lines onto the job's phase. Prefer this over hand-adding
  stock in Fergus, and over the quote-builder skill (that one PRICES work not yet done;
  this one RECORDS gear already fitted onto an existing job). Do NOT use it to build a
  quote, to answer a pure pricebook price lookup with no job attached, or to answer
  stock-on-hand / inventory-level questions.
---

# Fergus gear entry (voice or text → job card)

The point of this skill is speed on the tools. A sparky finishing a job shouldn't have to
stop, open Fergus, search the pricebook, and type each line — they should be able to *say*
what they fitted and have it land on the right job card, correctly priced. This skill is
the bit between "what they said" and "it's on the job."

It works equally well on a transcribed voice note or on typed shorthand. Treat both as the
same input: a rough, spoken-style list of gear and quantities against a job.

## The flow

```
transcript / message  →  parse items + qty  →  find the job & phase  →  match to pricebook
                      →  confirm anything ambiguous  →  push confirmed lines to the phase
```

Work through it in that order. The two places you slow down and involve the human are
**which job** (if unclear) and **which exact product** (if the match isn't obvious) —
everything else should be quick.

## 1. Parse the message into line items

Pull out, for each thing mentioned: the spoken phrase, the quantity, and the unit.

- Convert spoken numbers to digits: "twenty metres" → 20, "a couple of" → 2, "three" → 3.
- A bare item with no number means quantity 1 ("a weatherproof GPO" → 1).
- Cable and anything sold per length is a **per-metre** quantity ("20m of 2.5 TPS" → qty 20 of the per-metre cable SKU), not one item.
- Keep the person's own words attached to each line — you'll show them back for confirmation, and they're the search input for step 3.

## 2. Find the job and its phase

Materials attach to a **job phase**, not the job directly, so you need a `jobPhaseId`.

- Identify the job from the message: a job number ("Job-500", "4821") → `manage-jobs` action=`list`
  with `filterJobNo`; a name/site ("the Henderson job", "the Smith rental") → `list` with
  `filterSearchText`.
- If more than one job matches, or you're not confident, **ask** — pushing gear onto the
  wrong customer's job is the one genuinely costly mistake here. Show the candidates
  (job number, customer, site) and let them pick.
- Get phases with `manage-jobs` action=`list-phases`. Most jobs have one working phase —
  use it. If there are several, name them and ask which, unless the message says.

## 3. Match each item to a pricebook item

**First check Linc's standard fits** (`references/linc-standard-fits.md`). Linc reaches for the
same handful of products every day — his usual double GPO, his standard downlight, the cable he
runs. If the dictated item maps to a standard fit, that IS the match: treat it as high confidence
and show it for a glance, don't run a pick-list. The whole point of voice entry is speed, and a
sparky saying "double GPO" almost always means *their* double GPO. Only fall through to a general
search when the item isn't a known standard, or they name a variant that differs from it.

For everything else, use `manage-pricebooks` action=`search` (min 3 characters of `searchText`;
it searches name, product code and supplier SKU).

- Default `supplierNames: ["Ideal"]` — Ideal is the main wholesaler. Note the supplier is
  literally `"Ideal"`, not "Ideal Electrical". For lighting/downlights, also try `"Voltex"`.
  If nothing lands, widen with `allSuppliers: true`.
- Translate tradie shorthand into good search terms before searching — see
  `references/nz-electrical-terms.md`. E.g. "2.5 TPS" → search `2.5 TPS`; "double GPO" →
  `double socket` / `double powerpoint`; "batten holder" → `batten holder`.
- The pricebook's `retailPrice` already carries Linc's markup (it sits ~1.67× cost, the
  67% floor), so a matched item is priced correctly as-is. You do **not** re-apply markup.
- The same product can appear in more than one supplier's pricebook at different prices (e.g. a
  Schneider Resi9 RCBO shows in both Schneider's book and Ideal's). Prefer the **Ideal** copy
  unless told otherwise — Ideal is the main wholesaler, so its price reflects what we actually
  buy and charge at. If the two differ a lot, note it rather than silently picking one.

Assign each line a confidence:

- **High** — one clearly-right match (exact code, or an unambiguous single result). Ready to push.
- **Ambiguous** — several plausible matches that differ in a way that matters (10A vs 15A,
  which downlight model, IP rating, colour). **Lead with a recommended default** — the most
  common everyday item (or Linc's standard fit if there is one) — as a one-tap "is it this?",
  then offer 3–4 real alternatives underneath. Don't bury the person in a 20-row catalogue;
  a short, ranked pick beats an exhaustive dump. Only the spec that genuinely changes the
  charge needs asking (e.g. an RCBO's amp rating — never guess that).
- **No good match** — nothing sensible came back. Flag it, don't invent a line. Suggest the
  person add it manually or give a product code.

Watch for confidently-wrong matches: a keyword can pull an oddly-named item (e.g. searching
"double power point" can surface a recessed AV wall plate). If the top hit doesn't read like
what a sparky meant, treat it as ambiguous and confirm rather than pushing it.

## 4. Show the mapping and confirm

Before writing anything, show a compact table so the human can eyeball it in one glance:

| Said | Matched | Code | Sell (ex GST) | Qty | |
|------|---------|------|---------------|-----|---|
| 20m 2.5 TPS | Cable 2.5mm 2c+E Circular TPS | AFLMC0325 | $10.28/m | 20 | ✅ |
| weatherproof GPO | Weatherproof Single Powerpoint IP53 10A | WPP1H | $46.22 | 1 | ⚠️ pick |

For ambiguous lines, list the 2–4 real candidates with their differences and prices and ask
for a pick. Only push once the job is confirmed and the lines are agreed.

## 5. Push the confirmed lines

For each agreed line, one call: `manage-stock` action=`create-on-hand` with
`jobPhaseId`, `priceBookLineItemId` (the matched item's `id`), and `itemQuantity`. Passing
the pricebook item id lets Fergus fill description, cost and sell from the pricebook itself,
so pricing stays consistent and you don't hand-key figures.

Then confirm back plainly what landed on the job ("Added to Job-500: 20m 2.5 TPS, 1×
weatherproof GPO, 2× Slick downlights"). If a line was skipped (no match), say so — a silent
drop reads as "it's all on there" when it isn't.

### GST — do not gross up
Push clean ex-GST figures (the pricebook sell is ex-GST). The Fergus API can't set the GST
column; that's applied in the Fergus UI. Never multiply by 1.15 as well — that double-charges.
This mirrors the rule in the company brain (`rates_and_rules.gst_handling`).

## Guardrails

- Never create-on-hand against a job you haven't confirmed is the right one.
- Never invent a pricebook line to force a match. A flagged gap is better than a wrong charge.
- Quantities are the human's — don't round or "tidy" them.
- This skill records gear onto an existing job. If the request is actually to *price* work
  (a quote/estimate), that's the quote-builder skill, not this one.

## Examples

**Example 1 — clean:**
Input: "Put 20 metres of 2.5 TPS on Job-500."
Action: find Job-500 → its phase → search `2.5 TPS` (Ideal) → single strong match → show 1-row
table → on OK, create-on-hand qty 20. Confirm.

**Example 2 — ambiguous product:**
Input: "Add a weatherproof powerpoint to the Henderson job."
Action: find Henderson job/phase → search returns WPP1H (10A), WPP1H-15 (15A), black variants →
ask "10A or 15A? standard white or matte black?" → push the chosen one.

**Example 3 — ambiguous job:**
Input: "Chuck two Slick downlights on the rental job."
Action: `filterSearchText` "rental" returns several → list candidates (number/customer/site) →
ask which → then match "Slick downlight" (multiple wattages → pick) → push.
