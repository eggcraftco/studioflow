import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, functions, storage } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// ------------------------------------------------------------------
// Types — mirror Android StudioMessage* / Mac StudioMessage*
// ------------------------------------------------------------------

export type StudioMessageThreadType = "team" | "direct" | "group" | string;

export type StudioMessageThread = {
  id: string;
  companyId: string;
  type: StudioMessageThreadType;
  title: string;
  memberUids: string[];
  memberEmails: string[];
  lastMessageText: string;
  lastMessageAtMillis: number;
  lastMessageByUid: string;
  lastMessageByName: string;
  lastMessageByPhotoURL: string;
  readByMillis: Record<string, number>;
  mutedUntilByMillis: Record<string, number>;
  pinnedMessageIds: string[];
  isUnread: boolean;
};

export type StudioMessageItem = {
  id: string;
  threadId: string;
  text: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  senderPhotoURL: string;
  createdAtMillis: number;
  type: string;
  fileName: string;
  fileURL: string;
  fileType: string;
  fileSize: number;
  deletedForEveryone: boolean;
  deletedByUid: string;
  deletedAtMillis: number;
  pinned: boolean;
  pinnedByUid: string;
  pinnedByName: string;
  pinnedAtMillis: number;
  replyToMessageId: string;
  replyToText: string;
  replyToSenderName: string;
  replyToSenderUid: string;
  replyToFileName: string;
  replyToType: string;
  reactions: Record<string, Record<string, string>>;
  mentionedUids: string[];
  edited: boolean;
  editedAtMillis: number;
  editedByUid: string;
};

export type StudioMessageTeamMember = {
  id: string;
  email: string;
  name: string;
  photoURL: string;
};

export type StudioMessageTypingUser = {
  id: string;
  name: string;
  email: string;
  photoURL: string;
  updatedAtMillis: number;
};

export type StudioMessageWorkspaceSettings = {
  directMessagesEnabled: boolean;
  groupConversationsEnabled: boolean;
  attachmentsEnabled: boolean;
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function timestampToMillis(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v._seconds === "number") return v._seconds * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function millisMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const ms = timestampToMillis(raw);
    if (ms > 0) out[key] = ms;
  }
  return out;
}

function reactionMap(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [emoji, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const users: Record<string, string> = {};
    for (const [uid, name] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof name === "string") users[uid] = name;
      else if (name && typeof name === "object") {
        const n = (name as { name?: string; email?: string }).name ?? (name as { email?: string }).email ?? uid;
        users[uid] = n;
      } else users[uid] = uid;
    }
    if (Object.keys(users).length) out[emoji] = users;
  }
  return out;
}

function threadFromDoc(id: string, data: Record<string, unknown>, currentUid: string): StudioMessageThread {
  const memberUids = stringList(data.memberUids);
  const type = stringValue(data.type, id === "team" ? "team" : "direct");
  const readBy = millisMap(data.readBy);
  const lastMessageAtMillis = timestampToMillis(data.lastMessageAt);
  const lastMessageByUid = stringValue(data.lastMessageByUid);
  const isUnread =
    !!currentUid &&
    !!lastMessageAtMillis &&
    lastMessageByUid !== currentUid &&
    lastMessageAtMillis > (readBy[currentUid] ?? 0);
  return {
    id,
    companyId: stringValue(data.companyId),
    type,
    title: stringValue(data.title, type === "team" ? "Team Chat" : ""),
    memberUids,
    memberEmails: stringList(data.memberEmails),
    lastMessageText: stringValue(data.lastMessageText ?? data.lastMessagePreview),
    lastMessageAtMillis,
    lastMessageByUid,
    lastMessageByName: stringValue(data.lastMessageByName),
    lastMessageByPhotoURL: stringValue(data.lastMessageByPhotoURL),
    readByMillis: readBy,
    mutedUntilByMillis: millisMap(data.mutedUntilBy),
    pinnedMessageIds: stringList(data.pinnedMessageIds),
    isUnread,
  };
}

