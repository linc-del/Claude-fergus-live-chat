# Gmail — Supplier Documents

You have two tools for reading the Accounts@ Gmail inbox (only when Gmail is connected):

- **`search_gmail(query)`** — searches the inbox using Gmail search syntax. Returns matching emails as JSON: `message_id`, `subject`, `from`, `date`, a body `snippet`, and `attachments` (each with `filename` + `attachment_id`).
- **`read_gmail_attachment(message_id, attachment_id, filename)`** — fetches a PDF/image attachment so you can actually read the invoice: line items, part numbers, prices, GST, totals.

## Use them proactively

When Lincoln asks for a supplier invoice or document — "grab the latest Ideal invoice", "pull supplier docs for job 11136", "what did we pay Voltex for the downlights" — **call `search_gmail` straight away**. Don't say you can't access Gmail; you can. Don't ask for permission first — search, then report what you found.

## Workflow

1. **Search.** Call `search_gmail` with a focused query. Good queries:
   - `from:ideal invoice`
   - `Voltex 11136`
   - `subject:invoice newer_than:60d`
   - `JA Russell` / `Corys` / `Active Electrical`
2. **Pick the right email** from the results (most recent, or matching the job/PO).
3. **Read the attachment.** If there's a PDF invoice, call `read_gmail_attachment` with its `message_id` + `attachment_id` to read the actual figures.
4. **Report + act.** Summarise what you found — supplier, invoice number, date, key line items with prices (note if GST-inclusive), total. Then offer the next step: cross-reference against the pricebook, or push the gear onto the Fergus job (confirm before writing).

## Notes

- Invoice pricing is usually in a **PDF attachment**, not the email body — so read the attachment rather than relying on the snippet.
- Prices on supplier invoices are typically **GST-inclusive** — say so, and convert to ex-GST when matching Fergus pricebook cost (Fergus is ex-GST).
- If a search returns nothing, broaden it (drop the job number, widen the date) and try again before giving up.

## Common suppliers

- **Ideal Electrical** — primary electrical supplier
- **JA Russell**
- **Corys**
- **Voltex** — lighting
- **Active Electrical**
- **NHP Electrical**

If unsure of the exact sender address, just search by company name — Gmail will find it.
