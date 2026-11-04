// JSON-LD structured data for the public marketing pages. Rendered from the
// server page shells so Google and AI crawlers see it without running JS.
import type { StudioLanguage } from "@/lib/studioflow/language";
import {
  absolutePublicUrl,
  LOCALIZED_PUBLIC_PAGE_PATHS,
  localizedPublicPath,
  publicLocaleByLanguage,
  type LocalizedPublicPage
} from "@/lib/publicSite/locales";
import { PUBLIC_SEO_COPY } from "@/lib/publicSite/seoCopy";
import { PUBLIC_SITE_EN, PUBLIC_SITE_TRANSLATIONS, type PublicSiteTranslationKey } from "@/lib/publicSite/translations";

const BASE_URL = "https://nivadesk.app";

const organization = {
  "@type": "Organization",
  "@id": `${BASE_URL}/#organization`,
  name: "NivaDesk",
  legalName: "EGGCRAFT LIMITED",
  url: BASE_URL,
  logo: `${BASE_URL}/brand/nivadesk-logo.png`,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: `${BASE_URL}/contact`
  }
};

const webSite = {
  "@type": "WebSite",
  "@id": `${BASE_URL}/#website`,
  url: BASE_URL,
  name: "NivaDesk",
  publisher: { "@id": `${BASE_URL}/#organization` }
};

const softwareApplication = {
  "@type": "SoftwareApplication",
  "@id": `${BASE_URL}/#software`,
  name: "NivaDesk",
  description:
    "Organised workspace for custom-order, repair and service businesses. Orders, repairs, customers, client files, schedules, inventory, estimates with e-signature, bank preparation, branded customer links and live shipment tracking connected in one place — with a secure ChatGPT app on every plan.",
  url: BASE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, macOS, iOS, Android",
  publisher: { "@id": `${BASE_URL}/#organization` },
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "GBP" },
    { "@type": "Offer", name: "NivaDesk Starter", price: "9", priceCurrency: "GBP", description: "£9/month or £90/year" },
    { "@type": "Offer", name: "NivaDesk Pro", price: "19", priceCurrency: "GBP", description: "£19/month or £190/year, includes Client Files with 10 GB storage" },
    { "@type": "Offer", name: "NivaDesk Team", price: "49", priceCurrency: "GBP", description: "£49/month or £490/year, 5 seats included" }
  ],
  featureList: [
    "Order tracking for custom and commission work",
    "Customer records and communication context",
    "Client Files with previews and cloud storage",
    "Delivery timeline and schedule planning",
    "Live shipment tracking with carrier auto-detection and delivery push notifications",
    "To-do lists and task assignment",
    "Team roles, permissions and messaging",
    "Finance dashboard with paid, remaining and cost summaries",
    "ChatGPT App integration via secure OAuth",
    "WooCommerce order import",
    "Shopify order sync",
    "Connect any online store via webhook or Zapier (Wix, Squarespace, Etsy, BigCommerce)",
    "CSV and JSON exports on every plan",
    "Branded customer links: free yourstudio.nivadesk.app subdomain on every plan, own custom domain on Pro and Team",
    "Customer portal with token-based order tracking pages, accent colour branding and optional Powered by line",
    "Estimates and approvals with customer e-signature on the phone",
    "Repair intake card that keeps the customer's own item separate from stock",
    "Inventory: unique items and quantity stock, purchases, suppliers, locations, recipes and QR/barcode scanning",
    "Banking preparation via read-only Open Banking: categories, VAT codes, receipt OCR matching and recurring detection",
    "Notes with reminders, tags, home-screen widgets and workspace sharing",
    "Role permission matrix and per-area team access control",
    "Interface in 12 languages"
  ]
};

const FAQ_ENTRIES: { question: string; answer: string }[] = [
  {
    question: "Can customer links use my own domain?",
    answer:
      "Yes. Every plan can claim a free name.nivadesk.app subdomain, and Pro and Team can connect a subdomain of their own website — like track.yourdomain.com — with one CNAME record. Order tracking and estimate links then carry your brand, and older nivadesk.app links keep working."
  },
  {
    question: "Can I connect my online store, like WooCommerce, Shopify, Wix, Squarespace or Etsy?",
    answer:
      "Yes. WooCommerce connects natively, Shopify through the official NivaDesk app on the Shopify App Store, and almost any other platform, including Wix, Squarespace, Etsy, BigCommerce or a custom website, can connect through NivaDesk's generic order webhook or a no-code tool like Zapier or Make. New online orders flow straight into NivaDesk Orders and Schedule, with the customer, items and totals mapped to your order workflow."
  },
  {
    question: "Is there a free version of NivaDesk?",
    answer:
      "Yes. The Free plan keeps up to 10 active orders (delivered and deleted orders don't count) and unlimited customers at no cost and with no card required, for as long as you like. Upgrade whenever you're ready."
  },
  {
    question: "Which NivaDesk plans are available?",
    answer:
      "Free (free), Starter (£9/month or £90/year), Pro (£19/month or £190/year) and Team (£49/month or £490/year). Each step adds more capability, from unlimited orders to Client Files, advanced finance and team collaboration."
  },
  {
    question: "Can I pay monthly or yearly?",
    answer:
      "Both. Choose monthly for flexibility or yearly to save, paying for ten months instead of twelve. You can switch billing period at any time."
  },
  {
    question: "Can I change my plan later?",
    answer:
      "Yes. You can upgrade or downgrade at any time from the plan screen. Upgrades apply immediately; downgrades take effect at the end of your current billing period."
  },
  {
    question: "What are the Free plan limits?",
    answer:
      "Free includes up to 10 active orders (delivered and deleted orders don't count), unlimited customers, basic finance summaries, personal notes and the ChatGPT App. Client Files, advanced finance and team messaging require a paid plan."
  },
  {
    question: "How do I cancel, and does NivaDesk offer refunds?",
    answer:
      "You can cancel any time from your account; your workspace keeps its paid features until the end of the period you've already paid for, then returns to Free. Refunds follow the Refund & Cancellation policy."
  },
  {
    question: "How many users are included?",
    answer:
      "Free, Starter and Pro are single-user workspaces. Team includes 5 seats so you can collaborate with your studio, and the owner can add more seats (£5/month each) up to 10 users in total."
  },
  {
    question: "How much file storage do I get?",
    answer:
      "Client Files storage is included on Pro (10 GB) and Team (50 GB). Pro and Team can also add +100 GB (£9/month) or +200 GB (£15/month) at any time."
  },
  {
    question: "What is the NivaDesk ChatGPT App?",
    answer:
      "It connects your workspace to ChatGPT via secure OAuth so you can ask about orders, due dates and recorded spending in plain language and get answers from your real studio data. It's included on every plan."
  },
  {
    question: "Does NivaDesk track shipments?",
    answer:
      "Yes. Paste a tracking number on any order and the carrier is auto-detected (DHL, UPS, FedEx, Royal Mail and many more). The order updates itself as the parcel moves and a push notification is sent to your phone on delivery."
  }
];

