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
  | "guide"
  | "contact"
  | "login";

const siteName = "NivaDesk";
const brandImage = "/brand/nivadesk-logo.png";

const publicMetadata: Record<PublicMetadataKey, { title: string; description: string; path: string }> = {
  home: {
    title: "NivaDesk | Studio, Order & Client Management Software",
    description:
      "NivaDesk is studio management software for creative studios and makers. Track orders, clients, schedules, invoices and files in one place, on web, Mac, iPhone and Android.",
    path: "/"
  },
  features: {
    title: "NivaDesk Features | Orders, Clients, Scheduling & Files",
    description:
      "See how NivaDesk manages orders, customers, schedules, invoices, client files, to do lists, team roles and dashboards in one studio workspace, on web, Mac, iPhone and Android.",
    path: "/features"
  },
  pricing: {
    title: "NivaDesk Pricing | Free, Lite, Pro & Team Plans",
    description:
      "Compare NivaDesk plans: start free, then Lite, Pro or Team as your studio grows. See order limits, client file storage, finance tools and team seats to find the right fit.",
    path: "/pricing"
  },
  signup: {
    title: "Start Free with NivaDesk | Studio & Order Management",
    description:
      "Get started with NivaDesk free. Create your studio workspace and start tracking orders, clients, schedules and invoices in minutes, on web, Mac, iPhone and Android.",
    path: "/signup"
  },
  faq: {
    title: "NivaDesk FAQ | Plans, Features & Getting Started",
    description:
      "Common questions about NivaDesk: plans and pricing, supported platforms, online store integrations, the Free Demo, exporting your data and getting started.",
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
  guide: {
    title: "How to Use NivaDesk | User Guide",
    description:
      "A short tour of every NivaDesk menu: orders, client files, tasks, schedule, team access and settings. Learn what each does and how to use it on Mac, iPhone, iPad, Android and web.",
    path: "/guide"
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
