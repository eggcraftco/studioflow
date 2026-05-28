"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { loadWorkspaceContext, type WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  addMembersToMessageThread,
  createMessageThread,
  deleteMessageForEveryone,
  deleteMessageForMe,
  displayThreadTitle,
  editThreadMessage,
  getMessageWorkspaceSettings,
  isFileAttachment,
  isImageAttachment,
  leaveMessageThread,
  removeMemberFromMessageThread,
  setMessageWorkspaceSettings,
  listenToMessageThreads,
  listenToThreadMessages,
  listenToTypingUsers,
  loadMessageTeamMembers,
  markMessageThreadRead,
  pinMessageInThread,
  renameMessageThread,
  senderLabel,
  sendThreadMessage,
  setMessageThreadActive,
  setMessageThreadMute,
  setMessageTypingStatus,
  toggleMessageReaction,
  unpinMessageInThread,
  uploadMessageFileAndSend,
  type MessageMuteMode,
  type StudioMessageItem,
  type StudioMessageTeamMember,
  type StudioMessageThread,
  type StudioMessageTypingUser,
  type StudioMessageWorkspaceSettings,
} from "@/lib/studioflow/messages";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "✅", "👀", "🙏"];
const ARCHIVE_KEY = (workspaceId: string, uid: string) => `studio_msg_archive_${workspaceId}_${uid}`;
const SAVED_KEY = (workspaceId: string, uid: string) => `studio_msg_saved_${workspaceId}_${uid}`;
const DRAFT_KEY = (workspaceId: string, uid: string, threadId: string) =>
  `studio_msg_draft_${workspaceId}_${uid}_${threadId}`;

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [threads, setThreads] = useState<StudioMessageThread[]>([]);
  const [teamMembers, setTeamMembers] = useState<StudioMessageTeamMember[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [items, setItems] = useState<StudioMessageItem[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<StudioMessageItem | null>(null);
  const [sending, setSending] = useState(false);
  const [editingMessage, setEditingMessage] = useState<StudioMessageItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<StudioMessageTypingUser[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attachmentFilter, setAttachmentFilter] = useState<"all" | "media" | "files">("all");
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedMap, setSavedMap] = useState<Record<string, string[]>>({});
  const [archiveMap, setArchiveMap] = useState<Record<string, number>>({});
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<StudioMessageItem | null>(null);
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<StudioMessageWorkspaceSettings>({
    directMessagesEnabled: true,
    groupConversationsEnabled: true,
    attachmentsEnabled: true,
  });
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [phoneShowingConversation, setPhoneShowingConversation] = useState(false);
  const [isPhoneLayout, setIsPhoneLayout] = useState(false);
  const [viewerImage, setViewerImage] = useState<StudioMessageItem | null>(null);
  const canEditWorkspace = workspace?.role === "owner" || workspace?.role === "admin";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsPhoneLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // Thread değişince phone'da otomatik conversation göster
    setPhoneShowingConversation(false);
  }, [selectedThreadId]);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ws = await loadWorkspaceContext(user.uid);
      if (cancelled) return;
      setWorkspace(ws);
      setLoadingWorkspace(false);
      try {
        const members = await loadMessageTeamMembers(ws);
        if (!cancelled) setTeamMembers(members);
      } catch {
        /* non-fatal */
      }
      try {
        const settings = await getMessageWorkspaceSettings(ws);
        if (!cancelled) setWorkspaceSettings(settings);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!workspace || !user) return;
    const unsub = listenToMessageThreads(workspace, user.uid, (list) => {
      setThreads(list);
      setSelectedThreadId((current) => {
        if (current && list.some((t) => t.id === current)) return current;
        const team = list.find((t) => t.id === "team");
        return team?.id ?? list[0]?.id ?? "";
      });
    });
    return unsub;
  }, [workspace, user]);

  // localStorage hydration
  useEffect(() => {
    if (!workspace || !user || typeof window === "undefined") return;
    try {
      const savedRaw = window.localStorage.getItem(SAVED_KEY(workspace.id, user.uid));
      if (savedRaw) setSavedMap(JSON.parse(savedRaw));
      const archRaw = window.localStorage.getItem(ARCHIVE_KEY(workspace.id, user.uid));
      if (archRaw) setArchiveMap(JSON.parse(archRaw));
    } catch {
      /* ignore */
    }
  }, [workspace, user]);

  useEffect(() => {
    if (!workspace || !user || !selectedThreadId) {
      setItems([]);
      setTypingUsers([]);
      return;
    }
    const unsubItems = listenToThreadMessages(workspace.id, selectedThreadId, user.uid, setItems);
    const unsubTyping = listenToTypingUsers(workspace.id, selectedThreadId, user.uid, setTypingUsers);
    void markMessageThreadRead(workspace, selectedThreadId).catch(() => {});
    setReplyingTo(null);
    // Load draft for this thread
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem(DRAFT_KEY(workspace.id, user.uid, selectedThreadId));
        setDraft(saved ?? "");
      } else {
        setDraft("");
      }
    } catch {
      setDraft("");
    }
    setSearchVisible(false);
    setSearchQuery("");
    setAttachmentFilter("all");
    setShowSavedOnly(false);
    // Presence heartbeat
    let alive = true;
    const heartbeat = async () => {
      while (alive) {
        try {
          await setMessageThreadActive(workspace, selectedThreadId, true);
        } catch {}
        await new Promise((r) => setTimeout(r, 45_000));
      }
    };
    void heartbeat();
    return () => {
      alive = false;
      unsubItems();
      unsubTyping();
    };
  }, [workspace, user, selectedThreadId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );
  const unreadCount = threads.filter((t) => t.isUnread).length;

  const handleSend = async () => {
    if (!workspace || !user || !selectedThread) return;
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setErrorMessage("");
    try {
      await sendThreadMessage(workspace, selectedThread.id, {
        text,
        userName: user.displayName ?? "",
        userPhotoURL: user.photoURL ?? "",
        replyToMessageId: replyingTo?.id ?? "",
      });
      setDraft("");
      setReplyingTo(null);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(DRAFT_KEY(workspace.id, user.uid, selectedThread.id));
        }
      } catch {}
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (messageId: string, newText: string) => {
    if (!workspace || !selectedThread) return;
    try {
      await editThreadMessage(workspace, selectedThread.id, messageId, newText);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not edit message.");
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!workspace || !selectedThread) return;
    try {
      await deleteMessageForMe(workspace, selectedThread.id, messageId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not delete message.");
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    if (!workspace || !selectedThread) return;
    try {
      await deleteMessageForEveryone(workspace, selectedThread.id, messageId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not delete message.");
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!workspace || !selectedThread || !user) return;
    try {
      await toggleMessageReaction(workspace, selectedThread.id, messageId, emoji, user.displayName ?? "");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not react.");
    }
  };

  const handleTogglePin = async (messageId: string, currentlyPinned: boolean) => {
    if (!workspace || !selectedThread) return;
    try {
      if (currentlyPinned) await unpinMessageInThread(workspace, selectedThread.id, messageId);
      else await pinMessageInThread(workspace, selectedThread.id, messageId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not pin message.");
    }
  };

  const handleSendAttachment = async (file: File) => {
    if (!workspace || !user || !selectedThread || sending) return;
    setSending(true);
    setErrorMessage("");
    try {
      await uploadMessageFileAndSend(workspace, selectedThread.id, file, {
        text: draft.trim(),
        userName: user.displayName ?? "",
        userPhotoURL: user.photoURL ?? "",
        replyToMessageId: replyingTo?.id ?? "",
      });
      setDraft("");
      setReplyingTo(null);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(DRAFT_KEY(workspace.id, user.uid, selectedThread.id));
        }
      } catch {}
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not upload attachment.");
    } finally {
      setSending(false);
    }
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-bubble-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bubble--highlight");
      setTimeout(() => el.classList.remove("bubble--highlight"), 1500);
    }
  };

  const pinnedItems = useMemo(
    () => items.filter((i) => i.pinned && !i.deletedForEveryone),
    [items],
  );

  // ----- typing sender (debounced) -----
  const notifyTyping = () => {
    if (!workspace || !user || !selectedThread) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 4_000) return;
    lastTypingSentRef.current = now;
    void setMessageTypingStatus(workspace, selectedThread.id, true, user.displayName ?? "", user.photoURL ?? "").catch(() => {});
    setTimeout(() => {
      if (workspace && selectedThread) {
        void setMessageTypingStatus(workspace, selectedThread.id, false, user.displayName ?? "", user.photoURL ?? "").catch(() => {});
        lastTypingSentRef.current = 0;
      }
    }, 6_000);
  };

  // ----- saved messages (localStorage) -----
  const savedIds = useMemo(() => new Set(selectedThread ? savedMap[selectedThread.id] ?? [] : []), [savedMap, selectedThread]);
  const handleToggleSaved = (messageId: string) => {
    if (!workspace || !user || !selectedThread) return;
    const tid = selectedThread.id;
    setSavedMap((prev) => {
      const next = { ...prev };
      const arr = new Set(next[tid] ?? []);
      if (arr.has(messageId)) arr.delete(messageId);
      else arr.add(messageId);
      if (arr.size) next[tid] = Array.from(arr);
      else delete next[tid];
      try { window.localStorage.setItem(SAVED_KEY(workspace.id, user.uid), JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ----- archive (localStorage) -----
  const handleToggleArchive = (threadId: string) => {
    if (!workspace || !user) return;
    setArchiveMap((prev) => {
      const next = { ...prev };
      if (threadId in next) delete next[threadId];
      else next[threadId] = Date.now();
      try { window.localStorage.setItem(ARCHIVE_KEY(workspace.id, user.uid), JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ----- forward -----
  const handleForward = async (targetThreadId: string) => {
    if (!workspace || !user || !forwardMessage) return;
    try {
      await sendThreadMessage(workspace, targetThreadId, {
        text: `Forwarded from ${senderLabel(forwardMessage)}\n${forwardMessage.text}`,
        userName: user.displayName ?? "",
        userPhotoURL: user.photoURL ?? "",
        fileURL: forwardMessage.fileURL,
        fileName: forwardMessage.fileName,
        fileType: forwardMessage.fileType,
        fileSize: forwardMessage.fileSize,
      });
      setForwardMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not forward.");
    }
  };

  // ----- group ops -----
  const handleCreateDirect = async (memberUid: string) => {
    if (!workspace) return;
    try {
      const newId = await createMessageThread(workspace, { type: "direct", memberUid });
      if (newId) setSelectedThreadId(newId);
      setNewConvOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create conversation.");
    }
  };
  const handleCreateGroup = async (memberUids: string[], title: string) => {
    if (!workspace || memberUids.length === 0) return;
    try {
      const newId = await createMessageThread(workspace, { type: "group", memberUids, title });
      if (newId) setSelectedThreadId(newId);
      setNewConvOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create group.");
    }
  };
  const handleRenameThread = async (newTitle: string) => {
    if (!workspace || !selectedThread) return;
    try {
      await renameMessageThread(workspace, selectedThread.id, newTitle);
      setRenameOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not rename.");
    }
  };
  const handleAddMembers = async (uids: string[]) => {
    if (!workspace || !selectedThread || uids.length === 0) return;
    try {
      await addMembersToMessageThread(workspace, selectedThread.id, uids);
      setAddMembersOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not add members.");
    }
  };
  const handleRemoveMember = async (memberUid: string) => {
    if (!workspace || !selectedThread) return;
    if (typeof window !== "undefined" && !window.confirm(t("Remove this member from the group?"))) return;
    try {
      await removeMemberFromMessageThread(workspace, selectedThread.id, memberUid);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not remove member.");
    }
  };

  const handleLeave = async () => {
    if (!workspace || !selectedThread) return;
    try {
      await leaveMessageThread(workspace, selectedThread.id);
      setInfoOpen(false);
      setSelectedThreadId("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not leave.");
    }
  };
  const handleSetMute = async (mode: MessageMuteMode) => {
    if (!workspace || !selectedThread) return;
    try {
      await setMessageThreadMute(workspace, selectedThread.id, mode);
      setMuteMenuOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not mute.");
    }
  };

  // ----- filtered items -----
  const displayedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (showSavedOnly && !savedIds.has(item.id)) return false;
      if (attachmentFilter === "media" && !isImageAttachment(item)) return false;
      if (attachmentFilter === "files" && !isFileAttachment(item)) return false;
      if (!q) return true;
      const haystack = [item.text, item.fileName, item.fileType, item.senderName, item.senderEmail].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchQuery, attachmentFilter, showSavedOnly, savedIds]);

  // ----- thread separation: active vs archived -----
  const { activeThreads, archivedThreads } = useMemo(() => {
    const active: StudioMessageThread[] = [];
    const archived: StudioMessageThread[] = [];
    for (const t of threads) {
      const marker = archiveMap[t.id];
      if (marker && (t.lastMessageAtMillis ?? 0) <= marker) archived.push(t);
      else active.push(t);
    }
    return { activeThreads: active, archivedThreads: archived };
  }, [threads, archiveMap]);

  if (authLoading || loadingWorkspace || !user) return <LoadingScreen />;

  return (
    <AppShell>
      <div className={`messages-shell${isPhoneLayout ? (phoneShowingConversation ? " phone-show-conv" : " phone-show-list") : ""}`}>
        <aside className="thread-panel">
          <div className="thread-panel__header">
            <h1>Messages</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {unreadCount > 0 && <span className="badge-pill">{unreadCount}</span>}
              {canEditWorkspace && (
                <button type="button" className="new-conv-btn" onClick={() => setSettingsDialogOpen(true)} title={t("Message settings")} style={{ background: "#6b7280" }}>⚙</button>
              )}
              {(workspaceSettings.directMessagesEnabled || workspaceSettings.groupConversationsEnabled) && (
                <button type="button" className="new-conv-btn" onClick={() => setNewConvOpen(true)} title={t("New conversation")}>+</button>
              )}
            </div>
          </div>
          {threads.length === 0 ? (
            <div className="thread-panel__empty">No conversations yet.</div>
          ) : (
            <ul className="thread-list">
              {activeThreads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  currentUid={user.uid}
                  members={teamMembers}
                  selected={thread.id === selectedThreadId}
                  archived={false}
                  onSelect={() => { setSelectedThreadId(thread.id); setPhoneShowingConversation(true); }}
                  onToggleArchive={() => handleToggleArchive(thread.id)}
                />
              ))}
              {archivedThreads.length > 0 && (
                <li className="archived-header">
                  <button type="button" onClick={() => setArchivedExpanded((v) => !v)}>
                    🗄️ Archived ({archivedThreads.length}) {archivedExpanded ? "▴" : "▾"}
                  </button>
                </li>
              )}
              {archivedExpanded && archivedThreads.map((thread) => (
                <ThreadRow
                  key={`arch_${thread.id}`}
                  thread={thread}
                  currentUid={user.uid}
                  members={teamMembers}
                  selected={thread.id === selectedThreadId}
                  archived
                  onSelect={() => { setSelectedThreadId(thread.id); setPhoneShowingConversation(true); }}
                  onToggleArchive={() => handleToggleArchive(thread.id)}
                />
              ))}
            </ul>
          )}
        </aside>

        <section className="conversation-panel">
          {!selectedThread ? (
            <div className="conversation-panel__empty">Select a conversation to view messages.</div>
          ) : (
            <>
              <header className="conversation-panel__header">
                {isPhoneLayout && (
                  <button
                    type="button"
                    className="header-icon-btn"
                    onClick={() => setPhoneShowingConversation(false)}
                    title="Back"
                    style={{ fontSize: 18, padding: "6px 8px" }}
                  >
                    ‹
                  </button>
                )}
                <ThreadAvatar thread={selectedThread} currentUid={user.uid} members={teamMembers} />
                <div style={{ flex: 1 }}>
                  <h2>{displayThreadTitle(selectedThread, user.uid, teamMembers)}</h2>
                  <p>{conversationSubtitle(selectedThread, t)}</p>
                </div>
                <div className="header-actions">
                  <button type="button" className={`header-icon-btn${showSavedOnly ? " active" : ""}`} title="Saved" onClick={() => setShowSavedOnly((v) => !v)}>
                    <HeaderIcon name="bookmark" />
                  </button>
                  <button type="button" className={`header-icon-btn${searchVisible ? " active" : ""}`} title="Search" onClick={() => { setSearchVisible((v) => !v); if (searchVisible) setSearchQuery(""); }}>
                    <HeaderIcon name="search" />
                  </button>
                  <div style={{ position: "relative" }}>
                    <button type="button" className="header-icon-btn" title="Mute" onClick={() => setMuteMenuOpen((v) => !v)}>
                      <HeaderIcon name="bellSlash" />
                    </button>
                    {muteMenuOpen && (
                      <div className="header-menu" onMouseLeave={() => setMuteMenuOpen(false)}>
                        <button type="button" onClick={() => void handleSetMute("oneHour")}>Mute 1 hour</button>
                        <button type="button" onClick={() => void handleSetMute("today")}>Mute today</button>
                        <button type="button" onClick={() => void handleSetMute("forever")}>Mute until I unmute</button>
                        <button type="button" onClick={() => void handleSetMute("unmute")}>Unmute</button>
                      </div>
                    )}
                  </div>
                  <button type="button" className="header-icon-btn" title="Info" onClick={() => setInfoOpen(true)}>
                    <HeaderIcon name="info" />
                  </button>
                </div>
              </header>
              {errorMessage && <div className="conversation-error">{errorMessage}</div>}
              {searchVisible && (
                <div className="search-bar">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("Search messages…")} autoFocus style={{ flex: 1 }} />
                    {searchQuery.trim() && (() => {
                      const matches = items.filter((m) => !m.deletedForEveryone && m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()));
                      if (matches.length === 0) return <span style={{ fontSize: 12, color: "#9ca3af" }}>No results</span>;
                      const goNext = () => { handleJumpToMessage(matches[matches.length - 1].id); };
                      const goPrev = () => { handleJumpToMessage(matches[0].id); };
                      return (
                        <>
                          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{matches.length} match{matches.length === 1 ? "" : "es"}</span>
                          <button type="button" onClick={goPrev} title="Oldest match" style={{ background: "transparent", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>↑</button>
                          <button type="button" onClick={goNext} title="Latest match" style={{ background: "transparent", border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>↓</button>
                        </>
                      );
                    })()}
                  </div>
                  <div className="filter-chips">
                    {(["all", "media", "files"] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`filter-chip${attachmentFilter === key ? " active" : ""}`}
                        onClick={() => setAttachmentFilter(key)}
                      >
                        {key === "all" ? "All" : key === "media" ? "Media" : t("Files")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {pinnedItems.length > 0 && (
                <PinnedBar items={pinnedItems} onJump={handleJumpToMessage} />
              )}
              <ConversationBody
                items={displayedItems}
                savedIds={savedIds}
                currentUid={user.uid}
                thread={selectedThread}
                onReply={(m) => setReplyingTo(m)}
                onEdit={(m) => setEditingMessage(m)}
                onDeleteForMe={(m) => void handleDeleteForMe(m.id)}
                onDeleteForEveryone={(m) => void handleDeleteForEveryone(m.id)}
                onToggleReaction={(m, emoji) => void handleToggleReaction(m.id, emoji)}
                onTogglePin={(m) => void handleTogglePin(m.id, m.pinned)}
                onToggleSaved={(m) => handleToggleSaved(m.id)}
                onForward={(m) => setForwardMessage(m)}
                onOpenImage={(m) => setViewerImage(m)}
              />
              {typingUsers.length > 0 && (
                <div className="typing-indicator" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-flex", gap: -6 }}>
                    {typingUsers.slice(0, 3).map((u) => {
                      const initial = (u.name || u.email || "?").charAt(0).toUpperCase();
                      const hue = (((u.id || u.email || u.name || "x").split("").reduce((h, c) => h + c.charCodeAt(0), 0)) % 360);
                      return u.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u.id} src={u.photoURL} alt="" width={18} height={18} style={{ borderRadius: "50%", border: "1.5px solid white", marginLeft: -4 }} />
                      ) : (
                        <span key={u.id} style={{ width: 18, height: 18, borderRadius: "50%", background: `hsl(${hue}, 50%, 60%)`, color: "white", fontSize: 9, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid white", marginLeft: -4 }}>{initial}</span>
                      );
                    })}
                  </span>
                  <span>•••</span>
                  <span>
                  {typingUsers.length === 1
                    ? `${typingUsers[0].name || t("Someone")} is typing…`
                    : `${typingUsers.length} people are typing…`}
                  </span>
                </div>
              )}
              <Composer
                draft={draft}
                onChange={(v) => {
                  setDraft(v);
                  notifyTyping();
                  try {
                    if (typeof window !== "undefined" && workspace) {
                      const key = DRAFT_KEY(workspace.id, user.uid, selectedThread.id);
                      if (v) window.localStorage.setItem(key, v);
                      else window.localStorage.removeItem(key);
                    }
                  } catch {}
                }}
                onSend={handleSend}
                onSendAttachment={handleSendAttachment}
                replyingTo={replyingTo}
                onClearReply={() => setReplyingTo(null)}
                sending={sending}
                teamMembers={teamMembers}
                attachmentsEnabled={workspaceSettings.attachmentsEnabled}
              />
            </>
          )}
        </section>
      </div>

      {newConvOpen && (
        <NewConversationDialog
          teamMembers={teamMembers.filter((m) => m.id !== user.uid)}
          allowDirect={workspaceSettings.directMessagesEnabled}
          allowGroup={workspaceSettings.groupConversationsEnabled}
          onCancel={() => setNewConvOpen(false)}
          onCreateDirect={(uid) => void handleCreateDirect(uid)}
          onCreateGroup={(uids, title) => void handleCreateGroup(uids, title)}
        />
      )}

      {infoOpen && selectedThread && (
        <ThreadInfoDialog
          thread={selectedThread}
          currentUid={user.uid}
          teamMembers={teamMembers}
          canRemoveMembers={canEditWorkspace || workspace?.role === "member"}
          onClose={() => setInfoOpen(false)}
          onRename={() => { setInfoOpen(false); setRenameOpen(true); }}
          onAddMembers={() => { setInfoOpen(false); setAddMembersOpen(true); }}
          onLeave={() => void handleLeave()}
          onRemoveMember={(uid) => void handleRemoveMember(uid)}
        />
      )}

      {renameOpen && selectedThread && (
        <RenameDialog
          initialTitle={selectedThread.title}
          onCancel={() => setRenameOpen(false)}
          onSave={(t) => void handleRenameThread(t)}
        />
      )}

      {addMembersOpen && selectedThread && (
        <AddMembersDialog
          available={teamMembers.filter((m) => m.id !== user.uid && !selectedThread.memberUids.includes(m.id))}
          onCancel={() => setAddMembersOpen(false)}
          onAdd={(uids) => void handleAddMembers(uids)}
        />
      )}

      {forwardMessage && (
        <ForwardDialog
          threads={threads.filter((t) => t.id !== selectedThread?.id)}
          currentUid={user.uid}
          teamMembers={teamMembers}
          onCancel={() => setForwardMessage(null)}
          onForward={(tid) => void handleForward(tid)}
        />
      )}

      {viewerImage && (
        <ImageViewerModal
          item={viewerImage}
          gallery={items.filter((m) => isImageAttachment(m) && !m.deletedForEveryone)}
          onChange={(m) => setViewerImage(m)}
          onClose={() => setViewerImage(null)}
        />
      )}

      {settingsDialogOpen && workspace && (
        <MessageSettingsDialog
          initial={workspaceSettings}
          onCancel={() => setSettingsDialogOpen(false)}
          onSave={async (s) => {
            setWorkspaceSettings(s);
            try {
              await setMessageWorkspaceSettings(workspace, s);
              setSettingsDialogOpen(false);
            } catch (err) {
              setErrorMessage(err instanceof Error ? err.message : "Could not save settings.");
            }
          }}
        />
      )}

      {editingMessage && (
        <EditDialog
          initialText={editingMessage.text}
          onCancel={() => setEditingMessage(null)}
          onSave={(text) => {
            void handleEdit(editingMessage.id, text);
            setEditingMessage(null);
          }}
        />
      )}

      <MessagesStyles />
    </AppShell>
  );
}

function ConversationBody({
  items,
  savedIds,
  currentUid,
  thread,
  onReply,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onToggleReaction,
  onTogglePin,
  onToggleSaved,
  onForward,
  onOpenImage,
}: {
  items: StudioMessageItem[];
  savedIds: Set<string>;
  currentUid: string;
  thread: StudioMessageThread | null;
  onReply: (m: StudioMessageItem) => void;
  onEdit: (m: StudioMessageItem) => void;
  onDeleteForMe: (m: StudioMessageItem) => void;
  onDeleteForEveryone: (m: StudioMessageItem) => void;
  onToggleReaction: (m: StudioMessageItem, emoji: string) => void;
  onTogglePin: (m: StudioMessageItem) => void;
  onToggleSaved: (m: StudioMessageItem) => void;
  onForward: (m: StudioMessageItem) => void;
  onOpenImage: (m: StudioMessageItem) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) {
    return <div className="conversation-panel__empty">No messages yet.</div>;
  }
  return (
    <div className="conversation-panel__body">
      {items.map((item, idx) => {
        const prev = idx > 0 ? items[idx - 1] : null;
        const showDateSep = !prev || !sameDay(prev.createdAtMillis, item.createdAtMillis);
        return (
        <React.Fragment key={item.id}>
        {showDateSep && (
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 4px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", background: "rgba(0,0,0,0.04)", padding: "3px 12px", borderRadius: 999 }}>
              {formatDateSep(item.createdAtMillis)}
            </span>
          </div>
        )}
        <MessageBubble
          item={item}
          isMine={item.senderUid === currentUid}
          currentUid={currentUid}
          saved={savedIds.has(item.id)}
          readByCount={(() => {
            if (!thread || item.senderUid !== currentUid) return 0;
            const ts = item.createdAtMillis;
            return Object.entries(thread.readByMillis || {}).filter(([uid, t]) => uid !== currentUid && (t as number) >= ts).length;
          })()}
          totalReaderCount={thread ? Math.max(0, (thread.memberUids?.length || 0) - 1) : 0}
          onReply={() => onReply(item)}
          onEdit={() => onEdit(item)}
          onDeleteForMe={() => onDeleteForMe(item)}
          onDeleteForEveryone={() => onDeleteForEveryone(item)}
          onToggleReaction={(emoji) => onToggleReaction(item, emoji)}
          onTogglePin={() => onTogglePin(item)}
          onToggleSaved={() => onToggleSaved(item)}
          onForward={() => onForward(item)}
          onOpenImage={() => onOpenImage(item)}
        />
        </React.Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function PinnedBar({
  items,
  onJump,
}: {
  items: StudioMessageItem[];
  onJump: (messageId: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  return (
    <div className="pinned-bar">
      <div className="pinned-bar__title">📌 {items.length} pinned</div>
      <div className="pinned-bar__list">
        {items.slice(0, 5).map((item) => (
          <button
            key={item.id}
            type="button"
            className="pinned-chip"
            onClick={() => onJump(item.id)}
          >
            <span className="pinned-chip__sender">{senderLabel(item)}</span>
            <span className="pinned-chip__text">
              {item.text.trim() || item.fileName || t("Attachment")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({
  draft,
  onChange,
  onSend,
  onSendAttachment,
  replyingTo,
  onClearReply,
  sending,
  teamMembers,
  attachmentsEnabled,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSendAttachment: (file: File) => void;
  replyingTo: StudioMessageItem | null;
  onClearReply: () => void;
  sending: boolean;
  teamMembers: StudioMessageTeamMember[];
  attachmentsEnabled: boolean;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = draft.trim().length > 0 && !sending;

  const mentionQuery = useMemo(() => {
    const cursor = textareaRef.current?.selectionEnd ?? draft.length;
    const upTo = draft.slice(0, cursor);
    const atIdx = upTo.lastIndexOf("@");
    if (atIdx < 0) return null;
    const before = atIdx === 0 ? " " : upTo[atIdx - 1];
    if (!/\s/.test(before) && atIdx !== 0) return null;
    const token = upTo.slice(atIdx + 1);
    if (token.includes(" ") || token.includes("\n")) return null;
    return token;
  }, [draft]);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return teamMembers
      .filter(
        (m) =>
          !q ||
          (m.name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, teamMembers]);

  const insertMention = (member: StudioMessageTeamMember) => {
    const cursor = textareaRef.current?.selectionEnd ?? draft.length;
    const upTo = draft.slice(0, cursor);
    const atIdx = upTo.lastIndexOf("@");
    if (atIdx < 0) return;
    const before = draft.slice(0, atIdx);
    const after = draft.slice(cursor);
    const insertion = `@${(member.name || member.email).trim()} `;
    onChange(before + insertion + after);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <footer className="conversation-panel__footer">
      {replyingTo && (
        <div className="reply-chip">
          <div className="reply-chip__body">
            <div className="reply-chip__title">Replying to {senderLabel(replyingTo)}</div>
            <div className="reply-chip__preview">
              {replyingTo.text.trim() || replyingTo.fileName || t("Attachment")}
            </div>
          </div>
          <button type="button" className="reply-chip__close" onClick={onClearReply}>
            ×
          </button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mention-picker">
          {suggestions.map((m) => (
            <button key={m.id} type="button" onClick={() => insertMention(m)}>
              <span className="mention-picker__avatar">
                {(m.name || m.email || "?").charAt(0).toUpperCase()}
              </span>
              <span className="mention-picker__name">{m.name || m.email}</span>
              {m.email && m.name && (
                <span className="mention-picker__email">{m.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSendAttachment(f);
            e.target.value = "";
          }}
        />
        {attachmentsEnabled && (
          <button
            type="button"
            className="composer__attach"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            title={t("Attach file")}
          >
            📎
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("Write a message…")}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <button type="button" className="composer__send" onClick={onSend} disabled={!canSend}>
          {sending ? "…" : t("Send")}
        </button>
      </div>
    </footer>
  );
}

function HeaderIcon({ name }: { name: "bookmark" | "search" | "bellSlash" | "info" }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "bookmark":
      return <svg {...props}><path d="M6 4h12v17l-6-4-6 4z" /></svg>;
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>;
    case "bellSlash":
      return <svg {...props}><path d="M6 8a6 6 0 0 1 9.6-4.8" /><path d="M18 12c0 5 2 6 2 6H6" /><path d="M10 20a2 2 0 0 0 4 0" /><path d="M3 3l18 18" /></svg>;
    case "info":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 8v.5" strokeLinecap="round" /></svg>;
  }
}

function parseForwardedText(text: string): { forwardedFrom: string | null; body: string } {
  const m = text.match(/^Forwarded from ([^\n]+)\n([\s\S]*)$/);
  if (m) return { forwardedFrom: m[1].trim(), body: m[2] };
  return { forwardedFrom: null, body: text };
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateSep(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (sameDay(ms, today.getTime())) return "Today";
  if (sameDay(ms, yest.getTime())) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

function firstUrlInText(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  return m ? (m[0].startsWith("http") ? m[0] : `https://${m[0]}`) : null;
}

function LinkPreviewCard({ url }: { url: string }) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 6,
        padding: "8px 10px",
        background: "rgba(45, 123, 244, 0.06)",
        border: "1px solid rgba(45, 123, 244, 0.18)",
        borderRadius: 10,
        textDecoration: "none",
        color: "inherit",
        maxWidth: 320,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={favicon} alt="" width={28} height={28} style={{ borderRadius: 6, background: "white", padding: 2, border: "1px solid #e5e7eb" }} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", lineHeight: 1.2 }}>{host}</span>
        <span style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{url}</span>
      </div>
    </a>
  );
}

function renderMessageText(text: string): React.ReactNode {
  // Split text into segments preserving @mentions and URLs as styled spans
  const pattern = /(@[\wÀ-￿.\-]+|https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("@")) {
      return (
        <span key={i} style={{ color: "#2D7BF4", fontWeight: 700 }}>{part}</span>
      );
    }
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#2D7BF4", textDecoration: "underline" }} onClick={(e) => e.stopPropagation()}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MessageBubble({
  item,
  isMine,
  currentUid,
  saved,
  readByCount,
  totalReaderCount,
  onReply,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onToggleReaction,
  onTogglePin,
  onToggleSaved,
  onForward,
  onOpenImage,
}: {
  item: StudioMessageItem;
  isMine: boolean;
  currentUid: string;
  saved: boolean;
  readByCount: number;
  totalReaderCount: number;
  onReply: () => void;
  onEdit: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onToggleReaction: (emoji: string) => void;
  onTogglePin: () => void;
  onToggleSaved: () => void;
  onForward: () => void;
  onOpenImage: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const alignment = isMine ? "right" : "left";
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const canEdit = isMine && !item.deletedForEveryone && !!item.text && !item.fileURL;

  return (
    <div className={`bubble-row bubble-row--${alignment}`}>
      {!isMine && (() => {
        const label = senderLabel(item);
        const initial = (label || "?").charAt(0).toUpperCase();
        const hue = (((item.senderUid || item.senderEmail || label).split("").reduce((h, c) => h + c.charCodeAt(0), 0)) % 360);
        return (
          <span className="bubble-sender" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {item.senderPhotoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.senderPhotoURL} alt="" width={20} height={20} style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid #e5e7eb" }} />
            ) : (
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: `hsl(${hue}, 50%, 60%)`, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{initial}</span>
            )}
            {label}
          </span>
        );
      })()}
      <div
        data-bubble-id={item.id}
        className={`bubble bubble--${alignment}${isMine ? " bubble--mine" : ""}`}
        onContextMenu={(e) => {
          if (item.deletedForEveryone) return;
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        {item.replyToMessageId && (
          <div className="reply-quote">
            <div className="reply-quote__sender">
              {item.replyToSenderName || t("Someone")}
            </div>
            <div className="reply-quote__preview">
              {item.replyToText || item.replyToFileName || t("Attachment")}
            </div>
          </div>
        )}
        {item.deletedForEveryone ? (
          <em className="bubble__deleted">Message deleted</em>
        ) : (
          <>
            {item.fileURL && (
              <div className="bubble__attachment">
                {isImageAttachment(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.fileURL}
                    alt={item.fileName || t("Attachment")}
                    style={{ cursor: "zoom-in" }}
                    onClick={(e) => { e.stopPropagation(); onOpenImage(); }}
                  />
                ) : (
                  <a href={item.fileURL} target="_blank" rel="noreferrer">
                    📎 {item.fileName || t("Attachment")}
                  </a>
                )}
              </div>
            )}
            {item.text && (() => {
              const parsed = parseForwardedText(item.text);
              return (
                <>
                  {parsed.forwardedFrom && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4, fontStyle: "italic" }}>
                      <span>↪</span>
                      <span>Forwarded from {parsed.forwardedFrom}</span>
                    </div>
                  )}
                  {parsed.body && <span className="bubble__text">{renderMessageText(parsed.body)}</span>}
                  {parsed.body && firstUrlInText(parsed.body) && (
                    <LinkPreviewCard url={firstUrlInText(parsed.body)!} />
                  )}
                </>
              );
            })()}
          </>
        )}
        <span className="bubble__meta">
          {saved && <span className="bubble__pin">🔖</span>}
          {item.pinned && <span className="bubble__pin">📌</span>}
          {formatTime(item.createdAtMillis)}
          {item.edited && !item.deletedForEveryone && <em> · edited</em>}
          {isMine && totalReaderCount > 0 && (
            <span title={`Read by ${readByCount} of ${totalReaderCount}`} style={{ marginLeft: 4, color: readByCount > 0 ? "#2D7BF4" : "#9ca3af", fontWeight: 700 }}>
              {readByCount > 0 ? "✓✓" : "✓"}{readByCount > 0 && totalReaderCount > 1 ? ` ${readByCount}` : ""}
            </span>
          )}
        </span>
        {Object.keys(item.reactions).length > 0 && (
          <div className="reactions">
            {Object.entries(item.reactions).map(([emoji, users]) => {
              const mine = currentUid in users;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`reaction-pill${mine ? " reaction-pill--mine" : ""}`}
                  onClick={() => onToggleReaction(emoji)}
                >
                  <span>{emoji}</span>
                  <span className="reaction-pill__count">{Object.keys(users).length}</span>
                </button>
              );
            })}
          </div>
        )}
        {!item.deletedForEveryone && (
          <button
            type="button"
            className="bubble__kebab"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={t("Message actions")}
          >
            ⋮
          </button>
        )}
        {menuOpen && (
          <div className="bubble-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button type="button" onClick={() => { setMenuOpen(false); setReactionPickerOpen(true); }}>
              React
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onReply(); }}>
              Reply
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onForward(); }}>
              Forward
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onToggleSaved(); }}>
              {saved ? "Unsave" : t("Save")}
            </button>
            {item.text && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(item.text).catch(() => {});
                  setMenuOpen(false);
                }}
              >
                Copy text
              </button>
            )}
            {item.fileURL && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(item.fileURL).catch(() => {});
                  setMenuOpen(false);
                }}
              >
                Copy attachment link
              </button>
            )}
            <button type="button" onClick={() => { setMenuOpen(false); onTogglePin(); }}>
              {item.pinned ? "Unpin" : t("Pin")}
            </button>
            {canEdit && (
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }}>
                Edit
              </button>
            )}
            <button type="button" onClick={() => { setMenuOpen(false); onDeleteForMe(); }}>
              Delete for me
            </button>
            {isMine && (
              <button type="button" onClick={() => { setMenuOpen(false); onDeleteForEveryone(); }}>
                Delete for everyone
              </button>
            )}
          </div>
        )}
        {reactionPickerOpen && (
          <div className="reaction-picker" onMouseLeave={() => setReactionPickerOpen(false)}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onToggleReaction(emoji); setReactionPickerOpen(false); }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageViewerModal({
  item,
  gallery,
  onChange,
  onClose,
}: {
  item: StudioMessageItem;
  gallery: StudioMessageItem[];
  onChange: (next: StudioMessageItem) => void;
  onClose: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const idx = gallery.findIndex((m) => m.id === item.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < gallery.length - 1;
  const goPrev = () => { if (hasPrev) { onChange(gallery[idx - 1]); setScale(1); setOffset({ x: 0, y: 0 }); } };
  const goNext = () => { if (hasNext) { onChange(gallery[idx + 1]); setScale(1); setOffset({ x: 0, y: 0 }); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, idx, gallery.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)",
          border: "none", color: "white", borderRadius: "50%", width: 36, height: 36,
          fontSize: 18, cursor: "pointer", zIndex: 1,
        }}
        aria-label="Close"
      >×</button>
      {gallery.length > 1 && (
        <span style={{ position: "absolute", top: 22, left: 22, color: "white", fontSize: 13, fontWeight: 700, background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: 999, zIndex: 1 }}>
          {idx + 1} / {gallery.length}
        </span>
      )}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.18)", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 22, cursor: "pointer", zIndex: 1 }}
          aria-label="Previous"
        >‹</button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.18)", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 22, cursor: "pointer", zIndex: 1 }}
          aria-label="Next"
        >›</button>
      )}
      {scale !== 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setScale(1); setOffset({ x: 0, y: 0 }); }}
          style={{
            position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,0.15)",
            border: "none", color: "white", borderRadius: 16, padding: "6px 12px",
            fontSize: 12, cursor: "pointer", fontWeight: 700, zIndex: 1,
          }}
        >Reset zoom</button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.fileURL}
        alt={item.fileName || t("Image")}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); } else setScale(2.5);
        }}
        onWheel={(e) => {
          e.stopPropagation();
          const delta = -e.deltaY * 0.002;
          setScale((s) => Math.min(6, Math.max(1, s + delta)));
        }}
        onMouseDown={(e) => {
          if (scale <= 1) return;
          e.preventDefault();
          dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setOffset({
            x: dragRef.current.ox + (e.clientX - dragRef.current.x),
            y: dragRef.current.oy + (e.clientY - dragRef.current.y),
          });
        }}
        onMouseUp={() => { dragRef.current = null; }}
        onMouseLeave={() => { dragRef.current = null; }}
        style={{
          maxWidth: "92vw", maxHeight: "88vh", userSelect: "none",
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          cursor: scale > 1 ? "grab" : "zoom-in",
          transition: dragRef.current ? "none" : "transform 0.15s ease-out",
        }}
        draggable={false}
      />
      {item.fileName && (
        <div
          style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.85)", fontSize: 13,
          }}
        >{item.fileName}</div>
      )}
    </div>
  );
}

function EditDialog({
  initialText,
  onCancel,
  onSave,
}: {
  initialText: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [text, setText] = useState(initialText);
  const dirty = text.trim().length > 0 && text.trim() !== initialText.trim();
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3>Edit message</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!dirty} onClick={() => onSave(text.trim())} className="primary">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function NewConversationDialog({
  teamMembers,
  allowDirect,
  allowGroup,
  onCancel,
  onCreateDirect,
  onCreateGroup,
}: {
  teamMembers: StudioMessageTeamMember[];
  allowDirect: boolean;
  allowGroup: boolean;
  onCancel: () => void;
  onCreateDirect: (uid: string) => void;
  onCreateGroup: (uids: string[], title: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [groupMode, setGroupMode] = useState(!allowDirect && allowGroup);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card dialog-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{groupMode ? t("New group") : t("New direct message")}</h3>
        {allowDirect && allowGroup && (
          <div className="dialog-tabs">
            <button type="button" className={!groupMode ? "active" : ""} onClick={() => { setGroupMode(false); setSelected(new Set()); }}>Direct</button>
            <button type="button" className={groupMode ? "active" : ""} onClick={() => setGroupMode(true)}>Group</button>
          </div>
        )}
        {groupMode && (
          <input type="text" placeholder={t("Group title (optional)")} value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", marginBottom: 8, padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }} />
        )}
        <div className="member-list">
          {teamMembers.map((m) => {
            const checked = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`member-row${checked ? " selected" : ""}`}
                onClick={() => {
                  if (groupMode) {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    });
                  } else {
                    setSelected(new Set([m.id]));
                  }
                }}
              >
                {groupMode && <input type="checkbox" checked={checked} readOnly />}
                <span className="member-row__avatar">{(m.name || m.email || "?").charAt(0).toUpperCase()}</span>
                <div className="member-row__body">
                  <div>{m.name || m.email}</div>
                  {m.email && m.name && <small>{m.email}</small>}
                </div>
                {!groupMode && checked && <span>✓</span>}
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={groupMode ? selected.size < 2 : selected.size !== 1}
            onClick={() => {
              if (groupMode) onCreateGroup(Array.from(selected), title.trim());
              else { const uid = Array.from(selected)[0]; if (uid) onCreateDirect(uid); }
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadInfoDialog({
  thread,
  currentUid,
  teamMembers,
  canRemoveMembers,
  onClose,
  onRename,
  onAddMembers,
  onLeave,
  onRemoveMember,
}: {
  thread: StudioMessageThread;
  currentUid: string;
  teamMembers: StudioMessageTeamMember[];
  canRemoveMembers: boolean;
  onClose: () => void;
  onRename: () => void;
  onAddMembers: () => void;
  onLeave: () => void;
  onRemoveMember: (uid: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const isTeam = thread.type === "team" || thread.id === "team";
  const isGroup = thread.type === "group";
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3>{displayThreadTitle(thread, currentUid, teamMembers)}</h3>
        <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>{thread.memberUids.length} members</p>
        <div className="member-list" style={{ maxHeight: 240, marginTop: 12 }}>
          {thread.memberUids.map((uid) => {
            const m = teamMembers.find((x) => x.id === uid);
            const showRemove = isGroup && canRemoveMembers && uid !== currentUid;
            return (
              <div key={uid} className="member-row" style={{ cursor: "default" }}>
                <span className="member-row__avatar">{((m?.name || m?.email || "?").charAt(0)).toUpperCase()}</span>
                <span style={{ flex: 1 }}>{m?.name || m?.email || uid}</span>
                {showRemove && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(uid)}
                    title={t("Remove from group")}
                    style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "4px 8px" }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          {isGroup && <button type="button" onClick={onRename}>Rename</button>}
          {isGroup && <button type="button" onClick={onAddMembers}>Add members</button>}
          {!isTeam && <button type="button" onClick={onLeave}>Leave</button>}
          <button type="button" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({
  initialTitle,
  onCancel,
  onSave,
}: {
  initialTitle: string;
  onCancel: () => void;
  onSave: (t: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [title, setTitle] = useState(initialTitle);
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3>Rename group</h3>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }} />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={!title.trim()} onClick={() => onSave(title.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

function AddMembersDialog({
  available,
  onCancel,
  onAdd,
}: {
  available: StudioMessageTeamMember[];
  onCancel: () => void;
  onAdd: (uids: string[]) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card dialog-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Add people</h3>
        <div className="member-list">
          {available.map((m) => {
            const checked = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`member-row${checked ? " selected" : ""}`}
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  });
                }}
              >
                <input type="checkbox" checked={checked} readOnly />
                <span className="member-row__avatar">{(m.name || m.email || "?").charAt(0).toUpperCase()}</span>
                <span>{m.name || m.email}</span>
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={selected.size === 0} onClick={() => onAdd(Array.from(selected))}>Add</button>
        </div>
      </div>
    </div>
  );
}

function ForwardDialog({
  threads,
  currentUid,
  teamMembers,
  onCancel,
  onForward,
}: {
  threads: StudioMessageThread[];
  currentUid: string;
  teamMembers: StudioMessageTeamMember[];
  onCancel: () => void;
  onForward: (threadId: string) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card dialog-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Forward to…</h3>
        <div className="member-list">
          {threads.map((t) => (
            <button key={t.id} type="button" className="member-row" onClick={() => onForward(t.id)}>
              <span className="member-row__avatar">{displayThreadTitle(t, currentUid, teamMembers).charAt(0).toUpperCase()}</span>
              <span>{displayThreadTitle(t, currentUid, teamMembers)}</span>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function MessageSettingsDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: StudioMessageWorkspaceSettings;
  onCancel: () => void;
  onSave: (s: StudioMessageWorkspaceSettings) => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [direct, setDirect] = useState(initial.directMessagesEnabled);
  const [group, setGroup] = useState(initial.groupConversationsEnabled);
  const [attachments, setAttachments] = useState(initial.attachmentsEnabled);
  const dirty =
    direct !== initial.directMessagesEnabled ||
    group !== initial.groupConversationsEnabled ||
    attachments !== initial.attachmentsEnabled;
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3>Message settings (admin)</h3>
        <p style={{ color: "#6b7280", fontSize: 12, margin: "4px 0 16px" }}>
          Control workspace-wide messaging permissions for the team.
        </p>
        <label className="setting-row">
          <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Allow Direct Messages</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Team members can start one-to-one conversations.</div>
          </div>
        </label>
        <label className="setting-row">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Allow Group Conversations</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Team members can add people and create group chats.</div>
          </div>
        </label>
        <label className="setting-row">
          <input type="checkbox" checked={attachments} onChange={(e) => setAttachments(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Allow File &amp; Image Sending</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Team members can send images and files in Messages.</div>
          </div>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={!dirty}
            onClick={() => onSave({ directMessagesEnabled: direct, groupConversationsEnabled: group, attachmentsEnabled: attachments })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  currentUid,
  members,
  selected,
  archived,
  onSelect,
  onToggleArchive,
}: {
  thread: StudioMessageThread;
  currentUid: string;
  members: StudioMessageTeamMember[];
  selected: boolean;
  archived: boolean;
  onSelect: () => void;
  onToggleArchive: () => void;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = displayThreadTitle(thread, currentUid, members);
  const time = thread.lastMessageAtMillis ? relativeTime(thread.lastMessageAtMillis) : "";
  return (
    <li style={{ position: "relative" }}>
      <button
        type="button"
        className={`thread-row${selected ? " thread-row--selected" : ""}`}
        onClick={onSelect}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      >
        <ThreadAvatar thread={thread} currentUid={currentUid} members={members} />
        <div className="thread-row__body">
          <div className="thread-row__line">
            <span className={`thread-row__title${thread.isUnread ? " unread" : ""}`}>{title}</span>
            {time && <span className="thread-row__time">{time}</span>}
          </div>
          <div className="thread-row__line">
            <span className={`thread-row__preview${thread.isUnread ? " unread" : ""}`}>
              {thread.lastMessageText.trim() ||
                (thread.id === "team" ? t("Workspace conversation") : t("Tap to start the conversation"))}
            </span>
            {thread.isUnread && <span className="thread-row__dot" />}
          </div>
        </div>
      </button>
      {menuOpen && (
        <div className="thread-row__menu" onMouseLeave={() => setMenuOpen(false)}>
          <button type="button" onClick={() => { setMenuOpen(false); onToggleArchive(); }}>
            {archived ? "Unarchive" : t("Archive")}
          </button>
        </div>
      )}
    </li>
  );
}

function ThreadAvatar({
  thread,
  currentUid,
  members,
}: {
  thread: StudioMessageThread;
  currentUid: string;
  members: StudioMessageTeamMember[];
}) {
  const initials = (() => {
    if (thread.type === "team" || thread.id === "team") return "T";
    if (thread.type === "direct") {
      const otherUid = thread.memberUids.find((u) => u !== currentUid && u);
      const member = members.find((m) => m.id === otherUid);
      const label = member?.name?.trim() || member?.email || displayThreadTitle(thread, currentUid, members);
      return label.charAt(0).toUpperCase();
    }
    return displayThreadTitle(thread, currentUid, members).charAt(0).toUpperCase();
  })();
  return <div className="avatar-circle">{initials}</div>;
}

function conversationSubtitle(thread: StudioMessageThread, t: (s: string) => string): string {
  if (thread.id === "team" || thread.type === "team") return t("Workspace broadcast channel");
  if (thread.type === "direct") return t("Direct message");
  if (thread.type === "group") return `${thread.memberUids.length} members`;
  return "";
}

function formatTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function MessagesStyles() {
  return (
    <style jsx global>{`
      .messages-shell { display: flex; height: calc(100vh - 64px); background: #f6f7f9; }
      .thread-panel { width: 320px; flex-shrink: 0; background: #fff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; }
      .thread-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #e5e7eb; }
      .thread-panel__header h1 { margin: 0; font-size: 20px; font-weight: 800; }
      .badge-pill { background: #ef4444; color: white; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
      .thread-panel__empty { padding: 32px 16px; color: #6b7280; font-size: 13px; text-align: center; }
      .thread-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; }
      .thread-row { width: 100%; text-align: left; background: transparent; border: none; padding: 12px 14px; display: flex; gap: 10px; align-items: center; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
      .thread-row:hover { background: #f9fafb; }
      .thread-row--selected { background: rgba(37,99,235,0.08); }
      .thread-row__body { flex: 1; min-width: 0; }
      .thread-row__line { display: flex; align-items: center; gap: 6px; }
      .thread-row__title { flex: 1; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .thread-row__title.unread { font-weight: 800; }
      .thread-row__time { font-size: 11px; color: #6b7280; }
      .thread-row__preview { flex: 1; font-size: 13px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .thread-row__preview.unread { color: #111827; font-weight: 600; }
      .thread-row__dot { width: 8px; height: 8px; border-radius: 50%; background: #2563eb; }
      .avatar-circle { width: 40px; height: 40px; border-radius: 50%; background: rgba(37,99,235,0.15); color: #2563eb; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .conversation-panel { flex: 1; display: flex; flex-direction: column; background: #fff; }
      .conversation-panel__header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
      .conversation-panel__header h2 { margin: 0; font-size: 18px; font-weight: 800; }
      .conversation-panel__header p { margin: 2px 0 0; font-size: 12px; color: #6b7280; }
      .conversation-panel__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #6b7280; }
      .conversation-panel__body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
      .conversation-error { background: #fee2e2; color: #991b1b; padding: 8px 16px; font-size: 12px; }
      .conversation-panel__footer { padding: 12px 20px; border-top: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 8px; }
      .composer { display: flex; gap: 8px; align-items: flex-end; }
      .composer textarea { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 14px; font-family: inherit; resize: none; min-height: 40px; max-height: 140px; }
      .composer__send { background: #2563eb; color: white; border: none; border-radius: 10px; padding: 0 18px; height: 40px; font-weight: 700; cursor: pointer; }
      .composer__send:disabled { opacity: 0.45; cursor: not-allowed; }
      .reply-chip { display: flex; gap: 8px; align-items: center; background: rgba(37,99,235,0.08); padding: 6px 10px; border-radius: 8px; }
      .reply-chip__body { flex: 1; min-width: 0; }
      .reply-chip__title { font-size: 11px; font-weight: 700; color: #2563eb; }
      .reply-chip__preview { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .reply-chip__close { background: transparent; border: none; font-size: 20px; cursor: pointer; color: #6b7280; line-height: 1; }
      .bubble-row { display: flex; flex-direction: column; }
      .bubble-row--left { align-items: flex-start; }
      .bubble-row--right { align-items: flex-end; }
      .bubble-sender { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 2px; padding-left: 4px; }
      .bubble { position: relative; max-width: 65%; background: #f3f4f6; border-radius: 14px; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
      .bubble--mine { background: rgba(37,99,235,0.12); }
      .bubble__text { font-size: 14px; color: #111827; white-space: pre-wrap; word-break: break-word; }
      .bubble__deleted { color: #6b7280; font-size: 13px; }
      .bubble__attachment img { max-width: 240px; max-height: 240px; border-radius: 8px; display: block; }
      .bubble__attachment a { font-size: 13px; font-weight: 600; color: #2563eb; text-decoration: none; }
      .bubble__meta { font-size: 10px; color: #6b7280; }
      .bubble__kebab { position: absolute; top: 4px; right: 4px; opacity: 0; background: rgba(255,255,255,0.85); border: none; border-radius: 4px; padding: 0 6px; cursor: pointer; color: #6b7280; line-height: 1.4; font-size: 16px; }
      .bubble:hover .bubble__kebab { opacity: 1; }
      .bubble-menu { position: absolute; top: 28px; right: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.12); display: flex; flex-direction: column; min-width: 160px; z-index: 10; }
      .bubble-menu button { background: transparent; border: none; text-align: left; padding: 8px 12px; font-size: 13px; cursor: pointer; }
      .bubble-menu button:hover { background: #f3f4f6; }
      .reply-quote { background: rgba(0,0,0,0.04); border-left: 3px solid #2563eb; border-radius: 6px; padding: 4px 8px; }
      .reply-quote__sender { font-size: 11px; font-weight: 700; color: #2563eb; }
      .reply-quote__preview { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
      .dialog-card { background: white; border-radius: 14px; padding: 20px; min-width: 320px; max-width: 480px; }
      .dialog-card h3 { margin: 0 0 12px; font-size: 16px; font-weight: 800; }
      .dialog-card textarea { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; }
      .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .dialog-actions button { padding: 8px 16px; border-radius: 8px; border: 1px solid #d1d5db; background: white; cursor: pointer; font-weight: 600; }
      .dialog-actions button.primary { background: #2563eb; color: white; border-color: #2563eb; }
      .dialog-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
      .pinned-bar { padding: 8px 16px; background: rgba(37,99,235,0.06); border-bottom: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; overflow-x: auto; }
      .pinned-bar__title { font-size: 11px; font-weight: 700; color: #2563eb; flex-shrink: 0; }
      .pinned-bar__list { display: flex; gap: 6px; }
      .pinned-chip { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px 8px; cursor: pointer; text-align: left; display: flex; flex-direction: column; max-width: 200px; }
      .pinned-chip__sender { font-size: 10px; font-weight: 700; color: #2563eb; }
      .pinned-chip__text { font-size: 11px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bubble--highlight { animation: highlight 1.5s ease-out; }
      @keyframes highlight {
        0% { background: rgba(250,204,21,0.6); }
        100% { background: inherit; }
      }
      .reactions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
      .reaction-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.06); border: none; border-radius: 12px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
      .reaction-pill--mine { background: rgba(37,99,235,0.18); border: 1px solid #2563eb; }
      .reaction-pill__count { font-size: 11px; color: #374151; }
      .reaction-picker { position: absolute; top: 28px; right: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 8px; display: flex; gap: 4px; box-shadow: 0 6px 24px rgba(0,0,0,0.12); z-index: 11; }
      .reaction-picker button { background: transparent; border: none; cursor: pointer; font-size: 20px; padding: 4px; }
      .bubble__pin { margin-right: 4px; }
      .composer__attach { background: transparent; border: 1px solid #d1d5db; border-radius: 10px; width: 40px; height: 40px; cursor: pointer; font-size: 18px; }
      .composer__attach:disabled { opacity: 0.45; cursor: not-allowed; }
      .mention-picker { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 4px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); display: flex; flex-direction: column; }
      .mention-picker button { display: flex; align-items: center; gap: 8px; background: transparent; border: none; padding: 6px 10px; cursor: pointer; text-align: left; border-radius: 6px; }
      .mention-picker button:hover { background: #f3f4f6; }
      .mention-picker__avatar { width: 24px; height: 24px; border-radius: 50%; background: rgba(37,99,235,0.15); color: #2563eb; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; }
      .mention-picker__name { font-size: 13px; font-weight: 600; }
      .mention-picker__email { font-size: 11px; color: #6b7280; }
      .new-conv-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: #2563eb; color: white; font-size: 18px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .header-actions { display: flex; gap: 4px; align-items: center; }
      .header-icon-btn { background: transparent; border: 1px solid transparent; border-radius: 8px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #374151; }
      .header-icon-btn:hover { background: #f3f4f6; }
      .header-icon-btn.active { background: rgba(37,99,235,0.12); border-color: rgba(37,99,235,0.3); color: #2563eb; }
      .header-menu { position: absolute; top: 36px; right: 0; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.12); display: flex; flex-direction: column; min-width: 200px; z-index: 20; }
      .header-menu button { background: transparent; border: none; text-align: left; padding: 8px 14px; font-size: 13px; cursor: pointer; }
      .header-menu button:hover { background: #f3f4f6; }
      .search-bar { padding: 10px 16px; border-bottom: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 8px; }
      .search-bar input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; }
      .filter-chips { display: flex; gap: 6px; }
      .filter-chip { background: #f3f4f6; border: 1px solid transparent; border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
      .filter-chip.active { background: rgba(37,99,235,0.12); border-color: #2563eb; color: #2563eb; font-weight: 600; }
      .typing-indicator { padding: 4px 20px; font-size: 12px; color: #6b7280; font-style: italic; }
      .archived-header { padding: 0; }
      .archived-header button { width: 100%; background: transparent; border: none; padding: 8px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; cursor: pointer; }
      .archived-header button:hover { background: #f9fafb; }
      .thread-row__menu { position: absolute; top: 36px; right: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.12); z-index: 10; }
      .thread-row__menu button { background: transparent; border: none; padding: 8px 14px; cursor: pointer; font-size: 13px; }
      .thread-row__menu button:hover { background: #f3f4f6; }
      .dialog-card--wide { min-width: 420px; max-width: 540px; }
      .dialog-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
      .dialog-tabs button { background: #f3f4f6; border: none; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
      .dialog-tabs button.active { background: rgba(37,99,235,0.12); color: #2563eb; font-weight: 600; }
      .member-list { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 8px 0; }
      .member-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: transparent; border: none; border-radius: 6px; text-align: left; cursor: pointer; width: 100%; }
      .member-row:hover { background: #f3f4f6; }
      .member-row.selected { background: rgba(37,99,235,0.08); }
      .member-row__avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(37,99,235,0.15); color: #2563eb; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .member-row__body { flex: 1; display: flex; flex-direction: column; }
      .member-row__body small { font-size: 11px; color: #6b7280; }
      .setting-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; cursor: pointer; }
      .setting-row input[type="checkbox"] { width: 18px; height: 18px; margin-top: 2px; cursor: pointer; }
      @media (max-width: 768px) {
        .messages-shell { flex-direction: column; }
        .thread-panel { width: 100%; border-right: none; border-bottom: 1px solid #e5e7eb; flex: 1; }
        .messages-shell.phone-show-list .conversation-panel { display: none; }
        .messages-shell.phone-show-conv .thread-panel { display: none; }
        .messages-shell.phone-show-conv .conversation-panel { flex: 1; }
      }
    `}</style>
  );
}
