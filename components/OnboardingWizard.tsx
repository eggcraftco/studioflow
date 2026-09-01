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
  ONBOARDING_BUSINESS_AGES,
  ONBOARDING_INVENTORY_EXPERIENCE,
  ONBOARDING_WORK_KINDS,
  type OnboardingAnswers,
  type OnboardingGoal,
  type OnboardingIntegration,
  type OnboardingStart,
  type OnboardingTeamSize,
  type OnboardingVolume,
  type OnboardingWorkKind,
  type OnboardingWorkflow,
  recommendedTrialPlan,
} from "@/lib/studioflow/onboardingWizard";
import {
  SUPPORTED_STUDIO_LANGUAGES,
  studioLanguageForLocaleTag,
  studioLocaleTag,
} from "@/lib/studioflow/language";

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
  // The browser already knows which language this person reads; offering it as
  // the suggestion beats making them find it in Settings afterwards.
  let language = "English";
  try {
    language = studioLanguageForLocaleTag(
      typeof navigator !== "undefined" ? navigator.language : "en"
    );
  } catch {
    /* English is a fine default */
  }
  return { country: match[0], currency: match[2], language, timeZone };
}

const TIME_ZONES = [
  "Europe/London", "Europe/Istanbul", "Europe/Berlin", "Europe/Paris", "Europe/Madrid",
  "Europe/Amsterdam", "Europe/Dublin", "Europe/Lisbon", "Europe/Zurich",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "Asia/Dubai", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

/**
 * The order the five steps are asked in.
 *
 * They used to be numbers, checked as `step === 4` in a dozen places, so moving
 * one meant editing every one of them and hoping none was missed. The step is
 * named now and the order lives here: to reorder the wizard, reorder this list.
 */
type OnboardingStepKey = "basics" | "bringWork" | "goal" | "work" | "plan";

const STEP_ORDER: OnboardingStepKey[] = ["basics", "bringWork", "goal", "work", "plan"];
const TOTAL_STEPS = STEP_ORDER.length;

const STEP_TITLE: Record<OnboardingStepKey, string> = {
  basics: "Workspace basics",
  bringWork: "Bring your work in",
  goal: "What should NivaDesk help with first?",
  work: "Tell us about your work",
  plan: "Your plan",
};

const STEP_LEDE: Record<OnboardingStepKey, string> = {
  basics: "We've suggested these from your location. You can change them now or later in Settings.",
  bringWork: "Pick how you'd like to start. You can do any of the others later.",
  goal: "Your answer decides what your dashboard and first tasks show.",
  work: "This sets up your order cards, production stages and labels.",
  plan: "Your 14 days are free on any of these. Nothing is charged until they end, and you can change plan at any time.",
};

export function OnboardingWizard({
  t,
  language,
  saving,
  error,
  onFinish,
  onLanguageChange,
  onConnect,
  connected,
}: {
  t: (text: string) => string;
  /** The workspace language, so the trial's end date is written in it rather
   *  than in whatever locale the browser happens to run. */
  language: string;
  saving: boolean;
  error: string;
  onFinish: (answers: OnboardingAnswers) => void;
  /** Applied the moment it changes, so the wizard itself switches over. */
  onLanguageChange?: (language: string) => void;
  /** Opens the integration in a tab of its own and leaves the wizard where it
   *  is. It used to finish the setup and navigate away, which meant the first
   *  Connect you pressed was the last one you could press. */
  onConnect: (answers: OnboardingAnswers, href: string) => void;
  /** Which accounts the workspace can already see, refreshed while the wizard
   *  is open — so connecting one in the other tab shows up here. */
  connected?: Partial<Record<OnboardingIntegration["id"], boolean>>;
}) {
  const suggested = useMemo(suggestedSettings, []);
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    country: suggested.country,
    currency: suggested.currency,
    language: suggested.language,
    timeZone: suggested.timeZone,
    workKinds: [],
    workflow: "made_to_order",
    teamSize: "solo",
    volume: "",
    businessAge: "",
    inventoryExperience: "",
    heardFrom: "",
    mainGoal: "",
    otherGoal: "",
    extraGoals: [],
    // Pre-picked: it is the only row, and making someone tick the one choice
    // there is before Continue will let them through is a ritual, not a question.
    start: "later",
    plan: "",
  }));

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
    setAnswers(current => ({ ...current, [key]: value }));

  // The plan step arrives with a recommendation already chosen, so it is
  // answerable the moment it opens — the reader confirms it or picks another.
  const chosenPlan = answers.plan || recommendedTrialPlan(answers);
  const stepKey = STEP_ORDER[step - 1];
  const answered: Record<OnboardingStepKey, boolean> = {
    basics: Boolean(answers.country && answers.currency && answers.language && answers.timeZone),
    bringWork: Boolean(answers.start),
    goal: Boolean(answers.mainGoal),
    work: answers.workKinds.length > 0,
    plan: Boolean(chosenPlan),
  };
  const canContinue = answered[stepKey];

  // Fourteen days from now, which is what sign-up wrote. Shown so the price has
  // a date attached rather than being an abstract "later".
  const trialEndsLabel = useMemo(() => {
    const ends = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    try { return ends.toLocaleDateString(studioLocaleTag(language), { day: "numeric", month: "long" }); }
    catch { return ""; }
  }, [language]);


  // At most two extras, and never the main goal twice.
  return (
    <section className="onboard-shell" aria-label={t("Set up your workspace")}>
      <div className="onboard-card">
        <header className="onboard-head">
          <span className="onboard-step">{t("Step")} {step} {t("of")} {TOTAL_STEPS}</span>
          <div className="onboard-progress" aria-hidden="true">
            <span style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
          <h1>{t(STEP_TITLE[stepKey])}</h1>
          <p>{t(STEP_LEDE[stepKey])}</p>
        </header>

        {stepKey === "basics" ? (
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
              <span>{t("Language")}</span>
              <select
                value={answers.language}
                onChange={event => {
                  set("language", event.target.value);
                  // Immediately, not on Finish: the rest of the wizard should
                  // already be in the language they just chose.
                  onLanguageChange?.(event.target.value);
                }}
              >
                {SUPPORTED_STUDIO_LANGUAGES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
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

        {stepKey === "work" ? (
          /* A short grey label above, the question itself inside the control.
             With the whole question as the label the rows came out at different
             heights — "How familiar are you with stock tracking?" wraps where
             "Team size" does not — and a grid of controls that do not line up
             reads as untidy however carefully it is spaced. */
          <div className="onboard-grid is-pairs">
            <label className="onboard-field">
              <span>{t("What you make")}</span>
              <select
                value={answers.workKinds[0] ?? ""}
                onChange={event => set("workKinds", event.target.value
                  ? [event.target.value as OnboardingWorkKind]
                  : [])}
              >
                <option value="">{t("What do you mostly make?")}</option>
                {ONBOARDING_WORK_KINDS.map(kind => (
                  <option key={kind.id} value={kind.id}>{t(kind.label)}</option>
                ))}
              </select>
            </label>
            <label className="onboard-field">
              <span>{t("How you work")}</span>
              <select value={answers.workflow} onChange={event => set("workflow", event.target.value as OnboardingWorkflow)}>
                {ONBOARDING_WORKFLOWS.map(option => (
                  <option key={option.id} value={option.id}>{t(option.label)}</option>
                ))}
              </select>
            </label>

            <label className="onboard-field">
              <span>{t("Team size")}</span>
              <select value={answers.teamSize} onChange={event => set("teamSize", event.target.value as OnboardingTeamSize)}>
                {ONBOARDING_TEAM_SIZES.map(size => <option key={size.id} value={size.id}>{t(size.label)}</option>)}
              </select>
            </label>
            <label className="onboard-field">
              <span>{t("Monthly orders")}</span>
              <select value={answers.volume} onChange={event => set("volume", event.target.value as OnboardingVolume)}>
                <option value="">{t("How many a month?")}</option>
                {ONBOARDING_VOLUMES.map(volume => <option key={volume.id} value={volume.id}>{t(volume.label)}</option>)}
              </select>
            </label>

            <label className="onboard-field">
              <span>{t("Business age")}</span>
              <select
                value={answers.businessAge}
                onChange={event => set("businessAge", event.target.value as OnboardingAnswers["businessAge"])}
              >
                <option value="">{t("How long in business?")}</option>
                {ONBOARDING_BUSINESS_AGES.map(age => <option key={age.id} value={age.id}>{t(age.label)}</option>)}
              </select>
            </label>
            <label className="onboard-field">
              <span>{t("Stock tracking")}</span>
              <select
                value={answers.inventoryExperience}
                onChange={event => set("inventoryExperience", event.target.value as OnboardingAnswers["inventoryExperience"])}
              >
                <option value="">{t("How well do you track it?")}</option>
                {ONBOARDING_INVENTORY_EXPERIENCE.map(level => (
                  <option key={level.id} value={level.id}>{t(level.label)}</option>
                ))}
              </select>
            </label>

            <label className="onboard-field">
              <span>{t("How did you find us?")}</span>
              {/* Typed, not chosen: a list of the channels we thought of first
                  only ever collects the channels we thought of first. */}
              <input
                type="text"
                value={answers.heardFrom}
                maxLength={200}
                placeholder={t("A search, a friend, an advert…")}
                onChange={event => set("heardFrom", event.target.value)}
              />
            </label>
            <p className="onboard-why onboard-field">
              {t("This helps us suggest the right setup. It won't affect your trial.")}
            </p>
          </div>
        ) : null}

        {stepKey === "goal" ? (
          /* One question, one list, one answer.
             Picking a goal used to open a second question underneath it —
             "Anything else?", with a row of chips — so the screen grew a new
             section the moment you touched it, and the answer it collected was
             never the thing the preset engine read. It asks once now, and the
             last row is the one that takes their own words. */
          <div className="onboard-options">
            {ONBOARDING_GOALS.map(goal => (
              <label key={goal.id} className={answers.mainGoal === goal.id ? "is-on" : ""}>
                <input
                  type="radio"
                  name="onboard-goal"
                  checked={answers.mainGoal === goal.id}
                  onChange={() => set("mainGoal", goal.id)}
                />
                <span className={goal.id === "other" && answers.mainGoal === "other" ? "has-own-goal" : undefined}>
                  <strong>{t(goal.label)}</strong>
                  {goal.id === "other" && answers.mainGoal === "other" ? (
                    <input
                      className="onboard-own-goal"
                      type="text"
                      value={answers.otherGoal}
                      maxLength={200}
                      autoFocus
                      placeholder={t("In your own words")}
                      onChange={event => set("otherGoal", event.target.value)}
                      /* The row is a label wrapping a radio: a click inside the
                         field would re-pick the radio and take the focus back. */
                      onClick={event => event.preventDefault()}
                    />
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {stepKey === "bringWork" ? (
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
                      data-fallback={integration.logo ? undefined : "1"}
                    >
                      {/* An official asset when one is present; the wordmark on the
                          brand's own colour when it is not, so the tile is never
                          an empty box.

                          Some brands have no asset ON PURPOSE — Etsy publishes
                          none for third parties and their API Terms require
                          their marks to stay less prominent than ours. Those
                          are marked fallback up front rather than rendered as
                          an <img> with an empty src: a src="" does not reliably
                          fire onError, it can resolve to the page itself and
                          "load", leaving a broken picture where the name should
                          be. */}
                      {integration.logo ? (
                        <img
                          src={integration.logo}
                          alt=""
                          onError={event => {
                            event.currentTarget.parentElement?.setAttribute("data-fallback", "1");
                          }}
                        />
                      ) : null}
                      <b>{integration.name}</b>
                    </span>
                    <em>{t(integration.detail)}</em>
                    {connected?.[integration.id] ? (
                      <span className="onboard-connect-done">
                        <i aria-hidden="true">✓</i>{t("Connected")}
                      </span>
                    ) : integration.comingSoon ? (
                      <span className="onboard-connect-soon">{t("Coming soon")}</span>
                    ) : (
                      <button
                        type="button"
                        className="onboard-btn onboard-connect-btn"
                        disabled={saving}
                        onClick={() => onConnect(answers, integration.href)}
                      >
                        {/* The ChatGPT app can only be started from ChatGPT's
                            side, so its tile offers directions rather than a
                            button that says Connect and cannot connect. */}
                        {t(integration.startsElsewhere ? "How to connect" : "Connect")}
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <p className="onboard-connect-note">
                {t("Each one opens in a new tab. Come back here when you are done — you can connect as many as you like before you continue.")}
              </p>
              <p className="onboard-connect-note">
                {t("Nothing is shared with them until you sign in on their side, and you can disconnect at any time.")}
              </p>
            </div>
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

        {stepKey === "plan" ? (
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
                        .replace("{price}", `${plan.amount} / ${t("month")}`)}
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

        {error ? <p className="onboard-error">{t(error)}</p> : null}

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
