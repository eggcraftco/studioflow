"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { loadWorkspaceContext, loadRecentOrders, type OrderListItem, type WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  colorForNote,
  deleteKeepNote,
  isNoteEmpty,
  listenToKeepNotes,
  newKeepNote,
  saveKeepNote,
  uploadKeepNoteImage,
  NOTE_COLORS,
  type StudioKeepNote,
} from "@/lib/studioflow/notes";

type Section = "notes" | "reminders" | "archive" | "trash";
type TopTab = "personal" | "project";

export default function NotesPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [notes, setNotes] = useState<StudioKeepNote[]>([]);
  const [topTab, setTopTab] = useState<TopTab>("personal");
  const [section, setSection] = useState<Section>("notes");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudioKeepNote | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPhone, setIsPhone] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }
  function bulkArchive() {
    notes.filter((n) => selectedIds.has(n.id)).forEach((n) => save({ ...n, isArchived: true }));
    clearSelection();
  }
  function bulkTrash() {
    notes.filter((n) => selectedIds.has(n.id)).forEach((n) => save({ ...n, isDeleted: true }));
    clearSelection();
  }
  function bulkRestoreFromTrash() {
    notes.filter((n) => selectedIds.has(n.id)).forEach((n) => save({ ...n, isDeleted: false, isArchived: false }));
    clearSelection();
  }
  function bulkUnarchive() {
    notes.filter((n) => selectedIds.has(n.id)).forEach((n) => save({ ...n, isArchived: false }));
    clearSelection();
  }
  function bulkDeleteForever() {
    if (!confirm(`Permanently delete ${selectedIds.size} note(s)?`)) return;
    Array.from(selectedIds).forEach((id) => destroy(id));
    clearSelection();
  }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    (async () => {
      const ws = await loadWorkspaceContext(uid);
      if (cancelled) return;
      setWorkspace(ws);
      setLoading(false);
      try {
        const o = await loadRecentOrders(ws.id, ws, uid);
        if (!cancelled) setOrders(o);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!workspace || !user) return;
    const unsub = listenToKeepNotes(workspace.id, user.uid, setNotes);
    return unsub;
  }, [workspace, user]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => {
        switch (section) {
          case "archive":
            return !n.isDeleted && n.isArchived;
          case "trash":
            return n.isDeleted;
          case "reminders":
            return !n.isDeleted && !n.isArchived && n.reminderDateMillis != null;
          default:
            return !n.isDeleted && !n.isArchived;
        }
      })
      .filter((n) => {
        if (!q) return true;
        return n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q);
      })
      .filter((n) => (labelFilter ? n.labels.includes(labelFilter) : true))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        // Mac uses manualOrder ascending for active list; fallback to updatedAt
        const am = a.manualOrder || (a.updatedAtMillis ?? 0);
        const bm = b.manualOrder || (b.updatedAtMillis ?? 0);
        return section === "notes" ? am - bm : bm - am;
      });
  }, [notes, section, search, labelFilter]);

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.labels.forEach((l) => set.add(l)));
    return Array.from(set).sort();
  }, [notes]);

  const counts = useMemo(() => {
    const c = { notes: 0, reminders: 0, archive: 0, trash: 0, labels: {} as Record<string, number> };
    notes.forEach((n) => {
      if (n.isDeleted) c.trash++;
      else if (n.isArchived) c.archive++;
      else {
        c.notes++;
        if (n.reminderDateMillis != null) c.reminders++;
        n.labels.forEach((l) => { c.labels[l] = (c.labels[l] || 0) + 1; });
      }
    });
    return c;
  }, [notes]);

  const pinned = visible.filter((n) => n.isPinned);
  const others = visible.filter((n) => !n.isPinned);

  async function save(note: StudioKeepNote) {
    if (!workspace || !user) return;
    const finalized: StudioKeepNote =
      note.ownerUserId.trim() === ""
        ? {
            ...note,
            ownerUserId: user.uid,
            ownerEmail: user.email ?? "",
            ownerName: user.displayName ?? "",
          }
        : note;
    await saveKeepNote(workspace.id, user.uid, {
      ...finalized,
      updatedAtMillis: Date.now(),
    });
  }

  async function destroy(id: string) {
    if (!workspace || !user) return;
    await deleteKeepNote(workspace.id, user.uid, id);
  }

  async function duplicate(note: StudioKeepNote) {
    if (!workspace || !user) return;
    const copy = newKeepNote(user.uid, user.email ?? "", user.displayName ?? "");
    copy.title = note.title;
    copy.text = note.text;
    copy.colorName = note.colorName;
    copy.labels = [...note.labels];
    copy.links = [...note.links];
    await saveKeepNote(workspace.id, user.uid, copy);
  }

  async function copyText(note: StudioKeepNote) {
    const text = [note.title, note.text].filter(Boolean).join("\n").trim();
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  function toggleLabel(note: StudioKeepNote, label: string) {
    const has = note.labels.includes(label);
    save({ ...note, labels: has ? note.labels.filter((l) => l !== label) : [...note.labels, label] });
  }

  function moveKeepNote(draggedId: string, targetId: string) {
    if (!workspace || !user) return;
    if (draggedId === targetId) return;
    if (section !== "notes") return;
    const active = visible.filter((n) => !n.isPinned);
    const fromIdx = active.findIndex((n) => n.id === draggedId);
    const toIdx = active.findIndex((n) => n.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...active];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const ts = Date.now();
    next.forEach((n, i) => {
      save({ ...n, manualOrder: ts + i });
    });
  }

  if (authLoading || loading || !workspace || !user) return <LoadingScreen />;

  return (
    <AppShell>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", position: "relative" }}>
        {/* Phone: hamburger button (top-left) */}
        {isPhone && (
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ position: "absolute", top: 8, left: 8, zIndex: 50, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18 }}
          >
            ☰
          </button>
        )}
        {/* Phone: drawer backdrop */}
        {isPhone && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
        )}
        {/* LEFT SIDEBAR */}
        <aside style={{
          width: 220,
          flex: isPhone ? "none" : "0 0 220px",
          padding: "8px 0",
          position: isPhone ? "fixed" : "sticky",
          top: isPhone ? 0 : 0,
          left: isPhone ? (drawerOpen ? 0 : -240) : undefined,
          bottom: isPhone ? 0 : undefined,
          zIndex: isPhone ? 101 : undefined,
          background: isPhone ? "white" : "transparent",
          boxShadow: isPhone ? "0 0 24px rgba(0,0,0,0.2)" : "none",
          transition: isPhone ? "left 0.22s ease" : "none",
          height: isPhone ? "100vh" : "auto",
          overflowY: "auto",
        }}>
          <SideItem icon="lightbulb" label={t("Notes")} count={counts.notes} active={topTab === "personal" && section === "notes" && labelFilter === null} onClick={() => { setTopTab("personal"); setSection("notes"); setLabelFilter(null); if (isPhone) setDrawerOpen(false); }} />
          <SideItem icon="bell" label={t("Reminders")} count={counts.reminders} active={topTab === "personal" && section === "reminders"} onClick={() => { setTopTab("personal"); setSection("reminders"); setLabelFilter(null); if (isPhone) setDrawerOpen(false); }} />
          <SideItem icon="docMagnifier" label={t("Project Notes")} active={topTab === "project"} onClick={() => { setTopTab("project"); if (isPhone) setDrawerOpen(false); }} />
          {allLabels.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", padding: "10px 14px 4px" }}>{t("LABELS")}</div>
              {allLabels.map((l) => (
                <SideItem key={l} icon="tag" label={l} count={counts.labels[l] || 0} active={labelFilter === l} onClick={() => { setTopTab("personal"); setSection("notes"); setLabelFilter(l); if (isPhone) setDrawerOpen(false); }} />
              ))}
            </>
          )}
          <SideItem icon="archive" label={t("Archive")} count={counts.archive} active={topTab === "personal" && section === "archive"} onClick={() => { setTopTab("personal"); setSection("archive"); setLabelFilter(null); if (isPhone) setDrawerOpen(false); }} />
          <SideItem icon="trash" label={t("Trash")} count={counts.trash} active={topTab === "personal" && section === "trash"} onClick={() => { setTopTab("personal"); setSection("trash"); setLabelFilter(null); if (isPhone) setDrawerOpen(false); }} />
        </aside>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, minWidth: 0 }}>
        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
            <button onClick={clearSelection} title="Cancel" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, fontWeight: 800, color: "#374151" }}>✕</button>
            <span style={{ fontWeight: 700, color: "#374151" }}>{selectedIds.size} selected</span>
            <div style={{ flex: 1 }} />
            {section === "trash" ? (
              <>
                <button onClick={bulkRestoreFromTrash} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Restore to Notes</button>
                <button onClick={bulkDeleteForever} style={{ background: "white", border: "1px solid #e5e7eb", color: "#dc2626", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Delete forever</button>
              </>
            ) : section === "archive" ? (
              <>
                <button onClick={bulkUnarchive} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Unarchive</button>
                <button onClick={bulkTrash} style={{ background: "white", border: "1px solid #e5e7eb", color: "#dc2626", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Move to trash</button>
              </>
            ) : (
              <>
                <button onClick={bulkArchive} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Archive</button>
                <button onClick={bulkTrash} style={{ background: "white", border: "1px solid #e5e7eb", color: "#dc2626", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Move to trash</button>
              </>
            )}
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16, paddingLeft: isPhone ? 56 : 0 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{topTab === "project" ? t("Project Notes") : (labelFilter ? `#${labelFilter}` : (section === "notes" ? t("Notes") : section === "reminders" ? t("Reminders") : section === "archive" ? t("Archive") : t("Trash")))}</h1>
            <div style={{ fontSize: 13, color: "#6b7280" }}>{visible.length} note{visible.length === 1 ? "" : "s"}</div>
          </div>
          <button
            onClick={() =>
              setEditing(
                newKeepNote(user.uid, user.email ?? "", user.displayName ?? "")
              )
            }
            style={{
              background: "#2D7BF4",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "10px 18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            + New Note
          </button>
        </div>

        {topTab === "project" ? (
          <ProjectNotesView orders={orders} />
        ) : (
          <>
            {false && allLabels.length > 0 && (
              <div style={{ display: "none" }}>
                <button onClick={() => setLabelFilter(null)}>All</button>
                {allLabels.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLabelFilter(labelFilter === l ? null : l)}
                    style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: labelFilter === l ? "#2D7BF4" : "white", color: labelFilter === l ? "white" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {section === "trash" && visible.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  onClick={() => {
                    if (confirm(`Permanently delete ${visible.length} note(s)?`)) {
                      visible.forEach((n) => destroy(n.id));
                    }
                  }}
                  style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 800, cursor: "pointer" }}
                >
                  Empty Trash
                </button>
              </div>
            )}

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search notes…")}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 14,
                marginBottom: 14,
              }}
            />

            {/* Lists */}
            {pinned.length > 0 && (
              <>
                <SectionHeader title={t("PINNED")} />
                <NotesGrid notes={pinned} onClick={(n) => { if (selectedIds.size > 0) { toggleSelect(n.id); } else { setEditing(n); } }} onSave={save} onDelete={destroy} onOpenImage={setViewerImage} onMove={moveKeepNote} canDrag={section === "notes"} onDuplicate={duplicate} onCopy={copyText} onToggleLabel={toggleLabel} allLabels={allLabels} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
              </>
            )}
            {pinned.length > 0 && others.length > 0 && <SectionHeader title={t("OTHERS")} />}
            <NotesGrid notes={others} onClick={(n) => { if (selectedIds.size > 0) { toggleSelect(n.id); } else { setEditing(n); } }} onSave={save} onDelete={destroy} onOpenImage={setViewerImage} onMove={moveKeepNote} canDrag={section === "notes"} onDuplicate={duplicate} onCopy={copyText} onToggleLabel={toggleLabel} allLabels={allLabels} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
            {visible.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
                {section === "trash"
                  ? t("Trash is empty.")
                  : section === "archive"
                  ? t("No archived notes.")
                  : section === "reminders"
                  ? t("No reminders.")
                  : t("Click + New Note to create your first note.")}
              </div>
            )}
          </>
        )}

        {viewerImage && (
          <div
            onClick={() => setViewerImage(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewerImage} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain" }} />
          </div>
        )}
        {editing && (
          <NoteEditor
            note={editing}
            onClose={() => setEditing(null)}
            onSave={(n) => {
              save(n);
              setEditing(null);
            }}
            onUploadImage={async (file) => {
              if (!workspace || !user) return;
              try {
                const url = await uploadKeepNoteImage(workspace.id, user.uid, editing.id, file);
                if (url) {
                  const next = { ...editing, links: [...editing.links, url] };
                  setEditing(next);
                  await save(next);
                }
              } catch (e) {
                alert("Image upload failed: " + (e as Error).message);
              }
            }}
          />
        )}
        </div>
      </div>
    </AppShell>
  );
}

function SideItem({ icon, label, active, onClick, count }: { icon: "lightbulb" | "bell" | "docMagnifier" | "tag" | "archive" | "trash"; label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "8px 14px",
        background: active ? "#fef3c7" : "transparent",
        border: "none",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: "#374151",
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 2,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <SideIcon name={icon} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#92400e" : "#6b7280", background: active ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.05)", padding: "1px 8px", borderRadius: 999, minWidth: 20, textAlign: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function SideIcon({ name }: { name: "lightbulb" | "bell" | "docMagnifier" | "tag" | "archive" | "trash" }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "lightbulb":
      return <svg {...props}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c1 .7 1.5 1.7 1.5 2.8V18h5v-.5c0-1.1.5-2.1 1.5-2.8A7 7 0 0 0 12 2z" /></svg>;
    case "bell":
      return <svg {...props}><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
    case "docMagnifier":
      return <svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><circle cx="11" cy="14" r="2.5" /><path d="M13 16l2 2" /></svg>;
    case "tag":
      return <svg {...props}><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "archive":
      return <svg {...props}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></svg>;
    case "trash":
      return <svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>;
  }
}

const menuItemStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  borderRadius: 6,
};

function Icon({ name, size = 18 }: { name: "palette" | "bell" | "personPlus" | "archive" | "ellipsis" | "pin" | "pinFilled"; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "palette":
      return (
        <svg {...props}>
          <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4.5 4H16a2 2 0 0 0-2 2c0 .8.4 1.4.8 1.9.4.5.7 1 .7 1.6 0 .8-.7 1.5-1.5 1.5z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "personPlus":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M19 8v6M16 11h6" />
        </svg>
      );
    case "archive":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
          <path d="M10 12h4" />
        </svg>
      );
    case "ellipsis":
      return (
        <svg {...props}>
          <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pin":
      return (
        <svg {...props}>
          <path d="M12 2v6m-4 0h8l-1.5 4H9.5L8 8zm4 4v9m-2 0h4" />
        </svg>
      );
    case "pinFilled":
      return (
        <svg {...props}>
          <path d="M12 2v6m-4 0h8l-1.5 4H9.5L8 8zm4 4v9m-2 0h4" fill="currentColor" />
        </svg>
      );
  }
}

function IconBtn({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={onClick}
        aria-label={title}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: hovered ? "rgba(0,0,0,0.06)" : "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#374151",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </button>
      {hovered && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(17, 24, 39, 0.94)",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}
        >
          {title}
        </span>
      )}
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", margin: "12px 4px 6px" }}>
      {title}
    </div>
  );
}

function NotesGrid({
  notes,
  onClick,
  onSave,
  onDelete,
  onOpenImage,
  onMove,
  canDrag,
  onDuplicate,
  onCopy,
  onToggleLabel,
  allLabels,
  selectedIds,
  onToggleSelect,
}: {
  notes: StudioKeepNote[];
  onClick: (n: StudioKeepNote) => void;
  onSave: (n: StudioKeepNote) => void;
  onDelete: (id: string) => void;
  onOpenImage: (url: string) => void;
  onMove: (draggedId: string, targetId: string) => void;
  canDrag: boolean;
  onDuplicate: (n: StudioKeepNote) => void;
  onCopy: (n: StudioKeepNote) => void;
  onToggleLabel: (n: StudioKeepNote, label: string) => void;
  allLabels: string[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 10,
      }}
    >
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} onClick={() => onClick(n)} onSave={onSave} onDelete={onDelete} onOpenImage={onOpenImage} onMove={onMove} canDrag={canDrag} onDuplicate={onDuplicate} onCopy={onCopy} onToggleLabel={onToggleLabel} allLabels={allLabels} isSelected={selectedIds.has(n.id)} selectionActive={selectedIds.size > 0} onToggleSelect={() => onToggleSelect(n.id)} />
      ))}
    </div>
  );
}

