/**
 * The MCP tool registry: one table, four explicit booleans per tool, and the
 * sentence that defends each of them.
 *
 * OpenAI rejected NivaDesk 1.1.1 with "annotations do not appear to match the
 * tool's behavior ... explicitly set to true or false (not null) for every tool
 * ... include a clear justification ... based on the tool's actual behavior."
 * Two demands: literal booleans everywhere, and a value that survives someone
 * reading the handler. Before this file the hints were literals scattered
 * through `nvMcpOrderToolSchemas()` and then re-coerced with `=== true`, so a
 * `null` in source would have shipped silently as `false` — the coercion was
 * hiding exactly the class of mistake the reviewer is pointing at.
 *
 * This module is pure on purpose: no firebase-admin, no firebase-functions, no
 * environment read at load. The flags arrive as an argument. That is what lets
 * a test project every flag combination in one process, and what lets the
 * WhatsApp gateway (a second channel over the same capabilities) read the same
 * table without dragging the Cloud Functions runtime in with it.
 *
 * The unit being annotated is THE OBSERVABLE EFFECT OF CALLING THE TOOL, not
 * the lines inside its handler. If a workspace-configured Firestore trigger
 * turns the handler's write into an e-mail or an SMS, that effect belongs to
 * the tool. A hint that is true only because the code doing the thing lives in
 * another function is the kind of claim 1.1.1 was rejected over.
 *
 * Definitions, fixed here so a value can be decided by a test instead of by
 * opinion:
 *
 *   readOnlyHint    true when the call performs no Firestore/Storage write of
 *                   workspace state, makes no external call with a side effect,
 *                   and fires no trigger. Carve-out, taken deliberately and
 *                   disclosed on the tool itself: `recordPiiAccess` writes a row
 *                   to companies/{cid}/piiAccessLog before a read tool is
 *                   dispatched. That row is a record OF the read, not a change
 *                   to what the workspace holds, so it does not flip the hint —
 *                   and every entry that relies on the carve-out must say so in
 *                   its own readOnlyHint justification (enforced by the test).
 *   destructiveHint true when a call can overwrite, replace, move or delete
 *                   something the workspace already had. Purely additive writes
 *                   and reversible boolean flags are false.
 *   idempotentHint  true when a second identical call produces no new document,
 *                   no new sub-record (history entry, note line, stored file),
 *                   no change to a user-visible field and no outbound message.
 *                   Server bookkeeping stamps (updatedAt, source) are excluded
 *                   from that comparison.
 *   openWorldHint   true when calling the tool reaches outside NivaDesk: it
 *                   fetches a URL, calls a third-party API, or mutates a
 *                   provider — whether the handler does it or a trigger the
 *                   workspace configured does it in consequence. Writing a
 *                   NivaDesk record that later feeds an internal proposal is
 *                   not open-world; writing one that puts a message in a
 *                   customer's inbox is.
 *
 * TWO SETS OF VALUES, AND WHY. `annotations` is what the runtime actually does,
 * verified against the handlers in September 2026. `liveAnnotations`, where it
 * is present, is what the deployed 1.1.1 listing serves today. They differ on
 * three hints across two tools, and the difference is not a disagreement about
 * behaviour — it is a release boundary. The listing OpenAI is reviewing must
 * not move under the reviewer, so the corrected values ship with the flag that
 * carries the whole 1.2.0 submission (NIVADESK_MCP_ORCHESTRATOR, default off).
 * Flag off, the wire is byte-identical to 1.1.1. Flag on, every hint is the
 * verified one. Which values are on the wire is the operator's decision at
 * submission time, not a side effect of merging this file.
 *
 * See docs/mcp-tool-annotations.md for the reviewer-facing table.
 */

"use strict";

/** Scopes the OAuth metadata documents advertise (index.js nvOAuth*Metadata). */
const SCOPES_SUPPORTED = Object.freeze([
  "orders.read", "orders.write", "notes.read", "notes.write", "finance.read", "tasks.write"
]);

/** The four hint keys, in the order they are serialised on the wire. */
const ANNOTATION_KEYS = Object.freeze([
  "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"
]);

/**
 * Closed list of the ways a tool can reach outside NivaDesk. Kept closed so a
 * new effect has to be named here, next to the openWorldHint it forces.
 */
const EFFECT_KINDS = Object.freeze([
  "customer_message",   // a trigger sends the buyer an e-mail or SMS
  "provider_write",     // a shop, marketplace, bank or accounting provider is mutated
  "external_fetch",     // a model-supplied URL is downloaded
  "ocr"                 // a third-party OCR service reads the file
]);

/** PII categories a tool can put in front of the assistant. */
const PII_KINDS = Object.freeze(["name", "email", "phone", "address"]);

/** Risk classes (A cheapest to E highest) used by the channel policy layer. */
const RISK_CLASSES = Object.freeze(["A", "B", "C", "D", "E"]);

/**
 * What a channel binding has to allow before a tool may be called over it
 * (WhatsApp spec §11 `allowedCapabilities`, §83 the per-kind feature flags).
 *
 * These are NOT on the wire and no MCP client ever sees them: MCP's projection
 * of this table is "every published entry", because the OAuth consent screen
 * and the workspace role are that channel's policy layer. A chat binding has a
 * second, coarser one — "this phone may read, but may not send anything to a
 * customer" — and it needs a vocabulary to say that in.
 */
const CAPABILITY_KINDS = Object.freeze(["read", "internal_write", "external_write", "file_upload"]);

