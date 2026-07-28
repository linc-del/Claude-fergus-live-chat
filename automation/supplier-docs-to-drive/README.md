# Supplier documents → Drive (auto-filer)

Files every supplier document that lands in **accounts@lincelectrical.co.nz**
into a Google Drive folder, on a timer. Once they're in Drive, the Claude
assistant (which has a Google Drive connector) can read and search them.

- Runs free on Google's own infrastructure — no server, nothing to keep alive.
- Files PDFs from the approved suppliers (JA Russell, Ideal, Realcold, Voltex)
  into dated folders like `Supplier Docs/2026/07/`.
- Dedupes per message, so nothing is filed twice.
- Only adds a Gmail label; it never sends mail or deletes anything.

> **Corys is deliberately not in the supplier list** — it's a banned supplier.
> Don't add it.

## What you get in Drive

```
Supplier Docs/
  2026/
    07/
      JA Russell - 2026-07-28 - Statement July - statement_9921.pdf
      Ideal - 2026-07-27 - Invoice 44821 - INV44821.pdf
```

Name format: `Supplier - date - email subject - original filename`.

## Setup (about 5 minutes)

Do this **while logged in as the mailbox owner** — `accounts@lincelectrical.co.nz`
(or an account with full access to that inbox). The script reads whichever
mailbox it runs under.

1. **Make the Drive folder.** In Drive, create a folder (e.g. `Supplier Docs`).
   Open it and copy the ID from the URL — the long bit after `/folders/`:
   `drive.google.com/drive/folders/`**`1AbCdEf…`**

2. **Create the script.** Go to <https://script.google.com> → **New project**.
   Delete the sample `Code.gs` contents and paste in this folder's
   [`Code.gs`](./Code.gs).

3. **Set the config.** At the top of `Code.gs`, paste your folder ID into
   `FOLDER_ID`. Check the `SUPPLIER_DOMAINS` list matches the real sending
   domains on the invoices you get (see "Tuning" below — this is the one bit
   worth getting right).

4. **Run `setup` once.** In the editor toolbar, pick `setup` from the function
   dropdown and click **Run**. Google will ask you to authorise it — review and
   **Allow** (it needs Gmail to read + label, and Drive to save files). This
   also installs the 15-minute timer and does one pass immediately.

5. **Done.** New supplier PDFs now appear in the Drive folder within ~15 minutes
   of arriving. Filed threads get a `Filed-to-Drive` label in Gmail so you can
   see what's been handled.

### Optional: backfill the existing mailbox

To sweep documents already sitting in the inbox, temporarily change
`LOOKBACK: "2d"` to e.g. `LOOKBACK: "1y"`, run `processSupplierDocs` once by
hand, then change it back to `"2d"` (keeps the every-15-min runs fast).

## Tuning

Everything lives in the `CONFIG` block at the top of `Code.gs`:

| Setting | What it does |
| --- | --- |
| `FOLDER_ID` | Where files go. Blank = auto-create `Supplier Docs` in My Drive. |
| `SUPPLIER_DOMAINS` | The senders that count as suppliers. **Edit this** to match real invoice domains. |
| `EXTRA_LABEL` | A Gmail label (`Supplier-Docs`) that forces a thread to be processed even if the sender isn't listed — handy for one-off suppliers. Tag by hand or with a Gmail filter. |
| `ALLOWED_EXTENSIONS` | Defaults to `["pdf"]`. Set `[]` to grab everything (spreadsheets, images…). |
| `DATED_SUBFOLDERS` | `true` = `2026/07/` subfolders; `false` = one flat folder. |
| `LOOKBACK` | How far back each run looks. Keep small; bump only for a one-off backfill. |
| `MIN_BYTES` | Skips tiny attachments (logos in signatures). |
| `EVERY_MINUTES` | Timer frequency. Re-run `setup` after changing. |

> **Get the sender domains right.** The invoices might come from
> `@jarussell.co.nz` or from a billing system on a different domain (e.g.
> `@invoices.somesupplier.com`). Check a real invoice email's *From* address and
> make sure that exact domain is in `SUPPLIER_DOMAINS`. When unsure, add the
> `Supplier-Docs` label to a couple of examples and rely on `EXTRA_LABEL`.

## Giving the Claude assistant access

The **Cowork / Slack Claude** you talk to already has a Google Drive connector,
so once files are in the folder it can read and search them — no extra step,
as long as the folder is in (or shared with) the Google account that connector
is signed in as.

The **deployed Fergus web app** (`../../`) is wired to Fergus only and has *no*
Drive access — it can't see this folder. Giving it access is a separate change
(add a Google Drive MCP connector to the app). Say the word if you want that.

## Notes & limits

- **Permissions:** the script needs `gmail.modify` (read mail + add the label)
  and `drive` (create the folder/files). It does not send email or delete mail.
- **Financial docs:** if the real goal is getting supplier *bills into the
  books*, Xero's bill inbox / Hubdoc auto-files supplier invoices for accounting
  far better than a Drive folder. This filer is about making the documents
  readable by Claude — you can run both.
- **Runs as one user.** Install it under the account that owns the mailbox. If
  that person leaves, re-create it under whoever owns `accounts@` next.
