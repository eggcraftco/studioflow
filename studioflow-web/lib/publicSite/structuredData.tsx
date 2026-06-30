// JSON-LD structured data for the public marketing pages. Rendered from the
// server page shells so Google and AI crawlers see it without running JS.

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
    "Premium studio and order management workspace for artists, custom studios and order-based creative businesses. Orders, customers, client files, delivery timelines, to-do lists, team roles, finance summaries and live shipment tracking in one place.",
  url: BASE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, macOS, iOS, Android",
  publisher: { "@id": `${BASE_URL}/#organization` },
  offers: [
    { "@type": "Offer", name: "Free Demo", price: "0", priceCurrency: "GBP" },
    { "@type": "Offer", name: "NivaDesk Lite", price: "9", priceCurrency: "GBP", description: "£9/month or £90/year" },
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
    "CSV and JSON exports on every plan"
  ]
};

const FAQ_ENTRIES: { question: string; answer: string }[] = [
  {
    question: "Can I connect my online store, like WooCommerce, Shopify, Wix, Squarespace or Etsy?",
    answer:
      "Yes. WooCommerce and Shopify connect natively, and almost any other platform, including Wix, Squarespace, Etsy, BigCommerce or a custom website, can connect through NivaDesk's generic order webhook or a no-code tool like Zapier or Make. New online orders flow straight into NivaDesk Orders and Schedule, with the customer, items and totals mapped to your order workflow."
  },
  {
    question: "Is there a free version of NivaDesk?",
    answer:
      "Yes. Free Demo lets you try NivaDesk with a small sample workspace of up to 5 orders and 3 customers, at no cost and with no card required. Upgrade whenever you're ready."
  },
  {
    question: "Which NivaDesk plans are available?",
    answer:
      "Free Demo (free), Lite (£9/month or £90/year), Pro (£19/month or £190/year) and Team (£49/month or £490/year). Each step adds more capability, from unlimited orders to Client Files, advanced finance and team collaboration."
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
    question: "What are the Free Demo limits?",
    answer:
      "Free Demo includes up to 5 orders and 3 customers, basic finance summaries, personal notes and the ChatGPT App. Client Files, advanced finance and team messaging require a paid plan."
  },
  {
    question: "How do I cancel, and does NivaDesk offer refunds?",
    answer:
      "You can cancel any time from your account; your workspace keeps its paid features until the end of the period you've already paid for, then returns to Free Demo. Refunds follow the Refund & Cancellation policy."
  },
  {
    question: "How many users are included?",
    answer:
      "Free Demo, Lite and Pro are single-user workspaces. Team includes 5 seats so you can collaborate with your studio, and the owner can add more seats (£5/month each) up to 10 users in total."
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

export function HomeStructuredData() {
  return <JsonLd data={[organization, webSite, softwareApplication]} />;
}

export function PricingStructuredData() {
  return <JsonLd data={[organization, softwareApplication]} />;
}

export function FaqStructuredData() {
  return <JsonLd data={[organization, faqPage]} />;
}
