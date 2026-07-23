# Gear entry (voice or text → job card)

WHENEVER someone reports materials used on a job for entry into Fergus — e.g. "chuck 20m of 2.5 TPS and 3 double GPOs on the Henderson job", "add these to job 4821", "put the gear from today on Job-500", "used two Slick downlights and a weatherproof GPO at the Smith rental" — follow this flow. The point is speed on the tools: they say what they fitted, it lands on the right job card correctly priced.

This RECORDS gear already fitted onto an existing job. It is NOT for building a quote (pricing work not yet done) and NOT for stock-on-hand / inventory-level questions.

```
message → parse items + qty → find the job & phase → match to pricebook
        → confirm anything ambiguous → push confirmed lines to the phase
```

The two places you slow down and involve the human are **which job** (if unclear) and **which exact product** (if the match isn't obvious). Everything else is quick.

## 1. Parse into line items
For each thing mentioned, pull the spoken phrase, quantity, and unit.
- Spoken numbers → digits: "twenty metres" → 20, "a couple of" → 2.
- A bare item with no number = quantity 1.
- Cable and anything sold per length is **per-metre** ("20m of 2.5 TPS" → qty 20 of the per-metre cable SKU), not one item.
- Keep the person's own words on each line — you show them back and they drive the search.

## 2. Find the job and its phase
Materials attach to a **job phase**, so you need a `jobPhaseId`.
- Job number ("Job-500", "4821") → `manage-jobs` action=`list` with `filterJobNo`. Name/site ("the Henderson job") → `list` with `filterSearchText`.
- If more than one job matches or you're unsure, **ask** — gear on the wrong customer's job is the one genuinely costly mistake. Show candidates (job no, customer, site) and let them pick.
- Phases via `manage-jobs` action=`list-phases`. One working phase → use it; several → name them and ask, unless the message says.

## 3. Match each item to a pricebook item
**First check Linc's standard fits (section below).** Linc reaches for the same handful of brands daily. If the dictated item maps to a standard fit, that IS the match — high confidence, show it for a glance, no pick-list. A sparky saying "double GPO" almost always means *their* double GPO. Only fall through to a general search when the item isn't a known standard or they name a differing variant.

For everything else, `manage-pricebooks` action=`search` (min 3 chars of `searchText`; searches name, product code, supplier SKU).
- Default `supplierNames: ["Ideal"]` (the supplier is literally `"Ideal"`, not "Ideal Electrical"). For lighting also try `"Voltex"`. Nothing landing → widen with `allSuppliers: true`.
- Translate tradie shorthand to good search terms first — see the NZ terms section below. Critically: the Ideal pricebook calls every socket a **"socket"**, never "powerpoint" — searching `powerpoint` returns zero hits.
- The pricebook `retailPrice` already carries Linc's markup (~1.67× cost). A matched item is priced correctly as-is — do **not** re-apply markup.
- Same product can appear under multiple suppliers at different prices — prefer the **Ideal** copy unless told otherwise; if they differ a lot, note it rather than silently picking.

Confidence per line:
- **High** — one clearly-right match (exact code, or unambiguous single result). Ready to push.
- **Ambiguous** — several plausible matches differing in a way that matters (10A vs 15A, downlight model, IP rating). **Lead with a recommended default** (the everyday item, or Linc's standard fit) as a one-tap "is it this?", then 3–4 real alternatives. Don't dump a 20-row catalogue. Only ask about a spec that changes the charge (e.g. an RCBO's amp rating — never guess that).
- **No good match** — flag it, don't invent a line. Suggest adding manually or giving a product code.

Watch for confidently-wrong matches (a keyword pulling an oddly-named item). If the top hit doesn't read like what a sparky meant, treat it as ambiguous.

## 4. Show the mapping and confirm
Before writing anything, show a compact table to eyeball in one glance:

| Said | Matched | Code | Sell (ex GST) | Qty | |
|------|---------|------|---------------|-----|---|
| 20m 2.5 TPS | Cable 2.5mm 2c+E Flat TPS | CBL2.52TPSE | $3.77/m | 20 | ✅ |
| weatherproof GPO | Weatherproof Single Socket IP53 10A | WPP1H | $46.22 | 1 | ⚠️ pick |

For ambiguous lines, list the 2–4 real candidates with differences and prices, and ask for a pick. Push only once the job is confirmed and the lines are agreed.

## 5. Push the confirmed lines
The job must be **active** — Fergus rejects stock on a draft/unscheduled job (500 error).

For each agreed line, call `manage-stock` action=`create-on-hand` with `jobPhaseId` and the matched item's **details**: `itemDescription` (product code + name), `itemCost`, `itemPrice` (the ex-GST sell, straight from the pricebook `retailPrice`), and `itemQuantity`.

Do **not** pass the pricebook search result's `id` as `priceBookLineItemId` — the stock endpoint uses a different identifier and rejects it (404). The matched detail fields are the reliable path and produce the same line at the same price.

Then confirm plainly what landed ("Added to Job-500: 20m 2.5 TPS, 1× weatherproof GPO, 2× Slick downlights"). If a line was skipped (no match), say so — a silent drop reads as "it's all on there" when it isn't.

### GST — do not gross up
Push clean ex-GST figures (the pricebook sell is ex-GST). The API can't set the GST column; that's applied in the Fergus UI. Never multiply by 1.15 as well — that double-charges.

## Guardrails
- Never create-on-hand against a job you haven't confirmed is the right one.
- Never invent a pricebook line to force a match. A flagged gap beats a wrong charge.
- Quantities are the human's — don't round or "tidy" them.
- If the request is actually to *price* work not yet done (a quote/estimate), that's a quote, not gear entry — don't push stock.