/** The access-log sentence every readOnlyHint that leans on the carve-out repeats. */
const ACCESS_LOG_NOTE = "the only write it makes is the piiAccessLog row recording the read";

const TOOL_REGISTRY = [
  {
    name: "create_order",
    title: "Create order",
    domain: "orders",
    flag: null,
    scopes: ["orders.write"],
    permission: { guard: "nvRequireWriteAccess", area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "D",
    minAssurance: 3,
    pii: [],
    piiAccessLogged: false,
    effects: ["customer_message"],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    // 1.1.1 shipped openWorldHint false. It is wrong, and this is the larger of
    // the two corrections waiting on the flag.
    liveAnnotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because the call writes a new document in siparisler through nvOrderDefaults with createdFrom \"chatgpt\".",
      destructiveHint: "Because it only adds a record: no existing order is changed, moved or removed.",
      idempotentHint: "Because there is no request-level deduplication, so the same arguments called twice create two orders with different ids.",
      openWorldHint: "Because creating an order that carries a status and a customer e-mail address can put a message in that customer's inbox: notifyCustomerOnStatusChange runs on document creation as well as update, and an order with no portalAutoUpdates block counts as enabled with e-mail on, so the mail leaves through NivaDesk's SMTP provider (and Twilio where the workspace enabled SMS)."
    }
  },
  {
    name: "search_orders",
    title: "Search orders",
    domain: "orders",
    flag: null,
    scopes: ["orders.read"],
    permission: { guard: "nvRequireOrdersArea", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it queries siparisler by companyId and filters in memory; ${ACCESS_LOG_NOTE}, which records the read rather than changing what the workspace holds.`,
      destructiveHint: "Because no order is altered, moved or removed by a search.",
      idempotentHint: "Because repeating the same query returns the same rows and creates nothing.",
      openWorldHint: "Because it reads NivaDesk's own order records only and never contacts a shop, marketplace or any other outside system."
    }
  },
  {
    name: "get_order_detail",
    title: "Get order detail",
    domain: "orders",
    flag: null,
    scopes: ["orders.read"],
    permission: { guard: "nvRequireOrdersArea", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it reads one order document and the cross-workspace and workflow-assignment checks are reads too; ${ACCESS_LOG_NOTE}.`,
      destructiveHint: "Because reading an order changes nothing on it.",
      idempotentHint: "Because the same orderId returns the same document and creates nothing.",
      openWorldHint: "Because the order is read from NivaDesk's own collection and no outside system is contacted."
    }
  },
  {
    name: "add_order_note",
    title: "Add order note",
    domain: "orders",
    flag: null,
    scopes: ["orders.write", "notes.write"],
    permission: { guard: "nvRequireWriteAccess", area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it appends to the order's notes field and adds a historyLog entry.",
      destructiveHint: "Because the existing note text is kept and the new line is concatenated onto it.",
      idempotentHint: "Because each repeat appends the same line again and mints another history entry.",
      openWorldHint: "Because the workspace's customer notification keys on status, which this tool does not touch, so nothing leaves the workspace."
    }
  },
  {
    name: "update_order_status",
    title: "Update order status",
    domain: "orders",
    flag: null,
    scopes: ["orders.write"],
    permission: { guard: "nvRequireWriteAccess", area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "D",
    minAssurance: 3,
    pii: [],
    piiAccessLogged: false,
    effects: ["customer_message"],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    // 1.1.1 shipped openWorldHint false (wrong) and idempotentHint true (wrong
    // for a reason nothing in the handler reveals: nvHistoryItem mints a fresh
    // UUID and Timestamp per call, so the arrayUnion appends instead of
    // deduping). Both are corrected behind the flag.
    liveAnnotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    // idempotentHint goes back to true only together with the no-op guard, not
    // on its own. assertRegistry() fails the build the moment the guard token
    // appears in the handler while the hint is still false, so the guard cannot
    // land without the annotation catching up, and the annotation cannot be
    // flipped ahead of the guard.
    pendingGuard: { token: "nvMcpStatusNoOpGuard", hint: "idempotentHint", flipsTo: true },
    justification: {
      readOnlyHint: "Because the call sets status and/or designStatus on the order document.",
      destructiveHint: "Because the previous status value is overwritten and is not recoverable from the field.",
      idempotentHint: "Because a repeat with the same status appends a second historyLog entry (nvHistoryItem mints a new id and timestamp per call, so arrayUnion cannot dedupe), which the order's history shows the user.",
      openWorldHint: "Because a status change is what the workspace's own customer notification listens for: notifyCustomerOnStatusChange sends an e-mail through NivaDesk's mail provider, and an SMS through Twilio where the workspace enabled SMS, to the address and number on the order — and it is on by default for an order with no portalAutoUpdates block."
    }
  },
  {
    name: "create_note",
    title: "Create note",
    domain: "notes",
    flag: null,
    scopes: ["notes.write"],
    permission: { guard: null, area: "notes", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it creates a note document under the connected user's own personal_notes collection.",
      destructiveHint: "Because it only adds a note; no existing note is changed or removed.",
      idempotentHint: "Because there is no deduplication, so the same text called twice creates two notes.",
      openWorldHint: "Because the note is written to NivaDesk only and no trigger sends it anywhere."
    }
  },
  {
    name: "search_notes",
    title: "Search notes",
    domain: "notes",
    flag: null,
    scopes: ["notes.read"],
    permission: { guard: null, area: "notes", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it reads the connected user's own notes and filters them in memory; it writes nothing at all, not even an access-log row, because the notes are the caller's own.",
      destructiveHint: "Because no note is altered by a search.",
      idempotentHint: "Because the same query returns the same notes and creates nothing.",
      openWorldHint: "Because the notes are read from NivaDesk and no outside system is contacted."
    }
  },
  {
    name: "get_note_detail",
    title: "Get note detail",
    domain: "notes",
    flag: null,
    scopes: ["notes.read"],
    permission: { guard: null, area: "notes", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it reads one of the connected user's own note documents and writes nothing.",
      destructiveHint: "Because reading a note changes nothing on it.",
      idempotentHint: "Because the same noteId returns the same note and creates nothing.",
      openWorldHint: "Because the note is read from NivaDesk and no outside system is contacted."
    }
  },
  {
    name: "append_note",
    title: "Append to note",
    domain: "notes",
    flag: null,
    scopes: ["notes.write"],
    permission: { guard: null, area: "notes", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it writes the note's text field with the appended paragraph.",
      destructiveHint: "Because the previous text is kept and the new text is concatenated onto it.",
      idempotentHint: "Because each repeat appends the same paragraph again, so the note grows on every call.",
      openWorldHint: "Because the note is written to NivaDesk only and no trigger sends it anywhere."
    }
  },
  {
    name: "update_note",
    title: "Update note",
    domain: "notes",
    flag: null,
    scopes: ["notes.write"],
    permission: { guard: null, area: "notes", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it sets the note's title, text, labels, links or colour.",
      destructiveHint: "Because the supplied fields replace the previous values, which are not recoverable from the note.",
      idempotentHint: "Because it sets an explicit end state: a repeat with the same fields writes the same values, adds no note line and no history entry, and differs only in the server's updatedAt and source stamps.",
      openWorldHint: "Because the note is written to NivaDesk only and no trigger sends it anywhere."
    }
  },
  {
    name: "pin_note",
    title: "Pin note",
    domain: "notes",
    flag: null,
    scopes: ["notes.write"],
    permission: { guard: null, area: "notes", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it sets isPinned on the note document.",
      destructiveHint: "Because the flag is reversible by the same tool and no content is lost when it changes.",
      idempotentHint: "Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument pins rather than toggles.",
      openWorldHint: "Because the note is written to NivaDesk only and no trigger sends it anywhere."
    }
  },
  {
    name: "archive_note",
    title: "Archive note",
    domain: "notes",
    flag: null,
    scopes: ["notes.write"],
    permission: { guard: null, area: "notes", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "B",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it sets isArchived on the note document.",
      destructiveHint: "Because archiving hides the note without deleting it and the same tool puts it back.",
      idempotentHint: "Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument archives rather than toggles.",
      openWorldHint: "Because the note is written to NivaDesk only and no trigger sends it anywhere."
    }
  },
  {
    name: "get_order_financials",
    title: "Get order financials",
    domain: "finance",
    flag: null,
    scopes: ["finance.read"],
    permission: { guard: "nvRequireFinancialAccess", area: "financialInfo", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it computes totals over the workspace's own order documents; ${ACCESS_LOG_NOTE}.`,
      destructiveHint: "Because no order or payment record is altered by the calculation.",
      idempotentHint: "Because the same order returns the same figures and creates nothing.",
      openWorldHint: "Because every figure comes from NivaDesk's own records; no bank, payment or accounting provider is called."
    }
  },
  {
    name: "get_dashboard_summary",
    title: "Get dashboard summary",
    domain: "finance",
    flag: null,
    scopes: ["orders.read", "finance.read"],
    permission: { guard: "nvRequireDashboardAccess", area: "dashboard", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it aggregates the workspace's own orders in memory; ${ACCESS_LOG_NOTE}.`,
      destructiveHint: "Because summarising records does not change them.",
      idempotentHint: "Because the same workspace state returns the same summary and creates nothing.",
      openWorldHint: "Because the summary is computed from NivaDesk's own records and no outside system is contacted."
    }
  },
  {
    name: "get_extra_spending_overview",
    title: "Get extra spending overview",
    domain: "finance",
    flag: null,
    scopes: ["finance.read"],
    permission: { guard: "nvRequireFinancialAccess", area: "financialInfo", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it reads the workspace's spending documents and groups them in memory; ${ACCESS_LOG_NOTE}.`,
      destructiveHint: "Because no spending record is altered by the calculation.",
      idempotentHint: "Because the same period returns the same overview and creates nothing.",
      openWorldHint: "Because the spending rows are already in NivaDesk; no bank or provider is called to produce them."
    }
  },
  {
    name: "get_financial_overview",
    title: "Get financial overview",
    domain: "finance",
    flag: null,
    scopes: ["finance.read"],
    permission: { guard: "nvRequireFinancialAccess", area: "financialInfo", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email", "phone", "address"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it computes revenue, cost and profit from the workspace's own orders and spending; ${ACCESS_LOG_NOTE}.`,
      destructiveHint: "Because no record behind the figures is altered.",
      idempotentHint: "Because the same period returns the same figures and creates nothing.",
      openWorldHint: "Because every figure comes from NivaDesk's own records; no bank or accounting provider is called."
    }
  },
  {
    name: "get_bank_spending_summary",
    title: "Get bank spending summary",
    domain: "banking",
    flag: null,
    scopes: ["finance.read"],
    permission: { guard: "nvRequireBankFeedAccess", area: "bankFeed", write: false, financial: false, bankFeed: true, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    // A person-to-person payment carries a person's name in `counterparty`, and
    // linkedOrderLabel can carry a customer's. The dispatcher does not file a
    // piiAccessLog row for this tool today (MCP_ACTIONS_READING_PII lists the
    // six order/finance tools only) — see docs/mcp-tool-annotations.md, "open
    // items". Declared here so the gap is visible rather than implied.
    pii: ["name"],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it reads the workspace's already-imported bankTransactions rows and classifies them in process; it writes nothing.",
      destructiveHint: "Because no transaction row is altered by the summary.",
      idempotentHint: "Because the same rows produce the same summary and nothing is created.",
      openWorldHint: "Because the rows were imported by the bank feed beforehand: this call contacts no bank, no TrueLayer and no PayPal endpoint."
    }
  },
  {
    name: "search_bank_transactions",
    title: "Search bank transactions",
    domain: "banking",
    flag: null,
    scopes: ["finance.read"],
    permission: { guard: "nvRequireBankFeedAccess", area: "bankFeed", write: false, financial: false, bankFeed: true, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name"],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it reads the workspace's already-imported bankTransactions rows and filters them in memory; it writes nothing.",
      destructiveHint: "Because searching does not change a transaction row.",
      idempotentHint: "Because the same query returns the same rows and creates nothing.",
      openWorldHint: "Because the rows were imported by the bank feed beforehand: this call contacts no bank or payment provider."
    }
  },
  {
    name: "attach_bank_receipt",
    title: "Attach bank receipt",
    domain: "banking",
    flag: null,
    scopes: ["finance.read", "orders.write"],
    permission: { guard: "nvRequireBankFeedAccess", area: "bankFeed", write: true, financial: false, bankFeed: true, ownerOnly: true },
    riskClass: "C",
    minAssurance: 2,
    pii: [],
    piiAccessLogged: false,
    effects: ["external_fetch", "ocr"],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it stores the file under companies/{cid}/bank_receipts and then either assigns it to a transaction, returns candidates, or queues it as waiting.",
      destructiveHint: "Because assigning to a transaction that already has a receipt replaces it: assignInboxReceipt overwrites receiptPath and deletes the previous file.",
      idempotentHint: "Because a repeat with the same file stores and scores a second copy, and a repeat with the same inboxPath fails, since the first assignment moved the inbox file.",
      openWorldHint: "Because the handler downloads the document from a model-supplied https URL and sends it to Google Vision for OCR, so the call reaches systems outside NivaDesk even though it mutates no sales provider."
    }
  },
  {
    name: "search_inventory",
    title: "Search inventory",
    domain: "inventory",
    flag: "inventory",
    scopes: ["orders.read"],
    permission: { guard: "nvRequireInventoryAccess", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it reads the workspace's inventoryItems and filters them in memory; it writes nothing, and stock rows carry no person fields.",
      destructiveHint: "Because no item is altered by a search.",
      idempotentHint: "Because the same query returns the same items and creates nothing.",
      openWorldHint: "Because the items are read from NivaDesk and no outside system is contacted."
    }
  },
  {
    name: "create_inventory_item",
    title: "Create inventory item",
    domain: "inventory",
    flag: "inventory",
    // Advertised as orders.read today because nvMcpOAuthScopesForTool falls to
    // its default for this name — a write tool advertising a read scope. The
    // registry records what is on the wire; correcting it is a change to the
    // OAuth surface and belongs with the 1.2.0 submission, not here.
    scopes: ["orders.read"],
    permission: { guard: "nvRequireInventoryAccess", area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "C",
    minAssurance: 2,
    pii: [],
    piiAccessLogged: false,
    effects: ["external_fetch"],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: "Because it writes an item through inventoryInternal.saveItemForWorkspace and stores the photo in Storage.",
      destructiveHint: "Because it only adds an item; no existing stock row is changed or removed.",
      idempotentHint: "Because a repeat creates a second item: the confirmed:true requirement is a guard against accidental creation, not deduplication.",
      openWorldHint: "Because the handler downloads the photo from a model-supplied https URL before storing it."
    }
  },

  /* ------------------------------------------------------------------ *
   * The 1.2.0 read capabilities (§11–§12), all behind NIVADESK_MCP_ORCHESTRATOR.
   *
   * Every one of them is the same four values — true / false / true / false —
   * and that is not a copy-paste: they are pure reads over existing helpers,
   * they write nothing, and calling one twice with the same arguments returns
   * the same answer over the same data. What differs between them is which
   * gate they sit behind and whether they hand over a person, and those are
   * the fields directly below the hints.
   *
   * `domainNeeds` is what the loader is allowed to read for that capability —
   * the reason a notes-shaped question does not drag four connection
   * collections in behind it.
   * ------------------------------------------------------------------ */
  {
    name: "get_business_attention_summary",
    title: "What needs attention today",
    domain: "attention",
    flag: "orchestrator",
    scopes: ["orders.read", "finance.read"],
    permission: { guard: "orchestrator.assertCapability", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    // Nobody is named here, and that is enforced rather than hoped for. This
    // capability emits the same banking findings as get_banking_attention_summary
    // but asks for them with `revealCounterparty: false`, so a recurring-spend
    // group carries its transaction ids and no merchant label — and a merchant
    // is a person whenever the payment was person to person. The order items
    // follow the same rule: the title names the order, never the buyer. The
    // caller is told WHICH, and asks the banking capability WHO, which is the
    // read that declares pii and files the access-log row.
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "orders", "production", "inventory", "bank", "receiptInbox", "payouts", "connections", "commerceHealth", "review", "accounting"],
    justification: {
      readOnlyHint: "Because every detector runs over documents the loader read and writes nothing back: the accounting queue is read through its own reader, never through store.openAttention, which would create or bump an attention document on each call.",
      destructiveHint: "Because nothing is overwritten, moved or deleted; the answer is assembled in memory and discarded.",
      idempotentHint: "Because the detectors are deterministic over the same data, and a grouped item keeps its attentionId across days so a repeat call does not mint new items.",
      openWorldHint: "Because it reads NivaDesk's own collections only: no provider API is called, no URL is fetched and no message leaves the workspace."
    }
  },
  {
    name: "get_commerce_overview",
    title: "Sales overview across channels",
    domain: "commerce",
    flag: "orchestrator",
    scopes: ["orders.read", "finance.read"],
    permission: { guard: "orchestrator.assertCapability", area: "orders", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "orders", "payouts", "connections", "commerceHealth"],
    justification: {
      readOnlyHint: "Because it totals orders and payouts in memory through finance/engine.js and writes nothing: the money is recomputed on every call rather than stamped back onto the order.",
      destructiveHint: "Because no order, payout or setting is changed by reading them.",
      idempotentHint: "Because the same range over the same orders produces the same totals; only generatedAt moves, and that is metadata about the read.",
      openWorldHint: "Because the figures come from orders and payouts already stored in NivaDesk; no shop, marketplace or bank is contacted to answer it."
    }
  },
  {
    name: "search_commerce_orders",
    title: "Search orders across channels",
    domain: "commerce",
    flag: "orchestrator",
    scopes: ["orders.read"],
    permission: { guard: "orchestrator.assertCapability", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: ["name", "email"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    // "connections" is not optional detail: commerceSources dates a channel from
    // its connection when that channel writes no commerceHealth document, which
    // is every Etsy shop. Without it a healthy Etsy sync is reported as never
    // synced and the whole answer goes partial on a warning that is not true.
    domainNeeds: ["settings", "orders", "connections", "commerceHealth"],
    justification: {
      readOnlyHint: "Because it filters orders the loader already read and returns rows; the only write on the path is the piiAccessLog row recording that an assistant was shown customer names, which is a record of the read rather than a change to the workspace.",
      destructiveHint: "Because searching cannot alter an order: no field is written and no row is removed.",
      idempotentHint: "Because the same filters over the same orders return the same rows in the same order.",
      openWorldHint: "Because it searches NivaDesk's own order collection; the provider is never queried, even for an order that came from one."
    }
  },
  {
    name: "get_channel_performance",
    title: "Compare sales channels",
    domain: "commerce",
    flag: "orchestrator",
    scopes: ["orders.read", "finance.read"],
    permission: { guard: "orchestrator.assertCapability", area: "orders", write: false, financial: true, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "orders", "payouts", "connections", "commerceHealth"],
    justification: {
      readOnlyHint: "Because it groups the same recomputed order figures by channel and writes nothing back to any order or connection.",
      destructiveHint: "Because comparing channels changes none of them.",
      idempotentHint: "Because the same range produces the same per-channel figures, including the cost-coverage ratio that decides whether profit is reported as a definite number.",
      openWorldHint: "Because every figure comes from stored orders and payouts; no channel API is called to build the comparison."
    }
  },
  {
    name: "get_inventory_overview",
    title: "Inventory overview",
    domain: "inventory",
    flag: "orchestrator",
    scopes: ["orders.read"],
    permission: { guard: "nvRequireInventoryAccess", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false, inventory: true },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "inventory"],
    justification: {
      readOnlyHint: "Because it counts stock through the same pure summarize() the Inventory screen uses and writes no item, movement or ledger row.",
      destructiveHint: "Because counting stock cannot change it: no quantity, reservation or valuation is touched.",
      idempotentHint: "Because the same shelf produces the same counts and value on every call.",
      openWorldHint: "Because inventory has no external connector at all: the numbers come from NivaDesk's own items and nothing is fetched."
    }
  },
  {
    name: "search_inventory_items",
    title: "Search inventory",
    domain: "inventory",
    flag: "orchestrator",
    scopes: ["orders.read"],
    permission: { guard: "nvRequireInventoryAccess", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false, inventory: true },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "inventory"],
    justification: {
      readOnlyHint: "Because it filters items in memory and returns rows; no item is created, reserved or written.",
      destructiveHint: "Because a search does not touch the stock it finds.",
      idempotentHint: "Because the same filters return the same items, including two items that share a SKU, which is a search key here and never an identity.",
      openWorldHint: "Because there is no listing or channel data to consult: the search runs entirely over NivaDesk's own inventory."
    }
  },
  {
    name: "get_payout_reconciliation_overview",
    title: "Marketplace payouts against the bank",
    domain: "banking",
    flag: "orchestrator",
    scopes: ["finance.read"],
    permission: { guard: "nvRequireBankFeedAccess", area: null, write: false, financial: false, bankFeed: true, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "payouts", "bank", "connections"],
    justification: {
      readOnlyHint: "Because it scores candidate bank rows with the pure settlements scorer and reports the result: it never calls the matcher that writes bankMatch onto a payout and settlement onto a transaction.",
      destructiveHint: "Because no payout is matched, unmatched or relabelled by asking about it.",
      idempotentHint: "Because scoring the same payouts against the same bank rows yields the same counts, and a second call still writes no match.",
      openWorldHint: "Because payouts and bank rows are already in NivaDesk; neither the processor nor the bank is contacted to answer the question."
    }
  },
  {
    name: "get_integration_health",
    title: "Connection health",
    domain: "integrations",
    flag: "orchestrator",
    scopes: ["orders.read"],
    permission: { guard: "orchestrator.assertCapability", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["orders", "connections", "commerceHealth", "review"],
    justification: {
      readOnlyHint: "Because it reads connection documents and health records and writes nothing: reporting that a connection needs reauthorisation does not attempt the reauthorisation.",
      destructiveHint: "Because no connection is disconnected, retried or reset by reporting its state.",
      idempotentHint: "Because the same stored health records produce the same rows, and no counter is incremented by the read.",
      openWorldHint: "Because freshness is read from NivaDesk's own health documents rather than by pinging each provider, which is also why an Amazon connection this project cannot see is reported as not visible instead of as broken."
    }
  },
  {
    name: "get_accounting_sync_status",
    title: "Accounting sync status",
    domain: "accounting",
    flag: "orchestrator",
    scopes: ["finance.read"],
    permission: { guard: "accountingReaderCanRead", area: null, write: false, financial: false, bankFeed: false, ownerOnly: false, accountingReader: true },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "connections", "accounting", "bank"],
    justification: {
      readOnlyHint: "Because the open accounting items are read from the attention collection rather than opened through store.openAttention, which would write a document and bump an occurrence counter on every call.",
      destructiveHint: "Because nothing in the accounting state is resolved, ignored or retried by reading it.",
      idempotentHint: "Because the same connections and attention rows produce the same status, and the read cannot advance a posting through its state machine.",
      openWorldHint: "Because QuickBooks, Xero and Pandle are not called: the answer is the state NivaDesk already stored, which is why it says posting is not switched on rather than reporting zero failures."
    }
  },
  {
    name: "get_banking_attention_summary",
    title: "What needs attention in Banking",
    domain: "banking",
    flag: "orchestrator",
    scopes: ["finance.read"],
    permission: { guard: "nvRequireBankFeedAccess", area: null, write: false, financial: false, bankFeed: true, ownerOnly: false },
    riskClass: "A",
    minAssurance: 1,
    // A bank row's counterparty is a person whenever the payment was person to
    // person, and a recurring-spend group is titled with that same text.
    pii: ["name"],
    piiAccessLogged: true,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "bank", "receiptInbox", "connections"],
    justification: {
      readOnlyHint: "Because the duplicate, recurring, transfer and unusual-charge rules are pure functions over rows the loader read; the only write on the path is the piiAccessLog row, recording that a counterparty name was shown to an assistant.",
      destructiveHint: "Because no transaction is categorised, linked, dismissed or marked reviewed by reporting it.",
      idempotentHint: "Because the same rows produce the same grouped items with the same attentionId, so a second call does not create a second alert for the same eight receipts.",
      openWorldHint: "Because it reads bank rows already imported into NivaDesk; the bank is not contacted and no sync is triggered."
    }
  }
];