function itemFromDoc(id: string, data: Record<string, unknown>, threadId: string, currentUid: string): StudioMessageItem | null {
  const hiddenForUids = stringList(data.hiddenForUids ?? data.deletedForUids ?? data.hiddenFor);
  if (currentUid && hiddenForUids.includes(currentUid)) return null;
  const deletedForEveryone = (data.deletedForEveryone as boolean | undefined) ?? (data.isDeleted as boolean | undefined) ?? false;
  const rawType = stringValue(data.type, "text");
  const type = deletedForEveryone ? "deleted" : rawType;
  return {
    id,
    threadId: stringValue(data.threadId, threadId),
    text: deletedForEveryone ? "" : stringValue(data.text ?? data.message),
    senderUid: stringValue(data.senderUid),
    senderEmail: stringValue(data.senderEmail),
    senderName: stringValue(data.senderName, stringValue(data.senderEmail)),
    senderPhotoURL: stringValue(data.senderPhotoURL ?? data.senderAvatarURL),
    createdAtMillis: timestampToMillis(data.createdAt) || Date.now(),
    type,
    fileName: deletedForEveryone ? "" : stringValue(data.fileName),
    fileURL: deletedForEveryone ? "" : stringValue(data.fileURL),
    fileType: deletedForEveryone ? "" : stringValue(data.fileType),
    fileSize: deletedForEveryone ? 0 : Number(data.fileSize ?? 0),
    deletedForEveryone,
    deletedByUid: stringValue(data.deletedByUid),
    deletedAtMillis: timestampToMillis(data.deletedAt),
    pinned: (data.pinned as boolean | undefined) ?? false,
    pinnedByUid: stringValue(data.pinnedByUid),
    pinnedByName: stringValue(data.pinnedByName),
    pinnedAtMillis: timestampToMillis(data.pinnedAt),
    replyToMessageId: stringValue(data.replyToMessageId),
    replyToText: stringValue(data.replyToText),
    replyToSenderName: stringValue(data.replyToSenderName),
    replyToSenderUid: stringValue(data.replyToSenderUid),
    replyToFileName: stringValue(data.replyToFileName),
    replyToType: stringValue(data.replyToType),
    reactions: reactionMap(data.reactions),
    mentionedUids: stringList(data.mentionedUids),
    edited: (data.edited as boolean | undefined) ?? false,
    editedAtMillis: timestampToMillis(data.editedAt),
    editedByUid: stringValue(data.editedByUid),
  };
}

function sortThreads(threads: StudioMessageThread[]): StudioMessageThread[] {
  const team = threads.filter((t) => t.id === "team").sort((a, b) => a.id.localeCompare(b.id));
  const others = threads
    .filter((t) => t.id !== "team")
    .sort((a, b) => b.lastMessageAtMillis - a.lastMessageAtMillis || a.id.localeCompare(b.id));
  return [...team, ...others];
}

// ------------------------------------------------------------------
// Listeners
// ------------------------------------------------------------------

export function listenToMessageThreads(
  workspace: WorkspaceContext,
  currentUid: string,
  callback: (threads: StudioMessageThread[]) => void,
): Unsubscribe {
  if (!workspace.id || !currentUid) {
    callback([]);
    return () => {};
  }
  let active = true;
  let unsubscribeSnapshot: Unsubscribe = () => {};
  const q = query(
    collection(db, "companies", workspace.id, "messageThreads"),
    where("memberUids", "array-contains", currentUid),
  );
  const startRealtimeListener = () => {
    if (!active) return;
    unsubscribeSnapshot = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => threadFromDoc(d.id, d.data() as Record<string, unknown>, currentUid))
        .filter((t) => t.id === "team" || t.memberUids.includes(currentUid));
      callback(sortThreads(list));
    });
  };
  // The callable synchronises Team Chat membership and returns authorised
  // threads immediately; private threads remain participant-only.
  void call<{ threads?: Array<Record<string, unknown>> }>("listMessageThreads", { companyId: workspace.id })
    .then((data) => {
      if (!active) return;
      const initial = (data.threads ?? [])
        .map((item) => threadFromDoc(String(item.id ?? ""), item, currentUid))
        .filter((thread) => thread.id === "team" || thread.memberUids.includes(currentUid));
      callback(sortThreads(initial));
      startRealtimeListener();
    })
    .catch(() => startRealtimeListener());
  return () => {
    active = false;
    unsubscribeSnapshot();
  };
}

