"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { openCookiePreferences } from "@/lib/cookieConsent";
import { usePathname, useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SiteVisitBeacon } from "@/components/SiteVisitBeacon";
import { clearLandingAttribution, getLandingAttribution, trackLandingEvent } from "@/lib/landingTracking";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { fireGoogleAdsSignupConversion } from "@/lib/googleAds";
import { AuthProviderButtons } from "@/components/AuthProviders";
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
  CHANGELOG,
  CHANGELOG_LAST_UPDATED,
  getChangelogLabels,
  type ChangeTag
} from "@/lib/publicSite/changelog";
import {
  GUIDE_LAST_UPDATED,
  getGuideChrome,
  getGuideTree,
  type GuideNode
} from "@/lib/publicSite/guide";
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
  id: string;
  tone: string;
  navKey: PublicSiteTranslationKey;
  navIcon: ReactNode;
  icon: ReactNode;
  titleKey: PublicSiteTranslationKey;
  bodyKey: PublicSiteTranslationKey;
  bulletKeys: PublicSiteTranslationKey[];
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
    bulletKeys: ["feature.orders.bullet1", "feature.orders.bullet2", "feature.orders.bullet3", "feature.orders.bullet4"],
    tone: "sage",
    metricKey: "feature.orders.metric",
    artifactKey: "feature.orders.artifact"
  },
  {
    titleKey: "feature.files.title",
    eyebrowKey: "feature.files.eyebrow",
    bodyKey: "feature.files.body",
    bulletKeys: ["feature.files.bullet1", "feature.files.bullet2", "feature.files.bullet3", "feature.files.bullet4"],
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
    bulletKeys: ["feature.team.bullet1", "feature.team.bullet2", "feature.team.bullet3", "feature.team.bullet4"],
    tone: "lilac",
    metricKey: "feature.team.metric",
    artifactKey: "feature.team.artifact"
  },
  {
    titleKey: "feature.dashboard.title",
    eyebrowKey: "feature.dashboard.eyebrow",
    bodyKey: "feature.dashboard.body",
    bulletKeys: ["feature.dashboard.bullet1", "feature.dashboard.bullet2", "feature.dashboard.bullet3", "feature.dashboard.bullet4"],
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
  },
  {
    titleKey: "feature.woocommerce.title",
    eyebrowKey: "feature.woocommerce.eyebrow",
    bodyKey: "feature.woocommerce.body",
    bulletKeys: ["feature.woocommerce.bullet1", "feature.woocommerce.bullet2", "feature.woocommerce.bullet3"],
    tone: "gold",
    metricKey: "feature.woocommerce.metric",
    artifactKey: "feature.woocommerce.artifact"
  },
  {
    titleKey: "feature.tracking.title",
    eyebrowKey: "feature.tracking.eyebrow",
    bodyKey: "feature.tracking.body",
    bulletKeys: ["feature.tracking.bullet1", "feature.tracking.bullet2", "feature.tracking.bullet3"],
    tone: "sky",
    metricKey: "feature.tracking.metric",
    artifactKey: "feature.tracking.artifact"
  },
  {
    titleKey: "feature.notes.title",
    eyebrowKey: "feature.notes.eyebrow",
    bodyKey: "feature.notes.body",
    bulletKeys: ["feature.notes.bullet1", "feature.notes.bullet2", "feature.notes.bullet3"],
    tone: "gold",
    metricKey: "feature.notes.metric",
    artifactKey: "feature.notes.artifact"
  },
  {
    titleKey: "feature.worktime.title",
    eyebrowKey: "feature.worktime.eyebrow",
    bodyKey: "feature.worktime.body",
    bulletKeys: ["feature.worktime.bullet1", "feature.worktime.bullet2", "feature.worktime.bullet3"],
    tone: "rose",
    metricKey: "feature.worktime.metric",
    artifactKey: "feature.worktime.artifact"
  },
  {
    titleKey: "feature.materials.title",
    eyebrowKey: "feature.materials.eyebrow",
    bodyKey: "feature.materials.body",
    bulletKeys: ["feature.materials.bullet1", "feature.materials.bullet2", "feature.materials.bullet3"],
    tone: "clay",
    metricKey: "feature.materials.metric",
    artifactKey: "feature.materials.artifact"
  },
  {
    titleKey: "feature.history.title",
    eyebrowKey: "feature.history.eyebrow",
    bodyKey: "feature.history.body",
    bulletKeys: ["feature.history.bullet1", "feature.history.bullet2", "feature.history.bullet3"],
    tone: "graphite",
    metricKey: "feature.history.metric",
    artifactKey: "feature.history.artifact"
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
  { titleKey: "orderCard.invoiceItems", detailKey: "orderCard.invoiceItems.detail", icon: "docText" },
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
    id: "orders",
    tone: "green",
    navKey: "featuresDeep.nav.orders",
    navIcon: <path d="M4 6h16M4 12h16M4 18h10" />,
    icon: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4" /></>,
    titleKey: "featuresDeep.orders.title",
    bodyKey: "featuresDeep.orders.body",
    bulletKeys: ["featuresDeep.orders.bullet1", "featuresDeep.orders.bullet2", "featuresDeep.orders.bullet3"]
  },
  {
    id: "files",
    tone: "blue",
    navKey: "featuresDeep.nav.files",
    navIcon: <path d="M3 7l1.8-2.2h5l1.5 2H21v12H3z" />,
    icon: <path d="M3 7l1.8-2.2h5l1.5 2H21v12H3z" />,
    titleKey: "featuresDeep.files.title",
    bodyKey: "featuresDeep.files.body",
    bulletKeys: ["featuresDeep.files.bullet1", "featuresDeep.files.bullet2", "featuresDeep.files.bullet3"]
  },
  {
    id: "team",
    tone: "purple",
    navKey: "featuresDeep.nav.team",
    navIcon: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></>,
    icon: <path d="M8.5 11a3 3 0 100-6 3 3 0 000 6zM16 11a2.5 2.5 0 100-5M3.5 19c0-2.8 2.2-5 5-5s5 2.2 5 5M15 14.2c2.5 0 4.5 1.7 4.5 4.8" />,
    titleKey: "featuresDeep.team.title",
    bodyKey: "featuresDeep.team.body",
    bulletKeys: ["featuresDeep.team.bullet1", "featuresDeep.team.bullet2", "featuresDeep.team.bullet3"]
  },
  {
    id: "data",
    tone: "teal",
    navKey: "featuresDeep.nav.data",
    navIcon: <path d="M7 18a4 4 0 01-.5-7.97A5 5 0 0117 9.5a3.5 3.5 0 01.5 8.5H7zM12 11v6M9.5 14.5L12 17l2.5-2.5" />,
    icon: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></>,
    titleKey: "featuresDeep.data.title",
    bodyKey: "featuresDeep.data.body",
    bulletKeys: ["featuresDeep.data.bullet1", "featuresDeep.data.bullet2", "featuresDeep.data.bullet3"]
  }
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
    titleKey: "planBridge.storageAddons.title",
    bodyKey: "planBridge.storageAddons.body",
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
  limitNoteKey: PublicSiteTranslationKey;
  ctaKey: PublicSiteTranslationKey;
  icon: ReactNode;
  href?: string;
  disabled?: boolean;
  featured?: boolean;
  badgeKey?: PublicSiteTranslationKey;
  billingKey?: StripeBillingItemKey;
  bulletKeys: PublicSiteTranslationKey[];
};

const PLAN_ICON_GIFT = <path d="M4 8.5h12v8.5H4zM3.5 8.5h13V7A1.5 1.5 0 0015 5.5H5A1.5 1.5 0 003.5 7zM10 5.5v11.5M7.2 5.5A1.6 1.6 0 017 2.4c1.6 0 3 1.6 3 3.1M12.8 5.5A1.6 1.6 0 0013 2.4c-1.6 0-3 1.6-3 3.1" />;
const PLAN_ICON_LEAF = <path d="M5 15.5c0-6.5 5.5-9.5 11.5-9.5 0 6.5-4.3 10.5-9.5 10.5-1.2 0-2-.4-2-1zM6.5 14.5c2-3.2 4.2-5.2 7.5-6.4" />;
const PLAN_ICON_CHART = <path d="M4 16.5V9.5M9.5 16.5V5M15 16.5v-4.5M3 16.5h14" />;
const PLAN_ICON_TEAM = <path d="M7 9.4a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2zM13.4 9.2a2.1 2.1 0 100-4.2M3 16.5c0-2.3 1.8-4.1 4-4.1s4 1.8 4 4.1M12.4 12.4c2.1 0 3.8 1.4 3.8 4.1" />;

