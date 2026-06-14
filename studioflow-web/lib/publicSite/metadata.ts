import type { Metadata } from "next";

type PublicMetadataKey =
  | "home"
  | "features"
  | "pricing"
  | "signup"
  | "faq"
  | "privacy"
  | "terms"
  | "cookies"
  | "accountDeletion"
  | "refundCancellation"
  | "security"
  | "subprocessors"
  | "dataProcessingAgreement"
  | "acceptableUse"
  | "changelog"
  | "contact"
  | "login";

const siteName = "NivaDesk";
const brandImage = "/brand/nivadesk-logo.png";

const publicMetadata: Record<PublicMetadataKey, { title: string; description: string; path: string }> = {
  home: {
    title: "NivaDesk | Premium Studio Management",
    description:
      "A calm, premium workspace for artists, custom studios and order-based creative businesses across web, Apple devices and Android phone and tablet support.",
    path: "/"
  },
  features: {
    title: "NivaDesk Features | Orders, Files, Teams and Exports",
    description:
      "Explore NivaDesk features for order tracking, Client Files, timeline and delivery planning, To Do, Team Access, dashboards, export and cross-platform studio workflows.",
    path: "/features"
  },
  pricing: {
    title: "NivaDesk Pricing | Free, Lite, Pro and Team Plans",
    description:
      "Preview NivaDesk pricing for Free/Demo, NivaDesk Lite, NivaDesk Pro, NivaDesk Team and future storage add-ons. Live billing is not enabled yet.",
    path: "/pricing"
  },
  signup: {
    title: "Get Started with NivaDesk",
    description:
      "Start with the NivaDesk Free/Demo path, sign in to the web portal, or review pricing before paid billing is enabled.",
    path: "/signup"
  },
  faq: {
    title: "NivaDesk FAQ",
    description:
      "Answers about NivaDesk plans, platform priorities, Free/Demo fallback behavior, export access and safe billing placeholders.",
    path: "/faq"
  },
  privacy: {
    title: "NivaDesk Privacy Policy",
    description:
      "How NivaDesk handles account, workspace, billing, uploaded files, support, technical data, data rights, retention and third-party providers.",
    path: "/privacy"
  },
  terms: {
    title: "NivaDesk Terms of Service",
    description:
      "Terms governing access to and use of NivaDesk, including accounts, workspaces, subscriptions, uploaded content, acceptable use, support and platform billing.",
    path: "/terms"
  },
  cookies: {
    title: "NivaDesk Cookie Policy",
    description:
      "How NivaDesk uses cookies and similar technologies for login sessions, preferences, security, analytics, app storage, third-party providers and cookie choices.",
    path: "/cookies"
  },
  accountDeletion: {
    title: "NivaDesk Account Deletion Policy",
    description:
      "How NivaDesk users can request account deletion, verify identity, export data, understand workspace exceptions, retained records, timing and subscription cancellation responsibilities.",
    path: "/account-deletion"
  },
  refundCancellation: {
    title: "NivaDesk Refund and Cancellation Policy",
    description:
      "How NivaDesk cancellations, renewals, downgrades, refunds, trials, lifetime plans, storage add-ons, payment disputes and subscription access work.",
    path: "/refund-cancellation"
  },
  security: {
    title: "NivaDesk Security Overview",
    description:
      "A practical overview of how NivaDesk protects accounts, workspaces, files, business data, payments, backups, offline data, roles and security incidents.",
    path: "/security"
  },
  subprocessors: {
    title: "NivaDesk Subprocessors",
    description:
      "Third-party service providers NivaDesk may use to host, operate, secure, support and improve the service, including infrastructure, payments, analytics, diagnostics and support providers.",
    path: "/subprocessors"
  },
  dataProcessingAgreement: {
    title: "NivaDesk Data Processing Agreement",
    description:
      "The NivaDesk Data Processing Agreement for customer personal data, processor obligations, subprocessors, transfers, security measures, deletion, audits and compliance assistance.",
    path: "/data-processing-agreement"
  },
  acceptableUse: {
    title: "NivaDesk Acceptable Use Policy",
    description:
      "The NivaDesk Acceptable Use Policy covering lawful use, prohibited content, file uploads, third-party data, security, communications, integrations, fair usage and abuse reporting.",
    path: "/acceptable-use"
  },
  changelog: {
    title: "What's New in NivaDesk | Release Notes",
    description:
      "The NivaDesk changelog: every release with new features, improvements and fixes, newest first, across Mac, iPhone, iPad, Android and web.",
    path: "/changelog"
  },
  contact: {
    title: "NivaDesk Support and Contact",
    description:
      "How to contact NivaDesk for in-app support tickets, account help, billing questions, privacy requests, security reports, response times and company contact details.",
    path: "/contact"
  },
  login: {
    title: "NivaDesk Login",
    description: "Sign in to the NivaDesk web portal with the same account used by the NivaDesk app.",
    path: "/login"
  }
};

export function publicPageMetadata(key: PublicMetadataKey): Metadata {
  const page = publicMetadata[key];

  return {
    title: page.title,
    description: page.description,
    metadataBase: new URL("https://nivadesk.app"),
    applicationName: "NivaDesk",
    alternates: {
      canonical: page.path
    },
    openGraph: {
      title: page.title,
      description: page.description,
      siteName,
      type: "website",
      locale: "en_GB",
      images: [
        {
          url: brandImage,
          width: 3021,
          height: 752,
          alt: "NivaDesk"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [brandImage]
    },
    robots: {
      index: true,
      follow: true
    }
  };
}
