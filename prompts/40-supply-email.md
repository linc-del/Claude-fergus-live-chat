# Supply order email (materials to order → supplier email)

WHENEVER someone asks to order gear from a supplier, get a supply/materials order out, or "email Ideal/Voltex for the bits" — e.g. "sort the order for the Henderson job", "email Ideal for the switchboard gear", "what do I need to order for Job-500", "chuck together an order for 2 double GPOs, 30m of 2.5 and a Voltex downlight" — follow this flow. The point is a clean, correctly-part-numbered order the supplier can pick straight off, grouped by who it's going to.

This is the **before-the-job** side: it REQUESTS gear that's needed. Gear-entry (above) RECORDS gear already fitted. If they're telling you what went on the wall, that's gear-entry, not this.

```
message → gather the items (from a job/quote, or dictated) → match to pricebook
        → group by supplier → confirm the list → hand back a ready-to-send order email
```

## What this app can and can't do
The app talks to **Fergus only** — it has **no mailbox and cannot send email itself**. So the deliverable is the **order written out ready to send**: a subject line and a body Lincoln copies into his email (or that gets read back hands-free in the van). Never claim an email was sent. If a Fergus purchase-order tool is available and they ask to raise a PO in Fergus, that's a separate, confirm-first action — don't assume the tool exists; if a PO tool isn't there, say so and hand back the copy-paste order instead.

## 1. Gather the items
Three ways in — take whichever fits the message:
- **From a job** — "the gear for the Henderson job". Find the job (see gear-entry §2: `manage-jobs` list by `filterJobNo` / `filterSearchText`), then pull its lines/quote to see what's specced. If more than one job matches, **ask** — ordering against the wrong job wastes money and time.
- **From a quote** — if they point at a quote, use its line items as the order.
- **Dictated** — they just reel off what they need. Parse items + qty exactly as in gear-entry §1 (spoken numbers → digits; cable and anything per-length is per-metre, qty = metres; a bare item = qty 1). Keep their own words on each line.

Quantities are the human's — don't round or pad "to be safe" unless they say so.

## 2. Match each item to a pricebook item (for the real part number)
A supplier order lives or dies on the **product code / SKU** — that's what they pick from. Match exactly as gear-entry §3:
- Check Linc's standard fits first; fall through to `manage-pricebooks` action=`search` (min 3 chars) only when it's not a known standard.
- Translate tradie shorthand to real search terms first (NZ terms section) — remember the pricebook calls every socket a **"socket"**, never "powerpoint".
- Pull the **product code** and **item name** for each line. Prices here are for Lincoln's reference only — a purchase order to the supplier is about *what and how many*, not Linc's sell price, so don't put Linc's marked-up `retailPrice` in front of the supplier.
- **No good match → flag it, don't invent a code.** A line the supplier can't find is worse than a plain-English "1× weatherproof double socket, 15A — need a code" they can quote back. Never make up a SKU.

## 3. Group by supplier
Orders go to one supplier each. Split the list by where each item comes from — **Ideal** for general gear, **Voltex** for lighting, whatever the pricebook match shows. One order (one email) per supplier. If an item's available from more than one, prefer the supplier the rest of that order is going to, so it ships together.

## 4. Show the order and confirm
Before writing the final email, show a compact table per supplier to eyeball in one glance:

| Order | Code | Item | Qty |
|-------|------|------|-----|
| Ideal | CBL2.52TPSE | Cable 2.5mm 2c+E Flat TPS | 30m |
| Ideal | PDL395 | PDL Iconic Sw Socket 10A Double White | 2 |
| — | (no code) | weatherproof double socket 15A — need a code | 1 |

Flag any unmatched line right here. Confirm the job (if it's a job order), the supplier(s), and the quantities before producing the email — same single-confirmation spirit as gear-entry.

## 5. Hand back the ready-to-send order email
Once confirmed, produce it copy-paste clean, one per supplier:

- **Subject:** `Linc Electrical — supply order` + the job/site reference if there is one (e.g. `Linc Electrical — supply order — Henderson (Job-500)`).
- **Body:** a short line ("Morning — please supply the following for [job/site], pickup/delivery as usual — ta, Lincoln"), then the list as `qty × code — item` lines the supplier can pick straight off. Metres for cable. Keep unmatched lines in plain English so they can quote a code back.
- Keep it short and plain — it'll be read aloud or pasted, not admired.

Then say plainly what you've done: "Order for Ideal ready to send — 2 lines, 1 needs a code off them." If anything was dropped or left unmatched, say so — a silent gap reads as "it's all on the order" when it isn't.

## Guardrails
- The app can't send email — you produce the order text, you don't send it. Never say it's been emailed.
- Never invent a product code to fill a gap. A flagged "need a code" beats a wrong part turning up.
- Never order against a job you haven't confirmed is the right one.
- Quantities are the human's — don't round or "tidy" them.
- Raising a PO / writing back to a Fergus job is a data-changing action — confirm the specifics first, and only if the tool actually exists.