/* ------------------------------------------------------------------ */

const BY_NAME = new Map(TOOL_REGISTRY.map((entry) => [entry.name, entry]));

/** Flag names this table understands, and the environment variable behind each. */
const FLAG_ENV = Object.freeze({
  emailReceipts: "NIVADESK_MCP_EMAIL_RECEIPTS",
  inventory: "NIVADESK_MCP_INVENTORY",
  orchestrator: "NIVADESK_MCP_ORCHESTRATOR"
});

/** Reads the three review flags out of an environment object. */
function flagsFromEnv(env = {}) {
  const on = (key) => env[FLAG_ENV[key]] === "1";
  return { emailReceipts: on("emailReceipts"), inventory: on("inventory"), orchestrator: on("orchestrator") };
}

function normalizeFlags(flags = {}) {
  return {
    emailReceipts: flags.emailReceipts === true,
    inventory: flags.inventory === true,
    orchestrator: flags.orchestrator === true
  };
}

/** True when the deployment publishes this entry under the given flags. */
function isPublished(entry, flags) {
  if (!entry.flag) return true;
  return normalizeFlags(flags)[entry.flag] === true;
}

/** Published entries, in tools/list order. */
function publishedEntries(flags = {}) {
  return TOOL_REGISTRY.filter((entry) => isPublished(entry, flags));
}

