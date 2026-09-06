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

/**
 * PII categories a tool can put in front of the assistant, and the kinds of
 * subject an access-log row may name.
 *
 * SUBJECT_KINDS comes from privacy/accessLog.js — the module that normalises
 * and writes the row — rather than being retyped here: a subject kind this
 * table invented would be silently rewritten to "order" by `pick()` at write
 * time, which is how the log came to file a bank-counterparty read as an order.
 * That module is pure (no Firestore, no clock, no network), so importing it
 * keeps this one pure too.
 */
const PII_KINDS = Object.freeze(["name", "email", "phone", "address"]);
const { SUBJECT_KINDS: ACCESS_LOG_SUBJECT_KINDS } = require("../privacy/accessLog");

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
    piiSubject: null,
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
    piiSubject: "order",
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
    piiSubject: "order",
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: null,
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
    piiSubject: "order",
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
    piiSubject: "order",
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
    piiSubject: "order",
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
    piiSubject: "order",
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
    // linkedOrderLabel can carry a customer's. The row IS declared now: the two
    // oldest doors to bank counterparty names were the only PII paths on this
    // surface that recorded nothing, while `get_banking_attention_summary` —
    // the newest door to the same data — declares the same category and logs.
    // Turning a write on for the live 1.1.1 connection is an operator's call,
    // so the row waits on the same flag every other behaviour change on this
    // branch waits on (`piiAccessLoggedFlag`, read by nvMcpPiiLogFlagOn), and
    // not on a separate list somebody has to remember.
    pii: ["name"],
    piiAccessLogged: true,
    piiAccessLoggedFlag: "orchestrator",
    piiSubject: "bank_transaction",
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it reads the workspace's already-imported bankTransactions rows and classifies them in process; ${ACCESS_LOG_NOTE}.`,
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
    // Same gap, same fix, same flag as get_bank_spending_summary above.
    pii: ["name"],
    piiAccessLogged: true,
    piiAccessLoggedFlag: "orchestrator",
    piiSubject: "bank_transaction",
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    justification: {
      readOnlyHint: `Because it reads the workspace's already-imported bankTransactions rows and filters them in memory; ${ACCESS_LOG_NOTE}.`,
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
    piiSubject: null,
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
    // THE workspace's inventory search — one tool, one row, whatever the flags.
    //
    // There were two: this one under the inventory flag and an orchestrator
    // capability called `search_inventory_items` under the orchestrator flag,
    // so with both flags on `tools/list` carried two tools with the same title
    // ("Search inventory") over the same collection. Neither was ever public —
    // production runs with every MCP flag unset — so there was no incumbent to
    // protect and the choice could be made on the merits: the name here, the
    // orchestrator's implementation behind it, and `search_inventory_items`
    // kept as an internal alias for callers that learned that name
    // (orchestrator/index.js CAPABILITY_ALIASES). The comparison that settled
    // it, field by field, is docs/mcp-inventory-search-decision.md.
    //
    // Two flags, because both surfaces need this one search: `inventory` alone
    // publishes it beside `create_inventory_item`, and `orchestrator` alone
    // publishes it as one of the two read capabilities the reduced 1.2.0
    // surface carries.
    name: "search_inventory",
    title: "Search inventory",
    domain: "inventory",
    flag: ["inventory", "orchestrator"],
    scopes: ["orders.read"],
    // `inventory: true` is the orchestrator's own gate (context.assertCapability
    // → ctx.inventoryAccess, which index.js wires to nvRequireInventoryAccess),
    // so the predicate is the same one the flag-off handler throws from.
    permission: { guard: "nvRequireInventoryAccess", area: "orders", write: false, financial: false, bankFeed: false, ownerOnly: false, inventory: true },
    riskClass: "A",
    minAssurance: 1,
    pii: [],
    piiAccessLogged: false,
    piiSubject: null,
    effects: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    liveAnnotations: null,
    pendingGuard: null,
    domainNeeds: ["settings", "inventory"],
    justification: {
      readOnlyHint: "Because it reads the workspace's inventoryItems and filters them in memory; no item is created, reserved or written, and stock rows carry no person fields.",
      destructiveHint: "Because a search does not touch the stock it finds.",
      idempotentHint: "Because the same filters return the same items, including two items that share a SKU, which is a search key here and never an identity.",
      openWorldHint: "Because there is no listing or channel data to consult: the items are read from NivaDesk and no outside system is contacted."
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
    piiSubject: null,
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
   * The 1.2.0 read capabilities, behind NIVADESK_MCP_ORCHESTRATOR.
   *
   * There is one row here, and the workspace's inventory search above is the
   * other half of the set: the scope reduction of 6 September 2026 cut this
   * block from ten capabilities to the two the operator kept — order search,
   * and ONE inventory search. Everything that reported money, payouts,
   * accounting or banking state came out of the release entirely: no registry
   * row, nothing published under any flag, nothing dispatched. The modules
   * behind them are still on disk and are unreachable, which
   * test/qa/mcp-reduced-surface.test.js is the standing proof of.
   *
   * `domainNeeds` is what the loader is allowed to read for that capability —
   * the reason an order-shaped question does not drag four connection
   * collections in behind it.
   * ------------------------------------------------------------------ */
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
    piiSubject: "order",
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

/**
 * The flags that can publish one entry, always as a list.
 *
 * `flag` is a single key for all but one tool. `search_inventory` names two,
 * because it is the workspace's ONE inventory search and both flags that can
 * open an inventory surface have to be able to publish it: the inventory flag
 * alone publishes it beside `create_inventory_item` (whose description tells
 * the model to search before it adds, so a create tool with no search beside it
 * is a duplicate-maker), and the orchestrator flag alone publishes it as one of
 * the two read capabilities the reduced 1.2.0 surface carries. What it must
 * never be is TWO tools — see
 * docs/mcp-inventory-search-decision.md and the invariant in
 * test/qa/mcp-one-inventory-search.test.js.
 */
function flagsFor(entry) {
  if (!entry || !entry.flag) return [];
  return Array.isArray(entry.flag) ? entry.flag : [entry.flag];
}

/** True when the deployment publishes this entry under the given flags. */
function isPublished(entry, flags) {
  const gates = flagsFor(entry);
  if (gates.length === 0) return true;
  const on = normalizeFlags(flags);
  return gates.some((gate) => on[gate] === true);
}

/** Published entries, in tools/list order. */
function publishedEntries(flags = {}) {
  assertRegistryOnce();
  return TOOL_REGISTRY.filter((entry) => isPublished(entry, flags));
}

/** Published tool names, in tools/list order. */
function publishedNames(flags = {}) {
  return publishedEntries(flags).map((entry) => entry.name);
}

function entryFor(name) {
  assertRegistryOnce();
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
  assertRegistryOnce();
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

/**
 * The hints the DEPLOYED listing gets wrong, named one at a time.
 *
 * Check 3 below — openWorldHint against the effects the tool actually has, the
 * check this file was built around — read `entry.annotations` only. But with
 * the orchestrator flag off, `annotationsFor` serves `liveAnnotations`, so the
 * values a reviewer is looking at today were exempt from the one structural
 * check that would have caught the 1.1.1 rejection, and a third wrong live
 * value could have been added without the load-time assertion noticing.
 *
 * Both value sets are checked now, and the difference between them has to be
 * declared HERE, per tool and per hint, with the reason it is still on the
 * wire. The list is exact in both directions: a live hint that disagrees with
 * the verified one and is not named here fails the load, and a name here whose
 * two values agree fails it too — so when the operator flips the flag and the
 * `liveAnnotations` come out, this table cannot quietly rot into a licence.
 */
const LIVE_HINT_EXEMPTIONS = Object.freeze({
  create_order: Object.freeze({
    openWorldHint: "1.1.1 shipped false. The order-created trigger mails the buyer, so the verified value is true; the listing under review must not move under the reviewer, and the correction ships with NIVADESK_MCP_ORCHESTRATOR."
  }),
  update_order_status: Object.freeze({
    openWorldHint: "1.1.1 shipped false. notifyCustomerOnStatusChange puts a message in the customer's inbox, so the verified value is true; corrected behind the same flag.",
    idempotentHint: "1.1.1 shipped true. nvHistoryItem mints a fresh UUID and Timestamp per call, so a repeated status write appends a second history entry; corrected behind the same flag."
  })
});

/** True where the live listing serves a hint the runtime no longer supports. */
function correctionsPending() {
  assertRegistryOnce();
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

    if (entry.flag !== null) {
      const gates = flagsFor(entry);
      if (gates.length === 0) fail(`"${name}" has an empty flag list; use null for "always published".`);
      for (const gate of gates) {
        if (!Object.prototype.hasOwnProperty.call(FLAG_ENV, gate)) {
          fail(`"${name}" is gated by an unknown flag "${gate}".`);
        }
      }
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
    //
    //    It runs over BOTH value sets, because `annotationsFor` serves
    //    `liveAnnotations` while the orchestrator flag is off: a check that
    //    read `entry.annotations` alone validated the set nobody is being
    //    served yet and left the bytes on the wire exempt from the one
    //    structural check this file was built around. The values that ship
    //    are allowed to differ only where LIVE_HINT_EXEMPTIONS names the
    //    tool, names the hint, and says why.
    if (!Array.isArray(entry.effects)) fail(`"${name}" has no effects list.`);
    for (const effect of entry.effects) {
      if (!EFFECT_KINDS.includes(effect)) fail(`"${name}" declares unknown effect "${effect}".`);
    }

    const exemptions = LIVE_HINT_EXEMPTIONS[name] || {};
    for (const key of Object.keys(exemptions)) {
      if (!ANNOTATION_KEYS.includes(key)) fail(`"${name}" declares a pending live correction for "${key}", which is not a hint.`);
      if (typeof exemptions[key] !== "string" || exemptions[key].trim().length < 20) {
        fail(`"${name}" declares a pending live correction for ${key} with no reason.`);
      }
    }
    if (!entry.liveAnnotations && Object.keys(exemptions).length > 0) {
      fail(`"${name}" declares a pending live correction but serves no liveAnnotations.`);
    }

    for (const [label, values, exempt] of [
      ["the verified values", entry.annotations, {}],
      ["the values being served", entry.liveAnnotations || entry.annotations, exemptions]
    ]) {
      if (exempt.openWorldHint) continue;
      if (entry.effects.length > 0 && values.openWorldHint !== true) {
        fail(`"${name}" declares effects [${entry.effects.join(", ")}] but openWorldHint is false in ${label}.`);
      }
      if (values.openWorldHint === true && entry.effects.length === 0) {
        fail(`"${name}" is openWorldHint true in ${label} but names no effect.`);
      }
    }

    // The allowlist is exact in both directions, so a third wrong live value
    // cannot arrive unannounced and a correction cannot outlive the defect it
    // was written for.
    if (entry.liveAnnotations) {
      const differing = ANNOTATION_KEYS.filter((key) => entry.liveAnnotations[key] !== entry.annotations[key]);
      for (const key of differing) {
        if (!Object.prototype.hasOwnProperty.call(exemptions, key)) {
          fail(`"${name}" serves ${key} = ${entry.liveAnnotations[key]} while the verified value is ${entry.annotations[key]}, and no pending correction names it. Declare it in LIVE_HINT_EXEMPTIONS with the reason it is still on the wire, or correct the value.`);
        }
      }
      for (const key of Object.keys(exemptions)) {
        if (!differing.includes(key)) {
          fail(`"${name}" declares a pending live correction for ${key}, but the served and verified values agree; remove it.`);
        }
      }
    }

    // 4. A read tool that hands over people must say where that is recorded.
    if (!Array.isArray(entry.pii)) fail(`"${name}" has no pii list.`);
    for (const kind of entry.pii) {
      if (!PII_KINDS.includes(kind)) fail(`"${name}" declares unknown pii category "${kind}".`);
    }
    if (typeof entry.piiAccessLogged !== "boolean") fail(`"${name}" must say whether its read is access-logged.`);
    if (entry.piiAccessLogged && entry.pii.length === 0) fail(`"${name}" logs a PII access but declares no pii categories.`);
    // The row's own two fields. The dispatcher builds `categories` and
    // `subject.kind` from these, so a wrong value here is a wrong claim in an
    // audit trail that is never deleted: before this, every logged action
    // declared name/email/phone/address and a subject kind guessed from the
    // tool's name, which filed a bank-counterparty read as an order that had
    // exposed a phone number and a postal address.
    if (entry.piiAccessLogged) {
      if (!ACCESS_LOG_SUBJECT_KINDS.includes(entry.piiSubject)) {
        fail(`"${name}" logs a PII access but names no subject kind the access log accepts (got ${JSON.stringify(entry.piiSubject)}).`);
      }
    } else if (entry.piiSubject !== null) {
      fail(`"${name}" names a PII subject kind but files no access-log row.`);
    }
    // A row that waits on a flag has to name a flag that exists, and only a row
    // that exists can wait on one. Without this, `piiAccessLoggedFlag: "typo"`
    // would silently mean "never log".
    if (entry.piiAccessLoggedFlag !== undefined && entry.piiAccessLoggedFlag !== null) {
      if (!Object.keys(normalizeFlags({})).includes(entry.piiAccessLoggedFlag)) {
        fail(`"${name}" waits for a deployment flag "${entry.piiAccessLoggedFlag}" that normalizeFlags does not know.`);
      }
      if (!entry.piiAccessLogged) {
        fail(`"${name}" names a flag for an access-log row it does not declare.`);
      }
    }
    if (entry.annotations.readOnlyHint === true && entry.piiAccessLogged) {
      if (!/piiAccessLog/.test(entry.justification.readOnlyHint)) {
        fail(`"${name}" is readOnlyHint true and writes an access-log row; its readOnlyHint justification must disclose that row.`);
      }
    }
    if (!entry.piiAccessLogged && /piiAccessLog/.test(entry.justification.readOnlyHint)) {
      fail(`"${name}" claims an access-log row in its justification but declares piiAccessLogged: false.`);
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

  // A pending correction for a tool this table does not have is a correction
  // nobody will ever make; more to the point, it is how the allowlist outlives
  // the entry it was written for.
  for (const name of Object.keys(LIVE_HINT_EXEMPTIONS)) {
    if (!seen.has(name)) fail(`LIVE_HINT_EXEMPTIONS names "${name}", which is not in the table.`);
  }

  return true;
}

/**
 * The check, run once, before anything this table describes is served.
 *
 * It used to run at module scope. The position it encodes is right — a
 * function that cannot describe its own tools honestly should not serve a
 * listing with a hole in it — but the blast radius was wrong: `functions/
 * index.js` requires this module unconditionally, so a malformed registry
 * edit failed the cold start of every one of the 400-plus deployed functions,
 * on a codebase whose rollouts are 45 callables per batch with per-batch
 * rollback targets. A mistake in a tool description would have taken down
 * order writes, the bank feed and the Stripe webhooks with it.
 *
 * So the check keeps its teeth and loses its reach: it runs on the first call
 * to anything that describes, publishes or dispatches a tool — `tools/list`,
 * the annotations, the scopes, the channel projection — and a bad edit takes
 * down the MCP surface alone while the rest of the deployment starts. It is
 * memoised, so the cost is one pass per process, and the failure is memoised
 * too: the same error is rethrown rather than a second, different one from a
 * half-validated table. CI still validates eagerly and by name
 * (`assertRegistry(TOOL_REGISTRY, indexSource)` in
 * test/qa/mcp-tool-annotations.test.js), so a broken table never reaches a
 * deploy in the first place.
 */
let validation = null;
function assertRegistryOnce() {
  if (validation === true) return true;
  if (validation instanceof Error) throw validation;
  try {
    assertRegistry();
    validation = true;
  } catch (error) {
    validation = error instanceof Error ? error : new TypeError(String(error));
    throw validation;
  }
  return true;
}

module.exports = {
  TOOL_REGISTRY,
  SCOPES_SUPPORTED,
  LIVE_HINT_EXEMPTIONS,
  ANNOTATION_KEYS,
  EFFECT_KINDS,
  PII_KINDS,
  RISK_CLASSES,
  CAPABILITY_KINDS,
  FLAG_ENV,
  flagsFromEnv,
  normalizeFlags,
  flagsFor,
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
  assertRegistry,
  assertRegistryOnce
};
