"use client";

// Settings ▸ Getting started — the full checklist — and the "Bring in your
// orders" sheet (16 Oct 2026). What each step says, where its button goes and
// when it is done comes from lib/studioflow/gettingStarted.ts, the same module
// the Home card reads, so the card and this list cannot disagree.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { canCreateOrders, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { canSeeGettingStarted, type HomeLayout } from "@/lib/studioflow/homeCards";
import { saveHomeLayout, subscribeHomeLayout } from "@/lib/studioflow/homeLayout";
import { loadSetupChecklist, type SetupChecklist } from "@/lib/studioflow/setupChecklist";
import { useHomeData } from "@/lib/studioflow/useHomeData";
import { studioT } from "@/lib/studioflow/language";
import {
  EMPTY_INTEGRATION_SIGNALS,
  INTEGRATION_PROVIDERS,
  loadIntegrationSignals,
  resolveIntegrationState,
  type IntegrationSignals,
} from "@/lib/studioflow/integrations";
import {
  BRING_IN_STORE_IDS,
  bringInOffers,
  gettingStartedAccess,
  gettingStartedHidden,
  openHelpAssistant,
  nextGettingStartedStep,
  resolveGettingStartedSteps,
  showGettingStarted,
  skipGettingStarted,
} from "@/lib/studioflow/gettingStarted";
import { dispatchStudioToast } from "@/components/StudioToastHost";

/**
 * "Bring in your orders": the ways an order reaches NivaDesk, each with the
 * button that does it. Only the shops this workspace can actually connect are
 * listed — the state is the one the Integrations hub resolves for it, so a
 * shop the hub calls "Coming soon" (or could not check) is not offered here.
 */
