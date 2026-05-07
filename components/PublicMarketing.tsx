"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  PLAN_ENTITLEMENTS,
  storageLimitLabel,
  type PlanEntitlements,
  type StudioBillingPlan
} from "@/lib/studioflow/plans";
import type { StudioLanguage } from "@/lib/studioflow/language";
import {
  PublicSiteLanguageProvider,
  usePublicSiteLanguage
} from "@/lib/publicSite/i18n";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";
import {
  createStripeCheckoutSession,
  type StripeBillingItemKey
} from "@/lib/studioflow/billingActions";

type FeatureTone = "sage" | "clay" | "sky" | "lilac" | "rose" | "gold" | "graphite";

type FeatureHighlight = {
  titleKey: PublicSiteTranslationKey;
  eyebrowKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  bulletKeys: PublicSiteTranslationKey[];
  tone: FeatureTone;
  metricKey: PublicSiteTranslationKey;
  artifactKey: PublicSiteTranslationKey;
};

type InfoSection = {
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  bulletKeys?: PublicSiteTranslationKey[];
};

const FEATURE_HIGHLIGHTS: FeatureHighlight[] = [
  {
    titleKey: "feature.orders.title",
    eyebrowKey: "feature.orders.eyebrow",
    bodyKey: "feature.orders.body",
    bulletKeys: ["feature.orders.bullet1", "feature.orders.bullet2", "feature.orders.bullet3"],
    tone: "sage",
    metricKey: "feature.orders.metric",
    artifactKey: "feature.orders.artifact"
  },
  {
    titleKey: "feature.files.title",
    eyebrowKey: "feature.files.eyebrow",
    bodyKey: "feature.files.body",
    bulletKeys: ["feature.files.bullet1", "feature.files.bullet2", "feature.files.bullet3"],
    tone: "sky",
    metricKey: "feature.files.metric",
    artifactKey: "feature.files.artifact"
  },
  {
    titleKey: "feature.timeline.title",
    eyebrowKey: "feature.timeline.eyebrow",
    bodyKey: "feature.timeline.body",
    bulletKeys: ["feature.timeline.bullet1", "feature.timeline.bullet2", "feature.timeline.bullet3"],
    tone: "gold",
    metricKey: "feature.timeline.metric",
    artifactKey: "feature.timeline.artifact"
  },
  {
    titleKey: "feature.todo.title",
    eyebrowKey: "feature.todo.eyebrow",
    bodyKey: "feature.todo.body",
    bulletKeys: ["feature.todo.bullet1", "feature.todo.bullet2", "feature.todo.bullet3"],
    tone: "rose",
    metricKey: "feature.todo.metric",
    artifactKey: "feature.todo.artifact"
  },
  {
    titleKey: "feature.team.title",
    eyebrowKey: "feature.team.eyebrow",
    bodyKey: "feature.team.body",
    bulletKeys: ["feature.team.bullet1", "feature.team.bullet2", "feature.team.bullet3"],
    tone: "lilac",
    metricKey: "feature.team.metric",
    artifactKey: "feature.team.artifact"
  },
  {
    titleKey: "feature.dashboard.title",
    eyebrowKey: "feature.dashboard.eyebrow",
    bodyKey: "feature.dashboard.body",
    bulletKeys: ["feature.dashboard.bullet1", "feature.dashboard.bullet2", "feature.dashboard.bullet3"],
    tone: "clay",
    metricKey: "feature.dashboard.metric",
    artifactKey: "feature.dashboard.artifact"
  },
  {
    titleKey: "feature.export.title",
    eyebrowKey: "feature.export.eyebrow",
    bodyKey: "feature.export.body",
    bulletKeys: ["feature.export.bullet1", "feature.export.bullet2", "feature.export.bullet3"],
    tone: "graphite",
    metricKey: "feature.export.metric",
    artifactKey: "feature.export.artifact"
  }
];

const PLATFORM_NOTE_KEYS: PublicSiteTranslationKey[] = [
  "platform.note1",
  "platform.note2",
  "platform.note3"
];

