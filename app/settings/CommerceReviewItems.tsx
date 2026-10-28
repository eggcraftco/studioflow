"use client";

import type { CSSProperties } from "react";
import {
  canDecideDuplicate,
  differingCardFields,
  duplicateAgreementLabels,
  duplicateConflictLabels,
  duplicateMatchSummary,
  duplicateNewCustomerId,
  isDuplicateCustomerRow,
  reviewOrderNumberText,
  reviewProviderLabel,
  reviewReasonLabels,
  reviewRowKey,
  reviewRowLink,
  type CommerceReviewRow,
  type ReviewCustomerCard,
  type ReviewDecision
} from "@/lib/studioflow/commerceReview";

// The rows of the "Needs review" list, drawn from props only (no reads, no calls), so the same markup
// serves every channel's card and scripts/check-commerce-review-ui.mjs can render it. The stateful part
// (loading the two customer cards, calling resolveCommerceReview) is CommerceReviewList.tsx.

const PILL_BUTTON: CSSProperties = { padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 };

export type CommerceReviewItemsProps = {
  rows: CommerceReviewRow[];
  /** Loaded customer cards by id (the two cards of each duplicate item); a missing id is still loading. */
  cards: Record<string, ReviewCustomerCard>;
  t: (text: string) => string;
  isOwner: boolean;
  canSeeOrders: boolean;
  canSeeMoney: boolean;
  canSeeCustomers: boolean;
  /** `review:<row key>` while that row's call runs. */
  busyKey: string;
  /** The row key whose "Same person" waits for its confirmation. */
  confirmKey: string;
  onResolve: (row: CommerceReviewRow) => void;
  onDecide: (row: CommerceReviewRow, decision: ReviewDecision) => void;
  onAskSame: (row: CommerceReviewRow) => void;
  onCancelSame: () => void;
};

export function CommerceReviewItems(props: CommerceReviewItemsProps) {
  const { rows } = props;
  return (
    <div style={{ display: "grid", gap: 8 }} data-commerce-review-list="1">
      {rows.map((row) => (isDuplicateCustomerRow(row)
        ? <DuplicateCustomerItem key={reviewRowKey(row)} row={row} {...props} />
        : <EngineReviewItem key={reviewRowKey(row)} row={row} {...props} />))}
    </div>
  );
}

function RowLink({ row, t, canSeeOrders, canSeeCustomers }: { row: CommerceReviewRow; t: (text: string) => string; canSeeOrders: boolean; canSeeCustomers: boolean }) {
  const link = reviewRowLink(row, { canSeeOrders, canSeeCustomers });
  if (!link) return null;
  return (
    <a className="button secondary" style={PILL_BUTTON} href={link.href} data-review-link={link.kind}>{t(link.label)}</a>
  );
}

/** The engine's row, as it always was: channel · #order · buyer · total · reasons · Open order · Resolve (owner). */
function EngineReviewItem({ row, t, isOwner, canSeeOrders, canSeeMoney, canSeeCustomers, busyKey, onResolve }: CommerceReviewItemsProps & { row: CommerceReviewRow }) {
  const key = reviewRowKey(row);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12.5 }} data-review-kind="order" data-review-key={key}>
      <span className="due-pill warning">{t(reviewProviderLabel(row))}</span>
      <span>#{row.orderNumber || row.externalId}{canSeeOrders && row.customerName ? ` · ${row.customerName}` : ""}{canSeeMoney && row.grandTotal ? ` · ${row.grandTotal} ${row.currency || ""}` : ""}</span>
      <span className="muted-copy">{reviewReasonLabels(row).map((label) => t(label)).join(", ")}</span>
      <RowLink row={row} t={t} canSeeOrders={canSeeOrders} canSeeCustomers={canSeeCustomers} />
      {isOwner ? (
        <button type="button" className="button" style={PILL_BUTTON} disabled={busyKey === `review:${key}`} onClick={() => onResolve(row)} data-review-action="resolve">
          {t("Resolve")}
        </button>
      ) : null}
    </div>
  );
}

