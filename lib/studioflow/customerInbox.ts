import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

/**
 * The customer inbox, from the browser.
 *
 * EVERY READ GOES THROUGH A CALLABLE, and that is not a style choice.
 * `firestore.rules` denies every client read of
 * `companies/{companyId}/channelCustomerConversations`, because everything in
 * that collection was written by an identity that proved nothing — a stranger
 * who messaged the workspace's number. So this file has no `onSnapshot` and no
 * `collection()`: the team Messages module listens to its own threads, and this
 * one asks a server that has already decided who is asking.
 *
 * NOTHING IS COMPUTED HERE. The server returns rows that are already masked,
 * already sorted, and already carry unread per person and `untrusted` per
 * message. Re-deriving any of it in the browser would be a second answer about
 * the same thing.
 */

/** One conversation as `conversationListRows` sends it. */
export type CustomerInboxRow = {
  conversationId: string;
  /** Masked on the server. The customer's phone number never reaches here. */
  maskedLabel: string;
  status: string;
  lastMessageAtMs: number;
  lastMessagePreview: string;
  lastMessageType: string;
  messageCount: number;
  unread: boolean;
  customerId: string;
  orderId: string;
  /** Who has it ("" = nobody), its labels, and when it was last marked done. */
  assigneeUid?: string;
  labels?: string[];
  closedAtMs?: number;
  /** A linked customer's name, from this workspace's own records, when there is one. */
  customerName?: string;
  /**
   * What the stored channel value MEANS, decided on the server.
   *
   * Three answers that one string used to carry: the DISPLAY NAME a person
   * reads ("WhatsApp"), the ROLE the value is playing (`customer_inbox` — a
   * conversation with a stranger, not the operator command channel that spells
   * itself the same way), and the PROVIDER, which is the row's own field and is
   * still undecided between Meta and Twilio. The browser re-derives none of it;
   * `functions/channels/channelVocabulary.js` is the one place it is read.
   *
   * Optional because a row written before the server started answering carries
   * none of them, and an absent answer must not render as a confident one.
   */
  channelDisplayName?: string;
  channelRole?: string;
  channelMedium?: string;
  /** Set when the stored token does not resolve at this site. Honest, not blank. */
  channelUnreadable?: string;
  providerId?: string;
  providerDisplayName?: string;
  /** False while nobody has chosen a provider — which is the product's real state. */
  providerDecided?: boolean;
};

/**
 * What a screen may offer for a file a customer sent. `kind` comes from the
 * server's one media policy: "image" and "document" can be opened here,
 * "unsupported" cannot. No provider id, no address — the file is reached only
 * through `openCustomerInboxMedia`.
 */
export type CustomerInboxMedia = {
  kind: "image" | "document" | "unsupported";
  mimeType: string;
  /** 0 when the provider did not say. */
  sizeBytes: number;
  filename: string | null;
  /**
   * True only for a photo or a PDF while opening files is switched on (the
   * server's appConfig switch, release P3). Absent or false: no button.
   */
  openable?: boolean;
};

/** One message as `conversationDetailRow` sends it. */
export type CustomerInboxMessage = {
  messageId: string;
  direction: "inbound" | "outbound";
  senderClass: string;
  messageType: string;
  text: string | null;
  media: CustomerInboxMedia | null;
  interactive: unknown | null;
  /**
   * §8.5: a stranger's words are data, not instructions and not trusted copy.
   * The renderer marks them, so the flag has to survive the trip.
   */
  untrusted: boolean;
  receivedAtMs: number;
  /**
   * Outbound only (empty on a customer's message): how far the reply got —
   * sending, sent, delivered, read, failed, or suppressed when a test
   * environment stopped it. Moves forward only; the server applies the
   * provider's callbacks on a ladder, so a late "sent" never overwrites "read".
   */
  deliveryStatus: string;
  /** Set when deliveryStatus is "failed": permission, auth, transient, … */
  errorClass: string;
};

