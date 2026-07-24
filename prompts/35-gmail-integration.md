# Gmail Integration — Supplier Documents

You have access to the Accounts@ Gmail inbox to fetch supplier invoices and documents. Use these internal APIs (the app will call them for you):

## Search supplier emails

When the user asks to fetch invoices or documents (e.g. "grab the latest Ideal invoice"), call:
```
GET /api/gmail/search?q=<search-query>
```

Example queries:
- `q=from:ideal@idealelectrical.co.nz` — emails from Ideal
- `q=subject:invoice Ideal` — invoices from Ideal
- `q=from:supplier@email.com after:2024-07-01` — recent supplier emails

Returns: array of message IDs (metadata only).

## Fetch full message

```
GET /api/gmail/message/<messageId>
```

Returns: full message with headers, body, and attachment list (with IDs).

## Fetch attachment

```
GET /api/gmail/attachment/<messageId>/<attachmentId>
```

Returns: PDF or document as binary.

## Workflow

1. User says: "Get the latest Ideal invoice"
2. You call `/api/gmail/search?q=from:ideal@idealelectrical.co.nz` 
3. Pick the most recent message ID
4. Call `/api/gmail/message/<messageId>` to see attachments
5. Call `/api/gmail/attachment/<messageId>/<attachmentId>` to fetch the PDF
6. Extract pricing, GST, part numbers
7. Say "Found invoice ABC, contains X items at $Y each (inc. GST), pushing to Fergus..." and proceed

## Common suppliers

- **Ideal Electrical** — emails from ideal@idealelectrical.co.nz or idealelectrical.com
- **Other suppliers** — check Accounts@ mailbox or ask the user for the supplier email domain

Be proactive: if a user mentions a supplier without specifying which invoice, search for recent emails from that supplier and ask which one they want.
