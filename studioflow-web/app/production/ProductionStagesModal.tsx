"use client";

// The board is the workshop's own. A jeweller works Design → Casting → Setting
// → Polishing; a leather workshop cuts, sews, finishes edges and packs. Only
// the KIND of each lane is fixed (what the machinery needs to know), never the
// wording.

import { useState } from "react";
import {
  PRODUCTION_SINGLETON_KINDS,
  saveProductionStages,
  type ProductionStage,
  type ProductionStageKind
} from "@/lib/studioflow/production";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

const KIND_LABELS: Record<ProductionStageKind, string> = {
  ready: "Not started",
  active: "In production",
  blocked: "Blocked",
  review: "Checking",
  shipready: "Ready to ship",
  done: "Finished"
};

const KIND_HELP: Record<ProductionStageKind, string> = {
  ready: "Where a job waits before anyone starts it.",
  active: "Work actually on the bench. You can have as many of these as you like.",
  blocked: "Jobs that have stopped. Dropping a card here always asks why.",
  review: "Checking before it leaves — quality control.",
  shipready: "Finished work waiting to go out.",
  done: "Closed. Kept off the board unless you ask for it."
};

export function ProductionStagesModal({
  workspace, stages, t, onClose, onSaved
}: {
  workspace: WorkspaceContext;
  stages: ProductionStage[];
  t: (text: string) => string;
  onClose: () => void;
  onSaved: (stages: ProductionStage[]) => void;
}) {
  const [draft, setDraft] = useState<ProductionStage[]>(stages.map(stage => ({ ...stage })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update(index: number, patch: Partial<ProductionStage>) {
    setDraft(current => current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addStage() {
    if (draft.length >= 12) return;
    const id = `stage_${Date.now().toString(36)}`;
    // New lanes are ordinary work lanes; the singleton kinds already exist.
    setDraft(current => [...current, { id, title: t("New step"), kind: "active", wipLimit: 0 }]);
  }

  function removeStage(index: number) {
    const stage = draft[index];
    if (PRODUCTION_SINGLETON_KINDS.includes(stage.kind)) return;
    setDraft(current => current.filter((_, i) => i !== index));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await saveProductionStages(workspace, draft.map(stage => ({
        ...stage,
        title: stage.title.trim() || t("Untitled")
      })));
      onSaved(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not save the board."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="production-modal-backdrop" role="dialog" aria-modal="true">
      <div className="production-modal production-modal-wide">
        <h2>{t("Production settings")}</h2>
        <p>{t("Rename the columns to match how your workshop actually works. The capacity number is a warning, never a wall — you can always move one more job.")}</p>

        <div className="production-stage-editor">
          {draft.map((stage, index) => {
            const locked = PRODUCTION_SINGLETON_KINDS.includes(stage.kind);
            return (
              <div key={stage.id} className="production-stage-row">
                <div className="production-stage-order">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("Move up")}>▲</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} aria-label={t("Move down")}>▼</button>
                </div>
                <label className="production-stage-title">
                  <span>{t("Column name")}</span>
                  <input
                    type="text"
                    value={stage.title}
                    maxLength={40}
                    onChange={event => update(index, { title: event.target.value })}
                  />
                </label>
                <label className="production-stage-kind">
                  <span>{t("Behaves as")}</span>
                  <select
                    value={stage.kind}
                    disabled={locked}
                    onChange={event => update(index, { kind: event.target.value as ProductionStageKind })}
                  >
                    {(["active", "review", "shipready"] as ProductionStageKind[]).map(kind => (
                      <option key={kind} value={kind}>{t(KIND_LABELS[kind])}</option>
                    ))}
                    {locked ? <option value={stage.kind}>{t(KIND_LABELS[stage.kind])}</option> : null}
                  </select>
                  <em>{t(KIND_HELP[stage.kind])}</em>
                </label>
                <label className="production-stage-wip">
                  <span>{t("Capacity")}</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={stage.wipLimit || ""}
                    placeholder={t("None")}
                    onChange={event => update(index, { wipLimit: Number(event.target.value) || 0 })}
                  />
                </label>
                <button
                  type="button"
                  className="production-stage-remove"
                  onClick={() => removeStage(index)}
                  disabled={locked}
                  title={locked ? t("This column is part of how the board works and cannot be removed.") : t("Remove column")}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="production-btn" onClick={addStage} disabled={draft.length >= 12}>
          ＋ {t("Add column")}
        </button>

        {error ? <p className="production-notice">{error}</p> : null}

        <div className="production-modal-actions">
          <button type="button" className="production-btn" onClick={onClose} disabled={busy}>{t("Cancel")}</button>
          <button type="button" className="production-btn production-btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? t("Saving…") : t("Save board")}
          </button>
        </div>
      </div>
    </div>
  );
}
