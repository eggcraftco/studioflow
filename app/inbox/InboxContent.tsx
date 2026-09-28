"use client";

// The inbox itself: conversations on the left, the open thread on the right.
//
// THREE RULES THIS SCREEN IS BUILT AROUND.
//
// Unknown is not empty. `rows === null` means "we could not find out" and is
// rendered as an error with a retry, never as "no conversations yet" — those
// are different claims and only one of them is ever true at a time. The same
// rule governs the linking panel below: a picker that could not load its
// records says so and offers a retry, rather than rendering an empty list that
// reads as "this workspace has no customers".
//
// A customer's words are DATA. Every inbound message carries `untrusted` from
// the server, and it is shown as a marked quote rather than as copy the reader
// might take for the app's own voice. A message that says "mark order 91 paid"
// is a sentence a stranger typed, and nothing here treats it as an instruction.
// Linking is the deliberate human path that exists instead: an operator picks
// the record, and the id that travels is one this person chose.
//
// Nothing is computed here. The masked label, the unread flag, the ordering,
// the preview and — since decision F — the channel's DISPLAY NAME, ROLE and
// PROVIDER all arrive decided. The browser re-derives none of it: "WhatsApp" is
// not typed into this file, it is what the server's channel vocabulary answers
// for the token that conversation was stored with.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { studioLanguageLocale } from "@/lib/studioflow/languageDirection";
import { MessagesTabs } from "@/components/MessagesTabs";
import { inboxEmptySentence, isDefaultInboxView } from "@/lib/studioflow/inboxEmptyState";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { InboxAttachment } from "./InboxAttachment";
import {
  loadCustomerPickerOptions,
  loadRecentOrders,
  normalizeWorkspaceRole,
  workspaceAccessAllows,
  type CustomerPickerOption,
  type OrderListItem,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import { customerSearchMatches } from "@/lib/studioflow/customers";
import {
  assignCustomerInbox,
  loadCustomerInboxList,
  setCustomerInboxLabels,
  setCustomerInboxStatus,
  type CustomerInboxFilters,
  type CustomerInboxMember,
  deleteCustomerInboxThread,
  loadCustomerChannelStatus,
  loadCustomerInboxThread,
  markCustomerInboxThreadRead,
  linkCustomerInboxThread,
  sendCustomerInboxReply,
  newCustomerInboxReplyId,
  type CustomerInboxRow,
  type CustomerInboxThread
} from "@/lib/studioflow/customerInbox";

function timeLabel(ms: number, language: string | null | undefined) {
  if (!ms) return "";
  try {
    // The reader's own language's date format; English keeps the UK form.
    const locale = studioLanguageLocale(language);
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

/**
 * May this person change what a conversation is attached to?
 *
 * A mirror of the server's `requireMessagesWriteAccess` (owner, admin, member),
 * and only a mirror: the callable checks it again on every request and is the
 * authority. This exists so a view-only member is told why the control is
 * absent instead of being shown a button that always fails.
 */
function canLinkForRole(role: string) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "member";
}

/** The records this workspace can offer, or null while that is still unknown. */
type LinkOptions = {
  customers: CustomerPickerOption[];
  orders: OrderListItem[];
};

/**
 * Is the free-form reply window shut, as far as the screen can tell?
 * Unknown (an older server that sends no window) is NOT shut: the screen then
 * shows the composer with the general rule, and the server still refuses late.
 */
function replyWindowShut(replyWindow: CustomerInboxThread["replyWindow"], nowMs: number): boolean {
  if (!replyWindow) return false;
  if (replyWindow.state === "open") return Boolean(replyWindow.closesAtMs) && nowMs >= replyWindow.closesAtMs;
  return true;
}

/** Instagram's limit for a text message: 1000 bytes of UTF-8, not characters (Meta). The server checks it too. */
const INSTAGRAM_MAX_REPLY_BYTES = 1000;

/** Why an Instagram thread offers no composer, from the server's word. Keys: the caller translates. */
function instagramReplyNotice(reason: string | undefined): string {
  switch (reason) {
    case "instagram_not_connected": return "Connect this workspace's Instagram account in Settings to reply from NivaDesk.";
    case "instagram_reconnect": return "Instagram needs the account connected again before NivaDesk can reply. Open Settings, Customer Channels.";
    default: return "Replies on Instagram are not available in NivaDesk yet. Answer in the Instagram app.";
  }
}

/**
 * What a reply's delivery status says under the bubble. Keys, not sentences:
 * the caller translates. Unknown or empty says nothing rather than guessing.
 */
function deliveryLabel(status: string): string {
  switch (status) {
    case "sending": return "Sending reply…";
    case "sent": return "Sent";
    case "delivered": return "Delivered to phone";
    case "read": return "Read by the customer";
    case "failed": return "Not delivered";
    case "suppressed": return "Not sent (test environment)";
    default: return "";
  }
}

/**
 * What a list row says when the last message was a file with no words. Older
 * rows stored the file's MIME type as the preview ("audio/ogg; codecs=opus");
 * that is a machine's word, so it is replaced here by the kind, translated.
 */
const MIME_LIKE = /^[a-z]+\/[a-z0-9.+-]+(\s*;.*)?$/i;
function mediaKindWord(messageType: string): string {
  switch (messageType) {
    case "image": return "Photo";
    case "document": return "Document";
    case "audio": return "Voice message";
    default: return "Attachment";
  }
}
function rowPreview(row: CustomerInboxRow, t: (text: string) => string): string {
  const stored = row.lastMessagePreview || "";
  if (stored && !MIME_LIKE.test(stored)) return stored;
  if (["image", "document", "audio"].includes(row.lastMessageType)) return t(mediaKindWord(row.lastMessageType));
  return stored;
}

/** Why a reply failed, in words a person can act on. */
function failureReason(errorClass: string, medium = ""): string {
  if (medium === "instagram") {
    switch (errorClass) {
      case "permission": return "The 24-hour window may have closed, or this person cannot receive messages from this account.";
      case "auth": return "The Instagram connection needs to be connected again.";
      case "transient": return "Instagram had a temporary problem. Try again in a moment.";
      default: return "Instagram did not deliver this reply.";
    }
  }
  switch (errorClass) {
    case "permission": return "The 24-hour window may have closed, or this number cannot receive WhatsApp messages.";
    case "auth": return "The WhatsApp connection needs to be reconnected.";
    case "transient": return "WhatsApp had a temporary problem. Try again in a moment.";
    default: return "WhatsApp did not deliver this reply.";
  }
}

export function InboxContent({
  workspace,
  language
}: {
  workspace: WorkspaceContext;
  language: string | null | undefined;
}) {
  const { user } = useAuth();
  const t = useCallback((text: string) => studioT(text, language), [language]);

  // null means UNKNOWN. See the header.
  const [rows, setRows] = useState<CustomerInboxRow[] | null>(null);
  // How the list is narrowed. Applied on the server; the search box waits for
  // a pause in typing before it asks.
  const [filters, setFilters] = useState<CustomerInboxFilters>({ status: "open", assignee: "anyone", label: "", query: "", unreadOnly: false });
  // Whether the workspace has any customer conversation in any status. Asked only when the default Open list comes
  // back empty, so an empty Open list can tell "No open conversations" from "No customer messages yet"
  // (lib/studioflow/inboxEmptyState.ts). null = not asked, or the check failed.
  const [anyConversation, setAnyConversation] = useState<boolean | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [members, setMembers] = useState<CustomerInboxMember[]>([]);
  const [triageBusy, setTriageBusy] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.query === queryDraft.trim() ? current : { ...current, query: queryDraft.trim() })), 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);
  const [listError, setListError] = useState("");
  const [openId, setOpenId] = useState("");
  const [thread, setThread] = useState<CustomerInboxThread | null>(null);
  // Whether the WhatsApp line needs renewing, read once per workspace. A failure
  // to read it hides the banner rather than inventing one.
  const [whatsappNeedsRenewal, setWhatsappNeedsRenewal] = useState(false);
  // The channels this workspace has, for the Messages tab's channel name.
  const [statusChannels, setStatusChannels] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    loadCustomerChannelStatus(workspace.id)
      .then((status) => {
        if (!alive) return;
        setWhatsappNeedsRenewal(status.cards.some((card) => card.channel === "whatsapp" && card.state === "reconnect_required"));
        setStatusChannels(status.cards.filter((card) => card.state !== "not_connected" && card.state !== "unavailable").map((card) => card.channel));
      })
      .catch(() => { if (alive) setWhatsappNeedsRenewal(false); });
    return () => { alive = false; };
  }, [workspace.id]);
  // Re-read once a minute so a window that closes while the thread is open
  // closes on screen too; the server refuses a late reply either way.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [threadError, setThreadError] = useState("");
  const [busy, setBusy] = useState(false);

  // The linking panel. `options === null` is the same "unknown" as `rows`.
  const [linkOpen, setLinkOpen] = useState(false);
  const [options, setOptions] = useState<LinkOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [search, setSearch] = useState("");
  const [customerChoice, setCustomerChoice] = useState("");
  const [orderChoice, setOrderChoice] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  // The reply box. `pendingReplyId` is made once per reply and kept until the
  // server accepts it, so "Try again" resends the SAME reply id and the server
  // answers it as the same reply rather than sending the customer a second one.
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState("");
  const pendingReplyId = useRef("");

  // Discards an answer that arrives after the workspace moved on, so a switched
  // workspace never shows the previous one's conversations.
  const ticket = useRef(0);

  const mayLink = canLinkForRole(workspace.role);
  // An Instagram thread is answered on Instagram, and only while the server says
  // the workspace's account can send (replyChannel); a server without the field
  // reads as not answerable, as before Instagram replies existed.
  const isInstagramThread = thread?.channelMedium === "instagram";
  const instagramReady = isInstagramThread && thread?.replyChannel?.available === true;
  const replyBytes = isInstagramThread ? new TextEncoder().encode(replyText.trim()).length : 0;
  // Erasing a customer's conversation is the owner's alone; the server checks again.
  const mayErase = normalizeWorkspaceRole(workspace.role) === "owner";
  const [eraseBusy, setEraseBusy] = useState(false);
  const [eraseNotice, setEraseNotice] = useState("");
  // The picker reuses the app's OWN list paths — the Quick Create customer
  // picker's query and the Orders screen's loader — so it offers exactly what
  // this member is already entitled to see, under the same access keys and the
  // same assigned-projects-only scope. It does not invent a query, and it
  // cannot widen one.
  const maySeeCustomers = workspaceAccessAllows(workspace.memberAccess, "customers");
  const maySeeOrders = workspaceAccessAllows(workspace.memberAccess, "orders");

  const loadList = useCallback(async () => {
    const mine = ++ticket.current;
    setListError("");
    try {
      const next = await loadCustomerInboxList(workspace.id, filters);
      if (mine !== ticket.current) return;
      let anyAtAll: boolean | null = null;
      if (next.conversations.length === 0 && isDefaultInboxView(filters)) {
        // One more question, and only for an empty Open list: is there any conversation at all? The list
        // keeps "Loading…" until the answer, so the sentence does not change under the reader.
        try {
          const all = await loadCustomerInboxList(workspace.id, { status: "all", assignee: "anyone", label: "", query: "", unreadOnly: false });
          if (mine !== ticket.current) return;
          anyAtAll = all.conversations.length > 0;
        } catch {
          if (mine !== ticket.current) return;
          anyAtAll = null;
        }
      }
      setAnyConversation(anyAtAll);
      setRows(next.conversations);
      setMembers(next.assignableMembers);
    } catch (failure) {
      if (mine !== ticket.current) return;
      setRows(null);
      setListError(friendlyErrorMessage(failure, t));
    }
  }, [workspace.id, filters, t]);

  useEffect(() => {
    setRows(null);
    setOpenId("");
    setThread(null);
    // The records belong to the workspace that was open, so they go with it.
    setOptions(null);
    setOptionsError("");
    setLinkOpen(false);
    setCustomerChoice("");
    setOrderChoice("");
    setLinkError("");
    setReplyText("");
    setReplyError("");
    pendingReplyId.current = "";
    void loadList();
  }, [loadList]);

  const openThread = useCallback(async (conversationId: string) => {
    const mine = ++ticket.current;
    if (conversationId !== openId) {
      setReplyText("");
      setReplyError("");
      pendingReplyId.current = "";
    }
    setOpenId(conversationId);
    setThread(null);
    setThreadError("");
    setEraseNotice("");
    setBusy(true);
    try {
      const next = await loadCustomerInboxThread(workspace.id, conversationId);
      if (mine !== ticket.current) return;
      setThread(next);
      // Opening it is what marks it read, and only for the person who opened
      // it: the server takes the uid from the verified request.
      if (next) {
        await markCustomerInboxThreadRead(workspace.id, conversationId);
        if (mine === ticket.current) {
          setRows((current) =>
            current ? current.map((row) => (row.conversationId === conversationId ? { ...row, unread: false } : row)) : current
          );
        }
      }
    } catch (failure) {
      if (mine !== ticket.current) return;
      setThread(null);
      setThreadError(friendlyErrorMessage(failure, t));
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  }, [workspace.id, openId, t]);

  // A notification opens one conversation: /inbox?conversation=<id>, the keyed
  // id the list rows already carry. Opened once per link, after the list has
  // loaded; the server decides whether this person may read it, exactly as it
  // does for a click in the list.
  const searchParams = useSearchParams();
  const linkedConversation = String(searchParams?.get("conversation") || "");
  const linkHandled = useRef("");
  useEffect(() => {
    if (rows === null || !/^[A-Za-z0-9_-]{8,160}$/.test(linkedConversation)) return;
    if (linkHandled.current === linkedConversation) return;
    linkHandled.current = linkedConversation;
    void openThread(linkedConversation);
  }, [rows, linkedConversation, openThread]);

  /**
   * The records this workspace can offer.
   *
   * ONE WORKSPACE, ALWAYS. Both loaders take `workspace.id` and filter on
   * `companyId`, so another workspace's customers and orders are not merely
   * hidden from the list — they were never fetched, and the rules would refuse
   * them if they had been. `loadRecentOrders` is handed the workspace and the
   * uid as well, which is what applies the assigned-projects-only scope: a
   * member who only sees their own projects can only link one of those.
   */
  const loadOptions = useCallback(async () => {
    setOptionsError("");
    setOptions(null);
    try {
      const [customers, orders] = await Promise.all([
        maySeeCustomers ? loadCustomerPickerOptions(workspace.id) : Promise.resolve([] as CustomerPickerOption[]),
        maySeeOrders ? loadRecentOrders(workspace.id, workspace, user?.uid ?? "") : Promise.resolve([] as OrderListItem[])
      ]);
      setOptions({ customers, orders });
    } catch (failure) {
      // Unknown is not empty: an empty picker would read as "this workspace has
      // no customers", which is a different and possibly false claim.
      setOptions(null);
      setOptionsError(friendlyErrorMessage(failure, t));
    }
  }, [workspace, user?.uid, maySeeCustomers, maySeeOrders, t]);

  const openLinkPanel = useCallback(() => {
    setLinkOpen(true);
    setLinkError("");
    setCustomerChoice(thread?.customerId ?? "");
    setOrderChoice(thread?.orderId ?? "");
    if (!options && !optionsError) void loadOptions();
  }, [thread?.customerId, thread?.orderId, options, optionsError, loadOptions]);

  /**
   * Save the link the operator chose.
   *
   * A REFUSAL IS RENDERED, NEVER SWALLOWED. The server refuses a record that is
   * not this workspace's — the picker cannot offer one, but the id travels in
   * the request and the rule is the server's — and that sentence is shown here
   * with a retry, rather than a silent no-op or a panel that just closes.
   */
  const submitLink = useCallback(async () => {
    if (!openId) return;
    if (!customerChoice && !orderChoice) return;
    setLinkBusy(true);
    setLinkError("");
    try {
      await linkCustomerInboxThread(workspace.id, openId, {
        ...(customerChoice ? { customerId: customerChoice } : {}),
        ...(orderChoice ? { orderId: orderChoice } : {})
      });
      setLinkOpen(false);
      // Read it back rather than patching the screen from what was sent: what
      // the conversation is linked to is the server's answer, not this form's.
      await loadList();
      await openThread(openId);
    } catch (failure) {
      setLinkError(friendlyErrorMessage(failure, t));
    } finally {
      setLinkBusy(false);
    }
  }, [openId, customerChoice, orderChoice, workspace.id, loadList, openThread, t]);

  // One path for every triage change: do it, then read the thread and the list
  // back, so the screen shows what the server stored rather than what was clicked.
  const runTriage = useCallback(async (change: () => Promise<unknown>) => {
    if (!openId) return;
    setTriageBusy(true);
    try {
      await change();
      await openThread(openId);
      await loadList();
    } catch (failure) {
      setThreadError(friendlyErrorMessage(failure, t));
    } finally {
      setTriageBusy(false);
    }
  }, [openId, openThread, loadList, t]);

  const eraseThread = useCallback(async () => {
    if (!openId || eraseBusy) return;
    // Deleting here does not reach the provider: say where the conversation stays.
    const confirmText = isInstagramThread
      ? t("Delete this conversation and all its messages from NivaDesk? This cannot be undone. The conversation stays in Instagram, for the customer and for this account.")
      : t("Delete this conversation and all its messages from NivaDesk? This cannot be undone. The customer's phone and WhatsApp keep their own copies.");
    if (!window.confirm(confirmText)) return;
    setEraseBusy(true);
    setEraseNotice("");
    try {
      await deleteCustomerInboxThread(workspace.id, openId);
      setOpenId("");
      setThread(null);
      setEraseNotice(t("Conversation deleted."));
      await loadList();
    } catch (failure) {
      setThreadError(friendlyErrorMessage(failure, t));
    } finally {
      setEraseBusy(false);
    }
  }, [openId, eraseBusy, isInstagramThread, workspace.id, loadList, t]);

  const submitReply = useCallback(async () => {
    const body = replyText.trim();
    if (!openId || !body) return;
    if (!pendingReplyId.current) pendingReplyId.current = newCustomerInboxReplyId();
    setReplyBusy(true);
    setReplyError("");
    try {
      await sendCustomerInboxReply(workspace.id, openId, pendingReplyId.current, body);
      pendingReplyId.current = "";
      setReplyText("");
      // Read it back: the thread shows what the server stored, not what was typed.
      await openThread(openId);
      await loadList();
    } catch (failure) {
      setReplyError(friendlyErrorMessage(failure, t));
    } finally {
      setReplyBusy(false);
    }
  }, [openId, replyText, workspace.id, openThread, loadList, t]);

  const customerMatches = useMemo(
    // One search rule for the whole app: the Customers page and the Quick
    // Create picker call this same helper.
    () => (options ? options.customers.filter((option) => customerSearchMatches(search, [option.name])) : []),
    [options, search]
  );
  const orderMatches = useMemo(
    () => (options
      ? options.orders.filter((order) => customerSearchMatches(search, [order.designName, order.customerName, order.watchRef]))
      : []),
    [options, search]
  );

  const linkedCustomerName = useMemo(() => {
    if (!thread?.customerId) return "";
    return options?.customers.find((option) => option.id === thread.customerId)?.name ?? "";
  }, [thread?.customerId, options]);
  const linkedOrderName = useMemo(() => {
    if (!thread?.orderId) return "";
    const order = options?.orders.find((entry) => entry.id === thread.orderId);
    return order ? order.designName : "";
  }, [thread?.orderId, options]);

  return (
    <div className="inbox-page">
      <div className="inbox-layout">
        <aside className="inbox-list" aria-label={t("Conversations")}>
          <MessagesTabs
            active="customers"
            language={language}
            // The tab counts every open unread conversation; while the list is
            // narrowed, the tab loads its own count instead of the filtered one.
            customerUnread={rows && filters.status === "open" && filters.assignee === "anyone" && !filters.label && !filters.query && !filters.unreadOnly
              ? rows.filter((row) => row.unread).length
              : undefined}
            companyId={workspace.id}
            customerChannels={[...statusChannels, ...(rows ?? []).map((row) => row.channelMedium || "")]}
          />
          <header className="inbox-head">
            <h1>{t("Customers")}</h1>
            <p className="inbox-sub">{t("Messages your customers sent to the workshop.")}</p>
          </header>
          <div className="inbox-toolbar" role="search">
            <input
              type="search"
              className="inbox-search"
              value={queryDraft}
              maxLength={60}
              placeholder={t("Search conversations")}
              aria-label={t("Search conversations")}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <div className="inbox-filter-row">
              <select
                aria-label={t("Conversation status")}
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as CustomerInboxFilters["status"] }))}
              >
                <option value="open">{t("Open conversations")}</option>
                <option value="closed">{t("Closed conversations")}</option>
                <option value="all">{t("All conversations")}</option>
              </select>
              <select
                aria-label={t("Assigned to")}
                value={filters.assignee}
                onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value as CustomerInboxFilters["assignee"] }))}
              >
                <option value="anyone">{t("Anyone's")}</option>
                <option value="me">{t("Assigned to me")}</option>
                <option value="unassigned">{t("Unassigned")}</option>
              </select>
              <label className="inbox-unread-only">
                <input
                  type="checkbox"
                  checked={Boolean(filters.unreadOnly)}
                  onChange={(event) => setFilters((current) => ({ ...current, unreadOnly: event.target.checked }))}
                />
                {t("Unread only")}
              </label>
            </div>
            {filters.label ? (
              <button type="button" className="inbox-chip inbox-chip-active" onClick={() => setFilters((current) => ({ ...current, label: "" }))}>
                {filters.label} ×
              </button>
            ) : null}
          </div>
          {listError ? (
            // A refused read is not an empty list, so the empty state below does
            // not render underneath this.
            <div className="inbox-notice" role="alert">
              <p>{listError}</p>
              <button type="button" onClick={() => void loadList()}>{t("Try again")}</button>
            </div>
          ) : rows === null ? (
            <p className="inbox-notice">{t("Loading…")}</p>
          ) : rows.length === 0 ? (
            <p className="inbox-notice">{t(inboxEmptySentence(filters, anyConversation))}</p>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.conversationId}>
                  <button
                    type="button"
                    className={row.conversationId === openId ? "inbox-row inbox-row-open" : "inbox-row"}
                    onClick={() => void openThread(row.conversationId)}
                  >
                    <span className="inbox-row-label">
                      {/* Isolated LTR: in an RTL page "••••0111" would otherwise render reversed. */}
                      {row.maskedLabel ? <bdi dir="ltr">{row.maskedLabel}</bdi> : t("Unknown sender")}
                      {/* A channel other than WhatsApp says so: two customers can share four digits. */}
                      {row.channelMedium && row.channelMedium !== "whatsapp" && row.channelDisplayName ? (
                        <span className="inbox-row-channel">{row.channelDisplayName}</span>
                      ) : null}
                      {row.unread ? <span className="inbox-unread" aria-label={t("Unread")}>●</span> : null}
                    </span>
                    <span className="inbox-row-preview" dir="auto">{rowPreview(row, t)}</span>
                    <span className="inbox-row-time">{timeLabel(row.lastMessageAtMs, language)}</span>
                    {(row.labels && row.labels.length) || row.assigneeUid || row.customerName ? (
                      <span className="inbox-row-meta">
                        {row.customerName ? <span className="inbox-row-customer" dir="auto">{row.customerName}</span> : null}
                        {row.assigneeUid ? (
                          <span className="inbox-row-assignee">{members.find((m) => m.uid === row.assigneeUid)?.name || t("Assigned")}</span>
                        ) : null}
                        {(row.labels || []).slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className="inbox-chip"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => { event.stopPropagation(); setFilters((current) => ({ ...current, label })); }}
                            onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); setFilters((current) => ({ ...current, label })); } }}
                          >
                            {label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="inbox-thread" aria-label={t("Conversation")}>
          {!openId ? (
            <>
              {eraseNotice ? <p className="inbox-notice success-copy" role="status">{eraseNotice}</p> : null}
              <p className="inbox-notice">{t("Choose a conversation to read it.")}</p>
            </>
          ) : threadError ? (
            <div className="inbox-notice" role="alert">
              <p>{threadError}</p>
              <button type="button" onClick={() => void openThread(openId)}>{t("Try again")}</button>
            </div>
          ) : busy || !thread ? (
            <p className="inbox-notice">{t("Loading…")}</p>
          ) : (
            <>
              <div className="inbox-thread-head">
                <strong>{thread.maskedLabel ? <bdi dir="ltr">{thread.maskedLabel}</bdi> : t("Unknown sender")}</strong>
                {/* The medium's display name, as the server's vocabulary reads
                    the stored token. Not typed here: the same five letters mean
                    three different things depending on where they are stored,
                    and only the server knows which site this row came from. */}
                {thread.channelDisplayName ? (
                  <span className="inbox-channel" data-channel-role={thread.channelRole || ""}>
                    {thread.channelDisplayName}
                  </span>
                ) : null}
                {/* Who carries it — a separate question, and still open between
                    Meta and Twilio. Shown only once something has decided. */}
                {thread.providerDecided && thread.providerDisplayName ? (
                  <span className="inbox-provider">{thread.providerDisplayName}</span>
                ) : null}
                {thread.customerId ? (
                  <span className="inbox-linked">
                    {t("Linked to a customer")}{linkedCustomerName ? `: ${linkedCustomerName}` : ""}
                  </span>
                ) : null}
                {thread.orderId ? (
                  <span className="inbox-linked">
                    {t("Linked to an order")}{linkedOrderName ? `: ${linkedOrderName}` : ""}
                  </span>
                ) : null}
                {mayLink && !linkOpen ? (
                  <button type="button" className="inbox-link-open" onClick={openLinkPanel}>
                    {t("Link this conversation")}
                  </button>
                ) : null}
                {mayErase ? (
                  <button type="button" className="inbox-erase" disabled={eraseBusy} onClick={() => void eraseThread()}>
                    {t("Delete conversation")}
                  </button>
                ) : null}
              </div>

              {mayLink ? (
                <div className="inbox-triage" aria-label={t("Conversation status")}>
                  <button
                    type="button"
                    className="inbox-status-toggle"
                    disabled={triageBusy}
                    onClick={() => void runTriage(() => setCustomerInboxStatus(workspace.id, openId, thread.status === "closed" ? "open" : "closed"))}
                  >
                    {thread.status === "closed" ? t("Reopen conversation") : t("Mark as done")}
                  </button>
                  <label className="inbox-assign">
                    {t("Assign to")}
                    <select
                      value={thread.assigneeUid || ""}
                      disabled={triageBusy}
                      onChange={(event) => { const value = event.target.value; void runTriage(() => assignCustomerInbox(workspace.id, openId, value)); }}
                    >
                      <option value="">{t("Nobody")}</option>
                      {members.map((member) => <option key={member.uid} value={member.uid}>{member.name}</option>)}
                    </select>
                  </label>
                  <div className="inbox-labels" aria-label={t("Conversation labels")}>
                    {(thread.labels || []).map((label) => (
                      <span key={label} className="inbox-chip">
                        {label}
                        <button
                          type="button"
                          aria-label={`${t("Remove label")} ${label}`}
                          disabled={triageBusy}
                          onClick={() => void runTriage(() => setCustomerInboxLabels(workspace.id, openId, (thread.labels || []).filter((l) => l !== label)))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      className="inbox-label-input"
                      value={labelDraft}
                      maxLength={24}
                      placeholder={t("Add a label")}
                      aria-label={t("Add a label")}
                      disabled={triageBusy}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || !labelDraft.trim()) return;
                        event.preventDefault();
                        const next = [...(thread.labels || []), labelDraft.trim()];
                        setLabelDraft("");
                        void runTriage(() => setCustomerInboxLabels(workspace.id, openId, next));
                      }}
                    />
                  </div>
                </div>
              ) : (thread.labels && thread.labels.length) || thread.assigneeUid ? (
                <div className="inbox-triage inbox-triage-readonly">
                  {thread.assigneeUid ? <span className="inbox-row-assignee">{members.find((m) => m.uid === thread.assigneeUid)?.name || t("Assigned")}</span> : null}
                  {(thread.labels || []).map((label) => <span key={label} className="inbox-chip">{label}</span>)}
                </div>
              ) : null}

              {linkOpen ? (
                <section className="inbox-link" aria-label={t("Link this conversation")}>
                  <div className="inbox-link-head">
                    <strong>{t("Link this conversation")}</strong>
                    <p>{t("Attach it to a customer or an order in this workspace.")}</p>
                    <p className="inbox-link-scope">{t("Only this workspace's customers and orders are offered.")}</p>
                  </div>

                  {!mayLink ? (
                    <p className="inbox-notice">
                      {t("Your role can read the inbox but cannot change what a conversation is linked to.")}
                    </p>
                  ) : optionsError ? (
                    // Unknown, not empty — and with a way back.
                    <div className="inbox-notice" role="alert">
                      <p>{optionsError}</p>
                      <button type="button" onClick={() => void loadOptions()}>{t("Try again")}</button>
                    </div>
                  ) : options === null ? (
                    <p className="inbox-notice">{t("Loading…")}</p>
                  ) : (
                    <>
                      <input
                        className="inbox-link-search"
                        type="search"
                        value={search}
                        placeholder={t("Search customers and orders")}
                        aria-label={t("Search customers and orders")}
                        onChange={(event) => setSearch(event.target.value)}
                      />

                      <div className="inbox-link-columns">
                        <div className="inbox-link-column">
                          <h3>{t("Customer to link")}</h3>
                          {!maySeeCustomers ? (
                            <p className="inbox-notice">
                              {t("Your role can read the inbox but cannot change what a conversation is linked to.")}
                            </p>
                          ) : options.customers.length === 0 ? (
                            <p className="inbox-notice">{t("This workspace has no customers yet.")}</p>
                          ) : customerMatches.length === 0 ? (
                            <p className="inbox-notice">{t("Nothing matches that search.")}</p>
                          ) : (
                            <ul>
                              {customerMatches.map((option) => (
                                <li key={option.id}>
                                  <button
                                    type="button"
                                    className={option.id === customerChoice ? "inbox-link-option is-chosen" : "inbox-link-option"}
                                    aria-pressed={option.id === customerChoice}
                                    data-record-id={option.id}
                                    onClick={() => setCustomerChoice(option.id === customerChoice ? "" : option.id)}
                                  >
                                    {option.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="inbox-link-column">
                          <h3>{t("Order to link")}</h3>
                          {!maySeeOrders ? (
                            <p className="inbox-notice">
                              {t("Your role can read the inbox but cannot change what a conversation is linked to.")}
                            </p>
                          ) : options.orders.length === 0 ? (
                            <p className="inbox-notice">{t("This workspace has no orders yet.")}</p>
                          ) : orderMatches.length === 0 ? (
                            <p className="inbox-notice">{t("Nothing matches that search.")}</p>
                          ) : (
                            <ul>
                              {orderMatches.map((order) => (
                                <li key={order.id}>
                                  <button
                                    type="button"
                                    className={order.id === orderChoice ? "inbox-link-option is-chosen" : "inbox-link-option"}
                                    aria-pressed={order.id === orderChoice}
                                    data-record-id={order.id}
                                    onClick={() => setOrderChoice(order.id === orderChoice ? "" : order.id)}
                                  >
                                    <span className="inbox-link-option-name">{order.designName}</span>
                                    <span className="inbox-link-option-sub">{order.customerName}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {linkError ? (
                        // The server's own sentence, with a retry. Never a
                        // silent no-op, and never an empty panel.
                        <div className="inbox-notice inbox-link-error" role="alert">
                          <p>{linkError}</p>
                          <button type="button" onClick={() => void submitLink()}>{t("Try again")}</button>
                        </div>
                      ) : null}

                      <div className="inbox-link-actions">
                        <button
                          type="button"
                          className="inbox-link-save"
                          disabled={linkBusy || (!customerChoice && !orderChoice)}
                          onClick={() => void submitLink()}
                        >
                          {linkBusy ? t("Saving the link…") : t("Save link")}
                        </button>
                        <button
                          type="button"
                          className="inbox-link-cancel"
                          disabled={linkBusy}
                          onClick={() => { setLinkOpen(false); setLinkError(""); }}
                        >
                          {t("Cancel")}
                        </button>
                        {customerChoice || orderChoice ? (
                          <button
                            type="button"
                            className="inbox-link-clear"
                            disabled={linkBusy}
                            onClick={() => { setCustomerChoice(""); setOrderChoice(""); }}
                          >
                            {t("Clear the choice")}
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </section>
              ) : null}

              {whatsappNeedsRenewal ? (
                <p className="inbox-notice inbox-renewal" role="alert">
                  {t("The WhatsApp connection needs to be renewed. Replies will not be sent until then.")}{" "}
                  <a href="/settings?section=customer-channels">{t("Customer Channels")}</a>
                </p>
              ) : null}
              <ol className="inbox-messages">
                {thread.messages.map((message) => (
                  <li
                    key={message.messageId}
                    className={message.direction === "outbound" ? "inbox-msg inbox-msg-out" : "inbox-msg inbox-msg-in"}
                  >
                    {message.untrusted ? (
                      // Marked as what it is: something a stranger wrote. Shown
                      // as a quotation so it cannot be mistaken for the app's
                      // own words, and never acted on as an instruction.
                      <blockquote className="inbox-msg-untrusted">
                        <span className="inbox-msg-tag">{t("Customer wrote")}</span>
                        {/* Each message keeps its own direction: a Turkish sentence in an
                            Arabic interface (or the reverse) must not have its punctuation
                            moved to the wrong end. */}
                        {message.text || !message.media ? <span dir="auto">{message.text ?? t("(no text)")}</span> : null}
                        {message.media ? (
                          <InboxAttachment
                            key={`${thread.conversationId}:${message.messageId}`}
                            companyId={workspace.id}
                            conversationId={thread.conversationId}
                            messageId={message.messageId}
                            messageType={message.messageType}
                            media={message.media}
                            t={t}
                          />
                        ) : null}
                      </blockquote>
                    ) : (
                      <p dir="auto">{message.text ?? t("(no text)")}</p>
                    )}
                    <span className="inbox-msg-time">
                      {timeLabel(message.receivedAtMs, language)}
                      {message.direction === "outbound" && deliveryLabel(message.deliveryStatus) ? (
                        <span className={`inbox-msg-status inbox-msg-status-${message.deliveryStatus}`}>
                          {" · "}{t(deliveryLabel(message.deliveryStatus))}
                        </span>
                      ) : null}
                    </span>
                    {message.direction === "outbound" && message.deliveryStatus === "failed" ? (
                      <span className="inbox-msg-failure" role="note">{t(failureReason(message.errorClass, thread.channelMedium))}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {isInstagramThread && !instagramReady ? (
                // The server says whether an Instagram reply can leave now
                // (readCustomerInboxConversation → replyChannel) and refuses one
                // that cannot. No composer, and never "Send on WhatsApp", on a
                // thread that did not come from WhatsApp.
                <p className="inbox-notice" role="status">{t(instagramReplyNotice(thread.replyChannel?.reason))}</p>
              ) : mayLink && replyWindowShut(thread.replyWindow, clock) ? (
                <div className="inbox-notice inbox-reply-closed" role="status">
                  {isInstagramThread ? (
                    <p>
                      {thread.replyWindow?.state === "none"
                        ? t("There is no open reply window for this conversation. Instagram only allows a reply within 24 hours of the customer's last message.")
                        : t("The 24-hour reply window has closed. Instagram only allows a reply within 24 hours of the customer's last message — the customer has to write again before you can answer here.")}
                    </p>
                  ) : (
                    <>
                      <p>
                        {thread.replyWindow?.state === "none"
                          ? t("There is no open reply window for this conversation. WhatsApp only allows a free-form reply within 24 hours of the customer's last message.")
                          : t("The 24-hour reply window has closed. WhatsApp only allows a free-form reply within 24 hours of the customer's last message — the customer has to write again before you can answer here.")}
                      </p>
                      <p>{t("Approved templates are not set up yet.")}</p>
                    </>
                  )}
                </div>
              ) : mayLink ? (
                <form
                  className="inbox-reply"
                  aria-label={isInstagramThread ? t("Reply on Instagram") : t("Reply on WhatsApp")}
                  onSubmit={(event) => { event.preventDefault(); void submitReply(); }}
                >
                  <textarea
                    className="inbox-reply-text"
                    value={replyText}
                    maxLength={isInstagramThread ? INSTAGRAM_MAX_REPLY_BYTES : 4096}
                    rows={3}
                    placeholder={t("Write a reply…")}
                    aria-label={isInstagramThread ? t("Reply on Instagram") : t("Reply on WhatsApp")}
                    disabled={replyBusy}
                    onChange={(event) => {
                      setReplyText(event.target.value);
                      // New words are a new reply; a failed one is not retried with them.
                      if (!replyBusy && replyError) { setReplyError(""); pendingReplyId.current = ""; }
                    }}
                  />
                  {replyError ? (
                    <div className="inbox-notice inbox-reply-error" role="alert">
                      <p>{replyError}</p>
                      <button type="button" disabled={replyBusy} onClick={() => void submitReply()}>{t("Try again")}</button>
                    </div>
                  ) : null}
                  {isInstagramThread && replyBytes > INSTAGRAM_MAX_REPLY_BYTES ? (
                    <p className="inbox-notice inbox-reply-error" role="alert">
                      {t("That reply is too long for Instagram, which allows 1000 bytes; some characters, such as accented letters, use more than one byte.")}
                    </p>
                  ) : null}
                  <div className="inbox-reply-actions">
                    <p className="inbox-reply-hint">
                      {thread.replyWindow?.state === "open" && thread.replyWindow.closesAtMs
                        ? t("Free replies are open until {time}.").replace("{time}", timeLabel(thread.replyWindow.closesAtMs, language))
                        : isInstagramThread
                          ? t("Instagram allows a reply within 24 hours of the customer's last message.")
                          : t("WhatsApp allows a free reply within 24 hours of the customer's last message.")}
                      {isInstagramThread ? (
                        <span className="inbox-reply-bytes" aria-live="polite">
                          {" · "}{t("{count} of 1000 bytes").replace("{count}", String(replyBytes))}
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="submit"
                      className="inbox-reply-send"
                      disabled={replyBusy || !replyText.trim() || (isInstagramThread && replyBytes > INSTAGRAM_MAX_REPLY_BYTES)}
                    >
                      {replyBusy ? t("Sending…") : isInstagramThread ? t("Send on Instagram") : t("Send on WhatsApp")}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="inbox-notice">{t("Your role can read the inbox but cannot reply.")}</p>
              )}
              {user ? null : <p className="inbox-notice">{t("Sign in again to read this conversation.")}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