/** Published tool names, in tools/list order. */
function publishedNames(flags = {}) {
  return publishedEntries(flags).map((entry) => entry.name);
}

function entryFor(name) {
  return BY_NAME.get(String(name || "")) || null;
}

/**
 * What a binding must allow before this tool may run on that channel.
 *
 * Derived from the two fields the annotations are already derived from, so a
 * channel's policy and the reviewer's annotation cannot disagree about the same
 * tool: `permission.write` says whether the workspace changes, and `effects`
 * says whether the change leaves NivaDesk. A tool that can put a message in a
 * customer's inbox therefore needs `external_write` on the binding — the same
 * fact that makes its openWorldHint true.
 */
function kindsFor(entry) {
  const effects = Array.isArray(entry.effects) ? entry.effects : [];
  const kinds = [];
  if (entry.permission && entry.permission.write === true) {
    kinds.push(effects.includes("customer_message") || effects.includes("provider_write") ? "external_write" : "internal_write");
  } else {
    kinds.push("read");
  }
  // A tool that takes a document off the caller is a file path into the
  // workspace whatever else it does, and a binding can withhold that on its own.
  if (effects.includes("external_fetch") || effects.includes("ocr")) kinds.push("file_upload");
  return kinds;
}

/**
 * A channel binding's profile, read the way a security boundary should be read:
 * closed unless it says otherwise.
 *
 * An incomplete profile is the likely one — a gateway that forgot a field, a
 * binding written before a kind existed — so a missing `capabilities` means
 * reads only and a missing assurance level means level 1, the lowest thing a
 * live binding can be (WA §15). Unknown capability names are dropped rather
 * than honoured, so a typo removes access instead of granting it.
 */
function normalizeChannelProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const security = (profile.security && typeof profile.security === "object") ? profile.security : {};
  const listed = Array.isArray(profile.capabilities) ? profile.capabilities
    : (Array.isArray(profile.allowedCapabilities) ? profile.allowedCapabilities : null);
  const rawAssurance = security.assurance_level !== undefined ? security.assurance_level : profile.securityLevel;
  const assurance = Math.floor(Number(rawAssurance));
  return {
    capabilities: (listed || ["read"]).map(String).filter((kind) => CAPABILITY_KINDS.includes(kind)),
    assurance: Number.isFinite(assurance) && assurance >= 1 ? assurance : 1
  };
}

/**
 * The entries a channel may call: published by this deployment's flags, allowed
 * by the binding's capability list, and at or under its assurance level.
 *
 * With no profile this is the MCP projection — the whole published table —
 * because that is what `tools/list` serves. One table, two projections; there
 * is no WhatsApp-specific tool set to drift (WA §81, §14).
 */
function publishedForChannel({ flags = {}, channelProfile = null } = {}) {
  const profile = normalizeChannelProfile(channelProfile);
  const entries = publishedEntries(flags);
  if (!profile) return entries;
  return entries.filter((entry) => {
    if (entry.minAssurance > profile.assurance) return false;
    return kindsFor(entry).every((kind) => profile.capabilities.includes(kind));
  });
}

