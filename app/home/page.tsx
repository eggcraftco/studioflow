"use client";

import { HomeTileIcon } from "@/components/home/HomeActionIcons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { usePricePrivacy } from "@/components/PricePrivacy";
import { HomeCardShell, type HomeCardState } from "@/components/home/HomeCardShell";
import { homeHoleAccepts, packHomeGrid } from "@/lib/studioflow/homeGrid";
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
  homeWeekRangeLabel,
  type CardBodyProps,
  type QuickActionId,
  ACTIVITY_FILTERS,
  type ActivityFilterId,
} from "@/components/home/HomeCardBodies";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
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
  moveHomeCardBefore,
  resetHomeCard,
  resizeHomeCard,
  setHomeCardHeading,
  homePeriodRange,
  setHomeCardPeriod,
  setHomeCardTone,
  showHomeCard,
  visibleHomeCards,
  type HomeCardId,
  type HomeCardPeriod,
  type HomeCardSize,
  type HomeCardTone,
  type HomeLayout,
} from "@/lib/studioflow/homeCards";
import { saveHomeLayout, saveSetupSkipped, subscribeHomeLayout, subscribeSetupSkipped } from "@/lib/studioflow/homeLayout";
import { useHomeData, type HomeDomain } from "@/lib/studioflow/useHomeData";
import { dispatchQuickAction } from "@/lib/studioflow/quickActions";

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
  // Which checklist steps this member has waved off, live like the layout so a
  // skip on the phone reaches the desktop.
  const [setupSkipped, setSetupSkipped] = useState<string[]>([]);
  const router = useRouter();
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const { hideNumbers } = usePricePrivacy();

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [layout, setLayout] = useState<HomeLayout>(defaultHomeLayout());
  const [customising, setCustomising] = useState(false);
  // Which slice of the activity feed the 2x2 card is showing. One per screen
  // rather than one per card: two activity cards on one Home would be a
  // strange thing to have, and this keeps the pills and the body reading the
  // same value.
  const [activityFilter, setActivityFilter] = useState<ActivityFilterId>("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** Which gap the card is over, if it is over one. */
  const [dropHole, setDropHole] = useState<number | null>(null);
  /** Four columns, or two on a phone. The grid publishes it with the unit.
   *  Null until it has measured: placing cards explicitly against a guessed
   *  column count would put them in the wrong cells for a frame, and the
   *  browser's own auto-placement gets it right in the meantime. */
  const [columnCount, setColumnCount] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  // A failed workspace read used to leave Home spinning for ever.
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0);
  // The layout as the server last accepted it, so a failed save can be undone.
  const lastSaved = useRef<HomeLayout | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // A square 1x1 needs the row to equal the column, and CSS has no way to read
  // one track's size into the other. The grid measures itself and publishes the
  // column width; the stylesheet does the rest.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const apply = () => {
      const styles = getComputedStyle(grid);
      const columns = styles.gridTemplateColumns.split(" ").filter(Boolean).length;
      if (columns < 1) return;
      const gap = parseFloat(styles.columnGap) || 0;
      const unit = (grid.clientWidth - gap * (columns - 1)) / columns;
      if (unit > 0) grid.style.setProperty("--home-unit", `${Math.round(unit)}px`);
      // The packing needs the same column count the stylesheet just used, or the
      // gaps it works out are gaps in a grid nobody is looking at.
      setColumnCount(columns);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setWorkspaceError("");
    (async () => {
      try {
        const context = await loadWorkspaceContext(user.uid);
        if (cancelled) return;
        setWorkspace(context);
        const overview = await loadWorkspaceSettingsOverview(context.id).catch(() => null);
        if (!cancelled && overview) setSettings(overview);
      } catch (loadError) {
        // Translated at render — `t` changes identity every render and cannot
        // sit in this effect's dependency list.
        if (!cancelled) setWorkspaceError(loadError instanceof Error ? loadError.message : "Your workspace could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [user, workspaceAttempt]);

  useEffect(() => {
    if (!workspace?.id) return;
    return subscribeHomeLayout(workspace.id, (next) => {
      lastSaved.current = next;
      setLayout(next);
    });
  }, [workspace?.id]);

  useEffect(() => {
    if (!workspace?.id) return;
    return subscribeSetupSkipped(workspace.id, setSetupSkipped);
  }, [workspace?.id]);

  // Shown at once, saved behind: a step you waved off should not sit there
  // while a round trip finishes, and the listener above corrects us if it fails.
  const handleSkipStep = useCallback((stepId: string) => {
    if (!workspace?.id) return;
    setSetupSkipped((current) => {
      if (current.includes(stepId)) return current;
      const next = [...current, stepId];
      void saveSetupSkipped(workspace.id, next);
      return next;
    });
  }, [workspace?.id]);

  /** "Skip for now" is only true if a skipped step can come back. */
  const handleRestoreSkipped = useCallback(() => {
    if (!workspace?.id) return;
    setSetupSkipped([]);
    void saveSetupSkipped(workspace.id, []);
  }, [workspace?.id]);

  // The 2x2 stock card is the only one that names individual items, and the
  // list behind it is a 500-row callable — so it is only fetched when that card
  // is actually on the layout at that size.
  const wantsInventoryItems = useMemo(
    () => layout.cards.some((card) => card.id === "inventory" && card.size === "2x2"),
    [layout],
  );
  const data = useHomeData(workspace, user?.uid ?? "", user?.email ?? "", wantsInventoryItems);

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
  // Where each card lands, and where the holes are. Same arithmetic as the Mac
  // and Android packers, so one member's layout reads the same on all three.
  const grid = useMemo(
    () => packHomeGrid(cards.map(({ placement }) => placement), columnCount ?? 4),
    [cards, columnCount],
  );
  const cellOf = useCallback(
    (index: number) => {
      const slot = columnCount === null ? undefined : grid.slots[index];
      if (!slot) return undefined;
      return {
        gridColumn: `${slot.column + 1} / span ${slot.width}`,
        gridRow: `${slot.row + 1} / span ${slot.height}`,
      };
    },
    [grid, columnCount],
  );
  /** A drop lands a card in front of whatever the gap sits in front of. */
  const dropAt = useCallback(
    (fromIndex: number, visibleIndex: number) => {
      const moving = cards[fromIndex]?.placement.id;
      if (!moving) return;
      const before = cards[visibleIndex]?.placement.id ?? null;
      void commit(moveHomeCardBefore(layout, moving, before));
    },
    [cards, layout, commit],
  );
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
      // "New order" is the toolbar's own action and AppShell owns it, so this
      // opens where the user already is instead of navigating away (§6).
      if (action === "order") {
        dispatchQuickAction("order");
        return;
      }
      const destinations: Record<Exclude<QuickActionId, "order">, string> = {
        customer: "/customers?new=1",
        note: "/notes?new=1",
        file: "/files?upload=1",
        inventory: "/inventory?new=1",
        reviewSpending: "/bank",
        receipt: "/bank?receipt=1",
        aiReply: "/messages",
      };
      router.push(destinations[action]);
    },
    [router],
  );

  if (!authLoading && user && !workspace && workspaceError) {
    return (
      <AppShell>
        <section className="card app-card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px" }}>{t("Your workspace could not be loaded.")}</h2>
          <p className="muted-copy" style={{ margin: "0 0 16px" }}>{friendlyErrorMessage(workspaceError, t)}</p>
          <button type="button" className="button" onClick={() => setWorkspaceAttempt(attempt => attempt + 1)}>
            {t("Try again")}
          </button>
        </section>
      </AppShell>
    );
  }

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

  function renderBody(id: HomeCardId, size: HomeCardSize, period: HomeCardPeriod) {
    const props: CardBodyProps = {
      size, period, data, t, locale: studioLocaleTag(language),
      moneySettings, hideNumbers, onQuickAction: handleQuickAction,
    };
    switch (id) {
      case "money": return <MoneyCardBody {...props} />;
      case "banking": return <BankingCardBody {...props} />;
      case "inventory": return <InventoryCardBody {...props} />;
      case "ordersProduction": return <OrdersProductionCardBody {...props} />;
      case "schedule": return <ScheduleCardBody {...props} />;
      case "customers": return <CustomersCardBody {...props} />;
      case "recentActivity": return <RecentActivityCardBody {...props} activityFilter={activityFilter} />;
      case "files": return <FilesCardBody {...props} />;
      case "notes": return <NotesCardBody {...props} />;
      case "quickActions": return <QuickActionsCardBody {...props} />;
      case "gettingStarted":
        return (
          <GettingStartedCardBody
            {...props}
            skipped={setupSkipped}
            onSkip={handleSkipStep}
            onRestoreSkipped={handleRestoreSkipped}
          />
        );
      default: return null;
    }
  }

  function isEmpty(id: HomeCardId, period: HomeCardPeriod) {
    switch (id) {
      // Against the period the header is showing, not the whole history: with
      // orders on file but none this month the body has nothing to draw, and a
      // card that renders blank is worse than one that says so.
      case "money": {
        const { start, end } = homePeriodRange(period);
        return data.financeOrders.filter((order) =>
          order.paymentDate !== null && order.paymentDate >= start && order.paymentDate <= end).length === 0;
      }
      case "banking": return data.bankTransactions.length === 0;
      case "inventory": return !data.inventory;
      // Both read scheduleOrders, so the empty test must ask that list, not the
      // lighter one — otherwise a card renders empty while its own data is there.
      case "ordersProduction":
      case "schedule": return data.scheduleOrders.length === 0;
      case "recentActivity": return data.activity.length === 0;
      case "customers": return data.customers.length === 0;
      case "files": return data.files.length === 0;
      case "notes": return data.notes.filter((note) => !note.isDeleted && !note.isArchived).length === 0;
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

        {saveError ? <p className="home-save-error" role="alert">{t(saveError)}</p> : null}

        {customising ? (
          <div className="home-customise-bar">
            <p>{t("Drag cards to rearrange. Use a card's menu to resize, recolour, rename or hide it.")}</p>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t("Reset the Home layout? Your card sizes, colours and names go back to the defaults."))) return;
                void commit(defaultHomeLayout());
              }}
            >
              {t("Reset layout")}
            </button>
          </div>
        ) : null}

        {/* The row height is the column width, so a 1x1 is a square, a 2x1 is two
            squares wide and a 2x2 is four squares merged (§2). CSS cannot derive
            one track from the other, so the grid measures itself. */}
        <div className="home-grid" ref={gridRef}>
          {cards.map(({ placement, definition }, index) => (
            <HomeCardShell
              key={placement.id}
              definition={definition}
              placement={placement}
              customising={customising}
              t={t}
              state={cardState(placement.id, isEmpty(placement.id, placement.period ?? "month"))}
              subtitle={
                // The wide orders card leads with how many are live, beside its
                // heading, exactly as the sheet reads it.
                placement.id === "ordersProduction" && placement.size !== "1x1"
                  ? t("{count} active").replace("{count}",
                      String(data.scheduleOrders.filter((order) => !order.isDelivered).length))
                  // The wide stock card names what it is a view of, as the
                  // sheet does — the figures alone do not say.
                  : placement.id === "inventory" && placement.size !== "1x1"
                    ? t("Stock overview")
                    // How many files there are belongs beside the heading, as
                    // the sheet reads it.
                    : placement.id === "files" && placement.size !== "1x1"
                      ? `${data.files.length} ${t("files")}`
                      // Both week cards name which week beside the heading; the
                      // 1x1 has no week to name.
                      : placement.id === "schedule" && placement.size !== "1x1"
                        ? homeWeekRangeLabel(studioLocaleTag(language))
                        : undefined
              }
              footerNote={
                placement.id === "recentActivity" && placement.size === "2x2"
                  ? t("Only activity you have permission to view is shown")
                  : undefined
              }
              subtitleInline={placement.id === "ordersProduction" || placement.id === "files"
                || placement.id === "schedule"}
              titleBadge={
                // The promise belongs to the card's name: this feed can never
                // move money. Outlined rather than filled, so it reads as a
                // note on the heading and not as a warning about the data.
                placement.id === "banking" && data.bankTransactions.length > 0
                  ? <span className="home-pill is-warning">{t("Read-only")}</span>
                  : undefined
              }
              headerSlot={
                // The sheet puts a + on the notes card, because the thing you
                // most often want from a wall of notes is one more note.
                placement.id === "files" ? (
                  // 87px of "↑ Upload file" left the card's own title at 25px
                  // on the square, rendering as "Fil…". There the action is a
                  // mark; the wider cards have the room to name it.
                  placement.size === "1x1" ? (
                    <button
                      type="button"
                      className="home-head-icon-button is-outline"
                      aria-label={t("Upload file")}
                      title={t("Upload file")}
                      onClick={(event) => { event.stopPropagation(); handleQuickAction("file"); }}
                    >
                      <HomeTileIcon name="upload" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="home-add-button is-wide"
                      onClick={(event) => { event.stopPropagation(); handleQuickAction("file"); }}
                    >
                      ↑ {t("Upload file")}
                    </button>
                  )
                ) : placement.id === "notes" && placement.size === "1x1" ? (
                  // The square's create control is the composer in its body —
                  // but the shell replaces that body wholesale in four states:
                  // loading, error, offline and empty. The header is outside
                  // that switch, which is exactly why the + used to survive all
                  // of them. So it comes back whenever the body is not the
                  // ready one, and stands down when the composer is really
                  // there. Exactly one control, in every state.
                  cardState(placement.id, isEmpty(placement.id, placement.period ?? "month")).kind !== "ready" ? (
                    <button
                      type="button"
                      className="home-add-button"
                      aria-label={t("New note")}
                      title={t("New note")}
                      onClick={(event) => { event.stopPropagation(); handleQuickAction("note"); }}
                    >
                      +
                    </button>
                  ) : undefined
                ) : placement.id === "notes" ? (
                  // The wider header has room to name the action instead — the
                  // same call the files card makes two arms up, for the same
                  // reason: a bare + on a card full of notes is not obviously
                  // "write one".
                  <>
                    {/* Only where there is room to spare: the wide-open card.
                        It goes to the Notes screen's own search box with the
                        caret already in it — the card has nowhere to put a
                        results list, and a second search that finds different
                        things would be worse than none. */}
                    {placement.size === "2x2" ? (
                      <Link
                        className="home-head-icon-button"
                        href="/notes?search=1"
                        aria-label={t("Search notes…")}
                        title={t("Search notes…")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <HomeTileIcon name="search" />
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="home-add-button is-wide"
                      onClick={(event) => { event.stopPropagation(); handleQuickAction("note"); }}
                    >
                      {t("New note")}
                    </button>
                  </>
                ) : placement.id === "recentActivity" && placement.size === "2x2" ? (
                  // The sheet puts the pills beside the title on the wide-open
                  // card only: the smaller sizes have no room, and a filter you
                  // cannot see the effect of is a trap.
                  <span className="home-activity-filters">
                    {ACTIVITY_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        aria-pressed={activityFilter === filter.id}
                        onClick={(event) => { event.stopPropagation(); setActivityFilter(filter.id); }}
                      >
                        {t(filter.label)}
                      </button>
                    ))}
                  </span>
                ) : undefined
              }
              /* By id, like the drag: index is this card's place in the list the
                 grid draws, and that list has the hidden and unpermitted cards
                 taken out of it. */
              onMove={(direction) => {
                const target = index + direction;
                if (target < 0 || target >= cards.length) return;
                dropAt(index, direction > 0 ? target + 1 : target);
              }}
              onResize={(size: HomeCardSize) => void commit(resizeHomeCard(layout, placement.id, size))}
              onHide={() => void commit(hideHomeCard(layout, placement.id))}
              onReset={() => void commit(resetHomeCard(layout, placement.id))}
              onTone={(tone: HomeCardTone) => void commit(setHomeCardTone(layout, placement.id, tone))}
              onHeading={(heading) => void commit(setHomeCardHeading(layout, placement.id, heading))}
              onPeriod={(period) => void commit(setHomeCardPeriod(layout, placement.id, period))}
              place={cellOf(index)}
              dragHandlers={{
                dragging: dragIndex === index,
                dropTarget: dropIndex === index && dragIndex !== index,
                onDragStart: (event) => {
                  // Without a payload the browser starts the drag and then
                  // refuses every drop: dragstart and dragend both fire, drop
                  // never does. Measured in the browser — this one line is the
                  // whole reason cards could be dragged on a Mac and not here.
                  event.dataTransfer.setData("text/plain", placement.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                },
                onDragEnd: () => { setDragIndex(null); setDropIndex(null); setDropHole(null); },
                onDragOver: (event) => {
                  if (dragIndex === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                  setDropHole(null);
                },
                onDrop: (event) => {
                  event.preventDefault();
                  // Dropping ON a card puts the dragged one in its place and
                  // pushes it along, which is what dragging over a list means
                  // everywhere else. It used to swap the two, so the card you
                  // dropped on jumped to where you had dragged from.
                  if (dragIndex !== null && dragIndex !== index) {
                    dropAt(dragIndex, dragIndex < index ? index + 1 : index);
                  }
                  setDragIndex(null);
                  setDropIndex(null);
                  setDropHole(null);
                },
              }}
            >
              {renderBody(placement.id, placement.size, placement.period ?? "month")}
            </HomeCardShell>
          ))}
          {/* The gaps. A 2-wide card that does not fit the rest of a row starts
              the next one and leaves a hole behind it, and until now the only
              thing you could drop a card on was another card — so the hole just
              sat there. A hole only lights up for a card that actually fits it:
              offering a 2-wide card a 1-wide gap is a promise the grid cannot
              keep. */}
          {dragIndex !== null && columnCount !== null && grid.holes.map((hole) => {
            const dragged = cards[dragIndex]?.placement;
            const accepts = dragged ? homeHoleAccepts(hole, dragged.size) : false;
            if (!accepts) return null;
            const key = `${hole.row}:${hole.column}`;
            return (
              <div
                key={key}
                className={`home-grid-gap${dropHole === hole.index ? " is-over" : ""}`}
                style={{
                  gridColumn: `${hole.column + 1} / span ${hole.width}`,
                  gridRow: `${hole.row + 1} / span 1`,
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(null);
                  setDropHole(hole.index);
                }}
                onDragLeave={() => setDropHole((current) => (current === hole.index ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  dropAt(dragIndex, hole.index);
                  setDragIndex(null);
                  setDropIndex(null);
                  setDropHole(null);
                }}
              />
            );
          })}
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
