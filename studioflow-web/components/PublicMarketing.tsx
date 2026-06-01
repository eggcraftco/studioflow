"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
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
  getPrivacyPolicyLastUpdatedLabel,
  getPrivacyPolicySections,
  PRIVACY_POLICY_LAST_UPDATED,
  type PrivacyPolicySection,
  type PrivacyPolicySubsection
} from "@/lib/publicSite/privacyPolicy";
import {
  getTermsPolicyLastUpdatedLabel,
  getTermsPolicySections,
  TERMS_POLICY_LAST_UPDATED
} from "@/lib/publicSite/termsPolicy";
import {
  COOKIE_POLICY_LAST_UPDATED,
  getCookiePolicyLastUpdatedLabel,
  getCookiePolicySections
} from "@/lib/publicSite/cookiePolicy";
import {
  ACCOUNT_DELETION_POLICY_LAST_UPDATED,
  getAccountDeletionPolicyLastUpdatedLabel,
  getAccountDeletionPolicySections
} from "@/lib/publicSite/accountDeletionPolicy";
import {
  getRefundCancellationPolicyLastUpdatedLabel,
  getRefundCancellationPolicySections,
  REFUND_CANCELLATION_POLICY_LAST_UPDATED
} from "@/lib/publicSite/refundCancellationPolicy";
import {
  getSecurityOverviewLastUpdatedLabel,
  getSecurityOverviewSections,
  SECURITY_OVERVIEW_LAST_UPDATED
} from "@/lib/publicSite/securityOverview";
import {
  getSubprocessorsLastUpdatedLabel,
  getSubprocessorsSections,
  SUBPROCESSORS_LAST_UPDATED
} from "@/lib/publicSite/subprocessors";
import {
  DATA_PROCESSING_AGREEMENT_LAST_UPDATED,
  getDataProcessingAgreementLastUpdatedLabel,
  getDataProcessingAgreementSections
} from "@/lib/publicSite/dataProcessingAgreement";
import {
  ACCEPTABLE_USE_POLICY_LAST_UPDATED,
  getAcceptableUsePolicyLastUpdatedLabel,
  getAcceptableUsePolicySections
} from "@/lib/publicSite/acceptableUsePolicy";
import {
  getSupportContactLastUpdatedLabel,
  getSupportContactSections,
  SUPPORT_CONTACT_LAST_UPDATED
} from "@/lib/publicSite/supportContact";
import {
  createStripeCheckoutSession,
  type StripeBillingItemKey
} from "@/lib/studioflow/billingActions";
import { CardIconGlyph, type CardIcon } from "@/components/CardTitle";

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

type PlatformKind = "apple" | "android" | "web" | "windows";

type PlatformCard = {
  kind: PlatformKind;
  nameKey: PublicSiteTranslationKey;
  detailKey: PublicSiteTranslationKey;
  statusKey: PublicSiteTranslationKey;
};

type OrderCardInfo = {
  titleKey: PublicSiteTranslationKey;
  detailKey: PublicSiteTranslationKey;
  icon: CardIcon;
};

type FeatureDeepDive = {
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  bulletKeys: PublicSiteTranslationKey[];
};

type FeatureCapability = {
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
};

type PlanFeatureBridge = {
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  planKeys: StudioBillingPlan[];
};

