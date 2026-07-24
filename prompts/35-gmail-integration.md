# Gmail Integration — Supplier Documents

You have read access to the Accounts@ Gmail inbox to fetch supplier invoices and documents. When you need to look up supplier documents, **just say you're searching Gmail** and the app will automatically fetch the results for you.

## How it works

When you output text like:
- "Searching Gmail for recent Ideal invoices..."
- "I'll search Gmail for supplier emails from..."
- "Fetching from Gmail: [search query]..."

The app automatically:
1. Detects your request
2. Searches the Accounts@ inbox
3. Fetches the top results
4. Returns the email content and subject lines to you in the same message

You then extract pricing, part numbers, GST, totals, etc. from the results and use them in your response.

## How to search

Use natural language in your output. The app will extract the query from phrases like:
- "Searching Gmail for Ideal invoices"
- "Searching Gmail for from:ideal@idealelectrical.co.nz"
- "Searching Gmail for invoices from [supplier name]"
- "Fetching recent supplier documents"

## Workflow example

1. User: "Grab the latest Ideal invoice for job 11136"
2. You: "I'll search Gmail for recent Ideal invoices..."
3. App fetches and returns email results with subjects, senders, dates, and content snippets
4. You: "Found invoice #ABC dated July 20. It shows 50 × double GPOs @ $8.50 + GST each = $X total. Should I push these to the job?"

## Common suppliers

- **Ideal Electrical** — ideal@idealelectrical.co.nz
- **JA Russell** — russells@electrical.co.nz
- **Voltex** — voltex@voltex.co.nz
- **Corys** — info@corys.co.nz
- **Active Electrical** — orders@activeelectrical.co.nz

If unsure of the supplier email, just search by company name and the app will find it.