const faqPage = {
  "@type": "FAQPage",
  "@id": `${BASE_URL}/faq#faq`,
  mainEntity: FAQ_ENTRIES.map(entry => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: { "@type": "Answer", text: entry.answer }
  }))
};

function JsonLd({ data }: { data: object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": data }) }}
    />
  );
}

// A language version (/de, /de/faq …) describes the same Organization and software in its own language: the
// software's description from seoCopy.ts, the offers without their English notes and no English feature list,
// a WebPage naming the page's language, and on /xx/faq the questions built from the very keys the page shows.
type ForeignLanguage = Exclude<StudioLanguage, "English">;

function localizedSoftwareApplication(language: ForeignLanguage) {
  const software: Record<string, unknown> = {
    ...softwareApplication,
    description: PUBLIC_SEO_COPY[language].home.description,
    offers: softwareApplication.offers.map(offer => ({
      "@type": offer["@type"],
      name: offer.name,
      price: offer.price,
      priceCurrency: offer.priceCurrency
    }))
  };
  delete software.featureList;
  return software;
}

function localizedWebPage(page: LocalizedPublicPage, language: ForeignLanguage) {
  const url = absolutePublicUrl(localizedPublicPath(LOCALIZED_PUBLIC_PAGE_PATHS[page], language));
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: PUBLIC_SEO_COPY[language][page].title,
    description: PUBLIC_SEO_COPY[language][page].description,
    inLanguage: publicLocaleByLanguage(language).hreflang,
    isPartOf: { "@id": `${BASE_URL}/#website` },
    about: { "@id": `${BASE_URL}/#software` }
  };
}

// Every faq.qN pair in the dictionary is on the FAQ page (scripts/check-multilingual-seo.mts compares the set
// with FAQ_GROUPS in components/PublicMarketing.tsx), so the structured data never says what the page does not.
export const FAQ_STRUCTURED_DATA_NUMBERS = Object.keys(PUBLIC_SITE_EN)
  .map(key => key.match(/^faq\.q(\d+)\.title$/)?.[1])
  .filter((value): value is string => Boolean(value))
  .map(Number)
  .sort((a, b) => a - b);

function localizedFaqPage(language: ForeignLanguage) {
  const table = PUBLIC_SITE_TRANSLATIONS[language];
  const text = (key: PublicSiteTranslationKey) => table[key] || PUBLIC_SITE_EN[key];
  const url = absolutePublicUrl(localizedPublicPath("/faq", language));
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    inLanguage: publicLocaleByLanguage(language).hreflang,
    mainEntity: FAQ_STRUCTURED_DATA_NUMBERS.map(n => ({
      "@type": "Question",
      name: text(`faq.q${n}.title` as PublicSiteTranslationKey),
      acceptedAnswer: { "@type": "Answer", text: text(`faq.q${n}.body` as PublicSiteTranslationKey) }
    }))
  };
}

type StructuredDataProps = { language?: StudioLanguage };

export function HomeStructuredData({ language }: StructuredDataProps = {}) {
  if (language && language !== "English") {
    return <JsonLd data={[organization, webSite, localizedSoftwareApplication(language), localizedWebPage("home", language)]} />;
  }
  return <JsonLd data={[organization, webSite, softwareApplication]} />;
}

export function PricingStructuredData({ language }: StructuredDataProps = {}) {
  if (language && language !== "English") {
    return <JsonLd data={[organization, localizedSoftwareApplication(language), localizedWebPage("pricing", language)]} />;
  }
  return <JsonLd data={[organization, softwareApplication]} />;
}

export function FaqStructuredData({ language }: StructuredDataProps = {}) {
  if (language && language !== "English") {
    return <JsonLd data={[organization, localizedWebPage("faq", language), localizedFaqPage(language)]} />;
  }
  return <JsonLd data={[organization, faqPage]} />;
}

// The other language versions: the page and its language.
export function LocalizedPageStructuredData({ page, language }: { page: LocalizedPublicPage; language: StudioLanguage }) {
  if (language === "English") return null;
  return <JsonLd data={[organization, localizedWebPage(page, language)]} />;
}