/**
 * The four hints for a tool, always in the same key order, always booleans.
 *
 * With the orchestrator flag off the caller gets the values the 1.1.1 listing
 * serves; with it on, the verified ones. There is no third possibility and no
 * coercion: a value that is not a boolean has already thrown at load.
 */
function annotationsFor(name, flags = {}) {
  const entry = entryFor(name);
  if (!entry) throw new TypeError(`No MCP registry entry for tool "${name}".`);
  const source = normalizeFlags(flags).orchestrator ? entry.annotations : (entry.liveAnnotations || entry.annotations);
  const out = {};
  for (const key of ANNOTATION_KEYS) out[key] = source[key];
  return out;
}

/** The four "Because …" lines, describing the verified values. */
function justificationFor(name) {
  const entry = entryFor(name);
  if (!entry) throw new TypeError(`No MCP registry entry for tool "${name}".`);
  return { ...entry.justification };
}

function scopesFor(name) {
  const entry = entryFor(name);
  return entry ? [...entry.scopes] : ["orders.read"];
}

function effectsFor(name) {
  const entry = entryFor(name);
  return entry ? [...entry.effects] : [];
}

/** True where the live listing serves a hint the runtime no longer supports. */
function correctionsPending() {
  return TOOL_REGISTRY
    .filter((entry) => entry.liveAnnotations)
    .map((entry) => ({
      name: entry.name,
      changes: ANNOTATION_KEYS
        .filter((key) => entry.liveAnnotations[key] !== entry.annotations[key])
        .map((key) => ({ hint: key, live: entry.liveAnnotations[key], verified: entry.annotations[key] }))
    }))
    .filter((row) => row.changes.length > 0);
}

