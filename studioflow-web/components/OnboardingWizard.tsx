"use client";

// The setup a workshop walks through once, before its first order.
//
// Four steps, each one asked because the answer changes something. The report's
// cut was to drop the survey questions (business age, inventory experience, how
// did you find us) and keep only what shapes the product — then make sure the
// answers visibly shape it, or the questions were just a form.
//
// There is no Skip button anywhere. Every step is answerable instead: the last
// one offers "Start empty" and "I'll set this up later" as real choices, so
// nobody is trapped and nobody is nagged into connecting a store they have not
// decided about yet. Back is always there from step two on.

import { useMemo, useState } from "react";
import {
  ONBOARDING_GOALS,
  ONBOARDING_GOAL_TASKS,
  ONBOARDING_INTEGRATIONS,
  ONBOARDING_STARTS,
  ONBOARDING_TEAM_SIZES,
  ONBOARDING_TRIAL_PLANS,
  ONBOARDING_VOLUMES,
  ONBOARDING_WORKFLOWS,
  ONBOARDING_WORK_KINDS,
  type OnboardingAnswers,
  type OnboardingGoal,
  type OnboardingStart,
  type OnboardingTeamSize,
  type OnboardingVolume,
  type OnboardingWorkKind,
  type OnboardingWorkflow,
  recommendedTrialPlan,
} from "@/lib/studioflow/onboardingWizard";
import { STRIPE_LIST_PRICE_LABELS } from "@/lib/studioflow/plans";

const CURRENCIES = [
  ["£", "GBP (£)"], ["$", "USD ($)"], ["€", "EUR (€)"], ["₺", "TRY (₺)"],
  ["¥", "JPY (¥)"], ["A$", "AUD (A$)"], ["C$", "CAD (C$)"], ["CHF", "CHF"], ["د.إ", "AED"],
] as const;

const COUNTRIES = [
  ["GB", "United Kingdom", "£"], ["US", "United States", "$"], ["TR", "Türkiye", "₺"],
  ["DE", "Germany", "€"], ["FR", "France", "€"], ["IT", "Italy", "€"], ["ES", "Spain", "€"],
  ["NL", "Netherlands", "€"], ["IE", "Ireland", "€"], ["PT", "Portugal", "€"],
  ["AU", "Australia", "A$"], ["CA", "Canada", "C$"], ["CH", "Switzerland", "CHF"],
  ["AE", "United Arab Emirates", "د.إ"], ["JP", "Japan", "¥"], ["OTHER", "Somewhere else", "$"],
] as const;

/** What the browser already knows, offered as a suggestion rather than a
 *  question. Nobody should have to look up their own time zone. */
function suggestedSettings() {
  let timeZone = "Europe/London";
  let region = "GB";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
    const locale = typeof navigator !== "undefined" ? navigator.language : "";
    const parts = locale.split("-");
    if (parts.length > 1) region = parts[parts.length - 1].toUpperCase();
  } catch {
    /* defaults are fine */
  }
  const match = COUNTRIES.find(entry => entry[0] === region) ?? COUNTRIES[0];
  return { country: match[0], currency: match[2], timeZone };
}