/**
 * Whether a free-form reply may go now, as the server read it when the thread
 * was opened. `none` means the customer never opened one on this number.
 * The server refuses a reply outside the window regardless; this is so the
 * screen can say so before somebody types.
 */
export type CustomerInboxReplyWindow = {
  state: "open" | "closed" | "none";
  closesAtMs: number;
  reason: string;
};

export type CustomerInboxThread = CustomerInboxRow & {
  messages: CustomerInboxMessage[];
  /** Null when the server predates the window field; the screen then says only the general rule. */
  replyWindow?: CustomerInboxReplyWindow | null;
};

export async function loadCustomerInboxConversations(
  companyId: string,
  limit?: number
): Promise<CustomerInboxRow[]> {
  const call = httpsCallable<{ companyId: string; limit?: number }, { ok: boolean; conversations: CustomerInboxRow[] }>(
    functions,
    "listCustomerInboxConversations"
  );
  const response = await call({ companyId, ...(limit ? { limit } : {}) });
  return response.data?.conversations ?? [];
}

export type CustomerInboxFilters = {
  status?: "open" | "closed" | "all";
  assignee?: "anyone" | "me" | "unassigned";
  label?: string;
  query?: string;
  unreadOnly?: boolean;
};

export type CustomerInboxMember = { uid: string; name: string };

/** The list, narrowed on the server, with the people a conversation can be given to. */
export async function loadCustomerInboxList(
  companyId: string,
  filters: CustomerInboxFilters
): Promise<{ conversations: CustomerInboxRow[]; assignableMembers: CustomerInboxMember[] }> {
  const call = httpsCallable<
    { companyId: string; filters: CustomerInboxFilters },
    { ok: boolean; conversations: CustomerInboxRow[]; assignableMembers?: CustomerInboxMember[] }
  >(functions, "listCustomerInboxConversations");
  const response = await call({ companyId, filters });
  return { conversations: response.data?.conversations ?? [], assignableMembers: response.data?.assignableMembers ?? [] };
}

/** Mark a conversation done, or open it again. */
export async function setCustomerInboxStatus(companyId: string, conversationId: string, status: "open" | "closed"): Promise<void> {
  await withWebSyncStatus(async () => {
    await httpsCallable(functions, "setCustomerInboxConversationStatus")({ companyId, conversationId, status });
  }, "Saving to cloud.");
}

/** Give a conversation to one member ("" = nobody). The server checks who may have it. */
export async function assignCustomerInbox(companyId: string, conversationId: string, assigneeUid: string): Promise<void> {
  await withWebSyncStatus(async () => {
    await httpsCallable(functions, "assignCustomerInboxConversation")({ companyId, conversationId, assigneeUid });
  }, "Saving to cloud.");
}

/** Replace a conversation's labels; the server normalises them and answers what it stored. */
export async function setCustomerInboxLabels(companyId: string, conversationId: string, labels: string[]): Promise<string[]> {
  return withWebSyncStatus(async () => {
    const response = await httpsCallable<{ companyId: string; conversationId: string; labels: string[] }, { ok: boolean; labels: string[] }>(
      functions, "setCustomerInboxConversationLabels"
    )({ companyId, conversationId, labels });
    return response.data?.labels ?? [];
  }, "Saving to cloud.");
}

export async function loadCustomerInboxThread(
  companyId: string,
  conversationId: string,
  messageLimit?: number
): Promise<CustomerInboxThread | null> {
  const call = httpsCallable<
    { companyId: string; conversationId: string; messageLimit?: number },
    { ok: boolean; conversation: CustomerInboxThread; replyWindow?: CustomerInboxReplyWindow }
  >(functions, "readCustomerInboxConversation");
  const response = await call({ companyId, conversationId, ...(messageLimit ? { messageLimit } : {}) });
  const conversation = response.data?.conversation ?? null;
  return conversation ? { ...conversation, replyWindow: response.data?.replyWindow ?? null } : null;
}

/**
 * Mark it read for whoever is signed in.
 *
 * The uid is never sent: the server takes it from the verified request, so a
 * client cannot mark another person's thread read. Wrapped in the sync-status
 * banner because it does write, even though it writes only one field.
 */