/**
 * Everything that has to be true of the table, checked at module load.
 *
 * It throws rather than warns: a function that cannot describe its own tools
 * honestly should fail to start, not serve a listing with a hole in it. The
 * checks are the ones that would have caught the 1.1.1 rejection —
 * non-boolean hints, a missing justification, and an openWorldHint that
 * disagrees with the effects the tool actually has.
 *
 * `handlerSource` is index.js's text when the caller has it (the test passes
 * it); without it the guard-token checks are skipped rather than guessed.
 */
function assertRegistry(table = TOOL_REGISTRY, handlerSource = null) {
  const fail = (message) => { throw new TypeError(`MCP tool registry: ${message}`); };
  const seen = new Set();

  for (const entry of table) {
    const name = entry && entry.name;
    if (!name || typeof name !== "string") fail("an entry has no name.");
    if (seen.has(name)) fail(`"${name}" appears twice.`);
    seen.add(name);
    if (/(^|_)(test|internal|debug|dev)(_|$)/i.test(name)) fail(`"${name}" reads like an internal action, not a published tool.`);

    if (entry.flag !== null && !Object.prototype.hasOwnProperty.call(FLAG_ENV, entry.flag)) {
      fail(`"${name}" is gated by an unknown flag "${entry.flag}".`);
    }

    // 1. Four explicit booleans, and nothing else, in both value sets.
    const sets = [["annotations", entry.annotations]];
    if (entry.liveAnnotations) sets.push(["liveAnnotations", entry.liveAnnotations]);
    for (const [label, values] of sets) {
      if (!values || typeof values !== "object") fail(`"${name}" has no ${label} object.`);
      const keys = Object.keys(values);
      if (keys.length !== ANNOTATION_KEYS.length) fail(`"${name}" ${label} must carry exactly the four hints, found ${keys.join(", ") || "none"}.`);
      for (const key of ANNOTATION_KEYS) {
        if (typeof values[key] !== "boolean") {
          fail(`"${name}" ${label}.${key} is ${values[key] === null ? "null" : typeof values[key]}; every hint must be an explicit true or false.`);
        }
      }
    }

    // 2. A justification per hint, phrased as a reason.
    for (const key of ANNOTATION_KEYS) {
      const line = entry.justification && entry.justification[key];
      if (typeof line !== "string" || line.trim().length < 20) fail(`"${name}" has no ${key} justification.`);
      if (!/^Because /.test(line)) fail(`"${name}" ${key} justification must start with "Because".`);
    }

    // 3. openWorldHint and effects say the same thing. This is the check that
    //    would have caught create_order and update_order_status: both had a
    //    trigger that mails the customer and both claimed openWorldHint false.
    if (!Array.isArray(entry.effects)) fail(`"${name}" has no effects list.`);
    for (const effect of entry.effects) {
      if (!EFFECT_KINDS.includes(effect)) fail(`"${name}" declares unknown effect "${effect}".`);
    }
    if (entry.effects.length > 0 && entry.annotations.openWorldHint !== true) {
      fail(`"${name}" declares effects [${entry.effects.join(", ")}] but openWorldHint is false.`);
    }
    if (entry.annotations.openWorldHint === true && entry.effects.length === 0) {
      fail(`"${name}" is openWorldHint true but names no effect.`);
    }

    // 4. A read tool that hands over people must say where that is recorded.
    if (!Array.isArray(entry.pii)) fail(`"${name}" has no pii list.`);
    for (const kind of entry.pii) {
      if (!PII_KINDS.includes(kind)) fail(`"${name}" declares unknown pii category "${kind}".`);
    }
    if (typeof entry.piiAccessLogged !== "boolean") fail(`"${name}" must say whether its read is access-logged.`);
    if (entry.piiAccessLogged && entry.pii.length === 0) fail(`"${name}" logs a PII access but declares no pii categories.`);
    if (entry.annotations.readOnlyHint === true && entry.piiAccessLogged) {
      if (!/piiAccessLog/.test(entry.justification.readOnlyHint)) {
        fail(`"${name}" is readOnlyHint true and writes an access-log row; its readOnlyHint justification must disclose that row.`);
      }
    }
    if (!entry.piiAccessLogged && /piiAccessLog/.test(entry.justification.readOnlyHint)) {
      fail(`"${name}" claims an access-log row in its justification but is not in MCP_ACTIONS_READING_PII.`);
    }

    // 5. Scopes: present, known, and never empty (an empty list would advertise
    //    a tool any token can call).
    if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) fail(`"${name}" has no scopes.`);
    for (const scope of entry.scopes) {
      if (!SCOPES_SUPPORTED.includes(scope)) fail(`"${name}" asks for scope "${scope}", which the OAuth metadata does not advertise.`);
    }

    // 6. Channel policy fields the WhatsApp gateway reads.
    if (!RISK_CLASSES.includes(entry.riskClass)) fail(`"${name}" has no valid risk class.`);
    if (![1, 2, 3].includes(entry.minAssurance)) fail(`"${name}" has no valid minimum assurance level.`);
    if (!entry.permission || typeof entry.permission !== "object") fail(`"${name}" has no permission descriptor.`);
    for (const key of ["write", "financial", "bankFeed", "ownerOnly"]) {
      if (typeof entry.permission[key] !== "boolean") fail(`"${name}" permission.${key} must be a boolean.`);
    }

    // 7. A hint that is waiting on a behaviour change cannot drift away from
    //    it. The guard names a token; while the token is absent the hint holds
    //    its honest value, and the moment somebody adds the guard this fails
    //    until the hint is flipped and the pendingGuard removed.
    if (entry.pendingGuard) {
      const { token, hint, flipsTo } = entry.pendingGuard;
      if (!token || !ANNOTATION_KEYS.includes(hint) || typeof flipsTo !== "boolean") {
        fail(`"${name}" has a malformed pendingGuard.`);
      }
      if (entry.annotations[hint] === flipsTo) {
        fail(`"${name}" already claims ${hint}:${flipsTo} while still declaring the pending guard "${token}"; drop pendingGuard when the guard ships.`);
      }
      if (typeof handlerSource === "string" && handlerSource.includes(token)) {
        fail(`"${name}" names guard "${token}", which is now present in the handler: flip ${hint} to ${flipsTo} and remove pendingGuard.`);
      }
    }
  }

  return true;
}

// A registry that cannot describe itself must not be served.
assertRegistry();

module.exports = {
  TOOL_REGISTRY,
  SCOPES_SUPPORTED,
  ANNOTATION_KEYS,
  EFFECT_KINDS,
  PII_KINDS,
  RISK_CLASSES,
  CAPABILITY_KINDS,
  FLAG_ENV,
  flagsFromEnv,
  normalizeFlags,
  publishedEntries,
  publishedNames,
  publishedForChannel,
  kindsFor,
  entryFor,
  annotationsFor,
  justificationFor,
  scopesFor,
  effectsFor,
  correctionsPending,
  assertRegistry
};