type ScrollStoryStep = {
  eyebrowKey: PublicSiteTranslationKey;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  cardKey: PublicSiteTranslationKey;
  detailKey: PublicSiteTranslationKey;
  valueKey: PublicSiteTranslationKey;
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
    titleKey: "feature.chatgpt.title",
    eyebrowKey: "feature.chatgpt.eyebrow",
    bodyKey: "feature.chatgpt.body",
    bulletKeys: ["feature.chatgpt.bullet1", "feature.chatgpt.bullet2", "feature.chatgpt.bullet3"],
    tone: "sky",
    metricKey: "feature.chatgpt.metric",
    artifactKey: "feature.chatgpt.artifact"
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

const PLATFORM_CARDS: PlatformCard[] = [
  {
    kind: "apple",
    nameKey: "platform.apple.name",
    detailKey: "platform.apple.detail",
    statusKey: "platform.apple.status"
  },
  {
    kind: "android",
    nameKey: "platform.android.name",
    detailKey: "platform.android.detail",
    statusKey: "platform.android.status"
  },
  {
    kind: "web",
    nameKey: "platform.web.name",
    detailKey: "platform.web.detail",
    statusKey: "platform.web.status"
  },
  {
    kind: "windows",
    nameKey: "platform.windows.name",
    detailKey: "platform.windows.detail",
    statusKey: "platform.windows.status"
  }
];

const ORDER_CARDS: OrderCardInfo[] = [
  { titleKey: "orderCard.preview", detailKey: "orderCard.preview.detail", icon: "photo" },
  { titleKey: "orderCard.summary", detailKey: "orderCard.summary.detail", icon: "docText" },
  { titleKey: "orderCard.customer", detailKey: "orderCard.customer.detail", icon: "customer" },
  { titleKey: "orderCard.materials", detailKey: "orderCard.materials.detail", icon: "shippingBox" },
  { titleKey: "orderCard.priority", detailKey: "orderCard.priority.detail", icon: "warningTriangle" },
  { titleKey: "orderCard.delivery", detailKey: "orderCard.delivery.detail", icon: "calendarClock" },
  { titleKey: "orderCard.notes", detailKey: "orderCard.notes.detail", icon: "notes" },
  { titleKey: "orderCard.clientFiles", detailKey: "orderCard.clientFiles.detail", icon: "folderPerson" },
  { titleKey: "orderCard.todo", detailKey: "orderCard.todo.detail", icon: "checklist" },
  { titleKey: "orderCard.workTime", detailKey: "orderCard.workTime.detail", icon: "workTime" },
  { titleKey: "orderCard.financial", detailKey: "orderCard.financial.detail", icon: "finance" },
  { titleKey: "orderCard.status", detailKey: "orderCard.status.detail", icon: "paintbrush" },
  { titleKey: "orderCard.shipping", detailKey: "orderCard.shipping.detail", icon: "airplane" },
  { titleKey: "orderCard.schedule", detailKey: "orderCard.schedule.detail", icon: "bellBadge" },
  { titleKey: "orderCard.history", detailKey: "orderCard.history.detail", icon: "historyClock" }
];

const ORDER_CARD_TONES = ["default", "green", "blue", "yellow", "pink", "purple"] as const;

const SCROLL_STORY_STEPS: ScrollStoryStep[] = [
  {
    eyebrowKey: "scrollStory.step1.eyebrow",
    titleKey: "scrollStory.step1.title",
    bodyKey: "scrollStory.step1.body",
    cardKey: "scrollStory.card1",
    detailKey: "scrollStory.detail1",
    valueKey: "scrollStory.value1"
  },
  {
    eyebrowKey: "scrollStory.step2.eyebrow",
    titleKey: "scrollStory.step2.title",
    bodyKey: "scrollStory.step2.body",
    cardKey: "scrollStory.card2",
    detailKey: "scrollStory.detail2",
    valueKey: "scrollStory.value2"
  },
  {
    eyebrowKey: "scrollStory.step3.eyebrow",
    titleKey: "scrollStory.step3.title",
    bodyKey: "scrollStory.step3.body",
    cardKey: "scrollStory.card3",
    detailKey: "scrollStory.detail3",
    valueKey: "scrollStory.value3"
  },
  {
    eyebrowKey: "scrollStory.step4.eyebrow",
    titleKey: "scrollStory.step4.title",
    bodyKey: "scrollStory.step4.body",
    cardKey: "scrollStory.card4",
    detailKey: "scrollStory.detail4",
    valueKey: "scrollStory.value4"
  }
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

const FEATURE_DEEP_DIVES: FeatureDeepDive[] = [
  {
    titleKey: "featuresDeep.orders.title",
    bodyKey: "featuresDeep.orders.body",
    bulletKeys: ["featuresDeep.orders.bullet1", "featuresDeep.orders.bullet2", "featuresDeep.orders.bullet3"]
  },
  {
    titleKey: "featuresDeep.files.title",
    bodyKey: "featuresDeep.files.body",
    bulletKeys: ["featuresDeep.files.bullet1", "featuresDeep.files.bullet2", "featuresDeep.files.bullet3"]
  },
  {
    titleKey: "featuresDeep.team.title",
    bodyKey: "featuresDeep.team.body",
    bulletKeys: ["featuresDeep.team.bullet1", "featuresDeep.team.bullet2", "featuresDeep.team.bullet3"]
  }
];

const FEATURE_CAPABILITIES: FeatureCapability[] = [
  { titleKey: "capability.offline.title", bodyKey: "capability.offline.body" },
  { titleKey: "capability.customization.title", bodyKey: "capability.customization.body" },
  { titleKey: "capability.finance.title", bodyKey: "capability.finance.body" },
  { titleKey: "capability.messages.title", bodyKey: "capability.messages.body" },
  { titleKey: "capability.chatgpt.title", bodyKey: "capability.chatgpt.body" },
  { titleKey: "capability.notes.title", bodyKey: "capability.notes.body" },
  { titleKey: "capability.export.title", bodyKey: "capability.export.body" }
];

const PLAN_FEATURE_BRIDGE: PlanFeatureBridge[] = [
  {
    titleKey: "planBridge.orderRecords.title",
    bodyKey: "planBridge.orderRecords.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.customerRecords.title",
    bodyKey: "planBridge.customerRecords.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.personalNotes.title",
    bodyKey: "planBridge.personalNotes.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.chatgptApp.title",
    bodyKey: "planBridge.chatgptApp.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.basicFinance.title",
    bodyKey: "planBridge.basicFinance.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.export.title",
    bodyKey: "planBridge.export.body",
    planKeys: ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.cardCustomization.title",
    bodyKey: "planBridge.cardCustomization.body",
    planKeys: ["lifetime_lite", "pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.advancedFinance.title",
    bodyKey: "planBridge.advancedFinance.body",
    planKeys: ["pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.workspaceBranding.title",
    bodyKey: "planBridge.workspaceBranding.body",
    planKeys: ["pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.clientFiles.title",
    bodyKey: "planBridge.clientFiles.body",
    planKeys: ["pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.messages.title",
    bodyKey: "planBridge.messages.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.quickReplies.title",
    bodyKey: "planBridge.quickReplies.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.storageAddons.title",
    bodyKey: "planBridge.storageAddons.body",
    planKeys: ["pro_monthly", "team_monthly"]
  },
  {
    titleKey: "planBridge.teamAccess.title",
    bodyKey: "planBridge.teamAccess.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.teamSeats.title",
    bodyKey: "planBridge.teamSeats.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.additionalSeats.title",
    bodyKey: "planBridge.additionalSeats.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.largeTeams.title",
    bodyKey: "planBridge.largeTeams.body",
    planKeys: ["team_monthly"]
  },
  {
    titleKey: "planBridge.todoAssignment.title",
    bodyKey: "planBridge.todoAssignment.body",
    planKeys: ["team_monthly"]
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
    modelKey: "plan.model.monthly",
    noteKey: "plan.lite.note",
    ctaKey: "cta.billingSoon",
    disabled: true,
    bulletKeys: ["plan.lite.bullet1", "plan.lite.bullet2", "plan.lite.bullet3"]
  },
  pro_monthly: {
    shortNameKey: "plan.pro.shortName",
    publicNameKey: "plan.pro.publicName",
    priceLabelKey: "plan.pro.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.pro.note",
    ctaKey: "cta.billingSoon",
    disabled: true,
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
    ctaKey: "cta.billingSoon",
    disabled: true,
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

function usePublicScrollReveal(routeKey: string) {
  useEffect(() => {
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(
      ".public-scroll-reveal, .public-scroll-stagger > *"
    ));

    if (!revealTargets.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    revealTargets.forEach((target, index) => {
      target.style.setProperty("--reveal-index", String(index % 8));
      if (prefersReducedMotion) target.classList.add("is-visible");
    });

    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "-8% 0px -12% 0px", threshold: 0.16 });

    revealTargets.forEach(target => observer.observe(target));

    return () => observer.disconnect();
  }, [routeKey]);
}

function useOrderCardAssembly() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-order-assemble-card]"));
    if (!cards.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origins = [
      [-72, 0, -2],
      [0, -54, 1.5],
      [72, 0, 2],
      [-64, 0, 1],
      [64, 0, -1],
      [-56, 0, -1.5],
      [0, 54, 1],
      [56, 0, 1.5],
      [-70, 0, 2],
      [70, 0, -2],
      [-52, 0, 1],
      [52, 0, -1],
      [-62, 0, -1.5],
      [62, 0, 1.5],
      [0, 58, 0]
    ];

    let frame = 0;

    const applyProgress = () => {
      frame = 0;

      if (prefersReducedMotion || window.innerWidth <= 700) {
        root.dataset.assembled = "true";
        cards.forEach(card => {
          card.style.opacity = "1";
          card.style.transform = "";
        });
        return;
      }

      const section = root.closest<HTMLElement>(".public-order-flow-section") ?? root;
      const sectionRect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const stickyOffset = Math.min(112, viewportHeight * 0.14);
      const scrollableDistance = Math.max(1, sectionRect.height - viewportHeight);
      const rawProgress = (stickyOffset - sectionRect.top) / scrollableDistance;
      const progress = Math.min(1, Math.max(0, rawProgress));
      const settle = progress >= 0.995;

      root.style.setProperty("--order-assemble-progress", progress.toFixed(3));
      root.dataset.assembled = settle ? "true" : "false";

      cards.forEach((card, index) => {
        const [x, y, rotation] = origins[index % origins.length];
        const sequenceStart = index * 0.046;
        const sequenceDuration = 0.34;
        const localProgress = Math.min(1, Math.max(0, (progress - sequenceStart) / sequenceDuration));
        const eased = localProgress * localProgress * (3 - 2 * localProgress);
        const distance = 1 - eased;
        const scale = 0.88 + eased * 0.12;
        const opacity = localProgress <= 0.001 ? 0 : Math.min(1, eased * 1.08);
        card.style.opacity = opacity.toFixed(3);
        card.style.transform = localProgress >= 0.995
          ? ""
          : `translate3d(${Math.round(x * distance)}px, ${Math.round(y * distance)}px, 0) rotate(${(rotation * distance).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      });
    };

    const requestApply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(applyProgress);
    };

    requestApply();
    window.addEventListener("scroll", requestApply, { passive: true });
    window.addEventListener("resize", requestApply);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestApply);
      window.removeEventListener("resize", requestApply);
    };
  }, []);

  return rootRef;
}

function PublicLanguageSelector() {
  const { language, languages, setLanguage, t } = usePublicSiteLanguage();
  const handleLanguageChange = (value: string) => {
    setLanguage(value as StudioLanguage);
  };

  return (
    <label className="public-language-select">
      <span>{t("language.label")}</span>
      <select
        aria-label={t("language.selectorLabel")}
        value={language}
        onChange={event => handleLanguageChange(event.target.value)}
        onInput={event => handleLanguageChange(event.currentTarget.value)}
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
          <img className="public-brand-logo" src="/brand/nivadesk-logo.png" alt="" />
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
        <div className="public-footer-brand-block">
          <img className="public-footer-logo" src="/brand/nivadesk-logo.png" alt={t("brand.full")} />
          <p>{t("brand.footerDescription")}</p>
          <div className="public-footer-contact">
            <span>{t("footer.company")}</span>
            <a href="mailto:contact@nivadesk.co.uk">contact@nivadesk.co.uk</a>
          </div>
        </div>
        <div className="public-footer-groups" aria-label={t("nav.footer")}>
          <section className="public-footer-group">
            <h3>{t("footer.product")}</h3>
            <nav aria-label={t("footer.product")}>
              <Link href="/features">{t("nav.features")}</Link>
              <Link href="/pricing">{t("nav.pricing")}</Link>
              <Link href="/faq">{t("nav.faq")}</Link>
            </nav>
          </section>
          <section className="public-footer-group">
            <h3>{t("footer.legal")}</h3>
            <nav aria-label={t("footer.legal")}>
              <Link href="/privacy">{t("nav.privacy")}</Link>
              <Link href="/terms">{t("nav.terms")}</Link>
              <Link href="/cookies">{t("nav.cookies")}</Link>
              <Link href="/acceptable-use">{t("nav.acceptableUse")}</Link>
              <Link href="/data-processing-agreement">{t("nav.dataProcessingAgreement")}</Link>
              <Link href="/subprocessors">{t("nav.subprocessors")}</Link>
              <Link href="/security">{t("nav.security")}</Link>
            </nav>
          </section>
          <section className="public-footer-group">
            <h3>{t("footer.support")}</h3>
            <nav aria-label={t("footer.support")}>
              <Link href="/contact">{t("nav.contact")}</Link>
              <Link href="/account-deletion">{t("nav.accountDeletion")}</Link>
              <Link href="/refund-cancellation">{t("nav.refundCancellation")}</Link>
            </nav>
          </section>
        </div>
        <div className="public-footer-meta">
          <span>{t("footer.address")}</span>
          <span>{t("footer.rights")}</span>
        </div>
      </div>
    </footer>
  );
}

function PublicShellContent({ children }: { children: ReactNode }) {
  const { dir } = usePublicSiteLanguage();
  const pathname = usePathname();
  usePublicScrollReveal(pathname);

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

function OrderCardTitleGrid() {
  const { t } = usePublicSiteLanguage();
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const assembleRef = useOrderCardAssembly();
  const selectedCard = ORDER_CARDS[selectedCardIndex] ?? ORDER_CARDS[0];

  return (
    <div className="public-order-card-system" ref={assembleRef}>
      <div className="public-order-card-grid" aria-label={t("orderCards.aria")}>
        {ORDER_CARDS.map((card, index) => {
          const isSelected = selectedCardIndex === index;
          return (
            <div className="public-order-card-slot" key={card.titleKey}>
              <article
                className="public-order-card-chip"
                data-active={isSelected ? "true" : "false"}
                data-order-assemble-card="true"
                data-tone={ORDER_CARD_TONES[index % ORDER_CARD_TONES.length]}
              >
                <button
                  aria-controls="public-order-card-detail-panel"
                  aria-pressed={isSelected}
                  className="public-order-card-toggle"
                  onClick={() => setSelectedCardIndex(index)}
                  type="button"
                >
                  <span className="public-order-card-icon" aria-hidden="true">
                    <CardIconGlyph icon={card.icon} />
                  </span>
                  <h3>{t(card.titleKey)}</h3>
                </button>
              </article>
            </div>
          );
        })}
      </div>
      <aside className="public-order-card-panel" id="public-order-card-detail-panel">
        <span className="public-order-card-panel-index" aria-hidden="true">
          <CardIconGlyph icon={selectedCard.icon} />
        </span>
        <div>
          <h3>{t(selectedCard.titleKey)}</h3>
          <p>{t(selectedCard.detailKey)}</p>
        </div>
      </aside>
    </div>
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
          <dd>{plan.features.client_files ? storageLimitLabel(plan) : t("plan.limit.notIncluded")}</dd>
        </div>
        <div>
          <dt>{t("plan.limit.team")}</dt>
          <dd>{plan.plan === "team_monthly" ? t("plan.limit.teamIncluded") : plan.teamMemberLimit}</dd>
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
    <section className="public-section public-accent-band public-scroll-reveal">
      <div className="public-shell public-accent-grid">
        <div>
          <span className="public-eyebrow">{t("accent.eyebrow")}</span>
          <h2>{t("accent.title")}</h2>
          <p>{t("accent.body")}</p>
        </div>
        <div className="public-custom-card-row public-scroll-stagger" aria-hidden="true">
          {ACCENT_CARD_KEYS.map((cardKey, index) => (
            <span key={cardKey} data-index={index}>{t(cardKey)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScrollStoryShowcase() {
  const { t } = usePublicSiteLanguage();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-public-story-step]"));
    if (!steps.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setActiveStep(0);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      const visibleEntry = entries
        .filter(entry => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

      if (!visibleEntry) return;

      const nextIndex = Number((visibleEntry.target as HTMLElement).dataset.storyIndex ?? 0);
      if (!Number.isNaN(nextIndex)) setActiveStep(nextIndex);
    }, { rootMargin: "-30% 0px -36% 0px", threshold: [0.24, 0.42, 0.6, 0.78] });

    steps.forEach(step => observer.observe(step));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="public-scroll-story public-scroll-reveal">
      <div className="public-shell public-scroll-story-grid">
        <div className="public-scroll-stage" data-active-step={activeStep}>
          <div className="public-scroll-stage-window">
            <div className="public-story-record-head">
              <div>
                <span className="public-scroll-stage-label">{t("scrollStory.stageLabel")}</span>
                <strong>{t("scrollStory.orderTitle")}</strong>
                <small>{t("scrollStory.orderClient")}</small>
              </div>
              <span className="public-story-status">{t("scrollStory.orderStatus")}</span>
            </div>

            <div className="public-story-progress" aria-hidden="true">
              <span style={{ width: `${((activeStep + 1) / SCROLL_STORY_STEPS.length) * 100}%` }} />
            </div>

            <div className="public-scroll-stage-cards">
              {SCROLL_STORY_STEPS.map((step, index) => (
                <article data-active={activeStep === index ? "true" : "false"} key={step.cardKey}>
                  <div className="public-story-card-title">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{t(step.cardKey)}</strong>
                  </div>
                  <p>{t(step.detailKey)}</p>
                  <b>{t(step.valueKey)}</b>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="public-scroll-steps">
          {SCROLL_STORY_STEPS.map((step, index) => (
            <article
              className={activeStep === index ? "public-story-step is-active" : "public-story-step"}
              data-public-story-step
              data-story-index={index}
              key={step.titleKey}
            >
              <span className="public-eyebrow">{t(step.eyebrowKey)}</span>
              <h2>{t(step.titleKey)}</h2>
              <p>{t(step.bodyKey)}</p>
            </article>
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

function FeatureDeepDiveSection() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-features-deep-section public-scroll-reveal">
      <div className="public-shell public-features-deep-panel">
        <div className="public-features-deep-copy">
          <span className="public-eyebrow">{t("featuresDeep.eyebrow")}</span>
          <h2>{t("featuresDeep.title")}</h2>
          <p>{t("featuresDeep.body")}</p>
          <div className="public-features-kpi-row" aria-hidden="true">
            <span>{t("featuresDeep.kpi1")}</span>
            <span>{t("featuresDeep.kpi2")}</span>
            <span>{t("featuresDeep.kpi3")}</span>
          </div>
        </div>
        <div className="public-features-deep-list">
          {FEATURE_DEEP_DIVES.map((item, index) => (
            <article key={item.titleKey}>
              <div className="public-card-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.bodyKey)}</p>
                <ul>
                  {item.bulletKeys.map(bulletKey => <li key={bulletKey}>{t(bulletKey)}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCapabilityMatrix() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-feature-capability-section">
      <div className="public-shell">
        <SectionHeader
          eyebrowKey="capability.eyebrow"
          titleKey="capability.title"
          bodyKey="capability.body"
        />
        <div className="public-capability-grid public-scroll-stagger">
          {FEATURE_CAPABILITIES.map((item, index) => (
            <article className="public-capability-card" key={item.titleKey}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(item.titleKey)}</h3>
              <p>{t(item.bodyKey)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanFeatureBridgeSection({ compact = false }: { compact?: boolean }) {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-plan-feature-bridge-section public-scroll-reveal">
      <div className="public-shell public-plan-feature-bridge-panel">
        <div className="public-plan-feature-bridge-copy">
          <span className="public-eyebrow">{t("planBridge.eyebrow")}</span>
          <h2>{t("planBridge.title")}</h2>
          <p>{t("planBridge.body")}</p>
        </div>
        <div className={compact ? "public-plan-matrix-wrap compact" : "public-plan-matrix-wrap"}>
          <div className="public-plan-matrix" role="table" aria-label={t("planBridge.matrixAria")}>
            <div className="public-plan-matrix-head" role="row">
              <div className="public-plan-matrix-feature-head" role="columnheader">
                <span>{t("planBridge.featureColumn")}</span>
              </div>
              {PLAN_ORDER.map(planKey => {
                const copy = PUBLIC_PLAN_COPY[planKey];
                return (
                  <div className="public-plan-matrix-plan-head" role="columnheader" key={planKey}>
                    <strong>{t(copy.shortNameKey)}</strong>
                    <small>{t(copy.priceLabelKey)}</small>
                  </div>
                );
              })}
            </div>
            {PLAN_FEATURE_BRIDGE.map(item => (
              <div className="public-plan-matrix-row" role="row" key={item.titleKey}>
                <div className="public-plan-matrix-feature" role="cell">
                  <strong>{t(item.titleKey)}</strong>
                  <span>{t(item.bodyKey)}</span>
                </div>
                {PLAN_ORDER.map(planKey => {
                  const included = item.planKeys.includes(planKey);
                  const copy = PUBLIC_PLAN_COPY[planKey];
                  return (
                    <div
                      className={included ? "public-plan-matrix-cell included" : "public-plan-matrix-cell"}
                      role="cell"
                      key={planKey}
                      aria-label={`${t(copy.shortNameKey)}: ${included ? t("planBridge.included") : t("planBridge.notIncluded")}`}
                    >
                      {included ? <span aria-hidden="true">✓</span> : <span aria-hidden="true">–</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatGPTAppShowcase() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-chatgpt-app-section public-scroll-reveal">
      <div className="public-shell public-chatgpt-app-panel">
        <div className="public-chatgpt-app-copy">
          <span className="public-eyebrow">{t("chatgptApp.eyebrow")}</span>
          <h2>{t("chatgptApp.title")}</h2>
          <p>{t("chatgptApp.body")}</p>
          <div className="public-chatgpt-app-actions" aria-label={t("chatgptApp.useCasesAria")}>
            <span>{t("chatgptApp.useCase1")}</span>
            <span>{t("chatgptApp.useCase2")}</span>
            <span>{t("chatgptApp.useCase3")}</span>
          </div>
        </div>
        <div className="public-chatgpt-app-demo" aria-label={t("chatgptApp.demoAria")}>
          <div className="public-chatgpt-window-bar">
            <span />
            <strong>{t("chatgptApp.windowTitle")}</strong>
          </div>
          <div className="public-chatgpt-message user">
            <span>{t("chatgptApp.promptLabel")}</span>
            <p>{t("chatgptApp.prompt")}</p>
          </div>
          <div className="public-chatgpt-result-card">
            <div>
              <span>{t("chatgptApp.resultMetric1Label")}</span>
              <strong>{t("chatgptApp.resultMetric1Value")}</strong>
            </div>
            <div>
              <span>{t("chatgptApp.resultMetric2Label")}</span>
              <strong>{t("chatgptApp.resultMetric2Value")}</strong>
            </div>
            <div>
              <span>{t("chatgptApp.resultMetric3Label")}</span>
              <strong>{t("chatgptApp.resultMetric3Value")}</strong>
            </div>
          </div>
          <div className="public-chatgpt-message assistant">
            <span>{t("chatgptApp.answerLabel")}</span>
            <p>{t("chatgptApp.answer")}</p>
          </div>
          <div className="public-chatgpt-safe-row">
            <span>{t("chatgptApp.safeBadge1")}</span>
            <span>{t("chatgptApp.safeBadge2")}</span>
            <span>{t("chatgptApp.safeBadge3")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformLogo({ kind }: { kind: PlatformKind }) {
  if (kind === "apple") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M16.4 1.2c.1 1.2-.4 2.3-1.2 3.1-.8.8-2 1.4-3.1 1.3-.1-1.1.4-2.2 1.2-3 .8-.8 2.1-1.4 3.1-1.4ZM21 17.4c-.6 1.4-.9 2-1.7 3.1-1.1 1.6-2.5 3.3-4.2 3.3-1.5 0-2-1-4-1s-2.5 1-4 1c-1.7 0-3-1.6-4.1-3.2C.2 16.5-.1 11.2 1.8 8.4c1.4-2 3.5-3.2 5.6-3.2 2 0 3.3 1.1 5 1.1 1.6 0 2.7-1.1 5-1.1 1.8 0 3.7 1 5 2.7-4.4 2.4-3.7 8.6.6 9.5Z" />
      </svg>
    );
  }

  if (kind === "android") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M7.1 7.4 5.7 4.9a.7.7 0 0 1 1.2-.7l1.5 2.6a8.4 8.4 0 0 1 7.2 0l1.5-2.6a.7.7 0 0 1 1.2.7l-1.4 2.5A7.7 7.7 0 0 1 20.5 14H3.5a7.7 7.7 0 0 1 3.6-6.6ZM8.1 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7.8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4.5 15.4h15v5.1c0 1.2-.9 2.1-2.1 2.1H6.6c-1.2 0-2.1-.9-2.1-2.1v-5.1Z" />
      </svg>
    );
  }

  if (kind === "windows") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M3 4.4 10.9 3v8.4H3V4.4Zm9.5-1.6L21 1.4v10h-8.5V2.8ZM3 12.8h7.9v8.4L3 19.8v-7Zm9.5 0H21v9.8l-8.5-1.4v-8.4Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.8 6h-3a14.1 14.1 0 0 0-1.3-3.1A8.1 8.1 0 0 1 18.8 8ZM12 4.1c.6.8 1.2 2.1 1.6 3.9h-3.2c.4-1.8 1-3.1 1.6-3.9ZM4.3 14a7.7 7.7 0 0 1 0-4h3.4a18 18 0 0 0 0 4H4.3Zm.9 2h3a14.1 14.1 0 0 0 1.3 3.1A8.1 8.1 0 0 1 5.2 16Zm3-8h-3a8.1 8.1 0 0 1 4.3-3.1A14.1 14.1 0 0 0 8.2 8Zm3.8 11.9c-.6-.8-1.2-2.1-1.6-3.9h3.2c-.4 1.8-1 3.1-1.6 3.9Zm2-5.9h-4a15.8 15.8 0 0 1 0-4h4a15.8 15.8 0 0 1 0 4Zm.5 5.1a14.1 14.1 0 0 0 1.3-3.1h3a8.1 8.1 0 0 1-4.3 3.1ZM16.3 14a18 18 0 0 0 0-4h3.4a7.7 7.7 0 0 1 0 4h-3.4Z" />
    </svg>
  );
}

function PlatformNote() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-section-soft public-scroll-reveal">
      <div className="public-shell public-platform-panel">
        <div>
          <span className="public-eyebrow">{t("platform.eyebrow")}</span>
          <h2>{t("platform.title")}</h2>
        </div>
        <div className="public-platform-grid public-scroll-stagger" aria-label={t("platform.gridAria")}>
          {PLATFORM_CARDS.map(platform => (
            <article className="public-platform-card" data-platform={platform.kind} key={platform.kind}>
              <span className="public-platform-logo">
                <PlatformLogo kind={platform.kind} />
              </span>
              <div>
                <span>{t(platform.statusKey)}</span>
                <h3>{t(platform.nameKey)}</h3>
                <p>{t(platform.detailKey)}</p>
              </div>
            </article>
          ))}
        </div>
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
            <div className="public-hero-copy public-scroll-reveal">
              <span className="public-eyebrow">{t("hero.eyebrow")}</span>
              <h1>{t("hero.title")}</h1>
              <p>{t("hero.body")}</p>
              <HeroActions />
            </div>
          </div>
        </section>

        <PlatformNote />

        <StudioAccentBand />

        <ScrollStoryShowcase />

        <section className="public-section public-order-flow-section">
          <div className="public-order-flow-sticky">
            <div className="public-shell">
              <SectionHeader
                eyebrowKey="section.flow.eyebrow"
                titleKey="section.flow.title"
                bodyKey="section.flow.body"
              />
              <OrderCardTitleGrid />
            </div>
          </div>
        </section>

        <ChatGPTAppShowcase />

        <section className="public-section public-scroll-reveal">
          <div className="public-shell">
            <SectionHeader
              eyebrowKey="pricingPreview.eyebrow"
              titleKey="pricingPreview.title"
              bodyKey="pricingPreview.body"
            />
            <PublicPlanGrid compact />
          </div>
        </section>

        <section className="public-section public-cta-band public-scroll-reveal">
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

        <FeatureDeepDiveSection />

        <section className="public-section public-order-flow-section">
          <div className="public-order-flow-sticky">
            <div className="public-shell">
              <SectionHeader
                eyebrowKey="section.flow.eyebrow"
                titleKey="section.flow.title"
                bodyKey="section.flow.body"
              />
              <OrderCardTitleGrid />
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell">
            <div className="public-feature-grid">
              {FEATURE_HIGHLIGHTS.map((feature, index) => (
                <FeatureCard key={feature.titleKey} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

        <FeatureCapabilityMatrix />

        <ChatGPTAppShowcase />

        <PlanFeatureBridgeSection />

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

        <PlanFeatureBridgeSection compact />

        <ChatGPTAppShowcase />

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

type FreeDemoWorkspaceResult = {
  ok?: boolean;
  companyId?: string;
  message?: string;
};

function signupErrorMessage(error: unknown, t: (key: PublicSiteTranslationKey) => string) {
  const raw = error instanceof Error ? error.message : "";
  if (/email-already-in-use/i.test(raw)) return t("signup.error.emailExists");
  if (/weak-password/i.test(raw)) return t("signup.error.weakPassword");
  if (/invalid-email/i.test(raw)) return t("signup.error.invalidEmail");
  if (/network|offline/i.test(raw)) return t("signup.error.network");
  return raw || t("signup.error.generic");
}

export function PublicSignupPage() {
  const Page = () => {
    const router = useRouter();
    const { user } = useAuth();
    const { t } = usePublicSiteLanguage();
    const [signupStarted, setSignupStarted] = useState(false);
    const [fullName, setFullName] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setError(null);
      const cleanFullName = fullName.trim();
      const cleanWorkspaceName = workspaceName.trim();
      const cleanEmail = email.trim();

      if (cleanFullName.length < 2 || cleanWorkspaceName.length < 2) {
        setError(t("signup.error.required"));
        return;
      }
      if (!auth.currentUser && password.length < 8) {
        setError(t("signup.error.passwordLength"));
        return;
      }
      if (!auth.currentUser && password !== confirmPassword) {
        setError(t("signup.error.passwordMismatch"));
        return;
      }
      if (!accepted) {
        setError(t("signup.error.terms"));
        return;
      }

      setSignupStarted(true);
      setSubmitting(true);
      try {
        let currentUser = auth.currentUser;
        if (!currentUser) {
          const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          currentUser = credential.user;
        }
        if (currentUser.displayName !== cleanFullName) {
          await updateProfile(currentUser, { displayName: cleanFullName });
        }

        const initialiseWorkspace = httpsCallable<Record<string, string>, FreeDemoWorkspaceResult>(
          functions,
          "initializeFreeDemoWorkspace"
        );
        await initialiseWorkspace({
          fullName: cleanFullName,
          workspaceName: cleanWorkspaceName
        });
        router.replace("/dashboard");
      } catch (signupError) {
        setError(signupErrorMessage(signupError, t));
      } finally {
        setSubmitting(false);
      }
    }

    if (user && !signupStarted) {
      return (
        <section className="public-page-hero public-signup-hero">
          <div className="public-shell public-signup-complete">
            <span className="public-eyebrow">{t("signup.signedIn.eyebrow")}</span>
            <h1>{t("signup.signedIn.title")}</h1>
            <p>{t("signup.signedIn.body")}</p>
            <div className="public-hero-actions">
              <Link href="/dashboard" className="public-button large">{t("cta.openPortal")}</Link>
              <Link href="/pricing" className="public-button ghost large">{t("cta.viewPricing")}</Link>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="public-page-hero public-signup-hero">
        <div className="public-shell public-signup-layout public-signup-form-layout">
          <div className="public-signup-copy">
            <span className="public-eyebrow">{t("signup.eyebrow")}</span>
            <h1>{t("signup.title")}</h1>
            <p>{t("signup.body")}</p>
            <div className="public-signup-includes">
              <h2>{t("signup.includes.title")}</h2>
              <ul>
                <li>{t("signup.includes.bullet1")}</li>
                <li>{t("signup.includes.bullet2")}</li>
                <li>{t("signup.includes.bullet3")}</li>
              </ul>
            </div>
          </div>

          <form className="public-card public-signup-form" onSubmit={handleCreateWorkspace}>
            <span className="public-eyebrow">{t("signup.form.eyebrow")}</span>
            <h2>{t("signup.form.title")}</h2>
            <p>{t("signup.form.body")}</p>
            <label>
              <span>{t("signup.form.fullName")}</span>
              <input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} required disabled={submitting} />
            </label>
            <label>
              <span>{t("signup.form.workspaceName")}</span>
              <input autoComplete="organization" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} required disabled={submitting} />
            </label>
            <label>
              <span>{t("signup.form.email")}</span>
              <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={submitting || Boolean(auth.currentUser)} />
            </label>
            <div className="public-signup-form-split">
              <label>
                <span>{t("signup.form.password")}</span>
                <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required={!auth.currentUser} disabled={submitting || Boolean(auth.currentUser)} />
              </label>
              <label>
                <span>{t("signup.form.confirmPassword")}</span>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required={!auth.currentUser} disabled={submitting || Boolean(auth.currentUser)} />
              </label>
            </div>
            <label className="public-signup-consent">
              <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={submitting} required />
              <span>
                {t("signup.form.agreePrefix")} <Link href="/terms">{t("nav.terms")}</Link> {t("signup.form.agreeAnd")} <Link href="/privacy">{t("nav.privacy")}</Link>.
              </span>
            </label>
            {error ? <p className="public-signup-error" role="alert">{error}</p> : null}
            <button className="public-button large public-signup-submit" type="submit" disabled={submitting}>
              {submitting ? t("signup.form.creating") : t("signup.form.submit")}
            </button>
            <p className="public-signup-login">
              {t("signup.form.haveAccount")} <Link href="/login">{t("cta.login")}</Link>
            </p>
          </form>
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

function PublicLegalParagraph({ text }: { text: string }) {
  return <p className={text.includes("\n") ? "public-legal-preline" : undefined}>{text}</p>;
}

function PublicLegalSubsection({ subsection }: { subsection: PrivacyPolicySubsection }) {
  return (
    <div className="public-legal-subsection">
      {subsection.title ? <h3>{subsection.title}</h3> : null}
      {subsection.paragraphs?.map(paragraph => (
        <PublicLegalParagraph key={paragraph} text={paragraph} />
      ))}
      {subsection.bullets ? (
        <ul>
          {subsection.bullets.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function PublicLegalLanguageNotice({ language }: { language: StudioLanguage }) {
  if (language === "English") return null;

  return (
    <article className="public-card public-legal-card">
      <h2>Legal document language</h2>
      <p>
        The current authoritative version of this legal document is provided in English.
        The public site navigation may be displayed in your selected language, but the legal
        terms below remain in English until reviewed translations are available.
      </p>
    </article>
  );
}

function PublicLegalSection({ section }: { section: PrivacyPolicySection }) {
  return (
    <article className="public-card public-legal-card">
      <h2>{section.title}</h2>
      {section.paragraphs?.map(paragraph => (
        <PublicLegalParagraph key={paragraph} text={paragraph} />
      ))}
      {section.bullets ? (
        <ul>
          {section.bullets.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {section.subsections?.map((subsection, index) => (
        <PublicLegalSubsection
          key={`${section.title}-${subsection.title || index}`}
          subsection={subsection}
        />
      ))}
    </article>
  );
}

export function PublicPrivacyPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const privacyPolicySections = getPrivacyPolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("privacy.eyebrow")}</span>
            <h1>{t("privacy.title")}</h1>
            <p>{t("privacy.body")}</p>
            <p className="public-legal-updated">
              {getPrivacyPolicyLastUpdatedLabel(language)}: {PRIVACY_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            <PublicLegalLanguageNotice language={language} />
            {privacyPolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicTermsPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const termsPolicySections = getTermsPolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("terms.eyebrow")}</span>
            <h1>{t("terms.title")}</h1>
            <p>{t("terms.body")}</p>
            <p className="public-legal-updated">
              {getTermsPolicyLastUpdatedLabel(language)}: {TERMS_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            <PublicLegalLanguageNotice language={language} />
            {termsPolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicCookiePage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const cookiePolicySections = getCookiePolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("cookies.eyebrow")}</span>
            <h1>{t("cookies.title")}</h1>
            <p>{t("cookies.body")}</p>
            <p className="public-legal-updated">
              {getCookiePolicyLastUpdatedLabel(language)}: {COOKIE_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {cookiePolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicAccountDeletionPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const accountDeletionPolicySections = getAccountDeletionPolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("accountDeletion.eyebrow")}</span>
            <h1>{t("accountDeletion.title")}</h1>
            <p>{t("accountDeletion.body")}</p>
            <p className="public-legal-updated">
              {getAccountDeletionPolicyLastUpdatedLabel(language)}: {ACCOUNT_DELETION_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {accountDeletionPolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicRefundCancellationPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const refundCancellationPolicySections = getRefundCancellationPolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("refundCancellation.eyebrow")}</span>
            <h1>{t("refundCancellation.title")}</h1>
            <p>{t("refundCancellation.body")}</p>
            <p className="public-legal-updated">
              {getRefundCancellationPolicyLastUpdatedLabel(language)}: {REFUND_CANCELLATION_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            <PublicLegalLanguageNotice language={language} />
            {refundCancellationPolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicSecurityPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const securityOverviewSections = getSecurityOverviewSections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("security.eyebrow")}</span>
            <h1>{t("security.title")}</h1>
            <p>{t("security.body")}</p>
            <p className="public-legal-updated">
              {getSecurityOverviewLastUpdatedLabel(language)}: {SECURITY_OVERVIEW_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {securityOverviewSections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicSubprocessorsPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const subprocessorsSections = getSubprocessorsSections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("subprocessors.eyebrow")}</span>
            <h1>{t("subprocessors.title")}</h1>
            <p>{t("subprocessors.body")}</p>
            <p className="public-legal-updated">
              {getSubprocessorsLastUpdatedLabel(language)}: {SUBPROCESSORS_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {subprocessorsSections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicDataProcessingAgreementPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const dataProcessingAgreementSections = getDataProcessingAgreementSections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("dataProcessingAgreement.eyebrow")}</span>
            <h1>{t("dataProcessingAgreement.title")}</h1>
            <p>{t("dataProcessingAgreement.body")}</p>
            <p className="public-legal-updated">
              {getDataProcessingAgreementLastUpdatedLabel(language)}: {DATA_PROCESSING_AGREEMENT_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {dataProcessingAgreementSections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicAcceptableUsePage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const acceptableUsePolicySections = getAcceptableUsePolicySections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("acceptableUse.eyebrow")}</span>
            <h1>{t("acceptableUse.title")}</h1>
            <p>{t("acceptableUse.body")}</p>
            <p className="public-legal-updated">
              {getAcceptableUsePolicyLastUpdatedLabel(language)}: {ACCEPTABLE_USE_POLICY_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {acceptableUsePolicySections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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

export function PublicContactPage() {
  const Page = () => {
    const { language, t } = usePublicSiteLanguage();
    const supportContactSections = getSupportContactSections(language);
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{t("contact.eyebrow")}</span>
            <h1>{t("contact.title")}</h1>
            <p>{t("contact.body")}</p>
            <p className="public-legal-updated">
              {getSupportContactLastUpdatedLabel(language)}: {SUPPORT_CONTACT_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell public-legal-document">
            {supportContactSections.map(section => (
              <PublicLegalSection key={section.title} section={section} />
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
