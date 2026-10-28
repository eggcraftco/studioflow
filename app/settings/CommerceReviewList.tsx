"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { db, functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { workspaceAccessAllows, type WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  decisionNotice,
  duplicateCustomerIdsToLoad,
  resolveReviewPayload,
  reviewCustomerCard,
  reviewRowKey,
  reviewRowsForProvider,
  type CommerceReviewRow,
  type ReviewCustomerCard,
  type ReviewDecision
} from "@/lib/studioflow/commerceReview";
import { CardTitle } from "@/components/CardTitle";
import { CommerceReviewItems } from "./CommerceReviewItems";

// The "Needs review" list with its actions. Rendered inside every channel's Sync health card
// (CommerceSyncHealthCard) and, for the inbound channel — which has no Sync health card — on its own
// (CommerceReviewCard, Settings ▸ Integrations ▸ Other Platforms). Same gates everywhere: the list is
// read by whoever can open that Settings screen (the server checks Orders access); only the owner
// resolves or decides (resolveCommerceReview is owner-only on the server); a member without Customers
// access sees no customer card (the rules refuse the read anyway).

type ResolvePayload = { companyId: string; orderId: string; reviewId?: string; decision?: ReviewDecision };

/** The workspace's open review items (both kinds), straight from listCommerceReviewQueue. */
export async function loadCommerceReviewRows(companyId: string): Promise<CommerceReviewRow[]> {
  const result = await httpsCallable<{ companyId: string }, { items: CommerceReviewRow[] }>(functions, "listCommerceReviewQueue")({ companyId });
  return Array.isArray(result.data?.items) ? result.data.items : [];
}

/** The two cards of a duplicate item, read as the customer page reads them (musteriler/<id>). Unreadable = gone. */
async function loadReviewCards(ids: string[]): Promise<Record<string, ReviewCustomerCard>> {
  const entries = await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, "musteriler", id));
      return [id, reviewCustomerCard(id, snap.exists() ? (snap.data() as Record<string, unknown>) : null)] as const;
    } catch {
      // A merged-away card no longer exists, and the rules refuse a read of a missing customer.
      return [id, reviewCustomerCard(id, null)] as const;
    }
  }));
  return Object.fromEntries(entries);
}

export function CommerceReviewList({ rows, workspace, language = "English", onChanged }: {
  rows: CommerceReviewRow[];
  workspace: WorkspaceContext;
  language?: string;
  /** Reload the list after a resolve or a decision. */
  onChanged: () => Promise<void> | void;
}) {
  const t = (text: string) => studioT(text, language);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  // The review rows carry the buyer's name and the order's total. A member without
  // Orders sees neither; without Financial Info, no total (package E3, the gates
  // the order screens already apply). The customer cards need Customers.
  const canSeeOrders = workspaceAccessAllows(workspace.memberAccess, "orders");
  const canSeeMoney = canSeeOrders && workspaceAccessAllows(workspace.memberAccess, "financialInfo");
  const canSeeCustomers = workspaceAccessAllows(workspace.memberAccess, "customers");
  const [cards, setCards] = useState<Record<string, ReviewCustomerCard>>({});
  const [busyKey, setBusyKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeFailed, setNoticeFailed] = useState(false);

  const idsKey = canSeeCustomers ? duplicateCustomerIdsToLoad(rows).join("|") : "";
  useEffect(() => {
    if (!idsKey) return;
    let active = true;
    void loadReviewCards(idsKey.split("|")).then((loaded) => {
      if (active) setCards((current) => ({ ...current, ...loaded }));
    });
    return () => { active = false; };
  }, [idsKey]);

  const call = useCallback(async (row: CommerceReviewRow, payload: ResolvePayload, success: string) => {
    const key = reviewRowKey(row);
    setBusyKey(`review:${key}`); setNotice(""); setNoticeFailed(false);
    try {
      await httpsCallable<ResolvePayload, { ok: boolean }>(functions, "resolveCommerceReview")(payload);
      setConfirmKey("");
      setNotice(t(success));
      await onChanged();
    } catch (err) {
      setNoticeFailed(true);
      setNotice(friendlyErrorMessage(err, t));
    } finally {
      setBusyKey("");
    }
  }, [language, onChanged]);

  return (
    <>
      {rows.length === 0 ? (
        <p className="muted-copy" style={{ fontSize: 12.5 }}>{t("Nothing needs review.")}</p>
      ) : (
        <CommerceReviewItems
          rows={rows}
          cards={cards}
          t={t}
          isOwner={isOwner}
          canSeeOrders={canSeeOrders}
          canSeeMoney={canSeeMoney}
          canSeeCustomers={canSeeCustomers}
          busyKey={busyKey}
          confirmKey={confirmKey}
          onResolve={(row) => { void call(row, resolveReviewPayload(companyId, row), "Resolved."); }}
          onDecide={(row, decision) => { void call(row, resolveReviewPayload(companyId, row, decision), decisionNotice(decision)); }}
          onAskSame={(row) => { setNotice(""); setConfirmKey(reviewRowKey(row)); }}
          onCancelSame={() => setConfirmKey("")}
        />
      )}
      {notice ? <p className={noticeFailed ? "layout-error" : "success-copy"} style={{ fontSize: 12.5 }} data-review-notice="1">{notice}</p> : null}
    </>
  );
}

/**
 * The review list on its own card, for a channel with no Sync health card: the inbound webhook
 * (website forms, Wix, Squarespace, Zapier, Make). S-B opens "possible duplicate customer" items for
 * inbound buyers too, and before this they were on no screen at all.
 */
export function CommerceReviewCard({ workspace, language = "English", provider, eyebrow, description }: {
  workspace: WorkspaceContext; language?: string; provider: string; eyebrow: string; description: string;
}) {
  const t = (text: string) => studioT(text, language);
  const companyId = workspace.id.trim();
  // listCommerceReviewQueue refuses a member without Orders (requireOrdersAreaAccess); such a member gets no card
  // rather than a refusal (the channel cards swallow the same refusal into an empty list).
  const canSeeOrders = workspaceAccessAllows(workspace.memberAccess, "orders");
  const [rows, setRows] = useState<CommerceReviewRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!companyId || !canSeeOrders) return;
    try {
      setRows(reviewRowsForProvider(await loadCommerceReviewRows(companyId), provider));
      setError("");
    } catch (err) {
      setRows([]);
      setError(friendlyErrorMessage(err, t));
    }
  }, [companyId, provider, language, canSeeOrders]);

  useEffect(() => { void load(); }, [load]);

  if (!canSeeOrders) return null;
  return (
    <section className="card app-card quick-reply-settings-card" id={`commerce-review-${provider}`} data-commerce-review-card={provider}>
      <CardTitle icon="checklist" eyebrow={t(eyebrow)} title={t("Needs review")} />
      <p className="muted-copy" style={{ fontSize: 12.5, margin: "2px 0 8px" }}>{t(description)}</p>
      {error ? <p className="layout-error">{error}</p> : null}
      {rows === null ? (
        <p className="muted-copy" style={{ fontSize: 12.5 }}>{t("Loading…")}</p>
      ) : (
        <CommerceReviewList rows={rows} workspace={workspace} language={language} onChanged={load} />
      )}
    </section>
  );
}
