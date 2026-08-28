"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  type GuideNode
} from "@/lib/publicSite/guideChrome";
import { loadUserGuide, type UserGuideResult } from "@/lib/publicSite/userGuide";
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
import SupportChatWidget from "@/components/SupportChatWidget";

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
    titleKey: "feature.portal.title",
    eyebrowKey: "feature.portal.eyebrow",
    bodyKey: "feature.portal.body",
    bulletKeys: ["feature.portal.bullet1", "feature.portal.bullet2", "feature.portal.bullet3", "feature.portal.bullet4"],
    tone: "sky",
    metricKey: "feature.portal.metric",
    artifactKey: "feature.portal.artifact"
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
  { titleKey: "orderCard.repairIntake", detailKey: "orderCard.repairIntake.detail", icon: "shippingBox" },
  { titleKey: "orderCard.estimate", detailKey: "orderCard.estimate.detail", icon: "finance" },
  { titleKey: "orderCard.customerPortal", detailKey: "orderCard.customerPortal.detail", icon: "customer" },
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

// Follow-up report: 19 titles at once read as noise. The grid keeps every
// card but seats them under five category labels so a visitor scans the
// shape of the system before the parts.
const ORDER_CARD_GROUPS: { labelKey: PublicSiteTranslationKey; titleKeys: string[] }[] = [
  { labelKey: "orderCards.group.customer", titleKeys: ["orderCard.customer", "orderCard.customerPortal", "orderCard.clientFiles"] },
  { labelKey: "orderCards.group.work", titleKeys: ["orderCard.todo", "orderCard.workTime", "orderCard.status", "orderCard.schedule"] },
  { labelKey: "orderCards.group.order", titleKeys: ["orderCard.preview", "orderCard.summary", "orderCard.delivery", "orderCard.priority", "orderCard.shipping"] },
  { labelKey: "orderCards.group.money", titleKeys: ["orderCard.estimate", "orderCard.invoiceItems", "orderCard.financial"] },
  { labelKey: "orderCards.group.items", titleKeys: ["orderCard.repairIntake", "orderCard.materials", "orderCard.notes", "orderCard.history"] }
];

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
    titleKey: "planBridge.helpAssistant.title",
    bodyKey: "planBridge.helpAssistant.body",
    planKeys: ["lifetime_lite", "pro_monthly", "team_monthly"]
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
      { titleKey: "faq.q24.title", bodyKey: "faq.q24.body" },
      { titleKey: "faq.q25.title", bodyKey: "faq.q25.body" }
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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();
    let revealIndex = 0;

    const observer = prefersReducedMotion
      ? null
      : new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          });
        }, { rootMargin: "-8% 0px -12% 0px", threshold: 0.16 });

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".public-scroll-reveal, .public-scroll-stagger > *").forEach(target => {
        if (seen.has(target)) return;
        seen.add(target);
        target.style.setProperty("--reveal-index", String(revealIndex++ % 8));
        if (observer) observer.observe(target);
        else target.classList.add("is-visible");
      });
    };

    scan();

    // If React replaces part of the tree (a remount swaps in fresh nodes
    // without is-visible), pick the new nodes up rather than leaving them
    // stuck at opacity 0.
    const mutations = new MutationObserver(scan);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
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
      <span aria-hidden="true">🌐</span>
      <select
        aria-label={t("language.selectorLabel")}
        value={language}
        onChange={event => handleLanguageChange(event.target.value)}
        onInput={event => handleLanguageChange(event.currentTarget.value)}
      >
        {languages.map(option => (
          <option key={option} value={option}>{option.replace(/\s*\([^)]*\)\s*$/, "")}</option>
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
          <img className="public-brand-logo" src="/brand/nivadesk-logo.png" alt="" aria-hidden="true" />
        </Link>

        <nav className="public-nav-links" aria-label={t("nav.publicPages")}>
          <Link href="/">{t("nav.home")}</Link>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
          <Link href="/security">{t("nav.security")}</Link>
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
          <Link href="/security" onClick={closeMenu}>{t("nav.security")}</Link>
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
            <h2>{t("footer.product")}</h2>
            <nav aria-label={t("footer.product")}>
              <Link href="/features">{t("nav.features")}</Link>
              <Link href="/chatgpt">{t("nav.chatgpt")}</Link>
              <Link href="/pricing">{t("nav.pricing")}</Link>
              <Link href="/guide">{t("nav.guide")}</Link>
              <Link href="/faq">{t("nav.faq")}</Link>
              <Link href="/changelog">{t("nav.changelog")}</Link>
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">App Store</a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Google Play</a>
            </nav>
          </section>
          <section className="public-footer-group">
            <h2>{t("footer.legal")}</h2>
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
            <h2>{t("footer.support")}</h2>
            <nav aria-label={t("footer.support")}>
              <Link href="/contact">{t("nav.contact")}</Link>
              <Link href="/account-deletion">{t("nav.accountDeletion")}</Link>
              <Link href="/refund-cancellation">{t("nav.refundCancellation")}</Link>
              <Link href="/login">{t("cta.login")}</Link>
            </nav>
          </section>
        </div>
        <div className="public-footer-meta">
          <span>{t("footer.rights").replace("\u00A9", `\u00A9 ${new Date().getFullYear()}`)}</span>
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
  const { dir, t } = usePublicSiteLanguage();
  const pathname = usePathname();
  usePublicScrollReveal(pathname);

  return (
    <div className="public-site" dir={dir}>
      <SiteVisitBeacon />
      <GoogleAdsTag />
      <a href="#public-main" className="public-skip-link">{t("nav.skipToContent")}</a>
      <PublicHeader />
      <main id="public-main">{children}</main>
      <PublicFooter />
      <SupportChatWidget />
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
  const [shotOpen, setShotOpen] = useState(false);
  useEffect(() => {
    setCurrencySymbol(heroCurrencySymbol());
  }, []);
  useEffect(() => {
    if (!shotOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShotOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [shotOpen]);
  return (
    <div className="public-hero-visual">
      <div className="hero-app-shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero-app2.webp" alt="NivaDesk order workspace" loading="eager" />
        <button type="button" className="hero-shot-zoom" onClick={() => setShotOpen(true)}>
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4M9 6.5v5M6.5 9h5" />
          </svg>
          {t("hero.seeFullSize")}
        </button>
      </div>
      {shotOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="public-qr-modal-backdrop" role="presentation" onClick={() => setShotOpen(false)}>
              <div
                className="public-shot-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("hero.seeFullSize")}
                onClick={event => event.stopPropagation()}
              >
                {/* autoFocus moves keyboard focus into the dialog when it opens. */}
                <button type="button" className="public-qr-modal-close" onClick={() => setShotOpen(false)} aria-label="Close" autoFocus>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hero-app2.webp" alt="NivaDesk order workspace" />
                <p className="public-shot-caption">{t("hero.shotCaption")}</p>
              </div>
            </div>,
            document.body
          )
        : null}
      {/* The mock's stat strip: four small live-looking cards above the shot
          instead of scattered floats. */}
      <div className="hero-stat-strip" aria-hidden="true">
        <div className="hero-stat-card">
          <span className="hero-float-icon" data-tone="sage">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></svg>
          </span>
          <div><strong>{t("heroFloat.ordersTitle")}</strong><span>{t("heroFloat.ordersSub")}</span></div>
        </div>
        <div className="hero-stat-card">
          <span className="hero-float-icon" data-tone="green">
            <span className="hero-float-currency">{currencySymbol}</span>
          </span>
          <div><strong>{t("heroFloat.receivedTitle").replace(/^[^\d]+/, currencySymbol)}</strong><span>{t("heroFloat.receivedSub")}</span></div>
        </div>
        <div className="hero-stat-card">
          <span className="hero-float-icon" data-tone="blue">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6h9v8h-9zM11.5 9h3.2l2.8 2.6V14h-6M5.5 14.4a1.6 1.6 0 1 0 3.2 0M12.5 14.4a1.6 1.6 0 1 0 3.2 0" /></svg>
          </span>
          <div><strong>{t("heroStat.transitTitle")}</strong><span>{t("heroStat.transitSub")}</span></div>
        </div>
        <div className="hero-stat-card">
          <span className="hero-float-icon" data-tone="violet">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
          </span>
          <div><strong>{t("heroStat.tasksTitle")}</strong><span>{t("heroStat.tasksSub")}</span></div>
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
  const [selectedKey, setSelectedKey] = useState<string>(ORDER_CARDS[0].titleKey);
  const assembleRef = useOrderCardAssembly();
  const selectedCard = ORDER_CARDS.find(card => card.titleKey === selectedKey) ?? ORDER_CARDS[0];

  return (
    <div className="public-order-card-system" ref={assembleRef}>
      <div className="public-order-card-grid" aria-label={t("orderCards.aria")}>
        {ORDER_CARD_GROUPS.map(group => {
          const cards = group.titleKeys
            .map(key => ORDER_CARDS.find(card => card.titleKey === key))
            .filter((card): card is (typeof ORDER_CARDS)[number] => Boolean(card));
          const selectedInGroup = cards.findIndex(card => card.titleKey === selectedKey);
          return (
            <div className="public-order-card-group" key={group.labelKey}>
              <span className="public-order-card-group-label">{t(group.labelKey)}</span>
              <div className="public-order-card-group-grid">
                {cards.flatMap((card, index) => {
                  const globalIndex = ORDER_CARDS.findIndex(item => item.titleKey === card.titleKey);
                  const isSelected = selectedKey === card.titleKey;
                  const nodes: ReactNode[] = [
                    <div className="public-order-card-slot" key={card.titleKey}>
                      <article
                        className="public-order-card-chip"
                        data-active={isSelected ? "true" : "false"}
                        data-order-assemble-card="true"
                        data-tone={ORDER_CARD_TONES[globalIndex % ORDER_CARD_TONES.length]}
                      >
                        <button
                          aria-controls="public-order-card-detail-panel"
                          aria-pressed={isSelected}
                          className="public-order-card-toggle"
                          onClick={() => setSelectedKey(card.titleKey)}
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
                  // Phone only (CSS-controlled): the tapped card's description
                  // appears as a full-width strip right after its own row.
                  const isRowEnd = index % 2 === 1 || index === cards.length - 1;
                  if (isRowEnd && selectedInGroup >= 0 && Math.floor(index / 2) === Math.floor(selectedInGroup / 2)) {
                    nodes.push(
                      <p className="public-order-card-inline-detail" key="inline-detail">
                        {t(selectedCard.detailKey)}
                      </p>
                    );
                  }
                  return nodes;
                })}
              </div>
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

// Yearly is billed at ten times the monthly price, so a year costs two months
// less than paying monthly. The numbers let the cards show that saving instead
// of leaving visitors to work it out from the two prices.
const PLAN_PRICES: Partial<Record<StudioBillingPlan, { monthly: string; yearly: string; monthlyValue: number; yearlyValue: number }>> = {
  lifetime_lite: { monthly: "£9", yearly: "£90", monthlyValue: 9, yearlyValue: 90 },
  pro_monthly: { monthly: "£19", yearly: "£190", monthlyValue: 19, yearlyValue: 190 },
  team_monthly: { monthly: "£49", yearly: "£490", monthlyValue: 49, yearlyValue: 490 }
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
              {billing === "yearly" ? (
                <span className="public-plan-price-was">£{prices.monthlyValue * 12}</span>
              ) : null}
            </div>
            <div className="public-plan-price-alt">
              {/* On yearly this must be the monthly EQUIVALENT of the annual
                  price, not the monthly plan's own price — printing "£19 /
                  month" under "£190 / year" reads as what the yearly plan
                  costs per month, which it isn't. */}
              {billing === "yearly"
                ? `£${(prices.yearlyValue / 12).toFixed(2)} ${t("pricing.perMonthEquivalent")}`
                : `${prices.yearly} ${t("pricing.perYear")}`}
              {billing === "monthly" ? <span className="public-plan-save-pill">{t("pricing.twoMonthsFree")}</span> : null}
            </div>
            {billing === "yearly" ? (
              <div className="public-plan-save">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 10.5l3.2 3.2L15.5 6" />
                </svg>
                {t("pricing.yearlySave").replace("{amount}", `£${prices.monthlyValue * 12 - prices.yearlyValue}`)}
              </div>
            ) : null}
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

const YEARLY_PERKS: PublicSiteTranslationKey[] = [
  "pricing.yearlyPerk1",
  "pricing.yearlyPerk2",
  "pricing.yearlyPerk3"
];

// Reuses copy already on this page rather than adding an unverifiable
// "trusted by studios worldwide" style claim.
const BILLING_TRUST: PublicSiteTranslationKey[] = [
  "pricingHero.mini.fees.title",
  "pricingHero.trust.cancel",
  "pricingHero.trust.checkout"
];

function GiftMark() {
  return (
    <svg viewBox="0 0 96 88" fill="none" aria-hidden="true">
      <path d="M10 38h76v42a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#bfdedb" />
      <path d="M6 26h84v14H6z" fill="#8cc4bf" />
      <path d="M40 26h16v58H40z" fill="#2f6f6d" />
      <path d="M10 38h76" stroke="#2f6f6d" strokeWidth="2" opacity="0.35" />
      <path d="M48 26C40 26 30 22 30 14s10-6 14 0c3 4 4 8 4 12zM48 26c8 0 18-4 18-12s-10-6-14 0c-3 4-4 8-4 12z" fill="#2f6f6d" />
      <path d="M78 14l1.6 4.6L84 20l-4.4 1.4L78 26l-1.6-4.6L72 20l4.4-1.4zM16 8l1.2 3.4L20 13l-2.8 1L16 17l-1.2-3L12 13l2.8-1.6z" fill="#8cc4bf" />
    </svg>
  );
}

function ToggleCheck() {
  return (
    <span className="public-plan-toggle-check" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 10.5l3.2 3.2L15 6.5" />
      </svg>
    </span>
  );
}

function PublicPlanGrid({ compact = false }: { compact?: boolean }) {
  const { t, language } = usePublicSiteLanguage();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  // Yearly is ten monthly payments, so the same 17% holds for every paid plan.
  // Formatted per locale (Turkish writes %17, French 17 %) with Latin digits so
  // it matches the £ amounts on the cards.
  const savePercent = (() => {
    const locale = LANGUAGE_CURRENCY[language as StudioLanguage]?.locale ?? "en-GB";
    try {
      return new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: "percent", maximumFractionDigits: 0 }).format(2 / 12);
    } catch {
      return "17%";
    }
  })();
  const titleParts = t("pricing.yearlyBanner.title").split("{highlight}");
  const handNote = t("pricing.yearlyHandNote").replace("{percent}", savePercent);
  return (
    <>
      {!compact ? (
        <div className="public-plan-yearly-banner">
          <span className="public-plan-yearly-badge" aria-hidden="true">
            <span>{t("pricing.saveWord")}</span>
            <strong>{savePercent}</strong>
          </span>
          <div className="public-plan-yearly-copy">
            {/* h2, not h3: on /pricing this is the first heading after the
                page h1, so an h3 here skipped a level. */}
            <h2>
              {titleParts[0]}
              <span className="hero-accent">{t("pricing.twoMonthsFree")}</span>
              {titleParts[1] ?? ""}
            </h2>
            <p>{t("pricing.yearlyBanner.body")}</p>
          </div>
          <ul className="public-plan-yearly-perks">
            {YEARLY_PERKS.map(key => (
              <li key={key}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 10.5l3.2 3.2L15.5 6" />
                </svg>
                {t(key)}
              </li>
            ))}
          </ul>
          <span className="public-plan-yearly-gift" aria-hidden="true"><GiftMark /></span>
        </div>
      ) : null}
      {!compact ? (
        <div className="public-plan-toggle-row">
          <div className="public-plan-toggle">
            <button type="button" className={billing === "monthly" ? "active" : ""} onClick={() => setBilling("monthly")}>
              <strong>{t("pricing.toggleMonthly")}</strong>
              <span>{t("pricing.togglePayAsYouGo")}</span>
              {billing === "monthly" ? <ToggleCheck /> : null}
            </button>
            <button type="button" className={billing === "yearly" ? "active" : ""} onClick={() => setBilling("yearly")}>
              <strong>{t("pricing.toggleYearly")}</strong>
              <span>{t("pricing.twoMonthsFree")}</span>
              <span className="public-plan-toggle-flag">{t("pricing.mostValue")}</span>
              {billing === "yearly" ? <ToggleCheck /> : null}
            </button>
          </div>
          <span className="public-plan-toggle-hand" aria-hidden="true">
            <svg viewBox="0 0 46 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M44 4c-14 0-24 6-38 15" />
              <path d="M6 12.5 5.5 19.5l7-1.5" />
            </svg>
            {handNote}
          </span>
        </div>
      ) : null}
      {!compact ? (
        <ul className="public-plan-toggle-trust">
          {BILLING_TRUST.map(key => (
            <li key={key}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 3l5 2v4.2c0 3-2.2 5.4-5 6.3-2.8-.9-5-3.3-5-6.3V5z" /><path d="M7.8 9.8 9.5 11.5l3-3.2" />
              </svg>
              {t(key)}
            </li>
          ))}
        </ul>
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
            <Link href="/features#customisation" className="public-button secondary large">{t("accent.cta.customise")}</Link>
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
      <div className="public-shell">
        <p className="public-story-context">{t("scrollStory.context")}</p>
      </div>
      <div className="public-shell public-scroll-story-grid">
        <div className="public-scroll-stage" data-active-step={activeStep}>
          {/* Faithful mock of the app's real Shipping & Tracking card; the
              scroll steps drive the live-status panel through the journey. */}
          <div className="public-scroll-stage-window track-card">
            <div className="track-card-head">
              <span className="track-card-tool" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6.5h12M4 10h12M4 13.5h12" /></svg>
              </span>
              <span className="track-card-plane" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 4.5c.6.6.4 1.9-.5 2.8l-4.2 4.2 2.2 8.1-1.6 1.6-3.8-6.7-4.2 4.2.3 2.6-1.2 1.2-1.9-3.5-3.5-1.9 1.2-1.2 2.7.3 4.1-4.2-6.7-3.8L5.9 5l8.2 2.2 4.1-4.2c.9-.9 2.2-1.1 2.8-.5z" /></svg>
              </span>
              <strong>{t("trackCard.title")}</strong>
              <span className="track-card-menu" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10" cy="10" r="7.2" /><circle cx="6.8" cy="10" r="0.35" fill="currentColor" /><circle cx="10" cy="10" r="0.35" fill="currentColor" /><circle cx="13.2" cy="10" r="0.35" fill="currentColor" /></svg>
              </span>
            </div>
            <div className="track-card-body">
              <div className="track-row">
                <span className="track-label">{t("trackCard.dispatched")}</span>
                <span className="track-yesno">
                  <i data-state="yes-on">{t("trackCard.yes")}</i>
                  <i>{t("trackCard.no")}</i>
                </span>
              </div>
              <div className="track-sep" />
              <div className="track-row">
                <span className="track-label">{t("trackCard.courier")}</span>
                <span className="track-select">
                  {t("trackCard.autoDetect")}
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.8 8 10 4.8 13.2 8M6.8 12 10 15.2 13.2 12" /></svg>
                </span>
              </div>
              <div className="track-row">
                <span className="track-label">{t("trackCard.trackingNo")}</span>
                <span className="track-field">7282151310</span>
              </div>
              <div className="track-live" data-tone={STORY_STATUS_TONES[activeStep]}>
                <div className="track-live-head">
                  <span className="track-live-dot" aria-hidden="true" />
                  <strong>{t(STORY_STATUS_KEYS[activeStep])}</strong>
                  <span className="track-live-chip">17TRACK</span>
                </div>
                <div className="track-live-sep" />
                <div className="track-live-row">
                  <span className="track-live-label">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z" /><path d="M3.5 6 10 9.2 16.5 6M10 9.2v8" /></svg>
                    {t("trackCard.carrier")}
                  </span>
                  <strong>DHL Express</strong>
                </div>
                <div className="track-live-row">
                  <span className="track-live-label">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 5.5A7 7 0 1 1 3 10" /><path d="M3 5v3h3M10 6.5V10l2.5 1.5" /></svg>
                    {t("trackCard.lastUpdate")}
                  </span>
                  <strong>{t("trackCard.lastUpdateValue")}</strong>
                </div>
                <div className="track-live-row">
                  <span className="track-live-label">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8h13M7 3v3M13 3v3" /></svg>
                    {t("trackCard.estDelivery")}
                  </span>
                  <strong>{t("trackCard.estDeliveryValue")}</strong>
                </div>
                <div className="track-live-row track-live-row-block">
                  <span className="track-live-label">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="2.4" /><path d="M10 10.4V15M6.5 16.5h7M10 2.5a5.5 5.5 0 0 1 5.5 5.5" opacity="0" /><path d="M10 15c-2.8 0-5-1-5-2.2M15 12.8c0 1.2-2.2 2.2-5 2.2" opacity="0" /></svg>
                    {t("trackCard.checkpoint")}
                  </span>
                  <strong>{t(SCROLL_STORY_STEPS[activeStep].detailKey)}</strong>
                </div>
                <small>{t("trackCard.lastChecked")}</small>
              </div>
              <div className="track-actions">
                <span className="track-refresh">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15.5 8A6 6 0 1 0 16 11M15.5 4v4H12" /></svg>
                  {t("trackCard.refresh")}
                </span>
                <span className="track-compass" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z" /></svg>
                </span>
              </div>
              <div className="track-sep" />
              <div className="track-row">
                <span className="track-label">{t("trackCard.delivered")}</span>
                <span className="track-yesno">
                  <i data-state={activeStep === 3 ? "yes-on" : undefined}>{t("trackCard.yes")}</i>
                  <i data-state={activeStep === 3 ? undefined : "no-on"}>{t("trackCard.no")}</i>
                </span>
              </div>
            </div>
            <span className="track-card-grip" aria-hidden="true" />
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

const IMPORT_STEPS: PublicSiteTranslationKey[] = [
  "chatgptImport.step1",
  "chatgptImport.step2",
  "chatgptImport.step3"
];

export function ChatGPTAppShowcase({
  title,
  revealOnScroll = true,
  featured = false,
  showMoreLink = false
}: { title?: string; revealOnScroll?: boolean; featured?: boolean; showMoreLink?: boolean }) {
  const { t } = usePublicSiteLanguage();
  const currency = useLocaleCurrency();
  const queries: { key: PublicSiteTranslationKey; icon: ReactNode }[] = [
    { key: "chatgptApp.useCase1", icon: <path d="M5 3h10v14H5zM7.5 7h5M7.5 10h5M7.5 13h3" /> },
    { key: "chatgptApp.useCase2", icon: <path d="M4 16V9M9 16V4M14 16v-5" /> },
    { key: "chatgptApp.useCase3", icon: <path d="M4 16l.8-3 8-8 2.2 2.2-8 8-3 .8zM11.8 4.2l2.2 2.2" /> }
  ];
  const stats: {
    label: PublicSiteTranslationKey;
    value: PublicSiteTranslationKey;
    link: PublicSiteTranslationKey;
    tone: string;
    icon: ReactNode;
  }[] = [
    { label: "chatgptApp.resultMetric1Label", value: "chatgptApp.resultMetric1Value", link: "chatgptApp.tileLinkOrders", tone: "clock", icon: <><circle cx="10" cy="10" r="6.4" /><path d="M10 6.4V10l2.6 1.6" /></> },
    { label: "chatgptApp.resultMetric2Label", value: "chatgptApp.resultMetric2Value", link: "chatgptApp.tileLinkBreakdown", tone: "money", icon: <><rect x="2.5" y="5.5" width="15" height="9" rx="1.5" /><circle cx="10" cy="10" r="2" /><path d="M5 8.5v3M15 8.5v3" /></> },
    { label: "chatgptApp.metricNotesLabel", value: "chatgptApp.metricNotesValue", link: "chatgptApp.tileLinkNotes", tone: "notes", icon: <><path d="M6 3.5h8v13H6zM8 7h4M8 10h4M8 13h2.5" /></> }
  ];
  const highlights: PublicSiteTranslationKey[] = [
    "chatgptApp.highlight1",
    "chatgptApp.highlight2",
    "chatgptApp.highlight3"
  ];
  const trust: { key: PublicSiteTranslationKey; icon: ReactNode }[] = [
    { key: "chatgptApp.safeBadge1", icon: <path d="M10 3l5 2v4c0 3-2.2 5.4-5 6.4C7.2 14.4 5 12 5 9V5z" /> },
    { key: "chatgptApp.safeBadge2", icon: <path d="M7 9.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM13 9a2 2 0 100-4M3.2 16c0-2.2 1.7-3.9 3.8-3.9s3.8 1.7 3.8 3.9M12 12.1c2 0 3.8 1.3 3.8 3.9" /> },
    { key: "chatgptApp.safeBadge3", icon: <><rect x="5" y="9" width="10" height="7" rx="1.6" /><path d="M7.2 9V7.2a2.8 2.8 0 015.6 0V9" /></> }
  ];
  return (
    <section
      id={featured ? "chatgpt" : undefined}
      className={`public-section gpt-section${featured ? " gpt-section-featured" : ""}${revealOnScroll ? " public-scroll-reveal" : ""}`}
    >
      <div className="public-shell">
        <div className="public-section-header">
          {featured ? (
            <>
              <span className="gpt-eyebrow">
                <span className="gpt-eyebrow-logo"><GptMark /></span>
                {t("chatgptApp.eyebrow")}
              </span>
              <p className="gpt-bridge-line">{t("chatgptApp.bridge")}</p>
            </>
          ) : (
            <span className="public-eyebrow">{t("chatgptApp.eyebrow")}</span>
          )}
          <h2>{title ?? t("chatgptApp.sectionTitle")}</h2>
        </div>
      </div>
      {/* Migration story: the app's create_order tool means a studio can hand
          ChatGPT its old spreadsheets/invoices and have them land as orders,
          so nobody starts on an empty workspace. */}
      <div className="public-shell">
        <div className="gpt-import">
          <div className="gpt-import-intro">
            <h3>{t("chatgptImport.title")}</h3>
            <p>{t("chatgptImport.body")}</p>
          </div>
          <ol className="gpt-import-steps">
            {IMPORT_STEPS.map((key, index) => (
              <li className="gpt-import-step" key={key}>
                <span className="gpt-import-step-no" aria-hidden="true">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="gpt-import-note">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="9" width="10" height="7" rx="1.6" /><path d="M7.2 9V7.2a2.8 2.8 0 015.6 0V9" />
            </svg>
            {t("chatgptImport.note")}
          </p>
        </div>
      </div>
      <div className="public-shell gpt-grid">
        <div className="gpt-copy-card">
          <h3>{t("chatgptApp.titleLead")} <span className="hero-accent">{t("chatgptApp.titleAccent")}</span></h3>
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
        {/* Mock of the NivaDesk app running inside a real ChatGPT session:
            browser chrome, the ChatGPT sidebar with the connected app, the
            composer carrying the NivaDesk chip, and the answer it returns. */}
        <div className="gpt-demo-card">
          <div className="gpt-win">
            <div className="gpt-win-bar" aria-hidden="true">
              <span className="gpt-win-lights"><i /><i /><i /></span>
              <span className="gpt-win-chrome">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="14" height="11" rx="2" /><path d="M8 4.5v11" />
                </svg>
                <svg className="gpt-win-caret" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 8.5 10 12l3.5-3.5" />
                </svg>
              </span>
              <span className="gpt-win-url">chatgpt.com</span>
              <span className="gpt-win-chrome gpt-win-chrome-end">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" /><path d="M10 6.6v6.2M7.4 10.2 10 12.8l2.6-2.6" />
                </svg>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3v9M7 6l3-3 3 3M5 11.5v3.5h10v-3.5" />
                </svg>
              </span>
            </div>
            <div className="gpt-win-body">
              <div className="gpt-rail" aria-hidden="true">
                <span className="gpt-rail-mark"><GptMark /></span>
                <span className="gpt-rail-btn">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15.2 5 12l7-7 3 3-7 7zM12.2 5.8l2 2" />
                  </svg>
                </span>
                <span className="gpt-rail-btn">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="9" r="5" /><path d="m12.8 12.8 3.2 3.2" />
                  </svg>
                </span>
                <span className="gpt-rail-app">
                  <span className="gpt-rail-app-avatar">N</span>
                  <span className="gpt-rail-app-name">NivaDesk</span>
                  <span className="gpt-rail-app-state">
                    {t("chatgptApp.connectedBadge")}<i className="gpt-rail-dot" />
                  </span>
                </span>
              </div>

              <div className="gpt-thread">
                <div className="gpt-thread-top">
                  <span className="gpt-thread-model">
                    {t("chatgptApp.windowTitle")}
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6.5 8.5 10 12l3.5-3.5" />
                    </svg>
                  </span>
                  <span className="gpt-you">You</span>
                </div>

                <p className="gpt-agenda">{t("chatgptApp.agenda")}</p>

                <div className="gpt-composer">
                  <span className="gpt-composer-plus" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 5.5v9M5.5 10h9" /></svg>
                  </span>
                  <span className="gpt-composer-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="gpt-composer-chip-logo" src="/brand/nivadesk-mark-64.png" alt="" aria-hidden="true" width={20} height={20} loading="lazy" decoding="async" />
                    NivaDesk
                  </span>
                  <p className="gpt-composer-text">{t("chatgptApp.prompt")}</p>
                  <span className="gpt-composer-tools" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="7.6" y="3" width="4.8" height="8.4" rx="2.4" /><path d="M5 9.6a5 5 0 0 0 10 0M10 14.6V17" />
                    </svg>
                    <span className="gpt-composer-voice">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M5.5 8v4M8.5 5.5v9M11.5 7v6M14.5 8.6v2.8" />
                      </svg>
                    </span>
                  </span>
                </div>

                <div className="gpt-reply">
                  <span className="gpt-reply-avatar" aria-hidden="true"><GptMark /></span>
                  <div className="gpt-reply-body">
                    <p className="gpt-reply-text">{t("chatgptApp.answer")}</p>
                    <div className="gpt-result">
                      <div className="gpt-stats">
                        {stats.map(s => {
                          const isMoney = s.tone === "money";
                          return (
                            <div className="gpt-stat" key={s.label}>
                              <span className="gpt-stat-head">
                                <span className="gpt-stat-icon" data-tone={s.tone}>
                                  {isMoney
                                    ? <span className="gpt-stat-symbol">{currency.symbol}</span>
                                    : <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>}
                                </span>
                                <span className="gpt-stat-label">{t(s.label)}</span>
                              </span>
                              <strong>{isMoney ? currency.format(1028) : t(s.value)}</strong>
                              <span className="gpt-stat-link">
                                {t(s.link)}<span aria-hidden="true">→</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="gpt-highlights">
                        <strong>{t("chatgptApp.highlightsLabel")}</strong>
                        <ul>
                          {highlights.map(key => <li key={key}>{t(key)}</li>)}
                        </ul>
                      </div>
                    </div>
                    <div className="gpt-msg-actions" aria-hidden="true">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="7" y="7" width="8.5" height="8.5" rx="2" /><path d="M12.5 7V5.5a1.5 1.5 0 0 0-1.5-1.5H5.9A1.9 1.9 0 0 0 4 5.9V11a1.5 1.5 0 0 0 1.5 1.5H7" />
                      </svg>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9.2 9.4 3.6c1.2 0 1.9.8 1.7 2L10.8 8h3.4c1 0 1.7.9 1.4 1.8l-1.3 4.6c-.2.7-.8 1.2-1.5 1.2H6zM6 9.2v7.2H4.2V9.2z" />
                      </svg>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 10.8 10.6 16.4c-1.2 0-1.9-.8-1.7-2L9.2 12H5.8c-1 0-1.7-.9-1.4-1.8l1.3-4.6c.2-.7.8-1.2 1.5-1.2H14zM14 10.8V3.6h1.8v7.2z" />
                      </svg>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 8v4h2.2L10 15V5L6.7 8zM13 7.6a3.4 3.4 0 0 1 0 4.8" />
                      </svg>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15.5 7.5A6 6 0 1 0 16 11M15.5 4v3.5H12" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="gpt-composer gpt-composer-ask">
                  <span className="gpt-composer-plus" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 5.5v9M5.5 10h9" /></svg>
                  </span>
                  <span className="gpt-composer-placeholder">{t("chatgptApp.composerPlaceholder")}</span>
                  <span className="gpt-composer-tools" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="7.6" y="3" width="4.8" height="8.4" rx="2.4" /><path d="M5 9.6a5 5 0 0 0 10 0M10 14.6V17" />
                    </svg>
                    <span className="gpt-composer-voice">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M5.5 8v4M8.5 5.5v9M11.5 7v6M14.5 8.6v2.8" />
                      </svg>
                    </span>
                  </span>
                </div>

                <div className="gpt-win-note">
                  {trust.map(tr => (
                    <span className="gpt-win-note-item" key={tr.key}>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{tr.icon}</svg>
                      {t(tr.key)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showMoreLink ? (
        <div className="public-shell gpt-section-more-wrap">
          <div className="gpt-permission-summary">
            <strong>{t("chatgptApp.perm.title")}</strong>
            <ul>
              <li data-mark="yes">{t("chatgptApp.perm1")}</li>
              <li data-mark="yes">{t("chatgptApp.perm2")}</li>
              <li data-mark="yes">{t("chatgptApp.perm3")}</li>
              <li data-mark="no">{t("chatgptApp.perm4")}</li>
            </ul>
          </div>
          <div className="gpt-section-more">
            <Link href="/chatgpt" className="public-button ghost large">
              {t("aiPage.learnMore")}<span className="public-button-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/security" className="public-button ghost large">
              {t("aiPage.securityLink")}
            </Link>
          </div>
        </div>
      ) : null}
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
                <button type="button" className="public-qr-modal-close" onClick={() => setQrOpen(false)} aria-label="Close" autoFocus>
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
                <button type="button" className="public-qr-modal-close" onClick={() => setQrOpen(false)} aria-label="Close" autoFocus>
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

// Mock hub diagram: one order in the middle, the four life areas around it.
function ConnectedOrderDiagram() {
  const { t } = usePublicSiteLanguage();
  const sides: { titleKey: PublicSiteTranslationKey; subKey: PublicSiteTranslationKey; icon: ReactNode; tone: string }[] = [
    { titleKey: "orderCards.group.customer", subKey: "connected.customerSub", tone: "sage", icon: <><circle cx="10" cy="7" r="3" /><path d="M4.5 16.5c1-3 3-4.5 5.5-4.5s4.5 1.5 5.5 4.5" /></> },
    { titleKey: "orderCards.group.work", subKey: "connected.workSub", tone: "violet", icon: <><path d="M13 3.5l3.5 3.5-9 9H4v-3.5z" /></> },
    { titleKey: "orderCards.group.money", subKey: "connected.moneySub", tone: "green", icon: <><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5v7M8 8.2c0-.9.9-1.5 2-1.5s2 .6 2 1.4c0 2.2-4 1.2-4 3.4 0 .8.9 1.4 2 1.4s2-.6 2-1.5" /></> },
    { titleKey: "orderCards.group.items", subKey: "connected.itemsSub", tone: "gold", icon: <><path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z" /><path d="M3.5 6 10 9.2 16.5 6M10 9.2v8" /></> }
  ];
  return (
    <section className="public-section public-connected-section public-scroll-reveal">
      <div className="public-shell">
        <h2 className="public-connected-title">{t("section.flow.title")}</h2>
        <div className="public-connected-diagram">
          <svg className="public-connected-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M22 26 C 34 26, 36 42, 46 44" />
            <path d="M22 74 C 34 74, 36 58, 46 56" />
            <path d="M78 26 C 66 26, 64 42, 54 44" />
            <path d="M78 74 C 66 74, 64 58, 54 56" />
          </svg>
          <div className="public-connected-col">
            {sides.slice(0, 2).map(side => (
              <div className="public-card public-connected-card" data-side="left" key={side.titleKey}>
                <span className="hero-float-icon" data-tone={side.tone} aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{side.icon}</svg>
                </span>
                <div>
                  <strong>{t(side.titleKey)}</strong>
                  <span>{t(side.subKey)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="public-card public-connected-center">
            <div className="public-connected-center-head">
              <span className="public-connected-center-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 7V5.5a3.5 3.5 0 0 1 7 0V7M4 7h12l-.8 9.5H4.8z" /></svg>
              </span>
              <span className="public-connected-center-tag">{t("orderCards.group.order")}</span>
            </div>
            <div className="public-connected-center-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/order-bag-thumb.jpg" alt="" loading="lazy" decoding="async" />
              <div>
                <strong>Custom Leather Duffle Bag</strong>
                <span className="public-connected-status">{t("connected.status")}</span>
              </div>
            </div>
            <div className="public-connected-chips" aria-hidden="true">
              <span><i data-tone="green" />{t("connected.chipTimeline")}</span>
              <span><i data-tone="blue" />{t("connected.chipFiles")}</span>
              <span><i data-tone="gold" />{t("connected.chipNotes")}</span>
            </div>
          </div>
          <div className="public-connected-col">
            {sides.slice(2).map(side => (
              <div className="public-card public-connected-card" data-side="right" key={side.titleKey}>
                <span className="hero-float-icon" data-tone={side.tone} aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{side.icon}</svg>
                </span>
                <div>
                  <strong>{t(side.titleKey)}</strong>
                  <span>{t(side.subKey)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Mock customisation card: a small kanban with one card mid-drag.
function CustomisationShowcase() {
  const { t } = usePublicSiteLanguage();
  const columns: { titleKey: PublicSiteTranslationKey; tasks: { key: PublicSiteTranslationKey; pri: PublicSiteTranslationKey; tone: string }[] }[] = [
    { titleKey: "kanban.col1", tasks: [{ key: "kanban.task1", pri: "kanban.priHigh", tone: "red" }] },
    { titleKey: "kanban.col2", tasks: [{ key: "kanban.task2", pri: "kanban.priMedium", tone: "amber" }] },
    { titleKey: "kanban.col3", tasks: [{ key: "kanban.task3", pri: "kanban.priMedium", tone: "amber" }] },
    { titleKey: "kanban.col4", tasks: [{ key: "kanban.task4", pri: "kanban.priLow", tone: "green" }] }
  ];
  return (
    <section className="public-section public-kanban-section public-scroll-reveal">
      <div className="public-shell public-card public-kanban-card">
        <h2>{t("accent.title")}</h2>
        <div className="public-kanban" aria-hidden="true">
          {columns.map(column => (
            <div className="public-kanban-col" key={column.titleKey}>
              <span className="public-kanban-col-title">{t(column.titleKey)}</span>
              {column.tasks.map(task => (
                <div className="public-kanban-task" key={task.key}>
                  <strong>{t(task.key)}</strong>
                  <span className="public-kanban-pri" data-tone={task.tone}>{t(task.pri)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="public-kanban-task is-dragging" aria-hidden="true">
            <strong>{t("kanban.task5")}</strong>
            <span className="public-kanban-pri" data-tone="amber">{t("kanban.priMedium")}</span>
          </div>
        </div>
        <p className="public-kanban-caption">{t("kanban.caption")}</p>
      </div>
    </section>
  );
}

// Mock compact tracking strip; the full scroll story lives on /features now.
function ShippingStrip() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-shipstrip-section public-scroll-reveal">
      <div className="public-shell public-card public-shipstrip-card">
        <h2>{t("shippingStrip.title")}</h2>
        <div className="public-shipstrip" aria-hidden="true">
          {([
            ["scrollStory.status1", <><path key="i" d="M7 4.5h6v2.2H7zM5.2 5.6h9.6l-.7 10.4H5.9zM8.2 10.2l1.5 1.5 2.6-2.8" /></>],
            ["scrollStory.status2", <><path key="i" d="M2.5 6.6h8.6v7h-8.6zM11.1 9h3l2.4 2.3v2.3h-5.4M4.9 15.6a1.5 1.5 0 1 0 3 0M11.9 15.6a1.5 1.5 0 1 0 3 0" /></>],
            ["scrollStory.status3", <><circle key="c" cx="11" cy="4" r="1.6" /><path key="i" d="M10.6 6.4 8 9.6l2.3 2-.7 4.6M8 9.6l-2.4-.8M10.3 11.6l2.9 1 1.4 3.4M11.8 8.4l3 .8" /></>],
            ["scrollStory.status4", <><path key="i" d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z" /><path key="j" d="M3.5 6 10 9.2 16.5 6M10 9.2v8" /></>]
          ] as Array<[PublicSiteTranslationKey, ReactNode]>).map(([key, icon]) => (
            <div className="public-shipstrip-step" key={key}>
              <span className="public-shipstrip-icon">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              </span>
              <span className="public-shipstrip-label">
                {t(key)}
                <i className="public-shipstrip-check">✓</i>
              </span>
            </div>
          ))}
        </div>
        <Link href="/features#shipping" className="public-shipstrip-link">
          {t("shippingStrip.link")}<span aria-hidden="true"> →</span>
        </Link>
      </div>
    </section>
  );
}

// Follow-up report items 37-38: answer the visitor's last objections right
// before the final CTA — three plan one-liners and three FAQ links, nothing
// that adds real page height.
function HomePricingSummary() {
  const { t } = usePublicSiteLanguage();
  return (
    <section className="public-section public-home-pricing public-scroll-reveal">
      <div className="public-shell">
        <h2 className="public-home-pricing-title">{t("homePricing.simpleTitle")}</h2>
        <div className="public-home-pricing-grid">
          <div className="public-card public-home-pricing-card">
            <strong>Free</strong>
            <span className="public-home-pricing-note">{t("homePricing.freeSub")}</span>
            <span className="public-home-pricing-price">£0 <em>{t("homePricing.forever")}</em></span>
          </div>
          <div className="public-card public-home-pricing-card is-featured">
            <span className="public-home-pricing-badge">{t("plan.pro.badge")}</span>
            <strong>Pro</strong>
            <span className="public-home-pricing-note">{t("homePricing.proSub")}</span>
            <span className="public-home-pricing-price">£19 <em>{t("homePricing.perMonth")}</em></span>
          </div>
          <div className="public-card public-home-pricing-card">
            <strong>Team</strong>
            <span className="public-home-pricing-note">{t("homePricing.teamSub")}</span>
            <span className="public-home-pricing-price">£49 <em>{t("homePricing.perMonth")}</em></span>
          </div>
        </div>
        <div className="public-home-pricing-more">
          <Link href="/pricing" className="public-button ghost">{t("homePricing.cta")}<span className="public-button-arrow" aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>
  );
}

function HomeFaqSummary() {
  const { t } = usePublicSiteLanguage();
  const items: Array<[PublicSiteTranslationKey, PublicSiteTranslationKey]> = [
    ["homeFaq.q1", "homeFaq.a1"],
    ["homeFaq.q2", "homeFaq.a2"],
    ["homeFaq.q3", "homeFaq.a3"]
  ];
  return (
    <section className="public-section public-home-faq public-scroll-reveal">
      <div className="public-shell">
        <h2 className="public-home-faq-title">{t("homeFaq.title")}</h2>
        <div className="public-home-faq-list">
          {items.map(([q, a]) => (
            <details className="public-card public-home-faq-item" key={q}>
              <summary>{t(q)}<span aria-hidden="true">▾</span></summary>
              <p>{t(a)}</p>
            </details>
          ))}
        </div>
        <div className="public-home-faq-more">
          <Link href="/faq">{t("homeFaq.more")}</Link>
        </div>
      </div>
    </section>
  );
}
// The newer back-office areas (the global-website report asked the home page
// to say these exist so visitors understand NivaDesk is more than the order
// board). Short cards only — the deep explanations live on /features and in
// the in-app guide.
const ADVANCED_AREAS = [
  { id: "inventory", titleKey: "adv.inventory.title", bodyKey: "adv.inventory.body" },
  { id: "banking", titleKey: "adv.banking.title", bodyKey: "adv.banking.body" },
  { id: "estimates", titleKey: "adv.estimates.title", bodyKey: "adv.estimates.body" },
  { id: "repairs", titleKey: "adv.repairs.title", bodyKey: "adv.repairs.body" },
  { id: "files", titleKey: "adv.files.title", bodyKey: "adv.files.body" },
  { id: "domain", titleKey: "adv.domain.title", bodyKey: "adv.domain.body" }
] as const;

function AdvancedAreasSection({ detailed = false }: { detailed?: boolean }) {
  const { t } = usePublicSiteLanguage();
  const icons: Record<string, ReactNode> = {
    inventory: <><path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z" /><path d="M3.5 6 10 9.2 16.5 6M10 9.2v8" /></>,
    banking: <><path d="M3 8.5 10 4l7 4.5M4.5 9v6M8.2 9v6M11.8 9v6M15.5 9v6M3 16.5h14" /></>,
    estimates: <><path d="M6 3h8a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 14 17H6a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 6 3z" /><path d="M7.5 7h5M7.5 10h5M7.5 13h3" /></>,
    repairs: <><path d="M12.5 3.5a4 4 0 0 0-4.9 5L3 13.1V17h3.9l4.6-4.6a4 4 0 0 0 5-4.9l-2.6 2.6-2.4-.6-.6-2.4z" /></>,
    files: <><path d="M3 6l1.5-2h4l1 1.5H17v10.5H3z" /></>,
    domain: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2.2 2 3.3 4.4 3.3 7S12.2 15 10 17c-2.2-2-3.3-4.4-3.3-7S7.8 5 10 3z" /></>
  };
  const areaIcon = (id: string) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{icons[id]}</svg>
  );

  // On /features the same six areas are written out in full. The home tiles
  // link here, and until now they landed on a page that never said the words
  // inventory, banking, estimates or repairs — six of the product's larger
  // areas were missing from the page that exists to explain features. The body
  // copy already existed for the tile tooltips, in every language.
  //
  // Anchors are "area-", not "feature-": FEATURE_DEEP_DIVES already owns
  // #feature-files, and a second element with that id would send both links to
  // whichever came first.
  if (detailed) {
    return (
      <section className="public-section public-features-deep-section public-scroll-reveal">
        <div className="public-shell public-features-deep-panel">
          <div className="public-features-deep-copy">
            <span className="public-eyebrow">{t("section.backoffice.eyebrow")}</span>
            <h2>{t("section.backoffice.title")}</h2>
            <p>{t("section.backoffice.body")}</p>
          </div>
          <div className="public-features-deep-list">
            {ADVANCED_AREAS.map(area => (
              <article id={`area-${area.id}`} key={area.id}>
                <span className="public-features-deep-icon" aria-hidden="true">{areaIcon(area.id)}</span>
                <div className="public-features-deep-titles">
                  <h3>{t(area.titleKey)}</h3>
                  <p>{t(area.bodyKey)}</p>
                  {area.id === "domain" ? (
                    <a className="public-shipstrip-link" href="#customer-portal">
                      {t("section.backoffice.portalLink")}<span aria-hidden="true"> →</span>
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="public-section public-backoffice-section public-scroll-reveal">
      <div className="public-shell">
        <h2 className="public-backoffice-title">{t("section.backoffice.title")}</h2>
        <div className="public-backoffice-grid">
          {ADVANCED_AREAS.map(area => (
            <Link
              key={area.id}
              href={`/features#area-${area.id}`}
              className="public-card public-backoffice-tile"
              title={t(area.bodyKey)}
            >
              <span className="public-backoffice-icon" aria-hidden="true">{areaIcon(area.id)}</span>
              <span>{t(area.titleKey)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
function PublicHomePageContent() {
  const { t } = usePublicSiteLanguage();
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoFailed, setDemoFailed] = useState(false);

  return (
    <>
      <section className="public-hero">
        <ProductScene />
        <div className="public-shell public-hero-content">
          <div className="public-hero-copy public-scroll-reveal">
            <h1>
              {t("hero.titleLead")} <span className="hero-accent">{t("hero.titleAccent")}</span> {t("hero.titleTail")}
            </h1>
            <p>
              {(() => {
                const body = t("hero.body");
                const match = body.match(/^([^.。؟!]*[.。؟!])\s+([\s\S]*)$/);
                if (!match) return body;
                return <>{match[1]}<br />{match[2]}</>;
              })()}
            </p>
            <div className="public-hero-actions">
              <Link href="/signup" className="public-button large">{t("cta.startFree")}</Link>
              <button
                type="button"
                className="public-demo-button"
                onClick={() => {
                  setDemoOpen(true);
                  trackLandingEvent("homepage_demo_play");
                }}
              >
                <span className="public-demo-play-circle" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5.14v13.72L19 12z" /></svg>
                </span>
                <strong>{t("hero.watchDemo")}</strong>
              </button>
              <Link href="/pricing" className="public-hero-pricing-link">
                {t("cta.viewPricing")}<span aria-hidden="true"> →</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {demoOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="public-qr-modal-backdrop" role="presentation" onClick={() => setDemoOpen(false)}>
              <div
                className="public-demo-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("hero.watchDemo")}
                onClick={event => event.stopPropagation()}
              >
                <button type="button" className="public-qr-modal-close" onClick={() => setDemoOpen(false)} aria-label="Close" autoFocus>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <video
                  className="public-demo-video"
                  src="/nivadesk-demo.mp4"
                  poster="/nivadesk-demo-poster.jpg"
                  controls
                  autoPlay
                  playsInline
                  onEnded={() => trackLandingEvent("homepage_demo_complete")}
                  onError={() => setDemoFailed(true)}
                />
                {demoFailed ? (
                  <p className="public-demo-fallback">
                    <a href="/nivadesk-demo.mp4" target="_blank" rel="noopener noreferrer">{t("hero.demoFallback")}</a>
                  </p>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Mock-driven layout: connected-order diagram, customisation kanban,
          the (kept) ChatGPT showcase, back-office tiles, a compact tracking
          strip (the full scroll story now lives on /features), the (kept)
          platform section, then pricing and FAQ. */}

      <ConnectedOrderDiagram />

      <CustomisationShowcase />

      <ChatGPTAppShowcase featured showMoreLink />

      <AdvancedAreasSection />

      <ShippingStrip />

      <PlatformNote />

      <HomePricingSummary />

      <HomeFaqSummary />

      <section className="public-section public-cta-band public-scroll-reveal">
        <div className="public-shell public-cta-ready">
          <h2>{t("ctaBand.readyTitle")}</h2>
          <div className="public-cta-ready-actions">
            <Link href="/signup" className="public-button large">{t("cta.startFree")}</Link>
            <span className="public-cta-ready-note">{t("ctaBand.noCard")}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export function PublicHomePage() {

  return (
    <PublicShell>
      <PublicHomePageContent />
    </PublicShell>
  );
}

// Big click-to-play demo player (same pattern as the ads landing page): only
// the poster image loads until the visitor presses play. Plays and completes
// count into the main-site demo counters together with the homepage modal.
function SiteDemoPlayer() {
  const { t } = usePublicSiteLanguage();
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-demo-frame">
      {playing ? (
        <video
          className="lp-demo-video"
          src="/nivadesk-demo.mp4"
          poster="/nivadesk-demo-poster.jpg"
          controls
          autoPlay
          playsInline
          onEnded={() => trackLandingEvent("homepage_demo_complete")}
        />
      ) : (
        <button
          type="button"
          className="lp-demo-poster"
          onClick={() => {
            setPlaying(true);
            trackLandingEvent("homepage_demo_play");
          }}
          aria-label={t("hero.watchDemo")}
        >
          {/* Decorative here: the button already carries the accessible name
              via aria-label, so a matching alt would be announced twice. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nivadesk-demo-poster.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
          <span className="lp-demo-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5.14v13.72L19 12z" /></svg>
          </span>
          <span className="lp-demo-duration">1:17</span>
        </button>
      )}
    </div>
  );
}

function PublicFeaturesPageContent() {
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

      <ChatGPTAppShowcase featured showMoreLink />

      <section className="public-section public-features-demo-section">
        <div className="public-shell">
          <div className="public-section-header">
            <span className="public-eyebrow">{t("hero.watchDemo")}</span>
            <h2>{t("featuresDemo.title")}</h2>
          </div>
          <SiteDemoPlayer />
        </div>
      </section>

      <ScheduleTimelineShowcase />

      <FeatureWorkflowPanel />

      <FeatureDeepDiveSection />

      <AdvancedAreasSection detailed />

      {/* The shipping scroll story moved here from the home page (mock
          redesign); the home strip links to this anchor. */}
      <div id="shipping">
        <ScrollStoryShowcase />
      </div>

      <DashboardFinanceShowcase />

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

      <section className="public-section" id="customisation">
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

      <PlanFeatureBridgeSection />

      <PlatformNote />
    </>
  );
}

export function PublicFeaturesPage() {

  return (
    <PublicShell>
      <PublicFeaturesPageContent />
    </PublicShell>
  );
}

function PublicPricingPageContent() {
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
}

export function PublicPricingPage() {

  return (
    <PublicShell>
      <PublicPricingPageContent />
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

function PublicSignupPageContent() {
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
      {
        // Honour a same-site ?next= (e.g. the Shopify connect handshake).
        const nextParam = new URLSearchParams(window.location.search).get("next") || "";
        // Brand-new accounts land on Orders, not the dashboard: with no orders yet
        // the dashboard is a wall of zeros, and the first-project guide only ever
        // renders on /orders.
        router.replace(nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/orders");
      }
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
            <Link href="/orders" className="public-button large">{t("cta.openPortal")}</Link>
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
}

export function PublicSignupPage() {

  return (
    <PublicShell>
      <PublicSignupPageContent />
    </PublicShell>
  );
}

function PublicFaqPageContent() {
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
}

// The ChatGPT/AI page groups the app's real MCP tools: orders, notes, finance
// and banking. Each line maps to a tool that actually ships.
const AI_TOOL_GROUPS: {
  key: string;
  tone: string;
  titleKey: PublicSiteTranslationKey;
  items: PublicSiteTranslationKey[];
  icon: ReactNode;
}[] = [
  {
    key: "orders",
    tone: "sage",
    titleKey: "aiPage.g1.title",
    items: ["aiPage.g1.i1", "aiPage.g1.i2", "aiPage.g1.i3", "aiPage.g1.i4"],
    icon: <><rect x="5" y="3.5" width="10" height="13" rx="2" /><path d="M7.5 7h5M7.5 10h5M7.5 13h3" /></>
  },
  {
    key: "notes",
    tone: "gold",
    titleKey: "aiPage.g2.title",
    items: ["aiPage.g2.i1", "aiPage.g2.i2", "aiPage.g2.i3", "aiPage.g2.i4"],
    icon: <><path d="M4.5 16.5 5.6 12l7.6-7.6 3 3L8.6 15z" /><path d="M12.4 5.2l3 3" /></>
  },
  {
    key: "finance",
    tone: "sky",
    titleKey: "aiPage.g3.title",
    items: ["aiPage.g3.i1", "aiPage.g3.i2", "aiPage.g3.i3", "aiPage.g3.i4"],
    icon: <><path d="M4 15V9M9 15V5M14 15v-4" /><path d="M3 17.5h14" /></>
  },
  {
    key: "banking",
    tone: "violet",
    titleKey: "aiPage.g4.title",
    items: ["aiPage.g4.i1", "aiPage.g4.i2", "aiPage.g4.i3", "aiPage.g4.i4"],
    icon: <><path d="M3.5 8 10 4l6.5 4" /><path d="M5.5 8v6M9 8v6M14.5 8v6M3.5 16.5h13" /></>
  }
];

const AI_ASK_GROUPS: { key: string; labelKey: PublicSiteTranslationKey; items: PublicSiteTranslationKey[] }[] = [
  { key: "orders", labelKey: "aiPage.ask.l1", items: ["aiPage.ask.q1", "aiPage.ask.q2", "aiPage.ask.q3", "aiPage.ask.q4"] },
  { key: "money", labelKey: "aiPage.ask.l2", items: ["aiPage.ask.q5", "aiPage.ask.q6", "aiPage.ask.q7", "aiPage.ask.q8"] },
  { key: "notes", labelKey: "aiPage.ask.l3", items: ["aiPage.ask.q9", "aiPage.ask.q10", "aiPage.ask.q11"] }
];

const AI_RECEIPT_STEPS: PublicSiteTranslationKey[] = ["aiPage.receipts.s1", "aiPage.receipts.s2", "aiPage.receipts.s3"];

const AI_HONESTY: { titleKey: PublicSiteTranslationKey; bodyKey: PublicSiteTranslationKey; tone: string; icon: ReactNode }[] = [
  {
    titleKey: "aiPage.ai.c1.title",
    bodyKey: "aiPage.ai.c1.body",
    tone: "sky",
    icon: <path d="M10 2.4l1.7 4.6 4.6 1.7-4.6 1.7L10 15.4l-1.7-4.7L3.7 8.7l4.6-1.7z" />
  },
  {
    titleKey: "aiPage.ai.c2.title",
    bodyKey: "aiPage.ai.c2.body",
    tone: "gold",
    icon: <><rect x="3.5" y="4.5" width="13" height="11" rx="2" /><circle cx="10" cy="10" r="2.6" /></>
  },
  {
    titleKey: "aiPage.ai.c3.title",
    bodyKey: "aiPage.ai.c3.body",
    tone: "sage",
    icon: <><path d="M4 10.5l3.2 3.2L16 5" /><path d="M4 15.5h12" opacity="0" /></>
  }
];

const AI_SETUP_STEPS: PublicSiteTranslationKey[] = ["aiPage.setup.s1", "aiPage.setup.s2", "aiPage.setup.s3"];

const AI_TRUST_KEYS: PublicSiteTranslationKey[] = ["chatgptApp.safeBadge1", "chatgptApp.safeBadge2", "chatgptApp.safeBadge3"];

function PublicChatGPTPageContent() {
  const { t } = usePublicSiteLanguage();
  return (
    <>
      <section className="public-page-hero ai-hero">
        <div className="public-shell">
          <span className="gpt-eyebrow ai-hero-eyebrow">
            <span className="gpt-eyebrow-logo"><GptMark /></span>
            {t("chatgptApp.eyebrow")}
          </span>
          <h1>{t("aiPage.hero.title")}</h1>
          <p>{t("aiPage.hero.body")}</p>
          <div className="public-hero-actions ai-hero-actions">
            <Link href="/signup" className="public-button large">{t("cta.startFree")}</Link>
            <Link href="/pricing" className="public-button ghost large">{t("cta.viewPricing")}</Link>
          </div>
          <ul className="ai-hero-trust">
            {AI_TRUST_KEYS.map(key => (
              <li key={key}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3l5 2v4.2c0 3-2.2 5.4-5 6.3-2.8-.9-5-3.3-5-6.3V5z" /><path d="M7.8 9.8 9.5 11.5l3-3.2" />
                </svg>
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="ai-hero-note">{t("aiPage.hero.note")}</p>
        </div>
      </section>

      <ChatGPTAppShowcase featured />

      <section className="public-section ai-tools-section public-scroll-reveal">
        <div className="public-shell">
          <div className="public-section-header">
            <span className="public-eyebrow">{t("aiPage.tools.eyebrow")}</span>
            <h2>{t("aiPage.tools.title")}</h2>
            <p>{t("aiPage.tools.body")}</p>
          </div>
          <div className="ai-tool-grid public-scroll-stagger">
            {AI_TOOL_GROUPS.map(group => (
              <article className="ai-tool-card" key={group.key}>
                <span className="ai-tool-icon" data-tone={group.tone}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{group.icon}</svg>
                </span>
                <h3>{t(group.titleKey)}</h3>
                <ul>
                  {group.items.map(item => (
                    <li key={item}>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 10.5l3.2 3.2L15.5 6" />
                      </svg>
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section ai-ask-section public-scroll-reveal">
        <div className="public-shell">
          <div className="public-section-header">
            <span className="public-eyebrow">{t("aiPage.ask.eyebrow")}</span>
            <h2>{t("aiPage.ask.title")}</h2>
            <p>{t("aiPage.ask.body")}</p>
          </div>
          <div className="ai-ask-grid">
            {AI_ASK_GROUPS.map(group => (
              <div className="ai-ask-column" key={group.key}>
                <span className="ai-ask-label">{t(group.labelKey)}</span>
                <ul>
                  {group.items.map(item => (
                    <li key={item}>
                      <span className="ai-ask-quote" aria-hidden="true">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 5.5h12v8H9l-4 3v-3H4z" />
                        </svg>
                      </span>
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft ai-receipts-section public-scroll-reveal">
        <div className="public-shell ai-receipts-grid">
          <div className="ai-receipts-copy">
            <span className="public-eyebrow">{t("aiPage.receipts.eyebrow")}</span>
            <h2>{t("aiPage.receipts.title")}</h2>
            <p>{t("aiPage.receipts.body")}</p>
            <p className="ai-receipts-note">{t("aiPage.receipts.note")}</p>
          </div>
          <ol className="ai-receipt-steps">
            {AI_RECEIPT_STEPS.map((key, index) => (
              <li key={key}>
                <span className="ai-step-no">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="public-section ai-honesty-section public-scroll-reveal">
        <div className="public-shell">
          <div className="public-section-header">
            <span className="public-eyebrow">{t("aiPage.ai.eyebrow")}</span>
            <h2>{t("aiPage.ai.title")}</h2>
            <p>{t("aiPage.ai.body")}</p>
          </div>
          <div className="ai-honesty-grid public-scroll-stagger">
            {AI_HONESTY.map(card => (
              <article className="ai-honesty-card" key={card.titleKey}>
                <span className="ai-tool-icon" data-tone={card.tone}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg>
                </span>
                <h3>{t(card.titleKey)}</h3>
                <p>{t(card.bodyKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft ai-setup-section public-scroll-reveal">
        <div className="public-shell">
          <div className="public-section-header">
            <span className="public-eyebrow">{t("aiPage.setup.eyebrow")}</span>
            <h2>{t("aiPage.setup.title")}</h2>
          </div>
          <ol className="ai-setup-steps">
            {AI_SETUP_STEPS.map((key, index) => (
              <li key={key}>
                <span className="ai-step-no">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="ai-setup-note">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="9" width="10" height="7" rx="1.6" /><path d="M7.2 9V7.2a2.8 2.8 0 015.6 0V9" />
            </svg>
            {t("aiPage.setup.note")}
          </p>
        </div>
      </section>

      <section className="public-section public-cta-band public-scroll-reveal">
        <div className="public-shell public-cta-inner">
          <div>
            <span className="public-eyebrow">{t("aiPage.cta.eyebrow")}</span>
            <h2>{t("aiPage.cta.title")}</h2>
          </div>
          <HeroActions />
        </div>
      </section>
    </>
  );
}

export function PublicChatGPTPage() {
  return (
    <PublicShell>
      <PublicChatGPTPageContent />
    </PublicShell>
  );
}

export function PublicFaqPage() {

  return (
    <PublicShell>
      <PublicFaqPageContent />
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

      <section className="public-section" id="customer-portal">
        <div className="public-shell">
          <SectionHeader
            eyebrowKey="featuresDomain.eyebrow"
            titleKey="featuresDomain.title"
            bodyKey="featuresDomain.body"
          />
          <div className="public-advanced-grid">
            <article className="public-card public-advanced-card">
              <h3>{t("featuresDomain.sub1Title")}</h3>
              <p>{t("featuresDomain.sub1Body")}</p>
            </article>
            <article className="public-card public-advanced-card">
              <h3>{t("featuresDomain.sub2Title")}</h3>
              <p>{t("featuresDomain.sub2Body")}</p>
            </article>
            <article className="public-card public-advanced-card">
              <h3>{t("featuresDomain.sub3Title")}</h3>
              <p>{t("featuresDomain.brandingBody")}</p>
            </article>
          </div>
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

function PublicPrivacyPageContent() {
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
}

export function PublicPrivacyPage() {

  return (
    <PublicShell>
      <PublicPrivacyPageContent />
    </PublicShell>
  );
}

function PublicTermsPageContent() {
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
}

export function PublicTermsPage() {

  return (
    <PublicShell>
      <PublicTermsPageContent />
    </PublicShell>
  );
}

function PublicCookiePageContent() {
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
}

export function PublicCookiePage() {

  return (
    <PublicShell>
      <PublicCookiePageContent />
    </PublicShell>
  );
}

function PublicAccountDeletionPageContent() {
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
}

export function PublicAccountDeletionPage() {

  return (
    <PublicShell>
      <PublicAccountDeletionPageContent />
    </PublicShell>
  );
}

function PublicRefundCancellationPageContent() {
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
}

export function PublicRefundCancellationPage() {

  return (
    <PublicShell>
      <PublicRefundCancellationPageContent />
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

function PublicGuidePageContent() {
  const { language, t } = usePublicSiteLanguage();
  const { user, loading: authLoading } = useAuth();
  const chrome = getGuideChrome(language);

  // The guide is a paid-plan feature, so its content is not in this bundle: it
  // arrives from getUserGuide, which checks the plan. Signed-out readers skip
  // the round trip and go straight to the panel.
  const [state, setState] = useState<UserGuideResult | { status: "loading" }>({ status: "loading" });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ status: "locked" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    loadUserGuide(String(language)).then(result => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, language]);

  const tree = useMemo(() => (state.status === "ok" ? state.tree : []), [state]);

  const flat = useMemo(() => {
    const list: GuideNode[] = [];
    tree.forEach(node => {
      list.push(node);
      node.children?.forEach(child => list.push(child));
    });
    return list;
  }, [tree]);

  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!flat.length) return;
    const fromHash = decodeURIComponent(window.location.hash.replace("#", ""));
    setSelectedId(current => {
      if (current && flat.some(node => node.id === current)) return current;
      if (fromHash && flat.some(node => node.id === fromHash)) return fromHash;
      return flat[0]?.id ?? "";
    });
  }, [flat]);

  const selected = flat.find(node => node.id === selectedId) ?? flat[0];

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
          {state.status === "ok" ? (
            <p className="public-legal-updated">
              {chrome.lastUpdated}: {GUIDE_LAST_UPDATED}
            </p>
          ) : null}
        </div>
      </section>

      {state.status === "loading" || authLoading ? (
        <section className="public-section">
          <div className="public-shell">
            <p className="guide-nav-empty">{t("guide.loading")}</p>
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="public-section">
          <div className="public-shell">
            <p className="guide-nav-empty">{state.message}</p>
          </div>
        </section>
      ) : null}

      {state.status === "locked" ? (
        <section className="public-section">
          <div className="public-shell guide-locked">
            <h2>{user ? t("guide.locked.title") : t("guide.locked.signedOut.title")}</h2>
            <p>{user ? t("guide.locked.body") : t("guide.locked.signedOut.body")}</p>
            <p>{t("guide.locked.ask")}</p>
            <div className="public-hero-actions">
              <Link className="public-button" href="/pricing">
                {t("guide.locked.plansCta")}
              </Link>
              {user ? null : (
                <Link className="public-button public-button-ghost" href="/login">
                  {t("guide.locked.signInCta")}
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {state.status === "ok" && selected ? (
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
      ) : null}
    </>
  );
}

export function PublicGuidePage() {

  return (
    <PublicShell>
      <PublicGuidePageContent />
    </PublicShell>
  );
}

function PublicChangelogPageContent() {
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
            <article key={`${entry.version}-${entry.platform ?? "all"}`} className="changelog-entry">
              <header className="changelog-entry-head">
                <div className="changelog-version">
                  <span className="changelog-version-number">{labels.versionWord} {entry.version}</span>
                  {entry.platform ? <span className="changelog-platform-pill">{entry.platform}</span> : null}
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
}

export function PublicChangelogPage() {

  return (
    <PublicShell>
      <PublicChangelogPageContent />
    </PublicShell>
  );
}

function PublicSecurityPageContent() {
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
}

export function PublicSecurityPage() {

  return (
    <PublicShell>
      <PublicSecurityPageContent />
    </PublicShell>
  );
}

function PublicSubprocessorsPageContent() {
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
}

export function PublicSubprocessorsPage() {

  return (
    <PublicShell>
      <PublicSubprocessorsPageContent />
    </PublicShell>
  );
}

function PublicDataProcessingAgreementPageContent() {
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
}

export function PublicDataProcessingAgreementPage() {

  return (
    <PublicShell>
      <PublicDataProcessingAgreementPageContent />
    </PublicShell>
  );
}

function PublicAcceptableUsePageContent() {
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
}

export function PublicAcceptableUsePage() {

  return (
    <PublicShell>
      <PublicAcceptableUsePageContent />
    </PublicShell>
  );
}

function PublicContactPageContent() {
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
}

export function PublicContactPage() {

  return (
    <PublicShell>
      <PublicContactPageContent />
    </PublicShell>
  );
}