const FEATURE_GROUPS: InfoSection[] = [
  {
    titleKey: "workflow.group1.title",
    bodyKey: "workflow.group1.body"
  },
  {
    titleKey: "workflow.group2.title",
    bodyKey: "workflow.group2.body"
  },
  {
    titleKey: "workflow.group3.title",
    bodyKey: "workflow.group3.body"
  }
];

const ACCENT_CARD_KEYS: PublicSiteTranslationKey[] = [
  "accent.card.orders",
  "accent.card.files",
  "accent.card.delivery",
  "accent.card.todo",
  "accent.card.export"
];

const PLAN_ORDER: StudioBillingPlan[] = ["demo", "lifetime_lite", "pro_monthly", "team_monthly"];

type PublicPlanCopy = {
  shortNameKey: PublicSiteTranslationKey;
  publicNameKey: PublicSiteTranslationKey;
  priceLabelKey: PublicSiteTranslationKey;
  modelKey: PublicSiteTranslationKey;
  noteKey: PublicSiteTranslationKey;
  ctaKey: PublicSiteTranslationKey;
  href?: string;
  disabled?: boolean;
  featured?: boolean;
  badgeKey?: PublicSiteTranslationKey;
  billingKey?: StripeBillingItemKey;
  bulletKeys: PublicSiteTranslationKey[];
};

const PUBLIC_PLAN_COPY: Record<StudioBillingPlan, PublicPlanCopy> = {
  demo: {
    shortNameKey: "plan.demo.shortName",
    publicNameKey: "plan.demo.publicName",
    priceLabelKey: "plan.demo.price",
    modelKey: "plan.model.demo",
    noteKey: "plan.demo.note",
    ctaKey: "cta.startFree",
    href: "/signup",
    bulletKeys: ["plan.demo.bullet1", "plan.demo.bullet2", "plan.demo.bullet3"]
  },
  lifetime_lite: {
    shortNameKey: "plan.lite.shortName",
    publicNameKey: "plan.lite.publicName",
    priceLabelKey: "plan.lite.price",
    modelKey: "plan.model.oneTime",
    noteKey: "plan.lite.note",
    ctaKey: "cta.getStarted",
    billingKey: "lifetime_lite",
    bulletKeys: ["plan.lite.bullet1", "plan.lite.bullet2", "plan.lite.bullet3"]
  },
  pro_monthly: {
    shortNameKey: "plan.pro.shortName",
    publicNameKey: "plan.pro.publicName",
    priceLabelKey: "plan.pro.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.pro.note",
    ctaKey: "cta.getStarted",
    billingKey: "pro_monthly",
    featured: true,
    badgeKey: "plan.pro.badge",
    bulletKeys: ["plan.pro.bullet1", "plan.pro.bullet2", "plan.pro.bullet3"]
  },
  team_monthly: {
    shortNameKey: "plan.team.shortName",
    publicNameKey: "plan.team.publicName",
    priceLabelKey: "plan.team.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.team.note",
    ctaKey: "cta.getStarted",
    billingKey: "team_monthly",
    href: "/contact",
    bulletKeys: ["plan.team.bullet1", "plan.team.bullet2", "plan.team.bullet3"]
  }
};

const FAQS: InfoSection[] = [
  { titleKey: "faq.q1.title", bodyKey: "faq.q1.body" },
  { titleKey: "faq.q2.title", bodyKey: "faq.q2.body" },
  { titleKey: "faq.q3.title", bodyKey: "faq.q3.body" },
  { titleKey: "faq.q4.title", bodyKey: "faq.q4.body" },
  { titleKey: "faq.q5.title", bodyKey: "faq.q5.body" }
];

const PRIVACY_SECTIONS: InfoSection[] = [
  { titleKey: "privacy.s1.title", bodyKey: "privacy.s1.body" },
  { titleKey: "privacy.s2.title", bodyKey: "privacy.s2.body" },
  { titleKey: "privacy.s3.title", bodyKey: "privacy.s3.body" },
  { titleKey: "privacy.s4.title", bodyKey: "privacy.s4.body" }
];

