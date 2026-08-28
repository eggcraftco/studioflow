import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { HeadingItem } from "@/lib/studioflow/blockHeadings";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

// The client half of functions/production.js. The stage an order sits in is
// DERIVED from its steps rather than stored, so this file has to reach exactly
// the same answer the server does — the rules below are a deliberate mirror of
// resolveProductionStage() there, and the shared regression lives in
// functions/test/qa/production-stage.test.js.

export type ProductionStageKind = "ready" | "active" | "blocked" | "review" | "shipready" | "done";

export type ProductionStage = {
  id: string;
  title: string;
  kind: ProductionStageKind;
  wipLimit: number;
};

export type ProductionBlocker = {
  reason: string;
  note: string;
};

export const PRODUCTION_STAGE_KINDS: ProductionStageKind[] = [
  "ready", "active", "blocked", "review", "shipready", "done"
];

// Exactly one lane may mean "not started", "stuck" and "finished".
export const PRODUCTION_SINGLETON_KINDS: ProductionStageKind[] = ["ready", "blocked", "done"];

export const DEFAULT_PRODUCTION_STAGES: ProductionStage[] = [
  { id: "ready", title: "Ready", kind: "ready", wipLimit: 10 },
  { id: "in_production", title: "In Production", kind: "active", wipLimit: 10 },
  { id: "blocked", title: "Waiting / Blocked", kind: "blocked", wipLimit: 10 },
  { id: "quality_check", title: "Quality Check", kind: "review", wipLimit: 10 },
  { id: "ready_to_ship", title: "Ready to Ship", kind: "shipready", wipLimit: 10 },
  { id: "done", title: "Done", kind: "done", wipLimit: 0 }
];

// Stored as codes so the wording can be translated; the note is the operator's
// own words about this particular job.
export const PRODUCTION_BLOCKER_REASONS = [
  { id: "waiting_for_customer_approval", label: "Waiting for customer approval" },
  { id: "material_unavailable", label: "Material unavailable" },
  { id: "supplier_delay", label: "Supplier delay" },
  { id: "technical_problem", label: "Technical problem" },
  { id: "other", label: "Other" }
] as const;

const DONE_STEP_VALUES = new Set(["done", "complete", "completed", "finished", "yes", "ready"]);
const IDLE_STEP_VALUES = new Set(["", "not yet", "new", "none", "no", "pending", "todo", "to do", "waiting"]);

function slugifyStageId(value: string, fallback: string) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

function cleanWipLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(999, Math.round(number));
}

/** Read a workspace's board, repairing anything malformed. Never returns []. */
export function productionStagesFromSettings(raw: unknown): ProductionStage[] {
  const list = Array.isArray(raw) ? raw : [];
  const stages: ProductionStage[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = String(record.title ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!title) continue;
    const kind = PRODUCTION_STAGE_KINDS.includes(record.kind as ProductionStageKind)
      ? (record.kind as ProductionStageKind)
      : "active";
    let id = slugifyStageId(String(record.id ?? "") || title, `stage_${stages.length + 1}`);
    while (seen.has(id)) id = `${id}_${stages.length + 1}`;
    seen.add(id);
    stages.push({ id, title, kind, wipLimit: cleanWipLimit(record.wipLimit) });
  }
  if (stages.length === 0) return DEFAULT_PRODUCTION_STAGES.map(stage => ({ ...stage }));

  for (const kind of PRODUCTION_SINGLETON_KINDS) {
    if (stages.some(stage => stage.kind === kind)) continue;
    const fallback = DEFAULT_PRODUCTION_STAGES.find(stage => stage.kind === kind)!;
    const id = seen.has(fallback.id) ? `${fallback.id}_${stages.length + 1}` : fallback.id;
    seen.add(id);
    if (kind === "ready") stages.unshift({ ...fallback, id });
    else stages.push({ ...fallback, id });
  }
  if (!stages.some(stage => stage.kind === "active")) {
    stages.splice(1, 0, { ...DEFAULT_PRODUCTION_STAGES[1], id: "in_production_1" });
  }
  return stages;
}

function stageOfKind(stages: ProductionStage[], kind: ProductionStageKind) {
  return stages.find(stage => stage.kind === kind) ?? null;
}

function normalize(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function productionStepIsDone(value: string | undefined) {
  return DONE_STEP_VALUES.has(normalize(value));
}

function stepIsIdle(value: string | undefined) {
  const normalized = normalize(value);
  return normalized === "" || IDLE_STEP_VALUES.has(normalized);
}

/** Minimum an order must expose for its stage to be resolved. */
export type ProductionOrderLike = {
  designStatus?: string;
  status?: string;
  extraStatuses?: Record<string, string>;
  isDelivered?: boolean;
  productionStageOverride?: string;
  productionBlocker?: { reason?: string; note?: string } | null;
};

/** Step 0 answers in designStatus, step 1 in status, the rest in extraStatuses. */
export function productionStepValue(order: ProductionOrderLike, step: HeadingItem, index: number) {
  const extras = order.extraStatuses ?? {};
  const rawId = String(step.id || step.title || "").trim();
  const keyed = extras[`statusStep::${rawId.toLowerCase()}`];
  if (typeof keyed === "string" && keyed.trim()) return keyed;
  const byTitle = extras[step.title];
  if (typeof byTitle === "string" && byTitle.trim()) return byTitle;
  if (index === 0) return String(order.designStatus ?? "");
  if (index === 1) return String(order.status ?? "");
  return "";
}

export function cleanProductionBlocker(value: unknown): ProductionBlocker | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const reason = PRODUCTION_BLOCKER_REASONS.some(item => item.id === record.reason)
    ? String(record.reason)
    : "";
  if (!reason) return null;
  return { reason, note: String(record.note ?? "").replace(/\s+/g, " ").trim().slice(0, 240) };
}