export async function markCustomerInboxThreadRead(companyId: string, conversationId: string): Promise<void> {
  await withWebSyncStatus(async () => {
    const call = httpsCallable<{ companyId: string; conversationId: string }, { ok: boolean }>(
      functions,
      "markCustomerInboxConversationRead"
    );
    await call({ companyId, conversationId });
  }, "Saving to cloud.");
}

/**
 * Attach a conversation to a customer and/or an order.
 *
 * An operator action, and only ever that. A message naming an order number is a
 * claim by a stranger; the server refuses to act on one, and this is the
 * deliberate human path that exists instead.
 */
export async function linkCustomerInboxThread(
  companyId: string,
  conversationId: string,
  link: { customerId?: string; orderId?: string }
): Promise<void> {
  await withWebSyncStatus(async () => {
    const call = httpsCallable<
      { companyId: string; conversationId: string; customerId?: string; orderId?: string },
      { ok: boolean }
    >(functions, "linkCustomerInboxConversation");
    await call({
      companyId,
      conversationId,
      ...(link.customerId ? { customerId: link.customerId } : {}),
      ...(link.orderId ? { orderId: link.orderId } : {})
    });
  }, "Saving to cloud.");
}

/**
 * Erase one customer's conversation — the thread, its messages and its reply
 * window — from this workspace. Owner only, and confirmed in the request; the
 * server checks both again. What it cannot reach (the customer's phone,
 * WhatsApp's own copy, backups) is said by the screen that asks.
 */
export async function deleteCustomerInboxThread(companyId: string, conversationId: string): Promise<number> {
  return withWebSyncStatus(async () => {
    const call = httpsCallable<{ companyId: string; conversationId: string; confirm: true }, { ok: boolean; messages: number }>(
      functions,
      "deleteCustomerInboxConversation"
    );
    const response = await call({ companyId, conversationId, confirm: true });
    return Number(response.data?.messages) || 0;
  }, "Saving to cloud.");
}

/**
 * What opening a customer's file came to. "scanning" until the malware scan
 * has answered; "ready" carries the file as a Blob that belongs to this tab
 * alone; "blocked" is a file the scan refused, "unverified" one it could not
 * check — both stay shut. "refused" carries the server's reason word.
 */
export type CustomerInboxMediaAnswer =
  | { state: "scanning" | "blocked" | "unverified"; kind: string }
  | { state: "ready"; kind: string; mimeType: string; sizeBytes: number; blob: Blob }
  | { state: "refused"; reason: string };

/**
 * Open one file a customer sent. The first call makes the server fetch it,
 * store it privately and have it scanned, and answers "scanning"; the bytes
 * come back only once the scan says clean. They arrive as data, never as an
 * address, so nothing on the page outlives the check that let it through.
 */
export async function openCustomerInboxMedia(
  companyId: string,
  conversationId: string,
  messageId: string
): Promise<CustomerInboxMediaAnswer> {
  const call = httpsCallable<
    { companyId: string; conversationId: string; messageId: string; client: "web" },
    { ok: boolean; state: string; kind?: string; mimeType?: string; sizeBytes?: number; base64?: string }
  >(functions, "openCustomerInboxMedia");
  try {
    const { data } = await call({ companyId, conversationId, messageId, client: "web" });
    if (data.state === "ready" && typeof data.base64 === "string") {
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const mimeType = String(data.mimeType || "application/octet-stream");
      return { state: "ready", kind: String(data.kind || ""), mimeType, sizeBytes: bytes.length, blob: new Blob([bytes], { type: mimeType }) };
    }
    if (data.state === "blocked" || data.state === "unverified") return { state: data.state, kind: String(data.kind || "") };
    return { state: "scanning", kind: String(data.kind || "") };
  } catch (error) {
    const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;
    if (typeof reason === "string" && reason) return { state: "refused", reason };
    throw error;
  }
}