export function listenToThreadMessages(
  workspaceId: string,
  threadId: string,
  currentUid: string,
  callback: (items: StudioMessageItem[]) => void,
): Unsubscribe {
  if (!workspaceId || !threadId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, "companies", workspaceId, "messageThreads", threadId, "messages"),
    orderBy("createdAt"),
    limit(300),
  );
  return onSnapshot(q, (snap) => {
    const items: StudioMessageItem[] = [];
    snap.docs.forEach((d) => {
      const item = itemFromDoc(d.id, d.data() as Record<string, unknown>, threadId, currentUid);
      if (item) items.push(item);
    });
    callback(items);
  });
}

export function listenToTypingUsers(
  workspaceId: string,
  threadId: string,
  currentUid: string,
  callback: (users: StudioMessageTypingUser[]) => void,
): Unsubscribe {
  if (!workspaceId || !threadId) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, "companies", workspaceId, "messageThreads", threadId, "typing"),
    (snap) => {
      const now = Date.now();
      const users: StudioMessageTypingUser[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const uid = stringValue(data.uid ?? d.id);
        if (!uid || uid === currentUid) return;
        const isTyping = (data.isTyping as boolean | undefined) ?? true;
        if (!isTyping) return;
        const updatedAtMillis = timestampToMillis(data.updatedAt) || timestampToMillis(data.typingUntil);
        if (updatedAtMillis && now - updatedAtMillis > 8_000) return;
        users.push({
          id: uid,
          name: stringValue(data.name ?? data.userName, stringValue(data.email)),
          email: stringValue(data.email),
          photoURL: stringValue(data.photoURL ?? data.userPhotoURL),
          updatedAtMillis,
        });
      });
      callback(users);
    },
  );
}

// ------------------------------------------------------------------
// Cloud Function callers
// ------------------------------------------------------------------

type CallableResult<T> = { data: T };

async function call<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable(functions, name);
  const result = (await fn(payload)) as CallableResult<T>;
  return result.data;
}

export async function loadMessageTeamMembers(workspace: WorkspaceContext): Promise<StudioMessageTeamMember[]> {
  if (!workspace.id) return [];
  const data = await call<{ teamMembers?: unknown[] }>("listMessageThreads", { companyId: workspace.id });
  return (data.teamMembers ?? [])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => {
      const id = stringValue(m.uid ?? m.id);
      return {
        id,
        email: stringValue(m.email),
        name: stringValue(m.name ?? m.displayName, stringValue(m.email)),
        photoURL: stringValue(m.photoURL),
      };
    })
    .filter((m) => m.id);
}

export async function markMessageThreadRead(workspace: WorkspaceContext, threadId: string): Promise<void> {
  if (!workspace.id || !threadId) return;
  await call("markMessageThreadRead", { companyId: workspace.id, threadId });
}

export type SendThreadMessageInput = {
  text: string;
  userName?: string;
  userPhotoURL?: string;
  replyToMessageId?: string;
  mentionedUids?: string[];
  fileURL?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
};

export async function sendThreadMessage(
  workspace: WorkspaceContext,
  threadId: string,
  input: SendThreadMessageInput,
): Promise<void> {
  if (!workspace.id || !threadId) throw new Error("Conversation is not ready.");
  const text = input.text.trim();
  const fileURL = (input.fileURL ?? "").trim();
  if (!text && !fileURL) throw new Error("Please write a message or attach a file.");
  const payload: Record<string, unknown> = {
    companyId: workspace.id,
    threadId,
    text,
    userName: (input.userName ?? "").trim(),
    userPhotoURL: (input.userPhotoURL ?? "").trim(),
  };
  if (fileURL) {
    payload.fileURL = fileURL;
    payload.fileName = (input.fileName ?? "").trim();
    payload.fileType = (input.fileType ?? "").trim();
    payload.fileSize = input.fileSize ?? 0;
  }
  const replyId = (input.replyToMessageId ?? "").trim();
  if (replyId) payload.replyToMessageId = replyId;
  const mentions = (input.mentionedUids ?? []).map((u) => u.trim()).filter(Boolean);
  if (mentions.length) payload.mentionedUids = Array.from(new Set(mentions));
  await call("sendThreadMessage", payload);
}

