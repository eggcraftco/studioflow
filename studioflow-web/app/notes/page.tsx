"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
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
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [notes, setNotes] = useState<StudioKeepNote[]>([]);
  const [topTab, setTopTab] = useState<TopTab>("personal");
  const [section, setSection] = useState<Section>("notes");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudioKeepNote | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
      try {
        const o = await loadRecentOrders(ws.id);
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
        return (b.updatedAtMillis ?? 0) - (a.updatedAtMillis ?? 0);
      });
  }, [notes, section, search, labelFilter]);

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.labels.forEach((l) => set.add(l)));
    return Array.from(set).sort();
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

  if (authLoading || loading || !workspace || !user) return <LoadingScreen />;

  return (
    <AppShell>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Notes</h1>
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

        {/* Top tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 12 }}>
          {(["personal", "project"] as TopTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTopTab(t)}
              style={{
                background: "none",
                border: "none",
                padding: "10px 20px",
                fontWeight: 700,
                cursor: "pointer",
                color: topTab === t ? "#2D7BF4" : "#6b7280",
                borderBottom: topTab === t ? "2px solid #2D7BF4" : "2px solid transparent",
              }}
            >
              {t === "personal" ? "Personal" : "Project Notes"}
            </button>
          ))}
        </div>

        {topTab === "project" ? (
          <ProjectNotesView orders={orders} />
        ) : (
          <>
            {/* Section tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {(
                [
                  ["notes", "All"],
                  ["reminders", "Reminders"],
                  ["archive", "Archive"],
                  ["trash", "Trash"],
                ] as [Section, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSection(k)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: section === k ? "#2D7BF4" : "white",
                    color: section === k ? "white" : "#374151",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {allLabels.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <button
                  onClick={() => setLabelFilter(null)}
                  style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: labelFilter === null ? "#2D7BF4" : "white", color: labelFilter === null ? "white" : "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  All
                </button>
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
              placeholder="Search notes…"
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
                <SectionHeader title="PINNED" />
                <NotesGrid notes={pinned} onClick={setEditing} onSave={save} onDelete={destroy} onOpenImage={setViewerImage} />
              </>
            )}
            {pinned.length > 0 && others.length > 0 && <SectionHeader title="OTHERS" />}
            <NotesGrid notes={others} onClick={setEditing} onSave={save} onDelete={destroy} onOpenImage={setViewerImage} />
            {visible.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
                {section === "trash"
                  ? "Trash is empty."
                  : section === "archive"
                  ? "No archived notes."
                  : section === "reminders"
                  ? "No reminders."
                  : "Click + New Note to create your first note."}
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
    </AppShell>
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
}: {
  notes: StudioKeepNote[];
  onClick: (n: StudioKeepNote) => void;
  onSave: (n: StudioKeepNote) => void;
  onDelete: (id: string) => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} onClick={() => onClick(n)} onSave={onSave} onDelete={onDelete} onOpenImage={onOpenImage} />
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
}: {
  note: StudioKeepNote;
  onClick: () => void;
  onSave: (n: StudioKeepNote) => void;
  onDelete: (id: string) => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colorForNote(note.colorName),
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        padding: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {note.title && (
          <div style={{ flex: 1, fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {note.title}
          </div>
        )}
        {!note.title && <div style={{ flex: 1 }} />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSave({ ...note, isPinned: !note.isPinned });
          }}
          title={note.isPinned ? "Unpin" : "Pin"}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: note.isPinned ? "#2D7BF4" : "#9ca3af" }}
        >
          📌
        </button>
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
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: "auto" }}>
        {note.isDeleted ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave({ ...note, isDeleted: false });
            }}
            title="Restore"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#2D7BF4" }}
          >
            ↶
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave({ ...note, isArchived: !note.isArchived });
            }}
            title={note.isArchived ? "Unarchive" : "Archive"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
          >
            🗄
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (note.isDeleted) onDelete(note.id);
            else onSave({ ...note, isDeleted: true });
          }}
          title={note.isDeleted ? "Delete forever" : "Move to trash"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}
        >
          🗑
        </button>
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
          {isNoteEmpty(note) ? "New Note" : "Edit Note"}
        </h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 10 }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Note"
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
            placeholder="Add label"
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
            placeholder="Email"
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectNotesView({ orders }: { orders: OrderListItem[] }) {
  const grouped = useMemo(() => {
    return orders
      .map((o) => {
        const entries: Array<{ type: string; text: string }> = [];
        if (o.notes?.trim()) entries.push({ type: "Note", text: o.notes });
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
            {order.designName?.trim() || order.customerName || "Project"}
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
