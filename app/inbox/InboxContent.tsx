"use client";

// The inbox itself: conversations on the left, the open thread in the middle,
// what the thread is about on the right.
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
//
// AND IT KEEPS UP WITHOUT A LISTENER. The collection is denied to every client,
// so there is no snapshot to subscribe to. While a thread is open the screen
// asks the server again every twenty seconds, and at once when the tab comes
// back into focus — and it changes nothing on screen unless the answer differs
// from what it already shows (28 Sep 2026: a customer's reaction arrived
// server-side and the open thread kept showing the old state until reopened).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { studioLanguageLocale } from "@/lib/studioflow/languageDirection";
import { relativeTimeLabel as relativeTime } from "@/lib/studioflow/relativeTime";
import { MessagesTabs } from "@/components/MessagesTabs";
import { inboxEmptySentence, isDefaultInboxView } from "@/lib/studioflow/inboxEmptyState";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { InboxAttachment } from "./InboxAttachment";
import { EmojiPicker } from "./EmojiPicker";
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
  metaErrorCode,
  reactOutAvailable,
  reactToCustomerMessage,
  sendCustomerInboxReply,
  newCustomerInboxReplyId,
  OPERATOR_REACTION_EMOJI,
  type CustomerInboxMessage,
  type CustomerInboxOutboundMedia,
  type CustomerInboxRow,
  type CustomerInboxThread
} from "@/lib/studioflow/customerInbox";

/** How often an open thread and the list are read again while the tab is visible. */
const POLL_MS = 20_000;

/** The files the composer takes, and the server's ceilings for each (channels/customerMediaPolicy.js). */
const ATTACHMENT_TYPES: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "image/webp": 5 * 1024 * 1024,
  "application/pdf": 7 * 1024 * 1024
};

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

