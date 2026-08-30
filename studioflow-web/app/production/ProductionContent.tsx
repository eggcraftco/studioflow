"use client";

// The Production board itself. Three views over one set of live orders:
//   Board    — where is each job? (default)
//   List     — filter and edit many at once
//   Workload — who is carrying what
//
// Dragging a card does not just move it on screen: it writes the real
// production stage, records the change in the order's history, tells the
// assignee, and offers Undo. Dropping into the blocked lane insists on a
// reason, because a job that goes quiet without one is the exact failure this
// screen exists to prevent.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { dispatchStudioToast } from "@/components/StudioToastHost";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadScheduleOrders,
  loadTeamAccessData,
  loadWorkspaceProductionStages,
  type ScheduleOrderItem,
  type TeamMemberDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { loadWorkspaceBlockHeadings, type BlockHeadingSettings, type HeadingItem } from "@/lib/studioflow/blockHeadings";
import { studioT } from "@/lib/studioflow/language";
import { canEditOrderStatusForRole } from "@/lib/studioflow/orders";
import {
  DEFAULT_PRODUCTION_STAGES,
  PRODUCTION_BLOCKER_REASONS,
  productionStagesFromSettings,
  productionStepIsDone,
  productionStepValue,
  resolveProductionStage,
  setOrderProductionStage,
  undoOrderProductionStage,
  wipLoadLevel,
  type ProductionBlocker,
  type ProductionStage
} from "@/lib/studioflow/production";
import { ProductionStagesModal } from "./ProductionStagesModal";

type ViewMode = "board" | "list" | "workload";

type ProductionCard = {
  order: ScheduleOrderItem;
  stageId: string;
  source: "auto" | "manual" | "blocker" | "delivered";
  doneCount: number;
  total: number;
  blocker: ProductionBlocker | null;
  currentStep: HeadingItem | null;
  partsReady: boolean;
  dueDate: Date | null;
  isLate: boolean;
  isAtRisk: boolean;
};