export async function editThreadMessage(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
  text: string,
): Promise<void> {
  if (!workspace.id || !threadId || !messageId) throw new Error("Message is not ready.");
  await call("editThreadMessage", {
    companyId: workspace.id,
    threadId,
    messageId,
    text: text.trim(),
  });
}

export async function deleteMessageForMe(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
): Promise<void> {
  if (!workspace.id || !threadId || !messageId) return;
  await call("deleteMessageForMe", { companyId: workspace.id, threadId, messageId });
}

export async function deleteMessageForEveryone(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
): Promise<void> {
  if (!workspace.id || !threadId || !messageId) return;
  await call("deleteMessageForEveryone", { companyId: workspace.id, threadId, messageId });
}

export async function uploadMessageFileAndSend(
  workspace: WorkspaceContext,
  threadId: string,
  file: File,
  options: {
    text?: string;
    userName?: string;
    userPhotoURL?: string;
    replyToMessageId?: string;
    mentionedUids?: string[];
  } = {},
): Promise<void> {
  if (!workspace.id || !threadId) throw new Error("Conversation is not ready.");
  if (!file || file.size === 0) throw new Error("Selected file could not be read.");
  const cleanName = (file.name || "Attachment").trim();
  const cleanType = (file.type || "application/octet-stream").trim();
  const uuid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `companies/${workspace.id}/message_files/${threadId}/${uuid}_${cleanName}`;
  const ref = storageRef(storage, storagePath);
  await uploadBytes(ref, file, {
    contentType: cleanType,
    customMetadata: {
      companyId: workspace.id,
      threadId,
      originalFileName: cleanName,
      source: "web_message",
    },
  });
  const downloadUrl = await getDownloadURL(ref);
  await sendThreadMessage(workspace, threadId, {
    text: options.text ?? "",
    userName: options.userName,
    userPhotoURL: options.userPhotoURL,
    replyToMessageId: options.replyToMessageId,
    mentionedUids: options.mentionedUids,
    fileURL: downloadUrl,
    fileName: cleanName,
    fileType: cleanType,
    fileSize: file.size,
  });
}

export async function toggleMessageReaction(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
  emoji: string,
  userName: string = "",
): Promise<void> {
  const cleanEmoji = emoji.trim();
  if (!workspace.id || !threadId || !messageId || !cleanEmoji) return;
  await call("toggleMessageReaction", {
    companyId: workspace.id,
    threadId,
    messageId,
    emoji: cleanEmoji,
    userName: userName.trim(),
  });
}

export async function pinMessageInThread(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
): Promise<void> {
  if (!workspace.id || !threadId || !messageId) return;
  await call("pinMessageInThread", { companyId: workspace.id, threadId, messageId });
}

export async function unpinMessageInThread(
  workspace: WorkspaceContext,
  threadId: string,
  messageId: string,
): Promise<void> {
  if (!workspace.id || !threadId || !messageId) return;
  await call("unpinMessageInThread", { companyId: workspace.id, threadId, messageId });
}

export async function createMessageThread(
  workspace: WorkspaceContext,
  options: { type: "direct" | "group" | string; memberUid?: string; memberUids?: string[]; title?: string },
): Promise<string> {
  if (!workspace.id) return "";
  const payload: Record<string, unknown> = { companyId: workspace.id, type: options.type };
  if (options.memberUid?.trim()) payload.memberUid = options.memberUid.trim();
  const cleanMembers = (options.memberUids ?? []).map((u) => u.trim()).filter(Boolean);
  if (cleanMembers.length) payload.memberUids = Array.from(new Set(cleanMembers));
  if (options.title?.trim()) payload.title = options.title.trim();
  const data = await call<{ threadId?: string }>("createMessageThread", payload);
  return data.threadId ?? "";
}

export async function addMembersToMessageThread(
  workspace: WorkspaceContext,
  threadId: string,
  memberUids: string[],
): Promise<void> {
  const clean = memberUids.map((u) => u.trim()).filter(Boolean);
  if (!workspace.id || !threadId || clean.length === 0) return;
  await call("addMembersToMessageThread", {
    companyId: workspace.id,
    threadId,
    memberUids: Array.from(new Set(clean)),
  });
}