function NoteCard({
  note,
  onClick,
  onSave,
  onDelete,
  onOpenImage,
  onMove,
  canDrag,
  onDuplicate,
  onCopy,
  onToggleLabel,
  allLabels,
  isSelected,
  selectionActive,
  onToggleSelect,
}: {
  note: StudioKeepNote;
  onClick: () => void;
  onSave: (n: StudioKeepNote) => void;
  onDelete: (id: string) => void;
  onOpenImage: (url: string) => void;
  onMove: (draggedId: string, targetId: string) => void;
  canDrag: boolean;
  onDuplicate: (n: StudioKeepNote) => void;
  onCopy: (n: StudioKeepNote) => void;
  onToggleLabel: (n: StudioKeepNote, label: string) => void;
  allLabels: string[];
  isSelected: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); setColorOpen(false); setReminderOpen(false); }}
      onClick={onClick}
      draggable={canDrag && !note.isPinned}
      onDragStart={(e) => {
        if (!canDrag || note.isPinned) return;
        setIsDragging(true);
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        setIsOver(false);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== note.id) onMove(draggedId, note.id);
      }}
      style={{
        position: "relative",
        background: colorForNote(note.colorName),
        borderRadius: 14,
        border: isOver || isSelected ? "2px solid #2D7BF4" : "1px solid #e5e7eb",
        padding: 14,
        cursor: canDrag && !note.isPinned ? "grab" : "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 120,
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? "scale(0.98)" : "none",
        transition: "transform 0.15s, opacity 0.15s, border-color 0.15s",
      }}
    >
      {/* Select checkmark — shown when hovering, currently selected, or selection mode is active */}
      {(hover || isSelected || selectionActive) && !isDragging && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          title={isSelected ? t("Deselect") : t("Select")}
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: isSelected ? "#2D7BF4" : "#111827",
            color: "white",
            border: "2px solid white",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            zIndex: 2,
          }}
        >
          ✓
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {note.title && (
          <div style={{ flex: 1, fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {note.title}
          </div>
        )}
        {!note.title && <div style={{ flex: 1 }} />}
        <span style={{ color: note.isPinned ? "#2D7BF4" : "#374151" }}>
          <IconBtn
            title={note.isPinned ? t("Unpin") : t("Pin")}
            onClick={(e) => { e.stopPropagation(); onSave({ ...note, isPinned: !note.isPinned }); }}
          >
            <Icon name={note.isPinned ? "pinFilled" : "pin"} />
          </IconBtn>
        </span>
      </div>
      {note.links[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.links[0]}
          alt=""
          onClick={(e) => {
            e.stopPropagation();
            onOpenImage(note.links[0]);
          }}
          style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }}
        />
      )}
      {note.text && (
        <div style={{ fontSize: 13, whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 130 }}>
          {note.text.length > 220 ? note.text.slice(0, 220) + "…" : note.text}
        </div>
      )}
      {note.labels.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {note.labels.map((l) => (
            <span key={l} style={{ fontSize: 10, fontWeight: 700, background: "#f3f4f6", padding: "2px 8px", borderRadius: 999 }}>
              {l}
            </span>
          ))}
        </div>
      )}
      {note.reminderDateMillis && (
        <div style={{ fontSize: 11, color: note.reminderDateMillis < Date.now() ? "#dc2626" : "#6b7280", fontWeight: note.reminderDateMillis < Date.now() ? 800 : 400 }}>
          ⏰ {new Date(note.reminderDateMillis).toLocaleDateString()}
        </div>
      )}
      {note.collaboratorEmails.length > 0 && (
        <div style={{ fontSize: 11, color: "#6b7280" }}>👥 {note.collaboratorEmails.length} shared</div>
      )}
      {/* Bottom action row — Mac parity */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          marginTop: "auto",
          opacity: hover || menuOpen || colorOpen || reminderOpen ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hover || menuOpen || colorOpen || reminderOpen ? "auto" : "none",
        }}
      >
        {/* Color */}
        <div style={{ position: "relative" }}>
          <IconBtn title={t("Color")} onClick={(e) => { e.stopPropagation(); setColorOpen((v) => !v); setReminderOpen(false); setMenuOpen(false); }}>
            <Icon name="palette" />
          </IconBtn>
          {colorOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 32, left: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 10 }}>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onSave({ ...note, colorName: c }); setColorOpen(false); }}
                  title={c}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: colorForNote(c), border: note.colorName === c ? "2px solid #2D7BF4" : "1px solid #e5e7eb", cursor: "pointer" }}
                />
              ))}
            </div>
          )}
        </div>
        {/* Reminder */}
        <div style={{ position: "relative" }}>
          <IconBtn title={t("Reminder")} onClick={(e) => { e.stopPropagation(); setReminderOpen((v) => !v); setColorOpen(false); setMenuOpen(false); }}>
            <Icon name="bell" />
          </IconBtn>
          {reminderOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 32, left: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 10, minWidth: 160 }}>
              <button onClick={() => { onSave({ ...note, reminderDateMillis: Date.now() + 24 * 60 * 60 * 1000 }); setReminderOpen(false); }} style={menuItemStyle}>Tomorrow</button>
              <button onClick={() => { onSave({ ...note, reminderDateMillis: Date.now() + 7 * 24 * 60 * 60 * 1000 }); setReminderOpen(false); }} style={menuItemStyle}>Next week</button>
              <input
                type="date"
                onChange={(e) => { if (e.target.value) { onSave({ ...note, reminderDateMillis: new Date(e.target.value).getTime() }); setReminderOpen(false); } }}
                style={{ padding: 4, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12 }}
              />
              {note.reminderDateMillis && (
                <button onClick={() => { onSave({ ...note, reminderDateMillis: null }); setReminderOpen(false); }} style={{ ...menuItemStyle, color: "#dc2626" }}>Remove reminder</button>
              )}
            </div>
          )}
        </div>
        {/* Collaborators */}
        <IconBtn title={t("Collaborators")} onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <Icon name="personPlus" />
        </IconBtn>
        {/* Archive */}
        <IconBtn title={note.isArchived ? t("Unarchive") : t("Archive")} onClick={(e) => { e.stopPropagation(); onSave({ ...note, isArchived: !note.isArchived }); }}>
          <Icon name="archive" />
        </IconBtn>
        <div style={{ flex: 1 }} />
        {/* Overflow menu */}
        <div style={{ position: "relative" }}>
          <IconBtn title={t("More")} onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setColorOpen(false); setReminderOpen(false); }}>
            <Icon name="ellipsis" />
          </IconBtn>
          {menuOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 32, right: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 4, display: "flex", flexDirection: "column", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 10, minWidth: 200 }}>
              <button onClick={() => { onDuplicate(note); setMenuOpen(false); }} style={menuItemStyle}>Duplicate note</button>
              <button onClick={() => { onCopy(note); setMenuOpen(false); }} style={menuItemStyle}>Copy note</button>
              {allLabels.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid #f3f4f6", margin: "4px 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", padding: "4px 10px" }}>LABELS</div>
                  {allLabels.map((l) => (
                    <button key={l} onClick={() => { onToggleLabel(note, l); }} style={menuItemStyle}>
                      {note.labels.includes(l) ? "✓ " : ""}{l}
                    </button>
                  ))}
                </>
              )}
              <div style={{ borderTop: "1px solid #f3f4f6", margin: "4px 0" }} />
              {note.isDeleted ? (
                <>
                  <button onClick={() => { onSave({ ...note, isDeleted: false }); setMenuOpen(false); }} style={menuItemStyle}>Restore note</button>
                  <button onClick={() => { onDelete(note.id); setMenuOpen(false); }} style={{ ...menuItemStyle, color: "#dc2626" }}>Delete forever</button>
                </>
              ) : (
                <button onClick={() => { onSave({ ...note, isDeleted: true }); setMenuOpen(false); }} style={{ ...menuItemStyle, color: "#dc2626" }}>Move to trash</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onClose,
  onSave,
  onUploadImage,
}: {
  note: StudioKeepNote;
  onClose: () => void;
  onSave: (n: StudioKeepNote) => void;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [colorName, setColorName] = useState(note.colorName);
  const [labels, setLabels] = useState<string[]>(note.labels);
  const [labelInput, setLabelInput] = useState("");
  const [collabs, setCollabs] = useState<string[]>(note.collaboratorEmails);
  const [collabInput, setCollabInput] = useState("");
  const [reminderMillis, setReminderMillis] = useState<number | null>(note.reminderDateMillis);
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 14,
          padding: 20,
          width: "min(560px, 92vw)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 14px", fontWeight: 800 }}>
          {isNoteEmpty(note) ? t("New Note") : t("Edit Note")}
        </h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("Title")}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 10 }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Note")}
          rows={6}
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, resize: "vertical" }}
        />

        <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>COLOR</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColorName(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: colorForNote(c),
                border: colorName === c ? "2px solid #2D7BF4" : "1px solid #e5e7eb",
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>REMINDER</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <input
            type="date"
            value={reminderMillis ? new Date(reminderMillis).toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              setReminderMillis(e.target.value ? new Date(e.target.value).getTime() : null)
            }
            style={{ padding: 6, border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          {reminderMillis && (
            <button onClick={() => setReminderMillis(null)} style={{ padding: "4px 10px", border: "1px solid #e5e7eb", background: "white", borderRadius: 6, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>IMAGE</div>
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "inline-block",
              padding: "6px 14px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Add image…
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadImage(f);
                e.target.value = "";
              }}
            />
          </label>
          {note.links.length > 0 && (
            <span style={{ marginLeft: 10, fontSize: 11, color: "#6b7280" }}>
              {note.links.length} attachment(s)
            </span>
          )}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>LABELS</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder={t("Add label")}
            style={{ flex: 1, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          <button
            onClick={() => {
              const v = labelInput.trim();
              if (v && !labels.includes(v)) setLabels([...labels, v]);
              setLabelInput("");
            }}
            style={{ padding: "6px 14px", border: "1px solid #e5e7eb", background: "white", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}
          >
            Add
          </button>
        </div>
        {labels.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
            {labels.map((l) => (
              <span key={l} style={{ fontSize: 11, background: "#f3f4f6", padding: "4px 10px", borderRadius: 999, cursor: "pointer" }} onClick={() => setLabels(labels.filter((x) => x !== l))}>
                {l} ×
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>COLLABORATORS</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            type="email"
            value={collabInput}
            onChange={(e) => setCollabInput(e.target.value)}
            placeholder={t("Email")}
            style={{ flex: 1, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          <button
            onClick={() => {
              const v = collabInput.trim().toLowerCase();
              if (v && v.includes("@") && !collabs.includes(v)) setCollabs([...collabs, v]);
              setCollabInput("");
            }}
            style={{ padding: "6px 14px", border: "1px solid #e5e7eb", background: "white", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}
          >
            Add
          </button>
        </div>
        {collabs.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
            {collabs.map((e) => (
              <span key={e} style={{ fontSize: 11, background: "#f3f4f6", padding: "4px 10px", borderRadius: 999, cursor: "pointer" }} onClick={() => setCollabs(collabs.filter((x) => x !== e))}>
                {e} ×
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...note,
                title: title.trim(),
                text: text.trim(),
                colorName,
                labels,
                collaboratorEmails: collabs,
                reminderDateMillis: reminderMillis,
              })
            }
            style={{ padding: "8px 18px", background: "#2D7BF4", color: "white", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
          >
            {t("Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectNotesView({ orders }: { orders: OrderListItem[] }) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const grouped = useMemo(() => {
    return orders
      .map((o) => {
        const entries: Array<{ type: string; text: string }> = [];
        if (o.notes?.trim()) entries.push({ type: t("Note"), text: o.notes });
        return { order: o, entries };
      })
      .filter((g) => g.entries.length > 0)
      .sort((a, b) => (b.order.paymentDate?.getTime() ?? 0) - (a.order.paymentDate?.getTime() ?? 0));
  }, [orders]);

  if (grouped.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>No project notes yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {grouped.map(({ order, entries }) => (
        <div key={order.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {order.designName?.trim() || order.customerName || t("Project")}
          </div>
          {order.customerName && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{order.customerName}</div>
          )}
          {entries.map((e, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#2D7BF4" }}>{e.type.toUpperCase()}</div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{e.text}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
