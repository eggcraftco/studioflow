import type { Metadata } from "next";

type PublicMetadataKey =
  | "home"
  | "features"
  | "pricing"
  | "signup"
  | "faq"
  | "privacy"
  | "terms"
  | "contact"
  | "login";

const siteName = "StudioFlow by EGGcraft";

const publicMetadata: Record<PublicMetadataKey, { title: string; description: string; path: string }> = {
  home: {
    title: "StudioFlow by EGGcraft | Premium Studio Management",
    description:
      "A calm, premium workspace for artists, custom studios and order-based creative businesses across web, Apple devices and planned Android phone and tablet support.",
    path: "/"
  },
  features: {
    title: "StudioFlow Features | Orders, Files, Teams and Exports",
    description:
      "Explore StudioFlow features for order tracking, Client Files, timeline and delivery planning, To Do, Team Access, dashboards, export and cross-platform studio workflows.",
    path: "/features"
  },
  pricing: {
    title: "StudioFlow Pricing | Free, Lite, Pro and Team Plans",
    description:
      "Preview StudioFlow pricing for Free/Demo, StudioFlow Lite, StudioFlow Pro, StudioFlow Team and future storage add-ons. Live billing is not enabled yet.",
    path: "/pricing"
  },
  signup: {
    title: "Get Started with StudioFlow",
    description:
      "Start with the StudioFlow Free/Demo path, sign in to the web portal, or review pricing before paid billing is enabled.",
    path: "/signup"
  },
  faq: {
    title: "StudioFlow FAQ",
    description:
      "Answers about StudioFlow plans, platform priorities, Free/Demo fallback behavior, export access and safe billing placeholders.",
    path: "/faq"
  },
  privacy: {
    title: "StudioFlow Privacy Policy Draft",
    description:
      "Public draft structure for StudioFlow privacy topics including workspace data, Client Files, service providers, exports and data rights.",
    path: "/privacy"
  },
  terms: {
    title: "StudioFlow Terms of Service Draft",
    description:
      "Public draft structure for StudioFlow terms covering workspace ownership, plans, billing, acceptable use and data continuity.",
    path: "/terms"
  },
  contact: {
    title: "Contact StudioFlow",
    description:
      "Contact paths for StudioFlow support, billing questions and new studio onboarding before the public launch flow is finalized.",
    path: "/contact"
  },
  login: {
    title: "StudioFlow Login",
    description: "Sign in to the StudioFlow web portal with the same account used by the StudioFlow app.",
    path: "/login"
  }
};

export function publicPageMetadata(key: PublicMetadataKey): Metadata {
  const page = publicMetadata[key];

  return {
    title: page.title,
    description: page.description,
    applicationName: "StudioFlow",
    alternates: {
      canonical: page.path
    },
    openGraph: {
      title: page.title,
      description: page.description,
      siteName,
      type: "website",
      locale: "en_GB"
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description
    },
    robots: {
      index: true,
      follow: true
    }
  };
}
