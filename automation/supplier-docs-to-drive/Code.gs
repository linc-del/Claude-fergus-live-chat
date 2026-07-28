/**
 * Supplier documents → Drive filer  ·  Linc Electrical
 * ------------------------------------------------------
 * Runs on a timer inside the Google account that owns the mailbox
 * (accounts@lincelectrical.co.nz). Every run it finds supplier email with
 * attachments, saves the PDFs into a Drive folder, and marks the thread filed.
 * Once the files are in Drive, the Claude assistant (which has a Google Drive
 * connector) can read and search them.
 *
 * Nothing here sends email or changes supplier mail beyond adding a label.
 * See README.md in this folder for the 5-minute setup.
 */

const CONFIG = {
  // Drive folder to file into. Paste the folder ID from its URL:
  //   drive.google.com/drive/folders/THIS_LONG_BIT
  // Leave "" to auto-create a folder named FOLDER_NAME_FALLBACK in My Drive.
  FOLDER_ID: "",
  FOLDER_NAME_FALLBACK: "Supplier Docs",

  // File into dated subfolders (Supplier Docs/2026/07). false = one flat folder.
  DATED_SUBFOLDERS: true,

  // Which senders count as suppliers. Each is OR-ed into a Gmail from:() query.
  // Edit as suppliers change. Corys is intentionally NOT here — it's banned.
  SUPPLIER_DOMAINS: [
    "jarussell.co.nz",   // JA Russell (primary)
    "idealelectrical.co.nz", // Ideal / Ideal HNZ
    "realcold.co.nz",    // Realcold NZ Ltd
    "voltex.co.nz",      // Voltex NZ
  ],

  // Optional catch-all: also process anything carrying this Gmail label, even
  // if the sender isn't in SUPPLIER_DOMAINS (tag odd one-off suppliers by hand
  // or with a Gmail filter). Leave "" to ignore.
  EXTRA_LABEL: "Supplier-Docs",

  // How far back to look each run. 2d is plenty for a 15-min timer. To backfill
  // once, temporarily set "1y", run manually, then put it back to "2d".
  LOOKBACK: "2d",

  // Only save these extensions (lower-case, no dot). [] = save everything
  // (inline logos/signatures are always skipped regardless).
  ALLOWED_EXTENSIONS: ["pdf"],

  // Ignore attachments smaller than this — kills stray logos that slip through.
  MIN_BYTES: 8 * 1024,

  // Applied to a thread once its docs are filed, so you can see at a glance
  // what's done. Dedupe is per-message (below), so this is just for humans.
  PROCESSED_LABEL: "Filed-to-Drive",

  // How often the timer fires, in minutes (used by setup()).
  EVERY_MINUTES: 15,

  // Remember this many message IDs to guarantee nothing is filed twice.
  LEDGER_MAX: 5000,
};

/* ============================ run this once ============================ */

/**
 * One-time setup: authorises the script, creates the labels, and installs the
 * recurring timer. Run it from the Apps Script editor (Run ▸ setup) and accept
 * the permission prompt. Safe to run again — it won't create duplicate timers.
 */
function setup() {
  getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  if (CONFIG.EXTRA_LABEL) getOrCreateLabel_(CONFIG.EXTRA_LABEL);

  const exists = ScriptApp.getProjectTriggers().some(
    (t) => t.getHandlerFunction() === "processSupplierDocs"
  );
  if (!exists) {
    ScriptApp.newTrigger("processSupplierDocs")
      .timeBased()
      .everyMinutes(CONFIG.EVERY_MINUTES)
      .create();
  }

  const folder = getRootFolder_();
  console.log(
    `Setup done. Timer runs every ${CONFIG.EVERY_MINUTES} min.\n` +
      `Filing into: ${folder.getName()} (${folder.getId()})\n` +
      `Running one pass now…`
  );
  processSupplierDocs();
}

/* ============================ the actual job ============================ */

