"use client";

// Bank spending feed (Open Banking via TrueLayer).
// Owner-only: connect a business bank account, see the live transaction feed.
// Read-only account information — the app can never move money.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db, functions } from "@/lib/firebase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { studioT } from "@/lib/studioflow/language";

type BankAccountInfo = { id: string; name: string; currency: string };
type BankConnection = {
  id: string;
  providerName: string;
  providerLogo: string;
  status: string;
  accounts: BankAccountInfo[];
  lastSyncedAt: Date | null;
};
type BankTransaction = {
  id: string;
  amount: number;
  currency: string;
  bookingDate: string;
  description: string;
  counterparty: string;
  status: string;
};

function toDate(value: unknown): Date | null {
  const v = value as { toDate?: () => Date } | null | undefined;
  return v && typeof v.toDate === "function" ? v.toDate() : null;
}

function BankPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "year">("month");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const context = await loadWorkspaceContext(user.uid);
        if (!cancelled) setWorkspace(context);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load the workspace.");
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isOwner = workspace?.role === "owner";
  const companyId = workspace?.id ?? "";

  // Live views over the server-written feed (owner-only per Firestore rules).
  useEffect(() => {
    if (!companyId || !isOwner) return;
    const unsubConnections = onSnapshot(
      collection(db, "companies", companyId, "bankConnections"),
      snap => {
        setConnections(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            providerName: String(data.providerName || ""),
            providerLogo: String(data.providerLogo || ""),
            status: String(data.status || ""),
            accounts: Array.isArray(data.accounts) ? (data.accounts as BankAccountInfo[]) : [],
            lastSyncedAt: toDate(data.lastSyncedAt)
          };
        }));
      }
    );
    const unsubTransactions = onSnapshot(
      query(collection(db, "companies", companyId, "bankTransactions"), orderBy("bookingDate", "desc")),
      snap => {
        setTransactions(snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            amount: Number(data.amount) || 0,
            currency: String(data.currency || "GBP"),
            bookingDate: String(data.bookingDate || ""),
            description: String(data.description || ""),
            counterparty: String(data.counterparty || ""),
            status: String(data.status || "booked")
          };
        }));
      }
    );
    return () => { unsubConnections(); unsubTransactions(); };
  }, [companyId, isOwner]);

  const call = useCallback(async <T,>(name: string, payload: Record<string, unknown>): Promise<T> => {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable({ companyId, ...payload });
    return result.data;
  }, [companyId]);

  // Returning from the bank's consent screen: TrueLayer redirects back with
  // ?code=...&state=... — exchange the code for tokens, then clean the URL.
  useEffect(() => {
    if (!companyId || !isOwner) return;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return;
    let cancelled = false;
    (async () => {
      setBusy("finalize");
      setStatus(t("Finishing the bank connection…"));
      try {
        const result = await call<{ status: string; imported?: number }>("bankFinalizeRequisition", { requisitionId: state, code });
        if (!cancelled) {
          setStatus(result.status === "linked" ? t("Bank connected.") : t("The bank connection is not complete yet."));
        }
      } catch (finalizeError) {
        if (!cancelled) setError(finalizeError instanceof Error ? finalizeError.message : "Could not finish the bank connection.");
      } finally {
        if (!cancelled) {
          setBusy(null);
          router.replace("/bank");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isOwner, searchParams]);

  async function connectBank() {
    setBusy("connect");
    setError(null);
    try {
      const result = await call<{ link: string }>("bankCreateRequisition", {});
      window.location.href = result.link;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not start the bank connection.");
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("sync");
    setError(null);
    setStatus(null);
    try {
      const result = await call<{ synced: number; skipped: number; imported: number }>("bankSyncTransactions", {});
      setStatus(
        result.skipped > 0 && result.synced === 0
          ? t("Already up to date — banks limit how often transactions can be fetched.")
          : t("Transactions refreshed.")
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Could not refresh transactions.");
    } finally {
      setBusy(null);
    }
  }

  async function removeConnection(connection: BankConnection) {
    if (!window.confirm(t("Disconnect this bank and remove its imported transactions?"))) return;
    setBusy(`delete-${connection.id}`);
    setError(null);
    try {
      await call("bankDeleteConnection", { requisitionId: connection.id });
      setStatus(t("Bank disconnected."));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not disconnect the bank.");
    } finally {
      setBusy(null);
    }
  }

  const monthTotal = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return transactions
      .filter(item => item.bookingDate.startsWith(prefix) && item.amount < 0)
      .reduce((acc, item) => acc + Math.abs(item.amount), 0);
  }, [transactions]);

  // Spending per month of the current year (outgoing only), for the Year view.
  const yearSeries = useMemo(() => {
    const year = new Date().getFullYear();
    const totals = Array.from({ length: 12 }, () => 0);
    for (const item of transactions) {
      if (item.amount >= 0 || !item.bookingDate.startsWith(String(year))) continue;
      const month = Number(item.bookingDate.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) totals[month] += Math.abs(item.amount);
    }
    return { year, totals, total: totals.reduce((acc, value) => acc + value, 0) };
  }, [transactions]);

  // The list follows the selected period; anything older stays reachable by
  // switching the tab back.
  const visibleTransactions = useMemo(() => {
    const now = new Date();
    const prefix = view === "month"
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      : String(now.getFullYear());
    return transactions.filter(item => item.bookingDate.startsWith(prefix));
  }, [transactions, view]);

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value);

  if (loading || workspaceLoading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <AppShell>
      <section className="app-card" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🏦 {t("Bank Spending")}</h1>
          <span style={{ fontSize: 11, opacity: 0.65 }}>
            {t("Read-only Open Banking feed — NivaDesk can never move money.")}
          </span>
          <span style={{ flex: 1 }} />
          {isOwner && connections.some(item => item.status === "linked") ? (
            <button type="button" className="finance-payments-add" disabled={busy === "sync"} onClick={() => void refresh()}>
              {busy === "sync" ? t("Refreshing…") : t("Refresh")}
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="finance-payments-add" disabled={busy === "connect"} onClick={() => void connectBank()}>
              {busy === "connect" ? t("Opening your bank…") : `+ ${t("Connect bank")}`}
            </button>
          ) : null}
        </div>

        {!isOwner ? (
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
            {t("Bank connections are managed by the workspace owner.")}
          </p>
        ) : null}

        {status ? <p style={{ marginTop: 10, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{status}</p> : null}
        {error ? <p style={{ marginTop: 10, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}

        {isOwner && connections.length > 0 ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {connections.map(connection => (
              <div key={connection.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(120,120,140,0.2)" }}>
                {connection.providerLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connection.providerLogo} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
                ) : <span aria-hidden="true">🏦</span>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{connection.providerName || t("Bank")}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>
                    {connection.status === "linked"
                      ? `${connection.accounts.length} ${t("account(s)")}${connection.lastSyncedAt ? ` · ${t("Last sync")}: ${connection.lastSyncedAt.toLocaleString()}` : ""}`
                      : t("Waiting for bank consent…")}
                  </div>
                </div>
                <button
                  type="button"
                  className="finance-payments-delete"
                  disabled={busy === `delete-${connection.id}`}
                  onClick={() => void removeConnection(connection)}
                  aria-label={t("Disconnect")}
                  title={t("Disconnect")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {isOwner ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{t("Transactions")}</h2>
              <div role="tablist" aria-label={t("Spending period")} style={{ display: "inline-flex", gap: 2, background: "rgba(120,120,140,0.12)", borderRadius: 8, padding: 2 }}>
                {(["month", "year"] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => setView(option)}
                    style={{
                      border: 0, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                      padding: "4px 12px", borderRadius: 6,
                      background: view === option ? "#2563eb" : "transparent",
                      color: view === option ? "#fff" : "inherit"
                    }}
                  >
                    {option === "month" ? t("This Month") : t("This Year")}
                  </button>
                ))}
              </div>
              {transactions.length > 0 ? (
                <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                  {view === "month"
                    ? <>{t("This month's spending")}: <strong>{money(monthTotal, transactions[0]?.currency || "GBP")}</strong></>
                    : <>{yearSeries.year} {t("spending")}: <strong>{money(yearSeries.total, transactions[0]?.currency || "GBP")}</strong></>}
                </span>
              ) : null}
            </div>

            {view === "year" && transactions.length > 0 ? (
              <div style={{ marginTop: 14, border: "1px solid rgba(120,120,140,0.2)", borderRadius: 10, padding: "14px 14px 8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
                  {yearSeries.totals.map((value, index) => {
                    const max = Math.max(...yearSeries.totals, 1);
                    const height = Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100));
                    const isCurrent = index === new Date().getMonth();
                    return (
                      <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}
                        title={`${new Date(yearSeries.year, index, 1).toLocaleDateString(undefined, { month: "long" })}: ${money(value, transactions[0]?.currency || "GBP")}`}>
                        <div style={{
                          width: "100%", maxWidth: 34, height, borderRadius: "4px 4px 0 0",
                          background: isCurrent ? "#2563eb" : "rgba(37,99,235,0.35)",
                          transition: "height 0.2s ease"
                        }} />
                        <span style={{ fontSize: 9.5, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                          {new Date(yearSeries.year, index, 1).toLocaleDateString(undefined, { month: "narrow" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {transactions.length === 0 ? (
              <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 10 }}>
                {connections.length === 0
                  ? t("Connect your business bank to see spending here as it happens.")
                  : t("No transactions imported yet. Try Refresh.")}
              </p>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
                {visibleTransactions.length === 0 ? (
                  <p style={{ fontSize: 12.5, opacity: 0.7 }}>{t("No transactions in this period yet.")}</p>
                ) : null}
                {visibleTransactions.slice(0, 300).map(transaction => (
                  <div key={transaction.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {transaction.counterparty || transaction.description || "—"}
                      </div>
                      <div style={{ fontSize: 10.5, opacity: 0.6 }}>
                        {transaction.bookingDate}
                        {transaction.counterparty && transaction.description ? ` · ${transaction.description}` : ""}
                        {transaction.status === "pending" ? ` · ${t("pending")}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: transaction.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>
                      {transaction.amount < 0 ? "−" : "+"}{money(Math.abs(transaction.amount), transaction.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BankPageContent />
    </Suspense>
  );
}