function CustomerBox({ caption, card, differing, t, testId }: {
  caption: string; card: ReviewCustomerCard | undefined; differing: Array<"email" | "phone" | "city">; t: (text: string) => string; testId: string;
}) {
  const lines: Array<{ field: "name" | "email" | "phone" | "city"; label: string; value: string }> = card?.exists
    ? [
        { field: "name", label: "Name", value: card.name },
        { field: "email", label: "Email", value: card.email },
        { field: "phone", label: "Phone", value: card.phone },
        { field: "city", label: "City", value: card.city }
      ]
    : [];
  return (
    <div
      data-review-card={testId}
      style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--panel)", minWidth: 0 }}
    >
      <div className="muted-copy" style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{t(caption)}</div>
      {!card ? (
        <div className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("Loading…")}</div>
      ) : !card.exists ? (
        <div className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("This card is no longer there.")}</div>
      ) : (
        <dl style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 8, rowGap: 3, alignItems: "baseline", margin: 0, fontSize: 12.5 }}>
          {lines.map((line) => {
            const differs = line.field !== "name" && differing.includes(line.field);
            return (
              <div key={line.field} style={{ display: "contents" }} data-review-field={line.field} data-review-differs={differs ? "1" : undefined}>
                <dt className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t(line.label)}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere", fontWeight: differs ? 700 : 400, ...(differs ? { background: "var(--warning-soft)", borderRadius: 4, paddingInline: 4, justifySelf: "start" } : {}) }}>
                  {line.value || "—"}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/** S-B: "Possible duplicate customer" — the two cards side by side, what conflicts, and the owner's two answers. */
function DuplicateCustomerItem({ row, t, isOwner, canSeeOrders, canSeeCustomers, cards, busyKey, confirmKey, onResolve, onDecide, onAskSame, onCancelSame }: CommerceReviewItemsProps & { row: CommerceReviewRow }) {
  const key = reviewRowKey(row);
  const busy = busyKey === `review:${key}`;
  const existingId = String(row.existingCustomerId ?? "").trim();
  const newId = duplicateNewCustomerId(row);
  const existing = existingId ? cards[existingId] : undefined;
  const fresh = newId ? cards[newId] : undefined;
  const differing = differingCardFields(existing, fresh);
  const conflicts = duplicateConflictLabels(row.match);
  const agrees = duplicateAgreementLabels(row.match);
  const decidable = canDecideDuplicate(row);
  const confirming = confirmKey === key;
  return (
    <div
      data-review-kind="customer_duplicate"
      data-review-key={key}
      style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 8, fontSize: 12.5, minWidth: 0 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span className="due-pill warning">{t(reviewProviderLabel(row))}</span>
        <strong data-review-title="1">{t("Possible duplicate customer")}</strong>
        {canSeeOrders && reviewOrderNumberText(row.orderNumber) ? <span className="muted-copy" style={{ margin: 0 }}>{reviewOrderNumberText(row.orderNumber)}</span> : null}
      </div>
      <p className="muted-copy" style={{ margin: 0 }} data-review-summary="1">{t(duplicateMatchSummary(row.match))}</p>
      {conflicts.length || agrees.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-review-conflicts="1">
          {conflicts.map((label) => <span key={label} className="due-pill warning">{t(label)}</span>)}
          {agrees.map((label) => <span key={label} className="due-pill">{t(label)}</span>)}
        </div>
      ) : null}
      {canSeeCustomers && (existingId || newId) ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }} data-review-cards="1">
          <CustomerBox caption="Existing card" card={existing} differing={differing} t={t} testId="existing" />
          <CustomerBox caption="New card" card={fresh} differing={differing} t={t} testId="new" />
        </div>
      ) : null}
      {confirming ? (
        <div style={{ display: "grid", gap: 8 }} data-review-confirm="1">
          <p style={{ margin: 0 }}>{t("Merge the new card into the existing card? The existing card keeps its details, its empty fields are filled from the new card, and the new card is removed. Orders are not changed. This cannot be undone with a click.")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="button" style={PILL_BUTTON} disabled={busy} onClick={() => onDecide(row, "same")} data-review-action="confirm-same">{t("Yes, merge")}</button>
            <button type="button" className="button secondary" style={PILL_BUTTON} disabled={busy} onClick={onCancelSame} data-review-action="cancel-same">{t("Cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <RowLink row={row} t={t} canSeeOrders={canSeeOrders} canSeeCustomers={canSeeCustomers} />
          {isOwner && decidable ? (
            <>
              <button type="button" className="button" style={PILL_BUTTON} disabled={busy} onClick={() => onAskSame(row)} data-review-action="same">{t("Same person")}</button>
              <button type="button" className="button secondary" style={PILL_BUTTON} disabled={busy} onClick={() => onDecide(row, "different")} data-review-action="different">{t("Different people")}</button>
            </>
          ) : isOwner ? (
            <button type="button" className="button" style={PILL_BUTTON} disabled={busy} onClick={() => onResolve(row)} data-review-action="resolve">{t("Resolve")}</button>
          ) : (
            <span className="muted-copy" style={{ margin: 0 }} data-review-owner-only="1">{t("Only the workspace owner can decide.")}</span>
          )}
        </div>
      )}
      {isOwner && decidable && !confirming ? (
        <p className="muted-copy" style={{ margin: 0, fontSize: 11.5 }}>{t("Same person merges the new card into the existing one. Different people keeps both.")}</p>
      ) : null}
    </div>
  );
}
