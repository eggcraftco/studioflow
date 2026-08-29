"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { usePricePrivacy } from "@/components/PricePrivacy";
import { HomeCardShell, type HomeCardState } from "@/components/home/HomeCardShell";
import {
  BankingCardBody,
  CustomersCardBody,
  FilesCardBody,
  GettingStartedCardBody,
  InventoryCardBody,
  MoneyCardBody,
  NotesCardBody,
  OrdersProductionCardBody,
  QuickActionsCardBody,
  RecentActivityCardBody,
  ScheduleCardBody,
  type CardBodyProps,
  type QuickActionId,
} from "@/components/home/HomeCardBodies";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import {
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  type WorkspaceContext,
  type WorkspaceSettingsOverview,
} from "@/lib/studioflow/firestore";
import {
  availableHomeCards,
  defaultHomeLayout,
  hideHomeCard,
  homeCardById,
  moveHomeCard,
  resetHomeCard,
  resizeHomeCard,
  setHomeCardHeading,
  setHomeCardTone,
  showHomeCard,
  visibleHomeCards,
  type HomeCardId,
  type HomeCardSize,
  type HomeCardTone,
  type HomeLayout,
} from "@/lib/studioflow/homeCards";
import { saveHomeLayout, subscribeHomeLayout } from "@/lib/studioflow/homeLayout";
import { useHomeData, type HomeDomain } from "@/lib/studioflow/useHomeData";

/** Which shared domain each card reads, so a card shows its own domain's state. */
const CARD_DOMAIN: Record<HomeCardId, HomeDomain> = {
  gettingStarted: "orders",
  quickActions: "orders",
  recentActivity: "orders",
  money: "orders",
  banking: "bank",
  inventory: "inventory",
  customers: "customers",
  ordersProduction: "orders",
  schedule: "orders",
  files: "files",
  notes: "orders",
};