/** The clock alone, for a bubble inside a day group; the date lives on the separator above it. */
function clockLabel(ms: number, language: string | null | undefined) {
  if (!ms) return "";
  try {
    const locale = studioLanguageLocale(language);
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

/**
 * "5 minutes ago", "yesterday", in the reader's language, for the last week;
 * the plain date and time beyond that. For a reaction's tooltip and a list
 * row, where the question is "how long ago", not "when exactly".
 */
function relativeTimeLabel(ms: number, nowMs: number, language: string | null | undefined) {
  if (!ms) return "";
  const locale = studioLanguageLocale(language);
  return relativeTime(ms, nowMs, locale === "en" ? "en-GB" : locale) || timeLabel(ms, language);
}

/** One key per calendar day in the reader's own time zone, for the separators. */
function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today", "Yesterday", else the date, for a day separator. Keys: the caller translates. */
function dayLabel(ms: number, nowMs: number, language: string | null | undefined, t: (text: string) => string): string {
  const key = dayKey(ms);
  if (key === dayKey(nowMs)) return t("Today");
  if (key === dayKey(nowMs - 24 * 60 * 60 * 1000)) return t("Yesterday");
  try {
    const locale = studioLanguageLocale(language);
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { weekday: "short", day: "2-digit", month: "long" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Two letters for the avatar: a linked customer's initials, else the last two characters of the masked label. */
function initialsOf(name: string, maskedLabel: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const digits = maskedLabel.replace(/[^0-9A-Za-z]/g, "");
  return digits.slice(-2) || "?";
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
    case "instagram_reconnect": return "Instagram needs the account connected again before NivaDesk can reply. Open Settings, Integrations.";
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

/** The tick marks beside a reply's time: one sent, two delivered, two read (coloured by the CSS). */
function deliveryTicks(status: string): string {
  switch (status) {
    case "sent": return "✓";
    case "delivered":
    case "read": return "✓✓";
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

/** The channel's name for a chip: the server's display name, never typed here. */
function channelChip(row: Pick<CustomerInboxRow, "channelDisplayName" | "channelMedium">): string {
  return row.channelDisplayName || "";
}

/** A file picked for the composer, read into memory: shown as a chip until sent or removed. */
type Attachment = { file: File; mimeType: string; previewUrl: string; base64: string };

async function readAttachment(file: File): Promise<Attachment | { error: string }> {
  const mimeType = String(file.type || "").toLowerCase();
  const max = ATTACHMENT_TYPES[mimeType];
  if (!max) return { error: "Only JPG, PNG, WebP photos and PDF documents can be sent." };
  if (file.size <= 0) return { error: "That file is empty." };
  if (file.size > max) return { error: "That file is too large to send. Photos up to 5 MB, PDFs up to 7 MB." };
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]*,/, ""));
    reader.readAsDataURL(file);
  });
  const previewUrl = mimeType.startsWith("image/") ? URL.createObjectURL(file) : "";
  return { file, mimeType, previewUrl, base64 };
}

/** "340 KB", "1.2 MB". */
function sizeLabel(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ICON_EMOJI = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" /><path d="M7 8h.01M13 8h.01" strokeWidth="2.2" /><path d="M6.8 12.2a3.8 3.8 0 0 0 6.4 0" />
  </svg>
);
const ICON_CLIP = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m14.5 8.5-5.6 5.6a2.5 2.5 0 0 1-3.5-3.5l6.4-6.4a1.7 1.7 0 0 1 2.4 2.4L7.8 13" />
  </svg>
);
const ICON_SEND = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 10h12M10.5 5l5 5-5 5" />
  </svg>
);
const ICON_BACK = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
);
const ICON_INFO = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.5h.01" strokeWidth="2" />
  </svg>
);
const ICON_REACT = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="9" cy="10.5" r="6" /><path d="M6.8 9h.01M11.2 9h.01" strokeWidth="2.2" /><path d="M6.6 12.4a3.2 3.2 0 0 0 4.8 0" /><path d="M15.5 3v4M13.5 5h4" />
  </svg>
);

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState("");
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // The reaction chooser: which customer bubble has it open, and which send is in flight.
  const [reactOpenFor, setReactOpenFor] = useState("");
  const [reactBusyFor, setReactBusyFor] = useState("");
  const [reactError, setReactError] = useState("");
  const longPress = useRef<number | null>(null);

  // Phone layout: the list, or the open thread with a way back; the details
  // panel is a sheet there and a column on a wide screen.
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Discards an answer that arrives after the workspace moved on, so a switched
  // workspace never shows the previous one's conversations.
  const ticket = useRef(0);
  // What the screen shows now, for the quiet re-reads to compare against.
  const threadRef = useRef<CustomerInboxThread | null>(null);
  const rowsRef = useRef<CustomerInboxRow[] | null>(null);
  const openIdRef = useRef("");
  threadRef.current = thread;
  rowsRef.current = rows;
  openIdRef.current = openId;

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
    setAttachment(null);
    setAttachError("");
    setEmojiOpen(false);
    setReactOpenFor("");
    setReactError("");
    pendingReplyId.current = "";
    void loadList();
  }, [loadList]);

  const openThread = useCallback(async (conversationId: string) => {
    const mine = ++ticket.current;
    if (conversationId !== openId) {
      setReplyText("");
      setReplyError("");
      setAttachment(null);
      setAttachError("");
      setEmojiOpen(false);
      setReactOpenFor("");
      setReactError("");
      setDetailsOpen(false);
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

  /**
   * The quiet re-read: the open thread and the list, compared with what is on
   * screen, and the screen touched only when the server's answer differs. It
   * never marks anything read and never takes a ticket, so a click that lands
   * meanwhile still wins; an answer for a thread that is no longer open is
   * dropped. Nothing is asked while the tab is hidden.
   */
  const refreshQuietly = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const conversationId = openIdRef.current;
    const at = ticket.current;
    try {
      const [nextThread, nextList] = await Promise.all([
        conversationId ? loadCustomerInboxThread(workspace.id, conversationId) : Promise.resolve(null),
        loadCustomerInboxList(workspace.id, filters)
      ]);
      if (at !== ticket.current) return;
      if (conversationId && conversationId === openIdRef.current && nextThread && threadRef.current
        && JSON.stringify(nextThread) !== JSON.stringify(threadRef.current)) {
        setThread(nextThread);
      }
      if (rowsRef.current !== null && JSON.stringify(nextList.conversations) !== JSON.stringify(rowsRef.current)) {
        setRows(nextList.conversations);
      }
    } catch {
      // A failed quiet read changes nothing: the next one, or a click, will say.
    }
  }, [workspace.id, filters]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshQuietly(); }, POLL_MS);
    const onFocus = () => { void refreshQuietly(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshQuietly]);

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

  // The linked names come from the same records the picker offers; read once
  // a thread with a link is open, so the panel can name what it is linked to.
  useEffect(() => {
    if (!thread || (!thread.customerId && !thread.orderId)) return;
    if (options || optionsError) return;
    void loadOptions();
  }, [thread, options, optionsError, loadOptions]);

  const openLinkPanel = useCallback(() => {
    setLinkOpen(true);
    setLinkError("");
    setDetailsOpen(true);
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
      setDetailsOpen(false);
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
    if (!openId || (!body && !attachment)) return;
    if (!pendingReplyId.current) pendingReplyId.current = newCustomerInboxReplyId();
    setReplyBusy(true);
    setReplyError("");
    try {
      const media: CustomerInboxOutboundMedia | null = attachment
        ? { base64: attachment.base64, mimeType: attachment.mimeType, filename: attachment.file.name }
        : null;
      await sendCustomerInboxReply(workspace.id, openId, pendingReplyId.current, body, media);
      pendingReplyId.current = "";
      setReplyText("");
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
      // Read it back: the thread shows what the server stored, not what was typed.
      await openThread(openId);
      await loadList();
    } catch (failure) {
      setReplyError(friendlyErrorMessage(failure, t));
    } finally {
      setReplyBusy(false);
    }
  }, [openId, replyText, attachment, workspace.id, openThread, loadList, t]);

  /** The emoji goes where the caret is, and the caret moves past it. */
  const insertEmoji = useCallback((emoji: string) => {
    const box = textarea.current;
    const start = box ? box.selectionStart : replyText.length;
    const end = box ? box.selectionEnd : replyText.length;
    const next = `${replyText.slice(0, start)}${emoji}${replyText.slice(end)}`;
    setReplyText(next);
    if (!replyBusy && replyError) { setReplyError(""); pendingReplyId.current = ""; }
    setEmojiOpen(false);
    window.setTimeout(() => {
      if (!box) return;
      box.focus();
      const caret = start + emoji.length;
      box.setSelectionRange(caret, caret);
    }, 0);
  }, [replyText, replyBusy, replyError]);

  const pickAttachment = useCallback(async (file: File | null) => {
    setAttachError("");
    if (!file) return;
    const read = await readAttachment(file);
    if ("error" in read) { setAttachError(t(read.error)); return; }
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(read);
    if (!replyBusy && replyError) { setReplyError(""); pendingReplyId.current = ""; }
  }, [attachment, replyBusy, replyError, t]);

  const removeAttachment = useCallback(() => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setAttachError("");
    if (fileInput.current) fileInput.current.value = "";
  }, [attachment]);

  /** Send one reaction (or its removal) and read the thread back from the server's answer. */
  const react = useCallback(async (message: CustomerInboxMessage, emoji: string | null) => {
    if (!openId || reactBusyFor) return;
    setReactOpenFor("");
    setReactBusyFor(message.messageId);
    setReactError("");
    try {
      await reactToCustomerMessage(workspace.id, openId, message.messageId, emoji);
      const next = await loadCustomerInboxThread(workspace.id, openId);
      if (next && openIdRef.current === openId) setThread(next);
    } catch (failure) {
      // Meta's number beside the sentence, when the refusal was Meta's: the
      // owner reads "Instagram did not accept the reaction. (Meta code 100)".
      const code = metaErrorCode(failure);
      setReactError(`${friendlyErrorMessage(failure, t)}${code ? ` (${t("Meta code {code}").replace("{code}", code)})` : ""}`);
    } finally {
      setReactBusyFor("");
    }
  }, [openId, reactBusyFor, workspace.id, t]);

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
    return thread.customerName || options?.customers.find((option) => option.id === thread.customerId)?.name || "";
  }, [thread?.customerId, thread?.customerName, options]);
  const linkedOrderName = useMemo(() => {
    if (!thread?.orderId) return "";
    const order = options?.orders.find((entry) => entry.id === thread.orderId);
    return order ? order.designName : "";
  }, [thread?.orderId, options]);

  /** The thread's messages with their day separators and their place in a run of the same side. */
  const grouped = useMemo(() => {
    const messages = thread?.messages ?? [];
    const out: Array<{ kind: "day"; key: string; atMs: number } | { kind: "message"; message: CustomerInboxMessage; first: boolean; last: boolean }> = [];
    messages.forEach((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      if (!previous || dayKey(previous.receivedAtMs) !== dayKey(message.receivedAtMs)) {
        out.push({ kind: "day", key: `day-${dayKey(message.receivedAtMs)}-${index}`, atMs: message.receivedAtMs });
      }
      // Two neighbours are one run when they are the same side, the same day and under ten minutes apart.
      const sameRun = (a: CustomerInboxMessage | undefined, b: CustomerInboxMessage | undefined) =>
        Boolean(a && b) && a!.direction === b!.direction && dayKey(a!.receivedAtMs) === dayKey(b!.receivedAtMs) && Math.abs(b!.receivedAtMs - a!.receivedAtMs) < 10 * 60 * 1000;
      out.push({ kind: "message", message, first: !sameRun(previous, message), last: !sameRun(message, next) });
    });
    return out;
  }, [thread?.messages]);

  const composerDisabled = replyBusy || (!replyText.trim() && !attachment) || (isInstagramThread && replyBytes > INSTAGRAM_MAX_REPLY_BYTES);
  const threadLabel = thread ? (thread.customerName || linkedCustomerName || "") : "";

  const renderReactions = (message: CustomerInboxMessage) => {
    const list = message.reactions ?? [];
    const mine = list.find((reaction) => reaction.by === "operator") || null;
    const theirs = list.filter((reaction) => reaction.by !== "operator");
    if (!list.length) return null;
    return (
      // The customer's emoji on this message, and the workspace's own: small
      // chips under the bubble, never a row of their own — a reaction is not a message.
      <span className="inbox-msg-reactions">
        {theirs.map((reaction, index) => {
          const reacted = t("Reacted {time}").replace("{time}", relativeTimeLabel(reaction.atMs, clock, language));
          return (
            <span key={`${reaction.emoji}:${reaction.atMs}:${index}`} className="inbox-msg-reaction" role="img" aria-label={reacted} title={reacted}>
              {reaction.emoji}
            </span>
          );
        })}
        {mine ? (() => {
          const title = `${t("You reacted {time}").replace("{time}", relativeTimeLabel(mine.atMs, clock, language))}${mine.status === "suppressed" ? ` · ${t("Not sent (test environment)")}` : ""}`;
          return (
            <span className={`inbox-msg-reaction inbox-msg-reaction-mine${mine.status === "suppressed" ? " is-suppressed" : ""}`} role="img" aria-label={title} title={title}>
              {mine.emoji}
            </span>
          );
        })() : null}
      </span>
    );
  };

  // Whether the chooser is drawn on this thread at all: the server's word per
  // channel (`reactOut`), and WhatsApp only on a server that predates it. The
  // customer's own reactions render either way.
  const canReactHere = reactOutAvailable(thread);

  const renderReactChooser = (message: CustomerInboxMessage) => {
    if (!canReactHere || !mayLink || message.direction !== "inbound" || message.reactable !== true) return null;
    const mine = (message.reactions ?? []).find((reaction) => reaction.by === "operator") || null;
    const open = reactOpenFor === message.messageId;
    const sending = reactBusyFor === message.messageId;
    return (
      <div className={`inbox-react${open ? " is-open" : ""}`}>
        <button
          type="button"
          className="inbox-react-open"
          aria-label={t("React to this message")}
          title={t("React to this message")}
          aria-expanded={open}
          disabled={sending}
          onClick={(event) => { event.stopPropagation(); setReactError(""); setReactOpenFor(open ? "" : message.messageId); }}
        >
          {ICON_REACT}
        </button>
        {open ? (
          <div className="inbox-react-chooser" role="menu" aria-label={t("React to this message")}>
            {OPERATOR_REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                className={`inbox-react-choice${mine && mine.emoji === emoji ? " is-current" : ""}`}
                onClick={() => void react(message, emoji)}
              >
                {emoji}
              </button>
            ))}
            {mine ? (
              <button type="button" role="menuitem" className="inbox-react-remove" onClick={() => void react(message, null)}>
                {t("Remove your reaction")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const contextPanel = thread ? (
    <aside className={`inbox-context${detailsOpen ? " is-open" : ""}`} aria-label={t("Conversation details")}>
      <div className="inbox-context-head">
        <strong>{t("Conversation details")}</strong>
        <button type="button" className="inbox-context-close" aria-label={t("Close")} onClick={() => setDetailsOpen(false)}>×</button>
      </div>
      <section className="inbox-context-card inbox-context-who">
        <span className="inbox-avatar inbox-avatar-lg" aria-hidden="true">{initialsOf(threadLabel, thread.maskedLabel)}</span>
        <div className="inbox-context-who-text">
          {threadLabel ? <strong dir="auto">{threadLabel}</strong> : null}
          <span className="inbox-context-masked">{thread.maskedLabel ? <bdi dir="ltr">{thread.maskedLabel}</bdi> : t("Unknown sender")}</span>
          <span className="inbox-context-chips">
            {channelChip(thread) ? <span className="inbox-chip-channel" data-channel={thread.channelMedium || ""}>{channelChip(thread)}</span> : null}
            {thread.providerDecided && thread.providerDisplayName ? <span className="inbox-provider">{thread.providerDisplayName}</span> : null}
            <span className={`inbox-chip-status is-${thread.status === "closed" ? "closed" : "open"}`}>{thread.status === "closed" ? t("Marked as done") : t("Open conversation")}</span>
          </span>
        </div>
      </section>

      <section className="inbox-context-card">
        <h3>{t("Linked records")}</h3>
        <dl className="inbox-context-facts">
          <div><dt>{t("Customer")}</dt><dd dir="auto">{thread.customerId ? (linkedCustomerName || t("Linked to a customer")) : "—"}</dd></div>
          <div><dt>{t("Order")}</dt><dd dir="auto">{thread.orderId ? (linkedOrderName || t("Linked to an order")) : "—"}</dd></div>
        </dl>
        {mayLink && !linkOpen ? (
          <button type="button" className="inbox-link-open" onClick={openLinkPanel}>{t("Link this conversation")}</button>
        ) : null}
        {linkOpen ? (
          <section className="inbox-link" aria-label={t("Link this conversation")}>
            <div className="inbox-link-head">
              <strong>{t("Link this conversation")}</strong>
              <p>{t("Attach it to a customer or an order in this workspace.")}</p>
              <p className="inbox-link-scope">{t("Only this workspace's customers and orders are offered.")}</p>
            </div>
            {!mayLink ? (
              <p className="inbox-notice">{t("Your role can read the inbox but cannot change what a conversation is linked to.")}</p>
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
                      <p className="inbox-notice">{t("Your role can read the inbox but cannot change what a conversation is linked to.")}</p>
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
                      <p className="inbox-notice">{t("Your role can read the inbox but cannot change what a conversation is linked to.")}</p>
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
                  <button type="button" className="inbox-link-save" disabled={linkBusy || (!customerChoice && !orderChoice)} onClick={() => void submitLink()}>
                    {linkBusy ? t("Saving the link…") : t("Save link")}
                  </button>
                  <button type="button" className="inbox-link-cancel" disabled={linkBusy} onClick={() => { setLinkOpen(false); setLinkError(""); }}>
                    {t("Cancel")}
                  </button>
                  {customerChoice || orderChoice ? (
                    <button type="button" className="inbox-link-clear" disabled={linkBusy} onClick={() => { setCustomerChoice(""); setOrderChoice(""); }}>
                      {t("Clear the choice")}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        ) : null}
      </section>

      {mayLink ? (
        <section className="inbox-context-card inbox-triage" aria-label={t("Conversation status")}>
          <h3>{t("Triage")}</h3>
          <button
            type="button"
            className={`inbox-status-toggle${thread.status === "closed" ? " is-reopen" : ""}`}
            disabled={triageBusy}
            onClick={() => void runTriage(() => setCustomerInboxStatus(workspace.id, openId, thread.status === "closed" ? "open" : "closed"))}
          >
            {thread.status === "closed" ? t("Reopen conversation") : t("Mark as done")}
          </button>
          <label className="inbox-assign">
            <span>{t("Assign to")}</span>
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
            <span className="inbox-labels-title">{t("Labels")}</span>
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
        </section>
      ) : (thread.labels && thread.labels.length) || thread.assigneeUid ? (
        <section className="inbox-context-card inbox-triage inbox-triage-readonly">
          <h3>{t("Triage")}</h3>
          {thread.assigneeUid ? <span className="inbox-row-assignee">{members.find((m) => m.uid === thread.assigneeUid)?.name || t("Assigned")}</span> : null}
          <div className="inbox-labels">{(thread.labels || []).map((label) => <span key={label} className="inbox-chip">{label}</span>)}</div>
        </section>
      ) : null}

      {mayErase ? (
        <section className="inbox-context-card inbox-context-danger">
          <button type="button" className="inbox-erase" disabled={eraseBusy} onClick={() => void eraseThread()}>
            {t("Delete conversation")}
          </button>
          <p className="inbox-context-hint">
            {isInstagramThread
              ? t("Deleting removes the conversation from NivaDesk only; it stays in Instagram.")
              : t("Deleting removes the conversation from NivaDesk only; the customer's phone keeps its copy.")}
          </p>
        </section>
      ) : null}
    </aside>
  ) : null;

  return (
    <div className="inbox-page">
      <div className={`inbox-layout${openId ? " has-thread" : ""}${detailsOpen ? " has-details" : ""}`}>
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
                    className={`inbox-row${row.conversationId === openId ? " inbox-row-open" : ""}${row.unread ? " is-unread" : ""}`}
                    onClick={() => void openThread(row.conversationId)}
                  >
                    <span className="inbox-avatar" aria-hidden="true" data-channel={row.channelMedium || ""}>
                      {initialsOf(row.customerName || "", row.maskedLabel)}
                    </span>
                    <span className="inbox-row-label">
                      {/* A linked customer's name leads; the masked label is what the list always has.
                          Isolated LTR: in an RTL page "••••0111" would otherwise render reversed. */}
                      {row.customerName ? <span className="inbox-row-customer" dir="auto">{row.customerName}</span> : null}
                      {row.maskedLabel ? <bdi dir="ltr" className="inbox-row-masked">{row.maskedLabel}</bdi> : t("Unknown sender")}
                      {/* The channel, always: two customers can share four digits. */}
                      {channelChip(row) ? <span className="inbox-row-channel" data-channel={row.channelMedium || ""}>{channelChip(row)}</span> : null}
                    </span>
                    <span className="inbox-row-time">
                      {relativeTimeLabel(row.lastMessageAtMs, clock, language)}
                      {row.unread ? <span className="inbox-unread" aria-label={t("Unread")}>●</span> : null}
                    </span>
                    <span className="inbox-row-preview" dir="auto">{rowPreview(row, t)}</span>
                    {(row.labels && row.labels.length) || row.assigneeUid ? (
                      <span className="inbox-row-meta">
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
            <div className="inbox-thread-empty">
              {eraseNotice ? <p className="inbox-notice success-copy" role="status">{eraseNotice}</p> : null}
              <span className="inbox-thread-empty-mark" aria-hidden="true">{ICON_EMOJI}</span>
              <p className="inbox-notice">{t("Choose a conversation to read it.")}</p>
            </div>
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
                <button type="button" className="inbox-back" aria-label={t("Back to conversations")} onClick={() => { setOpenId(""); setThread(null); setDetailsOpen(false); }}>
                  {ICON_BACK}
                </button>
                <span className="inbox-avatar" aria-hidden="true" data-channel={thread.channelMedium || ""}>{initialsOf(threadLabel, thread.maskedLabel)}</span>
                <div className="inbox-thread-title">
                  <strong dir="auto">{threadLabel || (thread.maskedLabel ? <bdi dir="ltr">{thread.maskedLabel}</bdi> : t("Unknown sender"))}</strong>
                  <span className="inbox-thread-sub">
                    {threadLabel && thread.maskedLabel ? <bdi dir="ltr">{thread.maskedLabel}</bdi> : null}
                    {/* The medium's display name, as the server's vocabulary reads
                        the stored token. Not typed here: the same five letters mean
                        three different things depending on where they are stored,
                        and only the server knows which site this row came from. */}
                    {thread.channelDisplayName ? (
                      <span className="inbox-channel inbox-chip-channel" data-channel-role={thread.channelRole || ""} data-channel={thread.channelMedium || ""}>
                        {thread.channelDisplayName}
                      </span>
                    ) : null}
                    {thread.status === "closed" ? <span className="inbox-chip-status is-closed">{t("Marked as done")}</span> : null}
                    {thread.assigneeUid ? <span className="inbox-row-assignee">{members.find((m) => m.uid === thread.assigneeUid)?.name || t("Assigned")}</span> : null}
                  </span>
                </div>
                <button type="button" className={`inbox-details-toggle${detailsOpen ? " is-active" : ""}`} aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}>
                  {ICON_INFO}
                  <span>{t("Details")}</span>
                </button>
              </div>

              {whatsappNeedsRenewal ? (
                <p className="inbox-notice inbox-renewal" role="alert">
                  {t("The WhatsApp connection needs to be renewed. Replies will not be sent until then.")}{" "}
                  <a href="/settings?section=whatsapp">{t("Integrations")}</a>
                </p>
              ) : null}
              {reactError ? (
                <div className="inbox-notice inbox-reply-error" role="alert">
                  <p>{reactError}</p>
                  <button type="button" onClick={() => setReactError("")}>{t("Close")}</button>
                </div>
              ) : null}
              <ol className="inbox-messages">
                {grouped.map((entry) => entry.kind === "day" ? (
                  <li key={entry.key} className="inbox-day" role="separator" aria-label={dayLabel(entry.atMs, clock, language, t)}>
                    <span>{dayLabel(entry.atMs, clock, language, t)}</span>
                  </li>
                ) : (
                  <li
                    key={entry.message.messageId}
                    className={`inbox-msg ${entry.message.direction === "outbound" ? "inbox-msg-out" : "inbox-msg-in"}${entry.first ? " is-first" : ""}${entry.last ? " is-last" : ""}`}
                    onTouchStart={() => {
                      if (!canReactHere || entry.message.direction !== "inbound" || entry.message.reactable !== true || !mayLink) return;
                      longPress.current = window.setTimeout(() => setReactOpenFor(entry.message.messageId), 500);
                    }}
                    onTouchEnd={() => { if (longPress.current !== null) { window.clearTimeout(longPress.current); longPress.current = null; } }}
                    onTouchMove={() => { if (longPress.current !== null) { window.clearTimeout(longPress.current); longPress.current = null; } }}
                  >
                    <div className="inbox-bubble">
                      {entry.message.untrusted ? (
                        // Marked as what it is: something a stranger wrote. Shown
                        // as a quotation so it cannot be mistaken for the app's
                        // own words, and never acted on as an instruction.
                        <blockquote className="inbox-msg-untrusted">
                          <span className="inbox-msg-tag">{t("Customer wrote")}</span>
                          {/* Each message keeps its own direction: a Turkish sentence in an
                              Arabic interface (or the reverse) must not have its punctuation
                              moved to the wrong end. */}
                          {entry.message.text || !entry.message.media ? <span dir="auto">{entry.message.text ?? t("(no text)")}</span> : null}
                          {entry.message.media ? (
                            <InboxAttachment
                              key={`${thread.conversationId}:${entry.message.messageId}`}
                              companyId={workspace.id}
                              conversationId={thread.conversationId}
                              messageId={entry.message.messageId}
                              messageType={entry.message.messageType}
                              media={entry.message.media}
                              t={t}
                            />
                          ) : null}
                        </blockquote>
                      ) : (
                        <>
                          {entry.message.text ? <p dir="auto">{entry.message.text}</p> : entry.message.media ? null : <p dir="auto">{t("(no text)")}</p>}
                          {entry.message.media ? (
                            <InboxAttachment
                              key={`${thread.conversationId}:${entry.message.messageId}`}
                              companyId={workspace.id}
                              conversationId={thread.conversationId}
                              messageId={entry.message.messageId}
                              messageType={entry.message.messageType}
                              media={entry.message.media}
                              t={t}
                            />
                          ) : null}
                        </>
                      )}
                      <span className="inbox-msg-time">
                        {clockLabel(entry.message.receivedAtMs, language)}
                        {entry.message.direction === "outbound" && deliveryLabel(entry.message.deliveryStatus) ? (
                          <span className={`inbox-msg-status inbox-msg-status-${entry.message.deliveryStatus}`} title={t(deliveryLabel(entry.message.deliveryStatus))}>
                            {deliveryTicks(entry.message.deliveryStatus) ? (
                              <span className="inbox-msg-ticks" aria-hidden="true">{deliveryTicks(entry.message.deliveryStatus)}</span>
                            ) : null}
                            <span className={deliveryTicks(entry.message.deliveryStatus) ? "sr-only" : ""}>{t(deliveryLabel(entry.message.deliveryStatus))}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {renderReactions(entry.message)}
                    {renderReactChooser(entry.message)}
                    {entry.message.direction === "outbound" && entry.message.deliveryStatus === "failed" ? (
                      <span className="inbox-msg-failure" role="note">{t(failureReason(entry.message.errorClass, thread.channelMedium))}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {isInstagramThread && !instagramReady ? (
                // The server says whether an Instagram reply can leave now
                // (readCustomerInboxConversation → replyChannel) and refuses one
                // that cannot. No composer, and never "Send on WhatsApp", on a
                // thread that did not come from WhatsApp.
                <p className="inbox-notice inbox-reply-closed" role="status">{t(instagramReplyNotice(thread.replyChannel?.reason))}</p>
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
                  {attachment ? (
                    <div className="inbox-attach-preview">
                      {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <span className="inbox-attach-doc" aria-hidden="true">PDF</span>}
                      <span className="inbox-attach-name" dir="auto">{attachment.file.name}</span>
                      <span className="inbox-attach-size">{sizeLabel(attachment.file.size)}</span>
                      <button type="button" className="inbox-attach-remove" aria-label={t("Remove attachment")} disabled={replyBusy} onClick={removeAttachment}>×</button>
                    </div>
                  ) : null}
                  {attachError ? <p className="inbox-notice inbox-reply-error" role="alert">{attachError}</p> : null}
                  <div className="inbox-composer">
                    <div className="inbox-composer-tools">
                      <button type="button" className={`inbox-composer-btn${emojiOpen ? " is-active" : ""}`} aria-label={t("Add emoji")} title={t("Add emoji")} aria-expanded={emojiOpen} disabled={replyBusy} onClick={() => setEmojiOpen((value) => !value)}>
                        {ICON_EMOJI}
                      </button>
                      {!isInstagramThread ? (
                        <>
                          <button type="button" className="inbox-composer-btn" aria-label={t("Attach a photo or PDF")} title={t("Attach a photo or PDF")} disabled={replyBusy} onClick={() => fileInput.current?.click()}>
                            {ICON_CLIP}
                          </button>
                          <input
                            ref={fileInput}
                            type="file"
                            className="sr-only"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            tabIndex={-1}
                            onChange={(event) => { void pickAttachment(event.target.files && event.target.files[0] ? event.target.files[0] : null); }}
                          />
                        </>
                      ) : null}
                    </div>
                    <textarea
                      ref={textarea}
                      className="inbox-reply-text"
                      value={replyText}
                      maxLength={isInstagramThread ? INSTAGRAM_MAX_REPLY_BYTES : 4096}
                      rows={2}
                      placeholder={attachment ? t("Add a caption…") : t("Write a reply…")}
                      aria-label={isInstagramThread ? t("Reply on Instagram") : t("Reply on WhatsApp")}
                      disabled={replyBusy}
                      onChange={(event) => {
                        setReplyText(event.target.value);
                        // New words are a new reply; a failed one is not retried with them.
                        if (!replyBusy && replyError) { setReplyError(""); pendingReplyId.current = ""; }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!composerDisabled) void submitReply(); }
                      }}
                    />
                    <button
                      type="submit"
                      className="inbox-reply-send"
                      disabled={composerDisabled}
                      aria-label={isInstagramThread ? t("Send on Instagram") : t("Send on WhatsApp")}
                      title={isInstagramThread ? t("Send on Instagram") : t("Send on WhatsApp")}
                    >
                      {replyBusy ? <span className="inbox-reply-send-text">{t("Sending…")}</span> : ICON_SEND}
                    </button>
                  </div>
                  {emojiOpen ? <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} t={t} /> : null}
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
                </form>
              ) : (
                <p className="inbox-notice inbox-reply-closed">{t("Your role can read the inbox but cannot reply.")}</p>
              )}
              {user ? null : <p className="inbox-notice">{t("Sign in again to read this conversation.")}</p>}
            </>
          )}
        </section>

        {contextPanel}
        {detailsOpen && thread ? <button type="button" className="inbox-context-scrim" aria-label={t("Close")} onClick={() => setDetailsOpen(false)} /> : null}
      </div>
    </div>
  );
}