export function BringInOrdersSheet({
  workspace, t, onClose,
}: {
  workspace: WorkspaceContext;
  t: (text: string) => string;
  onClose: () => void;
}) {
  const [signals, setSignals] = useState<IntegrationSignals | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIntegrationSignals(workspace.id)
      .then((next) => { if (!cancelled) setSignals(next); })
      // A read that failed offers nothing it cannot vouch for.
      .catch(() => { if (!cancelled) setSignals({ ...EMPTY_INTEGRATION_SIGNALS, amazonAuthorizationMode: null, ebayWorkspaceEnabled: null }); });
    return () => { cancelled = true; };
  }, [workspace.id]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stores = useMemo(() => {
    if (!signals) return [];
    return BRING_IN_STORE_IDS
      .map((id) => INTEGRATION_PROVIDERS.find((provider) => provider.id === id))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider))
      .map((provider) => ({ provider, state: resolveIntegrationState(provider, signals).state }))
      .filter(({ state }) => bringInOffers(state));
  }, [signals]);

  return (
    <div className="modal-backdrop gs-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="gs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gs-sheet-title"
        data-testid="bring-in-orders-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gs-sheet-head">
          <h2 id="gs-sheet-title">{t("Bring in your orders")}</h2>
          <button ref={closeRef} type="button" className="gs-sheet-close" aria-label={t("Close")} onClick={onClose}>×</button>
        </header>
        <p className="gs-sheet-intro">
          {t("Orders reach NivaDesk in two ways: a connected shop sends them in on its own, or you add one yourself.")}
        </p>

        <h3 className="gs-sheet-section">{t("Connect a shop")}</h3>
        {signals === null ? (
          <p className="gs-sheet-note">{t("Checking…")}</p>
        ) : (
          <ul className="gs-store-list">
            {stores.map(({ provider, state }) => (
              <li key={provider.id} className="gs-store" data-store={provider.id} data-state={state}>
                <span className="gs-store-mark" aria-hidden="true">
                  {provider.logo ? <img src={provider.logo} alt="" /> : <b>{provider.mark || provider.name.slice(0, 1)}</b>}
                </span>
                <span className="gs-store-text">
                  <strong>{provider.name}</strong>
                  <em>{t(provider.blurb)}</em>
                </span>
                <span className="gs-store-action">
                  {state === "connected" ? <span className="gs-tag is-done">{t("Connected")}</span> : null}
                  {state === "attention" ? <span className="gs-tag is-warning">{t("Needs attention")}</span> : null}
                  {/* A full page load, not a client route: Settings reads which
                      provider to open from the address once, when it mounts. */}
                  <a className={`button ${state === "available" ? "" : "secondary"}`} href={`/settings?section=${provider.manage}`}>
                    {t(state === "available" ? "Connect" : "Open")}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}

        {canCreateOrders(workspace) ? (
          <>
            <h3 className="gs-sheet-section">{t("Add one by hand")}</h3>
            <div className="gs-store gs-hand">
              <span className="gs-store-text">
                <em>{t("For a commission, a repair or a sale that did not come through a shop.")}</em>
              </span>
              <span className="gs-store-action">
                <a className="button" href="/orders?new=1">{t("Create order")}</a>
              </span>
            </div>
          </>
        ) : null}

        <p className="gs-sheet-note">
          {t("This step is done once your workspace has its first order, imported or added by hand.")}
        </p>
      </section>
    </div>
  );
}

/** Settings ▸ Getting started. */
export function GettingStartedChecklist({ workspace, language = "English" }: { workspace: WorkspaceContext; language?: string }) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const uid = auth.currentUser?.uid ?? "";
  const data = useHomeData(workspace, uid, auth.currentUser?.email ?? "", false);
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [layout, setLayout] = useState<HomeLayout | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSetupChecklist(workspace.id).then((next) => {
      if (cancelled) return;
      setChecklist(next);
      setChecklistLoaded(true);
    });
    return () => { cancelled = true; };
  }, [workspace.id]);

  useEffect(() => subscribeHomeLayout(workspace.id, setLayout), [workspace.id]);

  // Home's "Bring in your first order" and the Dashboard card link here with the
  // sheet already open.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sheet") === "orders") setSheetOpen(true);
  }, []);

  // Nothing until the call has answered: drawing the six fallback steps first and then swapping in the server's
  // list showed a different checklist for a few seconds. The fallback is for a call that failed.
  const steps = !checklistLoaded ? [] : resolveGettingStartedSteps(checklist?.steps ?? null, {
    setupFinished: data.settings?.businessOnboardingFinished ?? false,
    hasCustomer: data.customers.length > 0,
    hasOrder: data.orders.length > 0,
    hasStoreOrder: data.orders.some((order) =>
      Boolean(order.customFields?.["Shopify Status"] || order.customFields?.["WooCommerce Status"])),
    hasInventory: (data.inventory?.uniqueCount ?? 0) + (data.inventory?.quantityCount ?? 0) > 0,
    hasBankTransaction: data.bankTransactions.length > 0,
  }, gettingStartedAccess({ role: workspace.role, billingPlan: workspace.billingPlan, canOpenSettings: true }));
  const complete = steps.filter((step) => step.done).length;
  const next = nextGettingStartedStep(steps);
  const hidden = layout ? gettingStartedHidden(layout) : false;

  async function setHidden(nextHidden: boolean) {
    if (!layout) return;
    const before = layout;
    const after = nextHidden ? skipGettingStarted(before) : showGettingStarted(before);
    setLayout(after);
    try {
      await saveHomeLayout(workspace.id, after);
      if (nextHidden) {
        dispatchStudioToast({
          message: `${t("Getting started is hidden from Home.")} ${t("Open it again any time from Settings → Getting started.")}`,
          actionLabel: t("Undo"),
          onAction: () => { setLayout(before); void saveHomeLayout(workspace.id, before); },
          durationMs: 9000,
        });
      }
    } catch {
      setLayout(before);
      dispatchStudioToast({ message: t("That change could not be saved. Your previous layout is back.") });
    }
  }

  if (!canSeeGettingStarted(workspace.role)) return null;

  return (
    <div className="gs-checklist" data-testid="getting-started-checklist">
      <div className="gs-progress">
        <p className="home-metric-label">
          {t("{done} of {total} complete").replace("{done}", String(complete)).replace("{total}", String(steps.length))}
        </p>
        <div className="home-progress" role="progressbar" aria-valuenow={complete} aria-valuemin={0} aria-valuemax={steps.length}>
          <span style={{ width: `${steps.length > 0 ? Math.min(100, (complete / steps.length) * 100) : 0}%` }} />
        </div>
      </div>
      {!checklistLoaded ? <p className="gs-sheet-note">{t("Loading…")}</p> : null}
      <ol className="gs-steps">
        {steps.map((step) => {
          const current = step.id === next?.id;
          const label = t(step.done ? "Open" : step.cta);
          return (
            <li key={step.id} data-step={step.id} data-done={step.done ? "true" : "false"} className={current ? "is-current" : ""}>
              <span className={step.done ? "home-check is-done" : current ? "home-check is-current" : "home-check is-todo"} aria-hidden="true" />
              <span className="gs-step-text">
                <strong>{t(step.label)}</strong>
                {step.blurb ? <em>{t(step.blurb)}</em> : null}
              </span>
              <span className="gs-step-action">
                {step.done ? <span className="gs-tag is-done">{t("Done")}</span> : null}
                {step.opensBringIn ? (
                  <button type="button" className={`button ${step.done ? "secondary" : ""}`} onClick={() => setSheetOpen(true)}>{label}</button>
                ) : step.opensHelp ? (
                  // The help assistant opens over this page (GN-05).
                  <button type="button" className={`button ${step.done ? "secondary" : ""}`} onClick={() => openHelpAssistant()}>{label}</button>
                ) : step.href ? (
                  <a className={`button ${step.done ? "secondary" : ""}`} href={step.href}>{label}</a>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="gs-home-row">
        <span>
          <strong>{t("Home")}</strong>
          <em>{hidden ? t("Getting started is hidden from Home.") : t("Your setup checklist, step by step.")}</em>
        </span>
        <button type="button" className="button secondary" disabled={!layout} onClick={() => void setHidden(!hidden)}>
          {t(hidden ? "Show on Home" : "Hide from Home")}
        </button>
      </div>
      {sheetOpen ? <BringInOrdersSheet workspace={workspace} t={t} onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}