const TERMS_SECTIONS: InfoSection[] = [
  { titleKey: "terms.s1.title", bodyKey: "terms.s1.body" },
  { titleKey: "terms.s2.title", bodyKey: "terms.s2.body" },
  { titleKey: "terms.s3.title", bodyKey: "terms.s3.body" },
  { titleKey: "terms.s4.title", bodyKey: "terms.s4.body" }
];

const CONTACT_SECTIONS: InfoSection[] = [
  { titleKey: "contact.s1.title", bodyKey: "contact.s1.body" },
  { titleKey: "contact.s2.title", bodyKey: "contact.s2.body" },
  { titleKey: "contact.s3.title", bodyKey: "contact.s3.body" }
];

function PublicLanguageSelector() {
  const { language, languages, setLanguage, t } = usePublicSiteLanguage();
  return (
    <label className="public-language-select">
      <span>{t("language.label")}</span>
      <select
        aria-label={t("language.selectorLabel")}
        value={language}
        onChange={event => setLanguage(event.target.value as StudioLanguage)}
      >
        {languages.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function PublicHeader() {
  const { user } = useAuth();
  const { t } = usePublicSiteLanguage();
  return (
    <header className="public-header">
      <div className="public-shell public-header-inner">
        <Link href="/" className="public-brand" aria-label={t("brand.homeAria")}>
          <span className="public-mark">SF</span>
          <span>
            <strong>{t("brand.name")}</strong>
            <small>{t("brand.byline")}</small>
          </span>
        </Link>

        <nav className="public-nav-links" aria-label={t("nav.publicPages")}>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
        </nav>

        <div className="public-header-actions">
          <PublicLanguageSelector />
          <Link href={user ? "/dashboard" : "/login"} className="public-button ghost">
            {user ? t("cta.openPortal") : t("cta.login")}
          </Link>
          <Link href="/signup" className="public-button">
            {t("cta.startFree")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  const { t } = usePublicSiteLanguage();
  return (
    <footer className="public-footer">
      <div className="public-shell public-footer-inner">
        <div>
          <strong>{t("brand.full")}</strong>
          <p>{t("brand.footerDescription")}</p>
        </div>
        <nav aria-label={t("nav.footer")}>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/privacy">{t("nav.privacy")}</Link>
          <Link href="/terms">{t("nav.terms")}</Link>
          <Link href="/contact">{t("nav.contact")}</Link>
        </nav>
      </div>
    </footer>
  );
}

function PublicShellContent({ children }: { children: ReactNode }) {
  const { dir } = usePublicSiteLanguage();
  return (
    <div className="public-site" dir={dir}>
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <PublicSiteLanguageProvider>
      <PublicShellContent>{children}</PublicShellContent>
    </PublicSiteLanguageProvider>
  );
}

function ProductScene() {
  const { t } = usePublicSiteLanguage();
  return (
    <div className="public-hero-visual" aria-hidden="true">
      <div className="product-board">
        <div className="product-frame-label">{t("product.frameLabel")}</div>
        <div className="product-sidebar">
          <div className="product-window-controls">
            <span />
            <span />
            <span />
          </div>
          <span className="product-dot active" data-label={t("product.orders")} />
          <span className="product-dot" data-label={t("product.files")} />
          <span className="product-dot" data-label={t("product.team")} />
          <span className="product-dot" data-label={t("product.export")} />
        </div>
        <div className="product-main">
          <div className="product-toolbar">
            <div>
              <span>{t("product.monthNet")}</span>
              <strong>{t("product.dashboard")}</strong>
            </div>
            <span className="product-sync-pill">{t("product.saved")}</span>
          </div>
          <div className="product-accent-strip">
            <span data-color="sage" />
            <span data-color="clay" />
            <span data-color="sky" />
            <span data-color="rose" />
            <span data-color="gold" />
          </div>
          <div className="product-grid">
            <div className="product-panel product-panel-large" data-tone="sage">
              <span className="product-kicker">{t("product.orders")}</span>
              <strong>{t("product.orderTitle")}</strong>
              <p>{t("product.due")}</p>
              <div className="product-mini-list">
                <span />
                <span />
                <span />
              </div>
              <div className="product-progress"><span style={{ width: "72%" }} /></div>
            </div>
            <div className="product-panel" data-tone="sky">
              <span className="product-kicker">{t("product.files")}</span>
              <strong>{t("product.assets")}</strong>
              <p>{t("product.assetsNote")}</p>
            </div>
            <div className="product-panel" data-tone="rose">
              <span className="product-kicker">{t("product.todo")}</span>
              <strong>{t("product.todoCount")}</strong>
              <p>{t("product.todoNote")}</p>
            </div>
            <div className="product-panel product-panel-wide" data-tone="gold">
              <span className="product-kicker">{t("product.timeline")}</span>
              <strong>{t("product.productionWindow")}</strong>
              <div className="product-timeline">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroActions() {
  const { user } = useAuth();
  const { t } = usePublicSiteLanguage();
  return (
    <div className="public-hero-actions">
      <Link href="/signup" className="public-button large">
        {t("cta.startFree")}
      </Link>
      <Link href={user ? "/dashboard" : "/login"} className="public-button secondary large">
        {user ? t("cta.openPortal") : t("cta.login")}
      </Link>
      <Link href="/pricing" className="public-button ghost large">
        {t("cta.viewPricing")}
      </Link>
    </div>
  );
}

function SectionHeader({
  eyebrowKey,
  titleKey,
  bodyKey
}: {
  eyebrowKey: PublicSiteTranslationKey;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
}) {
  const { t } = usePublicSiteLanguage();
  return (
    <div className="public-section-header">
      <span className="public-eyebrow">{t(eyebrowKey)}</span>
      <h2>{t(titleKey)}</h2>
      <p>{t(bodyKey)}</p>
    </div>
  );
}

function FeatureCard({ feature, index }: { feature: FeatureHighlight; index: number }) {
  const { t } = usePublicSiteLanguage();
  const title = t(feature.titleKey);
  return (
    <article className="public-card public-feature-card" data-tone={feature.tone}>
      <div className="public-feature-top">
        <div className="public-card-index">{String(index + 1).padStart(2, "0")}</div>
        <div className="public-feature-swatch" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <span className="public-eyebrow">{t(feature.eyebrowKey)}</span>
      <h3>{title}</h3>
      <p>{t(feature.bodyKey)}</p>
      <div className="public-feature-preview" aria-hidden="true">
        <strong>{t(feature.metricKey)}</strong>
        <span>{t(feature.artifactKey)}</span>
      </div>
      <ul>
        {feature.bulletKeys.map(bulletKey => <li key={bulletKey}>{t(bulletKey)}</li>)}
      </ul>
    </article>
  );
}

function PlanAction({ copy }: { copy: PublicPlanCopy }) {
  const { user } = useAuth();
  const { t } = usePublicSiteLanguage();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (!copy.billingKey) return;
    if (!user) {
      window.location.assign("/signup");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const result = await createStripeCheckoutSession({ itemKey: copy.billingKey });
      if (result.configured && result.url) {
        window.location.assign(result.url);
        return;
      }
      setMessage(result.message || t("billing.notConfigured"));
    } catch (checkoutError) {
      setMessage(checkoutError instanceof Error ? checkoutError.message : t("billing.notConfigured"));
    } finally {
      setLoading(false);
    }
  }

  if (copy.billingKey) {
    return (
      <div className="public-plan-action-stack">
        <button className="public-button secondary" type="button" onClick={handleCheckout} disabled={loading}>
          {loading ? t("billing.startingCheckout") : t(copy.ctaKey)}
        </button>
        {message ? <span>{message}</span> : null}
      </div>
    );
  }

  if (copy.disabled) {
    return (
      <button className="public-button secondary" type="button" disabled>
        {t(copy.ctaKey)}
      </button>
    );
  }

  return (
    <Link href={copy.href ?? "/signup"} className="public-button secondary">
      {t(copy.ctaKey)}
    </Link>
  );
}

function PublicPlanCard({ plan, compact = false }: { plan: PlanEntitlements; compact?: boolean }) {
  const { t } = usePublicSiteLanguage();
  const copy = PUBLIC_PLAN_COPY[plan.plan];
  const bulletKeys = compact ? copy.bulletKeys.slice(0, 3) : copy.bulletKeys;
  return (
    <article className={copy.featured ? "public-card public-plan-card featured" : "public-card public-plan-card"} data-plan={plan.plan}>
      <div className="public-plan-glint" aria-hidden="true" />
      <div className="public-plan-topline">
        <span className="public-eyebrow">{t(copy.shortNameKey)}</span>
        {copy.badgeKey ? <span className="public-plan-badge">{t(copy.badgeKey)}</span> : null}
      </div>
      <h3>{t(copy.publicNameKey)}</h3>
      <div className="public-plan-price">{t(copy.priceLabelKey)}</div>
      <span className="public-plan-model">{t(copy.modelKey)}</span>
      <p>{t(copy.noteKey)}</p>
      <dl className="public-plan-limits">
        <div>
          <dt>{t("plan.limit.orders")}</dt>
          <dd>{plan.orderLimit ?? t("plan.limit.unlimited")}</dd>
        </div>
        <div>
          <dt>{t("plan.limit.customers")}</dt>
          <dd>{plan.customerLimit ?? t("plan.limit.unlimited")}</dd>
        </div>
        <div>
          <dt>{t("plan.limit.storage")}</dt>
          <dd>{storageLimitLabel(plan)}</dd>
        </div>
        <div>
          <dt>{t("plan.limit.team")}</dt>
          <dd>{plan.teamMemberLimit}</dd>
        </div>
      </dl>
      <ul>
        {bulletKeys.map(bulletKey => <li key={bulletKey}>{t(bulletKey)}</li>)}
      </ul>
      <PlanAction copy={copy} />
    </article>
  );
}

function PublicPlanGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className="public-plan-grid">
      {PLAN_ORDER.map(planKey => (
        <PublicPlanCard key={planKey} plan={PLAN_ENTITLEMENTS[planKey]} compact={compact} />
      ))}
    </div>
  );
}

function StudioAccentBand() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-accent-band">
      <div className="public-shell public-accent-grid">
        <div>
          <span className="public-eyebrow">{t("accent.eyebrow")}</span>
          <h2>{t("accent.title")}</h2>
          <p>{t("accent.body")}</p>
        </div>
        <div className="public-custom-card-row" aria-hidden="true">
          {ACCENT_CARD_KEYS.map((cardKey, index) => (
            <span key={cardKey} data-index={index}>{t(cardKey)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureWorkflowPanel() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-workflow-section">
      <div className="public-shell public-workflow-panel">
        <div>
          <span className="public-eyebrow">{t("workflow.eyebrow")}</span>
          <h2>{t("workflow.title")}</h2>
        </div>
        <div className="public-workflow-grid">
          {FEATURE_GROUPS.map(group => (
            <article key={group.titleKey}>
              <span />
              <h3>{t(group.titleKey)}</h3>
              <p>{t(group.bodyKey)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformNote() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-section-soft">
      <div className="public-shell public-platform-panel">
        <div>
          <span className="public-eyebrow">{t("platform.eyebrow")}</span>
          <h2>{t("platform.title")}</h2>
        </div>
        <ul>
          {PLATFORM_NOTE_KEYS.map(noteKey => <li key={noteKey}>{t(noteKey)}</li>)}
        </ul>
      </div>
    </section>
  );
}

export function PublicHomePage() {
  const HomeContent = () => {
    const { t } = usePublicSiteLanguage();
    return (
      <>
        <section className="public-hero">
          <ProductScene />
          <div className="public-shell public-hero-content">
            <div className="public-hero-copy">
              <span className="public-eyebrow">{t("hero.eyebrow")}</span>
              <h1>{t("hero.title")}</h1>
              <p>{t("hero.body")}</p>
              <HeroActions />
            </div>
          </div>
        </section>

        <StudioAccentBand />

        <section className="public-section">
          <div className="public-shell">
            <SectionHeader
              eyebrowKey="section.flow.eyebrow"
              titleKey="section.flow.title"
              bodyKey="section.flow.body"
            />
            <div className="public-feature-grid">
              {FEATURE_HIGHLIGHTS.map((feature, index) => (
                <FeatureCard key={feature.titleKey} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

        <PlatformNote />

        <section className="public-section">
          <div className="public-shell">
            <SectionHeader
              eyebrowKey="pricingPreview.eyebrow"
              titleKey="pricingPreview.title"
              bodyKey="pricingPreview.body"
            />
            <PublicPlanGrid compact />
          </div>
        </section>

        <section className="public-section public-cta-band">
          <div className="public-shell public-cta-inner">
            <div>
              <span className="public-eyebrow">{t("ctaBand.eyebrow")}</span>
              <h2>{t("ctaBand.title")}</h2>
            </div>
            <HeroActions />
          </div>
        </section>
      </>
    );
  };

  return (
    <PublicShell>
      <HomeContent />
    </PublicShell>
  );
}

export function PublicFeaturesPage() {
  const Page = () => {
    const { t } = usePublicSiteLanguage();
    return (
      <>
        <section className="public-page-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("featuresPage.eyebrow")}</span>
            <h1>{t("featuresPage.title")}</h1>
            <p>{t("featuresPage.body")}</p>
          </div>
        </section>

        <FeatureWorkflowPanel />

        <section className="public-section">
          <div className="public-shell">
            <div className="public-feature-grid">
              {FEATURE_HIGHLIGHTS.map((feature, index) => (
                <FeatureCard key={feature.titleKey} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

        <PlatformNote />
      </>
    );
  };

  return (
    <PublicShell>
      <Page />
    </PublicShell>
  );
}

export function PublicPricingPage() {
  const Page = () => {
    const { t } = usePublicSiteLanguage();
    return (
      <>
        <section className="public-page-hero public-pricing-page-hero">
          <div className="public-shell public-pricing-hero">
            <div>
              <span className="public-eyebrow">{t("pricingPage.eyebrow")}</span>
              <h1>{t("pricingPage.title")}</h1>
              <p>{t("pricingPage.body")}</p>
            </div>
            <div className="public-pricing-actions">
              <Link href="/signup" className="public-button large">{t("cta.startFree")}</Link>
              <span className="public-billing-note">{t("pricingPage.safeCheckout")}</span>
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell">
            <PublicPlanGrid />
          </div>
        </section>

        <section className="public-section public-section-soft">
          <div className="public-shell">
            <SectionHeader
              eyebrowKey="pricingPage.addons.eyebrow"
              titleKey="pricingPage.addons.title"
              bodyKey="pricingPage.addons.body"
            />
            <div className="public-addon-grid">
              <article className="public-card public-addon-card" data-addon="100">
                <span className="public-eyebrow">{t("pricingPage.addon.label")}</span>
                <h3>{t("pricingPage.addon100.title")}</h3>
                <p>{t("pricingPage.addon100.body")}</p>
                <button className="public-button secondary" type="button" disabled>{t("cta.billingSoon")}</button>
              </article>
              <article className="public-card public-addon-card" data-addon="200">
                <span className="public-eyebrow">{t("pricingPage.addon.label")}</span>
                <h3>{t("pricingPage.addon200.title")}</h3>
                <p>{t("pricingPage.addon200.body")}</p>
                <button className="public-button secondary" type="button" disabled>{t("cta.billingSoon")}</button>
              </article>
            </div>
          </div>
        </section>
      </>
    );
  };

  return (
    <PublicShell>
      <Page />
    </PublicShell>
  );
}

export function PublicSignupPage() {
  const Page = () => {
    const { user } = useAuth();
    const { t } = usePublicSiteLanguage();
    return (
      <section className="public-page-hero public-signup-hero">
        <div className="public-shell public-signup-layout">
          <div>
            <span className="public-eyebrow">{t("signup.eyebrow")}</span>
            <h1>{t("signup.title")}</h1>
            <p>{t("signup.body")}</p>
            <div className="public-hero-actions">
              <Link href={user ? "/dashboard" : "/login"} className="public-button large">
                {user ? t("cta.openPortal") : t("cta.loginToStudioFlow")}
              </Link>
              <Link href="/pricing" className="public-button ghost large">{t("cta.viewPricing")}</Link>
            </div>
          </div>
          <aside className="public-card public-signup-card">
            <span className="public-eyebrow">{t("signup.safe.eyebrow")}</span>
            <h2>{t("signup.safe.title")}</h2>
            <p>{t("signup.safe.body")}</p>
            <ul>
              <li>{t("signup.safe.bullet1")}</li>
              <li>{t("signup.safe.bullet2")}</li>
              <li>{t("signup.safe.bullet3")}</li>
            </ul>
            <div className="public-signup-mini" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </aside>
        </div>
      </section>
    );
  };

  return (
    <PublicShell>
      <Page />
    </PublicShell>
  );
}

export function PublicFaqPage() {
  const Page = () => {
    const { t } = usePublicSiteLanguage();
    return (
      <>
        <section className="public-page-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("faq.eyebrow")}</span>
            <h1>{t("faq.title")}</h1>
            <p>{t("faq.body")}</p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-info-list">
            {FAQS.map(item => (
              <article className="public-card public-info-card" key={item.titleKey}>
                <h2>{t(item.titleKey)}</h2>
                <p>{t(item.bodyKey)}</p>
              </article>
            ))}
          </div>
        </section>
      </>
    );
  };

  return (
    <PublicShell>
      <Page />
    </PublicShell>
  );
}

function PublicInfoContent({
  eyebrowKey,
  titleKey,
  bodyKey,
  sections
}: {
  eyebrowKey: PublicSiteTranslationKey;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  sections: InfoSection[];
}) {
  const { t } = usePublicSiteLanguage();
  return (
    <>
      <section className="public-page-hero public-info-hero">
        <div className="public-shell">
          <span className="public-eyebrow">{t(eyebrowKey)}</span>
          <h1>{t(titleKey)}</h1>
          <p>{t(bodyKey)}</p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-shell public-info-list">
          {sections.map(section => (
            <article className="public-card public-info-card" key={section.titleKey}>
              <h2>{t(section.titleKey)}</h2>
              <p>{t(section.bodyKey)}</p>
              {section.bulletKeys ? (
                <ul>
                  {section.bulletKeys.map(bulletKey => <li key={bulletKey}>{t(bulletKey)}</li>)}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function PublicInfoPage({
  eyebrowKey,
  titleKey,
  bodyKey,
  sections
}: {
  eyebrowKey: PublicSiteTranslationKey;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  sections: InfoSection[];
}) {
  return (
    <PublicShell>
      <PublicInfoContent
        eyebrowKey={eyebrowKey}
        titleKey={titleKey}
        bodyKey={bodyKey}
        sections={sections}
      />
    </PublicShell>
  );
}

export function PublicPrivacyPage() {
  return (
    <PublicInfoPage
      eyebrowKey="privacy.eyebrow"
      titleKey="privacy.title"
      bodyKey="privacy.body"
      sections={PRIVACY_SECTIONS}
    />
  );
}

export function PublicTermsPage() {
  return (
    <PublicInfoPage
      eyebrowKey="terms.eyebrow"
      titleKey="terms.title"
      bodyKey="terms.body"
      sections={TERMS_SECTIONS}
    />
  );
}

export function PublicContactPage() {
  return (
    <PublicInfoPage
      eyebrowKey="contact.eyebrow"
      titleKey="contact.title"
      bodyKey="contact.body"
      sections={CONTACT_SECTIONS}
    />
  );
}