const TIME_ZONES = [
  "Europe/London", "Europe/Istanbul", "Europe/Berlin", "Europe/Paris", "Europe/Madrid",
  "Europe/Amsterdam", "Europe/Dublin", "Europe/Lisbon", "Europe/Zurich",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "Asia/Dubai", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

const TOTAL_STEPS = 4;

export function OnboardingWizard({
  t,
  saving,
  error,
  onFinish,
  onConnect,
}: {
  t: (text: string) => string;
  saving: boolean;
  error: string;
  onFinish: (answers: OnboardingAnswers) => void;
  /** Saves what has been answered so far, then hands off to the integration.
   *  Connecting leaves the app for an OAuth round trip, so the answers have to
   *  be on disk before we go or the whole wizard is lost on the way back. */
  onConnect: (answers: OnboardingAnswers, href: string) => void;
}) {
  const suggested = useMemo(suggestedSettings, []);
  const [step, setStep] = useState(1);
  const [showMoreGoals, setShowMoreGoals] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    country: suggested.country,
    currency: suggested.currency,
    timeZone: suggested.timeZone,
    workKinds: [],
    workflow: "made_to_order",
    teamSize: "solo",
    volume: "",
    mainGoal: "",
    extraGoals: [],
    start: "",
    plan: "",
  }));

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
    setAnswers(current => ({ ...current, [key]: value }));

  // The plan step arrives with a recommendation already chosen, so it is
  // answerable the moment it opens — the reader confirms it or picks another.
  const chosenPlan = answers.plan || recommendedTrialPlan(answers);
  const canContinue =
    step === 1 ? Boolean(answers.country && answers.currency && answers.timeZone)
      : step === 2 ? answers.workKinds.length > 0
        : step === 3 ? Boolean(answers.mainGoal)
          : step === 4 ? Boolean(answers.start)
            : Boolean(chosenPlan);

  // Fourteen days from now, which is what sign-up wrote. Shown so the price has
  // a date attached rather than being an abstract "later".
  const trialEndsLabel = useMemo(() => {
    const ends = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    try { return ends.toLocaleDateString(undefined, { day: "numeric", month: "long" }); }
    catch { return ""; }
  }, []);

  const visibleGoals = showMoreGoals ? ONBOARDING_GOALS : ONBOARDING_GOALS.filter(goal => goal.primary);

  function toggleWorkKind(id: OnboardingWorkKind) {
    setAnswers(current => ({
      ...current,
      workKinds: current.workKinds.includes(id)
        ? current.workKinds.filter(kind => kind !== id)
        : [...current.workKinds, id],
    }));
  }

  // At most two extras, and never the main goal twice.
  function toggleExtraGoal(id: OnboardingGoal) {
    setAnswers(current => {
      if (id === current.mainGoal) return current;
      const has = current.extraGoals.includes(id);
      if (!has && current.extraGoals.length >= 2) return current;
      return {
        ...current,
        extraGoals: has ? current.extraGoals.filter(goal => goal !== id) : [...current.extraGoals, id],
      };
    });
  }

  return (
    <section className="onboard-shell" aria-label={t("Set up your workspace")}>
      <div className="onboard-card">
        <header className="onboard-head">
          <span className="onboard-step">{t("Step")} {step} {t("of")} {TOTAL_STEPS}</span>
          <div className="onboard-progress" aria-hidden="true">
            <span style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
          <h1>{
            step === 1 ? t("Workspace basics")
              : step === 2 ? t("Tell us about your work")
                : step === 3 ? t("What should NivaDesk help with first?")
                  : t("Bring your work in")
          }</h1>
          <p>{
            step === 1 ? t("We've suggested these from your location. You can change them now or later in Settings.")
              : step === 2 ? t("This sets up your order cards, production stages and labels.")
                : step === 3 ? t("Your answer decides what your dashboard and first tasks show.")
                  : t("Pick how you'd like to start. You can do any of the others later.")
          }</p>
        </header>

        {step === 1 ? (
          <div className="onboard-grid">
            <label className="onboard-field">
              <span>{t("Country")}</span>
              <select
                value={answers.country}
                onChange={event => {
                  const next = COUNTRIES.find(entry => entry[0] === event.target.value);
                  set("country", event.target.value);
                  if (next) set("currency", next[2]);
                }}
              >
                {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
              </select>
            </label>
            <label className="onboard-field">
              <span>{t("Currency")}</span>
              <select value={answers.currency} onChange={event => set("currency", event.target.value)}>
                {CURRENCIES.map(([symbol, label]) => <option key={symbol} value={symbol}>{label}</option>)}
              </select>
            </label>
            <label className="onboard-field">
              <span>{t("Time zone")}</span>
              <select value={answers.timeZone} onChange={event => set("timeZone", event.target.value)}>
                {[...new Set([answers.timeZone, ...TIME_ZONES])].map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboard-sections">
            <div>
              <h2>{t("What kind of work do you do?")}</h2>
              <p className="onboard-hint">{t("Pick as many as apply.")}</p>
              <div className="onboard-chips">
                {ONBOARDING_WORK_KINDS.map(kind => (
                  <button
                    key={kind.id}
                    type="button"
                    className={answers.workKinds.includes(kind.id) ? "is-on" : ""}
                    onClick={() => toggleWorkKind(kind.id)}
                  >
                    {t(kind.label)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2>{t("How do you mainly work?")}</h2>
              <div className="onboard-options">
                {ONBOARDING_WORKFLOWS.map(option => (
                  <label key={option.id} className={answers.workflow === option.id ? "is-on" : ""}>
                    <input
                      type="radio"
                      name="onboard-workflow"
                      checked={answers.workflow === option.id}
                      onChange={() => set("workflow", option.id as OnboardingWorkflow)}
                    />
                    <span>
                      <strong>{t(option.label)}</strong>
                      <em>{t(option.detail)}</em>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="onboard-grid">
              <label className="onboard-field">
                <span>{t("How many people will use NivaDesk?")}</span>
                <select value={answers.teamSize} onChange={event => set("teamSize", event.target.value as OnboardingTeamSize)}>
                  {ONBOARDING_TEAM_SIZES.map(size => <option key={size.id} value={size.id}>{t(size.label)}</option>)}
                </select>
              </label>
              <label className="onboard-field">
                <span>{t("Roughly how many orders a month?")}</span>
                <select value={answers.volume} onChange={event => set("volume", event.target.value as OnboardingVolume)}>
                  <option value="">{t("Rather not say")}</option>
                  {ONBOARDING_VOLUMES.map(volume => <option key={volume.id} value={volume.id}>{t(volume.label)}</option>)}
                </select>
                <em className="onboard-why">{t("This helps us suggest the right setup. It won't affect your trial.")}</em>
              </label>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="onboard-sections">
            <div className="onboard-options">
              {visibleGoals.map(goal => (
                <label key={goal.id} className={answers.mainGoal === goal.id ? "is-on" : ""}>
                  <input
                    type="radio"
                    name="onboard-goal"
                    checked={answers.mainGoal === goal.id}
                    onChange={() => setAnswers(current => ({
                      ...current,
                      mainGoal: goal.id,
                      extraGoals: current.extraGoals.filter(extra => extra !== goal.id),
                    }))}
                  />
                  <span><strong>{t(goal.label)}</strong></span>
                </label>
              ))}
            </div>
            {!showMoreGoals ? (
              <button type="button" className="onboard-more" onClick={() => setShowMoreGoals(true)}>
                {t("Show more goals")}
              </button>
            ) : null}
            {answers.mainGoal ? (
              <div>
                <h2>{t("Anything else?")}</h2>
                <p className="onboard-hint">{t("Up to two more. Optional.")}</p>
                <div className="onboard-chips">
                  {ONBOARDING_GOALS.filter(goal => goal.id !== answers.mainGoal).map(goal => (
                    <button
                      key={goal.id}
                      type="button"
                      className={answers.extraGoals.includes(goal.id) ? "is-on" : ""}
                      onClick={() => toggleExtraGoal(goal.id)}
                    >
                      {t(goal.label)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <>
            <div className="onboard-connect">
              <h2>{t("Connect your accounts")}</h2>
              <p>{t("Optional. Connecting now means your workspace opens with your real work already in it.")}</p>
              <div className="onboard-connect-grid">
                {ONBOARDING_INTEGRATIONS.map(integration => (
                  <article
                    key={integration.id}
                    className="onboard-connect-tile"
                    style={{ "--brand": integration.colour } as React.CSSProperties}
                  >
                    <span
                      className="onboard-connect-logo"
                      data-name={integration.logoIncludesName ? "in-logo" : "beside"}
                    >
                      {/* An official asset when one is present; the wordmark on the
                          brand's own colour when it is not, so the tile is never
                          an empty box. */}
                      <img
                        src={integration.logo}
                        alt=""
                        onError={event => {
                          event.currentTarget.parentElement?.setAttribute("data-fallback", "1");
                        }}
                      />
                      <b>{integration.name}</b>
                    </span>
                    <em>{t(integration.detail)}</em>
                    <button
                      type="button"
                      className="onboard-btn onboard-connect-btn"
                      disabled={saving}
                      onClick={() => onConnect(answers, integration.href)}
                    >
                      {t("Connect")}
                    </button>
                  </article>
                ))}
              </div>
              <p className="onboard-connect-note">
                {t("Nothing is shared with them until you sign in on their side, and you can disconnect at any time.")}
              </p>
            </div>
            <h2 className="onboard-subhead">{t("Or start another way")}</h2>
            <div className="onboard-options">
            {ONBOARDING_STARTS.map(option => (
              <label key={option.id} className={answers.start === option.id ? "is-on" : ""}>
                <input
                  type="radio"
                  name="onboard-start"
                  checked={answers.start === option.id}
                  onChange={() => set("start", option.id as OnboardingStart)}
                />
                <span>
                  <strong>{t(option.label)}</strong>
                  <em>{t(option.detail)}</em>
                </span>
              </label>
            ))}
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <div className="onboard-plan-list">
            {ONBOARDING_TRIAL_PLANS.map(plan => {
              const selected = chosenPlan === plan.id;
              const recommended = plan.id === recommendedTrialPlan(answers);
              return (
                <label
                  key={plan.id}
                  className={`onboard-plan${selected ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="onboard-plan"
                    checked={selected}
                    onChange={() => set("plan", plan.id)}
                  />
                  <span className="onboard-plan-body">
                    <span className="onboard-plan-head">
                      <strong>{plan.title}</strong>
                      {recommended ? (
                        <span className="onboard-plan-badge">{t("Recommended for your answers")}</span>
                      ) : null}
                    </span>
                    <span className="onboard-plan-summary">{t(plan.summary)}</span>
                    <span className="onboard-plan-price">
                      {/* One sentence, not three fragments: the free period, the
                          date it ends and the price after it are one thought,
                          and splitting them breaks word order in half the
                          languages we ship. */}
                      {t("Free until {date}, then {price}.")
                        .replace("{date}", trialEndsLabel)
                        .replace("{price}", STRIPE_LIST_PRICE_LABELS[plan.priceKey] ?? "")}
                    </span>
                  </span>
                </label>
              );
            })}
            <p className="onboard-plan-note">
              {t("We picked this from your answers — you told us how many people work with you and what you need first. Change it here, or later in Settings; nothing is charged today.")}
            </p>
          </div>
        ) : null}

        {error ? <p className="onboard-error">{error}</p> : null}

        <footer className="onboard-foot">
          <span className="onboard-saved">{t("You can change all of this later in Settings.")}</span>
          <div className="onboard-actions">
            {step > 1 ? (
              <button type="button" className="onboard-btn" onClick={() => setStep(step - 1)} disabled={saving}>
                {t("Back")}
              </button>
            ) : null}
            <button
              type="button"
              className="onboard-btn onboard-btn-primary"
              disabled={!canContinue || saving}
              onClick={() => {
                if (step < TOTAL_STEPS) { setStep(step + 1); return; }
                onFinish(answers);
              }}
            >
              {saving ? t("Setting up…") : step < TOTAL_STEPS ? t("Continue") : t("Open my workspace")}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

/** Shown once the answers are saved: what we prepared, and the three things
 *  worth doing first — drawn from the goal they picked, not a generic list. */
export function OnboardingReady({
  answers,
  t,
  onOpen,
}: {
  answers: OnboardingAnswers;
  t: (text: string) => string;
  onOpen: () => void;
}) {
  const workflowLabel = ONBOARDING_WORKFLOWS.find(entry => entry.id === answers.workflow)?.label ?? "";
  const rawKindLabel = ONBOARDING_WORK_KINDS.find(entry => entry.id === answers.workKinds[0])?.label ?? "";
  // A repair shop that picked the repairs workflow would otherwise read "a
  // repairs and servicing workspace for repairs & servicing".
  const kindLabel = rawKindLabel.toLowerCase().startsWith(workflowLabel.toLowerCase().slice(0, 7))
    ? ""
    : rawKindLabel;
  const tasks = ONBOARDING_GOAL_TASKS[(answers.mainGoal || "orders_customers") as OnboardingGoal];
  // One sentence per language, not glued-together fragments: English word order
  // does not survive Turkish, Japanese or Arabic.
  const summary = (kindLabel
    ? t("We've set up your workspace for {workflow} - {kind}.")
    : t("We've set up your workspace for {workflow}."))
    .replace("{workflow}", t(workflowLabel))
    .replace("{kind}", t(kindLabel));

  return (
    <section className="onboard-shell" aria-label={t("Your workspace is ready")}>
      <div className="onboard-card">
        <header className="onboard-head">
          <h1>{t("Your workspace is ready")}</h1>
          <p>{summary}</p>
        </header>
        <ol className="onboard-tasks">
          {tasks.map((task, index) => (
            <li key={task}>
              <span aria-hidden="true">{index + 1}</span>
              {t(task)}
            </li>
          ))}
        </ol>
        <footer className="onboard-foot">
          <span className="onboard-saved">{t("You can change all of this later in Settings.")}</span>
          <div className="onboard-actions">
            <button type="button" className="onboard-btn onboard-btn-primary" onClick={onOpen}>
              {t("Open my workspace")}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
