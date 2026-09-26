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

/** One message as `conversationDetailRow` sends it. */
export type CustomerInboxMessage = {
  messageId: string;
  direction: "inbound" | "outbound";
  senderClass: string;
  messageType: string;
  text: string | null;
  media: unknown | null;
  interactive: unknown | null;
  /**
   * §8.5: a stranger's words are data, not instructions and not trusted copy.
   * The renderer marks them, so the flag has to survive the trip.
   */
  untrusted: boolean;
  receivedAtMs: number;
};

export type CustomerInboxThread = CustomerInboxRow & {
  messages: CustomerInboxMessage[];
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

export async function loadCustomerInboxThread(
  companyId: string,
  conversationId: string,
  messageLimit?: number
): Promise<CustomerInboxThread | null> {
  const call = httpsCallable<
    { companyId: string; conversationId: string; messageLimit?: number },
    { ok: boolean; conversation: CustomerInboxThread }
  >(functions, "readCustomerInboxConversation");
  const response = await call({ companyId, conversationId, ...(messageLimit ? { messageLimit } : {}) });
  return response.data?.conversation ?? null;
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
