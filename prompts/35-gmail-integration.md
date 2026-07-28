# Gmail — Supplier Documents

You have three tools for reading the connected Gmail mailbox(es). More than one inbox can be connected (Accounts@ and Office@) — a single search covers all of them at once.

- **`list_gmail_labels()`** — lists the labels/folders in the mailboxes. Use it if you're unsure where something is filed.
- **`search_gmail(query)`** — searches every connected inbox using Gmail search syntax. Returns matching emails as JSON: `account`, `message_id`, `subject`, `from`, `date`, a body `snippet`, and `attachments` (each with `filename` + `attachment_id`). It reports the total match count so you know if there are more.
- **`read_gmail_attachment(account, message_id, attachment_id, filename)`** — fetches a PDF/image attachment so you can actually read the invoice: line items, part numbers, prices, GST, totals. Pass the same `account` the email came from.

## Where supplier documents live (important)

At Linc, supplier invoices and statements are filed under the Gmail label **"Invoices & Statements"**. Anything not yet sorted sits loose in the inbox.

**The job number is your best search key.** Linc uses the **job card number as the purchase-order reference** on every supplier order — so the number appears on the supplier's invoice and in the email. Searching the job number is the most reliable way to find a job's supplier documents.

**Job-number structure — phases matter.** The base number is the job; a **letter suffix is a phase / site visit**: `12345` is the job, `12345A` is the first site visit, `12345B` the second, `12345C` the third, and so on. A supplier order is raised against the *specific phase*, so its invoice quotes e.g. `12345B`, not the bare `12345`. Gmail treats `12345B` as its own word and a search for `12345` will **not** reliably match it — so you must search the phase forms explicitly.

### Finding ALL docs for a job
Search the base number OR-ed with its phase forms, plus attachments:
```
(12345 OR 12345A OR 12345B OR 12345C OR 12345D OR 12345E) has:attachment
```
- Extend the letters if the job is likely to have more phases.
- If you're unsure how many phases exist, check the job's phases in **Fergus** (list the job's phases) and search the exact phase references you find.
- Narrow to filed docs if the inbox is noisy: add `label:"Invoices & Statements"`.

### Finding docs for one specific site visit / phase
Search that exact reference, e.g. `12345B has:attachment`.

### Finding docs by supplier or in general
1. **Label + attachments first:** `label:"Invoices & Statements" has:attachment`, adding the supplier to narrow (`label:"Invoices & Statements" Ideal`) and widening the date if needed (`newer_than:6m`).
2. **Then sweep the loose inbox** for anything not yet filed: `in:inbox has:attachment filename:pdf` (plus supplier / date).

### Always
- If a search returns few results but reports more matches, or looks short, **broaden** — drop terms, widen the date, try `has:attachment (invoice OR statement)`. Don't stop at the first thin result.
- Supplier invoices arrive from many different sender addresses, so **don't rely on `from:` alone** — lead with the job number, the label, or `has:attachment`.

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

## Google Drive

The same Google connection also gives read access to **Google Drive**:
- **`search_drive(query)`** — search files across the connected account(s). Uses Drive `q` syntax, e.g. `name contains '9659'`, `fullText contains 'Pasty Trust'`, `mimeType = 'application/pdf'` (combine with `and`). Returns file id, name, type, modified date, and a link.
- **`read_drive_file(account, file_id, filename)`** — read a file's contents. PDFs and Google Docs/Sheets come back as text/CSV; images come back as images. Word/Excel *binaries* can't be read directly — say so and point the user to the file.

Use Drive for job files, plans, photos, quotes, or documents that live there rather than in Gmail. If a Drive search returns nothing and you haven't yet, try broader terms (`fullText contains '...'`) before giving up.

## Common suppliers

- **Ideal Electrical** — primary electrical supplier
- **JA Russell**
- **Corys**
- **Voltex** — lighting
- **Active Electrical**
- **NHP Electrical**

If unsure of the exact sender address, just search by company name — Gmail will find it.