function greeting(t: (text: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("Good morning");
  if (hour < 18) return t("Good afternoon");
  return t("Good evening");
}

export default function HomePage() {
  const { user, loading: authLoading, language } = useAuth();
  const router = useRouter();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const { hideNumbers } = usePricePrivacy();

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [layout, setLayout] = useState<HomeLayout>(defaultHomeLayout());
  const [customising, setCustomising] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  // The layout as the server last accepted it, so a failed save can be undone.
  const lastSaved = useRef<HomeLayout | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const context = await loadWorkspaceContext(user.uid);
      if (cancelled) return;
      setWorkspace(context);
      const overview = await loadWorkspaceSettingsOverview(context.id).catch(() => null);
      if (!cancelled && overview) setSettings(overview);
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!workspace?.id) return;
    return subscribeHomeLayout(workspace.id, (next) => {
      lastSaved.current = next;
      setLayout(next);
    });
  }, [workspace?.id]);

  const data = useHomeData(workspace, user?.uid ?? "");

  /**
   * Optimistic layout (§19): the grid moves under the hand immediately and the
   * write follows. If the write fails the previous layout comes back, because a
   * card that appears to move and silently does not is worse than one that
   * refuses.
   */
  const commit = useCallback(
    async (next: HomeLayout) => {
      const previous = lastSaved.current ?? layout;
      setLayout(next);
      setSaveError("");
      if (!workspace?.id) return;
      try {
        await saveHomeLayout(workspace.id, next);
        lastSaved.current = next;
      } catch {
        setLayout(previous);
        setSaveError(t("That change could not be saved. Your previous layout is back."));
      }
    },
    [layout, workspace?.id, t],
  );

  const cards = useMemo(() => visibleHomeCards(layout, workspace), [layout, workspace]);
  const gallery = useMemo(() => availableHomeCards(layout, workspace), [layout, workspace]);

  const moneySettings = useMemo(
    () => ({
      selectedCurrency: settings?.selectedCurrency ?? "£",
      selectedDecimalSeparator: settings?.selectedDecimalSeparator ?? ".",
    }),
    [settings],
  );

  const handleQuickAction = useCallback(
    (action: QuickActionId) => {
      const destinations: Record<QuickActionId, string> = {
        order: "/orders?new=1",
        customer: "/customers?new=1",
        note: "/notes?new=1",
        file: "/files?upload=1",
        inventory: "/inventory?new=1",
        expense: "/bank",
        receipt: "/bank",
        aiReply: "/messages",
      };
      router.push(destinations[action]);
    },
    [router],
  );

  if (authLoading || !user || !workspace) return <LoadingScreen />;

  const staleMs = data.lastLoadedAtMs ? Date.now() - data.lastLoadedAtMs : 0;
  const syncLabel = data.offline
    ? t("Offline — showing the last data this device had.")
    : data.lastLoadedAtMs
      ? `${t("Updated")} ${Math.max(1, Math.round(staleMs / 60000))} ${t("min ago")}`
      : t("Loading…");

  function cardState(id: HomeCardId, empty: boolean): HomeCardState {
    const domain = CARD_DOMAIN[id];
    const status = data.status[domain];
    if (status === "loading") return { kind: "loading" };
    if (status === "error") {
      return { kind: "error", message: t("This could not be loaded."), onRetry: () => data.reload() };
    }
    if (data.offline) return { kind: "offline", message: t("Showing the last data this device had.") };
    if (empty) return { kind: "empty", message: t("Nothing here yet.") };
    return { kind: "ready" };
  }

  function renderBody(id: HomeCardId, size: HomeCardSize) {
    const props: CardBodyProps = {
      size, data, t, moneySettings, hideNumbers, onQuickAction: handleQuickAction,
    };
    switch (id) {
      case "money": return <MoneyCardBody {...props} />;
      case "banking": return <BankingCardBody {...props} />;
      case "inventory": return <InventoryCardBody {...props} />;
      case "ordersProduction": return <OrdersProductionCardBody {...props} />;
      case "schedule": return <ScheduleCardBody {...props} />;
      case "customers": return <CustomersCardBody {...props} />;
      case "recentActivity": return <RecentActivityCardBody {...props} />;
      case "files": return <FilesCardBody {...props} />;
      case "notes": return <NotesCardBody {...props} />;
      case "quickActions": return <QuickActionsCardBody {...props} />;
      case "gettingStarted": return <GettingStartedCardBody {...props} />;
      default: return null;
    }
  }

  function isEmpty(id: HomeCardId) {
    switch (id) {
      case "money": return data.financeOrders.length === 0;
      case "banking": return data.bankTransactions.length === 0;
      case "inventory": return !data.inventory;
      case "ordersProduction":
      case "schedule":
      case "recentActivity": return data.orders.length === 0;
      case "customers": return data.customers.length === 0;
      case "files": return data.files.length === 0;
      case "notes": return data.orders.every((order) => !(order.notes || "").trim());
      default: return false;
    }
  }

  return (
    <AppShell>
      <div className={`home-screen${customising ? " is-customising" : ""}`}>
        <header className="home-header">
          <div>
            <h1>{t("Home")}</h1>
            <p className="home-greeting">
              {greeting(t)}{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
            </p>
            <p className="home-subline">{t("Here's what needs your attention today.")}</p>
          </div>
          <div className="home-header-actions">
            <span className="home-sync" aria-live="polite">{syncLabel}</span>
            <button
              type="button"
              className="home-customise"
              aria-pressed={customising}
              onClick={() => setCustomising((on) => !on)}
            >
              {customising ? t("Done") : t("Customise")}
            </button>
          </div>
        </header>

        {saveError ? <p className="home-save-error" role="alert">{saveError}</p> : null}

        {customising ? (
          <div className="home-customise-bar">
            <p>{t("Drag cards to rearrange. Use a card's menu to resize, recolour, rename or hide it.")}</p>
            <button type="button" onClick={() => void commit(defaultHomeLayout())}>{t("Reset layout")}</button>
          </div>
        ) : null}

        <div className="home-grid">
          {cards.map(({ placement, definition }, index) => (
            <HomeCardShell
              key={placement.id}
              definition={definition}
              placement={placement}
              customising={customising}
              t={t}
              state={cardState(placement.id, isEmpty(placement.id))}
              onMove={(direction) => void commit(moveHomeCard(layout, index, index + direction))}
              onResize={(size: HomeCardSize) => void commit(resizeHomeCard(layout, placement.id, size))}
              onHide={() => void commit(hideHomeCard(layout, placement.id))}
              onReset={() => void commit(resetHomeCard(layout, placement.id))}
              onTone={(tone: HomeCardTone) => void commit(setHomeCardTone(layout, placement.id, tone))}
              onHeading={(heading) => void commit(setHomeCardHeading(layout, placement.id, heading))}
              dragHandlers={{
                dragging: dragIndex === index,
                dropTarget: dropIndex === index && dragIndex !== index,
                onDragStart: () => setDragIndex(index),
                onDragEnd: () => { setDragIndex(null); setDropIndex(null); },
                onDragOver: (event) => {
                  if (dragIndex === null) return;
                  event.preventDefault();
                  setDropIndex(index);
                },
                onDrop: (event) => {
                  event.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) {
                    void commit(moveHomeCard(layout, dragIndex, index));
                  }
                  setDragIndex(null);
                  setDropIndex(null);
                },
              }}
            >
              {renderBody(placement.id, placement.size)}
            </HomeCardShell>
          ))}
        </div>

        {customising && gallery.length > 0 ? (
          <section className="home-gallery">
            <h2>{t("Add a card")}</h2>
            <div className="home-gallery-row">
              {gallery.map((definition) => (
                <button
                  key={definition.id}
                  type="button"
                  onClick={() => void commit(showHomeCard(layout, definition.id))}
                >
                  + {t(definition.title)}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