const PUBLIC_PLAN_COPY: Record<StudioBillingPlan, PublicPlanCopy> = {
  demo: {
    shortNameKey: "plan.demo.shortName",
    publicNameKey: "plan.demo.publicName",
    priceLabelKey: "plan.demo.price",
    modelKey: "plan.model.demo",
    noteKey: "plan.demo.note",
    limitNoteKey: "plan.demo.limitNote",
    ctaKey: "cta.startFree",
    icon: PLAN_ICON_GIFT,
    href: "/signup",
    bulletKeys: ["plan.demo.bullet1", "plan.demo.bullet2", "plan.demo.bullet3", "plan.demo.bullet4", "plan.demo.bullet5"]
  },
  lifetime_lite: {
    shortNameKey: "plan.lite.shortName",
    publicNameKey: "plan.lite.publicName",
    priceLabelKey: "plan.lite.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.lite.note",
    limitNoteKey: "plan.lite.limitNote",
    ctaKey: "cta.chooseLite",
    icon: PLAN_ICON_LEAF,
    href: "/signup",
    bulletKeys: ["plan.lite.bullet1", "plan.lite.bullet2", "plan.lite.bullet3", "plan.lite.bullet4", "plan.lite.bullet5"]
  },
  pro_monthly: {
    shortNameKey: "plan.pro.shortName",
    publicNameKey: "plan.pro.publicName",
    priceLabelKey: "plan.pro.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.pro.note",
    limitNoteKey: "plan.pro.limitNote",
    ctaKey: "cta.choosePro",
    icon: PLAN_ICON_CHART,
    href: "/signup",
    featured: true,
    badgeKey: "plan.pro.badge",
    bulletKeys: ["plan.pro.bullet1", "plan.pro.bullet2", "plan.pro.bullet3", "plan.pro.bullet4", "plan.pro.bullet5"]
  },
  team_monthly: {
    shortNameKey: "plan.team.shortName",
    publicNameKey: "plan.team.publicName",
    priceLabelKey: "plan.team.price",
    modelKey: "plan.model.monthly",
    noteKey: "plan.team.note",
    limitNoteKey: "plan.team.limitNote",
    ctaKey: "cta.chooseTeam",
    icon: PLAN_ICON_TEAM,
    href: "/signup",
    bulletKeys: ["plan.team.bullet1", "plan.team.bullet2", "plan.team.bullet3", "plan.team.bullet4", "plan.team.bullet5"]
  }
};

type FaqGroup = { categoryKey: PublicSiteTranslationKey; items: InfoSection[] };