export type CustomerInboxReplyResult = {
  ok: boolean;
  duplicate: boolean;
  messageId: string;
  deliveryStatus: string;
};

/**
 * Reply to the customer on WhatsApp. `replyId` is made once per reply by the
 * caller and reused on a retry: the server claims it before anything is sent,
 * so a second press with the same id is the same reply, never a second message.
 */
export async function sendCustomerInboxReply(
  companyId: string,
  conversationId: string,
  replyId: string,
  body: string
): Promise<CustomerInboxReplyResult> {
  return withWebSyncStatus(async () => {
    const call = httpsCallable<
      { companyId: string; conversationId: string; replyId: string; body: string },
      CustomerInboxReplyResult
    >(functions, "sendCustomerInboxReply");
    const response = await call({ companyId, conversationId, replyId, body });
    return response.data;
  }, "Sending on WhatsApp.");
}

/** A reply id: unique per reply, safe as a document id. */
export function newCustomerInboxReplyId(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `r${random}`;
}

/** One line (a number or an account) a workspace's customers write to. */
export type CustomerChannelLine = {
  channel: string;
  provider: string;
  state: "pending" | "connected" | "reconnect_required";
  displayLabel: string;
  lastInboundAtMs: number;
  lastOutboundAtMs: number;
  lastErrorClass: string;
  lastErrorAtMs: number;
  /** "signup": the business connected it and the owner can renew or disconnect it; "operator": NivaDesk routed it. */
  connectedVia?: "signup" | "operator";
};

/** A channel card: WhatsApp or Instagram, always both, each with its measured state. */
export type CustomerChannelCard = {
  channel: "whatsapp" | "instagram";
  state: "not_connected" | "pending" | "connected" | "reconnect_required" | "unavailable";
  reason: string;
  connections: CustomerChannelLine[];
};

export type CustomerChannelStatus = { cards: CustomerChannelCard[]; connected: number };

/**
 * The workspace's customer channels, as the server measured them. Read access
 * is the inbox's own gate; a workspace without Messages is told which plan has it.
 */
export async function loadCustomerChannelStatus(companyId: string): Promise<CustomerChannelStatus> {
  const call = httpsCallable<{ companyId: string }, { ok: boolean; cards: CustomerChannelCard[]; connected: number }>(
    functions,
    "getCustomerChannelStatus"
  );
  const response = await call({ companyId });
  return { cards: response.data?.cards ?? [], connected: Number(response.data?.connected) || 0 };
}

/** The server's reason word for a refused connect or disconnect, or "" for any other failure. */
function refusalReason(error: unknown): string {
  const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;
  return typeof reason === "string" ? reason : "";
}

export type ChannelChangeResult = { ok: true } | { ok: false; reason: string };

/**
 * Hand the sign-up pop-up's answer to the server, at once: the code dies in 30
 * seconds. The server exchanges it and checks the number against the account
 * the code opens; this only carries the three values.
 */
export async function connectWhatsAppNumber(
  companyId: string,
  signup: { code: string; phoneNumberId: string; wabaId: string }
): Promise<ChannelChangeResult> {
  const call = httpsCallable<{ companyId: string; code: string; phoneNumberId: string; wabaId: string }, { ok: boolean }>(
    functions,
    "connectWhatsAppNumber"
  );
  try {
    await call({ companyId, ...signup });
    return { ok: true };
  } catch (error) {
    const reason = refusalReason(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}

/** Take the workspace's own WhatsApp number off NivaDesk. Owner only, confirmed; the server checks both. */
export async function disconnectWhatsAppNumber(companyId: string): Promise<ChannelChangeResult & { unsubscribed?: boolean }> {
  const call = httpsCallable<{ companyId: string; confirm: true }, { ok: boolean; unsubscribed: boolean }>(
    functions,
    "disconnectWhatsAppNumber"
  );
  try {
    const response = await call({ companyId, confirm: true });
    return { ok: true, unsubscribed: Boolean(response.data?.unsubscribed) };
  } catch (error) {
    const reason = refusalReason(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}