const STAGE_DOT_COLORS: Record<string, string> = {
  ready: "#3b82f6",
  active: "#2563eb",
  blocked: "#ef4444",
  review: "#8b5cf6",
  shipready: "#16a34a",
  done: "#9ca3af"
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function dayDiff(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function ProductionContent({
  workspace,
  settings,
  uid
}: {
  workspace: WorkspaceContext;
  settings: WorkspaceSettingsOverview | null;
  uid: string;
}) {
  const router = useRouter();
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [orders, setOrders] = useState<ScheduleOrderItem[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>(DEFAULT_PRODUCTION_STAGES);
  const [headings, setHeadings] = useState<BlockHeadingSettings | null>(null);
  const [team, setTeam] = useState<TeamMemberDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [view, setView] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [dragOrderId, setDragOrderId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [blockerPrompt, setBlockerPrompt] = useState<{ orderId: string; stageId: string } | null>(null);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = canEditOrderStatusForRole(workspace.role);
  const steps = useMemo<HeadingItem[]>(
    () => (headings?.customSteps ?? []).filter(step => Boolean(step.title?.trim())),
    [headings]
  );

  const reload = useCallback(async () => {
    const [loadedOrders, rawStages] = await Promise.all([
      loadScheduleOrders(workspace.id, workspace, uid),
      loadWorkspaceProductionStages(workspace.id).catch(() => null)
    ]);
    setOrders(loadedOrders);
    setStages(productionStagesFromSettings(rawStages));
  }, [workspace, uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedOrders, rawStages, loadedHeadings, teamData] = await Promise.all([
          loadScheduleOrders(workspace.id, workspace, uid),
          loadWorkspaceProductionStages(workspace.id).catch(() => null),
          loadWorkspaceBlockHeadings(workspace).catch(() => null),
          loadTeamAccessData(workspace).catch(() => null)
        ]);
        if (cancelled) return;
        setOrders(loadedOrders);
        setStages(productionStagesFromSettings(rawStages));
        setHeadings(loadedHeadings);
        setTeam(teamData?.members ?? []);
      } catch (failure) {
        if (!cancelled) setNotice(failure instanceof Error ? failure.message : t("Production could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, uid]);

  const doneStageId = useMemo(() => stages.find(stage => stage.kind === "done")?.id ?? "", [stages]);

  // One pass over the orders produces everything the screen shows: the lane a
  // card sits in, its progress, and the risk flags the summary counts.
  const cards = useMemo<ProductionCard[]>(() => {
    const today = startOfToday();
    return orders
      .filter(order => !order.isDelivered || showDone)
      .map(order => {
        const resolved = resolveProductionStage(order, stages, steps);
        const materials = { ...order.materialsDefaultToggles, ...order.materialsToggles };
        const materialValues = Object.values(materials);
        const dueDate = order.dueDate;
        const daysLeft = dueDate ? dayDiff(today, dueDate) : null;
        const finished = resolved.total > 0 && resolved.doneCount >= resolved.total;
        return {
          order,
          stageId: resolved.stageId,
          source: resolved.source,
          doneCount: resolved.doneCount,
          total: resolved.total,
          blocker: resolved.blocker,
          currentStep: resolved.currentStep,
          // "Parts ready" means every material box that exists is ticked.
          partsReady: materialValues.length > 0 && materialValues.every(Boolean),
          dueDate,
          isLate: daysLeft !== null && daysLeft < 0 && !order.isDelivered,
          // At risk: due within three days and demonstrably not finished, or
          // flagged by hand on the order.
          isAtRisk: (order.risk !== "" && order.risk !== "None")
            || (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && !finished && !order.isDelivered)
        };
      });
  }, [orders, stages, steps, showDone]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = startOfToday();
    return cards.filter(card => {
      const { order } = card;
      if (query) {
        const haystack = [order.customerName, order.designName, order.watchRef, order.notes]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (assigneeFilter) {
        if (assigneeFilter === "unassigned") {
          if (order.assignedToUid) return false;
        } else if (order.assignedToUid !== assigneeFilter) return false;
      }
      if (priorityFilter && (order.priority || "Normal") !== priorityFilter) return false;
      if (dueFilter) {
        const days = card.dueDate ? dayDiff(today, card.dueDate) : null;
        if (dueFilter === "overdue" && !card.isLate) return false;
        if (dueFilter === "week" && (days === null || days < 0 || days > 7)) return false;
        if (dueFilter === "nodate" && card.dueDate) return false;
      }
      return true;
    });
  }, [cards, search, assigneeFilter, priorityFilter, dueFilter]);

  const summary = useMemo(() => {
    const today = startOfToday();
    const shipReadyIds = new Set(stages.filter(s => s.kind === "shipready").map(s => s.id));
    const blockedIds = new Set(stages.filter(s => s.kind === "blocked").map(s => s.id));
    const live = filteredCards.filter(card => card.stageId !== doneStageId);
    return {
      active: live.length,
      dueThisWeek: live.filter(card => {
        const days = card.dueDate ? dayDiff(today, card.dueDate) : null;
        return days !== null && days >= 0 && days <= 7;
      }).length,
      blocked: live.filter(card => blockedIds.has(card.stageId)).length,
      atRisk: live.filter(card => card.isAtRisk).length,
      readyToShip: live.filter(card => shipReadyIds.has(card.stageId)).length
    };
  }, [filteredCards, stages, doneStageId]);

  const cardsByStage = useMemo(() => {
    const map = new Map<string, ProductionCard[]>();
    stages.forEach(stage => map.set(stage.id, []));
    filteredCards.forEach(card => {
      const bucket = map.get(card.stageId);
      if (bucket) bucket.push(card);
      else map.set(card.stageId, [card]);
    });
    // Soonest due first, undated last — the order a bench works in.
    map.forEach(list => list.sort((a, b) => {
      const left = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    }));
    return map;
  }, [filteredCards, stages]);

  const selected = useMemo(
    () => filteredCards.find(card => card.order.id === selectedId) ?? null,
    [filteredCards, selectedId]
  );

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMemberDetail>();
    team.forEach(member => map.set(member.id, member));
    return map;
  }, [team]);

  function assigneeName(order: ScheduleOrderItem) {
    if (!order.assignedToUid) return t("Unassigned");
    const member = memberById.get(order.assignedToUid);
    return member?.displayName || member?.email || order.assignedToEmail || t("Unassigned");
  }

  const applyStage = useCallback(async (orderId: string, stageId: string, blocker: ProductionBlocker | null) => {
    setBusy(true);
    try {
      const result = await setOrderProductionStage(workspace, { orderId, stageId, blocker });
      await reload();
      const target = stages.find(stage => stage.id === stageId);
      const previous = result?.previous;
      dispatchStudioToast({
        message: `${t("Moved to")} ${target ? t(target.title) : ""}`.trim(),
        actionLabel: previous ? t("Undo") : undefined,
        onAction: previous
          ? () => {
              void (async () => {
                try {
                  await undoOrderProductionStage(workspace, {
                    orderId,
                    previous: { override: previous.override, blocker: previous.blocker }
                  });
                  await reload();
                } catch (failure) {
                  setNotice(failure instanceof Error ? failure.message : t("Could not undo that move."));
                }
              })();
            }
          : undefined
      });
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : t("Could not move that job."));
    } finally {
      setBusy(false);
    }
  }, [workspace, reload, stages, t]);

  function requestMove(orderId: string, stageId: string) {
    const target = stages.find(stage => stage.id === stageId);
    if (!target) return;
    // The blocked lane is the one place the board asks a question before it
    // accepts a card.
    if (target.kind === "blocked") {
      setBlockerPrompt({ orderId, stageId });
      return;
    }
    void applyStage(orderId, stageId, null);
  }

  function onCardDragStart(event: DragEvent<HTMLDivElement>, orderId: string) {
    if (!canEdit) return;
    setDragOrderId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", orderId);
  }

  function onColumnDrop(event: DragEvent<HTMLElement>, stageId: string) {
    event.preventDefault();
    setDragOverStage("");
    const orderId = dragOrderId || event.dataTransfer.getData("text/plain");
    setDragOrderId("");
    if (!orderId || !canEdit) return;
    const card = cards.find(item => item.order.id === orderId);
    if (card && card.stageId === stageId) return;
    requestMove(orderId, stageId);
  }

  if (loading) {
    return <div className="production-page"><p className="production-notice">{t("Loading production…")}</p></div>;
  }

  return (
    <div className="production-page">
      <header className="production-head">
        <div>
          <h1>{t("Production")}</h1>
          <p>{t("See every active order, current production stage and blocker in one place.")}</p>
        </div>
        <div className="production-head-actions">
          <button type="button" className="production-btn" onClick={() => setStagesOpen(true)} disabled={!canEdit}>
            <span aria-hidden>⚙</span> {t("Production settings")}
          </button>
          <button type="button" className="production-btn production-btn-primary" onClick={() => router.push("/orders?new=1")}>
            <span aria-hidden>＋</span> {t("Add production order")}
          </button>
        </div>
      </header>

      {notice ? <p className="production-notice">{t(notice)}</p> : null}

      <div className="production-kpis">
        <KpiCard tone="blue" icon="▶" label={t("Active")} value={summary.active} />
        <KpiCard tone="amber" icon="🗓" label={t("Due this week")} value={summary.dueThisWeek} />
        <KpiCard tone="red" icon="⏱" label={t("Blocked")} value={summary.blocked} />
        <KpiCard tone="yellow" icon="🛡" label={t("At risk")} value={summary.atRisk} />
        <KpiCard tone="green" icon="🚚" label={t("Ready to ship")} value={summary.readyToShip} />
      </div>

      <div className="production-toolbar">
        <label className="production-search">
          <span aria-hidden>⌕</span>
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t("Search order, customer or item")}
          />
        </label>
        <select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} className="production-select">
          <option value="">{t("All assignees")}</option>
          <option value="unassigned">{t("Unassigned")}</option>
          {team.map(member => (
            <option key={member.id} value={member.id}>{member.displayName || member.email}</option>
          ))}
        </select>
        <select value={dueFilter} onChange={event => setDueFilter(event.target.value)} className="production-select">
          <option value="">{t("All due dates")}</option>
          <option value="overdue">{t("Overdue")}</option>
          <option value="week">{t("Next 7 days")}</option>
          <option value="nodate">{t("No due date")}</option>
        </select>
        <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className="production-select">
          <option value="">{t("All priorities")}</option>
          {["Low", "Normal", "High", "Urgent"].map(item => (
            <option key={item} value={item}>{t(item)}</option>
          ))}
        </select>
        <label className="production-toggle">
          <input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} />
          {t("Show delivered")}
        </label>
        <div className="production-views">
          {(["board", "list", "workload"] as ViewMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              className={view === mode ? "is-active" : ""}
              onClick={() => setView(mode)}
            >
              {mode === "board" ? t("Board") : mode === "list" ? t("List") : t("Workload")}
            </button>
          ))}
        </div>
      </div>

      <div className={`production-body${selected ? " has-panel" : ""}`}>
        <div className="production-main">
          {view === "board" ? (
            <div className="production-board">
              {stages.map(stage => {
                const list = cardsByStage.get(stage.id) ?? [];
                const level = wipLoadLevel(list.length, stage.wipLimit);
                return (
                  <section
                    key={stage.id}
                    className={`production-column${dragOverStage === stage.id ? " is-drop-target" : ""}`}
                    onDragOver={event => {
                      if (!canEdit) return;
                      event.preventDefault();
                      setDragOverStage(stage.id);
                    }}
                    onDragLeave={() => setDragOverStage(current => (current === stage.id ? "" : current))}
                    onDrop={event => onColumnDrop(event, stage.id)}
                  >
                    <header className="production-column-head">
                      <div className="production-column-title">
                        <span className="production-dot" style={{ background: STAGE_DOT_COLORS[stage.kind] }} />
                        {t(stage.title)}
                        {level === "over" ? <span className="production-wip-warn" title={t("Over capacity")}>⚠</span> : null}
                      </div>
                      <div className="production-column-meta">
                        <strong>{list.length}</strong>
                        {stage.wipLimit > 0 ? <span>{list.length} / {stage.wipLimit}</span> : null}
                      </div>
                      {stage.wipLimit > 0 ? (
                        <div className={`production-wip production-wip-${level}`}>
                          <span style={{ width: `${Math.min(100, (list.length / stage.wipLimit) * 100)}%` }} />
                        </div>
                      ) : <div className="production-wip production-wip-none"><span style={{ width: "0%" }} /></div>}
                    </header>

                    <div className="production-column-body">
                      {list.map(card => (
                        <BoardCard
                          key={card.order.id}
                          card={card}
                          t={t}
                          selected={selectedId === card.order.id}
                          dragging={dragOrderId === card.order.id}
                          draggable={canEdit}
                          assignee={assigneeName(card.order)}
                          onSelect={() => setSelectedId(card.order.id)}
                          onDragStart={event => onCardDragStart(event, card.order.id)}
                          onDragEnd={() => { setDragOrderId(""); setDragOverStage(""); }}
                        />
                      ))}
                      {list.length === 0 ? <p className="production-column-empty">{t("Nothing here")}</p> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {view === "list" ? (
            <ProductionListView
              cards={filteredCards}
              stages={stages}
              t={t}
              canEdit={canEdit}
              busy={busy}
              assigneeName={assigneeName}
              onSelect={setSelectedId}
              onMove={requestMove}
            />
          ) : null}

          {view === "workload" ? (
            <ProductionWorkloadView
              cards={filteredCards}
              team={team}
              stages={stages}
              doneStageId={doneStageId}
              t={t}
              onSelect={setSelectedId}
            />
          ) : null}
        </div>

        {selected ? (
          <ProductionDetailPanel
            card={selected}
            stages={stages}
            steps={steps}
            t={t}
            canEdit={canEdit}
            busy={busy}
            assignee={assigneeName(selected.order)}
            onClose={() => setSelectedId("")}
            onOpenOrder={() => router.push(`/orders/${selected.order.id}`)}
            onMove={stageId => requestMove(selected.order.id, stageId)}
          />
        ) : null}
      </div>

      <p className="production-footnote">
        <span aria-hidden>ⓘ</span> {t("Production status is separate from Order, Payment and Delivery status.")}
      </p>

      {blockerPrompt ? (
        <BlockerModal
          t={t}
          busy={busy}
          onCancel={() => setBlockerPrompt(null)}
          onConfirm={blocker => {
            const pending = blockerPrompt;
            setBlockerPrompt(null);
            void applyStage(pending.orderId, pending.stageId, blocker);
          }}
        />
      ) : null}

      {stagesOpen ? (
        <ProductionStagesModal
          workspace={workspace}
          stages={stages}
          t={t}
          onClose={() => setStagesOpen(false)}
          onSaved={saved => { setStages(saved); setStagesOpen(false); void reload(); }}
        />
      ) : null}
    </div>
  );
}

function KpiCard({ tone, icon, label, value }: { tone: string; icon: string; label: string; value: number }) {
  return (
    <div className={`production-kpi production-kpi-${tone}`}>
      <span className="production-kpi-icon" aria-hidden>{icon}</span>
      <div>
        <span className="production-kpi-label">{label}</span>
        <strong className="production-kpi-value">{value}</strong>
      </div>
    </div>
  );
}

function priorityTone(priority: string) {
  const value = priority.trim().toLowerCase();
  if (value === "urgent") return "urgent";
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "normal";
}

function blockerLabel(reason: string, t: (text: string) => string) {
  const found = PRODUCTION_BLOCKER_REASONS.find(item => item.id === reason);
  return found ? t(found.label) : t("Blocked");
}

function BoardCard({
  card, t, selected, dragging, draggable, assignee, onSelect, onDragStart, onDragEnd
}: {
  card: ProductionCard;
  t: (text: string) => string;
  selected: boolean;
  dragging: boolean;
  draggable: boolean;
  assignee: string;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const { order } = card;
  return (
    <div
      className={`production-card${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}
    >
      <div className="production-card-top">
        {order.previewImageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={order.previewImageUrl} alt="" className="production-card-thumb" />
          : <span className="production-card-thumb production-card-thumb-empty" aria-hidden />}
        <div className="production-card-heading">
          <span className="production-card-ref">#{order.watchRef || order.id.slice(0, 6)} · {order.customerName}</span>
          <strong>{order.designName}</strong>
        </div>
      </div>

      <div className={`production-card-due${card.isLate ? " is-late" : ""}`}>
        <span aria-hidden>🗓</span>
        {card.dueDate ? card.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : t("No due date")}
      </div>

      <div className="production-card-row">
        <span className="production-card-person">{assignee}</span>
        <span className={`production-chip production-chip-${priorityTone(order.priority || "Normal")}`}>
          {t(order.priority || "Normal")}
        </span>
      </div>

      {card.total > 0 ? (
        <div className="production-card-steps">{card.doneCount} / {card.total} {t("steps")}</div>
      ) : null}

      {card.blocker ? (
        <div className="production-card-blocker">
          <span aria-hidden>⚠</span>
          {card.blocker.note || blockerLabel(card.blocker.reason, t)}
        </div>
      ) : card.partsReady ? (
        <div className="production-card-parts"><span aria-hidden>✓</span> {t("Parts ready")}</div>
      ) : null}
    </div>
  );
}

function ProductionListView({
  cards, stages, t, canEdit, busy, assigneeName, onSelect, onMove
}: {
  cards: ProductionCard[];
  stages: ProductionStage[];
  t: (text: string) => string;
  canEdit: boolean;
  busy: boolean;
  assigneeName: (order: ScheduleOrderItem) => string;
  onSelect: (orderId: string) => void;
  onMove: (orderId: string, stageId: string) => void;
}) {
  if (cards.length === 0) return <p className="production-notice">{t("No jobs match these filters.")}</p>;
  return (
    <div className="production-list-wrap">
      <table className="production-list">
        <thead>
          <tr>
            <th>{t("Order")}</th>
            <th>{t("Customer")}</th>
            <th>{t("Stage")}</th>
            <th>{t("Current operation")}</th>
            <th>{t("Steps")}</th>
            <th>{t("Due")}</th>
            <th>{t("Assignee")}</th>
            <th>{t("Priority")}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map(card => (
            <tr key={card.order.id} onClick={() => onSelect(card.order.id)}>
              <td><strong>{card.order.designName}</strong></td>
              <td>{card.order.customerName}</td>
              <td onClick={event => event.stopPropagation()}>
                <select
                  className="production-select production-select-sm"
                  value={card.stageId}
                  disabled={!canEdit || busy}
                  onChange={event => onMove(card.order.id, event.target.value)}
                >
                  {stages.map(stage => <option key={stage.id} value={stage.id}>{t(stage.title)}</option>)}
                </select>
              </td>
              <td>{card.blocker ? blockerLabel(card.blocker.reason, t) : (card.currentStep ? t(card.currentStep.title) : "—")}</td>
              <td>{card.total > 0 ? `${card.doneCount} / ${card.total}` : "—"}</td>
              <td className={card.isLate ? "is-late" : ""}>
                {card.dueDate ? card.dueDate.toLocaleDateString() : "—"}
              </td>
              <td>{assigneeName(card.order)}</td>
              <td><span className={`production-chip production-chip-${priorityTone(card.order.priority || "Normal")}`}>{t(card.order.priority || "Normal")}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionWorkloadView({
  cards, team, stages, doneStageId, t, onSelect
}: {
  cards: ProductionCard[];
  team: TeamMemberDetail[];
  stages: ProductionStage[];
  doneStageId: string;
  t: (text: string) => string;
  onSelect: (orderId: string) => void;
}) {
  const live = cards.filter(card => card.stageId !== doneStageId);
  const blockedIds = new Set(stages.filter(stage => stage.kind === "blocked").map(stage => stage.id));

  const rows = useMemo(() => {
    const buckets = new Map<string, { name: string; cards: ProductionCard[] }>();
    buckets.set("", { name: t("Unassigned"), cards: [] });
    team.forEach(member => buckets.set(member.id, { name: member.displayName || member.email, cards: [] }));
    live.forEach(card => {
      const key = card.order.assignedToUid || "";
      const bucket = buckets.get(key) ?? { name: card.order.assignedToEmail || t("Unassigned"), cards: [] };
      bucket.cards.push(card);
      buckets.set(key, bucket);
    });
    return [...buckets.entries()]
      .filter(([key, bucket]) => bucket.cards.length > 0 || key !== "")
      .sort((a, b) => b[1].cards.length - a[1].cards.length);
  }, [live, team, t]);

  const busiest = Math.max(1, ...rows.map(([, bucket]) => bucket.cards.length));

  return (
    <div className="production-workload">
      {rows.map(([key, bucket]) => {
        const late = bucket.cards.filter(card => card.isLate).length;
        const blocked = bucket.cards.filter(card => blockedIds.has(card.stageId)).length;
        return (
          <section key={key || "unassigned"} className="production-workload-row">
            <header>
              <strong>{bucket.name}</strong>
              <span>
                {bucket.cards.length} {t("jobs")}
                {late > 0 ? ` · ${late} ${t("late")}` : ""}
                {blocked > 0 ? ` · ${blocked} ${t("blocked")}` : ""}
              </span>
            </header>
            <div className="production-workload-bar">
              <span style={{ width: `${(bucket.cards.length / busiest) * 100}%` }} />
            </div>
            <div className="production-workload-cards">
              {bucket.cards.map(card => (
                <button key={card.order.id} type="button" onClick={() => onSelect(card.order.id)}>
                  {card.order.designName}
                  {card.dueDate ? <em>{card.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</em> : null}
                </button>
              ))}
              {bucket.cards.length === 0 ? <p className="production-column-empty">{t("Nothing assigned")}</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProductionDetailPanel({
  card, stages, steps, t, canEdit, busy, assignee, onClose, onOpenOrder, onMove
}: {
  card: ProductionCard;
  stages: ProductionStage[];
  steps: HeadingItem[];
  t: (text: string) => string;
  canEdit: boolean;
  busy: boolean;
  assignee: string;
  onClose: () => void;
  onOpenOrder: () => void;
  onMove: (stageId: string) => void;
}) {
  const { order } = card;
  const percent = card.total > 0 ? Math.round((card.doneCount / card.total) * 100) : 0;
  const stage = stages.find(item => item.id === card.stageId);

  return (
    <aside className="production-panel">
      <header className="production-panel-head">
        <span className="production-panel-grip" aria-hidden>••</span>
        <button type="button" className="production-panel-close" onClick={onClose} aria-label={t("Close")}>✕</button>
      </header>

      <div className="production-panel-top">
        {order.previewImageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={order.previewImageUrl} alt="" className="production-panel-thumb" />
          : <span className="production-panel-thumb production-card-thumb-empty" aria-hidden />}
        <div>
          <span className="production-card-ref">#{order.watchRef || order.id.slice(0, 6)} · {order.customerName}</span>
          <strong className="production-panel-title">{order.designName}</strong>
          <span className={`production-chip production-chip-${priorityTone(order.priority || "Normal")}`}>
            {t(order.priority || "Normal")}
          </span>
        </div>
      </div>

      <div className="production-panel-meta">
        <span className={card.isLate ? "is-late" : ""}>
          <span aria-hidden>🗓</span> {card.dueDate ? `${t("Due")} ${card.dueDate.toLocaleDateString()}` : t("No due date")}
        </span>
        <span><span aria-hidden>👤</span> {assignee}</span>
      </div>

      <div className="production-panel-progress">
        <div className="production-panel-progress-head">
          <span>{t("Production progress")}</span>
          <strong>{percent}%</strong>
        </div>
        <div className="production-progress-track"><span style={{ width: `${percent}%` }} /></div>
        <span className="production-panel-progress-sub">{card.doneCount} / {card.total} {t("steps")}</span>
      </div>

      <ol className="production-steps">
        {steps.map((step, index) => {
          const value = productionStepValue(order, step, index);
          const done = productionStepIsDone(value);
          const current = card.currentStep?.id === step.id && !done;
          return (
            <li key={step.id || step.title} className={done ? "is-done" : current ? "is-current" : ""}>
              <span className="production-step-mark" aria-hidden>{done ? "✓" : index + 1}</span>
              <span className="production-step-body">
                <strong>{t(step.title)}</strong>
                {current ? <em>{t("In progress")}</em> : null}
              </span>
            </li>
          );
        })}
        {steps.length === 0 ? <li className="production-column-empty">{t("No production steps configured.")}</li> : null}
      </ol>

      <dl className="production-panel-facts">
        <div>
          <dt>{t("Current operation")}</dt>
          <dd>{card.currentStep ? t(card.currentStep.title) : t("Nothing in progress")}</dd>
        </div>
        <div>
          <dt>{t("Materials")}</dt>
          <dd className={card.partsReady ? "is-good" : ""}>
            {card.partsReady ? `✓ ${t("Parts ready")}` : t("Not confirmed")}
          </dd>
        </div>
        <div>
          <dt>{t("Blocker")}</dt>
          <dd className={card.blocker ? "is-bad" : ""}>
            {card.blocker
              ? `${blockerLabel(card.blocker.reason, t)}${card.blocker.note ? ` — ${card.blocker.note}` : ""}`
              : t("No blocker")}
          </dd>
        </div>
        {card.source === "manual" ? (
          <div>
            <dt>{t("Stage")}</dt>
            <dd>{t("Set by hand")}{stage ? ` · ${t(stage.title)}` : ""}</dd>
          </div>
        ) : null}
      </dl>

      <div className="production-panel-actions">
        <button type="button" className="production-btn" onClick={onOpenOrder}>
          <span aria-hidden>↗</span> {t("Open order")}
        </button>
        <label className="production-panel-move">
          <span>{t("Update status")}</span>
          <select
            className="production-select"
            value={card.stageId}
            disabled={!canEdit || busy}
            onChange={event => onMove(event.target.value)}
          >
            {stages.map(item => <option key={item.id} value={item.id}>{t(item.title)}</option>)}
          </select>
        </label>
      </div>
    </aside>
  );
}

function BlockerModal({
  t, busy, onCancel, onConfirm
}: {
  t: (text: string) => string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blocker: ProductionBlocker) => void;
}) {
  const [reason, setReason] = useState(PRODUCTION_BLOCKER_REASONS[0].id as string);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => { noteRef.current?.focus(); }, []);

  return (
    <div className="production-modal-backdrop" role="dialog" aria-modal="true">
      <div className="production-modal">
        <h2>{t("Why is this job waiting?")}</h2>
        <p>{t("A blocked job needs a reason so the board can be trusted.")}</p>
        <div className="production-modal-reasons">
          {PRODUCTION_BLOCKER_REASONS.map(item => (
            <label key={item.id} className={reason === item.id ? "is-active" : ""}>
              <input
                type="radio"
                name="production-blocker-reason"
                value={item.id}
                checked={reason === item.id}
                onChange={() => setReason(item.id)}
              />
              {t(item.label)}
            </label>
          ))}
        </div>
        <label className="production-modal-note">
          <span>{t("Note (optional)")}</span>
          <input ref={noteRef} type="text" value={note} maxLength={240} onChange={event => setNote(event.target.value)} />
        </label>
        <div className="production-modal-actions">
          <button type="button" className="production-btn" onClick={onCancel}>{t("Cancel")}</button>
          <button
            type="button"
            className="production-btn production-btn-primary"
            disabled={busy}
            onClick={() => onConfirm({ reason, note: note.trim() })}
          >
            {t("Mark as blocked")}
          </button>
        </div>
      </div>
    </div>
  );
}