function processSupplierDocs() {
  const root = getRootFolder_();
  const processedLabel = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const ledger = loadLedger_();

  const threads = GmailApp.search(buildQuery_(), 0, 100);
  let saved = 0;

  threads.forEach((thread) => {
    const threadHasExtraLabel = CONFIG.EXTRA_LABEL
      ? threadHasLabel_(thread, CONFIG.EXTRA_LABEL)
      : false;
    let filedFromThread = false;

    thread.getMessages().forEach((msg) => {
      const id = msg.getId();
      if (ledger.has(id)) return; // already handled this exact message

      const from = msg.getFrom();
      if (!messageIsSupplier_(from) && !threadHasExtraLabel) return;

      const atts = msg.getAttachments({
        includeInlineImages: false,
        includeAttachments: true,
      });
      const supplier = supplierName_(from);
      const folder = targetFolder_(root, msg.getDate());

      atts.forEach((att) => {
        if (!wantAttachment_(att)) return;
        const name = fileName_(supplier, msg, att);
        if (folder.getFilesByName(name).hasNext()) return; // same file already there
        folder.createFile(att.copyBlob()).setName(name);
        saved++;
        filedFromThread = true;
      });

      ledger.add(id);
      trimLedger_(ledger);
    });

    if (filedFromThread) thread.addLabel(processedLabel);
  });

  saveLedger_(ledger);
  console.log(`Filed ${saved} file(s) across ${threads.length} thread(s).`);
}

/* ============================ helpers ============================ */

function buildQuery_() {
  const clauses = [];
  const from = CONFIG.SUPPLIER_DOMAINS.map((d) => `from:${d}`).join(" OR ");
  const senderClause = from ? `(${from})` : "";
  const labelClause = CONFIG.EXTRA_LABEL ? `label:"${CONFIG.EXTRA_LABEL}"` : "";
  const who = [senderClause, labelClause].filter(Boolean).join(" OR ");
  if (who) clauses.push(`(${who})`);
  clauses.push("has:attachment");
  clauses.push(`newer_than:${CONFIG.LOOKBACK}`);
  return clauses.join(" ");
}

function messageIsSupplier_(from) {
  const email = extractEmail_(from);
  return CONFIG.SUPPLIER_DOMAINS.some(
    (d) => email.endsWith("@" + d) || email.endsWith("." + d)
  );
}

function wantAttachment_(att) {
  if (att.getSize() < CONFIG.MIN_BYTES) return false;
  const name = (att.getName() || "").toLowerCase();
  if (CONFIG.ALLOWED_EXTENSIONS.length) {
    const ext = name.indexOf(".") >= 0 ? name.split(".").pop() : "";
    if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) return false;
  }
  return true;
}

function fileName_(supplier, msg, att) {
  const date = Utilities.formatDate(
    msg.getDate(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
  const subject = clean_(msg.getSubject() || "(no subject)").slice(0, 60);
  const original = clean_(att.getName() || "attachment");
  return `${clean_(supplier)} - ${date} - ${subject} - ${original}`;
}

function clean_(s) {
  // Drive is fine with most characters; strip the ones that read badly / break paths.
  return String(s)
    .replace(/[\/\\\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmail_(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

function supplierName_(from) {
  const email = extractEmail_(from);
  const map = {
    "jarussell.co.nz": "JA Russell",
    "idealelectrical.co.nz": "Ideal",
    "realcold.co.nz": "Realcold",
    "voltex.co.nz": "Voltex",
  };
  for (const domain in map) {
    if (email.endsWith("@" + domain) || email.endsWith("." + domain)) {
      return map[domain];
    }
  }
  const named = String(from).match(/^"?([^"<]+?)"?\s*</);
  if (named && named[1].trim()) return named[1].trim();
  return email.split("@")[1] || "Supplier";
}

/* ---- Drive folders ---- */

function getRootFolder_() {
  if (CONFIG.FOLDER_ID) return DriveApp.getFolderById(CONFIG.FOLDER_ID);
  return getOrCreateChildFolder_(DriveApp.getRootFolder(), CONFIG.FOLDER_NAME_FALLBACK);
}

function targetFolder_(root, date) {
  if (!CONFIG.DATED_SUBFOLDERS) return root;
  const year = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy");
  const month = Utilities.formatDate(date, Session.getScriptTimeZone(), "MM");
  return getOrCreateChildFolder_(getOrCreateChildFolder_(root, year), month);
}

function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---- Gmail labels ---- */

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function threadHasLabel_(thread, name) {
  return thread.getLabels().some((l) => l.getName() === name);
}

/* ---- dedupe ledger (Script Properties) ---- */

function loadLedger_() {
  const raw = PropertiesService.getScriptProperties().getProperty("processedIds");
  try {
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function trimLedger_(set) {
  if (set.size <= CONFIG.LEDGER_MAX) return;
  const arr = Array.from(set);
  arr.splice(0, set.size - CONFIG.LEDGER_MAX); // drop oldest
  set.clear();
  arr.forEach((id) => set.add(id));
}

function saveLedger_(set) {
  PropertiesService.getScriptProperties().setProperty(
    "processedIds",
    JSON.stringify(Array.from(set))
  );
}
