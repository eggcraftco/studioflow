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
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { MessagesTabs } from "@/components/MessagesTabs";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
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
  loadCustomerInboxConversations,
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
    return new Intl.DateTimeFormat(language === "Türkçe" ? "tr" : "en-GB", {
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
  const [listError, setListError] = useState("");
  const [openId, setOpenId] = useState("");
  const [thread, setThread] = useState<CustomerInboxThread | null>(null);
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
      const next = await loadCustomerInboxConversations(workspace.id);
      if (mine !== ticket.current) return;
      setRows(next);
    } catch (failure) {
      if (mine !== ticket.current) return;
      setRows(null);
      setListError(friendlyErrorMessage(failure, t));
    }
  }, [workspace.id, t]);

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
            customerUnread={rows ? rows.filter((row) => row.unread).length : undefined}
          />
          <header className="inbox-head">
            <h1>{t("Customers")}</h1>
            <p className="inbox-sub">{t("Messages your customers sent to the workshop.")}</p>
          </header>
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
            <p className="inbox-notice">{t("No customer messages yet.")}</p>
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
                      {row.maskedLabel || t("Unknown sender")}
                      {row.unread ? <span className="inbox-unread" aria-label={t("Unread")}>●</span> : null}
                    </span>
                    <span className="inbox-row-preview">{row.lastMessagePreview}</span>
                    <span className="inbox-row-time">{timeLabel(row.lastMessageAtMs, language)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="inbox-thread" aria-label={t("Conversation")}>
          {!openId ? (
            <p className="inbox-notice">{t("Choose a conversation to read it.")}</p>
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
                <strong>{thread.maskedLabel || t("Unknown sender")}</strong>
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
              </div>

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
                        {message.text ?? t("(no text)")}
                      </blockquote>
                    ) : (
                      <p>{message.text ?? t("(no text)")}</p>
                    )}
                    <span className="inbox-msg-time">{timeLabel(message.receivedAtMs, language)}</span>
                  </li>
                ))}
              </ol>
              {mayLink ? (
                <form
                  className="inbox-reply"
                  aria-label={t("Reply on WhatsApp")}
                  onSubmit={(event) => { event.preventDefault(); void submitReply(); }}
                >
                  <textarea
                    className="inbox-reply-text"
                    value={replyText}
                    maxLength={4096}
                    rows={3}
                    placeholder={t("Write a reply…")}
                    aria-label={t("Reply on WhatsApp")}
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
                  <div className="inbox-reply-actions">
                    <p className="inbox-reply-hint">{t("WhatsApp allows a free reply within 24 hours of the customer's last message.")}</p>
                    <button type="submit" className="inbox-reply-send" disabled={replyBusy || !replyText.trim()}>
                      {replyBusy ? t("Sending…") : t("Send on WhatsApp")}
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