export type ResolvedProductionStage = {
  stageId: string;
  source: "auto" | "manual" | "blocker" | "delivered";
  doneCount: number;
  total: number;
  blocker: ProductionBlocker | null;
  /** The step now being worked — the card's "current operation" line. */
  currentStep: HeadingItem | null;
};

export function resolveProductionStage(
  order: ProductionOrderLike,
  stages: ProductionStage[],
  steps: HeadingItem[]
): ResolvedProductionStage {
  const blocked = stageOfKind(stages, "blocked");
  const ready = stageOfKind(stages, "ready") ?? stages[0];
  const done = stageOfKind(stages, "done") ?? stages[stages.length - 1];
  const shipReady = stageOfKind(stages, "shipready") ?? stageOfKind(stages, "review") ?? done;
  const firstActive = stages.find(stage => stage.kind === "active") ?? ready;

  const values = steps.map((step, index) => productionStepValue(order, step, index));
  const doneCount = values.filter(productionStepIsDone).length;
  const total = steps.length;
  const currentIndex = values.findIndex(value => !productionStepIsDone(value));
  const currentStep = currentIndex >= 0 ? steps[currentIndex] ?? null : null;
  const base = { doneCount, total, currentStep };

  const blocker = cleanProductionBlocker(order.productionBlocker);
  if (blocker && blocked) return { ...base, stageId: blocked.id, source: "blocker", blocker };

  const override = String(order.productionStageOverride ?? "").trim();
  if (order.isDelivered === true && done) return { ...base, stageId: done.id, source: "delivered", blocker: null };
  if (override && stages.some(stage => stage.id === override)) {
    return { ...base, stageId: override, source: "manual", blocker: null };
  }

  if (total === 0) return { ...base, stageId: ready.id, source: "auto", blocker: null };
  if (doneCount >= total) return { ...base, stageId: shipReady.id, source: "auto", blocker: null };
  if (values.every(stepIsIdle)) return { ...base, stageId: ready.id, source: "auto", blocker: null };

  if (currentStep) {
    const wanted = String(currentStep.title || "").trim().toLowerCase();
    const named = stages.find(stage => stage.kind !== "blocked" && stage.title.trim().toLowerCase() === wanted);
    if (named) return { ...base, stageId: named.id, source: "auto", blocker: null };
  }
  return { ...base, stageId: firstActive.id, source: "auto", blocker: null };
}

/** Green under 80% of the WIP limit, amber approaching it, red over. */
export function wipLoadLevel(count: number, limit: number): "none" | "ok" | "near" | "over" {
  if (!limit || limit <= 0) return "none";
  if (count > limit) return "over";
  if (count >= Math.ceil(limit * 0.8)) return "near";
  return "ok";
}

export type SetProductionStageResult = {
  ok?: boolean;
  stageId?: string;
  previous?: { stageId: string; override: string; blocker: ProductionBlocker | null };
  message?: string;
};

export async function setOrderProductionStage(
  workspace: WorkspaceContext,
  input: { orderId: string; stageId: string; blocker?: ProductionBlocker | null }
) {
  return withWebSyncStatus(async () => {
    const callable = httpsCallable<Record<string, unknown>, SetProductionStageResult>(functions, "setOrderProductionStage");
    const response = await callable({ companyId: workspace.id, ...input });
    if (response.data?.ok === false) throw new Error(response.data.message || "Could not move that job.");
    return response.data;
  });
}

export async function undoOrderProductionStage(
  workspace: WorkspaceContext,
  input: { orderId: string; previous: { override: string; blocker: ProductionBlocker | null } }
) {
  return withWebSyncStatus(async () => {
    const callable = httpsCallable<Record<string, unknown>, { ok?: boolean; message?: string }>(functions, "undoOrderProductionStage");
    const response = await callable({ companyId: workspace.id, ...input });
    if (response.data?.ok === false) throw new Error(response.data.message || "Could not undo that move.");
    return response.data;
  });
}

export async function saveProductionStages(workspace: WorkspaceContext, stages: ProductionStage[]) {
  return withWebSyncStatus(async () => {
    const callable = httpsCallable<Record<string, unknown>, { ok?: boolean; stages?: ProductionStage[]; message?: string }>(
      functions,
      "saveProductionStages"
    );
    const response = await callable({ companyId: workspace.id, stages });
    if (response.data?.ok === false) throw new Error(response.data.message || "Could not save the board.");
    return productionStagesFromSettings(response.data?.stages);
  });
}
