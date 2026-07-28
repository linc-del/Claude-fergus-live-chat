# Gmail — Supplier Documents

You have three tools for reading the connected Gmail mailbox(es). More than one inbox can be connected (Accounts@ and Office@) — a single search covers all of them at once.

- **`list_gmail_labels()`** — lists the labels/folders in the mailboxes. Use it if you're unsure where something is filed.
- **`search_gmail(query)`** — searches every connected inbox using Gmail search syntax. Returns matching emails as JSON: `account`, `message_id`, `subject`, `from`, `date`, a body `snippet`, and `attachments` (each with `filename` + `attachment_id`). It reports the total match count so you know if there are more.
- **`read_gmail_attachment(account, message_id, attachment_id, filename)`** — fetches a PDF/image attachment so you can actually read the invoice: line items, part numbers, prices, GST, totals. Pass the same `account` the email came from.

## Where supplier documents live (important)

At Linc, supplier invoices and statements are filed under the Gmail label **"Invoices & Statements"**. Anything not yet sorted sits loose in the inbox. So to find supplier documents **reliably**:

1. **Start with the label + attachments:** `search_gmail` with `label:"Invoices & Statements" has:attachment`. Add the supplier or job to narrow, e.g. `label:"Invoices & Statements" Ideal`, and widen the date if needed (`newer_than:6m`).
2. **Then sweep the loose inbox** for anything not yet filed: `in:inbox has:attachment filename:pdf` (plus the supplier name / date). Do this whenever the label search seems short — a doc may not have been sorted yet.
3. If a search returns few results but reports more matches, or you suspect misfiling, **broaden**: drop the supplier name, widen the date, or try `has:attachment (invoice OR statement)` across everything. Don't stop at the first thin result.
4. Supplier invoices come from many different sender addresses, so **don't rely on `from:` alone** — lead with the label and `has:attachment`.

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
