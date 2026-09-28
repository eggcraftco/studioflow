"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/PublicMarketing";
import { usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import type { PublicSiteTranslationKey } from "@/lib/publicSite/translations";
import styles from "./integrations.module.css";

const categories = ["All integrations", "Commerce", "Accounting & banking", "Payments", "Communication", "AI"] as const;
type Category = typeof categories[number];

/**
 * The three availability states a card can carry. They were measured on
 * 28 September 2026 against production — the Cloud Run services that exist,
 * the per-workspace switches under `appConfig/*`, and the connection records —
 * never against a branch. A function that exists only on a candidate branch
 * is not "live" here.
 *
 *   "live"        deployed in production mode; no per-workspace switch and no
 *                 provider approval stands between a customer and the
 *                 connection (a plan limit is allowed, and the card says so);
 *                 and at least one real connection has been accepted by the
 *                 real provider.
 *   "limited"     deployed, but offered on request: a per-workspace switch is
 *                 closed to everyone but named workspaces, a provider approval
 *                 or registration is still pending, or the first customer step
 *                 has not completed. `note` is the sentence that says which,
 *                 and it is shown on the card face, not behind a toggle.
 *   "comingSoon"  not available to customers: not deployed, or deployed only
 *                 against the provider's test environment.
 *
 * Today: 5 live (WooCommerce, Square, PayPal, TrueLayer, ChatGPT), 7 limited
 * (Shopify, Etsy, Xero, QuickBooks, Twilio, WhatsApp, Amazon), 1 coming soon
 * (eBay). The evidence per row is in
 * docs/deploys/site-integrations-2026-09-28/README.md. When a state changes,
 * change it here and in that record on the same day.
 */
type AvailabilityState = "live" | "limited" | "comingSoon";

type Integration = {
  name: string;
  logo: string;
  website: string;
  category: Category;
  summary: string;
  detail: string;
  state: AvailabilityState;
  /** The honest sentence for a limited or coming-soon card, translated. */
  note?: PublicSiteTranslationKey;
};

const STATE_LABEL: Record<AvailabilityState, PublicSiteTranslationKey> = {
  live: "integrations.state.live",
  limited: "integrations.state.limited",
  comingSoon: "integrations.state.comingSoon",
};

const integrations: Integration[] = [
  { name: "Shopify", logo: "/integration-logos/shopify.svg", website: "https://www.shopify.com/", category: "Commerce", summary: "Bring your online shop orders into your workshop.", detail: "An official NivaDesk app for Shopify is built, and its App Store listing is with Shopify for review. Until Shopify approves it, a store cannot install it, so talk to us about your shop and we will tell you exactly where that stands.", state: "limited", note: "integrations.note.shopify" },
  { name: "Etsy", logo: "/integration-logos/etsy.svg", website: "https://www.etsy.com/", category: "Commerce", summary: "From handmade marketplace orders to work ready to organise.", detail: "The Etsy connection is live: orders, updates and shipping events arrive from Etsy as they happen, and you preview before anything is imported. Our Etsy app holds personal access today; the commercial access that other sellers' shops need is being arranged with Etsy, so shops are connected on request until then. Nothing is written back to your shop.", state: "limited", note: "integrations.note.etsy" },
  { name: "WooCommerce", logo: "/integration-logos/woocommerce.svg", website: "https://woocommerce.com/", category: "Commerce", summary: "Connect your WordPress shop with the work behind each order.", detail: "Approve NivaDesk at your store once; orders, customers and status changes then sync on their own, with a preview before any import. Product publishing and stock updates are separate capabilities and are not part of this connection.", state: "live" },
  { name: "Xero", logo: "/integration-logos/xero.svg", website: "https://www.xero.com/", category: "Accounting & banking", summary: "Give your accounting workflow a connection to your daily work.", detail: "A read-only Xero connection: NivaDesk reads your organisation, chart of accounts, VAT rates, contacts and items, and never writes anything back. So far it has run against Xero's demo company only, so the first customer organisations are connected with us, on request. Xero also limits an app like ours to a small number of organisations.", state: "limited", note: "integrations.note.xero" },
  { name: "QuickBooks", logo: "/integration-logos/quickbooks.png", website: "https://quickbooks.intuit.com/", category: "Accounting & banking", summary: "Keep your workshop and accounting workflow connected.", detail: "A read-only QuickBooks connection is built: NivaDesk reads your chart of accounts, VAT codes, customers and items, and never posts anything back. Today it runs with Intuit's development keys, which only sandbox companies can use, so a real QuickBooks company cannot connect until production access is arranged.", state: "limited", note: "integrations.note.quickbooks" },
  { name: "Square", logo: "/integration-logos/square.svg", website: "https://squareup.com/", category: "Payments", summary: "See Square orders and payouts in the context of your business.", detail: "Square orders, payments, refunds and payouts arrive in NivaDesk as they happen, with a reconciliation sweep behind the webhooks. Payout-to-bank matching is built but has not yet run on a real payout, so treat that part as new. This is not an in-app payment terminal.", state: "live" },
  { name: "PayPal", logo: "/integration-logos/paypal.png", website: "https://www.paypal.com/", category: "Payments", summary: "Make sense of payout activity alongside your bank records.", detail: "A PayPal money feed on the Pro and Team plans. You create a PayPal app of your own and switch on Transaction Search, so it is a guided setup rather than one click. A payout stays separate from the sale, so it is never counted as new revenue; payout-to-bank matching has not processed a real payout yet.", state: "live" },
  { name: "TrueLayer", logo: "/integration-logos/truelayer.svg", website: "https://truelayer.com/", category: "Accounting & banking", summary: "Bring supported bank transactions into your financial overview.", detail: "Read-only Open Banking through TrueLayer, on the Pro and Team plans: transactions from your business bank arrive alongside your orders, ready to categorise and match. Bank and regional coverage depend on the provider, and your consent is renewed about every 90 days.", state: "live" },
  { name: "Twilio", logo: "/integration-logos/twilio.png", website: "https://www.twilio.com/", category: "Communication", summary: "Keep customers informed as their work moves forward.", detail: "Customer SMS notifications on the Pro and Team plans: your workspace settings decide which order updates go out. Messages are sent through Twilio from the NivaDesk sender name, and that sender name is still being registered with the carrier, so no live messages have gone out yet. Messaging charges apply.", state: "limited", note: "integrations.note.twilio" },
  { name: "ChatGPT", logo: "/integration-logos/chatgpt.svg", website: "https://chatgpt.com/", category: "AI", summary: "A conversational way to work with your NivaDesk information.", detail: "The NivaDesk app is published in the ChatGPT app directory: connect your workspace once and read orders, notes and finances, or make supported updates, from a conversation. A newer version has been approved and is waiting to be published.", state: "live" },
  { name: "WhatsApp", logo: "/integration-logos/whatsapp.svg", website: "https://www.whatsapp.com/", category: "Communication", summary: "Customer conversations connected to the work they belong to.", detail: "A customer inbox for WhatsApp on the Team plan: messages from your customers arrive in NivaDesk, your team replies, and each conversation can be linked to the order it belongs to. It runs for one business today on its own WhatsApp Business number; connecting other businesses waits on Meta's approval. No automated messaging and no outbound campaigns.", state: "limited", note: "integrations.note.whatsapp" },
  { name: "eBay", logo: "/integration-logos/ebay.svg", website: "https://www.ebay.com/", category: "Commerce", summary: "A future connection for marketplace orders and workshop work.", detail: "The connection is built and runs against eBay's test environment only; eBay's sandbox cannot currently create test orders, so acceptance is waiting on eBay. Listing publication and marketplace stock updates are not part of it.", state: "comingSoon", note: "integrations.note.ebay" },
  { name: "Amazon", logo: "/integration-logos/amazon.png", website: "https://www.amazon.com/", category: "Commerce", summary: "Marketplace order visibility, with a careful approach to customer data.", detail: "The Amazon connection is complete on our side, with customer data kept in a separate, hardened environment. Amazon approved our developer profile on 17 September 2026; the app itself is still in Amazon's review, so a seller cannot authorise it yet. General connection and listing management are not offered.", state: "limited", note: "integrations.note.amazon" },
];

const logoVariants: Record<string, string> = {
  WooCommerce: styles.wooBrand,
  PayPal: styles.paypalBrand,
  ChatGPT: styles.chatgptBrand,
  WhatsApp: styles.whatsAppBrand,
  Amazon: styles.amazonBrand,
};

function IntegrationsDirectoryContent() {
  // The marketing copy of this page is English by design (lang="en" below).
  // The availability labels, the legend, the card actions and the honest
  // sentence on a limited card are the parts a visitor must be able to read in
  // their own language, so those come from the public-site translation table.
  const { t, locale } = usePublicSiteLanguage();
  const [category, setCategory] = useState<Category>("All integrations");
  const [query, setQuery] = useState("");
  const filtered = integrations.filter(item => (category === "All integrations" || item.category === category) && `${item.name} ${item.summary} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const stateClass: Record<AvailabilityState, string> = { live: styles.live, limited: styles.limited, comingSoon: styles.soon };
  return <div className={styles.page} lang="en" dir="ltr">
    <section className={styles.hero}>
      <div className={styles.heroCopy}><p className={styles.eyebrow}>NIVADESK INTEGRATIONS</p><h1>Your tools.<br />One connected<br /><em>working day.</em></h1><p className={styles.intro}>Your shop, your accounts, your customer conversations. Bring the tools around your workshop closer to the work at its heart.</p><a className={styles.primary} href="#directory">Explore integrations <span aria-hidden="true">↗</span></a><p className={styles.micro}>Built around the way small businesses work.</p></div>
      <div className={styles.visual} aria-label="NivaDesk connects the tools around your business">
        <span className={styles.visualLabel}>CONNECTED WORKFLOW</span>
        <div className={styles.network}>
          <div className={styles.orbitLine} aria-hidden="true" /><div className={styles.orbitLineInner} aria-hidden="true" />
          <span className={`${styles.pathDot} ${styles.dotOne}`} aria-hidden="true" /><span className={`${styles.pathDot} ${styles.dotTwo}`} aria-hidden="true" /><span className={`${styles.pathDot} ${styles.dotThree}`} aria-hidden="true" />
          <div className={`${styles.serviceNode} ${styles.nodeShopify}`}><img src="/integration-logos/shopify.svg" alt="Shopify" width={58} height={32} /></div>
          <div className={`${styles.serviceNode} ${styles.nodeEtsy}`}><img src="/integration-logos/etsy.svg" alt="Etsy" width={54} height={32} /></div>
          <div className={`${styles.serviceNode} ${styles.nodeAmazon}`}><img src="/integration-logos/amazon.png" alt="Amazon" width={64} height={32} /></div>
          <div className={`${styles.serviceNode} ${styles.nodeQuickBooks}`}><img src="/integration-logos/quickbooks.png" alt="QuickBooks" width={42} height={42} /></div>
          <div className={`${styles.serviceNode} ${styles.nodePayPal}`}><img src="/integration-logos/paypal.png" alt="PayPal" width={44} height={42} /></div>
          <div className={`${styles.serviceNode} ${styles.nodeChatGpt}`}><img src="/integration-logos/chatgpt.svg" alt="ChatGPT" width={46} height={46} /></div>
          <div className={styles.hub}><img src="/brand/nivadesk-logo-dark.png" alt="NivaDesk" width={178} height={45} /><span>Your business, connected.</span></div>
          <div className={`${styles.ghostNode} ${styles.ghostTopCenter}`} aria-hidden="true"><img src="/integration-logos/whatsapp.svg" alt="" /></div><div className={`${styles.ghostNode} ${styles.ghostTop}`} aria-hidden="true"><img src="/integration-logos/xero.svg" alt="" /></div><div className={`${styles.ghostNode} ${styles.ghostUpperRight}`} aria-hidden="true">•••</div><div className={`${styles.ghostNode} ${styles.ghostRight}`} aria-hidden="true"><img src="/integration-logos/square.svg" alt="" /></div><div className={`${styles.ghostNode} ${styles.ghostLowerLeft}`} aria-hidden="true"><img src="/integration-logos/twilio.png" alt="" /></div><div className={`${styles.ghostNode} ${styles.ghostBottom}`} aria-hidden="true">•••</div>
        </div>
        <div className={styles.visualNote}><span aria-hidden="true">↳</span> The tools around your work, in one place.</div>
      </div>
    </section>
    <section className={styles.benefits} aria-label="Connected working"><div><span>01</span><strong>Start with your tools</strong><p>Find a connection that fits your business.</p></div><div><span>02</span><strong>Keep the work together</strong><p>Orders and day-to-day work share a home.</p></div><div><span>03</span><strong>Know what is supported</strong><p>Clear scope, without the guesswork.</p></div></section>
    <section id="directory" className={styles.directory}><div className={styles.directoryHeader}><div><p className={styles.eyebrow}>FIND YOUR CONNECTION</p><h2>A place for the tools<br />you already know.</h2></div><p>Every card carries one of three labels, measured against what is actually running today. Availability can also depend on your plan, your provider account and your region.</p></div>
      <div className={styles.legend} lang={locale} dir="auto" aria-label={t("integrations.legend.title")}>
        <p className={styles.legendTitle}>{t("integrations.legend.title")}</p>
        <ul>
          <li><span className={`${styles.status} ${styles.live}`}>{t("integrations.state.live")}</span><span>{t("integrations.legend.live")}</span></li>
          <li><span className={`${styles.status} ${styles.limited}`}>{t("integrations.state.limited")}</span><span>{t("integrations.legend.limited")}</span></li>
          <li><span className={`${styles.status} ${styles.soon}`}>{t("integrations.state.comingSoon")}</span><span>{t("integrations.legend.comingSoon")}</span></li>
        </ul>
        <p className={styles.legendChecked}>{t("integrations.legend.checked")}</p>
      </div>
      <div className={styles.layout}><aside className={styles.filters}><label htmlFor="integration-search">Find an integration</label><div className={styles.search}><span aria-hidden="true">⌕</span><input id="integration-search" type="search" placeholder="Search tools…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className={styles.categoryList} role="group" aria-label="Integration category">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}<span>{c === "All integrations" ? integrations.length : integrations.filter(i => i.category === c).length}</span></button>)}</div><p className={styles.filterNote}>Looking for something else?<br /><Link href="/contact">Tell us what you use ↗</Link></p></aside>
      <div><p className={styles.results} role="status">{filtered.length} {filtered.length === 1 ? "integration" : "integrations"}{query && ` matching “${query}”`}</p><div className={styles.grid}>{filtered.map(item => <article key={item.name} className={styles.card}><div className={styles.cardTop}><a className={`${styles.brand} ${logoVariants[item.name] ?? ""}`} href={item.website} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} official website`}><img src={item.logo} alt={`${item.name} logo`} width={112} height={48} loading="lazy" /></a><span className={styles.category}>{item.category}</span></div><h3>{item.name}</h3><p className={styles.summary}>{item.summary}</p><span className={`${styles.status} ${stateClass[item.state]}`} lang={locale} dir="auto">{t(STATE_LABEL[item.state])}</span>{item.note && <p className={styles.note} lang={locale} dir="auto">{t(item.note)}</p>}<details className={styles.detail}><summary>What to expect <span aria-hidden="true">+</span></summary><p>{item.detail}</p>{item.name === "ChatGPT"
        ? <Link href="/chatgpt" lang={locale} dir="auto">{t("integrations.action.chatgpt")} ↗</Link>
        : item.state === "live"
          ? <Link href="/login" lang={locale} dir="auto">{t("integrations.action.connect")} ↗</Link>
          : <Link href="/contact" lang={locale} dir="auto">{t(item.state === "limited" ? "integrations.action.request" : "integrations.action.ask")} ↗</Link>}</details></article>)}</div>{!filtered.length && <div className={styles.empty}><h3>No matching integrations</h3><p>Try another name or explore all categories.</p><button onClick={() => {setQuery("");setCategory("All integrations");}}>Clear filters</button></div>}</div></div>
      <p className={styles.micro}>The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
    </section>
    <section className={styles.faq}><div><p className={styles.eyebrow}>A FEW USEFUL DETAILS</p><h2>Before you connect.</h2></div><div>{[
      ["Does connecting a shop also publish my products?", "No. Bringing orders into NivaDesk is separate from publishing listings, changing prices or sending stock quantities back to a marketplace. Check the supported scope of each connection."],
      ["Can I connect every integration shown here today?", "Not all of them, and each card says so. Live means you can connect it yourself today from Settings → Integrations. Limited access means it is built and running but offered on request while a provider step or a first customer step completes. Coming soon means it is not available to customers yet."],
      ["Will an integration replace my existing workflow?", "The aim is to bring relevant information into your existing NivaDesk work. Your orders, workshop activity and financial records keep their distinct roles."],
      ["What if my tool is not listed?", "Tell us which tool you use and what you would like to bring into NivaDesk. This helps us understand the connections that matter to your business."]
    ].map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={styles.cta}><p className={styles.eyebrow}>MAKE ROOM FOR THE WORK</p><h2>Less switching.<br />More making.</h2><p>Let’s find the right connections for your business.</p><Link className={styles.primary} href="/contact">Talk to us <span aria-hidden="true">↗</span></Link></section>
  </div>;
}

export default function IntegrationsDirectory() {
  // PublicShell owns the language provider; the content reads it.
  return <PublicShell><IntegrationsDirectoryContent /></PublicShell>;
}