export async function renameMessageThread(
  workspace: WorkspaceContext,
  threadId: string,
  title: string,
): Promise<void> {
  const cleanTitle = title.trim();
  if (!workspace.id || !threadId || !cleanTitle) return;
  await call("renameMessageThread", { companyId: workspace.id, threadId, title: cleanTitle });
}

export async function leaveMessageThread(workspace: WorkspaceContext, threadId: string): Promise<void> {
  if (!workspace.id || !threadId) return;
  await call("leaveMessageThread", { companyId: workspace.id, threadId });
}

export async function removeMemberFromMessageThread(
  workspace: WorkspaceContext,
  threadId: string,
  memberUid: string,
): Promise<void> {
  const cleanUid = memberUid.trim();
  if (!workspace.id || !threadId || !cleanUid) return;
  await call("removeMemberFromMessageThread", {
    companyId: workspace.id,
    threadId,
    memberUid: cleanUid,
  });
}

export type MessageMuteMode = "oneHour" | "today" | "forever" | "unmute" | string;

export async function setMessageThreadMute(
  workspace: WorkspaceContext,
  threadId: string,
  mode: MessageMuteMode,
): Promise<void> {
  if (!workspace.id || !threadId) return;
  await call("setMessageThreadMute", { companyId: workspace.id, threadId, mode: String(mode).trim() });
}

export async function setMessageTypingStatus(
  workspace: WorkspaceContext,
  threadId: string,
  isTyping: boolean,
  userName: string = "",
  userPhotoURL: string = "",
): Promise<void> {
  if (!workspace.id || !threadId) return;
  const fn = isTyping ? "setMessageTypingStatus" : "clearMessageTypingStatus";
  await call(fn, {
    companyId: workspace.id,
    threadId,
    isTyping,
    userName: userName.trim(),
    userPhotoURL: userPhotoURL.trim(),
  });
}

export async function setMessageThreadActive(
  workspace: WorkspaceContext,
  threadId: string,
  isActive: boolean,
): Promise<void> {
  if (!workspace.id || !threadId) return;
  await call("setMessageThreadActive", { companyId: workspace.id, threadId, isActive });
}

export async function getMessageWorkspaceSettings(workspace: WorkspaceContext): Promise<StudioMessageWorkspaceSettings> {
  if (!workspace.id) return { directMessagesEnabled: true, groupConversationsEnabled: true, attachmentsEnabled: true };
  const data = await call<{ settings?: StudioMessageWorkspaceSettings } & Partial<StudioMessageWorkspaceSettings>>(
    "getMessageWorkspaceSettings",
    { companyId: workspace.id },
  );
  const s = data.settings ?? data;
  return {
    directMessagesEnabled: s.directMessagesEnabled ?? true,
    groupConversationsEnabled: s.groupConversationsEnabled ?? true,
    attachmentsEnabled: s.attachmentsEnabled ?? true,
  };
}

export async function setMessageWorkspaceSettings(
  workspace: WorkspaceContext,
  settings: StudioMessageWorkspaceSettings,
): Promise<void> {
  if (!workspace.id) return;
  await call("setMessageWorkspaceSettings", {
    companyId: workspace.id,
    ...settings,
  });
}

// ------------------------------------------------------------------
// Convenience: display helpers
// ------------------------------------------------------------------

export function displayThreadTitle(
  thread: StudioMessageThread,
  currentUid: string,
  members: StudioMessageTeamMember[],
): string {
  const clean = thread.title.trim();
  if (clean) return clean;
  if (thread.type === "team" || thread.id === "team") return "Team Chat";
  if (thread.type === "direct") {
    const otherUid = thread.memberUids.find((u) => u !== currentUid && u);
    const member = members.find((m) => m.id === otherUid);
    return member?.name?.trim() || member?.email || "Direct Message";
  }
  return "Conversation";
}

export function isImageAttachment(item: StudioMessageItem): boolean {
  return !!item.fileURL && item.fileType.toLowerCase().startsWith("image/");
}

export function isFileAttachment(item: StudioMessageItem): boolean {
  return !!item.fileURL && !isImageAttachment(item);
}

export function senderLabel(item: StudioMessageItem): string {
  const name = item.senderName.trim();
  if (name) return name;
  const email = item.senderEmail.trim();
  if (email) {
    return email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }
  return item.senderUid || "User";
}