const FAQ_GROUPS: FaqGroup[] = [
  {
    categoryKey: "faq.cat.plans",
    items: [
      { titleKey: "faq.q1.title", bodyKey: "faq.q1.body" },
      { titleKey: "faq.q2.title", bodyKey: "faq.q2.body" },
      { titleKey: "faq.q3.title", bodyKey: "faq.q3.body" },
      { titleKey: "faq.q4.title", bodyKey: "faq.q4.body" },
      { titleKey: "faq.q5.title", bodyKey: "faq.q5.body" },
      { titleKey: "faq.q6.title", bodyKey: "faq.q6.body" }
    ]
  },
  {
    categoryKey: "faq.cat.team",
    items: [
      { titleKey: "faq.q7.title", bodyKey: "faq.q7.body" },
      { titleKey: "faq.q8.title", bodyKey: "faq.q8.body" },
      { titleKey: "faq.q9.title", bodyKey: "faq.q9.body" }
    ]
  },
  {
    categoryKey: "faq.cat.storage",
    items: [
      { titleKey: "faq.q10.title", bodyKey: "faq.q10.body" },
      { titleKey: "faq.q11.title", bodyKey: "faq.q11.body" }
    ]
  },
  {
    categoryKey: "faq.cat.integrations",
    items: [
      { titleKey: "faq.q24.title", bodyKey: "faq.q24.body" }
    ]
  },
  {
    categoryKey: "faq.cat.gpt",
    items: [
      { titleKey: "faq.q12.title", bodyKey: "faq.q12.body" },
      { titleKey: "faq.q13.title", bodyKey: "faq.q13.body" }
    ]
  },
  {
    categoryKey: "faq.cat.platforms",
    items: [
      { titleKey: "faq.q14.title", bodyKey: "faq.q14.body" },
      { titleKey: "faq.q15.title", bodyKey: "faq.q15.body" },
      { titleKey: "faq.q16.title", bodyKey: "faq.q16.body" }
    ]
  },
  {
    categoryKey: "faq.cat.data",
    items: [
      { titleKey: "faq.q17.title", bodyKey: "faq.q17.body" },
      { titleKey: "faq.q18.title", bodyKey: "faq.q18.body" },
      { titleKey: "faq.q19.title", bodyKey: "faq.q19.body" },
      { titleKey: "faq.q20.title", bodyKey: "faq.q20.body" },
      { titleKey: "faq.q21.title", bodyKey: "faq.q21.body" },
      { titleKey: "faq.q22.title", bodyKey: "faq.q22.body" },
      { titleKey: "faq.q23.title", bodyKey: "faq.q23.body" }
    ]
  }
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

      if (prefersReducedMotion) {
        root.dataset.assembled = "true";
        cards.forEach(card => {
          card.style.opacity = "1";
          card.style.transform = "";
        });
        return;
      }

      // On narrow screens the cards reveal with a simple vertical rise + fade
      // (the desktop scatter/rotate would overflow a single-column phone layout).
      const narrow = window.innerWidth <= 760;
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
        if (localProgress >= 0.995) {
          card.style.transform = "";
        } else if (narrow) {
          card.style.transform = `translate3d(0, ${Math.round(distance * 26)}px, 0)`;
        } else {
          card.style.transform = `translate3d(${Math.round(x * distance)}px, ${Math.round(y * distance)}px, 0) rotate(${(rotation * distance).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        }
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

export function PublicHeader({ hideLanguage = false }: { hideLanguage?: boolean } = {}) {
  const { user } = useAuth();
  const { t } = usePublicSiteLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="public-header">
      <div className="public-shell public-header-inner">
        <Link href="/" className="public-brand" aria-label={t("brand.homeAria")}>
          <img className="public-brand-logo" src="/brand/nivadesk-logo.png" alt="" />
        </Link>

        <nav className="public-nav-links" aria-label={t("nav.publicPages")}>
          <Link href="/">{t("nav.home")}</Link>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
        </nav>

        <div className="public-header-actions">
          {hideLanguage ? null : <span className="public-header-lang-desktop"><PublicLanguageSelector /></span>}
          <Link href={user ? "/dashboard" : "/login"} className="public-button ghost public-header-login-desktop">
            {user ? t("cta.openPortal") : t("cta.login")}
          </Link>
          <Link href="/signup" className="public-button">
            {t("cta.startFree")}
          </Link>
          <button
            type="button"
            className="public-header-menu-btn"
            aria-label={t("nav.publicPages")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="public-header-mobile-menu">
          <Link href="/" onClick={closeMenu}>{t("nav.home")}</Link>
          <Link href="/features" onClick={closeMenu}>{t("nav.features")}</Link>
          <Link href="/pricing" onClick={closeMenu}>{t("nav.pricing")}</Link>
          <Link href="/faq" onClick={closeMenu}>{t("nav.faq")}</Link>
          <Link href={user ? "/dashboard" : "/login"} onClick={closeMenu}>
            {user ? t("cta.openPortal") : t("cta.login")}
          </Link>
          {hideLanguage ? null : <div className="public-header-mobile-lang"><PublicLanguageSelector /></div>}
        </div>
      ) : null}
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
            <a href="mailto:contact@nivadesk.co.uk">contact@nivadesk.co.uk</a>
          </div>
        </div>
        <div className="public-footer-groups" aria-label={t("nav.footer")}>
          <section className="public-footer-group">
            <h3>{t("footer.product")}</h3>
            <nav aria-label={t("footer.product")}>
              <Link href="/features">{t("nav.features")}</Link>
              <Link href="/pricing">{t("nav.pricing")}</Link>
              <Link href="/guide">{t("nav.guide")}</Link>
              <Link href="/faq">{t("nav.faq")}</Link>
              <Link href="/changelog">{t("nav.changelog")}</Link>
            </nav>
          </section>
          <section className="public-footer-group">
            <h3>{t("footer.legal")}</h3>
            <nav aria-label={t("footer.legal")}>
              <Link href="/privacy">{t("nav.privacy")}</Link>
              <Link href="/terms">{t("nav.terms")}</Link>
              <Link href="/cookies">{t("nav.cookies")}</Link>
              <button type="button" className="public-footer-linkbtn" onClick={openCookiePreferences}>{t("nav.cookiePreferences")}</button>
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
          <span>{t("footer.rights")}</span>
          <span className="public-footer-recaptcha">
            {(() => {
              const parts = t("footer.recaptcha.text").split(/\{privacy\}|\{terms\}/);
              return (
                <>
                  {parts[0]}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">{t("footer.recaptcha.privacy")}</a>
                  {parts[1] ?? " "}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">{t("footer.recaptcha.terms")}</a>
                  {parts[2] ?? ""}
                </>
              );
            })()}
          </span>
          <span className="public-footer-legal">
            EGGCRAFT LIMITED · Registered in England and Wales No. 16566512 · VAT GB 514512621 · 141 Randolph Avenue, London W9 1DN, United Kingdom
          </span>
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
      <SiteVisitBeacon />
      <GoogleAdsTag />
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

const HERO_CHIPS: { key: PublicSiteTranslationKey; icon: ReactNode }[] = [
  { key: "heroChip.orders", icon: <path d="M4 5h12M4 9h12M4 13h8" /> },
  { key: "heroChip.files", icon: <path d="M3 6l1.5-2h4l1 1.5H17v9H3V6z" /> },
  { key: "heroChip.finance", icon: <><rect x="2.5" y="5.5" width="15" height="9" rx="1.5" /><circle cx="10" cy="10" r="2" /><path d="M5 8.5v3M15 8.5v3" /></> },
  { key: "heroChip.notes", icon: <path d="M5 3h10v14H5zM7 7h6M7 10h6M7 13h4" /> },
  { key: "heroChip.chatgpt", icon: <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" /> },
  { key: "heroChip.team", icon: <path d="M7 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM13 9a2 2 0 100-4M3 16c0-2.2 1.8-4 4-4s4 1.8 4 4M12 12c2 0 4 1.4 4 4" /> }
];

function HeroFeatureChips() {
  const { t } = usePublicSiteLanguage();
  return (
    <div className="hero-chips-frame">
      <span className="hero-chips-label">{t("heroChips.title")}</span>
      <div className="hero-chips">
        {HERO_CHIPS.map(chip => (
          <span className="hero-chip" key={chip.key}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {chip.icon}
            </svg>
            {t(chip.key)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Pick a currency symbol matching the visitor's region for the decorative hero badge:
// US/Americas → $, continental Europe → €, UK and everywhere else → £. Uses the browser
// timezone (a good proxy for physical location), falling back to the language region.
function heroCurrencySymbol(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("America/")) return "$";
    if (["Europe/London", "Europe/Belfast", "Europe/Guernsey", "Europe/Jersey", "Europe/Isle_of_Man"].includes(tz)) return "£";
    if (tz.startsWith("Europe/")) return "€";
  } catch {
    // ignore: fall through to the language region / default
  }
  if (typeof navigator !== "undefined") {
    const region = (navigator.language || "").split("-")[1]?.toUpperCase() || "";
    if (region === "US") return "$";
    if (region === "GB") return "£";
  }
  return "£";
}

function ProductScene() {
  const { t } = usePublicSiteLanguage();
  // Default to £ for the server render; resolve the visitor's symbol after hydration.
  const [currencySymbol, setCurrencySymbol] = useState("£");
  useEffect(() => {
    setCurrencySymbol(heroCurrencySymbol());
  }, []);
  return (
    <div className="public-hero-visual" aria-hidden="true">
      <div className="hero-app-shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero-app.webp" alt="NivaDesk order workspace" loading="eager" />
      </div>
      <div className="hero-float hero-float-orders">
        <span className="hero-float-icon" data-tone="sage">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></svg>
        </span>
        <div><strong>{t("heroFloat.ordersTitle")}</strong><span>{t("heroFloat.ordersSub")}</span></div>
      </div>
      <div className="hero-float hero-float-received">
        <span className="hero-float-icon" data-tone="green">
          <span className="hero-float-currency">{currencySymbol}</span>
        </span>
        <div><strong>{t("heroFloat.receivedTitle").replace(/^[^\d]+/, currencySymbol)}</strong><span>{t("heroFloat.receivedSub")}</span></div>
      </div>
      <div className="hero-float hero-float-chatgpt">
        <span className="hero-float-icon" data-tone="violet">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" /></svg>
        </span>
        <div><strong>{t("heroFloat.chatgptTitle")}</strong><span>{t("heroFloat.chatgptSub")}</span></div>
        <span className="hero-float-arrow">›</span>
      </div>
      <div className="hero-float hero-float-file">
        <span className="hero-float-icon" data-tone="gold">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h6l4 4v10H5zM11 3v4h4" /></svg>
        </span>
        <div><strong>{t("heroFloat.fileTitle")}</strong><span>{t("heroFloat.fileSub")}</span></div>
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
        {ORDER_CARDS.flatMap((card, index) => {
          const isSelected = selectedCardIndex === index;
          const nodes: ReactNode[] = [
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
          ];
          // Phone only (CSS-controlled): show the tapped card's description as a
          // full-width strip right after the row it belongs to, so the two
          // side-by-side cards stay in place and never reflow.
          const isRowEnd = index % 2 === 1 || index === ORDER_CARDS.length - 1;
          const selectedRow = Math.floor(selectedCardIndex / 2);
          if (isRowEnd && Math.floor(index / 2) === selectedRow) {
            nodes.push(
              <p className="public-order-card-inline-detail" key="inline-detail">
                {t(selectedCard.detailKey)}
              </p>
            );
          }
          return nodes;
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

const PLAN_PRICES: Partial<Record<StudioBillingPlan, { monthly: string; yearly: string }>> = {
  lifetime_lite: { monthly: "£9", yearly: "£90" },
  pro_monthly: { monthly: "£19", yearly: "£190" },
  team_monthly: { monthly: "£49", yearly: "£490" }
};

function PublicPlanCard({ plan, compact = false, billing = "monthly" }: { plan: PlanEntitlements; compact?: boolean; billing?: "monthly" | "yearly" }) {
  const { t } = usePublicSiteLanguage();
  const copy = PUBLIC_PLAN_COPY[plan.plan];
  const bulletKeys = compact ? copy.bulletKeys.slice(0, 3) : copy.bulletKeys;
  const prices = PLAN_PRICES[plan.plan];
  return (
    <article className={copy.featured ? "public-card public-plan-card featured" : "public-card public-plan-card"} data-plan={plan.plan}>
      {copy.badgeKey ? <span className="public-plan-badge"><span className="public-plan-badge-star">★</span>{t(copy.badgeKey)}</span> : null}
      <div className="public-plan-topline">
        <span className="public-eyebrow">{t(copy.shortNameKey)}</span>
        <span className="public-plan-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{copy.icon}</svg>
        </span>
      </div>
      <h3>{t(copy.publicNameKey)}</h3>
      <div className="public-plan-price-block">
        {prices ? (
          <>
            <div className="public-plan-price">
              <span className="public-plan-price-amount">{billing === "yearly" ? prices.yearly : prices.monthly}</span>
              <span className="public-plan-price-per">{billing === "yearly" ? t("pricing.perYear") : t("pricing.perMonth")}</span>
            </div>
            <div className="public-plan-price-alt">
              {billing === "yearly" ? `${prices.monthly} ${t("pricing.perMonth")}` : `${prices.yearly} ${t("pricing.perYear")}`}
            </div>
          </>
        ) : (
          <div className="public-plan-price"><span className="public-plan-price-amount">{t("pricing.freeForever")}</span></div>
        )}
      </div>
      <p>{t(copy.noteKey)}</p>
      <div className="public-plan-limits">
        <div className="public-plan-stat">
          <svg className="public-plan-stat-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4h7v13h-7zM8.5 4V3h3v1M8.5 8h3M8.5 11h3" /></svg>
          <span className="public-plan-stat-label">{t("plan.limit.orders")}</span>
          <strong>{plan.orderLimit ?? t("plan.limit.unlimited")}</strong>
        </div>
        <div className="public-plan-stat">
          <svg className="public-plan-stat-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 9a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM12.6 8.8a2 2 0 100-4M3.5 15.5c0-2 1.6-3.6 3.5-3.6s3.5 1.6 3.5 3.6M12 11.9c1.9 0 3.5 1.3 3.5 3.6" /></svg>
          <span className="public-plan-stat-label">{t("plan.limit.customers")}</span>
          <strong>{plan.customerLimit ?? t("plan.limit.unlimited")}</strong>
        </div>
        <div className="public-plan-stat">
          <svg className="public-plan-stat-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 9.6a2.7 2.7 0 100-5.4 2.7 2.7 0 000 5.4zM4.5 16c0-2.6 2.3-4.4 5.5-4.4s5.5 1.8 5.5 4.4" /></svg>
          <span className="public-plan-stat-label">{plan.plan === "team_monthly" ? t("plan.limit.seats") : t("plan.limit.users")}</span>
          <strong>{plan.plan === "team_monthly" ? t("plan.limit.teamIncluded") : plan.teamMemberLimit}</strong>
        </div>
        <div className="public-plan-stat">
          <svg className="public-plan-stat-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l1.6-2h4l1.3 1.8H17v9.2H3V6z" /></svg>
          <span className="public-plan-stat-label">{t("plan.limit.clientFiles")}</span>
          <strong>{plan.features.client_files ? storageLimitLabel(plan) : t("plan.limit.notIncluded")}</strong>
        </div>
      </div>
      <ul className="public-plan-bullets">
        {bulletKeys.map(bulletKey => (
          <li key={bulletKey}>
            <span className="public-plan-check"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10.5l3.2 3.2L15.5 6" /></svg></span>
            {t(bulletKey)}
          </li>
        ))}
      </ul>
      <div className="public-plan-limitnote">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="M10 9.2v4M10 6.4v.1" /></svg>
        <span>{t(copy.limitNoteKey)}</span>
      </div>
      <PlanAction copy={copy} />
    </article>
  );
}

function PublicPlanGrid({ compact = false }: { compact?: boolean }) {
  const { t } = usePublicSiteLanguage();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  return (
    <>
      {!compact ? (
        <div className="public-plan-toggle-row">
          <div className="public-plan-toggle">
            <button type="button" className={billing === "monthly" ? "active" : ""} onClick={() => setBilling("monthly")}>
              {t("pricing.toggleMonthly")}
            </button>
            <button type="button" className={billing === "yearly" ? "active" : ""} onClick={() => setBilling("yearly")}>
              {t("pricing.toggleYearly")}
            </button>
            <span className="public-plan-toggle-save">{t("pricing.toggleSave")}</span>
          </div>
        </div>
      ) : null}
      <div className="public-plan-grid">
        {PLAN_ORDER.map(planKey => (
          <PublicPlanCard key={planKey} plan={PLAN_ENTITLEMENTS[planKey]} compact={compact} billing={billing} />
        ))}
      </div>
    </>
  );
}

function StudioAccentBand() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-accent-band public-scroll-reveal">
      <div className="public-shell public-accent-grid2">
        <div className="public-accent-text">
          <span className="public-eyebrow">
            <svg className="public-eyebrow-spark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.4 3.7L13 6.6 9.4 8 8 11.7 6.6 8 3 6.6l3.6-1.4z" /></svg>
            {t("accent.eyebrow")}
          </span>
          <h2>{t("accent.title")}</h2>
          <p>{t("accent.body")}</p>
          <div className="public-accent-actions">
            <Link href="/features" className="public-button dark large">
              {t("accent.cta.explore")}<span className="public-button-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/features" className="public-button secondary large">{t("accent.cta.customise")}</Link>
          </div>
          <ul className="public-accent-trust">
            <li>
              <span className="pa-ico pa-ico-a"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.4 3.7L13 6.6 9.4 8 8 11.7 6.6 8 3 6.6l3.6-1.4z" /></svg></span>
              <span>{t("accent.trust1")}</span>
            </li>
            <li>
              <span className="pa-ico pa-ico-b"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 018.5-3.5M13 8a5 5 0 01-8.5 3.5M11 3.5v2.5h-2.5M5 12.5v-2.5h2.5" /></svg></span>
              <span>{t("accent.trust2")}</span>
            </li>
            <li>
              <span className="pa-ico pa-ico-c"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.4 3.7L13 6.6 9.4 8 8 11.7 6.6 8 3 6.6l3.6-1.4z" /></svg></span>
              <span>{t("accent.trust3")}</span>
            </li>
          </ul>
        </div>
        <div className="public-accent-visual" aria-hidden="true">
          <img src="/colorcards.png" alt="" loading="lazy" />
        </div>
      </div>
    </section>
  );
}

const STORY_STATUS_KEYS: PublicSiteTranslationKey[] = [
  "scrollStory.status1",
  "scrollStory.status2",
  "scrollStory.status3",
  "scrollStory.status4"
];

const STORY_STATUS_TONES = ["waiting", "transit", "out", "delivered"];

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

    // Pick the last step whose top has crossed a reference line. This is
    // monotonic with scroll position, so the active step advances cleanly
    // 0 → 1 → 2 → 3 instead of flickering between neighbours the way the
    // intersection-ratio approach did near the band edges.
    let raf = 0;
    let current = -1;
    const compute = () => {
      raf = 0;
      const refY = window.innerHeight * 0.5;
      let idx = 0;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].getBoundingClientRect().top <= refY) idx = i;
        else break;
      }
      if (idx !== current) {
        current = idx;
        setActiveStep(idx);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
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
              <span className="public-story-status" data-tone={STORY_STATUS_TONES[activeStep]}>
                {t(STORY_STATUS_KEYS[activeStep])}
              </span>
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

const WORKFLOW_VISUALS: { tone: string; icon: ReactNode }[] = [
  { tone: "sage", icon: <><rect x="5" y="3.5" width="10" height="13" rx="2" /><path d="M7.5 7h5M7.5 10h5M7.5 13h3" /></> },
  { tone: "sky", icon: <path d="M3 7l1.8-2.2h5l1.5 2H21v11H3z" /> },
  { tone: "gold", icon: <path d="M4 16V9M9 16V4M14 16v-5M3.5 18.5h13" /> }
];

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
          {FEATURE_GROUPS.map((group, index) => (
            <article key={group.titleKey}>
              <span className="public-workflow-icon" data-tone={WORKFLOW_VISUALS[index]?.tone ?? "sage"}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{WORKFLOW_VISUALS[index]?.icon}</svg>
              </span>
              <div className="public-workflow-text">
                <h3>{t(group.titleKey)}</h3>
                <p>{t(group.bodyKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURE_DEEP_CHIP_KEYS: PublicSiteTranslationKey[] = [
  "featuresDeep.chip.orders",
  "featuresDeep.chip.files",
  "featuresDeep.chip.team",
  "featuresDeep.chip.export"
];

function FeatureDeepDiveSection() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-features-deep-section public-scroll-reveal">
      <div className="public-shell public-features-deep-panel">
        <div className="public-features-deep-copy">
          <span className="public-eyebrow featuresDeep-eyebrow">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2.5l1.4 4 4 1.4-4 1.4L10 13.3 8.6 9.3l-4-1.4 4-1.4zM15.5 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
            {t("featuresDeep.eyebrow")}
          </span>
          <h2>
            {t("featuresDeep.tourTitleA")} <span className="hero-accent">{t("featuresDeep.tourTitleAccent")}</span>
          </h2>
          <p>{t("featuresDeep.tourBody")}</p>
          <div className="public-features-chips">
            {FEATURE_DEEP_DIVES.map((item, index) => (
              <a className="public-features-chip" data-tone={item.tone} href={`#feature-${item.id}`} key={item.id}>
                <span className="public-features-chip-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                </span>
                <span className="public-features-chip-label">{t(FEATURE_DEEP_CHIP_KEYS[index])}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="public-features-deep-list">
          {FEATURE_DEEP_DIVES.map(item => (
            <article id={`feature-${item.id}`} data-tone={item.tone} key={item.titleKey}>
              <span className="public-features-deep-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
              </span>
              <div className="public-features-deep-titles">
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.bodyKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Per-feature icon + colour tone for the compact mobile matrix, kept parallel
// to PLAN_FEATURE_BRIDGE (same order/length). Desktop hides these via CSS, so
// the computer view is untouched; only the phone layout renders the chips.
const FI = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PLAN_FEATURE_ICONS: { icon: React.ReactNode; tone: string }[] = [
  { tone: "sage", icon: FI("M9 5h6M9 5a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a2 2 0 0 0-2-2M9 11h6M9 15h4") },
  { tone: "blue", icon: FI("M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.85M16.5 4.15a4 4 0 0 1 0 7.7") },
  { tone: "violet", icon: FI("M8 4h6l4 4v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM13 4v5h5") },
  { tone: "amber", icon: FI("M12 3l1.8 4.6L18.5 9l-3.7 3 1.3 4.8L12 14.5 7.9 16.8 9.2 12 5.5 9l4.7-1.4Z") },
  { tone: "teal", icon: FI("M5 20V10M12 20V4M19 20v-7") },
  { tone: "rose", icon: FI("M12 3v10m0 0l4-4m-4 4l-4-4M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2") },
  { tone: "blue", icon: FI("M4 6a1 1 0 0 1 1-1h6l2 2h6a1 1 0 0 1 1 1v3H4ZM4 11h17v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z") },
  { tone: "sage", icon: FI("M4 18l5-5 3 3 7-8M16 8h3v3") },
  { tone: "violet", icon: FI("M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.8-.7-1.4-.7-2.2 0-.6.5-1.2 1.2-1.2H16a4 4 0 0 0 4-4c0-4.4-3.6-7-8-7ZM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM11 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM15.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z") },
  { tone: "amber", icon: FI("M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z") },
  { tone: "teal", icon: FI("M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3ZM5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3") },
  { tone: "rose", icon: FI("M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4V6a1 1 0 0 1 1-1H4Z") },
  { tone: "amber", icon: FI("M13 3L5 13h6l-1 8 8-10h-6l1-8Z") },
  { tone: "sage", icon: FI("M9 12l2 2 4-4M12 3l7 3v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z") },
  { tone: "blue", icon: FI("M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.85") },
  { tone: "violet", icon: FI("M14 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 8v6M21 11h-6") },
  { tone: "teal", icon: FI("M4 20V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14M14 20v-9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9M3 20h18M7 9h3M7 13h3M17 14h0") },
  { tone: "rose", icon: FI("M5 11l5 5L20 6M3 13l1 1") }
];

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
                const popular = planKey === "pro_monthly";
                return (
                  <div
                    className={popular ? "public-plan-matrix-plan-head popular" : "public-plan-matrix-plan-head"}
                    role="columnheader"
                    key={planKey}
                  >
                    {popular ? <span className="public-plan-matrix-pop" aria-hidden="true">{t("planBridge.popular")}</span> : null}
                    <strong>{t(copy.shortNameKey)}</strong>
                    <small>{t(copy.priceLabelKey)}</small>
                  </div>
                );
              })}
            </div>
            {PLAN_FEATURE_BRIDGE.map((item, index) => (
              <div className="public-plan-matrix-row" role="row" key={item.titleKey}>
                <div className="public-plan-matrix-feature" role="cell">
                  <span className={`public-plan-matrix-ficon tone-${PLAN_FEATURE_ICONS[index]?.tone ?? "sage"}`} aria-hidden="true">
                    {PLAN_FEATURE_ICONS[index]?.icon}
                  </span>
                  <span className="public-plan-matrix-ftext">
                    <strong>{t(item.titleKey)}</strong>
                    <span>{t(item.bodyKey)}</span>
                  </span>
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

const REGION_CURRENCY: Record<string, string> = {
  GB: "GBP", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD",
  TR: "TRY", JP: "JPY", CN: "CNY", IN: "INR", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  BR: "BRL", MX: "MXN", ZA: "ZAR", AE: "AED", SA: "SAR",
  HK: "HKD", SG: "SGD", KR: "KRW", RU: "RUB", IL: "ILS",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR",
  BE: "EUR", AT: "EUR", PT: "EUR", IE: "EUR", FI: "EUR",
  GR: "EUR", SK: "EUR", SI: "EUR", LT: "EUR", LV: "EUR",
  EE: "EUR", LU: "EUR", CY: "EUR", MT: "EUR"
};

// Detects the visitor's currency from their browser locale (client-side only).
// Returns a localized symbol and a formatter for the demo amount. Defaults to GBP.
const LANGUAGE_CURRENCY: Record<StudioLanguage, { currency: string; locale: string }> = {
  "English": { currency: "GBP", locale: "en-GB" },
  "Türkçe": { currency: "TRY", locale: "tr-TR" },
  "Deutsch": { currency: "EUR", locale: "de-DE" },
  "Français": { currency: "EUR", locale: "fr-FR" },
  "Italiano": { currency: "EUR", locale: "it-IT" },
  "Español (Spanish)": { currency: "EUR", locale: "es-ES" },
  "Português": { currency: "EUR", locale: "pt-PT" },
  "Русский (Russian)": { currency: "RUB", locale: "ru-RU" },
  "日本語 (Japanese)": { currency: "JPY", locale: "ja-JP" },
  "中文 (Chinese)": { currency: "CNY", locale: "zh-CN" },
  "العربية (Arabic)": { currency: "USD", locale: "ar" },
  "हिन्दी (Hindi)": { currency: "INR", locale: "hi-IN" }
};

function useLocaleCurrency() {
  const { language } = usePublicSiteLanguage();
  const { currency, locale } = LANGUAGE_CURRENCY[language as StudioLanguage] ?? LANGUAGE_CURRENCY["English"];
  let symbol = "£";
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0);
    symbol = parts.find(p => p.type === "currency")?.value ?? symbol;
  } catch {
    /* keep default */
  }
  const format = (amount: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${symbol}${amount.toLocaleString()}`;
    }
  };
  return { symbol, format };
}

function GptMark() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2.4l1.7 4.6 4.6 1.7-4.6 1.7L10 15.4l-1.7-4.7L3.7 9l4.6-1.7z" />
    </svg>
  );
}

function ScheduleTimelineShowcase() {
  const { t } = usePublicSiteLanguage();
  const sideFeatures: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
    { key: "f1", title: "schedule.f1.title", body: "schedule.f1.body", tone: "calendar", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></> },
    { key: "f2", title: "schedule.f2.title", body: "schedule.f2.body", tone: "filter", icon: <path d="M4 5h12l-4.6 5.4v4.1l-2.8 1.5v-5.6z" /> }
  ];
  const floats: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; pos: string; icon: ReactNode }[] = [
    { key: "float1", title: "schedule.float1.title", body: "schedule.float1.body", tone: "drag", pos: "right-top", icon: <><path d="M10 3v8M10 11l-2.4-2.4M10 11l2.4-2.4" /><rect x="5" y="13" width="10" height="4" rx="1.5" /></> },
    { key: "float2", title: "schedule.float2.title", body: "schedule.float2.body", tone: "check", pos: "right-bottom", icon: <><circle cx="10" cy="10" r="6.6" /><path d="M7.2 10.2l1.9 1.9 3.7-3.9" /></> }
  ];
  const grid: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
    { key: "b1", title: "schedule.b1.title", body: "schedule.b1.body", tone: "calendar", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></> },
    { key: "b2", title: "schedule.b2.title", body: "schedule.b2.body", tone: "trend", icon: <path d="M4 13l3.5-3.5 2.5 2.5L16 6M16 6h-3M16 6v3" /> },
    { key: "b3", title: "schedule.b3.title", body: "schedule.b3.body", tone: "team", icon: <path d="M7.5 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM13.4 9.2a2.1 2.1 0 100-4.2M3.5 16c0-2.3 1.8-4 4-4s4 1.7 4 4M12 12c2.1 0 3.9 1.4 3.9 4" /> },
    { key: "b4", title: "schedule.b4.title", body: "schedule.b4.body", tone: "view", icon: <><circle cx="6.5" cy="12" r="2.6" /><circle cx="13.5" cy="12" r="2.6" /><path d="M6.5 9.4l1.2-4.4M13.5 9.4l-1.2-4.4" /></> }
  ];
  return (
    <section className="public-section schedule-section public-scroll-reveal">
      <div className="public-shell">
        <div className="schedule-top">
          <div className="schedule-copy">
            <span className="public-eyebrow schedule-eyebrow">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></svg>
              {t("schedule.eyebrow")}
            </span>
            <h2>{t("schedule.title")}</h2>
            <p>{t("schedule.body")}</p>
            <div className="schedule-side-features">
              {sideFeatures.map(f => (
                <div className="schedule-side-card" key={f.key}>
                  <span className="schedule-side-icon" data-tone={f.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg></span>
                  <div>
                    <strong>{t(f.title)}</strong>
                    <span>{t(f.body)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="schedule-stage">
            <img className="schedule-shot" src="/schedule.webp" alt={t("schedule.imageAlt")} loading="lazy" />
            {floats.map(f => (
              <div className={`schedule-float schedule-float-${f.pos}`} key={f.key}>
                <span className="schedule-float-icon" data-tone={f.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg></span>
                <strong>{t(f.title)}</strong>
                <span>{t(f.body)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="schedule-grid">
          {grid.map(g => (
            <div className="schedule-grid-card" key={g.key}>
              <span className="schedule-grid-icon" data-tone={g.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{g.icon}</svg></span>
              <strong>{t(g.title)}</strong>
              <span>{t(g.body)}</span>
            </div>
          ))}
        </div>
        <div className="schedule-tagline">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="M6.8 10.2l2.1 2.1 4.3-4.5" /></svg>
          {t("schedule.tagline")}
        </div>
      </div>
    </section>
  );
}

function DashboardFinanceShowcase() {
  const { t } = usePublicSiteLanguage();
  const sideFeatures: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
    { key: "s1", title: "dashboard.side1.title", body: "dashboard.side1.body", tone: "filter", icon: <><rect x="5" y="3.5" width="10" height="13" rx="2" /><path d="M7.5 7h5M7.5 10h5M7.5 13h3" /></> }
  ];
  const floats: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; pos: string; icon: ReactNode }[] = [
    { key: "float1", title: "dashboard.float1.title", body: "dashboard.float1.body", tone: "drag", pos: "dash-top", icon: <path d="M4 13l3.5-3.5 2.5 2.5L16 6M16 6h-3M16 6v3" /> },
    { key: "float2", title: "dashboard.float2.title", body: "dashboard.float2.body", tone: "check", pos: "dash-mid", icon: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></> },
    { key: "float3", title: "dashboard.float3.title", body: "dashboard.float3.body", tone: "drag", pos: "dash-bottom", icon: <path d="M4 13l3.5-3.5 2.5 2.5L16 6M16 6h-3M16 6v3" /> }
  ];
  const grid: { key: string; title: PublicSiteTranslationKey; body: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
    { key: "b1", title: "dashboard.b1.title", body: "dashboard.b1.body", tone: "calendar", icon: <><circle cx="10" cy="10" r="6.4" /><circle cx="10" cy="10" r="1.6" /></> },
    { key: "b2", title: "dashboard.b2.title", body: "dashboard.b2.body", tone: "trend", icon: <path d="M4 16V9M9 16V4M14 16v-5" /> },
    { key: "b3", title: "dashboard.b3.title", body: "dashboard.b3.body", tone: "team", icon: <><rect x="3.5" y="6" width="13" height="9" rx="2" /><path d="M3.5 9h13M12.5 12h1.5" /></> },
    { key: "b4", title: "dashboard.b4.title", body: "dashboard.b4.body", tone: "view", icon: <><circle cx="10" cy="10" r="6.4" /><circle cx="10" cy="10" r="3" /><circle cx="10" cy="10" r="0.6" /></> }
  ];
  return (
    <section className="public-section schedule-section dashboard-section public-scroll-reveal">
      <div className="public-shell">
        <div className="schedule-top">
          <div className="schedule-copy">
            <span className="public-eyebrow schedule-eyebrow">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16V9M9 16V4M14 16v-5" /></svg>
              {t("dashboard.eyebrow")}
            </span>
            <h2>{t("dashboard.title")}</h2>
            <p>{t("dashboard.body")}</p>
            <div className="schedule-side-features">
              {sideFeatures.map(f => (
                <div className="schedule-side-card" key={f.key}>
                  <span className="schedule-side-icon" data-tone={f.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg></span>
                  <div>
                    <strong>{t(f.title)}</strong>
                    <span>{t(f.body)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="schedule-stage">
            <img className="schedule-shot" src="/dashboard.webp" alt={t("dashboard.imageAlt")} loading="lazy" />
            {floats.map(f => (
              <div className={`schedule-float schedule-float-${f.pos}`} key={f.key}>
                <span className="schedule-float-icon" data-tone={f.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg></span>
                <strong>{t(f.title)}</strong>
                <span>{t(f.body)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="schedule-grid">
          {grid.map(g => (
            <div className="schedule-grid-card" key={g.key}>
              <span className="schedule-grid-icon" data-tone={g.tone}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{g.icon}</svg></span>
              <strong>{t(g.title)}</strong>
              <span>{t(g.body)}</span>
            </div>
          ))}
        </div>
        <div className="schedule-tagline">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="M6.8 10.2l2.1 2.1 4.3-4.5" /></svg>
          {t("dashboard.tagline")}
        </div>
      </div>
    </section>
  );
}

function ChatGPTAppShowcase() {
  const { t } = usePublicSiteLanguage();
  const currency = useLocaleCurrency();
  const queries: { key: PublicSiteTranslationKey; icon: ReactNode }[] = [
    { key: "chatgptApp.useCase1", icon: <path d="M5 3h10v14H5zM7.5 7h5M7.5 10h5M7.5 13h3" /> },
    { key: "chatgptApp.useCase2", icon: <path d="M4 16V9M9 16V4M14 16v-5" /> },
    { key: "chatgptApp.useCase3", icon: <path d="M4 16l.8-3 8-8 2.2 2.2-8 8-3 .8zM11.8 4.2l2.2 2.2" /> }
  ];
  const stats: { label: PublicSiteTranslationKey; value: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
    { label: "chatgptApp.resultMetric1Label", value: "chatgptApp.resultMetric1Value", tone: "clock", icon: <><circle cx="10" cy="10" r="6.4" /><path d="M10 6.4V10l2.6 1.6" /></> },
    { label: "chatgptApp.resultMetric2Label", value: "chatgptApp.resultMetric2Value", tone: "money", icon: <><rect x="2.5" y="5.5" width="15" height="9" rx="1.5" /><circle cx="10" cy="10" r="2" /><path d="M5 8.5v3M15 8.5v3" /></> },
    { label: "chatgptApp.resultMetric3Label", value: "chatgptApp.resultMetric3Value", tone: "lock", icon: <><rect x="5" y="9" width="10" height="7" rx="1.6" /><path d="M7.2 9V7.2a2.8 2.8 0 015.6 0V9" /></> }
  ];
  const trust: { key: PublicSiteTranslationKey; icon: ReactNode }[] = [
    { key: "chatgptApp.safeBadge1", icon: <path d="M10 3l5 2v4c0 3-2.2 5.4-5 6.4C7.2 14.4 5 12 5 9V5z" /> },
    { key: "chatgptApp.safeBadge2", icon: <path d="M7 9.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM13 9a2 2 0 100-4M3.2 16c0-2.2 1.7-3.9 3.8-3.9s3.8 1.7 3.8 3.9M12 12.1c2 0 3.8 1.3 3.8 3.9" /> },
    { key: "chatgptApp.safeBadge3", icon: <><rect x="5" y="9" width="10" height="7" rx="1.6" /><path d="M7.2 9V7.2a2.8 2.8 0 015.6 0V9" /></> }
  ];
  return (
    <section className="public-section gpt-section public-scroll-reveal">
      <div className="public-shell gpt-grid">
        <div className="gpt-copy-card">
          <span className="gpt-eyebrow"><span className="gpt-eyebrow-logo"><GptMark /></span>{t("chatgptApp.eyebrow")}</span>
          <h2>{t("chatgptApp.titleLead")} <span className="hero-accent">{t("chatgptApp.titleAccent")}</span></h2>
          <p>{t("chatgptApp.body")}</p>
          <div className="gpt-queries">
            {queries.map(q => (
              <div className="gpt-query" key={q.key}>
                <span className="gpt-query-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{q.icon}</svg></span>
                <span className="gpt-query-text">{t(q.key)}</span>
                <span className="gpt-query-arrow">›</span>
              </div>
            ))}
          </div>
        </div>
        <div className="gpt-demo-card">
          <div className="gpt-demo-inner">
            <div className="gpt-demo-head">
              <span className="gpt-demo-head-logo"><GptMark /></span>
              <strong>{t("chatgptApp.windowTitle")}</strong>
            </div>
            <div className="gpt-ask">
              <div>
                <span className="gpt-ask-label">{t("chatgptApp.promptLabel")}</span>
                <p>{t("chatgptApp.prompt")}</p>
              </div>
              <span className="gpt-you">You</span>
            </div>
            <div className="gpt-stats">
              {stats.map(s => {
                const isMoney = s.tone === "money";
                return (
                  <div className="gpt-stat" key={s.label}>
                    <span className="gpt-stat-icon" data-tone={s.tone}>
                      {isMoney
                        ? <span className="gpt-stat-symbol">{currency.symbol}</span>
                        : <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>}
                    </span>
                    <span className="gpt-stat-label">{t(s.label)}</span>
                    <strong>{isMoney ? currency.format(1028) : t(s.value)}</strong>
                  </div>
                );
              })}
            </div>
            <div className="gpt-answer">
              <span className="gpt-answer-avatar"><GptMark /></span>
              <div>
                <span className="gpt-answer-label">{t("chatgptApp.answerLabel")}</span>
                <p>{t("chatgptApp.answer")}</p>
              </div>
            </div>
            <div className="gpt-trust">
              {trust.map(tr => (
                <div className="gpt-trust-item" key={tr.key}>
                  <span className="gpt-trust-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{tr.icon}</svg></span>
                  <span>{t(tr.key)}</span>
                </div>
              ))}
            </div>
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

const APP_STORE_URL = "https://apps.apple.com/app/id6765475980";

function AppStoreBadge() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="public-appstore-btn"
      aria-label="Download NivaDesk on the App Store"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 8.02 7.36c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.51 4.04zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      <span className="public-appstore-btn-text">
        <small>Download on the</small>
        <strong>App Store</strong>
      </span>
    </a>
  );
}

function AppStoreDownload() {
  const { t } = usePublicSiteLanguage();
  const [qrOpen, setQrOpen] = useState(false);
  useEffect(() => {
    if (!qrOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [qrOpen]);
  return (
    <>
      <div className="public-appstore-download">
        <AppStoreBadge />
        <button type="button" className="public-appstore-qr-trigger" onClick={() => setQrOpen(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M3 3h7v7H3V3zm2 2v3h3V5H5z" />
            <path d="M14 3h7v7h-7V3zm2 2v3h3V5h-3z" />
            <path d="M3 14h7v7H3v-7zm2 2v3h3v-3H5z" />
            <path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3v2h-3zM14 18h2v3h-2z" />
          </svg>
          {t("platform.apple.scan")}
        </button>
      </div>
      {qrOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="public-qr-modal-backdrop" role="presentation" onClick={() => setQrOpen(false)}>
              <div
                className="public-qr-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("platform.apple.qrAlt")}
                onClick={event => event.stopPropagation()}
              >
                <button type="button" className="public-qr-modal-close" onClick={() => setQrOpen(false)} aria-label="Close">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <img src="/appstore-qr.png" alt={t("platform.apple.qrAlt")} width={220} height={220} />
                <p>{t("platform.apple.scanHint")}</p>
                <AppStoreBadge />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=uk.co.eggcraft.studioflow";

function PlayStoreBadge() {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="public-appstore-btn"
      aria-label="Get NivaDesk on Google Play"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
        <path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
      </svg>
      <span className="public-appstore-btn-text">
        <small>Get it on</small>
        <strong>Google Play</strong>
      </span>
    </a>
  );
}

function PlayStoreDownload() {
  const { t } = usePublicSiteLanguage();
  const [qrOpen, setQrOpen] = useState(false);
  useEffect(() => {
    if (!qrOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [qrOpen]);
  return (
    <>
      <div className="public-appstore-download">
        <PlayStoreBadge />
        <button type="button" className="public-appstore-qr-trigger" onClick={() => setQrOpen(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M3 3h7v7H3V3zm2 2v3h3V5H5z" />
            <path d="M14 3h7v7h-7V3zm2 2v3h3V5h-3z" />
            <path d="M3 14h7v7H3v-7zm2 2v3h3v-3H5z" />
            <path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3v2h-3zM14 18h2v3h-2z" />
          </svg>
          {t("platform.android.scan")}
        </button>
      </div>
      {qrOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="public-qr-modal-backdrop" role="presentation" onClick={() => setQrOpen(false)}>
              <div
                className="public-qr-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("platform.android.qrAlt")}
                onClick={event => event.stopPropagation()}
              >
                <button type="button" className="public-qr-modal-close" onClick={() => setQrOpen(false)} aria-label="Close">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <img src="/playstore-qr.png" alt={t("platform.android.qrAlt")} width={220} height={220} />
                <p>{t("platform.android.scanHint")}</p>
                <PlayStoreBadge />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function WebPortalLinks() {
  const { t } = usePublicSiteLanguage();
  return (
    <div className="public-web-links">
      <Link href="/signup" className="public-button">{t("cta.startFree")}</Link>
      <Link href="/login" className="public-button ghost">{t("cta.login")}</Link>
    </div>
  );
}

function PlatformHintBanner({ kind, text }: { kind: "android" | "windows"; text: string }) {
  return (
    <div className="public-platform-hint" data-hint={kind}>
      {kind === "android" ? (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )}
      <span>{text}</span>
    </div>
  );
}

function PlatformNote() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-section-soft public-scroll-reveal">
      <div className="public-shell public-platform-panel">
        <div className="public-platform-intro">
          <span className="public-eyebrow">{t("platform.eyebrow")}</span>
          <h2>{t("platform.title")}</h2>
          <p>{t("platform.subtitle")}</p>
        </div>
        <div className="public-platform-grid public-scroll-stagger" aria-label={t("platform.gridAria")}>
          {PLATFORM_CARDS.map(platform => (
            <article className="public-platform-card" data-platform={platform.kind} key={platform.kind}>
              <div className="public-platform-card-head">
                <span className="public-platform-logo">
                  <PlatformLogo kind={platform.kind} />
                </span>
                <span className="public-platform-status">{t(platform.statusKey)}</span>
              </div>
              <h3>{t(platform.nameKey)}</h3>
              <p>{t(platform.detailKey)}</p>
              {platform.kind === "apple" ? <AppStoreDownload /> : null}
              {platform.kind === "web" ? <WebPortalLinks /> : null}
              {platform.kind === "android" ? <PlayStoreDownload /> : null}
              {platform.kind === "windows" ? <PlatformHintBanner kind="windows" text={t("platform.windows.hint")} /> : null}
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
              <h1>
                {t("hero.titleLead")} <span className="hero-accent">{t("hero.titleAccent")}</span> {t("hero.titleTail")}
              </h1>
              <p>{t("hero.body")}</p>
              <div className="public-hero-actions">
                <Link href="/signup" className="public-button large">{t("cta.startFree")}</Link>
                <Link href="/pricing" className="public-button ghost large">{t("cta.viewPricing")}</Link>
              </div>
              <HeroFeatureChips />
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
        <section className="public-page-hero public-features-hero">
          <div className="public-shell">
            <div className="public-features-hero-top">
              <div className="public-features-hero-copy">
                <span className="public-eyebrow public-features-hero-eyebrow">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2.5l1.4 4 4 1.4-4 1.4L10 13.3 8.6 9.3l-4-1.4 4-1.4zM15.5 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
                  {t("featuresPage.eyebrow")}
                </span>
                <h1>{t("featuresPage.title")}</h1>
                <p>{t("featuresPage.body")}</p>
              </div>
              <div className="public-features-hero-shot">
                <img src="/schedule.webp" alt={t("schedule.imageAlt")} loading="lazy" />
              </div>
            </div>
            <div className="public-features-hero-strip">
              {[
                { key: "s1", tone: "trend", title: "schedule.f1.title" as PublicSiteTranslationKey, body: "schedule.f1.body" as PublicSiteTranslationKey, icon: <path d="M4 13l3.5-3.5 2.5 2.5L16 6M16 6h-3M16 6v3" /> },
                { key: "s2", tone: "calendar", title: "schedule.f2.title" as PublicSiteTranslationKey, body: "schedule.f2.body" as PublicSiteTranslationKey, icon: <><rect x="5" y="3.5" width="8" height="11" rx="2" /><rect x="8" y="6.5" width="8" height="11" rx="2" /></> },
                { key: "s3", tone: "team", title: "featuresPage.glance.title" as PublicSiteTranslationKey, body: "featuresPage.glance.body" as PublicSiteTranslationKey, icon: <path d="M7.5 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM13.4 9.2a2.1 2.1 0 100-4.2M3.5 16c0-2.3 1.8-4 4-4s4 1.7 4 4M12 12c2.1 0 3.9 1.4 3.9 4" /> },
                { key: "s4", tone: "team", title: "schedule.team.title" as PublicSiteTranslationKey, body: "schedule.team.body" as PublicSiteTranslationKey, icon: <><rect x="3.5" y="4.5" width="13" height="11" rx="2" /><path d="M3.5 8.5h13M8 8.5v7M12 8.5v7" /></> }
              ].map(item => (
                <div className="public-features-hero-strip-item" key={item.key}>
                  <span className="public-features-hero-strip-icon" data-tone={item.tone}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                  </span>
                  <div>
                    <strong>{t(item.title)}</strong>
                    <span>{t(item.body)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FeatureWorkflowPanel />

        <FeatureDeepDiveSection />

        <DashboardFinanceShowcase />

        <ScheduleTimelineShowcase />

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
            <SectionHeader
              eyebrowKey="featuresPage.invoice.eyebrow"
              titleKey="featuresPage.invoice.title"
              bodyKey="featuresPage.invoice.body"
            />
            <div className="public-features-hero-strip">
              {[
                { key: "inv1", tone: "trend", label: "featuresPage.invoice.p1" as PublicSiteTranslationKey, icon: <><rect x="5" y="3.5" width="10" height="13" rx="2" /><path d="M7.5 7.5h5M7.5 10.5h5M7.5 13h3" /></> },
                { key: "inv2", tone: "calendar", label: "featuresPage.invoice.p2" as PublicSiteTranslationKey, icon: <path d="M4 16l1-3 8-8 2.5 2.5-8 8H4zM12 5l2.5 2.5" /> },
                { key: "inv3", tone: "team", label: "featuresPage.invoice.p3" as PublicSiteTranslationKey, icon: <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" /> }
              ].map(item => (
                <div className="public-features-hero-strip-item" key={item.key}>
                  <span className="public-features-hero-strip-icon" data-tone={item.tone}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                  </span>
                  <div>
                    <strong>{t(item.label)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell">
            <SectionHeader
              eyebrowKey="capability.eyebrow"
              titleKey="capability.title"
              bodyKey="capability.body"
            />
            <div className="public-feature-grid">
              {FEATURE_HIGHLIGHTS.map((feature, index) => (
                <FeatureCard key={feature.titleKey} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

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
          <div className="public-shell public-pricing-hero2">
            <div className="public-pricing-hero2-text">
              <span className="public-eyebrow">{t("pricingPage.eyebrow")}</span>
              <h1>{t("pricingPage.title")}</h1>
              <p>{t("pricingPage.body")}</p>
              <div className="public-pricing-hero2-actions">
                <Link href="/signup" className="public-button large">
                  {t("cta.startFree")}<span className="public-button-arrow" aria-hidden="true">→</span>
                </Link>
                <Link href="#pricing-plans" className="public-button secondary large">{t("pricingHero.compare")}</Link>
              </div>
              <ul className="public-pricing-trust">
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>
                  {t("pricingHero.trust.checkout")}
                </li>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>
                  {t("pricingHero.trust.cancel")}
                </li>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
                  {t("pricingHero.trust.billing")}
                </li>
              </ul>
            </div>

            <div className="public-pricing-cluster" aria-hidden="true">
              <div className="public-pricing-orb" />
              <div className="pc-card pc-card-demo">
                <span className="pc-ico pc-ico-solid"><svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11M9 9a2 2 0 110-4c2 0 3 4 3 4M15 9a2 2 0 100-4c-2 0-3 4-3 4" /></svg></span>
                <div><strong>{t("pricingHero.card.demo.title")}</strong><span>{t("pricingHero.card.demo.body")}</span></div>
              </div>
              <div className="pc-card pc-card-team">
                <span className="pc-ico pc-ico-solid"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="8.5" r="2.3" /><path d="M16 14c2.4.2 4.5 2 4.5 5" /></svg></span>
                <div><strong>{t("pricingHero.card.team.title")}</strong><span>{t("pricingHero.card.team.body")}</span></div>
              </div>
              <div className="pc-card pc-card-upgrade">
                <span className="pc-ico"><svg viewBox="0 0 24 24"><path d="M4 16l5-5 3 3 7-7M16 6h4v4" /></svg></span>
                <strong>{t("pricingHero.card.upgrade")}</strong>
              </div>
              <div className="pc-card pc-card-billing">
                <span className="pc-ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg></span>
                <div><strong>{t("pricingHero.card.billing.title")}</strong><span>{t("pricingHero.card.billing.body")}</span></div>
                <span className="pc-toggle" />
              </div>
              <div className="pc-mini-row">
                <div className="pc-mini">
                  <span className="pc-ico"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg></span>
                  <strong>{t("pricingHero.mini.fees.title")}</strong><span>{t("pricingHero.mini.fees.body")}</span>
                </div>
                <div className="pc-mini">
                  <span className="pc-ico"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5M20 12a8 8 0 01-14 5M17 4v3h-3M7 20v-3h3" /></svg></span>
                  <strong>{t("pricingHero.mini.change.title")}</strong><span>{t("pricingHero.mini.change.body")}</span>
                </div>
                <div className="pc-mini">
                  <span className="pc-ico"><svg viewBox="0 0 24 24"><path d="M5 13v-1a7 7 0 0114 0v1M5 13h2v5H6a2 2 0 01-2-2zM19 13h-2v5h1a2 2 0 002-2z" /></svg></span>
                  <strong>{t("pricingHero.mini.support.title")}</strong><span>{t("pricingHero.mini.support.body")}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section" id="pricing-plans">
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
                <p className="public-addon-price">£9 / month · £90 / year</p>
                <p>{t("pricingPage.addon100.body")}</p>
                <Link href="/plan" className="public-button secondary">{t("cta.openPortal")}</Link>
              </article>
              <article className="public-card public-addon-card" data-addon="200">
                <span className="public-eyebrow">{t("pricingPage.addon.label")}</span>
                <h3>{t("pricingPage.addon200.title")}</h3>
                <p className="public-addon-price">£15 / month · £150 / year</p>
                <p>{t("pricingPage.addon200.body")}</p>
                <Link href="/plan" className="public-button secondary">{t("cta.openPortal")}</Link>
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
  // Disposable/blocked email domain (Auth blocking function).
  if (/disposable|permanent email/i.test(raw)) return t("signup.error.disposableEmail");
  // Blocking/Cloud Function errors arrive wrapped as a JSON envelope
  // ("...returned an error: {\"error\":{\"message\":\"...\"}} (auth/internal-error)").
  // Surface the inner human message instead of the raw Firebase string.
  const inner = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (inner && inner[1]) return inner[1];
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
    // Silent bot traps: an invisible field real users never see/fill, and the
    // moment the form first mounted (to reject instant automated submissions).
    const [honeypot, setHoneypot] = useState("");
    const [formStartedAt] = useState(() => Date.now());

    // Count a signup-page visit only when the visitor arrived from the
    // /custom-order-management landing page (attribution marker or referrer).
    useEffect(() => {
      const fromLanding = getLandingAttribution() !== null ||
        (typeof document !== "undefined" && document.referrer.includes("/custom-order-management"));
      if (fromLanding) trackLandingEvent("custom_order_landing_signup_visit");
    }, []);

    async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setError(null);

      // Bot traps: either tripping means an automated submission; reject quietly.
      if (honeypot.trim() !== "" || Date.now() - formStartedAt < 1500) {
        setError(t("signup.error.generic"));
        return;
      }

      const cleanFullName = fullName.trim();
      const cleanWorkspaceName = workspaceName.trim();
      const cleanEmail = email.trim();

      if (cleanFullName.length < 2 || cleanWorkspaceName.length < 2) {
        setError(t("signup.error.required"));
        return;
      }
      if (!auth.currentUser && (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
        setError(t("signup.error.passwordStrength"));
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
          // Non-blocking email verification: standard account-security hygiene.
          void sendEmailVerification(credential.user, { url: "https://nivadesk.app/login" }).catch(() => undefined);
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
        // Credit the completed signup to the landing page if this visitor came
        // from it, then clear the marker so it is counted at most once.
        if (getLandingAttribution() !== null) {
          trackLandingEvent("custom_order_landing_signup_completed");
          fireGoogleAdsSignupConversion();
          clearLandingAttribution();
        }
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
            {/* Honeypot: off-screen field hidden from real users. Bots that
                auto-fill every input trip it and are rejected. */}
            <div className="public-signup-hp" aria-hidden="true">
              <label htmlFor="nd-company-url">Company website</label>
              <input
                id="nd-company-url"
                name="company_url"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={event => setHoneypot(event.target.value)}
              />
            </div>
            <span className="public-eyebrow">{t("signup.form.eyebrow")}</span>
            <h2>{t("signup.form.title")}</h2>
            <p>{t("signup.form.body")}</p>
            {!user ? (
              <>
                <AuthProviderButtons
                  appleLabel={t("auth.apple")}
                  googleLabel={t("auth.google")}
                  appleUnavailableMessage={t("auth.appleUnavailable")}
                  disabled={submitting}
                  onStart={() => setError(null)}
                  onSuccess={() => setError(null)}
                  onError={message => {
                    if (message) setError(message);
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                  <div style={{ height: 1, background: "rgba(31,35,38,0.12)", flex: 1 }} />
                  <span style={{ color: "var(--public-muted, #6b7280)", fontSize: 12, fontWeight: 700 }}>{t("login.or")}</span>
                  <div style={{ height: 1, background: "rgba(31,35,38,0.12)", flex: 1 }} />
                </div>
              </>
            ) : null}
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

        {FAQ_GROUPS.map(group => (
          <section className="public-section faq-group-section" key={group.categoryKey}>
            <div className="public-shell">
              <h2 className="faq-category-title">{t(group.categoryKey)}</h2>
              <div className="public-info-list">
                {group.items.map(item => (
                  <article className="public-card public-info-card" key={item.titleKey}>
                    <h3>{t(item.titleKey)}</h3>
                    <p>{t(item.bodyKey)}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
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

function GuideBlocks({ node }: { node: GuideNode }) {
  return (
    <>
      {node.blocks.map((block, i) => {
        if (block.kind === "para") return <p key={i} className="guide-para">{block.text}</p>;
        if (block.kind === "sub") return <h3 key={i} className="guide-subheading">{block.text}</h3>;
        if (block.kind === "steps") {
          return (
            <ol key={i} className="guide-steps">
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ol>
          );
        }
        return (
          <ul key={i} className="guide-points">
            {block.items.map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        );
      })}
    </>
  );
}

const GUIDE_NO_RESULTS: Record<string, string> = {
  "Türkçe": "Sonuç yok",
  "Deutsch": "Keine Treffer",
  "Français": "Aucun résultat",
  "Italiano": "Nessun risultato",
  "Español (Spanish)": "Sin resultados",
  "Português": "Sem resultados",
  "Русский (Russian)": "Ничего не найдено",
  "日本語 (Japanese)": "該当なし",
  "中文 (Chinese)": "无结果",
  "العربية (Arabic)": "لا نتائج",
  "हिन्दी (Hindi)": "कोई परिणाम नहीं"
};

export function PublicGuidePage() {
  const Page = () => {
    const { language } = usePublicSiteLanguage();
    const chrome = getGuideChrome(language);
    const tree = getGuideTree(language);

    const flat = useState(() => {
      const list: GuideNode[] = [];
      tree.forEach(node => {
        list.push(node);
        node.children?.forEach(child => list.push(child));
      });
      return list;
    })[0];

    const [selectedId, setSelectedId] = useState(tree[0]?.id ?? "");

    useEffect(() => {
      const fromHash = decodeURIComponent(window.location.hash.replace("#", ""));
      if (fromHash && flat.some(node => node.id === fromHash)) {
        setSelectedId(fromHash);
      }
    }, [flat]);

    const selected = flat.find(node => node.id === selectedId) ?? tree[0];
    const [query, setQuery] = useState("");

    function select(id: string) {
      setSelectedId(id);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${id}`);
      }
    }

    const nodeText = (node: GuideNode) => {
      const parts: string[] = [node.title];
      node.blocks.forEach(block => {
        if (block.kind === "para" || block.kind === "sub") parts.push(block.text);
        else parts.push(block.items.join(" "));
      });
      return parts.join(" ").toLowerCase();
    };

    const q = query.trim().toLowerCase();
    const groups = tree
      .map(node => {
        const kids = node.children ?? [];
        const parentMatch = !q || nodeText(node).includes(q);
        const childMatches = q ? kids.filter(child => nodeText(child).includes(q)) : kids;
        const visibleKids = !q ? kids : parentMatch ? kids : childMatches;
        const show = !q || parentMatch || childMatches.length > 0;
        return { node, visibleKids, show };
      })
      .filter(group => group.show);

    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{chrome.eyebrow}</span>
            <h1>{chrome.title}</h1>
            <p>{chrome.intro}</p>
            <p className="public-legal-updated">
              {chrome.lastUpdated}: {GUIDE_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell guide-layout">
            <nav className="guide-nav" aria-label={chrome.menuLabel}>
              <input
                className="guide-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={chrome.searchPlaceholder}
                aria-label={chrome.searchPlaceholder}
              />
              <span className="guide-nav-title">{chrome.menuLabel}</span>
              {groups.map(({ node, visibleKids }) => (
                <div key={node.id} className="guide-nav-group">
                  <button
                    type="button"
                    className={node.id === selectedId ? "guide-nav-item is-active" : "guide-nav-item"}
                    aria-current={node.id === selectedId ? "true" : undefined}
                    onClick={() => select(node.id)}
                  >
                    {node.title}
                  </button>
                  {visibleKids.length > 0 ? (
                    <div className="guide-nav-children">
                      {visibleKids.map(child => (
                        <button
                          key={child.id}
                          type="button"
                          className={child.id === selectedId ? "guide-nav-subitem is-active" : "guide-nav-subitem"}
                          aria-current={child.id === selectedId ? "true" : undefined}
                          onClick={() => select(child.id)}
                        >
                          {child.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {groups.length === 0 ? (
                <p className="guide-nav-empty">{GUIDE_NO_RESULTS[language as string] ?? "No matches"}</p>
              ) : null}
            </nav>

            <article className="guide-detail" key={selected.id}>
              <h2>{selected.title}</h2>
              <GuideBlocks node={selected} />
            </article>
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

export function PublicChangelogPage() {
  const Page = () => {
    const { language } = usePublicSiteLanguage();
    const labels = getChangelogLabels(language);
    const tagClass: Record<ChangeTag, string> = {
      new: "changelog-tag changelog-tag-new",
      improved: "changelog-tag changelog-tag-improved",
      fixed: "changelog-tag changelog-tag-fixed"
    };
    return (
      <>
        <section className="public-page-hero public-info-hero">
          <div className="public-shell">
            <span className="public-eyebrow">{labels.eyebrow}</span>
            <h1>{labels.title}</h1>
            <p>{labels.intro}</p>
            <p className="public-legal-updated">
              {labels.lastUpdated}: {CHANGELOG_LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-shell changelog-list">
            {CHANGELOG.map((entry, index) => (
              <article key={entry.version} className="changelog-entry">
                <header className="changelog-entry-head">
                  <div className="changelog-version">
                    <span className="changelog-version-number">{labels.versionWord} {entry.version}</span>
                    {index === 0 ? <span className="changelog-latest-pill">{labels.latest}</span> : null}
                  </div>
                  <time className="changelog-date">{entry.date}</time>
                </header>
                {entry.highlight ? <p className="changelog-highlight">{entry.highlight}</p> : null}
                <ul className="changelog-changes">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="changelog-change">
                      <span className={tagClass[change.tag]}>{labels.tags[change.tag]}</span>
                      <span className="changelog-change-text">{change.text}</span>
                    </li>
                  ))}
                </ul>
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
